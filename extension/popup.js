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
