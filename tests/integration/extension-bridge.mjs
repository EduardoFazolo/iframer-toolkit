import { spawn } from "child_process";
import WebSocket from "ws";

const SECRET = "smoke-secret-123";
const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;
const repo = new URL("../..", import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn("bun", ["run", "index.ts"], {
  cwd: repo,
  env: { ...process.env, PORT: String(PORT), IFRAMER_SECRET: SECRET, IFRAMER_MODE: "local" },
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
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${extra ? " — " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
}

async function main() {
  // wait for health
  for (let i = 0; i < 50; i++) {
    try {
      const h = await fetch(`${BASE}/health`).then((r) => r.json());
      if (h.ok) break;
    } catch {}
    await sleep(200);
  }

  // 1. No extension connected yet
  let st = await apiGet("/extension/status");
  check("status: not connected initially", st.connected === false, st);

  // 2. Reject bad token
  const bad = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws?token=wrong`);
  const badClosed = await new Promise((res) => {
    bad.on("close", (code) => res(code));
    bad.on("error", () => {});
  });
  check("bad token closed with 4001", badClosed === 4001, { badClosed });

  // 3. Connect a fake extension with the right token
  const ext = new WebSocket(`ws://127.0.0.1:${PORT}/extension/ws?token=${SECRET}`);
  ext.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "list_tabs") {
      ext.send(JSON.stringify({ id: msg.id, ok: true, result: { tabs: [
        { id: 7, windowId: 1, title: "Gmail", url: "https://mail.google.com/", active: true },
        { id: 8, windowId: 1, title: "GitHub", url: "https://github.com/", active: false },
      ] } }));
    } else if (msg.type === "execute") {
      const capturing = msg.options && msg.options.captureApi;
      ext.send(JSON.stringify({ id: msg.id, ok: true, result: {
        ok: true, completedSteps: msg.steps.length, totalSteps: msg.steps.length,
        results: msg.steps.map((s, i) => ({ stepIndex: i, ok: true, step: s, result: { did: s.type } })),
        finalState: { url: "https://mail.google.com/", title: "Gmail" },
        obstacles: [], durationMs: 5, modeUsed: "extension",
        capturedRequests: capturing ? [
          {
            method: "POST", url: "https://mail.google.com/api/v1/threads/archive?id=42",
            path: "/api/v1/threads/archive", queryParams: { id: "42" },
            requestHeaders: { "authorization": "Bearer tok123", "content-type": "application/json", "cookie": "SID=abc" },
            requestBody: { action: "archive" }, responseStatus: 200, responseHeaders: {}, resourceType: "xhr", triggeredAtStep: 0, timestamp: 1,
          },
        ] : undefined,
      } }));
    }
  });
  await new Promise((res, rej) => { ext.on("open", res); ext.on("error", rej); });
  await sleep(200);

  st = await apiGet("/extension/status");
  check("status: connected after handshake", st.connected === true, st);

  // 4. list tabs through HTTP
  const tabs = await api("/extension/tabs", {});
  check("list tabs returns 2", tabs.ok && tabs.tabs?.length === 2, tabs);
  check("tab id 7 is Gmail", tabs.tabs?.[0]?.id === 7, tabs.tabs?.[0]);

  // 5. execute through HTTP
  const exec = await api("/extension/execute", { tabId: 7, steps: [{ type: "navigate", url: "x" }, { type: "click", selector: "@e1" }], options: {} });
  check("execute ok", exec.ok === true, exec);
  check("execute completed 2 steps", exec.completedSteps === 2, exec);
  check("execute modeUsed extension", exec.modeUsed === "extension", exec);

  // 5b. reverse-engineering: captureApi → capturedApi with classified endpoints
  const re = await api("/extension/execute", { tabId: 7, steps: [{ type: "click", selector: "@e1" }], options: { captureApi: true } });
  check("RE: capturedApi present", Array.isArray(re.capturedApi) && re.capturedApi.length === 1, re.capturedApi);
  const ep = re.capturedApi?.[0]?.endpoints?.[0];
  check("RE: endpoint parameterized + classified", !!ep && ep.method === "POST" && ep.path === "/api/v1/threads/archive" && !!ep.functionName && !!ep.curl, ep);
  check("RE: auth extracted", re.capturedApi?.[0]?.auth?.authorization === "Bearer tok123", re.capturedApi?.[0]?.auth);
  check("RE: raw capturedRequests stripped from response", re.capturedRequests === undefined, Object.keys(re));

  // 6. execute with missing tabId → 400-style error
  const badExec = await api("/extension/execute", { steps: [{ type: "click", selector: "a" }] });
  check("execute without tabId errors", badExec.ok === false || !!badExec.error, badExec);

  ext.close();
  await sleep(300);
  st = await apiGet("/extension/status");
  check("status: disconnected after ext closes", st.connected === false, st);

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
