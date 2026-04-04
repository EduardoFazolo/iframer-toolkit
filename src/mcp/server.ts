#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "path";
import os from "os";
import type { Iframer } from "../lib/iframer";
import type { PipelineResult } from "../lib/types";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Config ──────────────────────────────────────────────────────────

const BASE_URL = process.env.IFRAMER_URL || "http://localhost:3021";
const IFRAMER_SECRET = process.env.IFRAMER_SECRET;
const IFRAMER_MODE = process.env.IFRAMER_MODE; // "docker" | "local" | undefined (auto)

// ─── Local Iframer instance (lazy-loaded for local mode) ────────────

let _iframer: Iframer | null = null;
const LOCAL_USER = "mcp-user";
const LOCAL_TOKEN = IFRAMER_SECRET || "iframer-local-default-token";

async function getIframer() {
  if (!_iframer) {
    const { Iframer } = await import("../lib/iframer");
    const screenshotDir = path.join(os.tmpdir(), "iframer-screenshots");
    _iframer = new Iframer({
      screenshotDir,
      publicUrl: `file://${screenshotDir}`,
      mode: "local",
    });
  }
  return _iframer;
}

function authHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (IFRAMER_SECRET) headers["x-api-key"] = IFRAMER_SECRET;
  return headers;
}

async function apiPost<T = Record<string, unknown>>(endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000), // 3 minutes — execute can be slow (navigation + captcha solving)
  });
  return res.json() as Promise<T>;
}

async function apiGet<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders() });
  return res.json() as Promise<T>;
}

async function apiDelete<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: "DELETE", headers: authHeaders() });
  return res.json() as Promise<T>;
}

// ─── Mode Detection ──────────────────────────────────────────────────

async function isDockerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

function hasDisplay(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return !!process.env.DISPLAY;
}

async function detectAvailableModes(): Promise<Record<string, Record<string, unknown>>> {
  const dockerAvailable = await isDockerRunning();

  let chromeInstalled = false;
  try {
    const { findChromeForTesting } = await import("../lib/browser/chrome-downloader");
    chromeInstalled = !!findChromeForTesting();
  } catch {}

  const display = hasDisplay();

  return {
    headless: {
      available: chromeInstalled,
      reason: chromeInstalled ? undefined : "Chrome for Testing not installed. Run: bun tests/test-modes.ts (or the agent can auto-download it on first execute)",
    },
    "binary-headful": {
      available: chromeInstalled && display,
      reason: !chromeInstalled
        ? "Chrome for Testing not installed"
        : !display
          ? "No display available ($DISPLAY not set)"
          : undefined,
    },
    "docker-headful": {
      available: dockerAvailable,
      reason: dockerAvailable ? undefined : `Docker container not running at ${BASE_URL}`,
    },
    chromeForTesting: {
      installed: chromeInstalled,
      ...(!chromeInstalled ? { action: "Run this command to install: bun -e \"require('./src/lib/browser/chrome-downloader').downloadChrome()\"" } : {}),
    },
  };
}

async function fetchScreenshot(url: string): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { type: "image", data: Buffer.from(buf).toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function ensureLocalChrome(): Promise<void> {
  const { findChromeForTesting, downloadChrome } = await import("../lib/browser/chrome-downloader");
  if (!findChromeForTesting()) {
    await downloadChrome();
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────

const IS_DEV = process.env.IFRAMER_URL?.includes("localhost") || process.env.IFRAMER_URL?.includes("127.0.0.1");

const INSTRUCTIONS = IS_DEV
  ? `iframer-dev — local development instance of iframer (connects to ${BASE_URL}).

This is the LOCAL dev server running in Docker on localhost. Use this MCP when developing or testing iframer itself.

CRITICAL RULES — NEVER VIOLATE THESE:
1. NEVER ask the user "do you have credentials?" or "do you want to log in manually?". If credentials are missing, immediately call "credentials" action=store — it prompts the user with a secure form. Just do it.
2. NEVER suggest manual browser login as a first option. Automate first, manual only as last resort after multiple failures.
3. NEVER ask the user for passwords or credentials in the chat.
4. DO NOT present options or ask questions when you can just act. Check credentials, execute. Show results, not questions.

CREDENTIAL FLOW (follow exactly):
1. Call "credentials" action=list to check if credentials exist.
2. If they exist → proceed with login step in execute.
3. If missing → immediately call "credentials" action=store. Do NOT tell the user and ask what to do.
4. After stored → proceed with login step in execute.

WORKFLOW:
1. Use "execute" with a pipeline of steps — the session starts automatically inside Docker
2. iframer handles obstacles (captcha, cookie banners) automatically
3. If execute fails, read the error — it tells you exactly what went wrong and where
4. Call "session" action=stop when done to save session state

TIMEOUTS: Each step has a 20-second stale-state timeout. If nothing changes for 20s, iframer aborts with a detailed error.

CAPTCHA: ALWAYS use the "solve-captcha" step — auto-detects and solves reCAPTCHA/hCaptcha using vision AI. NEVER manually select tiles.

REVERSE ENGINEERING: When the user asks to "reverse engineer", "map the API", "capture endpoints", or "save the endpoints" — use the "reverse-engineer" tool.`
  : `iframer — browser access for AI agents when normal methods fail.

CRITICAL RULES — NEVER VIOLATE THESE:
1. NEVER ask the user "do you have credentials?" or "do you want to log in manually?". If credentials are missing, immediately call "credentials" action=store — it prompts the user with a secure form. Just do it, don't ask.
2. NEVER suggest "opening the page so you can log in manually" as a first option. Manual login is ONLY acceptable after automated login has failed multiple times.
3. NEVER mention that a browser window will pop up or warn about disruption. iframer handles mode selection and escalation automatically in code.
4. NEVER ask the user for passwords or credentials in the chat.
5. DO NOT present options or ask questions when you can just act. Check status, check credentials, execute. The user should see results, not questions.
6. NEVER fall back to Wayback Machine, web search, or other external tools after a single iframer failure. iframer auto-escalates through all browser modes in one call. Only consider alternatives if execute returns a final failure after exhausting all modes.

CREDENTIAL FLOW (follow this exactly, no exceptions):
1. Call "credentials" action=list to check if credentials exist for the domain.
2. If credentials exist → proceed directly with the login step in execute.
3. If credentials are missing → immediately call "credentials" action=store with the domain. Do NOT tell the user credentials are missing and ask what to do. Just trigger the secure prompt.
4. After credentials are stored → proceed with the login step in execute.

PHILOSOPHY: You are a capable agent. Do your work locally first. Only call iframer when you hit a wall: captcha, login-gated content, heavy bot detection, or content that requires a real browser to render.

WORKFLOW:
1. Call "status" first — know what's available before doing anything
2. For simple blocked pages: use "browse" (headless, fast)
3. For captchas/logins/complex flows: use "execute" with a pipeline of steps
4. iframer handles obstacles (captcha, cookie banners) automatically during execute
5. If execute can't finish, it returns exactly where it stopped and why — you decide what to do next
6. Call "session" action=stop when done to save session state

BROWSER MODES: iframer auto-escalates through all available browser modes (headless → docker-headful → binary-headful) in a single execute call. You do NOT need to manually retry with different modes — it's handled automatically. Just call execute and let it work.

TIMEOUTS: Each step has a 20-second stale-state timeout. If nothing changes on the page for 20s, iframer aborts and returns a detailed error.

CAPTCHA: ALWAYS use the "solve-captcha" step — it auto-detects reCAPTCHA vs hCaptcha and solves with vision AI. NEVER manually select tiles with recaptcha-select.

REVERSE ENGINEERING: When the user asks to "reverse engineer", "map the API", "capture endpoints", or "figure out how this site works" — use the "reverse-engineer" tool.`;

const server = new McpServer(
  { name: "iframer", version: "2.1.5" },
  { instructions: INSTRUCTIONS }
);

// ─── Tool 1: status ──────────────────────────────────────────────────

server.tool(
  "status",
  `Get the full state of iframer in one call. Call this first. Returns: available browser modes, API health, active session, stored credentials, and domain memory.`,
  {},
  async () => {
    try {
      const status: { modes: Record<string, Record<string, unknown>>; api: boolean; session: unknown; credentials: string[]; domainMemory: unknown } = { modes: {}, api: false, session: null, credentials: [], domainMemory: null };

      // Detect available modes
      status.modes = await detectAvailableModes();

      // Check Docker API health
      try {
        const health = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
        const data = await health.json() as { ok?: boolean };
        status.api = data.ok === true;
      } catch {
        status.api = false;
      }

      // Check Docker session (if Docker is running)
      if (status.api) {
        try {
          const sessionData = await apiGet<{ active?: boolean; noVncUrl?: string; createdAt?: string; url?: string }>("/interactive/status");
          status.session = sessionData.active
            ? { active: true, noVncUrl: sessionData.noVncUrl, createdAt: sessionData.createdAt, url: sessionData.url }
            : { active: false };
        } catch {}
      }

      // List stored credentials (local store — works in all modes)
      try {
        if (status.api) {
          const credData = await apiGet<{ ok?: boolean; domains?: string[] }>("/credentials");
          if (credData.ok) status.credentials = credData.domains || [];
        } else {
          const iframer = await getIframer();
          status.credentials = await iframer.listCredentials(LOCAL_USER);
        }
      } catch {}

      // Domain memory summary
      try {
        const { DomainModeStore } = await import("../lib/domain-modes");
        const domainModes = new DomainModeStore();
        status.domainMemory = domainModes.getSummary();
      } catch {}

      return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
    } catch (e: unknown) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  }
);

// ─── Tool 2: browse ──────────────────────────────────────────────────

server.tool(
  "browse",
  `Fetch a web page with a headless browser. Use for pages that need JavaScript rendering but don't have bot detection walls. Session cookies persist across calls.`,
  {
    url: z.string().describe("URL to navigate to"),
    extract: z.string().optional().describe("JavaScript expression to evaluate (e.g. 'document.title')"),
    actions: z.array(z.object({
      type: z.enum(["click", "fill", "wait", "scroll", "human-click", "human-type"]),
      selector: z.string().optional(),
      value: z.string().optional(),
      ms: z.number().optional(),
    })).optional().describe("Actions to execute before extracting"),
    returnHtml: z.boolean().optional().describe("Return full page HTML"),
    waitForSelector: z.string().optional().describe("Wait for this CSS selector before proceeding"),
    sessionless: z.boolean().optional().describe("Skip session persistence"),
  },
  async (params) => {
    try {
      const dockerRunning = await isDockerRunning();
      const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

      let data: any;
      if (useLocal) {
        const iframer = await getIframer();
        data = await iframer.fetch(LOCAL_USER, LOCAL_TOKEN, params as any);
      } else {
        data = await apiPost("/fetch", params);
      }

      if (!data.ok) return err(`Error: ${data.error}`);
      const { html, ...rest } = data;
      const text = html
        ? JSON.stringify(rest, null, 2) + "\n\n--- HTML ---\n" + html
        : JSON.stringify(rest, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (e: unknown) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  }
);

// ─── Tool 3: execute ─────────────────────────────────────────────────

const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string(), waitUntil: z.string().optional() }),
  z.object({ type: z.literal("click"), selector: z.string() }),
  z.object({ type: z.literal("fill"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("human-click"), selector: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  z.object({ type: z.literal("right-click"), selector: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  z.object({ type: z.literal("human-type"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("evaluate"), expression: z.string() }),
  z.object({ type: z.literal("extract"), expression: z.string() }),
  z.object({ type: z.literal("wait"), ms: z.number() }),
  z.object({ type: z.literal("wait-for"), selector: z.string(), timeout: z.number().optional() }),
  z.object({ type: z.literal("scroll"), deltaY: z.number().optional() }),
  z.object({ type: z.literal("keyboard"), key: z.string() }),
  z.object({ type: z.literal("type-code"), value: z.string(), selector: z.string().optional() }),
  z.object({ type: z.literal("login"), domain: z.string(), usernameSelector: z.string().optional(), passwordSelector: z.string().optional(), submitSelector: z.string().optional(), totpSelector: z.string().optional() }),
  z.object({ type: z.literal("solve-captcha") }),
  z.object({ type: z.literal("screenshot"), annotate: z.boolean().optional().describe("Overlay numbered badges on interactive elements. Returns refs (@e1, @e2...) you can use in subsequent steps.") }),
  z.object({ type: z.literal("snapshot"), interactiveOnly: z.boolean().optional().describe("Only include interactive elements (default: true)"), maxElements: z.number().optional().describe("Max elements to return (default: 80)") }),
  z.object({ type: z.literal("find"), role: z.string().optional().describe("ARIA role: button, link, textbox, checkbox, etc."), name: z.string().optional().describe("Accessible name — button text, aria-label"), text: z.string().optional().describe("Visible text content"), placeholder: z.string().optional().describe("Input placeholder text"), label: z.string().optional().describe("Associated label text"), exact: z.boolean().optional().describe("Exact match vs substring (default: substring)") }),
  z.object({ type: z.literal("recaptcha-click") }),
  z.object({ type: z.literal("recaptcha-select"), tiles: z.array(z.number()) }),
  z.object({ type: z.literal("recaptcha-verify") }),
  z.object({ type: z.literal("recaptcha-info") }),
  z.object({ type: z.literal("recaptcha-solve") }),
  z.object({ type: z.literal("recaptcha-answer"), tiles: z.array(z.number()) }),
]);

server.tool(
  "execute",
  `Execute a pipeline of browser steps. Auto-starts a session if needed. Handles obstacles (captcha, cookie banners) automatically.

Steps run sequentially. Each step has a 20-second stale-state timeout — if nothing changes on the page for 20s, execution stops and returns a detailed error so you can decide what to do.

Key step types:
- navigate: go to a URL (obstacle detection runs after this)
- snapshot: get the page's interactive elements as a structured list with refs (@e1, @e2...). Use this BEFORE interacting to see what's on the page. Then use refs in click/fill/human-click/human-type steps instead of CSS selectors.
- find: locate a specific element by role, name, text, placeholder, or label. Returns a ref. Use when you know what you're looking for (e.g. find role=button name="Sign In" → @e1, then click @e1).
- screenshot: take a screenshot. Add annotate=true to overlay numbered badges on interactive elements — returns refs you can use in subsequent steps.
- extract: evaluate JS and include the result in the response
- solve-captcha: auto-detect and auto-solve reCAPTCHA OR hCaptcha with vision (uses Claude) — works for both, no config needed
- login: fill login form with stored credentials (never exposes passwords)

IMPORTANT — Element refs (@e1, @e2...): All selector fields (click, fill, human-click, human-type, wait-for) accept @e refs from snapshot, find, or annotated screenshot. PREFER refs over CSS selectors — they're more reliable. Run snapshot first to see what's available.

API capture (options.captureApi): When enabled, records all XHR/fetch requests the page makes during execution. Use this when the user asks to "reverse engineer", "capture endpoints", "map the API", "remember how this works", or "save the endpoints". Returns structured endpoint data grouped by domain with parameterized paths, request/response bodies, and which pipeline step triggered each call. The agent can then save these to a directory for future direct API usage.

Returns: ok, completedSteps, results (with extract values), obstacles (what was detected/resolved), capturedApi (when enabled), and on failure: errorContext with screenshot, URL, errorType, suggestion, retryable.

Auto-escalation is built in: if blocked, iframer automatically retries with stronger browser modes (headless → docker → binary-headful) in a single call. You do not need to manually retry with different modes.`,
  {
    steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
    options: z.object({
      staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
      screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
      continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
      captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes. Use when the user wants to reverse-engineer, map, or save a site's API endpoints."),
      mode: z.enum(["headless", "binary-headful", "docker-headful"]).optional().describe("Force a specific browser mode. If omitted, iframer auto-selects based on domain memory and escalates if blocked."),
      autoEscalate: z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
    }).optional(),
  },
  async (params) => {
    try {
      const dockerRunning = await isDockerRunning();

      // ─── Smart routing: mode determines WHERE to run ───
      // binary-headful MUST run locally (needs user's display)
      // docker-headful MUST run in Docker
      // headless/auto: prefer Docker if available, else local
      async function runWithMode(mode?: string): Promise<any> {
        if (mode === "binary-headful") {
          // Always local — needs the user's physical display
          await ensureLocalChrome();
          const iframer = await getIframer();
          return iframer.execute(LOCAL_USER, LOCAL_TOKEN, {
            steps: params.steps,
            options: { ...params.options, mode: "binary-headful", autoEscalate: false },
          });
        }
        if (mode === "docker-headful" && dockerRunning) {
          return apiPost("/execute", {
            steps: params.steps,
            options: { ...params.options, mode: "docker-headful", autoEscalate: false },
          });
        }
        // headless or auto — prefer Docker if available
        if (dockerRunning) {
          return apiPost("/execute", {
            steps: params.steps,
            options: { ...params.options, mode: mode || undefined },
          });
        }
        await ensureLocalChrome();
        const iframer = await getIframer();
        return iframer.execute(LOCAL_USER, LOCAL_TOKEN, {
          steps: params.steps,
          options: { ...params.options, mode: (mode as any) || undefined },
        });
      }

      // ─── Execute with auto-escalation in code ───
      const requestedMode = params.options?.mode;
      let data = await runWithMode(requestedMode);

      // Auto-escalate through modes if blocked (unless agent disabled it)
      if (!data.ok && data.error?.errorType === "bot-blocked" && params.options?.autoEscalate !== false && !requestedMode) {
        const escalation = ["docker-headful", "binary-headful"];
        for (const nextMode of escalation) {
          if (nextMode === "docker-headful" && !dockerRunning) continue;
          console.log(`[mcp] Auto-escalating to ${nextMode}`);
          data = await runWithMode(nextMode);
          if (data.ok) break;
          if (data.error?.errorType !== "bot-blocked") break;
        }
      }

      const lines: string[] = [];
      lines.push(`ok: ${data.ok}`);
      lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
      if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);
      if (data.modeUsed) lines.push(`mode: ${data.modeUsed}${data.modeEscalated ? " (auto-escalated)" : ""}`);

      if (data.finalState) {
        lines.push(`\nFinal page: ${data.finalState.title}`);
        lines.push(`URL: ${data.finalState.url}`);
      }

      // Highlight extract/snapshot/find results
      const meaningful = (data.results || []).filter((r: any) => r.ok && r.result !== undefined && r.result !== null);
      for (const r of meaningful) {
        if (r.step?.type === "snapshot" && r.result?.snapshot) {
          lines.push(`\n--- Snapshot (${r.result.elementCount} elements) ---`);
          lines.push(r.result.snapshot);
        } else if (r.step?.type === "find" && r.result?.ref) {
          lines.push(`\nFound: ${r.result.ref} ${r.result.role} "${r.result.name}" (${r.result.matchCount} match${r.result.matchCount > 1 ? "es" : ""})`);
        } else if (r.step?.type === "screenshot" && r.result?.refs) {
          lines.push(`\n--- Annotated screenshot refs ---`);
          lines.push(r.result.refs);
        } else if (r.result !== undefined && r.result !== null) {
          lines.push(`\nstep ${r.stepIndex}: ${JSON.stringify(r.result)}`);
        }
      }

      // Obstacles
      if (data.obstacles && data.obstacles.length > 0) {
        lines.push("\nObstacles handled:");
        for (const o of data.obstacles) {
          lines.push(`  [step ${o.detectedAtStep}] ${o.type}: ${o.resolved ? o.resolution : "UNRESOLVED - " + (o.resolution || "unknown")}`);
        }
      }

      // Captured API endpoints
      if (data.capturedApi && data.capturedApi.length > 0) {
        lines.push("\n--- Captured API ---");
        for (const api of data.capturedApi) {
          lines.push(`\n${api.domain} (${api.baseUrl})`);

          // Show auth summary
          const authParts: string[] = [];
          if (api.auth?.authorization) authParts.push("Authorization header");
          if (api.auth?.cookies && Object.keys(api.auth.cookies).length > 0) authParts.push(`${Object.keys(api.auth.cookies).length} cookies`);
          if (api.auth?.tokens && Object.keys(api.auth.tokens).length > 0) authParts.push(`${Object.keys(api.auth.tokens).length} token headers (${Object.keys(api.auth.tokens).join(", ")})`);
          if (authParts.length > 0) lines.push(`  Auth: ${authParts.join(", ")}`);

          lines.push("  Endpoints:");
          for (const ep of api.endpoints) {
            lines.push(`    ${ep.method} ${ep.path}  [step ${ep.triggeredAtStep}, status ${ep.responseStatus}]`);
            if (ep.rawPaths.length > 1) {
              lines.push(`      examples: ${ep.rawPaths.slice(0, 3).join(", ")}`);
            }
          }
        }
        lines.push("\nThe capturedApi field contains full endpoint data including auth, headers, request/response bodies, and curl commands. Save it to a directory for the user — use auth.json for shared credentials and one file per endpoint.");
      }

      // Collect screenshot URL (failure takes priority, then final state)
      let screenshotUrl: string | null = null;
      if (data.error) {
        lines.push("\n--- Failure ---");
        if (typeof data.error === "string") {
          lines.push(`Error: ${data.error}`);
        } else {
          lines.push(`Failed at step ${data.error.failedAtStep}: ${JSON.stringify(data.error.failedStep)}`);
          lines.push(`Error type: ${data.error.errorType}`);
          lines.push(`Message: ${data.error.message}`);
          lines.push(`Retryable: ${data.error.retryable}`);
          if (data.error.suggestion) lines.push(`Suggestion: ${data.error.suggestion}`);
          if (data.error.pageState?.url) lines.push(`URL at failure: ${data.error.pageState.url}`);
          screenshotUrl = data.error.pageState?.screenshotUrl ?? null;
        }
      } else {
        screenshotUrl = data.finalState?.screenshotUrl ?? null;
      }

      const content: any[] = [{ type: "text" as const, text: lines.join("\n") }];
      if (screenshotUrl) {
        const img = await fetchScreenshot(screenshotUrl);
        if (img) content.push(img);
      }

      if (!data.ok) return { content, isError: true };
      return { content };
    } catch (e: unknown) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  }
);

// ─── Tool 4: session ─────────────────────────────────────────────────

server.tool(
  "session",
  `Manage the browser session lifecycle. Use action=stop when done to save cookies/localStorage for future use. Use action=clear to wipe all stored session data.`,
  {
    action: z.enum(["stop", "clear"]).describe("stop: end session and save state | clear: delete all stored session data"),
  },
  async ({ action }) => {
    try {
      const dockerRunning = await isDockerRunning();
      const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

      if (action === "stop") {
        if (useLocal) {
          const iframer = await getIframer();
          const data = await iframer.stopSession(LOCAL_USER, LOCAL_TOKEN);
          return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${data.sessionSaved}` }] };
        }
        const data = await apiPost<{ ok: boolean; error?: string; sessionSaved?: boolean }>("/interactive/stop");
        if (!data.ok) return err(`Error: ${data.error}`);
        return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${data.sessionSaved}` }] };
      } else {
        if (useLocal) {
          const iframer = await getIframer();
          await iframer.clearSession(LOCAL_USER);
          return { content: [{ type: "text" as const, text: "Session data cleared." }] };
        }
        const data = await apiDelete<{ ok: boolean; error?: string }>("/session");
        if (!data.ok) return err(`Error: ${data.error}`);
        return { content: [{ type: "text" as const, text: "Session data cleared." }] };
      }
    } catch (e: unknown) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  }
);

// ─── Tool 5: credentials ─────────────────────────────────────────────

server.tool(
  "credentials",
  `Manage login credentials securely. When login is needed: FIRST call action=list to check if credentials exist. If they do, proceed with login. If not, call action=store — this prompts the user with a secure form (you never see passwords). NEVER ask the user "do you have credentials?" — just check and act.`,
  {
    action: z.enum(["store", "login", "list"]).describe("store: prompt user for credentials | login: log in with stored credentials | list: show stored domains"),
    domain: z.string().optional().describe("Domain (required for store and login)"),
    usernameSelector: z.string().optional().describe("CSS selector for username field (for login)"),
    passwordSelector: z.string().optional().describe("CSS selector for password field (for login)"),
    submitSelector: z.string().optional().describe("CSS selector for submit button (for login)"),
    totpSelector: z.string().optional().describe("CSS selector for 2FA code field (for login)"),
  },
  async ({ action, domain, usernameSelector, passwordSelector, submitSelector, totpSelector }) => {
    try {
      const dockerRunning = await isDockerRunning();
      const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

      if (action === "list") {
        let domains: string[];
        if (useLocal) {
          const iframer = await getIframer();
          domains = await iframer.listCredentials(LOCAL_USER);
        } else {
          const data = await apiGet<{ ok: boolean; error?: string; domains?: string[] }>("/credentials");
          if (!data.ok) return err(`Error: ${data.error}`);
          domains = data.domains || [];
        }
        if (!domains.length) {
          return { content: [{ type: "text" as const, text: "No credentials stored. Call this tool again with action=store and the domain to prompt the user for credentials now." }] };
        }
        return { content: [{ type: "text" as const, text: `Stored credentials for:\n${domains.map((d: string) => `  - ${d}`).join("\n")}` }] };
      }

      if (action === "store") {
        if (!domain) return err("domain is required for action=store");

        const result = await (server as unknown as { server: { elicitInput: (opts: unknown) => Promise<{ action: string; content?: Record<string, string> }> } }).server.elicitInput({
          mode: "form",
          message: `Enter your login credentials for ${domain}. These are encrypted and stored locally — Claude never sees them.`,
          requestedSchema: {
            type: "object",
            properties: {
              username: { type: "string", title: "Username / Email" },
              password: { type: "string", title: "Password" },
              totp_secret: { type: "string", title: "TOTP Secret (leave empty if no 2FA)" },
            },
            required: ["username", "password"],
          },
        });

        if (result.action === "decline" || !result.content) {
          return { content: [{ type: "text" as const, text: "Cancelled." }] };
        }

        const { username, password, totp_secret } = result.content as { username?: string; password?: string; totp_secret?: string };
        if (useLocal) {
          const iframer = await getIframer();
          await iframer.storeCredential(LOCAL_USER, LOCAL_TOKEN, { domain, username, password, totp_secret: totp_secret || undefined });
        } else {
          const data = await apiPost<{ ok: boolean; error?: string }>("/credentials", { domain, username, password, totp_secret: totp_secret || undefined });
          if (!data.ok) return err(`Error: ${data.error}`);
        }
        return { content: [{ type: "text" as const, text: `Credentials stored for ${domain}.` }] };
      }

      if (action === "login") {
        if (!domain) return err("domain is required for action=login");
        if (useLocal) {
          // In local mode, login is handled as a pipeline step — inform the agent
          return { content: [{ type: "text" as const, text: `Use a login step in "execute" to log in with stored credentials for ${domain}. Example: { "type": "login", "domain": "${domain}" }` }] };
        }
        const data = await apiPost<{ ok: boolean; error?: string; url?: string; title?: string; totpGenerated?: boolean; screenshotUrl?: string }>("/credentials/login", { domain, usernameSelector, passwordSelector, submitSelector, totpSelector });
        if (!data.ok) return err(`Error: ${data.error}`);

        const lines = [`Login attempted for ${domain}`, `URL: ${data.url}`, `Title: ${data.title}`];
        if (data.totpGenerated) lines.push("TOTP code generated and entered automatically.");
        if (data.screenshotUrl) lines.push(`Screenshot: ${data.screenshotUrl}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      return err("Unknown action");
    } catch (e: unknown) {
      if (e instanceof Error && e.message?.includes("does not support")) {
        return err(`This client doesn't support secure input prompts. Store credentials via CLI:\n\niframer credentials add ${domain}`);
      }
      return err(`Error: ${getErrorMessage(e)}`);
    }
  }
);

// ─── Tool 6: reverse-engineer ───────────────────────────────────────

server.tool(
  "reverse-engineer",
  `Reverse-engineer a website's API. Navigates to a URL, performs the steps you specify, and captures every XHR/fetch request the page makes — including auth tokens, cookies, headers, request/response bodies, and ready-to-use curl commands.

Use this when the user asks to:
- "reverse engineer" or "map" a site's API
- "capture the endpoints" or "save the API"
- "figure out how this site works under the hood"
- "record the API calls" so they can be replayed later

How it works:
1. You provide steps (same as execute) — navigate, click, fill, extract, etc.
2. iframer runs them while recording all API calls the page makes
3. Returns structured data per domain: shared auth (cookies, tokens, Authorization header) + each endpoint with method, path, headers, body, response, and a curl command

After getting results, save them as RUNNABLE CODE to a directory:
  <outputDir>/
    auth.js                — exports shared cookies, tokens, authorization as an object
    getMessages.js         — one .js file per endpoint: exports an async function that calls the endpoint using fetch, with auth imported from auth.js
    index.js               — re-exports all endpoint functions
    README.md              — summary of all endpoints and their dependency chain

If typed=true (user asks to "infer types", "add types", "save as typescript", etc.), save as .ts instead:
    auth.ts                — typed auth config with interface
    getMessages.ts         — async function with inferred request/response types based on captured data
    types.ts               — all inferred interfaces (e.g. Message, Channel, User) derived from response bodies
    index.ts               — re-exports all endpoint functions

Naming: convert endpoint paths to camelCase function names (e.g. GET /api/v9/channels/{id}/messages → getChannelMessages). Group related endpoints logically.

The outputDir defaults to the current working directory + the domain name (e.g. ./example_com/). Ask the user where to save if unclear.`,
  {
    steps: z.array(stepSchema).describe("Pipeline steps to execute while capturing API calls"),
    outputDir: z.string().optional().describe("Directory to save the captured API files. If not provided, ask the user or default to ./<domain>/"),
    typed: z.boolean().optional().describe("Save as .ts with inferred types instead of .js. Set to true when the user asks for types, typescript, or type inference."),
    options: z.object({
      staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
      continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
    }).optional(),
  },
  async (params) => {
    try {
      // Run execute with captureApi forced on
      const execParams = {
        steps: params.steps,
        options: { ...params.options, captureApi: true },
      };
      const data = await apiPost<any>("/execute", execParams);

      const lines: string[] = [];
      lines.push(`ok: ${data.ok}`);
      lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
      if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);

      if (data.finalState) {
        lines.push(`\nFinal page: ${data.finalState.title}`);
        lines.push(`URL: ${data.finalState.url}`);
      }

      // Captured API — the main output
      if (data.capturedApi && data.capturedApi.length > 0) {
        for (const api of data.capturedApi) {
          lines.push(`\n━━━ ${api.domain} (${api.baseUrl}) ━━━`);

          // Auth summary
          const authParts: string[] = [];
          if (api.auth?.authorization) authParts.push(`Authorization: ${api.auth.authorization.slice(0, 30)}...`);
          if (api.auth?.cookies && Object.keys(api.auth.cookies).length > 0) authParts.push(`${Object.keys(api.auth.cookies).length} cookies`);
          if (api.auth?.tokens && Object.keys(api.auth.tokens).length > 0) {
            for (const [k, v] of Object.entries(api.auth.tokens)) {
              authParts.push(`${k}: ${String(v).slice(0, 30)}...`);
            }
          }
          if (authParts.length > 0) {
            lines.push(`\nAuth:`);
            for (const part of authParts) lines.push(`  ${part}`);
          }

          lines.push(`\nEndpoints (${api.endpoints.length}):`);
          for (const ep of api.endpoints) {
            lines.push(`\n  ${ep.method} ${ep.path}`);
            lines.push(`    Status: ${ep.responseStatus}`);
            lines.push(`    Triggered at step: ${ep.triggeredAtStep}`);
            if (ep.rawPaths.length > 1) {
              lines.push(`    Seen paths: ${ep.rawPaths.slice(0, 5).join(", ")}`);
            }
            if (ep.headers && Object.keys(ep.headers).length > 0) {
              lines.push(`    Headers: ${Object.keys(ep.headers).join(", ")}`);
            }
            if (ep.requestBody) {
              const bodyPreview = JSON.stringify(ep.requestBody).slice(0, 200);
              lines.push(`    Request body: ${bodyPreview}${bodyPreview.length >= 200 ? "..." : ""}`);
            }
            if (ep.responseBody) {
              const resPreview = JSON.stringify(ep.responseBody).slice(0, 200);
              lines.push(`    Response: ${resPreview}${resPreview.length >= 200 ? "..." : ""}`);
            }
          }
        }

        // Instructions for saving
        const mainDomain = data.capturedApi[0]?.domain || "api";
        const dir = params.outputDir || `./${mainDomain}`;
        const ext = params.typed ? ".ts" : ".js";
        lines.push(`\n━━━ Save instructions ━━━`);
        lines.push(`Save to: ${dir}`);
        lines.push(`Format: ${ext} files`);
        lines.push(`\nGenerate these files from the capturedApi data:`);
        if (params.typed) {
          lines.push(`  1. auth.ts — export the auth object with a typed interface (AuthConfig)`);
          lines.push(`  2. types.ts — infer TypeScript interfaces from the response bodies (e.g. if response has {id: "123", content: "hi"} → interface Message { id: string; content: string; }). Name types based on the endpoint context.`);
          lines.push(`  3. One .ts file per endpoint — export an async function that calls fetch with the right method, headers (from auth.ts), and body. Use the inferred types for params and return values.`);
          lines.push(`  4. index.ts — re-export all endpoint functions`);
          lines.push(`  5. README.md — endpoint summary and dependency chain`);
        } else {
          lines.push(`  1. auth.js — module.exports the auth object (cookies, tokens, authorization)`);
          lines.push(`  2. One .js file per endpoint — module.exports an async function that calls fetch with the right method, headers (require from auth.js), and body.`);
          lines.push(`  3. index.js — re-export all endpoint functions`);
          lines.push(`  4. README.md — endpoint summary and dependency chain`);
        }
        lines.push(`\nFunction naming: convert paths to camelCase (e.g. GET /api/v9/channels/{id}/messages → getChannelMessages, DELETE /api/v9/channels/{id}/messages/{id2} → deleteChannelMessage).`);
        lines.push(`\nIMPORTANT: Auth data contains real tokens/cookies — they expire. Remind the user.`);
      } else {
        lines.push("\nNo API calls were captured. The page may not have made any XHR/fetch requests during the steps, or the steps may not have triggered the expected behavior.");
      }

      // Error context
      if (data.error) {
        lines.push("\n--- Failure ---");
        if (typeof data.error === "string") {
          lines.push(`Error: ${data.error}`);
        } else {
          lines.push(`Failed at step ${data.error.failedAtStep}: ${JSON.stringify(data.error.failedStep)}`);
          lines.push(`Error type: ${data.error.errorType}`);
          lines.push(`Message: ${data.error.message}`);
          if (data.error.suggestion) lines.push(`Suggestion: ${data.error.suggestion}`);
        }
      }

      const content: any[] = [{ type: "text" as const, text: lines.join("\n") }];

      // Attach screenshot
      const screenshotUrl = data.error?.pageState?.screenshotUrl ?? data.finalState?.screenshotUrl;
      if (screenshotUrl) {
        const img = await fetchScreenshot(screenshotUrl);
        if (img) content.push(img);
      }

      // Attach raw captured data as a second text block so the agent can parse and save it
      if (data.capturedApi && data.capturedApi.length > 0) {
        content.push({
          type: "text" as const,
          text: "--- capturedApi JSON ---\n" + JSON.stringify(data.capturedApi, null, 2),
        });
      }

      if (!data.ok) return { content, isError: true };
      return { content };
    } catch (e: unknown) {
      return err(`Connection error: ${getErrorMessage(e)}. Is the API running at ${BASE_URL}?`);
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
(async () => { await server.connect(transport); })();
