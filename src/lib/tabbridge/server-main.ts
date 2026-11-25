/**
 * Entry of the tab bridge daemon (dist/bridge-server.cjs). Started detached by
 * `iframer bridge attach`; exits by itself after 30 min with no tab attached
 * and no request. Imports nothing from the rest of iframer but state.ts, so it
 * runs even when a native module of the main CLI is broken.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths";
import { startBridgeServer } from "./server";
import { BRIDGE_VERSION, bridgePort, clearState, masterKey, writeState } from "./state";

const token = crypto.randomBytes(24).toString("hex");
const scale = Number(process.env.IFRAMER_BRIDGE_TIME_SCALE) || 1; // tests only
const idleMs = Number(process.env.IFRAMER_BRIDGE_IDLE_MS) || undefined; // tests only

let closing = false;
let close: (() => Promise<void>) | undefined;
const bye = () => {
  if (closing) return;
  closing = true;
  clearState(process.pid);
  const hard = setTimeout(() => process.exit(0), 2000);
  hard.unref();
  Promise.resolve(close?.()).finally(() => process.exit(0));
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
// A bug must not leave a dead daemon behind a live state file: note why (the error only, never a request) and go.
// Scripts then see "not running" and use their saved session.
const crash = (e: unknown) => {
  try { fs.appendFileSync(path.join(getDataDir(), "bridge.log"), `${new Date().toISOString()} v${BRIDGE_VERSION} ${(e as Error)?.stack || e}\n`); } catch { /* best effort */ }
  bye();
};
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

startBridgeServer({ port: bridgePort(), token, masterKey: masterKey(), scale, idleMs, onIdle: bye }).then(
  (s) => {
    close = s.close;
    writeState({ port: s.port, token, pid: process.pid, started: new Date().toISOString(), v: BRIDGE_VERSION });
  },
  (e: Error) => { console.error(`iframer bridge: ${e.message}`); process.exit(1); },
);
