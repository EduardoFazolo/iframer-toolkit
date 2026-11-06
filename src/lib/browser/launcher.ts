import { chromium } from "patchright";
import { STEALTH_ARGS } from "./stealth";
import type { Browser } from "patchright";
import { createLogger } from "../logger";
import { registerBrowser, unregisterBrowser, findChromePidByMarker } from "./registry";

const log = createLogger("launcher");
export const BROWSER_ORDER = ["chromium"];

let cachedBrowser: Browser | null = null;
let headedBrowser: Browser | null = null;
let headedPid: number | null = null;
let headedIdleTimer: ReturnType<typeof setTimeout> | null = null;

/** This browser lives outside the daemon's instance map, so it gets no idle
 *  timer and never shows up in `instances`. Both are supplied here instead:
 *  a registry record (so the orphan reaper and force-kill can see it) and an
 *  idle timer (so a protection pivot can't leave a headful window forever). */
const HEADED_IDLE_MS = 5 * 60 * 1000;

function armHeadedIdleTimer(): void {
  if (headedIdleTimer) clearTimeout(headedIdleTimer);
  headedIdleTimer = setTimeout(() => {
    if (!headedBrowser) return;
    const pages = headedBrowser.contexts().reduce((n, c) => n + c.pages().length, 0);
    if (pages > 0) { armHeadedIdleTimer(); return; } // still in use
    log.info("idle timeout for the pivot headed browser, closing");
    void closeHeadedBrowser();
  }, HEADED_IDLE_MS);
}

export async function getHeadedBrowser(): Promise<Browser> {
  if (!headedBrowser?.isConnected()) {
    const marker = `--iframer-key=pivot-headed-${process.pid}-${Date.now()}`;
    headedBrowser = await chromium.launch({ headless: false, args: [...STEALTH_ARGS, marker] });
    headedPid = findChromePidByMarker(marker);
    if (headedPid) {
      registerBrowser({
        key: "pivot::headed",
        chromePid: headedPid,
        ownerPid: process.pid,
        marker,
        launchedAt: new Date().toISOString(),
      });
    } else {
      log.warn("could not resolve Chrome PID for the pivot headed browser — force-kill unavailable");
    }
  }
  armHeadedIdleTimer();
  return headedBrowser;
}

export async function closeHeadedBrowser(): Promise<void> {
  if (headedIdleTimer) { clearTimeout(headedIdleTimer); headedIdleTimer = null; }
  if (headedBrowser) { await headedBrowser.close().catch(() => {}); headedBrowser = null; }
  if (headedPid !== null) { unregisterBrowser(headedPid); headedPid = null; }
}

export async function getBrowser(_name: string = "chromium"): Promise<Browser> {
  if (cachedBrowser) {
    if (cachedBrowser.isConnected()) return cachedBrowser;
    // Stale handle: the CDP connection dropped but the Chrome process may still
    // be alive. Close it before relaunching, otherwise we orphan a process.
    try { await cachedBrowser.close(); } catch (e) { log.warn(`stale browser close failed: ${e}`); }
    cachedBrowser = null;
  }
  cachedBrowser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });
  return cachedBrowser;
}

/** Close the cached ephemeral browser (used by fetch()). Call on shutdown. */
export async function closeBrowser(): Promise<void> {
  await closeHeadedBrowser();
  if (!cachedBrowser) return;
  try { await cachedBrowser.close(); } catch (e) { log.warn(`closeBrowser failed: ${e}`); }
  cachedBrowser = null;
}

export async function getBrowserWithFallback(_preferred?: string): Promise<{ browser: Browser; name: string }> {
  // Chromium-only via patchright (stealth-patched fork). No firefox/webkit fallback.
  return { browser: await getBrowser(), name: "chromium" };
}
