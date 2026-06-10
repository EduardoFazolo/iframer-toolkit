import express from "express";
import path from "path";
import fs from "fs";
import { registerRoutes, iframer } from "./src/api/routes";
import { tokenAuth } from "./src/api/middleware";
import { errorHandler } from "./src/api/error-handler";

const app = express();
const PORT = process.env.PORT || 3021;

const SCREENSHOT_DIR = path.join(import.meta.dir, ".screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
app.use("/screenshots", express.static(SCREENSHOT_DIR));

app.use(express.json());
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

const server = app.listen(PORT, () => console.log(`iframer listening on ${PORT}`));

let shuttingDown = false;
async function gracefulShutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[local-server] shutting down (${reason})...`);
  server.close();
  await iframer.shutdown();
  process.exit(0);
}

app.post("/shutdown", (_req, res) => {
  res.json({ ok: true });
  setImmediate(() => gracefulShutdown("shutdown endpoint"));
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => gracefulShutdown(signal));
}

// Parent watchdog: this local server owns Chrome but is a child of the MCP
// process. If the MCP dies abnormally (SIGKILL on session close), this child
// is reparented to init instead of killed — orphaning Chrome. Poll the parent
// PID and self-terminate the moment it's gone.
const PARENT_PID = parseInt(process.env.IFRAMER_PARENT_PID || "", 10);
if (Number.isInteger(PARENT_PID) && PARENT_PID > 1) {
  const watchdog = setInterval(() => {
    try {
      process.kill(PARENT_PID, 0); // signal 0 = existence check, doesn't kill
    } catch {
      clearInterval(watchdog);
      gracefulShutdown(`parent ${PARENT_PID} gone`);
    }
  }, 3000);
  watchdog.unref?.(); // don't keep the event loop alive just for this
}
