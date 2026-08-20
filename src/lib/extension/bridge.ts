import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { getLocalToken } from "../auth/crypto";

// ─── Extension bridge ───────────────────────────────────────────────
//
// The banner-free "run in my real Chrome tab" transport. An MV3 extension
// living in the user's browser dials OUT to this server (extensions cannot
// listen on a port, so the server is always the WebSocket server and the
// extension is the client). iframer stays the brain: it holds the step
// pipeline and vocabulary; the extension is a thin executor that runs steps
// in the tab and streams results back.
//
// Auth: the extension must present ?token=<getLocalToken()> on the handshake.
// That is the same machine-local secret the CLI/MCP already share, so the
// user pastes it once into the extension popup. Bound to 127.0.0.1 by the
// HTTP server this attaches to — never exposed off-box.

const REQUEST_TIMEOUT_MS = 180_000;

export interface ExtensionTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
  favIconUrl?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type OutboundType = "list_tabs" | "execute" | "ping";

class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  // The most-recently-connected extension. v1 assumes a single browser; the
  // last live socket wins so a reconnect (service-worker restart) transparently
  // replaces a stale one.
  private socket: WebSocket | null = null;
  private connectedAt: number | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  /** Attach the WS server to the already-listening HTTP server. Idempotent. */
  attach(server: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server, path: "/extension/ws" });
    this.wss.on("connection", (ws: WebSocket, req) => {
      // Validate the pairing token from the query string. Browser WebSocket
      // clients cannot set custom headers, so the token rides in the URL.
      const token = new URL(req.url || "", "http://127.0.0.1").searchParams.get("token");
      let expected = "";
      try {
        expected = getLocalToken();
      } catch {
        expected = "";
      }
      if (!expected || token !== expected) {
        ws.close(4001, "unauthorized");
        return;
      }

      // Newest connection wins. Drop any previous socket cleanly.
      if (this.socket && this.socket !== ws) {
        try {
          this.socket.close(4000, "replaced by newer connection");
        } catch {
          /* already gone */
        }
      }
      this.socket = ws;
      this.connectedAt = Date.now();

      ws.on("message", (data: Buffer) => this.onMessage(ws, data));
      ws.on("close", () => {
        if (this.socket === ws) {
          this.socket = null;
          this.connectedAt = null;
          // Fail any in-flight requests — the executor is gone.
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("Extension disconnected before responding."));
          }
          this.pending.clear();
        }
      });
      ws.on("error", () => {
        /* close handler does the cleanup */
      });
    });
  }

  private onMessage(ws: WebSocket, data: Buffer): void {
    if (ws !== this.socket) return;
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || "Extension reported an error."));
  }

  private send<T>(type: OutboundType, payload: Record<string, unknown>): Promise<T> {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error(
          "No iframer extension is connected. Open Chrome, install the iframer " +
            "extension, click its icon on the tab you want to drive, and make sure " +
            "it shows 'connected'.",
        ),
      );
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension did not respond within ${REQUEST_TIMEOUT_MS}ms (${type}).`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        ws.send(JSON.stringify({ id, type, ...payload }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  status(): { connected: boolean; connectedAt: string | null } {
    return {
      connected: this.isConnected(),
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
    };
  }

  listTabs(): Promise<{ tabs: ExtensionTab[] }> {
    return this.send<{ tabs: ExtensionTab[] }>("list_tabs", {});
  }

  execute(tabId: number, steps: unknown[], options: Record<string, unknown> = {}): Promise<unknown> {
    return this.send("execute", { tabId, steps, options });
  }
}

export const extensionBridge = new ExtensionBridge();
