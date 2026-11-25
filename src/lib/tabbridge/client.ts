// @ts-nocheck
/**
 * Tab bridge client for Node scripts: send a request through the logged-in tab
 * of its site. Inlined into every generated client.mjs and written as a
 * standalone module by `iframer bridge client`.
 *
 * fetch(url, init) resolves to null when the bridge can't take the request
 * (daemon not running, no tab attached for that site, IFRAMER_BRIDGE=off): the
 * caller then uses its other way (saved session), so nothing that works today
 * breaks.
 *
 * One session per host per run. The first request to a host decides: through
 * the tab, or the caller's own way. It never changes after that, so a run can't
 * start on one account and continue on another. A host on the tab whose tab
 * goes away gets an error, not a quiet fallback; a host that started on its
 * saved session stays there even if a tab is attached later.
 *
 * A write is never sent twice. null for a write means it certainly did not
 * leave this process. Once it may have left, every failure is thrown with
 * "may have reached the site".
 *
 * Serialized with Function.prototype.toString, so it must stay self-contained
 * plain JavaScript: no imports, no outer variables, no TypeScript syntax.
 * d: { fs, path, home, env, fetch, auth? } (auth: header name -> where the page keeps it; the tab fills those in)
 */
export function tabBridgeClient(d) {
  // Longer than the daemon's own limits (60 s in line + 3 tabs for a read, 65 s for a write), so the daemon's error wins.
  var WAIT_MS = 150000;
  var down = false, skipped = "", hinted = false;
  var mode = {}; // host -> "tab" | "direct"
  var env = d.env || {};

  function fail(msg) { return new Error("stopped: tab bridge: " + msg); }
  function hostOf(url) { try { return new URL(url).host; } catch (e) { return String(url); } }
  function attachCmd(url) { return "iframer bridge attach " + hostOf(url); }
  var MAYBE = "A write may have reached the site: check it, never re-send it blindly";

  // The daemon's port and token. A missing file or a dead pid is remembered for the whole run: no retries, no waiting
  // (a closed port takes about 2 s to refuse on Windows).
  function state() {
    if (env.IFRAMER_BRIDGE === "off") { skipped = "IFRAMER_BRIDGE=off"; return null; }
    if (down) return null;
    try {
      var st = JSON.parse(d.fs.readFileSync(d.path.join(env.IFRAMER_DATA_DIR || d.path.join(d.home, ".iframer"), "bridge.json"), "utf8"));
      if (!st || !st.port || !st.token) throw new Error("empty");
      try { process.kill(st.pid, 0); } catch (e) { if (e.code !== "EPERM") throw e; }
      return st;
    } catch (e) { down = true; skipped = "the tab bridge is not running"; return null; }
  }

  function post(st, route, body, ms) {
    return d.fetch("http://127.0.0.1:" + st.port + route, {
      method: "POST", headers: { Authorization: "Bearer " + st.token, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
    });
  }

  // No tab can take this request, and it did not leave this process. A host that never used a tab goes its own way
  // for the rest of the run (null). A host that was on the tab gets an error: no switching sessions half-way.
  function none(url, why, detachedMs) {
    var h = hostOf(url);
    skipped = why;
    if (mode[h] === "tab") throw fail(why + ". This run was using the tab for " + h + ": attach it again (`" + attachCmd(url) + "`, then the line it prints), then run again");
    mode[h] = "direct";
    if (detachedMs != null && !hinted) {
      hinted = true;
      console.error("tab bridge: " + why + ", so this run uses the saved session. To use the tab again: `" + attachCmd(url) + "`, then the line it prints.");
    }
    return null;
  }
  function settled(f) { try { return Promise.resolve(f()); } catch (e) { return Promise.reject(e); } }

  function response(r, method) {
    // A redirect that was not followed is opaque in the tab (status 0); report it as a 302 so callers see "redirected".
    var status = r.type === "opaqueredirect" || !r.status ? 302 : r.status;
    var empty = status === 204 || status === 205 || status === 304 || method === "HEAD";
    var headers = new Headers();
    Object.keys(r.headers || {}).forEach(function (k) {
      // The tab already decoded the body.
      if (/^content-(encoding|length)$/i.test(k)) return;
      try { headers.set(k, r.headers[k]); } catch (e) {}
    });
    var res = new Response(empty ? null : Buffer.from(r.body64 || "", "base64"), { status: status, headers: headers });
    try {
      Object.defineProperty(res, "url", { value: r.url || "" });
      Object.defineProperty(res, "redirected", { value: !!r.redirected });
    } catch (e) {}
    return res;
  }

  /** True when a tab is attached for this URL's site (so no saved session is needed). */
  function attached(url) {
    var st = state();
    if (!st) return Promise.resolve(false);
    var body = { url: String(url) };
    if (env.IFRAMER_BRIDGE_TAB) body.tab = env.IFRAMER_BRIDGE_TAB;
    return post(st, "/probe", body, 5000).then(function (res) { return res.json(); }).then(
      function (r) { if (!r.attached && r.why) skipped = r.why; return !!r.attached; },
      function () { down = true; skipped = "the tab bridge is not running"; return false; });
  }

  function bridgeFetch(url, init) {
    init = init || {};
    url = String(url);
    var h = hostOf(url);
    if (mode[h] === "direct") return Promise.resolve(null);
    var st = state();
    if (!st) return settled(function () { return none(url, skipped); });
    var method = String(init.method || "GET").toUpperCase(), read = method === "GET" || method === "HEAD";
    var headers = {};
    var src = init.headers || {};
    var each = typeof src.forEach === "function" && !Array.isArray(src)
      ? function (f) { src.forEach(function (v, k) { f(k, v); }); }
      : function (f) { (Array.isArray(src) ? src : Object.keys(src).map(function (k) { return [k, src[k]]; })).forEach(function (p) { f(p[0], p[1]); }); };
    // The tab sends its own cookies: the saved one never leaves this script.
    each(function (k, v) { if (String(k).toLowerCase() !== "cookie" && v != null) headers[k] = String(v); });
    var job = { url: url, method: method, headers: headers };
    if (init.redirect) job.redirect = init.redirect;
    if (env.IFRAMER_BRIDGE_TAB) job.tab = env.IFRAMER_BRIDGE_TAB;
    if (d.auth && Object.keys(d.auth).length) job.auth = d.auth;
    var b = init.body;
    if (b != null && !read) {
      if (typeof b === "string") job.body = b;
      else if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) {
        job.body = b.toString();
        if (!Object.keys(headers).some(function (k) { return k.toLowerCase() === "content-type"; })) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }
      else if (b instanceof ArrayBuffer) job.body64 = Buffer.from(b).toString("base64");
      else if (ArrayBuffer.isView(b)) job.body64 = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("base64");
      else {
        // A body the tab can't carry (a stream, FormData). Only a problem when a tab would take this request.
        return attached(url).then(function (on) {
          if (!on) return none(url, skipped || "no tab attached");
          throw fail("this request body can't go through the tab (send a string or bytes, not a stream or FormData). Not sent");
        });
      }
    }
    var dropped = "the connection to the tab bridge dropped while the request was out";
    return post(st, "/fetch", job, WAIT_MS).then(function (res) {
      return res.json().then(function (j) { return j; }, function () {
        // The daemon took the request and the answer was cut off: a write may be on the site already.
        if (!read && res.status === 200) throw fail(dropped + ". " + MAYBE);
        return { error: "bridge HTTP " + res.status };
      }).then(function (r) {
        // 503, 401, 403: refused before anything was sent to a tab.
        if (res.status === 503) return none(url, r.error || "no tab attached", r.detachedMs);
        if (res.status === 401 || res.status === 403) return none(url, "the tab bridge restarted (" + (r.error || res.status) + ")");
        if (r.dead) {
          throw fail(r.error + ". No live tab for " + h + ": attach a fresh one (`" + attachCmd(url) + "`, then the line it prints), then "
            + (r.maybeSent ? "re-read before anything else. " + MAYBE : "run again"));
        }
        if (r.busy) throw fail(r.error + ". Other scripts are using this site's tab: let them finish, then run again once");
        if (!res.ok || r.error) throw fail((r.error || "HTTP " + res.status) + ". Not retried");
        mode[h] = "tab";
        return response(r, method);
      });
    }, function (e) {
      if (e && e.name === "TimeoutError") throw fail("no answer in " + WAIT_MS / 1000 + " s for " + h + ". Restart it: `iframer bridge stop`, then attach again" + (read ? "" : ". " + MAYBE));
      down = true;
      // Refused at connect: nothing was sent. Anything else happened with the request already out.
      var code = String((e && (e.code || (e.cause && e.cause.code))) || "");
      var never = /ECONNREFUSED|ConnectionRefused|ENOTFOUND|EADDRNOTAVAIL|UND_ERR_CONNECT_TIMEOUT/.test(code);
      if (!read && !never) throw fail(dropped + ". " + MAYBE);
      return none(url, "the tab bridge is not running");
    });
  }

  return {
    fetch: bridgeFetch,
    attached: attached,
    /** True once a request of this run went through a tab. */
    used: function () { return Object.keys(mode).some(function (k) { return mode[k] === "tab"; }); },
    /** Why the last request did not go through a tab. */
    skipped: function () { return skipped; },
  };
}

/** A standalone ES module for any Node script (written by `iframer bridge client`). */
export function clientModuleSource(): string {
  return [
    `// iframer tab bridge client. Generated by \`iframer bridge client\`: don't edit, run it again after updating iframer.`,
    `// Sends a request through the logged-in browser tab attached with \`iframer bridge attach <host>\`: the tab does the`,
    `// fetch with its own login. No cookie leaves the browser, nothing is exported or saved.`,
    `//`,
    `//   import { bridgeFetch } from "./tab-bridge.mjs";`,
    `//   const res = (await bridgeFetch(url, init)) ?? (await fetch(url, initWithYourSavedSession));`,
    `//`,
    `// bridgeFetch resolves to a Response, or to null when no tab can take the request (bridge not running, no tab`,
    `// attached for that site, IFRAMER_BRIDGE=off): use your other way then. null always means the request did not leave`,
    `// this process, so falling back is safe for writes too. Every other problem is thrown ("stopped: tab bridge: ..."`,
    `// with the next step); when it says a write may have reached the site, check the site, never re-send blindly.`,
    `// One session per host per run: the first request to a host decides (tab, or your own way) and it never changes.`,
    `// A write never follows a redirect (status 302 comes back). A read that ends on another site is refused.`,
    `// Env: IFRAMER_BRIDGE=off, IFRAMER_BRIDGE_TAB=<name> (tabs attached with --name), IFRAMER_DATA_DIR.`,
    `import fs from "node:fs";`,
    `import os from "node:os";`,
    `import path from "node:path";`,
    ``,
    `const bridge = (${tabBridgeClient.toString()})({ fs, path, home: os.homedir(), env: process.env, fetch: globalThis.fetch });`,
    `export const bridgeFetch = bridge.fetch;`,
    `/** True when a tab is attached for this URL's site. */`,
    `export const tabAttached = bridge.attached;`,
    `/** Why the last request did not go through a tab. */`,
    `export const bridgeSkipped = bridge.skipped;`,
    ``,
  ].join("\n");
}
