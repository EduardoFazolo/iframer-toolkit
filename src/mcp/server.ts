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

// ─── Instructions ───────────────────────────────────────────────────

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

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer(
  { name: "iframer", version: "2.1.5" },
  { instructions: INSTRUCTIONS }
);

registerStatusTool(server);
registerBrowseTool(server);
registerExecuteTool(server);
registerSessionTool(server);
registerCredentialsTool(server);
registerReverseEngineerTool(server);

// ─── Start ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
(async () => { await server.connect(transport); })();
