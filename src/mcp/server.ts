#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BASE_URL } from "./helpers";
import { registerStatusTool } from "./tools/status";
import { registerBrowseTool } from "./tools/browse";
import { registerExecuteTool } from "./tools/execute";
import { registerSessionTool } from "./tools/session";
import { registerCredentialsTool } from "./tools/credentials";
import { registerReverseEngineerTool } from "./tools/reverse-engineer";
import { registerKnowledgeTool } from "./tools/knowledge";
import { registerTabsTool } from "./tools/tabs";
import { registerRememberTool } from "./tools/anchors";
import { registerClipboardTool } from "./tools/clipboard";
import { recordCall, recordDefinitions, contentChars, safeJsonLen } from "./telemetry";

// ─── Instructions ───────────────────────────────────────────────────

const IS_DEV = process.env.IFRAMER_URL?.includes("localhost") || process.env.IFRAMER_URL?.includes("127.0.0.1");

const INSTRUCTIONS = IS_DEV
  ? `iframer-dev — local development instance of iframer (connects to ${BASE_URL}).

CRITICAL RULES:
1. NEVER ask the user "do you have credentials?". Call credentials action=list and read the response.
2. NEVER ask the user for passwords in chat. Use credentials action=store (secure form) or the CLI fallback.
3. DO NOT present options when you can just act. Check credentials, execute, show results.
4. If execute fails, read the error. It tells you exactly what happened and where.
5. Call "session" action=stop when done to save session state.

CAPTCHA: Use the "solve-captcha" step — auto-detects reCAPTCHA/hCaptcha and solves with vision AI.
REVERSE ENGINEERING: Use the "reverse-engineer" tool when the user asks to capture/map APIs.`
  : `iframer — browser access for AI agents when normal methods fail.

CRITICAL RULES:
1. NEVER ask "do you have credentials?". Call credentials action=list and read the response.
2. NEVER ask for passwords in chat. Use credentials action=store or the CLI fallback.
3. DO NOT present options when you can just act. Check status, credentials, execute.
4. NEVER re-store credentials when login fails. Login failures are browser-mode problems, not credential problems.
5. ALWAYS check "knowledge get <domain>" before launching a browser. Skip the browser if the cache has what you need.
6. For UI tasks on a site, check "remember get <domain>" first — saved anchors let you target elements as @a:<name> (in any selector) instead of re-finding them. After you locate a new element with snapshot/find and it works, "remember save" it. If an @a: anchor fails, the page changed: re-discover and "remember save" the new selector (don't retry the stale one).
7. If execute fails, read the FULL error. It tells you the step, error type, and suggestion.
7. If the browser crashes, call "session restart" and retry. Don't panic.
8. ALWAYS call "session" action=stop when you are done with browser work. It saves session state and frees the browser. Idle browsers are auto-reclaimed, but don't rely on that.

BROWSER MODES: Don't specify options.mode — iframer auto-selects and auto-escalates (headless → binary-headful). Only set a mode if the user explicitly asks.

CAPTCHA: In binary-headful mode, ask the user to solve it in the visible window. In docker-headful mode, use the "solve-captcha" step.

REVERSE ENGINEERING: Use the "reverse-engineer" tool when the user asks to capture/map/save API endpoints.`;

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer(
  { name: "iframer", version: "3.0.0" },
  { instructions: INSTRUCTIONS }
);

// ─── Telemetry: wrap every tool registration ────────────────────────
// Each handler is intercepted to record input/output sizes (≈ the session
// tokens this call consumed). See src/mcp/telemetry.ts; report with
// `iframer telemetry`; opt out with IFRAMER_TELEMETRY=0.
let defChars = 0;
let defCount = 0;
{
  const origTool = server.tool.bind(server) as (...a: unknown[]) => unknown;
  (server as unknown as { tool: (...a: unknown[]) => unknown }).tool = (...a: unknown[]) => {
    const name = String(a[0]);
    defCount++;
    defChars += name.length + (typeof a[1] === "string" ? (a[1] as string).length : 0);
    const hIdx = a.length - 1;
    const handler = a[hIdx];
    if (typeof handler === "function") {
      a[hIdx] = async (...ha: unknown[]) => {
        const started = Date.now();
        const res = await (handler as (...x: unknown[]) => Promise<unknown>)(...ha);
        const r = res as { isError?: boolean };
        recordCall(name, safeJsonLen(ha[0]), contentChars(res), Date.now() - started, !!r?.isError);
        return res;
      };
    }
    return origTool(...a);
  };
}

registerStatusTool(server);
registerBrowseTool(server);
registerExecuteTool(server);
registerSessionTool(server);
registerCredentialsTool(server);
registerReverseEngineerTool(server);
registerKnowledgeTool(server);
registerTabsTool(server);
registerRememberTool(server);
registerClipboardTool(server);
recordDefinitions(defCount, defChars, INSTRUCTIONS.length);

// ─── Lifecycle ───────────────────────────────────────────────────────

// The MCP server itself NEVER runs Chrome — Chrome lives in the SHARED
// local background server (a separate, detached process used by every
// session). We deliberately do NOT kill it on exit: other sessions may be
// using it, and its own idle-exit + browser-registry reaper govern its
// lifetime. Nothing leaks if this process dies — even via SIGKILL.
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// ─── Self-hygiene: die with the session ─────────────────────────────
// One MCP process is spawned per agent session, and sessions that crash or
// are killed can't clean up after themselves — orphaned MCPs used to pile up
// by the dozen. Two independent tripwires, so this process NEVER outlives
// its session:
//  1. stdin EOF — our JSON-RPC transport pipe; when the parent goes away the
//     pipe closes. No stdin, no session, no reason to exist.
process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
//  2. Reparenting watchdog — if the parent dies without the pipe closing
//     (SIGKILL edge cases), we get reparented (ppid becomes 1 / changes).
const originalPpid = process.ppid;
const orphanCheck = setInterval(() => {
  if (process.ppid !== originalPpid || process.ppid === 1) process.exit(0);
}, 30_000);
orphanCheck.unref?.();

// Safety net for any JS-level errors that somehow slip through. The MCP
// server should never crash — it's just an HTTP client + stdio JSON-RPC.
process.on("uncaughtException", (err) => {
  try { console.error(`[mcp] uncaughtException: ${err?.message}`); } catch {}
});
process.on("unhandledRejection", (reason) => {
  try { console.error(`[mcp] unhandledRejection: ${reason}`); } catch {}
});

// ─── Start ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
(async () => { await server.connect(transport); })();
