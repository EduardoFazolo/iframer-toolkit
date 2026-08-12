import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getDataDir } from "../paths";
import { createLogger } from "../logger";

const log = createLogger("registry");

/**
 * On-disk ownership records for every Chrome we launch, plus the shared
 * local-server discovery file. This is what makes orphans reclaimable:
 * ownership lives in files, not in the memory of a process that may die.
 */

export interface BrowserRecord {
  key: string;          // daemon map key, e.g. "binary-headful::default"
  chromePid: number;
  ownerPid: number;     // the server process that launched it
  marker: string;       // unique --iframer-key=... arg, guards against PID reuse
  launchedAt: string;
}

export interface ServerInfo {
  pid: number;
  port: number;
  startedAt: string;
}

function browsersDir(): string {
  const dir = path.join(getDataDir(), "browsers");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function serverInfoPath(): string {
  return path.join(getDataDir(), "server.json");
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True only if `pid` is alive AND its command line contains `marker`.
 *  Protects against killing an unrelated process that reused the PID. */
export function pidMatchesMarker(pid: number, marker: string): boolean {
  if (!isPidAlive(pid)) return false;
  try {
    const cmd = execSync(`ps -o command= -p ${pid}`, { encoding: "utf8" });
    return cmd.includes(marker);
  } catch {
    return false;
  }
}

/** Resolve the Chrome PID for a browser we just launched with a unique
 *  marker arg. Returns the root Chrome process (smallest matching PID). */
export function findChromePidByMarker(marker: string): number | null {
  try {
    const out = execSync(`pgrep -f -- "${marker}"`, { encoding: "utf8" }).trim();
    const pids = out.split("\n").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n !== process.pid);
    if (pids.length === 0) return null;
    return Math.min(...pids);
  } catch {
    return null;
  }
}

export function registerBrowser(rec: BrowserRecord): void {
  try {
    fs.writeFileSync(path.join(browsersDir(), `${rec.chromePid}.json`), JSON.stringify(rec, null, 2));
  } catch (err) {
    log.warn(`failed to write browser record for pid ${rec.chromePid}: ${err}`);
  }
}

export function unregisterBrowser(chromePid: number): void {
  try {
    fs.unlinkSync(path.join(browsersDir(), `${chromePid}.json`));
  } catch {}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** SIGKILL a registered Chrome, verifying the marker first. Returns true if
 *  the process is gone afterwards. */
export async function forceKillBrowser(rec: Pick<BrowserRecord, "chromePid" | "marker">): Promise<boolean> {
  if (!isPidAlive(rec.chromePid)) return true;
  if (!pidMatchesMarker(rec.chromePid, rec.marker)) {
    // PID was reused by something else — the Chrome is already gone.
    return true;
  }
  try {
    process.kill(rec.chromePid, "SIGKILL");
  } catch {}
  // SIGKILL is not blockable; give the kernel a moment then verify.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!isPidAlive(rec.chromePid)) return true;
    await sleep(100);
  }
  return !isPidAlive(rec.chromePid);
}

/**
 * Kill every registered Chrome whose owning server process is dead.
 * Safe to run from any process at any time: it never touches a browser
 * whose owner is still alive, and it verifies the marker before killing.
 */
export async function reapOrphanBrowsers(): Promise<{ reaped: number; skipped: number }> {
  let reaped = 0;
  let skipped = 0;
  let files: string[] = [];
  try {
    files = fs.readdirSync(browsersDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return { reaped, skipped };
  }

  for (const file of files) {
    const full = path.join(browsersDir(), file);
    let rec: BrowserRecord;
    try {
      rec = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      try { fs.unlinkSync(full); } catch {}
      continue;
    }

    if (!isPidAlive(rec.chromePid) || !pidMatchesMarker(rec.chromePid, rec.marker)) {
      // Chrome already gone (or PID reused) — stale record.
      try { fs.unlinkSync(full); } catch {}
      continue;
    }

    if (isPidAlive(rec.ownerPid)) {
      skipped++;
      continue;
    }

    log.info(`reaping orphan Chrome pid=${rec.chromePid} (${rec.key}), owner ${rec.ownerPid} is dead`);
    if (await forceKillBrowser(rec)) {
      try { fs.unlinkSync(full); } catch {}
      reaped++;
    } else {
      log.warn(`failed to kill orphan Chrome pid=${rec.chromePid} — leaving record for next sweep`);
    }
  }

  return { reaped, skipped };
}

// ─── Shared local-server discovery ──────────────────────────────────

export function writeServerInfo(info: ServerInfo): void {
  fs.writeFileSync(serverInfoPath(), JSON.stringify(info, null, 2));
}

export function readServerInfo(): ServerInfo | null {
  try {
    const info = JSON.parse(fs.readFileSync(serverInfoPath(), "utf8")) as ServerInfo;
    if (!Number.isInteger(info.pid) || !Number.isInteger(info.port)) return null;
    return info;
  } catch {
    return null;
  }
}

/** Remove server.json, but only if it still points at `pid` — never
 *  clobber a newer server's record. */
export function clearServerInfo(pid: number): void {
  const info = readServerInfo();
  if (info && info.pid === pid) {
    try { fs.unlinkSync(serverInfoPath()); } catch {}
  }
}
