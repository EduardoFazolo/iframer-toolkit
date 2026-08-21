// connectOverCDP is used ONLY for extension mode. patchright (a stealth fork)
// deliberately breaks connectOverCDP, so we use stock playwright-core for it —
// its Page is API-compatible with patchright's, so the handlers work unchanged.
// NOTE: this WS transport requires the server to run under node, not bun.
import { chromium as cdpChromium } from "playwright-core";
import type { Page as PatchrightPage } from "patchright";
import type { Pipeline, PipelineResult, BrowserMode, SessionStartOptions } from "../types";
import type { StorageBackend } from "../storage";
import type { SessionData } from "../session/persistence";
import type { RefStore } from "./ref-store";
import { BrowserDaemon, DEFAULT_INSTANCE } from "../browser/daemon";
import { DomainModeStore } from "../domain-modes";
import { PipelineRunner } from "../pipeline";
import * as sessionManager from "../browser/session-manager";
import { deriveKey, encrypt, decrypt } from "../auth/crypto";
import { extractSession, injectCookies } from "../session/persistence";
import { detectBlock } from "../block-detection";
import { extractKnowledgeFromRun } from "../knowledge/extract-from-run";
import { capturePageState } from "../page-state";
import { sessionStoreKey } from "./config";
import { getErrorMessage } from "../errors";
import { createLogger } from "../logger";
import { CdpRelay } from "../extension/cdp-relay";

const log = createLogger("iframer");

export interface PipelineExecutorDeps {
  daemon: BrowserDaemon;
  store: StorageBackend;
  domainModes: DomainModeStore;
  refStore: RefStore;
  availableModes: () => BrowserMode[];
  startSession: (userId: string, token: string, options: SessionStartOptions) => Promise<{ noVncUrl: string; wsPort: number }>;
}

/**
 * Owns pipeline execution across the three browser modes plus the auto-
 * escalation ladder. Extracted from Iframer; the elicitOtp hook lives here
 * because it's consumed only on the local execution path.
 */
export class PipelineExecutor {
  /** Runtime elicitation hook, set per-call via execute(). Consumed once by
   *  executeLocal and immediately cleared. */
  private pendingElicitOtp?: (domain: string) => Promise<string | null>;

  constructor(private deps: PipelineExecutorDeps) {}

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

    // Extension mode: drive the user's real tab through iframer's full pipeline
    // via a CDP relay. Bypasses launch, escalation, and session inject/extract
    // (the real profile owns auth).
    if (typeof opts.extensionTabId === "number") {
      return this.executeExtension(userId, token, pipeline, opts.extensionTabId, opts.clientId);
    }

    const forcedMode = opts.mode;
    const autoEscalate = opts.autoEscalate !== false;
    const instanceId = opts.instanceId || DEFAULT_INSTANCE;

    // Extract domain from first navigate step for mode memory
    const firstNav = pipeline.steps.find((s) => s.type === "navigate");
    const domain = firstNav ? new URL(firstNav.url).hostname : null;

    const availableModes = this.deps.availableModes();

    // Pick starting mode
    let mode: BrowserMode;
    if (forcedMode && availableModes.includes(forcedMode)) {
      mode = forcedMode;
    } else if (domain) {
      mode = this.deps.domainModes.getBestMode(domain, availableModes);
    } else {
      mode = availableModes[0] || "headless";
    }

    let result = await this.executeWithMode(userId, token, pipeline, mode, instanceId);

    // Auto-escalation: if blocked and autoEscalate is on, try next mode
    if (!result.ok && autoEscalate && domain && result.error?.errorType === "bot-blocked") {
      const failedMode = mode;
      if (domain) this.deps.domainModes.recordFailure(domain, failedMode, result.error?.message || "blocked");

      const nextMode = this.deps.domainModes.getNextMode(failedMode, availableModes);
      if (nextMode) {
        log.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);

        if (failedMode !== "docker-headful") {
          await this.deps.daemon.stopMode(failedMode, instanceId);
        }

        result = await this.executeWithMode(userId, token, pipeline, nextMode, instanceId);
        result.modeEscalated = true;
        result.modeUsed = nextMode;

        if (result.ok && domain) {
          this.deps.domainModes.recordSuccess(domain, nextMode);
        } else if (!result.ok && domain && result.error?.errorType === "bot-blocked") {
          this.deps.domainModes.recordFailure(domain, nextMode, result.error?.message || "blocked");

          const thirdMode = this.deps.domainModes.getNextMode(nextMode, availableModes);
          if (thirdMode) {
            log.info(`Auto-escalating from ${nextMode} to ${thirdMode} for ${domain}`);
            if (nextMode !== "docker-headful") {
              await this.deps.daemon.stopMode(nextMode, instanceId);
            }
            result = await this.executeWithMode(userId, token, pipeline, thirdMode, instanceId);
            result.modeEscalated = true;
            result.modeUsed = thirdMode;

            if (result.ok && domain) {
              this.deps.domainModes.recordSuccess(domain, thirdMode);
            }
          }
        }
      }
    } else if (result.ok && domain) {
      this.deps.domainModes.recordSuccess(domain, mode);
    }

    return result;
  }

  private async executeWithMode(userId: string, token: string, pipeline: Pipeline, mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<PipelineResult> {
    if (mode === "docker-headful") {
      return this.executeDocker(userId, token, pipeline);
    }
    return this.executeLocal(userId, token, pipeline, mode, instanceId);
  }

  /** Execute against the user's real Chrome tab via the extension CDP relay,
   *  using the SAME PipelineRunner as every other mode. No session inject/extract
   *  (the real profile owns auth) and no escalation (can't escalate a live tab). */
  private async executeExtension(
    userId: string,
    token: string,
    pipeline: Pipeline,
    tabId: number,
    clientId?: string,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const relay = new CdpRelay(tabId, clientId);
    let browser: Awaited<ReturnType<typeof cdpChromium.connectOverCDP>> | undefined;
    try {
      await relay.start();
      browser = await cdpChromium.connectOverCDP(relay.httpEndpoint(), { timeout: 30_000 });
      const context = browser.contexts()[0];
      if (!context) throw new Error("no CDP browser context for the tab");
      let page = context.pages()[0];
      if (!page) {
        page = (await context
          .waitForEvent("page", { timeout: 5_000 })
          .catch(() => undefined)) as typeof page;
      }
      if (!page) throw new Error("no page available for the tab (is it still open?)");

      const ctx = this.deps.refStore.makeContext(userId, token);
      if (this.pendingElicitOtp) ctx.elicitOtp = this.pendingElicitOtp;
      const runner = new PipelineRunner(ctx);
      // playwright-core Page ≡ patchright Page at runtime (same API).
      const result = await runner.run(page as unknown as PatchrightPage, pipeline);
      this.deps.refStore.sync(userId, ctx);
      result.modeUsed = "extension" as BrowserMode;

      // Learn from the run — real profile owns cookies, so no sessionData.
      if (result.ok) {
        try {
          extractKnowledgeFromRun(pipeline, result, null, "extension" as unknown as BrowserMode);
        } catch (e) {
          log.warn(`knowledge update failed: ${getErrorMessage(e)}`);
        }
      }
      return result;
    } catch (err) {
      return {
        ok: false,
        completedSteps: 0,
        totalSteps: pipeline.steps.length,
        results: [],
        finalState: { url: "", title: "" },
        obstacles: [],
        durationMs: Date.now() - startTime,
        modeUsed: "extension" as BrowserMode,
        error: {
          failedAtStep: 0,
          failedStep: pipeline.steps[0],
          errorType: "action-failed",
          message: `Extension mode failed: ${getErrorMessage(err)}`,
          pageState: { url: "", title: "" },
          suggestion:
            "Ensure the iframer extension is connected (green dot) and the tab is still open. See chrome://extensions.",
          retryable: true,
        },
      };
    } finally {
      try {
        if (browser) await browser.close();
      } catch {
        /* connectOverCDP close just disconnects */
      }
      try {
        await relay.stop();
      } catch {
        /* best-effort teardown */
      }
    }
  }

  /** Execute via Docker session-manager. */
  private async executeDocker(userId: string, token: string, pipeline: Pipeline): Promise<PipelineResult> {
    let session = sessionManager.getSession(userId);
    if (!session) {
      const firstNav = pipeline.steps.find((s) => s.type === "navigate");
      await this.deps.startSession(userId, token, firstNav ? { url: firstNav.url } : {});
      session = sessionManager.getSession(userId)!;
    }

    sessionManager.resetTimeout(userId);

    const ctx = this.deps.refStore.makeContext(userId, token);
    const runner = new PipelineRunner(ctx);
    const result = await runner.run(session.page, pipeline);

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

    this.deps.refStore.sync(userId, ctx);
    result.modeUsed = "docker-headful";
    return result;
  }

  /** Execute via local Chrome daemon (headless + binary-headful). */
  private async executeLocal(userId: string, token: string, pipeline: Pipeline, mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<PipelineResult> {
    const startTime = Date.now();

    let acquired = false;
    try {
      const { page } = await this.deps.daemon.ensure(mode, instanceId);
      // Mark busy so the idle timer can't kill the browser mid-pipeline
      this.deps.daemon.acquire(mode, instanceId);
      acquired = true;

      // Load stored session (cookies + localStorage + sessionStorage).
      const storeKey = sessionStoreKey(userId, instanceId);
      const encryptionKey = await deriveKey(token);
      const blob = await this.deps.store.getSession(storeKey);
      let sessionData: SessionData | null = null;
      if (blob && blob.length > 0) {
        try {
          sessionData = JSON.parse(decrypt(blob, encryptionKey)) as SessionData;
          await injectCookies(page.context(), sessionData);
        } catch {}
      }

      // Run pipeline. navigate re-injects localStorage/sessionStorage per origin.
      const ctx = this.deps.refStore.makeContext(userId, token);
      if (sessionData) ctx.sessionData = sessionData;
      if (this.pendingElicitOtp) ctx.elicitOtp = this.pendingElicitOtp;
      const runner = new PipelineRunner(ctx);
      const result = await runner.run(page, pipeline);

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
          await this.deps.store.setSession(storeKey, encrypted);
        } catch {}
      }

      // Update per-domain knowledge cache after successful runs.
      if (result.ok) {
        try {
          extractKnowledgeFromRun(pipeline, result, updatedSession, mode);
        } catch (err) {
          log.warn(`knowledge update failed: ${getErrorMessage(err)}`);
        }
      }

      this.deps.refStore.sync(userId, ctx);
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
      if (acquired) this.deps.daemon.release(mode, instanceId);
    }
  }
}
