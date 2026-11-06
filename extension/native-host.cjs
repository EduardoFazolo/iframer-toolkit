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
const http = require("http");
const os = require("os");
const path = require("path");

// Same window the local server allocates its port from
// (src/mcp/local-server.ts, extension/background.js).
const PORT_START = 3022;
const PORT_END = 3042;
const PROBE_TIMEOUT_MS = 1500;

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

function readRegisteredPort() {
  const dataDir = process.env.IFRAMER_DATA_DIR || path.join(os.homedir(), ".iframer");
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dataDir, "server.json"), "utf8"));
    return info && typeof info.port === "number" ? info.port : null;
  } catch {
    return null;
  }
}

function probe(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const req = http.get({ host: "127.0.0.1", port, path: "/health", agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => {
        if (body.length < 4096) body += d;
      });
      res.on("end", () => {
        try {
          finish(JSON.parse(body).ok === true);
        } catch {
          finish(false);
        }
      });
      res.on("error", () => finish(false));
    });
    req.on("error", () => finish(false));
    const timer = setTimeout(() => {
      req.destroy();
      finish(false);
    }, PROBE_TIMEOUT_MS);
  });
}

// Where is the iframer server right now? Only a server that actually answers
// counts. A pid check can't decide this: on Windows a reused pid looks alive,
// and a server running as another user looks dead. Probing from here also lets
// the extension find the port without dialing dead ones (each dead dial logs a
// console error in the extension).
async function locateServer() {
  const registered = readRegisteredPort();
  if (registered && (await probe(registered))) return { port: registered, alive: true };

  const ports = [];
  for (let p = PORT_START; p <= PORT_END; p++) if (p !== registered) ports.push(p);
  // All at once: Windows takes about 2s to refuse a closed port, one by one
  // would take most of a minute.
  const found = await new Promise((resolve) => {
    let left = ports.length;
    for (const p of ports) {
      probe(p).then((ok) => {
        if (ok) resolve(p);
        else if (--left === 0) resolve(null);
      });
    }
  });
  return found ? { port: found, alive: true } : { port: registered, alive: false };
}

function send(msg, done) {
  const payload = Buffer.from(JSON.stringify(msg), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]), done);
}

// Chrome may close stdin while a reply is still being worked out, so exit only
// once stdin has ended AND every reply has been written.
let pending = 0;
let stdinEnded = false;
function exitIfDone() {
  if (stdinEnded && pending === 0) process.exit(0);
}

async function reply(msg) {
  let out;
  try {
    if (msg && msg.cmd === "get-token") {
      const token = readToken();
      out = token ? { ok: true, token } : { ok: false, error: "no secret file found — run any iframer command once to create it" };
    } else if (msg && msg.cmd === "get-info") {
      // Token + live server location in one call.
      out = { ok: true, token: readToken() || null, ...(await locateServer()) };
    } else {
      out = { ok: false, error: "unknown command" };
    }
  } catch (e) {
    out = { ok: false, error: String((e && e.message) || e) };
  }
  send(out, () => {
    pending--;
    exitIfDone();
  });
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
      /* answered as an unknown command */
    }
    pending++;
    reply(msg);
  }
});
process.stdin.on("end", () => {
  stdinEnded = true;
  exitIfDone();
});
