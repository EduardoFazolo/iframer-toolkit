import { chromium } from "patchright";
import type { Browser, BrowserContext, Page } from "patchright";
import { randomUUID } from "crypto";
import { ensureChrome } from "./chrome-downloader";
import { launchCloakBrowser } from "./cloak-browser";
import type { BrowserMode } from "../types";
import { createLogger } from "../logger";
import {
  registerBrowser,
  unregisterBrowser,
  findChromePidByMarker,
  forceKillBrowser,
  isPidAlive,
} from "./registry";

const log = createLogger("daemon");

export interface DaemonInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  mode: BrowserMode;
  instanceId: string;
  createdAt: Date;
  chromePid: number | null;
  marker: string;
  /** Number of pipeline runs currently using this browser. The idle timer
   *  never fires while this is > 0, so long runs can't get killed mid-work. */
  active: number;
}

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const CLOSE_GRACE_MS = 5_000; // polite close deadline before SIGKILL
export const DEFAULT_INSTANCE = "default";

/** Composite map key: a session may hold several named browsers per mode
 *  (e.g. one per account). instanceId="default" preserves single-browser use. */
function keyOf(mode: BrowserMode, instanceId: string): string {
  return `${mode}::${instanceId}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class BrowserDaemon {
  private instances = new Map<string, DaemonInstance>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private idleTimeout: number;

  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;
    // NOTE: no process signal handlers here. Shutdown has exactly one owner
    // (index.ts gracefulShutdown). If this process dies without it, the
    // on-disk browser registry lets the next server boot reap our Chromes.
  }

  async ensure(mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    if (mode === "docker-headful") {
      throw new Error("Docker mode doesn't use the daemon. Use the Docker API.");
    }

    const key = keyOf(mode, instanceId);
    let instance = this.instances.get(key);

    // Check if existing instance is still alive
    if (instance) {
      try {
        if (instance.browser.isConnected()) {
          // Browser is alive — check if the page is still usable
          let page = instance.page;
          let context = instance.context;
          try {
            // Test if the page is still responsive
            await page.evaluate("1");
          } catch {
            // Page is dead — create a fresh context+page
            log.info(`Page for ${mode} is dead, creating fresh context`);
            try { await context.close(); } catch (err) { log.warn(`dead-page context close failed: ${err}`); }
            context = await instance.browser.newContext();
            page = await context.newPage();
            instance.context = context;
            instance.page = page;
          }
          this.resetIdleTimer(key);
          return { browser: instance.browser, context, page };
        }
      } catch {}
      log.info(`Browser for ${key} disconnected (window closed?), relaunching...`);
      await this.stopMode(mode, instanceId);
    }

    // Unique marker arg: Chrome ignores unknown switches, and it lets us
    // resolve the real Chrome PID (patchright doesn't expose it) so the
    // registry + force-kill path always have a handle on the process.
    const marker = `--iframer-key=${key}-${randomUUID()}`;

    // Try CloakBrowser first (C++-level fingerprint patches), fall back to Chrome for Testing + patchright
    let browser: Browser;
    const cloakBrowser = await launchCloakBrowser({ headless: mode === "headless", args: [marker] });
    if (cloakBrowser) {
      log.info(`CloakBrowser ${mode} ready`);
      browser = cloakBrowser;
    } else {
      const executablePath = await ensureChrome();
      log.info(`Falling back to Chrome for Testing in ${mode} mode: ${executablePath}`);

      browser = await chromium.launch({
        executablePath,
        headless: mode === "headless",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-infobars",
          marker,
        ],
      });
    }

    const chromePid = findChromePidByMarker(marker);
    if (chromePid) {
      registerBrowser({
        key,
        chromePid,
        ownerPid: process.pid,
        marker,
        launchedAt: new Date().toISOString(),
      });
    } else {
      log.warn(`could not resolve Chrome PID for ${key} — force-kill unavailable for this instance`);
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    instance = {
      browser,
      context,
      page,
      mode,
      instanceId,
      createdAt: new Date(),
      chromePid,
      marker,
      active: 0,
    };

    this.instances.set(key, instance);
    this.resetIdleTimer(key);

    log.info(`Chrome ${key} ready (pid=${chromePid ?? "unknown"})`);
    return { browser, context, page };
  }

  /** Mark an instance busy for the duration of a pipeline run. While busy,
   *  the idle timer re-arms instead of killing the browser mid-work.
   *  Always pair with release() in a finally block. */
  acquire(mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): void {
    const instance = this.instances.get(keyOf(mode, instanceId));
    if (instance) instance.active++;
  }

  release(mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): void {
    const key = keyOf(mode, instanceId);
    const instance = this.instances.get(key);
    if (!instance) return;
    instance.active = Math.max(0, instance.active - 1);
    if (instance.active === 0) this.resetIdleTimer(key);
  }

  isRunning(mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): boolean {
    const instance = this.instances.get(keyOf(mode, instanceId));
    if (!instance) return false;
    try {
      return instance.browser.isConnected();
    } catch {
      return false;
    }
  }

  /** Distinct modes that currently have at least one live instance. */
  runningModes(): BrowserMode[] {
    return [...new Set(this.liveInstances().map((i) => i.mode))];
  }

  /** Return all currently-live instances (for extracting session state before teardown) */
  liveInstances(): DaemonInstance[] {
    return [...this.instances.values()].filter((inst) => {
      try {
        return inst.browser.isConnected();
      } catch {
        return false;
      }
    });
  }

  async stopMode(mode: BrowserMode, instanceId: string = DEFAULT_INSTANCE): Promise<void> {
    await this.stopKey(keyOf(mode, instanceId));
  }

  /**
   * Stop one browser: polite close with a hard deadline, then SIGKILL by PID.
   * This can NEVER hang — a wedged context.close() (the historical source of
   * permanently orphaned Chromes) is abandoned after CLOSE_GRACE_MS and the
   * process is killed by PID instead.
   */
  private async stopKey(key: string): Promise<void> {
    const instance = this.instances.get(key);
    if (!instance) return;

    const timer = this.idleTimers.get(key);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(key);

    log.info(`Stopping Chrome ${key} (pid=${instance.chromePid ?? "unknown"})...`);

    const politeClose = (async () => {
      try { await instance.context.close(); } catch (err) { log.warn(`context.close failed for ${key}: ${err}`); }
      try { await instance.browser.close(); } catch (err) { log.warn(`browser.close failed for ${key}: ${err}`); }
    })();

    const closedInTime = await Promise.race([
      politeClose.then(() => true),
      sleep(CLOSE_GRACE_MS).then(() => false),
    ]);

    if (!closedInTime) {
      log.warn(`polite close timed out after ${CLOSE_GRACE_MS}ms for ${key}, force-killing`);
    }

    if (instance.chromePid !== null) {
      const dead = await forceKillBrowser({ chromePid: instance.chromePid, marker: instance.marker });
      if (dead) {
        unregisterBrowser(instance.chromePid);
      } else {
        // Leave the registry record so the reaper retries later.
        log.warn(`Chrome pid=${instance.chromePid} survived SIGKILL?! leaving registry record for reaper`);
      }
    } else if (!closedInTime) {
      log.warn(`no PID recorded for ${key} and polite close hung — this Chrome may leak until the next reap`);
    }

    this.instances.delete(key);
    log.info(`Stopped Chrome ${key}`);
  }

  /**
   * Stop browsers. By default skips instances that are mid-pipeline (active>0)
   * so one agent's "session stop" can't kill another agent's running work on
   * a shared server. Pass force=true (crash recovery / shutdown) to kill all.
   */
  async stopAll(force = false): Promise<void> {
    const keys = [...this.instances.entries()]
      .filter(([, inst]) => force || inst.active === 0)
      .map(([k]) => k);
    await Promise.all(keys.map((k) => this.stopKey(k)));
  }

  private resetIdleTimer(key: string): void {
    const existing = this.idleTimers.get(key);
    if (existing) clearTimeout(existing);

    this.idleTimers.set(
      key,
      setTimeout(() => {
        const instance = this.instances.get(key);
        if (instance && instance.active > 0) {
          // Busy — a pipeline is still running. Check again later instead of
          // killing the browser out from under it.
          this.resetIdleTimer(key);
          return;
        }
        log.info(`Idle timeout for ${key}, stopping...`);
        this.stopKey(key).catch((err) => log.warn(`idle stop failed for ${key}: ${err}`));
      }, this.idleTimeout)
    );
  }

  /** True if any registered Chrome PID from this daemon is still alive. */
  hasLiveProcesses(): boolean {
    return [...this.instances.values()].some(
      (inst) => inst.chromePid !== null && isPidAlive(inst.chromePid)
    );
  }
}
