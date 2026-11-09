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

  var BUILD = opts.build || "dev";
  if (w.__ifk && w.__ifk.version === VERSION && w.__ifk.build === BUILD) {
    var s0 = w.__ifk.summary();
    return { installed: true, again: true, version: VERSION, seen: s0.seen };
  }
  var replaced = null;

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
  // An older kit is still in this tab: take its hooks off, keep what it captured.
  if (w.__ifk && w.__ifk.stop) {
    replaced = w.__ifk.build || "old";
    try {
      // stop() wipes storage, including the new kit's own stashed source: put it back.
      var keep = {};
      [KEY, "__ifk", "__ifkApi"].forEach(function (k) { keep[k] = ss && ss.getItem(k); });
      w.__ifk.stop();
      Object.keys(keep).forEach(function (k) { if (keep[k] != null) ss.setItem(k, keep[k]); });
    } catch (e) {}
  }
  // localStorage, through the same blank iframe when the site deleted it.
  function lstore() {
    try { if (w.localStorage) return w.localStorage; } catch (e) {}
    try { store(); return document.getElementById("__ifk_ss").contentWindow.localStorage; } catch (e) { return null; }
  }

  var m = {};   // "METHOD origin/path/{id}" -> endpoint record (shapes only)
  var po = {};  // "origin/path/{id}" -> status, from resource timing (no method, no payload)
  var budget = { calls: 0, stopped: null };
  // Identity: auth header name -> where the page keeps its value
  // ({from:"localStorage"|"sessionStorage"|"cookie"|"memory", key, path, prefix}).
  // Names only. The values live in authMem, in memory, and never leave the page.
  var authSrc = {};
  var authMem = {};
  // Next.js: route param value -> name ("wichitalife" -> "communitySlug"), kept in
  // this page only; Server Action id -> export name (public build ids).
  var rp = {};
  var acts = {};
  var restored = 0;
  try {
    var saved = JSON.parse(ss.getItem(KEY) || "null");
    if (saved && saved.v === VERSION) {
      m = saved.m || {};
      po = saved.po || {};
      if (saved.budget) budget = saved.budget;
      if (saved.authSrc) authSrc = saved.authSrc;
      if (saved.acts) acts = saved.acts;
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
    return p.split("/").map(function (s) {
      var d = s;
      try { d = decodeURIComponent(s); } catch (e) {}
      if (s && rp.hasOwnProperty(d)) return "{" + rp[d] + "}";
      return isValueLike(s) ? "{id}" : s;
    }).join("/");
  }

  // ── Next.js (App Router) ───────────────────────────────────────────────

  // Route trees in RSC payloads carry dynamic segments as ["name","value","d"].
  var PARAM_RE = /\["([A-Za-z_][\w-]{0,40})","([^"\\\/]{1,80})","(?:d|c|oc|ci|dc)"/g;
  function learnParams(text) {
    if (!text || text.indexOf('","d"') < 0 && text.indexOf('","c"') < 0 && text.indexOf('","oc"') < 0) return;
    PARAM_RE.lastIndex = 0;
    var x;
    while ((x = PARAM_RE.exec(text))) if (!rp.hasOwnProperty(x[2])) rp[x[2]] = x[1];
  }
  var nextIdx = 0;
  function scanNext() {
    try {
      var f = w.__next_f;
      if (f && f.length > nextIdx) {
        for (var i = nextIdx; i < f.length; i++) if (f[i] && typeof f[i][1] === "string") learnParams(f[i][1]);
        nextIdx = f.length;
      }
    } catch (e) {}
    try { // Pages Router
      var q = w.__NEXT_DATA__ && w.__NEXT_DATA__.query;
      if (q) Object.keys(q).forEach(function (k) { if (typeof q[k] === "string" && !rp.hasOwnProperty(q[k])) rp[q[k]] = k; });
    } catch (e) {}
  }
  // A body field like {communitySlug:"wichitalife"} names the same value in the path.
  function learnFromBody(b, u) {
    if (typeof b !== "string" || b.length > 20000) return;
    var j;
    try { j = JSON.parse(b); } catch (e) { return; }
    var segs = {};
    (u.pathname + "/" + location.pathname).split("/").forEach(function (s) { if (s) { try { segs[decodeURIComponent(s)] = 1; } catch (e) {} } });
    (function walk(v, d) {
      if (!v || typeof v !== "object" || d > 3) return;
      Object.keys(v).forEach(function (k) {
        var x = v[k];
        if (typeof x === "string" && x.length > 1 && segs[x] && /(id|slug|key|handle|code|name)$/i.test(k) && !rp.hasOwnProperty(x)) rp[x] = k;
        else walk(x, d + 1);
      });
    })(j, 0);
  }

  // RSC "flight" stream: rows of id:payload. T rows carry a byte length, so
  // parse on bytes, not characters.
  function parseFlight(t) {
    var rows = {};
    try {
      var b = new TextEncoder().encode(t), dec = new TextDecoder(), i = 0, n = b.length;
      while (i < n) {
        var c = i;
        while (c < n && b[c] !== 58 && b[c] !== 10) c++; // ':' or newline
        if (c >= n) break;
        if (b[c] === 10) { i = c + 1; continue; }
        var id = dec.decode(b.subarray(i, c));
        var j = c + 1;
        if (b[j] === 84) { // 'T' + hex length + ','
          var cm = j + 1;
          while (cm < n && b[cm] !== 44) cm++;
          var len = parseInt(dec.decode(b.subarray(j + 1, cm)), 16) || 0;
          rows[id] = { text: dec.decode(b.subarray(cm + 1, cm + 1 + len)) };
          i = cm + 1 + len;
          if (b[i] === 10) i++;
          continue;
        }
        var nl = j;
        while (nl < n && b[nl] !== 10) nl++;
        var p = dec.decode(b.subarray(j, nl));
        i = nl + 1;
        if (!/^[0-9a-f]+$/i.test(id)) continue;
        var tag = (/^[A-Z]+/.exec(p) || [""])[0];
        try { rows[id] = { tag: tag, v: JSON.parse(p.slice(tag.length)) }; } catch (e) {}
      }
    } catch (e) {}
    return rows;
  }
  // Turns rows into data: a Server Action's return value, or the props the
  // server passed to client components (that is where page data lives).
  function flightData(rows) {
    function resolve(v, d) {
      if (d > 30) return null;
      if (typeof v === "string") {
        if (v === "$undefined") return undefined;
        if (/^\$D/.test(v)) return v.slice(2);
        var r = /^\$@?([0-9a-f]+)$/.exec(v);
        if (r && rows[r[1]] && rows[r[1]].v !== undefined) return resolve(rows[r[1]].v, d + 1);
        if (r && rows[r[1]] && rows[r[1]].text !== undefined) return rows[r[1]].text;
        return v.charAt(0) === "$" && v.charAt(1) === "$" ? v.slice(1) : v;
      }
      if (Array.isArray(v)) return v.map(function (x) { return resolve(x, d + 1); });
      if (v && typeof v === "object") {
        var o = {};
        Object.keys(v).forEach(function (k) { o[k] = resolve(v[k], d + 1); });
        return o;
      }
      return v;
    }
    var r0 = rows["0"] && rows["0"].v;
    if (r0 && typeof r0 === "object" && !Array.isArray(r0) && typeof r0.a === "string" && /^\$@/.test(r0.a)) {
      return { action: resolve(r0.a, 0) };
    }
    var names = {};
    Object.keys(rows).forEach(function (id) {
      var r = rows[id];
      if (r.tag !== "I" || !r.v) return;
      var nm = Array.isArray(r.v) ? r.v[2] : r.v.name;
      names["$L" + id] = nm && nm !== "default" && nm !== "*" ? nm : "Component" + id;
    });
    var comps = {}, seen = 0;
    function walk(v, d) {
      if (d > 60 || seen > 400 || !v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        if (v[0] === "$" && typeof v[1] === "string" && v.length === 4) {
          var props = v[3];
          if (props && typeof props === "object" && names[v[1]]) {
            var data = {}, has = false;
            Object.keys(props).forEach(function (k) { if (k !== "children") { data[k] = resolve(props[k], 0); has = true; } });
            if (has) { seen++; (comps[names[v[1]]] = comps[names[v[1]]] || []).push(data); }
          }
          if (props && typeof props === "object") walk(props.children, d + 1);
          return;
        }
        v.forEach(function (x) { walk(x, d + 1); });
        return;
      }
      Object.keys(v).forEach(function (k) { walk(v[k], d + 1); });
    }
    Object.keys(rows).forEach(function (id) { if (!rows[id].tag && rows[id].v !== undefined) walk(rows[id].v, 0); });
    Object.keys(comps).forEach(function (k) { if (comps[k].length === 1) comps[k] = comps[k][0]; });
    return { components: comps };
  }
  function isFlight(ct) { return /text\/x-component/i.test(ct || ""); }

  // Server Action ids live in the page's JS chunks next to their export names:
  // createServerReference("<id>", callServer, void 0, findSourceMapURL, "<name>").
  // Ids change on every deploy; names don't, so calls look the id up again.
  var ACT_RE = /\(\s*"([0-9a-f]{40,44})"\s*,[^"()]{0,200}?,\s*"([A-Za-z_$][\w$]*)"\s*\)/g;
  var actScan = null;
  function scanActions(fresh) {
    if (actScan && !fresh) return actScan;
    var srcs = {};
    try { [].slice.call(document.scripts).forEach(function (sc) { if (sc.src) srcs[sc.src] = 1; }); } catch (e) {}
    try { performance.getEntriesByType("resource").forEach(function (r) { if (r.initiatorType === "script" || /\.js(\?|$)/.test(r.name)) srcs[r.name] = 1; }); } catch (e) {}
    var found = {};
    actScan = Promise.all(Object.keys(srcs).filter(function (s) {
      var u = abs(s);
      return u && u.origin === location.origin && /\/_next\//.test(u.pathname);
    }).map(function (s) {
      return origFetch.call(w, s, { cache: fresh ? "no-cache" : "default" }).then(function (r) { return r.text(); }).then(function (t) {
        ACT_RE.lastIndex = 0;
        var x;
        while ((x = ACT_RE.exec(t))) { found[x[1]] = x[2]; acts[x[1]] = x[2]; }
      }, function () {});
    })).then(function () { persistSoon(); return found; });
    return actScan;
  }
  function actionLabel(id) { return acts[id] || id.slice(0, 8); }
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
    if (isFlight(ct)) {
      learnParams(text);
      try { return { rsc: shape(flightData(parseFlight(text))) }; } catch (e) {}
    }
    return { contentType: (ct || "").split(";")[0], bytes: text.length };
  }
  function cap(t) { return t && t.length > MAX_BODY ? "" : t; }

  // ── Recording ──────────────────────────────────────────────────────────

  var persistTimer = null;
  function persist() {
    try { ss.setItem(KEY, JSON.stringify({ v: VERSION, m: m, po: po, budget: budget, authSrc: authSrc, acts: acts })); } catch (e) {}
  }
  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(function () { persistTimer = null; persist(); }, 300);
  }

  // Finds where the page keeps an auth header's value, by name only.
  function findIn(st, from, needle) {
    if (!st) return null;
    for (var i = 0; i < st.length; i++) {
      var k = st.key(i);
      if (!k || k.indexOf("__ifk") === 0) continue;
      var v = st.getItem(k);
      if (!v || v.indexOf(needle) < 0) continue;
      if (v === needle) return { from: from, key: k };
      try {
        var j = JSON.parse(v);
        if (j === needle) return { from: from, key: k, json: true };
        var path = findPath(j, needle, 0);
        if (path) return { from: from, key: k, path: path };
      } catch (e) {}
    }
    return null;
  }
  function findPath(o, needle, d) {
    if (!o || typeof o !== "object" || d > 4) return null;
    for (var k in o) {
      if (o[k] === needle) return [k];
      var p = findPath(o[k], needle, d + 1);
      if (p) return [k].concat(p);
    }
    return null;
  }
  function sourceOf(value) {
    var pre = (/^(bearer|token|basic|jwt)\s+/i.exec(value) || [""])[0];
    var raw = value.slice(pre.length);
    if (raw.length < 8) return null;
    var hit = findIn(lstore(), "localStorage", raw) || findIn(ss, "sessionStorage", raw);
    if (!hit) {
      try {
        document.cookie.split(/;\s*/).forEach(function (c) {
          var i = c.indexOf("=");
          if (!hit && i > 0 && decodeURIComponent(c.slice(i + 1)) === raw) hit = { from: "cookie", key: c.slice(0, i) };
        });
      } catch (e) {}
    }
    hit = hit || { from: "memory" };
    if (pre) hit.prefix = pre;
    return hit;
  }
  function learnAuth(name, value, u) {
    if (typeof value !== "string" || name === "cookie" || u.origin !== location.origin) return;
    authMem[name] = value;
    var cur = authSrc[name];
    if (!cur || cur.from === "memory") {
      var s = sourceOf(value);
      if (s) authSrc[name] = s;
    }
  }
  // Rebuilds the auth headers for a replay from where the page keeps them.
  function readAuth() {
    var out = {};
    Object.keys(authSrc).forEach(function (name) {
      var s = authSrc[name], v = null;
      try {
        if (s.from === "localStorage" || s.from === "sessionStorage") {
          var st = s.from === "localStorage" ? lstore() : ss;
          v = st && st.getItem(s.key);
          if (v != null && (s.json || s.path)) {
            v = JSON.parse(v);
            (s.path || []).forEach(function (k) { v = v == null ? v : v[k]; });
          }
        } else if (s.from === "cookie") {
          document.cookie.split(/;\s*/).forEach(function (c) {
            if (c.indexOf(s.key + "=") === 0) v = decodeURIComponent(c.slice(s.key.length + 1));
          });
        }
      } catch (e) { v = null; }
      if (typeof v !== "string" || !v) v = authMem[name] ? authMem[name].slice((s.prefix || "").length) : null;
      if (v) out[name] = (s.prefix || "") + v;
    });
    return out;
  }

  function rec(kind, method, url, headers, body, status, ct, text, base) {
    try {
      var u = abs(url, base);
      if (!u || !/^https?:$/.test(u.protocol)) return;
      if (hostRe && !hostRe.test(u.host)) return;
      scanNext();
      if (text !== undefined && isFlight(ct)) learnParams(text);
      learnFromBody(body, u);
      var act = null;
      Object.keys(headers || {}).forEach(function (h) { if (h.toLowerCase() === "next-action" && typeof headers[h] === "string") act = headers[h]; });
      var k = String(method || "GET").toUpperCase() + " " + u.origin + tpl(u.pathname) + (act ? "#" + actionLabel(act) : "");
      var e = m[k] || (m[k] = { kind: kind, n: 0, status: [], query: [], headers: [], auth: [] });
      if (act) {
        e.next = { action: act };
        if (!acts[act]) scanActions(true);
      }
      e.n++;
      if (status != null && e.status.indexOf(status) < 0) e.status.push(status);
      u.searchParams.forEach(function (_, q) {
        var qn = isValueLike(q) ? "{key}" : q;
        if (e.query.indexOf(qn) < 0) e.query.push(qn);
      });
      Object.keys(headers || {}).forEach(function (h) {
        var l = h.toLowerCase();
        if (AUTH_H.test(l)) {
          if (e.auth.indexOf(l) < 0) e.auth.push(l);
          learnAuth(l, headers[h], u);
        }
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
          // Values kept only for auth headers, and only in memory (see learnAuth).
          if (src) new win.Headers(src).forEach(function (v, k) { hs[k] = AUTH_H.test(k) || /^next-action$/i.test(k) ? v : 1; });
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
        return function (k, v) {
          try { if (this.__ifkI) this.__ifkI.h[k] = AUTH_H.test(k) || /^next-action$/i.test(k) ? v : 1; } catch (e) {}
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

  // Re-templates an already templated "origin/path" (no URL(): it would encode the braces).
  function retpl(s) {
    var x = /^(https?:\/\/[^\/]+)(\/.*)?$/.exec(s);
    return x ? x[1] + tpl(x[2] || "/") : s;
  }
  // Applies what was learned after a call was recorded (route params, action names).
  function rekey() {
    scanNext();
    var m2 = {};
    Object.keys(m).forEach(function (k) {
      var e = m[k], sp = k.indexOf(" "), rest = k.slice(sp + 1).split("#")[0];
      var nk = k.slice(0, sp) + " " + retpl(rest) + (e.next ? "#" + actionLabel(e.next.action) : "");
      if (e.next && acts[e.next.action]) e.next.name = acts[e.next.action];
      var p = m2[nk];
      if (!p) { m2[nk] = e; return; }
      p.n += e.n;
      ["status", "query", "headers", "auth"].forEach(function (f) { (e[f] || []).forEach(function (x) { if (p[f].indexOf(x) < 0) p[f].push(x); }); });
      if (!p.req) p.req = e.req;
      if (!p.res) p.res = e.res;
    });
    m = m2;
    var po2 = {};
    Object.keys(po).forEach(function (k) { po2[retpl(k)] = po[k]; });
    po = po2;
  }

  function report() {
    rekey();
    var hooked = {};
    Object.keys(m).forEach(function (k) { hooked[k.slice(k.indexOf(" ") + 1).split("#")[0]] = 1; });
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
      // What a replay needs besides the browser's own cookies: header names and
      // where the page keeps their values. Never the values.
      auth: { cookies: "browser session (sent automatically, HttpOnly included)", headers: authSrc },
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
    build: BUILD,
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
      // Next.js serves page data (not HTML) only with the RSC header.
      if ((o.rsc || /[?&]_rsc=/.test(String(path))) && !Object.keys(init.headers).some(function (k) { return k.toLowerCase() === "rsc"; })) init.headers.rsc = "1";
      // Same identity as the page: attach the auth headers it uses, unless given or {auth:false}.
      var used = [];
      if (u.origin === location.origin && o.auth !== false) {
        var a = readAuth();
        Object.keys(a).forEach(function (h) {
          var has = Object.keys(init.headers).some(function (k) { return k.toLowerCase() === h; });
          if (!has) { init.headers[h] = a[h]; used.push(h); }
        });
      }
      if (o.json !== undefined) {
        init.body = JSON.stringify(o.json);
        init.headers["content-type"] = "application/json";
      } else if (o.body !== undefined) init.body = o.body;
      var maxBytes = o.maxBytes || 20000;
      return origFetch.call(w, u.href, init).then(function (r) {
        return r.text().then(function (t) {
          var out = { status: r.status };
          if (used.length) out.auth = used;
          if (r.status === 401) {
            var missing = Object.keys(authSrc).filter(function (h) { return used.indexOf(h) < 0; });
            out.hint = missing.length
              ? "no value for " + missing.join(", ") + ": use the site once so it sends its token, then retry"
              : (Object.keys(authSrc).length ? "auth headers were sent; the session may have expired" : "no auth header seen yet: use the site once while the kit records");
          }
          var wall = looksLikeWall(r.status, t);
          if (wall) { budget.stopped = wall; out.stopped = wall; }
          persist();
          var ct = r.headers.get("content-type");
          if (isFlight(ct)) {
            learnParams(t);
            var data = flightData(parseFlight(t));
            if (data.action !== undefined) data = data.action;
            var size = JSON.stringify(data === undefined ? null : data).length;
            if (size > maxBytes && !o.full) {
              out.shape = shape(data);
              out.bytes = size;
              out.hint = "big result, shown as its shape. Pass {full:true} and pick fields in the same evaluate: .then(r => r.data...)";
            } else out.data = data;
            return out;
          }
          if (t.length > maxBytes && !o.full) { out.truncated = t.length; t = t.slice(0, maxBytes); }
          try { out.data = JSON.parse(t); } catch (e) { out.text = t.slice(0, 2000); if (/html/i.test(ct || "")) out.hint = "got HTML, not data. On Next.js pages pass {rsc:true}"; }
          return out;
        });
      }, function (e) { return { error: String(e && e.message || e) }; });
    },
    // Calls a Next.js Server Action by export name (or id). The id is looked up
    // in the current page's chunks first, so it survives deploys.
    action: function (nameOrId, args, o) {
      o = o || {};
      if (budget.stopped) return Promise.resolve({ error: "stopped", reason: budget.stopped });
      if (!o.approved) return Promise.resolve({ error: "write needs approval", hint: "a Server Action runs server code and may change data: ask the user, then pass {approved:true}" });
      var self = this;
      return scanActions(true).then(function (found) {
        var id = null;
        Object.keys(found).forEach(function (k) { if (found[k] === nameOrId || k === nameOrId) id = k; });
        if (!id) Object.keys(acts).forEach(function (k) { if (acts[k] === nameOrId) id = k; });
        if (!id && /^[0-9a-f]{40,44}$/.test(nameOrId)) id = nameOrId;
        if (!id) return { error: "action not found", hint: "open a page that uses " + nameOrId + ", re-run the install eval, then retry" };
        var body = JSON.stringify(Array.isArray(args) ? args : args === undefined ? [] : [args]);
        return self.call("POST", o.path || location.pathname + location.search, {
          approved: true, full: o.full, maxBytes: o.maxBytes,
          headers: { "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
          body: body,
        }).then(function (r) {
          if (r && r.status === 404) r.hint = "Server Action id not accepted (new deploy?): reload the page, re-run the install eval, retry";
          if (r) r.actionId = id.slice(0, 8);
          return r;
        });
      });
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
  scanNext();
  if (w.__next_f || w.__NEXT_DATA__) scanActions(false);
  var res = { installed: true, again: false, version: VERSION, build: BUILD, mode: mode, restored: restored };
  if (replaced) res.replaced = replaced;
  if (w.__next_f || w.__NEXT_DATA__) res.nextjs = true;
  return res;
}
