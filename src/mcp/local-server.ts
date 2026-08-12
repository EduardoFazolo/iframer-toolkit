import { spawn } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";
import { getDataDir } from "../lib/paths";
import { readServerInfo, isPidAlive } from "../lib/browser/registry";

// One SHARED local server per machine, discovered via ~/.iframer/server.json.
// MCP processes (one per Claude session) are thin clients: they adopt a
// healthy running server, or spawn one — detached, so it outlives them.
// Browsers are isolated per agent via instanceId, not per process.
//
// The old model (one server per MCP session, killed with its parent) leaked
// a Chrome every time a session was interrupted, forgotten, or left behind.
const BASE_PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
const PORT_SCAN_ATTEMPTS = 200;
const STARTUP_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 300;
const SPAWN_LOCK_STALE_MS = 20_000;

export class LocalServerManager {
  private startingPromise: Promise<void> | null = null;
  private baseUrl: string = "";
  private logPath: string;

  constructor() {
    this.logPath = path.join(getDataDir(), "local-server.log");
  }

  getBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error("Local server not started yet — call ensureRunning() first.");
    }
    return this.baseUrl;
  }

  /** Ensure a shared local server is reachable. Idempotent — concurrent
   *  callers await the same startup promise. */
  async ensureRunning(): Promise<void> {
    if (this.startingPromise) return this.startingPromise;
    if (await this.adoptExisting()) return;

    this.startingPromise = this.startShared().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }

  /** Adopt the advertised shared server if its process is alive and healthy. */
  private async adoptExisting(): Promise<boolean> {
    const info = readServerInfo();
    if (!info || !isPidAlive(info.pid)) return false;
    const url = `http://127.0.0.1:${info.port}`;
    if (await healthCheck(url)) {
      this.baseUrl = url;
      return true;
    }
    return false;
  }

  private async startShared(): Promise<void> {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    const lockDir = path.join(dataDir, "server.spawn-lock");

    // Cross-process spawn lock (mkdir is atomic). Whoever holds it spawns;
    // everyone else polls for the winner's server.json.
    let holdingLock = false;
    try {
      fs.mkdirSync(lockDir);
      holdingLock = true;
    } catch {
      const stale = (() => {
        try { return Date.now() - fs.statSync(lockDir).mtimeMs > SPAWN_LOCK_STALE_MS; } catch { return true; }
      })();
      if (stale) {
        try { fs.rmdirSync(lockDir); fs.mkdirSync(lockDir); holdingLock = true; } catch {}
      }
    }

    try {
      if (!holdingLock) {
        // Another MCP process is spawning the server — wait for it.
        const deadline = Date.now() + STARTUP_TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (await this.adoptExisting()) return;
          await sleep(HEALTH_POLL_MS);
        }
        throw new Error("Timed out waiting for another session to start the shared iframer server.");
      }

      // Double-check under the lock — the previous holder may have finished.
      if (await this.adoptExisting()) return;

      const port = await findFreePort(BASE_PORT, PORT_SCAN_ATTEMPTS);
      const url = `http://127.0.0.1:${port}`;
      const { command, args } = this.resolveRuntime();
      const logFd = fs.openSync(this.logPath, "a");

      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        PORT: String(port),
        IFRAMER_MODE: "local",
        IFRAMER_DATA_DIR: dataDir,
      };
      if (process.env.IFRAMER_SECRET) {
        env.IFRAMER_SECRET = process.env.IFRAMER_SECRET;
      } else {
        // Read the shared secret file so the local server encrypts with the same key
        try {
          const secret = fs.readFileSync(path.join(dataDir, "secret"), "utf8").trim();
          if (secret) env.IFRAMER_SECRET = secret;
        } catch {}
      }

      // Detached + unref: the server is SHARED infrastructure. It must
      // survive this MCP process; its own idle-exit + the browser registry
      // reaper handle its lifetime.
      const child = spawn(command, args, {
        env,
        stdio: ["ignore", logFd, logFd],
        detached: true,
      });
      child.unref();
      fs.closeSync(logFd);

      // Wait for health
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await healthCheck(url)) {
          this.baseUrl = url;
          return;
        }
        await sleep(HEALTH_POLL_MS);
      }

      try { child.kill("SIGKILL"); } catch {}
      throw new Error(
        `Local iframer server failed to start on port ${port} within ${STARTUP_TIMEOUT_MS}ms.\n` +
        `Last log lines:\n${this.readLogTail()}`
      );
    } finally {
      if (holdingLock) {
        try { fs.rmdirSync(lockDir); } catch {}
      }
    }
  }

  private resolveRuntime(): { command: string; args: string[] } {
    // Prefer bun + source (dev mode)
    try {
      const bunPath = require("child_process")
        .execSync("which bun", { encoding: "utf8" })
        .trim();
      const serverTs = path.join(__dirname, "..", "..", "index.ts");
      if (fs.existsSync(serverTs)) {
        return { command: bunPath, args: ["run", serverTs] };
      }
    } catch {}

    // Fallback: node + built bundle
    const serverCjs = path.join(__dirname, "..", "..", "dist", "local-server.cjs");
    if (fs.existsSync(serverCjs)) {
      return { command: "node", args: [serverCjs] };
    }

    // Last resort: try index.ts with whatever `node` can do
    const serverTs = path.join(__dirname, "..", "..", "index.ts");
    return { command: "node", args: ["--import", "tsx", serverTs] };
  }

  /** Ask the shared server to exit (it kills its browsers with a hard
   *  deadline), then start a fresh one. Used for crash recovery. */
  async restart(): Promise<void> {
    const info = readServerInfo();
    if (info && this.baseUrl) {
      try {
        await fetch(`${this.baseUrl}/shutdown`, { method: "POST", signal: AbortSignal.timeout(3000) });
      } catch {}
      // Wait for the process to actually die (its shutdown deadline is 10s)
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline && isPidAlive(info.pid)) {
        await sleep(200);
      }
      if (isPidAlive(info.pid)) {
        try { process.kill(info.pid, "SIGKILL"); } catch {}
      }
    }
    this.baseUrl = "";
    await this.ensureRunning();
  }

  /** MCP process exiting. The shared server intentionally stays up —
   *  other sessions may be using it; idle-exit + reaper govern its life. */
  shutdown(): void {}

  private readLogTail(): string {
    try {
      const content = fs.readFileSync(this.logPath, "utf8");
      const lines = content.trim().split("\n");
      return lines.slice(-10).join("\n");
    } catch {
      return "(no log file)";
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function healthCheck(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

/** Find the first free TCP port at/above `start`, scanning up to `attempts`
 *  ports. Binds to 127.0.0.1 to probe, then releases it for the child. */
function findFreePort(start: number, attempts: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number) => {
      if (p >= start + attempts) {
        reject(new Error(`No free port found in ${start}-${start + attempts}`));
        return;
      }
      const srv = net.createServer();
      srv.once("error", () => {
        srv.close();
        tryPort(p + 1);
      });
      srv.once("listening", () => {
        srv.close(() => resolve(p));
      });
      srv.listen(p, "127.0.0.1");
    };
    tryPort(start);
  });
}
