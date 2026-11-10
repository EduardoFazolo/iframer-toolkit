import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildApiMap, redactCapture, cleanCapture, renderIndex, kitInstructions, kitSource, parseCapture, scanCapture, findLatestCapture,
  type CaptureReport,
} from "../../src/lib/kit/index";

const O = "https://app.example.test";

function report(endpoints: CaptureReport["endpoints"], pathOnly: string[] = []): CaptureReport {
  return {
    kind: "iframer-capture", v: 1, origin: O,
    coverage: { seen: Object.keys(endpoints).length, withPayload: 0, pathOnly: pathOnly.length, complete: false, blindSpots: [] },
    endpoints, pathOnly,
  };
}
const ep = (extra: Partial<CaptureReport["endpoints"][string]> = {}) =>
  ({ kind: "fetch", n: 1, status: [200], query: [], headers: [], auth: [], ...extra });

describe("parseCapture", () => {
  test("rejects non-captures", () => {
    expect(() => parseCapture("nope")).toThrow(/not JSON/);
    expect(() => parseCapture(JSON.stringify({ hello: 1 }))).toThrow(/not an iframer capture/);
    expect(() => parseCapture(JSON.stringify({ kind: "iframer-capture", v: 9, origin: O, endpoints: {}, coverage: {} }))).toThrow(/version 9/);
  });
});

describe("scanCapture", () => {
  test("clean shapes pass", () => {
    const r = report({
      [`POST ${O}/api/orders/{id}`]: ep({ headers: ["x-app-version", "content-type"], auth: ["authorization"], query: ["limit"], req: { json: { email: "string", qty: "number", items: [{ sku: "string" }] } }, res: { "{key}": { id: "number" } } }),
    }, [`${O}/api/boot`]);
    expect(scanCapture(r)).toEqual([]);
  });
  test.each([
    ["email in path", `GET ${O}/api/u/someone@example.com`, "email"],
    ["jwt in path", `GET ${O}/api/t/eyJhbGciOiJIUzI1NiJ9`, "jwt"],
    ["opaque token in path", `GET ${O}/api/k/a8f3K29dLq0vX7bN4mZ2pR6tY1`, "token"],
  ])("flags %s", (_, key, kind) => {
    const f = scanCapture(report({ [key]: ep() }));
    expect(f.map((x) => x.kind)).toContain(kind);
    expect(f[0].sample).not.toContain("example.com");
  });
  test("flags values inside shapes and keys", () => {
    const f = scanCapture(report({ [`GET ${O}/api/x`]: ep({ res: { "person@example.com": "string", note: "+1 415 555 0199" } }) }));
    expect(f.map((x) => x.kind).sort()).toEqual(["email", "phone"]);
  });
});

describe("redactCapture", () => {
  test("separates private values from the reusable API", () => {
    const r = report({
      [`GET https://od-a1b2c3d4e5f6a7b8c9d0e1f2.dnnr.io/v1/someone@example.com/feed`]: ep({ res: { "person@example.com": { id: "number" } } }),
      [`GET ${O}/api/k/a8f3K29dLq0vX7bN4mZ2pR6tY1`]: ep({ n: 2 }),
      [`GET ${O}/api/k/Zz9f3K29dLq0vX7bN4mZ2pR6tY`]: ep({ n: 3, status: [404] }),
      [`GET ${O}/api/file-a8f3K29dLq0vX7bN4mZ2pR6tY1.json`]: ep(),
    }, [`${O}/api/t/eyJhbGciOiJIUzI1NiJ9`]);
    const { report: clean, redacted } = redactCapture(r);
    expect(scanCapture(clean)).toEqual([]);
    expect(Object.keys(clean.endpoints).sort()).toEqual([
      `GET ${O}/api/file-{id}.json`,
      `GET ${O}/api/k/{id}`,
      `GET https://x.dnnr.io/v1/{id}/feed`,
    ]);
    expect(clean.endpoints[`GET ${O}/api/k/{id}`]).toMatchObject({ n: 5, status: [200, 404], redacted: ["token"] });
    expect(clean.endpoints[`GET https://x.dnnr.io/v1/{id}/feed`].res).toEqual({ "{key}": { id: "number" } });
    expect(clean.pathOnly).toEqual([`${O}/api/t/{id}`]);
    expect(redacted.length).toBeGreaterThanOrEqual(4);
    expect(buildApiMap(clean).endpoints.find((e) => e.path === "/api/k/{id}")?.privateValues).toEqual(["token"]);
  });
  test("short host labels are not tokens", () => {
    const r = report({ [`GET https://od-a1b2c3.dnnr.io/api/feed`]: ep() });
    expect(scanCapture(r)).toEqual([]);
  });
});

describe("identity", () => {
  test("api.json says which auth headers a call needs and where they live", () => {
    const r = { ...report({ [`GET ${O}/api/me`]: ep({ auth: ["authorization"] }) }), auth: { headers: {
      authorization: { from: "localStorage" as const, key: "session", path: ["user", "token"], prefix: "Bearer " },
      "x-csrf-token": { from: "memory" as const },
    } } };
    const id = buildApiMap(r).identity;
    expect(id.headers[0]).toEqual({ name: "authorization", source: `localStorage["session -> user.token"] with "Bearer " prefix; __ifk.call attaches it automatically` });
    expect(id.headers[1].source).toContain("page memory");
  });
});

describe("buildApiMap + index", () => {
  const r = report({
    [`GET ${O}/api/items/{id}`]: ep({ query: ["limit"], res: { data: [{ id: "number" }] } }),
    [`GET ${O}/api/items`]: ep({ res: { data: [{ id: "number" }] } }),
    [`POST ${O}/api/orders`]: ep({ req: { json: { sku: "string", qty: "number" } }, res: { id: "number" } }),
    [`DELETE ${O}/api/orders/{id}/lines/{id}`]: ep(),
    [`GET https://cdn.other.test/api/config`]: ep(),
    [`POST ${O}/api/beacon`]: ep({ kind: "beacon" }),
  });
  const map = buildApiMap(r);

  test("names functions from method and path", () => {
    const names = Object.fromEntries(map.endpoints.map((e) => [`${e.method} ${e.path}`, e.functionName]));
    expect(names["GET /api/items/{id}"]).toBe("getItems");
    expect(names["GET /api/items"]).toBe("listItems");
    expect(names["POST /api/orders"]).toBe("createOrders");
    expect(names["DELETE /api/orders/{id}/lines/{id}"]).toBe("deleteOrdersLines");
  });

  test("index lists one line per endpoint, list-holding components first", () => {
    const idx = renderIndex(map);
    expect(idx).toContain("getItems  GET /api/items/{id}  -> {data:{id}[]}");
    expect(idx.split("\n")[0]).toContain("6 endpoints");
  });
});

describe("kit source + instructions", () => {
  test("kit is one self-contained expression with options baked in", () => {
    const src = kitSource({ mode: "passive", hostFilter: "example" });
    expect(src.startsWith("(function pageKit(")).toBe(true);
    expect(src).toMatch(/\(\{"mode":"passive","hostFilter":"example","build":"[0-9a-f]{10}"\}, \(function recipeCore\(/);
    expect(src).not.toMatch(/\beval\(|new Function/);
  });
  test("T3 steps use upload + sessionStorage + top-level eval", () => {
    const t = kitInstructions("t3", "/k/iframer-kit.js");
    expect(t).toContain(`paths=["/k/iframer-kit.js"]`);
    expect(t).toContain("eval((window.sessionStorage||");
    expect(t).toContain("__ifk_ss"); // fallback for sites that delete sessionStorage
    expect(t).toContain("iframer ingest --latest");
  });
});

test("findLatestCapture sniffs contents, ignores names and old files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-find-"));
  const sub = path.join(dir, "profilehash");
  fs.mkdirSync(sub);
  const cap = '{"kind":"iframer-capture","v":1}';
  fs.writeFileSync(path.join(sub, "older"), cap);
  fs.utimesSync(path.join(sub, "older"), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  fs.writeFileSync(path.join(sub, "newer"), cap);
  fs.writeFileSync(path.join(sub, "newest-but-not-capture.json"), "{}");
  fs.writeFileSync(path.join(sub, "ancient"), cap);
  fs.utimesSync(path.join(sub, "ancient"), new Date(0), new Date(0));
  expect(findLatestCapture([dir])).toBe(path.join(sub, "newer"));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("cleanCapture", () => {
  test("keeps the site's API, merges by named param and action id", () => {
    const r = report({
      [`GET ${O}/{communitySlug}/dashboard/groups`]: ep({ n: 1 }),
      [`GET ${O}/dougco/dashboard/groups`]: ep({ n: 2 }),
      [`GET ${O}/sunny/dashboard/groups`]: ep({ n: 3 }),
      [`GET ${O}/admin/dashboard/campaigns`]: ep(),
      [`GET ${O}/admin/dashboard/settings`]: ep(),
      [`POST ${O}/a/x#getCredits`]: ep({ next: { action: "4008140f", name: "getCredits" } }),
      [`POST ${O}/b/y#getCredits`]: ep({ n: 4, next: { action: "4008140f", name: "getCredits" } }),
      [`GET ${O}/_next/static/chunks/main.js`]: ep(),
      [`POST https://us.i.posthog.com/e`]: ep(),
      [`GET https://api.example.test/v1/me`]: ep(),
    }, [`https://maps.googleapis.com/x`, `${O}/api/boot`]);
    const { report: c, dropped } = cleanCapture(r);
    const keys = Object.keys(c.endpoints).map((k) => k.replace(O, "")).sort();
    expect(keys).toEqual([
      "GET /admin/dashboard/campaigns",
      "GET /admin/dashboard/settings",
      "GET /{communitySlug}/dashboard/groups",
      "GET https://api.example.test/v1/me",
      "POST /a/x#getCredits",
    ]);
    expect(c.endpoints[`GET ${O}/{communitySlug}/dashboard/groups`].n).toBe(6);
    expect(c.endpoints[`POST ${O}/a/x#getCredits`].n).toBe(5);
    expect(dropped.length).toBe(2);
    expect(c.pathOnly).toEqual([`${O}/api/boot`]);
    const idx = renderIndex(buildApiMap(c)).split("\n");
    expect(idx[0]).toContain("5 endpoints");
    expect(idx.some((l) => l.startsWith("getCredits  action getCredits"))).toBe(true);
  });
});

test("recipe bundles and add snippets are valid JS", () => {
  const { renderRecipes, addSnippet } = require("../../src/lib/kit/recipes");
  const spec = { name: "x", host: "h", path: "/a/{b}", rsc: true, find: "T", pick: "data.items.{id}", where: "n>0", group: "s", format: "d => d.count + ' ok'" };
  expect(() => new Function(renderRecipes([spec]))).not.toThrow();
  expect(() => new Function(addSnippet(spec))).not.toThrow();
});


test("loading a bundle replaces the recipes of an older one, and an outdated tab refuses new recipes", () => {
  const { renderRecipes, addSnippet } = require("../../src/lib/kit/recipes");
  const g: any = { __ifkRecipes: { cost: () => 0, oldRecipe: () => 0, __runtime: "old" }, localStorage: undefined, document: undefined };
  new Function("window", "document", renderRecipes([{ name: "a", host: "h", path: "/x" }]))(g, undefined);
  expect(Object.keys(g.__ifkRecipes).filter((k) => !k.startsWith("__"))).toEqual(["a"]);
  g.__ifkRecipes.__runtime = "stale";
  const snippet = addSnippet({ name: "b", host: "h", path: "/y" }).replace(/^__ifkRecipes/, "window.__ifkRecipes");
  expect(new Function("window", `return ${snippet}`)(g)).toMatch(/runtime outdated/);
});
