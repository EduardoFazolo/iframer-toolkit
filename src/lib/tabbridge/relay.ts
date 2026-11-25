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
 * Answers (a string, within ~4 s): ATTACHED, ALREADY_ATTACHED, WRONG_TAB: ...,
 * CSP_BLOCKED: ..., NO_BRIDGE: ..., WAITING: ...
 * It reconnects by itself every 3 s while the page lives (a background tab can
 * take a minute). A page reload or navigation ends it: attach again.
 *
 * Messages from the daemon: {id, url, method, ..., notAfter} a request,
 * {id, go} release a held write, {id, abort} stop a read nobody waits for.
 * Replies: {id, ack}, then the response, or {id, error} (+ unsent: failed before any fetch), or {id, expired}.
 * A read is confirmed ({id, ack}) and fetched at once. A write is confirmed and
 * then HELD until its go: the daemon only sends the go while it still waits, so
 * a write the daemon gave up on never starts.
 */
export function tabRelay(c) {
  var MAX = 32 * 1024 * 1024;
  if (location.origin !== c.o) return "WRONG_TAB: this expression is for " + c.o + " and this tab is on " + location.origin + ". Open the tab on " + c.o + ", or run `iframer bridge attach " + location.host + "` for this one.";
  var KEY = Symbol.for("iframer.bridge");
  // The version is part of what "already attached" means: a relay from an older iframer in this tab is replaced.
  var id = [c.v, c.port, c.site, c.name, c.ro ? 1 : 0].join("|");
  var old = window[KEY];
  if (old && old.id === id && !old.stopped && (old.open || old.connecting)) return old.open ? "ALREADY_ATTACHED" : old.first;
  if (old) { old.stopped = true; try { old.ws && old.ws.close(); } catch (e) {} }
  var st = { id: id, open: false, ever: false, stopped: false, connecting: true, ws: null, first: null };
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
  // Where the page keeps an auth value its own code sends as a header (names only were recorded when the site was mapped).
  function stored(s) {
    var v = null;
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
    return typeof v === "string" && v ? (s.prefix || "") + v : null;
  }

  var held = {}, running = {};
  function request(ws, q) {
    function reply(o) { o.id = q.id; try { ws.send(JSON.stringify(o)); } catch (e) {} }
    // Woke up after the deadline (the tab was frozen): the daemon already gave up on this one. Do not send it.
    if (q.notAfter && Date.now() > q.notAfter) return reply({ expired: 1 });
    var method = String(q.method || "GET").toUpperCase(), read = method === "GET" || method === "HEAD";
    function run() {
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, timer, started = false, answered = false, redirectGuard = "";
      Promise.resolve().then(function () {
        var u = new URL(q.url, location.href);
        if (!mine(u)) throw new Error("not this tab's site: " + u.hostname);
        if (c.ro && !read) throw new Error("this tab is attached read-only: " + method + " refused");
        var headers = {}, referrer;
        Object.keys(q.headers || {}).forEach(function (k) {
          // A page can't set Referer as a header; a same-origin one goes in as the fetch referrer.
          if (k.toLowerCase() === "referer") { try { if (new URL(q.headers[k], location.href).origin === location.origin) referrer = q.headers[k]; } catch (e) {} }
          else headers[k] = q.headers[k];
        });
        // Auth headers the site's own code sends (a token in localStorage, a CSRF <meta>). Where the page is known to
        // keep one, only this page's value is ever sent: one the script brought from a saved session is dropped, even
        // when the page has none, so a request never carries another account's token. The value never leaves the page.
        // A header with no known place in the page (an API key set by hand) stays as the script sent it.
        Object.keys(q.auth || {}).forEach(function (name) {
          var s = q.auth[name] || {};
          if (!s.from) return;
          Object.keys(headers).forEach(function (k) { if (k.toLowerCase() === name.toLowerCase()) delete headers[k]; });
          var v = stored(s);
          if (v != null) headers[name] = v;
        });
        // Redirects never take a request off this tab's ground, and every request is sent exactly once:
        // - a write is never followed (its body would go wherever the answer points): it comes back as a 302;
        // - a read to this page's own origin is followed in "same-origin" mode: the browser itself refuses a hop to
        //   another origin before requesting it. That refusal looks like a failed fetch (the browser does not say
        //   which it was), so the error names both causes;
        // - a read to another host of the site (an API subdomain) is not followed: it comes back as a 302.
        // (Mode "same-origin" shows in the Sec-Fetch-Mode header: "same-origin" where the page's own fetch says "cors".)
        var own = u.origin === location.origin;
        var redirect = q.redirect === "error" ? "error" : read && own ? (q.redirect || "follow") : "manual";
        var init = { method: method, headers: headers, credentials: "include", redirect: redirect, cache: "no-store" };
        if (read && own) init.mode = "same-origin";
        redirectGuard = redirect === "error" ? "error" : read && own ? "origin" : "";
        if (referrer) init.referrer = referrer;
        if (!read && q.body64 != null) init.body = bytes(q.body64);
        else if (!read && q.body != null) init.body = q.body;
        if (read && ctl) {
          init.signal = ctl.signal;
          running[q.id] = ctl;
          // A read gives up after 20 s (the bridge then asks another tab); a write is never cut off mid-way.
          timer = setTimeout(function () { ctl.abort(); }, 20000);
        }
        started = true;
        return fetch(u.href, init).then(function (res) {
          answered = true;
          function drop(why) { try { res.body && res.body.cancel(); } catch (e) {} throw new Error(why); }
          // A followed redirect that ended on another site: this tab only answers for its own.
          if (res.url) { var end = new URL(res.url); if (!mine(end)) drop("redirected to another site (" + end.hostname + "): refused"); }
          var type = res.headers.get("content-type") || "";
          if (/text\/event-stream/i.test(type)) drop("streamed response (" + type + "): not supported through the tab bridge");
          if (+res.headers.get("content-length") > MAX) drop("response larger than 32 MB: too large for the tab bridge");
          return readBody(res).then(function (body) {
            var h = {};
            res.headers.forEach(function (v, k) { h[k] = v; });
            reply({ status: res.status, type: res.type, redirected: res.redirected, url: res.url, headers: h, body64: b64(body) });
          });
        });
      }).catch(function (e) {
        var out = { error: read && ctl && ctl.signal.aborted ? "aborted: the read was stopped or timed out" : String((e && e.message) || e) };
        // A fetch that failed after it started, in a mode that refuses redirects off this origin (or all redirects).
        // The fetch itself failed, in a mode where the browser refuses a redirect (off this origin, or any): it does
        // not say which it was.
        if (started && !answered && redirectGuard && !(ctl && ctl.signal.aborted)) out.error += " (the tab could not reach the site, or the site redirected this request" + (redirectGuard === "error" ? "" : " to another origin, for example a login on another host") + ", which the bridge does not follow)";
        // Refused before any fetch: certain not to be on the site (the daemon tells a write's caller so).
        if (!started) out.unsent = 1;
        reply(out);
      }).then(function () { clearTimeout(timer); delete running[q.id]; });
    }
    reply({ ack: 1 });
    if (read) return run();
    // Dropped if no go comes: the daemon gave up on it, so it must never start.
    held[q.id] = { run: run, timer: setTimeout(function () { delete held[q.id]; }, 30000) };
  }
  function release(id) { var h = held[id]; if (!h) return null; clearTimeout(h.timer); delete held[id]; return h.run; }
  function handle(ws, q) {
    if (q.go) { var run = release(q.id); if (run) run(); return; }
    if (q.abort) { if (running[q.id]) running[q.id].abort(); return; }
    request(ws, q);
  }

  st.first = new Promise(function (done) {
    var blocked = false, misses = 0;
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
      try { ws = new WebSocket("ws://127.0.0.1:" + c.port + "/relay?s=" + encodeURIComponent(c.site) + "&n=" + encodeURIComponent(c.name) + (c.ro ? "&ro=1" : "") + "&v=" + c.v + "&k=" + c.k); }
      catch (e) { st.connecting = false; return done(blocked ? CSP : "NO_BRIDGE: the browser refused the connection to 127.0.0.1 (" + ((e && e.message) || e) + ")."); }
      st.ws = ws;
      ws.onopen = function () {
        st.open = st.ever = true; st.connecting = false; misses = 0;
        try { ws.send(JSON.stringify({ hello: location.href, v: c.v })); } catch (e) {}
        done("ATTACHED");
      };
      ws.onclose = function () {
        st.open = false;
        // Writes held for a go that can no longer come are dropped: they were never sent. Reads nobody can get the
        // answer of are stopped.
        Object.keys(held).forEach(release);
        Object.keys(running).forEach(function (k) { try { running[k].abort(); } catch (e) {} });
        if (st.stopped) return;
        // Keeps trying while the page lives, for a daemon restart. Not forever: 20 min of refusals means this relay
        // is not wanted any more (stopped bridge, or a daemon of another version).
        if (st.ever) { if (++misses <= 400) setTimeout(connect, 3000); return; }
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
export function relaySource(cfg: { version: number; port: number; origin: string; site: string; name: string; readOnly: boolean; key: string }): string {
  const c: Record<string, unknown> = { v: cfg.version, port: cfg.port, o: cfg.origin, site: cfg.site, name: cfg.name, k: cfg.key };
  if (cfg.readOnly) c.ro = 1;
  // One evaluate call: drop the indentation, keep the lines (no minifier at run time).
  return `(${tabRelay.toString().replace(/\n\s+/g, "\n")})(${JSON.stringify(c)})`;
}
