/**
 * Tab bridge: what the daemon, the CLI and the tests share. State lives in the
 * iframer data dir (~/.iframer): bridge.json (port, per-run token, pid, version)
 * and bridge.key (stable across daemon restarts, so an attached tab reconnects
 * by itself). Both 0600. Nothing about requests is ever stored.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths";

/**
 * Raise when the daemon's behaviour or the daemon <-> relay messages change: `iframer bridge attach` then replaces a
 * running older daemon, so an old daemon never serves a new relay or the other way round.
 * 2: tab keys bound to the origin; writes held until {go}; {abort}.
 * 3: the relay states its version and another one is refused; replies say whether a tab had the request (handed).
 * 4: the relay says itself when a failure means "this tab can't reach its site" ({net}); no reading of error texts.
 */
export const BRIDGE_VERSION = 4;

/** Fixed, because the port is baked into the relay running in the tab. Outside the extension's 3022-3042 scan. */
export const DEFAULT_PORT = 47625;
export const bridgePort = (): number => Number(process.env.IFRAMER_BRIDGE_PORT) || DEFAULT_PORT;

export const stateFile = (): string => path.join(getDataDir(), "bridge.json");
const keyFile = (): string => path.join(getDataDir(), "bridge.key");

export interface BridgeState { port: number; token: string; pid: number; started: string; v: number }

export function readState(): BridgeState | null {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as BridgeState;
    return st && st.port && st.token && st.pid ? st : null;
  } catch { return null; }
}

export function writeState(st: BridgeState): void {
  fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(stateFile(), JSON.stringify(st), { mode: 0o600 });
  try { fs.chmodSync(stateFile(), 0o600); } catch { /* Windows */ }
}

/** Removes the state file if it still names this process. */
export function clearState(pid: number): void {
  try { if (readState()?.pid === pid) fs.rmSync(stateFile()); } catch { /* gone */ }
}

/** The key every tab key is derived from. Created on first use. */
export function masterKey(): string {
  fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o700 });
  try { const k = fs.readFileSync(keyFile(), "utf8").trim(); if (/^[0-9a-f]{64}$/.test(k)) return k; } catch { /* new */ }
  const k = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(keyFile(), k, { mode: 0o600 });
  try { fs.chmodSync(keyFile(), 0o600); } catch { /* Windows */ }
  return k;
}

/**
 * The key a tab presents. It is bound to the exact origin of the tab, the site
 * it may fetch, the tab name and read-only. The page can see its own key (it
 * opens the socket), so the key must be useless anywhere else: another origin,
 * even a sibling subdomain, can't attach with it, and a page can't drop its
 * own read-only limit.
 */
export function tabKey(master: string, origin: string, site: string, name: string, readOnly: boolean): string {
  return crypto.createHmac("sha256", master).update(`${origin.toLowerCase()}\n${site}\n${name}\n${readOnly ? "ro" : "rw"}`).digest("hex").slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const LOOPBACK = /^(127\.0\.0\.1|localhost)$/;
const IP = /^\d{1,3}(\.\d{1,3}){3}$/;

/** "www.dnnr.io" -> "dnnr.io". Everything else stays as given: narrow unless --site widens it. */
export function siteFor(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

/**
 * Suffixes under which anyone can register a name: a site must be narrower than these. Not the whole public suffix
 * list (iframer ships no such list): the common ones, so a slip like --site co.uk is refused.
 */
const SHARED_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.br", "net.br", "org.br", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp",
  "co.in", "co.kr", "co.za", "com.mx", "com.ar", "com.co", "com.tr", "com.cn", "com.hk", "com.sg", "com.tw", "co.il", "co.id", "com.my", "com.ph",
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "herokuapp.com", "pages.dev", "workers.dev", "web.app", "firebaseapp.com", "appspot.com",
  "cloudfront.net", "amazonaws.com", "azurewebsites.net", "onrender.com", "fly.dev", "glitch.me", "repl.co", "blogspot.com", "wordpress.com",
  "ngrok.io", "ngrok-free.app", "trycloudflare.com", "s3.amazonaws.com", "myshopify.com", "webflow.io", "framer.app", "lovable.app",
]);

/** A site is a hostname (with a port only for loopback test sites). One label alone ("com") or a shared suffix ("co.uk") is refused. */
export function validSite(site: string): boolean {
  const [host, port, extra] = site.split(":");
  if (extra !== undefined || (port !== undefined && !/^\d{1,5}$/.test(port))) return false;
  if (LOOPBACK.test(host)) return true;
  if (SHARED_SUFFIXES.has(host)) return false;
  // The usual shape of a country's shared second level (co.ke, com.ng, org.nz, ac.za, ...).
  if (/^(co|com|net|org|gov|edu|ac|or|ne|go|mil|nom|gob|sch)\.[a-z]{2}$/.test(host)) return false;
  return port === undefined && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) && !IP.test(host);
}

export const validName = (name: string): boolean => /^[A-Za-z0-9_.-]{1,40}$/.test(name);

/** True when the URL (or Origin) belongs to the site: the host itself or a subdomain, https only (http for loopback). */
export function covers(site: string, url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const [host, port] = site.split(":");
  const loop = LOOPBACK.test(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loop)) return false;
  if (port !== undefined && u.port !== port) return false;
  if (u.hostname === host) return true;
  return !loop && !IP.test(host) && u.hostname.endsWith("." + host);
}
