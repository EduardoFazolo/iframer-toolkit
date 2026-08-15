import { describe, test, expect } from "bun:test";
import { EventEmitter } from "events";
import type { BrowserContext, Page } from "patchright";
import { TabTracker } from "../../src/lib/browser/tab-tracker";

class FakePage {
  closed = false;
  private emitter = new EventEmitter();
  constructor(public _url: string, public _title = "") {}
  url() { return this._url; }
  async title() { return this._title; }
  isClosed() { return this.closed; }
  async waitForLoadState() {}
  async waitForURL() {}
  async bringToFront() {}
  on(ev: string, fn: (...a: unknown[]) => void) { this.emitter.on(ev, fn); return this; }
  close() { this.closed = true; this.emitter.emit("close"); }
}

class FakeContext {
  private emitter = new EventEmitter();
  private _pages: FakePage[];
  constructor(initial: FakePage[]) { this._pages = [...initial]; }
  on(ev: string, fn: (...a: unknown[]) => void) { this.emitter.on(ev, fn); return this; }
  off(ev: string, fn: (...a: unknown[]) => void) { this.emitter.off(ev, fn); return this; }
  pages() { return this._pages; }
  waitForEvent(ev: string, opts?: { timeout?: number }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.emitter.off(ev, handler); reject(new Error("timeout")); }, opts?.timeout ?? 0);
      const handler = (p: unknown) => { clearTimeout(timer); resolve(p); };
      this.emitter.once(ev, handler);
    });
  }
  /** Simulate a click opening a new tab. */
  openTab(p: FakePage) { this._pages.push(p); this.emitter.emit("page", p); }
  listenerCount() { return this.emitter.listenerCount("page"); }
}

function make(initialUrl = "https://start.test") {
  const initial = new FakePage(initialUrl);
  const ctx = new FakeContext([initial]);
  const tracker = new TabTracker(ctx as unknown as BrowserContext, initial as unknown as Page);
  return { tracker, ctx, initial };
}

const NO_WAIT = { waitForPendingMs: 0, loadTimeoutMs: 100, blankResolveMs: 100 };

describe("TabTracker", () => {
  test("active() is the initial page when nothing opened", async () => {
    const { tracker, initial } = make();
    expect(tracker.active()).toBe(initial as unknown as Page);
    expect(await tracker.settle(NO_WAIT)).toBeNull();
  });

  test("follows a newly opened tab and reports the switch", async () => {
    const { tracker, ctx, initial } = make();
    const newTab = new FakePage("https://news.test/article", "Article");
    ctx.openTab(newTab); // 'page' event already fired → no wait needed

    const sw = await tracker.settle(NO_WAIT);
    expect(sw).toEqual({ url: "https://news.test/article", title: "Article" });
    expect(tracker.active()).toBe(newTab as unknown as Page);
    expect(tracker.active()).not.toBe(initial as unknown as Page);
  });

  test("waitForPendingMs catches a tab whose event lands during settle", async () => {
    const { tracker, ctx } = make();
    const newTab = new FakePage("https://late.test", "Late");
    const p = tracker.settle({ waitForPendingMs: 1000, loadTimeoutMs: 100, blankResolveMs: 100 });
    ctx.openTab(newTab); // fires after settle registered its waiter
    const sw = await p;
    expect(sw?.url).toBe("https://late.test");
    expect(tracker.active()).toBe(newTab as unknown as Page);
  });

  test("closing the active tab falls back to the previous one", async () => {
    const { tracker, ctx, initial } = make();
    const newTab = new FakePage("https://tab2.test");
    ctx.openTab(newTab);
    await tracker.settle(NO_WAIT);
    expect(tracker.active()).toBe(newTab as unknown as Page);

    newTab.close();
    expect(tracker.active()).toBe(initial as unknown as Page);
  });

  test("follows the NEWEST of several tabs opened in one step", async () => {
    const { tracker, ctx } = make();
    ctx.openTab(new FakePage("https://a.test"));
    ctx.openTab(new FakePage("https://b.test"));
    const sw = await tracker.settle(NO_WAIT);
    expect(sw?.url).toBe("https://b.test");
  });

  test("discardPending() drops an opened tab without following it", async () => {
    const { tracker, ctx, initial } = make();
    ctx.openTab(new FakePage("https://ad.test"));
    tracker.discardPending();
    expect(await tracker.settle(NO_WAIT)).toBeNull();
    expect(tracker.active()).toBe(initial as unknown as Page);
  });

  test("does not switch to a tab that stays about:blank", async () => {
    const { tracker, ctx, initial } = make();
    ctx.openTab(new FakePage("about:blank"));
    expect(await tracker.settle(NO_WAIT)).toBeNull();
    expect(tracker.active()).toBe(initial as unknown as Page);
  });

  test("dispose() removes the context listener and stops following", async () => {
    const { tracker, ctx } = make();
    const before = ctx.listenerCount();
    tracker.dispose();
    expect(ctx.listenerCount()).toBe(before - 1);
    ctx.openTab(new FakePage("https://ignored.test"));
    expect(await tracker.settle(NO_WAIT)).toBeNull();
  });
});
