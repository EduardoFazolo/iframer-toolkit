import path from "path";
import { fileURLToPath } from "url";
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
  BrowserMode,
  ModeAvailability,
} from "./types";
import * as sessionManager from "./browser/session-manager";
import { closeBrowser } from "./browser/launcher";
import { deriveKey, encrypt, decrypt } from "./auth/crypto";
import { extractSession, injectCookies, injectStorage } from "./session/persistence";
import type { SessionData } from "./session/persistence";
import { saveScreenshot } from "./screenshot";
import { createStore, type StorageBackend } from "./storage";
import { BrowserDaemon, DEFAULT_INSTANCE } from "./browser/daemon";
import { DomainModeStore } from "./domain-modes";
import { checkModeAvailability } from "./browser/cdp-launcher";
import { TIMEOUTS } from "./constants";
import { createLogger } from "./logger";
import { getErrorMessage } from "./errors";
import type { ExecutionConfig } from "./execution/config";
import { sessionStoreKey } from "./execution/config";
import { RefStore } from "./execution/ref-store";
import { PipelineExecutor } from "./execution/pipeline-executor";
import { FetchService } from "./execution/fetch-service";
import { CaptureManager } from "./execution/capture-manager";
import { CredentialStore } from "./auth/credential-store";

const log = createLogger("iframer");

const DEFAULT_SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.screenshots");
const DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
const DEFAULT_STALE_TIMEOUT_MS = 20_000;

/**
 * Facade over iframer's subsystems. Owns the shared collaborators (store,
 * daemon, domain-mode memory) and delegates each capability to a focused
 * service: pipeline execution, one-shot fetch, capture, and credentials.
 */
export class Iframer {
  private store: StorageBackend;
  private daemon: BrowserDaemon;
  private domainModes: DomainModeStore;
  private operatingMode: "docker" | "local";
  private config: ExecutionConfig;

  private refStore: RefStore;
  private executor: PipelineExecutor;
  private fetchService: FetchService;
  private captureManager: CaptureManager;
  private credentials: CredentialStore;

  constructor(config: IframerConfig = {}) {
    this.config = {
      screenshotDir: config.screenshotDir || DEFAULT_SCREENSHOT_DIR,
      publicUrl: config.publicUrl || DEFAULT_PUBLIC_URL,
      staleTimeoutMs: config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS,
    };

    // Storage: SQLite in data directory (honors IFRAMER_DATA_DIR for Docker bind-mount)
    this.store = createStore({ dataDir: config.dataDir });
    // Browser daemon for local modes (headless + binary-headful)
    this.daemon = new BrowserDaemon(config.sessionTimeoutMs);
    // Domain mode memory
    this.domainModes = new DomainModeStore();
    // Operating mode — Docker session-manager vs local daemon
    this.operatingMode = config.mode || "local";

    this.refStore = new RefStore(this.store, this.config);
    this.fetchService = new FetchService(this.store);
    this.captureManager = new CaptureManager(this.daemon);
    this.credentials = new CredentialStore(this.store, this.config);
    this.executor = new PipelineExecutor({
      daemon: this.daemon,
      store: this.store,
      domainModes: this.domainModes,
      refStore: this.refStore,
      availableModes: () => this.getAvailableModes(),
      startSession: (userId, token, options) => this.startSession(userId, token, options),
    });
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

  fetch(userId: string | null, token: string | null, request: FetchRequest): Promise<FetchResult> {
    return this.fetchService.fetch(userId, token, request);
  }

  // ─── Pipeline Execution ──────────────────────────────────────────

  execute(
    userId: string,
    token: string,
    pipeline: Pipeline,
    runtime?: { elicitOtp?: (domain: string) => Promise<string | null> }
  ): Promise<PipelineResult> {
    return this.executor.execute(userId, token, pipeline, runtime);
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
            await this.store.setSession(sessionStoreKey(userId, inst.instanceId), encrypted);
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

  // ─── Persistent Capture / Auth extraction ────────────────────────

  startCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE) {
    return this.captureManager.startCapture(mode, instanceId);
  }

  stopCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE) {
    return this.captureManager.stopCapture(mode, instanceId);
  }

  getCookies(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE) {
    return this.captureManager.getCookies(mode, urls, instanceId);
  }

  getFullAuth(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE) {
    return this.captureManager.getFullAuth(mode, urls, instanceId);
  }

  // ─── Browser health / lifecycle ──────────────────────────────────

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
    const screenshotUrl = saveScreenshot(buf, `screenshot-${Date.now()}.jpg`, this.config.screenshotDir, this.config.publicUrl);

    return {
      screenshotUrl,
      url: session.page.url(),
      title: await session.page.title(),
    };
  }

  // ─── Credentials ─────────────────────────────────────────────────

  storeCredential(userId: string, token: string, credential: CredentialInput): Promise<void> {
    return this.credentials.storeCredential(userId, token, credential);
  }

  getCredential(userId: string, token: string, domain: string): Promise<Credential | null> {
    return this.credentials.getCredential(userId, token, domain);
  }

  listCredentials(userId: string): Promise<string[]> {
    return this.credentials.listCredentials(userId);
  }

  deleteCredential(userId: string, domain: string): Promise<void> {
    return this.credentials.deleteCredential(userId, domain);
  }

  loginWithCredentials(
    userId: string,
    token: string,
    domain: string,
    selectors: { username?: string; password?: string; submit?: string; totp?: string }
  ) {
    return this.credentials.loginWithCredentials(userId, token, domain, selectors);
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
