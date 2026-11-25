// @ts-nocheck
/**
 * Tab bridge client for Node scripts: send a request through the logged-in tab
 * of its site. Inlined into every generated client.mjs and written as a
 * standalone module by `iframer bridge client`.
 *
 * fetch(url, init) resolves to null when the bridge can't take the request
 * (daemon not running, no tab attached for that site, IFRAMER_BRIDGE=off): the
 * caller then uses its other way (saved session), so nothing that works today
 * breaks. Once a request went through a tab, problems are thrown instead and
 * the run never falls back to another session half-way. A write is never sent
 * twice.
 *
 * Serialized with Function.prototype.toString, so it must stay self-contained
 * plain JavaScript: no imports, no outer variables, no TypeScript syntax.
 * d: { fs, path, home, env, fetch, auth? } (auth: header name -> where the page keeps it; the tab fills those in)
 */
export function tabBridgeClient(d) {
  // Longer than the daemon's own limits (60 s in line + 3 tabs for a read, 65 s for a write), so the daemon's error wins.
  var WAIT_MS = 150000;
  var down = false, used = false, skipped = "", hinted = false;
  var env = d.env || {};

  function fail(msg) { return new Error("stopped: tab bridge: " + msg); }
  function hostOf(url) { try { return new URL(url).host; } catch (e) { return String(url); } }
  function attachCmd(url) { return "iframer bridge attach " + hostOf(url); }

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

  // Nothing attached (or the bridge went away): null before any request used a tab, an error after.
  function none(url, why, detachedMs) {
    skipped = why;
    if (used) throw fail(why + ". This run was using the tab: attach it again (`" + attachCmd(url) + "`, then the line it prints), then run again");
    if (detachedMs != null && !hinted) {
      hinted = true;
      console.error("tab bridge: " + why + ", so this run uses the saved session. To use the tab again: `" + attachCmd(url) + "`, then the line it prints.");
    }
    return null;
  }

  function response(r, method) {
    // A manual redirect in the tab is opaque (status 0); report it as a 302 so callers see "redirected".
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

  function bridgeFetch(url, init) {
    init = init || {};
    url = String(url);
    var st = state();
    if (!st) { try { return Promise.resolve(none(url, skipped)); } catch (e) { return Promise.reject(e); } }
    var method = String(init.method || "GET").toUpperCase(), read = method === "GET" || method === "HEAD";
    var headers = {};
    var src = init.headers || {};
    var each = typeof src.forEach === "function" && !Array.isArray(src)
      ? function (f) { src.forEach(function (v, k) { f(k, v); }); }
      : function (f) { (Array.isArray(src) ? src : Object.keys(src).map(function (k) { return [k, src[k]]; })).forEach(function (p) { f(p[0], p[1]); }); };
    // The tab sends its own cookies: the saved one never leaves this script.
    each(function (k, v) { if (String(k).toLowerCase() !== "cookie" && v != null) headers[k] = String(v); });
    var job = { url: url, method: method, headers: headers, redirect: init.redirect || "follow" };
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
      else return Promise.reject(fail("this request body can't go through the tab (send a string or bytes, not a stream or FormData). Not sent"));
    }
    var late = read ? "" : ". A write may have reached the site: check it, never re-send it blindly";
    return post(st, "/fetch", job, WAIT_MS).then(function (res) {
      return res.json().then(function (j) { return j; }, function () { return { error: "bridge HTTP " + res.status }; }).then(function (r) {
        if (res.status === 503) return none(url, r.error || "no tab attached", r.detachedMs);
        if (res.status === 401 || res.status === 403) return none(url, "the tab bridge restarted (" + (r.error || res.status) + ")");
        if (r.dead) {
          throw fail(r.error + ". No live tab for " + hostOf(url) + ": attach a fresh one (`" + attachCmd(url) + "`, then the line it prints), then "
            + (r.maybeSent ? "re-read before anything else. A write may have reached the site: check it, never re-send it blindly" : "run again"));
        }
        if (r.busy) throw fail(r.error + ". Other scripts are using this site's tab: let them finish, then run again once");
        if (!res.ok || r.error) throw fail((r.error || "HTTP " + res.status) + ". Not retried");
        used = true;
        return response(r, method);
      });
    }, function (e) {
      if (e && e.name === "TimeoutError") throw fail("no answer in " + WAIT_MS / 1000 + " s for " + hostOf(url) + ". Restart it: `iframer bridge stop`, then attach again" + late);
      down = true;
      return none(url, "the tab bridge is not running");
    });
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

  return {
    fetch: bridgeFetch,
    attached: attached,
    /** True once a request of this run went through a tab. */
    used: function () { return used; },
    /** Why the last request did not go through a tab. */
    skipped: function () { return skipped; },
  };
}

/** A standalone ES module for any Node script (written by `iframer bridge client`). */
export function clientModuleSource(): string {
  return [
    `// iframer tab bridge client. Generated by \`iframer bridge client\`: don't edit, run it again after updating iframer.`,
    `// Sends a request through the logged-in browser tab attached with \`iframer bridge attach <host>\`: the tab does the`,
    `// fetch with its own login, no cookie is read or saved.`,
    `//`,
    `//   import { bridgeFetch } from "./tab-bridge.mjs";`,
    `//   const res = (await bridgeFetch(url, init)) ?? (await fetch(url, initWithYourSavedSession));`,
    `//`,
    `// bridgeFetch resolves to a Response, or to null when no tab can take the request (bridge not running, no tab`,
    `// attached for that site, IFRAMER_BRIDGE=off): use your other way then. Once a request went through a tab it throws`,
    `// instead ("stopped: tab bridge: ..." with the next step). A write is never sent twice.`,
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
