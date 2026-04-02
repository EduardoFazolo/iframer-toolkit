import type { Page } from "patchright";

// ─── Pipeline Step Types ────────────────────────────────────────────

export type PipelineStep =
  | { type: "navigate"; url: string; waitUntil?: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "human-click"; selector?: string; x?: number; y?: number }
  | { type: "right-click"; selector?: string; x?: number; y?: number }
  | { type: "human-type"; selector: string; value: string }
  | { type: "evaluate"; expression: string }
  | { type: "extract"; expression: string }
  | { type: "wait"; ms: number }
  | { type: "wait-for"; selector: string; timeout?: number }
  | { type: "scroll"; deltaY?: number }
  | { type: "keyboard"; key: string }
  | { type: "type-code"; value: string; selector?: string }
  | { type: "login"; domain: string; usernameSelector?: string; passwordSelector?: string; submitSelector?: string; totpSelector?: string }
  | { type: "solve-captcha" }
  | { type: "screenshot" }
  | { type: "recaptcha-click" }
  | { type: "recaptcha-select"; tiles: number[] }
  | { type: "recaptcha-verify" }
  | { type: "recaptcha-info" }
  | { type: "recaptcha-solve" }
  | { type: "recaptcha-answer"; tiles: number[] };

// ─── Pipeline ───────────────────────────────────────────────────────

export interface Pipeline {
  steps: PipelineStep[];
  options?: PipelineOptions;
}

export interface PipelineOptions {
  staleTimeoutMs?: number;        // Default: 20_000
  screenshotAfterEach?: boolean;  // Default: false
  continueOnObstacle?: boolean;   // Default: true — try to auto-resolve obstacles
  maxAutoResolveAttempts?: number; // Default: 3
  continueOnError?: boolean;      // Default: false
}

// ─── Pipeline Results ───────────────────────────────────────────────

export interface StepResult {
  stepIndex: number;
  step: PipelineStep;
  ok: boolean;
  result?: any;
  durationMs: number;
  error?: string;
  screenshotUrl?: string;
}

export interface PageState {
  url: string;
  title: string;
  screenshotUrl?: string;
  screenshotBase64?: string;
}

export type PipelineErrorType =
  | "timeout"
  | "stale-state"
  | "element-not-found"
  | "navigation-failed"
  | "captcha-unsolvable"
  | "obstacle-unresolvable"
  | "action-failed"
  | "session-not-found";

export interface ErrorContext {
  failedAtStep: number;
  failedStep: PipelineStep;
  errorType: PipelineErrorType;
  message: string;
  pageState: PageState;
  suggestion?: string;
  retryable: boolean;
}

export type ObstacleType = "captcha" | "hcaptcha" | "login-wall" | "cookie-consent" | "popup";

export interface ObstacleEncounter {
  type: ObstacleType;
  detectedAtStep: number;
  resolved: boolean;
  resolution?: string;
  durationMs: number;
}

export interface PipelineResult {
  ok: boolean;
  completedSteps: number;
  totalSteps: number;
  results: StepResult[];
  finalState: PageState;
  obstacles: ObstacleEncounter[];
  error?: ErrorContext;
  durationMs: number;
}

// ─── State Snapshot (for stale-state detection) ─────────────────────

export interface StateSnapshot {
  url: string;
  documentReadyState: string;
  bodyTextLength: number;
  elementCount: number;
  timestamp: number;
}

// ─── Session / Fetch Types ──────────────────────────────────────────

export interface FetchRequest {
  url: string;
  browser?: string;
  waitUntil?: string;
  waitForSelector?: string;
  extract?: string;
  actions?: PipelineStep[];
  returnHtml?: boolean;
  headers?: Record<string, string>;
  locale?: string;
  sessionless?: boolean;
}

export interface FetchResult {
  ok: boolean;
  browser: string;
  url: string;
  html?: string;
  result?: any;
  durationMs: number;
  error?: string;
}

export interface SessionStartOptions {
  url?: string;
  headers?: Record<string, string>;
  locale?: string;
}

export interface SessionStopResult {
  ok: boolean;
  sessionSaved: boolean;
}

// ─── Credential Types ───────────────────────────────────────────────

export interface CredentialInput {
  domain: string;
  username?: string;
  password?: string;
  totp_secret?: string;
  fields?: Record<string, string>;
}

export interface Credential extends CredentialInput {
  createdAt: string;
  updatedAt: string;
}

// ─── Iframer Config ─────────────────────────────────────────────────

export interface IframerConfig {
  redisUrl?: string;
  anthropicApiKey?: string;
  screenshotDir?: string;
  publicUrl?: string;
  staleTimeoutMs?: number;        // Default: 20_000
  sessionTimeoutMs?: number;      // Default: 300_000
}

// ─── Obstacle Detection ─────────────────────────────────────────────

export interface DetectedObstacle {
  type: ObstacleType;
  confidence: number;  // 0-1
  details?: string;
}

export interface ResolutionResult {
  resolved: boolean;
  resolution?: string;
  error?: string;
}

export interface ObstacleDetector {
  detect(page: Page): Promise<DetectedObstacle | null>;
}

export interface ObstacleResolver {
  canResolve(obstacle: DetectedObstacle): boolean;
  resolve(page: Page, obstacle: DetectedObstacle, context: ExecutionContext): Promise<ResolutionResult>;
}

// ─── Execution Context ──────────────────────────────────────────────

export interface ExecutionContext {
  userId: string;
  token: string;
  screenshotDir: string;
  publicUrl: string;
  staleTimeoutMs: number;
}
