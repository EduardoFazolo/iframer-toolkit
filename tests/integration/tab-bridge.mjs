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
// An older daemon (another protocol version) is already running: starting must replace it, never reuse it.
{
  const dummy = spawn("node", ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" }); // the pid a kill would hit
  let asked = false;
  const old = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/shutdown") { asked = true; res.end("{}"); old.close(); old.closeAllConnections?.(); return; }
    res.end(JSON.stringify({ pid: dummy.pid, v: 1, tabs: [], detached: [] }));
  });
  await new Promise((ok) => old.listen(PORT, "127.0.0.1", ok));
  fs.writeFileSync(path.join(data, "bridge.json"), JSON.stringify({ port: PORT, token: "old-token", pid: dummy.pid, started: "", v: 1 }));
  const fresh = await bridge.start();
  check("a running daemon of an older version is replaced, not reused", asked && fresh.v === state.BRIDGE_VERSION && fresh.v > 1 && fresh.pid !== dummy.pid && fresh.token !== "old-token", fresh);
  try { dummy.kill(); } catch { /* gone */ }
  await bridge.stop();
}

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
const key = (origin, site, name = "default", ro = false) => state.tabKey(master, origin, site, name, ro);
const APP = "https://app.example.com";
// A fake tab: a WebSocket client that says which page it is (Origin) and answers like the relay.
function fakeTab({ site, origin, k, name = "default", ro = false, v = state.BRIDGE_VERSION, answer = (q) => ({ status: 200, type: "basic", headers: { "content-type": "text/plain" }, body64: Buffer.from(`${q.method} ${q.url}`).toString("base64") }) }) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/relay?s=${encodeURIComponent(site)}&n=${name}${ro ? "&ro=1" : ""}${v ? `&v=${v}` : ""}&k=${k}`, { headers: origin ? { Origin: origin } : {} });
  const t = { ws, got: [], opened: new Promise((ok) => { ws.on("open", () => ok(true)); ws.on("error", () => ok(false)); ws.on("unexpected-response", () => ok(false)); }) };
  ws.on("message", (d) => {
    const q = JSON.parse(String(d));
    if (q.go || q.abort) return;
    t.got.push(q);
    ws.send(JSON.stringify({ id: q.id, ack: 1 }));
    ws.send(JSON.stringify({ id: q.id, ...answer(q) }));
  });
  return t;
}
const refused = async (o) => !(await fakeTab(o).opened);
check("relay with a wrong key is refused", await refused({ site: "app.example.com", origin: "https://app.example.com", k: "0".repeat(32) }));
check("relay from another site's page is refused, even with a valid key", await refused({ site: "app.example.com", origin: "https://evil.example", k: key(APP, "app.example.com") }));
check("one site's key opens nothing for another site", await refused({ site: "other.example.com", origin: "https://other.example.com", k: key(APP, "app.example.com") }));
check("a key is useless from a sibling subdomain of the same site", await refused({ site: "example.com", origin: "https://evil.example.com", k: key(APP, "example.com") }));
check("relay without an Origin is refused", await refused({ site: "app.example.com", origin: null, k: key(APP, "app.example.com") }));
check("a page can't drop its own read-only limit", await refused({ site: "app.example.com", origin: APP, k: key(APP, "app.example.com", "default", true) }));
check("a plain-http page is refused", await refused({ site: "app.example.com", origin: "http://app.example.com", k: key("http://app.example.com", "app.example.com") }));
check("a relay from another version of the snippet is refused", await refused({ site: "app.example.com", origin: APP, k: key(APP, "app.example.com"), v: 1 }) && await refused({ site: "app.example.com", origin: APP, k: key(APP, "app.example.com"), v: 0 }));
check("a shared suffix is refused as a site, even with a key for it", await refused({ site: "co.uk", origin: "https://shop.co.uk", k: key("https://shop.co.uk", "co.uk") }));
check("the daemon is still up after the refusals", (await call("/status")).status === 200);

let r = await viaTab("https://app.example.com/x");
check("nothing attached -> 503 (the caller uses its saved session)", r.http === 503 && /no tab attached/.test(r.error), r);

const a = fakeTab({ site: "app.example.com", origin: APP, k: key(APP, "app.example.com") });
check("relay with its site's key and Origin is accepted", await a.opened);
r = await viaTab("https://app.example.com/x?y=1", { headers: { "x-test": "1" } });
check("a request is carried by the tab", r.http === 200 && Buffer.from(r.body64, "base64").toString() === "GET https://app.example.com/x?y=1" && a.got[0].headers["x-test"] === "1" && a.got[0].notAfter > Date.now() - 100, r);
r = await viaTab("https://other.example.com/x");
check("a request for another site never reaches this tab", r.http === 503 && a.got.length === 1, r);
r = await viaTab("https://evil.example/app.example.com");
check("...whatever its path says", r.http === 503 && a.got.length === 1, r);

{
  const before = a.got.length;
  const one = await viaTab("https://app.example.com/once", { rid: "same-id-1" });
  const two = await viaTab("https://app.example.com/once", { rid: "same-id-1" });
  check("the same request arriving twice (a client that re-sends after a dropped connection) reaches the tab once", one.http === 200 && two.http === 409 && two.duplicate === true && a.got.length === before + 1, { one: one.http, two });
  // A generated client whose .env holds a token the page keeps in its own storage: the saved value must not travel to the tab.
  const h = "app.example.com", d2 = fs.mkdtempSync(path.join(os.tmpdir(), "ifb-auth-"));
  fs.writeFileSync(path.join(d2, "api.json"), JSON.stringify({ origin: APP, endpoints: [] }));
  fs.writeFileSync(path.join(d2, "auth.json"), JSON.stringify({ authorization: { from: "localStorage", key: "session", prefix: "Bearer " }, "x-api-key": {} }));
  fs.writeFileSync(path.join(d2, ".env"), "AUTHORIZATION=Bearer SAVED-OTHER-ACCOUNT\nX_API_KEY=KEY-SET-BY-HAND\nCOOKIE=sid=SAVED\n");
  kit.writeClient(h, d2);
  await new Promise((ok) => { const c = spawn("node", [path.join(d2, "client.mjs"), "get", "/auth-probe"], { env: { PATH: process.env.PATH, HOME: os.homedir(), IFRAMER_DATA_DIR: data, IFRAMER_NO_AUTO_AUTH: "1" } }); c.on("close", ok); });
  const job = a.got.find((q) => /auth-probe/.test(q.url)) || {};
  const sent = JSON.stringify(job.headers || {});
  check("a saved auth header the page rebuilds itself never travels to the tab; a hand-set key and no cookie do", !!job.url && !/SAVED-OTHER-ACCOUNT/.test(JSON.stringify(job)) && /KEY-SET-BY-HAND/.test(sent) && !/sid=SAVED/.test(JSON.stringify(job)) && !!job.auth?.authorization, job);
  fs.rmSync(d2, { recursive: true, force: true });
}
{
  const said = cli(["bridge", "status"]);
  check("status says a tab still runs another version's snippet", /another iframer version/.test(said), said);
}

const b = fakeTab({ site: "app.example.com", origin: "https://sub.app.example.com", k: key("https://sub.app.example.com", "app.example.com") });
await b.opened;
r = await viaTab("https://app.example.com/2");
check("a second tab attaches, the older one stays, the newest answers", r.http === 200 && b.got.length === 1 && a.ws.readyState === WebSocket.OPEN && (await (await call("/status")).json()).tabs.length === 2, r);
b.ws.close(); await sleep(100);
let aGot = a.got.length;
r = await viaTab("https://app.example.com/3");
check("...and the older one still answers when the newest is gone", r.http === 200 && a.got.length === aGot + 1, r);

const ro = fakeTab({ site: "ro.example.com", origin: "https://ro.example.com", k: key("https://ro.example.com", "ro.example.com", "default", true), ro: true });
await ro.opened;
r = await viaTab("https://ro.example.com/x", { method: "POST", body: "{}" });
check("a read-only tab: the daemon refuses a write before it reaches the tab", r.http === 200 && /read-only/.test(r.error) && ro.got.length === 0, r);
check("...and still reads", (await viaTab("https://ro.example.com/x")).status === 200);

const named = fakeTab({ site: "app.example.com", origin: APP, k: key(APP, "app.example.com", "work"), name: "work" });
await named.opened;
r = await viaTab("https://app.example.com/n", { tab: "work" });
check("--name: a request for tab \"work\" goes to that tab only", r.http === 200 && named.got.length === 1 && a.got.length === aGot + 1, r);

let text = cli(["bridge", "status"]);
check("iframer bridge status lists the attached sites", /tab bridge running/.test(text) && /app\.example\.com/.test(text) && /ro\.example\.com \(.*read-only/.test(text) && /name work/.test(text), text);
for (const t of [a, ro, named]) t.ws.close();
await sleep(100);
text = cli(["bridge", "status"]);
check("...and says when a tab detached", /detached: .*app\.example\.com \(detached/.test(text), text);

text = cli(["bridge", "attach", "com"]);
check("attach refuses a bare suffix as a site", /^EXIT 1/.test(text) && /not a site/.test(text), text);
text = cli(["bridge", "attach", "app.example.com", "--site", "other.com"]);
check("attach refuses a --site that does not cover the host", /^EXIT 1/.test(text) && /does not cover/.test(text), text);
text = cli(["bridge", "attach", "www.example.com", "--for", "playwright-mcp", "--read-only", "--name", "work"]);
check("attach prints the steps for the chosen tool", /browser_evaluate/.test(text) && /example\.com and its subdomains/.test(text) && /read-only/.test(text) && /"ro":1/.test(text) && text.includes(key("https://www.example.com", "example.com", "work", true)), text);
text = cli(["bridge", "attach", "example.com:443", "--site", "example.com", "--print"]);
check("attach writes the origin the way a browser does (no default port)", /"o":"https:\/\/example\.com"/.test(text) && text.includes(key("https://example.com", "example.com")), text.slice(-200));
text = cli(["bridge", "attach", "shop.co.uk", "--site", "co.uk"]);
check("attach refuses a shared suffix as --site", /^EXIT 1/.test(text) && /not a site/.test(text), text);

// ── 2. The Node client against a scripted daemon: what it does when things break half-way ──
console.log("client, scripted daemon");
{
  const fdata = fs.mkdtempSync(path.join(os.tmpdir(), "ifb-fake-"));
  let steps = [], probeAttached = false;
  const seen = [], bodies = [];
  const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const fakeDaemon = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const q = JSON.parse(raw || "{}");
      if (req.url === "/probe") return json(res, 200, { attached: probeAttached });
      seen.push(`${q.method} ${q.url}`);
      bodies.push(q.body ?? null);
      const step = steps.shift() || "ok";
      if (step === "drop") return req.socket.destroy(); // the daemon took the request, then the connection died
      if (step === "cut") { res.writeHead(200, { "content-type": "application/json" }); res.write('{"status":2'); return req.socket.destroy(); }
      if (step === "none") return json(res, 503, { error: "no tab attached for x" });
      if (step === "slow-none") return setTimeout(() => json(res, 503, { error: "no tab attached for x" }), 150);
      if (step === "slow-ok") return setTimeout(() => json(res, 200, { status: 200, type: "basic", headers: {}, body64: Buffer.from("via-tab").toString("base64") }), 150);
      if (step === "status-600") return json(res, 200, { status: 600, type: "basic", headers: {}, body64: "" });
      if (step === "sent-then-failed") return json(res, 200, { error: "response larger than 32 MB: too large for the tab bridge", maybeSent: true });
      json(res, 200, { status: 200, type: "basic", headers: {}, body64: Buffer.from("via-tab").toString("base64") });
    });
  });
  await new Promise((ok) => fakeDaemon.listen(0, "127.0.0.1", ok));
  const fport = fakeDaemon.address().port;
  const mod = path.join(fdata, "tab-bridge.mjs");
  if (CLI) cli(["bridge", "client", "--out", mod]); else bridge.writeClientModule(mod);
  const A = "https://a.example.com/x", B = "https://b.example.com/x";
  const run = (plan, body, o = {}) => new Promise((ok) => {
    steps = [...plan]; seen.length = 0; bodies.length = 0; probeAttached = !!o.attached;
    fs.writeFileSync(path.join(fdata, "bridge.json"), JSON.stringify({ port: o.port || fport, token: "t", pid: process.pid, started: "", v: o.v ?? state.BRIDGE_VERSION }));
    const file = path.join(fdata, "case.mjs");
    fs.writeFileSync(file, `import { bridgeFetch } from "./tab-bridge.mjs";
const A = ${JSON.stringify(A)}, B = ${JSON.stringify(B)};
const one = (url, init) => bridgeFetch(url, init).then(async (r) => (r ? await r.text() : null), (e) => "ERR " + e.message);
const out = [];
${body}
console.log(JSON.stringify(out));
`);
    const c = spawn("node", [file], { env: { PATH: process.env.PATH, HOME: os.homedir(), IFRAMER_DATA_DIR: fdata } });
    let o2 = "";
    c.stdout.on("data", (d) => (o2 += d)); c.stderr.on("data", (d) => (o2 += d));
    c.on("close", () => { try { ok(JSON.parse(o2.trim().split("\n").pop())); } catch { ok([o2]); } });
  });
  const post = `{ method: "POST", body: "{}" }`;

  let o = await run(["drop"], `out.push(await one(A, ${post}));`);
  check("a write whose connection to the daemon dies half-way is an error, never null (no second send)", /^ERR .*may have reached the site/.test(String(o[0])) && seen.length === 1, o);
  o = await run(["cut"], `out.push(await one(A, ${post}));`);
  check("...same when the daemon's answer is cut off", /^ERR .*may have reached the site/.test(String(o[0])), o);
  o = await run(["drop", "none"], `out.push(await one(A)); out.push(await one(A));`);
  check("a read whose connection to the daemon dies half-way is an error too, and the run does not fall back after it", /^ERR .*dropped/.test(String(o[0])) && /^ERR /.test(String(o[1])), o);
  {
    // The generated client saw a tab attached (it then skips its saved session). The connection drops on its first
    // request: it must stop, not carry on with the saved cookie.
    const cdir = path.join(fdata, "c");
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, "api.json"), JSON.stringify({ origin: "https://a.example.com", endpoints: [] }));
    fs.writeFileSync(path.join(cdir, ".env"), "COOKIE=sid=SAVED\n");
    kit.writeClient("a.example.com", cdir);
    steps = ["drop"]; seen.length = 0; probeAttached = true;
    fs.writeFileSync(path.join(fdata, "bridge.json"), JSON.stringify({ port: fport, token: "t", pid: process.pid, started: "", v: state.BRIDGE_VERSION }));
    const got = await new Promise((ok) => {
      const c = spawn("node", [path.join(cdir, "client.mjs"), "get", "/x"], { env: { PATH: process.env.PATH, HOME: os.homedir(), IFRAMER_DATA_DIR: fdata, IFRAMER_NO_AUTO_AUTH: "1" } });
      let t = ""; c.stdout.on("data", (d) => (t += d)); c.stderr.on("data", (d) => (t += d)); c.on("close", () => ok(t.trim()));
    });
    check("after the client saw a tab attached, a dropped connection stops the run (no quiet switch to the saved session)", /stopped: tab bridge/.test(got) && !/network:/.test(got) && seen.length === 1, got);
  }
  const closed = await freePort();
  o = await run([], `out.push(await one(A, ${post}));`, { port: closed });
  check("a write the daemon never got (connection refused) is null: safe to send the other way", o[0] === null && seen.length === 0, o);

  o = await run(["ok", "none"], `out.push(await one(A)); out.push(await one(A));`);
  check("a host that used the tab never falls back half-way", o[0] === "via-tab" && /^ERR .*was using the tab/.test(String(o[1])), o);
  o = await run(["none", "ok"], `out.push(await one(A)); out.push(await one(A));`);
  check("a host that started on its saved session stays there, even when a tab shows up", o[0] === null && o[1] === null && seen.length === 1, { o, seen: [...seen] });
  o = await run(["ok", "none"], `out.push(await one(A)); out.push(await one(B));`);
  check("each host decides for itself", o[0] === "via-tab" && o[1] === null, o);

  o = await run(["slow-none", "ok"], `out.push(...(await Promise.all([one(A), one(A)])));`);
  check("two first requests fired together decide once: both on the saved session, one asked", o[0] === null && o[1] === null && seen.length === 1, { o, seen: [...seen] });
  o = await run(["sent-then-failed"], `out.push(await one(A, ${post}));`);
  check("a write the tab sent and then failed on says it may have reached the site", /^ERR .*32 MB.*may have reached the site/.test(String(o[0])), o);
  o = await run(["ok"], `const c = new AbortController(); c.abort(); out.push(await one(A, { method: "POST", body: "{}", signal: c.signal }));`);
  check("a request the script already aborted is never sent", /^ERR /.test(String(o[0])) && seen.length === 0, { o, seen: [...seen] });

  o = await run(["slow-ok", "ok"], `const first = one(A); const init = { method: "POST", body: "target-A" }; const second = one(A, init); init.body = "target-B"; init.method = "DELETE"; out.push(await first, await second);`);
  check("a request that waits its turn is sent as it was when called, not as its options look later", o[1] === "via-tab" && seen[1] === `POST ${A}` && bodies[1] === "target-A", { o, seen: [...seen], bodies: [...bodies] });
  o = await run(["drop", "none"], `out.push(await one(A, ${post})); out.push(await one(A, ${post}));`);
  check("after a write that may have gone through the tab, the run never falls back to the saved session", /may have reached/.test(String(o[0])) && /^ERR .*was using the tab/.test(String(o[1])), o);
  o = await run(["slow-none"], `const first = one(A); const c = new AbortController(); const second = one(A, { signal: c.signal }); c.abort(new Error("my-abort")); out.push(await second, await first);`);
  check("a request waiting for the first one's decision can be aborted on its own", /my-abort/.test(String(o[0])) && o[1] === null && seen.length === 1, { o, seen: [...seen] });
  o = await run(["status-600"], `out.push(await one(A, ${post}));`);
  check("a site answer with a status that can't be passed on: the write says it may have reached the site", /^ERR stopped: tab bridge: .*600.*may have reached the site/.test(String(o[0])), o);
  o = await run(["ok"], `out.push(await one(A));`, { v: 1 });
  check("a daemon of another version is not used (null, nothing sent)", o[0] === null && seen.length === 0, { o, seen: [...seen] });

  o = await run([], `const f = new FormData(); f.set("a", "1"); out.push(await one(A, { method: "POST", body: f }));`, { attached: false });
  check("a FormData body with no tab attached falls back (null)", o[0] === null && seen.length === 0, o);
  o = await run([], `const f = new FormData(); f.set("a", "1"); out.push(await one(A, { method: "POST", body: f }));`, { attached: true });
  check("a FormData body with a tab attached is refused before it is sent", /^ERR .*can't go through the tab/.test(String(o[0])) && seen.length === 0, o);
  fakeDaemon.close();
  fs.rmSync(fdata, { recursive: true, force: true });
}

// ── 3. Real Chrome: the relay, client.mjs through the tab ─────────────────
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
// With BRIDGE_CLI the client.mjs is written by the built CLI, so the bundled template is what runs below.
if (CLI) cli(["recipe", host, "activeCampaigns", "--path", "/{community}/dashboard/campaigns", "--rsc", "--find", "campaigns", "--pick", "campaigns.{title}", "--where", "active=true", "--count", "--quiet"]);
else kit.saveRecipe({ name: "activeCampaigns", host, path: "/{community}/dashboard/campaigns", rsc: true, find: "campaigns", pick: "campaigns.{title}", where: "active=true", count: true });
// A code recipe that calls another recipe by its name (they are module bindings), as it could before.
if (CLI) cli(["recipe", host, "composed", "--run", "async (core, args) => 'composed:' + (await activeCampaigns({ community: 'acme' }))", "--quiet"]);
else kit.saveRecipe({ name: "composed", host, run: "async (core, args) => 'composed:' + (await activeCampaigns({ community: 'acme' }))" });
// ...also when the other recipe's name is an ordinary property name every object has, or one of the bridge's own names.
if (CLI) cli(["recipe", host, "composed2", "--run", "async (core, args) => [String(await toString({})).length > 40, String(await __tabHome({})).length > 40, String(await Bun({})).length > 40].join()", "--quiet"]);
else kit.saveRecipe({ name: "composed2", host, run: "async (core, args) => [String(await toString({})).length > 40, String(await __tabHome({})).length > 40, String(await Bun({})).length > 40].join()" });
// Recipes named like the client's own internals must not break the regenerated module.
for (const name of ["os", "__tab", "__tabFetch", "__tabHome", "globalThis", "fetch", "process", "env", "path", "fs", "toString", "Bun", "async"]) {
  if (CLI) cli(["recipe", host, name, "--path", "/api/x", "--quiet"]); else kit.saveRecipe({ name, host, path: "/api/x" });
}
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
  r = await node([]);
  check("recipes named os, globalThis, fetch, env, ... do not break the client", /recipes: .*\bos\b/.test(r) && /__tabFetch/.test(r) && /globalThis/.test(r), r);
  fs.rmSync(asked, { force: true });

  // A run that starts on its saved session while no tab is attached: it must stay there after one attaches.
  const marker = path.join(bin, "go");
  const pinned = path.join(dir, "pinned.mjs");
  fs.writeFileSync(pinned, `import fs from "node:fs";
import { get } from "./client.mjs";
const first = await get("/api/echo");
console.log("first");
while (!fs.existsSync(${JSON.stringify(marker)})) await new Promise((r) => setTimeout(r, 50));
const second = await get("/api/echo");
console.log(JSON.stringify({ first: first.sentCookie, second: second.sentCookie }));
`);
  fs.writeFileSync(path.join(dir, ".env"), `COOKIE=sid=${SECRETS.cookie}; saved=1\nAUTHORIZATION=WRONG-ACCOUNT\n`);
  let pinnedOut = "";
  const pinnedRun = new Promise((ok) => {
    const c = spawn("node", [pinned], { env: { PATH: process.env.PATH, HOME: os.homedir(), IFRAMER_DATA_DIR: data, IFRAMER_NO_AUTO_AUTH: "1" } });
    c.stdout.on("data", (d) => (pinnedOut += d)); c.stderr.on("data", (d) => (pinnedOut += d));
    c.on("close", () => ok(pinnedOut.trim()));
  });
  await until(() => /first/.test(pinnedOut), 8000);

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
  fs.writeFileSync(marker, "1");
  r = await pinnedRun;
  const pin = (() => { try { return JSON.parse(r.split("\n").pop()); } catch { return {}; } })();
  check("a run that started on the saved session stays on it after a tab attaches", /saved=1/.test(String(pin.first)) && /saved=1/.test(String(pin.second)), r);
  const wrongTab = cli(["bridge", "attach", "www.example.com", "--print"]);
  res = await tab.evaluate(wrongTab);
  check("an expression made for another host answers WRONG_TAB", String(res).startsWith("WRONG_TAB") && (await bridge.ping()).tabs.length === 1, res);
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
  check("the page's own auth token wins over a saved one from another account (.env has a wrong one)", r.includes("Seeded Person"), r);
  fs.rmSync(path.join(dir, ".env"));
  r = await node(["get", "/api/me"]);
  check("an auth header the page keeps in localStorage is filled in by the tab", r.includes("Seeded Person"), r);
  r = await node(["activeCampaigns", "community=acme"]);
  check("a recipe runs through the tab", r === "1", r);
  r = await node(["composed"]);
  check("a code recipe still calls another recipe by name", r === "composed:1", r);
  r = await node(["composed2"]);
  check("...also recipes named toString, __tabHome or Bun (they stay module bindings)", r === "true,true,true", r);
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
out.writeRedirect = await j("/api/redirect-me", { method: "POST", body: "{}" });
out.out = await j("/api/redirect-out").catch((e) => e.message);
out.hugeWrite = await j("/api/huge", { method: "POST", body: "{}" }).catch((e) => e.message);
out.asError = await j("/api/redirect-me", { redirect: "error" }).catch((e) => e.message);
out.head = await j("/api/echo-head", { method: "HEAD" });
out.afterError = await j("/api/x");
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
  check("another host with no tab is null, whatever this one uses", out.cross === null, out.cross);
  check("a write never follows a redirect: it comes back as 302 and the target is not requested", out.writeRedirect?.status === 302 && !log.some((l) => l.path === "/api/redirect-target" && l.method === "POST") && log.filter((l) => l.path === "/api/redirect-target").length === 1, { r: out.writeRedirect, hits: log.filter((l) => /redirect/.test(l.path)) });
  check("a read redirected to another origin is refused by the browser: the other site is never requested, the source once, and the error says why", /redirected this request to another origin/.test(String(out.out)) && !log.some((l) => l.path === "/api/cors-echo") && log.filter((l) => l.path === "/api/redirect-out").length === 1, { out: out.out, hits: log.filter((l) => /cors-echo|redirect-out/.test(l.path)) });
  check("a redirecting read is requested once, not twice", log.filter((l) => l.path === "/api/redirect-me" && l.method === "GET").length === 3 && log.filter((l) => l.path === "/api/redirect-target").length === 1, log.filter((l) => /redirect-(me|target)/.test(l.path)));
  check("redirect: error on a redirect names the redirect as a cause, and the tab keeps answering", /redirected this request/.test(String(out.asError)) && out.afterError?.status === 200, { e: out.asError, after: out.afterError });
  check("a request that is not redirected is sent once", log.filter((l) => l.path === "/api/echo-head").length === 1 && out.head?.status === 200, { head: out.head, hits: log.filter((l) => l.path === "/api/echo-head") });
  check("a write that reached the site and then failed (answer too large) says it may have reached it", /32 MB.*may have reached the site/.test(String(out.hugeWrite)) && log.some((l) => l.path === "/api/huge" && l.method === "POST"), out.hugeWrite);
  text = cli(["bridge", "status"]);
  check("the tab is still answering after the refused stream and download", /attached/.test(text) && !/NOT ANSWERING/.test(text), text);

  // The page no longer holds its token: a saved one from .env must not be sent in its place.
  await tab.evaluate(`localStorage.removeItem("session")`);
  fs.writeFileSync(path.join(dir, ".env"), `AUTHORIZATION=${SECRETS.lsToken}\n`);
  r = await node(["get", "/api/me"]);
  check("a saved auth header is never sent through the tab when the page has none of its own", /401/.test(r), r);
  fs.rmSync(path.join(dir, ".env"));

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
