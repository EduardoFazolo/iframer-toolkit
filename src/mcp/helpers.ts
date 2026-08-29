import path from "path";
import os from "os";
import { createLogger } from "../lib/logger";
import { getLocalToken } from "../lib/auth/crypto";
import { LocalServerManager } from "./local-server";

export const log = createLogger("mcp");

export const BASE_URL = process.env.IFRAMER_URL || "http://localhost:3021";
export const IFRAMER_SECRET = process.env.IFRAMER_SECRET;
export const IFRAMER_MODE = process.env.IFRAMER_MODE;

// Shared user identity — MUST match LOCAL_USER_ID in bin/cli.js and
// CANONICAL_USER in src/api/middleware.ts.
export const LOCAL_USER = "iframer-local";
export const LOCAL_TOKEN = getLocalToken();

// ─── Local server lifecycle ─────────────────────────────────────────

export const localServer = new LocalServerManager();

/** Ensure the local background server is running. Call this before any
 *  localApiPost/localApiGet. */
export async function ensureLocalServer(): Promise<void> {
  await localServer.ensureRunning();
}

// ─── HTTP helpers ───────────────────────────────────────────────────

function authHeaders(secret?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = secret || IFRAMER_SECRET;
  if (key) headers["x-api-key"] = key;
  return headers;
}

/** POST to the Docker server at BASE_URL (:3021). */
export async function apiPost<T = Record<string, unknown>>(endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  return res.json() as Promise<T>;
}

/** GET from the Docker server at BASE_URL (:3021). */
export async function apiGet<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) });
  return res.json() as Promise<T>;
}

/** DELETE on the Docker server at BASE_URL (:3021). */
export async function apiDelete<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: "DELETE", headers: authHeaders(), signal: AbortSignal.timeout(30_000) });
  return res.json() as Promise<T>;
}

/** POST to the local background server (:3022). `timeoutMs` overrides the
 *  default 180s abort — needed for pipelines with long human typing, which the
 *  server's watchdog sizes to the text length. */
export async function localApiPost<T = Record<string, unknown>>(endpoint: string, body?: unknown, timeoutMs = 180_000): Promise<T> {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: authHeaders(LOCAL_TOKEN),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json() as Promise<T>;
}

/** GET from the local background server (:3022). */
export async function localApiGet<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { headers: authHeaders(LOCAL_TOKEN), signal: AbortSignal.timeout(30_000) });
  return res.json() as Promise<T>;
}

/** DELETE on the local background server (:3022). */
export async function localApiDelete<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { method: "DELETE", headers: authHeaders(LOCAL_TOKEN), signal: AbortSignal.timeout(30_000) });
  return res.json() as Promise<T>;
}

// ─── Docker detection ───────────────────────────────────────────────

export async function isDockerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─── Screenshot resolution ──────────────────────────────────────────

/**
 * Resolve a screenshot URL to a local file path that the agent can read
 * natively via its Read tool. NEVER return base64.
 */
export async function resolveScreenshotPath(url: string): Promise<string | null> {
  try {
    if (url.startsWith("file://")) {
      const { fileURLToPath } = await import("url");
      const filePath = fileURLToPath(url);
      const fs = await import("fs");
      if (fs.existsSync(filePath)) return filePath;
      return null;
    }
    // Docker/HTTP URL: download to temp file
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const fs = await import("fs");
    const dir = path.join(os.tmpdir(), "iframer-screenshots", "screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `docker-${Date.now()}.jpg`);
    fs.writeFileSync(filePath, buf);
    return filePath;
  } catch {
    return null;
  }
}

// ─── Utility ────────────────────────────────────────────────────────

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

// Re-exported from the shared lib so the MCP tools keep their import path.
export { getErrorMessage } from "../lib/errors";
