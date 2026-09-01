#!/usr/bin/env node
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};

// src/mcp/server.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");

// src/mcp/helpers.ts
var import_path5 = __toESM(require("path"));
var import_os3 = __toESM(require("os"));

// src/lib/logger.ts
var LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
var currentLevel = process.env.LOG_LEVEL || "info";
function createLogger(tag) {
  const prefix = `[${tag}]`;
  return {
    debug: (...args) => {
      if (LEVELS[currentLevel] <= 0)
        console.log(prefix, ...args);
    },
    info: (...args) => {
      if (LEVELS[currentLevel] <= 1)
        console.log(prefix, ...args);
    },
    warn: (...args) => {
      if (LEVELS[currentLevel] <= 2)
        console.warn(prefix, ...args);
    },
    error: (...args) => {
      if (LEVELS[currentLevel] <= 3)
        console.error(prefix, ...args);
    }
  };
}

// src/lib/auth/crypto.ts
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_os2 = __toESM(require("os"));
var import_path2 = __toESM(require("path"));

// src/lib/paths.ts
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}

// src/lib/auth/crypto.ts
function getLocalToken() {
  if (process.env.IFRAMER_SECRET)
    return process.env.IFRAMER_SECRET;
  const candidates = [
    import_path2.default.join(getDataDir(), "secret"),
    import_path2.default.join(process.env.XDG_RUNTIME_DIR || import_os2.default.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = import_fs.default.readFileSync(file, "utf8").trim();
      if (existing)
        return existing;
    } catch {}
  }
  for (const file of candidates) {
    try {
      import_fs.default.mkdirSync(import_path2.default.dirname(file), { recursive: true });
      const secret = import_crypto.default.randomBytes(32).toString("hex");
      import_fs.default.writeFileSync(file, secret, { mode: 384 });
      return secret;
    } catch {}
  }
  throw new Error("iframer: could not read or create a persistent encryption secret in any " + `writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a ` + "stable value shared between the MCP server and CLI (openssl rand -hex 32).");
}

// src/mcp/local-server.ts
var import_child_process = require("child_process");
var import_net = __toESM(require("net"));
var import_fs3 = __toESM(require("fs"));
var import_path4 = __toESM(require("path"));

// src/lib/browser/registry.ts
var import_fs2 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var log = createLogger("registry");
function serverInfoPath() {
  return import_path3.default.join(getDataDir(), "server.json");
}
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readServerInfo() {
  try {
    const info = JSON.parse(import_fs2.default.readFileSync(serverInfoPath(), "utf8"));
    if (!Number.isInteger(info.pid) || !Number.isInteger(info.port))
      return null;
    return info;
  } catch {
    return null;
  }
}

// src/mcp/local-server.ts
var __dirname = "/Users/eduardoverona/tools/iframer-toolkit/src/mcp";
var BASE_PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
var PORT_SCAN_ATTEMPTS = 21;
var STARTUP_TIMEOUT_MS = 15000;
var HEALTH_POLL_MS = 300;
var SPAWN_LOCK_STALE_MS = 20000;

class LocalServerManager {
  startingPromise = null;
  baseUrl = "";
  logPath;
  constructor() {
    this.logPath = import_path4.default.join(getDataDir(), "local-server.log");
  }
  getBaseUrl() {
    if (!this.baseUrl) {
      throw new Error("Local server not started yet — call ensureRunning() first.");
    }
    return this.baseUrl;
  }
  async ensureRunning() {
    if (this.startingPromise)
      return this.startingPromise;
    if (await this.adoptExisting())
      return;
    this.startingPromise = this.startShared().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }
  async adoptExisting() {
    const info = readServerInfo();
    if (!info || !isPidAlive(info.pid))
      return false;
    const url = `http://127.0.0.1:${info.port}`;
    if (await healthCheck(url)) {
      this.baseUrl = url;
      return true;
    }
    return false;
  }
  async startShared() {
    const dataDir = getDataDir();
    import_fs3.default.mkdirSync(dataDir, { recursive: true });
    const lockDir = import_path4.default.join(dataDir, "server.spawn-lock");
    let holdingLock = false;
    try {
      import_fs3.default.mkdirSync(lockDir);
      holdingLock = true;
    } catch {
      const stale = (() => {
        try {
          return Date.now() - import_fs3.default.statSync(lockDir).mtimeMs > SPAWN_LOCK_STALE_MS;
        } catch {
          return true;
        }
      })();
      if (stale) {
        try {
          import_fs3.default.rmdirSync(lockDir);
          import_fs3.default.mkdirSync(lockDir);
          holdingLock = true;
        } catch {}
      }
    }
    try {
      if (!holdingLock) {
        const deadline2 = Date.now() + STARTUP_TIMEOUT_MS;
        while (Date.now() < deadline2) {
          if (await this.adoptExisting())
            return;
          await sleep(HEALTH_POLL_MS);
        }
        throw new Error("Timed out waiting for another session to start the shared iframer server.");
      }
      if (await this.adoptExisting())
        return;
      const port = await findFreePort(BASE_PORT, PORT_SCAN_ATTEMPTS);
      const url = `http://127.0.0.1:${port}`;
      const { command, args } = this.resolveRuntime();
      const logFd = import_fs3.default.openSync(this.logPath, "a");
      const env = {
        ...process.env,
        PORT: String(port),
        IFRAMER_MODE: "local",
        IFRAMER_DATA_DIR: dataDir
      };
      if (process.env.IFRAMER_SECRET) {
        env.IFRAMER_SECRET = process.env.IFRAMER_SECRET;
      } else {
        try {
          const secret = import_fs3.default.readFileSync(import_path4.default.join(dataDir, "secret"), "utf8").trim();
          if (secret)
            env.IFRAMER_SECRET = secret;
        } catch {}
      }
      const child = import_child_process.spawn(command, args, {
        env,
        stdio: ["ignore", logFd, logFd],
        detached: true
      });
      child.unref();
      import_fs3.default.closeSync(logFd);
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await healthCheck(url)) {
          this.baseUrl = url;
          return;
        }
        await sleep(HEALTH_POLL_MS);
      }
      try {
        child.kill("SIGKILL");
      } catch {}
      throw new Error(`Local iframer server failed to start on port ${port} within ${STARTUP_TIMEOUT_MS}ms.
` + `Last log lines:
${this.readLogTail()}`);
    } finally {
      if (holdingLock) {
        try {
          import_fs3.default.rmdirSync(lockDir);
        } catch {}
      }
    }
  }
  resolveRuntime() {
    const serverTs = import_path4.default.join(__dirname, "..", "..", "index.ts");
    const serverCjs = import_path4.default.join(__dirname, "..", "..", "dist", "local-server.cjs");
    if (import_fs3.default.existsSync(serverCjs)) {
      return { command: "node", args: [serverCjs] };
    }
    if (import_fs3.default.existsSync(serverTs)) {
      try {
        require.resolve("/Users/eduardoverona/tools/iframer-toolkit/node_modules/tsx/dist/loader.mjs");
        return { command: "node", args: ["--import", "tsx", serverTs] };
      } catch {}
    }
    try {
      const bunPath = require("child_process").execSync("which bun", { encoding: "utf8" }).trim();
      if (bunPath && import_fs3.default.existsSync(serverTs)) {
        console.error("[iframer] running local server under bun — extension mode (connectOverCDP) will not work; run `bun run build` to get the node bundle");
        return { command: bunPath, args: ["run", serverTs] };
      }
    } catch {}
    throw new Error("No runnable iframer server entry found: dist/local-server.cjs is missing, tsx is not " + "installed, and bun is unavailable. Run `bun install && bun run build` in the iframer repo.");
  }
  async restart() {
    const info = readServerInfo();
    if (info && this.baseUrl) {
      try {
        await fetch(`${this.baseUrl}/shutdown`, { method: "POST", signal: AbortSignal.timeout(3000) });
      } catch {}
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline && isPidAlive(info.pid)) {
        await sleep(200);
      }
      if (isPidAlive(info.pid)) {
        try {
          process.kill(info.pid, "SIGKILL");
        } catch {}
      }
    }
    this.baseUrl = "";
    await this.ensureRunning();
  }
  shutdown() {}
  readLogTail() {
    try {
      const content = import_fs3.default.readFileSync(this.logPath, "utf8");
      const lines = content.trim().split(`
`);
      return lines.slice(-10).join(`
`);
    } catch {
      return "(no log file)";
    }
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function healthCheck(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
function findFreePort(start, attempts) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p >= start + attempts) {
        reject(new Error(`No free port found in ${start}-${start + attempts}`));
        return;
      }
      const srv = import_net.default.createServer();
      srv.once("error", () => {
        srv.close();
        tryPort(p + 1);
      });
      srv.once("listening", () => {
        srv.close(() => resolve(p));
      });
      srv.listen(p, "127.0.0.1");
    };
    tryPort(start);
  });
}

// src/lib/errors.ts
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/mcp/helpers.ts
var log2 = createLogger("mcp");
var BASE_URL = process.env.IFRAMER_URL || "http://localhost:3021";
var IFRAMER_SECRET = process.env.IFRAMER_SECRET;
var IFRAMER_MODE = process.env.IFRAMER_MODE;
var LOCAL_TOKEN = getLocalToken();
var localServer = new LocalServerManager;
async function ensureLocalServer() {
  await localServer.ensureRunning();
}
function authHeaders(secret) {
  const headers = { "Content-Type": "application/json" };
  const key = secret || IFRAMER_SECRET;
  if (key)
    headers["x-api-key"] = key;
  return headers;
}
async function apiPost(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000)
  });
  return res.json();
}
async function apiGet(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
  return res.json();
}
async function localApiPost(endpoint, body, timeoutMs = 180000) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: authHeaders(LOCAL_TOKEN),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  return res.json();
}
async function localApiGet(endpoint) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { headers: authHeaders(LOCAL_TOKEN), signal: AbortSignal.timeout(30000) });
  return res.json();
}
async function localApiDelete(endpoint) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { method: "DELETE", headers: authHeaders(LOCAL_TOKEN), signal: AbortSignal.timeout(30000) });
  return res.json();
}
async function isDockerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
async function resolveScreenshotPath(url) {
  try {
    if (url.startsWith("file://")) {
      const { fileURLToPath } = await import("url");
      const filePath2 = fileURLToPath(url);
      const fs5 = await import("fs");
      if (fs5.existsSync(filePath2))
        return filePath2;
      return null;
    }
    const res = await fetch(url);
    if (!res.ok)
      return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const fs4 = await import("fs");
    const dir = import_path5.default.join(import_os3.default.tmpdir(), "iframer-screenshots", "screenshots");
    fs4.mkdirSync(dir, { recursive: true });
    const filePath = import_path5.default.join(dir, `docker-${Date.now()}.jpg`);
    fs4.writeFileSync(filePath, buf);
    return filePath;
  } catch {
    return null;
  }
}
function err(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// src/lib/domain-modes.ts
var import_fs4 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
var log3 = createLogger("domain-modes");
function defaultFile() {
  return import_path6.default.join(getDataDir(), "domain-modes.json");
}
var TTL_DAYS = 14;
var ESCALATION_LADDER = ["headless", "docker-headful", "binary-headful"];

class DomainModeStore {
  data = {};
  filePath;
  constructor(filePath = defaultFile()) {
    this.filePath = filePath;
    this.load();
  }
  getMode(domain) {
    const entry = this.data[domain];
    if (!entry)
      return null;
    if (this.isExpired(entry))
      return null;
    return entry.mode;
  }
  recordSuccess(domain, mode) {
    const now = new Date().toISOString();
    const existing = this.data[domain];
    this.data[domain] = {
      mode,
      lastSuccess: now,
      attempts: {
        ...existing?.attempts || {},
        [mode]: { result: "success", lastTried: now }
      }
    };
    this.save();
  }
  recordFailure(domain, mode, reason) {
    const now = new Date().toISOString();
    const existing = this.data[domain];
    this.data[domain] = {
      mode: existing?.mode || mode,
      lastSuccess: existing?.lastSuccess || "",
      attempts: {
        ...existing?.attempts || {},
        [mode]: { result: "blocked", reason, lastTried: now }
      }
    };
    this.save();
  }
  getNextMode(failedMode, availableModes) {
    const idx = ESCALATION_LADDER.indexOf(failedMode);
    for (let i = idx + 1;i < ESCALATION_LADDER.length; i++) {
      if (availableModes.includes(ESCALATION_LADDER[i])) {
        return ESCALATION_LADDER[i];
      }
    }
    return null;
  }
  getBestMode(domain, availableModes) {
    const remembered = this.getMode(domain);
    if (remembered && availableModes.includes(remembered)) {
      return remembered;
    }
    for (const mode of ESCALATION_LADDER) {
      if (availableModes.includes(mode))
        return mode;
    }
    return "headless";
  }
  getSummary() {
    const entries = Object.entries(this.data).filter(([, e]) => !this.isExpired(e)).sort(([, a], [, b]) => b.lastSuccess.localeCompare(a.lastSuccess));
    return {
      totalDomains: entries.length,
      recentDomains: entries.slice(0, 5).map(([d, e]) => `${d} (${e.mode})`)
    };
  }
  isExpired(entry) {
    if (!entry.lastSuccess)
      return true;
    const age = Date.now() - new Date(entry.lastSuccess).getTime();
    return age > TTL_DAYS * 24 * 60 * 60 * 1000;
  }
  load() {
    try {
      if (import_fs4.default.existsSync(this.filePath)) {
        this.data = JSON.parse(import_fs4.default.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }
  save() {
    try {
      import_fs4.default.mkdirSync(import_path6.default.dirname(this.filePath), { recursive: true });
      import_fs4.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err2) {
      log3.error("Failed to save:", err2);
    }
  }
}

// src/mcp/tools/status.ts
function registerStatusTool(server) {
  server.tool("status", `Get the full state of iframer in one call. Call this first. Returns: available browser modes, API health, active session, stored credentials, and domain memory.`, {}, async () => {
    try {
      const status = {};
      const dockerRunning = await isDockerRunning();
      status.dockerApi = dockerRunning;
      try {
        const localHealth = await localApiGet("/health");
        status.localServer = localHealth.ok;
      } catch {
        status.localServer = false;
      }
      try {
        const browserHealth = await localApiGet("/browser/health");
        status.browserAlive = browserHealth.alive;
        status.runningModes = browserHealth.modes;
      } catch {}
      if (dockerRunning) {
        try {
          const sessionData = await apiGet("/interactive/status");
          status.dockerSession = sessionData.active ? { active: true, noVncUrl: sessionData.noVncUrl } : { active: false };
        } catch {}
      }
      try {
        const credData = await localApiGet("/credentials");
        status.credentials = credData.domains || [];
      } catch {
        status.credentials = [];
      }
      try {
        const domainModes = new DomainModeStore;
        status.domainMemory = domainModes.getSummary();
      } catch {}
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/browse.ts
var import_zod = require("zod");
function registerBrowseTool(server) {
  server.tool("browse", `Fetch a web page with a headless browser. Use for pages that need JavaScript rendering but don't have bot detection walls. Session cookies and stored credentials persist across calls via the single local SQLite store.

PRE-FLIGHT: Call \`knowledge get <domain>\` first. If the cache shows a direct-API path for the data you need, skip this tool and hit the endpoints directly — it's orders of magnitude faster.`, {
    url: import_zod.z.string().describe("URL to navigate to"),
    extract: import_zod.z.string().optional().describe("JavaScript expression to evaluate (e.g. 'document.title')"),
    actions: import_zod.z.array(import_zod.z.object({
      type: import_zod.z.enum(["click", "fill", "wait", "scroll", "human-click", "human-type"]),
      selector: import_zod.z.string().optional(),
      value: import_zod.z.string().optional(),
      ms: import_zod.z.number().optional()
    })).optional().describe("Actions to execute before extracting"),
    returnHtml: import_zod.z.boolean().optional().describe("Return full page HTML"),
    waitForSelector: import_zod.z.string().optional().describe("Wait for this CSS selector before proceeding"),
    sessionless: import_zod.z.boolean().optional().describe("Skip session persistence")
  }, async (params) => {
    try {
      const fetchResult = await localApiPost("/fetch", params);
      if (!fetchResult.ok)
        return err(`Error: ${fetchResult.error}`);
      const { html, ...rest } = fetchResult;
      const text = html ? JSON.stringify(rest, null, 2) + `

--- HTML ---
` + html : JSON.stringify(rest, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/execute.ts
var import_zod3 = require("zod");

// src/mcp/tools/step-schema.ts
var import_zod2 = require("zod");
var stepSchema = import_zod2.z.discriminatedUnion("type", [
  import_zod2.z.object({ type: import_zod2.z.literal("navigate"), url: import_zod2.z.string(), waitUntil: import_zod2.z.string().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("click"), selector: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("fill"), selector: import_zod2.z.string(), value: import_zod2.z.string().describe("Sets an input/textarea's value. Framework-aware: fires the React-safe native setter + input/change/blur, so controlled forms (React, react-hook-form, Formik, Vue) register the value AND mark the field touched. This is the fix for 'I filled the field but submit says it's still empty' — always use fill for form fields, not evaluate.") }),
  import_zod2.z.object({ type: import_zod2.z.literal("human-click"), selector: import_zod2.z.string().optional(), x: import_zod2.z.number().optional(), y: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("right-click"), selector: import_zod2.z.string().optional(), x: import_zod2.z.number().optional(), y: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("human-type"), selector: import_zod2.z.string(), value: import_zod2.z.string(), skipClick: import_zod2.z.boolean().optional().describe("Skip the click-to-focus and type into the already-focused element. Use for editors that blur on a synthetic click (e.g. Draft.js). Either way, typing aborts safely if the target isn't actually focused."), speed: import_zod2.z.enum(["slow", "normal", "fast"]).optional().describe("Typing speed. 'normal' (~130ms/char, realistic, default), 'fast' (~45ms/char) for long non-sensitive text, 'slow' for extra realism.") }),
  import_zod2.z.object({ type: import_zod2.z.literal("evaluate"), expression: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("extract"), expression: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("wait"), ms: import_zod2.z.number() }),
  import_zod2.z.object({ type: import_zod2.z.literal("wait-for"), selector: import_zod2.z.string(), timeout: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("scroll"), deltaY: import_zod2.z.number().optional(), selector: import_zod2.z.string().optional().describe("Scroll within this element instead of the window"), human: import_zod2.z.boolean().optional().describe("Real eased wheel events instead of an instant jump (slower, less bot-obvious)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("select"), selector: import_zod2.z.string(), value: import_zod2.z.string().describe("Option value to pick in a <select> — native selection, real change events (never set .value via evaluate)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("keyboard"), key: import_zod2.z.string(), meta: import_zod2.z.boolean().optional(), ctrl: import_zod2.z.boolean().optional(), shift: import_zod2.z.boolean().optional(), alt: import_zod2.z.boolean().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("read"), selector: import_zod2.z.string().optional().describe("Element to read text from (CSS or @e ref); omit for the whole body"), maxChars: import_zod2.z.number().optional().describe("Cap returned text length (default 6000)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("upload"), selector: import_zod2.z.string().describe("The <input type=file> (CSS, @e ref, or @a anchor)"), files: import_zod2.z.array(import_zod2.z.string()).describe("Absolute local file path(s) on this machine") }),
  import_zod2.z.object({ type: import_zod2.z.literal("paste"), selector: import_zod2.z.string().optional().describe("Field to paste the OS clipboard into; omit for the focused element. Reliable via CDP insertText where a ⌘V keyboard step isn't.") }),
  import_zod2.z.object({ type: import_zod2.z.literal("download"), url: import_zod2.z.string().describe("File URL — fetched with the browser's cookies (auth'd downloads work), written to disk server-side, no Save-As dialog"), path: import_zod2.z.string().optional().describe("Absolute save path (default: ~/.iframer/downloads/<name>)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("type-code"), value: import_zod2.z.string(), selector: import_zod2.z.string().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("login"), domain: import_zod2.z.string(), usernameSelector: import_zod2.z.string().optional(), passwordSelector: import_zod2.z.string().optional(), submitSelector: import_zod2.z.string().optional(), totpSelector: import_zod2.z.string().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("solve-captcha") }),
  import_zod2.z.object({ type: import_zod2.z.literal("screenshot"), annotate: import_zod2.z.boolean().optional().describe("Overlay numbered badges on interactive elements; returns @e refs") }),
  import_zod2.z.object({ type: import_zod2.z.literal("snapshot"), interactiveOnly: import_zod2.z.boolean().optional().describe("Only interactive elements (default: true)"), maxElements: import_zod2.z.number().optional().describe("Max elements (default: 80)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("find"), role: import_zod2.z.string().optional().describe("ARIA role: button, link, textbox…"), name: import_zod2.z.string().optional().describe("Accessible name / aria-label"), text: import_zod2.z.string().optional().describe("Visible text content"), placeholder: import_zod2.z.string().optional(), label: import_zod2.z.string().optional(), exact: import_zod2.z.boolean().optional().describe("Exact match vs substring (default: substring)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha"), action: import_zod2.z.enum(["info", "click", "select", "verify", "solve", "answer"]).describe("Captcha interaction (manual arrives in the result when a captcha blocks a run): info=state+grid screenshot, click=checkbox, answer=select tiles+verify+recheck, select/verify=manual control, solve=auto vision solve"), tiles: import_zod2.z.array(import_zod2.z.number()).optional().describe("Tile numbers for select/answer") })
]);
function normalizeSteps(steps) {
  return (steps || []).map((s) => {
    if (s && s.type === "recaptcha") {
      const { action, ...rest } = s;
      return { ...rest, type: `recaptcha-${action || "info"}` };
    }
    return s;
  });
}

// src/lib/format-result.ts
function resultOf(r, _type) {
  return r.result;
}
var RECAPTCHA_MANUAL = `
--- Captcha workflow ---
A captcha is blocking this run. Use the "recaptcha" step with an action:
  {type:"recaptcha", action:"info"}                → state + instruction + tile-grid screenshot
  {type:"recaptcha", action:"click"}               → click the "I'm not a robot" checkbox
  {type:"recaptcha", action:"answer", tiles:[...]} → select tiles + verify + re-check (handles refreshing grids)
  {type:"recaptcha", action:"select"|"verify"}     → manual tile-select / submit, if you need finer control
  {type:"recaptcha", action:"solve"}               → automatic vision solve (docker-headful)
Or {type:"solve-captcha"} for one-shot auto-detect + solve.
In binary-headful mode, prefer asking the user to solve it in the visible window.`;
function captchaBlocked(data) {
  if (data.error?.errorType === "captcha-unsolvable")
    return true;
  return (data.obstacles || []).some((o) => (o.type === "captcha" || o.type === "hcaptcha") && !o.resolved);
}
function formatExecuteResult(data) {
  const lines = [];
  lines.push(`ok: ${data.ok}`);
  lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
  if (data.durationMs)
    lines.push(`duration: ${data.durationMs}ms`);
  if (data.modeUsed)
    lines.push(`mode: ${data.modeUsed}${data.modeEscalated ? " (auto-escalated)" : ""}`);
  if (data.finalState) {
    lines.push(`
Final page: ${data.finalState.title}`);
    lines.push(`URL: ${data.finalState.url}`);
  }
  for (const r of data.results || []) {
    if (r.tabSwitchedTo) {
      lines.push(`
↳ step ${r.stepIndex} opened a new tab — pipeline is now on: ${r.tabSwitchedTo}`);
    }
  }
  const meaningful = (data.results || []).filter((r) => r.ok && r.result !== undefined && r.result !== null);
  for (const r of meaningful) {
    if (r.step.type === "snapshot") {
      const res = resultOf(r, "snapshot");
      if (res?.snapshot) {
        lines.push(`
--- Snapshot (${res.elementCount} elements) ---`);
        lines.push(res.snapshot);
      }
    } else if (r.step.type === "find") {
      const res = resultOf(r, "find");
      if (res?.ref) {
        lines.push(`
Found: ${res.ref} ${res.role} "${res.name}" (${res.matchCount} match${res.matchCount > 1 ? "es" : ""})`);
      }
    } else if (r.step.type === "screenshot") {
      const res = resultOf(r, "screenshot");
      if (res?.refs) {
        lines.push(`
--- Annotated screenshot refs ---`);
        lines.push(res.refs);
      }
    } else if (r.step.type === "read") {
      const res = r.result;
      if (res?.text !== undefined) {
        lines.push(`
--- Read (step ${r.stepIndex}${res.truncated ? ", truncated" : ""}) ---`);
        lines.push(res.text);
      }
    } else if (r.step.type === "extract" || r.step.type === "evaluate") {
      lines.push(`
step ${r.stepIndex} (${r.step.type}): ${JSON.stringify(r.result)}`);
    }
  }
  if (data.obstacles && data.obstacles.length > 0) {
    lines.push(`
Obstacles handled:`);
    for (const o of data.obstacles) {
      lines.push(`  [step ${o.detectedAtStep}] ${o.type}: ${o.resolved ? o.resolution : "UNRESOLVED - " + (o.resolution || "unknown")}`);
    }
  }
  if (data.capturedApi && data.capturedApi.length > 0) {
    lines.push(`
--- Captured API ---`);
    for (const api of data.capturedApi) {
      lines.push(`
${api.domain} (${api.baseUrl})`);
      lines.push("  Endpoints:");
      for (const ep of api.endpoints) {
        lines.push(`    ${ep.method} ${ep.path}  [step ${ep.triggeredAtStep}, status ${ep.responseStatus}]`);
      }
    }
  }
  if (data.error) {
    lines.push(`
--- Failure ---`);
    if (typeof data.error === "string") {
      lines.push(`Error: ${data.error}`);
    } else {
      lines.push(`Failed at step ${data.error.failedAtStep}: ${JSON.stringify(data.error.failedStep)}`);
      lines.push(`Error type: ${data.error.errorType}`);
      lines.push(`Message: ${data.error.message}`);
      lines.push(`Retryable: ${data.error.retryable}`);
      if (data.error.suggestion)
        lines.push(`Suggestion: ${data.error.suggestion}`);
      if (data.error.pageState?.url)
        lines.push(`URL at failure: ${data.error.pageState.url}`);
    }
  }
  if (captchaBlocked(data)) {
    lines.push(RECAPTCHA_MANUAL);
  }
  return lines;
}

// src/mcp/tools/execute.ts
function registerExecuteTool(server) {
  server.tool("execute", `Execute a pipeline of browser steps. Auto-starts a session; handles obstacles (captcha, cookie banners) automatically.

MANDATORY PRE-FLIGHT: call \`knowledge get <domain>\` first. If the cache shows a direct-API path that satisfies the request, skip the browser entirely — direct API calls are orders of magnitude cheaper. Every successful run updates the cache silently.

Steps run sequentially (20s stale-state timeout per step; failures return errorType + suggestion).

Seeing the page: \`snapshot\` lists interactive elements with refs (@e1…), \`find\` locates one element by role/name/text, \`screenshot\` with annotate=true overlays numbered badges, \`extract\` evaluates JS and returns the result. \`login\` fills login forms from stored credentials (never exposes passwords; handles email-first flows).

Selectors: every selector field accepts @e refs (PREFER them over CSS) and persisted per-domain @a:<name> anchors from the \`remember\` tool. \`remember get <domain>\` before a UI task — an existing anchor can be targeted directly with no snapshot. When a newly found selector works, \`remember save\` it (@e refs reset each snapshot; @a: anchors persist across runs).

FORMS: use \`fill\` for text inputs — never evaluate-set .value (fill fires the framework-aware events; see its description). If a submit still claims fields are empty/required, re-run fill on the flagged field rather than assuming the value didn't land.

Returns: ok, completedSteps, output for snapshot/find/read/extract steps, obstacles, capturedApi, and on failure a screenshot path + errorType + suggestion + retryable.`, {
    steps: import_zod3.z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
    options: import_zod3.z.object({
      staleTimeoutMs: import_zod3.z.number().optional().describe("Override the 20s stale-state timeout per step"),
      screenshotAfterEach: import_zod3.z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
      continueOnObstacle: import_zod3.z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: import_zod3.z.boolean().optional().describe("Continue past failing steps (default: false)"),
      captureApi: import_zod3.z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes."),
      mode: import_zod3.z.enum(["headless", "binary-headful", "docker-headful", "extension"]).optional().describe("DO NOT SET unless the user explicitly requests a mode — iframer auto-selects and auto-escalates. 'extension' drives a real-Chrome tab (requires options.tabId from the `tabs` tool)."),
      autoEscalate: import_zod3.z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
      instanceId: import_zod3.z.string().optional().describe("Named parallel browser (default 'default') — distinct ids drive several browsers at once, each with its own session state."),
      tabId: import_zod3.z.number().optional().describe("mode='extension': the real-Chrome tab id to drive (from the `tabs` tool)."),
      clientId: import_zod3.z.string().optional().describe("mode='extension': owning profile's clientId, only when several browsers are connected and the tab is ambiguous."),
      focus: import_zod3.z.boolean().optional().describe("mode='extension': raise the window to the foreground while driving (default false — background drive with focus emulation). Only if a site ignores background input.")
    }).optional()
  }, async (params) => {
    try {
      const steps = normalizeSteps(params.steps);
      if (params.options?.mode === "extension") {
        const tabId = params.options?.tabId;
        if (typeof tabId !== "number") {
          return err("mode='extension' requires options.tabId. Call the `tabs` tool first to " + "find the id of the tab the user wants to drive.");
        }
        const typeChars = (steps || []).reduce((n, s) => {
          return (s.type === "human-type" || s.type === "type-code") && typeof s.value === "string" ? n + s.value.length : n;
        }, 0);
        const timeoutMs = Math.min(60000 + (steps.length || 0) * 15000 + typeChars * 250, 1200000) + 30000;
        const extResult = await localApiPost("/extension/execute", {
          tabId,
          clientId: params.options?.clientId,
          steps,
          options: params.options
        }, timeoutMs);
        const extLines = formatExecuteResult(extResult);
        const content2 = [{ type: "text", text: extLines.join(`
`) }];
        if (!extResult.ok)
          return { content: content2, isError: true };
        return { content: content2 };
      }
      const dockerRunning = await isDockerRunning();
      async function runWithMode(mode) {
        if (mode === "docker-headful") {
          if (!dockerRunning) {
            return {
              ok: false,
              completedSteps: 0,
              totalSteps: steps.length,
              results: [],
              finalState: { url: "", title: "" },
              obstacles: [],
              durationMs: 0,
              modeUsed: "docker-headful",
              error: {
                failedAtStep: 0,
                failedStep: steps[0],
                errorType: "action-failed",
                message: "docker-headful mode was requested but the Docker API is not reachable.",
                pageState: { url: "", title: "" },
                suggestion: "Start Docker with `bun run start:docker`, or omit options.mode.",
                retryable: false
              }
            };
          }
          return apiPost("/execute", {
            steps,
            options: { ...params.options, mode: "docker-headful", autoEscalate: false }
          });
        }
        return localApiPost("/execute", {
          steps,
          options: { ...params.options, mode: mode || undefined }
        });
      }
      let execResult;
      try {
        execResult = await runWithMode(params.options?.mode);
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        const isCrash = /ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|fetch failed/i.test(msg);
        if (isCrash) {
          log2.info(`Execute crashed (${msg.slice(0, 80)}), restarting local server and retrying...`);
          try {
            await localServer.restart();
          } catch {}
          try {
            execResult = await runWithMode(params.options?.mode);
          } catch (retryErr) {
            return err(`Browser server crashed and retry also failed.
` + `Original: ${msg}
Retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}

` + `Call \`session restart\` to reset, then retry.`);
          }
        } else {
          throw execErr;
        }
      }
      const requestedMode = params.options?.mode;
      if (!execResult.ok && execResult.error?.errorType === "bot-blocked" && params.options?.autoEscalate !== false && !requestedMode) {
        const escalation = ["docker-headful", "binary-headful"];
        for (const nextMode of escalation) {
          if (nextMode === "docker-headful" && !dockerRunning)
            continue;
          log2.info(`Auto-escalating to ${nextMode}`);
          execResult = await runWithMode(nextMode);
          if (execResult.ok)
            break;
          if (execResult.error?.errorType !== "bot-blocked")
            break;
        }
      }
      const lines = formatExecuteResult(execResult);
      let screenshotUrl = null;
      if (execResult.error) {
        screenshotUrl = execResult.error.pageState?.screenshotUrl ?? null;
      } else {
        screenshotUrl = execResult.finalState?.screenshotUrl ?? null;
      }
      if (screenshotUrl) {
        const filePath = await resolveScreenshotPath(screenshotUrl);
        if (filePath) {
          lines.push(`
Screenshot saved: ${filePath}`);
          lines.push("Use the Read tool on the path above to view the screenshot.");
        }
      }
      const content = [{ type: "text", text: lines.join(`
`) }];
      if (!execResult.ok)
        return { content, isError: true };
      return { content };
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/session.ts
var import_zod5 = require("zod");
var import_path7 = __toESM(require("path"));
var import_fs5 = __toESM(require("fs"));

// src/mcp/tools/reverse-engineer.ts
var import_zod4 = require("zod");
function registerReverseEngineerTool(server) {
  server.tool("reverse-engineer", `Reverse-engineer a website's API: runs the steps you provide (SAME format as the \`execute\` tool's steps) while recording every XHR/fetch the page makes — auth tokens, cookies, headers, request/response bodies, ready-to-use curl. Use when the user asks to "reverse engineer", "map", or "capture" a site's API so it can be replayed later.

During capture, drive the site like a user (open the inbox, send a message…) — the actions are what trigger the calls worth recording. Endpoint classification, output layout, and code-generation rules arrive WITH the captured results.`, {
    steps: import_zod4.z.array(import_zod4.z.record(import_zod4.z.string(), import_zod4.z.unknown())).describe("Pipeline steps to run while capturing — same step format as the execute tool"),
    outputDir: import_zod4.z.string().optional().describe("Directory to save the captured API files. If not provided, ask the user or default to ./<domain>/"),
    typed: import_zod4.z.boolean().optional().describe("Save as .ts with inferred types instead of .js. Set to true when the user asks for types, typescript, or type inference."),
    options: import_zod4.z.object({
      staleTimeoutMs: import_zod4.z.number().optional().describe("Override the 20s stale-state timeout per step"),
      continueOnObstacle: import_zod4.z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: import_zod4.z.boolean().optional().describe("Continue past failing steps (default: false)"),
      mode: import_zod4.z.enum(["headless", "binary-headful", "docker-headful", "extension"]).optional().describe("Mode override. 'extension' captures a tab already open in the user's real Chrome (requires options.tabId from `tabs`)."),
      tabId: import_zod4.z.number().optional().describe("mode='extension': the real-Chrome tab id (from `tabs`)."),
      clientId: import_zod4.z.string().optional().describe("mode='extension': owning profile's clientId when the tab is ambiguous.")
    }).optional()
  }, async (params) => {
    try {
      const steps = normalizeSteps(params.steps);
      const execParams = {
        steps,
        options: { ...params.options, captureApi: true }
      };
      const mode = params.options?.mode;
      const dockerRunning = await isDockerRunning();
      let captureResult;
      if (mode === "extension") {
        if (typeof params.options?.tabId !== "number") {
          return err("mode='extension' requires options.tabId. Call the `tabs` tool first to find the tab to reverse-engineer.");
        }
        captureResult = await localApiPost("/extension/execute", {
          tabId: params.options.tabId,
          clientId: params.options.clientId,
          steps,
          options: { ...params.options, captureApi: true }
        });
      } else if (mode === "docker-headful" && dockerRunning) {
        captureResult = await apiPost("/execute", execParams);
      } else {
        captureResult = await localApiPost("/execute", execParams);
      }
      const lines = [];
      lines.push(`ok: ${captureResult.ok}`);
      lines.push(`steps: ${captureResult.completedSteps}/${captureResult.totalSteps}`);
      if (captureResult.durationMs)
        lines.push(`duration: ${captureResult.durationMs}ms`);
      if (captureResult.finalState) {
        lines.push(`
Final page: ${captureResult.finalState.title}`);
        lines.push(`URL: ${captureResult.finalState.url}`);
      }
      if (captureResult.capturedApi && captureResult.capturedApi.length > 0) {
        formatCapturedApi(lines, captureResult.capturedApi, params);
      } else {
        lines.push(`
No API calls were captured. The page may not have made any XHR/fetch requests during the steps, or the steps may not have triggered the expected behavior.`);
      }
      if (captureResult.error) {
        lines.push(`
--- Failure ---`);
        if (typeof captureResult.error === "string") {
          lines.push(`Error: ${captureResult.error}`);
        } else {
          lines.push(`Failed at step ${captureResult.error.failedAtStep}: ${JSON.stringify(captureResult.error.failedStep)}`);
          lines.push(`Error type: ${captureResult.error.errorType}`);
          lines.push(`Message: ${captureResult.error.message}`);
          if (captureResult.error.suggestion)
            lines.push(`Suggestion: ${captureResult.error.suggestion}`);
        }
      }
      const screenshotUrl = captureResult.error?.pageState?.screenshotUrl ?? captureResult.finalState?.screenshotUrl;
      if (screenshotUrl) {
        const filePath = await resolveScreenshotPath(screenshotUrl);
        if (filePath) {
          lines.push(`
Screenshot saved: ${filePath}`);
          lines.push("Use the Read tool on the path above to view the screenshot.");
        }
      }
      if (captureResult.capturedApi && captureResult.capturedApi.length > 0) {
        const mainDomain = captureResult.capturedApi[0]?.domain || "api";
        const outDir = params.outputDir || `./${mainDomain}`;
        try {
          const fs5 = await import("fs");
          const path7 = await import("path");
          fs5.mkdirSync(outDir, { recursive: true });
          const jsonPath = path7.join(outDir, "captured-api.json");
          fs5.writeFileSync(jsonPath, JSON.stringify(captureResult.capturedApi, null, 2));
          lines.push(`
Full captured data saved to: ${jsonPath}`);
          lines.push("Read this file for complete curl commands, request/response bodies, and auth data.");
        } catch (writeErr) {
          lines.push(`
(Could not save captured JSON: ${writeErr instanceof Error ? writeErr.message : String(writeErr)})`);
        }
      }
      let text = lines.join(`
`);
      if (text.length > 30000) {
        text = text.slice(0, 30000) + `

[... index truncated — read captured-api.json for the full endpoint list and all detail]`;
      }
      const content = [{ type: "text", text }];
      if (!captureResult.ok)
        return { content, isError: true };
      return { content };
    } catch (e) {
      return err(`Connection error: ${getErrorMessage(e)}. Try \`session restart\` and retry.`);
    }
  });
}
function formatCapturedApi(lines, capturedApi, params) {
  for (const api of capturedApi) {
    lines.push(`
━━━ ${api.domain} (${api.baseUrl}) ━━━`);
    const authParts = [];
    if (api.auth?.authorization)
      authParts.push(`Authorization: ${api.auth.authorization.slice(0, 30)}...`);
    if (api.auth?.cookies && Object.keys(api.auth.cookies).length > 0)
      authParts.push(`${Object.keys(api.auth.cookies).length} cookies`);
    if (api.auth?.tokens && Object.keys(api.auth.tokens).length > 0) {
      for (const [k, v] of Object.entries(api.auth.tokens)) {
        authParts.push(`${k}: ${String(v).slice(0, 30)}...`);
      }
    }
    if (authParts.length > 0) {
      lines.push(`
Auth:`);
      for (const part of authParts)
        lines.push(`  ${part}`);
    }
    const byProtocol = new Map;
    for (const ep of api.endpoints) {
      const p = ep.protocol || "rest";
      if (!byProtocol.has(p))
        byProtocol.set(p, []);
      byProtocol.get(p).push(ep);
    }
    const protocolSummary = Array.from(byProtocol.entries()).map(([p, eps]) => `${p}=${eps.length}`).join(", ");
    lines.push(`
Endpoints (${api.endpoints.length}) [${protocolSummary}] — full detail in captured-api.json:`);
    for (const ep of api.endpoints) {
      const params2 = ep.requestBody ? extractSignalKeys(ep.requestBody) : null;
      const tail = params2 ? `  {${params2}}` : "";
      lines.push(`  [${ep.protocol}/${ep.verb}] ${ep.method} ${ep.path} → ${ep.functionName}${tail}`);
    }
  }
  const mainDomain = capturedApi[0]?.domain || "api";
  const dir = params.outputDir || `./${mainDomain}`;
  const ext = params.typed ? ".ts" : ".js";
  lines.push(`
━━━ Save instructions ━━━`);
  lines.push(`Save to: ${dir}`);
  lines.push(`Format: ${ext} files`);
  const protocolsSeen = new Set;
  for (const api of capturedApi)
    for (const ep of api.endpoints)
      protocolsSeen.add(ep.protocol);
  lines.push(`
Layout (protocols present: ${Array.from(protocolsSeen).join(", ")}):`);
  lines.push(`  auth${ext}`);
  if (protocolsSeen.has("rest"))
    lines.push(`  transport/rest${ext}            — shared fetch wrapper with auth headers`);
  if (protocolsSeen.has("graphql"))
    lines.push(`  transport/graphql${ext}         — post(operationName|docId, variables) → shared GraphQL client`);
  if (protocolsSeen.has("json-rpc"))
    lines.push(`  transport/jsonRpc${ext}         — shared JSON-RPC client`);
  if (protocolsSeen.has("grpc-web"))
    lines.push(`  transport/grpc${ext}            — shared gRPC-web client`);
  if (protocolsSeen.has("form-rpc"))
    lines.push(`  transport/formRpc${ext}         — shared urlencoded RPC client`);
  if (protocolsSeen.has("soap"))
    lines.push(`  transport/soap${ext}            — shared SOAP client`);
  lines.push(`  <protocol>/<verb>/<functionName>${ext}  — one file per endpoint, uses shared transport`);
  lines.push(`    e.g. graphql/queries/<fn>${ext}, graphql/mutations/<fn>${ext}, rest/read/<fn>${ext}, rest/create/<fn>${ext}`);
  lines.push(`  index${ext}                         — re-export all endpoint functions`);
  if (params.typed)
    lines.push(`  types.ts                         — interfaces inferred from response bodies`);
  lines.push(`  README.md                        — endpoints grouped by protocol + verb, auth expiry warning`);
  lines.push(`
How to read the endpoint list — one request ≠ one endpoint; an endpoint is (protocol, action):`);
  lines.push(`  REST: action = "METHOD /parameterized/path" · GraphQL: action = operationName (or doc_id for persisted queries) — many ops share one /graphql URL, EACH is its own endpoint · JSON-RPC: action = body.method · gRPC-web: action = request path · Form-RPC (FB-style urlencoded): action = fb_api_req_friendly_name / doc_id · SOAP: action = SOAPAction header.`);
  lines.push(`  iframer already classified everything — use .protocol, .action, .verb, .functionName directly.`);
  lines.push(`
Rules:`);
  lines.push(`  - One function per (protocol, action) — NEVER merge GraphQL operations just because they share the URL. Use the functionName field verbatim for the file + export name.`);
  lines.push(`  - verb=read|list → queries/ (GraphQL) or read/ (REST). verb=create|update|delete|action → mutations/ (GraphQL) or verb dir (REST).`);
  lines.push(`  - Each endpoint file is minimal: import transport + auth, call transport with the action id, pass variables, return typed result.`);
  lines.push(`  - GraphQL transport signature: post(opNameOrDocId: string, variables: object). Pick doc_id when present in captured body, else operationName.`);
  lines.push(`  - Do NOT inline auth headers per endpoint — they live in auth${ext} and the transport reads them.`);
  lines.push(`
IMPORTANT: Auth data contains real tokens/cookies — they expire. Remind the user.`);
}
function extractSignalKeys(body) {
  const NOISE = new Set([
    "__csr",
    "__hsdp",
    "__hblp",
    "__dyn",
    "__a",
    "__req",
    "__hs",
    "__comet_req",
    "__ccg",
    "__spin_r",
    "__spin_b",
    "__spin_t",
    "__jssesw",
    "lsd",
    "fb_dtsg",
    "fb_api_caller_class",
    "fb_api_req_friendly_name",
    "jazoest",
    "server_timestamps",
    "__s",
    "__user",
    "dpr",
    "__rev"
  ]);
  const signalEntries = [];
  for (const [k, v] of Object.entries(body)) {
    if (NOISE.has(k))
      continue;
    if (typeof v === "string" && v.length > 80) {
      signalEntries.push(`${k}=${v.slice(0, 40)}...`);
    } else if (Array.isArray(v)) {
      const items = v.slice(0, 8).map((x) => String(x)).join(",");
      signalEntries.push(`${k}=[${items}${v.length > 8 ? ",…" : ""}]`);
    } else if (typeof v === "object" && v !== null) {
      const keys = Object.keys(v).slice(0, 5).join(",");
      signalEntries.push(`${k}={${keys}${Object.keys(v).length > 5 ? ",..." : ""}}`);
    } else {
      signalEntries.push(`${k}=${String(v).slice(0, 40)}`);
    }
  }
  return signalEntries.length > 0 ? signalEntries.join(", ") : null;
}

// src/mcp/tools/session.ts
function registerSessionTool(server) {
  server.tool("session", `Manage the browser session/lifecycle.

stop: save cookies/localStorage and close the browser — ALWAYS call when browser work is done. clear: wipe stored session data (doesn't kill browsers). restart: kill all browser instances and reset — use when frozen/crashed/bad state (credentials + knowledge unaffected). capture-start / capture-stop: persistent XHR/fetch recorder not tied to a pipeline — start it, trigger the action you want captured, stop to return + save endpoints. get-cookies: all cookies via CDP incl. HttpOnly (pass urls to scope). get-auth: cookies + localStorage + sessionStorage in one shot, for replaying authed requests.`, {
    action: import_zod5.z.enum(["stop", "clear", "restart", "capture-start", "capture-stop", "get-cookies", "get-auth"]).describe("stop | clear | restart | capture-start | capture-stop | get-cookies | get-auth"),
    mode: import_zod5.z.enum(["headless", "binary-headful"]).optional().describe("Browser mode (default: binary-headful)"),
    urls: import_zod5.z.array(import_zod5.z.string()).optional().describe("URLs to scope cookie extraction (get-cookies/get-auth). Omit for all cookies."),
    instanceId: import_zod5.z.string().optional().describe("Target a named parallel browser within this session (default: 'default'). Match the instanceId used in execute."),
    outputDir: import_zod5.z.string().optional().describe("Where to save captured-api.json for capture-stop")
  }, async ({ action, mode, urls, instanceId, outputDir }) => {
    try {
      if (action === "stop") {
        const result = await localApiPost("/interactive/stop").catch(() => ({ ok: true, sessionSaved: false }));
        return { content: [{ type: "text", text: `Session stopped. State saved: ${result.sessionSaved ?? false}` }] };
      }
      if (action === "clear") {
        await localApiDelete("/session").catch(() => {});
        return { content: [{ type: "text", text: "Session data cleared from database." }] };
      }
      if (action === "restart") {
        const parts = [];
        try {
          await localApiPost("/browser/restart");
          parts.push("Local browser restarted.");
        } catch {
          try {
            await localServer.restart();
            parts.push("Local server respawned.");
          } catch (e) {
            parts.push(`Local restart failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        try {
          if (await isDockerRunning()) {
            await apiPost("/browser/restart");
            parts.push("Docker browser restarted.");
          }
        } catch {}
        parts.push("Credentials and knowledge cache are untouched. Next execute launches a fresh browser.");
        return { content: [{ type: "text", text: parts.join(" ") }] };
      }
      if (action === "capture-start") {
        const result = await localApiPost("/capture/start", { mode: mode ?? "binary-headful", instanceId });
        return { content: [{ type: "text", text: result.message }] };
      }
      if (action === "capture-stop") {
        const result = await localApiPost("/capture/stop", { mode: mode ?? "binary-headful", instanceId });
        const lines = [result.message];
        if (result.capturedApi && result.capturedApi.length > 0) {
          formatCapturedApi(lines, result.capturedApi, { outputDir, typed: false });
          const outDir = outputDir || import_path7.default.join(getDataDir(), "capture");
          try {
            import_fs5.default.mkdirSync(outDir, { recursive: true });
            const jsonPath = import_path7.default.join(outDir, "captured-api.json");
            import_fs5.default.writeFileSync(jsonPath, JSON.stringify(result.capturedApi, null, 2));
            lines.push(`
Full data saved to: ${jsonPath}`);
          } catch (writeErr) {
            lines.push(`
(Could not save: ${writeErr instanceof Error ? writeErr.message : String(writeErr)})`);
          }
        }
        let text = lines.join(`
`);
        if (text.length > 80000)
          text = text.slice(0, 80000) + `

[truncated — read captured-api.json]`;
        return { content: [{ type: "text", text }] };
      }
      if (action === "get-cookies") {
        const result = await localApiPost("/auth/cookies", { mode: mode ?? "binary-headful", urls, instanceId });
        const lines = [result.message, ""];
        for (const c of result.cookies) {
          lines.push(`${c.name}=${c.value}  [domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} secure=${c.secure}]`);
        }
        return { content: [{ type: "text", text: lines.join(`
`) }] };
      }
      if (action === "get-auth") {
        const result = await localApiPost("/auth/full", { mode: mode ?? "binary-headful", urls, instanceId });
        const lines = [result.message, ""];
        lines.push("=== Cookies ===");
        for (const c of result.cookies) {
          lines.push(`${c.name}=${c.value}  [domain=${c.domain} httpOnly=${c.httpOnly}]`);
        }
        if (Object.keys(result.localStorage || {}).length > 0) {
          lines.push(`
=== localStorage ===`);
          for (const [origin, store] of Object.entries(result.localStorage)) {
            lines.push(`[${origin}]`);
            for (const [k, v] of Object.entries(store)) {
              const val = String(v);
              lines.push(`  ${k}: ${val.length > 120 ? val.slice(0, 120) + "…" : val}`);
            }
          }
        }
        if (Object.keys(result.sessionStorage || {}).length > 0) {
          lines.push(`
=== sessionStorage ===`);
          for (const [origin, store] of Object.entries(result.sessionStorage)) {
            lines.push(`[${origin}]`);
            for (const [k, v] of Object.entries(store)) {
              const val = String(v);
              lines.push(`  ${k}: ${val.length > 120 ? val.slice(0, 120) + "…" : val}`);
            }
          }
        }
        let text = lines.join(`
`);
        if (text.length > 80000)
          text = text.slice(0, 80000) + `
[truncated]`;
        return { content: [{ type: "text", text }] };
      }
      return err("Unknown action");
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/credentials.ts
var import_zod6 = require("zod");
var import_fs7 = __toESM(require("fs"));
var import_path9 = __toESM(require("path"));

// src/lib/knowledge.ts
var import_fs6 = __toESM(require("fs"));
var import_path8 = __toESM(require("path"));
var log4 = createLogger("knowledge");
function getKnowledgeDir() {
  return import_path8.default.join(getDataDir(), "knowledge");
}
function getKnowledgePath(domain) {
  const safe = sanitizeDomain(domain);
  return import_path8.default.join(getKnowledgeDir(), `${safe}.md`);
}
function normalizeDomain(input) {
  let d = (input || "").trim().toLowerCase();
  if (!d)
    return "";
  try {
    if (d.includes("://")) {
      d = new URL(d).hostname;
    } else if (d.includes("/")) {
      d = new URL(`https://${d}`).hostname;
    }
  } catch {}
  d = d.replace(/:\d+$/, "");
  d = d.replace(/^www\./, "");
  return d;
}
function sanitizeDomain(input) {
  const normalized = normalizeDomain(input);
  return normalized.replace(/[^a-z0-9.-]/g, "_");
}
function readKnowledge(domain) {
  const p = getKnowledgePath(domain);
  try {
    return import_fs6.default.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function listKnowledge() {
  const dir = getKnowledgeDir();
  let entries = [];
  try {
    entries = import_fs6.default.readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const file of entries) {
    if (!file.endsWith(".md"))
      continue;
    const full = import_path8.default.join(dir, file);
    try {
      const stat = import_fs6.default.statSync(full);
      const raw = import_fs6.default.readFileSync(full, "utf8");
      const parsed = parseMarkdown(raw);
      results.push({
        domain: parsed?.domain ?? file.replace(/\.md$/, ""),
        lastVerified: parsed?.lastVerified ?? new Date(stat.mtimeMs).toISOString(),
        lastMode: parsed?.lastMode ?? "unknown",
        sizeBytes: stat.size
      });
    } catch {}
  }
  results.sort((a, b) => a.lastVerified < b.lastVerified ? 1 : -1);
  return results;
}
function clearKnowledge(domain) {
  const dir = getKnowledgeDir();
  if (domain) {
    const p = getKnowledgePath(domain);
    try {
      import_fs6.default.unlinkSync(p);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  let removed = 0;
  try {
    const entries = import_fs6.default.readdirSync(dir);
    for (const f of entries) {
      if (f.endsWith(".md")) {
        try {
          import_fs6.default.unlinkSync(import_path8.default.join(dir, f));
          removed++;
        } catch {}
      }
    }
  } catch {}
  return { removed };
}
function parseMarkdown(raw) {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch)
    return null;
  const fm = {};
  for (const line of frontmatterMatch[1].split(`
`)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m)
      fm[m[1]] = m[2].trim();
  }
  const body = raw.slice(frontmatterMatch[0].length);
  const auth = { type: fm.authType ?? "unknown" };
  const authSection = extractSection(body, "Auth material");
  if (authSection) {
    auth.cookieNames = extractBackticks(/\*\*Required cookies:\*\*\s+(.+)/, authSection);
    auth.localStorageKeys = extractBackticks(/\*\*localStorage keys:\*\*\s+(.+)/, authSection);
    auth.sessionStorageKeys = extractBackticks(/\*\*sessionStorage keys:\*\*\s+(.+)/, authSection);
    auth.headers = extractBackticks(/\*\*Request headers:\*\*\s+(.+)/, authSection);
  }
  const endpoints = [];
  const endpointSection = extractSection(body, "Known endpoints");
  if (endpointSection) {
    const endpointRegex = /^### (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s*$/gim;
    let m;
    while ((m = endpointRegex.exec(endpointSection)) !== null) {
      endpoints.push({ method: m[1], path: m[2] });
    }
  }
  const notes = [];
  const notesSection = extractSection(body, "Notes");
  if (notesSection) {
    for (const line of notesSection.split(`
`)) {
      const m = line.match(/^-\s+(.+)$/);
      if (m)
        notes.push(m[1].trim());
    }
  }
  return {
    domain: fm.domain ?? "",
    lastVerified: fm.lastVerified ?? "",
    lastMode: fm.lastMode ?? "unknown",
    browserRequired: fm.browserRequired !== "false",
    auth,
    endpoints,
    notes
  };
}
function extractSection(body, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const match = body.match(re);
  if (!match || match.index === undefined)
    return null;
  const start = match.index + match[0].length;
  const nextSection = body.slice(start).match(/^##\s+/m);
  const end = nextSection?.index != null ? start + nextSection.index : body.length;
  return body.slice(start, end);
}
function extractBackticks(re, text) {
  const m = text.match(re);
  if (!m)
    return;
  const items = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  return items.length > 0 ? items : undefined;
}

// src/mcp/tools/credentials.ts
var ELICIT_TIMEOUT_MS = 45000;
function mcpLog(event, data) {
  try {
    const dir = getDataDir();
    import_fs7.default.mkdirSync(dir, { recursive: true });
    import_fs7.default.appendFileSync(import_path9.default.join(dir, "mcp.log"), JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + `
`);
  } catch {}
}
function domainMatches(normalized, stored) {
  return stored.some((d) => d === normalized || normalized.endsWith("." + d) || d.endsWith("." + normalized));
}
function registerCredentialsTool(server) {
  server.tool("credentials", `Store/list login credentials (one local SQLite store shared by all browser modes). This tool never logs in — logins run via \`execute\`'s \`login\` step.

WORKFLOW: (1) action=list and read the response LITERALLY — never ask the user whether credentials exist, never confabulate. (2) Domain missing → action=store pops a secure form in the user's UI; if the response is an elicitation-unsupported error, relay its CLI instructions verbatim and STOP (never pretend it succeeded). (3) Then \`execute\` [{type:"navigate",url:"https://<site>/login"},{type:"login",domain:"<site>"}] — auto-detects the form, fills stored credentials, handles 2FA, escalates modes if blocked.

RULES: NEVER re-store after a failed login (that's a browser/bot problem; the store is rejected anyway). NEVER ask for passwords in chat. force:true only for an explicit password change.`, {
    action: import_zod6.z.enum(["store", "list"]).describe("store: prompt for credentials | list: show stored domains"),
    domain: import_zod6.z.string().optional().describe("Domain (required for store). Use the bare registrable domain."),
    force: import_zod6.z.boolean().optional().describe("Overwrite existing. ONLY for explicit password changes.")
  }, async ({ action, domain, force }) => {
    try {
      if (action === "list") {
        const credData2 = await localApiGet("/credentials");
        const domains = credData2.domains || [];
        if (!domains.length) {
          return { content: [{ type: "text", text: "No credentials stored. Call this tool again with action=store and the domain to prompt the user for credentials now." }] };
        }
        return { content: [{ type: "text", text: `Stored credentials for:
${domains.map((d) => `  - ${d}`).join(`
`)}` }] };
      }
      if (action !== "store")
        return err("Unknown action");
      if (!domain)
        return err("domain is required for action=store");
      const normalized = normalizeDomain(domain);
      const credData = await localApiGet("/credentials");
      const stored = credData.domains || [];
      if (domainMatches(normalized, stored) && !force) {
        mcpLog("credentials.store.rejected_already_exists", { domain: normalized });
        return err(`REFUSING TO RE-STORE: credentials for "${normalized}" already exist. ` + `Login failures are NOT credential problems — retry with a stronger browser mode.

` + `Use \`force: true\` ONLY if the user explicitly says their password changed.`);
      }
      mcpLog("credentials.store.attempt", { domain: normalized, force: !!force });
      let result;
      try {
        const elicitPromise = server.server.elicitInput({
          mode: "form",
          message: `Enter your login credentials for ${normalized}. These are encrypted and stored locally — the agent never sees them.`,
          requestedSchema: {
            type: "object",
            properties: {
              username: { type: "string", title: "Username / Email" },
              password: { type: "string", title: "Password" },
              totp_secret: { type: "string", title: "TOTP Secret (leave empty if no 2FA)" }
            },
            required: ["username", "password"]
          }
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`elicitation timed out after ${ELICIT_TIMEOUT_MS}ms`)), ELICIT_TIMEOUT_MS));
        result = await Promise.race([elicitPromise, timeoutPromise]);
      } catch (elicitErr) {
        const msg = elicitErr instanceof Error ? elicitErr.message : String(elicitErr);
        mcpLog("credentials.store.elicit_failed", { domain: normalized, error: msg });
        return err(`FAILED TO STORE CREDENTIALS for ${normalized}: ${msg}

` + `The user MUST run this command in their terminal:

` + `  iframer-toolkit credentials add ${normalized}

` + `After they run it, retry the login. DO NOT pretend credentials were stored.`);
      }
      mcpLog("credentials.store.elicit_result", { domain: normalized, action: result.action, hasContent: !!result.content });
      if (result.action !== "accept" || !result.content) {
        return err(`Credential form was ${result.action || "dismissed"}. No credentials saved for ${normalized}.`);
      }
      const { username, password, totp_secret } = result.content;
      if (!username || !password) {
        return err(`Form submitted but username or password was empty. No credentials saved.`);
      }
      try {
        const storeResult = await localApiPost("/credentials", {
          domain: normalized,
          username,
          password,
          totp_secret: totp_secret || undefined
        });
        if (!storeResult.ok)
          return err(`Failed to store: ${storeResult.error}`);
      } catch (storeErr) {
        const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
        mcpLog("credentials.store.write_failed", { domain: normalized, error: msg });
        return err(`Failed to write credentials: ${msg}`);
      }
      mcpLog("credentials.store.success", { domain: normalized });
      return { content: [{ type: "text", text: `Credentials stored for ${normalized}. Shared across all browser modes.` }] };
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/knowledge.ts
var import_zod7 = require("zod");
function registerKnowledgeTool(server) {
  server.tool("knowledge", `Per-domain knowledge cache (markdown at ~/.iframer/knowledge/<domain>.md): auth mechanism (load-bearing cookies/headers), captured API endpoints, captcha/bot notes, last working browser mode.

MANDATORY: \`knowledge get <domain>\` BEFORE any execute/browse on a site. If it shows a direct-API path that satisfies the request, call the endpoints directly and SKIP the browser entirely — orders of magnitude cheaper. Empty/stale → fall through to \`execute\` (successful runs update the cache automatically). Cached endpoints returning 401/403 → stale session: run an execute pipeline with a \`login\` step.

Actions: get <domain> · list · clear [domain].`, {
    action: import_zod7.z.enum(["get", "list", "clear"]).describe("get: return cache for a domain | list: all cached domains | clear: delete cache"),
    domain: import_zod7.z.string().optional().describe("Domain (required for get; optional for clear — omit to clear everything)")
  }, async ({ action, domain }) => {
    try {
      if (action === "list") {
        const entries = listKnowledge();
        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No cached knowledge yet. Every successful `execute` run populates the cache for its target domain automatically."
              }
            ]
          };
        }
        const lines = [`${entries.length} domain${entries.length === 1 ? "" : "s"} cached:
`];
        for (const e of entries) {
          lines.push(`  ${e.domain}  (${e.lastMode}, verified ${e.lastVerified}, ${e.sizeBytes}B)`);
        }
        lines.push("\nCall `knowledge get <domain>` for the full cache contents.");
        return { content: [{ type: "text", text: lines.join(`
`) }] };
      }
      if (action === "get") {
        if (!domain)
          return err("domain is required for action=get");
        const md = readKnowledge(domain);
        if (!md) {
          return {
            content: [
              {
                type: "text",
                text: `No cache for ${sanitizeDomain(domain)}. Run \`execute\` with a pipeline that navigates to this domain (and optionally enables captureApi) — the cache will be populated automatically on success.`
              }
            ]
          };
        }
        return { content: [{ type: "text", text: md }] };
      }
      if (action === "clear") {
        const { removed } = clearKnowledge(domain);
        const scope = domain ? `for ${sanitizeDomain(domain)}` : "(all domains)";
        return {
          content: [
            {
              type: "text",
              text: `Cleared ${removed} cache entr${removed === 1 ? "y" : "ies"} ${scope}.`
            }
          ]
        };
      }
      return err("Unknown action");
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/tabs.ts
var import_zod8 = require("zod");
function registerTabsTool(server) {
  server.tool("tabs", `List/control tabs in the user's REAL Chrome via the iframer extension (must be installed + paired; returns a connect hint otherwise).

Use when the user references an open tab ("my Gmail tab"). Match by url/title from the returned tabs, then drive that tab with \`execute\` options.mode="extension", options.tabId=<id> (Chrome shows its debug bar during runs). Several matches → ask, don't guess.

Actions: list (default) → {connected, tabs:[{id,title,url,active,windowId}]} · open → new native tab at options.url, returns its id · group / ungroup / update-group / groups → native Chrome tab-group management (title/color/collapsed; groups lists ids).`, {
    action: import_zod8.z.enum(["list", "open", "group", "ungroup", "update-group", "groups"]).optional().describe("'list' (default) lists open tabs; 'open' opens a new tab; 'group'/'ungroup' add/remove tabIds to a group; 'update-group' renames/recolors an existing group by groupId; 'groups' lists all groups."),
    url: import_zod8.z.string().optional().describe("With action='open': the URL to open (omit for a blank tab)."),
    active: import_zod8.z.boolean().optional().describe("With action='open': focus the new tab (default true)."),
    tabIds: import_zod8.z.array(import_zod8.z.number()).optional().describe("With action='group': the tab ids to group (must be in the same window)."),
    title: import_zod8.z.string().optional().describe("With action='group': the group's label."),
    color: import_zod8.z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]).optional().describe("With action='group': the group's color."),
    collapsed: import_zod8.z.boolean().optional().describe("With action='group': collapse the group."),
    groupId: import_zod8.z.number().optional().describe("With action='group': add tabs to this existing group instead of creating a new one."),
    clientId: import_zod8.z.string().optional().describe("With action='open'/'group' and multiple profiles connected: which profile to act in."),
    filter: import_zod8.z.string().optional().describe("With action='list': case-insensitive substring to match against tab url or title (e.g. 'gmail', 'github.com'). Omit to list every open tab.")
  }, async ({ action, url, active, tabIds, title, color, collapsed, groupId, clientId, filter }) => {
    try {
      if (action === "open") {
        const res = await localApiPost("/extension/tab/create", { url, active, clientId });
        if (!res.ok || !res.tab)
          return err(res.error || "Failed to open tab.");
        const t = res.tab;
        return {
          content: [
            {
              type: "text",
              text: `Opened tab [id ${t.id}] ${t.title || t.url}
${t.url}
Drive it with: execute mode="extension", tabId=${t.id}.`
            }
          ]
        };
      }
      if (action === "group") {
        if (!tabIds || tabIds.length === 0)
          return err("action='group' requires tabIds (array of tab ids).");
        const res = await localApiPost("/extension/tab/group", { tabIds, title, color, collapsed, groupId, clientId });
        if (!res.ok || !res.group)
          return err(res.error || "Failed to group tabs.");
        const g = res.group;
        return {
          content: [
            {
              type: "text",
              text: `Grouped ${tabIds.length} tab(s) into group ${g.groupId}${g.title ? ` "${g.title}"` : ""}${g.color ? ` (${g.color})` : ""}${g.collapsed ? ", collapsed" : ""}.`
            }
          ]
        };
      }
      if (action === "ungroup") {
        if (!tabIds || tabIds.length === 0)
          return err("action='ungroup' requires tabIds.");
        const res = await localApiPost("/extension/tab/ungroup", { tabIds, clientId });
        if (!res.ok)
          return err(res.error || "Failed to ungroup tabs.");
        return { content: [{ type: "text", text: `Ungrouped ${tabIds.length} tab(s).` }] };
      }
      if (action === "update-group") {
        if (typeof groupId !== "number")
          return err("action='update-group' requires groupId (from action='groups'). Pass any of title, color, collapsed.");
        const res = await localApiPost("/extension/group/update", { groupId, title, color, collapsed, clientId });
        if (!res.ok || !res.group)
          return err(res.error || "Failed to update group.");
        const g = res.group;
        return { content: [{ type: "text", text: `Updated group ${g.groupId} → title "${g.title}", color ${g.color}${g.collapsed ? ", collapsed" : ""}.` }] };
      }
      if (action === "groups") {
        const res = await localApiPost("/extension/groups", { clientId });
        if (!res.ok)
          return err(res.error || "Failed to list groups.");
        const groups = res.groups || [];
        if (groups.length === 0)
          return { content: [{ type: "text", text: "No tab groups open." }] };
        const lines2 = [`${groups.length} tab group(s):`, ""];
        for (const g of groups)
          lines2.push(`  [group ${g.groupId}] "${g.title || "(untitled)"}" — ${g.color}${g.collapsed ? ", collapsed" : ""} (window ${g.windowId})`);
        return { content: [{ type: "text", text: lines2.join(`
`) }] };
      }
      const status = await localApiGet("/extension/status");
      if (!status.connected) {
        return err(`No iframer extension is connected.

` + `To use your real Chrome tabs:
` + "1. Install the iframer extension (chrome://extensions → Load unpacked → the `extension/` folder).\n" + "2. Run `iframer install extension` in a terminal, then restart the browser — the extension pairs itself.\n" + "   (Manual fallback: click the iframer icon and paste the token from `cat ~/.iframer/secret`.)\n" + "Once the dot is green, run `tabs` again — iframer can then see and drive any open tab.");
      }
      const data = await localApiPost("/extension/tabs", {});
      let tabs = data.tabs || [];
      const clients = data.clients || [];
      const multiProfile = clients.length > 1;
      if (filter) {
        const f = filter.toLowerCase();
        tabs = tabs.filter((t) => t.url.toLowerCase().includes(f) || (t.title || "").toLowerCase().includes(f));
      }
      if (tabs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: filter ? `Extension connected, but no open tab matches "${filter}".` : "Extension connected, but no tabs were reported."
            }
          ]
        };
      }
      const profiles = clients.map((c) => c.profileName || c.clientId.slice(0, 8)).join(", ");
      const ver = clients[0]?.extVersion ? ` [ext v${clients[0].extVersion}]` : "";
      const lines = [
        `Connected: ${clients.length} profile${clients.length > 1 ? "s" : ""}${profiles ? ` (${profiles})` : ""}${ver}.`,
        `${tabs.length} tab${tabs.length > 1 ? "s" : ""}${filter ? ` matching "${filter}"` : ""}:`,
        ""
      ];
      for (const t of tabs) {
        const prof = multiProfile ? `  «${t.profileName || t.clientId.slice(0, 8)}»` : "";
        lines.push(`  [id ${t.id}]${t.active ? " (active)" : ""}${prof} ${t.title}`);
        lines.push(`         ${t.url}`);
        if (multiProfile)
          lines.push(`         clientId: ${t.clientId}`);
      }
      lines.push("");
      lines.push('To drive one: execute with options.mode="extension", options.tabId=<id>.');
      if (multiProfile) {
        lines.push("Multiple profiles are connected — if two tabs share a title, also pass options.clientId " + "(shown as «profile» above maps to a clientId) so the right profile is driven.");
      }
      return { content: [{ type: "text", text: lines.join(`
`) }] };
    } catch (e) {
      return err(`Error listing tabs: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/anchors.ts
var import_zod9 = require("zod");

// src/lib/knowledge/component-map.ts
var import_fs8 = __toESM(require("fs"));
var import_path10 = __toESM(require("path"));
function anchorsPath(domain) {
  return import_path10.default.join(getKnowledgeDir(), `${sanitizeDomain(domain)}.anchors.json`);
}
function loadComponentMap(domain) {
  const norm = normalizeDomain(domain);
  try {
    const raw = import_fs8.default.readFileSync(anchorsPath(norm), "utf8");
    const parsed = JSON.parse(raw);
    return {
      domain: parsed.domain || norm,
      anchors: parsed.anchors || {},
      quirks: Array.isArray(parsed.quirks) ? parsed.quirks : []
    };
  } catch {
    return { domain: norm, anchors: {}, quirks: [] };
  }
}
function write(cm) {
  import_fs8.default.mkdirSync(getKnowledgeDir(), { recursive: true });
  import_fs8.default.writeFileSync(anchorsPath(cm.domain), JSON.stringify(cm, null, 2), "utf8");
}
function saveAnchor(domain, input, now) {
  const cm = loadComponentMap(domain);
  cm.anchors[input.name] = {
    name: input.name,
    selector: input.selector,
    role: input.role,
    description: input.description,
    quirks: input.quirks && input.quirks.length ? input.quirks : undefined,
    uses: 0,
    fails: 0,
    lastVerified: now
  };
  write(cm);
}
function removeAnchor(domain, name) {
  const cm = loadComponentMap(domain);
  if (!(name in cm.anchors))
    return false;
  delete cm.anchors[name];
  write(cm);
  return true;
}
function setDomainQuirks(domain, quirks) {
  const cm = loadComponentMap(domain);
  cm.quirks = Array.from(new Set([...cm.quirks, ...quirks]));
  write(cm);
}
function listAnchorDomains() {
  try {
    return import_fs8.default.readdirSync(getKnowledgeDir()).filter((f) => f.endsWith(".anchors.json")).map((f) => f.replace(/\.anchors\.json$/, ""));
  } catch {
    return [];
  }
}

// src/mcp/tools/anchors.ts
function registerRememberTool(server) {
  server.tool("remember", `Persisted per-domain map of a site's UI elements ("anchors") — recall where things are instead of re-exploring the DOM each run.

(1) Before a UI task: \`remember get <domain>\`; an existing anchor is targeted as @a:<name> in any execute selector — no snapshot needed. (2) A newly discovered selector that worked → \`remember save\` it (prefer stable selectors: aria-label, data-qa, role+name). (3) SELF-HEAL: if @a:<name> fails, the page changed — re-discover with snapshot/find and \`remember save\` the new selector; do NOT retry the stale one. (4) \`remember quirk\` records site-wide gotchas ("synthetic clicks ignored — use trusted"); \`get\` surfaces them.`, {
    action: import_zod9.z.enum(["get", "save", "forget", "list", "quirk"]).describe("get: show a domain's anchors+quirks | save: create/overwrite an anchor | forget: delete an anchor | list: all domains with anchors | quirk: add site-wide quirk note(s)"),
    domain: import_zod9.z.string().optional().describe("Site domain, e.g. 'slack.com' or 'app.slack.com' (required for all actions except list)."),
    name: import_zod9.z.string().optional().describe("Anchor name for save/forget, e.g. 'composer', 'send-button', 'search'. Short, stable, kebab-case."),
    selector: import_zod9.z.string().optional().describe("With save: the CSS selector that locates the element. Prefer stable attributes: [aria-label=...], [data-qa=...], role+name. Avoid brittle generated class chains."),
    role: import_zod9.z.string().optional().describe("With save (optional): the element role, e.g. textbox, button, link."),
    description: import_zod9.z.string().optional().describe("With save (optional): a short human note about the element."),
    quirks: import_zod9.z.array(import_zod9.z.string()).optional().describe("With save: element-specific gotchas. With quirk: site-wide gotchas to append.")
  }, async ({ action, domain, name, selector, role, description, quirks }) => {
    try {
      if (action === "list") {
        const domains = listAnchorDomains();
        if (domains.length === 0) {
          return { content: [{ type: "text", text: "No anchors saved yet. Use `remember save` after locating an element with snapshot/find." }] };
        }
        const lines = [`Domains with saved anchors:
`];
        for (const d of domains) {
          const cm = loadComponentMap(d);
          lines.push(`  ${d} — ${Object.keys(cm.anchors).length} anchor(s)${cm.quirks.length ? `, ${cm.quirks.length} quirk(s)` : ""}`);
        }
        lines.push("\nCall `remember get <domain>` for details.");
        return { content: [{ type: "text", text: lines.join(`
`) }] };
      }
      if (!domain)
        return err(`\`${action}\` requires a domain (e.g. 'app.slack.com').`);
      if (action === "get") {
        const cm = loadComponentMap(domain);
        const names = Object.keys(cm.anchors);
        if (names.length === 0 && cm.quirks.length === 0) {
          return { content: [{ type: "text", text: `No anchors saved for ${domain} yet. Discover elements with snapshot/find, then \`remember save\` them.` }] };
        }
        const lines = [`Component map for ${domain}:
`];
        if (cm.quirks.length) {
          lines.push("Site quirks:");
          for (const q of cm.quirks)
            lines.push(`  - ${q}`);
          lines.push("");
        }
        lines.push(`Anchors (use as @a:<name> in any selector):`);
        for (const a of Object.values(cm.anchors)) {
          const health = a.fails > 0 ? `  [${a.uses}✓/${a.fails}✗${a.fails >= a.uses && a.fails >= 2 ? " — likely STALE, re-verify" : ""}]` : a.uses > 0 ? `  [${a.uses}✓]` : "";
          lines.push(`  @a:${a.name}${a.role ? ` (${a.role})` : ""} → ${a.selector}${health}`);
          if (a.description)
            lines.push(`      ${a.description}`);
          if (a.quirks?.length)
            for (const q of a.quirks)
              lines.push(`      • ${q}`);
        }
        return { content: [{ type: "text", text: lines.join(`
`) }] };
      }
      if (action === "quirk") {
        if (!quirks || quirks.length === 0)
          return err("`quirk` requires a non-empty `quirks` array.");
        setDomainQuirks(domain, quirks);
        return { content: [{ type: "text", text: `Added ${quirks.length} quirk(s) to ${domain}.` }] };
      }
      if (action === "forget") {
        if (!name)
          return err("`forget` requires the anchor `name`.");
        const removed = removeAnchor(domain, name);
        return { content: [{ type: "text", text: removed ? `Removed anchor @a:${name} from ${domain}.` : `No anchor named '${name}' for ${domain}.` }] };
      }
      if (!name)
        return err("`save` requires an anchor `name`.");
      if (!selector)
        return err("`save` requires a `selector` (the CSS that locates the element).");
      saveAnchor(domain, { name, selector, role, description, quirks }, new Date().toISOString());
      return {
        content: [
          {
            type: "text",
            text: `Saved anchor @a:${name} for ${domain} → ${selector}
Use it in any selector field: e.g. {"type":"click","selector":"@a:${name}"}.`
          }
        ]
      };
    } catch (e) {
      return err(`remember failed: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/clipboard.ts
var import_zod10 = require("zod");

// src/lib/clipboard.ts
var import_child_process2 = require("child_process");
function platformTools(mode) {
  if (process.platform === "darwin")
    return [[mode === "read" ? "pbpaste" : "pbcopy"]];
  if (mode === "read")
    return [["wl-paste", "-n"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "-b", "-o"]];
  return [["wl-copy"], ["xclip", "-selection", "clipboard", "-i"], ["xsel", "-b", "-i"]];
}
function run(cmd, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = import_child_process2.spawn(cmd[0], cmd.slice(1));
    } catch {
      resolve({ ok: false, out: "", err: `spawn ${cmd[0]} failed` });
      return;
    }
    let out = "";
    let errOut = "";
    child.stdout?.on("data", (d) => out += d);
    child.stderr?.on("data", (d) => errOut += d);
    child.on("error", (e) => resolve({ ok: false, out: "", err: e.message }));
    child.on("close", (code) => resolve({ ok: code === 0, out, err: errOut }));
    if (input !== undefined) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}
async function clipboardWrite(text) {
  const tools = platformTools("write");
  for (const cmd of tools) {
    if ((await run(cmd, text)).ok)
      return;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t) => t[0]).join(", ")}).`);
}
async function clipboardRead() {
  const tools = platformTools("read");
  let lastErr = "";
  for (const cmd of tools) {
    const r = await run(cmd);
    if (r.ok)
      return r.out;
    lastErr = r.err;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t) => t[0]).join(", ")}). ${lastErr}`);
}

// src/mcp/tools/clipboard.ts
function registerClipboardTool(server) {
  server.tool("clipboard", `Read/write the machine's clipboard (the same one the user's Chrome uses). get → read what a site copied (codes, links); set <text> → write. To paste INTO a page field use the \`paste\` execute step, not a ⌘V keyboard step (the extension relay ignores modifier keys).`, {
    action: import_zod10.z.enum(["get", "set"]).describe("get: read clipboard text | set: write text to clipboard"),
    text: import_zod10.z.string().optional().describe("With action='set': the text to put on the clipboard.")
  }, async ({ action, text }) => {
    try {
      if (action === "set") {
        if (text === undefined)
          return err("action='set' requires `text`.");
        await clipboardWrite(text);
        return { content: [{ type: "text", text: `Clipboard set (${text.length} chars). To paste into a field, use the \`paste\` execute step.` }] };
      }
      const value = await clipboardRead();
      return { content: [{ type: "text", text: value.length ? value : "(clipboard is empty)" }] };
    } catch (e) {
      return err(`clipboard failed: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/telemetry.ts
var import_fs9 = __toESM(require("fs"));
var import_path11 = __toESM(require("path"));
var CHARS_PER_TOKEN = 4;
var est = (chars) => Math.round(chars / CHARS_PER_TOKEN);
var enabled = process.env.IFRAMER_TELEMETRY !== "0";
var sessionId = `${new Date().toISOString().slice(0, 10)}-${process.pid}`;
function telemetryPath() {
  return import_path11.default.join(getDataDir(), "telemetry.jsonl");
}
var sessionCalls = 0;
var sessionChars = 0;
function write2(rec) {
  if (!enabled)
    return;
  try {
    import_fs9.default.appendFileSync(telemetryPath(), JSON.stringify({ ts: new Date().toISOString(), session: sessionId, ...rec }) + `
`);
  } catch {}
}
function recordDefinitions(toolCount, defChars, instructionChars) {
  write2({
    kind: "definitions",
    toolCount,
    defChars,
    instructionChars,
    estTokens: est(defChars + instructionChars)
  });
}
function recordCall(tool, inChars, outChars, ms, isError) {
  sessionCalls++;
  sessionChars += inChars + outChars;
  write2({
    kind: "call",
    tool,
    inChars,
    outChars,
    estTokens: est(inChars + outChars),
    ms,
    isError,
    sessionCalls,
    sessionEstTokens: est(sessionChars)
  });
}
function contentChars(res) {
  const r = res;
  if (!r || !Array.isArray(r.content))
    return 0;
  let n = 0;
  for (const c of r.content) {
    if (typeof c?.text === "string")
      n += c.text.length;
    else if (typeof c?.data === "string")
      n += c.data.length;
  }
  return n;
}
function safeJsonLen(v) {
  try {
    return v === undefined ? 0 : JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

// src/mcp/server.ts
var IS_DEV = process.env.IFRAMER_URL?.includes("localhost") || process.env.IFRAMER_URL?.includes("127.0.0.1");
var INSTRUCTIONS = IS_DEV ? `iframer-dev — local development instance of iframer (connects to ${BASE_URL}).

CRITICAL RULES:
1. NEVER ask the user "do you have credentials?". Call credentials action=list and read the response.
2. NEVER ask the user for passwords in chat. Use credentials action=store (secure form) or the CLI fallback.
3. DO NOT present options when you can just act. Check credentials, execute, show results.
4. If execute fails, read the error. It tells you exactly what happened and where.
5. Call "session" action=stop when done to save session state.

CAPTCHA: Use the "solve-captcha" step — auto-detects reCAPTCHA/hCaptcha and solves with vision AI.
REVERSE ENGINEERING: Use the "reverse-engineer" tool when the user asks to capture/map APIs.` : `iframer — browser access for AI agents when normal methods fail.

CRITICAL RULES:
1. NEVER ask "do you have credentials?". Call credentials action=list and read the response.
2. NEVER ask for passwords in chat. Use credentials action=store or the CLI fallback.
3. DO NOT present options when you can just act. Check status, credentials, execute.
4. NEVER re-store credentials when login fails. Login failures are browser-mode problems, not credential problems.
5. ALWAYS check "knowledge get <domain>" before launching a browser. Skip the browser if the cache has what you need.
6. For UI tasks on a site, check "remember get <domain>" first — saved anchors let you target elements as @a:<name> (in any selector) instead of re-finding them. After you locate a new element with snapshot/find and it works, "remember save" it. If an @a: anchor fails, the page changed: re-discover and "remember save" the new selector (don't retry the stale one).
7. If execute fails, read the FULL error. It tells you the step, error type, and suggestion.
7. If the browser crashes, call "session restart" and retry. Don't panic.
8. ALWAYS call "session" action=stop when you are done with browser work. It saves session state and frees the browser. Idle browsers are auto-reclaimed, but don't rely on that.

BROWSER MODES: Don't specify options.mode — iframer auto-selects and auto-escalates (headless → binary-headful). Only set a mode if the user explicitly asks.

CAPTCHA: In binary-headful mode, ask the user to solve it in the visible window. In docker-headful mode, use the "solve-captcha" step.

REVERSE ENGINEERING: Use the "reverse-engineer" tool when the user asks to capture/map/save API endpoints.`;
var server = new import_mcp.McpServer({ name: "iframer", version: "3.0.0" }, { instructions: INSTRUCTIONS });
var defChars = 0;
var defCount = 0;
{
  const origTool = server.tool.bind(server);
  server.tool = (...a) => {
    const name = String(a[0]);
    defCount++;
    defChars += name.length + (typeof a[1] === "string" ? a[1].length : 0);
    const hIdx = a.length - 1;
    const handler = a[hIdx];
    if (typeof handler === "function") {
      a[hIdx] = async (...ha) => {
        const started = Date.now();
        const res = await handler(...ha);
        const r = res;
        recordCall(name, safeJsonLen(ha[0]), contentChars(res), Date.now() - started, !!r?.isError);
        return res;
      };
    }
    return origTool(...a);
  };
}
registerStatusTool(server);
registerBrowseTool(server);
registerExecuteTool(server);
registerSessionTool(server);
registerCredentialsTool(server);
registerReverseEngineerTool(server);
registerKnowledgeTool(server);
registerTabsTool(server);
registerRememberTool(server);
registerClipboardTool(server);
recordDefinitions(defCount, defChars, INSTRUCTIONS.length);
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
var originalPpid = process.ppid;
var orphanCheck = setInterval(() => {
  if (process.ppid !== originalPpid || process.ppid === 1)
    process.exit(0);
}, 30000);
orphanCheck.unref?.();
process.on("uncaughtException", (err2) => {
  try {
    console.error(`[mcp] uncaughtException: ${err2?.message}`);
  } catch {}
});
process.on("unhandledRejection", (reason) => {
  try {
    console.error(`[mcp] unhandledRejection: ${reason}`);
  } catch {}
});
var transport = new import_stdio.StdioServerTransport;
(async () => {
  await server.connect(transport);
})();
