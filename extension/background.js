// iframer extension — background service worker.
//
// Dials OUT to the iframer local server over WebSocket (the server can't reach
// into Chrome; extensions can't listen, so the extension is always the client).
// Its ONE job is to be a CDP relay: it attaches chrome.debugger to the tab the
// server asks for and forwards the protocol both ways. The server connects to
// that relay with connectOverCDP and drives the tab through iframer's real
// pipeline. Discovery (`tabs`) uses chrome.tabs. Nothing is interpreted here.

// Keep in sync with PORT_SCAN_ATTEMPTS in src/mcp/local-server.ts — the server
// allocates its port from this exact window so the scan below can find it.
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

// Native-messaging host (installed by `iframer install extension`). One call
// answers everything: the pairing token, the server's registered port, and
// whether that server process is actually alive. Resolves null when the host
// isn't installed (→ legacy port scan).
function nativeCall(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage("com.iframer.token", msg, (resp) => {
        void chrome.runtime.lastError; // host not installed — that's fine
        resolve(resp || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Token via the host, for auto-pairing. Falls back to the older get-token
// command if the installed host copy predates get-info.
async function fetchTokenNatively() {
  let resp = await nativeCall({ cmd: "get-info" });
  if (!resp || !resp.token) resp = await nativeCall({ cmd: "get-token" });
  return resp && resp.token ? String(resp.token) : "";
}

// Read the signed-in account from Chrome — its email is the natural profile
// DISPLAY NAME. Returns {email, id} or null if not signed in.
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

// Stable per-INSTALL identity. The id is always a persistent random UUID —
// never the Google account (gaia) id: the same account signed into two
// browsers would collide, and the server de-dupes connections by profileId
// (it would evict the other browser as a "stale reconnect"). The account
// email is used only as the human-readable name; the popup label overrides it.
async function ensureProfile() {
  const store = await chrome.storage.local.get(["profileId", "profileLabel"]);
  const info = await getChromeProfile();

  let profileId = store.profileId;
  // Migration: earlier versions stored the gaia id — regenerate it.
  if (!profileId || (info && info.id && profileId === info.id)) {
    profileId = crypto.randomUUID();
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
    // The await above yields — the server may have closed the socket in the
    // meantime (e.g. it rejected our auth). send() on a closed socket logs a
    // console error even inside try/catch, so check first.
    if (sock.readyState !== WebSocket.OPEN) return;
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

// Numeric semver compare: is `a` newer than `b`? (x.y.z, extra parts ignored.)
function isNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

// Compare the server's version (fresh after an npm update) to our own. Surface
// "update available" via a toolbar badge + stored state the popup reads. We do
// NOT self-reload (check-and-notify) — the user runs `iframer update`, which
// applies the update and triggers the reload.
async function checkForUpdate(serverVersion) {
  const current = chrome.runtime.getManifest().version;
  const available = serverVersion && isNewer(serverVersion, current) ? serverVersion : null;
  try {
    if (available) {
      await chrome.action.setBadgeText({ text: "↑" });
      await chrome.action.setBadgeBackgroundColor({ color: "#2a7" });
      await chrome.action.setTitle({ title: `iframer — update available (v${available}), run 'iframer update'` });
    } else {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "iframer" });
    }
  } catch {
    /* action API not available in some contexts */
  }
  await setStatus({ current, updateAvailable: available });
}

// Back off when the server isn't there: each full failed scan of 21 ports logs
// 21 ERR_CONNECTION_REFUSED lines, so retrying every 2s floods the extension's
// error page. Grow the wait up to a minute; any explicit action (new token,
// auto-pair) resets it.
let nextScanAt = 0;
let scanBackoffMs = 0;
const SCAN_BACKOFF_MAX_MS = 60_000;

function resetScanBackoff() {
  nextScanAt = 0;
  scanBackoffMs = 0;
}

function bumpScanBackoff() {
  scanBackoffMs = Math.min(scanBackoffMs ? scanBackoffMs * 2 : 5_000, SCAN_BACKOFF_MAX_MS);
  nextScanAt = Date.now() + scanBackoffMs;
}

async function connectLoop() {
  if (scanning || (ws && ws.readyState === WebSocket.OPEN)) return;
  if (Date.now() < nextScanAt) return;
  scanning = true;
  try {
    // Ask the native host where the server is. When it answers, we never dial
    // blind: a dead port dialed = a console error logged, so we only open a
    // socket to a port the registry says a LIVE server process owns.
    const info = await nativeCall({ cmd: "get-info" });

    let token = await getToken();
    if (info && info.ok && info.token && info.token !== token) {
      token = String(info.token);
      await chrome.storage.local.set({ token });
    }
    if (!token) {
      await setStatus({ connected: false, reason: "no-token" });
      bumpScanBackoff();
      return;
    }

    if (info && info.ok && "alive" in info) {
      if (!info.alive || !info.port) {
        // Server simply isn't running (it starts with an iframer session).
        // Don't attempt any connection — zero console noise.
        await setStatus({ connected: false, reason: "server-not-running" });
        bumpScanBackoff();
        return;
      }
      const ok = await tryConnect(info.port, token);
      if (ok) {
        resetScanBackoff();
        return;
      }
      await setStatus({ connected: false, reason: "server-not-found" });
      bumpScanBackoff();
      return;
    }

    // No native host (or an old copy) — legacy full port scan.
    for (let port = PORT_START; port <= PORT_END; port++) {
      const ok = await tryConnect(port, token);
      if (ok) {
        resetScanBackoff();
        return;
      }
    }
    await setStatus({ connected: false, reason: "server-not-found" });
    bumpScanBackoff();
  } finally {
    scanning = false;
  }
}

function tryConnect(port, token) {
  return new Promise((resolve) => {
    let settled = false;
    let sock;
    try {
      // No token in the URL — query strings land in request logs. The token
      // goes in a first {type:"auth"} message instead; the server waits for it.
      sock = new WebSocket(`ws://127.0.0.1:${port}/extension/ws`);
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
      try {
        sock.send(JSON.stringify({ type: "auth", token }));
      } catch {}
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
  sock.onclose = (ev) => {
    if (ws === sock) {
      ws = null;
      currentPort = null;
      // Auth is checked AFTER the socket opens, so a bad token surfaces here.
      setStatus({ connected: false, reason: ev && ev.code === 4001 ? "bad-token" : "disconnected" });
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

  // Server announces its version on connect (one-way event, no id). Compare to
  // our own manifest version and surface "update available" — the running
  // extension is older than the files an `npm update` left on disk.
  if (type === "server_info") {
    checkForUpdate(msg.version);
    return;
  }

  if (typeof id !== "number") return;

  try {
    if (type === "ping") {
      reply(sock, id, true, { pong: true });
    } else if (type === "list_tabs") {
      reply(sock, id, true, { tabs: await listTabs() });
    } else if (type === "create_tab") {
      reply(sock, id, true, await createTab(msg.url, { active: msg.active, windowId: msg.windowId }));
    } else if (type === "group_tabs") {
      reply(sock, id, true, await groupTabs(msg.tabIds, { title: msg.title, color: msg.color, collapsed: msg.collapsed, groupId: msg.groupId }));
    } else if (type === "ungroup_tabs") {
      reply(sock, id, true, await ungroupTabs(msg.tabIds));
    } else if (type === "update_group") {
      reply(sock, id, true, await updateGroup(msg.groupId, { title: msg.title, color: msg.color, collapsed: msg.collapsed }));
    } else if (type === "list_groups") {
      reply(sock, id, true, { groups: await listGroups() });
    } else if (type === "reload") {
      // Hot-reload the unpacked extension so new background.js takes effect
      // without a manual chrome://extensions reload. Reply FIRST — reload()
      // kills this worker immediately.
      reply(sock, id, true, { reloading: true });
      setTimeout(() => { try { chrome.runtime.reload(); } catch {} }, 100);
    } else if (type === "cdp_attach") {
      reply(sock, id, true, await cdpAttach(msg.tabId, !!msg.focus));
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

// Open a new tab in the user's real Chrome. Native browser control — not a
// page-context window.open (which is popup-blocked and uncontrollable).
async function createTab(url, opts = {}) {
  const createProps = { active: opts.active !== false };
  if (url) createProps.url = url;
  if (typeof opts.windowId === "number") createProps.windowId = opts.windowId;
  const t = await chrome.tabs.create(createProps);
  return {
    tab: {
      id: t.id,
      windowId: t.windowId,
      title: t.title || "",
      url: t.url || t.pendingUrl || url || "",
      active: !!t.active,
      favIconUrl: t.favIconUrl,
    },
  };
}

// Group tabs into a Chrome tab group (native — creates a real collapsible,
// colored group in the tab strip). Pass groupId to add to an existing group,
// omit to create a new one. title/color/collapsed style the group.
async function groupTabs(tabIds, opts = {}) {
  if (!Array.isArray(tabIds) || tabIds.length === 0) throw new Error("group_tabs needs a non-empty tabIds array");
  const groupProps = { tabIds };
  if (typeof opts.groupId === "number") groupProps.groupId = opts.groupId;
  const groupId = await chrome.tabs.group(groupProps);
  const update = {};
  if (typeof opts.title === "string") update.title = opts.title;
  if (typeof opts.color === "string") update.color = opts.color;
  if (typeof opts.collapsed === "boolean") update.collapsed = opts.collapsed;
  let group = null;
  if (Object.keys(update).length > 0) {
    group = await chrome.tabGroups.update(groupId, update);
  } else {
    try { group = await chrome.tabGroups.get(groupId); } catch {}
  }
  return { groupId, title: group?.title || opts.title || "", color: group?.color || opts.color || "", collapsed: !!group?.collapsed, tabIds };
}

// Remove tabs from their group (chrome.tabs.ungroup). If a group ends up empty
// Chrome deletes it automatically.
async function ungroupTabs(tabIds) {
  if (!Array.isArray(tabIds) || tabIds.length === 0) throw new Error("ungroup_tabs needs a non-empty tabIds array");
  await chrome.tabs.ungroup(tabIds);
  return { ungrouped: tabIds };
}

// Rename / recolor / collapse an EXISTING group by id (no tabIds needed).
async function updateGroup(groupId, opts = {}) {
  if (typeof groupId !== "number") throw new Error("update_group needs a numeric groupId");
  const update = {};
  if (typeof opts.title === "string") update.title = opts.title;
  if (typeof opts.color === "string") update.color = opts.color;
  if (typeof opts.collapsed === "boolean") update.collapsed = opts.collapsed;
  if (Object.keys(update).length === 0) throw new Error("update_group needs at least one of title, color, collapsed");
  const g = await chrome.tabGroups.update(groupId, update);
  return { groupId: g.id, title: g.title || "", color: g.color || "", collapsed: !!g.collapsed };
}

// List all tab groups in this browser (id, title, color, collapsed, windowId).
async function listGroups() {
  const groups = await chrome.tabGroups.query({});
  return groups.map((g) => ({ groupId: g.id, title: g.title || "", color: g.color || "", collapsed: !!g.collapsed, windowId: g.windowId }));
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

// Chrome discards (freezes) background tabs to save memory — a discarded tab
// has no content process, so a debugger attach lands on a dead target. Wake it
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
    /* tab gone — the attach will surface the real error */
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

// Make the target tab drivable. It must be the ACTIVE tab of its window —
// an inactive tab doesn't render, so CDP mouse events have nothing to
// hit-test against. But the WINDOW doesn't need OS focus: we activate the
// tab in place and (in cdpAttach) turn on CDP focus emulation so the page
// believes it's focused. stealFocus=true additionally raises the window —
// the old behavior, for the rare site that still misbehaves.
async function focusTab(tabId, stealFocus) {
  try {
    const t = await chrome.tabs.get(tabId);
    // A minimized window produces no frames at all (screenshots stall, some
    // sites wedge). Restore it WITHOUT taking focus — sitting behind the
    // user's other windows is enough for rendering.
    try {
      const w = await chrome.windows.get(t.windowId);
      if (w.state === "minimized") {
        await chrome.windows.update(t.windowId, { state: "normal", focused: false });
      }
    } catch {
      /* window query failed — proceed, attach will surface real errors */
    }
    if (stealFocus) await chrome.windows.update(t.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    await sleep(400); // let the tab un-throttle and paint
  } catch {
    /* tab/window gone — the attach will surface the real error */
  }
}

// ─── CDP relay ──────────────────────────────────────────────────────
// Bridges chrome.debugger for a tab to iframer's server, which connects to it
// with connectOverCDP and drives the tab through the REAL iframer pipeline
// (find/click/snapshot/navigate/capture). Shows Chrome's debug banner while a
// run is in progress; the debugger detaches when the run finishes.
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

async function cdpAttach(tabId, stealFocus) {
  await ensureAwake(tabId); // a discarded tab has no target to attach to
  await focusTab(tabId, stealFocus); // active tab so CDP hit-testing/render works
  if (!attachedTabs.has(tabId)) {
    await chrome.debugger.attach({ tabId }, "1.3");
    attachedTabs.add(tabId);
  }
  // Let the page run as if focused even when the window isn't: focus
  // emulation makes document.hasFocus()/focus events behave, and the
  // lifecycle override keeps Chrome from freezing an occluded window's tab.
  // Best-effort — older Chromes may not know these commands.
  try { await dbgSend({ tabId }, "Emulation.setFocusEmulationEnabled", { enabled: true }); } catch {}
  try { await dbgSend({ tabId }, "Page.setWebLifecycleState", { state: "active" }); } catch {}
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
    } else if (msg.cmd === "auto-pair") {
      const token = await fetchTokenNatively();
      if (!token) {
        sendResponse({
          ok: false,
          error: "Pairing host not reachable. Run `iframer install extension` in a terminal, then restart the browser.",
        });
        return;
      }
      await chrome.storage.local.set({ token });
      resetScanBackoff();
      try { if (ws) ws.close(); } catch {}
      ws = null;
      await connectLoop();
      const { status } = await chrome.storage.local.get("status");
      sendResponse({ ok: true, token, status: status || { connected: false } });
    } else if (msg.cmd === "set-token") {
      await chrome.storage.local.set({ token: msg.token || "" });
      // Force a fresh connection attempt with the new token.
      resetScanBackoff();
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
