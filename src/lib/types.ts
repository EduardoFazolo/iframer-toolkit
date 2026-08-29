import type { Page } from "patchright";

// ─── Browser Modes ─────────────────────────────────────────────────

export type BrowserMode = "headless" | "binary-headful" | "docker-headful" | "extension";

// ─── Pipeline Step Types ────────────────────────────────────────────

export type PipelineStep =
  | { type: "navigate"; url: string; waitUntil?: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "human-click"; selector?: string; x?: number; y?: number }
  | { type: "right-click"; selector?: string; x?: number; y?: number }
  | { type: "human-type"; selector: string; value: string; skipClick?: boolean; speed?: "slow" | "normal" | "fast" }
  | { type: "evaluate"; expression: string }
  | { type: "extract"; expression: string }
  | { type: "wait"; ms: number }
  | { type: "wait-for"; selector: string; timeout?: number }
  | { type: "scroll"; deltaY?: number; selector?: string; human?: boolean }
  | { type: "keyboard"; key: string; meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean }
  | { type: "read"; selector?: string; maxChars?: number }
  | { type: "upload"; selector: string; files: string[] }
  | { type: "paste"; selector?: string }
  | { type: "download"; url: string; path?: string }
  | { type: "type-code"; value: string; selector?: string }
  | { type: "login"; domain: string; usernameSelector?: string; passwordSelector?: string; submitSelector?: string; totpSelector?: string }
  | { type: "solve-captcha" }
  | { type: "screenshot"; annotate?: boolean }
  | { type: "snapshot"; interactiveOnly?: boolean; maxElements?: number }
  | { type: "find"; role?: string; name?: string; text?: string; placeholder?: string; label?: string; exact?: boolean }
  | { type: "recaptcha-click" }
  | { type: "recaptcha-select"; tiles: number[] }
  | { type: "recaptcha-verify" }
  | { type: "recaptcha-info" }
  | { type: "recaptcha-solve" }
  | { type: "recaptcha-answer"; tiles: number[] };

// ─── Element Ref System ────────────────────────────────────────────

export interface ElementRef {
  ref: string;           // @e1, @e2, ...
  role: string;          // button, link, textbox, etc.
  name: string;          // accessible name or visible text
  selector: string;      // generated CSS selector for interaction
  description?: string;  // extra context (placeholder, type, state)
}

/** A durable, per-domain named element locator — the persisted counterpart of
 *  an ephemeral @e ref. Referenced in selectors as `@a:<name>`. */
export interface Anchor {
  name: string;          // "composer", "send-button", "search"
  selector: string;      // CSS selector (prefer stable attrs like aria-label)
  role?: string;         // textbox, button, ...
  description?: string;  // human note
  quirks?: string[];     // e.g. ["synthetic clicks ignored — use trusted", "@here → confirm modal"]
  uses: number;          // successful resolutions (self-heal signal)
  fails: number;         // failed resolutions (self-heal signal)
  lastVerified: string;  // ISO timestamp of last save/success
}

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
  captureApi?: boolean;           // Default: false — capture XHR/fetch requests during execution
  mode?: BrowserMode;             // Force a specific browser mode (default: auto-select)
  autoEscalate?: boolean;         // Auto-retry with stronger mode if blocked (default: true)
  instanceId?: string;            // Named browser within this session (default: "default") — run several in parallel, e.g. one per account
  extensionTabId?: number;        // Set to drive a real Chrome tab via the browser extension (CDP relay). Bypasses launch/escalation.
  clientId?: string;              // With extensionTabId: which connected extension profile owns the tab (when ambiguous).
  focus?: boolean;                // With extensionTabId: raise the tab's window to the OS foreground while driving (default false — the tab is activated in place and driven with CDP focus emulation, without stealing the user's focus).
}

// ─── Captured API Types ────────────────────────────────────────────

export interface CapturedRequest {
  method: string;
  url: string;
  path: string;
  queryParams?: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  resourceType: string;
  triggeredAtStep: number;
  timestamp: number;
}

export interface CapturedAuth {
  cookies: Record<string, string>;          // name → value from Cookie header
  authorization?: string;                   // Authorization header value
  tokens: Record<string, string>;           // other auth-like headers (x-csrf-token, x-api-key, etc.)
}

export interface CapturedApi {
  domain: string;
  baseUrl: string;
  auth: CapturedAuth;                       // shared auth across all endpoints
  endpoints: CapturedEndpoint[];
  capturedAt: string;
}

export type ApiProtocol = "rest" | "graphql" | "json-rpc" | "grpc-web" | "form-rpc" | "soap";

export type ApiVerb = "read" | "list" | "create" | "update" | "delete" | "action" | "unknown";

export interface CapturedEndpoint {
  method: string;
  path: string;              // parameterized: /api/v9/channels/{id}/messages
  rawPaths: string[];        // actual paths seen
  queryParams?: Record<string, string>;
  headers: Record<string, string>;         // all headers needed to replay (content-type, accept, custom)
  requestBody?: unknown;         // example body
  responseStatus: number;
  responseBody?: unknown;        // example response
  triggeredAtStep: number;
  curl: string;              // ready-to-use curl command
  protocol: ApiProtocol;     // transport kind (rest, graphql, json-rpc, etc.)
  action: string;            // protocol-specific action id (operationName, rpc method, METHOD path)
  verb: ApiVerb;             // inferred semantic verb (read/list/create/update/delete/action)
  functionName: string;      // suggested camelCase function name for generated code
}

// ─── Pipeline Results ───────────────────────────────────────────────

// StepResult is a distributed discriminated union defined alongside the step
// handler registry (src/lib/actions/types.ts) so narrowing on `.step.type`
// narrows `.result` to that step's concrete shape. Imported for local use
// (PipelineResult below) and re-exported because many consumers import it from
// "./types". Type-only, so the import cycle with actions/types.ts (which imports
// PipelineStep from here) is safe.
import type { StepResult } from "./actions/types";
export type { StepResult };

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
  | "session-not-found"
  | "bot-blocked";

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
  capturedApi?: CapturedApi[];  // Only present when captureApi is enabled
  modeUsed?: BrowserMode;       // Which browser mode was actually used
  modeEscalated?: boolean;      // Whether auto-escalation happened
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
  result?: unknown;
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
  anthropicApiKey?: string;
  screenshotDir?: string;
  publicUrl?: string;
  staleTimeoutMs?: number;        // Default: 20_000
  sessionTimeoutMs?: number;      // Default: 300_000
  dataDir?: string;               // Default: ~/.iframer — file-based storage path
  mode?: "docker" | "local";      // Default: auto-detect
}

// ─── Mode Availability ─────────────────────────────────────────────

export interface ModeStatus {
  available: boolean;
  reason?: string;
}

export interface ModeAvailability {
  headless: ModeStatus;
  "binary-headful": ModeStatus;
  "docker-headful": ModeStatus;
}

// ─── Domain Mode Memory ────────────────────────────────────────────

export interface DomainAttempt {
  result: "success" | "blocked";
  reason?: string;
  lastTried: string;   // ISO date
}

export interface DomainModeEntry {
  mode: BrowserMode;       // last successful mode
  lastSuccess: string;     // ISO date
  attempts: Partial<Record<BrowserMode, DomainAttempt>>;
}

// ─── Block Detection ───────────────────────────────────────────────

export interface BlockDetectionResult {
  blocked: boolean;
  reason?: string;
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
  refMap: Map<string, ElementRef>;
  nextRefId: number;
  /** Persisted per-domain anchors (@a:<name>), loaded at run start for the
   *  page's domain. Undefined until loaded; empty map if the domain has none. */
  anchors?: Map<string, Anchor>;
  /** The domain `anchors` was loaded for — used to record use/fail results. */
  anchorDomain?: string;
  store: import("./storage").StorageBackend;
  /** Pending localStorage/sessionStorage to re-inject after each navigate.
   *  Origin-scoped, so calling injectStorage is idempotent across navigations. */
  sessionData?: import("./session/persistence").SessionData;
  /** Runtime callback to request a one-time code (email/SMS/app OTP) from the
   *  user via the MCP client. Only wired up on the local execution path —
   *  Docker mode has no way to elicit back to the MCP client mid-pipeline. */
  elicitOtp?: (domain: string) => Promise<string | null>;
}
