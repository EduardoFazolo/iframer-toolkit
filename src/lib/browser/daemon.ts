import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "patchright";
import { ensureChrome } from "./chrome-downloader";
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
  createdAt: Date;
}

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class BrowserDaemon {
  private instances = new Map<BrowserMode, DaemonInstance>();
  private idleTimers = new Map<BrowserMode, ReturnType<typeof setTimeout>>();
  private idleTimeout: number;

  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;

    const cleanup = () => this.stopAll().catch((err) => log.warn(`cleanup failed: ${err}`));
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  }

  async ensure(mode: BrowserMode): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    if (mode === "docker-headful") {
      throw new Error("Docker mode doesn't use the daemon. Use the Docker API.");
    }

    let instance = this.instances.get(mode);

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
          this.resetIdleTimer(mode);
          return { browser: instance.browser, context, page };
        }
      } catch {}
      await this.stopMode(mode);
    }

    // Ensure Chrome for Testing is available
    const executablePath = await ensureChrome();
    log.info(`Launching Chrome for Testing in ${mode} mode: ${executablePath}`);

    // Use a dedicated profile dir to avoid conflicts with user's Chrome
    const userDataDir = path.join(os.homedir(), ".iframer", "chrome-profile", mode);
    fs.mkdirSync(userDataDir, { recursive: true });

    // Launch via Playwright with Chrome for Testing executable
    const browser = await chromium.launch({
      executablePath,
      headless: mode === "headless",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
      ],
    }) as Browser;

    const context = await browser.newContext();
    const page = await context.newPage();

    instance = {
      browser,
      context,
      page,
      mode,
      createdAt: new Date(),
    };

    this.instances.set(mode, instance);
    this.resetIdleTimer(mode);

    log.info(`Chrome ${mode} ready`);
    return { browser, context, page };
  }

  isRunning(mode: BrowserMode): boolean {
    const instance = this.instances.get(mode);
    if (!instance) return false;
    try {
      return instance.browser.isConnected();
    } catch {
      return false;
    }
  }

  async stopMode(mode: BrowserMode): Promise<void> {
    const instance = this.instances.get(mode);
    if (!instance) return;

    const timer = this.idleTimers.get(mode);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(mode);

    log.info(`Stopping Chrome ${mode}...`);

    try { await instance.context.close(); } catch {}
    try { await instance.browser.close(); } catch {}

    this.instances.delete(mode);
  }

  async stopAll(): Promise<void> {
    const modes = [...this.instances.keys()];
    await Promise.all(modes.map((m) => this.stopMode(m)));
  }

  private resetIdleTimer(mode: BrowserMode): void {
    const existing = this.idleTimers.get(mode);
    if (existing) clearTimeout(existing);

    this.idleTimers.set(
      mode,
      setTimeout(() => {
        log.info(`Idle timeout for ${mode}, stopping...`);
        this.stopMode(mode);
      }, this.idleTimeout)
    );
  }
}
