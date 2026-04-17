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
var import_path4 = __toESM(require("path"));
var import_os2 = __toESM(require("os"));

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
  const dir = getDataDir();
  const file = import_path2.default.join(dir, "secret");
  try {
    const existing = import_fs.default.readFileSync(file, "utf8").trim();
    if (existing)
      return existing;
  } catch {}
  try {
    import_fs.default.mkdirSync(dir, { recursive: true });
    const secret = import_crypto.default.randomBytes(32).toString("hex");
    import_fs.default.writeFileSync(file, secret, { mode: 384 });
    return secret;
  } catch {
    return "iframer-local-default-token";
  }
}

// src/mcp/local-server.ts
var import_child_process = require("child_process");
var import_fs2 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var __dirname = "/Users/eduardoverona/tools/iframer-toolkit/src/mcp";
var PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
var STARTUP_TIMEOUT_MS = 15000;
var HEALTH_POLL_MS = 300;

class LocalServerManager {
  child = null;
  startingPromise = null;
  baseUrl;
  logPath;
  constructor() {
    this.baseUrl = `http://127.0.0.1:${PORT}`;
    this.logPath = import_path3.default.join(getDataDir(), "local-server.log");
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  async ensureRunning() {
    if (this.child && !this.child.killed && await this.healthCheck())
      return;
    if (this.startingPromise)
      return this.startingPromise;
    this.startingPromise = this.doStart().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }
  async doStart() {
    await this.killExisting();
    const dataDir = getDataDir();
    import_fs2.default.mkdirSync(dataDir, { recursive: true });
    const { command, args } = this.resolveRuntime();
    const logFd = import_fs2.default.openSync(this.logPath, "a");
    const env = {
      ...process.env,
      PORT: String(PORT),
      IFRAMER_MODE: "local",
      IFRAMER_DATA_DIR: dataDir
    };
    if (process.env.IFRAMER_SECRET) {
      env.IFRAMER_SECRET = process.env.IFRAMER_SECRET;
    } else {
      try {
        const secret = import_fs2.default.readFileSync(import_path3.default.join(dataDir, "secret"), "utf8").trim();
        if (secret)
          env.IFRAMER_SECRET = secret;
      } catch {}
    }
    this.child = import_child_process.spawn(command, args, {
      env,
      stdio: ["ignore", logFd, logFd],
      detached: false
    });
    import_fs2.default.closeSync(logFd);
    this.child.on("exit", (code) => {
      this.child = null;
    });
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.healthCheck())
        return;
      await sleep(HEALTH_POLL_MS);
    }
    this.kill();
    const logTail = this.readLogTail();
    throw new Error(`Local iframer server failed to start on port ${PORT} within ${STARTUP_TIMEOUT_MS}ms.
` + `Last log lines:
${logTail}`);
  }
  resolveRuntime() {
    try {
      const bunPath = require("child_process").execSync("which bun", { encoding: "utf8" }).trim();
      const serverTs2 = import_path3.default.join(__dirname, "..", "..", "index.ts");
      if (import_fs2.default.existsSync(serverTs2)) {
        return { command: bunPath, args: ["run", serverTs2] };
      }
    } catch {}
    const serverCjs = import_path3.default.join(__dirname, "..", "..", "dist", "local-server.cjs");
    if (import_fs2.default.existsSync(serverCjs)) {
      return { command: "node", args: [serverCjs] };
    }
    const serverTs = import_path3.default.join(__dirname, "..", "..", "index.ts");
    return { command: "node", args: ["--import", "tsx", serverTs] };
  }
  async restart() {
    this.kill();
    await sleep(500);
    await this.ensureRunning();
  }
  shutdown() {
    this.kill();
  }
  kill() {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill("SIGTERM");
      } catch {}
      const c = this.child;
      setTimeout(() => {
        try {
          if (!c.killed)
            c.kill("SIGKILL");
        } catch {}
      }, 2000);
    }
    this.child = null;
  }
  async killExisting() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        try {
          await fetch(`${this.baseUrl}/shutdown`, {
            method: "POST",
            signal: AbortSignal.timeout(2000)
          });
        } catch {}
        await sleep(500);
      }
    } catch {}
  }
  async healthCheck() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();
      return data.ok === true;
    } catch {
      return false;
    }
  }
  readLogTail() {
    try {
      const content = import_fs2.default.readFileSync(this.logPath, "utf8");
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

// src/mcp/helpers.ts
var log = createLogger("mcp");
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
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders() });
  return res.json();
}
async function localApiPost(endpoint, body) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: authHeaders(LOCAL_TOKEN),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000)
  });
  return res.json();
}
async function localApiGet(endpoint) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { headers: authHeaders(LOCAL_TOKEN) });
  return res.json();
}
async function localApiDelete(endpoint) {
  await ensureLocalServer();
  const url = localServer.getBaseUrl();
  const res = await fetch(`${url}${endpoint}`, { method: "DELETE", headers: authHeaders(LOCAL_TOKEN) });
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
      const fs4 = await import("fs");
      if (fs4.existsSync(filePath2))
        return filePath2;
      return null;
    }
    const res = await fetch(url);
    if (!res.ok)
      return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const fs3 = await import("fs");
    const dir = import_path4.default.join(import_os2.default.tmpdir(), "iframer-screenshots", "screenshots");
    fs3.mkdirSync(dir, { recursive: true });
    const filePath = import_path4.default.join(dir, `docker-${Date.now()}.jpg`);
    fs3.writeFileSync(filePath, buf);
    return filePath;
  } catch {
    return null;
  }
}
function err(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}
function getErrorMessage(err2) {
  return err2 instanceof Error ? err2.message : String(err2);
}

// src/lib/domain-modes.ts
var import_fs3 = __toESM(require("fs"));
var import_path5 = __toESM(require("path"));
var log2 = createLogger("domain-modes");
function defaultFile() {
  return import_path5.default.join(getDataDir(), "domain-modes.json");
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
      if (import_fs3.default.existsSync(this.filePath)) {
        this.data = JSON.parse(import_fs3.default.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }
  save() {
    try {
      import_fs3.default.mkdirSync(import_path5.default.dirname(this.filePath), { recursive: true });
      import_fs3.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err2) {
      log2.error("Failed to save:", err2);
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
  import_zod2.z.object({ type: import_zod2.z.literal("fill"), selector: import_zod2.z.string(), value: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("human-click"), selector: import_zod2.z.string().optional(), x: import_zod2.z.number().optional(), y: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("right-click"), selector: import_zod2.z.string().optional(), x: import_zod2.z.number().optional(), y: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("human-type"), selector: import_zod2.z.string(), value: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("evaluate"), expression: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("extract"), expression: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("wait"), ms: import_zod2.z.number() }),
  import_zod2.z.object({ type: import_zod2.z.literal("wait-for"), selector: import_zod2.z.string(), timeout: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("scroll"), deltaY: import_zod2.z.number().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("keyboard"), key: import_zod2.z.string() }),
  import_zod2.z.object({ type: import_zod2.z.literal("type-code"), value: import_zod2.z.string(), selector: import_zod2.z.string().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("login"), domain: import_zod2.z.string(), usernameSelector: import_zod2.z.string().optional(), passwordSelector: import_zod2.z.string().optional(), submitSelector: import_zod2.z.string().optional(), totpSelector: import_zod2.z.string().optional() }),
  import_zod2.z.object({ type: import_zod2.z.literal("solve-captcha") }),
  import_zod2.z.object({ type: import_zod2.z.literal("screenshot"), annotate: import_zod2.z.boolean().optional().describe("Overlay numbered badges on interactive elements. Returns refs (@e1, @e2...) you can use in subsequent steps.") }),
  import_zod2.z.object({ type: import_zod2.z.literal("snapshot"), interactiveOnly: import_zod2.z.boolean().optional().describe("Only include interactive elements (default: true)"), maxElements: import_zod2.z.number().optional().describe("Max elements to return (default: 80)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("find"), role: import_zod2.z.string().optional().describe("ARIA role: button, link, textbox, checkbox, etc."), name: import_zod2.z.string().optional().describe("Accessible name — button text, aria-label"), text: import_zod2.z.string().optional().describe("Visible text content"), placeholder: import_zod2.z.string().optional().describe("Input placeholder text"), label: import_zod2.z.string().optional().describe("Associated label text"), exact: import_zod2.z.boolean().optional().describe("Exact match vs substring (default: substring)") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-click") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-select"), tiles: import_zod2.z.array(import_zod2.z.number()) }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-verify") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-info") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-solve") }),
  import_zod2.z.object({ type: import_zod2.z.literal("recaptcha-answer"), tiles: import_zod2.z.array(import_zod2.z.number()) })
]);

// src/mcp/tools/execute.ts
function registerExecuteTool(server) {
  server.tool("execute", `Execute a pipeline of browser steps. Auto-starts a session if needed. Handles obstacles (captcha, cookie banners) automatically.

MANDATORY PRE-FLIGHT: Before calling this tool for any website, call \`knowledge get <domain>\` first. If the cache shows a direct-API path that satisfies the user's request, skip this tool entirely — direct API calls are orders of magnitude faster. Only fall through to \`execute\` when the cache is missing, stale, or insufficient. Every successful run here updates the knowledge cache automatically.

Steps run sequentially. Each step has a 20-second stale-state timeout — if nothing changes on the page for 20s, execution stops and returns a detailed error so you can decide what to do.

Key step types:
- navigate: go to a URL (obstacle detection runs after this)
- snapshot: get the page's interactive elements as a structured list with refs (@e1, @e2...). Use this BEFORE interacting to see what's on the page. Then use refs in click/fill/human-click/human-type steps instead of CSS selectors.
- find: locate a specific element by role, name, text, placeholder, or label. Returns a ref.
- screenshot: take a screenshot. Add annotate=true to overlay numbered badges on interactive elements.
- extract: evaluate JS and include the result in the response
- solve-captcha: auto-detect and solve reCAPTCHA/hCaptcha with vision AI
- login: fill login form with stored credentials (never exposes passwords). Handles email-first flows (Slack, Microsoft, Google) and standard forms.

IMPORTANT — Element refs (@e1, @e2...): All selector fields accept @e refs from snapshot, find, or annotated screenshot. PREFER refs over CSS selectors.

Returns: ok, completedSteps, results, obstacles, capturedApi, and on failure: errorContext with screenshot path, URL, errorType, suggestion, retryable.`, {
    steps: import_zod3.z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
    options: import_zod3.z.object({
      staleTimeoutMs: import_zod3.z.number().optional().describe("Override the 20s stale-state timeout per step"),
      screenshotAfterEach: import_zod3.z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
      continueOnObstacle: import_zod3.z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: import_zod3.z.boolean().optional().describe("Continue past failing steps (default: false)"),
      captureApi: import_zod3.z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes."),
      mode: import_zod3.z.enum(["headless", "binary-headful", "docker-headful"]).optional().describe("DO NOT SET THIS unless user explicitly requests a mode. iframer auto-selects and auto-escalates."),
      autoEscalate: import_zod3.z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)")
    }).optional()
  }, async (params) => {
    try {
      const dockerRunning = await isDockerRunning();
      async function runWithMode(mode) {
        if (mode === "docker-headful") {
          if (!dockerRunning) {
            return {
              ok: false,
              completedSteps: 0,
              totalSteps: params.steps.length,
              results: [],
              finalState: { url: "", title: "" },
              obstacles: [],
              durationMs: 0,
              modeUsed: "docker-headful",
              error: {
                failedAtStep: 0,
                failedStep: params.steps[0],
                errorType: "action-failed",
                message: "docker-headful mode was requested but the Docker API is not reachable.",
                pageState: { url: "", title: "" },
                suggestion: "Start Docker with `bun run start:docker`, or omit options.mode.",
                retryable: false
              }
            };
          }
          return apiPost("/execute", {
            steps: params.steps,
            options: { ...params.options, mode: "docker-headful", autoEscalate: false }
          });
        }
        return localApiPost("/execute", {
          steps: params.steps,
          options: { ...params.options, mode: mode || undefined }
        });
      }
      let execResult;
      try {
        execResult = await runWithMode(params.options?.mode);
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        const isCrash = /connect|ECONNREFUSED|EPIPE|closed|timed out|abort|fetch failed/i.test(msg);
        if (isCrash) {
          log.info(`Execute crashed (${msg.slice(0, 80)}), restarting local server and retrying...`);
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
          log.info(`Auto-escalating to ${nextMode}`);
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
  if (data.ok && data.finalState?.url) {
    try {
      const domain = new URL(data.finalState.url).hostname.replace(/^www\./, "");
      lines.push(`
Knowledge cache updated for ${domain}. Before the next browser run on this domain, call \`knowledge get ${domain}\` — you may be able to skip the browser entirely.`);
    } catch {}
  }
  const meaningful = (data.results || []).filter((r) => r.ok && r.result !== undefined && r.result !== null);
  for (const r of meaningful) {
    if (r.step?.type === "snapshot" && r.result?.snapshot) {
      lines.push(`
--- Snapshot (${r.result.elementCount} elements) ---`);
      lines.push(r.result.snapshot);
    } else if (r.step?.type === "find" && r.result?.ref) {
      lines.push(`
Found: ${r.result.ref} ${r.result.role} "${r.result.name}" (${r.result.matchCount} match${r.result.matchCount > 1 ? "es" : ""})`);
    } else if (r.step?.type === "screenshot" && r.result?.refs) {
      lines.push(`
--- Annotated screenshot refs ---`);
      lines.push(r.result.refs);
    } else if (r.result !== undefined && r.result !== null) {
      lines.push(`
step ${r.stepIndex}: ${JSON.stringify(r.result)}`);
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
  return lines;
}

// src/mcp/tools/session.ts
var import_zod4 = require("zod");
function registerSessionTool(server) {
  server.tool("session", `Manage the browser session and lifecycle.

Actions:
- **stop**: save cookies/localStorage to the store, then close the browser. Session data persists for the next run.
- **clear**: wipe all stored session data (cookies/localStorage) from the database. Does NOT kill running browsers.
- **restart**: kill all running browser instances (local + Docker) and reset state. The next \`execute\` call will launch a fresh browser automatically. Use this when the browser is frozen, crashed, or in a bad state. Credentials and knowledge cache are NOT affected.

Sessions live in the single local SQLite database (~/.iframer/iframer.db), shared across every browser mode.`, {
    action: import_zod4.z.enum(["stop", "clear", "restart"]).describe("stop: save session state + close browser | clear: wipe stored session data | restart: kill all browsers, fresh start on next execute")
  }, async ({ action }) => {
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
      return err("Unknown action");
    } catch (e) {
      return err(`Error: ${getErrorMessage(e)}`);
    }
  });
}

// src/mcp/tools/credentials.ts
var import_zod5 = require("zod");
var import_fs5 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));

// src/lib/knowledge.ts
var import_fs4 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
var log3 = createLogger("knowledge");
function getKnowledgeDir() {
  return import_path6.default.join(getDataDir(), "knowledge");
}
function getKnowledgePath(domain) {
  const safe = sanitizeDomain(domain);
  return import_path6.default.join(getKnowledgeDir(), `${safe}.md`);
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
    return import_fs4.default.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function listKnowledge() {
  const dir = getKnowledgeDir();
  let entries = [];
  try {
    entries = import_fs4.default.readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const file of entries) {
    if (!file.endsWith(".md"))
      continue;
    const full = import_path6.default.join(dir, file);
    try {
      const stat = import_fs4.default.statSync(full);
      const raw = import_fs4.default.readFileSync(full, "utf8");
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
      import_fs4.default.unlinkSync(p);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  let removed = 0;
  try {
    const entries = import_fs4.default.readdirSync(dir);
    for (const f of entries) {
      if (f.endsWith(".md")) {
        try {
          import_fs4.default.unlinkSync(import_path6.default.join(dir, f));
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
    import_fs5.default.mkdirSync(dir, { recursive: true });
    import_fs5.default.appendFileSync(import_path7.default.join(dir, "mcp.log"), JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + `
`);
  } catch {}
}
function domainMatches(normalized, stored) {
  return stored.some((d) => d === normalized || normalized.endsWith("." + d) || d.endsWith("." + normalized));
}
function registerCredentialsTool(server) {
  server.tool("credentials", `Manage stored login credentials. This tool ONLY stores and lists credentials — it does NOT log you into anything. Actual logins happen via the \`execute\` tool with a \`login\` step. Credentials are stored in a single local SQLite database shared by ALL browser modes (headless, binary-headful, docker-headful) — store once, login anywhere.

CORRECT WORKFLOW when the user needs to be logged into a site:
1. Call \`credentials\` with \`action=list\`. READ THE RESPONSE LITERALLY. If it says "No credentials stored" then NO credentials exist. If it lists domains, those are the only ones stored.
2. If the target domain IS in the list → skip to step 4. Credentials exist and are valid. Move on.
3. If the target domain is NOT in the list → call \`credentials\` with \`action=store, domain=<site>\`. This attempts to pop a secure form in the user's UI. The response is either \`Credentials stored for <site>.\` (success) OR a loud error telling you the client doesn't support form elicitation, with instructions for the user to run a CLI command. Relay the error verbatim and STOP — do not proceed with login until the user confirms they ran the command.
4. Call \`execute\` with \`[{type:"navigate", url:"https://<site>/login"}, {type:"login", domain:"<site>"}]\`. The login step auto-detects the form, fills stored credentials, handles 2FA, submits, and auto-escalates browser modes if blocked.

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════════════

1. **NEVER re-store credentials as a recovery from a failed login.** If credentials already exist, the store call will be REJECTED. Login failures are browser-mode / bot-detection / page-structure problems, not credential problems.

2. **NEVER ask the user "do you have credentials?"** — call action=list and read the response.

3. **NEVER confabulate.** If action=list returns "No credentials stored", the database is empty.

4. **NEVER pretend a store call succeeded if the response was an error.**

5. **NEVER ask the user to paste their password in chat.**

6. **\`force: true\` on store is ONLY for explicit password changes.**`, {
    action: import_zod5.z.enum(["store", "list"]).describe("store: prompt for credentials | list: show stored domains"),
    domain: import_zod5.z.string().optional().describe("Domain (required for store). Use the bare registrable domain."),
    force: import_zod5.z.boolean().optional().describe("Overwrite existing. ONLY for explicit password changes.")
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

// src/mcp/tools/reverse-engineer.ts
var import_zod6 = require("zod");
function registerReverseEngineerTool(server) {
  server.tool("reverse-engineer", `Reverse-engineer a website's API. Navigates to a URL, performs the steps you specify, and captures every XHR/fetch request the page makes — including auth tokens, cookies, headers, request/response bodies, and ready-to-use curl commands.

Use this when the user asks to:
- "reverse engineer" or "map" a site's API
- "capture the endpoints" or "save the API"
- "figure out how this site works under the hood"
- "record the API calls" so they can be replayed later

How it works:
1. You provide steps (same as execute) — navigate, click, fill, extract, etc.
2. iframer runs them while recording all API calls the page makes
3. Returns structured data per domain: shared auth + endpoints classified by protocol (rest, graphql, json-rpc, grpc-web, form-rpc, soap) with method, path, action, verb, headers, body, response, curl

IMPORTANT — one request ≠ one endpoint. Each endpoint has (protocol, action):
- REST: action = "METHOD /parameterized/path". Verb from HTTP method.
- GraphQL: action = operationName (or doc_id for persisted queries). Many ops share the single /graphql URL — EACH operation is its own endpoint.
- JSON-RPC: action = body.method (e.g. eth_getBalance, user.list).
- gRPC-web: action = request path.
- Form-RPC (FB-style urlencoded): action = fb_api_req_friendly_name / doc_id.
- SOAP: action = SOAPAction header.

Generate ONE function per (protocol, action). Do NOT merge different GraphQL operations into one function just because they share the URL.

Output layout — save as RUNNABLE CODE to <outputDir>/:
  auth.{js,ts}                  — shared cookies, tokens, authorization
  transport/
    rest.{js,ts}                — shared REST helper (only if any rest endpoints)
    graphql.{js,ts}             — shared GraphQL client: post(operationName|docId, variables)
    jsonRpc.{js,ts}             — shared JSON-RPC client (if any)
    grpc.{js,ts}                — shared gRPC-web client (if any)
  <protocol>/<verb>/<functionName>.{js,ts}
    e.g. graphql/queries/getTimelineFeed.ts
         graphql/mutations/reactToPost.ts
         rest/read/getChannelMessages.ts
         rest/create/createMessage.ts
         jsonRpc/ethGetBalance.ts
  index.{js,ts}                 — re-exports all endpoint functions
  types.ts                      — (typed mode only) inferred interfaces from responses
  README.md                     — endpoints grouped by protocol + verb, dependency chain, auth expiry warning

Use capturedApi[i].endpoints[j].protocol, .action, .verb, .functionName directly — iframer already classified them. Put queries (verb=read|list) under queries/, mutations (verb=create|update|delete|action) under mutations/ for GraphQL. For REST, group by verb dir.

The outputDir defaults to ./<domain>/. Ask the user where to save if unclear.`, {
    steps: import_zod6.z.array(stepSchema).describe("Pipeline steps to execute while capturing API calls"),
    outputDir: import_zod6.z.string().optional().describe("Directory to save the captured API files. If not provided, ask the user or default to ./<domain>/"),
    typed: import_zod6.z.boolean().optional().describe("Save as .ts with inferred types instead of .js. Set to true when the user asks for types, typescript, or type inference."),
    options: import_zod6.z.object({
      staleTimeoutMs: import_zod6.z.number().optional().describe("Override the 20s stale-state timeout per step"),
      continueOnObstacle: import_zod6.z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
      continueOnError: import_zod6.z.boolean().optional().describe("Continue past failing steps (default: false)"),
      mode: import_zod6.z.enum(["headless", "binary-headful", "docker-headful"]).optional().describe("Browser mode override")
    }).optional()
  }, async (params) => {
    try {
      const execParams = {
        steps: params.steps,
        options: { ...params.options, captureApi: true }
      };
      const mode = params.options?.mode;
      const dockerRunning = await isDockerRunning();
      const captureResult = mode === "docker-headful" && dockerRunning ? await apiPost("/execute", execParams) : await localApiPost("/execute", execParams);
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
          const fs6 = await import("fs");
          const path8 = await import("path");
          fs6.mkdirSync(outDir, { recursive: true });
          const jsonPath = path8.join(outDir, "captured-api.json");
          fs6.writeFileSync(jsonPath, JSON.stringify(captureResult.capturedApi, null, 2));
          lines.push(`
Full captured data saved to: ${jsonPath}`);
          lines.push("Read this file for complete curl commands, request/response bodies, and auth data.");
        } catch (writeErr) {
          lines.push(`
(Could not save captured JSON: ${writeErr instanceof Error ? writeErr.message : String(writeErr)})`);
        }
      }
      const content = [{ type: "text", text: lines.join(`
`) }];
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
Endpoints (${api.endpoints.length}) [${protocolSummary}]:`);
    for (const ep of api.endpoints) {
      lines.push(`
  [${ep.protocol}/${ep.verb}] ${ep.functionName}`);
      lines.push(`    Action: ${ep.action}`);
      lines.push(`    ${ep.method} ${ep.path}  →  ${ep.responseStatus}`);
      if (ep.requestBody) {
        const body = ep.requestBody;
        const signalKeys = extractSignalKeys(body);
        if (signalKeys)
          lines.push(`    Params: ${signalKeys}`);
      }
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
Rules:`);
  lines.push(`  - One function per (protocol, action). Use the functionName field verbatim for the file + export name.`);
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
    } else if (typeof v === "object" && v !== null) {
      const keys = Object.keys(v).slice(0, 5).join(",");
      signalEntries.push(`${k}={${keys}${Object.keys(v).length > 5 ? ",..." : ""}}`);
    } else {
      signalEntries.push(`${k}=${String(v).slice(0, 40)}`);
    }
  }
  return signalEntries.length > 0 ? signalEntries.join(", ") : null;
}

// src/mcp/tools/knowledge.ts
var import_zod7 = require("zod");
function registerKnowledgeTool(server) {
  server.tool("knowledge", `Per-domain knowledge cache. Call this BEFORE every \`execute\` or \`browse\` on a website — it's orders of magnitude faster than launching a browser when the cache already has what you need.

Each domain's cache is a plain markdown file at ~/.iframer/knowledge/<domain>.md containing:
- Auth mechanism (which cookies / localStorage keys / headers are load-bearing)
- Known API endpoints the site uses (captured from real browser runs)
- Notes about captchas, bot detection, session behavior
- Which browser mode last worked

MANDATORY WORKFLOW — for any task that targets a specific website:

1. Call \`knowledge get <domain>\` first.
2. If the cache shows a direct-API path (auth material + endpoints) that satisfies the request, hit the endpoints directly using the agent's own fetch capability — the session cookies/headers are already injected into the current browser context, and the cache tells you exactly how to call them. Skip the browser entirely.
3. If the cache is empty, outdated, or doesn't cover what you need, fall through to \`execute\` with a pipeline. After \`execute\` succeeds, the cache gets updated automatically — future calls benefit.
4. If cached endpoints return 401/403, the session is stale — run an \`execute\` pipeline containing a \`login\` step to refresh. The cache will be re-verified automatically on success.

Actions:
- get: return the markdown cache for a specific domain
- list: show all cached domains with last-verified timestamps
- clear: delete cache for a specific domain, or everything if domain is omitted`, {
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
6. If execute fails, read the FULL error. It tells you the step, error type, and suggestion.
7. If the browser crashes, call "session restart" and retry. Don't panic.

BROWSER MODES: Don't specify options.mode — iframer auto-selects and auto-escalates (headless → binary-headful). Only set a mode if the user explicitly asks.

CAPTCHA: In binary-headful mode, ask the user to solve it in the visible window. In docker-headful mode, use the "solve-captcha" step.

REVERSE ENGINEERING: Use the "reverse-engineer" tool when the user asks to capture/map/save API endpoints.`;
var server = new import_mcp.McpServer({ name: "iframer", version: "3.0.0" }, { instructions: INSTRUCTIONS });
registerStatusTool(server);
registerBrowseTool(server);
registerExecuteTool(server);
registerSessionTool(server);
registerCredentialsTool(server);
registerReverseEngineerTool(server);
registerKnowledgeTool(server);
function cleanup() {
  localServer.shutdown();
}
process.on("exit", cleanup);
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
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
