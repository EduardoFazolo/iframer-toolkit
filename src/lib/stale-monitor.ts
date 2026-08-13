import type { Page } from "patchright";
import type { StateSnapshot } from "./types";
import { THRESHOLDS, TIMING } from "./constants";

const DEFAULT_STALE_TIMEOUT_MS = 20_000;

export class StaleStateMonitor {
  private page: Page;
  private timeoutMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: number = Date.now();

  constructor(page: Page, timeoutMs: number = DEFAULT_STALE_TIMEOUT_MS) {
    this.page = page;
    this.timeoutMs = timeoutMs;
  }

  async snapshot(): Promise<StateSnapshot> {
    try {
      const [url, state] = await Promise.all([
        Promise.resolve(this.page.url()),
        this.page.evaluate(() => ({
          documentReadyState: document.readyState,
          bodyTextLength: document.body?.innerText?.length || 0,
          elementCount: document.querySelectorAll("*").length,
        })).catch(() => ({
          documentReadyState: "unknown",
          bodyTextLength: 0,
          elementCount: 0,
        })),
      ]);

      return {
        url,
        ...state,
        timestamp: Date.now(),
      };
    } catch {
      return {
        url: "unknown",
        documentReadyState: "unknown",
        bodyTextLength: 0,
        elementCount: 0,
        timestamp: Date.now(),
      };
    }
  }

  static hasChanged(before: StateSnapshot, after: StateSnapshot): boolean {
    if (before.url !== after.url) return true;
    if (before.documentReadyState !== after.documentReadyState) return true;

    // Significant change in content size (>5% or >100 chars)
    const textDiff = Math.abs(after.bodyTextLength - before.bodyTextLength);
    if (textDiff > THRESHOLDS.STALE_CHAR_CHANGE || (before.bodyTextLength > 0 && textDiff / before.bodyTextLength > THRESHOLDS.STALE_PERCENT_CHANGE)) {
      return true;
    }

    // Significant change in element count (>10 elements or >5%)
    const elemDiff = Math.abs(after.elementCount - before.elementCount);
    if (elemDiff > 10 || (before.elementCount > 0 && elemDiff / before.elementCount > 0.05)) {
      return true;
    }

    return false;
  }

  /**
   * Call this to report that something is happening (e.g., captcha solver making progress).
   * Resets the stale-state timer.
   */
  reportActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Run a function with stale-state monitoring.
   * If the function takes longer than timeoutMs with no state change and no activity reported,
   * the returned promise rejects with a StaleStateError.
   */
  async withMonitoring<T>(fn: () => Promise<T>): Promise<T> {
    this.lastActivity = Date.now();
    const beforeSnapshot = await this.snapshot();

    return new Promise<T>((resolve, reject) => {
      let resolved = false;
      let checkInterval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
      };

      // Periodic check for staleness
      checkInterval = setInterval(async () => {
        if (resolved) return;

        const elapsed = Date.now() - this.lastActivity;
        if (elapsed < this.timeoutMs) return;

        // Check if page state actually changed
        try {
          const currentSnapshot = await this.snapshot();
          if (StaleStateMonitor.hasChanged(beforeSnapshot, currentSnapshot)) {
            this.lastActivity = Date.now();
            return;
          }
        } catch {
          // Page might be navigating — that's activity
          this.lastActivity = Date.now();
          return;
        }

        // Truly stale
        cleanup();
        reject(new StaleStateError(
          `No state change detected for ${this.timeoutMs}ms`,
          this.timeoutMs
        ));
      }, TIMING.STALE_CHECK_INTERVAL); // Check every 2 seconds

      fn()
        .then((result) => {
          if (!resolved) {
            cleanup();
            resolve(result);
          }
        })
        .catch((err) => {
          if (!resolved) {
            cleanup();
            reject(err);
          }
        });
    });
  }
}

export class StaleStateError extends Error {
  timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "StaleStateError";
    this.timeoutMs = timeoutMs;
  }
}
