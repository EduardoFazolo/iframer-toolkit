/**
 * The logged-in session for a site, read from browsers on this machine, so a
 * local client never needs the user to paste a cookie. Sources, in order:
 * agent browser tabs (T3 Code, any OS), then Chrome-family profiles (macOS, Linux). Values are only
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

/** Cookie files that exist but could not be read (locked by the running app, no sqlite driver...). */
const unreadable = new Map<string, string>();

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
  } catch (e) {
    unreadable.set(file, (e as Error).message.split("\n")[0].slice(0, 80));
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

interface Profile { source: string; file: string; keychain?: string; localState?: string }

/** Where apps keep their data: macOS Application Support, Linux ~/.config, Windows %APPDATA% and %LOCALAPPDATA%. */
function appRoots(): string[] {
  const home = os.homedir();
  if (process.platform === "darwin") return [path.join(home, "Library", "Application Support")];
  if (process.platform === "win32") return [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean) as string[];
  return [process.env.XDG_CONFIG_HOME || path.join(home, ".config")];
}

function profiles(): Profile[] {
  const win = process.platform === "win32";
  const out: Profile[] = [];
  const ls = (d: string) => { try { return fs.readdirSync(d); } catch { return []; } };
  // Chromium keeps the cookie DB in <profile>/Cookies or <profile>/Network/Cookies, depending on version and OS.
  // localState points at the app's "Local State" file, which holds the Windows DPAPI-wrapped AES key.
  const add = (source: string, dir: string, opts: { keychain?: string; localState?: string } = {}) => {
    for (const f of [path.join(dir, "Cookies"), path.join(dir, "Network", "Cookies")]) out.push({ source, file: f, keychain: opts.keychain, localState: opts.localState });
  };
  for (const root of appRoots()) {
    // T3 Code preview tabs: Electron partitions. On macOS the values are plaintext; on Windows they may be
    // DPAPI+AES-GCM encrypted (handled below). The data folder's name changes between builds
    // (t3code, t3code-v2, "T3 Code"...), so match loosely.
    for (const app of ls(root).filter((a) => /^t3[\s_-]?code/i.test(a))) {
      const appDir = path.join(root, app);
      const localState = path.join(appDir, "Local State");
      for (const p of ls(path.join(appDir, "Partitions"))) add(`T3 Code tab (${p})`, path.join(appDir, "Partitions", p), { localState });
      add(`T3 Code (${app})`, appDir, { localState });
    }
    // Chrome-family browsers. On Windows the per-browser "User Data" dir holds the Local State key file.
    const chromes: Array<[string, string, string]> = process.platform === "darwin"
      ? [["Chrome", "Google/Chrome", "Chrome Safe Storage"], ["Brave", "BraveSoftware/Brave-Browser", "Brave Safe Storage"],
         ["Edge", "Microsoft Edge", "Microsoft Edge Safe Storage"], ["Arc", "Arc/User Data", "Arc Safe Storage"], ["Chromium", "Chromium", "Chromium Safe Storage"]]
      : win
        ? [["Chrome", "Google/Chrome/User Data", ""], ["Edge", "Microsoft/Edge/User Data", ""], ["Brave", "BraveSoftware/Brave-Browser/User Data", ""], ["Chromium", "Chromium/User Data", ""]]
        : [["Chrome", "google-chrome", ""], ["Chromium", "chromium", ""], ["Brave", "BraveSoftware/Brave-Browser", ""]];
    for (const [name, dir] of chromes) {
      const r = path.join(root, dir);
      const localState = win ? path.join(r, "Local State") : undefined;
      // Each profile is a subfolder (Default, Profile 1, ...). On Windows they live under "User Data".
      for (const prof of ls(r)) if (prof !== "Local State") add(`${name} (${prof})`, path.join(r, prof), { keychain: process.platform === "darwin" ? `${name} Safe Storage` : undefined, localState });
    }
  }
  return out.filter((p) => fs.existsSync(p.file));
}

/** The cookie stores this machine has, for "where did you look" messages. */
export function cookieStores(): string[] {
  return profiles().map((p) => (unreadable.has(p.file) ? `${p.source} [unreadable: ${unreadable.get(p.file)}]` : p.source));
}

type Algo = "cbc" | "gcm";
interface CookieKey { key: Buffer; algo: Algo }
const keys = new Map<string, CookieKey | null>();

/** Windows: unwrap the per-user DPAPI blob via PowerShell (no native module, no prompt). */
function dpapiUnprotect(blobB64: string): Buffer | null {
  const ps = `[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${blobB64}'),$null,'CurrentUser'))`;
  for (const exe of ["powershell", "pwsh"]) {
    try {
      const out = execFileSync(exe, ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }).trim();
      if (out) return Buffer.from(out, "base64");
    } catch {}
  }
  return null;
}

/**
 * The key and cipher for a profile's encrypted cookies:
 * - Windows: the AES-256-GCM key from Local State, DPAPI-wrapped (os_crypt.encrypted_key).
 * - Linux: a fixed "peanuts" PBKDF2 key (AES-128-CBC).
 * - macOS: the Safe Storage password from the Keychain (AES-128-CBC; the OS may ask once, "Always Allow" stops that).
 */
function cookieKey(p: Profile): CookieKey | null {
  if (process.platform === "win32") {
    if (!p.localState) return null;
    if (keys.has(p.localState)) return keys.get(p.localState)!;
    let k: CookieKey | null = null;
    try {
      const b = Buffer.from(JSON.parse(fs.readFileSync(p.localState, "utf8")).os_crypt.encrypted_key, "base64");
      const blob = b.subarray(0, 5).toString() === "DPAPI" ? b.subarray(5) : b;
      const key = dpapiUnprotect(blob.toString("base64"));
      if (key && key.length === 32) k = { key, algo: "gcm" };
    } catch {}
    keys.set(p.localState, k);
    return k;
  }
  if (process.platform === "linux") return { key: crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1"), algo: "cbc" };
  if (!p.keychain) return null;
  if (keys.has(p.keychain)) return keys.get(p.keychain)!;
  let k: CookieKey | null = null;
  try {
    const pw = execFileSync("security", ["find-generic-password", "-w", "-s", p.keychain], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }).trim();
    if (pw) k = { key: crypto.pbkdf2Sync(pw, "saltysalt", 1003, 16, "sha1"), algo: "cbc" };
  } catch {}
  keys.set(p.keychain, k);
  return k;
}

function decrypt(enc: Buffer, ck: CookieKey, hostHashed: boolean): string | null {
  const ver = enc.subarray(0, 3).toString();
  if (ver !== "v10" && ver !== "v11") return null;
  try {
    let out: Buffer;
    if (ck.algo === "gcm") {
      // Windows: v10 + 12-byte nonce + ciphertext + 16-byte GCM tag.
      const iv = enc.subarray(3, 15);
      const tag = enc.subarray(enc.length - 16);
      const d = crypto.createDecipheriv("aes-256-gcm", ck.key, iv);
      d.setAuthTag(tag);
      out = Buffer.concat([d.update(enc.subarray(15, enc.length - 16)), d.final()]);
    } else {
      const d = crypto.createDecipheriv("aes-128-cbc", ck.key, Buffer.alloc(16, " "));
      out = Buffer.concat([d.update(enc.subarray(3)), d.final()]);
    }
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
        const key = cookieKey(p);
        if (!key) { unreadable.set(p.file, process.platform === "win32" ? "cookies are encrypted and the Local State key could not be unwrapped" : "cookies are encrypted and the decryption key is unavailable"); continue; }
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
