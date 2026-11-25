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

/** Raise when the daemon's behaviour changes: `iframer bridge attach` then replaces a running older daemon. */
export const BRIDGE_VERSION = 1;

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
 * The key a tab presents. It is bound to the site, the tab name and read-only,
 * so a key seen by one site's page opens nothing for another site, and a page
 * can't drop its own read-only limit.
 */
export function tabKey(master: string, site: string, name: string, readOnly: boolean): string {
  return crypto.createHmac("sha256", master).update(`${site}\n${name}\n${readOnly ? "ro" : "rw"}`).digest("hex").slice(0, 32);
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

/** A site is a hostname (with a port only for loopback test sites). One label alone ("com") is refused. */
export function validSite(site: string): boolean {
  const [host, port, extra] = site.split(":");
  if (extra !== undefined || (port !== undefined && !/^\d{1,5}$/.test(port))) return false;
  if (LOOPBACK.test(host)) return true;
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
