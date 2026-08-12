import type { Page } from "patchright";
import type { PipelineStep, ExecutionContext } from "../../types";
import type { LoginResult } from "../types";
import { humanClick } from "../../browser/humanize";
import { deriveKey, decrypt, generateTOTP } from "../../auth/crypto";
import { domainLookupChain, normalizeDomain } from "../../knowledge";
import { createLogger } from "../../logger";
import { TIMING, TIMEOUTS } from "../../constants";
import { resolveSelector } from "../resolve-selector";

const log = createLogger("actions");

type LoginStep = Extract<PipelineStep, { type: "login" }>;

export async function login(page: Page, step: LoginStep, ctx: ExecutionContext): Promise<LoginResult> {
  const credKey = await deriveKey(ctx.token, "credentials");

  // Look up credentials with a parent-domain fallback chain so "auth.figma.com"
  // finds creds stored under "figma.com", and "www.figma.com" matches "figma.com".
  let blob: Buffer | null = null;
  let matchedDomain = "";
  for (const candidate of domainLookupChain(step.domain)) {
    const b = await ctx.store.getCredential(ctx.userId, candidate);
    if (b && b.length > 0) {
      blob = b;
      matchedDomain = candidate;
      break;
    }
  }

  if (!blob) {
    // Tell the agent what IS stored so it can retry with the right domain.
    const stored = await ctx.store.listCredentialDomains(ctx.userId);
    const storedList = stored.length > 0 ? stored.join(", ") : "(none)";
    throw new Error(
      `No credentials stored for ${normalizeDomain(step.domain)}. Stored domains: ${storedList}. ` +
      `If you stored credentials under a different domain name, retry the login step with that domain. ` +
      `If no credentials are stored at all, call the \`credentials\` tool with action=store first.`
    );
  }

  // Decrypt the stored blob. If the encryption key has changed since the row
  // was written (e.g. ~/.iframer/secret was regenerated, IFRAMER_SECRET env
  // var changed, or the blob was written by an older code version with a
  // different key derivation), the AES-GCM tag will fail to authenticate.
  // Translate that into an actionable error instead of leaking the raw
  // "Unsupported state or unable to authenticate data" cryptic message.
  let credential: { username?: string; password?: string; totp_secret?: string };
  try {
    credential = JSON.parse(decrypt(blob, credKey));
  } catch (decryptErr) {
    const errMsg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
    throw new Error(
      `Credentials for ${matchedDomain} exist in the store but cannot be decrypted ` +
      `(${errMsg}). This usually means the encryption key (~/.iframer/secret or IFRAMER_SECRET) ` +
      `changed since the row was written, orphaning the old blob. ` +
      `Fix: ask the user to re-store the credentials by running in their terminal:\n\n` +
      `  iframer-toolkit credentials add ${normalizeDomain(step.domain)}\n\n` +
      `After they confirm it ran, retry the login step.`
    );
  }
  if (matchedDomain !== normalizeDomain(step.domain)) {
    log.info(`login: credentials for ${step.domain} resolved via parent domain ${matchedDomain}`);
  }

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

    // First: give the page a moment to settle, then check if we're ALREADY logged in.
    // Session persistence (cookies + localStorage) across modes often means the login
    // page redirects away or hides the form. In that case the correct behavior is
    // "success, nothing to do" — NOT "throw because there's no password field".
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(500);

    const initialCheck = await page.evaluate(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])') as HTMLInputElement | null;
      const pwdVisible = !!(pwd && pwd.offsetParent !== null);
      return { url: location.href, title: document.title, pwdVisible };
    }).catch(() => ({ url: page.url(), title: "", pwdVisible: false }));

    const urlLooksLikeLogin = /\b(login|signin|sign-in|auth|oauth)\b/i.test(initialCheck.url);

    if (!initialCheck.pwdVisible && !urlLooksLikeLogin) {
      // Already logged in via persisted session — nothing to do.
      log.info(`login: already logged in (no password field, URL=${initialCheck.url})`);
      return {
        loggedIn: true,
        alreadyLoggedIn: true,
        url: initialCheck.url,
        reason: "Session already authenticated — no login form detected",
      };
    }

    // Wait for a visible password field OR email-only field to appear.
    // Many modern sites (Slack, Microsoft, Google) use a multi-step flow:
    //   Step 1: email only → submit → redirect
    //   Step 2: password/code on a separate page
    // So we check for password first, but if not found, look for an email
    // field to handle the email-first case.
    const passwordHandle = await page.waitForSelector(
      'input[type="password"]:not([disabled]):not([readonly])',
      { state: "visible", timeout: 5000 }
    ).catch(() => null);

    // Email-field candidates (used for both password-present and email-only flows)
    const emailCandidates = [
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

    if (!passwordHandle) {
      // No password field. Three scenarios:
      //   1. Already logged in (URL left the login area) → return success
      //   2. Email-first flow (Slack, Microsoft, Google): email field exists,
      //      no password field. Fill email, click submit, let the next pipeline
      //      step or OTP elicitation handle the code page.
      //   3. Bot-blocked / captcha → throw with diagnostics
      const currentUrl = page.url();
      if (!/\b(login|signin|sign-in|auth|oauth)\b/i.test(currentUrl)) {
        log.info(`login: no password field and URL left login area (${currentUrl}) — treating as success`);
        return {
          loggedIn: true,
          alreadyLoggedIn: true,
          url: currentUrl,
          reason: "No login form detected after wait — assumed already authenticated",
        };
      }

      // Check for an email-only form (multi-step login flow)
      const emailOnlyHandle = await page.evaluateHandle((candidates: string[]) => {
        for (const sel of candidates) {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (el && el.offsetParent !== null) return el;
        }
        return null;
      }, emailCandidates);
      const emailOnlyEl = emailOnlyHandle.asElement();

      if (emailOnlyEl && credential.username) {
        // ─── Email-first flow (e.g. Slack, Microsoft, Google) ───────
        log.info(`login: no password field but found email input — running email-first flow on ${currentUrl}`);

        await fillHandle(emailOnlyEl, credential.username);

        // Find and click the submit button
        const submitHandle = await page.evaluateHandle(() => {
          const loginRe = /\b(log\s*in|sign\s*in|continue|submit|enter|next|send.*code|email.*me)\b/i;
          const pick = (scope: ParentNode): HTMLElement | null => {
            const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])') as HTMLElement | null;
            if (typed) return typed;
            const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])')) as HTMLElement[];
            return buttons.find((b) => loginRe.test(b.textContent || "") && b.offsetParent !== null) || null;
          };
          const form = document.querySelector('input[type="email"], input[name*="email" i], input[type="text"]')?.closest('form');
          if (form) { const found = pick(form); if (found) return found; }
          return pick(document);
        });
        const submitEl = submitHandle.asElement();

        if (submitEl) {
          await submitEl.scrollIntoViewIfNeeded().catch(() => {});
          await submitEl.click({ delay: 40 }).catch(async () => {
            await submitEl.evaluate((el: Element) => (el as HTMLElement).click());
          });
        } else {
          log.warn("login: email-first flow, no submit button found — pressing Enter");
          await emailOnlyEl.press("Enter").catch(() => {});
        }

        await page.waitForLoadState("domcontentloaded").catch(() => {});

        // Wait for either a navigation, a code input, or a password field to appear
        await Promise.race([
          page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
          page.waitForSelector('input[type="password"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
          page.waitForSelector('input[inputmode="numeric"]:not([disabled]), input[autocomplete="one-time-code"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
        ]);

        // If a password field appeared (multi-step: email → password), fill it
        const laterPasswordHandle = await page.$('input[type="password"]:not([disabled]):not([readonly])');
        if (laterPasswordHandle && credential.password) {
          log.info("login: password field appeared after email submit — filling it");
          await fillHandle(laterPasswordHandle, credential.password);
          // Click submit again
          const laterSubmit = await page.$('button[type="submit"]:not([disabled])');
          if (laterSubmit) {
            await laterSubmit.click({ delay: 40 }).catch(() => {});
          } else {
            await laterPasswordHandle.press("Enter").catch(() => {});
          }
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
        }

        // Return partial success — the calling pipeline should handle
        // any OTP/code step that follows via elicitation or explicit steps.
        const afterUrl = page.url();
        const emailFlowDone = afterUrl !== beforeUrl;
        return {
          loggedIn: emailFlowDone,
          emailSubmitted: true,
          url: afterUrl,
          reason: emailFlowDone
            ? "Email-first flow completed — check for code/OTP prompt if login isn't complete."
            : "Email submitted, waiting for next step (code entry, password page, or redirect).",
        };
      }

      // No email field either — gather diagnostics and throw (bot-blocked).
      const pageDiag = await page.evaluate(() => {
        const visibleText = (document.body?.innerText || "").slice(0, 500);
        const inputCount = document.querySelectorAll("input").length;
        const hiddenPassword = !!document.querySelector('input[type="password"]');
        const hasCaptcha = !!document.querySelector(
          'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], [class*="captcha" i], [id*="captcha" i]'
        );
        const hasCloudflare = !!document.querySelector(
          '[class*="cf-" i], iframe[src*="challenges.cloudflare"]'
        );
        return { title: document.title, visibleText, inputCount, hiddenPassword, hasCaptcha, hasCloudflare };
      }).catch(() => ({ title: "", visibleText: "", inputCount: 0, hiddenPassword: false, hasCaptcha: false, hasCloudflare: false }));

      log.warn(`login: no visible password or email field on ${currentUrl} — title="${pageDiag.title}", inputs=${pageDiag.inputCount}`);

      const indicators: string[] = [];
      if (pageDiag.hasCaptcha) indicators.push("CAPTCHA detected");
      if (pageDiag.hasCloudflare) indicators.push("Cloudflare challenge");
      if (pageDiag.inputCount === 0) indicators.push("no input elements at all");
      if (pageDiag.hiddenPassword) indicators.push("password field exists but is hidden/disabled");
      const indicatorStr = indicators.length > 0 ? ` (${indicators.join(", ")})` : "";

      throw new Error(
        `login: no visible password or email field on ${currentUrl} after 5000ms${indicatorStr}. ` +
        `Page title: "${pageDiag.title}". ` +
        `The site may be showing a bot-detection wall, captcha, or an unsupported login flow. ` +
        `Retry with a stronger browser mode (binary-headful or docker-headful).`
      );
    }

    // ─── Standard password flow (password field found) ──────────
    // Find the username field — prefer a sibling in the same <form>, then globally
    const usernameHandle = await page.evaluateHandle((candidates: string[]) => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])') as HTMLInputElement | null;
      if (!pwd) return null;
      const scope: ParentNode = pwd.closest('form') || document;
      for (const sel of candidates) {
        const el = scope.querySelector(sel) as HTMLInputElement | null;
        if (el && el.offsetParent !== null) return el;
      }
      return null;
    }, emailCandidates);
    const usernameEl = usernameHandle.asElement();

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

    // Handle OTP field if present. We're post-auth now — no stealth needed.
    // Fast path: stored TOTP secret → generate code locally.
    // Elicit path: no secret → ask the user via MCP elicitation (email/SMS/app OTP).
    const otpSelector = 'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])';
    const totpHandle = await page.$(otpSelector);

    if (totpHandle) {
      let code: string | null = null;

      if (credential.totp_secret) {
        code = generateTOTP(credential.totp_secret);
        log.info(`login: generated TOTP from stored secret for ${step.domain}`);
      } else if (ctx.elicitOtp) {
        log.info(`login: prompting user for OTP for ${step.domain}`);
        try {
          code = await ctx.elicitOtp(step.domain);
        } catch (err) {
          log.warn(`login: OTP elicitation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!code) {
          throw new Error(`login: OTP required but user did not provide one for ${step.domain}`);
        }
      } else {
        // No stored secret and no elicitation callback — caller must retry with a pipeline that provides OTP.
        throw new Error(`login: OTP field present but no TOTP secret stored and no elicitation callback available. Store a secret with \`credentials add ${step.domain} --totp-secret <secret>\` or use the MCP execute tool (which supports OTP elicitation).`);
      }

      // Instant fill — setter + input/change events, no per-character typing, no waits.
      // We're past any anti-bot checks at this point.
      await totpHandle.evaluate((el: Element, val: string) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, val);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, code);

      // Click submit immediately (some sites auto-submit on 6-digit completion, others need a click)
      const totpSubmit = await page.$('button[type="submit"]:not([disabled])');
      if (totpSubmit) {
        await totpSubmit.click().catch(async () => {
          await totpSubmit.evaluate((el: Element) => (el as HTMLElement).click());
        });
      }
      await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
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
