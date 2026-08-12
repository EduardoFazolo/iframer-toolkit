import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

// Point the registry at a throwaway data dir BEFORE importing it.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-registry-test-"));
process.env.IFRAMER_DATA_DIR = TMP_DIR;

const {
  registerBrowser,
  unregisterBrowser,
  reapOrphanBrowsers,
  isPidAlive,
  pidMatchesMarker,
  forceKillBrowser,
  writeServerInfo,
  readServerInfo,
  clearServerInfo,
} = await import("../../src/lib/browser/registry");

const browsersDir = path.join(TMP_DIR, "browsers");

function recordFiles(): string[] {
  try { return fs.readdirSync(browsersDir).filter((f) => f.endsWith(".json")); } catch { return []; }
}

/** Spawn a long-lived process carrying a marker in its argv.
 *  (BSD sleep rejects extra operands, so the marker rides as a positional
 *  arg to sh — it shows up in the sh process's command line.) */
function spawnMarked(marker: string) {
  const child = spawn("sh", ["-c", "sleep 300; true", "iframer-test", marker], { stdio: "ignore" });
  return child;
}

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("pid helpers", () => {
  test("isPidAlive: own process is alive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("isPidAlive: rejects invalid pids", () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-5)).toBe(false);
    expect(isPidAlive(999999999)).toBe(false);
  });

  test("pidMatchesMarker: true only when argv contains marker", async () => {
    const marker = `--iframer-key=test-match-${process.pid}`;
    const child = spawnMarked(marker);
    await new Promise((r) => setTimeout(r, 100));
    expect(pidMatchesMarker(child.pid!, marker)).toBe(true);
    expect(pidMatchesMarker(child.pid!, "--iframer-key=some-other-marker")).toBe(false);
    child.kill("SIGKILL");
  });
});

describe("register/unregister", () => {
  test("writes and removes record files", () => {
    registerBrowser({ key: "headless::default", chromePid: 12345, ownerPid: process.pid, marker: "--iframer-key=x", launchedAt: new Date().toISOString() });
    expect(recordFiles()).toContain("12345.json");
    unregisterBrowser(12345);
    expect(recordFiles()).not.toContain("12345.json");
  });
});

describe("forceKillBrowser", () => {
  test("kills a live marked process", async () => {
    const marker = `--iframer-key=test-kill-${process.pid}`;
    const child = spawnMarked(marker);
    await new Promise((r) => setTimeout(r, 100));
    expect(isPidAlive(child.pid!)).toBe(true);
    const dead = await forceKillBrowser({ chromePid: child.pid!, marker });
    expect(dead).toBe(true);
    expect(isPidAlive(child.pid!)).toBe(false);
  });

  test("refuses to kill a PID whose argv lacks the marker (PID reuse guard)", async () => {
    const child = spawn("sleep", ["300"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 100));
    const dead = await forceKillBrowser({ chromePid: child.pid!, marker: "--iframer-key=not-this-process" });
    expect(dead).toBe(true); // reports "gone" because target marker isn't running
    expect(isPidAlive(child.pid!)).toBe(true); // but the unrelated process survives
    child.kill("SIGKILL");
  });
});

describe("reapOrphanBrowsers", () => {
  test("kills browser whose owner is dead, keeps browser whose owner lives", async () => {
    const deadOwnerMarker = `--iframer-key=test-reap-dead-${process.pid}`;
    const liveOwnerMarker = `--iframer-key=test-reap-live-${process.pid}`;
    const orphan = spawnMarked(deadOwnerMarker);
    const owned = spawnMarked(liveOwnerMarker);
    await new Promise((r) => setTimeout(r, 100));

    registerBrowser({ key: "headless::orphan", chromePid: orphan.pid!, ownerPid: 999999998, marker: deadOwnerMarker, launchedAt: new Date().toISOString() });
    registerBrowser({ key: "headless::owned", chromePid: owned.pid!, ownerPid: process.pid, marker: liveOwnerMarker, launchedAt: new Date().toISOString() });

    const { reaped, skipped } = await reapOrphanBrowsers();
    expect(reaped).toBe(1);
    expect(skipped).toBe(1);
    expect(isPidAlive(orphan.pid!)).toBe(false);
    expect(isPidAlive(owned.pid!)).toBe(true);
    expect(recordFiles()).toContain(`${owned.pid}.json`);
    expect(recordFiles()).not.toContain(`${orphan.pid}.json`);

    owned.kill("SIGKILL");
    unregisterBrowser(owned.pid!);
  });

  test("drops stale records for already-dead browsers", async () => {
    registerBrowser({ key: "headless::stale", chromePid: 999999997, ownerPid: 999999996, marker: "--iframer-key=gone", launchedAt: new Date().toISOString() });
    await reapOrphanBrowsers();
    expect(recordFiles()).not.toContain("999999997.json");
  });
});

describe("server info", () => {
  test("write/read/clear round-trip, clear only for matching pid", () => {
    writeServerInfo({ pid: process.pid, port: 3022, startedAt: new Date().toISOString() });
    expect(readServerInfo()?.port).toBe(3022);
    clearServerInfo(process.pid + 1); // wrong pid — must not clear
    expect(readServerInfo()).not.toBeNull();
    clearServerInfo(process.pid);
    expect(readServerInfo()).toBeNull();
  });
});
