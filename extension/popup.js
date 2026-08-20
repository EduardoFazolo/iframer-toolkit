const $ = (id) => document.getElementById(id);

function send(cmd, extra = {}) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ cmd, ...extra }, resolve));
}

function renderStatus(status) {
  const connected = status && status.connected;
  $("dot").className = "dot" + (connected ? " on" : "");
  const reasonText = {
    "no-token": "No token set — paste your pairing token below.",
    "server-not-found": "iframer server not found. Is Claude Code / iframer running?",
    "bad-token": "Token rejected. Check it matches ~/.iframer/secret.",
    disconnected: "Disconnected — retrying…",
  };
  if (connected) {
    $("status").textContent = `Connected on port ${status.port}. iframer can drive any open tab.`;
  } else {
    $("status").textContent = reasonText[status && status.reason] || "Not connected.";
  }
}

async function refresh() {
  const state = await send("get-state");
  renderStatus(state.status);
}

async function init() {
  const { token } = await chrome.storage.local.get("token");
  if (token) $("token").value = token;
  await refresh();
}

$("grant").addEventListener("click", () => {
  // Must run in the popup (user gesture) — requesting host access to all sites.
  chrome.permissions.request({ origins: ["<all_urls>"] }, (granted) => {
    const e = chrome.runtime.lastError;
    $("diag").textContent = e
      ? `request error: ${e.message}`
      : granted
        ? "✓ All-sites access granted. Try 'Test page access'."
        : "✗ Access request was dismissed/denied.";
  });
});

$("test").addEventListener("click", async () => {
  $("diag").textContent = "testing…";
  const res = await send("diag");
  const lines = [];
  lines.push(`manifest host_permissions: ${JSON.stringify(res.hostPermissions)}`);
  lines.push(`granted origins: ${JSON.stringify(res.grantedOrigins)}`);
  lines.push(`tab: ${res.tabUrl || "(none)"}`);
  lines.push(res.okExec ? `✓ executeScript OK → ${res.value}` : `✗ executeScript FAILED: ${res.error}`);
  $("diag").textContent = lines.join("\n");
});

$("save").addEventListener("click", async () => {
  $("save").disabled = true;
  $("save").textContent = "Connecting…";
  const res = await send("set-token", { token: $("token").value.trim() });
  renderStatus(res.status);
  await refresh();
  $("save").disabled = false;
  $("save").textContent = "Save & connect";
});

init();
