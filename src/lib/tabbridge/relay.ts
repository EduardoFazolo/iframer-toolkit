// @ts-nocheck
/**
 * The relay: the one snippet run once in a logged-in tab (T3 Code
 * preview_evaluate, Playwright MCP browser_evaluate, a DevTools console). It
 * connects to the tab bridge daemon and carries same-site requests with the
 * tab's own login (HttpOnly cookies included). It patches nothing: no fetch or
 * XHR hook, one WebSocket, the page's own fetch.
 *
 * Serialized with Function.prototype.toString, so it must stay self-contained
 * plain JavaScript: no imports, no outer variables, no TypeScript syntax.
 *
 * Answers (a string, within ~4 s): ATTACHED, ALREADY_ATTACHED, CSP_BLOCKED: ...,
 * NO_BRIDGE: ..., WAITING: ...
 * It reconnects by itself every 3 s while the page lives (a background tab can
 * take a minute). A page reload or navigation ends it: attach again.
 */
export function tabRelay(c) {
  var MAX = 32 * 1024 * 1024;
  var KEY = Symbol.for("iframer.bridge");
  var old = window[KEY];
  if (old && old.k === c.k && old.port === c.port && !old.stopped && (old.open || old.connecting)) return old.open ? "ALREADY_ATTACHED" : old.first;
  if (old) { old.stopped = true; try { old.ws && old.ws.close(); } catch (e) {} }
  var st = { k: c.k, port: c.port, open: false, ever: false, stopped: false, connecting: true, ws: null, first: null };
  try { Object.defineProperty(window, KEY, { value: st, configurable: true, enumerable: false, writable: true }); } catch (e) { window[KEY] = st; }

  var host = c.site.split(":")[0];
  function mine(u) {
    if (u.protocol !== location.protocol) return false;
    if (c.site.indexOf(":") > 0 && u.host !== c.site) return false;
    return u.hostname === host || u.hostname.slice(-host.length - 1) === "." + host;
  }
  function b64(buf) {
    var s = "";
    for (var i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function bytes(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // The whole body, or an error once it passes MAX (a download or an endless stream must not look like a frozen tab).
  function readBody(res) {
    if (!res.body || !res.body.getReader) return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    var reader = res.body.getReader(), parts = [], n = 0;
    function step() {
      return reader.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(n), at = 0;
          for (var i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
          return out;
        }
        n += r.value.length;
        if (n > MAX) { try { reader.cancel(); } catch (e) {} throw new Error("response larger than 32 MB: too large for the tab bridge"); }
        parts.push(r.value);
        return step();
      });
    }
    return step();
  }

  function handle(ws, q) {
    function reply(o) { o.id = q.id; try { ws.send(JSON.stringify(o)); } catch (e) {} }
    // Woke up after the deadline (the tab was frozen): the daemon already gave up on this one. Do not send it.
    if (q.notAfter && Date.now() > q.notAfter) return reply({ expired: 1 });
    reply({ ack: 1 });
    Promise.resolve().then(function () {
      var method = String(q.method || "GET").toUpperCase(), read = method === "GET" || method === "HEAD";
      var u = new URL(q.url, location.href);
      if (!mine(u)) throw new Error("not this tab's site: " + u.hostname);
      if (c.ro && !read) throw new Error("this tab is attached read-only: " + method + " refused");
      var headers = {}, referrer;
      Object.keys(q.headers || {}).forEach(function (k) {
        // A page can't set Referer as a header; a same-origin one goes in as the fetch referrer.
        if (k.toLowerCase() === "referer") { try { if (new URL(q.headers[k], location.href).origin === location.origin) referrer = q.headers[k]; } catch (e) {} }
        else headers[k] = q.headers[k];
      });
      // Auth headers the site's own code sends (a token in localStorage, a CSRF <meta>): filled in here from where the
      // page keeps them, unless the script already set them. The values never leave the page.
      Object.keys(q.auth || {}).forEach(function (name) {
        if (Object.keys(headers).some(function (k) { return k.toLowerCase() === name.toLowerCase(); })) return;
        var s = q.auth[name] || {}, v = null;
        try {
          if (s.from === "localStorage" || s.from === "sessionStorage") {
            v = window[s.from] && window[s.from].getItem(s.key);
            if (v != null && (s.json || s.path)) { v = JSON.parse(v); (s.path || []).forEach(function (k) { v = v == null ? v : v[k]; }); }
          } else if (s.from === "cookie") {
            document.cookie.split(/;\s*/).forEach(function (ck) { if (ck.indexOf(s.key + "=") === 0) v = decodeURIComponent(ck.slice(s.key.length + 1)); });
          } else if (s.from === "meta") {
            var m = document.querySelector('meta[name="' + s.key + '"]');
            v = m && m.getAttribute("content");
          }
        } catch (e) { v = null; }
        if (typeof v === "string" && v) headers[name] = (s.prefix || "") + v;
      });
      var init = { method: method, headers: headers, credentials: "include", redirect: q.redirect || "follow", cache: "no-store" };
      if (referrer) init.referrer = referrer;
      if (!read && q.body64 != null) init.body = bytes(q.body64);
      else if (!read && q.body != null) init.body = q.body;
      // A read gives up after 20 s (the bridge then asks another tab); a write is never cut off mid-way.
      if (read && typeof AbortSignal !== "undefined" && AbortSignal.timeout) init.signal = AbortSignal.timeout(20000);
      return fetch(u.href, init).then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (/text\/event-stream/i.test(type)) { try { res.body && res.body.cancel(); } catch (e) {} throw new Error("streamed response (" + type + "): not supported through the tab bridge"); }
        if (+res.headers.get("content-length") > MAX) { try { res.body && res.body.cancel(); } catch (e) {} throw new Error("response larger than 32 MB: too large for the tab bridge"); }
        return readBody(res).then(function (body) {
          var h = {};
          res.headers.forEach(function (v, k) { h[k] = v; });
          reply({ status: res.status, type: res.type, redirected: res.redirected, url: res.url, headers: h, body64: b64(body) });
        });
      });
    }).catch(function (e) { reply({ error: String((e && e.message) || e) }); });
  }

  st.first = new Promise(function (done) {
    var blocked = false;
    // The browser reports the block at once; the socket's own close event can come seconds later.
    function onCsp(ev) {
      if (String(ev.blockedURI || "").indexOf("127.0.0.1") < 0 || st.ever) return;
      blocked = true; st.stopped = true; st.connecting = false;
      done(CSP);
    }
    try { document.addEventListener("securitypolicyviolation", onCsp); } catch (e) {}
    var CSP = "CSP_BLOCKED: this site's content security policy blocks the page from connecting to 127.0.0.1, so the tab bridge can't attach here. Use iframer auth, or run recipes in the tab (iframer recipe <host> --in-page).";
    function connect() {
      if (st.stopped) return;
      var ws;
      try { ws = new WebSocket("ws://127.0.0.1:" + c.port + "/relay?s=" + encodeURIComponent(c.site) + "&n=" + encodeURIComponent(c.name) + (c.ro ? "&ro=1" : "") + "&k=" + c.k); }
      catch (e) { st.connecting = false; return done(blocked ? CSP : "NO_BRIDGE: the browser refused the connection to 127.0.0.1 (" + ((e && e.message) || e) + ")."); }
      st.ws = ws;
      ws.onopen = function () {
        st.open = st.ever = true; st.connecting = false;
        try { ws.send(JSON.stringify({ hello: location.href, v: 1 })); } catch (e) {}
        done("ATTACHED");
      };
      ws.onclose = function () {
        st.open = false;
        if (st.stopped) return;
        if (st.ever) { setTimeout(connect, 3000); return; }
        st.connecting = false;
        // The violation event arrives just after the close: give it a moment.
        setTimeout(function () {
          done(blocked ? CSP : "NO_BRIDGE: this page could not connect to the tab bridge on 127.0.0.1:" + c.port + ". Run `iframer bridge attach` again and use the fresh line it prints. If `iframer bridge status` says it is running, the browser is blocking local connections (Chrome 147+: allow \"local network access\" for this site).");
        }, 150);
      };
      ws.onmessage = function (ev) {
        var q;
        try { q = JSON.parse(ev.data); } catch (e) { return; }
        if (q && q.id) handle(ws, q);
      };
    }
    connect();
    setTimeout(function () {
      done(blocked ? CSP : "WAITING: no answer from 127.0.0.1:" + c.port + " yet. If the browser is asking to allow local network access for this site, allow it, then check `iframer bridge status`.");
    }, 4000);
  });
  return st.first;
}

/** The relay as one evaluable expression. Its value is a promise of the attach answer. */
export function relaySource(cfg: { port: number; site: string; name: string; readOnly: boolean; key: string }): string {
  const c: Record<string, unknown> = { port: cfg.port, site: cfg.site, name: cfg.name, k: cfg.key };
  if (cfg.readOnly) c.ro = 1;
  // One evaluate call: drop the indentation, keep the lines (no minifier at run time).
  return `(${tabRelay.toString().replace(/\n\s+/g, "\n")})(${JSON.stringify(c)})`;
}
