import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import crypto from "crypto";
import { getLocalToken } from "../auth/crypto";

// ─── Extension bridge (multi-client) ────────────────────────────────
//
// The banner-free "run in my real Chrome tab" transport. Any number of MV3
// extensions — across Chrome profiles or browsers — dial OUT to this server
// (extensions can't listen on a port, so the server is always the WS server).
// Each connection is a CLIENT that identifies itself (profile id/name, version)
// and reports its tabs. The server keeps them all separate and routes every
// tabs/execute call to the client that owns the target tab.
//
// Auth: each client presents ?token=<getLocalToken()> on the handshake.
// Bound to 127.0.0.1 by the HTTP server this attaches to.

const REQUEST_TIMEOUT_MS = 180_000;
// App-level heartbeat keeps an MV3 service worker alive (Chrome 116+) and
// detects dead sockets. Well under the ~30s idle-kill.
const HEARTBEAT_MS = 15_000;

export interface ExtensionTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
  favIconUrl?: string;
  // Tagged in by the server so callers can disambiguate identical tabs across
  // profiles (e.g. Slack open in both "Work" and "Personal").
  clientId: string;
  profileId?: string;
  profileName?: string;
}

export interface ClientInfo {
  clientId: string;
  profileId?: string;
  profileName?: string;
  extVersion?: string;
  connectedAt: string;
  tabCount: number;
}

interface Client {
  clientId: string;
  socket: WebSocket;
  profileId?: string;
  profileName?: string;
  extVersion?: string;
  connectedAt: number;
  tabs: ExtensionTab[]; // last-known tabs (refreshed on every listTabs)
  heartbeat: ReturnType<typeof setInterval> | null;
}

interface Pending {
  clientId: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type OutboundType = "list_tabs" | "execute" | "ping";

class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private pending = new Map<number, Pending>();
  private nextReqId = 1;
  // tabId -> clientId, refreshed on every listTabs() so execute can route.
  private tabOwner = new Map<number, string>();

  /** Attach the WS server to the already-listening HTTP server. Idempotent. */
  attach(server: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server, path: "/extension/ws" });
    this.wss.on("connection", (ws: WebSocket, req) => {
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

      const client: Client = {
        clientId: crypto.randomUUID(),
        socket: ws,
        connectedAt: Date.now(),
        tabs: [],
        heartbeat: null,
      };
      this.clients.set(client.clientId, client);
      this.startHeartbeat(client);

      ws.on("message", (data: Buffer) => this.onMessage(client, data));
      ws.on("close", () => this.dropClient(client, "socket closed"));
      ws.on("error", () => {
        /* close handler cleans up */
      });
    });
  }

  private startHeartbeat(client: Client): void {
    client.heartbeat = setInterval(() => {
      this.send(client, "ping", {}).catch(() => {});
    }, HEARTBEAT_MS);
    client.heartbeat.unref?.();
  }

  private dropClient(client: Client, _reason: string): void {
    if (client.heartbeat) clearInterval(client.heartbeat);
    if (this.clients.get(client.clientId) === client) {
      this.clients.delete(client.clientId);
    }
    // Forget any tabs this client owned.
    for (const [tabId, owner] of this.tabOwner) {
      if (owner === client.clientId) this.tabOwner.delete(tabId);
    }
    // Fail this client's in-flight requests.
    for (const [id, p] of this.pending) {
      if (p.clientId === client.clientId) {
        clearTimeout(p.timer);
        p.reject(new Error("Extension disconnected before responding."));
        this.pending.delete(id);
      }
    }
  }

  private onMessage(client: Client, data: Buffer): void {
    let msg: {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      type?: string;
      profileId?: string;
      profileName?: string;
      extVersion?: string;
    };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Event: the client introduces itself. De-dupe by profileId so a service-
    // worker restart replaces its own stale connection instead of piling up.
    if (msg.type === "hello") {
      client.profileId = msg.profileId;
      client.profileName = msg.profileName;
      client.extVersion = msg.extVersion;
      if (msg.profileId) {
        for (const other of this.clients.values()) {
          if (other !== client && other.profileId === msg.profileId) {
            try {
              other.socket.close(4002, "replaced by same profile reconnect");
            } catch {
              /* already gone */
            }
          }
        }
      }
      return;
    }

    // Otherwise it's a response to one of our requests.
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p || p.clientId !== client.clientId) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || "Extension reported an error."));
  }

  private send<T>(client: Client, type: OutboundType, payload: Record<string, unknown>): Promise<T> {
    const ws = client.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Extension client is not connected."));
    }
    const id = this.nextReqId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension did not respond within ${REQUEST_TIMEOUT_MS}ms (${type}).`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { clientId: client.clientId, resolve: resolve as (v: unknown) => void, reject, timer });
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
    return this.clients.size > 0;
  }

  hasClients(): boolean {
    return this.clients.size > 0;
  }

  status(): { connected: boolean; clients: ClientInfo[] } {
    return {
      connected: this.clients.size > 0,
      clients: [...this.clients.values()].map((c) => ({
        clientId: c.clientId,
        profileId: c.profileId,
        profileName: c.profileName,
        extVersion: c.extVersion,
        connectedAt: new Date(c.connectedAt).toISOString(),
        tabCount: c.tabs.length,
      })),
    };
  }

  /** List tabs across ALL connected clients, tagged with profile/client, and
   *  refresh the tabId → client ownership map used for routing. */
  async listTabs(): Promise<{ tabs: ExtensionTab[]; clients: ClientInfo[] }> {
    const all: ExtensionTab[] = [];
    this.tabOwner.clear();

    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        try {
          const res = (await this.send<{ tabs: ExtensionTab[] }>(client, "list_tabs", {})) || { tabs: [] };
          const tagged = (res.tabs || []).map((t) => ({
            ...t,
            clientId: client.clientId,
            profileId: client.profileId,
            profileName: client.profileName,
          }));
          client.tabs = tagged;
          for (const t of tagged) this.tabOwner.set(t.id, client.clientId);
          all.push(...tagged);
        } catch {
          client.tabs = [];
        }
      }),
    );

    return { tabs: all, clients: this.status().clients };
  }

  /** Resolve which client should run a tab. Prefer an explicit clientId, else
   *  the ownership map, refreshing once if unknown. Errors clearly on ambiguity. */
  private async resolveClient(tabId: number, clientId?: string): Promise<Client> {
    if (clientId) {
      const c = this.clients.get(clientId);
      if (!c) throw new Error(`No connected extension with clientId ${clientId}.`);
      return c;
    }
    if (this.clients.size === 0) {
      throw new Error(
        "No iframer extension is connected. Open Chrome, install/enable the iframer " +
          "extension, and pair it (paste the token, dot goes green).",
      );
    }
    let owner = this.tabOwner.get(tabId);
    if (!owner) {
      await this.listTabs(); // refresh ownership
      owner = this.tabOwner.get(tabId);
    }
    if (owner) {
      const c = this.clients.get(owner);
      if (c) return c;
    }
    if (this.clients.size === 1) {
      return [...this.clients.values()][0];
    }
    throw new Error(
      `Could not determine which browser profile owns tab ${tabId}. Call \`tabs\` to ` +
        `refresh the list, then pass the tab's clientId alongside tabId.`,
    );
  }

  execute(
    tabId: number,
    steps: unknown[],
    options: Record<string, unknown> = {},
    clientId?: string,
  ): Promise<unknown> {
    return this.resolveClient(tabId, clientId).then((client) =>
      this.send(client, "execute", { tabId, steps, options }),
    );
  }
}

export const extensionBridge = new ExtensionBridge();
