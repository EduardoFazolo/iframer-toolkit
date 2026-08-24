import { spawn } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import WebSocket from "ws";

const SECRET = "smoke-secret-123";
const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;
const repo = new URL("../..", import.meta.url).pathname;
// Isolate ALL server state (server.json, db, logs) from the real ~/.iframer —
// a test server must never overwrite the user's server registry.
const DATA_DIR = mkdtempSync(join(tmpdir(), "iframer-test-"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn("bun", ["run", "index.ts"], {
  cwd: repo,
  env: { ...process.env, PORT: String(PORT), IFRAMER_SECRET: SECRET, IFRAMER_MODE: "local", IFRAMER_DATA_DIR: DATA_DIR },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => process.stdout.write(`[srv] ${d}`));
srv.stderr.on("data", (d) => process.stdout.write(`[srv-err] ${d}`));

function api(path, body) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": SECRET },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());
}
function apiGet(path) {
  return fetch(`${BASE}${path}`, { headers: { "x-api-key": SECRET } }).then((r) => r.json());
}

let failures = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${!cond && extra ? " — " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
}

/** A fake extension client: sends hello, answers list_tabs/execute/ping, and
 *  records which execute calls it received (to prove routing). */
function makeClient({ profileId, profileName, tabs }) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws?token=${SECRET}`);
  const state = { ws, profileName, executed: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ id: msg.id, ok: true, result: { pong: true } }));
    } else if (msg.type === "list_tabs") {
      ws.send(JSON.stringify({ id: msg.id, ok: true, result: { tabs } }));
    } else if (msg.type === "execute") {
      state.executed.push(msg.tabId);
      const capturing = msg.options && msg.options.captureApi;
      ws.send(JSON.stringify({ id: msg.id, ok: true, result: {
        ok: true, completedSteps: msg.steps.length, totalSteps: msg.steps.length,
        results: msg.steps.map((s, i) => ({ stepIndex: i, ok: true, step: s, result: { did: s.type } })),
        finalState: { url: tabs[0].url, title: tabs[0].title }, obstacles: [], durationMs: 5,
        modeUsed: "extension", routedTo: profileName,
        capturedRequests: capturing ? [{
          method: "POST", url: "https://mail.google.com/api/v1/threads/archive?id=42",
          path: "/api/v1/threads/archive", queryParams: { id: "42" },
          requestHeaders: { authorization: "Bearer tok123", "content-type": "application/json", cookie: "SID=abc" },
          requestBody: { action: "archive" }, responseStatus: 200, responseHeaders: {}, resourceType: "xhr", triggeredAtStep: 0, timestamp: 1,
        }] : undefined,
      } }));
    }
  });
  const open = new Promise((res, rej) => { ws.on("open", () => { ws.send(JSON.stringify({ type: "hello", profileId, profileName, extVersion: "test" })); res(); }); ws.on("error", rej); });
  return { state, open };
}

async function main() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`).then((r) => r.json())).ok) break; } catch {}
    await sleep(200);
  }

  // 1. No client connected
  let st = await apiGet("/extension/status");
  check("status: not connected initially", st.connected === false, st);

  // 2. Bad token → 4001
  const bad = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws?token=wrong`);
  const badClosed = await new Promise((res) => { bad.on("close", (c) => res(c)); bad.on("error", () => {}); });
  check("bad token closed with 4001", badClosed === 4001, { badClosed });

  // 2b. First-message auth (the real extension's path — no token in the URL)
  const msgAuth = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws`);
  await new Promise((res, rej) => { msgAuth.on("open", res); msgAuth.on("error", rej); });
  msgAuth.send(JSON.stringify({ type: "auth", token: SECRET }));
  msgAuth.send(JSON.stringify({ type: "hello", profileId: "msg-auth-id", profileName: "MsgAuth", extVersion: "test" }));
  await sleep(300);
  st = await apiGet("/extension/status");
  check("message auth: accepted and hello landed", st.connected === true && st.clients.some((c) => c.profileName === "MsgAuth"), st);
  msgAuth.close();
  await sleep(300);

  // 2c. Bad first-message auth → 4001
  const msgBad = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws`);
  await new Promise((res, rej) => { msgBad.on("open", res); msgBad.on("error", rej); });
  msgBad.send(JSON.stringify({ type: "auth", token: "wrong" }));
  const msgBadClosed = await new Promise((res) => { msgBad.on("close", (c) => res(c)); });
  check("bad message auth closed with 4001", msgBadClosed === 4001, { msgBadClosed });

  // 3. Two profiles connect
  const work = makeClient({ profileId: "work-id", profileName: "Work", tabs: [
    { id: 7, windowId: 1, title: "Gmail", url: "https://mail.google.com/", active: true },
    { id: 8, windowId: 1, title: "GitHub", url: "https://github.com/", active: false },
  ] });
  const personal = makeClient({ profileId: "personal-id", profileName: "Personal", tabs: [
    { id: 100, windowId: 2, title: "Gmail", url: "https://mail.google.com/", active: true },
  ] });
  await Promise.all([work.open, personal.open]);
  await sleep(300); // let hello land

  st = await apiGet("/extension/status");
  check("status: 2 profiles connected", st.connected === true && st.clients.length === 2, st);
  check("status: profile names present", st.clients.map((c) => c.profileName).sort().join(",") === "Personal,Work", st.clients);

  // 4. list tabs aggregates across profiles, tagged
  const tabs = await api("/extension/tabs", {});
  check("tabs: aggregated 3 across profiles", tabs.tabs?.length === 3, tabs.tabs?.map((t) => t.id));
  const gmailWork = tabs.tabs?.find((t) => t.id === 7);
  check("tabs: tagged with profileName", gmailWork?.profileName === "Work", gmailWork);

  // 5. execute now routes through the real connectOverCDP pipeline (tested end-
  // to-end in cdp-relay.mjs). Here we only assert the bridge-level contract: a
  // missing tabId is rejected before any pipeline work.

  // 7. missing tabId → error
  const badExec = await api("/extension/execute", { steps: [{ type: "click", selector: "a" }] });
  check("execute without tabId errors", badExec.ok === false || !!badExec.error, badExec);

  // 8. same-profile reconnect evicts the stale connection (no pile-up)
  const work2 = makeClient({ profileId: "work-id", profileName: "Work", tabs: [
    { id: 7, windowId: 1, title: "Gmail", url: "https://mail.google.com/", active: true },
  ] });
  await work2.open;
  await sleep(400);
  st = await apiGet("/extension/status");
  check("dedup: still 2 profiles after same-profile reconnect", st.clients.length === 2, st.clients?.map((c) => c.profileName));

  // 9. everyone disconnects
  work.state.ws.close(); personal.state.ws.close(); work2.state.ws.close();
  await sleep(400);
  st = await apiGet("/extension/status");
  check("status: disconnected after all close", st.connected === false, st);

  console.log(failures === 0 ? "\nALL BRIDGE TESTS PASSED" : `\n${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("SMOKE ERROR", e); failures++; })
  .finally(async () => {
    try { await fetch(`${BASE}/shutdown`, { method: "POST" }); } catch {}
    await sleep(300);
    try { srv.kill("SIGKILL"); } catch {}
    process.exit(failures === 0 ? 0 : 1);
  });
