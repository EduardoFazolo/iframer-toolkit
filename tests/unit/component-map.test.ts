import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import type { Anchor, ExecutionContext } from "../../src/lib/types";
import { resolveSelector } from "../../src/lib/actions/resolve-selector";

// Isolate the anchors store in a temp data dir (getKnowledgeDir → getDataDir → IFRAMER_DATA_DIR).
let tmp: string;
let store: typeof import("../../src/lib/knowledge/component-map");

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-anchors-"));
  process.env.IFRAMER_DATA_DIR = tmp;
  // Fresh import so getDataDir picks up the env (module has no cached dir, but be safe).
  store = await import("../../src/lib/knowledge/component-map");
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  delete process.env.IFRAMER_DATA_DIR;
});

const NOW = "2026-08-24T00:00:00.000Z";

describe("component-map store", () => {
  it("saves and loads an anchor per domain", () => {
    store.saveAnchor("app.slack.com", { name: "composer", selector: '[aria-label^="Message"]', role: "textbox" }, NOW);
    const anchors = store.loadAnchors("app.slack.com");
    expect(anchors.get("composer")?.selector).toBe('[aria-label^="Message"]');
    expect(anchors.get("composer")?.uses).toBe(0);
  });

  it("normalizes domain (www / subdomain host key stable)", () => {
    store.saveAnchor("slack.com", { name: "send", selector: "button.send" }, NOW);
    // normalizeDomain strips leading www; same file for www.slack.com
    expect(store.loadAnchors("www.slack.com").get("send")?.selector).toBe("button.send");
  });

  it("records use/fail as self-heal signal", () => {
    store.saveAnchor("x.com", { name: "btn", selector: "#b" }, NOW);
    store.recordAnchorResult("x.com", "btn", true, NOW);
    store.recordAnchorResult("x.com", "btn", false, NOW);
    const a = store.loadAnchors("x.com").get("btn") as Anchor;
    expect(a.uses).toBe(1);
    expect(a.fails).toBe(1);
  });

  it("overwriting resets health counters", () => {
    store.saveAnchor("x.com", { name: "btn", selector: "#old" }, NOW);
    store.recordAnchorResult("x.com", "btn", false, NOW);
    store.saveAnchor("x.com", { name: "btn", selector: "#new" }, NOW); // re-verified
    const a = store.loadAnchors("x.com").get("btn") as Anchor;
    expect(a.selector).toBe("#new");
    expect(a.fails).toBe(0);
  });

  it("forget removes an anchor", () => {
    store.saveAnchor("x.com", { name: "btn", selector: "#b" }, NOW);
    expect(store.removeAnchor("x.com", "btn")).toBe(true);
    expect(store.loadAnchors("x.com").has("btn")).toBe(false);
  });
});

describe("resolveSelector @a: anchors", () => {
  function ctxWithAnchors(anchors: Map<string, Anchor>): ExecutionContext {
    return { anchors, anchorDomain: "app.slack.com", refMap: new Map() } as unknown as ExecutionContext;
  }

  it("resolves @a:<name> to the stored selector", () => {
    const anchors = new Map<string, Anchor>([
      ["composer", { name: "composer", selector: '[aria-label^="Message"]', uses: 0, fails: 0, lastVerified: NOW }],
    ]);
    expect(resolveSelector("@a:composer", ctxWithAnchors(anchors))).toBe('[aria-label^="Message"]');
  });

  it("throws a self-heal message on unknown anchor", () => {
    const anchors = new Map<string, Anchor>();
    expect(() => resolveSelector("@a:nope", ctxWithAnchors(anchors))).toThrow(/remember/);
  });

  it("passes plain CSS through unchanged", () => {
    expect(resolveSelector("#plain", ctxWithAnchors(new Map()))).toBe("#plain");
  });
});
