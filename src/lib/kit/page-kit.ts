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
export function pageKit(opts, core) {
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
  // Big Next.js pages (several hundred KB of RSC) still get a shape.
  var MAX_BODY = opts.maxBody || 5000000;
  var MAX_CALLS = opts.maxCalls || 500;
  // What a call may hand back to the agent: small by default, and a hard cap
  // that {full:true} can't pass. Bigger results come back as an overview.
  var MAX_RESULT = opts.maxResult || 4000;
  var HARD_MAX = Math.max(opts.hardMax || 30000, MAX_RESULT);

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
      [KEY, "__ifk"].forEach(function (k) { keep[k] = ss && ss.getItem(k); });
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
  var rpMulti = [];
  // Static route segment names from the app's route data: never templated.
  var statics = {};
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
      // Route values stay in this tab's storage (never exported) so later pages can template earlier calls.
      if (saved.rp) rp = saved.rp;
      if (saved.rpMulti) rpMulti = saved.rpMulti;
      if (saved.statics) statics = saved.statics;
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
    // Catch-all values first: /docs/guides/setup/linux -> /docs/{slug}
    for (var i = 0; i < rpMulti.length; i++) {
      var at = p.indexOf("/" + rpMulti[i].v);
      var end = at + 1 + rpMulti[i].v.length;
      if (at >= 0 && (end === p.length || p.charAt(end) === "/")) p = p.slice(0, at + 1) + "\u0000" + rpMulti[i].n + p.slice(end);
    }
    return p.split("/").map(function (s) {
      if (s.charAt(0) === "\u0000") return "{" + s.slice(1) + "}";
      if (statics[s]) return s;
      var d = s;
      try { d = decodeURIComponent(s); } catch (e) {}
      if (s && rp.hasOwnProperty(d)) return "{" + rp[d] + "}";
      return isValueLike(s) ? "{id}" : s;
    }).join("/");
  }

  // ── Next.js (App Router) ───────────────────────────────────────────────

  // Route trees in RSC payloads carry dynamic segments as ["name","value","d"].
  // Next <=15: ["org","acme","d"]. Next 16: {"n":"org","t":"d","k":"acme"}.
  // Catch-all values span segments ("guides/setup/linux"): kept in rpMulti.
  var PARAM_RE = /\["([A-Za-z_][\w-]{0,40})","([^"\\]{1,200})","(d|c|oc|ci|dc|di)"/g;
  var PARAM16_RE = /\{"n":"([A-Za-z_][\w-]{0,40})","t":"(d|c|oc|ci|dc|di)","k":"([^"\\]{1,200})"/g;
  // (declared with the other state above)
  function addParam(name, value) {
    if (!value || statics[value]) return;
    if (value.indexOf("/") >= 0) {
      if (!rpMulti.some(function (x) { return x.v === value; })) { rpMulti.push({ v: value, n: name }); rpMulti.sort(function (a, b) { return b.v.length - a.v.length; }); }
    } else if (!rp.hasOwnProperty(value)) rp[value] = name;
  }
  var STATIC16_RE = /"s":"([^"\\\/]{1,80})"/g;                       // {"s":"issues","d":...}
  var SIBLINGS_RE = /"t":"(?:d|c|oc|ci|dc|di)","k":"[^"\\]*","s":\[([^\]]*)\]/g; // static siblings of a param
  var STATIC_OLD_RE = /\["([^"\\\/]{1,80})",\{"children"/g;          // Next <=15 tree
  function learnStatics(text) {
    var x;
    var add = function (n) { if (n && n.indexOf("__") !== 0 && n.charAt(0) !== "(" && n.charAt(0) !== "@" && n !== "children") { statics[n] = 1; if (rp[n]) delete rp[n]; } };
    STATIC16_RE.lastIndex = 0; while ((x = STATIC16_RE.exec(text))) add(x[1]);
    SIBLINGS_RE.lastIndex = 0; while ((x = SIBLINGS_RE.exec(text))) x[1].split(",").forEach(function (q) { add(q.replace(/^"|"$/g, "")); });
    STATIC_OLD_RE.lastIndex = 0; while ((x = STATIC_OLD_RE.exec(text))) add(x[1]);
  }
  function learnParams(text) {
    if (!text) return;
    if (text.indexOf('"children"') >= 0 || text.indexOf('"s":') >= 0) learnStatics(text);
    var x;
    if (text.indexOf('{"n":"') >= 0) { PARAM16_RE.lastIndex = 0; while ((x = PARAM16_RE.exec(text))) addParam(x[1], x[3]); }
    if (/","(d|c|oc)"/.test(text)) { PARAM_RE.lastIndex = 0; while ((x = PARAM_RE.exec(text))) addParam(x[1], x[2]); }
  }
  // The first render's RSC data. Next <=15 keeps it in self.__next_f; Next 16
  // empties that after hydration, but the inline push(...) scripts stay in the DOM.
  var initText = null;
  function nextInitialText() {
    if (initText !== null) return initText;
    var parts = [];
    try {
      var f = w.__next_f;
      if (f && f.length) f.forEach(function (x) { if (x && x[0] === 1 && typeof x[1] === "string") parts.push(x[1]); });
      if (!parts.length) {
        [].slice.call(document.querySelectorAll("script:not([src])")).forEach(function (sc) {
          var t = sc.textContent || "";
          var i = t.indexOf("self.__next_f.push(");
          if (i < 0) return;
          try {
            var arr = JSON.parse(t.slice(i + 19, t.lastIndexOf(")")));
            if (arr && arr[0] === 1 && typeof arr[1] === "string") parts.push(arr[1]);
          } catch (e) {}
        });
      }
    } catch (e) {}
    initText = parts.join("");
    return initText;
  }
  var nextIdx = 0;
  function scanNext() {
    if (nextIdx === 0) { learnParams(nextInitialText()); nextIdx = -1; }
    try {
      var f = w.__next_f;
      if (f && f.length > Math.max(nextIdx, 0)) {
        for (var i = Math.max(nextIdx, 0); i < f.length; i++) if (f[i] && typeof f[i][1] === "string") learnParams(f[i][1]);
        nextIdx = f.length;
      }
    } catch (e) {}
    try { // Pages Router
      var q = w.__NEXT_DATA__ && w.__NEXT_DATA__.query;
      if (q) Object.keys(q).forEach(function (k) { if (typeof q[k] === "string" && !rp.hasOwnProperty(q[k])) rp[q[k]] = k; });
    } catch (e) {}
  }
  // RSC parsing, find and pick come from recipeCore (shared with recipes, one copy).
  var parseFlight = core.parseFlight, flightData = core.flightData, pickPath = core.pick, findByShape = core.find;
  function jsize(v) { try { return JSON.stringify(v === undefined ? null : v).length; } catch (e) { return 0; } }
  // A few hundred chars that say what's in a big result, so the next call can pick.
  function overview(v) {
    if (Array.isArray(v)) {
      var a = { length: v.length };
      if (v.length && v[0] && typeof v[0] === "object") a.itemKeys = Object.keys(v[0]).slice(0, 40);
      return a;
    }
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).slice(0, 60).forEach(function (k) {
        var x = v[k];
        o[k] = Array.isArray(x) ? "array(" + x.length + ") " + jsize(x) + " chars" : x && typeof x === "object" ? "object " + jsize(x) + " chars" : typeof x;
      });
      return o;
    }
    return typeof v;
  }
  // Shapes what a call returns: component filter, pick, then the size limits.
  // RSC overview: biggest components first, with their top-level keys.
  function compIndex(c) {
    return Object.keys(c).map(function (n) {
      var v = c[n], one = Array.isArray(v) ? v[0] : v;
      return { n: n, bytes: jsize(v), keys: one && typeof one === "object" ? Object.keys(one).slice(0, 12) : [], count: Array.isArray(v) ? v.length : undefined };
    }).sort(function (a, b) { return b.bytes - a.bytes; }).slice(0, 15).reduce(function (o, x) {
      o[x.n] = x.count ? { bytes: x.bytes, instances: x.count, keys: x.keys } : { bytes: x.bytes, keys: x.keys };
      return o;
    }, {});
  }
  // Components on most captured pages are layout (sidebar, providers, widgets).
  function finish(out, data, o) {
    var flight = data && data.rows ? data : null;
    if (o.schema) {
      // The page's data as paste-able paths with one sample each. No data back.
      var so = typeof o.schema === "object" ? o.schema : {};
      out.schema = core.schema(data, { under: so.under });
      return out;
    }
    if (o.nodes !== undefined) {
      // Server-rendered HTML in the RSC payload: links, rows, headings with text.
      if (!flight) { out.error = "nodes needs an RSC (Next.js page) response"; return out; }
      data = core.nodes(flight.rows, o.nodes === true ? "*" : o.nodes);
    }
    if (o.find !== undefined && o.nodes === undefined) {
      var cands = core.findAll(data && data.components ? data.components : data, o.find), amb = core.ambiguity(cands);
      if (amb) {
        // Never answer from a guess: the two candidates can give different numbers.
        out.error = core.ambiguousMsg(o.find, amb);
        return out;
      }
      var f = findByShape(data && data.components ? data.components : data, o.find);
      if (f === undefined) {
        out.error = "nothing matches find: " + (typeof o.find === "function" ? "function" : o.find);
        if (data && data.components) out.components = compIndex(data.components);
        if (data && data.components) out.hint = "find takes a key path that must exist (data.tablesNeeded), a component name from the list above, or a function";
        return out;
      }
      data = f;
    }
    if (o.component && data && data.components) {
      var names = [].concat(o.component), c = data.components, sel = {}, miss = [];
      names.forEach(function (n) { if (c.hasOwnProperty(n)) sel[n] = c[n]; else miss.push(n); });
      if (miss.length) { out.error = "component not found: " + miss.join(", "); out.components = Object.keys(c); return out; }
      data = names.length === 1 ? sel[names[0]] : sel;
    }
    // Filter and sort before pick (all fields available), count/group/limit after.
    try {
      data = core.answer(data, o);
    } catch (e) { out.error = String(e && e.message || e); return out; }
    // raw: the whole value for code that reduces it in the same evaluate, e.g.
    // __ifk.call(p,{rsc:true,raw:true}).then(r => ...). Return only the reduced part.
    if (o.raw) { out.data = data; return out; }
    var limit = Math.min(o.full ? HARD_MAX : (o.maxBytes || MAX_RESULT), HARD_MAX);
    var size = jsize(data);
    if (size <= limit) { out.data = data; return out; }
    out.bytes = size;
    var comps = data && typeof data === "object" && !Array.isArray(data) && data.components;
    out.overview = comps ? compIndex(comps) : overview(data);
    if (comps && flight) {
      var byTag = {};
      core.nodes(flight.rows).forEach(function (n) { byTag[n.tag] = (byTag[n.tag] || 0) + 1; });
      if (Object.keys(byTag).length) out.overview.$nodes = byTag;
    }
    out.hint = (comps ? "choose by shape: {find:'key.path'} (names like $54 change), or server-rendered HTML: {nodes:'a'}, then " : "") +
      "narrow it: {where:'x>0'}, {group:'status'}, {count:true}, {limit:20}, {pick:'list.{id,name}'}, or {schema:true}. Limit " + limit + " chars" +
      (limit >= HARD_MAX ? " (hard cap)" : "; {full:true} raises it to " + HARD_MAX) + ". In-page code that filters itself: {raw:true}";
    return out;
  }
  function isFlight(ct) { return /text\/x-component/i.test(ct || ""); }

  // Server Action ids live in the page's JS chunks next to their export names:
  // createServerReference("<id>", callServer, void 0, findSourceMapURL, "<name>").
  // Ids change on every deploy; names don't, so calls look the id up again.
  var ACT_RE = /\(\s*"([0-9a-f]{40,44})"\s*,[^"()]{0,200}?,\s*"([A-Za-z_$][\w$]*)"\s*\)/g;
  var actScan = null;
  var walkSt = null;
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
  // Union of two shapes: object keys merged, different types joined ("string|null").
  function mergeShape(a, b) {
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      var o = {};
      Object.keys(a).forEach(function (k) { o[k] = k in b ? mergeShape(a[k], b[k]) : a[k]; });
      Object.keys(b).forEach(function (k) { if (!(k in o)) o[k] = b[k]; });
      return o;
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length && b.length ? [mergeShape(a[0], b[0])] : (a.length ? a : b);
    if (typeof a === "string" && typeof b === "string") {
      var parts = a.split("|");
      b.split("|").forEach(function (t) { if (parts.indexOf(t) < 0) parts.push(t); });
      return parts.join("|");
    }
    return typeof a === "string" ? a : b; // object vs scalar: keep the richer one
  }
  function shape(v, d) {
    d = d || 0;
    if (v === null) return "null";
    // Lists can mix item types and optional fields: merge the first 25 items.
    if (Array.isArray(v)) {
      if (!v.length) return [];
      var acc;
      for (var i = 0; i < Math.min(v.length, 25); i++) acc = i ? mergeShape(acc, shape(v[i], d + 1)) : shape(v[i], d + 1);
      return [acc];
    }
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
  function resShape(text, ct, fd) {
    if (!text) return undefined;
    if (/json/i.test(ct || "")) { try { return shape(JSON.parse(text)); } catch (e) {} }
    if (isFlight(ct)) {
      learnParams(text);
      try {
        var fdx = fd !== undefined ? fd : flightData(parseFlight(text));
        var sh = { rsc: shape(fdx) };
        if (fdx && fdx.rows && fdx.action === undefined) {
          var tags = {};
          core.nodes(fdx.rows).forEach(function (n) { tags[n.tag] = 1; });
          if (Object.keys(tags).length) sh.rsc.nodes = Object.keys(tags).join("|"); // server-rendered HTML: query with {nodes:'a'}
        }
        return sh;
      } catch (e) {}
    }
    return { contentType: (ct || "").split(";")[0], bytes: text.length };
  }
  function cap(t) { return t && t.length > MAX_BODY ? "" : t; }

  // ── Recording ──────────────────────────────────────────────────────────

  var persistTimer = null;
  function persist() {
    try { ss.setItem(KEY, JSON.stringify({ v: VERSION, m: m, po: po, budget: budget, authSrc: authSrc, acts: acts, rp: rp, rpMulti: rpMulti, statics: statics })); } catch (e) {}
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
      try { // rotating CSRF tokens often live in <meta name="csrf-token" content="...">
        [].slice.call(document.querySelectorAll("meta[name][content]")).forEach(function (mt) {
          if (!hit && mt.getAttribute("content") === raw) hit = { from: "meta", key: mt.getAttribute("name") };
        });
      } catch (e) {}
    }
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
        } else if (s.from === "meta") {
          var mt = document.querySelector('meta[name="' + s.key + '"]');
          v = mt && mt.getAttribute("content");
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
      var fd;
      if (text !== undefined && isFlight(ct)) {
        learnParams(text);
        try { fd = flightData(parseFlight(text)); } catch (e) {}
      }
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
      // Prefer successful responses, and merge them: variants (A/B, optional
      // fields, two response formats) all show up in one shape.
      if (text !== undefined) {
        var ok = status >= 200 && status < 300;
        var rs = resShape(text, ct, fd);
        if (rs !== undefined) {
          if (!e.res || (ok && !e.resOk)) { e.res = rs; e.resOk = ok; }
          else if (ok && e.resOk) e.res = mergeShape(e.res, rs);
        }
      }
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
      var fd = new FormData(f), href = doc.location.href;
      // React and other frameworks cancel the native submit and send their own
      // request (recorded by the fetch hook). Only a real navigation is a form post.
      setTimeout(function () {
        if (ev.defaultPrevented) return;
        rec("form", f.method || "GET", f.action || href, {}, fd, undefined, undefined, undefined, href);
      }, 0);
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
      routes: { static: Object.keys(statics) },
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
    // Counts only. {endpoints:true} adds "METHOD /path" per endpoint (same-origin paths short).
    summary: function () {
      var c = report().coverage;
      return { installed: true, mode: mode, seen: c.seen, withPayload: c.withPayload, pathOnly: c.pathOnly, replays: budget.calls, maxCalls: MAX_CALLS, stopped: budget.stopped };
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
      var retries = o.retry != null ? o.retry : method === "GET" ? 2 : 0;
      function attempt(n) {
      return origFetch.call(w, u.href, init).then(function (r) {
        // Flaky servers: GETs retry on 5xx (not 403/429, those stop for good).
        if (r.status >= 500 && n < retries) return new Promise(function (ok) { setTimeout(ok, 300 * Math.pow(2, n)); }).then(function () { return attempt(n + 1); });
        return r.text().then(function (t) {
          var out = { status: r.status };
          if (n) out.retried = n;
          if (r.redirected && /\/(login|log-in|signin|sign-in|auth|sso)(\/|\?|$)/i.test(new URL(r.url).pathname)) {
            out.error = "session expired: the request landed on a login page. Ask the user to log in again in this tab";
            return out;
          }
          if (r.status === 429 && r.headers.get("retry-after")) out.retryAfter = r.headers.get("retry-after");
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
            if (data.redirect) {
              if (/\/(login|log-in|signin|sign-in|auth|sso)(\/|\?|$)/i.test(data.redirect)) out.error = "session expired: the page redirects to " + data.redirect + ". Ask the user to log in again in this tab";
              else { out.redirect = data.redirect; out.hint = "the page redirected; call that path instead"; }
              return out;
            }
            if (data.action !== undefined) data = data.action;
            else if (data.errors) {
              // Next streams a server error inside a 200. Retry GETs while the wanted shape is missing.
              if (method === "GET" && n < retries && (o.find === undefined || findByShape(data.components, o.find) === undefined))
                return new Promise(function (ok) { setTimeout(ok, 300 * Math.pow(2, n)); }).then(function () { return attempt(n + 1); });
              out.serverErrors = data.errors;
            }
            o.__path = path;
            return finish(out, data, o);
          }
          var parsed;
          try { parsed = JSON.parse(t); } catch (e) {
            out.text = t.slice(0, Math.min(o.raw ? t.length : 500, t.length));
            if (t.length > out.text.length) out.truncated = t.length;
            if (/html/i.test(ct || "")) out.hint = "got HTML, not data. On Next.js pages pass {rsc:true}";
            return out;
          }
          return finish(out, parsed, o);
        });
      }, function (e) {
        if (n < retries) return new Promise(function (ok) { setTimeout(ok, 300 * Math.pow(2, n)); }).then(function () { return attempt(n + 1); });
        return { error: String(e && e.message || e) };
      });
      }
      return attempt(0);
    },
    // Visits pages in the background so no single evaluate runs long (T3 times
    // out at 15 s). Uses Next.js client navigation when there is one (no reload,
    // the kit keeps recording); otherwise fetches each page's RSC data through
    // the hooked fetch. Poll with walkStatus().
    walk: function (paths, wo) {
      wo = wo || {};
      if (walkSt && !walkSt.done) return { error: "a walk is running", status: w.__ifk.walkStatus() };
      var router = w.next && w.next.router;
      var via = router && typeof router.push === "function" ? "next.router.push" : "fetch";
      var st = walkSt = { i: 0, n: (paths || []).length, done: false, errors: [], via: via };
      var waitMs = wo.waitMs || 1500;
      (function step() {
        if (st.stop || st.i >= st.n) { st.done = true; persist(); return; }
        var p = paths[st.i];
        Promise.resolve().then(function () {
          // Always fetch the page's data ourselves: Next serves client navigations
          // from its prefetch cache (often filled before the kit was installed), so
          // router.push alone may send no request. push still runs what the page
          // does on mount (client fetches, actions).
          return w.fetch(p, { headers: { rsc: "1" }, credentials: "include" }).then(function () {
            if (via !== "fetch") return router.push(p);
          });
        }).catch(function (e) { st.errors.push(p + ": " + (e && e.message || e)); }).then(function () {
          setTimeout(function () { st.i++; step(); }, waitMs);
        });
      })();
      return { started: true, n: st.n, via: via, etaSec: Math.round(st.n * waitMs / 1000) };
    },
    // Resolves when the walk is done or after ms (default 12000, under T3's 15 s).
    walkWait: function (ms) {
      var self = this, end = Date.now() + (ms || 12000);
      return new Promise(function (ok) {
        (function tick() {
          var st = self.walkStatus({ __inner: true });
          if (!walkSt || walkSt.done || Date.now() >= end) return ok(st);
          setTimeout(tick, 250);
        })();
      });
    },
    walkStatus: function (wo) {
      if (!walkSt) return { walking: false };
      if (wo && wo.stop) walkSt.stop = true;
      var c = report().coverage;
      // seen counts distinct endpoints: pages that share a route template add none.
      return { i: walkSt.i, n: walkSt.n, done: walkSt.done, via: walkSt.via, seen: c.seen, errors: walkSt.errors.slice(-3) };
    },
    // Calls a Next.js Server Action by export name (or id). The id is looked up
    // in the current page's chunks first, so it survives deploys.
    // target: export name or id, or {path, find, prop} for an action handed to a
    // component as a prop (inline actions): the page is read first, so the id and
    // bound args are the current render's.
    action: function (target, args, o) {
      o = o || {};
      if (budget.stopped) return Promise.resolve({ error: "stopped", reason: budget.stopped });
      if (!o.approved) return Promise.resolve({ error: "write needs approval", hint: "a Server Action runs server code and may change data: ask the user, then pass {approved:true}" });
      var self = this;
      var list = Array.isArray(args) ? args : args === undefined ? [] : [args];
      var getRef;
      if (target && typeof target === "object" && target.$action) getRef = Promise.resolve(target);
      else if (target && typeof target === "object") {
        getRef = self.call("GET", target.path, { rsc: true, raw: true, __inner: true }).then(function (r) {
          if (!r || r.error || r.status >= 400) throw new Error("page " + target.path + ": " + (r && (r.error || r.status)));
          var obj = findByShape(r.data && r.data.components ? r.data.components : r.data, target.find);
          var ref = obj && obj[target.prop];
          if (!ref || !ref.$action) throw new Error("action prop " + target.prop + " not found on " + target.path + " (page changed?)");
          if (!o.path) o.path = target.path;
          return ref;
        });
      } else {
        getRef = scanActions(true).then(function (found) {
          var id = null;
          Object.keys(found).forEach(function (k) { if (found[k] === target || k === target) id = k; });
          if (!id) Object.keys(acts).forEach(function (k) { if (acts[k] === target) id = k; });
          if (!id && /^[0-9a-f]{40,44}$/.test(target)) id = target;
          if (!id) throw new Error("action " + target + " not found: open a page that uses it, re-run the install eval, retry");
          return { $action: id, bound: [] };
        });
      }
      return getRef.then(function (ref) {
        var id = ref.$action;
        var body = JSON.stringify(core.reEncode(ref.bound || []).concat(core.encodeArgs(list)));
        return self.call("POST", o.path || location.pathname + location.search, {
          __inner: true, approved: true, full: o.full, maxBytes: o.maxBytes, pick: o.pick, find: o.find, component: o.component, raw: o.raw, where: o.where, group: o.group, count: o.count, limit: o.limit,
          headers: { "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
          body: body,
        }).then(function (r) {
          // Stale id (the tab predates a deploy): find the current one on the live page, retry once.
          if (r && (r.status === 404 || r.status === 409) && !o.__retried) {
            var again = target && typeof target === "object" && !target.$action
              ? Promise.resolve(target)
              : core.actionId(acts[id] || target, true).then(function (nid) { return nid && nid !== id ? { $action: nid, bound: [] } : null; });
            return again.then(function (t2) {
              if (!t2) { r.hint = "Server Action id not accepted (new deploy?) and no newer id on the live page"; return r; }
              return self.action(t2, args, Object.assign({}, o, { __retried: true }));
            });
          }
          if (r && r.status === 404) r.hint = "Server Action id not accepted (new deploy?): reload the page, re-run the install eval, retry";
          if (r) r.actionId = id.slice(0, 8);
          return r;
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
      try { ss.removeItem(KEY); ss.removeItem("__ifk"); } catch (e) {}
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
