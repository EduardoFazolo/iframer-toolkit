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
import { executeAction } from "./actions";
import { StaleStateMonitor, StaleStateError } from "./stale-monitor";
import { detectObstacles, resolveObstacle } from "./obstacles";
import { saveScreenshot } from "./screenshot";
import { ApiCapture } from "./api-capture";

const DEFAULT_STALE_TIMEOUT_MS = 20_000;

async function getPageState(page: Page, ctx: ExecutionContext, withScreenshot = false): Promise<PageState> {
  const url = page.url();
  const title = await page.title().catch(() => "");

  if (!withScreenshot) {
    return { url, title };
  }

  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `state-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
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

  async run(page: Page, pipeline: Pipeline): Promise<PipelineResult> {
    const startTime = Date.now();
    const opts = pipeline.options || {};
    const staleTimeoutMs = opts.staleTimeoutMs ?? this.ctx.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    const continueOnObstacle = opts.continueOnObstacle ?? true;
    const screenshotAfterEach = opts.screenshotAfterEach ?? false;
    const continueOnError = opts.continueOnError ?? false;

    const results: StepResult[] = [];
    const obstacles: ObstacleEncounter[] = [];

    // API capture — hook network events when enabled
    const capture = opts.captureApi ? new ApiCapture(page) : null;
    if (capture) capture.start();

    const finishCapture = () => {
      if (!capture) return undefined;
      capture.stop();
      return capture.getResults();
    };

    for (let i = 0; i < pipeline.steps.length; i++) {
      if (capture) capture.setStep(i);
      const step = pipeline.steps[i];
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
        const pageState = await getPageState(page, this.ctx, true);

        stepResult = {
          stepIndex: i,
          step,
          ok: false,
          error: asError.message,
          durationMs: Date.now() - startTime,
        };

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
          capturedApi: finishCapture(),
        };
      }

      // Capture per-step screenshot if requested
      if (screenshotAfterEach && stepResult.ok) {
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
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
        const pageState = await getPageState(page, this.ctx, true);
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
          capturedApi: finishCapture(),
        };
      }

      // After navigate steps, check for obstacles
      if (step.type === "navigate" && continueOnObstacle) {
        const obstacleStart = Date.now();
        const obstacle = await detectObstacles(page);

        if (obstacle) {
          const resolution = await resolveObstacle(page, obstacle, this.ctx, monitor);
          obstacles.push({
            type: obstacle.type,
            detectedAtStep: i,
            resolved: resolution.resolved,
            resolution: resolution.resolution,
            durationMs: Date.now() - obstacleStart,
          });

          if (!resolution.resolved && obstacle.type === "captcha") {
            // Unresolvable captcha — stop pipeline with helpful context
            const pageState = await getPageState(page, this.ctx, true);
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
              capturedApi: finishCapture(),
            };
          }
        }
      }
    }

    // All steps done
    const finalState = await getPageState(page, this.ctx, true);

    return {
      ok: true,
      completedSteps: pipeline.steps.length,
      totalSteps: pipeline.steps.length,
      results,
      obstacles,
      finalState,
      durationMs: Date.now() - startTime,
      capturedApi: finishCapture(),
    };
  }
}
