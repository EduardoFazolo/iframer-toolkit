/**
 * Ask T3 Code for the logged-in session, instead of reading a cookie file.
 *
 * On Windows, T3 Code keeps its session cookie database exclusively locked
 * while it runs, so a login done in a T3 Code tab cannot be read from disk by
 * any other process (see the Windows notes in browser-cookies.ts). T3 Code is
 * the one process that CAN read those cookies — its Electron main process holds
 * the session and `session.cookies.get()` returns everything, HttpOnly included.
 *
 * This module is the client half of a small "cookie bridge": when T3 Code
 * exposes an endpoint that returns its session cookies for a host, iframer calls
 * it here and turns the result into a normal CookieJar. It is a no-op (returns
 * []) whenever the bridge is not configured, so nothing changes on machines
 * without it (macOS/Linux, or Windows until T3 adds the endpoint). The endpoint
 * contract iframer speaks is documented in docs/t3-cookie-bridge.md.
 *
 * Nothing here prints cookie values; jars flow back to the caller (.env) only.
 */
import type { CookieJar } from "./browser-cookies";

/** The local path iframer calls on T3 Code's server when only a base URL/token is known. */
export const T3_COOKIE_PATH = "/api/experimental/preview/cookies";

/** One cookie as the bridge returns it (Electron's cookies.get() shape, trimmed). */
export interface T3BridgeCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  /** Unix seconds; <=0 or absent means a session cookie (kept). */
  expires?: number;
}

export interface T3BridgeConfig {
  url: string;
  token?: string;
}

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

/**
 * Resolve where to call T3 Code and with what token, from the environment:
 *  - IFRAMER_T3_COOKIE_URL  — full URL of the cookie endpoint (highest priority).
 *  - else T3's local server base (IFRAMER_T3_BASE_URL, or the origin of
 *    T3_ACP_MCP_ENDPOINT that T3 passes to agent tools) + T3_COOKIE_PATH,
 *    but only when a token is available, since the server requires auth.
 *  - token: IFRAMER_T3_COOKIE_TOKEN, else the bearer T3 gives tools
 *    (T3_ACP_MCP_AUTHORIZATION / T3_LOCAL_BEARER).
 * Returns null when nothing usable is configured (the common, no-op case).
 */
export function t3BridgeConfig(env: NodeJS.ProcessEnv = process.env): T3BridgeConfig | null {
  const token = env.IFRAMER_T3_COOKIE_TOKEN || env.T3_ACP_MCP_AUTHORIZATION || env.T3_LOCAL_BEARER;
  const explicit = env.IFRAMER_T3_COOKIE_URL;
  if (explicit) return { url: explicit, token };
  const base = env.IFRAMER_T3_BASE_URL || (env.T3_ACP_MCP_ENDPOINT ? originOf(env.T3_ACP_MCP_ENDPOINT) : null);
  if (base && token) return { url: base.replace(/\/+$/, "") + T3_COOKIE_PATH, token };
  return null;
}

/** True when a bridge is configured (so callers can explain what they tried). */
export function t3BridgeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return t3BridgeConfig(env) !== null;
}

const authHeader = (token?: string): Record<string, string> =>
  token ? { authorization: /^bearer\s/i.test(token) ? token : `Bearer ${token}` } : {};

/** Cookies that a request to host would carry: same host or a parent-domain cookie. */
function belongs(bare: string, domain: string): boolean {
  const d = (domain || "").replace(/^\./, "").toLowerCase();
  if (!d) return false;
  return bare === d || bare.endsWith("." + d) || d.endsWith("." + bare);
}

/**
 * The session T3 Code holds for host, as a single freshest-wins CookieJar.
 * Returns [] (never throws) when the bridge is unconfigured, unreachable, or
 * has nothing for the host — the caller then falls back to on-disk stores.
 */
export async function t3BridgeJars(
  host: string,
  opts: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<CookieJar[]> {
  const env = opts.env || process.env;
  const cfg = t3BridgeConfig(env);
  if (!cfg) return [];
  const f = opts.fetchImpl || (globalThis.fetch as typeof fetch | undefined);
  if (!f) return [];
  const bare = host.toLowerCase().split(":")[0].replace(/^www\./, "");
  try {
    const res = await f(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(cfg.token) },
      body: JSON.stringify({ host: bare, urls: [`https://${bare}/`] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const raw: T3BridgeCookie[] = Array.isArray(data) ? data : data?.cookies || [];
    const now = Date.now() / 1000;
    const cookies = raw
      .filter((c) => c && typeof c.name === "string" && typeof c.value === "string" && belongs(bare, c.domain))
      .filter((c) => c.expires == null || c.expires <= 0 || c.expires > now)
      .map((c) => ({ name: c.name, value: c.value, domain: c.domain || bare, path: c.path || "/" }));
    if (!cookies.length) return [];
    return [{ source: "T3 Code session (bridge)", cookies, lastUsed: Date.now() }];
  } catch {
    return [];
  }
}
