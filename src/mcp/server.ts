#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────

const BASE_URL = process.env.IFRAMER_URL || "http://localhost:3021";
const IFRAMER_SECRET = process.env.IFRAMER_SECRET;

function authHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (IFRAMER_SECRET) headers["x-api-key"] = IFRAMER_SECRET;
  return headers;
}

async function apiPost(endpoint: string, body?: any) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function apiGet(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders() });
  return res.json();
}

async function apiDelete(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: "DELETE", headers: authHeaders() });
  return res.json();
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

// ─── MCP Server ──────────────────────────────────────────────────────

const IS_DEV = process.env.IFRAMER_URL?.includes("localhost") || process.env.IFRAMER_URL?.includes("127.0.0.1");

const INSTRUCTIONS = IS_DEV
  ? `iframer-dev — local development instance of iframer (connects to ${BASE_URL}).

This is the LOCAL dev server running in Docker on localhost. Use this MCP when developing or testing iframer itself.

IMPORTANT: This connects to the local Docker container, NOT to a remote server. The browser session runs inside Docker with a virtual display (noVNC available at http://localhost:6080).

WORKFLOW:
1. Use "execute" with a pipeline of steps — the session starts automatically inside Docker
2. iframer handles obstacles (captcha, cookie banners) automatically
3. If execute fails, read the error — it tells you exactly what went wrong and where
4. Call "session" action=stop when done to save session state

TIMEOUTS: Each step has a 20-second stale-state timeout. If nothing changes for 20s, iframer aborts with a detailed error.

CREDENTIALS: NEVER ask the user for passwords or credentials in the chat. Always use "credentials" action=store — it opens a secure prompt so the user types credentials directly into the terminal. You never see them. Then use a login step in "execute".

BOT DETECTION / CAPTCHA RULE: If a captcha appears, try solve-captcha first. Only report failure if the captcha persists after multiple attempts.

REVERSE ENGINEERING: When the user asks to "reverse engineer", "map the API", "capture endpoints", or "save the endpoints" — use the "reverse-engineer" tool. It records every API call the page makes during execution, including auth tokens, cookies, and full request/response data.`
  : `iframer — browser access for AI agents when normal methods fail.

PHILOSOPHY: You are a capable agent. Do your work locally first. Only call iframer when you hit a wall: captcha, login-gated content, heavy bot detection, or content that requires a real browser to render. iframer is a swiss knife you pull out for hard problems, not your default browsing tool.

WHEN TO USE iframer:
- A URL returns a captcha or CAPTCHA wall
- Content requires authentication and you have credentials stored
- The page uses heavy JavaScript that normal fetching can't handle
- You're blocked by bot detection

WORKFLOW:
1. Call "status" first — know what's available before doing anything
2. For simple blocked pages: use "browse" (headless, fast)
3. For captchas/logins/complex flows: use "execute" with a pipeline of steps
4. iframer handles obstacles (captcha, cookie banners) automatically during execute
5. If execute can't finish, it returns exactly where it stopped and why — you decide what to do next
6. Call "session" action=stop when done to save session state

TIMEOUTS: Each step has a 20-second stale-state timeout. If nothing changes on the page for 20s, iframer aborts and returns a detailed error. Retry, adjust your approach, or tell the user why it failed.

CREDENTIALS: NEVER ask the user for passwords or credentials in the chat. Always use "credentials" action=store — it opens a secure prompt so the user types credentials directly into the terminal. You never see them. Then use a login step in "execute".

BOT DETECTION / CAPTCHA RULE: If a captcha appears, try solve-captcha first. Only report failure if it persists after multiple attempts.

REVERSE ENGINEERING: When the user asks to "reverse engineer", "map the API", "capture endpoints", "save the endpoints", or "figure out how this site works" — use the "reverse-engineer" tool. It runs the same pipeline steps as execute but records every API call the page makes, including auth tokens, cookies, and full request/response data. Save the results to a directory the user specifies.`;

const server = new McpServer(
  { name: "iframer", version: "2.1.5" },
  { instructions: INSTRUCTIONS }
);

// ─── Tool 1: status ──────────────────────────────────────────────────

server.tool(
  "status",
  `Get the full state of iframer in one call. Call this first. Returns: API health, active session, stored credentials.`,
  {},
  async () => {
    try {
      const status: any = { api: false, session: null, credentials: [] };

      try {
        const health = await fetch(`${BASE_URL}/health`);
        const data = await health.json() as any;
        status.api = data.ok === true;
      } catch {
        return err(`API not running at ${BASE_URL}. Start it with: docker compose up -d`);
      }

      try {
        const sessionData = await apiGet("/interactive/status") as any;
        status.session = sessionData.active
          ? { active: true, noVncUrl: sessionData.noVncUrl, createdAt: sessionData.createdAt, url: sessionData.url }
          : { active: false };
      } catch {}

      try {
        const credData = await apiGet("/credentials") as any;
        if (credData.ok) status.credentials = credData.domains;
      } catch {}

      return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
    } catch (e: any) {
      return err(`Error: ${e.message}`);
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
      const data = await apiPost("/fetch", params) as any;
      if (!data.ok) return err(`Error: ${data.error}`);
      const { html, ...rest } = data;
      const text = html
        ? JSON.stringify(rest, null, 2) + "\n\n--- HTML ---\n" + html
        : JSON.stringify(rest, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (e: any) {
      return err(`Connection error: ${e.message}. Is the API running at ${BASE_URL}?`);
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
  z.object({ type: z.literal("screenshot") }),
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
- extract: evaluate JS and include the result in the response
- solve-captcha: auto-detect and auto-solve reCAPTCHA OR hCaptcha with vision (uses Claude) — works for both, no config needed
- login: fill login form with stored credentials (never exposes passwords)
- screenshot: take a mid-pipeline screenshot

API capture (options.captureApi): When enabled, records all XHR/fetch requests the page makes during execution. Use this when the user asks to "reverse engineer", "capture endpoints", "map the API", "remember how this works", or "save the endpoints". Returns structured endpoint data grouped by domain with parameterized paths, request/response bodies, and which pipeline step triggered each call. The agent can then save these to a directory for future direct API usage.

Returns: ok, completedSteps, results (with extract values), obstacles (what was detected/resolved), capturedApi (when enabled), and on failure: errorContext with screenshot, URL, errorType, suggestion, retryable.`,
  {
    steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
    options: z.object({
      staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
      screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
      continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
      captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes. Use when the user wants to reverse-engineer, map, or save a site's API endpoints."),
    }).optional(),
  },
  async (params) => {
    try {
      const data = await apiPost("/execute", params) as any;

      const lines: string[] = [];
      lines.push(`ok: ${data.ok}`);
      lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
      if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);

      if (data.finalState) {
        lines.push(`\nFinal page: ${data.finalState.title}`);
        lines.push(`URL: ${data.finalState.url}`);
      }

      // Highlight extract results
      const extracts = (data.results || []).filter((r: any) => r.ok && r.result !== undefined && r.result !== null);
      if (extracts.length > 0) {
        lines.push("\nExtracted data:");
        for (const r of extracts) {
          lines.push(`  step ${r.stepIndex}: ${JSON.stringify(r.result)}`);
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
    } catch (e: any) {
      return err(`Connection error: ${e.message}. Is the API running at ${BASE_URL}?`);
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
      if (action === "stop") {
        const data = await apiPost("/interactive/stop") as any;
        if (!data.ok) return err(`Error: ${data.error}`);
        return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${data.sessionSaved}` }] };
      } else {
        const data = await apiDelete("/session") as any;
        if (!data.ok) return err(`Error: ${data.error}`);
        return { content: [{ type: "text" as const, text: "Session data cleared." }] };
      }
    } catch (e: any) {
      return err(`Connection error: ${e.message}. Is the API running at ${BASE_URL}?`);
    }
  }
);

// ─── Tool 5: credentials ─────────────────────────────────────────────

server.tool(
  "credentials",
  `Manage login credentials. Use action=store to prompt the user for credentials (they're encrypted server-side, you never see them). Use action=login to log in with stored credentials. Use action=list to see what's stored.`,
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
      if (action === "list") {
        const data = await apiGet("/credentials") as any;
        if (!data.ok) return err(`Error: ${data.error}`);
        if (!data.domains.length) {
          return { content: [{ type: "text" as const, text: "No credentials stored. Use action=store to add some." }] };
        }
        return { content: [{ type: "text" as const, text: `Stored credentials for:\n${data.domains.map((d: string) => `  - ${d}`).join("\n")}` }] };
      }

      if (action === "store") {
        if (!domain) return err("domain is required for action=store");

        const result = await (server as any).server.elicitInput({
          mode: "form",
          message: `Enter your login credentials for ${domain}. These are encrypted server-side — Claude never sees them.`,
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

        const { username, password, totp_secret } = result.content as any;
        const data = await apiPost("/credentials", { domain, username, password, totp_secret: totp_secret || undefined }) as any;
        if (!data.ok) return err(`Error: ${data.error}`);
        return { content: [{ type: "text" as const, text: `Credentials stored for ${domain}.` }] };
      }

      if (action === "login") {
        if (!domain) return err("domain is required for action=login");
        const data = await apiPost("/credentials/login", { domain, usernameSelector, passwordSelector, submitSelector, totpSelector }) as any;
        if (!data.ok) return err(`Error: ${data.error}`);

        const lines = [`Login attempted for ${domain}`, `URL: ${data.url}`, `Title: ${data.title}`];
        if (data.totpGenerated) lines.push("TOTP code generated and entered automatically.");
        if (data.screenshotUrl) lines.push(`Screenshot: ${data.screenshotUrl}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      return err("Unknown action");
    } catch (e: any) {
      if ((e as any).message?.includes("does not support")) {
        return err(`This client doesn't support secure input prompts. Store credentials via CLI:\n\niframer credentials add ${domain}`);
      }
      return err(`Error: ${e.message}`);
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

The outputDir defaults to the current working directory + the domain name (e.g. ./discord_com/). Ask the user where to save if unclear.`,
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
      const data = await apiPost("/execute", execParams) as any;

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
    } catch (e: any) {
      return err(`Connection error: ${e.message}. Is the API running at ${BASE_URL}?`);
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
(async () => { await server.connect(transport); })();
