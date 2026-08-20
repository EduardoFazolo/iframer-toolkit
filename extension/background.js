// iframer extension — background service worker.
//
// Dials OUT to the iframer local server over WebSocket (the server can't reach
// into Chrome; extensions can't listen, so the extension is always the client).
// Receives step pipelines, runs them in the tab the user explicitly allowed,
// and streams results back. iframer is the brain; this is the hands.

import { iframerRunStep } from "./interpreter.js";

const PORT_START = 3022;
const PORT_END = 3042;
const RECONNECT_MS = 2000;

let ws = null;
let currentPort = null;
let scanning = false;
// Tabs the user has explicitly allowed via the popup. execute refuses any tab
// not in this set — this is the "run in THIS window" consent gesture.
const allowedTabs = new Set();

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || "";
}

async function setStatus(patch) {
  const prev = (await chrome.storage.local.get("status")).status || {};
  await chrome.storage.local.set({ status: { ...prev, ...patch } });
}

async function connectLoop() {
  if (scanning || (ws && ws.readyState === WebSocket.OPEN)) return;
  const token = await getToken();
  if (!token) {
    await setStatus({ connected: false, reason: "no-token" });
    return;
  }
  scanning = true;
  try {
    for (let port = PORT_START; port <= PORT_END; port++) {
      const ok = await tryConnect(port, token);
      if (ok) {
        scanning = false;
        return;
      }
    }
    await setStatus({ connected: false, reason: "server-not-found" });
  } finally {
    scanning = false;
  }
}

function tryConnect(port, token) {
  return new Promise((resolve) => {
    let settled = false;
    let sock;
    try {
      sock = new WebSocket(`ws://127.0.0.1:${port}/extension/ws?token=${encodeURIComponent(token)}`);
    } catch {
      resolve(false);
      return;
    }
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    // If it doesn't open quickly, treat this port as a miss.
    const timer = setTimeout(() => {
      try { sock.close(); } catch {}
      done(false);
    }, 800);

    sock.onopen = () => {
      clearTimeout(timer);
      ws = sock;
      currentPort = port;
      wire(sock);
      setStatus({ connected: true, port, reason: null });
      done(true);
    };
    sock.onclose = (ev) => {
      clearTimeout(timer);
      // 4001 = server is there but rejected our token. Stop scanning; surface it.
      if (ev.code === 4001) {
        setStatus({ connected: false, reason: "bad-token" });
        done(true); // "found" the server, just unauthorized — don't keep scanning
        return;
      }
      done(false);
    };
    sock.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
  });
}

function wire(sock) {
  sock.onmessage = (ev) => handleMessage(sock, ev.data);
  sock.onclose = () => {
    if (ws === sock) {
      ws = null;
      currentPort = null;
      setStatus({ connected: false, reason: "disconnected" });
    }
  };
  sock.onerror = () => {
    try { sock.close(); } catch {}
  };
}

function reply(sock, id, ok, payload) {
  try {
    sock.send(JSON.stringify(ok ? { id, ok: true, result: payload } : { id, ok: false, error: payload }));
  } catch {
    /* socket gone */
  }
}

async function handleMessage(sock, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const { id, type } = msg;
  if (typeof id !== "number") return;

  try {
    if (type === "ping") {
      reply(sock, id, true, { pong: true });
    } else if (type === "list_tabs") {
      reply(sock, id, true, { tabs: await listTabs() });
    } else if (type === "execute") {
      reply(sock, id, true, await runPipeline(msg.tabId, msg.steps || [], msg.options || {}));
    } else {
      reply(sock, id, false, `Unknown message type: ${type}`);
    }
  } catch (e) {
    reply(sock, id, false, e && e.message ? e.message : String(e));
  }
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => typeof t.id === "number")
    .map((t) => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title || "",
      url: t.url || "",
      active: !!t.active,
      favIconUrl: t.favIconUrl,
    }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tabState(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    return { url: t.url || "", title: t.title || "" };
  } catch {
    return { url: "", title: "" };
  }
}

async function waitForLoad(tabId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t.status === "complete") return;
    } catch {
      return;
    }
    await sleep(150);
  }
}

async function injectStep(tabId, step) {
  const world = step.type === "extract" || step.type === "evaluate" ? "MAIN" : "ISOLATED";
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world,
    func: iframerRunStep,
    args: [step],
  });
  return res ? res.result : { __error: "No result from injected step." };
}

async function runStep(tabId, step) {
  // Steps the background handles directly (tab-level, not page-level).
  if (step.type === "navigate") {
    await chrome.tabs.update(tabId, { url: step.url });
    await waitForLoad(tabId);
    return { navigated: true };
  }
  if (step.type === "wait") {
    await sleep(typeof step.ms === "number" ? step.ms : 1000);
    return { waited: true };
  }
  if (step.type === "screenshot") {
    // Banner-free capture is best-effort: only the visible tab can be grabbed,
    // and the extension can't write files, so we just confirm it worked.
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 });
      return { captured: true, note: "Screenshot captured (not persisted in extension mode). Prefer `snapshot` for perception." };
    } catch (e) {
      return { __error: `screenshot failed: ${e && e.message ? e.message : String(e)}` };
    }
  }
  // Everything else runs inside the page.
  return injectStep(tabId, step);
}

async function runPipeline(tabId, steps, options) {
  const totalSteps = steps.length;
  const started = Date.now();

  if (!allowedTabs.has(tabId)) {
    const st = await tabState(tabId);
    return {
      ok: false,
      completedSteps: 0,
      totalSteps,
      results: [],
      finalState: st,
      obstacles: [],
      durationMs: Date.now() - started,
      modeUsed: "extension",
      error: {
        failedAtStep: 0,
        failedStep: steps[0],
        errorType: "action-failed",
        message: `Tab ${tabId} has not been allowed. The user must open that tab, click the iframer icon, and press "Allow this tab".`,
        pageState: st,
        suggestion: "Ask the user to allow the tab in the iframer extension popup, then retry.",
        retryable: true,
      },
    };
  }

  const results = [];
  const continueOnError = !!options.continueOnError;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let result;
    try {
      result = await runStep(tabId, step);
    } catch (e) {
      result = { __error: e && e.message ? e.message : String(e) };
    }
    const failed = result && typeof result === "object" && "__error" in result;
    if (failed) {
      results.push({ stepIndex: i, ok: false, step, error: result.__error });
      if (!continueOnError) {
        const st = await tabState(tabId);
        return {
          ok: false,
          completedSteps: i,
          totalSteps,
          results,
          finalState: st,
          obstacles: [],
          durationMs: Date.now() - started,
          modeUsed: "extension",
          error: {
            failedAtStep: i,
            failedStep: step,
            errorType: "action-failed",
            message: result.__error,
            pageState: st,
            suggestion: "Take a `snapshot` step to see current elements, then retry with a fresh ref.",
            retryable: true,
          },
        };
      }
    } else {
      results.push({ stepIndex: i, ok: true, step, result });
    }
  }

  const finalState = await tabState(tabId);
  return {
    ok: true,
    completedSteps: totalSteps,
    totalSteps,
    results,
    finalState,
    obstacles: [],
    durationMs: Date.now() - started,
    modeUsed: "extension",
  };
}

// ─── Popup <-> worker messaging ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.cmd === "allow-tab" && typeof msg.tabId === "number") {
      allowedTabs.add(msg.tabId);
      sendResponse({ ok: true, allowed: Array.from(allowedTabs) });
    } else if (msg.cmd === "disallow-tab" && typeof msg.tabId === "number") {
      allowedTabs.delete(msg.tabId);
      sendResponse({ ok: true, allowed: Array.from(allowedTabs) });
    } else if (msg.cmd === "get-state") {
      const { status } = await chrome.storage.local.get("status");
      sendResponse({ ok: true, status: status || { connected: false }, allowed: Array.from(allowedTabs) });
    } else if (msg.cmd === "set-token") {
      await chrome.storage.local.set({ token: msg.token || "" });
      // Force a fresh connection attempt with the new token.
      try { if (ws) ws.close(); } catch {}
      ws = null;
      await connectLoop();
      const { status } = await chrome.storage.local.get("status");
      sendResponse({ ok: true, status: status || { connected: false } });
    } else {
      sendResponse({ ok: false, error: "unknown command" });
    }
  })();
  return true; // async response
});

// Drop a tab from the allowed set when it closes.
chrome.tabs.onRemoved.addListener((tabId) => allowedTabs.delete(tabId));

// Keep trying to (re)connect.
connectLoop();
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectLoop();
}, RECONNECT_MS);
