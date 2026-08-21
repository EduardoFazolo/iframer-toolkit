// Reproduce the real connectOverCDP path against the relay, with a fake extension
// answering enough CDP for Playwright to attach. Isolates the "ws connecting"
// timeout without a browser. Run: bun tests/integration/cdp-connect.mjs
import http from "http";
import WebSocket from "ws";

process.env.IFRAMER_SECRET = "connect-test-secret";
const SECRET = process.env.IFRAMER_SECRET;
const { extensionBridge } = await import("../../src/lib/extension/bridge.ts");
const { CdpRelay } = await import("../../src/lib/extension/cdp-relay.ts");
const _pwc = await import("playwright-core"); const chromium = _pwc.chromium || _pwc.default.chromium;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bridge + fake extension that answers CDP commands generically.
const server = http.createServer((_q, s) => { s.writeHead(404); s.end(); });
extensionBridge.attach(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const TARGET = { targetId: "T-abc", type: "page", url: "https://example.com/", title: "Example", attached: false, browserContextId: "ctx-1" };
const ext = new WebSocket(`ws://127.0.0.1:${port}/extension/ws?token=${SECRET}`);
ext.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  const ok = (result) => ext.send(JSON.stringify({ id: m.id, ok: true, result }));
  if (m.type === "ping") return ok({ pong: true });
  if (m.type === "cdp_attach") return ok({ targetInfo: TARGET });
  if (m.type === "cdp_detach") return ok({});
  if (m.type === "cdp_command") {
    // Minimal plausible answers so Playwright's attach sequence proceeds.
    if (m.method === "Page.getFrameTree")
      return ok({ frameTree: { frame: { id: "F1", loaderId: "L1", url: TARGET.url, securityOrigin: "https://example.com", mimeType: "text/html" }, childFrames: [] } });
    if (m.method === "Page.getNavigationHistory") return ok({ currentIndex: 0, entries: [{ id: 1, url: TARGET.url, title: "Example" }] });
    if (m.method === "Runtime.evaluate") return ok({ result: { type: "object", value: {} } });
    return ok({});
  }
});
await new Promise((res, rej) => { ext.on("open", () => { ext.send(JSON.stringify({ type: "hello", profileId: "p", profileName: "P", extVersion: "t" })); res(); }); ext.on("error", rej); });
await sleep(150);

const relay = new CdpRelay(1);
await relay.start();
console.log("relay endpoint:", relay.httpEndpoint());

let outcome = "unknown";
try {
  console.log("connecting via connectOverCDP...");
  const browser = await chromium.connectOverCDP(relay.httpEndpoint(), { timeout: 15000 });
  const ctxs = browser.contexts();
  console.log("CONNECTED. contexts:", ctxs.length, "pages:", ctxs[0]?.pages().length ?? 0);
  outcome = "connected";
  await browser.close().catch(() => {});
} catch (e) {
  console.log("CONNECT FAILED:", e.message.split("\n")[0]);
  outcome = "failed";
} finally {
  await relay.stop();
  ext.close();
  try { server.close(); } catch {}
}
console.log(outcome === "connected" ? "\nRESULT: connectOverCDP WORKS" : "\nRESULT: connectOverCDP FAILED");
process.exit(outcome === "connected" ? 0 : 1);
