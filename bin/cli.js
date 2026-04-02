#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const CONFIG_DIR = path.join(require("os").homedir(), ".iframer");
const DEFAULT_SERVER = process.env.IFRAMER_URL || "http://localhost:3021";
const API_KEY = process.env.IFRAMER_SECRET;

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
  });
  return res.json();
}

async function apiGet(endpoint) {
  const res = await fetch(`${DEFAULT_SERVER}${endpoint}`, { headers: authHeaders() });
  return res.json();
}

// Strip screenshot from response, save to file, print the rest as JSON
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

// ─── Commands ────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "status": {
      try {
        const health = await fetch(`${DEFAULT_SERVER}/health`);
        const data = await health.json();
        console.log(`  API: ${data.ok ? "running" : "not ok"}`);
        console.log(`  Server: ${DEFAULT_SERVER}`);
        if (API_KEY) console.log("  Auth: IFRAMER_SECRET set");
      } catch {
        console.error(`  API not reachable at ${DEFAULT_SERVER}`);
        process.exit(1);
      }
      break;
    }

    // ─── Credentials ───────────────────────────────────────────────

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

        const data = await apiPost("/credentials", body);
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        console.log(`\n  Credentials stored for ${domain}`);

      } else if (sub === "list") {
        const data = await apiGet("/credentials");
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        if (data.domains.length === 0) {
          console.log("  No credentials stored.");
        } else {
          console.log("  Stored credentials:");
          for (const d of data.domains) console.log(`    - ${d}`);
        }

      } else if (sub === "remove") {
        const domain = args[1];
        if (!domain) { console.error("  Usage: iframer credentials remove <domain>"); process.exit(1); }
        const res = await fetch(`${DEFAULT_SERVER}/credentials/${encodeURIComponent(domain)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!data.ok) { console.error(`  Error: ${data.error}`); process.exit(1); }
        console.log(`  Credentials for ${domain} removed.`);

      } else {
        console.error("  Usage: iframer credentials <add|list|remove>");
        process.exit(1);
      }
      break;
    }

    // ─── Headless fetch ────────────────────────────────────────────

    case "fetch": {
      const url = args[0];
      if (!url) {
        console.error("  Usage: iframer fetch <url> [--extract <js>] [--html] [--sessionless]");
        process.exit(1);
      }
      const options = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--extract" && args[i + 1]) options.extract = args[++i];
        else if (args[i] === "--html") options.returnHtml = true;
        else if (args[i] === "--sessionless") options.sessionless = true;
        else if (args[i] === "--wait-for" && args[i + 1]) options.waitForSelector = args[++i];
        else if (args[i] === "--browser" && args[i + 1]) options.browser = args[++i];
      }
      const data = await apiPost("/fetch", { url, ...options });
      console.log(JSON.stringify(data, null, 2));
      if (!data.ok) process.exit(1);
      break;
    }

    // ─── Interactive session management ────────────────────────────

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

    // ─── Watch (poll for active session and open noVNC) ─────────────

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

    // ─── Screenshot ────────────────────────────────────────────────

    case "screenshot": {
      const outPath = args[0] || "/tmp/browser-screenshot.png";
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
      break;
    }

    // ─── Act (send action to interactive session) ──────────────────

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
          action = { type: "click", selector: args[1] };
          break;
        case "human-click":
          if (args[1] && !isNaN(args[1]) && args[2] && !isNaN(args[2])) {
            action = { type: "human-click", x: parseFloat(args[1]), y: parseFloat(args[2]) };
          } else {
            action = { type: "human-click", selector: args[1] };
          }
          break;
        case "human-type":
          action = { type: "human-type", selector: args[1], value: args.slice(2).join(" ") };
          break;
        case "navigate":
          action = { type: "navigate", url: args[1], waitUntil: args[2] || "networkidle" };
          break;
        case "scroll":
          action = { type: "scroll", deltaY: args[1] ? parseInt(args[1]) : undefined };
          break;
        case "wait":
          action = { type: "wait", ms: parseInt(args[1]) || 1000 };
          break;
        case "evaluate":
          action = { type: "evaluate", expression: args.slice(1).join(" ") };
          break;
        case "wait-for-selector":
          action = { type: "wait-for-selector", selector: args[1], timeout: args[2] ? parseInt(args[2]) : undefined };
          break;
        case "keyboard":
          action = { type: "keyboard", key: args[1] };
          break;
        case "recaptcha-click":
          action = { type: "recaptcha-click" };
          break;
        case "recaptcha-select":
          action = { type: "recaptcha-select", tiles: args.slice(1).map(Number) };
          break;
        case "recaptcha-verify":
          action = { type: "recaptcha-verify" };
          break;
        case "recaptcha-info":
          action = { type: "recaptcha-info" };
          break;
        default:
          console.error(`  Unknown action: ${actionType}`);
          process.exit(1);
      }

      const data = await apiPost("/interactive/act", { action });
      handleResponse(data, screenshotPath);
      break;
    }

    // ─── Install MCP ──────────────────────────────────────────────

    case "install-mcp": {
      const mcpServerPath = path.join(__dirname, "mcp-server.cjs");
      if (!fs.existsSync(mcpServerPath)) {
        console.error("  MCP server bundle not found. Run: bun build src/mcp/server.ts --target node --format cjs --outfile bin/mcp-server.cjs");
        process.exit(1);
      }

      const claudeConfigPath = path.join(require("os").homedir(), ".claude.json");
      let config = {};
      try {
        config = JSON.parse(fs.readFileSync(claudeConfigPath, "utf8"));
      } catch {}

      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";

      // Read IFRAMER_SECRET from .env if present
      let secret = process.env.IFRAMER_SECRET;
      if (!secret) {
        try {
          const envPath = path.join(__dirname, "..", ".env");
          const envContent = fs.readFileSync(envPath, "utf8");
          const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
          if (match) secret = match[1].trim();
        } catch {}
      }

      if (!config.mcpServers) config.mcpServers = {};
      const mcpEntry = { command: "node", args: [mcpServerPath] };
      if (secret) mcpEntry.env = { IFRAMER_SECRET: secret };
      config.mcpServers[mcpName] = mcpEntry;

      fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
      console.log(`\n  ${mcpName} MCP installed!`);
      if (secret) console.log("  IFRAMER_SECRET loaded from .env");
      else console.log("  No IFRAMER_SECRET found — API must be running without auth.");
      console.log(`  Config written to: ${claudeConfigPath}`);
      console.log("  Restart Claude Code to activate the iframer tools.\n");
      break;
    }

    // ─── Help ──────────────────────────────────────────────────────

    default:
      console.log(`
  iframer - CLI for the self-hosted Agentic Browser API

  Commands:
    status                         Check API health
    install-mcp [--dev]             Install the iframer MCP into Claude Code

  Credentials:
    credentials add <domain>       Store login credentials (encrypted, server-side)
      --username <user>            Username or email
      --password <pass>            Password
      --totp-secret <secret>       TOTP secret for 2FA
    credentials list               List domains with stored credentials
    credentials remove <domain>    Delete credentials for a domain

  Headless:
    fetch <url> [options]          Fetch a URL through the headless browser

  Interactive (headful):
    interactive <url>              Open a live browser session
    interactive stop               Stop session and save state
    interactive status             Check if session is active
    watch                          Watch the agent work (opens noVNC when session starts)
    screenshot [path]              Take a screenshot (default: /tmp/browser-screenshot.png)
    act <action> [args...]         Send an action to the interactive browser

  Environment:
    IFRAMER_URL            Server URL (default: http://localhost:3021)
    IFRAMER_SECRET         Must match IFRAMER_SECRET set in Docker .env
`);
      break;
  }
}

main().catch((err) => {
  console.error(`  ${err.message}`);
  process.exit(1);
});
