/**
 * Tab bridge daemon: lets Node scripts make requests with the login of a tab
 * that is already logged in, in any browser where one line of JS can run. No
 * cookie is read, exported or saved.
 *
 *   Node script --POST /fetch (bearer token)--> this daemon (127.0.0.1 only)
 *     --WebSocket--> relay in the tab (relay.ts) --same-site fetch--> the site
 *
 * Its own small process, on purpose: the shared iframer server holds the secret
 * that encrypts stored credentials, moves between ports and is replaced on
 * every version change (which stops running browsers). This one has its own
 * port, token and version, and a bug here cannot touch the other modes.
 *
 * Safety: 127.0.0.1 only. Every HTTP route needs the per-run token and refuses
 * requests that carry an Origin (a web page). A relay is accepted only with the
 * key minted for its site by `iframer bridge attach`, from an Origin of that
 * site (the browser sets it; a page can't fake it), and a request is forwarded
 * only to a tab of its own site. Requests pass through memory, nothing is kept.
 */
import crypto from "crypto";
import http from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { Bridge, timings, type Job, type Tab } from "./core";
import { BRIDGE_VERSION, covers, safeEqual, tabKey, validName, validSite } from "./state";

export interface ServerOptions {
  port: number;
  token: string;
  masterKey: string;
  /** Tests only: shrinks every wait. */
  scale?: number;
  /** Exit after this long with no tab attached and no request (default 30 min). */
  idleMs?: number;
  onIdle?: () => void;
}

const PING_MS = 20_000;
/** A reply or an upload, base64 in JSON. The relay caps bodies at 32 MB. */
const MAX_MESSAGE = 64 * 1024 * 1024;

export interface BridgeServer { port: number; bridge: Bridge; close(): Promise<void> }

export function startBridgeServer(o: ServerOptions): Promise<BridgeServer> {
  const scale = o.scale ?? 1;
  const bridge = new Bridge(timings(scale), covers);
  const sockets = new Map<WebSocket, { tab: Tab; pong: number }>();

  const send = (res: http.ServerResponse, code: number, body: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    // A web page always sends Origin on these requests and scripts never do. Host stops DNS rebinding.
    const host = String(req.headers.host || "");
    if (req.headers.origin !== undefined || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, { error: "forbidden" });
    if (!safeEqual(String(req.headers.authorization || ""), `Bearer ${o.token}`)) return send(res, 401, { error: "bad token" });
    if (req.method === "GET" && req.url === "/status") return send(res, 200, { pid: process.pid, v: BRIDGE_VERSION, ...bridge.status() });
    if (req.method !== "POST") return send(res, 404, { error: "not found" });
    if (req.url === "/shutdown") { res.on("finish", () => o.onIdle?.()); send(res, 200, { ok: true }); return; }
    if (req.url !== "/fetch" && req.url !== "/probe") return send(res, 404, { error: "not found" });

    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_MESSAGE) { send(res, 413, { error: "request too large for the tab bridge (64 MB)" }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      let q: { url?: string; method?: string; headers?: Record<string, string>; body?: string | null; body64?: string | null; redirect?: string; tab?: string; auth?: Record<string, unknown> };
      try { q = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { error: "bad json" }); }
      if (!q || typeof q.url !== "string") return send(res, 400, { error: "url is required" });
      const name = q.tab || "default";
      if (!validName(name)) return send(res, 400, { error: "bad tab name" });
      const route = bridge.route(q.url, name);
      if (req.url === "/probe") return send(res, 200, "none" in route ? { attached: false, why: route.none, detachedMs: route.detachedMs } : { attached: true, site: route.site });
      // 503 = nothing attached for this site: the caller uses its other way (saved session).
      if ("none" in route) return send(res, 503, { error: route.none, detachedMs: route.detachedMs });
      const job: Job = { url: q.url, method: String(q.method || "GET").toUpperCase(), headers: q.headers || {}, body: q.body ?? null, body64: q.body64 ?? null, redirect: q.redirect, ...(q.auth && typeof q.auth === "object" ? { auth: q.auth } : {}) };
      const id = bridge.request(route, job, (reply) => { if (reply) send(res, 200, reply); });
      res.on("close", () => bridge.cancel(id));
    });
  });

  server.on("clientError", (_e, sock) => { try { sock.destroy(); } catch { /* gone */ } });

  // ── Relays: one WebSocket per attached tab ────────────────────────────────
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  server.on("upgrade", (req, sock, head) => {
    // A refused page may reset the connection: without a listener that error would end the whole daemon.
    sock.on("error", () => { /* this socket only */ });
    let u: URL;
    try { u = new URL(req.url || "", "http://127.0.0.1"); } catch { sock.destroy(); return; }
    const site = u.searchParams.get("s") || "", name = u.searchParams.get("n") || "default", readOnly = u.searchParams.get("ro") === "1";
    const origin = String(req.headers.origin || "");
    const ok = u.pathname === "/relay" && validSite(site) && validName(name)
      && safeEqual(u.searchParams.get("k") || "", tabKey(o.masterKey, site, name, readOnly))
      && covers(site, origin);
    if (!ok) { sock.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    wss.handleUpgrade(req, sock, head, (ws) => {
      const tab: Tab = {
        id: crypto.randomUUID(), site, name, readOnly, url: origin, since: Date.now(), stalled: 0, probed: 0,
        send: (m) => ws.send(JSON.stringify(m)),
      };
      sockets.set(ws, { tab, pong: Date.now() });
      // Never kick an older tab of the same site out: all stay, the newest answers.
      bridge.attach(tab);
      ws.on("message", (data) => {
        let m: unknown;
        try { m = JSON.parse(String(data)); } catch { return; }
        if (m && typeof m === "object") bridge.message(tab, m as Record<string, unknown>);
      });
      ws.on("pong", () => { const s = sockets.get(ws); if (s) s.pong = Date.now(); });
      const gone = () => { if (sockets.delete(ws)) bridge.detach(tab); };
      ws.on("close", gone);
      ws.on("error", gone);
    });
  });

  // Heartbeat: browsers answer WebSocket pings by themselves, so this only finds sockets whose tab is gone (it says
  // nothing about a frozen page: that is what the receipt is for). A late tick means this process was paused (the
  // computer slept): give every tab a fresh chance instead of dropping live ones on wake.
  let lastTick = Date.now();
  const heartbeat = setInterval(() => {
    const now = Date.now(), paused = now - lastTick > PING_MS * 2;
    lastTick = now;
    for (const [ws, s] of sockets) {
      if (paused) s.pong = now;
      if (now - s.pong > PING_MS * 2.5) { ws.terminate(); continue; }
      try { ws.ping(); } catch { /* the close handler cleans up */ }
    }
  }, PING_MS);
  heartbeat.unref();

  const idleMs = o.idleMs ?? 30 * 60_000;
  const idle = setInterval(() => {
    if (!bridge.tabCount() && !bridge.pending() && Date.now() - bridge.lastUse > idleMs) o.onIdle?.();
  }, Math.min(60_000, Math.max(50, idleMs / 4)));
  idle.unref();

  const close = () => new Promise<void>((done) => {
    clearInterval(heartbeat); clearInterval(idle);
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
      ok({ port: typeof addr === "object" && addr ? addr.port : o.port, bridge, close });
    });
  });
}
