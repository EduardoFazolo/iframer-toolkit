import path from "path";
import { fileURLToPath } from "url";
import type { Browser, Page } from "patchright";
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
  ElementRef,
  BrowserMode,
  ModeAvailability,
} from "./types";
import { PipelineRunner } from "./pipeline";
import * as sessionManager from "./browser/session-manager";
import { getBrowserWithFallback, closeBrowser } from "./browser/launcher";
import { stealthContextOptions, applyStealthToPage } from "./browser/stealth";
import { humanClick, humanType, clickRecaptchaCheckbox, clickChallengeTiles, clickChallengeVerify } from "./browser/humanize";
import { deriveKey, encrypt, decrypt, generateTOTP } from "./auth/crypto";
import { extractSession, injectCookies, injectStorage } from "./session/persistence";
import type { SessionData } from "./session/persistence";
import { mergeKnowledge, normalizeDomain, domainLookupChain, type KnowledgeAuth, type KnowledgeEndpoint } from "./knowledge";
import { saveScreenshot } from "./screenshot";
import { createStore, type StorageBackend } from "./storage";
import { BrowserDaemon, DEFAULT_INSTANCE } from "./browser/daemon";
import { ApiCapture } from "./api-capture";
import { DomainModeStore } from "./domain-modes";
import { detectBlock } from "./block-detection";
import { checkModeAvailability } from "./browser/cdp-launcher";
import { TIMEOUTS, TIMING } from "./constants";
import { createLogger } from "./logger";
import { getErrorMessage } from "./errors";
import { capturePageState } from "./page-state";

const log = createLogger("iframer");

const DEFAULT_SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.screenshots");
const DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
const DEFAULT_STALE_TIMEOUT_MS = 20_000;

export class Iframer {
  private screenshotDir: string;
  private publicUrl: string;
  private staleTimeoutMs: number;
  private userRefs = new Map<string, { refMap: Map<string, ElementRef>; nextRefId: number }>();
  private store: StorageBackend;
  private daemon: BrowserDaemon;
  private domainModes: DomainModeStore;
  private operatingMode: "docker" | "local";
  private persistentCaptures = new Map<string, ApiCapture>();

  constructor(config: IframerConfig = {}) {
    this.screenshotDir = config.screenshotDir || DEFAULT_SCREENSHOT_DIR;
    this.publicUrl = config.publicUrl || DEFAULT_PUBLIC_URL;
    this.staleTimeoutMs = config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;

    // Storage: SQLite in data directory (honors IFRAMER_DATA_DIR for Docker bind-mount)
    this.store = createStore({ dataDir: config.dataDir });

    // Browser daemon for local modes (headless + binary-headful)
    this.daemon = new BrowserDaemon(config.sessionTimeoutMs);

    // Domain mode memory
    this.domainModes = new DomainModeStore();

    // Operating mode — determines if we use Docker session-manager or local daemon
    this.operatingMode = config.mode || "local";
  }

  private makeContext(userId: string, token: string): ExecutionContext {
    if (!this.userRefs.has(userId)) {
      this.userRefs.set(userId, { refMap: new Map(), nextRefId: 1 });
    }
    const refs = this.userRefs.get(userId)!;

    return {
      userId,
      token,
      screenshotDir: this.screenshotDir,
      publicUrl: this.publicUrl,
      staleTimeoutMs: this.staleTimeoutMs,
      refMap: refs.refMap,
      nextRefId: refs.nextRefId,
      store: this.store,
    };
  }

  // ─── Mode Detection ─────────────────────────────────────────────────

  getAvailableModes(): BrowserMode[] {
    const modes: BrowserMode[] = ["headless"];
    const { binaryHeadful } = checkModeAvailability();
    if (binaryHeadful) modes.push("binary-headful");
    if (this.operatingMode === "docker") modes.push("docker-headful");
    return modes;
  }

  async getModeAvailability(): Promise<ModeAvailability> {
    const { binaryHeadful } = checkModeAvailability();
    return {
      headless: { available: true },
      "binary-headful": {
        available: binaryHeadful,
        reason: binaryHeadful ? undefined : "No display available",
      },
      "docker-headful": {
        available: this.operatingMode === "docker",
        reason: this.operatingMode === "docker" ? undefined : "Docker not configured",
      },
    };
  }

  // ─── Headless Fetch ──────────────────────────────────────────────

  async fetch(userId: string | null, token: string | null, request: FetchRequest): Promise<FetchResult> {
    const { url, browser: preferredBrowser, waitUntil = "domcontentloaded", waitForSelector, extract, actions = [], returnHtml = false, headers = {}, locale = "pt-BR", sessionless = false } = request;

    const useSession = !sessionless && !!userId && !!token;
    const startedAt = Date.now();
    let context: Awaited<ReturnType<Browser["newContext"]>> | null = null;

    try {
      let sessionData: SessionData | null = null;
      let encryptionKey: Buffer | null = null;

      if (useSession) {
        encryptionKey = await deriveKey(token!);
        const blob = await this.store.getSession(userId!);
        if (blob && blob.length > 0) {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
        }
      }

      const { browser, name: browserName } = await getBrowserWithFallback(preferredBrowser);
      context = await browser.newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? undefined));

      if (sessionData) await injectCookies(context, sessionData);

      const page = await context.newPage();
      await applyStealthToPage(page);
      await page.goto(url, { waitUntil: (waitUntil || "domcontentloaded") as "load" | "domcontentloaded" | "networkidle" | "commit", timeout: TIMEOUTS.NAVIGATION });

      if (sessionData) await injectStorage(page, sessionData);
      if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });

      for (const action of actions) {
        switch (action.type) {
          case "click": await page.click(action.selector!); break;
          case "fill": await page.fill(action.selector!, action.value!); break;
          case "wait": await page.waitForTimeout(action.ms!); break;
          case "scroll": await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); break;
          case "human-click": await humanClick(page, action.selector!); break;
          case "human-type": await humanType(page, action.selector!, action.value!); break;
          case "recaptcha-click": await clickRecaptchaCheckbox(page); break;
          case "recaptcha-select": await clickChallengeTiles(page, (action as { tiles: number[] }).tiles); break;
          case "recaptcha-verify": await clickChallengeVerify(page); break;
        }
      }

      const finalUrl = page.url();
      const html = returnHtml ? await page.content() : undefined;
      const result = extract ? await page.evaluate(extract) : undefined;

      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey!);
        await this.store.setSession(userId!, encrypted);
      }

      return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
    } catch (err: unknown) {
      return { ok: false, browser: "unknown", url, error: getErrorMessage(err), durationMs: Date.now() - startedAt };
    } finally {
      if (context) await context.close();
    }
  }

  // ─── Interactive Sessions (Docker mode) ──────────────────────────

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
    const blob = await this.store.getSession(userId);
    let sessionData: SessionData | null = null;
    if (blob && blob.length > 0) {
      sessionData = JSON.parse(decrypt(blob, encryptionKey)) as SessionData;
      if (sessionData) await injectCookies(session.context, sessionData);
    }

    if (options.url) {
      await session.page.goto(options.url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.NAVIGATION });
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

  /** Session-store key for a named browser instance. The default instance keeps
   *  the bare userId (backward compatible); named instances get their own blob
   *  so parallel browsers can hold independent logins. */
  private sessionKey(userId: string, instanceId: string = DEFAULT_INSTANCE): string {
    return instanceId === DEFAULT_INSTANCE ? userId : `${userId}::${instanceId}`;
  }

  async stopSession(userId: string, token: string): Promise<SessionStopResult> {
    let sessionSaved = false;

    // Extract state from any live local daemon instances BEFORE closing them.
    // Each named instance is saved under its own key so independent logins
    // (e.g. per-account browsers) persist separately.
    if (token) {
      const encryptionKey = await deriveKey(token);
      for (const inst of this.daemon.liveInstances()) {
        try {
          const data = await extractSession(inst.context, inst.page);
          if (data) {
            const encrypted = encrypt(JSON.stringify(data), encryptionKey);
            await this.store.setSession(this.sessionKey(userId, inst.instanceId), encrypted);
            sessionSaved = true;
          }
        } catch (err) {
          log.warn(`stopSession: failed to extract daemon state for ${inst.mode}::${inst.instanceId}: ${getErrorMessage(err)}`);
        }
      }
    }

    // Stop Docker session if active (Docker-mode only)
    const dockerSessionData = await sessionManager.stopSession(userId);
    if (dockerSessionData && token) {
      const encryptionKey = await deriveKey(token);
      const encrypted = encrypt(JSON.stringify(dockerSessionData), encryptionKey);
      await this.store.setSession(userId, encrypted);
      sessionSaved = true;
    }

    // Tear down idle local daemon browsers. Busy instances (another agent's
    // pipeline mid-run on the shared server) are left alone — their own idle
    // timer reclaims them when they finish.
    await this.daemon.stopAll();

    return { ok: true, sessionSaved };
  }

  // ─── Pipeline Execution (with three-mode support) ─────────────────

  /** Runtime elicitation hook, set per-call via execute(...). Stored on the
   *  instance because the daemon's ExecutionContext is built inside a private
   *  method — the hook is consumed once and immediately cleared. */
  private pendingElicitOtp?: (domain: string) => Promise<string | null>;

  async execute(
    userId: string,
    token: string,
    pipeline: Pipeline,
    runtime?: { elicitOtp?: (domain: string) => Promise<string | null> }
  ): Promise<PipelineResult> {
    this.pendingElicitOtp = runtime?.elicitOtp;
    try {
      return await this.executeInner(userId, token, pipeline);
    } finally {
      this.pendingElicitOtp = undefined;
    }
  }

  private async executeInner(userId: string, token: string, pipeline: Pipeline): Promise<PipelineResult> {
    const opts = pipeline.options || {};
    const forcedMode = opts.mode;
    const autoEscalate = opts.autoEscalate !== false;
    const instanceId = opts.instanceId || DEFAULT_INSTANCE;

    // Extract domain from first navigate step for mode memory
    const firstNav = pipeline.steps.find(s => s.type === "navigate");
    const domain = firstNav ? new URL(firstNav.url).hostname : null;

    // Determine available modes
    const availableModes = this.getAvailableModes();

    // Pick starting mode
    let mode: BrowserMode;
    if (forcedMode && availableModes.includes(forcedMode)) {
      mode = forcedMode;
    } else if (domain) {
      mode = this.domainModes.getBestMode(domain, availableModes);
    } else {
      mode = availableModes[0] || "headless";
    }

    // Execute with the chosen mode
    let result = await this.executeWithMode(userId, token, pipeline, mode, instanceId);

    // Auto-escalation: if blocked and autoEscalate is on, try next mode
    if (!result.ok && autoEscalate && domain && result.error?.errorType === "bot-blocked") {
      const failedMode = mode;
      if (domain) this.domainModes.recordFailure(domain, failedMode, result.error?.message || "blocked");

      const nextMode = this.domainModes.getNextMode(failedMode, availableModes);
      if (nextMode) {
        log.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);

        // Stop the failed mode's browser
        if (failedMode !== "docker-headful") {
          await this.daemon.stopMode(failedMode, instanceId);
        }

        result = await this.executeWithMode(userId, token, pipeline, nextMode, instanceId);
        result.modeEscalated = true;
        result.modeUsed = nextMode;

        if (result.ok && domain) {
          this.domainModes.recordSuccess(domain, nextMode);
        } else if (!result.ok && domain && result.error?.errorType === "bot-blocked") {
          this.domainModes.recordFailure(domain, nextMode, result.error?.message || "blocked");

          // Try one more escalation
          const thirdMode = this.domainModes.getNextMode(nextMode, availableModes);
          if (thirdMode) {
            log.info(`Auto-escalating from ${nextMode} to ${thirdMode} for ${domain}`);
            if (nextMode !== "docker-headful") {
              await this.daemon.stopMode(nextMode, instanceId);
            }
            result = await this.executeWithMode(userId, token, pipeline, thirdMode, instanceId);
            result.modeEscalated = true;
            result.modeUsed = thirdMode;

            if (result.ok && domain) {
              this.domainModes.recordSuccess(domain, thirdMode);
            }
          }
        }
      }
    } else if (result.ok && domain) {
      this.domainModes.recordSuccess(domain, mode);
    }

    return result;
  }

  private async executeWithMode(userId: string, token: string, pipeline: Pipeline, mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<PipelineResult> {
    if (mode === "docker-headful") {
      return this.executeDocker(userId, token, pipeline);
    }
    return this.executeLocal(userId, token, pipeline, mode, instanceId);
  }

  /** Execute via Docker session-manager (existing behavior) */
  private async executeDocker(userId: string, token: string, pipeline: Pipeline): Promise<PipelineResult> {
    let session = sessionManager.getSession(userId);
    if (!session) {
      const firstNav = pipeline.steps.find(s => s.type === "navigate");
      await this.startSession(userId, token, firstNav ? { url: firstNav.url } : {});
      session = sessionManager.getSession(userId)!;
    }

    sessionManager.resetTimeout(userId);

    const ctx = this.makeContext(userId, token);
    const runner = new PipelineRunner(ctx);
    const result = await runner.run(session.page, pipeline);

    // Check for bot blocks after navigation
    if (result.ok) {
      const blockResult = await detectBlock(session.page);
      if (blockResult.blocked) {
        const pageState = await capturePageState(session.page, ctx, { screenshot: true, namePrefix: "block" });
        return {
          ...result,
          ok: false,
          modeUsed: "docker-headful",
          error: {
            failedAtStep: result.completedSteps - 1,
            failedStep: pipeline.steps[result.completedSteps - 1],
            errorType: "bot-blocked",
            message: `Page blocked by bot detection: ${blockResult.reason}`,
            pageState,
            suggestion: "The page is blocked by bot detection. Try a different browser mode.",
            retryable: true,
          },
        };
      }
    }

    // Sync refs
    const refs = this.userRefs.get(userId);
    if (refs) refs.nextRefId = ctx.nextRefId;

    result.modeUsed = "docker-headful";
    return result;
  }

  /** Execute via local Chrome daemon (new behavior for headless + binary-headful) */
  private async executeLocal(userId: string, token: string, pipeline: Pipeline, mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<PipelineResult> {
    const startTime = Date.now();

    let acquired = false;
    try {
      // Get or launch Chrome in the requested mode + named instance
      const { page } = await this.daemon.ensure(mode, instanceId);
      // Mark busy so the idle timer can't kill the browser mid-pipeline
      this.daemon.acquire(mode, instanceId);
      acquired = true;

      // Load stored session (cookies + localStorage + sessionStorage).
      // Named instances get their own session blob so they can hold separate
      // logins (e.g. one per account); "default" stays keyed by userId.
      const storeKey = this.sessionKey(userId, instanceId);
      const encryptionKey = await deriveKey(token);
      const blob = await this.store.getSession(storeKey);
      let sessionData: SessionData | null = null;
      if (blob && blob.length > 0) {
        try {
          sessionData = JSON.parse(decrypt(blob, encryptionKey)) as SessionData;
          // Cookies inject at context level (no navigation needed)
          await injectCookies(page.context(), sessionData);
        } catch {}
      }

      // Run pipeline. The navigate action will call injectStorage() after each
      // page.goto so localStorage/sessionStorage are re-hydrated once we're on
      // the correct origin (they're origin-scoped and can't be set from about:blank).
      const ctx = this.makeContext(userId, token);
      if (sessionData) ctx.sessionData = sessionData;
      if (this.pendingElicitOtp) ctx.elicitOtp = this.pendingElicitOtp;
      const runner = new PipelineRunner(ctx);
      const result = await runner.run(page, pipeline);

      // Check for bot blocks after navigation
      if (result.ok) {
        const blockResult = await detectBlock(page);
        if (blockResult.blocked) {
          const pageState = await capturePageState(page, ctx, { screenshot: true, namePrefix: "block" });
          return {
            ...result,
            ok: false,
            modeUsed: mode,
            error: {
              failedAtStep: result.completedSteps - 1,
              failedStep: pipeline.steps[result.completedSteps - 1],
              errorType: "bot-blocked",
              message: `Page blocked by bot detection: ${blockResult.reason}`,
              pageState,
              suggestion: `The page was blocked in ${mode} mode. ${mode === "headless" ? "Try docker-headful mode." : mode === "docker-headful" ? "Try binary-headful mode." : "All modes exhausted."}`,
              retryable: true,
            },
          };
        }
      }

      // Save session state after successful execution
      let updatedSession: SessionData | null = null;
      if (result.ok) {
        try {
          updatedSession = await extractSession(page.context(), page);
          const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
          await this.store.setSession(storeKey, encrypted);
        } catch {}
      }

      // Update per-domain knowledge cache after successful runs so future
      // invocations can potentially skip the browser entirely.
      if (result.ok) {
        try {
          this.updateKnowledgeFromRun(pipeline, result, updatedSession, mode);
        } catch (err) {
          log.warn(`knowledge update failed: ${getErrorMessage(err)}`);
        }
      }

      // Sync refs
      const refs = this.userRefs.get(userId);
      if (refs) refs.nextRefId = ctx.nextRefId;

      result.modeUsed = mode;
      return result;
    } catch (err: unknown) {
      return {
        ok: false,
        completedSteps: 0,
        totalSteps: pipeline.steps.length,
        results: [],
        finalState: { url: "", title: "" },
        obstacles: [],
        error: {
          failedAtStep: 0,
          failedStep: pipeline.steps[0],
          errorType: "action-failed",
          message: `Failed to launch browser in ${mode} mode: ${getErrorMessage(err)}`,
          pageState: { url: "", title: "" },
          suggestion: `Browser launch failed. ${mode === "binary-headful" ? "Make sure a display is available." : "Check Chrome installation."}`,
          retryable: true,
        },
        durationMs: Date.now() - startTime,
        modeUsed: mode,
      };
    } finally {
      if (acquired) this.daemon.release(mode, instanceId);
    }
  }

  /**
   * Extract per-domain knowledge from a successful pipeline run and merge it
   * into the knowledge cache. Runs after every successful execute so the
   * cache incrementally learns about every site the agent touches.
   */
  private updateKnowledgeFromRun(
    pipeline: Pipeline,
    result: PipelineResult,
    sessionData: SessionData | null,
    mode: BrowserMode
  ): void {
    // Determine target domain from the first navigate step
    const firstNav = pipeline.steps.find((s) => s.type === "navigate");
    if (!firstNav || firstNav.type !== "navigate") return;

    let domain: string;
    try {
      domain = new URL(firstNav.url).hostname;
    } catch {
      return;
    }

    const domainRoot = domain.replace(/^www\./, "");
    const hadLogin = pipeline.steps.some((s) => s.type === "login");

    // Build auth structure from the session we just captured
    const auth: KnowledgeAuth = { type: "unknown" };
    const cookieNames: string[] = [];
    const localStorageKeys: string[] = [];
    const sessionStorageKeys: string[] = [];

    if (sessionData) {
      // Cookie names scoped to this domain (strip leading dot for display)
      for (const c of sessionData.cookies ?? []) {
        if (c.domain.endsWith(domainRoot) || domainRoot.endsWith(c.domain.replace(/^\./, ""))) {
          if (!cookieNames.includes(c.name)) cookieNames.push(c.name);
        }
      }

      // localStorage/sessionStorage keys for any origin matching the domain
      for (const [origin, store] of Object.entries(sessionData.localStorage ?? {})) {
        if (origin.includes(domainRoot)) {
          for (const k of Object.keys(store)) {
            if (!localStorageKeys.includes(k)) localStorageKeys.push(k);
          }
        }
      }
      for (const [origin, store] of Object.entries(sessionData.sessionStorage ?? {})) {
        if (origin.includes(domainRoot)) {
          for (const k of Object.keys(store)) {
            if (!sessionStorageKeys.includes(k)) sessionStorageKeys.push(k);
          }
        }
      }
    }

    if (cookieNames.length > 0 && localStorageKeys.length > 0) {
      auth.type = "cookies+localStorage";
    } else if (localStorageKeys.length > 0) {
      auth.type = "localStorage";
    } else if (cookieNames.length > 0) {
      auth.type = "cookies";
    }
    if (cookieNames.length > 0) auth.cookieNames = cookieNames;
    if (localStorageKeys.length > 0) auth.localStorageKeys = localStorageKeys;
    if (sessionStorageKeys.length > 0) auth.sessionStorageKeys = sessionStorageKeys;

    // If the run captured API calls (captureApi: true), fold them in as endpoints
    const endpoints: KnowledgeEndpoint[] = [];
    const replayHeaders = new Set<string>();

    for (const api of result.capturedApi ?? []) {
      // Only consider same-domain captured APIs
      if (!api.domain.includes(domainRoot) && !domainRoot.includes(api.domain.replace(/^www\./, ""))) continue;

      if (api.auth?.authorization) replayHeaders.add("Authorization");
      for (const name of Object.keys(api.auth?.tokens ?? {})) replayHeaders.add(name);

      for (const ep of api.endpoints ?? []) {
        endpoints.push({
          method: ep.method,
          path: ep.path,
          description: `Status ${ep.responseStatus}. Triggered at step ${ep.triggeredAtStep}.`,
          example: ep.curl,
          firstSeen: new Date().toISOString(),
        });
      }
    }

    if (replayHeaders.size > 0) {
      auth.headers = [...replayHeaders];
      if (!auth.type.includes("header")) auth.type = auth.type === "unknown" ? "headers" : `${auth.type}+headers`;
    }

    const notes: string[] = [];
    if (hadLogin) notes.push(`Last successful login via browser in ${mode} mode.`);
    if (result.obstacles?.some((o) => o.type?.includes("captcha"))) notes.push("Captcha encountered — browser required for fresh logins.");

    mergeKnowledge(domainRoot, {
      lastMode: mode,
      browserRequired: true, // will flip to false only when the agent proves direct API works
      auth,
      endpoints,
      notes,
    });
  }


  // ─── Browser lifecycle ───────────────────────────────────────────

  // ─── Persistent Capture ──────────────────────────────────────────

  async startCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; message: string }> {
    const key = `${mode}::${instanceId}`;
    if (this.persistentCaptures.has(key)) {
      return { ok: true, message: `Capture already running on ${key}. Call capture-stop to flush.` };
    }
    const { page } = await this.daemon.ensure(mode, instanceId);
    const capture = new ApiCapture(page);
    capture.start();
    this.persistentCaptures.set(key, capture);
    return { ok: true, message: `Capture started on ${key}. Use 'session capture-stop' when ready to collect results.` };
  }

  async stopCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; capturedApi: import("./types").CapturedApi[] | undefined; message: string }> {
    const key = `${mode}::${instanceId}`;
    const capture = this.persistentCaptures.get(key);
    if (!capture) {
      return { ok: false, capturedApi: undefined, message: `No active capture on ${key}. Start one with 'session capture-start'.` };
    }
    capture.stop();
    this.persistentCaptures.delete(key);
    const capturedApi = capture.getResults();
    const total = capturedApi.reduce((n, a) => n + a.endpoints.length, 0);
    return { ok: true, capturedApi, message: `Capture stopped. ${total} endpoints across ${capturedApi.length} domain(s).` };
  }

  /** Extract all cookies from the browser context via CDP — includes HttpOnly/Secure.
   *  No JS sandbox restrictions. Pass urls to scope (e.g. ['https://youtube.com']). */
  async getCookies(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; cookies: any[]; message: string }> {
    const { context } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0
      ? await context.cookies(urls)
      : await context.cookies();
    return { ok: true, cookies, message: `${cookies.length} cookies extracted via CDP.` };
  }

  /** Extract cookies + localStorage + sessionStorage in one shot. */
  async getFullAuth(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; cookies: any[]; localStorage: Record<string, Record<string, string>>; sessionStorage: Record<string, Record<string, string>>; message: string }> {
    const { context, page } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0
      ? await context.cookies(urls)
      : await context.cookies();

    const localStorage: Record<string, Record<string, string>> = {};
    const sessionStorage: Record<string, Record<string, string>> = {};
    try {
      const stores = await page.evaluate(() => {
        const ls: Record<string, string> = {};
        const ss: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)!;
          ls[k] = window.localStorage.getItem(k) ?? "";
        }
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i)!;
          ss[k] = window.sessionStorage.getItem(k) ?? "";
        }
        return { origin: window.location.origin, ls, ss };
      });
      localStorage[stores.origin] = stores.ls;
      sessionStorage[stores.origin] = stores.ss;
    } catch {}

    return {
      ok: true,
      cookies,
      localStorage,
      sessionStorage,
      message: `${cookies.length} cookies, ${Object.values(localStorage).reduce((n, s) => n + Object.keys(s).length, 0)} localStorage keys, ${Object.values(sessionStorage).reduce((n, s) => n + Object.keys(s).length, 0)} sessionStorage keys.`,
    };
  }

  /** Check if any browser is alive and connected (across all named instances). */
  browserHealth(): { alive: boolean; modes: string[] } {
    const modes = this.daemon.runningModes();
    return { alive: modes.length > 0, modes };
  }

  /** Kill all browser instances and reset state. Next execute call will
   *  launch a fresh browser automatically — no manual restart needed. */
  async restartBrowser(): Promise<{ killed: string[]; message: string }> {
    const health = this.browserHealth();
    await this.daemon.stopAll(true); // crash-recovery hammer: kill even busy instances
    await sessionManager.cleanupAllSessions();
    return {
      killed: health.modes,
      message: health.modes.length > 0
        ? `Killed browser(s): ${health.modes.join(", ")}. Next execute call will launch a fresh instance.`
        : "No browsers were running. Next execute call will launch fresh.",
    };
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
    const normalizedDomain = normalizeDomain(credential.domain);
    const data = {
      ...credential,
      domain: normalizedDomain,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const encrypted = encrypt(JSON.stringify(data), credKey);
    await this.store.setCredential(userId, normalizedDomain, encrypted);
  }

  async getCredential(userId: string, token: string, domain: string): Promise<Credential | null> {
    const credKey = await deriveKey(token, "credentials");
    // Try the full hostname first, then walk up the parent domains so
    // `auth.figma.com` resolves to credentials stored under `figma.com`.
    for (const candidate of domainLookupChain(domain)) {
      const blob = await this.store.getCredential(userId, candidate);
      if (blob && blob.length > 0) {
        try {
          return JSON.parse(decrypt(blob, credKey));
        } catch (err) {
          // Row exists but decrypt failed — encryption key changed since
          // the blob was written. Surface an actionable error rather than
          // the raw AES-GCM complaint.
          throw new Error(
            `Credentials for ${candidate} exist but cannot be decrypted. ` +
            `The encryption key has changed. Re-store with: ` +
            `iframer-toolkit credentials add ${candidate}`
          );
        }
      }
    }
    return null;
  }

  async listCredentials(userId: string): Promise<string[]> {
    return this.store.listCredentialDomains(userId);
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    await this.store.deleteCredential(userId, normalizeDomain(domain));
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
    // Walk the parent-domain chain so "auth.figma.com" finds creds stored under "figma.com"
    let blob: Buffer | null = null;
    for (const candidate of domainLookupChain(domain)) {
      const b = await this.store.getCredential(userId, candidate);
      if (b && b.length > 0) { blob = b; break; }
    }
    if (!blob) {
      const stored = await this.store.listCredentialDomains(userId);
      return { ok: false, url: "", title: "", error: `No credentials stored for ${normalizeDomain(domain)}. Stored: ${stored.join(", ") || "(none)"}` };
    }

    const credential = JSON.parse(decrypt(blob, credKey));
    const page = session.page;
    sessionManager.resetTimeout(userId);

    if (selectors.username && credential.username) {
      await humanType(page, selectors.username, credential.username);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.password && credential.password) {
      await humanType(page, selectors.password, credential.password);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.submit) {
      await humanClick(page, selectors.submit);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
    }
    if (selectors.totp && credential.totp_secret) {
      const totp = generateTOTP(credential.totp_secret);
      await page.click(selectors.totp);
      await page.keyboard.type(totp, { delay: 50 });
      await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
    }

    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `login-${Date.now()}.jpg`, this.screenshotDir, this.publicUrl);

    return { ok: true, url: page.url(), title: await page.title(), screenshotUrl };
  }

  // ─── Session Data ─────────────────────────────────────────────────

  async clearSession(userId: string): Promise<void> {
    await this.store.deleteSession(userId);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.daemon.stopAll(true);
    await closeBrowser();
    await sessionManager.cleanupAllSessions();
    // Close SQLite if the store supports it
    if ("close" in this.store && typeof (this.store as StorageBackend & { close?: () => void }).close === "function") {
      (this.store as StorageBackend & { close: () => void }).close();
    }
  }
}
