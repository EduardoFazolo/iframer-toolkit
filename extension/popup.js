const $ = (id) => document.getElementById(id);

let currentTab = null;

function send(cmd, extra = {}) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ cmd, ...extra }, resolve));
}

function renderStatus(status, allowed) {
  const connected = status && status.connected;
  $("dot").className = "dot" + (connected ? " on" : "");
  const reasonText = {
    "no-token": "No token set — paste your pairing token below.",
    "server-not-found": "iframer server not found. Is Claude Code / iframer running?",
    "bad-token": "Token rejected. Check it matches ~/.iframer/secret.",
    disconnected: "Disconnected — retrying…",
  };
  if (connected) {
    $("status").textContent = `Connected on port ${status.port}.`;
  } else {
    $("status").textContent = reasonText[status && status.reason] || "Not connected.";
  }

  if (currentTab) {
    const isAllowed = allowed && allowed.includes(currentTab.id);
    $("allowstate").textContent = isAllowed
      ? "✓ iframer is allowed to drive this tab."
      : "Not allowed yet. Click “Allow this tab” to let iframer drive it.";
    $("allow").disabled = isAllowed;
    $("disallow").disabled = !isAllowed;
  }
}

async function refresh() {
  const state = await send("get-state");
  renderStatus(state.status, state.allowed);
}

async function init() {
  const { token } = await chrome.storage.local.get("token");
  if (token) $("token").value = token;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  $("curtab").textContent = tab ? `${tab.title || "(untitled)"} — ${tab.url || ""}` : "No active tab.";

  await refresh();
}

$("save").addEventListener("click", async () => {
  $("save").disabled = true;
  $("save").textContent = "Connecting…";
  const res = await send("set-token", { token: $("token").value.trim() });
  renderStatus(res.status, null);
  await refresh();
  $("save").disabled = false;
  $("save").textContent = "Save & connect";
});

$("allow").addEventListener("click", async () => {
  if (!currentTab) return;
  await send("allow-tab", { tabId: currentTab.id });
  await refresh();
});

$("disallow").addEventListener("click", async () => {
  if (!currentTab) return;
  await send("disallow-tab", { tabId: currentTab.id });
  await refresh();
});

init();
