import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import crypto from "crypto";
import { getLocalToken } from "../auth/crypto";

// ─── Extension bridge (multi-client) ────────────────────────────────
//
// The "run in my real Chrome tab" transport. Any number of MV3
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

type OutboundType = "list_tabs" | "ping" | "cdp_attach" | "cdp_command" | "cdp_detach";

export interface CdpEvent {
  tabId: number;
  sessionId?: string;
  method: string;
  params?: unknown;
}

class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private pending = new Map<number, Pending>();
  private nextReqId = 1;
  // tabId -> clientId, refreshed on every listTabs() so execute can route.
  private tabOwner = new Map<number, string>();
  // Tab ids that two connected browsers BOTH reported (separate Chromium
  // instances have independent tab-id spaces, so ids can collide). Routing
  // one of these without an explicit clientId would silently pick a winner —
  // refuse instead.
  private collidingTabs = new Set<number>();
  // CDP relay listeners, one per (clientId, tabId). Each active relay owns
  // exactly one entry; a second relay on the same tab is refused at register
  // time instead of silently stealing the first one's events.
  private cdpListeners = new Map<string, (ev: CdpEvent) => void>();

  /** Attach the WS server to the already-listening HTTP server. Idempotent. */
  attach(server: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server, path: "/extension/ws" });
    this.wss.on("connection", (ws: WebSocket, req) => {
      let expected = "";
      try {
        expected = getLocalToken();
      } catch {
        expected = "";
      }
      if (!expected) {
        ws.close(4001, "unauthorized");
        return;
      }

      // Preferred auth: a first-message {type:"auth", token} — keeps the token
      // out of URLs (query strings end up in request logs). A ?token= query
      // param is still accepted for older extensions and the integration tests.
      const queryToken = new URL(req.url || "", "http://127.0.0.1").searchParams.get("token");
      if (queryToken !== null) {
        if (queryToken !== expected) {
          ws.close(4001, "unauthorized");
          return;
        }
        this.acceptClient(ws);
        return;
      }

      const timer = setTimeout(() => ws.close(4001, "auth timeout"), 3_000);
      ws.once("message", (data: Buffer) => {
        clearTimeout(timer);
        try {
          const m = JSON.parse(data.toString()) as { type?: string; token?: string };
          if (m?.type === "auth" && m.token === expected) {
            this.acceptClient(ws);
            return;
          }
        } catch {
          /* fall through to close */
        }
        ws.close(4001, "unauthorized");
      });
    });
  }

  private acceptClient(ws: WebSocket): void {
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

    // CDP relay event forwarded from the extension's chrome.debugger — route
    // to the relay that owns this exact (client, tab).
    if (msg.type === "cdp_event") {
      const ev = msg as unknown as CdpEvent;
      if (typeof ev.tabId === "number") {
        const fn = this.cdpListeners.get(cdpKey(client.clientId, ev.tabId));
        if (fn) fn(ev);
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
    this.collidingTabs.clear();

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
          for (const t of tagged) {
            const prev = this.tabOwner.get(t.id);
            if (prev !== undefined && prev !== client.clientId) this.collidingTabs.add(t.id);
            this.tabOwner.set(t.id, client.clientId);
          }
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
    // Single connected profile → no ambiguity; skip the (blocking) tab refresh.
    if (this.clients.size === 1) {
      return [...this.clients.values()][0];
    }
    let owner = this.tabOwner.get(tabId);
    if (!owner || this.collidingTabs.has(tabId)) {
      await this.listTabs(); // refresh ownership
      owner = this.tabOwner.get(tabId);
    }
    if (this.collidingTabs.has(tabId)) {
      throw new Error(
        `Tab id ${tabId} exists in more than one connected browser (separate browsers ` +
          `have independent tab-id spaces). Call \`tabs\` and pass the tab's clientId ` +
          `alongside tabId to pick the right one.`,
      );
    }
    if (owner) {
      const c = this.clients.get(owner);
      if (c) return c;
    }
    throw new Error(
      `Could not determine which browser profile owns tab ${tabId}. Call \`tabs\` to ` +
        `refresh the list, then pass the tab's clientId alongside tabId.`,
    );
  }

  // ─── CDP relay plumbing ───────────────────────────────────────────

  /** Register the relay that owns (clientId, tabId). Throws if another relay
   *  already drives that tab — a loud error instead of a silent event steal. */
  addCdpListener(clientId: string, tabId: number, fn: (ev: CdpEvent) => void): void {
    const key = cdpKey(clientId, tabId);
    if (this.cdpListeners.has(key)) {
      throw new Error(`Tab ${tabId} is already being driven by another pipeline. Retry when it finishes.`);
    }
    this.cdpListeners.set(key, fn);
  }

  removeCdpListener(clientId: string, tabId: number): void {
    this.cdpListeners.delete(cdpKey(clientId, tabId));
  }

  async cdpAttach(tabId: number, clientId?: string, focus?: boolean): Promise<{ targetInfo: unknown; clientId: string }> {
    const client = await this.resolveClient(tabId, clientId);
    const res = (await this.send<{ targetInfo: unknown }>(client, "cdp_attach", { tabId, focus: !!focus })) || {
      targetInfo: null,
    };
    return { targetInfo: res.targetInfo, clientId: client.clientId };
  }

  async cdpCommand(
    clientId: string,
    tabId: number,
    sessionId: string | undefined,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const client = this.clients.get(clientId);
    if (!client) throw new Error(`CDP: client ${clientId} is gone.`);
    return this.send(client, "cdp_command", { tabId, sessionId, method, params });
  }

  async cdpDetach(clientId: string, tabId: number): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;
    try {
      await this.send(client, "cdp_detach", { tabId });
    } catch {
      /* extension gone — nothing to detach */
    }
  }
}

function cdpKey(clientId: string, tabId: number): string {
  return `${clientId}:${tabId}`;
}

export const extensionBridge = new ExtensionBridge();
