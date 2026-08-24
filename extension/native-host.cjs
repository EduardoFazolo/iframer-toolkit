#!/usr/bin/env node
// iframer native-messaging host: hands the machine-local pairing token to the
// iframer extension so nobody has to copy-paste it. Chrome launches this
// process (per its host manifest, installed by `iframer install extension`),
// restricted by allowed_origins to the iframer extension ID only.
//
// Protocol (Chrome native messaging): each message is a 4-byte little-endian
// length followed by that many bytes of JSON, both directions.
//
// This file is COPIED to ~/.iframer/ at install time so it keeps working if
// the repo moves. It must stay dependency-free (plain node, no imports beyond
// stdlib) and must read the same secret locations as src/lib/auth/crypto.ts.

const fs = require("fs");
const os = require("os");
const path = require("path");

function readToken() {
  if (process.env.IFRAMER_SECRET) return process.env.IFRAMER_SECRET;
  const dataDir = process.env.IFRAMER_DATA_DIR || path.join(os.homedir(), ".iframer");
  const candidates = [
    path.join(dataDir, "secret"),
    path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "iframer-secret"),
  ];
  for (const file of candidates) {
    try {
      const t = fs.readFileSync(file, "utf8").trim();
      if (t) return t;
    } catch {
      /* try next */
    }
  }
  return "";
}

// Where is the iframer server right now? Reads the server registry the local
// server writes on startup (src/lib/browser/registry.ts) and checks the pid is
// actually alive — so the extension can connect straight to the right port
// instead of blind-scanning 21 ports (each dead dial logs a console error).
function readServerInfo() {
  const dataDir = process.env.IFRAMER_DATA_DIR || path.join(os.homedir(), ".iframer");
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dataDir, "server.json"), "utf8"));
    let alive = false;
    if (info && typeof info.pid === "number") {
      try {
        process.kill(info.pid, 0);
        alive = true;
      } catch {
        /* pid gone — stale registry */
      }
    }
    return { port: info && typeof info.port === "number" ? info.port : null, alive };
  } catch {
    return { port: null, alive: false };
  }
}

function send(msg) {
  const payload = Buffer.from(JSON.stringify(msg), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) return;
    const body = buf.subarray(4, 4 + len);
    buf = buf.subarray(4 + len);
    let msg = {};
    try {
      msg = JSON.parse(body.toString("utf8"));
    } catch {
      /* respond with error below */
    }
    if (msg && msg.cmd === "get-token") {
      const token = readToken();
      send(token ? { ok: true, token } : { ok: false, error: "no secret file found — run any iframer command once to create it" });
    } else if (msg && msg.cmd === "get-info") {
      // Token + live server location in one call.
      send({ ok: true, token: readToken() || null, ...readServerInfo() });
    } else {
      send({ ok: false, error: "unknown command" });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
