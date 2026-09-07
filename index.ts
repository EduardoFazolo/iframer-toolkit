import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerRoutes, iframer } from "./src/api/routes";
import { tokenAuth } from "./src/api/middleware";
import { errorHandler } from "./src/api/error-handler";
import { writeServerInfo, clearServerInfo, reapOrphanBrowsers } from "./src/lib/browser/registry";
import { extensionBridge } from "./src/lib/extension/bridge";

const app = express();
const PORT = parseInt(process.env.PORT || "3021", 10);
const REAP_INTERVAL_MS = 60_000;
const IDLE_EXIT_MS = parseInt(process.env.IFRAMER_SERVER_IDLE_EXIT_MS || String(30 * 60 * 1000), 10);
const SHUTDOWN_DEADLINE_MS = 10_000;

// Own package version, for server.json — repo layout has package.json beside
// index.ts, the npm-installed bundle (dist/local-server.cjs) one level up.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const OWN_VERSION = (() => {
  for (const p of [path.join(SERVER_DIR, "package.json"), path.join(SERVER_DIR, "..", "package.json")]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (pkg.name === "iframer-toolkit") return pkg.version as string;
    } catch {}
  }
  return undefined;
})();

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
app.use("/screenshots", express.static(SCREENSHOT_DIR));

app.use(express.json());

// Track activity so the server can retire itself when nobody needs it.
let lastActivity = Date.now();
app.use((_req, _res, next) => {
  lastActivity = Date.now();
  next();
});

app.use(tokenAuth);

registerRoutes(app);
app.use(errorHandler);

// Prevent Chrome/patchright CDP socket errors from crashing the server.
// These fire as unhandled events when Chrome closes unexpectedly.
process.on("uncaughtException", (err) => {
  console.error(`[local-server] uncaughtException (survived): ${err?.message}`);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[local-server] unhandledRejection (survived): ${reason}`);
});

// Loopback ONLY. This server trusts a machine-local token; binding all
// interfaces would expose /execute (and the extension bridge) to the LAN.
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`iframer listening on 127.0.0.1:${PORT}`);
  // Advertise ourselves as THE shared local server for this machine.
  writeServerInfo({ pid: process.pid, port: PORT, startedAt: new Date().toISOString(), version: OWN_VERSION });
});

// "Run in my real Chrome tab" transport: the MV3 extension dials
// into this same HTTP server over WebSocket (/extension/ws).
extensionBridge.attach(server);

// ─── Shutdown: single owner, cannot wedge ──────────────────────────
// Arm the exit deadline before teardown so a hung browser close cannot block shutdown.

let shutdownStarted = false;
async function gracefulShutdown(reason: string): Promise<void> {
  if (shutdownStarted) return; // the hard-deadline timer below guarantees exit
  shutdownStarted = true;
  console.log(`[local-server] shutting down (${reason})...`);

  // Hard deadline FIRST: whatever happens below, this process exits.
  const deadline = setTimeout(() => {
    console.error(`[local-server] shutdown exceeded ${SHUTDOWN_DEADLINE_MS}ms, forcing exit`);
    clearServerInfo(process.pid);
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref?.();

  server.close();
  try {
    await iframer.shutdown(); // daemon.stopAll(true): deadline-close + SIGKILL by PID
  } catch (err) {
    console.error(`[local-server] shutdown error: ${err}`);
  }
  clearServerInfo(process.pid);
  process.exit(0);
}

app.post("/shutdown", (_req, res) => {
  res.json({ ok: true });
  setImmediate(() => gracefulShutdown("shutdown endpoint"));
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => gracefulShutdown(signal));
}

// ─── Reaper ────────────────────────────────────────────────────────
// Sweep the on-disk browser registry: any Chrome whose owning server died
// (crash, SIGKILL, old pre-registry version) gets force-killed. Runs at
// boot — retroactively cleans historical orphans — and periodically.
(async () => {
  try {
    const { reaped } = await reapOrphanBrowsers();
    if (reaped > 0) console.log(`[local-server] reaped ${reaped} orphaned Chrome process(es) at boot`);
  } catch (err) {
    console.error(`[local-server] boot reap failed: ${err}`);
  }
})();

const reapTimer = setInterval(async () => {
  try {
    await reapOrphanBrowsers();
  } catch {}

  // Idle retirement: exit cleanly only when nothing needs us — no browsers,
  // no recent HTTP traffic, AND no extension connected. A connected extension
  // MUST keep us alive: it is a live client that expects to drive tabs on
  // demand, and it has no way to restart us (only MCP tool calls spawn the
  // server). Exiting under a connected extension is what silently "unpairs"
  // it. When every extension disconnects (all Chrome windows closed), the
  // server is free to idle-exit; the next MCP call respawns it. The cost of
  // staying up for an idle extension is tiny — a websocket + heartbeat, no
  // Chrome — and Chrome itself is reaped separately.
  const idleMs = Date.now() - lastActivity;
  if (idleMs > IDLE_EXIT_MS && !iframer.browserHealth().alive && !extensionBridge.hasClients()) {
    gracefulShutdown(`idle for ${Math.round(idleMs / 60000)}min with no browsers`);
  }
}, REAP_INTERVAL_MS);
reapTimer.unref?.();
