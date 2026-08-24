import fs from "fs";
import path from "path";
import { getDataDir } from "../lib/paths";

// ─── MCP token telemetry ────────────────────────────────────────────
//
// Answers "how much of my session's tokens does iframer consume?". Everything
// an MCP tool RETURNS becomes conversation tokens, as do the tool definitions
// and server instructions loaded at session start. We can't see the model's
// tokenizer from here, so sizes are estimated at ~4 chars/token — good to
// ±15% for English/JSON. Records are appended to ~/.iframer/telemetry.jsonl
// (machine-local, nothing leaves the machine). Report: `iframer telemetry`.
// Disable with IFRAMER_TELEMETRY=0.

const CHARS_PER_TOKEN = 4;
const est = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

const enabled = process.env.IFRAMER_TELEMETRY !== "0";
// One MCP process == one agent session; tag records so the report can group.
const sessionId = `${new Date().toISOString().slice(0, 10)}-${process.pid}`;

export function telemetryPath(): string {
  return path.join(getDataDir(), "telemetry.jsonl");
}

let sessionCalls = 0;
let sessionChars = 0;

function write(rec: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    fs.appendFileSync(telemetryPath(), JSON.stringify({ ts: new Date().toISOString(), session: sessionId, ...rec }) + "\n");
  } catch {
    /* telemetry must never break the server */
  }
}

/** One-time context overhead: tool names + descriptions + server instructions.
 *  Underestimates slightly (zod schema text isn't counted) — Claude Code's
 *  /context shows the exact definition footprint. */
export function recordDefinitions(toolCount: number, defChars: number, instructionChars: number): void {
  write({
    kind: "definitions",
    toolCount,
    defChars,
    instructionChars,
    estTokens: est(defChars + instructionChars),
  });
}

/** Per-call record: what the agent sent in and what we sent back — the part
 *  of the session's token budget this call consumed. */
export function recordCall(tool: string, inChars: number, outChars: number, ms: number, isError: boolean): void {
  sessionCalls++;
  sessionChars += inChars + outChars;
  write({
    kind: "call",
    tool,
    inChars,
    outChars,
    estTokens: est(inChars + outChars),
    ms,
    isError,
    sessionCalls,
    sessionEstTokens: est(sessionChars),
  });
}

/** Character count of an MCP tool result's text content. */
export function contentChars(res: unknown): number {
  const r = res as { content?: Array<{ text?: string; data?: string }> } | undefined;
  if (!r || !Array.isArray(r.content)) return 0;
  let n = 0;
  for (const c of r.content) {
    if (typeof c?.text === "string") n += c.text.length;
    else if (typeof c?.data === "string") n += c.data.length; // base64 images count too
  }
  return n;
}

export function safeJsonLen(v: unknown): number {
  try {
    return v === undefined ? 0 : JSON.stringify(v).length;
  } catch {
    return 0;
  }
}
