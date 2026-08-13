import { describe, it, expect } from "bun:test";
import type { ElementRef, ExecutionContext } from "../../src/lib/types";
import { resolveSelector } from "../../src/lib/actions/resolve-selector";
import { registeredStepTypes } from "../../src/lib/actions/registry";
import { getErrorMessage } from "../../src/lib/errors";
import { stepSchema } from "../../src/mcp/tools/step-schema";

/** Minimal ExecutionContext for pure-function tests. */
function ctxWith(refMap: Map<string, ElementRef>): ExecutionContext {
  return { refMap } as unknown as ExecutionContext;
}

describe("resolveSelector", () => {
  const refMap = new Map<string, ElementRef>([
    ["@e1", { ref: "@e1", role: "button", name: "Submit", selector: "#submit-btn" }],
    ["@e2", { ref: "@e2", role: "textbox", name: "Email", selector: "input[name=email]" }],
  ]);

  it("resolves @e ref to CSS selector", () => {
    expect(resolveSelector("@e1", ctxWith(refMap))).toBe("#submit-btn");
    expect(resolveSelector("@e2", ctxWith(refMap))).toBe("input[name=email]");
  });

  it("passes through normal CSS selectors", () => {
    expect(resolveSelector("#my-button", ctxWith(refMap))).toBe("#my-button");
    expect(resolveSelector(".class-name", ctxWith(refMap))).toBe(".class-name");
    expect(resolveSelector("button", ctxWith(refMap))).toBe("button");
  });

  it("throws for unknown @e refs with available list", () => {
    expect(() => resolveSelector("@e99", ctxWith(refMap))).toThrow("Unknown ref: @e99");
    expect(() => resolveSelector("@e99", ctxWith(refMap))).toThrow("Available refs: @e1, @e2");
  });

  it("throws with helpful message when no refs exist", () => {
    expect(() => resolveSelector("@e1", ctxWith(new Map()))).toThrow("No refs available");
  });

  it("does not resolve @-prefixed non-ref selectors", () => {
    expect(resolveSelector("@media", ctxWith(refMap))).toBe("@media");
    expect(resolveSelector("@layer", ctxWith(refMap))).toBe("@layer");
  });
});

describe("step handler registry", () => {
  // The set of step types the zod input schema accepts.
  const schemaTypes = stepSchema.options.map((o) => o.shape.type.value as string).sort();

  it("registers a handler for exactly the step types the schema accepts", () => {
    const registered = [...registeredStepTypes].sort();
    expect(registered).toEqual(schemaTypes);
  });

  it("has no duplicate registrations", () => {
    expect(new Set(registeredStepTypes).size).toBe(registeredStepTypes.length);
  });
});

describe("getErrorMessage", () => {
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
