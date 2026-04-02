import path from "path";
import type {
  IframerConfig,
  Pipeline,
  PipelineResult,
  FetchRequest,
  FetchResult,
  SessionStartOptions,
  SessionStopResult,
  CredentialInput,
  Credential,
  ExecutionContext,
} from "./types";
import { PipelineRunner } from "./pipeline";
import * as sessionManager from "./browser/session-manager";
import { getBrowserWithFallback, BROWSER_ORDER } from "./browser/launcher";
import { stealthContextOptions, applyStealthToPage } from "./browser/stealth";
import { humanClick, humanType, clickRecaptchaCheckbox, clickChallengeTiles, clickChallengeVerify } from "./browser/humanize";
import { deriveKey, encrypt, decrypt, generateTOTP } from "./auth/crypto";
import { getSession, setSession, deleteSession, getCredential, setCredential, deleteCredential, listCredentialDomains, closeRedis } from "./session/redis";
import { extractSession, injectCookies, injectStorage } from "./session/persistence";
import { saveScreenshot } from "./screenshot";

const DEFAULT_SCREENSHOT_DIR = path.join(import.meta.dir, "../../.screenshots");
const DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
const DEFAULT_STALE_TIMEOUT_MS = 20_000;

export class Iframer {
  private screenshotDir: string;
  private publicUrl: string;
  private staleTimeoutMs: number;

  constructor(config: IframerConfig = {}) {
    this.screenshotDir = config.screenshotDir || DEFAULT_SCREENSHOT_DIR;
    this.publicUrl = config.publicUrl || DEFAULT_PUBLIC_URL;
    this.staleTimeoutMs = config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
  }

  private makeContext(userId: string, token: string): ExecutionContext {
    return {
      userId,
      token,
      screenshotDir: this.screenshotDir,
      publicUrl: this.publicUrl,
      staleTimeoutMs: this.staleTimeoutMs,
    };
  }

  // ─── Headless Fetch ──────────────────────────────────────────────

  async fetch(userId: string | null, token: string | null, request: FetchRequest): Promise<FetchResult> {
    const { url, browser: preferredBrowser, waitUntil = "domcontentloaded", waitForSelector, extract, actions = [], returnHtml = false, headers = {}, locale = "pt-BR", sessionless = false } = request;

    const useSession = !sessionless && !!userId && !!token;
    const startedAt = Date.now();
    let context: any;

    try {
      let sessionData: any = null;
      let encryptionKey: Buffer | null = null;

      if (useSession) {
        encryptionKey = await deriveKey(token!);
        const blob = await getSession(userId!);
        if (blob && blob.length > 0) {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
        }
      }

      const { browser, name: browserName } = await getBrowserWithFallback(preferredBrowser);
      context = await browser.newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? undefined));

      if (sessionData) await injectCookies(context, sessionData);

      const page = await context.newPage();
      await applyStealthToPage(page);
      await page.goto(url, { waitUntil: waitUntil as any, timeout: 60_000 });

      if (sessionData) await injectStorage(page, sessionData);
      if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: 10_000 });

      // Execute any simple actions
      for (const action of actions) {
        if (action.type === "click") await page.click((action as any).selector);
        else if (action.type === "fill") await page.fill((action as any).selector, (action as any).value);
        else if (action.type === "wait") await page.waitForTimeout((action as any).ms);
        else if (action.type === "scroll") await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        else if (action.type === "human-click") await humanClick(page, (action as any).selector);
        else if (action.type === "human-type") await humanType(page, (action as any).selector, (action as any).value);
        else if (action.type === "recaptcha-click") await clickRecaptchaCheckbox(page);
        else if (action.type === "recaptcha-select") await clickChallengeTiles(page, (action as any).tiles);
        else if (action.type === "recaptcha-verify") await clickChallengeVerify(page);
      }

      const finalUrl = page.url();
      const html = returnHtml ? await page.content() : undefined;
      const result = extract ? await page.evaluate(extract as any) : undefined;

      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey!);
        await setSession(userId!, encrypted);
      }

      return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
    } catch (err: any) {
      return { ok: false, browser: "unknown", url, error: err.message, durationMs: Date.now() - startedAt };
    } finally {
      if (context) await context.close();
    }
  }

  // ─── Interactive Sessions ────────────────────────────────────────

  async startSession(userId: string, token: string, options: SessionStartOptions = {}): Promise<{ noVncUrl: string; wsPort: number }> {
    const existing = sessionManager.getSession(userId);
    if (existing) {
      sessionManager.resetTimeout(userId);
      return {
        noVncUrl: `http://localhost:${existing.wsPort}/vnc.html?autoconnect=true`,
        wsPort: existing.wsPort,
      };
    }

    const session = await sessionManager.startSession(userId);

    const encryptionKey = await deriveKey(token);
    const blob = await getSession(userId);
    let sessionData: any = null;
    if (blob && blob.length > 0) {
      sessionData = JSON.parse(decrypt(blob, encryptionKey));
      await injectCookies(session.context, sessionData);
    }

    if (options.url) {
      await session.page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (sessionData) await injectStorage(session.page, sessionData);
    }

    return {
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort,
    };
  }

  getSession(userId: string) {
    return sessionManager.getSession(userId);
  }

  async stopSession(userId: string, token: string): Promise<SessionStopResult> {
    const sessionData = await sessionManager.stopSession(userId);

    if (sessionData && token) {
      const encryptionKey = await deriveKey(token);
      const encrypted = encrypt(JSON.stringify(sessionData), encryptionKey);
      await setSession(userId, encrypted);
    }

    return { ok: true, sessionSaved: !!sessionData };
  }

  // ─── Pipeline Execution (the main new feature) ────────────────────

  async execute(userId: string, token: string, pipeline: Pipeline): Promise<PipelineResult> {
    // Auto-start session if not active
    let session = sessionManager.getSession(userId);
    if (!session) {
      // Pass the first navigate URL so startSession can inject localStorage at the right origin
      const firstNav = (pipeline.steps as any[]).find(s => s.type === "navigate");
      await this.startSession(userId, token, firstNav ? { url: firstNav.url } : {});
      session = sessionManager.getSession(userId)!;
    }

    sessionManager.resetTimeout(userId);

    const ctx = this.makeContext(userId, token);
    const runner = new PipelineRunner(ctx);
    return runner.run(session.page, pipeline);
  }

  // ─── Screenshots ─────────────────────────────────────────────────

  async screenshot(userId: string): Promise<{ screenshotUrl: string; url: string; title: string } | null> {
    const session = sessionManager.getSession(userId);
    if (!session) return null;

    sessionManager.resetTimeout(userId);
    const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `screenshot-${Date.now()}.jpg`, this.screenshotDir, this.publicUrl);

    return {
      screenshotUrl,
      url: session.page.url(),
      title: await session.page.title(),
    };
  }

  // ─── Credentials ─────────────────────────────────────────────────

  async storeCredential(userId: string, token: string, credential: CredentialInput): Promise<void> {
    const credKey = await deriveKey(token, "credentials");
    const data = {
      ...credential,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const encrypted = encrypt(JSON.stringify(data), credKey);
    await setCredential(userId, credential.domain, encrypted);
  }

  async getCredential(userId: string, token: string, domain: string): Promise<Credential | null> {
    const credKey = await deriveKey(token, "credentials");
    const blob = await getCredential(userId, domain);
    if (!blob || blob.length === 0) return null;
    return JSON.parse(decrypt(blob, credKey));
  }

  async listCredentials(userId: string): Promise<string[]> {
    return listCredentialDomains(userId);
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    await deleteCredential(userId, domain);
  }

  async loginWithCredentials(
    userId: string,
    token: string,
    domain: string,
    selectors: { username?: string; password?: string; submit?: string; totp?: string }
  ): Promise<{ ok: boolean; url: string; title: string; screenshotUrl?: string; error?: string }> {
    const session = sessionManager.getSession(userId);
    if (!session) return { ok: false, url: "", title: "", error: "No active interactive session. Start one first." };

    const credKey = await deriveKey(token, "credentials");
    const blob = await getCredential(userId, domain);
    if (!blob || blob.length === 0) {
      return { ok: false, url: "", title: "", error: `No credentials stored for ${domain}` };
    }

    const credential = JSON.parse(decrypt(blob, credKey));
    const page = session.page;
    sessionManager.resetTimeout(userId);

    if (selectors.username && credential.username) {
      await humanType(page, selectors.username, credential.username);
      await page.waitForTimeout(300 + Math.random() * 500);
    }
    if (selectors.password && credential.password) {
      await humanType(page, selectors.password, credential.password);
      await page.waitForTimeout(300 + Math.random() * 500);
    }
    if (selectors.submit) {
      await humanClick(page, selectors.submit);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);
    }
    if (selectors.totp && credential.totp_secret) {
      const totp = generateTOTP(credential.totp_secret);
      await page.click(selectors.totp);
      await page.keyboard.type(totp, { delay: 50 });
      await page.waitForTimeout(300);
    }

    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `login-${Date.now()}.jpg`, this.screenshotDir, this.publicUrl);

    return { ok: true, url: page.url(), title: await page.title(), screenshotUrl };
  }

  // ─── Session Data ─────────────────────────────────────────────────

  async clearSession(userId: string): Promise<void> {
    await deleteSession(userId);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await sessionManager.cleanupAllSessions();
    await closeRedis();
  }
}
