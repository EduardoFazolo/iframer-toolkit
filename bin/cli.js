#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const HOME_DIR = os.homedir();
// Data directory — honors the IFRAMER_DATA_DIR env var.
const CONFIG_DIR = process.env.IFRAMER_DATA_DIR || path.join(HOME_DIR, ".iframer");
const CLAUDE_CONFIG_PATH = path.join(HOME_DIR, ".claude.json");
const CODEX_CONFIG_PATH = path.join(HOME_DIR, ".codex", "config.toml");

// Shared user identity — MUST match src/mcp/helpers.ts LOCAL_USER so CLI and
// MCP share the same credential store rows.
const LOCAL_USER_ID = "iframer-local";

/**
 * Resolve the machine-local encryption token used by both CLI and MCP.
 * Precedence:
 *   1. IFRAMER_SECRET env var (user override)
 *   2. ~/.iframer/secret — persisted on first run, shared across processes
 *
 * Must behave identically to getLocalToken() in src/lib/auth/crypto.ts.
 */
function resolveLocalToken() {
  if (process.env.IFRAMER_SECRET) return process.env.IFRAMER_SECRET;

  const candidates = [
    path.join(CONFIG_DIR, "secret"),
    path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "iframer-secret"),
  ];

  for (const file of candidates) {
    try {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing) return existing;
    } catch {}
  }

  for (const file of candidates) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const secret = require("crypto").randomBytes(32).toString("hex");
      fs.writeFileSync(file, secret, { mode: 0o600 });
      return secret;
    } catch {}
  }

  // Never fall back to a fixed key — that would encrypt credentials under a
  // value baked into the source. Fail closed.
  throw new Error(
    "iframer: could not read or create a persistent encryption secret in any " +
      `writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a ` +
      "stable value shared between the MCP server and CLI (openssl rand -hex 32).",
  );
}

const LOCAL_TOKEN = resolveLocalToken();

// ─── Utilities ──────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(0);
      } else if (char === "\u007f" || char === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += char;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

function resolveMcpRuntime() {
  const mcpServerTS = path.join(__dirname, "..", "src", "mcp", "server.ts");
  const mcpServerCJS = path.join(__dirname, "mcp-server.cjs");

  let bunPath;
  try {
    bunPath = execSync("which bun", { encoding: "utf8" }).trim();
  } catch {}

  if (bunPath && fs.existsSync(mcpServerTS)) {
    return {
      command: bunPath,
      args: ["run", mcpServerTS],
      message: "  Using bun to run MCP server from source (no build needed)",
    };
  }

  if (fs.existsSync(mcpServerCJS)) {
    return {
      command: "node",
      args: [mcpServerCJS],
      message: "  Using pre-built MCP server bundle",
    };
  }

  console.error("  MCP server not found. Need either bun + source or pre-built bundle.");
  console.error("  Run: bun build src/mcp/server.ts --target node --format cjs --outfile bin/mcp-server.cjs");
  process.exit(1);
}

function resolveIframerSecret() {
  let secret = process.env.IFRAMER_SECRET;
  if (secret) return secret;

  // Dev-mode fallback: read from repo's .env file
  try {
    const envPath = path.join(__dirname, "..", ".env");
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
    if (match) secret = match[1].trim();
  } catch {}

  return secret;
}

/**
 * Install the /iframer skill command to the Claude Code commands directory.
 * The skill file ships with the iframer-toolkit package and teaches the agent
 * how to use the MCP tools correctly (pipeline building, mode selection,
 * credential flow, snapshot→refs workflow, etc.).
 *
 * Returns true if installed, false if the source file wasn't found.
 */
function installSkill() {
  // Skill source: look next to this script (dev: repo root), or in the
  // npm-installed package layout (dist/../skills/).
  const candidates = [
    path.join(__dirname, "..", "skills", "iframer.md"),
    path.join(__dirname, "skills", "iframer.md"),
  ];
  let source = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { source = c; break; }
  }
  if (!source) return false;

  const destDir = path.join(HOME_DIR, ".claude", "commands");
  const dest = path.join(destDir, "iframer.md");
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(source, dest);
    return true;
  } catch (err) {
    console.error(`  Warning: could not install skill: ${err.message}`);
    return false;
  }
}

/**
 * Remove the /iframer skill from the Claude Code commands directory.
 */
function removeSkill() {
  const dest = path.join(HOME_DIR, ".claude", "commands", "iframer.md");
  try {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Ensure ~/.iframer/secret contains the given token (overwriting any prior
 * value). Called during install-mcp to unify CLI and MCP encryption keys.
 */
function writeMachineSecret(secret) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(path.join(CONFIG_DIR, "secret"), secret, { mode: 0o600 });
    return true;
  } catch (err) {
    console.error(`  Warning: could not write ~/.iframer/secret: ${err.message}`);
    return false;
  }
}

function loadClaudeConfig() {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function installClaudeMcp(mcpName, mcpEntry) {
  const config = loadClaudeConfig();
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[mcpName] = mcpEntry;
  fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  return CLAUDE_CONFIG_PATH;
}

function removeClaudeMcp(mcpName) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }

  if (!config.mcpServers || !config.mcpServers[mcpName]) {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }

  delete config.mcpServers[mcpName];
  fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  return { removed: true, path: CLAUDE_CONFIG_PATH };
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findCodexMcpSection(content, mcpName) {
  const lines = content.split("\n");
  const mainHeader = `[mcp_servers.${mcpName}]`;
  const nestedPrefix = `[mcp_servers.${mcpName}.`;

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === mainHeader) {
      start = i;
      break;
    }
  }

  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith(nestedPrefix)) {
      end = i;
      break;
    }
  }

  let removeStart = start;
  if (removeStart > 0 && lines[removeStart - 1].trim() === "") removeStart -= 1;

  let removeEnd = end;
  if (removeEnd < lines.length && lines[removeEnd].trim() === "") removeEnd += 1;

  return { lines, start: removeStart, end: removeEnd };
}

function renderCodexMcpBlock(mcpName, mcpEntry) {
  const lines = [
    `[mcp_servers.${mcpName}]`,
    `command = "${escapeTomlString(mcpEntry.command)}"`,
    `args = [${mcpEntry.args.map((arg) => `"${escapeTomlString(arg)}"`).join(", ")}]`,
  ];

  if (mcpEntry.env && Object.keys(mcpEntry.env).length > 0) {
    lines.push("", `[mcp_servers.${mcpName}.env]`);
    for (const [key, value] of Object.entries(mcpEntry.env)) {
      lines.push(`${key} = "${escapeTomlString(value)}"`);
    }
  }

  return lines.join("\n");
}

function installCodexMcp(mcpName, mcpEntry) {
  fs.mkdirSync(path.dirname(CODEX_CONFIG_PATH), { recursive: true });

  let content = "";
  try {
    content = fs.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {}

  const existing = findCodexMcpSection(content, mcpName);
  if (existing) {
    content = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join("\n");
  }

  const trimmed = content.trimEnd();
  const block = renderCodexMcpBlock(mcpName, mcpEntry);
  fs.writeFileSync(CODEX_CONFIG_PATH, trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`);
  return CODEX_CONFIG_PATH;
}

function removeCodexMcp(mcpName) {
  let content;
  try {
    content = fs.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }

  const existing = findCodexMcpSection(content, mcpName);
  if (!existing) {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }

  const next = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  fs.writeFileSync(CODEX_CONFIG_PATH, next ? `${next}\n` : "");
  return { removed: true, path: CODEX_CONFIG_PATH };
}

// ─── Warm shared server (same daemon the MCP uses) ──────────────────
//
// `execute` routes to the machine's shared local server when possible, so the
// CLI gets a warm browser instead of paying a cold Chrome launch per
// invocation. Isolation: each agent gets its OWN browser slot (instanceId
// derived from a per-agent env id), but all CLI slots share the "default"
// session profile — same cookies/logins the CLI has always had. Lifecycle is
// the daemon's proven one: 5-min browser idle timer, 30-min server idle-exit,
// on-disk PID registry + reaper for crashes.

/** Stable-per-agent browser slot: same agent → same warm browser across
 *  invocations; different agents → different browsers. No identity in the
 *  env → unique slot per invocation (isolated, just cold). */
function deriveCliInstanceId() {
  const raw =
    process.env.IFRAMER_INSTANCE ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.TERM_SESSION_ID;
  const id = raw
    ? require("crypto").createHash("sha256").update(raw).digest("hex").slice(0, 10)
    : require("crypto").randomBytes(5).toString("hex");
  return `cli-${id}`;
}

/** Run a pipeline on the shared warm server. Returns the PipelineResult, or
 *  null when the warm path isn't usable (then the caller falls back to the
 *  in-process browser — today's behavior). */
async function executeViaWarmServer(steps, options) {
  try {
    const { readServerInfo, isPidAlive } = await import("../src/lib/browser/registry.ts");
    const { LocalServerManager } = await import("../src/mcp/local-server.ts");
    const manager = new LocalServerManager();

    // Version skew: a daemon left over from before an update may not know
    // newer step types. Retire it; ensureRunning() spawns a fresh one.
    const info = readServerInfo();
    if (info && isPidAlive(info.pid)) {
      let ownVersion = null;
      try { ownVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version; } catch {}
      // Missing info.version = pre-versioning daemon → also stale.
      if (ownVersion && info.version !== ownVersion) {
        try {
          await fetch(`http://127.0.0.1:${info.port}/shutdown`, {
            method: "POST",
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(3000),
          });
        } catch {}
        // Its shutdown deadline is 10s; wait for the pid, then force it.
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline && isPidAlive(info.pid)) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (isPidAlive(info.pid)) {
          try { process.kill(info.pid, "SIGKILL"); } catch {}
        }
      }
    }

    await manager.ensureRunning();
    const res = await fetch(`${manager.getBaseUrl()}/execute`, {
      method: "POST",
      headers: { "x-api-key": LOCAL_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ steps, options }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Get an in-process Iframer instance (for commands that don't use the shared server) */
let _iframer = null;
async function getLocalIframer() {
  if (_iframer) return _iframer;
  try {
    const { Iframer } = await import("../src/lib/iframer.ts");
    // saveScreenshot returns <publicUrl>/screenshots/<file>, so the files go in that subfolder.
    const publicDir = path.join(os.tmpdir(), "iframer-screenshots");
    const screenshotDir = path.join(publicDir, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });
    _iframer = new Iframer({
      screenshotDir,
      publicUrl: `file://${publicDir}`,
    });
    return _iframer;
  } catch (err) {
    console.error(`  Failed to initialize local iframer: ${err.message}`);
    console.error("  Make sure you're running with bun.");
    process.exit(1);
  }
}

function parseFlag(args, flag, hasValue = true) {
  const idx = args.indexOf(flag);
  if (idx === -1) return hasValue ? undefined : false;
  if (!hasValue) return true;
  return args[idx + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

// Modes the CLI can launch. "extension" is deliberately absent: driving a real
// Chrome tab needs a tab id, which only the `tabs` tool / extension API supply.
// Without this gate a stray --mode extension used to fall through to the mode
// heuristic and open a blank Chrome for Testing window.
const LAUNCH_MODES = ["headless", "binary-headful"];

function parseModeFlag(args) {
  const mode = parseFlag(args, "--mode");
  if (!mode) return undefined;
  if (LAUNCH_MODES.includes(mode)) return mode;
  if (mode === "extension") {
    console.error("\n  --mode extension is not available from the CLI: it needs a tab id.");
    console.error("  Use the `tabs` tool from your agent, or POST /extension/execute with a tabId.\n");
    process.exit(1);
  }
  console.error(`\n  Unknown --mode "${mode}". Use one of: ${LAUNCH_MODES.join(", ")}.\n`);
  process.exit(1);
}

function printResult(data) {
  console.log(JSON.stringify(data, null, 2));
  if (!data.ok) process.exit(1);
}

// ─── Commands ────────────────────────────────────────────────────────

let [,, command, ...args] = process.argv;

// Top-level knowledge flags:
//   iframer --cache                list all cached domains
//   iframer --cache <domain>       show one domain's cached knowledge
//   iframer --clear-cache          wipe all cached knowledge
//   iframer --clear-cache <domain> wipe one domain
// These rewrite into the `knowledge` subcommand below.
if (command === "--cache") {
  command = "knowledge";
  args = args.length > 0 ? ["get", ...args] : ["list"];
} else if (command === "--clear-cache") {
  command = "knowledge";
  args = ["clear", ...args];
}

// Install router: `iframer install [target]` → dispatch to install-<target>
if (command === "install") {
  if (args.length === 0) {
    command = "install-all";
  } else {
    const target = args.shift();
    if (target === "chromium" || target === "chrome") command = "install-chrome";
    else if (target === "mcp") command = "install-mcp";
    else if (target === "extension") command = "install-extension";
    else if (target === "deps" || target === "dependencies" || target === "all") command = "install-all";
    else {
      console.error(`  Unknown install target: ${target}`);
      console.error("  Usage: iframer install <chromium|mcp|extension>");
      process.exit(1);
    }
  }
}

// Remove router: `iframer remove [target]` → dispatch to remove-<target>
if (command === "remove") {
  if (args.length === 0) {
    command = "remove-all";
  } else {
    const target = args.shift();
    if (target === "chromium" || target === "chrome") command = "remove-chrome";
    else if (target === "mcp") command = "remove-mcp";
    else if (target === "extension") command = "remove-extension";
    else {
      console.error(`  Unknown remove target: ${target}`);
      console.error("  Usage: iframer remove <chromium|mcp|extension>");
      process.exit(1);
    }
  }
}

// `iframer extension path` -> print the folder to load unpacked.
if (command === "extension") {
  const sub = args.shift();
  if (sub === "path") command = "extension-path";
  else if (sub === "token") command = "extension-token";
  else {
    console.error("  Usage: iframer extension <path|token>");
    process.exit(1);
  }
}

async function installChrome() {
  const { downloadChrome } = await import("../src/lib/browser/chrome-downloader.ts");
  await downloadChrome();
}

function isMcpInstalled(mcpName) {
  try {
    const config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
    return !!(config.mcpServers && config.mcpServers[mcpName]);
  } catch {
    return false;
  }
}

// ─── Extension auto-pairing (native messaging host) ──────────────────
// Installs a Chrome native-messaging host that hands the pairing token to the
// iframer extension, so no profile ever needs the token pasted by hand. The
// host is locked to the extension's ID, which is pinned by the "key" field in
// extension/manifest.json.
const EXTENSION_ID = "mjfdkiicioigljhenkgaldhihllfdpll";

/** The extension folder inside the installed package (dist/cli.js -> ../extension).
 *  Users load THIS path so `npm update` / `iframer update` refresh it in place. */
function extensionDir() {
  return path.join(__dirname, "..", "extension");
}

/** Numeric semver compare: is `a` strictly newer than `b`? (x.y.z) */
function semverNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

/** After an update: tell the connected extension to reload (it re-reads the
 *  new files npm just wrote), then retire the old server so the next call
 *  spawns the new build. */
async function reloadAndRestartServer(reloadExtension) {
  let info = null;
  try { info = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "server.json"), "utf8")); } catch {}
  if (!info || !info.port) {
    if (reloadExtension) {
      console.log("  (No running iframer server. The new extension files are on disk —");
      console.log("   reload it from chrome://extensions, or it applies next session.)");
    }
    return;
  }
  const base = `http://127.0.0.1:${info.port}`;
  const headers = { "x-api-key": LOCAL_TOKEN, "content-type": "application/json" };
  if (reloadExtension) {
    try { await fetch(`${base}/extension/reload`, { method: "POST", headers }); console.log("  Told the extension to reload."); } catch {}
    await new Promise((r) => setTimeout(r, 1000)); // let the reload reach the extension
  }
  try { await fetch(`${base}/shutdown`, { method: "POST", headers }); console.log("  Retired the old server (a fresh one spawns on next use)."); } catch {}
}
const NM_HOST_NAME = "com.iframer.token";

/** Chromium-family browser data dirs that can hold a NativeMessagingHosts
 *  folder. `always` = create even if the browser dir doesn't exist yet. */
function nativeMessagingBrowserDirs() {
  if (process.platform === "darwin") {
    const as = path.join(HOME_DIR, "Library", "Application Support");
    return [
      { browser: "Chrome", dir: path.join(as, "Google", "Chrome"), always: true },
      { browser: "Chrome Beta", dir: path.join(as, "Google", "Chrome Beta") },
      { browser: "Chrome Canary", dir: path.join(as, "Google", "Chrome Canary") },
      { browser: "Chromium", dir: path.join(as, "Chromium") },
      { browser: "Brave", dir: path.join(as, "BraveSoftware", "Brave-Browser") },
      { browser: "Edge", dir: path.join(as, "Microsoft Edge") },
      { browser: "Vivaldi", dir: path.join(as, "Vivaldi") },
      { browser: "Arc", dir: path.join(as, "Arc", "User Data") },
    ];
  }
  const cfg = process.env.XDG_CONFIG_HOME || path.join(HOME_DIR, ".config");
  return [
    { browser: "Chrome", dir: path.join(cfg, "google-chrome"), always: true },
    { browser: "Chrome Beta", dir: path.join(cfg, "google-chrome-beta") },
    { browser: "Chromium", dir: path.join(cfg, "chromium") },
    { browser: "Brave", dir: path.join(cfg, "BraveSoftware", "Brave-Browser") },
    { browser: "Edge", dir: path.join(cfg, "microsoft-edge") },
    { browser: "Vivaldi", dir: path.join(cfg, "vivaldi") },
  ];
}

// Marker that records the extension is opted into (which browser flavor + which
// browsers got the native host). Its presence is how `iframer update` decides
// whether to reload the extension at all — the extension is an OPTIONAL feature.
function extensionMarkerPath() {
  return path.join(CONFIG_DIR, "extension.json");
}
function readExtensionMarker() {
  try { return JSON.parse(fs.readFileSync(extensionMarkerPath(), "utf8")); } catch { return null; }
}
function extensionInstalled() {
  return !!readExtensionMarker();
}
function writeExtensionMarker(flavor, browsers) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(extensionMarkerPath(), JSON.stringify({ installed: true, flavor, browsers, installedAt: new Date().toISOString() }, null, 2));
}
function clearExtensionMarker() {
  try { fs.unlinkSync(extensionMarkerPath()); } catch {}
}

// Supported extension flavors. "chrome" covers the whole Chromium family (Chrome,
// Brave, Edge, …) since they load the same unpacked extension + native host.
const EXTENSION_FLAVORS = {
  chrome: { label: "Chrome (Chromium family)", supported: true },
  chromium: { label: "Chrome (Chromium family)", supported: true },
  firefox: { label: "Firefox", supported: false },
};

function installExtensionHost() {
  const setup = require("../src/lib/extension/native-host-setup.cjs");
  // Make sure the secret exists — it's what the host will serve.
  resolveLocalToken();

  // Copy the host script somewhere stable (survives the repo moving), plus a
  // wrapper that pins the absolute runtime path — Chrome launches the host
  // without a login shell, so `#!/usr/bin/env node` can miss nvm-style setups.
  const srcHost = path.join(__dirname, "..", "extension", "native-host.cjs");
  if (!fs.existsSync(srcHost)) {
    console.error(`  Host script not found: ${srcHost}`);
    process.exit(1);
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const hostScript = path.join(CONFIG_DIR, "extension-token-host.cjs");
  fs.copyFileSync(srcHost, hostScript);
  const dataDir = process.env.IFRAMER_DATA_DIR || undefined;
  const isWindows = process.platform === "win32";
  const wrapper = path.join(CONFIG_DIR, isWindows ? "extension-token-host.bat" : "extension-token-host.sh");
  if (isWindows) {
    fs.writeFileSync(wrapper, setup.windowsWrapper({ execPath: process.execPath, homeDir: HOME_DIR, dataDir }));
  } else {
    fs.writeFileSync(wrapper, setup.posixWrapper({ execPath: process.execPath, hostScript, dataDir }), { mode: 0o755 });
  }

  const manifest = setup.hostManifest(wrapper, EXTENSION_ID);

  const installed = [];
  if (isWindows) {
    const manifestPath = path.join(CONFIG_DIR, `${NM_HOST_NAME}.json`);
    fs.writeFileSync(manifestPath, manifest);
    for (const { browser, root } of setup.WINDOWS_BROWSERS) {
      try {
        // No shell, so spaces and non-ASCII letters in the path need no quoting.
        require("child_process").execFileSync(
          "reg.exe",
          ["add", setup.windowsRegistryKey(root), "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
          { stdio: "pipe", windowsHide: true },
        );
        installed.push(browser);
      } catch (e) {
        console.error(`  ${browser}: failed (${e.message})`);
      }
    }
    if (installed.length) writeExtensionMarker("chrome", installed);
    return { installed, wrapper };
  }

  for (const { browser, dir, always } of nativeMessagingBrowserDirs()) {
    if (!always && !fs.existsSync(dir)) continue;
    try {
      const nmDir = path.join(dir, "NativeMessagingHosts");
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, `${NM_HOST_NAME}.json`), manifest);
      installed.push(browser);
    } catch (e) {
      console.error(`  ${browser}: failed (${e.message})`);
    }
  }
  if (installed.length) writeExtensionMarker("chrome", installed);
  return { installed, wrapper };
}

function removeExtensionHost() {
  const removed = [];
  if (process.platform === "win32") {
    const setup = require("../src/lib/extension/native-host-setup.cjs");
    for (const { browser, root } of setup.WINDOWS_BROWSERS) {
      try {
        require("child_process").execFileSync("reg.exe", ["delete", setup.windowsRegistryKey(root), "/f"], { stdio: "pipe", windowsHide: true });
        removed.push(browser);
      } catch {} // key wasn't there
    }
  } else {
    for (const { browser, dir } of nativeMessagingBrowserDirs()) {
      const file = path.join(dir, "NativeMessagingHosts", `${NM_HOST_NAME}.json`);
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          removed.push(browser);
        }
      } catch {}
    }
  }
  for (const f of ["extension-token-host.cjs", "extension-token-host.sh", "extension-token-host.bat", `${NM_HOST_NAME}.json`]) {
    try { fs.unlinkSync(path.join(CONFIG_DIR, f)); } catch {}
  }
  return removed;
}

async function removeChrome() {
  const chromeDir = path.join(CONFIG_DIR, "chrome");
  if (!fs.existsSync(chromeDir)) {
    console.log("  Chrome for Testing not found, nothing to remove.");
    return;
  }
  fs.rmSync(chromeDir, { recursive: true, force: true });
  console.log(`  Removed ${chromeDir}`);
}

async function main() {
  switch (command) {

    // ─── Version ─────────────────────────────────────────────────────

    case "--version":
    case "-v":
    case "version": {
      try {
        console.log(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version);
      } catch (e) {
        console.error(`  Could not read the version: ${e.message}`);
        process.exit(1);
      }
      break;
    }

    // ─── Status ──────────────────────────────────────────────────────

    case "status": {
      let server = "not running";
      try {
        const info = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "server.json"), "utf8"));
        const res = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) server = `http://127.0.0.1:${info.port}`;
      } catch {}
      console.log(`  Server: ${server}`);
      if (process.env.IFRAMER_SECRET) console.log("  Auth: IFRAMER_SECRET set");

      // Check local Chrome
      try {
        const { findChromeForTesting, findChrome } = await import("../src/lib/browser/chrome-downloader.ts");
        const cft = findChromeForTesting();
        const system = findChrome();
        console.log(`  Chrome for Testing: ${cft ? cft : "not installed"}`);
        if (!cft && system) console.log(`  System Chrome: ${system}`);
      } catch {}

      // Check display
      const hasDisplay = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;
      console.log(`  Display: ${hasDisplay ? "available" : "none ($DISPLAY not set)"}`);
      console.log(`  Modes: headless${hasDisplay ? ", binary-headful" : ""}`);
      break;
    }

    // ─── Instances (live browser windows) ───────────────────────────

    case "instances":
    case "windows": {
      // List the shared daemon's live browsers and the page each is on, so a
      // task can be reattached by instanceId after an interrupt. Queries the
      // shared server directly (the in-process browser holds nothing lasting).
      let instances = null;
      let serverUp = false;
      try {
        const info = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "server.json"), "utf8"));
        if (info && info.port) {
          serverUp = true;
          const res = await fetch(`http://127.0.0.1:${info.port}/instances`, {
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) instances = (await res.json()).instances;
        }
      } catch { serverUp = false; }

      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(instances || [], null, 2));
        break;
      }
      if (!serverUp) { console.log("  No iframer server running — no live windows."); break; }
      if (!instances) { console.log("  Server is running but didn't report windows (may be an older build — restart it)."); break; }
      if (!instances.length) { console.log("  No live browser windows."); break; }
      console.log(`  ${instances.length} live window(s):\n`);
      for (const i of instances) {
        const busy = i.busy ? "busy" : "idle";
        const age = i.ageSeconds < 90 ? `${i.ageSeconds}s` : `${Math.round(i.ageSeconds / 60)}m`;
        console.log(`  ● ${i.instanceId}  [${i.mode}, ${busy}, ${age}]`);
        console.log(`    ${i.title || "(untitled)"}`);
        console.log(`    ${i.url || "(blank)"}`);
        if (i.sessionProfile !== i.instanceId) console.log(`    session: ${i.sessionProfile}`);
        console.log("");
      }
      console.log("  Reattach: run execute with the same instanceId and act on the");
      console.log("  current page (snapshot/read/find) — don't navigate again.");
      break;
    }

    // ─── Modes ───────────────────────────────────────────────────────

    case "modes": {
      const hasDisplay = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;

      let chromeInstalled = false;
      try {
        const { findChromeForTesting } = await import("../src/lib/browser/chrome-downloader.ts");
        chromeInstalled = !!findChromeForTesting();
      } catch {}

      console.log("  Available browser modes:\n");
      console.log(`    headless          ${chromeInstalled ? "✓ available" : "✗ Chrome for Testing not installed"}`);
      console.log(`    binary-headful    ${chromeInstalled && hasDisplay ? "✓ available" : "✗ " + (!chromeInstalled ? "Chrome not installed" : "no display")}`);

      if (!chromeInstalled) {
        console.log("\n  Install Chrome for Testing:");
        console.log("    iframer install-chrome");
      }
      break;
    }

    // ─── Install Chrome ──────────────────────────────────────────────

    case "install-chrome": {
      try {
        await installChrome();
      } catch (err) {
        console.error(`  Failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    // ─── Knowledge Cache ─────────────────────────────────────────────

    case "knowledge": {
      const sub = args[0];
      const { readKnowledge, listKnowledge, clearKnowledge, sanitizeDomain, getKnowledgeDir } =
        await import("../src/lib/knowledge.ts");

      if (!sub || sub === "list") {
        const entries = listKnowledge();
        if (entries.length === 0) {
          console.log(`  No cached knowledge.`);
          console.log(`  Cache location: ${getKnowledgeDir()}`);
        } else {
          console.log(`  ${entries.length} domain${entries.length === 1 ? "" : "s"} cached (${getKnowledgeDir()}):\n`);
          for (const e of entries) {
            const size = e.sizeBytes < 1024 ? `${e.sizeBytes}B` : `${(e.sizeBytes / 1024).toFixed(1)}KB`;
            console.log(`    ${e.domain.padEnd(30)} ${e.lastMode.padEnd(16)} ${e.lastVerified}  ${size}`);
          }
          console.log(`\n  Inspect one: iframer --cache <domain>`);
          console.log(`  Clear all:   iframer --clear-cache`);
        }
        break;
      }

      if (sub === "get") {
        const domain = args[1];
        if (!domain) {
          console.error("  Usage: iframer knowledge get <domain>");
          process.exit(1);
        }
        const md = readKnowledge(domain);
        if (!md) {
          console.log(`  No cache for ${sanitizeDomain(domain)}.`);
          process.exit(1);
        }
        console.log(md);
        break;
      }

      if (sub === "clear") {
        const domain = args[1];
        const { removed } = clearKnowledge(domain);
        if (domain) {
          console.log(`  Cleared ${removed} entr${removed === 1 ? "y" : "ies"} for ${sanitizeDomain(domain)}.`);
        } else {
          console.log(`  Cleared ${removed} cached domain${removed === 1 ? "" : "s"}.`);
        }
        break;
      }

      console.error(`  Unknown knowledge action: ${sub}`);
      console.error("  Usage: iframer knowledge <list|get <domain>|clear [domain]>");
      process.exit(1);
    }

    // ─── Install All Dependencies ────────────────────────────────────

    case "install-all": {
      console.log("  Installing iframer-toolkit dependencies...\n");
      console.log("  [1/2] Chrome for Testing");
      let chromeAlreadyInstalled = false;
      try {
        const { findChromeForTesting } = await import("../src/lib/browser/chrome-downloader.ts");
        chromeAlreadyInstalled = !!findChromeForTesting();
      } catch {}
      if (chromeAlreadyInstalled) {
        console.log("  Already installed, skipping.");
      } else {
        try {
          await installChrome();
        } catch (err) {
          console.error(`  Chrome install failed: ${err.message}`);
          process.exit(1);
        }
      }
      console.log("\n  [2/2] MCP server registration");
      const mcpAlreadyInstalled = isMcpInstalled("iframer");
      if (mcpAlreadyInstalled) {
        console.log("  Already installed, skipping.");
        console.log("\n  All dependencies ready.\n");
        break;
      }
      command = "install-mcp";
      return main();
    }

    // ─── Execute (pipeline) ──────────────────────────────────────────

    case "execute": {
      // Keep info-level daemon/knowledge chatter out of the output an agent
      // reads — it's ~140 tokens/task of noise the MCP path never pays (its
      // logs go to the server log file). --verbose or LOG_LEVEL restores it.
      if (!process.env.LOG_LEVEL && !hasFlag(args, "--verbose")) process.env.LOG_LEVEL = "warn";
      let pipeline;

      // Accept JSON file or inline JSON
      const input = args[0];
      if (!input) {
        console.error("  Usage: iframer execute <pipeline.json | inline-json>");
        console.error("    iframer execute '[{\"type\":\"navigate\",\"url\":\"https://example.com\"},{\"type\":\"screenshot\"}]'");
        console.error("    iframer execute pipeline.json");
        console.error("\n  Options:");
        console.error("    --mode <headless|binary-headful>");
        console.error("    --capture-api        Record XHR/fetch requests");
        console.error("    --continue-on-error  Don't stop on step failure");
        console.error("    --timeout <ms>       Stale state timeout (default: 20000)");
        console.error("    --json               Print raw PipelineResult JSON (default: compact agent-readable text)");
        console.error("    --in-process         Skip the shared warm server; run a private in-process browser");
        process.exit(1);
      }

      // Parse steps (+ inline options: a {steps, options} object is honored)
      let steps, inputOptions = {};
      if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options) inputOptions = parsed.options;
      } else if (fs.existsSync(input)) {
        const parsed = JSON.parse(fs.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options) inputOptions = parsed.options;
      } else {
        console.error(`  File not found: ${input}`);
        process.exit(1);
      }

      const options = { ...inputOptions };  // flags below override
      const mode = parseModeFlag(args);
      if (mode) options.mode = mode;
      if (hasFlag(args, "--capture-api")) options.captureApi = true;
      if (hasFlag(args, "--continue-on-error")) options.continueOnError = true;
      const timeout = parseFlag(args, "--timeout");
      if (timeout) options.staleTimeoutMs = parseInt(timeout);

      // Warm path: shared daemon, per-agent browser slot, shared "default"
      // session. --in-process forces the old cold path (also the fallback).
      let result;
      if (!hasFlag(args, "--in-process")) {
        const warmOptions = { ...options };
        if (!warmOptions.instanceId) {
          // Explicit instanceId keeps full legacy semantics (own session row).
          warmOptions.instanceId = deriveCliInstanceId();
          warmOptions.sessionProfile = "default";
        }
        result = await executeViaWarmServer(steps, warmOptions);
      }
      if (!result) {
        const iframer = await getLocalIframer();
        result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options });
      }

      // Default output = the same compact agent-facing text the MCP produces
      // (schema-free CLI usage gets the lean per-task tokens too). --json
      // keeps the raw PipelineResult for scripts.
      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const { formatExecuteResult } = await import("../src/lib/format-result.ts");
        console.log(formatExecuteResult(result).join("\n"));
        let shot = result.error?.pageState?.screenshotUrl ?? result.finalState?.screenshotUrl;
        // Warm-server screenshots are http:// links that die when the daemon
        // idle-exits — persist to a local file so the link outlives it.
        if (shot && shot.startsWith("http")) {
          try {
            const res = await fetch(shot, { signal: AbortSignal.timeout(10_000) });
            if (res.ok) {
              const dir = path.join(os.tmpdir(), "iframer-screenshots", "screenshots");
              fs.mkdirSync(dir, { recursive: true });
              const file = path.join(dir, `state-${Date.now()}.jpg`);
              fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
              shot = `file://${file}`;
            }
          } catch {}
        }
        if (shot) console.log(`\nScreenshot: ${shot}`);
      }
      // Explicit exit: the in-process browser keeps the event loop alive, so
      // without this the CLI hangs after printing (long-standing quirk that
      // the old raw-JSON path shared).
      process.exit(result.ok ? 0 : 1);
    }

    // ─── Browse (quick headless fetch) ───────────────────────────────

    case "browse":
    case "fetch": {
      const url = args[0];
      if (!url) {
        console.error("  Usage: iframer browse <url> [options]");
        console.error("    --extract <js>       Evaluate JS and return result");
        console.error("    --html               Return full page HTML");
        console.error("    --wait-for <sel>     Wait for CSS selector");
        console.error("    --sessionless        Skip session persistence");
        process.exit(1);
      }
      const options = { url };
      const extract = parseFlag(args, "--extract");
      if (extract) options.extract = extract;
      if (hasFlag(args, "--html")) options.returnHtml = true;
      if (hasFlag(args, "--sessionless")) options.sessionless = true;
      const waitFor = parseFlag(args, "--wait-for");
      if (waitFor) options.waitForSelector = waitFor;

      const iframer = await getLocalIframer();
      printResult(await iframer.fetch(LOCAL_USER_ID, LOCAL_TOKEN, options));
      break;
    }

    // ─── Screenshot ──────────────────────────────────────────────────

    case "screenshot": {
      const url = args[0];
      if (!url || !url.startsWith("http")) {
        console.error("  Usage: iframer screenshot <url> [--mode <mode>] [--annotate]");
        process.exit(1);
      }

      // One-shot: navigate + screenshot
      const mode = parseModeFlag(args) || "headless";
      const annotate = hasFlag(args, "--annotate");

      const steps = [
        { type: "navigate", url, waitUntil: "networkidle" },
        { type: "wait", ms: 2000 },
        { type: "screenshot", annotate },
      ];

      const iframer = await getLocalIframer();
      const result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options: { mode } });

      if (result.ok && result.finalState?.screenshotUrl) {
        console.log(`  Screenshot: ${result.finalState.screenshotUrl}`);
        if (annotate) {
          const snapStep = result.results?.find(r => r.step?.type === "screenshot");
          if (snapStep?.result?.refs) {
            console.log("\n  Refs:");
            console.log(snapStep.result.refs);
          }
        }
      } else {
        printResult(result);
      }
      break;
    }

    // ─── Session management ──────────────────────────────────────────

    case "session": {
      const sub = args[0];

      if (sub === "stop") {
        // The warm daemon owns the browsers now — "task done" must close
        // THEM, immediately, not just the (empty) in-process instance.
        // Saves state first, then tears down idle browsers; a browser busy
        // with another agent's run is left alone (its own idle timer or
        // that agent's stop reclaims it).
        let stopped = false;
        try {
          const info = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "server.json"), "utf8"));
          if (info && info.port) {
            const res = await fetch(`http://127.0.0.1:${info.port}/interactive/stop`, {
              method: "POST",
              headers: { "x-api-key": LOCAL_TOKEN },
              signal: AbortSignal.timeout(15_000),
            });
            if (res.ok) {
              const data = await res.json();
              console.log(`  Session stopped. State saved: ${data.sessionSaved}`);
              stopped = true;
            }
          }
        } catch {}
        if (!stopped) {
          const iframer = await getLocalIframer();
          const result = await iframer.stopSession(LOCAL_USER_ID, LOCAL_TOKEN);
          console.log(`  Session stopped. State saved: ${result.sessionSaved}`);
        }

      } else if (sub === "clear") {
        const iframer = await getLocalIframer();
        await iframer.clearSession(LOCAL_USER_ID);
        console.log("  Session data cleared.");

      } else if (sub === "status") {
        console.log("  Sessions live within execute calls. Run `iframer instances` to see open browsers.");

      } else {
        console.error("  Usage: iframer session <stop|clear|status>");
        process.exit(1);
      }
      break;
    }

    // ─── Credentials ─────────────────────────────────────────────────

    case "credentials": {
      const sub = args[0];

      if (sub === "add") {
        let domain = args[1];
        const body = {};

        const hasFlags = args.some(a => a.startsWith("--"));

        if (hasFlags && domain) {
          body.domain = domain;
          for (let i = 2; i < args.length; i++) {
            if (args[i] === "--username" && args[i + 1]) body.username = args[++i];
            else if (args[i] === "--password" && args[i + 1]) body.password = args[++i];
            else if (args[i] === "--totp-secret" && args[i + 1]) body.totp_secret = args[++i];
          }
        } else {
          console.log("");
          if (!domain) {
            domain = await prompt("  Domain (e.g. github.com): ");
            if (!domain) { console.error("  Domain is required."); process.exit(1); }
          }
          body.domain = domain;

          console.log(`\n  Storing credentials for ${domain}\n`);
          body.username = await prompt("  Username / email: ");
          body.password = await promptHidden("  Password: ");

          const totp = await prompt("  TOTP secret (press Enter to skip): ");
          if (totp) body.totp_secret = totp;
        }

        if (!body.username && !body.password) {
          console.error("  Must provide at least username or password.");
          process.exit(1);
        }

        const iframer = await getLocalIframer();
        await iframer.storeCredential(LOCAL_USER_ID, LOCAL_TOKEN, body);
        console.log(`\n  Credentials stored for ${domain}`);

      } else if (sub === "list") {
        const iframer = await getLocalIframer();
        const domains = await iframer.listCredentials(LOCAL_USER_ID);
        if (domains.length === 0) {
          console.log("  No credentials stored.");
        } else {
          console.log("  Stored credentials:");
          for (const d of domains) console.log(`    - ${d}`);
        }

      } else if (sub === "remove") {
        const domain = args[1];
        if (!domain) { console.error("  Usage: iframer credentials remove <domain>"); process.exit(1); }
        const iframer = await getLocalIframer();
        await iframer.deleteCredential(LOCAL_USER_ID, domain);
        console.log(`  Credentials for ${domain} removed.`);

      } else {
        console.error("  Usage: iframer credentials <add|list|remove>");
        process.exit(1);
      }
      break;
    }

    // ─── Reverse Engineer ────────────────────────────────────────────

    case "reverse-engineer": {
      const input = args[0];
      if (!input) {
        console.error("  Usage: iframer reverse-engineer <pipeline.json | url>");
        console.error("    --output <dir>       Output directory (default: ./<domain>/)");
        console.error("    --typed              Generate TypeScript instead of JS");
        console.error("    --mode <mode>        Browser mode");
        process.exit(1);
      }

      let steps;
      if (input.startsWith("http")) {
        steps = [
          { type: "navigate", url: input, waitUntil: "networkidle" },
          { type: "wait", ms: 5000 },
        ];
      } else if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else if (fs.existsSync(input)) {
        const parsed = JSON.parse(fs.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else {
        console.error(`  Not a URL or file: ${input}`);
        process.exit(1);
      }

      const options = { captureApi: true };
      const mode = parseModeFlag(args);
      if (mode) options.mode = mode;

      const iframer = await getLocalIframer();
      const result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options });

      if (result.capturedApi && result.capturedApi.length > 0) {
        const outputDir = parseFlag(args, "--output") || `./${result.capturedApi[0].domain}`;
        fs.mkdirSync(outputDir, { recursive: true });

        // Save raw captured data
        fs.writeFileSync(path.join(outputDir, "captured-api.json"), JSON.stringify(result.capturedApi, null, 2));
        console.log(`  Captured ${result.capturedApi.reduce((sum, api) => sum + api.endpoints.length, 0)} endpoints`);
        console.log(`  Saved to: ${outputDir}/captured-api.json`);

        for (const api of result.capturedApi) {
          console.log(`\n  ${api.domain} (${api.baseUrl}):`);
          for (const ep of api.endpoints) {
            console.log(`    ${ep.method} ${ep.path} → ${ep.responseStatus}`);
          }
        }
      } else {
        console.log("  No API calls captured.");
        if (!result.ok) printResult(result);
      }
      break;
    }

    // ─── In-page capture kit (any agent browser, T3 Code first) ─────

    case "refresh": {
      // Rewrites files copied out of the package: the in-page kit and the /iframer skill.
      const kit = await import("../src/lib/kit/index.ts");
      const kitPath = kit.writeKit({});
      const skill = installSkill();
      console.log(`  Kit: ${kitPath}`);
      console.log(skill ? "  Skill: ~/.claude/commands/iframer.md" : "  Skill: not found in the package, skipped");
      break;
    }

    case "kit": {
      const kit = await import("../src/lib/kit/index.ts");
      const target = parseFlag(args, "--for") || "t3";
      if (!kit.KIT_TARGETS.includes(target)) {
        console.error(`  Unknown --for ${target}. Use one of: ${kit.KIT_TARGETS.join(", ")}`);
        process.exit(1);
      }
      const mode = parseFlag(args, "--mode");
      if (mode && mode !== "hook" && mode !== "passive") {
        console.error("  --mode must be hook (default) or passive (no patching, URLs + forms only)");
        process.exit(1);
      }
      const opts = { mode, hostFilter: parseFlag(args, "--host-filter") };
      if (hasFlag(args, "--print")) {
        process.stdout.write(kit.kitSource(opts));
        break;
      }
      const outFile = parseFlag(args, "--out");
      const kitPath = kit.writeKit(opts, outFile ? path.resolve(outFile) : undefined);
      const client = parseFlag(args, "--client");
      console.log(kit.kitInstructions(target, kitPath, client ? path.resolve(client) : undefined));
      break;
    }

    case "ingest": {
      const kit = await import("../src/lib/kit/index.ts");
      const json = hasFlag(args, "--json");
      let input = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
      if (!input && hasFlag(args, "--latest")) {
        input = kit.findLatestCapture();
        if (!input) {
          console.error(`  No capture from the last 24h in: ${kit.downloadDirs().join(", ")}`);
          console.error("  Run window.__ifk.dump() in the page first, or pass the file path.");
          process.exit(1);
        }
      }
      if (!input) {
        console.error("  Usage: iframer ingest <capture file | - | --latest>");
        console.error("    --latest             Newest capture in T3 Code's downloads or ~/Downloads");
        console.error("    --out <dir>          Output directory (default: ./<host>-api/)");
        console.error("    --typed              Also write client.d.ts");
        console.error("    --keep               Keep the capture file (default: deleted after ingest)");
        console.error("    --no-knowledge       Don't update ~/.iframer/knowledge");
        console.error("    --strict             Refuse the capture on any secret-looking value instead of replacing it");
        console.error("    --json               One-line JSON summary");
        process.exit(1);
      }
      const fromStdin = input === "-";
      const raw = fromStdin ? fs.readFileSync(0, "utf8") : fs.readFileSync(input, "utf8");
      const removeInput = () => {
        if (fromStdin || hasFlag(args, "--keep")) return;
        try { fs.unlinkSync(input); } catch {}
      };

      let report;
      try {
        report = kit.parseCapture(raw);
      } catch (e) {
        console.error(`  ${e.message}`);
        process.exit(1);
      }

      // Swap secret-looking values for placeholders and keep the rest.
      // --strict keeps the old behavior: refuse the whole capture.
      let redacted = [];
      if (!hasFlag(args, "--strict")) ({ report, redacted } = kit.redactCapture(report));
      const findings = kit.scanCapture(report);
      if (findings.length) {
        // Fail closed: the capture held something value-like, so it is not safe to keep around.
        removeInput();
        if (json) console.log(JSON.stringify({ ok: false, error: "privacy", findings }));
        else {
          console.error(`  Refused: ${findings.length} value(s) look like secrets or personal data.`);
          for (const f of findings.slice(0, 10)) console.error(`    ${f.kind}: ${f.sample} at ${f.where}`);
          console.error(hasFlag(args, "--keep") ? `  File kept: ${input}` : "  The capture file was deleted. Nothing was written.");
        }
        process.exit(2);
      }

      const map = kit.buildApiMap(report);
      const host = new URL(report.origin).host;
      const outDir = path.resolve(parseFlag(args, "--out") || `./${host.replace(/[^a-z0-9.-]/gi, "_")}-api`);
      fs.mkdirSync(outDir, { recursive: true });
      const written = [];
      const write = (name, body) => { const p = path.join(outDir, name); fs.writeFileSync(p, body); written.push(p); };
      write("api.json", JSON.stringify(map, null, 2) + "\n");
      write("client.js", kit.renderClient(map));
      if (hasFlag(args, "--typed")) write("client.d.ts", kit.renderTypes(map));

      if (!hasFlag(args, "--no-knowledge")) {
        const { mergeKnowledge } = await import("../src/lib/knowledge.ts");
        const authHeaders = [...new Set(map.endpoints.flatMap((e) => e.authHeaders))];
        const c = report.coverage;
        mergeKnowledge(host, {
          lastMode: `kit-${report.kit?.mode || "hook"}`,
          browserRequired: true,
          auth: { type: authHeaders.length ? "session cookies + headers" : "session cookies", headers: authHeaders.length ? authHeaders : undefined },
          endpoints: map.endpoints.map((e) => ({
            method: e.method,
            path: e.origin === map.origin ? e.path : `${e.origin}${e.path}`,
            description: kit.describeEndpoint(e),
            example: e.origin === map.origin ? `window.__ifk.call(${JSON.stringify(e.method)}, ${JSON.stringify(e.path)})` : undefined,
            firstSeen: report.capturedAt,
          })),
          notes: [
            `In-page capture: ${c.seen} seen, ${c.withPayload} with payload, ${c.pathOnly} path only. Not complete: ${c.blindSpots.join(", ")}.`,
            "Replay in the page (window.__ifk.call): HttpOnly cookies never leave the browser.",
            ...map.identity.headers.map((h) => `Auth header ${h.name}: ${h.source}.`),
            ...(redacted.length ? [`Private values replaced with placeholders in ${new Set(redacted.map((r) => r.where)).size} endpoint(s); see privateValues in api.json and pass them per call.`] : []),
          ],
        });
      }
      removeInput();

      const c = report.coverage;
      if (json) {
        console.log(JSON.stringify({ ok: true, origin: report.origin, endpoints: map.endpoints.length, coverage: { seen: c.seen, withPayload: c.withPayload, pathOnly: c.pathOnly }, redacted: redacted.map((r) => ({ kind: r.kind, at: r.where })), files: written, inputDeleted: !fromStdin && !hasFlag(args, "--keep") }));
      } else {
        console.log(`  ${report.origin}: ${map.endpoints.length} endpoints (${c.withPayload} with payload, ${c.pathOnly} path only). Not complete.`);
        for (const h of map.identity.headers) console.log(`  Identity: ${h.name} <- ${h.source}`);
        if (redacted.length) {
          console.log(`  Replaced ${redacted.length} secret-looking value(s) with placeholders ({id}, {key}, "string"):`);
          for (const r of redacted.slice(0, 10)) console.log(`    ${r.kind} at ${r.where}`);
        }
        for (const e of map.endpoints.slice(0, 40)) console.log(`    ${e.method.padEnd(6)} ${e.origin === map.origin ? e.path : e.origin + e.path}  -> ${e.functionName}`);
        if (map.endpoints.length > 40) console.log(`    … ${map.endpoints.length - 40} more in api.json`);
        console.log(`  Wrote: ${written.join(", ")}`);
        if (!fromStdin && !hasFlag(args, "--keep")) console.log("  Capture file deleted.");
      }
      break;
    }

    // ─── Install MCP ─────────────────────────────────────────────────

    case "install-mcp": {
      const runtime = resolveMcpRuntime();
      console.log(runtime.message);
      const mcpName = "iframer";

      // Resolve the encryption token. Precedence:
      //   1. IFRAMER_SECRET env var or repo .env (dev override)
      //   2. Already-existing ~/.iframer/secret (previous install)
      //   3. Freshly generated random 32-byte hex (first-time install)
      let secret = resolveIframerSecret();
      let secretSource = secret ? "env/.env" : null;
      if (!secret) {
        try {
          secret = fs.readFileSync(path.join(CONFIG_DIR, "secret"), "utf8").trim();
          if (secret) secretSource = "~/.iframer/secret";
        } catch {}
      }
      if (!secret) {
        secret = require("crypto").randomBytes(32).toString("hex");
        secretSource = "generated";
      }

      // Persist to ~/.iframer/secret so the CLI (run from any shell) uses the
      // same encryption key as the MCP server. This unifies the credential
      // store across both entry points.
      writeMachineSecret(secret);

      const mcpEntry = { command: runtime.command, args: runtime.args };
      // Bake the token into the MCP config env so the server has it at spawn
      // time without needing to read the file. Both paths (env var + file)
      // resolve to the same value.
      mcpEntry.env = { IFRAMER_SECRET: secret };

      const claudeConfigPath = installClaudeMcp(mcpName, mcpEntry);
      const codexConfigPath = installCodexMcp(mcpName, mcpEntry);

      // Install the /iframer skill command so the agent knows how to use the
      // MCP tools correctly. The skill file ships with the package and gets
      // copied to the client's commands directory.
      const skillInstalled = installSkill();

      console.log(`\n  ${mcpName} MCP installed!`);
      console.log(`  Encryption key: ${secretSource} → ~/.iframer/secret`);
      console.log(`  Claude Code config written to: ${claudeConfigPath}`);
      console.log(`  Codex config written to: ${codexConfigPath}`);
      if (skillInstalled) console.log("  Skill /iframer installed for Claude Code");
      console.log("  Restart Claude Code and Codex to activate the iframer tools.\n");
      break;
    }

    // ─── Remove Chrome ───────────────────────────────────────────────

    case "remove-chrome": {
      await removeChrome();
      break;
    }

    // ─── Remove All ──────────────────────────────────────────────────

    case "remove-all": {
      console.log("  Removing iframer-toolkit dependencies...\n");
      console.log("  [1/2] Chrome for Testing");
      await removeChrome();
      console.log("\n  [2/2] MCP server registration");
      command = "remove-mcp";
      return main();
    }

    // ─── Telemetry report ────────────────────────────────────────────

    case "telemetry": {
      const file = path.join(CONFIG_DIR, "telemetry.jsonl");
      if (args.includes("--clear")) {
        try { fs.unlinkSync(file); } catch {}
        console.log("  Telemetry log cleared.");
        break;
      }
      let lines;
      try {
        lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
      } catch {
        console.log("  No telemetry recorded yet. It logs automatically as agents use iframer");
        console.log("  (new MCP sessions only — restart a session if it predates telemetry).");
        break;
      }
      const sessions = new Map(); // session -> {calls, tokens, tools: Map, defTokens, first, last}
      for (const line of lines) {
        let r;
        try { r = JSON.parse(line); } catch { continue; }
        let s = sessions.get(r.session);
        if (!s) { s = { calls: 0, tokens: 0, defTokens: 0, tools: new Map(), first: r.ts, last: r.ts }; sessions.set(r.session, s); }
        s.last = r.ts;
        if (r.kind === "definitions") s.defTokens = r.estTokens || 0;
        else if (r.kind === "call") {
          s.calls++;
          s.tokens += r.estTokens || 0;
          const t = s.tools.get(r.tool) || { calls: 0, tokens: 0 };
          t.calls++; t.tokens += r.estTokens || 0;
          s.tools.set(r.tool, t);
        }
      }
      const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
      let grandCalls = 0, grandTokens = 0;
      const toolTotals = new Map();
      for (const s of sessions.values()) {
        grandCalls += s.calls; grandTokens += s.tokens;
        for (const [name, t] of s.tools) {
          const g = toolTotals.get(name) || { calls: 0, tokens: 0 };
          g.calls += t.calls; g.tokens += t.tokens;
          toolTotals.set(name, g);
        }
      }
      console.log(`\n  iframer MCP token telemetry (estimated at ~4 chars/token, local only)\n`);
      console.log(`  All time: ${sessions.size} session(s), ${grandCalls} call(s), ~${fmt(grandTokens)} tokens of tool traffic`);
      console.log(`\n  Per tool (all time):`);
      for (const [name, t] of [...toolTotals.entries()].sort((a, b) => b[1].tokens - a[1].tokens)) {
        console.log(`    ${name.padEnd(18)} ${String(t.calls).padStart(4)} calls  ~${fmt(t.tokens).padStart(7)} tokens`);
      }
      console.log(`\n  Recent sessions:`);
      const recent = [...sessions.entries()].slice(-5);
      for (const [id, s] of recent) {
        console.log(`    ${id.padEnd(20)} ${String(s.calls).padStart(4)} calls  ~${fmt(s.tokens).padStart(7)} tokens (+~${fmt(s.defTokens)} definitions overhead, once per session)`);
      }
      console.log(`\n  Note: definitions overhead excludes zod schema text — Claude Code's /context`);
      console.log(`  shows the exact per-session definition footprint. Clear log: iframer telemetry --clear\n`);
      break;
    }

    // ─── Extension auto-pairing ──────────────────────────────────────

    case "install-extension": {
      // Browser flavor (optional feature — user opts in per browser).
      const flavor = (args[0] || "chrome").toLowerCase();
      const spec = EXTENSION_FLAVORS[flavor];
      if (!spec) {
        console.error(`  Unknown browser: ${flavor}. Supported: ${Object.keys(EXTENSION_FLAVORS).filter((k, i, a) => a.indexOf(k) === i).join(", ")}`);
        console.error("  Usage: iframer install extension chrome");
        process.exit(1);
      }
      if (!spec.supported) {
        console.log(`  ${spec.label} extension isn't available yet — coming soon.`);
        console.log("  For now: iframer install extension chrome");
        break;
      }

      console.log(`  Installing the iframer extension for ${spec.label}...\n`);
      const { installed, wrapper } = installExtensionHost();
      if (installed.length === 0) {
        console.log("  No Chromium-family browser directories found — nothing installed.");
        break;
      }
      console.log(`  Pairing host installed for: ${installed.join(", ")}`);

      // Prove it works now, instead of failing silently inside the browser later.
      const hostTest = await require("../src/lib/extension/native-host-setup.cjs").testHost(wrapper);
      if (hostTest.ok && hostTest.info && hostTest.info.token) {
        console.log("  Pairing host test: OK");
      } else {
        console.log(`  Pairing host test FAILED: ${hostTest.error || "host returned no token"}`);
        console.log("  Auto-pairing won't work. To pair by hand, run `iframer extension token`");
        console.log("  and paste the result into the extension popup.");
      }

      // Keep the server up, so the extension connects as soon as it's loaded.
      try {
        const { LocalServerManager } = await import("../src/mcp/local-server.ts");
        const manager = new LocalServerManager();
        await manager.ensureRunning();
        console.log(`  Server running: ${manager.getBaseUrl()}`);
      } catch (e) {
        console.log(`  Server failed to start: ${e.message}`);
        console.log("  The extension can't connect until it runs. Log: ~/.iframer/local-server.log");
      }

      console.log("\n  ┌─ ONE manual step to finish ────────────────────────────────┐");
      console.log("  │  1. Open  chrome://extensions");
      console.log("  │  2. Turn on  Developer mode  (top-right)");
      console.log("  │  3. Click  Load unpacked  and select this folder:");
      console.log(`  │       ${extensionDir()}`);
      console.log("  └────────────────────────────────────────────────────────────┘");
      console.log("\n  Load it from THAT path (inside the installed package) so `iframer");
      console.log("  update` can refresh it in place. Once loaded it pairs itself — no");
      console.log("  token pasting. Get the path again anytime with: iframer extension path\n");
      break;
    }

    case "extension-path": {
      console.log(extensionDir());
      break;
    }

    case "extension-token": {
      console.log(LOCAL_TOKEN);
      break;
    }

    // ─── Update (npm as the extension update channel) ────────────────

    case "update": {
      const checkOnly = args.includes("--check");
      const pkgRoot = path.join(__dirname, "..");
      const isDev = fs.existsSync(path.join(pkgRoot, ".git"));
      let installed = "unknown";
      try { installed = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")).version; } catch {}
      let latest = null;
      try { latest = require("child_process").execSync("npm view iframer-toolkit version", { encoding: "utf8" }).trim(); } catch {}

      console.log(`  installed: v${installed}${latest ? `    latest: v${latest}` : "    (could not reach npm registry)"}`);
      if (!latest) { if (checkOnly) break; }
      const newerAvailable = latest && semverNewer(latest, installed);
      if (latest && !newerAvailable) {
        console.log(installed === latest ? "  Already up to date." : `  You're on v${installed}, ahead of npm's v${latest}. Nothing to do.`);
        break;
      }
      if (checkOnly) {
        if (newerAvailable) console.log("  Update available — run `iframer update` to apply.");
        break;
      }
      if (isDev) {
        console.log("\n  This is a dev/linked install (the package has a .git repo).");
        console.log("  Update it with `git pull && bun run build`, not npm.");
        break;
      }

      console.log("\n  Updating via npm...");
      try {
        require("child_process").execSync("npm install -g iframer-toolkit@latest", { stdio: "inherit" });
      } catch {
        console.error("\n  npm install failed. If it's a permissions error:");
        console.error("    sudo npm install -g iframer-toolkit@latest");
        process.exit(1);
      }
      // The new version's files: rewrite the in-page kit and the /iframer skill
      // so agents don't keep uploading the old ones. Runs the NEW binary.
      try { require("child_process").execSync("iframer refresh", { stdio: "inherit" }); }
      catch { console.error("  Could not refresh the kit and skill. Run: iframer refresh"); }
      console.log();
      const hasExt = extensionInstalled();
      await reloadAndRestartServer(hasExt);
      console.log(`\n  Updated to v${latest || "latest"}.${hasExt ? "" : " (Extension not installed — nothing to reload.)"}\n`);
      break;
    }

    case "remove-extension": {
      const removed = removeExtensionHost();
      clearExtensionMarker();
      if (removed.length === 0) {
        console.log("  Extension pairing host was not installed.");
      } else {
        console.log(`  Pairing host removed from: ${removed.join(", ")}`);
        console.log("  (Also remove it from chrome://extensions if you loaded it there.)");
      }
      break;
    }

    // ─── Remove MCP ──────────────────────────────────────────────────

    case "remove-mcp": {
      // `--dev` removes the iframer-dev entry older versions could register.
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      const claudeResult = removeClaudeMcp(mcpName);
      const codexResult = removeCodexMcp(mcpName);
      const skillRemoved = removeSkill();

      if (!claudeResult.removed && !codexResult.removed && !skillRemoved) {
        console.log(`  ${mcpName} MCP is not installed in Claude Code or Codex.`);
        break;
      }

      console.log(`\n  ${mcpName} MCP removed!`);
      if (claudeResult.removed) console.log(`  Claude Code config updated: ${claudeResult.path}`);
      if (codexResult.removed) console.log(`  Codex config updated: ${codexResult.path}`);
      if (skillRemoved) console.log("  Skill /iframer removed from Claude Code");
      console.log("  Restart Claude Code and Codex for the change to take effect.\n");
      break;
    }

    // ─── Help ────────────────────────────────────────────────────────

    default:
      console.log(`
  iframer — browser automation for AI agents

  Pipeline:
    execute <pipeline.json|json>    Run a pipeline of browser steps
      --mode <mode>                 Force browser mode (headless, binary-headful)
      --capture-api                 Record XHR/fetch requests during execution
      --continue-on-error           Don't stop on step failure
      --timeout <ms>                Stale state timeout (default: 20000)
      --json                        Print raw PipelineResult JSON
      --in-process                  Skip the shared warm server; run a private in-process browser

  Quick actions:
    browse <url> [options]          Headless fetch with JS rendering
      --extract <js>                Evaluate JS expression and return result
      --html                        Return full page HTML
      --wait-for <selector>         Wait for element before extracting
      --sessionless                 Skip session persistence
    screenshot <url> [options]      Take a screenshot of a URL
      --mode <mode>                 Browser mode
      --annotate                    Overlay element badges with refs
    reverse-engineer <url|file>     Capture API calls a site makes
      --output <dir>                Save directory
      --typed                       Generate TypeScript
      --mode <mode>                 Browser mode

  Capture in a browser iframer doesn't control (T3 Code, Playwright MCP, ...):
    kit                             Write the in-page kit, print the agent steps
      --for <t3|playwright-mcp|any> Which browser tool's steps to print (default: t3)
      --mode passive                No patching: URLs + forms only (for sites that detect it)
      --host-filter <regex>         Only record matching hosts
      --client <path>               Also print steps to load a generated client.js
      --print                       Print the kit source instead (for tools without upload)
    ingest <file|-|--latest>        Turn a capture into api.json + client.js + knowledge
      --typed                       Also write client.d.ts
      --out <dir>                   Output directory (default: ./<host>-api/)
      --keep                        Keep the capture file (default: deleted)
      --no-knowledge                Don't update ~/.iframer/knowledge
      --strict                      Refuse on any secret-looking value instead of replacing it
      --json                        One-line JSON summary

  Session:
    session stop                    Save state + close idle browsers on the shared daemon
    session clear                   Wipe all stored session data
    session status                  Check session state

  Credentials:
    credentials add <domain>        Store login credentials (encrypted)
      --username <user>             Username or email
      --password <pass>             Password
      --totp-secret <secret>        TOTP secret for 2FA
    credentials list                List domains with stored credentials
    credentials remove <domain>     Delete credentials for a domain

  Knowledge cache:
    --cache                         List all cached domains
    --cache <domain>                Show knowledge cache for one domain
    --clear-cache                   Wipe all cached knowledge
    --clear-cache <domain>          Wipe one domain's cache
    knowledge list                  Same as --cache
    knowledge get <domain>          Same as --cache <domain>
    knowledge clear [domain]        Same as --clear-cache

  Telemetry:
    telemetry                       Report estimated session tokens consumed by MCP tool calls
    telemetry --clear               Wipe the telemetry log
    (opt out: IFRAMER_TELEMETRY=0 in the MCP env)

  Browser:
    instances                       List live browser windows (instanceId -> current page)
    windows                         Alias of instances
    modes                           Show available browser modes
    install chromium                Download Chrome for Testing
    status                          Show system status

  Setup:
    install                         Install everything (Chromium + MCP)
    install chromium                Download Chrome for Testing
    install mcp                     Register iframer MCP in Claude Code and Codex
    install extension chrome        Install the (optional) browser extension for Chrome/Chromium
    extension path                  Print the extension folder to load in chrome://extensions
    extension token                 Print the pairing token (only needed to pair by hand)
    update                        Update iframer via npm; reload the extension too if it's installed
    refresh                       Rewrite the in-page kit and the /iframer skill from this version (update does it)
    update --check                  Report whether a newer version is available (no install)
    version, --version, -v          Print the installed version
    remove                          Remove everything (Chromium + MCP)
    remove chromium                 Delete downloaded Chrome for Testing
    remove mcp                      Unregister iframer MCP from Claude Code and Codex
    remove extension                Remove the extension pairing host

  Environment:
    IFRAMER_SECRET                  Encryption and pairing secret (default: ~/.iframer/secret)
    IFRAMER_DATA_DIR                Data directory (default: ~/.iframer)
    ANTHROPIC_API_KEY               Needed by the solve-captcha step
`);
      break;
  }
}

main().catch((err) => {
  console.error(`  ${err.message}`);
  process.exit(1);
});
