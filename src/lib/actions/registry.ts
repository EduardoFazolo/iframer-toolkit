import type { Page } from "patchright";
import type { PipelineStep, ExecutionContext } from "../types";
import type { StaleStateMonitor } from "../stale-monitor";
import { getErrorMessage } from "../errors";
import {
  type StepHandler,
  type StepHandlerRegistry,
  type StepResult,
  type StepResultMap,
  failedStepResult,
} from "./types";
import * as nav from "./handlers/navigation";
import { find } from "./handlers/find";
import { screenshot, snapshot } from "./handlers/screenshot";
import * as captcha from "./handlers/captcha";
import { login } from "./handlers/login";

/**
 * Every step type → its handler. Typed `satisfies StepHandlerRegistry`, so
 * omitting a handler or giving one the wrong signature is a COMPILE error —
 * this is the exhaustiveness guarantee that replaced the old `default: never`.
 */
const registry = {
  navigate: nav.navigate,
  click: nav.click,
  fill: nav.fill,
  "human-click": nav.humanClickStep,
  "right-click": nav.rightClick,
  "human-type": nav.humanTypeStep,
  evaluate: nav.evaluate,
  extract: nav.extract,
  wait: nav.wait,
  "wait-for": nav.waitFor,
  scroll: nav.scroll,
  keyboard: nav.keyboard,
  read: nav.read,
  upload: nav.upload,
  paste: nav.paste,
  download: nav.download,
  "type-code": nav.typeCode,
  find,
  screenshot,
  snapshot,
  login,
  "solve-captcha": captcha.solveCaptcha,
  "recaptcha-click": captcha.recaptchaClick,
  "recaptcha-select": captcha.recaptchaSelect,
  "recaptcha-verify": captcha.recaptchaVerify,
  "recaptcha-info": captcha.recaptchaInfo,
  "recaptcha-solve": captcha.recaptchaSolve,
  "recaptcha-answer": captcha.recaptchaAnswer,
} satisfies StepHandlerRegistry;

/** Exposed for tests: the set of step types the registry can dispatch. */
export const registeredStepTypes = Object.keys(registry) as PipelineStep["type"][];

/**
 * Execute one pipeline step by dispatching to its registered handler.
 * `stepIndex` is set to -1 here; the caller (PipelineRunner) overwrites it.
 */
export async function executeAction(
  page: Page,
  step: PipelineStep,
  ctx: ExecutionContext,
  monitor?: StaleStateMonitor
): Promise<StepResult> {
  const start = Date.now();
  try {
    // TS cannot correlate a union-typed `step` with the indexed handler's
    // parameter type, so this is the single contained assertion for dispatch.
    const handler = registry[step.type] as StepHandler<PipelineStep, StepResultMap[PipelineStep["type"]]>;
    const result = await handler(page, step, ctx, monitor);
    // Union-widening on construction (step is the union here) requires one cast.
    return { stepIndex: -1, step, ok: true, result, durationMs: Date.now() - start } as StepResult;
  } catch (err: unknown) {
    return failedStepResult(step, getErrorMessage(err), Date.now() - start);
  }
}
