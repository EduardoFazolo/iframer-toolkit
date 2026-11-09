// @ts-nocheck
/**
 * In-page capture kit: the "bring your own browser" path for API reverse
 * engineering. It runs inside any page an agent can evaluate JS in (T3 Code
 * preview tabs, Playwright MCP, Chrome DevTools MCP, ...), records the page's
 * own API calls, and exports their SHAPES, never their values.
 *
 * This function is serialized with Function.prototype.toString and evaluated
 * in the page, so it must not reference anything outside its own body, and it
 * stays ES5-ish so it runs on any page without a build step.
 *
 * Install contract (see ./instructions.ts):
 *   - The source is stashed in sessionStorage.__ifk and run with a TOP-LEVEL
 *     `eval(sessionStorage.__ifk)`. CDP's Runtime.evaluate bypasses page CSP
 *     for that one call; eval inside async callbacks stays blocked, so nothing
 *     in here may eval.
 *   - Re-running it is safe: a second run on the same document is a no-op.
 *   - After a full navigation the hooks are gone; re-run it and it restores
 *     what it captured from sessionStorage.
 */
export function pageKit(opts) {
  opts = opts || {};
  var w = window;
  var VERSION = 1;
  var KEY = "__ifk_state";

  if (w.__ifk && w.__ifk.version === VERSION) {
    var s0 = w.__ifk.summary();
    return { installed: true, again: true, version: VERSION, seen: s0.seen };
  }

  var mode = opts.mode === "passive" ? "passive" : "hook";
  var hostRe = null;
  try { if (opts.hostFilter) hostRe = new RegExp(opts.hostFilter, "i"); } catch (e) {}
  var MAX_BODY = opts.maxBody || 200000;
  var MAX_CALLS = opts.maxCalls || 50;

  // Some sites (Discord) delete window.sessionStorage to protect tokens. A blank
  // same-origin iframe still exposes the same storage; the install steps use the
  // same fallback, so both sides read and write the same place.
  function store() {
    try { if (w.sessionStorage) return w.sessionStorage; } catch (e) {}
    try {
      var f = document.getElementById("__ifk_ss");
      if (!f) {
        f = document.createElement("iframe");
        f.id = "__ifk_ss";
        f.style.display = "none";
        document.documentElement.appendChild(f);
      }
      return f.contentWindow.sessionStorage;
    } catch (e) { return null; }
  }
  var ss = store();

  var m = {};   // "METHOD origin/path/{id}" -> endpoint record (shapes only)
  var po = {};  // "origin/path/{id}" -> status, from resource timing (no method, no payload)
  var budget = { calls: 0, stopped: null };
  var restored = 0;
  try {
    var saved = JSON.parse(ss.getItem(KEY) || "null");
    if (saved && saved.v === VERSION) {
      m = saved.m || {};
      po = saved.po || {};
      if (saved.budget) budget = saved.budget;
      restored = Object.keys(m).length;
    }
  } catch (e) {}

  // ── Redaction: everything leaves as a template or a type name ──────────

  var AUTH_H = /^(authorization|cookie|x-csrf|x-xsrf|x-api-key|x-auth|x-token|x-session|x-access|x-client-token|x-request-token)/i;
  var NOISE_H = /^(accept|accept-language|accept-encoding|cache-control|connection|pragma|sec-|user-agent|referer|origin|dnt|te|if-none-match|if-modified-since|upgrade-insecure-requests)$/i;
  var NOISE_H_PREFIX = /^sec-/i;

  // A path segment or object key that is data rather than structure.
  function isValueLike(s) {
    if (!s) return false;
    var d = s;
    try { d = decodeURIComponent(s); } catch (e) {}
    if (/^[0-9]+$/.test(d)) return true;                       // numeric id
    if (/^[0-9a-f]{8,}$/i.test(d)) return true;                // hex id / hash
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d)) return true;     // uuid
    if (/@/.test(d)) return true;                              // email-ish
    if (/^\+?[0-9][0-9 ().-]{6,}$/.test(d)) return true;       // phone-ish
    if (/^[\w.~-]{20,}$/.test(d)) return true;                 // long opaque token
    if (d.length >= 10 && /[0-9]/.test(d) && /[a-z]/i.test(d) && !/^[a-z]+[0-9]{1,2}$/i.test(d)) return true; // mixed code like CONF-99X7-…
    return false;
  }
  function tpl(p) {
    return p.split("/").map(function (s) { return isValueLike(s) ? "{id}" : s; }).join("/");
  }
  function abs(u, base) {
    try { return new URL(String(u), base || location.href); } catch (e) { return null; }
  }
  function shape(v, d) {
    d = d || 0;
    if (v === null) return "null";
    if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1)] : [];
    if (typeof v === "object") {
      if (d > 6) return "object";
      var o = {};
      var keys = Object.keys(v);
      var dyn = keys.filter(isValueLike);
      // A map keyed by ids/emails: keep one sample under a placeholder key.
      if (dyn.length && dyn.length >= keys.length / 2) {
        o["{key}"] = shape(v[dyn[0]], d + 1);
        keys = keys.filter(function (k) { return !isValueLike(k); });
      }
      keys.slice(0, 60).forEach(function (k) { if (!isValueLike(k)) o[k] = shape(v[k], d + 1); });
      return o;
    }
    return typeof v;
  }
  function keysOf(iter) {
    var o = {};
    iter.forEach(function (_, k) { o[isValueLike(k) ? "{key}" : k] = "string"; });
    return o;
  }
  function bodyShape(b) {
    try {
      if (b == null) return undefined;
      if (typeof b === "string") {
        try { return { json: shape(JSON.parse(b)) }; } catch (e) {}
        if (/^[^=&\s]+=[^&]*(&|$)/.test(b)) return { form: keysOf(new URLSearchParams(b)) };
        return { text: b.length };
      }
      if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) return { form: keysOf(b) };
      if (typeof FormData !== "undefined" && b instanceof FormData) return { multipart: keysOf(b) };
      if (typeof Blob !== "undefined" && b instanceof Blob) return { binary: b.size };
      if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return { binary: b.byteLength };
    } catch (e) {}
    return { unknown: true };
  }
  function resShape(text, ct) {
    if (!text) return undefined;
    if (/json/i.test(ct || "")) { try { return shape(JSON.parse(text)); } catch (e) {} }
    return { contentType: (ct || "").split(";")[0], bytes: text.length };
  }
  function cap(t) { return t && t.length > MAX_BODY ? "" : t; }

  // ── Recording ──────────────────────────────────────────────────────────

  var persistTimer = null;
  function persist() {
    try { ss.setItem(KEY, JSON.stringify({ v: VERSION, m: m, po: po, budget: budget })); } catch (e) {}
  }
  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(function () { persistTimer = null; persist(); }, 300);
  }

  function rec(kind, method, url, headers, body, status, ct, text, base) {
    try {
      var u = abs(url, base);
      if (!u || !/^https?:$/.test(u.protocol)) return;
      if (hostRe && !hostRe.test(u.host)) return;
      var k = String(method || "GET").toUpperCase() + " " + u.origin + tpl(u.pathname);
      var e = m[k] || (m[k] = { kind: kind, n: 0, status: [], query: [], headers: [], auth: [] });
      e.n++;
      if (status != null && e.status.indexOf(status) < 0) e.status.push(status);
      u.searchParams.forEach(function (_, q) {
        var qn = isValueLike(q) ? "{key}" : q;
        if (e.query.indexOf(qn) < 0) e.query.push(qn);
      });
      Object.keys(headers || {}).forEach(function (h) {
        var l = h.toLowerCase();
        if (AUTH_H.test(l)) { if (e.auth.indexOf(l) < 0) e.auth.push(l); }
        else if (!NOISE_H.test(l) && !NOISE_H_PREFIX.test(l) && e.headers.indexOf(l) < 0) e.headers.push(l);
      });
      if (body !== undefined && !e.req) e.req = bodyShape(body);
      if (text !== undefined && !e.res) e.res = resShape(text, ct);
      persistSoon();
    } catch (err) {}
  }

  // ── Hooks (mode "hook" only). Each patch never throws into the page. ───

  var restores = [];
  function patch(obj, name, make) {
    try {
      var orig = obj[name];
      if (!orig) return;
      var wrapped = make(orig);
      obj[name] = wrapped;
      restores.push(function () { try { if (obj[name] === wrapped) obj[name] = orig; } catch (e) {} });
    } catch (e) {}
  }

  var origFetch = w.fetch;

  function hookWindow(win) {
    try {
      if (win.__ifkHooked) return;
      win.__ifkHooked = true;
    } catch (e) { return; } // cross-origin frame
    var base = function () { try { return win.location.href; } catch (e) { return location.href; } };

    patch(win, "fetch", function (oFetch) {
      return function (input, init) {
        var p = oFetch.apply(this, arguments);
        try {
          var isReq = typeof win.Request !== "undefined" && input instanceof win.Request;
          var method = (init && init.method) || (isReq && input.method) || "GET";
          var url = isReq ? input.url : input;
          var hs = {};
          var src = (init && init.headers) || (isReq && input.headers);
          if (src) new win.Headers(src).forEach(function (_, k) { hs[k] = 1; });
          var b = init && init.body;
          var at = base();
          p.then(function (res) {
            try {
              var ct = res.headers.get("content-type");
              if (/event-stream|octet|video|audio|image/i.test(ct || "")) return rec("fetch", method, url, hs, b, res.status, ct, undefined, at);
              res.clone().text().then(function (t) {
                rec("fetch", method, url, hs, b, res.status, ct, cap(t), at);
              }, function () { rec("fetch", method, url, hs, b, res.status, ct, undefined, at); });
            } catch (e) {}
          }, function () {});
        } catch (e) {}
        return p;
      };
    });

    var X = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (X) {
      patch(X, "open", function (oOpen) {
        return function (method, url) {
          try { this.__ifkI = { method: method, url: url, h: {}, at: base() }; } catch (e) {}
          return oOpen.apply(this, arguments);
        };
      });
      patch(X, "setRequestHeader", function (oSet) {
        return function (k) {
          try { if (this.__ifkI) this.__ifkI.h[k] = 1; } catch (e) {}
          return oSet.apply(this, arguments);
        };
      });
      patch(X, "send", function (oSend) {
        return function (b) {
          try {
            var i = this.__ifkI, x = this;
            if (i) x.addEventListener("loadend", function () {
              var t;
              try { t = x.responseType === "" || x.responseType === "text" ? cap(x.responseText) : undefined; } catch (e) {}
              var ct = null;
              try { ct = x.getResponseHeader("content-type"); } catch (e) {}
              rec("xhr", i.method, i.url, i.h, b, x.status, ct, t, i.at);
            });
          } catch (e) {}
          return oSend.apply(this, arguments);
        };
      });
    }

    if (win.navigator && win.navigator.sendBeacon) {
      patch(win.navigator, "sendBeacon", function (oBeacon) {
        return function (u, d) {
          rec("beacon", "POST", u, {}, d, undefined, undefined, undefined, base());
          return oBeacon.apply(this, arguments);
        };
      });
    }

    ["WebSocket", "EventSource"].forEach(function (name) {
      patch(win, name, function (Orig) {
        var Wrapped = function (u, p) {
          try {
            var url = String(u);
            if (name === "WebSocket") url = url.replace(/^ws/, "http");
            rec(name === "WebSocket" ? "ws" : "sse", "GET", url, {}, undefined, undefined, undefined, undefined, base());
          } catch (e) {}
          return p === undefined ? new Orig(u) : new Orig(u, p);
        };
        Wrapped.prototype = Orig.prototype;
        ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) { if (k in Orig) Wrapped[k] = Orig[k]; });
        return Wrapped;
      });
    });
  }

  // Form submits are read from a listener, not a patch, so they work in passive mode too.
  function onSubmit(ev) {
    try {
      var f = ev.target;
      var doc = f.ownerDocument || document;
      rec("form", f.method || "GET", f.action || doc.location.href, {}, new FormData(f), undefined, undefined, undefined, doc.location.href);
    } catch (e) {}
  }
  function watchDocument(doc) {
    try {
      if (doc.__ifkWatched) return;
      doc.__ifkWatched = true;
      doc.addEventListener("submit", onSubmit, true);
      restores.push(function () { try { doc.removeEventListener("submit", onSubmit, true); doc.__ifkWatched = false; } catch (e) {} });
    } catch (e) {}
  }

  // Same-origin iframes get the same hooks. Cross-origin ones are skipped silently.
  function attachFrame(f) {
    if (f.id === "__ifk_ss") return;
    try {
      var fw = f.contentWindow;
      if (!fw || !fw.document) return;
      if (mode === "hook") hookWindow(fw);
      watchDocument(fw.document);
    } catch (e) {}
    try {
      if (!f.__ifkLoad) {
        f.__ifkLoad = true;
        f.addEventListener("load", function () { attachFrame(f); });
      }
    } catch (e) {}
  }
  function scanFrames(root) {
    try { Array.prototype.forEach.call((root || document).querySelectorAll("iframe,frame"), attachFrame); } catch (e) {}
  }

  if (mode === "hook") hookWindow(w);
  watchDocument(document);
  scanFrames(document);
  var mo = null;
  try {
    mo = new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        Array.prototype.forEach.call(mu.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === "IFRAME" || n.tagName === "FRAME") attachFrame(n);
          else if (n.querySelectorAll) scanFrames(n);
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // Resource timing sees calls the hook missed (made before install, or in passive
  // mode). URL and status only: never infer a method or payload from it.
  var obs = null;
  try {
    obs = new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (r) {
        if (!/fetch|xmlhttprequest|beacon/.test(r.initiatorType)) return;
        var u = abs(r.name);
        if (!u || (hostRe && !hostRe.test(u.host))) return;
        po[u.origin + tpl(u.pathname)] = r.responseStatus || 0;
      });
      persistSoon();
    });
    obs.observe({ type: "resource", buffered: true });
  } catch (e) {}

  w.addEventListener("pagehide", persist);

  // ── Export ─────────────────────────────────────────────────────────────

  function report() {
    var hooked = {};
    Object.keys(m).forEach(function (k) { hooked[k.slice(k.indexOf(" ") + 1)] = 1; });
    var pathOnly = Object.keys(po).filter(function (p) { return !hooked[p]; });
    var payload = Object.keys(m).filter(function (k) { return m[k].req || m[k].res; });
    return {
      kind: "iframer-capture",
      v: VERSION,
      origin: location.origin,
      capturedAt: new Date().toISOString(),
      kit: { mode: mode, hostFilter: opts.hostFilter || null },
      coverage: {
        seen: Object.keys(m).length + pathOnly.length,
        withPayload: payload.length,
        pathOnly: pathOnly.length,
        complete: false,
        blindSpots: ["HttpOnly cookies", "Set-Cookie", "browser-added headers", "worker traffic", "document POST responses", "redirect hops", "cross-origin iframes"],
      },
      endpoints: m,
      pathOnly: pathOnly,
    };
  }

  function looksLikeWall(status, text) {
    if (status === 403 || status === 429) return "HTTP " + status;
    if (text && /captcha|cf-chl|challenge-platform|are you a robot|access denied/i.test(text.slice(0, 5000))) return "bot wall";
    return null;
  }

  w.__ifk = {
    version: VERSION,
    mode: mode,
    summary: function () {
      var c = report().coverage;
      return { installed: true, mode: mode, seen: c.seen, withPayload: c.withPayload, pathOnly: c.pathOnly, replays: budget.calls, stopped: budget.stopped };
    },
    // Fallback for tools that can't download files: page the report through evaluate results.
    drain: function (cursor, maxBytes) {
      var s = JSON.stringify(report());
      cursor = cursor || 0;
      var chunk = s.slice(cursor, cursor + (maxBytes || 60000));
      return { chunk: chunk, next: cursor + chunk.length < s.length ? cursor + chunk.length : null, total: s.length };
    },
    // Writes the report out of the page as a download. T3 lists its local path
    // in preview_status.downloads; `iframer ingest` reads it from there.
    dump: function () {
      var s = JSON.stringify(report());
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([s], { type: "application/json" }));
      a.download = "iframer-capture-" + Date.now() + ".json";
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
      return { bytes: s.length, file: a.download };
    },
    // Replays through the page so the browser attaches its own cookies,
    // including HttpOnly ones. Same-origin, GET/HEAD only unless approved,
    // capped per session, and it stops for good on 403/429 or a bot wall.
    call: function (method, path, o) {
      o = o || {};
      method = String(method || "GET").toUpperCase();
      if (budget.stopped) return Promise.resolve({ error: "stopped", reason: budget.stopped });
      if (method !== "GET" && method !== "HEAD" && !o.approved) {
        return Promise.resolve({ error: "write needs approval", hint: "ask the user, then pass {approved:true} for this one request" });
      }
      var u = abs(path);
      if (!u) return Promise.resolve({ error: "bad url" });
      if (u.origin !== location.origin && !o.crossOrigin) return Promise.resolve({ error: "cross-origin", hint: "navigate to " + u.origin + " first" });
      if (budget.calls >= MAX_CALLS) { budget.stopped = "budget of " + MAX_CALLS + " calls"; persist(); return Promise.resolve({ error: "stopped", reason: budget.stopped }); }
      budget.calls++;
      var init = { method: method, credentials: "include", headers: o.headers || {} };
      if (o.json !== undefined) {
        init.body = JSON.stringify(o.json);
        init.headers["content-type"] = "application/json";
      } else if (o.body !== undefined) init.body = o.body;
      var maxBytes = o.maxBytes || 20000;
      return origFetch.call(w, u.href, init).then(function (r) {
        return r.text().then(function (t) {
          var out = { status: r.status };
          var wall = looksLikeWall(r.status, t);
          if (wall) { budget.stopped = wall; out.stopped = wall; }
          persist();
          if (t.length > maxBytes) { out.truncated = t.length; t = t.slice(0, maxBytes); }
          try { out.data = JSON.parse(t); } catch (e) { out.text = t.slice(0, 2000); }
          return out;
        });
      }, function (e) { return { error: String(e && e.message || e) }; });
    },
    // Removes every hook and forgets the capture.
    stop: function () {
      restores.forEach(function (r) { r(); });
      restores = [];
      try { mo && mo.disconnect(); } catch (e) {}
      try { obs && obs.disconnect(); } catch (e) {}
      try { w.removeEventListener("pagehide", persist); } catch (e) {}
      try { w.__ifkHooked = false; } catch (e) {}
      try { ss.removeItem(KEY); ss.removeItem("__ifk"); ss.removeItem("__ifkApi"); } catch (e) {}
      delete w.__ifk;
      return { stopped: true };
    },
  };

  persist();
  return { installed: true, again: false, version: VERSION, mode: mode, restored: restored };
}
