// Banner-free API capture via chrome.webRequest.
//
// Records the XHR/fetch requests a tab makes during an execute run — method,
// url, request headers (incl. auth/cookies via extraHeaders), request body, and
// response status/headers. Response BODIES are not available to MV3 webRequest;
// that's the one thing only chrome.debugger (banner) could add. Everything else
// is handed to iframer, which runs it through the same buildCapturedApi()
// pipeline the patchright capture uses — so paths get parameterized, protocol/
// verb inferred, curl generated, auth extracted, exactly the same.
//
// Listeners are registered at top level (module import) so they survive service-
// worker restarts; they no-op unless the request's tab is actively capturing.

const inflight = new Map(); // requestId -> partial CapturedRequest
const buffers = new Map(); // tabId -> CapturedRequest[]
const activeTabs = new Set(); // tabIds currently capturing
let currentStep = 0; // best-effort step attribution

function headersToObject(list) {
  const out = {};
  for (const h of list || []) {
    if (h && typeof h.name === "string") out[h.name] = h.value ?? "";
  }
  return out;
}

function parseQuery(url) {
  try {
    const q = {};
    new URL(url).searchParams.forEach((v, k) => (q[k] = v));
    return Object.keys(q).length ? q : undefined;
  } catch {
    return undefined;
  }
}

function decodeBody(requestBody) {
  if (!requestBody) return undefined;
  try {
    if (requestBody.raw && requestBody.raw.length) {
      let text = "";
      for (const chunk of requestBody.raw) {
        if (chunk.bytes) text += new TextDecoder("utf-8").decode(new Uint8Array(chunk.bytes));
      }
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return text.length < 500000 ? text : `[body truncated — ${text.length} bytes]`;
      }
    }
    if (requestBody.formData) {
      return { _type: "form", fields: Object.keys(requestBody.formData) };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function onBeforeRequest(details) {
  if (details.type !== "xmlhttprequest" || !activeTabs.has(details.tabId)) return;
  inflight.set(details.requestId, {
    method: details.method,
    url: details.url,
    tabId: details.tabId,
    timestamp: Date.now(),
    triggeredAtStep: currentStep,
    requestBody: decodeBody(details.requestBody),
  });
}

function onBeforeSendHeaders(details) {
  const rec = inflight.get(details.requestId);
  if (rec) rec.requestHeaders = headersToObject(details.requestHeaders);
}

function finish(details, status) {
  const rec = inflight.get(details.requestId);
  if (!rec) return;
  inflight.delete(details.requestId);
  if (!activeTabs.has(rec.tabId)) return;
  try {
    rec.path = new URL(rec.url).pathname;
  } catch {
    rec.path = rec.url;
  }
  rec.queryParams = parseQuery(rec.url);
  rec.requestHeaders = rec.requestHeaders || {};
  rec.responseStatus = status || 0;
  rec.responseHeaders = headersToObject(details.responseHeaders);
  rec.responseBody = undefined; // not available in MV3 webRequest
  rec.resourceType = "xhr";
  const buf = buffers.get(rec.tabId) || [];
  buf.push(rec);
  buffers.set(rec.tabId, buf);
}

// Register once, at top level.
const FILTER = { urls: ["<all_urls>"] };
try {
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, FILTER, ["requestBody"]);
  chrome.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, FILTER, ["requestHeaders", "extraHeaders"]);
  chrome.webRequest.onCompleted.addListener((d) => finish(d, d.statusCode), FILTER, ["responseHeaders", "extraHeaders"]);
  chrome.webRequest.onErrorOccurred.addListener((d) => finish(d, 0), FILTER);
} catch (e) {
  // webRequest unavailable (permission missing) — capture silently disabled.
}

export const capture = {
  setStep(n) {
    currentStep = n;
  },
  start(tabId) {
    activeTabs.add(tabId);
    buffers.set(tabId, []);
    currentStep = 0;
  },
  /** Stop capturing this tab and return the raw CapturedRequest[]. */
  stop(tabId) {
    activeTabs.delete(tabId);
    const reqs = buffers.get(tabId) || [];
    buffers.delete(tabId);
    // Drop any still-inflight requests belonging to this tab.
    for (const [id, rec] of inflight) {
      if (rec.tabId === tabId) inflight.delete(id);
    }
    return reqs;
  },
};
