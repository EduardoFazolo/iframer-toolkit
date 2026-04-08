#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, ".iframer");
const CLAUDE_CONFIG_PATH = path.join(HOME_DIR, ".claude.json");
const CODEX_CONFIG_PATH = path.join(HOME_DIR, ".codex", "config.toml");
const DEFAULT_SERVER = process.env.IFRAMER_URL || "http://localhost:3021";
const API_KEY = process.env.IFRAMER_SECRET;
const USE_LOCAL = process.env.IFRAMER_MODE === "local" || !process.env.IFRAMER_URL;

// ─── Utilities ──────────────────────────────────────────────────────

function openBrowser(url) {
  try {
    if (process.platform === "darwin") execSync(`open "${url}"`);
    else if (process.platform === "win32") execSync(`start "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    console.log(`  Open this URL in your browser:\n  ${url}`);
  }
}

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

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;
  return headers;
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${DEFAULT_SERVER}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  return res.json();
}

async function apiGet(endpoint) {
  const res = await fetch(`${DEFAULT_SERVER}${endpoint}`, { headers: authHeaders() });
  return res.json();
}

async function apiDelete(endpoint) {
  const res = await fetch(`${DEFAULT_SERVER}${endpoint}`, { method: "DELETE", headers: authHeaders() });
  return res.json();
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

  try {
    const envPath = path.join(__dirname, "..", ".env");
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
    if (match) secret = match[1].trim();
  } catch {}

  return secret;
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

/** Get a local Iframer instance (for commands that don't need Docker) */
let _iframer = null;
async function getLocalIframer() {
  if (_iframer) return _iframer;
  try {
    const { Iframer } = await import("../src/lib/iframer.ts");
    const screenshotDir = path.join(os.tmpdir(), "iframer-screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });
    _iframer = new Iframer({
      screenshotDir,
      publicUrl: `file://${screenshotDir}`,
      mode: "local",
    });
    return _iframer;
  } catch (err) {
    console.error(`  Failed to initialize local iframer: ${err.message}`);
    console.error("  Make sure you're running with bun, or use Docker mode (IFRAMER_URL=http://localhost:3021).");
    process.exit(1);
  }
}

/** Check if Docker API is running */
async function isDockerRunning() {
  try {
    const res = await fetch(`${DEFAULT_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
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

function handleResponse(data, screenshotPath) {
  const { screenshot, tileScreenshots, ...rest } = data;
  if (screenshot && screenshotPath) {
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
    rest._screenshotSaved = screenshotPath;
  }
  if (tileScreenshots && tileScreenshots.length > 0) {
    const tileDir = "/tmp/browser-tiles";
    fs.mkdirSync(tileDir, { recursive: true });
    const tilePaths = [];
    for (const tile of tileScreenshots) {
      if (tile.screenshot) {
        const tilePath = `${tileDir}/tile-${tile.index}.png`;
        fs.writeFileSync(tilePath, Buffer.from(tile.screenshot, "base64"));
        tilePaths.push(tilePath);
      }
    }
    rest._tilesSaved = tilePaths;
  }
  console.log(JSON.stringify(rest, null, 2));
  if (!data.ok) process.exit(1);
}

function printResult(data) {
  console.log(JSON.stringify(data, null, 2));
  if (!data.ok) process.exit(1);
}

// ─── Commands ────────────────────────────────────────────────────────

let [,, command, ...args] = process.argv;

// Install router: `iframer install <target>` → dispatch to install-<target>
if (command === "install" && args.length > 0) {
  const target = args.shift();
  if (target === "chromium" || target === "chrome") command = "install-chrome";
  else if (target === "mcp") command = "install-mcp";
  else if (target === "deps" || target === "dependencies" || target === "all") command = "install-all";
  else {
    console.error(`  Unknown install target: ${target}`);
    console.error("  Usage: iframer install <chromium|mcp|deps>");
    process.exit(1);
  }
}

async function installChrome() {
  const { downloadChrome } = await import("../src/lib/browser/chrome-downloader.ts");
  await downloadChrome();
}

async function main() {
  switch (command) {

    // ─── Status ──────────────────────────────────────────────────────

    case "status": {
      const docker = await isDockerRunning();
      console.log(`  Server: ${DEFAULT_SERVER}`);
      console.log(`  Docker API: ${docker ? "running" : "not reachable"}`);
      if (API_KEY) console.log("  Auth: IFRAMER_SECRET set");

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
      console.log(`  Modes: headless${hasDisplay ? ", binary-headful" : ""}${docker ? ", docker-headful" : ""}`);
      break;
    }

    // ─── Modes ───────────────────────────────────────────────────────

    case "modes": {
      const docker = await isDockerRunning();
      const hasDisplay = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;

      let chromeInstalled = false;
      try {
        const { findChromeForTesting } = await import("../src/lib/browser/chrome-downloader.ts");
        chromeInstalled = !!findChromeForTesting();
      } catch {}

      console.log("  Available browser modes:\n");
      console.log(`    headless          ${chromeInstalled ? "✓ available" : "✗ Chrome for Testing not installed"}`);
      console.log(`    binary-headful    ${chromeInstalled && hasDisplay ? "✓ available" : "✗ " + (!chromeInstalled ? "Chrome not installed" : "no display")}`);
      console.log(`    docker-headful    ${docker ? "✓ available" : "✗ Docker not running at " + DEFAULT_SERVER}`);

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

    // ─── Install All Dependencies ────────────────────────────────────

    case "install-all": {
      console.log("  Installing iframer-toolkit dependencies...\n");
      console.log("  [1/2] Chrome for Testing");
      try {
        await installChrome();
      } catch (err) {
        console.error(`  Chrome install failed: ${err.message}`);
        process.exit(1);
      }
      console.log("\n  [2/2] MCP server registration");
      // Re-dispatch to install-mcp by falling through via command rebind
      command = "install-mcp";
      return main();
    }

    // ─── Execute (pipeline) ──────────────────────────────────────────

    case "execute": {
      let pipeline;

      // Accept JSON file or inline JSON
      const input = args[0];
      if (!input) {
        console.error("  Usage: iframer execute <pipeline.json | inline-json>");
        console.error("    iframer execute '[{\"type\":\"navigate\",\"url\":\"https://example.com\"},{\"type\":\"screenshot\"}]'");
        console.error("    iframer execute pipeline.json");
        console.error("\n  Options:");
        console.error("    --mode <headless|binary-headful|docker-headful>");
        console.error("    --capture-api        Record XHR/fetch requests");
        console.error("    --continue-on-error  Don't stop on step failure");
        console.error("    --timeout <ms>       Stale state timeout (default: 20000)");
        process.exit(1);
      }

      // Parse steps
      let steps;
      if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else if (fs.existsSync(input)) {
        const parsed = JSON.parse(fs.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else {
        console.error(`  File not found: ${input}`);
        process.exit(1);
      }

      const options = {};
      const mode = parseFlag(args, "--mode");
      if (mode) options.mode = mode;
      if (hasFlag(args, "--capture-api")) options.captureApi = true;
      if (hasFlag(args, "--continue-on-error")) options.continueOnError = true;
      const timeout = parseFlag(args, "--timeout");
      if (timeout) options.staleTimeoutMs = parseInt(timeout);

      // Execute via local iframer or Docker API
      const docker = await isDockerRunning();
      let result;
      if (mode === "docker-headful" && docker) {
        result = await apiPost("/execute", { steps, options });
      } else if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options });
      } else {
        result = await apiPost("/execute", { steps, options });
      }

      printResult(result);
      break;
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

      const docker = await isDockerRunning();
      let result;
      if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.fetch("cli-user", API_KEY || "cli-local", options);
      } else {
        result = await apiPost("/fetch", options);
      }

      printResult(result);
      break;
    }

    // ─── Screenshot ──────────────────────────────────────────────────

    case "screenshot": {
      const url = args[0];
      const outPath = parseFlag(args, "--output") || parseFlag(args, "-o") || "/tmp/iframer-screenshot.jpg";

      if (url && url.startsWith("http")) {
        // One-shot: navigate + screenshot
        const mode = parseFlag(args, "--mode") || "headless";
        const annotate = hasFlag(args, "--annotate");
        const docker = await isDockerRunning();

        const steps = [
          { type: "navigate", url, waitUntil: "networkidle" },
          { type: "wait", ms: 2000 },
          { type: "screenshot", annotate },
        ];

        let result;
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options: { mode } });
        } else {
          result = await apiPost("/execute", { steps, options: { mode } });
        }

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
      } else {
        // Legacy: screenshot from active Docker session
        const res = await fetch(`${DEFAULT_SERVER}/interactive/screenshot?format=raw`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          const data = await res.json();
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(outPath, buffer);
        console.log(outPath);
      }
      break;
    }

    // ─── Session management ──────────────────────────────────────────

    case "session": {
      const sub = args[0];

      if (sub === "stop") {
        const docker = await isDockerRunning();
        if (docker) {
          const data = await apiPost("/interactive/stop", null);
          if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
          console.log(`  Session stopped. State saved: ${data.sessionSaved}`);
        } else {
          const iframer = await getLocalIframer();
          const result = await iframer.stopSession("cli-user", API_KEY || "cli-local");
          console.log(`  Session stopped. State saved: ${result.sessionSaved}`);
        }

      } else if (sub === "clear") {
        const docker = await isDockerRunning();
        if (docker) {
          const data = await apiDelete("/session");
          if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        } else {
          const iframer = await getLocalIframer();
          await iframer.clearSession("cli-user");
        }
        console.log("  Session data cleared.");

      } else if (sub === "status") {
        const docker = await isDockerRunning();
        if (docker) {
          const data = await apiGet("/interactive/status");
          if (!data.active) {
            console.log("  No active session.");
          } else {
            console.log(`  Active session`);
            console.log(`  noVNC: ${data.noVncUrl}`);
            console.log(`  Started: ${data.createdAt}`);
          }
        } else {
          console.log("  Local mode — no persistent sessions (sessions live within execute calls).");
        }

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

        const docker = await isDockerRunning();
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          await iframer.storeCredential("cli-user", API_KEY || "cli-local", body);
        } else {
          const data = await apiPost("/credentials", body);
          if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        }
        console.log(`\n  Credentials stored for ${domain}`);

      } else if (sub === "list") {
        const docker = await isDockerRunning();
        let domains;
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          domains = await iframer.listCredentials("cli-user");
        } else {
          const data = await apiGet("/credentials");
          if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
          domains = data.domains;
        }
        if (domains.length === 0) {
          console.log("  No credentials stored.");
        } else {
          console.log("  Stored credentials:");
          for (const d of domains) console.log(`    - ${d}`);
        }

      } else if (sub === "remove") {
        const domain = args[1];
        if (!domain) { console.error("  Usage: iframer credentials remove <domain>"); process.exit(1); }
        const docker = await isDockerRunning();
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          await iframer.deleteCredential("cli-user", domain);
        } else {
          const data = await apiDelete(`/credentials/${encodeURIComponent(domain)}`);
          if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        }
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
      const mode = parseFlag(args, "--mode");
      if (mode) options.mode = mode;

      const docker = await isDockerRunning();
      let result;
      if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options });
      } else {
        result = await apiPost("/execute", { steps, options });
      }

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

    // ─── Interactive (Docker only) ───────────────────────────────────

    case "interactive": {
      const sub = args[0];

      if (sub === "stop") {
        const data = await apiPost("/interactive/stop", null);
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        console.log("  Interactive session stopped. Session saved.");

      } else if (sub === "status") {
        const data = await apiGet("/interactive/status");
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        if (!data.active) {
          console.log("  No active interactive session.");
        } else {
          console.log(`  Active session`);
          console.log(`  noVNC: ${data.noVncUrl}`);
          console.log(`  Started: ${data.createdAt}`);
        }

      } else if (sub) {
        const data = await apiPost("/interactive/start", { url: sub });
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        console.log(`\n  Interactive session started!`);
        console.log(`  noVNC: ${data.noVncUrl}\n`);
        console.log(`  Stop with: iframer interactive stop`);
        openBrowser(data.noVncUrl);

      } else {
        console.error("  Usage: iframer interactive <url|stop|status>");
        process.exit(1);
      }
      break;
    }

    // ─── Watch ───────────────────────────────────────────────────────

    case "watch": {
      console.log("  Watching for interactive session...\n");

      const poll = async () => {
        try {
          const data = await apiGet("/interactive/status");
          if (data.ok && data.active) return data.noVncUrl;
        } catch {}
        return null;
      };

      let vncUrl = await poll();
      if (vncUrl) {
        console.log(`  Session active! Opening noVNC viewer...`);
        console.log(`  ${vncUrl}\n`);
        openBrowser(vncUrl);
      }

      let lastUrl = vncUrl;
      const interval = setInterval(async () => {
        const url = await poll();
        if (url && url !== lastUrl) {
          console.log(`  New session detected! Opening noVNC viewer...`);
          console.log(`  ${url}\n`);
          openBrowser(url);
        }
        lastUrl = url;
      }, 2000);

      process.on("SIGINT", () => {
        clearInterval(interval);
        console.log("\n  Stopped watching.");
        process.exit(0);
      });

      await new Promise(() => {});
      break;
    }

    // ─── Act (legacy — send action to Docker session) ────────────────

    case "act": {
      const actionType = args[0];
      if (!actionType) {
        console.error(`  Usage: iframer act <action-type> [options]

  Actions:
    click <selector>                Click an element
    human-click <selector>          Click with human-like mouse movement
    human-click <x> <y>             Click at coordinates with human-like movement
    human-type <selector> <text>    Type with human-like keystroke timing
    navigate <url>                  Navigate to a URL
    scroll [deltaY]                 Scroll the page
    wait <ms>                       Wait for milliseconds
    evaluate <expression>           Evaluate JavaScript
    wait-for-selector <selector>    Wait for element to appear
    keyboard <key>                  Press a keyboard key

  reCAPTCHA:
    recaptcha-click                 Click the reCAPTCHA checkbox
    recaptcha-select <tiles...>     Click tiles by index (e.g. 0 2 5)
    recaptcha-verify                Click the verify button
    recaptcha-info                  Get challenge info without clicking`);
        process.exit(1);
      }

      let action = {};
      const screenshotPath = "/tmp/browser-act.png";

      switch (actionType) {
        case "click":
          action = { type: "click", selector: args[1] }; break;
        case "human-click":
          if (args[1] && !isNaN(args[1]) && args[2] && !isNaN(args[2])) {
            action = { type: "human-click", x: parseFloat(args[1]), y: parseFloat(args[2]) };
          } else {
            action = { type: "human-click", selector: args[1] };
          }
          break;
        case "human-type":
          action = { type: "human-type", selector: args[1], value: args.slice(2).join(" ") }; break;
        case "navigate":
          action = { type: "navigate", url: args[1], waitUntil: args[2] || "networkidle" }; break;
        case "scroll":
          action = { type: "scroll", deltaY: args[1] ? parseInt(args[1]) : undefined }; break;
        case "wait":
          action = { type: "wait", ms: parseInt(args[1]) || 1000 }; break;
        case "evaluate":
          action = { type: "evaluate", expression: args.slice(1).join(" ") }; break;
        case "wait-for-selector":
          action = { type: "wait-for-selector", selector: args[1], timeout: args[2] ? parseInt(args[2]) : undefined }; break;
        case "keyboard":
          action = { type: "keyboard", key: args[1] }; break;
        case "recaptcha-click":
          action = { type: "recaptcha-click" }; break;
        case "recaptcha-select":
          action = { type: "recaptcha-select", tiles: args.slice(1).map(Number) }; break;
        case "recaptcha-verify":
          action = { type: "recaptcha-verify" }; break;
        case "recaptcha-info":
          action = { type: "recaptcha-info" }; break;
        default:
          console.error(`  Unknown action: ${actionType}`);
          process.exit(1);
      }

      const data = await apiPost("/interactive/act", { action });
      handleResponse(data, screenshotPath);
      break;
    }

    // ─── Install MCP ─────────────────────────────────────────────────

    case "install-mcp": {
      const runtime = resolveMcpRuntime();
      console.log(runtime.message);
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      const secret = resolveIframerSecret();
      const mcpEntry = { command: runtime.command, args: runtime.args };
      if (secret) mcpEntry.env = { IFRAMER_SECRET: secret };
      if (!isDev) {
        if (!mcpEntry.env) mcpEntry.env = {};
        mcpEntry.env.IFRAMER_MODE = "local";
      }
      const claudeConfigPath = installClaudeMcp(mcpName, mcpEntry);
      const codexConfigPath = installCodexMcp(mcpName, mcpEntry);
      console.log(`\n  ${mcpName} MCP installed!`);
      if (secret) console.log("  IFRAMER_SECRET loaded from .env");
      if (!isDev) console.log("  Mode: local (headless + binary-headful, no Docker needed)");
      else console.log("  Mode: docker (connects to Docker container)");
      console.log(`  Claude Code config written to: ${claudeConfigPath}`);
      console.log(`  Codex config written to: ${codexConfigPath}`);
      console.log("  Restart Claude Code and Codex to activate the iframer tools.\n");
      break;
    }

    // ─── Remove MCP ──────────────────────────────────────────────────

    case "remove-mcp": {
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      const claudeResult = removeClaudeMcp(mcpName);
      const codexResult = removeCodexMcp(mcpName);

      if (!claudeResult.removed && !codexResult.removed) {
        console.log(`  ${mcpName} MCP is not installed in Claude Code or Codex.`);
        break;
      }

      console.log(`\n  ${mcpName} MCP removed!`);
      if (claudeResult.removed) console.log(`  Claude Code config updated: ${claudeResult.path}`);
      if (codexResult.removed) console.log(`  Codex config updated: ${codexResult.path}`);
      console.log("  Restart Claude Code and Codex for the change to take effect.\n");
      break;
    }

    // ─── Help ────────────────────────────────────────────────────────

    default:
      console.log(`
  iframer — browser automation for AI agents

  Pipeline:
    execute <pipeline.json|json>    Run a pipeline of browser steps
      --mode <mode>                 Force browser mode (headless, binary-headful, docker-headful)
      --capture-api                 Record XHR/fetch requests during execution
      --continue-on-error           Don't stop on step failure
      --timeout <ms>                Stale state timeout (default: 20000)

  Quick actions:
    browse <url> [options]          Headless fetch with JS rendering
      --extract <js>                Evaluate JS expression and return result
      --html                        Return full page HTML
      --wait-for <selector>         Wait for element before extracting
      --sessionless                 Skip session persistence
    screenshot <url> [options]      Take a screenshot of a URL
      --mode <mode>                 Browser mode
      --annotate                    Overlay element badges with refs
      -o, --output <path>           Output file path
    reverse-engineer <url|file>     Capture API calls a site makes
      --output <dir>                Save directory
      --typed                       Generate TypeScript
      --mode <mode>                 Browser mode

  Session:
    session stop                    Stop session and save cookies/localStorage
    session clear                   Wipe all stored session data
    session status                  Check session state

  Credentials:
    credentials add <domain>        Store login credentials (encrypted)
      --username <user>             Username or email
      --password <pass>             Password
      --totp-secret <secret>        TOTP secret for 2FA
    credentials list                List domains with stored credentials
    credentials remove <domain>     Delete credentials for a domain

  Browser:
    modes                           Show available browser modes
    install chromium                Download Chrome for Testing
    status                          Show system status

  Docker (interactive):
    interactive <url>               Open a live headful browser session (Docker only)
    interactive stop                Stop Docker session
    interactive status              Check Docker session
    watch                           Auto-open noVNC when session starts
    act <action> [args...]          Send action to Docker session

  Setup:
    install <chromium|mcp|deps>     Install Chromium, MCP, or both
    install-mcp [--dev]             Install iframer MCP into Claude Code and Codex
    remove-mcp [--dev]              Remove iframer MCP from Claude Code and Codex

  Environment:
    IFRAMER_URL                     Docker API URL (default: http://localhost:3021)
    IFRAMER_SECRET                  Auth token (must match Docker .env)
    IFRAMER_MODE                    Force "local" or "docker" mode
`);
      break;
  }
}

main().catch((err) => {
  console.error(`  ${err.message}`);
  process.exit(1);
});
