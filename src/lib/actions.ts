import type { Page } from "patchright";
import type { PipelineStep, StepResult, ExecutionContext } from "./types";
import { STEALTH_SCRIPT, contextStealthScripts } from "./browser/stealth";
import {
  humanClick,
  humanClickXY,
  humanType,
  clickRecaptchaCheckbox,
  clickChallengeTiles,
  clickChallengeVerify,
  getChallengeInfo,
} from "./browser/humanize";
import { solveRecaptcha } from "./captcha/recaptcha";
import { solveHCaptcha } from "./captcha/hcaptcha";
import { deriveKey, decrypt, generateTOTP } from "./auth/crypto";
import { saveScreenshot } from "./screenshot";
import { takeSnapshot } from "./snapshot";
import { annotatedScreenshot } from "./annotate";
import type { StaleStateMonitor } from "./stale-monitor";
import { createLogger } from "./logger";
import { TIMING, CAPTCHA_GRID, TIMEOUTS } from "./constants";

const log = createLogger("actions");

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Resolve @e refs to CSS selectors */
function resolveSelector(selector: string, ctx: ExecutionContext): string {
  if (selector.startsWith("@e")) {
    const ref = ctx.refMap.get(selector);
    if (!ref) {
      const available = Array.from(ctx.refMap.keys()).join(", ");
      throw new Error(`Unknown ref: ${selector}. ${available ? `Available refs: ${available}` : "No refs available — run a snapshot or annotated screenshot step first."}`);
    }
    return ref.selector;
  }
  return selector;
}

// ─── Complex step handlers ──────────────────────────────────────────

async function handleRecaptchaSolve(page: Page): Promise<unknown> {
  const solveResult = await clickRecaptchaCheckbox(page);
  if (solveResult.solved) return { solved: true };

  const ci = solveResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles(page, ci) };
  }
  return { solved: false, prompt: "", tiles: [] };
}

async function handleRecaptchaAnswer(page: Page, tiles: number[]): Promise<unknown> {
  await clickChallengeTiles(page, tiles);
  const verifyResult = await clickChallengeVerify(page);
  if (verifyResult.solved) return { solved: true };

  const ci = verifyResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles(page, ci) };
  }
  return { solved: false, tiles: [] };
}

async function screenshotTiles(page: Page, ci: NonNullable<Awaited<ReturnType<typeof clickRecaptchaCheckbox>>["challengeInfo"]>) {
  const tileSize = ci.bframeBox ? Math.round((ci.bframeBox.width - CAPTCHA_GRID.GRID_PADDING) / ci.cols) : CAPTCHA_GRID.DEFAULT_TILE_SIZE;
  const tiles: { index: number; image: string | null }[] = [];
  for (const tile of ci.tiles) {
    const clip = {
      x: tile.centerX - tileSize / 2,
      y: tile.centerY - tileSize / 2,
      width: tileSize,
      height: tileSize,
    };
    try {
      const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
      tiles.push({ index: tile.index, image: tileBuf.toString("base64") });
    } catch {
      tiles.push({ index: tile.index, image: null });
    }
  }
  return tiles;
}

async function handleSolveCaptcha(page: Page, monitor?: StaleStateMonitor): Promise<unknown> {
  await page.waitForTimeout(TIMING.CAPTCHA_DETECT_WAIT);

  const isHCaptcha = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    return iframes.some(f => {
      const src = f.src || '';
      const title = (f.title || '').toLowerCase();
      return src.includes('hcaptcha.com') ||
             title.includes('hcaptcha') ||
             !!document.querySelector('[data-hcaptcha-widget-id]');
    });
  }).catch((err) => {
    log.warn(`captcha detection failed: ${err}`);
    return false;
  });

  log.info(`detected: ${isHCaptcha ? 'hCaptcha' : 'reCAPTCHA'}`);

  return isHCaptcha
    ? await solveHCaptcha(page, monitor)
    : await solveRecaptcha(page, monitor);
}

async function handleFind(page: Page, step: Extract<PipelineStep, { type: "find" }>, ctx: ExecutionContext): Promise<unknown> {
  if (!step.role && !step.name && !step.text && !step.placeholder && !step.label) {
    throw new Error("find requires at least one of: role, name, text, placeholder, label");
  }

  let locator;
  if (step.role) {
    const opts: { name?: string | RegExp; exact?: boolean } = {};
    if (step.name) opts.name = step.exact ? step.name : new RegExp(step.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (step.exact !== undefined) opts.exact = step.exact;
    locator = page.getByRole(step.role as Parameters<typeof page.getByRole>[0], opts);
  } else if (step.label) {
    locator = page.getByLabel(step.label, { exact: step.exact });
  } else if (step.placeholder) {
    locator = page.getByPlaceholder(step.placeholder, { exact: step.exact });
  } else if (step.text) {
    locator = page.getByText(step.text, { exact: step.exact });
  } else {
    locator = page.locator(`[aria-label="${step.name}"], [title="${step.name}"]`);
  }

  const count = await locator.count();
  if (count === 0) {
    throw new Error(`No element found matching: ${JSON.stringify({ role: step.role, name: step.name, text: step.text, placeholder: step.placeholder, label: step.label })}`);
  }

  const element = locator.first();
  const box = await element.boundingBox();
  const elInfo = await element.evaluate((el: Element) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent?.trim() || "").slice(0, 60);

    const path: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path.unshift(`#${current.id}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      if (parent && current) {
        const currentTag = current.tagName;
        const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(seg);
      current = parent;
    }

    return { tag, text, selector: path.join(" > ") };
  });

  const ref = `@e${ctx.nextRefId++}`;
  const displayRole = step.role || elInfo.tag;

  ctx.refMap.set(ref, {
    ref,
    role: displayRole,
    name: elInfo.text,
    selector: elInfo.selector,
  });

  return {
    ref,
    role: displayRole,
    name: elInfo.text,
    tag: elInfo.tag,
    boundingBox: box,
    matchCount: count,
  };
}

async function handleLogin(page: Page, step: Extract<PipelineStep, { type: "login" }>, ctx: ExecutionContext): Promise<unknown> {
  const credKey = await deriveKey(ctx.token, "credentials");
  const blob = await ctx.store.getCredential(ctx.userId, step.domain);
  if (!blob || blob.length === 0) {
    throw new Error(`No credentials stored for ${step.domain}`);
  }
  const credential = JSON.parse(decrypt(blob, credKey));

  const beforeUrl = page.url();

  /** Fill an input via native React-compatible setter + input/change events */
  const reactFillSelector = async (selector: string, value: string) => {
    await page.click(selector);
    await page.waitForTimeout(TIMING.SCROLL_DELAY);
    await page.evaluate(([sel, val]) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [selector, value]);
    await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
  };

  const hasExplicitSelectors = !!(step.usernameSelector || step.passwordSelector || step.submitSelector);

  if (hasExplicitSelectors) {
    // ─── Explicit selector path (backwards compatible) ──────────────
    if (step.usernameSelector && credential.username) {
      await reactFillSelector(resolveSelector(step.usernameSelector, ctx), credential.username);
    }
    if (step.passwordSelector && credential.password) {
      await reactFillSelector(resolveSelector(step.passwordSelector, ctx), credential.password);
    }
    if (step.submitSelector) {
      await humanClick(page, resolveSelector(step.submitSelector, ctx));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
    }
    if (step.totpSelector && credential.totp_secret) {
      const totp = generateTOTP(credential.totp_secret);
      await page.click(resolveSelector(step.totpSelector, ctx));
      await page.keyboard.type(totp, { delay: 50 });
      await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
    }
  } else {
    // ─── Auto-detect path ───────────────────────────────────────────
    log.info(`login: auto-detecting form on ${beforeUrl}`);

    // Wait for a visible password field to appear (login forms often render after hydration)
    const passwordHandle = await page.waitForSelector(
      'input[type="password"]:not([disabled]):not([readonly])',
      { state: "visible", timeout: TIMEOUTS.SELECTOR_WAIT }
    ).catch(() => null);

    if (!passwordHandle) {
      throw new Error(`login: no visible password field found on ${beforeUrl}. If the site uses a multi-step form, navigate to the actual password page first, or pass explicit selectors.`);
    }

    // Find the username field — prefer a sibling in the same <form>, then globally
    const usernameHandle = await page.evaluateHandle(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])') as HTMLInputElement | null;
      if (!pwd) return null;
      const scope: ParentNode = pwd.closest('form') || document;
      const candidates = [
        'input[type="email"]:not([disabled]):not([readonly])',
        'input[autocomplete="username"]:not([disabled]):not([readonly])',
        'input[autocomplete="email"]:not([disabled]):not([readonly])',
        'input[name*="email" i]:not([disabled]):not([readonly])',
        'input[name*="user" i]:not([disabled]):not([readonly])',
        'input[name*="login" i]:not([disabled]):not([readonly])',
        'input[id*="email" i]:not([disabled]):not([readonly])',
        'input[id*="user" i]:not([disabled]):not([readonly])',
        'input[type="text"]:not([disabled]):not([readonly])',
        'input:not([type]):not([disabled]):not([readonly])',
      ];
      for (const sel of candidates) {
        const el = scope.querySelector(sel) as HTMLInputElement | null;
        if (el && el.offsetParent !== null) return el;
      }
      return null;
    });
    const usernameEl = usernameHandle.asElement();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fillHandle = async (handle: any, value: string) => {
      await handle.scrollIntoViewIfNeeded().catch(() => {});
      await handle.click({ delay: 40 }).catch(() => {});
      await handle.evaluate((el: Element, val: string) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    };

    if (usernameEl && credential.username) {
      await fillHandle(usernameEl, credential.username);
    } else if (!usernameEl) {
      log.warn("login: no username field detected, proceeding with password only");
    }

    if (credential.password) {
      await fillHandle(passwordHandle, credential.password);
    }

    // Find and click the submit button (same form preferred, text match as fallback)
    const submitHandle = await page.evaluateHandle(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])') as HTMLInputElement | null;
      const form = pwd?.closest('form');
      const loginRe = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;

      const pick = (scope: ParentNode): HTMLElement | null => {
        const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])') as HTMLElement | null;
        if (typed) return typed;
        const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])')) as HTMLElement[];
        return buttons.find((b) => loginRe.test(b.textContent || "") && b.offsetParent !== null) || null;
      };

      if (form) {
        const found = pick(form);
        if (found) return found;
      }
      return pick(document);
    });
    const submitEl = submitHandle.asElement();

    if (submitEl) {
      await submitEl.scrollIntoViewIfNeeded().catch(() => {});
      await submitEl.click({ delay: 40 }).catch(async () => {
        // Fallback: dispatch via JS click
        await submitEl.evaluate((el: Element) => (el as HTMLElement).click());
      });
    } else {
      // Final fallback: press Enter in the password field
      log.warn("login: no submit button detected, pressing Enter in password field");
      await passwordHandle.press("Enter").catch(() => {});
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});

    // Wait for either a URL change, a TOTP field, or the initial timeout
    await Promise.race([
      page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
      page.waitForSelector(
        'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])',
        { state: "visible", timeout: TIMEOUTS.NAVIGATION }
      ).catch(() => null),
    ]);

    // If TOTP is configured and a code field is present, fill it
    if (credential.totp_secret) {
      const totpHandle = await page.$(
        'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])'
      );
      if (totpHandle) {
        const totp = generateTOTP(credential.totp_secret);
        await totpHandle.scrollIntoViewIfNeeded().catch(() => {});
        await totpHandle.click({ delay: 40 }).catch(() => {});
        await page.keyboard.type(totp, { delay: 60 });
        await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
        // Some sites auto-submit on 6-digit completion, others need a click
        const totpSubmit = await page.$('button[type="submit"]:not([disabled])');
        if (totpSubmit) {
          await totpSubmit.click({ delay: 40 }).catch(() => {});
        }
        await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
      }
    }

    await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
  }

  // Honest loggedIn signal: URL must have changed AND no visible password field remains
  const afterUrl = page.url();
  const stillHasPasswordField = await page.evaluate(() => {
    const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])') as HTMLInputElement | null;
    return !!(pwd && pwd.offsetParent !== null);
  }).catch(() => false);

  const loggedIn = afterUrl !== beforeUrl && !stillHasPasswordField;
  return { loggedIn, url: afterUrl, changedUrl: afterUrl !== beforeUrl, passwordFieldRemains: stillHasPasswordField };
}

// ─── Main executor ───��──────────────────────────────────────────────

export async function executeAction(
  page: Page,
  step: PipelineStep,
  ctx: ExecutionContext,
  monitor?: StaleStateMonitor
): Promise<StepResult> {
  const start = Date.now();
  const stepIndex = -1; // caller sets this

  try {
    let result: unknown = null;

    switch (step.type) {
      case "navigate":
        await page.goto(step.url, {
          waitUntil: (step.waitUntil || "domcontentloaded") as "load" | "domcontentloaded" | "networkidle" | "commit",
          timeout: TIMEOUTS.NAVIGATION,
        });
        const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
        try { await page.evaluate(stealthScript); } catch (err) {
          log.warn(`stealth injection failed: ${err}`);
        }
        break;

      case "click":
        await page.click(resolveSelector(step.selector, ctx));
        break;

      case "fill":
        await page.fill(resolveSelector(step.selector, ctx), step.value);
        break;

      case "human-click":
        if (step.selector) {
          await humanClick(page, resolveSelector(step.selector, ctx));
        } else if (step.x !== undefined && step.y !== undefined) {
          await humanClickXY(page, step.x, step.y);
        } else {
          throw new Error("human-click requires selector or x/y coordinates");
        }
        break;

      case "right-click":
        if (step.selector) {
          await page.click(resolveSelector(step.selector, ctx), { button: "right" });
        } else if (step.x !== undefined && step.y !== undefined) {
          await page.mouse.click(step.x, step.y, { button: "right" });
        } else {
          throw new Error("right-click requires selector or x/y coordinates");
        }
        break;

      case "human-type":
        await humanType(page, resolveSelector(step.selector, ctx), step.value);
        break;

      case "evaluate":
        result = await page.evaluate(step.expression);
        break;

      case "extract":
        result = await page.evaluate(step.expression);
        break;

      case "wait":
        await page.waitForTimeout(step.ms);
        break;

      case "wait-for":
        await page.waitForSelector(resolveSelector(step.selector, ctx), { timeout: step.timeout || TIMEOUTS.SELECTOR_WAIT });
        break;

      case "scroll":
        await page.evaluate((dy) => window.scrollBy(0, dy || document.body.scrollHeight), step.deltaY ?? 0);
        break;

      case "keyboard":
        await page.keyboard.press(step.key);
        break;

      case "type-code": {
        const code = String(step.value || "");
        const selector = step.selector ? resolveSelector(step.selector, ctx) : 'input[type="tel"]';
        const firstInput = await page.waitForSelector(selector, { timeout: TIMEOUTS.TOTP_INPUT });
        if (!firstInput) throw new Error(`Input not found: ${selector}`);
        await firstInput.click();
        await page.waitForTimeout(TIMING.POST_FORM_CLICK);
        for (const digit of code) {
          await page.keyboard.press(digit);
          await page.waitForTimeout(TIMING.DIGIT_DELAY_BASE + Math.random() * TIMING.DIGIT_DELAY_RANGE);
        }
        result = { typed: code.length };
        break;
      }

      case "recaptcha-click":
        result = await clickRecaptchaCheckbox(page);
        break;

      case "recaptcha-select":
        result = await clickChallengeTiles(page, step.tiles);
        break;

      case "recaptcha-verify":
        result = await clickChallengeVerify(page);
        break;

      case "recaptcha-info":
        result = await getChallengeInfo(page);
        break;

      case "recaptcha-solve":
        result = await handleRecaptchaSolve(page);
        break;

      case "recaptcha-answer":
        result = await handleRecaptchaAnswer(page, step.tiles);
        break;

      case "solve-captcha":
        result = await handleSolveCaptcha(page, monitor);
        break;

      case "screenshot": {
        if (step.annotate) {
          const annotated = await annotatedScreenshot(page, ctx);
          const refLines = annotated.refs.map(r => `  ${r.ref} ${r.role} "${r.name}"`).join("\n");
          result = { screenshotUrl: annotated.screenshotUrl, refs: refLines };
        } else {
          const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
          const url = saveScreenshot(buf, `step-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
          result = { screenshotUrl: url };
        }
        break;
      }

      case "snapshot": {
        const snap = await takeSnapshot(page, ctx, {
          interactiveOnly: step.interactiveOnly,
          maxElements: step.maxElements,
        });
        result = { elementCount: snap.nodes.length, snapshot: snap.text };
        break;
      }

      case "find":
        result = await handleFind(page, step, ctx);
        break;

      case "login":
        result = await handleLogin(page, step, ctx);
        break;

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step type: ${(_exhaustive as PipelineStep).type}`);
      }
    }

    return {
      stepIndex,
      step,
      ok: true,
      result,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      stepIndex,
      step,
      ok: false,
      error: getErrorMessage(err),
      durationMs: Date.now() - start,
    };
  }
}
