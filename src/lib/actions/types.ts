import type { Page } from "patchright";
import type { PipelineStep, ExecutionContext } from "../types";
import type { StaleStateMonitor } from "../stale-monitor";
import type {
  clickRecaptchaCheckbox,
  clickChallengeTiles,
  clickChallengeVerify,
  getChallengeInfo,
} from "../browser/humanize";
import type { solveRecaptcha } from "../captcha/recaptcha";
import type { solveHCaptcha } from "../captcha/hcaptcha";

// ─── Per-step result shapes ─────────────────────────────────────────

export interface FindResult {
  ref: string;
  role: string;
  name: string;
  tag: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  matchCount: number;
}

export interface LoginResult {
  loggedIn: boolean;
  url: string;
  alreadyLoggedIn?: boolean;
  emailSubmitted?: boolean;
  reason?: string;
  changedUrl?: boolean;
  passwordFieldRemains?: boolean;
}

export interface ChallengeTile {
  index: number;
  image: string | null;
}

export interface ChallengePresentation {
  solved: boolean;
  prompt?: string;
  rows?: number;
  cols?: number;
  tiles?: ChallengeTile[];
}

/** solveRecaptcha and solveHCaptcha both return their module's SolveResult. */
export type CaptchaSolveResult =
  | Awaited<ReturnType<typeof solveRecaptcha>>
  | Awaited<ReturnType<typeof solveHCaptcha>>;

/**
 * Maps every PipelineStep type to the concrete shape its handler returns.
 * `void` = side-effect-only step (no meaningful result). `unknown` is kept
 * ONLY for evaluate/extract, whose output is a caller-supplied JS expression
 * and is genuinely opaque. Captcha result types are derived from the humanize
 * functions so they can never drift.
 */
export interface StepResultMap {
  navigate: void;
  click: void;
  fill: void;
  select: void;
  "human-click": void;
  "right-click": void;
  "human-type": void;
  evaluate: unknown;
  extract: unknown;
  wait: void;
  "wait-for": void;
  scroll: void;
  keyboard: void;
  read: { text: string; truncated?: boolean };
  upload: { uploaded: number; files: string[] };
  paste: { pasted: number };
  download: { path: string; size: number; status: number };
  "type-code": { typed: number };
  login: LoginResult;
  "solve-captcha": CaptchaSolveResult;
  screenshot: { screenshotUrl: string; refs?: string };
  snapshot: { elementCount: number; snapshot: string };
  find: FindResult;
  "recaptcha-click": Awaited<ReturnType<typeof clickRecaptchaCheckbox>>;
  "recaptcha-select": Awaited<ReturnType<typeof clickChallengeTiles>>;
  "recaptcha-verify": Awaited<ReturnType<typeof clickChallengeVerify>>;
  "recaptcha-info": Awaited<ReturnType<typeof getChallengeInfo>>;
  "recaptcha-solve": ChallengePresentation;
  "recaptcha-answer": ChallengePresentation;
}

export type StepHandler<TStep extends PipelineStep, TResult> = (
  page: Page,
  step: TStep,
  ctx: ExecutionContext,
  monitor?: StaleStateMonitor
) => Promise<TResult>;

/**
 * The registry type. Because it is a mapped type over every PipelineStep
 * variant, omitting a handler for any of the 25 step types is a COMPILE error —
 * strictly stronger than the old runtime `default: never` exhaustiveness check.
 */
export type StepHandlerRegistry = {
  [K in PipelineStep["type"]]: StepHandler<Extract<PipelineStep, { type: K }>, StepResultMap[K]>;
};

/**
 * Result of executing one step. Distributed discriminated union: narrowing on
 * `.step.type` narrows `.result` to that step's concrete shape (StepResultMap[K]).
 */
export type StepResult = {
  [K in PipelineStep["type"]]: {
    stepIndex: number;
    step: Extract<PipelineStep, { type: K }>;
    ok: boolean;
    result?: StepResultMap[K];
    durationMs: number;
    error?: string;
    screenshotUrl?: string;
    /** Set when this step opened a new tab that the pipeline followed —
     *  the URL the active page switched to. */
    tabSwitchedTo?: string;
  };
}[PipelineStep["type"]];

/**
 * Construct a failed StepResult. A bare `PipelineStep`-typed `step` is not
 * assignable to the distributed union without narrowing, so this is the one
 * contained assertion for building failure results (used by pipeline.ts and
 * the dispatcher's catch).
 */
export function failedStepResult(
  step: PipelineStep,
  error: string,
  durationMs: number,
  stepIndex = -1
): StepResult {
  return { stepIndex, step, ok: false, error, durationMs } as StepResult;
}
