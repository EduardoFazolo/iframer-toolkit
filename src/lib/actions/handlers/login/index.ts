import type { Page, ElementHandle } from "patchright";
import type { PipelineStep, ExecutionContext, Credential } from "../../../types";
import type { LoginResult } from "../../types";
import { humanClick } from "../../../browser/humanize";
import { fillHandleNative, fillSelectorNative, setValueNative, findSubmitButton } from "../../../browser/form-fill";
import { generateTOTP } from "../../../auth/crypto";
import { resolveCredential } from "../../../auth/credential-resolver";
import { normalizeDomain } from "../../../knowledge";
import { createLogger } from "../../../logger";
import { TIMING, TIMEOUTS } from "../../../constants";
import { resolveSelector } from "../../resolve-selector";
import {
  EMAIL_CANDIDATES,
  PASSWORD_SELECTOR,
  OTP_SELECTOR,
  LOGIN_URL_RE,
  EMAIL_FIRST_SUBMIT_RE,
  PASSWORD_SUBMIT_RE,
  EMAIL_FORM_ANCHOR,
  PASSWORD_FORM_ANCHOR,
} from "./selectors";

const log = createLogger("actions");

type LoginStep = Extract<PipelineStep, { type: "login" }>;

export async function login(page: Page, step: LoginStep, ctx: ExecutionContext): Promise<LoginResult> {
  const resolved = await resolveCredential(ctx.store, ctx.userId, ctx.token, step.domain);
  if (!resolved) {
    const stored = await ctx.store.listCredentialDomains(ctx.userId);
    const storedList = stored.length > 0 ? stored.join(", ") : "(none)";
    throw new Error(
      `No credentials stored for ${normalizeDomain(step.domain)}. Stored domains: ${storedList}. ` +
      `If you stored credentials under a different domain name, retry the login step with that domain. ` +
      `If no credentials are stored at all, call the \`credentials\` tool with action=store first.`
    );
  }
  const { credential, matchedDomain } = resolved;
  if (matchedDomain !== normalizeDomain(step.domain)) {
    log.info(`login: credentials for ${step.domain} resolved via parent domain ${matchedDomain}`);
  }

  const beforeUrl = page.url();

  const hasExplicitSelectors = !!(step.usernameSelector || step.passwordSelector || step.submitSelector);
  if (hasExplicitSelectors) {
    await runExplicitFlow(page, step, ctx, credential);
  } else {
    const early = await runAutoDetect(page, step, ctx, credential, beforeUrl);
    if (early) return early;
  }

  return honestSignal(page, beforeUrl);
}

/** Explicit-selector path (backwards compatible). */
async function runExplicitFlow(page: Page, step: LoginStep, ctx: ExecutionContext, credential: Credential): Promise<void> {
  if (step.usernameSelector && credential.username) {
    await fillSelectorNative(page, resolveSelector(step.usernameSelector, ctx), credential.username);
  }
  if (step.passwordSelector && credential.password) {
    await fillSelectorNative(page, resolveSelector(step.passwordSelector, ctx), credential.password);
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
}

/**
 * Auto-detect path. Returns a LoginResult for the early-exit cases
 * (already-authenticated, email-first flow), or null when it ran the standard
 * password flow and the caller should compute the final honest signal.
 * Throws on a bot-detection wall with no usable form.
 */
async function runAutoDetect(
  page: Page,
  step: LoginStep,
  ctx: ExecutionContext,
  credential: Credential,
  beforeUrl: string
): Promise<LoginResult | null> {
  log.info(`login: auto-detecting form on ${beforeUrl}`);

  // Give the page a moment to settle, then check if we're ALREADY logged in.
  // Session persistence across modes often means the login page redirects away
  // or hides the form — in that case "success, nothing to do" is correct.
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(500);

  const initialCheck = await page.evaluate((pwdSel) => {
    const pwd = document.querySelector(pwdSel) as HTMLInputElement | null;
    const pwdVisible = !!(pwd && pwd.offsetParent !== null);
    return { url: location.href, title: document.title, pwdVisible };
  }, PASSWORD_SELECTOR).catch(() => ({ url: page.url(), title: "", pwdVisible: false }));

  if (!initialCheck.pwdVisible && !LOGIN_URL_RE.test(initialCheck.url)) {
    log.info(`login: already logged in (no password field, URL=${initialCheck.url})`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: initialCheck.url,
      reason: "Session already authenticated — no login form detected",
    };
  }

  // Wait for a visible password field. Many modern sites (Slack, Microsoft,
  // Google) use an email-first multi-step flow, so if no password appears we
  // look for an email field before giving up.
  const passwordHandle = await page.waitForSelector(PASSWORD_SELECTOR, { state: "visible", timeout: 5000 }).catch(() => null);

  if (!passwordHandle) {
    return runNoPasswordBranch(page, step, ctx, credential, beforeUrl);
  }

  await runPasswordFlow(page, credential, beforeUrl, passwordHandle);
  await handleOtp(page, step, ctx, credential, beforeUrl);
  await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
  return null;
}

/** No visible password field: already-logged-out-of-login-area, email-first
 *  flow, or bot-blocked. */
async function runNoPasswordBranch(
  page: Page,
  step: LoginStep,
  ctx: ExecutionContext,
  credential: Credential,
  beforeUrl: string
): Promise<LoginResult> {
  const currentUrl = page.url();
  if (!LOGIN_URL_RE.test(currentUrl)) {
    log.info(`login: no password field and URL left login area (${currentUrl}) — treating as success`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: currentUrl,
      reason: "No login form detected after wait — assumed already authenticated",
    };
  }

  const emailOnlyHandle = await page.evaluateHandle((candidates: string[]) => {
    for (const sel of candidates) {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }, EMAIL_CANDIDATES);
  const emailOnlyEl = emailOnlyHandle.asElement();

  if (emailOnlyEl && credential.username) {
    return runEmailFirstFlow(page, credential, beforeUrl, emailOnlyEl);
  }

  // No email field either — gather diagnostics and throw (bot-blocked).
  const pageDiag = await page.evaluate(() => {
    const visibleText = (document.body?.innerText || "").slice(0, 500);
    const inputCount = document.querySelectorAll("input").length;
    const hiddenPassword = !!document.querySelector('input[type="password"]');
    const hasCaptcha = !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], [class*="captcha" i], [id*="captcha" i]');
    const hasCloudflare = !!document.querySelector('[class*="cf-" i], iframe[src*="challenges.cloudflare"]');
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

/** Email-first flow (Slack/Microsoft/Google): submit email, then fill a
 *  password field if one appears on the next step. */
async function runEmailFirstFlow(
  page: Page,
  credential: Credential,
  beforeUrl: string,
  emailEl: ElementHandle
): Promise<LoginResult> {
  const currentUrl = page.url();
  log.info(`login: no password field but found email input — running email-first flow on ${currentUrl}`);

  await fillHandleNative(page, emailEl, credential.username!);

  const submitEl = await findSubmitButton(page, {
    formAnchor: EMAIL_FORM_ANCHOR,
    reSource: EMAIL_FIRST_SUBMIT_RE.source,
    reFlags: EMAIL_FIRST_SUBMIT_RE.flags,
  });
  if (submitEl) {
    await submitEl.scrollIntoViewIfNeeded().catch(() => {});
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el: Element) => (el as HTMLElement).click());
    });
  } else {
    log.warn("login: email-first flow, no submit button found — pressing Enter");
    await emailEl.press("Enter").catch(() => {});
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});

  // Wait for a navigation, a code input, or a password field to appear.
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
    page.waitForSelector('input[type="password"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
    page.waitForSelector('input[inputmode="numeric"]:not([disabled]), input[autocomplete="one-time-code"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
  ]);

  // If a password field appeared (email → password), fill it.
  const laterPasswordHandle = await page.$(PASSWORD_SELECTOR);
  if (laterPasswordHandle && credential.password) {
    log.info("login: password field appeared after email submit — filling it");
    await fillHandleNative(page, laterPasswordHandle, credential.password);
    const laterSubmit = await page.$('button[type="submit"]:not([disabled])');
    if (laterSubmit) {
      await laterSubmit.click({ delay: 40 }).catch(() => {});
    } else {
      await laterPasswordHandle.press("Enter").catch(() => {});
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
  }

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

/** Standard password flow: fill username (if present) + password, submit. */
async function runPasswordFlow(page: Page, credential: Credential, beforeUrl: string, passwordHandle: ElementHandle): Promise<void> {
  // Find the username field — prefer a sibling in the same <form>, then globally.
  const usernameHandle = await page.evaluateHandle((args: { candidates: string[]; pwdSel: string }) => {
    const pwd = document.querySelector(args.pwdSel) as HTMLInputElement | null;
    if (!pwd) return null;
    const scope: ParentNode = pwd.closest("form") || document;
    for (const sel of args.candidates) {
      const el = scope.querySelector(sel) as HTMLInputElement | null;
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }, { candidates: EMAIL_CANDIDATES, pwdSel: PASSWORD_SELECTOR });
  const usernameEl = usernameHandle.asElement();

  if (usernameEl && credential.username) {
    await fillHandleNative(page, usernameEl, credential.username);
  } else if (!usernameEl) {
    log.warn("login: no username field detected, proceeding with password only");
  }

  if (credential.password) {
    await fillHandleNative(page, passwordHandle, credential.password);
  }

  const submitEl = await findSubmitButton(page, {
    formAnchor: PASSWORD_FORM_ANCHOR,
    reSource: PASSWORD_SUBMIT_RE.source,
    reFlags: PASSWORD_SUBMIT_RE.flags,
  });
  if (submitEl) {
    await submitEl.scrollIntoViewIfNeeded().catch(() => {});
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el: Element) => (el as HTMLElement).click());
    });
  } else {
    log.warn("login: no submit button detected, pressing Enter in password field");
    await passwordHandle.press("Enter").catch(() => {});
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});

  // Wait for a URL change or a TOTP field.
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
    page.waitForSelector(OTP_SELECTOR, { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
  ]);
}

/** Handle an OTP field if one is present: stored TOTP → generate locally;
 *  otherwise elicit from the user. Post-auth, so no stealth needed. */
async function handleOtp(page: Page, step: LoginStep, ctx: ExecutionContext, credential: Credential, beforeUrl: string): Promise<void> {
  const totpHandle = await page.$(OTP_SELECTOR);
  if (!totpHandle) return;

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
    throw new Error(`login: OTP field present but no TOTP secret stored and no elicitation callback available. Store a secret with \`credentials add ${step.domain} --totp-secret <secret>\` or use the MCP execute tool (which supports OTP elicitation).`);
  }

  // Instant fill — no per-character typing, no waits; anti-bot checks passed.
  await setValueNative(totpHandle, code);

  const totpSubmit = await page.$('button[type="submit"]:not([disabled])');
  if (totpSubmit) {
    await totpSubmit.click().catch(async () => {
      await totpSubmit.evaluate((el: Element) => (el as HTMLElement).click());
    });
  }
  await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
}

/** Honest loggedIn signal: URL changed AND no visible password field remains. */
async function honestSignal(page: Page, beforeUrl: string): Promise<LoginResult> {
  const afterUrl = page.url();
  const stillHasPasswordField = await page.evaluate((pwdSel) => {
    const pwd = document.querySelector(pwdSel) as HTMLInputElement | null;
    return !!(pwd && pwd.offsetParent !== null);
  }, PASSWORD_SELECTOR).catch(() => false);

  const loggedIn = afterUrl !== beforeUrl && !stillHasPasswordField;
  return { loggedIn, url: afterUrl, changedUrl: afterUrl !== beforeUrl, passwordFieldRemains: stillHasPasswordField };
}
