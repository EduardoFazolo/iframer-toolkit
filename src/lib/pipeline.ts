import type { Page } from "patchright";
import type {
  Pipeline,
  PipelineResult,
  PipelineStep,
  StepResult,
  PageState,
  ObstacleEncounter,
  ErrorContext,
  ExecutionContext,
} from "./types";
import { executeAction } from "./actions/registry";
import { failedStepResult } from "./actions/types";
import { StaleStateMonitor, StaleStateError } from "./stale-monitor";
import { detectObstacles, resolveObstacle } from "./obstacles";
import { saveScreenshot } from "./screenshot";
import { capturePageState } from "./page-state";
import { ApiCapture } from "./api-capture";
import { TabTracker } from "./browser/tab-tracker";
import { TIMEOUTS } from "./constants";

const DEFAULT_STALE_TIMEOUT_MS = 20_000;

function safePageUrl(page: Page): string {
  try { return page.url(); } catch { return ""; }
}

function classifyError(err: Error, step: PipelineStep): ErrorContext["errorType"] {
  if (err instanceof StaleStateError) return "stale-state";
  const msg = err.message.toLowerCase();
  // A login step that can't find a password field in a headless-type context
  // almost always means the site detected the headless browser and is
  // showing a wall/captcha/different page. Classify as bot-blocked so the
  // execute auto-escalation ladder kicks in (headless → binary-headful).
  if (step.type === "login" && (msg.includes("no visible password field") || msg.includes("password field was not visible"))) {
    return "bot-blocked";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("not found") || msg.includes("no element") || msg.includes("waiting for selector")) return "element-not-found";
  if (msg.includes("navigation") || msg.includes("net::err")) return "navigation-failed";
  if (step.type === "solve-captcha") return "captcha-unsolvable";
  return "action-failed";
}

function isRetryable(errorType: ErrorContext["errorType"]): boolean {
  return errorType === "stale-state" || errorType === "timeout" || errorType === "element-not-found";
}

function getSuggestion(errorType: ErrorContext["errorType"], step: PipelineStep): string | undefined {
  switch (errorType) {
    case "stale-state":
      return "The page stopped responding. The step may have triggered a very slow load or the server may be unreachable.";
    case "element-not-found":
      return `Selector not found. The page structure may have changed. Take a screenshot to inspect the current state.`;
    case "navigation-failed":
      return "Navigation failed. The URL may be unreachable, blocked, or require authentication.";
    case "captcha-unsolvable":
      return "Automatic reCAPTCHA solving failed. The challenge may require human intervention.";
    case "timeout":
      return "Operation timed out. The page may be slow or the element may not appear.";
    default:
      return undefined;
  }
}

export class PipelineRunner {
  constructor(private ctx: ExecutionContext) {}

  async run(initialPage: Page, pipeline: Pipeline): Promise<PipelineResult> {
    // The tracker is the single source of truth for the active page: it follows
    // tabs opened mid-run so later steps don't keep driving a frozen original
    // page (the cause of the new-tab stale-state failures). Scoped to this run;
    // dispose() in finally is REQUIRED — the daemon reuses the context, so an
    // undisposed 'page' listener would leak across runs.
    const tracker = new TabTracker(initialPage.context(), initialPage);
    try {
      return await this.runSteps(initialPage, tracker, pipeline);
    } finally {
      tracker.dispose();
    }
  }

  private async runSteps(initialPage: Page, tracker: TabTracker, pipeline: Pipeline): Promise<PipelineResult> {
    const startTime = Date.now();
    const opts = pipeline.options || {};
    const staleTimeoutMs = opts.staleTimeoutMs ?? this.ctx.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    const continueOnObstacle = opts.continueOnObstacle ?? true;
    const screenshotAfterEach = opts.screenshotAfterEach ?? false;
    const continueOnError = opts.continueOnError ?? false;

    const results: StepResult[] = [];
    const obstacles: ObstacleEncounter[] = [];

    // API capture — hook network events when enabled. Bound to the initial page;
    // capturing traffic from followed tabs is a separate follow-up.
    const capture = opts.captureApi ? new ApiCapture(initialPage) : null;
    if (capture) capture.start();

    const finishCapture = async () => {
      if (!capture) return undefined;
      capture.stop();
      return capture.getResults();
    };

    for (let i = 0; i < pipeline.steps.length; i++) {
      if (capture) capture.setStep(i);
      const step = pipeline.steps[i];
      const page = tracker.active();
      const urlBefore = safePageUrl(page);
      const monitor = new StaleStateMonitor(page, staleTimeoutMs);

      let stepResult: StepResult;

      try {
        stepResult = await monitor.withMonitoring(async () => {
          const r = await executeAction(page, step, this.ctx, monitor);
          r.stepIndex = i;
          return r;
        });
      } catch (err: unknown) {
        // StaleStateError or other wrapper errors
        const asError = err instanceof Error ? err : new Error(String(err));
        const errorType = classifyError(asError, step);
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });

        stepResult = failedStepResult(step, asError.message, Date.now() - startTime, i);

        results.push(stepResult);

        return {
          ok: false,
          completedSteps: i,
          totalSteps: pipeline.steps.length,
          results,
          obstacles,
          finalState: pageState,
          error: {
            failedAtStep: i,
            failedStep: step,
            errorType,
            message: asError.message,
            pageState,
            suggestion: getSuggestion(errorType, step),
            retryable: isRetryable(errorType),
          },
          durationMs: Date.now() - startTime,
          capturedApi: await finishCapture(),
        };
      }

      // Follow a NEW tab only when a click opened one AND the clicked page did
      // NOT itself navigate. That distinguishes a genuine target=_blank (feed
      // stays, article opens in a new tab → follow) from a form submit that
      // navigates the page and incidentally spawns a popup/ad, or any tab opened
      // by a non-click step like `login` (must never hijack the flow → discard).
      const canOpenTab = step.type === "click" || step.type === "human-click";
      const currentPageNavigated = safePageUrl(page) !== urlBefore;
      if (canOpenTab && !currentPageNavigated) {
        const switched = await tracker.settle({
          waitForPendingMs: TIMEOUTS.TAB_FOLLOW_SETTLE,
          loadTimeoutMs: TIMEOUTS.TAB_LOAD,
          blankResolveMs: TIMEOUTS.TAB_BLANK_RESOLVE,
        });
        if (switched) stepResult.tabSwitchedTo = switched.url;
      } else {
        tracker.discardPending();
      }

      // Capture per-step screenshot if requested (of the now-active page)
      if (screenshotAfterEach && stepResult.ok) {
        try {
          const buf = await tracker.active().screenshot({ type: "jpeg", quality: 50, fullPage: false });
          stepResult.screenshotUrl = saveScreenshot(
            buf,
            `step-${i}-${Date.now()}.jpg`,
            this.ctx.screenshotDir,
            this.ctx.publicUrl
          );
        } catch {}
      }

      results.push(stepResult);

      // If step failed and not continueOnError, build error context and return
      if (!stepResult.ok && !continueOnError) {
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        const errorType = classifyError(new Error(stepResult.error || ""), step);

        return {
          ok: false,
          completedSteps: i,
          totalSteps: pipeline.steps.length,
          results,
          obstacles,
          finalState: pageState,
          error: {
            failedAtStep: i,
            failedStep: step,
            errorType,
            message: stepResult.error || "Step failed",
            pageState,
            suggestion: getSuggestion(errorType, step),
            retryable: isRetryable(errorType),
          },
          durationMs: Date.now() - startTime,
          capturedApi: await finishCapture(),
        };
      }

      // After navigate steps, check for obstacles (on the active page)
      if (step.type === "navigate" && continueOnObstacle) {
        const obstacleStart = Date.now();
        const obstaclePage = tracker.active();
        const obstacle = await detectObstacles(obstaclePage);

        if (obstacle) {
          const resolution = await resolveObstacle(obstaclePage, obstacle, this.ctx, monitor);
          obstacles.push({
            type: obstacle.type,
            detectedAtStep: i,
            resolved: resolution.resolved,
            resolution: resolution.resolution,
            durationMs: Date.now() - obstacleStart,
          });

          if (!resolution.resolved && obstacle.type === "captcha") {
            // Unresolvable captcha — stop pipeline with helpful context
            const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
            return {
              ok: false,
              completedSteps: i,
              totalSteps: pipeline.steps.length,
              results,
              obstacles,
              finalState: pageState,
              error: {
                failedAtStep: i,
                failedStep: step,
                errorType: "obstacle-unresolvable",
                message: `Obstacle detected (${obstacle.type}) but could not be resolved: ${resolution.error}`,
                pageState,
                suggestion: getSuggestion("captcha-unsolvable", step),
                retryable: true,
              },
              durationMs: Date.now() - startTime,
              capturedApi: await finishCapture(),
            };
          }
        }
      }
    }

    const capturedApi = await finishCapture();
    const finalState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });

    return {
      ok: true,
      completedSteps: pipeline.steps.length,
      totalSteps: pipeline.steps.length,
      results,
      obstacles,
      finalState,
      durationMs: Date.now() - startTime,
      capturedApi,
    };
  }
}
