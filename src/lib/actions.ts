import type { Page } from "patchright";
import type { PipelineStep, StepResult, ExecutionContext } from "./types";
import { STEALTH_SCRIPT } from "./browser/stealth";
import { contextStealthScripts } from "./browser/session-manager";
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
import { TIMING, CAPTCHA_GRID, TIMEOUTS } from "./constants";

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
        // patchright blocks addInitScript — evaluate stealth patches post-load instead
        // Use per-session fingerprinted script if available, else fall back to default
        const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
        try { await page.evaluate(stealthScript); } catch (_) {}
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

      case "recaptcha-solve": {
        const solveResult = await clickRecaptchaCheckbox(page);
        if (solveResult.solved) {
          result = { solved: true };
          break;
        }
        const ci = solveResult.challengeInfo;
        if (ci && ci.tiles && ci.tiles.length > 0) {
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
          result = { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles };
        } else {
          result = { solved: false, prompt: "", tiles: [] };
        }
        break;
      }

      case "recaptcha-answer": {
        await clickChallengeTiles(page, step.tiles);
        const verifyResult = await clickChallengeVerify(page);
        if (verifyResult.solved) {
          result = { solved: true };
        } else {
          const ci2 = verifyResult.challengeInfo;
          if (ci2 && ci2.tiles && ci2.tiles.length > 0) {
            const tileSize2 = ci2.bframeBox ? Math.round((ci2.bframeBox.width - CAPTCHA_GRID.GRID_PADDING) / ci2.cols) : CAPTCHA_GRID.DEFAULT_TILE_SIZE;
            const tiles2: { index: number; image: string | null }[] = [];
            for (const tile of ci2.tiles) {
              const clip = {
                x: tile.centerX - tileSize2 / 2,
                y: tile.centerY - tileSize2 / 2,
                width: tileSize2,
                height: tileSize2,
              };
              try {
                const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
                tiles2.push({ index: tile.index, image: tileBuf.toString("base64") });
              } catch {
                tiles2.push({ index: tile.index, image: null });
              }
            }
            result = { solved: false, prompt: ci2.prompt, rows: ci2.rows, cols: ci2.cols, tiles: tiles2 };
          } else {
            result = { solved: false, tiles: [] };
          }
        }
        break;
      }

      case "solve-captcha": {
        // Wait briefly for captcha iframes to load, then auto-detect type
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
        }).catch(() => false);

        console.log(`[solve-captcha] detected: ${isHCaptcha ? 'hCaptcha' : 'reCAPTCHA'}`);

        result = isHCaptcha
          ? await solveHCaptcha(page, monitor)
          : await solveRecaptcha(page, monitor);
        break;
      }

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

      case "find": {
        if (!step.role && !step.name && !step.text && !step.placeholder && !step.label) {
          throw new Error("find requires at least one of: role, name, text, placeholder, label");
        }

        // Build a locator using Playwright's semantic API
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
          // name-only: try getByRole with wildcard
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

          // Build selector
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

        result = {
          ref,
          role: displayRole,
          name: elInfo.text,
          tag: elInfo.tag,
          boundingBox: box,
          matchCount: count,
        };
        break;
      }

      case "login": {
        const credKey = await deriveKey(ctx.token, "credentials");
        const blob = await ctx.store.getCredential(ctx.userId, step.domain);
        if (!blob || blob.length === 0) {
          throw new Error(`No credentials stored for ${step.domain}`);
        }
        const credential = JSON.parse(decrypt(blob, credKey));

        const reactFill = async (selector: string, value: string) => {
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

        if (step.usernameSelector && credential.username) {
          await reactFill(resolveSelector(step.usernameSelector, ctx), credential.username);
        }
        if (step.passwordSelector && credential.password) {
          await reactFill(resolveSelector(step.passwordSelector, ctx), credential.password);
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
        result = { loggedIn: true, url: page.url() };
        break;
      }

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
