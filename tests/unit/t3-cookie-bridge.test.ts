import { describe, expect, test } from "bun:test";
import { t3BridgeConfig, t3BridgeConfigured, t3BridgeJars, T3_COOKIE_PATH } from "../../src/lib/kit/t3-cookie-bridge";

describe("t3BridgeConfig", () => {
  test("is null with no relevant env (the common no-op case)", () => {
    expect(t3BridgeConfig({})).toBeNull();
    expect(t3BridgeConfigured({})).toBe(false);
  });

  test("an explicit URL wins and carries the token", () => {
    const cfg = t3BridgeConfig({ IFRAMER_T3_COOKIE_URL: "http://127.0.0.1:3773/x/cookies", T3_ACP_MCP_AUTHORIZATION: "Bearer abc" });
    expect(cfg).toEqual({ url: "http://127.0.0.1:3773/x/cookies", token: "Bearer abc" });
  });

  test("a base + token builds the documented path", () => {
    const cfg = t3BridgeConfig({ IFRAMER_T3_BASE_URL: "http://127.0.0.1:3773/", T3_LOCAL_BEARER: "tok" });
    expect(cfg).toEqual({ url: "http://127.0.0.1:3773" + T3_COOKIE_PATH, token: "tok" });
  });

  test("derives the base from T3_ACP_MCP_ENDPOINT origin", () => {
    const cfg = t3BridgeConfig({ T3_ACP_MCP_ENDPOINT: "http://127.0.0.1:3773/api/mcp", T3_ACP_MCP_AUTHORIZATION: "tok" });
    expect(cfg?.url).toBe("http://127.0.0.1:3773" + T3_COOKIE_PATH);
  });

  test("a base without any token is not usable (server needs auth)", () => {
    expect(t3BridgeConfig({ IFRAMER_T3_BASE_URL: "http://127.0.0.1:3773" })).toBeNull();
  });
});

describe("t3BridgeJars", () => {
  const env = { IFRAMER_T3_COOKIE_URL: "http://127.0.0.1:3773/cookies", IFRAMER_T3_COOKIE_TOKEN: "tok" };

  test("returns [] when unconfigured, without calling fetch", async () => {
    let called = false;
    const jars = await t3BridgeJars("example.com", { env: {}, fetchImpl: (async () => { called = true; return new Response("[]"); }) as any });
    expect(jars).toEqual([]);
    expect(called).toBe(false);
  });

  test("turns the endpoint's cookies into one jar, sending a Bearer header", async () => {
    let seen: any = null;
    const fetchImpl = (async (url: string, init: any) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({ cookies: [
          { name: "sid", value: "s3cr3t", domain: ".example.com", path: "/", httpOnly: true },
          { name: "other", value: "x", domain: "notme.org", path: "/" },
        ] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;
    const jars = await t3BridgeJars("app.example.com", { env, fetchImpl });
    expect(jars.length).toBe(1);
    expect(jars[0].source).toBe("T3 Code session (bridge)");
    // The cross-domain cookie is dropped; the HttpOnly one is kept.
    expect(jars[0].cookies.map((c) => c.name)).toEqual(["sid"]);
    expect(seen.url).toBe("http://127.0.0.1:3773/cookies");
    expect(seen.init.headers.authorization).toBe("Bearer tok");
  });

  test("drops expired cookies and keeps session cookies", async () => {
    const past = Math.floor(Date.now() / 1000) - 100;
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ cookies: [
        { name: "dead", value: "1", domain: "example.com", expires: past },
        { name: "sess", value: "2", domain: "example.com" },
        { name: "live", value: "3", domain: "example.com", expires: Math.floor(Date.now() / 1000) + 9999 },
      ] }), { status: 200 })) as any;
    const jars = await t3BridgeJars("example.com", { env, fetchImpl });
    expect(jars[0].cookies.map((c) => c.name).sort()).toEqual(["live", "sess"]);
  });

  test("a non-ok response yields [] (caller falls back to disk)", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as any;
    expect(await t3BridgeJars("example.com", { env, fetchImpl })).toEqual([]);
  });

  test("a thrown fetch is swallowed to []", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as any;
    expect(await t3BridgeJars("example.com", { env, fetchImpl })).toEqual([]);
  });
});
