import path from "path";
import os from "os";
import type { Iframer } from "../lib/iframer";
import { createLogger } from "../lib/logger";
import { getLocalToken } from "../lib/auth/crypto";

export const log = createLogger("mcp");

export const BASE_URL = process.env.IFRAMER_URL || "http://localhost:3021";
export const IFRAMER_SECRET = process.env.IFRAMER_SECRET;
export const IFRAMER_MODE = process.env.IFRAMER_MODE; // "docker" | "local" | undefined (auto)

// Shared user identity — MUST match the CLI's hard-coded user id in bin/cli.js.
// Any new value here requires updating bin/cli.js AND the migration list in
// src/lib/session/sqlite-store.ts so existing users don't lose their stored credentials.
export const LOCAL_USER = "iframer-local";
// Machine-local encryption token — shared with the CLI via ~/.iframer/secret.
export const LOCAL_TOKEN = getLocalToken();

let _iframer: Iframer | null = null;

export async function getIframer(): Promise<Iframer> {
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

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (IFRAMER_SECRET) headers["x-api-key"] = IFRAMER_SECRET;
  return headers;
}

export async function apiPost<T = Record<string, unknown>>(endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  return res.json() as Promise<T>;
}

export async function apiGet<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders() });
  return res.json() as Promise<T>;
}

export async function apiDelete<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: "DELETE", headers: authHeaders() });
  return res.json() as Promise<T>;
}

export async function isDockerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export function hasDisplay(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return !!process.env.DISPLAY;
}

export async function detectAvailableModes(): Promise<Record<string, Record<string, unknown>>> {
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

export async function fetchScreenshot(url: string): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { type: "image", data: Buffer.from(buf).toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export async function ensureLocalChrome(): Promise<void> {
  const { findChromeForTesting, downloadChrome } = await import("../lib/browser/chrome-downloader");
  if (!findChromeForTesting()) {
    await downloadChrome();
  }
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
