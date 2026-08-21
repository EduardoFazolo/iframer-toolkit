// iframer extension — background service worker.
//
// Dials OUT to the iframer local server over WebSocket (the server can't reach
// into Chrome; extensions can't listen, so the extension is always the client).
// Receives step pipelines, runs them in the tab the user explicitly allowed,
// and streams results back. iframer is the brain; this is the hands.

import { iframerRunStep } from "./interpreter.js";
import { capture } from "./capture.js";
import { cdp } from "./cdp.js";

// Extra settle time after the last step so late/async XHRs (auth re-challenges,
// deferred mutations) are still captured before we stop listening.
const CAPTURE_DRAIN_MS = 2500;

const PORT_START = 3022;
const PORT_END = 3042;
const RECONNECT_MS = 2000;

let ws = null;
let currentPort = null;
let scanning = false;

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || "";
}

// Read the profile straight from Chrome — the signed-in account's email is the
// natural profile name. Returns {email, id} or null if not signed in.
function getChromeProfile() {
  return new Promise((resolve) => {
    try {
      chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(info && info.email ? info : null);
      });
    } catch {
      // Older Chrome without the options arg.
      try {
        chrome.identity.getProfileUserInfo((info) => resolve(info && info.email ? info : null));
      } catch {
        resolve(null);
      }
    }
  });
}

// Stable per-profile identity, auto-detected from Chrome. Prefers the signed-in
// account (email as name, gaia id as id). Falls back to a persistent per-profile
// UUID when Chrome isn't signed in. The popup label is an OPTIONAL override only.
async function ensureProfile() {
  const store = await chrome.storage.local.get(["profileId", "profileLabel"]);
  const info = await getChromeProfile();

  let profileId = store.profileId;
  if (!profileId) {
    profileId = (info && info.id) || crypto.randomUUID();
    await chrome.storage.local.set({ profileId });
  }

  const profileName =
    (store.profileLabel && store.profileLabel.trim()) ||
    (info && info.email) ||
    `Chrome profile ${String(profileId).slice(0, 6)}`;

  return { profileId, profileName, email: info && info.email };
}

async function sendHello(sock) {
  try {
    const { profileId, profileName } = await ensureProfile();
    sock.send(
      JSON.stringify({
        type: "hello",
        profileId,
        profileName,
        extVersion: chrome.runtime.getManifest().version,
      }),
    );
  } catch {
    /* best-effort identity */
  }
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
      sendHello(sock);
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
    } else if (type === "cdp_attach") {
      reply(sock, id, true, await cdpAttach(msg.tabId));
    } else if (type === "cdp_command") {
      reply(sock, id, true, await cdpCommand(msg.tabId, msg.sessionId, msg.method, msg.params));
    } else if (type === "cdp_detach") {
      await cdpDetach(msg.tabId);
      reply(sock, id, true, { detached: true });
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

// Chrome discards (freezes) background tabs to save memory — a discarded tab has
// no content process, so executeScript fails with a host-access error. Wake it
// by reloading before we try to drive it.
async function ensureAwake(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    if (t.discarded || t.status === "unloaded") {
      await chrome.tabs.reload(tabId);
      await waitForLoad(tabId);
      await sleep(1500); // let the SPA boot after document load
    }
  } catch {
    /* tab gone — the step will surface the real error */
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

// Resolve a step's target to viewport-center coords (for trusted CDP input),
// atomically in one injection — by selector/@ref OR by find-criteria (so the
// coords match a live element, not a ref that a re-render may have dropped).
// Runs in the isolated world — DOM only, no eval.
async function getElementCenter(tabId, step) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    args: [step],
    func: (s) => {
      const REF = "data-iframer-ref";
      function visible(el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const st = getComputedStyle(el);
        return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
      }
      function nameOf(el) {
        const a = el.getAttribute("aria-label");
        if (a) return a.trim();
        if (el.getAttribute("placeholder")) return el.getAttribute("placeholder").trim();
        return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      }
      let el = null;
      if (s.selector) {
        el = s.selector.startsWith("@e")
          ? document.querySelector(`[${REF}="${s.selector}"]`)
          : document.querySelector(s.selector);
      } else if (s.name || s.text || s.placeholder) {
        const want = (s.name || s.text || s.placeholder || "").toLowerCase();
        const exact = !!s.exact;
        const sel = "a,button,input,textarea,select,summary,[role],[onclick],[contenteditable=true],[tabindex]:not([tabindex='-1'])";
        const cands = Array.from(document.querySelectorAll(sel)).filter((e) => {
          if (!visible(e)) return false;
          const nm = nameOf(e).toLowerCase();
          return exact ? nm === want : nm.includes(want);
        });
        cands.sort((a, b) => nameOf(a).length - nameOf(b).length);
        el = cands[0] || null;
      }
      if (!el) return null;
      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    },
  });
  return res ? res.result : null;
}

async function runStep(tabId, step, cdpTarget) {
  // Trusted input path (CDP): synthetic DOM events are ignored by some SPAs
  // (Slack), so when the pipeline runs with options.trusted we send real,
  // isTrusted mouse/key events via chrome.debugger.
  if (cdpTarget && (step.type === "click" || step.type === "human-click" || step.type === "right-click")) {
    const c = await getElementCenter(tabId, step);
    if (!c) return { __error: `No element for: ${step.selector || step.name || step.text || step.placeholder || "(no target)"}` };
    if (step.type === "right-click") await cdp.rightClick(cdpTarget, c.x, c.y);
    else await cdp.click(cdpTarget, c.x, c.y);
    return { clicked: true, trusted: true };
  }
  if (cdpTarget && step.type === "keyboard") {
    await cdp.key(cdpTarget, step.key, { meta: step.meta, ctrl: step.ctrl, shift: step.shift, alt: step.alt });
    return { pressed: step.key, trusted: true };
  }

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
    // The tab is focused (see focusTab) so captureVisibleTab works. Return the
    // image as a data URL; the server persists it to a file the agent can read.
    try {
      const tab = await chrome.tabs.get(tabId);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 60 });
      return { dataUrl };
    } catch (e) {
      return { __error: `screenshot failed: ${e && e.message ? e.message : String(e)}` };
    }
  }
  // Everything else runs inside the page.
  return injectStep(tabId, step);
}

// Bring the target tab to the foreground before driving it. Chrome throttles
// and can freeze background tabs — their DOM goes stale and CDP mouse events
// don't hit-test — so a backgrounded tab silently no-ops clicks. Focusing it
// (the state a human is in when they drive their own tab) is what makes clicks,
// reads, and screenshots actually work. This is why it "just worked" on a tab
// the user was already looking at.
async function focusTab(tabId) {
  try {
    const t = await chrome.tabs.get(tabId);
    await chrome.windows.update(t.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    await sleep(400); // let the tab un-throttle and paint
  } catch {
    /* tab/window gone — the step will surface the real error */
  }
}

async function runPipeline(tabId, steps, options) {
  const totalSteps = steps.length;
  const started = Date.now();
  const results = [];
  const continueOnError = !!options.continueOnError;
  await ensureAwake(tabId);
  if (options.focus !== false) await focusTab(tabId);
  const capturing = !!options.captureApi;
  if (capturing) capture.start(tabId);

  // Trusted input: attach the debugger ONCE for the whole pipeline (one banner).
  let cdpTarget = null;
  if (options.trusted) {
    try {
      cdpTarget = await cdp.attach(tabId);
    } catch (e) {
      // Attach can fail if DevTools is open on the tab or another debugger is
      // attached. Fall back to synthetic input rather than aborting.
      cdpTarget = null;
    }
  }
  const cleanup = async () => {
    if (cdpTarget) {
      await cdp.detach(cdpTarget);
      cdpTarget = null;
    }
  };

  // Drain briefly so late/async XHRs land, then return the raw requests
  // (iframer post-processes them into endpoints server-side).
  async function collectCapture() {
    if (!capturing) return undefined;
    await sleep(CAPTURE_DRAIN_MS);
    return capture.stop(tabId);
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (capturing) capture.setStep(i);
    let result;
    try {
      result = await runStep(tabId, step, cdpTarget);
    } catch (e) {
      result = { __error: e && e.message ? e.message : String(e) };
    }
    const failed = result && typeof result === "object" && "__error" in result;
    if (failed) {
      results.push({ stepIndex: i, ok: false, step, error: result.__error });
      if (!continueOnError) {
        const capturedRequests = await collectCapture();
        await cleanup();
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
          capturedRequests,
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

  const capturedRequests = await collectCapture();
  await cleanup();
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
    capturedRequests,
  };
}

// ─── CDP relay ──────────────────────────────────────────────────────
// Bridges chrome.debugger for a tab to iframer's server, which connects to it
// with patchright's connectOverCDP and drives the tab through the REAL iframer
// pipeline (find/click/snapshot/navigate/capture). This replaces the hand-rolled
// interpreter with iframer's proven engine. Shows Chrome's debug banner.
const attachedTabs = new Set();

function dbgSend(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params || {}, (result) => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message));
      else resolve(result);
    });
  });
}

async function cdpAttach(tabId) {
  await focusTab(tabId); // live tab so CDP hit-testing/render works
  if (!attachedTabs.has(tabId)) {
    await chrome.debugger.attach({ tabId }, "1.3");
    attachedTabs.add(tabId);
  }
  const info = await dbgSend({ tabId }, "Target.getTargetInfo");
  return { targetInfo: info && info.targetInfo };
}

async function cdpCommand(tabId, sessionId, method, params) {
  const target = sessionId ? { tabId, sessionId } : { tabId };
  return await dbgSend(target, method, params);
}

async function cdpDetach(tabId) {
  attachedTabs.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch {}
}

// Forward all debugger events for attached tabs to the server (tagged with the
// child sessionId when present, undefined for the top-level page).
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!attachedTabs.has(source.tabId)) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "cdp_event", tabId: source.tabId, sessionId: source.sessionId, method, params }));
    } catch {}
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (typeof source.tabId === "number" && attachedTabs.has(source.tabId)) {
    attachedTabs.delete(source.tabId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "cdp_event", tabId: source.tabId, method: "Inspector.detached", params: { reason } }));
      } catch {}
    }
  }
});

// ─── Popup <-> worker messaging ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.cmd === "get-state") {
      const { status } = await chrome.storage.local.get("status");
      const { profileId, profileName } = await ensureProfile();
      sendResponse({ ok: true, status: status || { connected: false }, profileId, profileName });
    } else if (msg.cmd === "set-label") {
      await chrome.storage.local.set({ profileLabel: (msg.label || "").trim() });
      if (ws && ws.readyState === WebSocket.OPEN) sendHello(ws); // push the new name to the server
      const { profileId, profileName } = await ensureProfile();
      sendResponse({ ok: true, profileId, profileName });
    } else if (msg.cmd === "diag") {
      // Report exactly what the loaded extension has, and whether a real
      // executeScript against the active tab works.
      const hostPermissions = chrome.runtime.getManifest().host_permissions || [];
      const perms = await chrome.permissions.getAll();
      let tabUrl = null, ok = false, value = null, error = null;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabUrl = tab && tab.url;
        if (tab) {
          const [r] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => location.href,
          });
          ok = true;
          value = r && r.result;
        }
      } catch (e) {
        error = e && e.message ? e.message : String(e);
      }
      sendResponse({ ok: true, hostPermissions, grantedOrigins: perms.origins || [], tabUrl, okExec: ok, value, error });
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

// Keep trying to (re)connect. Two layers, because an MV3 service worker is
// killed after ~30s idle and a plain setInterval dies with it:
//  - setInterval: fast retry while the worker is awake.
//  - chrome.alarms: wakes the (possibly-terminated) worker to reconnect.
connectLoop();
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectLoop();
}, RECONNECT_MS);

chrome.alarms.create("iframer-reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "iframer-reconnect" && (!ws || ws.readyState !== WebSocket.OPEN)) {
    connectLoop();
  }
});
