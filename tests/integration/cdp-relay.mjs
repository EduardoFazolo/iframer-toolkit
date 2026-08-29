// Protocol test for the CDP relay shim. Simulates BOTH ends — a fake extension
// (answering cdp_attach/cdp_command over the bridge) and a fake Playwright client
// (raw CDP WS to the relay) — to verify the handshake, sessionId stripping, and
// event tagging without needing a real browser. Run with: bun tests/integration/cdp-relay.mjs
import http from "http";
import WebSocket from "ws";

process.env.IFRAMER_SECRET = "relay-test-secret";
const SECRET = process.env.IFRAMER_SECRET;

const { extensionBridge } = await import("../../src/lib/extension/bridge.ts");
const { CdpRelay } = await import("../../src/lib/extension/cdp-relay.ts");

let failures = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${!cond && extra !== undefined ? " — " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Stand up the bridge on an ephemeral port.
const server = http.createServer((_q, s) => { s.writeHead(404); s.end(); });
extensionBridge.attach(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// 2) Fake extension: answers cdp_attach + cdp_command; can emit cdp_event.
const TARGET = { targetId: "T-123", type: "page", url: "https://slack.com/x", title: "Slack" };
let sawCommand = null;
const ext = new WebSocket(`ws://127.0.0.1:${port}/extension/ws?token=${SECRET}`);
ext.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "ping") ext.send(JSON.stringify({ id: m.id, ok: true, result: { pong: true } }));
  else if (m.type === "cdp_attach") ext.send(JSON.stringify({ id: m.id, ok: true, result: { targetInfo: TARGET } }));
  else if (m.type === "cdp_command") {
    sawCommand = { sessionId: m.sessionId, method: m.method, params: m.params };
    ext.send(JSON.stringify({ id: m.id, ok: true, result: { echoed: m.method } }));
  } else if (m.type === "cdp_detach") ext.send(JSON.stringify({ id: m.id, ok: true, result: {} }));
});
await new Promise((res, rej) => { ext.on("open", () => { ext.send(JSON.stringify({ type: "hello", profileId: "p1", profileName: "Test", extVersion: "test" })); res(); }); ext.on("error", rej); });
await sleep(200);

// 3) Start the relay for tab 1.
const relay = new CdpRelay(1);
await relay.start();
check("relay endpoint is a ws url", relay.cdpEndpoint().startsWith("ws://127.0.0.1:"), relay.cdpEndpoint());

// 4) Fake Playwright: raw CDP WS to the relay.
const pw = new WebSocket(relay.cdpEndpoint());
const events = [];
const pending = new Map();
let nextId = 1;
pw.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (typeof m.id === "number" && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
});
const cmd = (method, params, sessionId) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); pw.send(JSON.stringify({ id, sessionId, method, params })); });
await new Promise((res, rej) => { pw.on("open", res); pw.on("error", rej); });

// 5) Browser.getVersion → synthetic, protocol 1.3
const ver = await cmd("Browser.getVersion");
check("Browser.getVersion → protocol 1.3", ver.result?.protocolVersion === "1.3", ver.result);

// 6) Target.setAutoAttach (root) → emits attachedToTarget + returns {}
const auto = await cmd("Target.setAutoAttach", { autoAttach: true, flatten: true });
check("setAutoAttach returns {}", auto.result && Object.keys(auto.result).length === 0, auto.result);
await sleep(100);
const attached = events.find((e) => e.method === "Target.attachedToTarget");
check("emits Target.attachedToTarget", !!attached, events.map((e) => e.method));
check("attached sessionId is pw-tab-1", attached?.params?.sessionId === "pw-tab-1", attached?.params);
check("attached targetInfo is the real one", attached?.params?.targetInfo?.targetId === "T-123", attached?.params?.targetInfo);

// 7) Target.getTargetInfo (root) → targetInfo
const gti = await cmd("Target.getTargetInfo");
check("getTargetInfo returns target", gti.result?.targetInfo?.targetId === "T-123", gti.result);

// 8) Forwarded command with pw-tab-1 sessionId → extension sees it with sessionId STRIPPED
const evalRes = await cmd("Runtime.evaluate", { expression: "1+1" }, "pw-tab-1");
check("forwarded command responds", evalRes.result?.echoed === "Runtime.evaluate", evalRes.result);
check("top-level sessionId stripped before chrome.debugger", sawCommand && sawCommand.sessionId === undefined, sawCommand);
check("forwarded method + params intact", sawCommand?.method === "Runtime.evaluate" && sawCommand?.params?.expression === "1+1", sawCommand);

// 9) Child command keeps its real sessionId
sawCommand = null;
await cmd("Runtime.evaluate", { expression: "2" }, "child-sess-9");
check("child sessionId passed through", sawCommand?.sessionId === "child-sess-9", sawCommand);

// 10) Extension event → relayed to pw, tagged with pw-tab-1 for top-level
events.length = 0;
ext.send(JSON.stringify({ type: "cdp_event", tabId: 1, method: "Page.frameNavigated", params: { frame: { id: "f1" } } }));
await sleep(150);
const ev = events.find((e) => e.method === "Page.frameNavigated");
check("top-level event relayed to pw", !!ev, events.map((e) => e.method));
check("top-level event tagged pw-tab-1", ev?.sessionId === "pw-tab-1", ev);

// 11) Child event keeps its own sessionId
events.length = 0;
ext.send(JSON.stringify({ type: "cdp_event", tabId: 1, sessionId: "child-sess-9", method: "Network.requestWillBeSent", params: {} }));
await sleep(150);
const cev = events.find((e) => e.method === "Network.requestWillBeSent");
check("child event keeps its sessionId", cev?.sessionId === "child-sess-9", cev);

await relay.stop();
ext.close();
try { server.close(); } catch {}
console.log(failures === 0 ? "\nALL CDP-RELAY TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
