// Builds what `iframer install extension` writes for the native-messaging host,
// per platform, and tests that the installed host really answers. Plain CJS so
// bin/cli.js can load it under node, bun and the esbuild bundle alike.
"use strict";

const { spawn } = require("child_process");

const HOST_NAME = "com.iframer.token";

// On Windows, Chromium browsers find native hosts through the registry, not a
// folder. Written for all of them, installed or not, so a browser added later
// pairs without re-running the install.
const WINDOWS_BROWSERS = [
  { browser: "Chrome", root: "Software\\Google\\Chrome" },
  { browser: "Chromium", root: "Software\\Chromium" },
  { browser: "Edge", root: "Software\\Microsoft\\Edge" },
  { browser: "Brave", root: "Software\\BraveSoftware\\Brave-Browser" },
  { browser: "Vivaldi", root: "Software\\Vivaldi" },
];

function windowsRegistryKey(root) {
  return `HKCU\\${root}\\NativeMessagingHosts\\${HOST_NAME}`;
}

/** cmd.exe reads .bat files in the console's code page and expands %, so keep
 *  non-ASCII user folders out of the file: the home folder comes from
 *  %USERPROFILE% and the host script from the .bat's own folder (%~dp0). */
function windowsWrapper({ execPath, homeDir, dataDir }) {
  const esc = (s) => s.replace(/%/g, "%%");
  const prefix = homeDir.toLowerCase().replace(/[\\/]+$/, "") + "\\";
  const fromHome = (p) =>
    p.toLowerCase().startsWith(prefix) ? `%USERPROFILE%\\${esc(p.slice(prefix.length))}` : esc(p);
  return [
    "@echo off",
    "chcp 65001 >nul",
    ...(dataDir ? [`set "IFRAMER_DATA_DIR=${fromHome(dataDir)}"`] : []),
    `set "NODE_BIN=${fromHome(execPath)}"`,
    'if not exist "%NODE_BIN%" set "NODE_BIN=node"',
    '"%NODE_BIN%" "%~dp0extension-token-host.cjs"',
    "",
  ].join("\r\n");
}

/** Chrome spawns the host with a minimal PATH (no nvm/homebrew), so pin the
 *  runtime that installed this, with common fallbacks in case it moves. */
function posixWrapper({ execPath, hostScript, dataDir }) {
  return [
    "#!/bin/sh",
    ...(dataDir ? [`export IFRAMER_DATA_DIR="${dataDir}"`] : []),
    `for BIN in "${execPath}" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do`,
    `  [ -n "$BIN" ] && [ -x "$BIN" ] && exec "$BIN" "${hostScript}"`,
    "done",
    "exit 1",
    "",
  ].join("\n");
}

function hostManifest(wrapperPath, extensionId) {
  return JSON.stringify(
    {
      name: HOST_NAME,
      description: "iframer pairing-token host",
      path: wrapperPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  );
}

/** Launch the installed host the way Chrome does and ask it for get-info, so a
 *  broken install shows up in the terminal instead of as a silent pairing
 *  failure later. Resolves {ok:true, info} or {ok:false, error}. */
function testHost(wrapperPath, { timeoutMs = 15_000, platform = process.platform, env = process.env } = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;
    let stderr = "";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(result);
    };
    try {
      child =
        platform === "win32"
          ? spawn("cmd.exe", ["/d", "/s", "/c", `"${wrapperPath}"`], { env, windowsVerbatimArguments: true, windowsHide: true })
          : spawn(wrapperPath, [], { env });
    } catch (e) {
      finish({ ok: false, error: e.message });
      return;
    }
    timer = setTimeout(() => finish({ ok: false, error: `no answer within ${timeoutMs}ms` }), timeoutMs);
    child.on("error", (e) => finish({ ok: false, error: e.message }));
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("exit", (code) => {
      // Give stdout a moment to deliver the reply before calling this a failure.
      setTimeout(() => finish({ ok: false, error: stderr.trim() || `host exited with code ${code}` }), 200);
    });
    let out = Buffer.alloc(0);
    child.stdout.on("data", (d) => {
      out = Buffer.concat([out, d]);
      if (out.length < 4) return;
      const len = out.readUInt32LE(0);
      if (out.length < 4 + len) return;
      try {
        finish({ ok: true, info: JSON.parse(out.subarray(4, 4 + len).toString("utf8")) });
      } catch (e) {
        finish({ ok: false, error: `bad reply: ${e.message}` });
      }
    });
    const payload = Buffer.from(JSON.stringify({ cmd: "get-info" }), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    child.stdin.on("error", () => {});
    child.stdin.write(Buffer.concat([header, payload]));
  });
}

module.exports = {
  HOST_NAME,
  WINDOWS_BROWSERS,
  windowsRegistryKey,
  windowsWrapper,
  posixWrapper,
  hostManifest,
  testHost,
};
