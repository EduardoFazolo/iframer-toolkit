import { chromium } from "patchright";
import type { Browser, BrowserContext, Page } from "patchright";
import { ensureChrome } from "./chrome-downloader";
import { launchCloakBrowser } from "./cloak-browser";
import type { BrowserMode } from "../types";
import { createLogger } from "../logger";

const log = createLogger("daemon");
import os from "os";
import path from "path";
import fs from "fs";

export interface DaemonInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  mode: BrowserMode;
  instanceId: string;
  createdAt: Date;
}

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_INSTANCE = "default";

/** Composite map key: a session may hold several named browsers per mode
 *  (e.g. one per account). instanceId="default" preserves single-browser use. */
function keyOf(mode: BrowserMode, instanceId: string): string {
  return `${mode}::${instanceId}`;
}

export class BrowserDaemon {
  private instances = new Map<string, DaemonInstance>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private idleTimeout: number;

  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;

    const cleanup = () => this.stopAll().catch((err) => log.warn(`cleanup failed: ${err}`));
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
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
            try { await context.close(); } catch {}
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

    // Try CloakBrowser first (C++-level fingerprint patches), fall back to Chrome for Testing + patchright
    let browser: Browser;
    const cloakBrowser = await launchCloakBrowser({ headless: mode === "headless" });
    if (cloakBrowser) {
      log.info(`CloakBrowser ${mode} ready`);
      browser = cloakBrowser;
    } else {
      const executablePath = await ensureChrome();
      log.info(`Falling back to Chrome for Testing in ${mode} mode: ${executablePath}`);

      const userDataDir = path.join(os.homedir(), ".iframer", "chrome-profile", mode);
      fs.mkdirSync(userDataDir, { recursive: true });

      browser = await chromium.launch({
        executablePath,
        headless: mode === "headless",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-infobars",
        ],
      });
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
    };

    this.instances.set(key, instance);
    this.resetIdleTimer(key);

    log.info(`Chrome ${key} ready`);
    return { browser, context, page };
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

  private async stopKey(key: string): Promise<void> {
    const instance = this.instances.get(key);
    if (!instance) return;

    const timer = this.idleTimers.get(key);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(key);

    log.info(`Stopping Chrome ${key}...`);

    try { await instance.context.close(); } catch {}
    try { await instance.browser.close(); } catch {}

    this.instances.delete(key);
  }

  async stopAll(): Promise<void> {
    const keys = [...this.instances.keys()];
    await Promise.all(keys.map((k) => this.stopKey(k)));
  }

  private resetIdleTimer(key: string): void {
    const existing = this.idleTimers.get(key);
    if (existing) clearTimeout(existing);

    this.idleTimers.set(
      key,
      setTimeout(() => {
        log.info(`Idle timeout for ${key}, stopping...`);
        this.stopKey(key);
      }, this.idleTimeout)
    );
  }
}
