import { describe, test, expect } from "bun:test";
import type { Page } from "patchright";
import { ApiCapture } from "../../src/lib/api-capture";

/** Minimal fake that records which event listeners are currently attached. */
class Listenable {
  handlers = new Map<string, Set<(...a: unknown[]) => void>>();
  on(ev: string, fn: (...a: unknown[]) => void) { (this.handlers.get(ev) ?? this.handlers.set(ev, new Set()).get(ev)!).add(fn); return this; }
  off(ev: string, fn: (...a: unknown[]) => void) { this.handlers.get(ev)?.delete(fn); return this; }
  count(ev: string) { return this.handlers.get(ev)?.size ?? 0; }
}

class FakePage extends Listenable {
  constructor(private ctx: FakeContext) { super(); }
  context() { return this.ctx; }
}

class FakeContext extends Listenable {
  emitPage(p: FakePage) { for (const fn of this.handlers.get("page") ?? []) fn(p); }
}

describe("ApiCapture multi-tab hooking", () => {
  test("hooks the initial page and follows tabs opened during capture", () => {
    const ctx = new FakeContext();
    const initial = new FakePage(ctx);
    const cap = new ApiCapture(initial as unknown as Page);

    // Before start: nothing hooked.
    expect(initial.count("request")).toBe(0);
    expect(ctx.count("page")).toBe(0);

    cap.start();
    expect(initial.count("request")).toBe(1);
    expect(initial.count("response")).toBe(1);
    expect(ctx.count("page")).toBe(1); // listening for new tabs

    // A new tab opens mid-capture → it gets hooked too.
    const newTab = new FakePage(ctx);
    ctx.emitPage(newTab);
    expect(newTab.count("request")).toBe(1);
    expect(newTab.count("response")).toBe(1);

    // Stop unhooks every page and stops listening for new tabs.
    cap.stop();
    expect(initial.count("request")).toBe(0);
    expect(initial.count("response")).toBe(0);
    expect(newTab.count("request")).toBe(0);
    expect(newTab.count("response")).toBe(0);
    expect(ctx.count("page")).toBe(0);
  });
});
