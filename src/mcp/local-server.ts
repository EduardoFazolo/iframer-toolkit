import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getDataDir } from "../lib/paths";

const PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
const STARTUP_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 300;

/**
 * Manages a local background HTTP server that owns the browser. The MCP
 * server talks to it via HTTP — if Chrome crashes, only the child process
 * dies. The MCP server survives, respawns the child, and retries.
 */
export class LocalServerManager {
  private child: ChildProcess | null = null;
  private startingPromise: Promise<void> | null = null;
  private baseUrl: string;
  private logPath: string;

  constructor() {
    this.baseUrl = `http://127.0.0.1:${PORT}`;
    this.logPath = path.join(getDataDir(), "local-server.log");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Ensure the local server is running. Idempotent — concurrent callers
   *  await the same startup promise. */
  async ensureRunning(): Promise<void> {
    if (this.child && !this.child.killed && await this.healthCheck()) return;
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = this.doStart().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }

  private async doStart(): Promise<void> {
    // Kill any stale process
    await this.killExisting();

    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });

    // Resolve the server entrypoint — dev (bun + source) or built (node + cjs)
    const { command, args } = this.resolveRuntime();

    const logFd = fs.openSync(this.logPath, "a");

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PORT: String(PORT),
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

    this.child = spawn(command, args, {
      env,
      stdio: ["ignore", logFd, logFd],
      detached: false,
    });

    fs.closeSync(logFd);

    this.child.on("exit", (code) => {
      this.child = null;
    });

    // Wait for health check to pass
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.healthCheck()) return;
      await sleep(HEALTH_POLL_MS);
    }

    // Startup failed
    this.kill();
    const logTail = this.readLogTail();
    throw new Error(
      `Local iframer server failed to start on port ${PORT} within ${STARTUP_TIMEOUT_MS}ms.\n` +
      `Last log lines:\n${logTail}`
    );
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

  async restart(): Promise<void> {
    this.kill();
    await sleep(500);
    await this.ensureRunning();
  }

  shutdown(): void {
    this.kill();
  }

  private kill(): void {
    if (this.child && !this.child.killed) {
      try { this.child.kill("SIGTERM"); } catch {}
      // Force kill after 2s
      const c = this.child;
      setTimeout(() => {
        try { if (!c.killed) c.kill("SIGKILL"); } catch {}
      }, 2000);
    }
    this.child = null;
  }

  private async killExisting(): Promise<void> {
    // Kill any stale process on our port
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        // Server is alive on our port — kill it via shutdown or brute force
        try {
          await fetch(`${this.baseUrl}/shutdown`, {
            method: "POST",
            signal: AbortSignal.timeout(2000),
          });
        } catch {}
        await sleep(500);
      }
    } catch {
      // Nothing on the port — good
    }
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const data = await res.json() as { ok?: boolean };
      return data.ok === true;
    } catch {
      return false;
    }
  }

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
