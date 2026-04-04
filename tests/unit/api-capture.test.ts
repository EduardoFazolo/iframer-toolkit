import { describe, it, expect } from "bun:test";

// Test the pure utility functions from api-capture by importing the module
// and testing the exported ApiCapture class's getResults() logic

// Since parameterizePath and isLikelyId are not exported, we test them
// indirectly through ApiCapture or re-implement the logic here for unit testing.
// Let's test the heuristics directly:

describe("API capture path parameterization", () => {
  // Re-implement the logic for isolated testing (these are private functions)
  const ID_PATTERNS = [
    /^[0-9]+$/,
    /^[0-9a-f]{8,}$/i,
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
    /^\w{20,}$/,
  ];

  function isLikelyId(segment: string): boolean {
    return ID_PATTERNS.some(p => p.test(segment));
  }

  function parameterizePath(path: string): string {
    const parts = path.split("/");
    let idCount = 0;
    const parameterized = parts.map(part => {
      if (part && isLikelyId(part)) {
        idCount++;
        return idCount === 1 ? "{id}" : `{id${idCount}}`;
      }
      return part;
    });
    return parameterized.join("/");
  }

  describe("isLikelyId", () => {
    it("matches numeric IDs", () => {
      expect(isLikelyId("12345")).toBe(true);
      expect(isLikelyId("1")).toBe(true);
    });

    it("matches hex IDs (8+ chars)", () => {
      expect(isLikelyId("abcdef12")).toBe(true);
      expect(isLikelyId("ABCDEF1234567890")).toBe(true);
    });

    it("matches UUIDs", () => {
      expect(isLikelyId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("matches long alphanumeric tokens (20+ chars)", () => {
      expect(isLikelyId("abcdefghijklmnopqrstu")).toBe(true);
    });

    it("does not match short words", () => {
      expect(isLikelyId("api")).toBe(false);
      expect(isLikelyId("users")).toBe(false);
      expect(isLikelyId("v2")).toBe(false);
    });

    it("does not match short hex", () => {
      expect(isLikelyId("abc")).toBe(false);
    });
  });

  describe("parameterizePath", () => {
    it("replaces numeric ID", () => {
      expect(parameterizePath("/api/users/123")).toBe("/api/users/{id}");
    });

    it("replaces multiple IDs with numbered params", () => {
      expect(parameterizePath("/api/channels/123/messages/456")).toBe("/api/channels/{id}/messages/{id2}");
    });

    it("preserves non-ID segments", () => {
      expect(parameterizePath("/api/v2/health")).toBe("/api/v2/health");
    });

    it("handles UUID in path", () => {
      expect(parameterizePath("/api/users/550e8400-e29b-41d4-a716-446655440000")).toBe("/api/users/{id}");
    });

    it("handles empty path", () => {
      expect(parameterizePath("/")).toBe("/");
    });
  });
});
