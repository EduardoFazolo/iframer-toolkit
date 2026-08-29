import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { extensionBridge, type CdpEvent } from "./bridge";
import { createLogger } from "../logger";

const log = createLogger("cdp-relay");

/**
 * Presents a CDP endpoint that patchright's `chromium.connectOverCDP` connects
 * to, backed by the browser extension's `chrome.debugger` session for one tab.
 *
 * This lets iframer's real pipeline (find/click/snapshot/navigate/capture) drive
 * the user's live tab. It's a faithful port of Playwright-MCP's extension relay:
 *
 *  - The relay answers a few BROWSER-level CDP methods itself (Browser.getVersion,
 *    Target.setAutoAttach → synthetic Target.attachedToTarget, Target.getTargetInfo).
 *  - Everything else is forwarded to chrome.debugger via the extension bridge.
 *  - The top-level page target gets a relay-invented sessionId ("pw-tab-1");
 *    it's stripped on the way down to chrome.debugger and re-applied on the way
 *    up. Child (iframe/worker) sessions keep their real chrome sessionIds.
 */
export class CdpRelay {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private pw: WebSocket | null = null;
  private port = 0;
  private readonly path = `/cdp/${randomUUID()}`;
  private readonly tabSessionId = "pw-tab-1";
  private targetInfo: Record<string, unknown> | null = null;
  private ownerClientId = "";
  // True only once addCdpListener succeeded — stop() must not remove a
  // listener that belongs to another relay driving the same tab.
  private listenerRegistered = false;

  constructor(
    private tabId: number,
    private clientId?: string,
    private focus?: boolean,
  ) {}

  /** Attach the extension debugger, wire event forwarding, and start listening.
   *  Must complete BEFORE connectOverCDP is called. */
  async start(): Promise<void> {
    // 1) Attach chrome.debugger to the tab and get its real targetInfo.
    const { targetInfo, clientId } = await extensionBridge.cdpAttach(this.tabId, this.clientId, this.focus);
    this.ownerClientId = clientId;
    this.targetInfo = (targetInfo as Record<string, unknown>) || {
      targetId: `iframer-${this.tabId}`,
      type: "page",
      title: "",
      url: "",
    };

    // 2) Forward chrome.debugger events (from THIS client/tab) up to Playwright.
    // Registration is exclusive per (client, tab): a concurrent pipeline on the
    // same tab fails loudly here instead of silently stealing our events.
    extensionBridge.addCdpListener(this.ownerClientId, this.tabId, (ev: CdpEvent) => {
      this.sendToPw({
        method: ev.method,
        params: ev.params,
        sessionId: ev.sessionId || this.tabSessionId,
      });
    });
    this.listenerRegistered = true;

    // 3) Listen for the Playwright CDP connection.
    await new Promise<void>((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        // DevTools discovery endpoint: connectOverCDP(httpUrl) GETs /json/version/
        // and reads webSocketDebuggerUrl. Serving it is the reliable path.
        if (req.url === "/json/version" || req.url === "/json/version/") {
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              Browser: "Chrome/iframer-extension",
              "Protocol-Version": "1.3",
              "User-Agent": "iframer-cdp-relay/1.0",
              "V8-Version": "",
              "WebKit-Version": "",
              webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}${this.path}`,
            }),
          );
          return;
        }
        res.writeHead(404);
        res.end();
      });
      this.httpServer.on("upgrade", (req) => {
        if (process.env.IFRAMER_RELAY_DEBUG) log.info(`[relay] upgrade request url=${req.url}`);
      });
      this.wss = new WebSocketServer({ server: this.httpServer, path: this.path });
      this.wss.on("connection", (ws) => {
        if (process.env.IFRAMER_RELAY_DEBUG) log.info(`[relay] playwright connected`);
        if (this.pw) {
          ws.close(4000, "relay already has a client");
          return;
        }
        this.pw = ws;
        ws.on("message", (data: Buffer) => this.onPwMessage(data));
        ws.on("close", () => {
          if (this.pw === ws) this.pw = null;
        });
        ws.on("error", () => {});
      });
      this.httpServer.on("error", reject);
      this.httpServer.listen(0, "127.0.0.1", () => {
        const addr = this.httpServer!.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  }

  /** WS URL (used by the low-level protocol test). */
  cdpEndpoint(): string {
    return `ws://127.0.0.1:${this.port}${this.path}`;
  }

  /** HTTP DevTools endpoint — pass THIS to connectOverCDP so it fetches
   *  /json/version/ and discovers the ws url (the reliable path). */
  httpEndpoint(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private sendToPw(msg: Record<string, unknown>): void {
    if (this.pw && this.pw.readyState === WebSocket.OPEN) {
      try {
        this.pw.send(JSON.stringify(msg));
      } catch {
        /* socket gone */
      }
    }
  }

  private async onPwMessage(data: Buffer): Promise<void> {
    if (process.env.IFRAMER_RELAY_DEBUG) log.info(`[relay] raw pw msg (${data?.length ?? 0} bytes): ${data?.toString().slice(0, 120)}`);
    let msg: { id?: number; sessionId?: string; method?: string; params?: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const { id, sessionId, method, params } = msg;
    if (process.env.IFRAMER_RELAY_DEBUG) log.info(`[relay] pw→ ${method} (id=${id}, sess=${sessionId || "-"})`);
    if (!method) return;
    try {
      const result = await this.handleCdpCommand(method, params, sessionId);
      if (typeof id === "number") this.sendToPw({ id, sessionId, result });
    } catch (e) {
      if (typeof id === "number") {
        this.sendToPw({ id, sessionId, error: { message: e instanceof Error ? e.message : String(e) } });
      }
    }
  }

  private async handleCdpCommand(method: string, params: unknown, sessionId?: string): Promise<unknown> {
    // Browser-level methods the relay answers itself (chrome.debugger is per-tab).
    switch (method) {
      case "Browser.getVersion":
        return { protocolVersion: "1.3", product: "Chrome/iframer-extension", userAgent: "iframer-cdp-relay/1.0" };
      case "Browser.setDownloadBehavior":
        return {};
      case "Browser.close":
        return {}; // patchright disconnect — don't kill the user's Chrome
      case "Target.setDiscoverTargets":
        return {};
      case "Target.getTargets":
        return { targetInfos: this.targetInfo ? [{ ...this.targetInfo, attached: true }] : [] };
      case "Target.setAutoAttach":
        if (!sessionId) {
          // Root auto-attach: announce our single page target so Playwright binds to it.
          this.sendToPw({
            method: "Target.attachedToTarget",
            params: {
              sessionId: this.tabSessionId,
              targetInfo: { ...this.targetInfo, attached: true },
              waitingForDebugger: false,
            },
          });
          return {};
        }
        break; // child auto-attach (has sessionId) → forward so OOPIFs/workers attach
      case "Target.getTargetInfo":
        if (!sessionId) return { targetInfo: this.targetInfo };
        break;
    }

    // Forward everything else to chrome.debugger. Strip the fake top-level
    // sessionId (chrome addresses the page by {tabId}); pass real child ones.
    const realSessionId = sessionId === this.tabSessionId ? undefined : sessionId;
    if (method === "Page.captureScreenshot") {
      return this.captureScreenshotWithFallback(params, realSessionId);
    }
    return extensionBridge.cdpCommand(this.ownerClientId, this.tabId, realSessionId, method, params);
  }

  /** Screenshots need a compositor frame; a minimized/occluded window may
   *  never produce one, stalling the command indefinitely. Give the normal
   *  capture a short window, then fall back to fromSurface:false — capturing
   *  straight from the renderer, which works without a visible surface (at
   *  the cost of minor scale/color differences on some displays). */
  private async captureScreenshotWithFallback(params: unknown, sessionId?: string): Promise<unknown> {
    const base = (params && typeof params === "object" ? { ...(params as Record<string, unknown>) } : {}) as Record<
      string,
      unknown
    >;
    const attempt = (p: Record<string, unknown>) =>
      extensionBridge.cdpCommand(this.ownerClientId, this.tabId, sessionId, "Page.captureScreenshot", p);
    const first = attempt(base);
    first.catch(() => undefined); // may settle after losing the race
    try {
      return await Promise.race([
        first,
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error("screenshot timed out (no compositor frame)")), 10_000);
          t.unref?.();
        }),
      ]);
    } catch {
      return attempt({ ...base, fromSurface: false });
    }
  }

  async stop(): Promise<void> {
    // Remove only OUR listener — other relays (other tabs, or the one that beat
    // us to this tab) keep theirs.
    const ownedTab = this.listenerRegistered;
    if (ownedTab) {
      extensionBridge.removeCdpListener(this.ownerClientId, this.tabId);
      this.listenerRegistered = false;
    }
    // Terminate sockets immediately so close() can't block on a lingering client.
    try {
      this.wss?.clients.forEach((c) => {
        try { c.terminate(); } catch {}
      });
    } catch {}
    try { this.pw?.terminate(); } catch {}
    this.pw = null;
    const withTimeout = (fn: (cb: () => void) => void) =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try { fn(finish); } catch { finish(); }
        setTimeout(finish, 1000).unref?.();
      });
    if (this.wss) await withTimeout((cb) => this.wss!.close(cb));
    if (this.httpServer) await withTimeout((cb) => this.httpServer!.close(cb));
    this.wss = null;
    this.httpServer = null;
    // Detach the debugger only if this relay actually owned the tab —
    // otherwise we'd rip the debugger out from under the relay that does.
    if (ownedTab) {
      try {
        await extensionBridge.cdpDetach(this.ownerClientId, this.tabId);
      } catch (e) {
        log.warn(`cdp detach failed: ${e}`);
      }
    }
  }
}
