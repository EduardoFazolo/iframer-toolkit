import { describe, it, expect } from "bun:test";
import type { Page } from "patchright";
import type { ExecutionContext } from "../../src/lib/types";
import { resolveSelector } from "../../src/lib/actions/resolve-selector";
import { StaleStateMonitor, StaleStateError } from "../../src/lib/stale-monitor";
import { capturePageState } from "../../src/lib/page-state";
import { keyboard } from "../../src/lib/actions/handlers/navigation";
import { withBudget, BudgetExceededError } from "../../src/lib/budget";

const ctx = (extra: Partial<ExecutionContext> = {}) => ({ refMap: new Map(), ...extra }) as unknown as ExecutionContext;
const never = () => new Promise<never>(() => {});

/** A page whose JavaScript never answers: evaluate/title/screenshot hang forever. */
function wedgedPage(): Page {
  return { url: () => "https://app.test/x", evaluate: never, title: never, screenshot: never } as unknown as Page;
}

describe("withBudget", () => {
  it("rejects with BudgetExceededError when the call never settles", async () => {
    await expect(withBudget(never(), 20, "probe")).rejects.toBeInstanceOf(BudgetExceededError);
  });
  it("passes through a value that arrives in time", async () => {
    expect(await withBudget(Promise.resolve(7), 1000)).toBe(7);
  });
});

describe("StaleStateMonitor against a wedged tab", () => {
  it("snapshot returns instead of hanging, flagged unresponsive", async () => {
    const snap = await new StaleStateMonitor(wedgedPage()).snapshot();
    expect(snap.unresponsive).toBe(true);
  }, 6_000);

  it("fails a hung step with 'tab stopped responding' instead of waiting for the watchdog", async () => {
    const monitor = new StaleStateMonitor(wedgedPage(), 1_000);
    const err = await monitor.withMonitoring(never).catch((e) => e);
    expect(err).toBeInstanceOf(StaleStateError);
    expect((err as StaleStateError).unresponsive).toBe(true);
    expect((err as Error).message).toContain("tab stopped responding");
  }, 25_000);
});

describe("capturePageState on a wedged tab", () => {
  it("returns url without title/screenshot instead of hanging", async () => {
    const state = await capturePageState(wedgedPage(), ctx(), { screenshot: true });
    expect(state).toEqual({ url: "https://app.test/x", title: "" });
  }, 20_000);
});

describe("Playwright-only selectors are rejected", () => {
  for (const sel of ["text=Generate Credentials", "li[role=option]:text-is('Texas')", "button:has-text('Save')", "div >> text=Hi", "xpath=//a"]) {
    it(`rejects ${sel}`, () => {
      expect(() => resolveSelector(sel, ctx())).toThrow("find");
    });
  }
  for (const sel of ["input[type=text]", "a:visited", "li:has(> span)", "#id.cls > a", "[data-text='x']"]) {
    it(`keeps CSS ${sel}`, () => {
      expect(resolveSelector(sel, ctx())).toBe(sel);
    });
  }
});

describe("keyboard modifiers", () => {
  const recorder = () => {
    const calls: string[] = [];
    const page = {
      evaluate: async () => { calls.push("evaluate"); },
      keyboard: { press: async (k: string) => { calls.push(`press:${k}`); } },
    } as unknown as Page;
    return { page, calls };
  };

  it("Cmd+A selects in-page, no keystroke (works over the relay)", async () => {
    const { page, calls } = recorder();
    await keyboard(page, { type: "keyboard", key: "a", meta: true }, ctx({ driver: "extension" }));
    expect(calls).toEqual(["evaluate"]);
  });

  it("other Cmd/Ctrl shortcuts are refused in extension mode with nothing pressed", async () => {
    const { page, calls } = recorder();
    await expect(keyboard(page, { type: "keyboard", key: "c", ctrl: true }, ctx({ driver: "extension" }))).rejects.toThrow("extension mode");
    expect(calls).toEqual([]);
  });

  it("other modes still press the chord", async () => {
    const { page, calls } = recorder();
    await keyboard(page, { type: "keyboard", key: "c", ctrl: true }, ctx());
    expect(calls).toEqual(["press:Control+c"]);
  });
});
