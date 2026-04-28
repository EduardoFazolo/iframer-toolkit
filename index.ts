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

app.post("/shutdown", (_req, res) => {
  res.json({ ok: true });
  setImmediate(async () => {
    server.close();
    await iframer.shutdown();
    process.exit(0);
  });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    server.close();
    await iframer.shutdown();
    process.exit(0);
  });
}
