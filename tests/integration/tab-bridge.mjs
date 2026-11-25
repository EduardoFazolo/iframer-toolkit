// Tab bridge end to end. Local fixture only, no real site.
//   1. The daemon against fake tabs (plain WebSocket clients): what it refuses, and what it carries.
//   2. Real headless Chrome: the relay is attached with one evaluate call (as T3 Code's preview_evaluate does, CDP
//      Runtime.evaluate), and a generated client.mjs then reads a logged-in page with no cookie anywhere in Node.
// Run: bun tests/integration/tab-bridge.mjs      BRIDGE_CLI=dist/cli.js tests the built bundles instead of the source.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import WebSocket from "ws";
import { chromium } from "playwright-core";
import { startFixture, SECRETS } from "../fixtures/kit-fixture.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "ifb-data-"));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const PORT = await freePort();
process.env.IFRAMER_DATA_DIR = data;
process.env.IFRAMER_BRIDGE_PORT = String(PORT);

const kit = await import("../../src/lib/kit/index.ts");
const bridge = await import("../../src/lib/tabbridge/index.ts");
const state = await import("../../src/lib/tabbridge/state.ts");
const { findChrome } = await import("../../src/lib/browser/chrome-downloader.ts");

const CLI = process.env.BRIDGE_CLI ? path.resolve(ROOT, process.env.BRIDGE_CLI) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ""}`); }
}
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(100); } };

// The CLI as an agent runs it: the built bundle, or the source under bun.
const cli = (args, env = {}) => {
  const [cmd, a] = CLI ? ["node", [CLI, ...args]] : ["bun", [path.join(ROOT, "bin/cli.js"), ...args]];
  try { return execFileSync(cmd, a, { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (e) { return `EXIT ${e.status}: ${(e.stdout || "") + (e.stderr || "")}`.trim(); }
};

// ── 1. The daemon against fake tabs ───────────────────────────────────────
console.log("daemon, fake tabs");
// With BRIDGE_CLI the daemon is the built bundle (dist/bridge-server.cjs), started by the built CLI.
const startDaemon = async () => { if (CLI) cli(["bridge", "attach", "boot.example.com", "--print"]); return bridge.start(); };
let st = await startDaemon();
check("daemon starts and writes its state (0600)", st.port === PORT && st.token.length === 48 && (process.platform === "win32" || (fs.statSync(path.join(data, "bridge.json")).mode & 0o777) === 0o600), st);
check("key file is 0600", process.platform === "win32" || (fs.statSync(path.join(data, "bridge.key")).mode & 0o777) === 0o600);
const same = await bridge.start();
check("start again reuses the running daemon", same.pid === st.pid, same);

const base = `http://127.0.0.1:${PORT}`;
const call = (route, body, headers = {}) => fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${st.token}`, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const viaTab = async (url, init = {}) => { const r = await call("/fetch", { url, ...init }); return { http: r.status, ...(await r.json()) }; };

check("no token -> 401", (await fetch(base + "/status")).status === 401);
check("wrong token -> 401", (await fetch(base + "/status", { headers: { Authorization: "Bearer nope" } })).status === 401);
check("a request with an Origin (a web page) -> 403, even with the token", (await call("/status", undefined, { Origin: "https://evil.example" })).status === 403);
const rawHost = await new Promise((ok) => {
  const req = http.request({ host: "127.0.0.1", port: PORT, path: "/status", headers: { Host: "evil.example", Authorization: `Bearer ${st.token}` } }, (res) => { res.resume(); ok(res.statusCode); });
  req.on("error", () => ok(0)); req.end();
});
check("a foreign Host header (DNS rebinding) -> 403", rawHost === 403, rawHost);
check("no /health for the extension's port scan to find", (await fetch(base + "/health")).status !== 200);

const master = fs.readFileSync(path.join(data, "bridge.key"), "utf8").trim();
const key = (site, name = "default", ro = false) => state.tabKey(master, site, name, ro);
// A fake tab: a WebSocket client that says which page it is (Origin) and answers like the relay.
function fakeTab({ site, origin, k, name = "default", ro = false, answer = (q) => ({ status: 200, type: "basic", headers: { "content-type": "text/plain" }, body64: Buffer.from(`${q.method} ${q.url}`).toString("base64") }) }) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/relay?s=${encodeURIComponent(site)}&n=${name}${ro ? "&ro=1" : ""}&k=${k}`, { headers: origin ? { Origin: origin } : {} });
  const t = { ws, got: [], opened: new Promise((ok) => { ws.on("open", () => ok(true)); ws.on("error", () => ok(false)); ws.on("unexpected-response", () => ok(false)); }) };
  ws.on("message", (d) => {
    const q = JSON.parse(String(d));
    t.got.push(q);
    ws.send(JSON.stringify({ id: q.id, ack: 1 }));
    ws.send(JSON.stringify({ id: q.id, ...answer(q) }));
  });
  return t;
}
const refused = async (o) => !(await fakeTab(o).opened);
check("relay with a wrong key is refused", await refused({ site: "app.example.com", origin: "https://app.example.com", k: "0".repeat(32) }));
check("relay from another site's page is refused, even with a valid key", await refused({ site: "app.example.com", origin: "https://evil.example", k: key("app.example.com") }));
check("one site's key opens nothing for another site", await refused({ site: "other.example.com", origin: "https://other.example.com", k: key("app.example.com") }));
check("relay without an Origin is refused", await refused({ site: "app.example.com", origin: null, k: key("app.example.com") }));
check("a page can't drop its own read-only limit", await refused({ site: "app.example.com", origin: "https://app.example.com", k: key("app.example.com", "default", true) }));
check("a plain-http page is refused", await refused({ site: "app.example.com", origin: "http://app.example.com", k: key("app.example.com") }));

let r = await viaTab("https://app.example.com/x");
check("nothing attached -> 503 (the caller uses its saved session)", r.http === 503 && /no tab attached/.test(r.error), r);

const a = fakeTab({ site: "app.example.com", origin: "https://app.example.com", k: key("app.example.com") });
check("relay with its site's key and Origin is accepted", await a.opened);
r = await viaTab("https://app.example.com/x?y=1", { headers: { "x-test": "1" } });
check("a request is carried by the tab", r.http === 200 && Buffer.from(r.body64, "base64").toString() === "GET https://app.example.com/x?y=1" && a.got[0].headers["x-test"] === "1" && a.got[0].notAfter > Date.now() - 100, r);
r = await viaTab("https://other.example.com/x");
check("a request for another site never reaches this tab", r.http === 503 && a.got.length === 1, r);
r = await viaTab("https://evil.example/app.example.com");
check("...whatever its path says", r.http === 503 && a.got.length === 1, r);

const b = fakeTab({ site: "app.example.com", origin: "https://sub.app.example.com", k: key("app.example.com") });
await b.opened;
r = await viaTab("https://app.example.com/2");
check("a second tab attaches, the older one stays, the newest answers", r.http === 200 && b.got.length === 1 && a.ws.readyState === WebSocket.OPEN && (await (await call("/status")).json()).tabs.length === 2, r);
b.ws.close(); await sleep(100);
r = await viaTab("https://app.example.com/3");
check("...and the older one still answers when the newest is gone", r.http === 200 && a.got.length === 2, r);

const ro = fakeTab({ site: "ro.example.com", origin: "https://ro.example.com", k: key("ro.example.com", "default", true), ro: true });
await ro.opened;
r = await viaTab("https://ro.example.com/x", { method: "POST", body: "{}" });
check("a read-only tab: the daemon refuses a write before it reaches the tab", r.http === 200 && /read-only/.test(r.error) && ro.got.length === 0, r);
check("...and still reads", (await viaTab("https://ro.example.com/x")).status === 200);

const named = fakeTab({ site: "app.example.com", origin: "https://app.example.com", k: key("app.example.com", "work"), name: "work" });
await named.opened;
r = await viaTab("https://app.example.com/n", { tab: "work" });
check("--name: a request for tab \"work\" goes to that tab only", r.http === 200 && named.got.length === 1 && a.got.length === 2, r);

let text = cli(["bridge", "status"]);
check("iframer bridge status lists the attached sites", /tab bridge running/.test(text) && /app\.example\.com/.test(text) && /ro\.example\.com \(.*read-only/.test(text) && /name work/.test(text), text);
for (const t of [a, ro, named]) t.ws.close();
await sleep(100);
text = cli(["bridge", "status"]);
check("...and says when a tab detached", /detached: app\.example\.com/.test(text), text);

text = cli(["bridge", "attach", "com"]);
check("attach refuses a bare suffix as a site", /^EXIT 1/.test(text) && /not a site/.test(text), text);
text = cli(["bridge", "attach", "app.example.com", "--site", "other.com"]);
check("attach refuses a --site that does not cover the host", /^EXIT 1/.test(text) && /does not cover/.test(text), text);
text = cli(["bridge", "attach", "www.example.com", "--for", "playwright-mcp", "--read-only", "--name", "work"]);
check("attach prints the steps for the chosen tool", /browser_evaluate/.test(text) && /example\.com and its subdomains/.test(text) && /read-only/.test(text) && /"ro":1/.test(text) && text.includes(key("example.com", "work", true)), text);

// ── 2. Real Chrome: the relay, client.mjs through the tab ─────────────────
console.log("real Chrome");
const { server, log, port } = await startFixture();
const origin = `http://127.0.0.1:${port}`;
const host = kit.normalizeHost(origin);
const browser = await chromium.launch({ headless: true, executablePath: findChrome() || undefined });
async function openTab(pathname) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(origin + pathname, { waitUntil: "load" });
  // preview_evaluate: CDP Runtime.evaluate {awaitPromise, returnByValue}
  const evaluate = async (expression) => {
    const res = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error((res.exceptionDetails.exception?.description ?? res.exceptionDetails.text).split("\n")[0]);
    return res.result.value ?? null;
  };
  return { context, page, evaluate };
}
const attachText = cli(["bridge", "attach", host]);
const EXPR = attachText.slice(attachText.indexOf("Expression:\n") + "Expression:\n".length);
check("attach prints one expression for the tab", EXPR.startsWith("(function") && /preview_evaluate/.test(attachText), attachText.slice(0, 300));
console.log(`    (relay expression: ${EXPR.length} chars)`);

// What ingest leaves for the site, as in kit-node-client.mjs. No .env: there is no cookie anywhere in Node.
const dir = kit.apisDir(host);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "api.json"), JSON.stringify({ origin, endpoints: [
  { method: "GET", origin, path: "/api/private", functionName: "getPrivate" },
  { method: "GET", origin, path: "/{community}/dashboard/campaigns", rsc: true, functionName: "campaigns" },
  { method: "POST", origin, path: "/acme/dashboard", functionName: "getRestaurants", action: { name: "getRestaurants", id: "f".repeat(40) } },
] }));
fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ authorization: { from: "localStorage", key: "session", json: true, path: ["user", "token"], prefix: "Bearer " } }));
kit.writeOutputs(host);
kit.saveRecipe({ name: "activeCampaigns", host, path: "/{community}/dashboard/campaigns", rsc: true, find: "campaigns", pick: "campaigns.{title}", where: "active=true", count: true });
const client = path.join(dir, "client.mjs");
// A stub iframer: if the client ever asks for a cookie (iframer auth), this file appears.
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ifb-bin-"));
const asked = path.join(bin, "asked");
fs.writeFileSync(path.join(bin, "iframer"), `#!/bin/sh\necho "$@" >> "${asked}"\nexit 1\n`, { mode: 0o755 });
const exec = (file, args, env = {}) => new Promise((ok) => {
  const c = spawn("node", [file, ...args], { env: { PATH: process.env.PATH, HOME: os.homedir(), IFRAMER_DATA_DIR: data, IFRAMER_BIN: path.join(bin, "iframer"), ...env } });
  let o = "";
  c.stdout.on("data", (d) => (o += d)); c.stderr.on("data", (d) => (o += d));
  c.on("close", () => ok(o.trim()));
});
const node = (args, env) => exec(client, args, env);

try {
  r = await node(["get", "/api/private"]);
  check("no tab attached: client.mjs runs as before (asks iframer auth, then 401)", /401/.test(r) && fs.existsSync(asked), r);
  fs.rmSync(asked, { force: true });

  const strict = await openTab("/page1?csp=strict");
  let t0 = Date.now();
  let res = await strict.evaluate(EXPR);
  check("a site whose CSP blocks 127.0.0.1 answers CSP_BLOCKED, fast", String(res).startsWith("CSP_BLOCKED") && Date.now() - t0 < 3000, `${res} (${Date.now() - t0} ms)`);
  check("...and nothing is attached", !(await bridge.ping()).tabs.length);
  await strict.context.close();

  const tab = await openTab("/open");
  t0 = Date.now();
  res = await tab.evaluate(EXPR);
  check("one evaluate call attaches the tab", res === "ATTACHED" && Date.now() - t0 < 3000, `${res} (${Date.now() - t0} ms)`);
  check("a second evaluate is a no-op", (await tab.evaluate(EXPR)) === "ALREADY_ATTACHED");
  check("the relay leaves no enumerable global and patches nothing", await tab.evaluate(`Object.keys(window).every((k) => !/ifb|bridge|relay/i.test(k)) && /\\[native code\\]/.test(String(window.fetch)) && /\\[native code\\]/.test(String(window.WebSocket))`));
  text = cli(["bridge", "status"]);
  check("status shows the site attached", new RegExp(`attached: ${host.replace(/\./g, "\\.")} \\(attached 0 min ago\\)`).test(text), text);

  log.length = 0;
  r = await node(["get", "/api/private"]);
  check("client.mjs reads a logged-in page through the tab (HttpOnly cookie, none in Node)", r.includes("only-with-cookie") && log.some((l) => l.path === "/api/private" && l.cookieOk), r);
  check("...and never asked for a cookie (no iframer auth)", !fs.existsSync(asked));
  r = await node([]);
  check("the client says requests go through the tab", /tab: attached/.test(r) && !/COOKIE missing/.test(r), r);
  r = await node(["get", "/api/me"]);
  check("an auth header the page keeps in localStorage is filled in by the tab", r.includes("Seeded Person"), r);
  r = await node(["activeCampaigns", "community=acme"]);
  check("a recipe runs through the tab", r === "1", r);
  r = await node(["action", "getRestaurants", JSON.stringify([{ communitySlug: "acme" }]), "--approved"]);
  check("a write (Server Action, id re-found from the page's JS) runs through the tab", r.includes("Bistro") && r.includes("acme"), r);
  r = await node(["get", "/api/rate-limited"]);
  check("a 429 from the site still stops the client", /stopped: HTTP 429/.test(r), r);
  r = await node(["get", "/api/private"], { IFRAMER_BRIDGE: "off" });
  check("IFRAMER_BRIDGE=off skips the tab", /401/.test(r), r);
  fs.rmSync(asked, { force: true });

  // The standalone client, for scripts that are not a client.mjs.
  const mod = path.join(bin, "tab-bridge.mjs");
  text = cli(["bridge", "client", "--out", mod]);
  const use = path.join(bin, "use.mjs");
  fs.writeFileSync(use, `import { bridgeFetch, tabAttached } from "./tab-bridge.mjs";
const o = ${JSON.stringify(origin)};
const j = async (p, init) => { const r = await bridgeFetch(o + p, init); return r && { status: r.status, redirected: r.redirected, url: r.url, body: await r.text() }; };
const out = {};
out.attached = await tabAttached(o);
out.other = await bridgeFetch("https://not-attached.example/x");
out.echo = await j("/api/echo", { method: "POST", headers: { "content-type": "application/json", "x-test": "7", cookie: "sid=LEAK", referer: o + "/from-here" }, body: JSON.stringify({ a: 1 }) });
out.bin = await j("/api/echo", { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array([104, 105]) });
const b = await bridgeFetch(o + "/api/bytes"); out.bytes = [...new Uint8Array(await b.arrayBuffer())];
out.redirect = await j("/api/redirect-me");
out.manual = await j("/api/redirect-me", { redirect: "manual" });
out.stream = await j("/api/stream").catch((e) => e.message);
out.huge = await j("/api/huge").catch((e) => e.message);
out.cross = await j("/api/x").then(() => bridgeFetch("https://evil.example/x")).then((r) => r, (e) => e.message);
console.log(JSON.stringify(out));
`);
  let out = {};
  r = await exec(use, []);
  try { out = JSON.parse(r); } catch { /* shown below */ }
  check("bridge client: tabAttached, and null for a site with no tab", out.attached === true && out.other === null, r);
  const echo = (() => { try { return JSON.parse(out.echo.body); } catch { return {}; } })();
  check("a POST keeps its body and headers; the tab sends its own cookie, never the script's", echo.method === "POST" && echo.body === '{"a":1}' && echo.x === "7" && echo.cookieOk === true && !String(echo.sentCookie).includes("LEAK"), out.echo);
  check("Referer is sent the way a page may set it", echo.referer === origin + "/from-here", echo);
  check("a bytes body arrives as bytes", (() => { try { const e = JSON.parse(out.bin.body); return e.method === "PUT" && e.body === "hi"; } catch { return false; } })(), out.bin);
  check("a binary response comes back byte for byte", JSON.stringify(out.bytes) === "[0,255,1,254,128,10,13]", out.bytes);
  check("a followed redirect is reported", out.redirect?.redirected === true && /redirect-target/.test(out.redirect.url), out.redirect);
  check("a manual redirect shows as 302", out.manual?.status === 302, out.manual);
  check("a streamed response is refused, not left hanging", /streamed response/.test(String(out.stream)), out.stream);
  check("a response over 32 MB is refused", /32 MB/.test(String(out.huge)), out.huge);
  check("after a request used the tab, a site with no tab is an error, not a silent fallback", /stopped: tab bridge/.test(String(out.cross)), out.cross);
  text = cli(["bridge", "status"]);
  check("the tab is still answering after the refused stream and download", /attached/.test(text) && !/NOT ANSWERING/.test(text), text);

  // A daemon restart: the tab reconnects by itself (same key).
  const before = (await bridge.ping()).pid;
  await bridge.stop();
  check("stop: scripts fall back, state file removed", !(await bridge.ping()) && !fs.existsSync(path.join(data, "bridge.json")));
  st = await startDaemon();
  const back = await until(async () => (await bridge.ping())?.tabs.length === 1, 12000);
  check("after a daemon restart the tab reconnects by itself", back && st.pid !== before);
  r = await node(["get", "/api/private"]);
  check("...and the client works again", r.includes("only-with-cookie"), r);

  // A reload drops the relay; the same expression attaches again.
  await tab.page.reload({ waitUntil: "load" });
  await until(async () => (await bridge.ping()).tabs.length === 0, 5000);
  text = cli(["bridge", "status"]);
  check("a reload drops the relay and status says so", /attached: none/.test(text) && /detached: .*Attach again/.test(text), text);
  r = await node(["get", "/api/private"]);
  check("the client then says to attach again, and uses the saved session", /tab bridge: .*detached/.test(r) && /iframer bridge attach/.test(r) && /401/.test(r), r);
  fs.rmSync(asked, { force: true });
  check("the same expression attaches again after a reload", (await tab.evaluate(EXPR)) === "ATTACHED");
  r = await node(["get", "/api/private"]);
  check("...and the client is back on the tab", r.includes("only-with-cookie") && !fs.existsSync(asked), r);

  // A read-only tab in another profile, under a name.
  const roText = cli(["bridge", "attach", host, "--name", "viewer", "--read-only", "--print"]);
  const viewer = await openTab("/open");
  check("a named read-only tab attaches next to the first", (await viewer.evaluate(roText)) === "ATTACHED" && (await bridge.ping()).tabs.length === 2);
  r = await node(["action", "getRestaurants", JSON.stringify([{ communitySlug: "acme" }]), "--approved"], { IFRAMER_BRIDGE_TAB: "viewer" });
  check("IFRAMER_BRIDGE_TAB picks it, and its writes are refused", /read-only/.test(r), r);
  r = await node(["get", "/api/private"], { IFRAMER_BRIDGE_TAB: "viewer" });
  check("...while its reads work", r.includes("only-with-cookie"), r);

  // The tab closes: nothing attached again.
  await viewer.context.close();
  await tab.context.close();
  await until(async () => (await bridge.ping()).tabs.length === 0, 5000);
  check("closing the tabs detaches them", (await bridge.ping()).tabs.length === 0);
} finally {
  await browser.close();
  await bridge.stop();
  check("daemon stopped at the end", !(await bridge.ping()));
  server.close();
  fs.rmSync(data, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
