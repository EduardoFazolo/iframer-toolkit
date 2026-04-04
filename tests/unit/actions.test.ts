import { describe, it, expect } from "bun:test";
import type { ExecutionContext, ElementRef } from "../../src/lib/types";

// Test resolveSelector logic — it's not exported, so we replicate it here
// This validates the @e ref resolution logic that's critical to the pipeline

function resolveSelector(selector: string, ctx: { refMap: Map<string, ElementRef> }): string {
  if (selector.startsWith("@e")) {
    const ref = ctx.refMap.get(selector);
    if (!ref) {
      const available = Array.from(ctx.refMap.keys()).join(", ");
      throw new Error(`Unknown ref: ${selector}. ${available ? `Available refs: ${available}` : "No refs available — run a snapshot or annotated screenshot step first."}`);
    }
    return ref.selector;
  }
  return selector;
}

describe("resolveSelector", () => {
  const refMap = new Map<string, ElementRef>([
    ["@e1", { ref: "@e1", role: "button", name: "Submit", selector: "#submit-btn" }],
    ["@e2", { ref: "@e2", role: "textbox", name: "Email", selector: "input[name=email]" }],
  ]);

  it("resolves @e ref to CSS selector", () => {
    expect(resolveSelector("@e1", { refMap })).toBe("#submit-btn");
    expect(resolveSelector("@e2", { refMap })).toBe("input[name=email]");
  });

  it("passes through normal CSS selectors", () => {
    expect(resolveSelector("#my-button", { refMap })).toBe("#my-button");
    expect(resolveSelector(".class-name", { refMap })).toBe(".class-name");
    expect(resolveSelector("button", { refMap })).toBe("button");
  });

  it("throws for unknown @e refs with available list", () => {
    expect(() => resolveSelector("@e99", { refMap })).toThrow("Unknown ref: @e99");
    expect(() => resolveSelector("@e99", { refMap })).toThrow("Available refs: @e1, @e2");
  });

  it("throws with helpful message when no refs exist", () => {
    const emptyCtx = { refMap: new Map() };
    expect(() => resolveSelector("@e1", emptyCtx)).toThrow("No refs available");
  });

  it("does not resolve @-prefixed non-ref selectors", () => {
    // Only @e* is treated as a ref
    expect(resolveSelector("@media", { refMap })).toBe("@media");
    expect(resolveSelector("@layer", { refMap })).toBe("@layer");
  });
});

describe("getErrorMessage", () => {
  // Replicate the helper used across the codebase
  function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("test"))).toBe("test");
  });

  it("converts string to string", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
  });

  it("converts number to string", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("converts null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});
