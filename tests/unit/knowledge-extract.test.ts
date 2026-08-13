import { describe, test, expect, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

// Isolate the knowledge store to a temp dir BEFORE importing anything that reads it.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-knowledge-test-"));
process.env.IFRAMER_DATA_DIR = TMP_DIR;

const { extractKnowledgeFromRun } = await import("../../src/lib/knowledge/extract-from-run");
const { parseKnowledge } = await import("../../src/lib/knowledge");
import type { Pipeline, PipelineResult } from "../../src/lib/types";
import type { SessionData } from "../../src/lib/session/persistence";

afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

function navPipeline(url: string): Pipeline {
  return { steps: [{ type: "navigate", url }] };
}

function okResult(): PipelineResult {
  return {
    ok: true,
    completedSteps: 1,
    totalSteps: 1,
    results: [],
    finalState: { url: "", title: "" },
    obstacles: [],
    durationMs: 1,
  };
}

describe("extractKnowledgeFromRun", () => {
  test("collects cookie + localStorage keys scoped to the domain", () => {
    const session: SessionData = {
      cookies: [
        { name: "sid", value: "x", domain: "figma.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
        { name: "other", value: "y", domain: "unrelated.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
      ],
      localStorage: { "https://figma.com": { token: "abc" } },
      sessionStorage: {},
      extractedAt: new Date().toISOString(),
    };
    extractKnowledgeFromRun(navPipeline("https://figma.com/files"), okResult(), session, "headless");

    const k = parseKnowledge("figma.com");
    expect(k).not.toBeNull();
    expect(k!.auth.cookieNames).toContain("sid");
    expect(k!.auth.cookieNames).not.toContain("other");
    expect(k!.auth.localStorageKeys).toContain("token");
    expect(k!.auth.type).toBe("cookies+localStorage");
  });

  // KNOWN BUG (documented current behavior, fix belongs in a separate PR):
  // domain matching uses endsWith/includes with no label boundary, so a cookie
  // for a look-alike domain like `evil-figma.com` is wrongly attributed to
  // `figma.com`. Correct check: `d === root || d.endsWith("." + root)`.
  test("KNOWN BUG: look-alike domain cookie leaks into the root's knowledge", () => {
    const session: SessionData = {
      cookies: [
        { name: "evil", value: "z", domain: "evil-figma.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
      ],
      localStorage: {},
      sessionStorage: {},
      extractedAt: new Date().toISOString(),
    };
    extractKnowledgeFromRun(navPipeline("https://figma.com/"), okResult(), session, "headless");

    const k = parseKnowledge("figma.com");
    // Asserts the CURRENT (buggy) behavior so a future boundary-fix flips this test on purpose.
    expect(k!.auth.cookieNames).toContain("evil");
  });
});
