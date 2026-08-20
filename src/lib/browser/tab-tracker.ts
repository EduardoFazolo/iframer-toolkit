import type { BrowserContext, Page } from "patchright";
import { createLogger } from "../logger";

const log = createLogger("tabs");

export interface TabSwitch {
  url: string;
  title: string;
}

export interface SettleOptions {
  /** If no new tab has registered yet, wait up to this long for one to open
   *  (covers the race where the 'page' event fires just after click() resolves).
   *  Pass 0 to never wait. */
  waitForPendingMs: number;
  /** How long to let the followed tab reach domcontentloaded. */
  loadTimeoutMs: number;
  /** A new tab often opens at about:blank then navigates to the real URL; wait
   *  up to this long for that first real navigation before judging it blank. */
  blankResolveMs: number;
}

/**
 * Tracks the tabs (pages) in a BrowserContext and owns which one is "active".
 *
 * A click that opens a new tab (target=_blank / window.open) creates a separate
 * Page on the SAME context. Without this, the pipeline keeps driving the
 * original page — which never changes — and dies on the stale-state timeout.
 * The tracker follows the new tab so subsequent steps run against it.
 *
 * Scoped to a single pipeline run: construct at run start, call dispose() at run
 * end. dispose() is REQUIRED — the daemon reuses the context across runs, so an
 * undisposed 'page' listener would leak and accumulate.
 *
 * Works identically in headless and headful: tab management is a
 * BrowserContext/CDP concern, independent of rendering.
 */
export class TabTracker {
  private pages: Page[];
  private activePage: Page;
  private newlyOpened: Page[] = [];
  private disposed = false;

  constructor(private context: BrowserContext, initial: Page) {
    this.activePage = initial;
    this.pages = [...context.pages()];
    if (!this.pages.includes(initial)) this.pages.push(initial);
    context.on("page", this.onNewPage);
  }

  private onNewPage = (p: Page): void => {
    if (this.disposed) return;
    this.pages.push(p);
    this.newlyOpened.push(p);
    p.on("close", () => this.onClose(p));
    log.debug(`new tab opened: ${safeUrl(p)}`);
  };

  private onClose = (p: Page): void => {
    this.pages = this.pages.filter((x) => x !== p);
    this.newlyOpened = this.newlyOpened.filter((x) => x !== p);
    if (this.activePage === p) {
      // Fall back to the most recent surviving tab.
      this.activePage = this.pages[this.pages.length - 1] ?? p;
      log.debug(`active tab closed, fell back to: ${safeUrl(this.activePage)}`);
    }
  };

  /** The page the pipeline should currently drive. */
  active(): Page {
    return this.activePage;
  }

  /** Number of live tabs currently tracked. */
  count(): number {
    return this.pages.length;
  }

  /**
   * If a tab opened since the last settle, switch to the newest one (waiting
   * for it to load) and return info about the switch. Returns null if nothing
   * opened. Never throws.
   */
  async settle(opts: SettleOptions): Promise<TabSwitch | null> {
    if (this.newlyOpened.length === 0 && opts.waitForPendingMs > 0) {
      // A tab may have been triggered but its 'page' event hasn't landed yet.
      await this.context
        .waitForEvent("page", { timeout: opts.waitForPendingMs })
        .catch(() => null);
    }
    if (this.newlyOpened.length === 0) return null;

    const target = this.newlyOpened[this.newlyOpened.length - 1];
    this.newlyOpened = [];
    if (target.isClosed()) return null;

    await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {});
    // A target=_blank tab starts at about:blank and then navigates to its real
    // URL — wait for that first real navigation before deciding it's blank.
    if (safeUrl(target) === "about:blank" || safeUrl(target) === "") {
      await target.waitForURL((u) => { const s = u.toString(); return !!s && s !== "about:blank"; }, { timeout: opts.blankResolveMs }).catch(() => {});
      await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {});
    }
    const url = safeUrl(target);
    if (!url || url === "about:blank") {
      // Opened but never became a real page — don't switch to a blank popup.
      return null;
    }
    await target.bringToFront().catch(() => {});
    this.activePage = target;

    const sw: TabSwitch = { url, title: await target.title().catch(() => "") };
    log.info(`followed new tab → ${sw.url}`);
    return sw;
  }

  /** Drop pending new-tab opens without following them. Used when a step opened
   *  a tab we should NOT switch to (e.g. an incidental popup while the main page
   *  navigated, or any tab opened by a non-click step like login). */
  discardPending(): void {
    this.newlyOpened = [];
  }

  dispose(): void {
    this.disposed = true;
    try { this.context.off("page", this.onNewPage); } catch {}
  }
}

function safeUrl(p: Page): string {
  try { return p.url(); } catch { return "unknown"; }
}
