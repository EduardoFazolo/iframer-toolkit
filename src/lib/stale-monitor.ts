import type { Page } from "patchright";
import type { StateSnapshot } from "./types";
import { THRESHOLDS, TIMING } from "./constants";
import { withBudget, BudgetExceededError } from "./budget";

const DEFAULT_STALE_TIMEOUT_MS = 20_000;
/** A state probe that takes longer than this means the page's JS isn't answering. */
const PROBE_BUDGET_MS = 3_000;
/** How long a page may stay unresponsive (after the stale timeout) before the step fails. */
const UNRESPONSIVE_GRACE_MS = 8_000;

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
      const url = this.page.url();
      // Budgeted: evaluate has no timeout, and an unbounded probe here is what
      // let a wedged tab hang a step until the 75-120s pipeline watchdog.
      let unresponsive = false;
      const state = await withBudget(
        this.page.evaluate(() => ({
          documentReadyState: document.readyState,
          bodyTextLength: document.body?.innerText?.length || 0,
          elementCount: document.querySelectorAll("*").length,
        })),
        PROBE_BUDGET_MS,
        "state probe",
      ).catch((e) => {
        unresponsive = e instanceof BudgetExceededError;
        return { documentReadyState: "unknown", bodyTextLength: 0, elementCount: 0 };
      });

      return {
        url,
        ...state,
        unresponsive,
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
      let probing = false; // probes can take up to PROBE_BUDGET_MS — never overlap them
      let unresponsiveSince: number | null = null;

      const cleanup = () => {
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
      };

      // Periodic check for staleness
      checkInterval = setInterval(async () => {
        if (resolved || probing) return;

        const elapsed = Date.now() - this.lastActivity;
        if (elapsed < this.timeoutMs) return;

        // Check if page state actually changed
        probing = true;
        try {
          const currentSnapshot = await this.snapshot();
          if (resolved) return;
          if (currentSnapshot.unresponsive) {
            // The page's JS didn't answer. A navigation can briefly do this, so
            // allow a short grace before giving up (the step is already past
            // its stale timeout by the time we probe).
            unresponsiveSince ??= Date.now();
            if (Date.now() - unresponsiveSince < UNRESPONSIVE_GRACE_MS) return;
            cleanup();
            reject(new StaleStateError(
              `The tab stopped responding: its JavaScript did not answer for ${Math.round((Date.now() - unresponsiveSince) / 1000)}s ` +
                `(a blocking dialog, a frozen re-render, or a navigation that never finished)`,
              this.timeoutMs,
              true,
            ));
            return;
          }
          unresponsiveSince = null;
          if (StaleStateMonitor.hasChanged(beforeSnapshot, currentSnapshot)) {
            this.lastActivity = Date.now();
            return;
          }
        } catch {
          // Page might be navigating — that's activity
          this.lastActivity = Date.now();
          return;
        } finally {
          probing = false;
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
  /** True when the page stopped answering at all (vs. answering but not changing). */
  unresponsive: boolean;

  constructor(message: string, timeoutMs: number, unresponsive = false) {
    super(message);
    this.name = "StaleStateError";
    this.timeoutMs = timeoutMs;
    this.unresponsive = unresponsive;
  }
}
