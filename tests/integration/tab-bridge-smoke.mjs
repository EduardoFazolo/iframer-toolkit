// Tab bridge smoke test for any machine: plain Node, the BUILT bundles (dist/), no bun, no browser, no real site.
// It drives the CLI the way an agent does, plays the tab with a WebSocket client, and runs a generated client.mjs.
// Made for Windows (process spawn, paths, a stale daemon, a closed port) but runs the same on macOS and Linux.
// Run: node tests/integration/tab-bridge-smoke.mjs      (needs `npm install`; uses a temp data dir and a free port)
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "dist", "cli.js");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "ifb-smoke-"));
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const port = await freePort();
const env = { ...process.env, IFRAMER_DATA_DIR: data, IFRAMER_BRIDGE_PORT: String(port), IFRAMER_NO_AUTO_AUTH: "1" };
delete env.IFRAMER_BRIDGE;
delete env.IFRAMER_BRIDGE_TAB;
// A host that can never resolve: nothing in this test may reach a real site.
const HOST = "app.bridge-smoke.invalid";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(100); } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)}` : ""}`); }
}
const cli = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8", windowsHide: true });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
};
const node = (file, args = [], extra = {}) => new Promise((ok) => {
  const t0 = Date.now();
  const c = spawn(process.execPath, [file, ...args], { env: { ...env, ...extra }, windowsHide: true });
  let o = "";
  c.stdout.on("data", (d) => (o += d)); c.stderr.on("data", (d) => (o += d));
  c.on("close", () => ok({ out: o.trim(), ms: Date.now() - t0 }));
});
const stateFile = path.join(data, "bridge.json");
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return null; } };

console.log(`tab bridge smoke: node ${process.version}, ${process.platform} ${process.arch}, port ${port}`);
check("built bundles are present", fs.existsSync(CLI) && fs.existsSync(path.join(ROOT, "dist", "bridge-server.cjs")), CLI);

let r = cli("bridge", "status");
check("status before anything: not running", r.code === 0 && /not running/.test(r.out), r);

// ── attach: starts the daemon detached, prints the expression ──────────────
r = cli("bridge", "attach", HOST, "--print");
let cfg = null;
try { cfg = JSON.parse(r.out.slice(r.out.lastIndexOf("})(") + 3, -1)); } catch { /* shown below */ }
check("attach starts the daemon and prints the expression", r.code === 0 && cfg && cfg.port === port && cfg.o === `https://${HOST}` && cfg.site === HOST && /^[0-9a-f]{32}$/.test(cfg.k), r.out.slice(-300));
let st = readState();
check("state file written, daemon alive, survives the CLI that started it", !!st && st.port === port && alive(st.pid), st);
if (process.platform !== "win32") check("state and key files are 0600", (fs.statSync(stateFile).mode & 0o777) === 0o600 && (fs.statSync(path.join(data, "bridge.key")).mode & 0o777) === 0o600);
r = cli("bridge", "attach", HOST, "--print");
check("a second attach reuses the same daemon and key", readState()?.pid === st.pid && r.out.includes(cfg.k), readState());

// ── the tab, played by a WebSocket client ──────────────────────────────────
function fakeTab({ origin = cfg.o, k = cfg.k } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/relay?s=${encodeURIComponent(cfg.site)}&n=${cfg.name}&k=${k}`, { headers: origin ? { Origin: origin } : {} });
  const t = { ws, events: [], opened: new Promise((ok) => { ws.on("open", () => ok(true)); ws.on("error", () => ok(false)); ws.on("unexpected-response", () => ok(false)); }) };
  const held = new Map();
  const answer = (q) => ws.send(JSON.stringify({ id: q.id, status: 200, type: "basic", redirected: false, url: q.url, headers: { "content-type": "application/json" }, body64: Buffer.from(JSON.stringify({ ok: true, via: "tab", method: q.method, path: new URL(q.url).pathname, body: q.body ?? null, sawCookie: Object.keys(q.headers || {}).some((h) => h.toLowerCase() === "cookie") })).toString("base64") }));
  ws.on("message", (d) => {
    const q = JSON.parse(String(d));
    if (q.go) { t.events.push(`go ${q.id}`); const w = held.get(q.id); held.delete(q.id); if (w) answer(w); return; }
    if (q.abort) return;
    t.events.push(`${q.method} ${q.id}`);
    ws.send(JSON.stringify({ id: q.id, ack: 1 }));
    if (q.method === "GET" || q.method === "HEAD") answer(q); else held.set(q.id, q); // a write waits for its go
  });
  return t;
}
check("a tab with a wrong key is refused", !(await fakeTab({ k: "0".repeat(32) }).opened));
check("a tab on another origin is refused, even with the key", !(await fakeTab({ origin: "https://evil.bridge-smoke.invalid" }).opened));
check("the daemon is still alive after the refusals", alive(st.pid) && /running/.test(cli("bridge", "status").out));
const tab = fakeTab();
check("the tab attaches with its key and origin", await tab.opened);
r = cli("bridge", "status");
check("status lists the site as attached", new RegExp(`attached: ${HOST.replace(/\./g, "\\.")} \\(attached 0 min ago\\)`).test(r.out), r.out);

// ── the standalone client ──────────────────────────────────────────────────
const mod = path.join(data, "tab-bridge.mjs");
r = cli("bridge", "client", "--out", mod);
check("bridge client writes the module", r.code === 0 && fs.existsSync(mod), r);
const use = path.join(data, "use.mjs");
fs.writeFileSync(use, `import { bridgeFetch, tabAttached } from "./tab-bridge.mjs";
const o = "https://${HOST}";
const out = { attached: await tabAttached(o) };
out.get = await (await bridgeFetch(o + "/api/x?y=1", { headers: { cookie: "sid=SAVED", "x-test": "1" } })).json();
out.post = await (await bridgeFetch(o + "/api/w", { method: "POST", body: JSON.stringify({ a: 1 }) })).json();
out.other = await bridgeFetch("https://other.bridge-smoke.invalid/x");
console.log(JSON.stringify(out));
`);
let run = await node(use);
let out = {};
try { out = JSON.parse(run.out.split(/\r?\n/).pop()); } catch { /* shown below */ }
check("a read goes through the tab; the saved cookie stays in the script", out.attached === true && out.get?.via === "tab" && out.get.path === "/api/x" && out.get.sawCookie === false, run.out);
check("a write goes through the tab", out.post?.method === "POST" && out.post.body === '{"a":1}', run.out);
const post = tab.events.findIndex((e) => e.startsWith("POST "));
check("...and the tab was told to send it (go) after it confirmed", post >= 0 && tab.events[post + 1] === `go ${tab.events[post].split(" ")[1]}`, tab.events);
check("a host with no tab gets null", out.other === null, run.out);

// ── a generated client.mjs ────────────────────────────────────────────────
r = cli("recipe", HOST, "probe", "--path", "/api/x", "--quiet");
const client = path.join(data, "apis", HOST, "client.mjs");
check("the CLI writes a client.mjs for the site", r.code === 0 && fs.existsSync(client), r);
run = await node(client);
check("client.mjs says requests go through the tab", /tab: attached/.test(run.out) && /recipes: probe/.test(run.out), run.out);
run = await node(client, ["get", "/api/x"]);
check("client.mjs get runs through the tab", /"via":"tab"/.test(run.out), run.out);
run = await node(client, ["probe"]);
check("a recipe runs through the tab", /via/.test(run.out) && !/^error/.test(run.out), run.out);
run = await node(client, ["get", "/api/x"], { IFRAMER_BRIDGE: "off" });
check("IFRAMER_BRIDGE=off: the client goes its own way (no site here, so a network error)", /^error: network/.test(run.out), run.out);

// ── the tab goes away ─────────────────────────────────────────────────────
tab.ws.close();
await until(() => /attached: none/.test(cli("bridge", "status").out), 5000);
r = cli("bridge", "status");
check("status says the tab detached", /attached: none/.test(r.out) && /detached: .*Attach again/.test(r.out), r.out);
run = await node(client, ["get", "/api/x"]);
check("the client then says to attach again and goes its own way", /tab bridge: .*detached/.test(run.out) && /iframer bridge attach/.test(run.out) && /error: network/.test(run.out), run.out);

// ── stop, a stale state file, a daemon killed hard ────────────────────────
r = cli("bridge", "stop");
check("stop ends the daemon and removes its state file", /stopped/.test(r.out) && !fs.existsSync(stateFile) && (await until(() => !alive(st.pid), 5000)), { out: r.out, alive: alive(st.pid) });
check("stop again: not running", /not running/.test(cli("bridge", "stop").out));
fs.writeFileSync(stateFile, JSON.stringify({ port, token: "x".repeat(48), pid: st.pid, started: "", v: 1 }));
fs.writeFileSync(path.join(data, "stale.mjs"), `import { bridgeFetch } from "./tab-bridge.mjs";
const t0 = Date.now();
const r = await bridgeFetch("https://${HOST}/api/x");
console.log(JSON.stringify({ r, ms: Date.now() - t0 }));
`);
run = await node(path.join(data, "stale.mjs"));
let stale = {};
try { stale = JSON.parse(run.out.split(/\r?\n/).pop()); } catch { /* shown below */ }
check("a stale state file (dead daemon) costs no wait: null at once", stale.r === null && stale.ms < 500, run.out);
// A live pid behind a closed port (the worst case on Windows, where a refusal can take 2 s): still null, and reads fall back.
fs.writeFileSync(stateFile, JSON.stringify({ port, token: "x".repeat(48), pid: process.pid, started: "", v: 1 }));
run = await node(path.join(data, "stale.mjs"));
try { stale = JSON.parse(run.out.split(/\r?\n/).pop()); } catch { stale = {}; }
check(`a closed port behind a live pid: null (took ${stale.ms} ms)`, stale.r === null && stale.ms < 5000, run.out);
fs.rmSync(stateFile, { force: true });

r = cli("bridge", "attach", HOST, "--print");
const second = readState();
check("attach starts a fresh daemon after a stop", !!second && second.pid !== st.pid && alive(second.pid), second);
try { process.kill(second.pid, "SIGKILL"); } catch { /* gone */ } // no chance to clean up (on Windows every kill is like this)
await until(() => !alive(second.pid), 5000);
check("a daemon killed hard leaves a stale state file, and status says not running", fs.existsSync(stateFile) && /not running/.test(cli("bridge", "status").out));
r = cli("bridge", "attach", HOST, "--print");
const third = readState();
check("attach recovers from it with a new daemon and the same key", !!third && third.pid !== second.pid && alive(third.pid) && r.out.includes(cfg.k), third);
const again = fakeTab();
check("...and a tab attaches to it", await again.opened);
again.ws.close();

r = cli("bridge", "stop");
await until(() => !alive(third.pid), 5000);
check("final stop: no daemon left", !alive(third.pid) && !fs.existsSync(stateFile), r.out);
try { fs.rmSync(data, { recursive: true, force: true }); } catch { /* a locked file on Windows is not a failure */ }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
