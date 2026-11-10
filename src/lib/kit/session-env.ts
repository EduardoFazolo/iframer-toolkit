/**
 * Puts a working session for a site into <dir>/.env for client.mjs, with no
 * user step when a browser on this machine is already logged in. Every
 * candidate is tested against a page from the capture; the first one that
 * gets in is saved. Values are never printed.
 */
import fs from "fs";
import path from "path";
import { browserJars, cookieHeader, cookieStores, type CookieJar } from "./browser-cookies";
import { apisDir } from "./recipes";

export interface SessionResult {
  ok: boolean;
  source?: string;
  /** Why nothing was saved, or what was tried. */
  note?: string;
  envFile: string;
}

const LOGIN = /\/(login|log-in|signin|sign-in|auth|sso)(\/|\?|$)/i;

/** Same-site paths from the capture without placeholders: data endpoints first, then pages seen. */
function candidatePaths(host: string, dir: string): Array<{ path: string; rsc: boolean }> {
  for (const d of [dir, apisDir(host)]) {
    try {
      const map = JSON.parse(fs.readFileSync(path.join(d, "api.json"), "utf8"));
      const out: Array<{ path: string; rsc: boolean }> = [];
      const add = (p: string, rsc: boolean) => { if (!/\{/.test(p) && !out.some((x) => x.path === p)) out.push({ path: p, rsc }); };
      const eps = (map.endpoints || []).filter((e: any) => e.method === "GET" && (!e.origin || e.origin === map.origin));
      for (const e of eps.filter((e: any) => e.rsc)) add(e.path, true);
      for (const e of eps.filter((e: any) => !e.rsc)) add(e.path, false);
      for (const u of map.pathOnly || []) { try { const x = new URL(u); if (x.origin === map.origin) add(x.pathname, true); } catch {} }
      return out.slice(0, 12);
    } catch {}
  }
  return [];
}

type Verdict = "in" | "out" | "error";
/** What a request with this Cookie header (or none) gets back. */
async function check(origin: string, p: { path: string; rsc: boolean }, cookie: string | null): Promise<Verdict> {
  try {
    const r = await fetch(new URL(p.path, origin), { headers: { ...(cookie ? { cookie } : {}), ...(p.rsc ? { RSC: "1" } : {}) }, redirect: "follow", signal: AbortSignal.timeout(10000) });
    const t = await r.text();
    if (r.redirected && LOGIN.test(new URL(r.url).pathname)) return "out";
    if (r.status === 401 || r.status === 403) return "out";
    if (/NEXT_REDIRECT;[^;]*;[^;]*(login|signin|sign-in|auth)/i.test(t.slice(0, 5000))) return "out";
    // Next.js forbidden()/unauthorized(): a 200 whose RSC carries a 401/403 digest.
    if (/"digest":"NEXT_HTTP_ERROR_FALLBACK;40[13]"/.test(t)) return "out";
    if (/<input[^>]+type=["']?password/i.test(t)) return "out";
    return r.ok ? "in" : "error";
  } catch {
    return "error";
  }
}

/** A captured path that refuses a request with no session: the login test. */
async function findProbe(origin: string, paths: Array<{ path: string; rsc: boolean }>) {
  for (const p of paths) if ((await check(origin, p, null)) === "out") return p;
  return null;
}

/** Merges vals into <dir>/.env (0600) and makes sure .gitignore covers it. */
export function writeEnv(dir: string, vals: Record<string, string>): string {
  fs.mkdirSync(dir, { recursive: true });
  const envFile = path.join(dir, ".env");
  const cur: Record<string, string> = {};
  try { for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = /^([A-Za-z_]\w*)=(.*)$/.exec(l); if (m) cur[m[1]] = m[2]; } } catch {}
  Object.assign(cur, vals);
  fs.writeFileSync(envFile, Object.entries(cur).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(envFile, 0o600);
  const gi = path.join(dir, ".gitignore");
  const giCur = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  if (!giCur.split("\n").includes(".env")) fs.appendFileSync(gi, (giCur && !giCur.endsWith("\n") ? "\n" : "") + ".env\n");
  return envFile;
}

/**
 * Finds a logged-in session for host on this machine and saves it.
 * extra: more jars to try (iframer's own browser sessions).
 * keychain: also try browsers whose cookies need the OS keychain (may show a prompt once).
 */
export async function refreshSession(host: string, dir: string, opts: { extra?: CookieJar[]; keychain?: boolean } = {}): Promise<SessionResult> {
  const envFile = path.join(dir, ".env");
  let origin = `https://${host}`;
  try { origin = JSON.parse(fs.readFileSync(path.join(apisDir(host), "api.json"), "utf8")).origin || origin; } catch {}
  const probe = await findProbe(origin, candidatePaths(host, dir));
  const tried: string[] = [];
  const attempt = async (jars: CookieJar[]): Promise<SessionResult | null> => {
    let untested: CookieJar | null = null;
    for (const jar of jars) {
      const cookie = cookieHeader(jar);
      const ok = probe ? (await check(origin, probe, cookie)) === "in" : null;
      tried.push(`${jar.source}: ${ok === null ? "untested" : ok ? "logged in" : "not logged in"}`);
      if (ok) return { ok: true, source: `${jar.source}, checked on ${probe!.path}`, envFile: writeEnv(dir, { COOKIE: cookie }) };
      if (ok === null && !untested) untested = jar;
    }
    // Nothing to test against: the freshest jar is the best guess.
    if (untested) return { ok: true, source: `${untested.source} (not verified: no captured page needs a login)`, envFile: writeEnv(dir, { COOKIE: cookieHeader(untested) }) };
    return null;
  };

  const first = await attempt([...browserJars(host, { keychain: false }), ...(opts.extra || [])]);
  if (first) return first;
  if (opts.keychain !== false) {
    const second = await attempt(browserJars(host, { keychain: true }).filter((j) => !tried.some((t) => t.startsWith(j.source + ":"))));
    if (second) return second;
  }
  // Say exactly where we looked, so nobody guesses that the cookie is unreadable (HttpOnly is fine here).
  const stores = [...new Set(cookieStores())];
  const looked = stores.length ? `looked in ${stores.length} browser cookie store(s): ${stores.slice(0, 6).join(", ")}${stores.length > 6 ? ", ..." : ""}` : "found no browser cookie store on this machine (T3 Code, Chrome, Brave, Edge, Arc)";
  return {
    ok: false,
    envFile,
    note: tried.length
      ? `no logged-in session found (${tried.join("; ")}). Log in to ${host} in the browser tab, then run this again`
      : `no cookies for ${host} on this machine (${looked}). Log in to ${host} in a T3 Code tab or Chrome, then run this again. If you are logged in and this still fails, report it as an iframer bug with this message; do not ask for the cookie`,
  };
}
