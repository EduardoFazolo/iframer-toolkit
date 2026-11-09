import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildApiMap, redactCapture, kitInstructions, kitSource, parseCapture, renderClient, renderTypes, scanCapture, findLatestCapture,
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
  test("accepts spike v1 files without the kind marker", () => {
    const r = parseCapture(JSON.stringify({ v: 1, origin: O, endpoints: {}, coverage: { seen: 0 } }));
    expect(r.pathOnly).toEqual([]);
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

describe("buildApiMap + client", () => {
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

  test("client wraps same-origin calls and skips the rest", () => {
    const js = renderClient(map);
    expect(js).toContain(`getItems: function (id, query, opts) { return c("GET", "/api/items/" + encodeURIComponent(id) + q(query), opts); }`);
    expect(js).toContain(`deleteOrdersLines: function (id, id2, query, opts)`);
    expect(js).toContain(`Object.assign({ json: body }, opts)`);
    expect(js).toContain("Not wrapped:");
    expect(js).not.toContain("cdn.other.test/api/config\"");
    // Valid JS that defines window.__ifkApi when run after the kit.
    const calls: unknown[] = [];
    const window: any = { __ifk: { call: (...a: unknown[]) => (calls.push(a), Promise.resolve({ status: 200 })) } };
    const fns = new Function("window", "URLSearchParams", `return ${js.replace(/^\/\/.*$/gm, "").trim()}`)(window, URLSearchParams);
    expect(fns).toContain("createOrders");
    window.__ifkApi.getItems(7, { limit: 2 });
    window.__ifkApi.createOrders({ sku: "a" }, null, { approved: true });
    expect(calls).toEqual([["GET", "/api/items/7?limit=2", undefined], ["POST", "/api/orders", { json: { sku: "a" }, approved: true }]]);
  });

  test("types describe the shapes", () => {
    const d = renderTypes(map);
    expect(d).toContain("createOrders(body: {");
    expect(d).toContain("sku?: string;");
    expect(d).toContain("declare global { interface Window { __ifkApi: IfkApi } }");
  });
});

describe("kit source + instructions", () => {
  test("kit is one self-contained expression with options baked in", () => {
    const src = kitSource({ mode: "passive", hostFilter: "example" });
    expect(src.startsWith("(function pageKit(")).toBe(true);
    expect(src).toMatch(/\(\{"mode":"passive","hostFilter":"example","build":"[0-9a-f]{10}"\}\);/);
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
