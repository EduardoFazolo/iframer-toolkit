const $ = (id) => document.getElementById(id);

function send(cmd, extra = {}) {
  // Resolve to {} when the worker is asleep or errored (sendMessage passes
  // undefined + sets lastError) so callers never null-deref on res.status etc.
  return new Promise((resolve) =>
    chrome.runtime.sendMessage({ cmd, ...extra }, (resp) => {
      void chrome.runtime.lastError; // touch it so Chrome doesn't log "Unchecked"
      resolve(resp || {});
    }),
  );
}

function renderStatus(status) {
  const connected = status && status.connected;
  $("dot").className = "dot" + (connected ? " on" : "");
  const reasonText = {
    "no-token": "No token set — try Pair automatically, or paste it below.",
    "server-not-found": "iframer server not found. Is Claude Code / iframer running?",
    "server-not-running": "iframer server not running — it starts with your Claude/iframer session. Will connect by itself.",
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
  const { token, profileLabel } = await chrome.storage.local.get(["token", "profileLabel"]);
  if (token) $("token").value = token;
  if (profileLabel) $("label").value = profileLabel;
  const state = await send("get-state");
  renderStatus(state.status);
  if (state.profileName) $("profinfo").textContent = `${state.profileName} · id ${String(state.profileId).slice(0, 8)}`;
}

$("savelabel").addEventListener("click", async () => {
  const res = await send("set-label", { label: $("label").value });
  if (res.profileName) $("profinfo").textContent = `${res.profileName} · id ${String(res.profileId).slice(0, 8)}`;
});

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

$("autopair").addEventListener("click", async () => {
  $("autopair").disabled = true;
  $("pairmsg").textContent = "Asking the local pairing host…";
  const res = await send("auto-pair");
  if (res.ok) {
    if (res.token) $("token").value = res.token;
    $("pairmsg").textContent = "✓ Paired.";
    renderStatus(res.status);
  } else {
    $("pairmsg").textContent = res.error || "Auto-pair failed — paste the token manually below.";
  }
  $("autopair").disabled = false;
  await refresh();
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
