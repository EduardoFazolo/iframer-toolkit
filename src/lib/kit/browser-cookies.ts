/**
 * The logged-in session for a site, read from browsers on this machine, so a
 * local client never needs the user to paste a cookie. Sources, in order:
 * agent browser tabs (T3 Code), then Chrome-family profiles. Values are only
 * returned to the caller (written to .env), never printed.
 *
 * Only cookies a browser saved to disk are visible: a site whose login cookie
 * has no expiry keeps it in memory, and then nothing here finds it.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

export interface CookieJar {
  source: string;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
  /** Most recent use of any cookie for the site (ms): the freshest jar wins. */
  lastUsed: number;
}

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";

function readRows(file: string, sql: string): any[] {
  // Copy first: the browser holds the file open and may be writing to it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-ck-"));
  try {
    const db = path.join(tmp, "c");
    fs.copyFileSync(file, db);
    if (fs.existsSync(file + "-journal")) fs.copyFileSync(file + "-journal", db + "-journal");
    if (fs.existsSync(file + "-wal")) fs.copyFileSync(file + "-wal", db + "-wal");
    if (IS_BUN) {
      const { Database } = require("bun:sqlite");
      const d = new Database(db);
      try { return d.query(sql).all(); } finally { d.close(); }
    }
    const Database = require("better-sqlite3");
    const d = new Database(db);
    try { return d.prepare(sql).all(); } finally { d.close(); }
  } catch {
    return [];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Cookies that a request to host would carry: same host, or a parent-domain cookie. */
function matches(host: string, cookieHost: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  const c = cookieHost.toLowerCase();
  if (c.startsWith(".")) return h === c.slice(1) || h.endsWith(c);
  return h === c;
}

// Chrome time: microseconds since 1601-01-01.
const chromeMs = (t: number) => (t ? t / 1000 - 11644473600000 : 0);

interface Profile { source: string; file: string; keychain?: string }

function profiles(): Profile[] {
  const home = os.homedir();
  const out: Profile[] = [];
  const ls = (d: string) => { try { return fs.readdirSync(d); } catch { return []; } };
  if (process.platform === "darwin") {
    const sup = path.join(home, "Library", "Application Support");
    // T3 Code preview tabs (Electron partitions; values stored unencrypted).
    for (const app of ls(sup).filter((a) => /^t3code/i.test(a))) {
      const parts = path.join(sup, app, "Partitions");
      for (const p of ls(parts)) out.push({ source: `T3 Code tab (${p})`, file: path.join(parts, p, "Cookies") });
      out.push({ source: `T3 Code (${app})`, file: path.join(sup, app, "Cookies") });
    }
    const chromes: Array<[string, string, string]> = [
      ["Chrome", "Google/Chrome", "Chrome Safe Storage"],
      ["Brave", "BraveSoftware/Brave-Browser", "Brave Safe Storage"],
      ["Edge", "Microsoft Edge", "Microsoft Edge Safe Storage"],
      ["Arc", "Arc/User Data", "Arc Safe Storage"],
      ["Chromium", "Chromium", "Chromium Safe Storage"],
    ];
    for (const [name, dir, keychain] of chromes) {
      const root = path.join(sup, dir);
      for (const prof of ls(root)) {
        for (const f of [path.join(root, prof, "Cookies"), path.join(root, prof, "Network", "Cookies")]) {
          out.push({ source: `${name} (${prof})`, file: f, keychain });
        }
      }
    }
  } else if (process.platform === "linux") {
    const cfg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    for (const app of ls(cfg).filter((a) => /^t3code/i.test(a))) {
      const parts = path.join(cfg, app, "Partitions");
      for (const p of ls(parts)) out.push({ source: `T3 Code tab (${p})`, file: path.join(parts, p, "Cookies") });
    }
    for (const [name, dir] of [["Chrome", "google-chrome"], ["Chromium", "chromium"], ["Brave", "BraveSoftware/Brave-Browser"]]) {
      const root = path.join(cfg, dir);
      for (const prof of ls(root)) for (const f of [path.join(root, prof, "Cookies"), path.join(root, prof, "Network", "Cookies")]) out.push({ source: `${name} (${prof})`, file: f });
    }
  }
  return out.filter((p) => fs.existsSync(p.file));
}

const keys = new Map<string, Buffer | null>();
/** macOS: the Safe Storage password from the Keychain (the OS may ask once; "Always Allow" stops that). */
function chromeKey(p: Profile): Buffer | null {
  if (process.platform === "linux") return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
  if (!p.keychain) return null;
  if (keys.has(p.keychain)) return keys.get(p.keychain)!;
  let k: Buffer | null = null;
  try {
    const pw = execFileSync("security", ["find-generic-password", "-w", "-s", p.keychain], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }).trim();
    if (pw) k = crypto.pbkdf2Sync(pw, "saltysalt", 1003, 16, "sha1");
  } catch {}
  keys.set(p.keychain, k);
  return k;
}

function decrypt(enc: Buffer, key: Buffer, hostHashed: boolean): string | null {
  const ver = enc.subarray(0, 3).toString();
  if (ver !== "v10" && ver !== "v11") return null;
  try {
    const d = crypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
    let out = Buffer.concat([d.update(enc.subarray(3)), d.final()]);
    // Cookie DB version 24+: the value is prefixed with SHA-256(host_key).
    if (hostHashed && out.length >= 32) out = out.subarray(32);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Every browser jar on this machine with cookies for host, freshest first.
 * opts.keychain=false skips sources that need the OS keychain (no prompts).
 */
export function browserJars(host: string, opts: { keychain?: boolean } = {}): CookieJar[] {
  const now = Date.now();
  const bare = host.toLowerCase().split(":")[0].replace(/^www\./, "");
  const jars: CookieJar[] = [];
  for (const p of profiles()) {
    if (p.keychain && opts.keychain === false) continue;
    const rows = readRows(p.file, `SELECT host_key, name, value, hex(encrypted_value) AS enc, path, expires_utc, last_access_utc FROM cookies WHERE host_key LIKE '%${bare.replace(/'/g, "")}'`);
    const mine = rows.filter((r) => matches(host, r.host_key) && (!r.expires_utc || chromeMs(r.expires_utc) > now));
    if (!mine.length) continue;
    let version = 0;
    if (mine.some((r) => !r.value && r.enc)) version = Number(readRows(p.file, "SELECT value FROM meta WHERE key='version'")[0]?.value || 0);
    const cookies: CookieJar["cookies"] = [];
    let lastUsed = 0;
    for (const r of mine) {
      let v: string | null = r.value || null;
      if (!v && r.enc) {
        const key = chromeKey(p);
        if (!key) continue;
        v = decrypt(Buffer.from(r.enc, "hex"), key, version >= 24);
      }
      if (v == null) continue;
      cookies.push({ name: r.name, value: v, domain: r.host_key, path: r.path || "/" });
      lastUsed = Math.max(lastUsed, chromeMs(r.last_access_utc));
    }
    if (cookies.length) jars.push({ source: p.source, cookies, lastUsed });
  }
  return jars.sort((a, b) => b.lastUsed - a.lastUsed);
}

/** A Cookie header from a jar: the most specific path/domain wins for a repeated name. */
export function cookieHeader(jar: CookieJar): string {
  const seen = new Map<string, { value: string; rank: number }>();
  for (const c of jar.cookies) {
    const rank = c.path.length * 1000 + c.domain.replace(/^\./, "").length - (c.domain.startsWith(".") ? 1 : 0);
    const cur = seen.get(c.name);
    if (!cur || rank > cur.rank) seen.set(c.name, { value: c.value, rank });
  }
  return [...seen].map(([n, v]) => `${n}=${v.value}`).join("; ");
}
