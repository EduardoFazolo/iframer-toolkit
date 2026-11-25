const importMetaUrl = require('node:url').pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/tabbridge/server-main.ts
var import_crypto3 = __toESM(require("crypto"));
var import_fs2 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));

// src/lib/paths.ts
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}

// src/lib/tabbridge/server.ts
var import_crypto2 = __toESM(require("crypto"));
var import_http = __toESM(require("http"));
var import_ws = require("ws");

// src/lib/tabbridge/core.ts
function timings(scale2 = 1) {
  return { ackMs: 5e3 * scale2, tryMs: 25e3 * scale2, writeMs: 6e4 * scale2, probeMs: 3e4 * scale2, queueMs: 6e4 * scale2 };
}
var MAX_TABS = 3;
var MAX_ACTIVE = 4;
var isRead = (method) => method === "GET" || method === "HEAD";
var poolKey = (site, name) => `${site}
${name}`;
var secs = (ms) => {
  const s = ms / 1e3;
  return s >= 1 ? String(Math.round(s)) : String(s);
};
var Bridge = class {
  constructor(t = timings(), covers2 = () => false, now = () => Date.now()) {
    this.t = t;
    this.covers = covers2;
    this.now = now;
    this.lastUse = this.now();
  }
  t;
  covers;
  now;
  pools = /* @__PURE__ */ new Map();
  // site + name -> attached tabs, newest last
  waiting = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  // site -> reads in flight
  line = /* @__PURE__ */ new Map();
  // site -> ids of reads waiting for a free slot, oldest first
  gone = /* @__PURE__ */ new Map();
  // site + name -> when its last tab detached
  seq = 0;
  /** When a tab was last attached or a request last arrived (the daemon's idle exit reads it). */
  lastUse;
  // ── Tabs ────────────────────────────────────────────────────────────────
  attach(tab) {
    const key = poolKey(tab.site, tab.name);
    const list = this.pools.get(key) ?? [];
    list.push(tab);
    this.pools.set(key, list);
    this.gone.delete(key);
    this.lastUse = this.now();
  }
  detach(tab) {
    const key = poolKey(tab.site, tab.name);
    const all = this.pools.get(key) ?? [];
    if (!all.includes(tab)) return;
    const left = all.filter((x) => x !== tab);
    if (left.length) this.pools.set(key, left);
    else {
      this.pools.delete(key);
      this.gone.set(key, this.now());
    }
    for (const [id, w] of this.waiting) {
      if (w.tab !== tab.id) continue;
      w.last = `the ${w.site} tab closed before answering`;
      if (w.read) this.dispatch(id, w);
      else if (w.released) this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
    }
  }
  /** A message from the relay in a tab. Any message means the page's own code runs: the tab is alive. */
  message(tab, m) {
    tab.stalled = 0;
    if (typeof m.hello === "string") {
      tab.url = m.hello;
      return;
    }
    const id = typeof m.id === "string" ? m.id : "";
    const w = this.waiting.get(id);
    if (!w || w.tab !== tab.id) return;
    if (m.ack) {
      if (w.acked) return;
      w.acked = true;
      clearTimeout(w.timer);
      if (!w.read) {
        try {
          tab.send({ id, go: 1 });
        } catch {
          return this.finish(id, w, { error: `the ${w.site} tab closed before the write was released. The write was not sent`, dead: true });
        }
        w.released = true;
      }
      const ms = w.read ? this.t.tryMs : this.t.writeMs;
      w.timer = setTimeout(() => {
        tab.stalled = tab.probed = this.now();
        w.last = `the ${w.site} tab did not answer in ${secs(ms)} s`;
        if (w.read) {
          this.letGo(tab, id);
          this.dispatch(id, w);
        } else this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      }, ms);
      return;
    }
    if (m.expired) {
      w.last = `the ${w.site} tab was frozen and dropped the request`;
      if (w.read) this.dispatch(id, w);
      else if (w.released) this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      return;
    }
    const err = typeof m.error === "string" ? m.error : "";
    if (err && m.net) {
      w.last = `the ${w.site} tab could not reach ${w.site} (${err})`;
      if (w.read) this.dispatch(id, w);
      else if (w.released) this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      return;
    }
    const { id: _id, ack: _ack, expired: _expired, unsent: _unsent, net: _net, ...reply } = m;
    if (!w.read && err && w.released && !m.unsent) reply.maybeSent = true;
    this.finish(id, w, reply);
  }
  /** A read is leaving this tab for another one: stop it here, so it does not keep running on the site next to its retry. */
  letGo(tab, id) {
    try {
      tab.send({ id, abort: 1 });
    } catch {
    }
  }
  // ── Requests ────────────────────────────────────────────────────────────
  /** The attached site that owns this URL (the most specific one), for tabs with this name. */
  route(url, name = "default") {
    let best = "";
    for (const key of this.pools.keys()) {
      const [site, n] = key.split("\n");
      if (n === name && this.covers(site, url) && site.length > best.length) best = site;
    }
    if (best) return { site: best, pool: poolKey(best, name) };
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
    }
    const others = [...this.pools.keys()].map((k) => k.split("\n")).filter(([site]) => this.covers(site, url)).map(([, n]) => n);
    if (others.length) return { none: `no tab named "${name}" is attached for ${host} (attached: ${[...new Set(others)].join(", ")})` };
    let detached;
    for (const [key, at] of this.gone) {
      const [site, n] = key.split("\n");
      if (n === name && this.covers(site, url)) detached = Math.max(detached ?? 0, at);
    }
    return detached === void 0 ? { none: `no tab attached for ${host}` } : { none: `the ${host} tab detached ${Math.round((this.now() - detached) / 6e4)} min ago (page reloaded, navigated or closed)`, detachedMs: this.now() - detached };
  }
  /** Starts a request. `done` gets the reply, or null after cancel(). Returns the id for cancel(). */
  request(route, job, done) {
    const id = `${(++this.seq).toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const w = { done, site: route.site, pool: route.pool, job, read: isRead(job.method), acked: false, released: false, cancelled: false, tried: /* @__PURE__ */ new Set(), last: "", active: false };
    this.waiting.set(id, w);
    this.lastUse = this.now();
    this.run(id, w);
    return id;
  }
  /**
   * The script went away (killed, timed out). A read waiting in line just leaves. A read already in a tab is aborted
   * there and keeps its slot until the tab answers (or goes away, or its timer runs out): freeing it at once would put
   * a fifth request on the site while the cancelled one still runs. A write is never cut off: it only stops waiting.
   */
  cancel(id) {
    const w = this.waiting.get(id);
    if (!w) return;
    const tab = w.tab ? (this.pools.get(w.pool) ?? []).find((x) => x.id === w.tab) : void 0;
    if (!w.read || !w.active || !tab) return this.finish(id, w, null);
    w.cancelled = true;
    w.done = () => {
    };
    try {
      tab.send({ id, abort: 1 });
    } catch {
      this.finish(id, w, null);
    }
  }
  finish(id, w, reply) {
    clearTimeout(w.timer);
    this.waiting.delete(id);
    if (reply && w.tried.size) reply.handed = true;
    w.done(reply);
    const waitingLine = this.line.get(w.site);
    if (!w.active) {
      if (waitingLine?.includes(id)) this.line.set(w.site, waitingLine.filter((x) => x !== id));
      return;
    }
    w.active = false;
    this.active.set(w.site, (this.active.get(w.site) ?? 1) - 1);
    for (let next = waitingLine?.shift(); next; next = waitingLine?.shift()) {
      const n = this.waiting.get(next);
      if (n) {
        this.run(next, n);
        break;
      }
    }
  }
  /** Start a job now, or put a read in line when MAX_ACTIVE of its site are in flight. */
  run(id, w) {
    clearTimeout(w.timer);
    if (!w.read) return this.dispatch(id, w);
    if ((this.active.get(w.site) ?? 0) < MAX_ACTIVE) {
      w.active = true;
      this.active.set(w.site, (this.active.get(w.site) ?? 0) + 1);
      return this.dispatch(id, w);
    }
    this.line.set(w.site, [...this.line.get(w.site) ?? [], id]);
    w.timer = setTimeout(() => this.finish(id, w, { error: `${this.line.get(w.site)?.length ?? 0} requests were waiting for ${w.site} for ${secs(this.t.queueMs)} s`, busy: true }), this.t.queueMs);
  }
  /**
   * Send a job to the newest tab of its site that is answering and that it has
   * not tried yet. No tab to try = `dead`, at once.
   */
  dispatch(id, w) {
    clearTimeout(w.timer);
    if (w.cancelled) return this.finish(id, w, null);
    const now = this.now();
    const all = this.pools.get(w.pool) ?? [];
    const usable = all.filter((x) => w.read || !x.readOnly);
    if (!w.read && all.some((x) => x.readOnly)) {
      return this.finish(id, w, { error: `a ${w.site} tab is attached read-only, so ${w.job.method} is refused. Attach again without --read-only (and close the read-only tab) to allow writes` });
    }
    const open = w.tried.size >= MAX_TABS ? [] : [...usable].reverse().filter((x) => !w.tried.has(x.id));
    const lastProbe = Math.max(0, ...all.map((x) => x.probed));
    const probe = w.read && !w.tried.size && now - lastProbe >= this.t.probeMs ? open.filter((x) => x.stalled).sort((a, b) => a.probed - b.probed)[0] : void 0;
    const tab = open.find((x) => !x.stalled) ?? probe;
    if (!tab) {
      const why = w.last || (all.length ? `none of the ${all.length} attached ${w.site} tabs is answering` : `no live ${w.site} tab`);
      return this.finish(id, w, { error: why, dead: true });
    }
    if (tab.stalled) tab.probed = now;
    w.tab = tab.id;
    w.acked = false;
    w.released = false;
    w.tried.add(tab.id);
    const notAfter = Date.now() + Math.round(this.t.ackMs * 0.8);
    w.timer = setTimeout(() => {
      setImmediate(() => {
        if (this.waiting.get(id) !== w || w.tab !== tab.id || w.acked) return;
        tab.stalled = tab.probed = this.now();
        w.last = `the ${w.site} tab did not confirm the request in ${secs(this.t.ackMs)} s (frozen in the background?)`;
        if (w.read) {
          this.letGo(tab, id);
          this.dispatch(id, w);
        } else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      });
    }, this.t.ackMs);
    try {
      tab.send({ id, ...w.job, notAfter });
    } catch {
      clearTimeout(w.timer);
      w.last = `the ${w.site} tab closed before the request was sent`;
      if (w.read) this.dispatch(id, w);
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
    }
  }
  // ── Status ──────────────────────────────────────────────────────────────
  tabCount() {
    let n = 0;
    for (const l of this.pools.values()) n += l.length;
    return n;
  }
  pending() {
    return this.waiting.size;
  }
  status() {
    return {
      tabs: [...this.pools.values()].flatMap((l) => l.map((x) => ({ site: x.site, name: x.name, url: x.url, since: x.since, stalled: !!x.stalled, readOnly: x.readOnly }))),
      detached: [...this.gone].map(([key, at]) => {
        const [site, name] = key.split("\n");
        return { site, name, at };
      })
    };
  }
};

// src/lib/tabbridge/state.ts
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var BRIDGE_VERSION = 4;
var DEFAULT_PORT = 47625;
var bridgePort = () => Number(process.env.IFRAMER_BRIDGE_PORT) || DEFAULT_PORT;
var stateFile = () => import_path2.default.join(getDataDir(), "bridge.json");
var keyFile = () => import_path2.default.join(getDataDir(), "bridge.key");
function readState() {
  try {
    const st = JSON.parse(import_fs.default.readFileSync(stateFile(), "utf8"));
    return st && st.port && st.token && st.pid ? st : null;
  } catch {
    return null;
  }
}
function writeState(st) {
  import_fs.default.mkdirSync(getDataDir(), { recursive: true, mode: 448 });
  import_fs.default.writeFileSync(stateFile(), JSON.stringify(st), { mode: 384 });
  try {
    import_fs.default.chmodSync(stateFile(), 384);
  } catch {
  }
}
function clearState(pid) {
  try {
    if (readState()?.pid === pid) import_fs.default.rmSync(stateFile());
  } catch {
  }
}
function masterKey() {
  import_fs.default.mkdirSync(getDataDir(), { recursive: true, mode: 448 });
  try {
    const k2 = import_fs.default.readFileSync(keyFile(), "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(k2)) return k2;
  } catch {
  }
  const k = import_crypto.default.randomBytes(32).toString("hex");
  import_fs.default.writeFileSync(keyFile(), k, { mode: 384 });
  try {
    import_fs.default.chmodSync(keyFile(), 384);
  } catch {
  }
  return k;
}
function tabKey(master, origin, site, name, readOnly) {
  return import_crypto.default.createHmac("sha256", master).update(`${origin.toLowerCase()}
${site}
${name}
${readOnly ? "ro" : "rw"}`).digest("hex").slice(0, 32);
}
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && import_crypto.default.timingSafeEqual(x, y);
}
var LOOPBACK = /^(127\.0\.0\.1|localhost)$/;
var IP = /^\d{1,3}(\.\d{1,3}){3}$/;
var SHARED_SUFFIXES = /* @__PURE__ */ new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "com.br",
  "net.br",
  "org.br",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.in",
  "co.kr",
  "co.za",
  "com.mx",
  "com.ar",
  "com.co",
  "com.tr",
  "com.cn",
  "com.hk",
  "com.sg",
  "com.tw",
  "co.il",
  "co.id",
  "com.my",
  "com.ph",
  "github.io",
  "gitlab.io",
  "vercel.app",
  "netlify.app",
  "herokuapp.com",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "appspot.com",
  "cloudfront.net",
  "amazonaws.com",
  "azurewebsites.net",
  "onrender.com",
  "fly.dev",
  "glitch.me",
  "repl.co",
  "blogspot.com",
  "wordpress.com",
  "ngrok.io",
  "ngrok-free.app",
  "trycloudflare.com",
  "s3.amazonaws.com",
  "myshopify.com",
  "webflow.io",
  "framer.app",
  "lovable.app"
]);
function validSite(site) {
  const [host, port, extra] = site.split(":");
  if (extra !== void 0 || port !== void 0 && !/^\d{1,5}$/.test(port)) return false;
  if (LOOPBACK.test(host)) return true;
  if (SHARED_SUFFIXES.has(host)) return false;
  if (/^(co|com|net|org|gov|edu|ac|or|ne|go|mil|nom|gob|sch)\.[a-z]{2}$/.test(host)) return false;
  return port === void 0 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) && !IP.test(host);
}
var validName = (name) => /^[A-Za-z0-9_.-]{1,40}$/.test(name);
function covers(site, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const [host, port] = site.split(":");
  const loop = LOOPBACK.test(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loop)) return false;
  if (port !== void 0 && u.port !== port) return false;
  if (u.hostname === host) return true;
  return !loop && !IP.test(host) && u.hostname.endsWith("." + host);
}

// src/lib/tabbridge/server.ts
var PING_MS = 2e4;
var MAX_MESSAGE = 64 * 1024 * 1024;
function startBridgeServer(o) {
  const scale2 = o.scale ?? 1;
  const bridge = new Bridge(timings(scale2), covers);
  const sockets = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Map();
  let oldRelayAt = 0;
  const send = (res, code, body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const server = import_http.default.createServer((req, res) => {
    const host = String(req.headers.host || "");
    if (req.headers.origin !== void 0 || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, { error: "forbidden" });
    if (!safeEqual(String(req.headers.authorization || ""), `Bearer ${o.token}`)) return send(res, 401, { error: "bad token" });
    if (req.method === "GET" && req.url === "/status") return send(res, 200, { pid: process.pid, v: BRIDGE_VERSION, ...bridge.status(), ...oldRelayAt ? { oldRelayMs: Date.now() - oldRelayAt } : {} });
    if (req.method !== "POST") return send(res, 404, { error: "not found" });
    if (req.url === "/shutdown") {
      res.on("finish", () => o.onIdle?.());
      send(res, 200, { ok: true });
      return;
    }
    if (req.url !== "/fetch" && req.url !== "/probe") return send(res, 404, { error: "not found" });
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_MESSAGE) {
        send(res, 413, { error: "request too large for the tab bridge (64 MB)" });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      let q;
      try {
        q = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(res, 400, { error: "bad json" });
      }
      if (!q || typeof q.url !== "string") return send(res, 400, { error: "url is required" });
      const name = q.tab || "default";
      if (!validName(name)) return send(res, 400, { error: "bad tab name" });
      const route = bridge.route(q.url, name);
      if (req.url === "/probe") return send(res, 200, "none" in route ? { attached: false, why: route.none, detachedMs: route.detachedMs } : { attached: true, site: route.site });
      if (typeof q.rid === "string" && q.rid && seen.has(q.rid)) {
        return send(res, 409, { error: "this request was already received once (the client re-sent it after its connection dropped)", duplicate: true, handed: true });
      }
      if ("none" in route) return send(res, 503, { error: route.none, detachedMs: route.detachedMs });
      if (typeof q.rid === "string" && q.rid) {
        const now = Date.now();
        for (const [k, at] of seen) if (now - at > 3e5) seen.delete(k);
        seen.set(q.rid, now);
      }
      const job = { url: q.url, method: String(q.method || "GET").toUpperCase(), headers: q.headers || {}, body: q.body ?? null, body64: q.body64 ?? null, redirect: q.redirect, ...q.auth && typeof q.auth === "object" ? { auth: q.auth } : {} };
      const id = bridge.request(route, job, (reply) => {
        if (reply) send(res, 200, reply);
      });
      res.on("close", () => bridge.cancel(id));
    });
  });
  server.on("clientError", (_e, sock) => {
    try {
      sock.destroy();
    } catch {
    }
  });
  const wss = new import_ws.WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  server.on("upgrade", (req, sock, head) => {
    sock.on("error", () => {
    });
    let u;
    try {
      u = new URL(req.url || "", "http://127.0.0.1");
    } catch {
      sock.destroy();
      return;
    }
    const site = u.searchParams.get("s") || "", name = u.searchParams.get("n") || "default", readOnly = u.searchParams.get("ro") === "1";
    const origin = String(req.headers.origin || "");
    const current = u.searchParams.get("v") === String(BRIDGE_VERSION);
    if (u.pathname === "/relay" && !current && covers(site, origin)) oldRelayAt = Date.now();
    const ok = u.pathname === "/relay" && current && validSite(site) && validName(name) && covers(site, origin) && safeEqual(u.searchParams.get("k") || "", tabKey(o.masterKey, origin, site, name, readOnly));
    if (!ok) {
      sock.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, sock, head, (ws) => {
      const tab = {
        id: import_crypto2.default.randomUUID(),
        site,
        name,
        readOnly,
        url: origin,
        since: Date.now(),
        stalled: 0,
        probed: 0,
        send: (m) => ws.send(JSON.stringify(m))
      };
      sockets.set(ws, { tab, pong: Date.now() });
      bridge.attach(tab);
      ws.on("message", (data) => {
        let m;
        try {
          m = JSON.parse(String(data));
        } catch {
          return;
        }
        if (m && typeof m === "object") bridge.message(tab, m);
      });
      ws.on("pong", () => {
        const s = sockets.get(ws);
        if (s) s.pong = Date.now();
      });
      const gone = () => {
        if (sockets.delete(ws)) bridge.detach(tab);
      };
      ws.on("close", gone);
      ws.on("error", gone);
    });
  });
  let lastTick = Date.now();
  const heartbeat = setInterval(() => {
    const now = Date.now(), paused = now - lastTick > PING_MS * 2;
    lastTick = now;
    for (const [ws, s] of sockets) {
      if (paused) s.pong = now;
      if (now - s.pong > PING_MS * 2.5) {
        ws.terminate();
        continue;
      }
      try {
        ws.ping();
      } catch {
      }
    }
  }, PING_MS);
  heartbeat.unref();
  const idleMs2 = o.idleMs ?? 30 * 6e4;
  const idle = setInterval(() => {
    if (!bridge.tabCount() && !bridge.pending() && Date.now() - bridge.lastUse > idleMs2) o.onIdle?.();
  }, Math.min(6e4, Math.max(50, idleMs2 / 4)));
  idle.unref();
  const close2 = () => new Promise((done) => {
    clearInterval(heartbeat);
    clearInterval(idle);
    for (const ws of sockets.keys()) ws.terminate();
    wss.close();
    server.close(() => done());
    server.closeAllConnections?.();
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(o.port, "127.0.0.1", () => {
      server.removeListener("error", fail);
      const addr = server.address();
      ok({ port: typeof addr === "object" && addr ? addr.port : o.port, bridge, close: close2 });
    });
  });
}

// src/lib/tabbridge/server-main.ts
var token = import_crypto3.default.randomBytes(24).toString("hex");
var scale = Number(process.env.IFRAMER_BRIDGE_TIME_SCALE) || 1;
var idleMs = Number(process.env.IFRAMER_BRIDGE_IDLE_MS) || void 0;
var closing = false;
var close;
var bye = () => {
  if (closing) return;
  closing = true;
  clearState(process.pid);
  const hard = setTimeout(() => process.exit(0), 2e3);
  hard.unref();
  Promise.resolve(close?.()).finally(() => process.exit(0));
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
var crash = (e) => {
  try {
    import_fs2.default.appendFileSync(import_path3.default.join(getDataDir(), "bridge.log"), `${(/* @__PURE__ */ new Date()).toISOString()} v${BRIDGE_VERSION} ${e?.stack || e}
`);
  } catch {
  }
  bye();
};
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);
startBridgeServer({ port: bridgePort(), token, masterKey: masterKey(), scale, idleMs, onIdle: bye }).then(
  (s) => {
    close = s.close;
    writeState({ port: s.port, token, pid: process.pid, started: (/* @__PURE__ */ new Date()).toISOString(), v: BRIDGE_VERSION });
  },
  (e) => {
    console.error(`iframer bridge: ${e.message}`);
    process.exit(1);
  }
);
