#!/usr/bin/env node
const importMetaUrl = require('node:url').pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/paths.ts
var paths_exports = {};
__export(paths_exports, {
  getDataDir: () => getDataDir,
  getScreenshotDir: () => getScreenshotDir
});
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}
function getScreenshotDir() {
  return import_path.default.join(getDataDir(), "screenshots");
}
var import_path, import_os;
var init_paths = __esm({
  "src/lib/paths.ts"() {
    "use strict";
    import_path = __toESM(require("path"));
    import_os = __toESM(require("os"));
  }
});

// src/lib/logger.ts
function createLogger(tag) {
  const prefix = `[${tag}]`;
  return {
    debug: (...args2) => {
      if (LEVELS[currentLevel] <= 0) console.log(prefix, ...args2);
    },
    info: (...args2) => {
      if (LEVELS[currentLevel] <= 1) console.log(prefix, ...args2);
    },
    warn: (...args2) => {
      if (LEVELS[currentLevel] <= 2) console.warn(prefix, ...args2);
    },
    error: (...args2) => {
      if (LEVELS[currentLevel] <= 3) console.error(prefix, ...args2);
    }
  };
}
var LEVELS, currentLevel;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    currentLevel = process.env.LOG_LEVEL || "info";
  }
});

// src/lib/browser/registry.ts
var registry_exports = {};
__export(registry_exports, {
  clearServerInfo: () => clearServerInfo,
  findChromePidByMarker: () => findChromePidByMarker,
  forceKillBrowser: () => forceKillBrowser,
  isPidAlive: () => isPidAlive,
  pidMatchesMarker: () => pidMatchesMarker,
  readServerInfo: () => readServerInfo,
  reapOrphanBrowsers: () => reapOrphanBrowsers,
  registerBrowser: () => registerBrowser,
  unregisterBrowser: () => unregisterBrowser,
  writeServerInfo: () => writeServerInfo
});
function browsersDir() {
  const dir = import_path2.default.join(getDataDir(), "browsers");
  import_fs.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function serverInfoPath() {
  return import_path2.default.join(getDataDir(), "server.json");
}
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function pidMatchesMarker(pid, marker) {
  if (!isPidAlive(pid)) return false;
  try {
    const cmd = (0, import_child_process.execSync)(`ps -o command= -p ${pid}`, { encoding: "utf8" });
    return cmd.includes(marker);
  } catch {
    return false;
  }
}
function findChromePidByMarker(marker) {
  try {
    const out = (0, import_child_process.execSync)(`pgrep -f -- "${marker}"`, { encoding: "utf8" }).trim();
    const pids = out.split("\n").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n !== process.pid);
    if (pids.length === 0) return null;
    return Math.min(...pids);
  } catch {
    return null;
  }
}
function registerBrowser(rec) {
  try {
    import_fs.default.writeFileSync(import_path2.default.join(browsersDir(), `${rec.chromePid}.json`), JSON.stringify(rec, null, 2));
  } catch (err) {
    log.warn(`failed to write browser record for pid ${rec.chromePid}: ${err}`);
  }
}
function unregisterBrowser(chromePid) {
  try {
    import_fs.default.unlinkSync(import_path2.default.join(browsersDir(), `${chromePid}.json`));
  } catch {
  }
}
async function forceKillBrowser(rec) {
  if (!isPidAlive(rec.chromePid)) return true;
  if (!pidMatchesMarker(rec.chromePid, rec.marker)) {
    return true;
  }
  try {
    process.kill(rec.chromePid, "SIGKILL");
  } catch {
  }
  const deadline = Date.now() + 2e3;
  while (Date.now() < deadline) {
    if (!isPidAlive(rec.chromePid)) return true;
    await sleep(100);
  }
  return !isPidAlive(rec.chromePid);
}
async function reapOrphanBrowsers() {
  let reaped = 0;
  let skipped = 0;
  let files = [];
  try {
    files = import_fs.default.readdirSync(browsersDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return { reaped, skipped };
  }
  for (const file of files) {
    const full = import_path2.default.join(browsersDir(), file);
    let rec;
    try {
      rec = JSON.parse(import_fs.default.readFileSync(full, "utf8"));
    } catch {
      try {
        import_fs.default.unlinkSync(full);
      } catch {
      }
      continue;
    }
    if (!isPidAlive(rec.chromePid) || !pidMatchesMarker(rec.chromePid, rec.marker)) {
      try {
        import_fs.default.unlinkSync(full);
      } catch {
      }
      continue;
    }
    if (isPidAlive(rec.ownerPid)) {
      skipped++;
      continue;
    }
    log.info(`reaping orphan Chrome pid=${rec.chromePid} (${rec.key}), owner ${rec.ownerPid} is dead`);
    if (await forceKillBrowser(rec)) {
      try {
        import_fs.default.unlinkSync(full);
      } catch {
      }
      reaped++;
    } else {
      log.warn(`failed to kill orphan Chrome pid=${rec.chromePid} \u2014 leaving record for next sweep`);
    }
  }
  return { reaped, skipped };
}
function writeServerInfo(info) {
  import_fs.default.writeFileSync(serverInfoPath(), JSON.stringify(info, null, 2));
}
function readServerInfo() {
  try {
    const info = JSON.parse(import_fs.default.readFileSync(serverInfoPath(), "utf8"));
    if (!Number.isInteger(info.pid) || !Number.isInteger(info.port)) return null;
    return info;
  } catch {
    return null;
  }
}
function clearServerInfo(pid) {
  const info = readServerInfo();
  if (info && info.pid === pid) {
    try {
      import_fs.default.unlinkSync(serverInfoPath());
    } catch {
    }
  }
}
var import_fs, import_path2, import_child_process, log, sleep;
var init_registry = __esm({
  "src/lib/browser/registry.ts"() {
    "use strict";
    import_fs = __toESM(require("fs"));
    import_path2 = __toESM(require("path"));
    import_child_process = require("child_process");
    init_paths();
    init_logger();
    log = createLogger("registry");
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }
});

// src/mcp/local-server.ts
var local_server_exports = {};
__export(local_server_exports, {
  LocalServerManager: () => LocalServerManager
});
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function healthCheck(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2e3) });
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
var import_child_process2, import_net, import_fs2, import_path3, BASE_PORT, PORT_SCAN_ATTEMPTS, STARTUP_TIMEOUT_MS, HEALTH_POLL_MS, SPAWN_LOCK_STALE_MS, LocalServerManager;
var init_local_server = __esm({
  "src/mcp/local-server.ts"() {
    "use strict";
    import_child_process2 = require("child_process");
    import_net = __toESM(require("net"));
    import_fs2 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
    init_paths();
    init_registry();
    BASE_PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
    PORT_SCAN_ATTEMPTS = 21;
    STARTUP_TIMEOUT_MS = 15e3;
    HEALTH_POLL_MS = 300;
    SPAWN_LOCK_STALE_MS = 2e4;
    LocalServerManager = class {
      startingPromise = null;
      baseUrl = "";
      logPath;
      constructor() {
        this.logPath = import_path3.default.join(getDataDir(), "local-server.log");
      }
      getBaseUrl() {
        if (!this.baseUrl) {
          throw new Error("Local server not started yet \u2014 call ensureRunning() first.");
        }
        return this.baseUrl;
      }
      /** Ensure a shared local server is reachable. Idempotent — concurrent
       *  callers await the same startup promise. */
      async ensureRunning() {
        if (this.startingPromise) return this.startingPromise;
        if (await this.adoptExisting()) return;
        this.startingPromise = this.startShared().finally(() => {
          this.startingPromise = null;
        });
        return this.startingPromise;
      }
      /** Adopt the advertised shared server if its process is alive and healthy. */
      async adoptExisting() {
        const info = readServerInfo();
        if (!info || !isPidAlive(info.pid)) return false;
        const url = `http://127.0.0.1:${info.port}`;
        if (await healthCheck(url)) {
          this.baseUrl = url;
          return true;
        }
        return false;
      }
      async startShared() {
        const dataDir = getDataDir();
        import_fs2.default.mkdirSync(dataDir, { recursive: true });
        const lockDir = import_path3.default.join(dataDir, "server.spawn-lock");
        let holdingLock = false;
        try {
          import_fs2.default.mkdirSync(lockDir);
          holdingLock = true;
        } catch {
          const stale = (() => {
            try {
              return Date.now() - import_fs2.default.statSync(lockDir).mtimeMs > SPAWN_LOCK_STALE_MS;
            } catch {
              return true;
            }
          })();
          if (stale) {
            try {
              import_fs2.default.rmdirSync(lockDir);
              import_fs2.default.mkdirSync(lockDir);
              holdingLock = true;
            } catch {
            }
          }
        }
        try {
          if (!holdingLock) {
            const deadline2 = Date.now() + STARTUP_TIMEOUT_MS;
            while (Date.now() < deadline2) {
              if (await this.adoptExisting()) return;
              await sleep2(HEALTH_POLL_MS);
            }
            throw new Error("Timed out waiting for another session to start the shared iframer server.");
          }
          if (await this.adoptExisting()) return;
          const port = await findFreePort(BASE_PORT, PORT_SCAN_ATTEMPTS);
          const url = `http://127.0.0.1:${port}`;
          const { command: command2, args: args2 } = this.resolveRuntime();
          const logFd = import_fs2.default.openSync(this.logPath, "a");
          const env = {
            ...process.env,
            PORT: String(port),
            IFRAMER_DATA_DIR: dataDir
          };
          if (process.env.IFRAMER_SECRET) {
            env.IFRAMER_SECRET = process.env.IFRAMER_SECRET;
          } else {
            try {
              const secret = import_fs2.default.readFileSync(import_path3.default.join(dataDir, "secret"), "utf8").trim();
              if (secret) env.IFRAMER_SECRET = secret;
            } catch {
            }
          }
          const child = (0, import_child_process2.spawn)(command2, args2, {
            env,
            stdio: ["ignore", logFd, logFd],
            detached: true,
            // On Windows a detached child otherwise gets its own console window,
            // and closing that window kills the server.
            windowsHide: true
          });
          child.on("error", (e) => console.error(`[iframer] could not start the local server: ${e.message}`));
          child.unref();
          import_fs2.default.closeSync(logFd);
          const deadline = Date.now() + STARTUP_TIMEOUT_MS;
          while (Date.now() < deadline) {
            if (await healthCheck(url)) {
              this.baseUrl = url;
              return;
            }
            await sleep2(HEALTH_POLL_MS);
          }
          try {
            child.kill("SIGKILL");
          } catch {
          }
          throw new Error(
            `Local iframer server failed to start on port ${port} within ${STARTUP_TIMEOUT_MS}ms.
Last log lines:
${this.readLogTail()}`
          );
        } finally {
          if (holdingLock) {
            try {
              import_fs2.default.rmdirSync(lockDir);
            } catch {
            }
          }
        }
      }
      /** Package root, found by walking up for iframer-toolkit's package.json.
       *  Robust to WHERE this code runs from: src/mcp/ (source), dist/ (bundled
       *  CLI under node), or a global npm install — a fixed __dirname/../.. guess
       *  breaks in the bundle (that's why the warm CLI silently ran in-process). */
      packageRoot() {
        let dir = __dirname;
        for (let i = 0; i < 8; i++) {
          try {
            const pkg = JSON.parse(import_fs2.default.readFileSync(import_path3.default.join(dir, "package.json"), "utf8"));
            if (pkg.name === "iframer-toolkit") return dir;
          } catch {
          }
          const parent = import_path3.default.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        return import_path3.default.join(__dirname, "..", "..");
      }
      resolveRuntime() {
        const root = this.packageRoot();
        const serverTs = import_path3.default.join(root, "index.ts");
        const serverCjs = import_path3.default.join(root, "dist", "local-server.cjs");
        if (import_fs2.default.existsSync(serverCjs)) {
          return { command: "node", args: [serverCjs] };
        }
        if (import_fs2.default.existsSync(serverTs)) {
          try {
            require.resolve("tsx");
            return { command: "node", args: ["--import", "tsx", serverTs] };
          } catch {
          }
        }
        try {
          const bunPath = require("child_process").execSync("which bun", { encoding: "utf8" }).trim();
          if (bunPath && import_fs2.default.existsSync(serverTs)) {
            console.error("[iframer] running local server under bun \u2014 extension mode (connectOverCDP) will not work; run `bun run build` to get the node bundle");
            return { command: bunPath, args: ["run", serverTs] };
          }
        } catch {
        }
        throw new Error(
          "No runnable iframer server entry found: dist/local-server.cjs is missing, tsx is not installed, and bun is unavailable. Run `bun install && bun run build` in the iframer repo."
        );
      }
      /** Ask the shared server to exit (it kills its browsers with a hard
       *  deadline), then start a fresh one. Used for crash recovery. */
      async restart() {
        const info = readServerInfo();
        if (info && this.baseUrl) {
          try {
            await fetch(`${this.baseUrl}/shutdown`, { method: "POST", signal: AbortSignal.timeout(3e3) });
          } catch {
          }
          const deadline = Date.now() + 12e3;
          while (Date.now() < deadline && isPidAlive(info.pid)) {
            await sleep2(200);
          }
          if (isPidAlive(info.pid)) {
            try {
              process.kill(info.pid, "SIGKILL");
            } catch {
            }
          }
        }
        this.baseUrl = "";
        await this.ensureRunning();
      }
      /** MCP process exiting. The shared server intentionally stays up —
       *  other sessions may be using it; idle-exit + reaper govern its life. */
      shutdown() {
      }
      readLogTail() {
        try {
          const content = import_fs2.default.readFileSync(this.logPath, "utf8");
          const lines = content.trim().split("\n");
          return lines.slice(-10).join("\n");
        } catch {
          return "(no log file)";
        }
      }
    };
  }
});

// src/lib/browser/stealth.ts
function buildStealthScript(fp) {
  const ua = fp?.userAgent ?? USER_AGENT;
  const platform = fp?.platform ?? "Win32";
  const hw = fp?.hardwareConcurrency ?? 8;
  const mem = fp?.deviceMemory ?? 8;
  const dpr = fp?.deviceScaleFactor ?? 1.25;
  const sw = fp?.screenWidth ?? 1920;
  const sh = fp?.screenHeight ?? 1080;
  const sah = fp?.screenAvailHeight ?? 1040;
  const langs = JSON.stringify(fp?.languages ?? ["en-US", "en"]);
  const uaData = fp?.uaData;
  const brands = uaData?.brands ?? [
    { brand: "Chromium", version: "136" },
    { brand: "Google Chrome", version: "136" },
    { brand: "Not.A/Brand", version: "99" }
  ];
  const fullVersionList = uaData?.fullVersionList ?? [
    { brand: "Chromium", version: "136.0.7103.93" },
    { brand: "Google Chrome", version: "136.0.7103.93" },
    { brand: "Not.A/Brand", version: "99.0.0.0" }
  ];
  const platformVersion = uaData?.platformVersion ?? "15.0.0";
  const uaFullVersion = uaData?.uaFullVersion ?? "136.0.7103.93";
  return buildStealthScriptInner({
    ua,
    platform,
    hw,
    mem,
    dpr,
    sw,
    sh,
    sah,
    langs,
    brands,
    fullVersionList,
    platformVersion,
    uaFullVersion
  });
}
function buildStealthScriptInner(p) {
  return `
  window._stealthApplied = true;
  ${NATIVE_TOSTRING_HELPER}

  delete Navigator.prototype.webdriver;
  Object.defineProperty(Navigator.prototype, "webdriver", {
    get: () => false,
    configurable: true,
  });

  if (!window.chrome) window.chrome = {};
  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
    RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
    getDetails: function() { return null; },
    getIsInstalled: function() { return false; },
    installState: function(cb) { if (cb) cb("not_installed"); },
  };

  window.chrome.csi = function() {
    return { onloadT: Date.now(), startE: Date.now(), pageT: Math.random() * 1000 + 500, tran: 15 };
  };
  _makeNative(window.chrome.csi, 'csi');

  window.chrome.loadTimes = function() {
    return {
      commitLoadTime: Date.now() / 1000, connectionInfo: "h2",
      finishDocumentLoadTime: Date.now() / 1000 + 0.1, finishLoadTime: Date.now() / 1000 + 0.2,
      firstPaintAfterLoadTime: 0, firstPaintTime: Date.now() / 1000 + 0.05,
      navigationType: "Other", npnNegotiatedProtocol: "h2",
      requestTime: Date.now() / 1000 - 0.3, startLoadTime: Date.now() / 1000 - 0.2,
      wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true,
    };
  };
  _makeNative(window.chrome.loadTimes, 'loadTimes');

  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: function() {}, sendMessage: function() {},
      onMessage: { addListener: function() {}, removeListener: function() {} },
      onConnect: { addListener: function() {}, removeListener: function() {} },
      id: undefined,
    };
  }

  // Safely patch Navigator.prototype \u2014 delete first to handle non-configurable properties
  (function() {
    function safeProp(obj, prop, descriptor) {
      try { delete obj[prop]; } catch(e) {}
      try { Object.defineProperty(obj, prop, { configurable: true, ...descriptor }); } catch(e) {}
    }

    safeProp(Navigator.prototype, "vendor", { get: () => "Google Inc." });
    safeProp(Navigator.prototype, "platform", { get: () => "${p.platform}" });
    safeProp(Navigator.prototype, "languages", { get: () => Object.freeze(${p.langs}) });
    safeProp(Navigator.prototype, "hardwareConcurrency", { get: () => ${p.hw} });
    safeProp(Navigator.prototype, "deviceMemory", { get: () => ${p.mem} });

    safeProp(Navigator.prototype, "plugins", {
      get: () => {
        const pluginData = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" }] },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "" }] },
          { name: "Native Client", filename: "internal-nacl-plugin", description: "", mimeTypes: [{ type: "application/x-nacl", suffixes: "", description: "Native Client Executable" }] },
        ];
        const plugins = Object.create(PluginArray.prototype);
        for (let i = 0; i < pluginData.length; i++) {
          const p = Object.create(Plugin.prototype);
          Object.defineProperties(p, {
            name: { value: pluginData[i].name }, filename: { value: pluginData[i].filename },
            description: { value: pluginData[i].description }, length: { value: pluginData[i].mimeTypes.length },
          });
          plugins[i] = p;
          plugins[pluginData[i].name] = p;
        }
        Object.defineProperty(plugins, "length", { value: pluginData.length });
        return plugins;
      },
    });

    safeProp(Navigator.prototype, "mimeTypes", {
      get: () => {
        const mimes = Object.create(MimeTypeArray.prototype);
        Object.defineProperty(mimes, "length", { value: 4 });
        return mimes;
      },
    });
  })();

  if (navigator.permissions) {
    const _origQuery = navigator.permissions.query.bind(navigator.permissions);
    const _patchedQuery = function(params) {
      if (params.name === "notifications") return Promise.resolve({ state: Notification.permission });
      return _origQuery(params);
    };
    _makeNative(_patchedQuery, 'query');
    navigator.permissions.query = _patchedQuery;
  }

  const _origGetParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return "Intel Inc.";
    if (param === 37446) return "Intel Iris OpenGL Engine";
    return _origGetParam.call(this, param);
  };
  _makeNative(WebGLRenderingContext.prototype.getParameter, 'getParameter');

  if (typeof WebGL2RenderingContext !== "undefined") {
    const _origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return "Intel Inc.";
      if (param === 37446) return "Intel Iris OpenGL Engine";
      return _origGetParam2.call(this, param);
    };
    _makeNative(WebGL2RenderingContext.prototype.getParameter, 'getParameter');
  }

  if (window.outerWidth === 0) Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
  if (window.outerHeight === 0) Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 85 });

  const _origHTMLIFrameElement_contentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
  if (_origHTMLIFrameElement_contentWindow) {
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get: function() {
        const w = _origHTMLIFrameElement_contentWindow.get.call(this);
        if (w) { try { w.self; } catch(e) {} }
        return w;
      },
    });
  }

  if (typeof MediaSource !== "undefined") {
    const _origIsTypeSupported = MediaSource.isTypeSupported.bind(MediaSource);
    MediaSource.isTypeSupported = function(type) {
      const alwaysSupported = [
        'video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="avc1.4D401E"', 'video/mp4; codecs="avc1.64001E"',
        'video/webm; codecs="vp8"', 'video/webm; codecs="vp9"',
        'audio/mp4; codecs="mp4a.40.2"', 'audio/webm; codecs="opus"', 'audio/webm; codecs="vorbis"',
      ];
      if (alwaysSupported.some(s => type.includes(s.split(';')[0]))) return true;
      return _origIsTypeSupported(type);
    };
    _makeNative(MediaSource.isTypeSupported, 'isTypeSupported');
  }

  if (navigator.connection) {
    Object.defineProperty(navigator.connection, "rtt", { get: () => 50 });
    Object.defineProperty(navigator.connection, "downlink", { get: () => 10 });
    Object.defineProperty(navigator.connection, "effectiveType", { get: () => "4g" });
  }

  // Screen fingerprint
  try { Object.defineProperty(screen, "width",       { get: () => ${p.sw}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "height",      { get: () => ${p.sh}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "availWidth",  { get: () => ${p.sw}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "availHeight", { get: () => ${p.sah}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "colorDepth",  { get: () => 24, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "pixelDepth",  { get: () => 24, configurable: true }); } catch(e) {}
  // devicePixelRatio
  try { Object.defineProperty(window, "devicePixelRatio", { get: () => ${p.dpr}, configurable: true }); } catch(e) {}

  // WebRTC IP leak prevention \u2014 filter private/container IP candidates
  (function() {
    const _RTC = window.RTCPeerConnection;
    if (!_RTC) return;

    function isPrivateIP(ip) {
      return /^10./.test(ip) ||
        /^172.(1[6-9]|2d|3[01])./.test(ip) ||
        /^192.168./.test(ip) ||
        /^127./.test(ip) ||
        /^169.254./.test(ip) ||
        /^::1$/.test(ip) ||
        /^fc|^fd/.test(ip);
    }

    function extractIP(candidateStr) {
      const m = candidateStr.match(/(d{1,3}.d{1,3}.d{1,3}.d{1,3}|[a-f0-9:]{3,})/);
      return m ? m[1] : null;
    }

    function filterCandidate(event) {
      if (!event || !event.candidate || !event.candidate.candidate) return false;
      const ip = extractIP(event.candidate.candidate);
      return ip ? isPrivateIP(ip) : false;
    }

    const PatchedRTC = function(config, constraints) {
      const pc = new _RTC(config, constraints);

      const origAEL = pc.addEventListener.bind(pc);
      pc.addEventListener = function(type, handler, ...rest) {
        if (type === 'icecandidate' && handler) {
          return origAEL(type, (e) => { if (!filterCandidate(e)) handler(e); }, ...rest);
        }
        return origAEL(type, handler, ...rest);
      };

      Object.defineProperty(pc, 'onicecandidate', {
        set(handler) {
          if (!handler) return;
          origAEL('icecandidate', (e) => { if (!filterCandidate(e)) handler.call(pc, e); });
        },
        get() { return null; },
        configurable: true,
      });

      return pc;
    };

    PatchedRTC.prototype = _RTC.prototype;
    Object.defineProperty(window, 'RTCPeerConnection', {
      value: PatchedRTC, writable: true, configurable: true,
    });
  })();

  // Fix WebGL_debug_renderer_info extension so getParameter(37445/37446) works
  const _origGetExt = WebGLRenderingContext.prototype.getExtension;
  WebGLRenderingContext.prototype.getExtension = function(name) {
    if (name === 'WEBGL_debug_renderer_info') {
      return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
    }
    return _origGetExt.call(this, name);
  };
  _makeNative(WebGLRenderingContext.prototype.getExtension, 'getExtension');

  if (typeof WebGL2RenderingContext !== "undefined") {
    const _origGetExt2 = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
      }
      return _origGetExt2.call(this, name);
    };
    _makeNative(WebGL2RenderingContext.prototype.getExtension, 'getExtension');
  }

  // Patch Worker constructor to inject navigator overrides into Web Workers
  // Workers have their own WorkerNavigator global \u2014 page.addInitScript doesn't reach them
  (function() {
    const _OrigWorker = window.Worker;
    if (!_OrigWorker) return;

    const WORKER_PATCH = \`
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${p.hw}, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${p.mem}, configurable: true });
      Object.defineProperty(navigator, 'platform', { get: () => '${p.platform}', configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => Object.freeze(${p.langs}), configurable: true });
      Object.defineProperty(navigator, 'userAgent', { get: () => '${p.ua.replace(/'/g, "\\'")}', configurable: true });
    \`;

    function PatchedWorker(url, opts) {
      // Skip wrapping module workers \u2014 importScripts doesn't exist in ES module scope
      if (opts && opts.type === 'module') {
        return new _OrigWorker(url, opts);
      }
      let workerUrl;
      try {
        const originalUrl = url instanceof URL ? url.href : String(url);
        const blob = new Blob(
          [WORKER_PATCH, '\\nimportScripts(' + JSON.stringify(originalUrl) + ')'],
          { type: 'application/javascript' }
        );
        workerUrl = URL.createObjectURL(blob);
      } catch(e) {
        workerUrl = url;
      }
      return new _OrigWorker(workerUrl, opts);
    }
    PatchedWorker.prototype = _OrigWorker.prototype;
    Object.defineProperty(window, 'Worker', { value: PatchedWorker, writable: true, configurable: true });
  })();

  if (navigator.userAgentData) {
    const _brands = ${JSON.stringify(p.brands)};
    const _fullVersionBrands = ${JSON.stringify(p.fullVersionList)};
    Object.defineProperty(Navigator.prototype, "userAgentData", {
      configurable: true,
      get: () => ({
        brands: _brands, mobile: false, platform: "Windows",
        getHighEntropyValues: (hints) => Promise.resolve({
          brands: _brands, fullVersionList: _fullVersionBrands, mobile: false, model: "",
          platform: "Windows", platformVersion: "${p.platformVersion}", architecture: "x86", bitness: "64", uaFullVersion: "${p.uaFullVersion}",
        }),
        toJSON: () => ({ brands: _brands, mobile: false, platform: "Windows" }),
      }),
    });
  }
  `;
}
function stealthContextOptions(overrides = {}, _sessionId, fp) {
  const uaVersion = fp?.uaData?.brands?.find((b) => b.brand === "Google Chrome")?.version ?? "136";
  return {
    userAgent: fp?.userAgent ?? USER_AGENT,
    locale: overrides.locale || "en-US",
    timezoneId: overrides.timezoneId || "America/New_York",
    deviceScaleFactor: fp?.deviceScaleFactor ?? 1.25,
    viewport: {
      width: fp?.screenWidth ?? 1920,
      height: fp?.screenHeight ?? 1080
    },
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": `"Chromium";v="${uaVersion}", "Google Chrome";v="${uaVersion}", "Not:A-Brand";v="99"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"Windows"`,
      ...overrides.extraHTTPHeaders
    },
    ...overrides
  };
}
async function applyStealthToPage(page) {
  await page.context().addInitScript(STEALTH_SCRIPT);
}
var CHROME_VERSION, USER_AGENT, NATIVE_TOSTRING_HELPER, STEALTH_SCRIPT, STEALTH_ARGS;
var init_stealth = __esm({
  "src/lib/browser/stealth.ts"() {
    "use strict";
    CHROME_VERSION = "136.0.7103.93";
    USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
    NATIVE_TOSTRING_HELPER = `
  const _nativeToStr = Function.prototype.toString;
  const _patchedFns = new Set();
  function _makeNative(fn, name) {
    _patchedFns.add(fn);
    fn.toString = () => 'function ' + (name || fn.name || '') + '() { [native code] }';
  }
  const _origToString = Function.prototype.toString;
  Function.prototype.toString = function() {
    if (_patchedFns.has(this)) return this.toString();
    return _origToString.call(this);
  };
  _makeNative(Function.prototype.toString, 'toString');
`;
    STEALTH_SCRIPT = buildStealthScript();
    STEALTH_ARGS = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-infobars",
      "--window-size=1920,1080",
      "--enable-features=NetworkService,NetworkServiceInProcess",
      "--use-gl=angle",
      "--use-angle=swiftshader"
    ];
  }
});

// src/lib/browser/launcher.ts
function armHeadedIdleTimer() {
  if (headedIdleTimer) clearTimeout(headedIdleTimer);
  headedIdleTimer = setTimeout(() => {
    if (!headedBrowser) return;
    const pages = headedBrowser.contexts().reduce((n, c) => n + c.pages().length, 0);
    if (pages > 0) {
      armHeadedIdleTimer();
      return;
    }
    log2.info("idle timeout for the pivot headed browser, closing");
    void closeHeadedBrowser();
  }, HEADED_IDLE_MS);
}
async function getHeadedBrowser() {
  if (!headedBrowser?.isConnected()) {
    const marker = `--iframer-key=pivot-headed-${process.pid}-${Date.now()}`;
    headedBrowser = await import_patchright.chromium.launch({ headless: false, args: [...STEALTH_ARGS, marker] });
    headedPid = findChromePidByMarker(marker);
    if (headedPid) {
      registerBrowser({
        key: "pivot::headed",
        chromePid: headedPid,
        ownerPid: process.pid,
        marker,
        launchedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      log2.warn("could not resolve Chrome PID for the pivot headed browser \u2014 force-kill unavailable");
    }
  }
  armHeadedIdleTimer();
  return headedBrowser;
}
async function closeHeadedBrowser() {
  if (headedIdleTimer) {
    clearTimeout(headedIdleTimer);
    headedIdleTimer = null;
  }
  if (headedBrowser) {
    await headedBrowser.close().catch(() => {
    });
    headedBrowser = null;
  }
  if (headedPid !== null) {
    unregisterBrowser(headedPid);
    headedPid = null;
  }
}
async function getBrowser(_name = "chromium") {
  if (cachedBrowser) {
    if (cachedBrowser.isConnected()) return cachedBrowser;
    try {
      await cachedBrowser.close();
    } catch (e) {
      log2.warn(`stale browser close failed: ${e}`);
    }
    cachedBrowser = null;
  }
  cachedBrowser = await import_patchright.chromium.launch({
    headless: true,
    args: STEALTH_ARGS
  });
  return cachedBrowser;
}
async function closeBrowser() {
  await closeHeadedBrowser();
  if (!cachedBrowser) return;
  try {
    await cachedBrowser.close();
  } catch (e) {
    log2.warn(`closeBrowser failed: ${e}`);
  }
  cachedBrowser = null;
}
async function getBrowserWithFallback(_preferred) {
  return { browser: await getBrowser(), name: "chromium" };
}
var import_patchright, log2, cachedBrowser, headedBrowser, headedPid, headedIdleTimer, HEADED_IDLE_MS;
var init_launcher = __esm({
  "src/lib/browser/launcher.ts"() {
    "use strict";
    import_patchright = require("patchright");
    init_stealth();
    init_logger();
    init_registry();
    log2 = createLogger("launcher");
    cachedBrowser = null;
    headedBrowser = null;
    headedPid = null;
    headedIdleTimer = null;
    HEADED_IDLE_MS = 5 * 60 * 1e3;
  }
});

// src/lib/auth/crypto.ts
function getLocalToken() {
  if (process.env.IFRAMER_SECRET) return process.env.IFRAMER_SECRET;
  const candidates = [
    import_path4.default.join(getDataDir(), "secret"),
    import_path4.default.join(process.env.XDG_RUNTIME_DIR || import_os2.default.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = import_fs3.default.readFileSync(file, "utf8").trim();
      if (existing) return existing;
    } catch {
    }
  }
  for (const file of candidates) {
    try {
      import_fs3.default.mkdirSync(import_path4.default.dirname(file), { recursive: true });
      const secret = import_crypto.default.randomBytes(32).toString("hex");
      import_fs3.default.writeFileSync(file, secret, { mode: 384 });
      return secret;
    } catch {
    }
  }
  throw new Error(
    `iframer: could not read or create a persistent encryption secret in any writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a stable value shared between the MCP server and CLI (openssl rand -hex 32).`
  );
}
function getPairingTokens() {
  const tokens = /* @__PURE__ */ new Set();
  try {
    tokens.add(getLocalToken());
  } catch {
  }
  const candidates = [
    import_path4.default.join(getDataDir(), "secret"),
    import_path4.default.join(process.env.XDG_RUNTIME_DIR || import_os2.default.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      tokens.add(import_fs3.default.readFileSync(file, "utf8").trim());
    } catch {
    }
  }
  tokens.delete("");
  return [...tokens];
}
function deriveKey(token, purpose = INFO) {
  return new Promise((resolve, reject) => {
    import_crypto.default.hkdf("sha256", token, SALT, purpose, KEY_LENGTH, (err, key) => {
      if (err) return reject(err);
      resolve(Buffer.from(key));
    });
  });
}
function encrypt(plaintext, key) {
  const iv = import_crypto.default.randomBytes(IV_LENGTH);
  const cipher = import_crypto.default.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}
function decrypt(blob, key) {
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = import_crypto.default.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, void 0, "utf8") + decipher.final("utf8");
}
function generateTOTP(secret, period = 30, digits = 6) {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";
  for (const c of cleanSecret) {
    const val = base32Chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const keyBytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(keyBytes);
  const time = Math.floor(Date.now() / 1e3 / period);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / 4294967296), 0);
  timeBuffer.writeUInt32BE(time & 4294967295, 4);
  const hmac = import_crypto.default.createHmac("sha1", key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255) % Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}
var import_crypto, import_fs3, import_os2, import_path4, SALT, INFO, KEY_LENGTH, IV_LENGTH, TAG_LENGTH;
var init_crypto = __esm({
  "src/lib/auth/crypto.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"));
    import_fs3 = __toESM(require("fs"));
    import_os2 = __toESM(require("os"));
    import_path4 = __toESM(require("path"));
    init_paths();
    SALT = "iframer-session";
    INFO = "encryption";
    KEY_LENGTH = 32;
    IV_LENGTH = 12;
    TAG_LENGTH = 16;
  }
});

// src/lib/session/persistence.ts
async function extractSession(context, page) {
  const cookies = await context.cookies();
  const { localStorage, sessionStorage: sessionStorage2 } = await page.evaluate(() => {
    const ls = {};
    const ss = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      ls[key] = window.localStorage.getItem(key);
    }
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      ss[key] = window.sessionStorage.getItem(key);
    }
    return { localStorage: ls, sessionStorage: ss };
  });
  const origin = new URL(page.url()).origin;
  return {
    cookies,
    localStorage: { [origin]: localStorage },
    sessionStorage: { [origin]: sessionStorage2 },
    extractedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function injectCookies(context, sessionData) {
  if (sessionData?.cookies?.length > 0) {
    await context.addCookies(sessionData.cookies);
  }
}
async function injectStorage(page, sessionData) {
  if (!sessionData) return;
  const origin = new URL(page.url()).origin;
  const ls = sessionData.localStorage?.[origin];
  const ss = sessionData.sessionStorage?.[origin];
  if (ls && Object.keys(ls).length > 0) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, ls);
  }
  if (ss && Object.keys(ss).length > 0) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.sessionStorage.setItem(key, value);
      }
    }, ss);
  }
}
var init_persistence = __esm({
  "src/lib/session/persistence.ts"() {
    "use strict";
  }
});

// src/lib/session/sqlite-store.ts
function createBunDb(dbPath) {
  const { Database } = require("bun:sqlite");
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  return {
    queryGet: (sql, ...params) => db.query(sql).get(...params),
    queryAll: (sql, ...params) => db.query(sql).all(...params),
    run: (sql, ...params) => {
      if (params.length > 0) {
        db.query(sql).run(...params);
      } else {
        db.run(sql);
      }
    },
    close: () => db.close()
  };
}
function createNodeDb(dbPath) {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return {
    queryGet: (sql, ...params) => db.prepare(sql).get(...params),
    queryAll: (sql, ...params) => db.prepare(sql).all(...params),
    run: (sql, ...params) => {
      if (params.length > 0) {
        db.prepare(sql).run(...params);
      } else {
        db.exec(sql);
      }
    },
    close: () => db.close()
  };
}
var import_path5, import_fs4, IS_BUN, SqliteStore;
var init_sqlite_store = __esm({
  "src/lib/session/sqlite-store.ts"() {
    "use strict";
    import_path5 = __toESM(require("path"));
    import_fs4 = __toESM(require("fs"));
    IS_BUN = typeof globalThis.Bun !== "undefined";
    SqliteStore = class {
      db;
      constructor(dataDir) {
        import_fs4.default.mkdirSync(dataDir, { recursive: true });
        const dbPath = import_path5.default.join(dataDir, "iframer.db");
        this.db = IS_BUN ? createBunDb(dbPath) : createNodeDb(dbPath);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        user_id TEXT PRIMARY KEY,
        blob    BLOB NOT NULL
      )
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        user_id TEXT NOT NULL,
        domain  TEXT NOT NULL,
        blob    BLOB NOT NULL,
        PRIMARY KEY (user_id, domain)
      )
    `);
        this.migrateLegacyUserIds();
      }
      migrateLegacyUserIds() {
        const CANONICAL = "iframer-local";
        const LEGACY = ["cli-user", "mcp-user", "default"];
        for (const legacy of LEGACY) {
          this.db.run(
            `INSERT OR IGNORE INTO credentials (user_id, domain, blob)
         SELECT ?, domain, blob FROM credentials WHERE user_id = ?`,
            CANONICAL,
            legacy
          );
          this.db.run(
            `INSERT OR IGNORE INTO sessions (user_id, blob)
         SELECT ?, blob FROM sessions WHERE user_id = ?`,
            CANONICAL,
            legacy
          );
        }
      }
      // ─── Sessions ───────────────────────────────────────────────────────
      async getSession(userId) {
        const row = this.db.queryGet("SELECT blob FROM sessions WHERE user_id = ?", userId);
        return row ? Buffer.from(row.blob) : null;
      }
      async setSession(userId, blob) {
        this.db.run("INSERT OR REPLACE INTO sessions (user_id, blob) VALUES (?, ?)", userId, blob);
      }
      async deleteSession(userId) {
        this.db.run("DELETE FROM sessions WHERE user_id = ?", userId);
      }
      // ─── Credentials ────────────────────────────────────────────────────
      async setCredential(userId, domain, encryptedBlob) {
        this.db.run("INSERT OR REPLACE INTO credentials (user_id, domain, blob) VALUES (?, ?, ?)", userId, domain, encryptedBlob);
      }
      async getCredential(userId, domain) {
        const row = this.db.queryGet("SELECT blob FROM credentials WHERE user_id = ? AND domain = ?", userId, domain);
        return row ? Buffer.from(row.blob) : null;
      }
      async deleteCredential(userId, domain) {
        this.db.run("DELETE FROM credentials WHERE user_id = ? AND domain = ?", userId, domain);
      }
      async listCredentialDomains(userId) {
        const rows = this.db.queryAll("SELECT domain FROM credentials WHERE user_id = ?", userId);
        return rows.map((r) => r.domain);
      }
      // ─── Lifecycle ──────────────────────────────────────────────────────
      close() {
        this.db.close();
      }
    };
  }
});

// src/lib/storage.ts
function createStore(options = {}) {
  const dataDir = options.dataDir || getDataDir();
  return new SqliteStore(dataDir);
}
var init_storage = __esm({
  "src/lib/storage.ts"() {
    "use strict";
    init_sqlite_store();
    init_paths();
  }
});

// src/lib/browser/chrome-downloader.ts
var chrome_downloader_exports = {};
__export(chrome_downloader_exports, {
  downloadChrome: () => downloadChrome,
  ensureChrome: () => ensureChrome,
  findChrome: () => findChrome,
  findChromeForTesting: () => findChromeForTesting,
  isChromiumInstalled: () => isChromiumInstalled
});
function getPlatform() {
  const arch = process.arch;
  const platform = process.platform;
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "linux") return arch === "arm64" ? "linux-arm64" : "linux64";
  if (platform === "win32") return "win64";
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}
function getChromeExecutablePath(installDir) {
  const platform = process.platform;
  if (platform === "darwin") {
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-mac-arm64";
    return import_path6.default.join(installDir, dir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (platform === "linux") {
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-linux64";
    return import_path6.default.join(installDir, dir, "chrome");
  }
  if (platform === "win32") {
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-win64";
    return import_path6.default.join(installDir, dir, "chrome.exe");
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
async function downloadChrome(installDir = DEFAULT_INSTALL_DIR) {
  log3.info("Downloading Chrome for Testing (first time only)...");
  const res = await fetch(CHROME_VERSIONS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Chrome versions: ${res.status}`);
  const data = await res.json();
  const channel = data.channels?.Stable;
  if (!channel) throw new Error("No Stable channel found in Chrome for Testing versions");
  const platform = getPlatform();
  const download2 = channel.downloads?.chrome?.find((d) => d.platform === platform);
  if (!download2) throw new Error(`No Chrome for Testing download for platform: ${platform}`);
  const url = download2.url;
  const version = channel.version;
  log3.debug(`Version ${version} for ${platform}`);
  log3.debug(`URL: ${url}`);
  import_fs5.default.mkdirSync(installDir, { recursive: true });
  const zipPath = import_path6.default.join(installDir, "chrome.zip");
  const dlRes = await fetch(url);
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  import_fs5.default.writeFileSync(zipPath, buf);
  log3.info(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  (0, import_child_process3.execSync)(`unzip -o -q "${zipPath}" -d "${installDir}"`, { stdio: "inherit" });
  import_fs5.default.unlinkSync(zipPath);
  const execPath = getChromeExecutablePath(installDir);
  if (!import_fs5.default.existsSync(execPath)) {
    throw new Error(`Chrome executable not found after extraction: ${execPath}`);
  }
  if (process.platform !== "win32") {
    import_fs5.default.chmodSync(execPath, 493);
  }
  import_fs5.default.writeFileSync(import_path6.default.join(installDir, "version.json"), JSON.stringify({ version, platform, downloadedAt: (/* @__PURE__ */ new Date()).toISOString() }));
  log3.info(`Installed at: ${execPath}`);
  return execPath;
}
function findChromeForTesting() {
  if (process.env.CHROME_EXECUTABLE) {
    if (import_fs5.default.existsSync(process.env.CHROME_EXECUTABLE)) return process.env.CHROME_EXECUTABLE;
  }
  try {
    const execPath = getChromeExecutablePath(DEFAULT_INSTALL_DIR);
    if (import_fs5.default.existsSync(execPath)) return execPath;
  } catch {
  }
  return null;
}
function findChrome() {
  const cft = findChromeForTesting();
  if (cft) return cft;
  const systemPaths = process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ] : process.platform === "linux" ? [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ] : [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (const p of systemPaths) {
    if (import_fs5.default.existsSync(p)) return p;
  }
  return null;
}
function isChromiumInstalled() {
  return findChrome() !== null;
}
async function ensureChrome() {
  const cft = findChromeForTesting();
  if (cft) return cft;
  try {
    return await downloadChrome();
  } catch (err) {
    log3.error(`Failed to download Chrome for Testing: ${err instanceof Error ? err.message : String(err)}`);
    const system = findChrome();
    if (system) {
      log3.warn(`Falling back to system Chrome: ${system}`);
      return system;
    }
    throw new Error("No Chrome found. Download failed and no system Chrome available.");
  }
}
var import_fs5, import_path6, import_os3, import_child_process3, log3, CHROME_VERSIONS_URL, DEFAULT_INSTALL_DIR;
var init_chrome_downloader = __esm({
  "src/lib/browser/chrome-downloader.ts"() {
    "use strict";
    import_fs5 = __toESM(require("fs"));
    import_path6 = __toESM(require("path"));
    import_os3 = __toESM(require("os"));
    import_child_process3 = require("child_process");
    init_logger();
    log3 = createLogger("chrome");
    CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    DEFAULT_INSTALL_DIR = import_path6.default.join(import_os3.default.homedir(), ".iframer", "chrome");
  }
});

// src/lib/browser/cloak-browser.ts
function cloakEnabled() {
  return process.env.IFRAMER_USE_CLOAKBROWSER === "1" || process.env.IFRAMER_USE_CLOAKBROWSER === "true";
}
async function tryImport() {
  if (!cloakEnabled()) return null;
  try {
    return await import("cloakbrowser");
  } catch {
    return null;
  }
}
async function ensureBinary() {
  const cloak = await tryImport();
  if (!cloak) return false;
  try {
    const info = cloak.binaryInfo();
    if (!info.installed) {
      log4.info("Downloading CloakBrowser binary...");
      await cloak.ensureBinary();
      log4.info("CloakBrowser ready");
    }
    _available = true;
    return true;
  } catch (err) {
    log4.warn(`CloakBrowser setup failed: ${err instanceof Error ? err.message : String(err)}`);
    _available = false;
    return false;
  }
}
async function launchCloakBrowser(options) {
  const cloak = await tryImport();
  if (!cloak) return null;
  try {
    const ok = await ensureBinary();
    if (!ok) return null;
    const browser = await cloak.launch({
      headless: options.headless,
      args: options.args
    });
    log4.info(`CloakBrowser launched (headless=${options.headless})`);
    return browser;
  } catch (err) {
    log4.warn(`CloakBrowser launch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
var log4, _available;
var init_cloak_browser = __esm({
  "src/lib/browser/cloak-browser.ts"() {
    "use strict";
    init_logger();
    log4 = createLogger("cloak");
    _available = null;
  }
});

// src/lib/browser/daemon.ts
function keyOf(mode, instanceId) {
  return `${mode}::${instanceId}`;
}
var import_patchright2, import_crypto2, log5, DEFAULT_IDLE_TIMEOUT, CLOSE_GRACE_MS, BUSY_MAX_MS, BLANK_IDLE_MS, DEFAULT_INSTANCE, sleep3, BrowserDaemon;
var init_daemon = __esm({
  "src/lib/browser/daemon.ts"() {
    "use strict";
    import_patchright2 = require("patchright");
    import_crypto2 = require("crypto");
    init_chrome_downloader();
    init_cloak_browser();
    init_logger();
    init_registry();
    log5 = createLogger("daemon");
    DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1e3;
    CLOSE_GRACE_MS = 5e3;
    BUSY_MAX_MS = 30 * 60 * 1e3;
    BLANK_IDLE_MS = 2 * 60 * 1e3;
    DEFAULT_INSTANCE = "default";
    sleep3 = (ms) => new Promise((r) => setTimeout(r, ms));
    BrowserDaemon = class {
      instances = /* @__PURE__ */ new Map();
      idleTimers = /* @__PURE__ */ new Map();
      idleTimeout;
      constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
        this.idleTimeout = idleTimeout;
      }
      async ensure(mode, instanceId = DEFAULT_INSTANCE, sessionProfile = instanceId) {
        const key = keyOf(mode, instanceId);
        let instance = this.instances.get(key);
        if (instance) {
          try {
            if (instance.browser.isConnected()) {
              let page2 = instance.page;
              let context2 = instance.context;
              try {
                await page2.evaluate("1");
              } catch {
                log5.info(`Page for ${mode} is dead, creating fresh context`);
                try {
                  await context2.close();
                } catch (err) {
                  log5.warn(`dead-page context close failed: ${err}`);
                }
                context2 = await instance.browser.newContext();
                page2 = await context2.newPage();
                instance.context = context2;
                instance.page = page2;
              }
              instance.sessionProfile = sessionProfile;
              this.resetIdleTimer(key);
              return { browser: instance.browser, context: context2, page: page2 };
            }
          } catch {
          }
          log5.info(`Browser for ${key} disconnected (window closed?), relaunching...`);
          await this.stopMode(mode, instanceId);
        }
        const marker = `--iframer-key=${key}-${(0, import_crypto2.randomUUID)()}`;
        let browser;
        const cloakBrowser = await launchCloakBrowser({ headless: mode === "headless", args: [marker] });
        if (cloakBrowser) {
          log5.info(`CloakBrowser ${mode} ready`);
          browser = cloakBrowser;
        } else {
          const executablePath = await ensureChrome();
          log5.info(`Falling back to Chrome for Testing in ${mode} mode: ${executablePath}`);
          browser = await import_patchright2.chromium.launch({
            executablePath,
            headless: mode === "headless",
            args: [
              "--disable-blink-features=AutomationControlled",
              "--no-first-run",
              "--no-default-browser-check",
              "--disable-infobars",
              marker
            ]
          });
        }
        const chromePid = findChromePidByMarker(marker);
        if (chromePid) {
          registerBrowser({
            key,
            chromePid,
            ownerPid: process.pid,
            marker,
            launchedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
          log5.warn(`could not resolve Chrome PID for ${key} \u2014 force-kill unavailable for this instance`);
        }
        const context = await browser.newContext();
        const page = await context.newPage();
        instance = {
          browser,
          context,
          page,
          mode,
          instanceId,
          sessionProfile,
          createdAt: /* @__PURE__ */ new Date(),
          chromePid,
          marker,
          active: 0,
          busySince: null
        };
        this.instances.set(key, instance);
        this.resetIdleTimer(key);
        log5.info(`Chrome ${key} ready (pid=${chromePid ?? "unknown"})`);
        return { browser, context, page };
      }
      /** Mark an instance busy for the duration of a pipeline run. While busy,
       *  the idle timer re-arms instead of killing the browser mid-work.
       *  Always pair with release() in a finally block. */
      acquire(mode, instanceId = DEFAULT_INSTANCE) {
        const instance = this.instances.get(keyOf(mode, instanceId));
        if (!instance) return;
        if (instance.active === 0) instance.busySince = Date.now();
        instance.active++;
      }
      release(mode, instanceId = DEFAULT_INSTANCE) {
        const key = keyOf(mode, instanceId);
        const instance = this.instances.get(key);
        if (!instance) return;
        instance.active = Math.max(0, instance.active - 1);
        if (instance.active === 0) {
          instance.busySince = null;
          this.resetIdleTimer(key);
        }
      }
      isRunning(mode, instanceId = DEFAULT_INSTANCE) {
        const instance = this.instances.get(keyOf(mode, instanceId));
        if (!instance) return false;
        try {
          return instance.browser.isConnected();
        } catch {
          return false;
        }
      }
      /** Close instances that never left about:blank and have been idle a while.
       *  Those are accidents — a pipeline that failed before its first navigate, or
       *  a mode picked for a call that never needed a browser — and in headful mode
       *  each one is an empty window sitting on the user's desktop. Called on the
       *  server's reap tick, so it also catches instances whose idle timer was lost
       *  (e.g. the daemon was restarted under them). */
      sweepBlankInstances() {
        const stopped = [];
        const now = Date.now();
        for (const [key, inst] of this.instances.entries()) {
          if (inst.active > 0) continue;
          if (now - inst.createdAt.getTime() < BLANK_IDLE_MS) continue;
          let blank = false;
          try {
            const pages = inst.context.pages();
            blank = pages.length === 0 || pages.every((p) => {
              const u = p.url();
              return u === "about:blank" || u === "" || u === "chrome://newtab/";
            });
          } catch {
            continue;
          }
          if (!blank) continue;
          log5.info(`blank-orphan sweep: ${key} never left about:blank, stopping`);
          stopped.push(key);
          this.stopKey(key).catch((err) => log5.warn(`blank sweep stop failed for ${key}: ${err}`));
        }
        return stopped;
      }
      /** Distinct modes that currently have at least one live instance. */
      runningModes() {
        return [...new Set(this.liveInstances().map((i) => i.mode))];
      }
      /** Return all currently-live instances (for extracting session state before teardown) */
      liveInstances() {
        return [...this.instances.values()].filter((inst) => {
          try {
            return inst.browser.isConnected();
          } catch {
            return false;
          }
        });
      }
      /** Mode of a live browser with this instanceId, if any (first match). Lets
       *  a resume reattach the SAME window by instanceId even when the call forces
       *  no mode and has no navigate step to infer one from. */
      findLiveMode(instanceId) {
        for (const inst of this.liveInstances()) {
          if (inst.instanceId === instanceId) return inst.mode;
        }
        return null;
      }
      /** Live browsers as InstanceInfo — what page each is on right now, so an
       *  agent can see which window is which task and reattach by instanceId
       *  after an interrupt (instead of re-navigating and losing the state). */
      async instancesInfo() {
        const now = Date.now();
        const out = [];
        for (const inst of this.liveInstances()) {
          let url = "";
          let title = "";
          try {
            url = inst.page.url();
          } catch {
          }
          try {
            title = await inst.page.title();
          } catch {
          }
          out.push({
            mode: inst.mode,
            instanceId: inst.instanceId,
            sessionProfile: inst.sessionProfile ?? inst.instanceId,
            url,
            title,
            busy: inst.active > 0,
            createdAt: inst.createdAt.toISOString(),
            ageSeconds: Math.round((now - inst.createdAt.getTime()) / 1e3)
          });
        }
        return out;
      }
      async stopMode(mode, instanceId = DEFAULT_INSTANCE) {
        await this.stopKey(keyOf(mode, instanceId));
      }
      /**
       * Stop one browser: polite close with a hard deadline, then SIGKILL by PID.
       * This can NEVER hang — a wedged context.close() (the historical source of
       * permanently orphaned Chromes) is abandoned after CLOSE_GRACE_MS and the
       * process is killed by PID instead.
       */
      async stopKey(key) {
        const instance = this.instances.get(key);
        if (!instance) return;
        const timer = this.idleTimers.get(key);
        if (timer) clearTimeout(timer);
        this.idleTimers.delete(key);
        log5.info(`Stopping Chrome ${key} (pid=${instance.chromePid ?? "unknown"})...`);
        const politeClose = (async () => {
          try {
            await instance.context.close();
          } catch (err) {
            log5.warn(`context.close failed for ${key}: ${err}`);
          }
          try {
            await instance.browser.close();
          } catch (err) {
            log5.warn(`browser.close failed for ${key}: ${err}`);
          }
        })();
        const closedInTime = await Promise.race([
          politeClose.then(() => true),
          sleep3(CLOSE_GRACE_MS).then(() => false)
        ]);
        if (!closedInTime) {
          log5.warn(`polite close timed out after ${CLOSE_GRACE_MS}ms for ${key}, force-killing`);
        }
        if (instance.chromePid !== null) {
          const dead = await forceKillBrowser({ chromePid: instance.chromePid, marker: instance.marker });
          if (dead) {
            unregisterBrowser(instance.chromePid);
          } else {
            log5.warn(`Chrome pid=${instance.chromePid} survived SIGKILL?! leaving registry record for reaper`);
          }
        } else if (!closedInTime) {
          log5.warn(`no PID recorded for ${key} and polite close hung \u2014 this Chrome may leak until the next reap`);
        }
        this.instances.delete(key);
        log5.info(`Stopped Chrome ${key}`);
      }
      /**
       * Stop browsers. By default skips instances that are mid-pipeline (active>0)
       * so one agent's "session stop" can't kill another agent's running work on
       * a shared server. Pass force=true (crash recovery / shutdown) to kill all.
       */
      async stopAll(force = false) {
        const keys = [...this.instances.entries()].filter(([, inst]) => force || inst.active === 0).map(([k]) => k);
        await Promise.all(keys.map((k) => this.stopKey(k)));
      }
      resetIdleTimer(key) {
        const existing = this.idleTimers.get(key);
        if (existing) clearTimeout(existing);
        this.idleTimers.set(
          key,
          setTimeout(() => {
            const instance = this.instances.get(key);
            if (instance && instance.active > 0) {
              const busyMs = instance.busySince ? Date.now() - instance.busySince : 0;
              if (busyMs < BUSY_MAX_MS) {
                this.resetIdleTimer(key);
                return;
              }
              log5.warn(`${key} reported busy for ${Math.round(busyMs / 6e4)}m \u2014 treating active=${instance.active} as leaked, stopping`);
              instance.active = 0;
              instance.busySince = null;
            }
            log5.info(`Idle timeout for ${key}, stopping...`);
            this.stopKey(key).catch((err) => log5.warn(`idle stop failed for ${key}: ${err}`));
          }, this.idleTimeout)
        );
      }
      /** True if any registered Chrome PID from this daemon is still alive. */
      hasLiveProcesses() {
        return [...this.instances.values()].some(
          (inst) => inst.chromePid !== null && isPidAlive(inst.chromePid)
        );
      }
    };
  }
});

// src/lib/domain-modes.ts
function defaultFile() {
  return import_path7.default.join(getDataDir(), "domain-modes.json");
}
var import_fs6, import_path7, log6, TTL_DAYS, ESCALATION_LADDER, DomainModeStore;
var init_domain_modes = __esm({
  "src/lib/domain-modes.ts"() {
    "use strict";
    import_fs6 = __toESM(require("fs"));
    import_path7 = __toESM(require("path"));
    init_logger();
    init_paths();
    log6 = createLogger("domain-modes");
    TTL_DAYS = 14;
    ESCALATION_LADDER = ["headless", "binary-headful"];
    DomainModeStore = class {
      data = {};
      filePath;
      constructor(filePath = defaultFile()) {
        this.filePath = filePath;
        this.load();
      }
      /** Get the recommended mode for a domain, or null if unknown/expired */
      getMode(domain) {
        const entry = this.data[domain];
        if (!entry) return null;
        if (this.isExpired(entry)) return null;
        return entry.mode;
      }
      /** Record a successful access */
      recordSuccess(domain, mode) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
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
      /** Record a blocked attempt */
      recordFailure(domain, mode, reason) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
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
      /** Get the next mode to try after a failure, or null if exhausted */
      getNextMode(failedMode, availableModes) {
        const idx = ESCALATION_LADDER.indexOf(failedMode);
        for (let i = idx + 1; i < ESCALATION_LADDER.length; i++) {
          if (availableModes.includes(ESCALATION_LADDER[i])) {
            return ESCALATION_LADDER[i];
          }
        }
        return null;
      }
      /** Get the best starting mode: domain memory > first available in ladder */
      getBestMode(domain, availableModes) {
        const remembered = this.getMode(domain);
        if (remembered && availableModes.includes(remembered)) {
          return remembered;
        }
        for (const mode of ESCALATION_LADDER) {
          if (availableModes.includes(mode)) return mode;
        }
        return "headless";
      }
      /** Get summary stats for the status tool */
      getSummary() {
        const entries = Object.entries(this.data).filter(([, e]) => !this.isExpired(e)).sort(([, a], [, b]) => b.lastSuccess.localeCompare(a.lastSuccess));
        return {
          totalDomains: entries.length,
          recentDomains: entries.slice(0, 5).map(([d, e]) => `${d} (${e.mode})`)
        };
      }
      isExpired(entry) {
        if (!entry.lastSuccess) return true;
        const age = Date.now() - new Date(entry.lastSuccess).getTime();
        return age > TTL_DAYS * 24 * 60 * 60 * 1e3;
      }
      load() {
        try {
          if (import_fs6.default.existsSync(this.filePath)) {
            this.data = JSON.parse(import_fs6.default.readFileSync(this.filePath, "utf-8"));
          }
        } catch {
          this.data = {};
        }
      }
      save() {
        try {
          import_fs6.default.mkdirSync(import_path7.default.dirname(this.filePath), { recursive: true });
          import_fs6.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (err) {
          log6.error("Failed to save:", err);
        }
      }
    };
  }
});

// src/lib/browser/cdp-launcher.ts
function hasDisplay() {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return !!process.env.DISPLAY;
}
function checkModeAvailability() {
  return {
    headless: true,
    // Always available — we can auto-download Chrome
    binaryHeadful: hasDisplay()
  };
}
var init_cdp_launcher = __esm({
  "src/lib/browser/cdp-launcher.ts"() {
    "use strict";
  }
});

// src/lib/errors.ts
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
var init_errors = __esm({
  "src/lib/errors.ts"() {
    "use strict";
  }
});

// src/lib/execution/config.ts
function sessionStoreKey(userId, instanceId = DEFAULT_INSTANCE) {
  return instanceId === DEFAULT_INSTANCE ? userId : `${userId}::${instanceId}`;
}
var init_config = __esm({
  "src/lib/execution/config.ts"() {
    "use strict";
    init_daemon();
  }
});

// src/lib/execution/ref-store.ts
var RefStore;
var init_ref_store = __esm({
  "src/lib/execution/ref-store.ts"() {
    "use strict";
    RefStore = class {
      constructor(store, config) {
        this.store = store;
        this.config = config;
      }
      store;
      config;
      userRefs = /* @__PURE__ */ new Map();
      makeContext(userId, token) {
        if (!this.userRefs.has(userId)) {
          this.userRefs.set(userId, { refMap: /* @__PURE__ */ new Map(), nextRefId: 1 });
        }
        const refs = this.userRefs.get(userId);
        return {
          userId,
          token,
          screenshotDir: this.config.screenshotDir,
          publicUrl: this.config.publicUrl,
          staleTimeoutMs: this.config.staleTimeoutMs,
          refMap: refs.refMap,
          nextRefId: refs.nextRefId,
          store: this.store
        };
      }
      /** Persist the ref counter advanced by a run back onto the user's ref state. */
      sync(userId, ctx) {
        const refs = this.userRefs.get(userId);
        if (refs) refs.nextRefId = ctx.nextRefId;
      }
    };
  }
});

// src/lib/site-protection.ts
async function paceProtectedDomain(domain) {
  const now = Date.now();
  const slot = Math.max(now, nextRequest.get(domain) || 0);
  nextRequest.set(domain, slot + PROTECTED_INTERVAL_MS);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}
async function detectSiteProtection(page) {
  const cookies = await page.context().cookies(page.url()).catch(() => []);
  if (cookies.some((c) => /^(incap_ses_|visid_incap_|nlbi_)/i.test(c.name))) return "imperva";
  if (cookies.some((c) => /^(?:_abck|bm_sz|ak_bmsc|bm_sv)$/.test(c.name))) return "akamai";
  const html = await page.content().catch(() => "");
  if (/\/[_]Incapsula_Resource|incapsula incident id|powered by imperva/i.test(html)) return "imperva";
  if (/errors\.edgesuite\.net|akamai bot manager/i.test(html)) return "akamai";
  return null;
}
function protectionHooks(headless, respectful = false) {
  return {
    before: async (page, step) => {
      const protection = await detectSiteProtection(page);
      if (protection) {
        respectful = true;
        if (headless) throw new HeadedRequiredError(page.url());
      }
      if (respectful) await paceProtectedDomain(new URL(step.url || page.url()).hostname);
    },
    after: async (page) => {
      const protection = await detectSiteProtection(page);
      if (!protection) return;
      respectful = true;
      if (headless) throw new HeadedRequiredError(page.url());
    }
  };
}
var PROTECTED_INTERVAL_MS, nextRequest, HeadedRequiredError;
var init_site_protection = __esm({
  "src/lib/site-protection.ts"() {
    "use strict";
    PROTECTED_INTERVAL_MS = 3e3;
    nextRequest = /* @__PURE__ */ new Map();
    HeadedRequiredError = class extends Error {
      constructor(url) {
        super("This site requires a headed browser.");
        this.url = url;
      }
      url;
      stepIndex = 0;
      results = [];
      obstacles = [];
    };
  }
});

// src/lib/actions/types.ts
function failedStepResult(step, error, durationMs, stepIndex = -1) {
  return { stepIndex, step, ok: false, error, durationMs };
}
var init_types = __esm({
  "src/lib/actions/types.ts"() {
    "use strict";
  }
});

// src/lib/clipboard.ts
function platformTools(mode) {
  if (process.platform === "darwin") return [[mode === "read" ? "pbpaste" : "pbcopy"]];
  if (mode === "read") return [["wl-paste", "-n"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "-b", "-o"]];
  return [["wl-copy"], ["xclip", "-selection", "clipboard", "-i"], ["xsel", "-b", "-i"]];
}
function run(cmd, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = (0, import_child_process4.spawn)(cmd[0], cmd.slice(1));
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
    if (input !== void 0) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}
async function clipboardRead() {
  const tools = platformTools("read");
  let lastErr = "";
  for (const cmd of tools) {
    const r = await run(cmd);
    if (r.ok) return r.out;
    lastErr = r.err;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t) => t[0]).join(", ")}). ${lastErr}`);
}
var import_child_process4;
var init_clipboard = __esm({
  "src/lib/clipboard.ts"() {
    "use strict";
    import_child_process4 = require("child_process");
  }
});

// src/lib/constants.ts
var TIMING, CAPTCHA_GRID, THRESHOLDS, TIMEOUTS;
var init_constants = __esm({
  "src/lib/constants.ts"() {
    "use strict";
    TIMING = {
      /** Mouse move settle delay */
      MOUSE_MOVE: [50, 200],
      /** Click down→up delay */
      CLICK_HOLD: [30, 90],
      /** Post-click settle */
      POST_CLICK: [100, 300],
      /** Per-character typing delay */
      CHAR_DELAY: [30, 150],
      /** Occasional word-boundary pause */
      WORD_PAUSE: [200, 500],
      /** Pre-action move range */
      IDLE_MOUSE_X: [100, 400],
      IDLE_MOUSE_Y: [100, 300],
      /** Pre-checkbox random move */
      PRE_CHECKBOX_X: [200, 600],
      PRE_CHECKBOX_Y: [150, 400],
      /** Pause after moving to checkbox area */
      PRE_CHECKBOX_WAIT: [300, 800],
      /** Wait after clicking reCAPTCHA checkbox */
      POST_CHECKBOX_WAIT: 2500,
      /** Wait after clicking verify button */
      POST_VERIFY_WAIT: 2e3,
      /** Wait between clicking captcha tiles */
      TILE_CLICK_DELAY: [200, 500],
      /** Time to wait for reCAPTCHA tile images to settle */
      TILE_SETTLE: 800,
      /** Delay before captcha auto-detection */
      CAPTCHA_DETECT_WAIT: 1500,
      /** Post-login navigation settle */
      POST_LOGIN_WAIT: 1500,
      /** Post-submit form delay */
      POST_SUBMIT_WAIT: 500,
      /** Post-submit form extended wait */
      POST_SUBMIT_EXTENDED: 2e3,
      /** Delay before navigating (human hesitation) */
      PRE_NAVIGATE: [300, 700],
      /** Per-digit input delay base */
      DIGIT_DELAY_BASE: 80,
      DIGIT_DELAY_RANGE: 120,
      /** Post-click in forms */
      POST_FORM_CLICK: 200,
      /** Post-TOTP entry wait */
      POST_TOTP_WAIT: 300,
      /** Post-cookies inject wait */
      POST_COOKIES_WAIT: 300,
      /** Scroll step delay */
      SCROLL_DELAY: 150,
      /** Stale state check interval */
      STALE_CHECK_INTERVAL: 2e3,
      /** captureApi: grace period after the last step for a submit's XHR to fire */
      CAPTURE_SETTLE: 300,
      /** captureApi: max wait for in-flight requests to answer before stopping */
      CAPTURE_PENDING_MAX: 3e3,
      /** Post-failure probe ("does the selector exist right now?") budget */
      FAILURE_PROBE: 3e3
    };
    CAPTCHA_GRID = {
      /** Pixels from bframe top to grid start (reCAPTCHA) */
      RECAPTCHA_HEADER_HEIGHT: 112,
      /** Pixels from bframe top to grid start (hCaptcha) — slightly different */
      HCAPTCHA_HEADER_HEIGHT: 110,
      /** Default tile size when bframeBox is unavailable */
      DEFAULT_TILE_SIZE: 125,
      /** Grid padding (left+right total) */
      GRID_PADDING: 24,
      /** Grid left margin */
      GRID_MARGIN: 12,
      /** Verify button offset from bframe bottom */
      VERIFY_BTN_BOTTOM_OFFSET: 35,
      /** Verify button offset from bframe right */
      VERIFY_BTN_RIGHT_OFFSET: 60
    };
    THRESHOLDS = {
      /** Minimum character change to consider page "changed" */
      STALE_CHAR_CHANGE: 100,
      /** Minimum percentage change to consider page "changed" */
      STALE_PERCENT_CHANGE: 0.05,
      /** Minimum body text length to not be considered "empty" */
      MIN_BODY_TEXT: 200,
      /** Maximum response text length to capture */
      MAX_RESPONSE_TEXT: 1e5
    };
    TIMEOUTS = {
      DEFAULT_STALE: 2e4,
      NAVIGATION: 6e4,
      SELECTOR_WAIT: 1e4,
      // Actionability wait for click. Under the 20s stale timer on purpose, so
      // Playwright's own reason (not visible, covered by another element…) reaches
      // the agent instead of a generic "no state change".
      CLICK: 8e3,
      TOTP_INPUT: 5e3,
      API_REQUEST: 18e4,
      HEALTH_CHECK: 3e3,
      CHALLENGE_FRAME_WAIT: 5e3,
      // New-tab following: after a click, how long to wait for a just-opened tab's
      // 'page' event to arrive (only applies when no tab has registered yet), and
      // how long to let the followed tab reach domcontentloaded before continuing.
      TAB_FOLLOW_SETTLE: 400,
      TAB_LOAD: 15e3,
      // A new tab usually opens at about:blank then navigates to its real URL —
      // wait this long for that first real navigation before judging it blank.
      TAB_BLANK_RESOLVE: 3e3
    };
  }
});

// src/lib/browser/humanize.ts
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randRange(range) {
  return rand(range[0], range[1]);
}
function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function generatePath(fromX, fromY, toX, toY) {
  const steps = Math.floor(rand(25, 55));
  const points = [];
  const cx1 = fromX + (toX - fromX) * rand(0.1, 0.4) + rand(-50, 50);
  const cy1 = fromY + (toY - fromY) * rand(-0.2, 0.5) + rand(-50, 50);
  const cx2 = fromX + (toX - fromX) * rand(0.6, 0.9) + rand(-30, 30);
  const cy2 = fromY + (toY - fromY) * rand(0.5, 1.2) + rand(-30, 30);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let x = bezierPoint(eased, fromX, cx1, cx2, toX);
    let y = bezierPoint(eased, fromY, cy1, cy2, toY);
    const jitterScale = Math.sin(t * Math.PI) * 2;
    x += rand(-jitterScale, jitterScale);
    y += rand(-jitterScale, jitterScale);
    points.push({ x: Math.round(x), y: Math.round(y) });
  }
  points[points.length - 1] = { x: Math.round(toX), y: Math.round(toY) };
  return points;
}
async function humanMove(page, toX, toY) {
  const mouse = page.mouse;
  const lastPos = mousePositions.get(page);
  const fromX = lastPos?.x ?? randRange(TIMING.IDLE_MOUSE_X);
  const fromY = lastPos?.y ?? randRange(TIMING.IDLE_MOUSE_Y);
  const path15 = generatePath(fromX, fromY, toX, toY);
  for (const point of path15) {
    await mouse.move(point.x, point.y);
    await sleep4(rand(2, 12));
  }
  mousePositions.set(page, { x: toX, y: toY });
}
async function humanClick(page, selector) {
  const element = await page.waitForSelector(selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
  if (!element) throw new Error(`Element not found: ${selector}`);
  await element.scrollIntoViewIfNeeded().catch(() => {
  });
  const box = await element.boundingBox();
  if (!box) throw new Error(`Element not visible: ${selector}`);
  const targetX = box.x + box.width * rand(0.3, 0.7);
  const targetY = box.y + box.height * rand(0.3, 0.7);
  await humanMove(page, targetX, targetY);
  await sleep4(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep4(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep4(randRange(TIMING.POST_CLICK));
}
async function humanClickXY(page, x, y) {
  await humanMove(page, x, y);
  await sleep4(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep4(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep4(randRange(TIMING.POST_CLICK));
}
async function assertFocused(page, selector, clicked) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, active: "(target not found)" };
    const a = document.activeElement;
    const ok = !!a && (a === el || el.contains(a));
    const desc = a ? `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}` : "nothing";
    return { ok, active: desc };
  }, selector);
  if (!r.ok) {
    throw new Error(
      `human-type aborted: after ${clicked ? "clicking" : "skip-click on"} "${selector}", it is NOT focused (focus is on ${r.active}). Typing now would send keystrokes to the page, where single keys act as shortcuts \u2014 a real hazard. Fix the selector, or focus the field first and pass skipClick. No keys were sent.`
    );
  }
}
async function humanType(page, selector, text, opts = {}) {
  if (!opts.skipClick) {
    await humanClick(page, selector);
    await sleep4(randRange(TIMING.POST_CLICK));
  }
  await assertFocused(page, selector, !opts.skipClick);
  if (opts.clear) {
    const hadText = await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.select();
        return el.value.length > 0;
      }
      if (el?.isContentEditable) {
        window.getSelection()?.selectAllChildren(el);
        return (el.textContent || "").length > 0;
      }
      return false;
    });
    if (hadText) {
      await page.keyboard.press("Backspace");
      await sleep4(randRange(TIMING.CHAR_DELAY));
    }
  }
  const factor = SPEED_FACTOR[opts.speed || "normal"] ?? 1;
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep4(randRange(TIMING.CHAR_DELAY) * factor);
    if (Math.random() < 0.05) {
      await sleep4(randRange(TIMING.WORD_PAUSE) * factor);
    }
  }
}
async function humanScroll(page, deltaY) {
  const abs = Math.abs(deltaY);
  if (abs === 0) return;
  const dir = Math.sign(deltaY) || 1;
  const ticks = Math.max(3, Math.min(20, Math.round(abs / rand(80, 140))));
  let done = 0;
  for (let i = 0; i < ticks; i++) {
    const t = (i + 1) / ticks;
    const ease = Math.sin(t * Math.PI);
    let step = Math.round(abs / ticks * (0.6 + ease * 0.8) + rand(-8, 8));
    step = Math.max(10, step);
    if (done + step > abs) step = abs - done;
    await page.mouse.wheel(0, dir * step);
    done += step;
    await sleep4(rand(30, 90));
    if (Math.random() < 0.15) await sleep4(rand(120, 300));
    if (done >= abs) break;
  }
}
async function clickRecaptchaCheckbox(page) {
  const recaptchaFrame = await page.waitForSelector(
    'iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]',
    { timeout: TIMEOUTS.SELECTOR_WAIT }
  );
  if (!recaptchaFrame) throw new Error("reCAPTCHA iframe not found");
  const frame = await recaptchaFrame.contentFrame();
  if (!frame) throw new Error("Could not access reCAPTCHA iframe");
  await frame.waitForSelector(".recaptcha-checkbox-border, #recaptcha-anchor", { timeout: TIMEOUTS.SELECTOR_WAIT });
  const recaptchaBox = await recaptchaFrame.boundingBox();
  if (!recaptchaBox) throw new Error("reCAPTCHA iframe not visible");
  const checkboxX = recaptchaBox.x + rand(20, 35);
  const checkboxY = recaptchaBox.y + recaptchaBox.height * rand(0.35, 0.65);
  await humanMove(page, randRange(TIMING.PRE_CHECKBOX_X), randRange(TIMING.PRE_CHECKBOX_Y));
  await sleep4(randRange(TIMING.PRE_CHECKBOX_WAIT));
  await humanClickXY(page, checkboxX, checkboxY);
  await sleep4(TIMING.POST_CHECKBOX_WAIT);
  try {
    const checked = await frame.evaluate(() => {
      const anchor = document.querySelector("#recaptcha-anchor");
      return anchor && anchor.getAttribute("aria-checked") === "true";
    });
    if (checked) return { solved: true, challenge: false };
  } catch {
  }
  const challengeInfo = await getChallengeInfo(page);
  return { solved: false, challenge: true, challengeInfo };
}
async function getChallengeInfo(page) {
  const bframe = await page.waitForSelector(
    'iframe[title*="desafio reCAPTCHA"], iframe[title*="recaptcha challenge"], iframe[src*="recaptcha/api2/bframe"]',
    { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT }
  ).catch(() => null);
  if (!bframe) return null;
  const bframeBox = await bframe.boundingBox();
  if (!bframeBox) return null;
  const frame = await bframe.contentFrame();
  if (!frame) return null;
  const info = await frame.evaluate(() => {
    const promptEl = document.querySelector(".rc-imageselect-desc-wrapper, .rc-imageselect-instructions");
    const prompt2 = promptEl ? promptEl.innerText.trim() : "";
    const table = document.querySelector(
      "table.rc-imageselect-table, table.rc-imageselect-table-33, table.rc-imageselect-table-44"
    );
    let rows = 0, cols = 0;
    if (table) {
      const trs = table.querySelectorAll("tr");
      rows = trs.length;
      cols = trs[0] ? trs[0].querySelectorAll("td").length : 0;
    }
    const verifyBtn = document.querySelector("#recaptcha-verify-button");
    const verifyText = verifyBtn ? verifyBtn.innerText.trim() : "";
    return { prompt: prompt2, rows, cols, verifyText };
  }).catch(() => ({ prompt: "", rows: 0, cols: 0, verifyText: "" }));
  const gridStartX = bframeBox.x + CAPTCHA_GRID.GRID_MARGIN;
  const gridStartY = bframeBox.y + CAPTCHA_GRID.HCAPTCHA_HEADER_HEIGHT;
  const gridWidth = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;
  const gridHeight = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;
  const tileWidth = info.cols > 0 ? gridWidth / info.cols : 0;
  const tileHeight = info.rows > 0 ? gridHeight / info.rows : 0;
  const tiles = [];
  for (let r = 0; r < info.rows; r++) {
    for (let c = 0; c < info.cols; c++) {
      tiles.push({
        row: r,
        col: c,
        index: r * info.cols + c,
        centerX: Math.round(gridStartX + c * tileWidth + tileWidth / 2),
        centerY: Math.round(gridStartY + r * tileHeight + tileHeight / 2)
      });
    }
  }
  const verifyBtnY = bframeBox.y + bframeBox.height - CAPTCHA_GRID.VERIFY_BTN_BOTTOM_OFFSET;
  const verifyBtnX = bframeBox.x + bframeBox.width - CAPTCHA_GRID.VERIFY_BTN_RIGHT_OFFSET;
  return {
    prompt: info.prompt,
    rows: info.rows,
    cols: info.cols,
    tiles,
    verifyButton: { x: Math.round(verifyBtnX), y: Math.round(verifyBtnY) },
    bframeBox
  };
}
async function clickChallengeTiles(page, tileIndices) {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo || !challengeInfo.tiles.length) {
    throw new Error("No active reCAPTCHA challenge found");
  }
  const clicked = [];
  for (const idx of tileIndices) {
    const tile = challengeInfo.tiles.find((t) => t.index === idx);
    if (!tile) continue;
    await humanClickXY(page, tile.centerX, tile.centerY);
    await sleep4(randRange(TIMING.TILE_CLICK_DELAY));
    clicked.push(idx);
  }
  return { clicked, challengeInfo };
}
async function clickChallengeVerify(page) {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo) throw new Error("No active reCAPTCHA challenge found");
  await humanClickXY(page, challengeInfo.verifyButton.x, challengeInfo.verifyButton.y);
  await sleep4(TIMING.POST_VERIFY_WAIT);
  const anchorFrame = await page.waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]', { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT }).catch(() => null);
  if (anchorFrame) {
    const frame = await anchorFrame.contentFrame();
    if (frame) {
      try {
        const checked = await frame.evaluate(() => {
          const anchor = document.querySelector("#recaptcha-anchor");
          return anchor && anchor.getAttribute("aria-checked") === "true";
        });
        if (checked) return { solved: true };
      } catch {
      }
    }
  }
  const newInfo = await getChallengeInfo(page);
  return { solved: false, challengeInfo: newInfo };
}
function sleep4(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var mousePositions, SPEED_FACTOR;
var init_humanize = __esm({
  "src/lib/browser/humanize.ts"() {
    "use strict";
    init_constants();
    mousePositions = /* @__PURE__ */ new WeakMap();
    SPEED_FACTOR = { slow: 1.5, normal: 1, fast: 0.35 };
  }
});

// src/lib/budget.ts
function withBudget(p, ms, label = "page call") {
  p.catch(() => void 0);
  let timer;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new BudgetExceededError(label, ms)), ms);
      timer.unref?.();
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
var BudgetExceededError;
var init_budget = __esm({
  "src/lib/budget.ts"() {
    "use strict";
    BudgetExceededError = class extends Error {
      constructor(label, ms) {
        super(`${label} did not answer within ${ms}ms`);
        this.name = "BudgetExceededError";
      }
    };
  }
});

// src/lib/actions/resolve-selector.ts
function assertCssSelector(selector) {
  if (PLAYWRIGHT_ONLY.test(selector)) {
    throw new Error(
      `Unsupported selector "${selector}": Playwright text/role selectors (text=, :has-text(), :text-is(), >>) aren't supported. Locate the element by its text with a \`find\` step (e.g. { type: "find", text: "Texas" } or { role: "option", name: "Texas" }) and act on the @e ref it returns, in the same execute call.`
    );
  }
}
function resolveSelector(selector, ctx) {
  if (selector.startsWith("@a:")) {
    const name = selector.slice(3);
    const anchor = ctx.anchors?.get(name);
    if (!anchor) {
      const available = ctx.anchors ? Array.from(ctx.anchors.keys()).join(", ") : "";
      throw new Error(
        `Unknown anchor: @a:${name}${ctx.anchorDomain ? ` for ${ctx.anchorDomain}` : ""}. ${available ? `Known anchors: ${available}. ` : "This domain has no saved anchors yet. "}Run a snapshot/find to locate the element, act on it, then save it with the \`remember\` tool so future runs skip the search.`
      );
    }
    return anchor.selector;
  }
  if (selector.startsWith("@e")) {
    const ref = ctx.refMap.get(selector);
    if (!ref) {
      const available = Array.from(ctx.refMap.keys()).join(", ");
      throw new Error(`Unknown ref: ${selector}. ${available ? `Available refs: ${available}` : "No refs available \u2014 run a snapshot or annotated screenshot step first."}`);
    }
    return ref.selector;
  }
  assertCssSelector(selector);
  return selector;
}
function anchorNameOf(selector) {
  return typeof selector === "string" && selector.startsWith("@a:") ? selector.slice(3) : null;
}
var PLAYWRIGHT_ONLY;
var init_resolve_selector = __esm({
  "src/lib/actions/resolve-selector.ts"() {
    "use strict";
    PLAYWRIGHT_ONLY = /^\s*(text|xpath|role|id|data-testid|internal:[\w-]+)\s*=|:(has-text|text|text-is|text-matches|visible|nth-match|right-of|left-of|above|below|near)\b|\s>>\s/;
  }
});

// src/lib/reachability.ts
function isHoneypotReason(reason) {
  return !!reason && HONEYPOT_REASONS.has(reason);
}
function looksLikeBaitField(attrs) {
  const name = attrs.name || "";
  const id = attrs.id || "";
  if (HONEYPOT_NAME_RE.test(name) || HONEYPOT_NAME_RE.test(id)) return true;
  const textual = !attrs.type || /^(text|email|url|tel|search|number)$/i.test(attrs.type);
  if (textual && attrs.tabindex === "-1") return true;
  return false;
}
function honeypotRefusalMessage(selector, reason, name) {
  const what = name ? `"${name}" (${selector})` : selector;
  return `fill: refusing to fill ${what} \u2014 no human can reach this field (${reason}). It is almost certainly a honeypot: filling it marks the submission as a bot and the form fails with a generic error. Skip it. If you are certain it is a real field, retry with force: true.`;
}
async function probeField(page, selector) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const attrs = {
      name: el.getAttribute("name"),
      id: el.id || null,
      tabindex: el.getAttribute("tabindex"),
      type: el.getAttribute("type")
    };
    const tag = el.tagName.toLowerCase();
    {
      const r0 = el.getBoundingClientRect();
      const cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
      const dx = cx0 < 0 || cx0 >= window.innerWidth ? cx0 - window.innerWidth / 2 : 0;
      const dy = cy0 < 0 || cy0 >= window.innerHeight ? cy0 - window.innerHeight / 2 : 0;
      if (dx || dy) try {
        window.scrollBy(dx, dy);
      } catch {
      }
    }
    const rect = el.getBoundingClientRect();
    let reason = null;
    if (rect.width === 0 || rect.height === 0) reason = "zero-size";
    const style = getComputedStyle(el);
    if (!reason && (style.display === "none" || style.visibility === "hidden")) reason = "hidden";
    if (!reason) {
      let opacity = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const o = parseFloat(getComputedStyle(n).opacity);
        const animating = o < 1 && typeof n.getAnimations === "function" && n.getAnimations().length > 0;
        if (!isNaN(o) && !animating) opacity *= o;
      }
      if (opacity < 0.05) reason = "transparent";
    }
    if (!reason) {
      const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const left = rect.left + window.scrollX, right = rect.right + window.scrollX;
      const top = rect.top + window.scrollY, bottom = rect.bottom + window.scrollY;
      if (right <= 0 || left >= docW || bottom <= 0 || top >= docH) reason = "offscreen";
    }
    if (!reason) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const inViewport = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        const clipsX = /hidden|clip/.test(s.overflowX), clipsY = /hidden|clip/.test(s.overflowY);
        if (!clipsX && !clipsY) continue;
        const ar = a.getBoundingClientRect();
        const outside = clipsX && (cx < ar.left || cx > ar.right) || clipsY && (cy < ar.top || cy > ar.bottom);
        const tiny = clipsY && ar.height <= 2 || clipsX && ar.width <= 2;
        if (outside || tiny) {
          clipped = true;
          break;
        }
      }
      if (inViewport) {
        const hit = document.elementFromPoint(cx, cy);
        if (!(hit && (hit === el || el.contains(hit)))) reason = clipped ? "clipped" : "covered";
      } else if (clipped) {
        reason = "clipped";
      }
    }
    return { found: true, reason, attrs, tag };
  }, selector);
  if (!r.found) return { found: false, hiddenReason: null, suspiciousName: false };
  return {
    found: true,
    hiddenReason: r.reason ?? null,
    suspiciousName: looksLikeBaitField(r.attrs),
    tag: r.tag,
    name: r.attrs.name ?? void 0
  };
}
var HONEYPOT_REASONS, HONEYPOT_NAME_RE;
var init_reachability = __esm({
  "src/lib/reachability.ts"() {
    "use strict";
    HONEYPOT_REASONS = /* @__PURE__ */ new Set(["zero-size", "hidden", "transparent", "offscreen", "clipped"]);
    HONEYPOT_NAME_RE = /^(website|url|homepage|fax|honeypot|honey|hp|hp_[\w-]*|bot|bot_[\w-]*|trap|_gotcha|leave_?blank|do_?not_?fill)$/i;
  }
});

// src/lib/actions/handlers/navigation.ts
async function navigate(page, step, ctx, monitor) {
  const waitUntil = step.waitUntil || "domcontentloaded";
  const urlBefore = page.url();
  const onDialog = (d) => {
    (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => void 0);
  };
  page.on("dialog", onDialog);
  try {
    const nav = page.goto(step.url, { waitUntil, timeout: TIMEOUTS.NAVIGATION });
    nav.catch(() => void 0);
    let suspectTimer;
    const outcome = await Promise.race([
      nav.then(() => "done"),
      new Promise((r) => {
        suspectTimer = setTimeout(() => r("slow"), NAV_COMMIT_SUSPECT_MS);
      })
    ]).finally(() => clearTimeout(suspectTimer));
    if (outcome === "slow") {
      if (page.url() !== urlBefore) {
        await nav;
      } else {
        log7.warn(`navigate: no commit after ${NAV_COMMIT_SUSPECT_MS}ms, falling back to location.assign`);
        monitor?.reportActivity();
        await withBudget(page.evaluate((u) => {
          location.assign(u);
        }, step.url), 3e3, "location.assign").catch(() => void 0);
        try {
          await page.waitForURL((u) => u.toString() !== urlBefore, { timeout: 15e3, waitUntil });
        } catch {
          throw new Error(
            `navigate: the page never left ${urlBefore} for ${step.url} (tried a normal navigation, then location.assign). The site is blocking the route change. Use a click on the site's own link to get there.`
          );
        }
      }
    }
  } finally {
    page.off("dialog", onDialog);
  }
  try {
    await page.evaluate(STEALTH_SCRIPT);
  } catch (err) {
    log7.warn(`stealth injection failed: ${err}`);
  }
  if (ctx.sessionData) {
    try {
      await injectStorage(page, ctx.sessionData);
    } catch (err) {
      log7.warn(`storage injection after navigate failed: ${err}`);
    }
  }
}
async function click(page, step, ctx) {
  await page.click(resolveSelector(step.selector, ctx), { timeout: TIMEOUTS.CLICK });
}
async function isCombobox(page, selector) {
  return withBudget(
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const role = el.getAttribute("role");
      return role === "combobox" || el.hasAttribute("aria-autocomplete") || el.getAttribute("aria-haspopup") === "listbox" || el.hasAttribute("list") || !!el.closest('[role="combobox"]');
    }, selector),
    3e3
  ).catch(() => false);
}
async function fill(page, step, ctx) {
  const selector = resolveSelector(step.selector, ctx);
  const value = step.value;
  if (!step.force) {
    let probe = null;
    try {
      probe = await probeField(page, selector);
    } catch {
      probe = null;
    }
    if (probe?.found && isHoneypotReason(probe.hiddenReason)) {
      throw new Error(honeypotRefusalMessage(step.selector, probe.hiddenReason, probe.name));
    }
  }
  const combobox = await isCombobox(page, selector);
  await page.fill(selector, value);
  const stuck = await page.evaluate(
    ({ sel, val, keepFocus }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      try {
        el.focus();
      } catch {
      }
      try {
        setter ? setter.call(el, val) : el.value = val;
      } catch {
        el.value = val;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (!keepFocus) {
        try {
          el.blur();
        } catch {
        }
      }
      return el.value === val;
    },
    { sel: selector, val: value, keepFocus: combobox }
  );
  if (!stuck) {
    const loc = page.locator(selector);
    try {
      await loc.click();
      await loc.fill("");
      await loc.pressSequentially(value, { delay: 15 });
      if (!combobox) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          el?.blur?.();
        }, selector);
      }
    } catch {
    }
  }
}
async function humanClickStep(page, step, ctx) {
  if (step.selector) {
    await humanClick(page, resolveSelector(step.selector, ctx));
  } else if (step.x !== void 0 && step.y !== void 0) {
    await humanClickXY(page, step.x, step.y);
  } else {
    throw new Error("human-click requires selector or x/y coordinates");
  }
}
async function rightClick(page, step, ctx) {
  if (step.selector) {
    await page.click(resolveSelector(step.selector, ctx), { button: "right" });
  } else if (step.x !== void 0 && step.y !== void 0) {
    await page.mouse.click(step.x, step.y, { button: "right" });
  } else {
    throw new Error("right-click requires selector or x/y coordinates");
  }
}
async function humanTypeStep(page, step, ctx) {
  await humanType(page, resolveSelector(step.selector, ctx), step.value, { skipClick: step.skipClick, speed: step.speed, clear: step.clear });
}
async function selectOption(page, step, ctx) {
  const selector = resolveSelector(step.selector, ctx);
  await page.selectOption(selector, step.value);
}
async function evaluate(page, step) {
  return page.evaluate(step.expression);
}
async function extract(page, step) {
  return page.evaluate(step.expression);
}
async function wait(page, step) {
  await page.waitForTimeout(step.ms);
}
async function waitFor(page, step, ctx) {
  await page.waitForSelector(resolveSelector(step.selector, ctx), { timeout: step.timeout || TIMEOUTS.SELECTOR_WAIT });
}
async function scroll(page, step, ctx) {
  const selector = step.selector ? resolveSelector(step.selector, ctx) : null;
  if (step.human) {
    const dy = step.deltaY ?? 600;
    if (selector) {
      const el = await page.$(selector);
      const box = el ? await el.boundingBox() : null;
      if (box) await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
    }
    await humanScroll(page, dy);
    return;
  }
  await page.evaluate(
    ({ dy, sel }) => {
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`scroll: no element for selector ${sel}`);
        el.scrollBy(0, dy || el.scrollHeight);
      } else {
        window.scrollBy(0, dy || document.body.scrollHeight);
      }
    },
    { dy: step.deltaY ?? 0, sel: selector }
  );
}
async function selectAllInFocused(page) {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.select();
    } else if (el && el.isContentEditable) {
      const sel = window.getSelection();
      sel?.selectAllChildren(el);
    } else {
      window.getSelection()?.selectAllChildren(document.body);
    }
  });
}
async function keyboard(page, step, ctx) {
  if ((step.meta || step.ctrl) && step.key.toLowerCase() === "a" && !step.shift && !step.alt) {
    await selectAllInFocused(page);
    return;
  }
  if ((step.meta || step.ctrl) && ctx.driver === "extension") {
    throw new Error(
      `keyboard: ${step.meta ? "Cmd" : "Ctrl"}+${step.key} can't be sent in extension mode (the relay drops Cmd/Ctrl, so it would arrive as a plain "${step.key}"). Nothing was pressed. Instead: select-all \u2192 keyboard {key:"a", meta:true} (handled in-page); replace a field's text \u2192 fill, or human-type with clear:true; paste \u2192 the paste step.`
    );
  }
  const mods = [
    step.meta ? "Meta" : null,
    step.ctrl ? "Control" : null,
    step.shift ? "Shift" : null,
    step.alt ? "Alt" : null
  ].filter(Boolean);
  await page.keyboard.press(mods.length ? `${mods.join("+")}+${step.key}` : step.key);
}
async function read(page, step, ctx) {
  const selector = step.selector ? resolveSelector(step.selector, ctx) : "body";
  const raw = await page.evaluate((sel) => {
    const el = sel === "body" ? document.body : document.querySelector(sel);
    if (!el) return null;
    return el.innerText || el.textContent || "";
  }, selector);
  if (raw == null) throw new Error(`read: no element for selector ${selector}`);
  const text = raw.replace(/\n{3,}/g, "\n\n").trim();
  const max = step.maxChars || 6e3;
  return { text: text.slice(0, max), truncated: text.length > max };
}
async function upload(page, step, ctx) {
  if (!step.files || step.files.length === 0) throw new Error("upload: `files` must be a non-empty array of local paths");
  await page.setInputFiles(resolveSelector(step.selector, ctx), step.files);
  return { uploaded: step.files.length, files: step.files };
}
async function paste(page, step, ctx) {
  const text = await clipboardRead();
  if (step.selector) {
    await page.click(resolveSelector(step.selector, ctx));
  }
  await page.keyboard.insertText(text);
  return { pasted: text.length };
}
async function download(page, step) {
  if (!step.url) throw new Error("download: `url` is required");
  const resp = await page.request.get(step.url);
  const status = resp.status();
  if (!resp.ok()) throw new Error(`download: HTTP ${status} for ${step.url}`);
  const buf = await resp.body();
  const fs14 = await import("fs");
  const pathMod = await import("path");
  const { getDataDir: getDataDir2 } = await Promise.resolve().then(() => (init_paths(), paths_exports));
  let outPath;
  if (step.path && pathMod.isAbsolute(step.path)) {
    outPath = step.path;
  } else {
    let name = "download";
    try {
      name = decodeURIComponent(new URL(step.url).pathname.split("/").pop() || "") || "download";
    } catch {
    }
    outPath = pathMod.join(getDataDir2(), "downloads", step.path || name);
  }
  fs14.mkdirSync(pathMod.dirname(outPath), { recursive: true });
  fs14.writeFileSync(outPath, buf);
  return { path: outPath, size: buf.length, status };
}
async function typeCode(page, step, ctx) {
  const code = String(step.value || "");
  const selector = step.selector ? resolveSelector(step.selector, ctx) : 'input[type="tel"]';
  const firstInput = await page.waitForSelector(selector, { timeout: TIMEOUTS.TOTP_INPUT });
  if (!firstInput) throw new Error(`Input not found: ${selector}`);
  await firstInput.click();
  await page.waitForTimeout(TIMING.POST_FORM_CLICK);
  for (const digit of code) {
    await page.keyboard.press(digit);
    await page.waitForTimeout(TIMING.DIGIT_DELAY_BASE + Math.random() * TIMING.DIGIT_DELAY_RANGE);
  }
  return { typed: code.length };
}
var log7, NAV_COMMIT_SUSPECT_MS;
var init_navigation = __esm({
  "src/lib/actions/handlers/navigation.ts"() {
    "use strict";
    init_clipboard();
    init_stealth();
    init_humanize();
    init_persistence();
    init_logger();
    init_constants();
    init_budget();
    init_resolve_selector();
    init_reachability();
    log7 = createLogger("actions");
    NAV_COMMIT_SUSPECT_MS = 12e3;
  }
});

// src/lib/actions/handlers/find.ts
async function find(page, step, ctx) {
  if (!step.role && !step.name && !step.text && !step.placeholder && !step.label) {
    throw new Error("find requires at least one of: role, name, text, placeholder, label");
  }
  let locator;
  if (step.role) {
    const opts = {};
    if (step.name) opts.name = step.exact ? step.name : new RegExp(step.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (step.exact !== void 0) opts.exact = step.exact;
    locator = page.getByRole(step.role, opts);
  } else if (step.label) {
    locator = page.getByLabel(step.label, { exact: step.exact });
  } else if (step.placeholder) {
    locator = page.getByPlaceholder(step.placeholder, { exact: step.exact });
  } else if (step.text) {
    locator = page.getByText(step.text, { exact: step.exact });
  } else {
    locator = page.locator(`[aria-label="${step.name}"], [title="${step.name}"]`);
  }
  const count = await locator.count();
  if (count === 0) {
    throw new Error(`No element found matching: ${JSON.stringify({ role: step.role, name: step.name, text: step.text, placeholder: step.placeholder, label: step.label })}`);
  }
  const element = locator.first();
  const box = await element.boundingBox();
  const elInfo = await element.evaluate((el) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent?.trim() || "").slice(0, 60);
    const path15 = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path15.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      if (parent && current) {
        const currentTag = current.tagName;
        const siblings = Array.from(parent.children).filter((c) => c.tagName === currentTag);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      path15.unshift(seg);
      current = parent;
    }
    return { tag, text, selector: path15.join(" > ") };
  });
  const ref = `@e${ctx.nextRefId++}`;
  const displayRole = step.role || elInfo.tag;
  ctx.refMap.set(ref, {
    ref,
    role: displayRole,
    name: elInfo.text,
    selector: elInfo.selector
  });
  return {
    ref,
    role: displayRole,
    name: elInfo.text,
    tag: elInfo.tag,
    boundingBox: box,
    matchCount: count
  };
}
var init_find = __esm({
  "src/lib/actions/handlers/find.ts"() {
    "use strict";
  }
});

// src/lib/screenshot.ts
function saveScreenshot(buffer, filename, screenshotDir, publicUrl) {
  import_fs7.default.mkdirSync(screenshotDir, { recursive: true, mode: 448 });
  const ext = import_path8.default.extname(filename);
  const unique = `${import_path8.default.basename(filename, ext)}-${(0, import_crypto3.randomBytes)(8).toString("hex")}${ext}`;
  import_fs7.default.writeFileSync(import_path8.default.join(screenshotDir, unique), buffer, { mode: 384 });
  maybePrune(screenshotDir);
  return `${publicUrl}/screenshots/${unique}`;
}
function maybePrune(dir) {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_THROTTLE_MS) return;
  lastPruneAt = now;
  pruneScreenshots(dir);
}
function pruneScreenshots(dir, opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? MAX_AGE_MS;
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const now = opts.now ?? Date.now();
  try {
    const entries = import_fs7.default.readdirSync(dir).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png")).map((f) => {
      const full = import_path8.default.join(dir, f);
      try {
        return { full, mtimeMs: import_fs7.default.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
    let removed = 0;
    const survivors = [];
    for (const e of entries) {
      if (now - e.mtimeMs > maxAgeMs) {
        try {
          import_fs7.default.unlinkSync(e.full);
          removed++;
        } catch {
        }
      } else {
        survivors.push(e);
      }
    }
    if (survivors.length > maxFiles) {
      survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const e of survivors.slice(0, survivors.length - maxFiles)) {
        try {
          import_fs7.default.unlinkSync(e.full);
          removed++;
        } catch {
        }
      }
    }
    if (removed > 0) log8.debug(`pruned ${removed} old screenshot(s) from ${dir}`);
    return removed;
  } catch (err) {
    log8.warn(`screenshot prune failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
var import_crypto3, import_fs7, import_path8, log8, MAX_AGE_MS, MAX_FILES, PRUNE_THROTTLE_MS, lastPruneAt;
var init_screenshot = __esm({
  "src/lib/screenshot.ts"() {
    "use strict";
    import_crypto3 = require("crypto");
    import_fs7 = __toESM(require("fs"));
    import_path8 = __toESM(require("path"));
    init_logger();
    log8 = createLogger("screenshot");
    MAX_AGE_MS = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_AGE_MS || String(24 * 60 * 60 * 1e3), 10);
    MAX_FILES = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_FILES || "500", 10);
    PRUNE_THROTTLE_MS = 5 * 60 * 1e3;
    lastPruneAt = 0;
  }
});

// src/lib/snapshot.ts
async function takeSnapshot(page, ctx, options) {
  const interactiveOnly = options?.interactiveOnly ?? true;
  const maxElements = options?.maxElements ?? 80;
  ctx.refMap.clear();
  ctx.nextRefId = 1;
  const elements = await page.evaluate(({ interactiveOnly: interactiveOnly2, maxElements: maxElements2 }) => {
    const results = [];
    const interactiveTags = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = /* @__PURE__ */ new Set([
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "listbox",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "searchbox",
      "slider",
      "spinbutton",
      "switch",
      "tab",
      "treeitem"
    ]);
    function isInteractive(el) {
      if (interactiveTags.has(el.tagName)) return true;
      const role = el.getAttribute("role");
      if (role && interactiveRoles.has(role)) return true;
      if (el.hasAttribute("contenteditable")) return true;
      if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") return true;
      return false;
    }
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight + 200) return false;
      return true;
    }
    function isFillable(el) {
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") return true;
      if (el.tagName !== "INPUT") return false;
      const t = (el.type || "text").toLowerCase();
      return !["button", "submit", "reset", "image", "checkbox", "radio", "file", "hidden", "range", "color"].includes(t);
    }
    function unreachableReason(el) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      let opacity = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const o = parseFloat(n === el ? style.opacity : getComputedStyle(n).opacity);
        const animating = o < 1 && typeof n.getAnimations === "function" && n.getAnimations().length > 0;
        if (!isNaN(o) && !animating) opacity *= o;
      }
      if (opacity < 0.05) return "transparent";
      const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const left = rect.left + window.scrollX, right = rect.right + window.scrollX;
      const top = rect.top + window.scrollY, bottom = rect.bottom + window.scrollY;
      if (right <= 0 || left >= docW || bottom <= 0 || top >= docH) return "offscreen";
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        const clipsX = /hidden|clip/.test(s.overflowX), clipsY = /hidden|clip/.test(s.overflowY);
        if (!clipsX && !clipsY) continue;
        const ar = a.getBoundingClientRect();
        const outside = clipsX && (cx < ar.left || cx > ar.right) || clipsY && (cy < ar.top || cy > ar.bottom);
        const tiny = clipsY && ar.height <= 2 || clipsX && ar.width <= 2;
        if (tiny) return "clipped";
        if (outside) clipped = true;
      }
      const inViewport = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
      if (inViewport) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && (hit === el || el.contains(hit))) return null;
        return clipped ? "clipped" : null;
      }
      return null;
    }
    const baitName = /^(website|url|homepage|fax|honeypot|honey|hp|hp_[\w-]*|bot|bot_[\w-]*|trap|_gotcha|leave_?blank|do_?not_?fill)$/i;
    function looksLikeBait(el) {
      const name = el.getAttribute("name") || "", id = el.id || "";
      if (baitName.test(name) || baitName.test(id)) return true;
      const type = (el.getAttribute("type") || "text").toLowerCase();
      const textual = /^(text|email|url|tel|search|number)$/.test(type);
      return textual && el.getAttribute("tabindex") === "-1";
    }
    function buildSelector(el) {
      const path15 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path15.unshift(`#${current.id}`);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const currentTag = current.tagName;
          const siblings = Array.from(parent.children).filter((c) => c.tagName === currentTag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        path15.unshift(seg);
        current = parent;
      }
      return path15.join(" > ");
    }
    function getName(el) {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() || "";
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder) return el.placeholder.trim();
      }
      const text2 = el.textContent?.trim() || "";
      return text2.slice(0, 60);
    }
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= maxElements2) break;
      if (interactiveOnly2 && !isInteractive(el)) continue;
      if (!isVisible(el)) continue;
      let suspect;
      if (isFillable(el)) {
        if (unreachableReason(el)) continue;
        if (looksLikeBait(el)) suspect = "honeypot?";
      }
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";
      const type = el.type || "";
      results.push({
        tag,
        role,
        name: getName(el),
        type,
        placeholder: el.placeholder || "",
        checked: el.checked || false,
        disabled: el.disabled || false,
        selector: buildSelector(el),
        isVisible: true,
        suspect
      });
    }
    return results;
  }, { interactiveOnly, maxElements });
  const nodes = [];
  for (const el of elements) {
    const ref = `@e${ctx.nextRefId++}`;
    let displayRole = el.role || el.tag;
    if (el.tag === "input") {
      displayRole = el.type === "password" ? "password" : el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : "input";
    } else if (el.tag === "textarea") {
      displayRole = "textarea";
    } else if (el.tag === "select") {
      displayRole = "select";
    } else if (el.tag === "a") {
      displayRole = "link";
    }
    const state = [];
    if (el.disabled) state.push("disabled");
    if (el.checked) state.push("checked");
    if (el.suspect) state.push(el.suspect);
    let description = "";
    if (el.placeholder && el.name !== el.placeholder) description = `placeholder="${el.placeholder}"`;
    if (el.type && !["text", "submit", "button", ""].includes(el.type)) {
      description = description ? `${description} type=${el.type}` : `type=${el.type}`;
    }
    const node = {
      ref,
      role: displayRole,
      name: el.name,
      tag: el.tag,
      selector: el.selector,
      state,
      description
    };
    nodes.push(node);
    ctx.refMap.set(ref, {
      ref,
      role: displayRole,
      name: el.name,
      selector: el.selector,
      description
    });
  }
  const lines = [];
  for (const node of nodes) {
    let line = `${node.ref} ${node.role}`;
    if (node.name) line += ` "${node.name}"`;
    if (node.state.length > 0) line += ` [${node.state.join(", ")}]`;
    if (node.description) line += ` (${node.description})`;
    lines.push(line);
  }
  const text = lines.join("\n");
  return { nodes, text };
}
var init_snapshot = __esm({
  "src/lib/snapshot.ts"() {
    "use strict";
  }
});

// src/lib/annotate.ts
async function annotatedScreenshot(page, ctx) {
  ctx.refMap.clear();
  ctx.nextRefId = 1;
  const elements = await page.evaluate(() => {
    const interactiveTags = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = /* @__PURE__ */ new Set([
      "button",
      "link",
      "textbox",
      "checkbox",
      "radio",
      "combobox",
      "menuitem",
      "option",
      "searchbox",
      "switch",
      "tab"
    ]);
    function isInteractive(el) {
      if (interactiveTags.has(el.tagName)) return true;
      const role = el.getAttribute("role");
      if (role && interactiveRoles.has(role)) return true;
      if (el.hasAttribute("contenteditable")) return true;
      if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") return true;
      return false;
    }
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      return true;
    }
    function buildSelector(el) {
      const path15 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path15.unshift(`#${current.id}`);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const currentTag = current.tagName;
          const siblings = Array.from(parent.children).filter((c) => c.tagName === currentTag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        path15.unshift(seg);
        current = parent;
      }
      return path15.join(" > ");
    }
    function getName(el) {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() || "";
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder) return el.placeholder.trim();
      }
      return (el.textContent?.trim() || "").slice(0, 60);
    }
    const results = [];
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= 50) break;
      if (!isInteractive(el)) continue;
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";
      results.push({
        tag,
        role: role || tag,
        name: getName(el),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        selector: buildSelector(el)
      });
    }
    return results;
  });
  const refs = [];
  for (const el of elements) {
    const ref = `@e${ctx.nextRefId++}`;
    const num = ctx.nextRefId - 1;
    let displayRole = el.role;
    if (el.tag === "a") displayRole = "link";
    if (el.tag === "input") displayRole = "input";
    if (el.tag === "textarea") displayRole = "textarea";
    if (el.tag === "select") displayRole = "select";
    refs.push({ ref, role: displayRole, name: el.name, x: el.x, y: el.y });
    ctx.refMap.set(ref, {
      ref,
      role: displayRole,
      name: el.name,
      selector: el.selector
    });
  }
  await page.evaluate((annotations) => {
    const container = document.createElement("div");
    container.id = "__iframer_annotations__";
    container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;";
    for (const { num, x, y } of annotations) {
      const badge = document.createElement("div");
      badge.style.cssText = `
        position:absolute;
        left:${x - 10}px;
        top:${y - 10}px;
        width:20px;
        height:20px;
        border-radius:50%;
        background:#ff6d00;
        color:#fff;
        font:bold 11px/20px sans-serif;
        text-align:center;
        box-shadow:0 1px 3px rgba(0,0,0,0.5);
      `;
      badge.textContent = String(num);
      container.appendChild(badge);
    }
    document.body.appendChild(container);
  }, refs.map((r, i) => ({ num: i + 1, x: r.x, y: r.y })));
  const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
  const screenshotUrl = saveScreenshot(buf, `annotated-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
  await page.evaluate(() => {
    const el = document.getElementById("__iframer_annotations__");
    if (el) el.remove();
  });
  return { screenshotUrl, refs };
}
var init_annotate = __esm({
  "src/lib/annotate.ts"() {
    "use strict";
    init_screenshot();
  }
});

// src/lib/actions/handlers/screenshot.ts
async function screenshot(page, step, ctx) {
  if (step.annotate) {
    const annotated = await annotatedScreenshot(page, ctx);
    const refLines = annotated.refs.map((r) => `  ${r.ref} ${r.role} "${r.name}"`).join("\n");
    return { screenshotUrl: annotated.screenshotUrl, refs: refLines };
  }
  const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
  const url = saveScreenshot(buf, `step-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
  return { screenshotUrl: url };
}
async function snapshot(page, step, ctx) {
  const snap = await takeSnapshot(page, ctx, {
    interactiveOnly: step.interactiveOnly,
    maxElements: step.maxElements
  });
  return { elementCount: snap.nodes.length, snapshot: snap.text };
}
var init_screenshot2 = __esm({
  "src/lib/actions/handlers/screenshot.ts"() {
    "use strict";
    init_screenshot();
    init_snapshot();
    init_annotate();
  }
});

// src/lib/captcha/vision.ts
function getCaptchaClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set \u2014 required for captcha auto-solve");
  return new import_sdk.default({ apiKey });
}
function toCaptchaApiError(err) {
  if (err instanceof import_sdk.default.APIConnectionError) {
    const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
    return new CaptchaApiError(`Claude API call failed (no response): ${err.message}${cause}`);
  }
  if (err instanceof import_sdk.default.APIError) {
    const body = err.error;
    return new CaptchaApiError(`Claude API call failed (${err.status ?? "no response"}): ${body?.error?.message ?? err.message}`);
  }
  return new CaptchaApiError(`Claude API call failed: ${err instanceof Error ? err.message : String(err)}`);
}
async function askVision(client, params) {
  try {
    const response = await client.messages.create({ ...params, model: CAPTCHA_MODEL });
    return response.content.flatMap((b) => b.type === "text" ? [b.text] : []).join("\n").trim();
  } catch (err) {
    throw toCaptchaApiError(err);
  }
}
function parseChallengeAnswer(text, width, height) {
  const candidates = text.match(/\{[^{}]*\}/g);
  if (!candidates) return null;
  const toPoint = (p) => {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (typeof x !== "number" || typeof y !== "number") return null;
    return x >= 0 && y >= 0 && x <= width && y <= height ? { x, y } : null;
  };
  for (const raw of candidates.reverse()) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (Array.isArray(parsed.drag)) {
      if (parsed.drag.length !== 2) return null;
      const from = toPoint(parsed.drag[0]);
      const to = toPoint(parsed.drag[1]);
      return from && to ? { drag: { from, to } } : null;
    }
    if (Array.isArray(parsed.clicks)) {
      if (parsed.clicks.length > MAX_CLICKS) return null;
      const clicks = parsed.clicks.map(toPoint);
      return clicks.every((c) => c !== null) ? { clicks } : null;
    }
  }
  return null;
}
var import_sdk, CAPTCHA_MODEL, CaptchaApiError, MAX_CLICKS;
var init_vision = __esm({
  "src/lib/captcha/vision.ts"() {
    "use strict";
    import_sdk = __toESM(require("@anthropic-ai/sdk"));
    CAPTCHA_MODEL = process.env.IFRAMER_CAPTCHA_MODEL || "claude-haiku-4-5-20251001";
    CaptchaApiError = class extends Error {
    };
    MAX_CLICKS = 12;
  }
});

// src/lib/captcha/recaptcha.ts
function extractTarget(prompt2) {
  const lines = prompt2.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/select all (images|squares) with/i.test(lines[i])) {
      const afterWith = lines[i].replace(/.*with\s*/i, "").trim();
      if (afterWith && afterWith.length > 1 && !/click/i.test(afterWith)) {
        return afterWith.replace(/^a\s+/i, "").trim();
      }
      if (i + 1 < lines.length && !/click/i.test(lines[i + 1])) {
        return lines[i + 1].replace(/^a\s+/i, "").trim();
      }
    }
  }
  return lines[1] || prompt2;
}
async function screenshotFullGrid(page, challengeInfo) {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox || rows === 0 || cols === 0) return null;
  const gridClip = {
    x: bframeBox.x + 14,
    y: bframeBox.y + 112,
    width: bframeBox.width - 28,
    height: bframeBox.width - 28
  };
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 85, clip: gridClip });
    return buf.toString("base64");
  } catch (err) {
    log9.error(`full grid screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function screenshotTiles(page, challengeInfo) {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox) return [];
  const gridX = bframeBox.x + 14;
  const gridY = bframeBox.y + 112;
  const gridSize = bframeBox.width - 28;
  const tileW = gridSize / cols;
  const tileH = gridSize / rows;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clip = {
        x: gridX + c * tileW + 2,
        y: gridY + r * tileH + 2,
        width: tileW - 4,
        height: tileH - 4
      };
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 85, clip });
        tiles.push({ index: r * cols + c, imageBase64: buf.toString("base64") });
      } catch {
      }
    }
  }
  return tiles;
}
async function classifyTiles(client, fullGridBase64, tiles, target, rows, cols) {
  const results = await Promise.all(
    tiles.map(async (tile) => {
      const tileRow = Math.floor(tile.index / cols) + 1;
      const tileCol = tile.index % cols + 1;
      const answer = await askVision(client, {
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: fullGridBase64 }
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: tile.imageBase64 }
              },
              {
                type: "text",
                text: `Image 1 is a full picture divided into a ${rows}x${cols} grid. Image 2 is the tile at row ${tileRow}, column ${tileCol} of that grid.

Does this tile contain a ${target}? Reply ONLY "yes" or "no".`
              }
            ]
          }
        ]
      });
      const match = answer.toLowerCase().startsWith("yes");
      if (match) log9.debug(`tile ${tile.index} (r${tileRow}c${tileCol}): YES`);
      return { index: tile.index, match };
    })
  );
  return results.filter((r) => r.match).map((r) => r.index);
}
async function submitForm(page) {
  const selectors = [
    'form:has([data-sitekey]) [type="submit"]',
    'form:has(.g-recaptcha) [type="submit"]',
    'form:has(iframe[src*="recaptcha"]) [type="submit"]',
    'form [type="submit"]',
    'form button:not([type="button"]):not([type="reset"])',
    'input[type="submit"]',
    'button[type="submit"]'
  ];
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const visible = await el.isVisible();
        if (visible) {
          log9.info(`Submitting form via: ${selector}`);
          await new Promise((r) => setTimeout(r, 500));
          await humanClick(page, selector);
          await new Promise((r) => setTimeout(r, 2e3));
          return true;
        }
      }
    } catch {
    }
  }
  log9.info("No submit button found \u2014 skipping form submission");
  return false;
}
async function solveRecaptcha(page, monitor) {
  const startTime = Date.now();
  const client = getCaptchaClient();
  let rounds = 0;
  try {
    const checkboxResult = await clickRecaptchaCheckbox(page);
    if (checkboxResult.solved) {
      const submitted = await submitForm(page);
      return { solved: true, rounds: 0, durationMs: Date.now() - startTime, submitted };
    }
    if (!checkboxResult.challengeInfo) {
      return { solved: false, rounds: 0, durationMs: Date.now() - startTime, reason: "No challenge appeared after clicking checkbox" };
    }
    let challengeInfo = checkboxResult.challengeInfo;
    while (rounds < MAX_ROUNDS) {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Timeout exceeded" };
      }
      rounds++;
      monitor?.reportActivity();
      if (!challengeInfo) {
        return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Challenge info lost" };
      }
      const target = extractTarget(challengeInfo.prompt);
      log9.info(`Round ${rounds}: looking for "${target}" in ${challengeInfo.rows}x${challengeInfo.cols} grid`);
      const [fullGridImage, tileImages] = await Promise.all([
        screenshotFullGrid(page, challengeInfo),
        screenshotTiles(page, challengeInfo)
      ]);
      if (!fullGridImage || tileImages.length === 0) {
        return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
      }
      monitor?.reportActivity();
      const matchingIndices = await classifyTiles(
        client,
        fullGridImage,
        tileImages,
        target,
        challengeInfo.rows,
        challengeInfo.cols
      );
      log9.info(`Round ${rounds}: matched tiles [${matchingIndices.join(", ")}]`);
      monitor?.reportActivity();
      if (matchingIndices.length > 0) {
        await clickChallengeTiles(page, matchingIndices);
        const isDynamic = challengeInfo.prompt.toLowerCase().includes("none left");
        if (isDynamic) {
          await new Promise((r) => setTimeout(r, TILE_SETTLE_MS));
          const newInfo = await getChallengeInfo(page);
          if (newInfo) {
            const [newFullGrid, newTiles] = await Promise.all([
              screenshotFullGrid(page, newInfo),
              screenshotTiles(page, newInfo)
            ]);
            if (newFullGrid && newTiles.length > 0) {
              const replacedTiles = newTiles.filter((t) => matchingIndices.includes(t.index));
              if (replacedTiles.length > 0) {
                monitor?.reportActivity();
                const newMatches = await classifyTiles(
                  client,
                  newFullGrid,
                  replacedTiles,
                  target,
                  newInfo.rows,
                  newInfo.cols
                );
                if (newMatches.length > 0) {
                  log9.info(`Round ${rounds}: dynamic tiles matched [${newMatches.join(", ")}]`);
                  await clickChallengeTiles(page, newMatches);
                  await new Promise((r) => setTimeout(r, TILE_SETTLE_MS));
                }
              }
            }
          }
        }
      }
      const verifyResult = await clickChallengeVerify(page);
      monitor?.reportActivity();
      if (verifyResult.solved) {
        log9.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
        const submitted = await submitForm(page);
        return { solved: true, rounds, durationMs: Date.now() - startTime, submitted };
      }
      challengeInfo = verifyResult.challengeInfo || null;
      if (!challengeInfo) {
        return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Challenge disappeared after verify" };
      }
      log9.info(`Round ${rounds}: not solved, new challenge appeared`);
    }
    return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS}) exceeded` };
  } catch (err) {
    if (err instanceof CaptchaApiError) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: err.message };
    }
    throw err;
  }
}
var log9, MAX_ROUNDS, MAX_DURATION_MS, TILE_SETTLE_MS;
var init_recaptcha = __esm({
  "src/lib/captcha/recaptcha.ts"() {
    "use strict";
    init_humanize();
    init_constants();
    init_vision();
    init_logger();
    log9 = createLogger("captcha-solver");
    MAX_ROUNDS = 8;
    MAX_DURATION_MS = 45e3;
    TILE_SETTLE_MS = TIMING.TILE_SETTLE;
  }
});

// src/lib/captcha/hcaptcha.ts
function rand2(min, max) {
  return Math.random() * (max - min) + min;
}
function sleep5(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function hasToken(page, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  for (; ; ) {
    const found = await page.evaluate(
      () => Array.from(document.querySelectorAll('[name="h-captcha-response"]')).some(
        (el) => el.value.length > 0
      )
    ).catch(() => false);
    if (found || Date.now() >= deadline) return found;
    await sleep5(250);
  }
}
async function clickCheckbox(page) {
  const checkboxFrame = await page.waitForSelector(
    'iframe[src*="hcaptcha.com"], iframe[data-hcaptcha-widget-id], iframe[title*="hCaptcha"]',
    { timeout: 1e4 }
  ).catch(() => null);
  if (!checkboxFrame) throw new Error("hCaptcha checkbox iframe not found");
  const box = await checkboxFrame.boundingBox();
  if (!box) throw new Error("hCaptcha iframe not visible");
  await humanMove(page, rand2(200, 500), rand2(150, 400));
  await sleep5(rand2(300, 700));
  const cx = box.x + box.width * rand2(0.15, 0.35);
  const cy = box.y + box.height * rand2(0.3, 0.7);
  await humanClickXY(page, cx, cy);
  await sleep5(2500);
  return hasToken(page);
}
async function getChallenge(page) {
  const challengeFrame = await page.waitForSelector(CHALLENGE_FRAME, { timeout: 8e3 }).catch(() => null);
  if (!challengeFrame) return null;
  const frame = await challengeFrame.contentFrame();
  if (!frame) return null;
  const prompt2 = await frame.evaluate(() => {
    const el = document.querySelector(".prompt-text, .task-instructions, [class*='prompt'], [class*='task-description']");
    return el ? el.innerText.trim() : "";
  }).catch(() => "");
  if (!prompt2) return null;
  const target = await frame.$("canvas").catch(() => null) ?? challengeFrame;
  const box = await target.boundingBox();
  if (!box) return null;
  log10.info(`Round challenge: "${prompt2}" (${Math.round(box.width)}x${Math.round(box.height)})`);
  return { prompt: prompt2, target, box, frame };
}
async function askForAnswer(client, challenge) {
  const buf = await challenge.target.screenshot({ type: "jpeg", quality: 85, scale: "css" });
  const width = Math.round(challenge.box.width);
  const height = Math.round(challenge.box.height);
  const text = await askVision(client, {
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(buf).toString("base64") } },
        {
          type: "text",
          text: `This image is ${width}x${height} pixels. The task shown with it: "${challenge.prompt}".
Work out the answer, then end your reply with one line of JSON, using pixel coordinates in this image.
To click: {"clicks":[[x,y],[x,y]]}
To drag: {"drag":[[fromX,fromY],[toX,toY]]}
If you can't tell: {"clicks":[]}`
        }
      ]
    }]
  });
  const answer = parseChallengeAnswer(text, width, height);
  if (!answer) log10.warn(`no usable answer in model reply: "${text.slice(0, 120)}"`);
  return answer;
}
async function perform(page, challenge, answer) {
  const { x, y } = challenge.box;
  if ("drag" in answer) {
    await humanMove(page, x + answer.drag.from.x, y + answer.drag.from.y);
    await sleep5(rand2(100, 250));
    await page.mouse.down();
    await humanMove(page, x + answer.drag.to.x, y + answer.drag.to.y);
    await sleep5(rand2(100, 250));
    await page.mouse.up();
    return;
  }
  for (const click2 of answer.clicks) {
    await humanClickXY(page, x + click2.x, y + click2.y);
    await sleep5(rand2(150, 400));
  }
}
async function clickSubmit(page, challenge) {
  const button = await challenge.frame.$(".button-submit").catch(() => null);
  const box = button ? await button.boundingBox() : null;
  if (!box) throw new Error("hCaptcha submit button not found");
  await humanClickXY(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep5(2500);
}
async function solveHCaptcha(page, monitor) {
  const startTime = Date.now();
  const client = getCaptchaClient();
  const result = (solved, reason) => ({
    solved,
    rounds,
    durationMs: Date.now() - startTime,
    ...reason ? { reason } : {}
  });
  let rounds = 0;
  try {
    if (await clickCheckbox(page)) {
      log10.info("Solved on checkbox click (no challenge)");
      return result(true);
    }
    while (rounds < MAX_ROUNDS2) {
      if (Date.now() - startTime > MAX_DURATION_MS2) return result(false, "Timeout exceeded");
      rounds++;
      monitor?.reportActivity();
      const challenge = await getChallenge(page);
      if (!challenge) {
        if (await hasToken(page, 3e3)) return result(true);
        return result(false, "The challenge closed without a token");
      }
      await sleep5(1e3);
      const answer = await askForAnswer(client, challenge);
      monitor?.reportActivity();
      log10.info(`Round ${rounds}: ${answer ? JSON.stringify(answer) : "no answer"}`);
      if (answer) await perform(page, challenge, answer);
      await sleep5(rand2(500, 1e3));
      await clickSubmit(page, challenge);
      monitor?.reportActivity();
      if (await hasToken(page)) {
        log10.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
        return result(true);
      }
      log10.info(`Round ${rounds}: not solved, retrying`);
    }
    return result(false, `Max rounds (${MAX_ROUNDS2}) exceeded`);
  } catch (err) {
    if (err instanceof CaptchaApiError) return result(false, err.message);
    return result(false, err instanceof Error ? err.message : String(err));
  }
}
var log10, MAX_ROUNDS2, MAX_DURATION_MS2, CHALLENGE_FRAME;
var init_hcaptcha = __esm({
  "src/lib/captcha/hcaptcha.ts"() {
    "use strict";
    init_humanize();
    init_vision();
    init_logger();
    log10 = createLogger("hcaptcha-solver");
    MAX_ROUNDS2 = 8;
    MAX_DURATION_MS2 = 6e4;
    CHALLENGE_FRAME = 'iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]';
  }
});

// src/lib/actions/handlers/captcha.ts
async function screenshotTiles2(page, ci) {
  const tileSize = ci.bframeBox ? Math.round((ci.bframeBox.width - CAPTCHA_GRID.GRID_PADDING) / ci.cols) : CAPTCHA_GRID.DEFAULT_TILE_SIZE;
  const tiles = [];
  for (const tile of ci.tiles) {
    const clip = {
      x: tile.centerX - tileSize / 2,
      y: tile.centerY - tileSize / 2,
      width: tileSize,
      height: tileSize
    };
    try {
      const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
      tiles.push({ index: tile.index, image: tileBuf.toString("base64") });
    } catch {
      tiles.push({ index: tile.index, image: null });
    }
  }
  return tiles;
}
function recaptchaClick(page) {
  return clickRecaptchaCheckbox(page);
}
function recaptchaSelect(page, step) {
  return clickChallengeTiles(page, step.tiles);
}
function recaptchaVerify(page) {
  return clickChallengeVerify(page);
}
function recaptchaInfo(page) {
  return getChallengeInfo(page);
}
async function recaptchaSolve(page) {
  const solveResult = await clickRecaptchaCheckbox(page);
  if (solveResult.solved) return { solved: true };
  const ci = solveResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, prompt: "", tiles: [] };
}
async function recaptchaAnswer(page, step) {
  await clickChallengeTiles(page, step.tiles);
  const verifyResult = await clickChallengeVerify(page);
  if (verifyResult.solved) return { solved: true };
  const ci = verifyResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, tiles: [] };
}
async function solveCaptcha(page, _step, _ctx, monitor) {
  const startTime = Date.now();
  await page.waitForTimeout(TIMING.CAPTCHA_DETECT_WAIT);
  const widget = await page.waitForSelector(
    'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"], iframe[title*="reCAPTCHA"], iframe[src*="hcaptcha.com"], iframe[title*="hCaptcha"]',
    { timeout: 5e3 }
  ).catch(() => null);
  if (!widget) {
    return { solved: false, noCaptcha: true, rounds: 0, durationMs: Date.now() - startTime, reason: "No captcha on this page" };
  }
  const isHCaptcha = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    return iframes.some((f) => {
      const src = f.src || "";
      const title = (f.title || "").toLowerCase();
      return src.includes("hcaptcha.com") || title.includes("hcaptcha") || !!document.querySelector("[data-hcaptcha-widget-id]");
    });
  }).catch((err) => {
    log11.warn(`captcha detection failed: ${err}`);
    return false;
  });
  log11.info(`detected: ${isHCaptcha ? "hCaptcha" : "reCAPTCHA"}`);
  const result = isHCaptcha ? await solveHCaptcha(page, monitor) : await solveRecaptcha(page, monitor);
  if (!result.solved) {
    throw new Error(`Captcha not solved after ${result.rounds} round(s): ${result.reason ?? "unknown reason"}`);
  }
  return result;
}
var log11;
var init_captcha = __esm({
  "src/lib/actions/handlers/captcha.ts"() {
    "use strict";
    init_humanize();
    init_recaptcha();
    init_hcaptcha();
    init_logger();
    init_constants();
    log11 = createLogger("actions");
  }
});

// src/lib/browser/form-fill.ts
function applyNativeValue(el, val) {
  const input = el;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, val);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
function humanDelay(page) {
  return page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
}
async function setValueNative(handle, value) {
  await handle.evaluate(applyNativeValue, value);
}
async function fillHandleNative(page, handle, value, opts = {}) {
  await handle.scrollIntoViewIfNeeded().catch(() => {
  });
  await handle.click({ delay: 40 }).catch(() => {
  });
  await handle.evaluate(applyNativeValue, value);
  if (opts.delay !== false) await humanDelay(page);
}
async function fillSelectorNative(page, selector, value) {
  await page.click(selector);
  await page.waitForTimeout(TIMING.SCROLL_DELAY);
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value]);
  await humanDelay(page);
}
async function findSubmitButton(page, opts) {
  const handle = await page.evaluateHandle(({ formAnchor, reSource, reFlags }) => {
    const re = new RegExp(reSource, reFlags);
    const pick = (scope) => {
      const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])');
      if (typed) return typed;
      const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'));
      return buttons.find((b) => re.test(b.textContent || "") && b.offsetParent !== null) || null;
    };
    const form = document.querySelector(formAnchor)?.closest("form");
    if (form) {
      const found = pick(form);
      if (found) return found;
    }
    return pick(document);
  }, opts);
  return handle.asElement();
}
var init_form_fill = __esm({
  "src/lib/browser/form-fill.ts"() {
    "use strict";
    init_constants();
  }
});

// src/lib/knowledge.ts
var knowledge_exports = {};
__export(knowledge_exports, {
  clearKnowledge: () => clearKnowledge,
  domainLookupChain: () => domainLookupChain,
  getKnowledgeDir: () => getKnowledgeDir,
  getKnowledgePath: () => getKnowledgePath,
  listKnowledge: () => listKnowledge,
  mergeKnowledge: () => mergeKnowledge,
  normalizeDomain: () => normalizeDomain,
  parseKnowledge: () => parseKnowledge,
  readKnowledge: () => readKnowledge,
  sanitizeDomain: () => sanitizeDomain
});
function getKnowledgeDir() {
  return import_path9.default.join(getDataDir(), "knowledge");
}
function getKnowledgePath(domain) {
  const safe = sanitizeDomain(domain);
  return import_path9.default.join(getKnowledgeDir(), `${safe}.md`);
}
function normalizeDomain(input) {
  let d = (input || "").trim().toLowerCase();
  if (!d) return "";
  try {
    if (d.includes("://")) {
      d = new URL(d).hostname;
    } else if (d.includes("/")) {
      d = new URL(`https://${d}`).hostname;
    }
  } catch {
  }
  d = d.replace(/:\d+$/, "");
  d = d.replace(/^www\./, "");
  return d;
}
function domainLookupChain(input) {
  const normalized = normalizeDomain(input);
  if (!normalized) return [];
  const chain = [normalized];
  const parts = normalized.split(".");
  while (parts.length > 2) {
    parts.shift();
    chain.push(parts.join("."));
  }
  return chain;
}
function sanitizeDomain(input) {
  const normalized = normalizeDomain(input);
  return normalized.replace(/[^a-z0-9.-]/g, "_");
}
function ensureDir() {
  import_fs8.default.mkdirSync(getKnowledgeDir(), { recursive: true });
}
function readKnowledge(domain) {
  const p = getKnowledgePath(domain);
  try {
    return import_fs8.default.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function parseKnowledge(domain) {
  const raw = readKnowledge(domain);
  if (!raw) return null;
  return parseMarkdown(raw);
}
function listKnowledge() {
  const dir = getKnowledgeDir();
  let entries = [];
  try {
    entries = import_fs8.default.readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const full = import_path9.default.join(dir, file);
    try {
      const stat = import_fs8.default.statSync(full);
      const raw = import_fs8.default.readFileSync(full, "utf8");
      const parsed = parseMarkdown(raw);
      results.push({
        domain: parsed?.domain ?? file.replace(/\.md$/, ""),
        lastVerified: parsed?.lastVerified ?? new Date(stat.mtimeMs).toISOString(),
        lastMode: parsed?.lastMode ?? "unknown",
        sizeBytes: stat.size
      });
    } catch {
    }
  }
  results.sort((a, b) => a.lastVerified < b.lastVerified ? 1 : -1);
  return results;
}
function clearKnowledge(domain) {
  const dir = getKnowledgeDir();
  if (domain) {
    const p = getKnowledgePath(domain);
    try {
      import_fs8.default.unlinkSync(p);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  let removed = 0;
  try {
    const entries = import_fs8.default.readdirSync(dir);
    for (const f of entries) {
      if (f.endsWith(".md")) {
        try {
          import_fs8.default.unlinkSync(import_path9.default.join(dir, f));
          removed++;
        } catch {
        }
      }
    }
  } catch {
  }
  return { removed };
}
function mergeKnowledge(domain, updates) {
  ensureDir();
  const existing = parseKnowledge(domain);
  const merged = {
    domain: sanitizeDomain(domain),
    lastVerified: updates.lastVerified ?? (/* @__PURE__ */ new Date()).toISOString(),
    lastMode: updates.lastMode ?? existing?.lastMode ?? "unknown",
    browserRequired: updates.browserRequired ?? existing?.browserRequired ?? true,
    auth: updates.auth ?? existing?.auth ?? { type: "unknown" },
    endpoints: dedupeEndpoints([...existing?.endpoints ?? [], ...updates.endpoints ?? []]),
    notes: dedupeNotes([...existing?.notes ?? [], ...updates.notes ?? []])
  };
  const md = renderMarkdown(merged);
  import_fs8.default.writeFileSync(getKnowledgePath(domain), md, "utf8");
  log12.info(`knowledge updated: ${merged.domain} (${merged.endpoints.length} endpoints)`);
}
function dedupeEndpoints(endpoints) {
  const seen = /* @__PURE__ */ new Map();
  for (const ep of endpoints) {
    const key = `${ep.method.toUpperCase()} ${ep.path}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ep);
    } else {
      seen.set(key, {
        ...existing,
        description: ep.description || existing.description,
        example: ep.example || existing.example,
        firstSeen: existing.firstSeen || ep.firstSeen
      });
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
}
function dedupeNotes(notes) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const note of notes) {
    const n = note.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
function renderMarkdown(data) {
  const lines = [];
  lines.push("---");
  lines.push(`domain: ${data.domain}`);
  lines.push(`lastVerified: ${data.lastVerified}`);
  lines.push(`lastMode: ${data.lastMode}`);
  lines.push(`browserRequired: ${data.browserRequired}`);
  lines.push(`authType: ${data.auth.type}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${data.domain}`);
  lines.push("");
  lines.push(`Last verified: **${data.lastVerified}** via \`${data.lastMode}\` mode.`);
  lines.push("");
  lines.push("## Auth material");
  lines.push("");
  lines.push(`**Type:** ${data.auth.type}`);
  if (data.auth.cookieNames?.length) {
    lines.push(`**Required cookies:** ${data.auth.cookieNames.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.localStorageKeys?.length) {
    lines.push(`**localStorage keys:** ${data.auth.localStorageKeys.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.sessionStorageKeys?.length) {
    lines.push(`**sessionStorage keys:** ${data.auth.sessionStorageKeys.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.headers?.length) {
    lines.push(`**Request headers:** ${data.auth.headers.map((n) => `\`${n}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("> _Structure only \u2014 actual values are stored encrypted in the session store._");
  lines.push("");
  if (data.endpoints.length > 0) {
    lines.push("## Known endpoints");
    lines.push("");
    lines.push("The agent can call these directly (with the auth material above) instead of launching a browser.");
    lines.push("");
    for (const ep of data.endpoints) {
      lines.push(`### ${ep.method.toUpperCase()} ${ep.path}`);
      if (ep.description) lines.push("");
      if (ep.description) lines.push(ep.description);
      if (ep.example) {
        lines.push("");
        lines.push("```");
        lines.push(ep.example);
        lines.push("```");
      }
      lines.push("");
    }
  } else {
    lines.push("## Known endpoints");
    lines.push("");
    lines.push("_None captured yet. Enable `captureApi: true` on the next `execute` run to populate this section._");
    lines.push("");
  }
  if (data.notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    for (const n of data.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}
function parseMarkdown(raw) {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) return null;
  const fm = {};
  for (const line of frontmatterMatch[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
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
    for (const line of notesSection.split("\n")) {
      const m = line.match(/^-\s+(.+)$/);
      if (m) notes.push(m[1].trim());
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
  if (!match || match.index === void 0) return null;
  const start = match.index + match[0].length;
  const nextSection = body.slice(start).match(/^##\s+/m);
  const end = nextSection?.index != null ? start + nextSection.index : body.length;
  return body.slice(start, end);
}
function extractBackticks(re, text) {
  const m = text.match(re);
  if (!m) return void 0;
  const items = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  return items.length > 0 ? items : void 0;
}
var import_fs8, import_path9, log12;
var init_knowledge = __esm({
  "src/lib/knowledge.ts"() {
    "use strict";
    import_fs8 = __toESM(require("fs"));
    import_path9 = __toESM(require("path"));
    init_logger();
    init_paths();
    log12 = createLogger("knowledge");
  }
});

// src/lib/auth/credential-resolver.ts
async function resolveCredential(store, userId, token, domain) {
  const credKey = await deriveKey(token, "credentials");
  let blob = null;
  let matchedDomain = "";
  for (const candidate of domainLookupChain(domain)) {
    const b = await store.getCredential(userId, candidate);
    if (b && b.length > 0) {
      blob = b;
      matchedDomain = candidate;
      break;
    }
  }
  if (!blob) return null;
  try {
    const credential = JSON.parse(decrypt(blob, credKey));
    return { credential, matchedDomain };
  } catch (err) {
    throw new CredentialDecryptError(matchedDomain, err instanceof Error ? err.message : String(err));
  }
}
var CredentialDecryptError;
var init_credential_resolver = __esm({
  "src/lib/auth/credential-resolver.ts"() {
    "use strict";
    init_crypto();
    init_knowledge();
    CredentialDecryptError = class extends Error {
      constructor(domain, cause) {
        super(
          `Credentials for ${domain} exist in the store but cannot be decrypted (${cause}). This usually means the encryption key (~/.iframer/secret or IFRAMER_SECRET) changed since the row was written, orphaning the old blob. Fix: ask the user to re-store the credentials by running in their terminal:

  iframer-toolkit credentials add ${normalizeDomain(domain)}

After they confirm it ran, retry.`
        );
        this.domain = domain;
        this.cause = cause;
        this.name = "CredentialDecryptError";
      }
      domain;
      cause;
    };
  }
});

// src/lib/actions/handlers/login/selectors.ts
var EMAIL_CANDIDATES, PASSWORD_SELECTOR, OTP_SELECTOR, LOGIN_URL_RE, EMAIL_FIRST_SUBMIT_RE, PASSWORD_SUBMIT_RE, EMAIL_FORM_ANCHOR, PASSWORD_FORM_ANCHOR;
var init_selectors = __esm({
  "src/lib/actions/handlers/login/selectors.ts"() {
    "use strict";
    EMAIL_CANDIDATES = [
      'input[type="email"]:not([disabled]):not([readonly])',
      'input[autocomplete="username"]:not([disabled]):not([readonly])',
      'input[autocomplete="email"]:not([disabled]):not([readonly])',
      'input[name*="email" i]:not([disabled]):not([readonly])',
      'input[name*="user" i]:not([disabled]):not([readonly])',
      'input[name*="login" i]:not([disabled]):not([readonly])',
      'input[id*="email" i]:not([disabled]):not([readonly])',
      'input[id*="user" i]:not([disabled]):not([readonly])',
      'input[type="text"]:not([disabled]):not([readonly])',
      "input:not([type]):not([disabled]):not([readonly])"
    ];
    PASSWORD_SELECTOR = 'input[type="password"]:not([disabled]):not([readonly])';
    OTP_SELECTOR = 'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])';
    LOGIN_URL_RE = /\b(login|signin|sign-in|auth|oauth)\b/i;
    EMAIL_FIRST_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next|send.*code|email.*me)\b/i;
    PASSWORD_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;
    EMAIL_FORM_ANCHOR = 'input[type="email"], input[name*="email" i], input[type="text"]';
    PASSWORD_FORM_ANCHOR = PASSWORD_SELECTOR;
  }
});

// src/lib/actions/handlers/login/index.ts
async function login(page, step, ctx) {
  const resolved = await resolveCredential(ctx.store, ctx.userId, ctx.token, step.domain);
  if (!resolved) {
    const stored = await ctx.store.listCredentialDomains(ctx.userId);
    const storedList = stored.length > 0 ? stored.join(", ") : "(none)";
    throw new Error(
      `No credentials stored for ${normalizeDomain(step.domain)}. Stored domains: ${storedList}. If you stored credentials under a different domain name, retry the login step with that domain. If no credentials are stored at all, call the \`credentials\` tool with action=store first.`
    );
  }
  const { credential, matchedDomain } = resolved;
  if (matchedDomain !== normalizeDomain(step.domain)) {
    log13.info(`login: credentials for ${step.domain} resolved via parent domain ${matchedDomain}`);
  }
  const beforeUrl = page.url();
  const hasExplicitSelectors = !!(step.usernameSelector || step.passwordSelector || step.submitSelector);
  if (hasExplicitSelectors) {
    await runExplicitFlow(page, step, ctx, credential);
  } else {
    const early = await runAutoDetect(page, step, ctx, credential, beforeUrl);
    if (early) return early;
  }
  return honestSignal(page, beforeUrl);
}
async function runExplicitFlow(page, step, ctx, credential) {
  if (step.usernameSelector && credential.username) {
    await fillSelectorNative(page, resolveSelector(step.usernameSelector, ctx), credential.username);
  }
  if (step.passwordSelector && credential.password) {
    await fillSelectorNative(page, resolveSelector(step.passwordSelector, ctx), credential.password);
  }
  if (step.submitSelector) {
    await humanClick(page, resolveSelector(step.submitSelector, ctx));
    await page.waitForLoadState("domcontentloaded").catch(() => {
    });
    await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
  }
  if (step.totpSelector && credential.totp_secret) {
    const totp = generateTOTP(credential.totp_secret);
    await page.click(resolveSelector(step.totpSelector, ctx));
    await page.keyboard.type(totp, { delay: 50 });
    await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
  }
}
async function runAutoDetect(page, step, ctx, credential, beforeUrl) {
  log13.info(`login: auto-detecting form on ${beforeUrl}`);
  await page.waitForLoadState("domcontentloaded").catch(() => {
  });
  await page.waitForTimeout(500);
  const initialCheck = await page.evaluate((pwdSel) => {
    const pwd = document.querySelector(pwdSel);
    const pwdVisible = !!(pwd && pwd.offsetParent !== null);
    return { url: location.href, title: document.title, pwdVisible };
  }, PASSWORD_SELECTOR).catch(() => ({ url: page.url(), title: "", pwdVisible: false }));
  if (!initialCheck.pwdVisible && !LOGIN_URL_RE.test(initialCheck.url)) {
    log13.info(`login: already logged in (no password field, URL=${initialCheck.url})`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: initialCheck.url,
      reason: "Session already authenticated \u2014 no login form detected"
    };
  }
  const passwordHandle = await page.waitForSelector(PASSWORD_SELECTOR, { state: "visible", timeout: 5e3 }).catch(() => null);
  if (!passwordHandle) {
    return runNoPasswordBranch(page, step, ctx, credential, beforeUrl);
  }
  await runPasswordFlow(page, credential, beforeUrl, passwordHandle);
  await handleOtp(page, step, ctx, credential, beforeUrl);
  await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
  return null;
}
async function runNoPasswordBranch(page, step, ctx, credential, beforeUrl) {
  const currentUrl = page.url();
  if (!LOGIN_URL_RE.test(currentUrl)) {
    log13.info(`login: no password field and URL left login area (${currentUrl}) \u2014 treating as success`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: currentUrl,
      reason: "No login form detected after wait \u2014 assumed already authenticated"
    };
  }
  const emailOnlyHandle = await page.evaluateHandle((candidates) => {
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }, EMAIL_CANDIDATES);
  const emailOnlyEl = emailOnlyHandle.asElement();
  if (emailOnlyEl && credential.username) {
    return runEmailFirstFlow(page, credential, beforeUrl, emailOnlyEl);
  }
  const pageDiag = await page.evaluate(() => {
    const visibleText = (document.body?.innerText || "").slice(0, 500);
    const inputCount = document.querySelectorAll("input").length;
    const hiddenPassword = !!document.querySelector('input[type="password"]');
    const hasCaptcha = !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], [class*="captcha" i], [id*="captcha" i]');
    const hasCloudflare = !!document.querySelector('[class*="cf-" i], iframe[src*="challenges.cloudflare"]');
    return { title: document.title, visibleText, inputCount, hiddenPassword, hasCaptcha, hasCloudflare };
  }).catch(() => ({ title: "", visibleText: "", inputCount: 0, hiddenPassword: false, hasCaptcha: false, hasCloudflare: false }));
  log13.warn(`login: no visible password or email field on ${currentUrl} \u2014 title="${pageDiag.title}", inputs=${pageDiag.inputCount}`);
  const indicators = [];
  if (pageDiag.hasCaptcha) indicators.push("CAPTCHA detected");
  if (pageDiag.hasCloudflare) indicators.push("Cloudflare challenge");
  if (pageDiag.inputCount === 0) indicators.push("no input elements at all");
  if (pageDiag.hiddenPassword) indicators.push("password field exists but is hidden/disabled");
  const indicatorStr = indicators.length > 0 ? ` (${indicators.join(", ")})` : "";
  throw new Error(
    `login: no visible password or email field on ${currentUrl} after 5000ms${indicatorStr}. Page title: "${pageDiag.title}". The site may be showing a bot-detection wall, captcha, or an unsupported login flow. Retry with a stronger browser mode (binary-headful).`
  );
}
async function runEmailFirstFlow(page, credential, beforeUrl, emailEl) {
  const currentUrl = page.url();
  log13.info(`login: no password field but found email input \u2014 running email-first flow on ${currentUrl}`);
  await fillHandleNative(page, emailEl, credential.username);
  const submitEl = await findSubmitButton(page, {
    formAnchor: EMAIL_FORM_ANCHOR,
    reSource: EMAIL_FIRST_SUBMIT_RE.source,
    reFlags: EMAIL_FIRST_SUBMIT_RE.flags
  });
  if (submitEl) {
    await submitEl.scrollIntoViewIfNeeded().catch(() => {
    });
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el) => el.click());
    });
  } else {
    log13.warn("login: email-first flow, no submit button found \u2014 pressing Enter");
    await emailEl.press("Enter").catch(() => {
    });
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {
  });
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {
    }),
    page.waitForSelector('input[type="password"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
    page.waitForSelector('input[inputmode="numeric"]:not([disabled]), input[autocomplete="one-time-code"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null)
  ]);
  const laterPasswordHandle = await page.$(PASSWORD_SELECTOR);
  if (laterPasswordHandle && credential.password) {
    log13.info("login: password field appeared after email submit \u2014 filling it");
    await fillHandleNative(page, laterPasswordHandle, credential.password);
    const laterSubmit = await page.$('button[type="submit"]:not([disabled])');
    if (laterSubmit) {
      await laterSubmit.click({ delay: 40 }).catch(() => {
      });
    } else {
      await laterPasswordHandle.press("Enter").catch(() => {
      });
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {
    });
    await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {
    });
  }
  const afterUrl = page.url();
  const emailFlowDone = afterUrl !== beforeUrl;
  return {
    loggedIn: emailFlowDone,
    emailSubmitted: true,
    url: afterUrl,
    reason: emailFlowDone ? "Email-first flow completed \u2014 check for code/OTP prompt if login isn't complete." : "Email submitted, waiting for next step (code entry, password page, or redirect)."
  };
}
async function runPasswordFlow(page, credential, beforeUrl, passwordHandle) {
  const usernameHandle = await page.evaluateHandle((args2) => {
    const pwd = document.querySelector(args2.pwdSel);
    if (!pwd) return null;
    const scope = pwd.closest("form") || document;
    for (const sel of args2.candidates) {
      const el = scope.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }, { candidates: EMAIL_CANDIDATES, pwdSel: PASSWORD_SELECTOR });
  const usernameEl = usernameHandle.asElement();
  if (usernameEl && credential.username) {
    await fillHandleNative(page, usernameEl, credential.username);
  } else if (!usernameEl) {
    log13.warn("login: no username field detected, proceeding with password only");
  }
  if (credential.password) {
    await fillHandleNative(page, passwordHandle, credential.password);
  }
  const submitEl = await findSubmitButton(page, {
    formAnchor: PASSWORD_FORM_ANCHOR,
    reSource: PASSWORD_SUBMIT_RE.source,
    reFlags: PASSWORD_SUBMIT_RE.flags
  });
  if (submitEl) {
    await submitEl.scrollIntoViewIfNeeded().catch(() => {
    });
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el) => el.click());
    });
  } else {
    log13.warn("login: no submit button detected, pressing Enter in password field");
    await passwordHandle.press("Enter").catch(() => {
    });
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {
  });
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {
    }),
    page.waitForSelector(OTP_SELECTOR, { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null)
  ]);
}
async function handleOtp(page, step, ctx, credential, beforeUrl) {
  const totpHandle = await page.$(OTP_SELECTOR);
  if (!totpHandle) return;
  let code = null;
  if (credential.totp_secret) {
    code = generateTOTP(credential.totp_secret);
    log13.info(`login: generated TOTP from stored secret for ${step.domain}`);
  } else if (ctx.elicitOtp) {
    log13.info(`login: prompting user for OTP for ${step.domain}`);
    try {
      code = await ctx.elicitOtp(step.domain);
    } catch (err) {
      log13.warn(`login: OTP elicitation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!code) {
      throw new Error(`login: OTP required but user did not provide one for ${step.domain}`);
    }
  } else {
    throw new Error(`login: OTP field present but no TOTP secret stored and no elicitation callback available. Store a secret with \`credentials add ${step.domain} --totp-secret <secret>\` or use the MCP execute tool (which supports OTP elicitation).`);
  }
  await setValueNative(totpHandle, code);
  const totpSubmit = await page.$('button[type="submit"]:not([disabled])');
  if (totpSubmit) {
    await totpSubmit.click().catch(async () => {
      await totpSubmit.evaluate((el) => el.click());
    });
  }
  await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {
  });
}
async function honestSignal(page, beforeUrl) {
  const afterUrl = page.url();
  const stillHasPasswordField = await page.evaluate((pwdSel) => {
    const pwd = document.querySelector(pwdSel);
    return !!(pwd && pwd.offsetParent !== null);
  }, PASSWORD_SELECTOR).catch(() => false);
  const loggedIn = afterUrl !== beforeUrl && !stillHasPasswordField;
  return { loggedIn, url: afterUrl, changedUrl: afterUrl !== beforeUrl, passwordFieldRemains: stillHasPasswordField };
}
var log13;
var init_login = __esm({
  "src/lib/actions/handlers/login/index.ts"() {
    "use strict";
    init_humanize();
    init_form_fill();
    init_crypto();
    init_credential_resolver();
    init_knowledge();
    init_logger();
    init_constants();
    init_resolve_selector();
    init_selectors();
    log13 = createLogger("actions");
  }
});

// src/lib/actions/registry.ts
async function executeAction(page, step, ctx, monitor) {
  const start = Date.now();
  try {
    const handler = registry[step.type];
    const result = await handler(page, step, ctx, monitor);
    return { stepIndex: -1, step, ok: true, result, durationMs: Date.now() - start };
  } catch (err) {
    return failedStepResult(step, getErrorMessage(err), Date.now() - start);
  }
}
var registry, registeredStepTypes;
var init_registry2 = __esm({
  "src/lib/actions/registry.ts"() {
    "use strict";
    init_errors();
    init_types();
    init_navigation();
    init_find();
    init_screenshot2();
    init_captcha();
    init_login();
    registry = {
      navigate,
      click,
      fill,
      select: selectOption,
      "human-click": humanClickStep,
      "right-click": rightClick,
      "human-type": humanTypeStep,
      evaluate,
      extract,
      wait,
      "wait-for": waitFor,
      scroll,
      keyboard,
      read,
      upload,
      paste,
      download,
      "type-code": typeCode,
      find,
      screenshot,
      snapshot,
      login,
      "solve-captcha": solveCaptcha,
      "recaptcha-click": recaptchaClick,
      "recaptcha-select": recaptchaSelect,
      "recaptcha-verify": recaptchaVerify,
      "recaptcha-info": recaptchaInfo,
      "recaptcha-solve": recaptchaSolve,
      "recaptcha-answer": recaptchaAnswer
    };
    registeredStepTypes = Object.keys(registry);
  }
});

// src/lib/stale-monitor.ts
var DEFAULT_STALE_TIMEOUT_MS, PROBE_BUDGET_MS, UNRESPONSIVE_GRACE_MS, StaleStateMonitor, StaleStateError;
var init_stale_monitor = __esm({
  "src/lib/stale-monitor.ts"() {
    "use strict";
    init_constants();
    init_budget();
    DEFAULT_STALE_TIMEOUT_MS = 2e4;
    PROBE_BUDGET_MS = 3e3;
    UNRESPONSIVE_GRACE_MS = 8e3;
    StaleStateMonitor = class _StaleStateMonitor {
      page;
      timeoutMs;
      timer = null;
      lastActivity = Date.now();
      constructor(page, timeoutMs = DEFAULT_STALE_TIMEOUT_MS) {
        this.page = page;
        this.timeoutMs = timeoutMs;
      }
      async snapshot() {
        try {
          const url = this.page.url();
          let unresponsive = false;
          const state = await withBudget(
            this.page.evaluate(() => ({
              documentReadyState: document.readyState,
              bodyTextLength: document.body?.innerText?.length || 0,
              elementCount: document.querySelectorAll("*").length
            })),
            PROBE_BUDGET_MS,
            "state probe"
          ).catch((e) => {
            unresponsive = e instanceof BudgetExceededError;
            return { documentReadyState: "unknown", bodyTextLength: 0, elementCount: 0 };
          });
          return {
            url,
            ...state,
            unresponsive,
            timestamp: Date.now()
          };
        } catch {
          return {
            url: "unknown",
            documentReadyState: "unknown",
            bodyTextLength: 0,
            elementCount: 0,
            timestamp: Date.now()
          };
        }
      }
      static hasChanged(before, after) {
        if (before.url !== after.url) return true;
        if (before.documentReadyState !== after.documentReadyState) return true;
        const textDiff = Math.abs(after.bodyTextLength - before.bodyTextLength);
        if (textDiff > THRESHOLDS.STALE_CHAR_CHANGE || before.bodyTextLength > 0 && textDiff / before.bodyTextLength > THRESHOLDS.STALE_PERCENT_CHANGE) {
          return true;
        }
        const elemDiff = Math.abs(after.elementCount - before.elementCount);
        if (elemDiff > 10 || before.elementCount > 0 && elemDiff / before.elementCount > 0.05) {
          return true;
        }
        return false;
      }
      /**
       * Call this to report that something is happening (e.g., captcha solver making progress).
       * Resets the stale-state timer.
       */
      reportActivity() {
        this.lastActivity = Date.now();
      }
      /**
       * Run a function with stale-state monitoring.
       * If the function takes longer than timeoutMs with no state change and no activity reported,
       * the returned promise rejects with a StaleStateError.
       */
      async withMonitoring(fn) {
        this.lastActivity = Date.now();
        const beforeSnapshot = await this.snapshot();
        return new Promise((resolve, reject) => {
          let resolved = false;
          let checkInterval = null;
          let probing = false;
          let unresponsiveSince = null;
          const cleanup = () => {
            resolved = true;
            if (checkInterval) clearInterval(checkInterval);
            if (this.timer) clearTimeout(this.timer);
            this.timer = null;
          };
          checkInterval = setInterval(async () => {
            if (resolved || probing) return;
            const elapsed = Date.now() - this.lastActivity;
            if (elapsed < this.timeoutMs) return;
            probing = true;
            try {
              const currentSnapshot = await this.snapshot();
              if (resolved) return;
              if (currentSnapshot.unresponsive) {
                unresponsiveSince ??= Date.now();
                if (Date.now() - unresponsiveSince < UNRESPONSIVE_GRACE_MS) return;
                cleanup();
                reject(new StaleStateError(
                  `The tab stopped responding: its JavaScript did not answer for ${Math.round((Date.now() - unresponsiveSince) / 1e3)}s (a blocking dialog, a frozen re-render, or a navigation that never finished)`,
                  this.timeoutMs,
                  true
                ));
                return;
              }
              unresponsiveSince = null;
              if (_StaleStateMonitor.hasChanged(beforeSnapshot, currentSnapshot)) {
                this.lastActivity = Date.now();
                return;
              }
            } catch {
              this.lastActivity = Date.now();
              return;
            } finally {
              probing = false;
            }
            cleanup();
            reject(new StaleStateError(
              `No state change detected for ${this.timeoutMs}ms`,
              this.timeoutMs
            ));
          }, TIMING.STALE_CHECK_INTERVAL);
          fn().then((result) => {
            if (!resolved) {
              cleanup();
              resolve(result);
            }
          }).catch((err) => {
            if (!resolved) {
              cleanup();
              reject(err);
            }
          });
        });
      }
    };
    StaleStateError = class extends Error {
      timeoutMs;
      /** True when the page stopped answering at all (vs. answering but not changing). */
      unresponsive;
      constructor(message, timeoutMs, unresponsive = false) {
        super(message);
        this.name = "StaleStateError";
        this.timeoutMs = timeoutMs;
        this.unresponsive = unresponsive;
      }
    };
  }
});

// src/lib/captcha/detector.ts
var RecaptchaDetector, HCaptchaDetector, CookieConsentDetector, LoginWallDetector, defaultDetectors;
var init_detector = __esm({
  "src/lib/captcha/detector.ts"() {
    "use strict";
    RecaptchaDetector = class {
      async detect(page) {
        try {
          const active = await page.evaluate(
            () => [
              'iframe[src*="recaptcha/api2/anchor"], iframe[title*="reCAPTCHA"]',
              'iframe[src*="recaptcha/api2/bframe"]',
              '.g-recaptcha:not([data-size="invisible"]), [data-sitekey]:not([data-size="invisible"]):not(.h-captcha):not(.cf-turnstile)'
            ].some((sel) => {
              const el = document.querySelector(sel);
              if (!el) return false;
              const r = el.getBoundingClientRect();
              if (r.width < 20 || r.height < 20) return false;
              const s = getComputedStyle(el);
              return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
            })
          );
          if (active) return { type: "captcha", confidence: 0.95 };
        } catch {
        }
        return null;
      }
    };
    HCaptchaDetector = class {
      async detect(page) {
        try {
          const active = await page.evaluate(
            () => [
              'iframe[src*="hcaptcha.com"]',
              'iframe[title*="hCaptcha"]',
              "[data-hcaptcha-widget-id]",
              '.h-captcha:not([data-size="invisible"])'
            ].some((sel) => {
              const el = document.querySelector(sel);
              if (!el) return false;
              const r = el.getBoundingClientRect();
              if (r.width < 20 || r.height < 20) return false;
              const s = getComputedStyle(el);
              return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
            })
          );
          if (active) return { type: "hcaptcha", confidence: 0.95 };
        } catch {
        }
        return null;
      }
    };
    CookieConsentDetector = class {
      async detect(page) {
        try {
          const found = await page.evaluate(
            () => Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).some((el) => {
              const label = ((el.innerText || el.value || "") + "").trim().toLowerCase();
              if (!label || label.length > 32) return false;
              const kws = ["accept cookies", "accept all", "allow cookies", "i accept", "i agree", "agree"];
              if (!kws.some((kw) => label === kw || label.includes(kw) && kw.length / label.length >= 0.5)) return false;
              const r = el.getBoundingClientRect();
              if (r.width < 20 || r.height < 10) return false;
              const s = getComputedStyle(el);
              if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
              let n = el.parentElement;
              let depth = 0;
              while (n && depth < 8) {
                const cs = getComputedStyle(n);
                if (cs.position === "fixed" || cs.position === "sticky" || n.getAttribute("role") === "dialog" || n.getAttribute("aria-modal") === "true") return true;
                n = n.parentElement;
                depth++;
              }
              return false;
            })
          );
          if (found) {
            return { type: "cookie-consent", confidence: 0.8 };
          }
        } catch {
        }
        return null;
      }
    };
    LoginWallDetector = class {
      async detect(page) {
        try {
          const found = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector('input[type="password"]') && !!document.querySelector('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]');
            return hasLoginForm;
          });
          if (found) {
            return { type: "login-wall", confidence: 0.85, details: "Login form detected" };
          }
        } catch {
        }
        return null;
      }
    };
    defaultDetectors = [
      new HCaptchaDetector(),
      new RecaptchaDetector(),
      new CookieConsentDetector(),
      new LoginWallDetector()
    ];
  }
});

// src/lib/obstacles.ts
async function detectObstacles(page, detectors = defaultDetectors) {
  for (const detector of detectors) {
    const obstacle = await detector.detect(page);
    if (obstacle) return obstacle;
  }
  return null;
}
async function resolveObstacle(page, obstacle, ctx, monitor) {
  for (const resolver of resolvers) {
    if (resolver.canResolve(obstacle)) {
      return resolver.resolve(page, obstacle, ctx, monitor);
    }
  }
  return { resolved: false, error: `No resolver for obstacle type: ${obstacle.type}` };
}
var RecaptchaResolver, CookieConsentResolver, HCaptchaResolver, resolvers;
var init_obstacles = __esm({
  "src/lib/obstacles.ts"() {
    "use strict";
    init_detector();
    init_recaptcha();
    init_hcaptcha();
    init_humanize();
    RecaptchaResolver = class {
      canResolve(obstacle) {
        return obstacle.type === "captcha";
      }
      async resolve(page, _obstacle, _ctx, monitor) {
        try {
          const result = await solveRecaptcha(page, monitor);
          if (result.solved) {
            return { resolved: true, resolution: `auto-solved-recaptcha in ${result.rounds} rounds` };
          }
          return { resolved: false, error: result.reason || "reCAPTCHA solve failed" };
        } catch (err) {
          return { resolved: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    };
    CookieConsentResolver = class {
      canResolve(obstacle) {
        return obstacle.type === "cookie-consent";
      }
      async resolve(page) {
        try {
          const tagged = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).find((el2) => {
              const label = ((el2.innerText || el2.value || "") + "").trim().toLowerCase();
              if (!label || label.length > 32) return false;
              const kws = ["accept cookies", "accept all", "allow cookies", "i accept", "i agree", "agree"];
              if (!kws.some((kw) => label === kw || label.includes(kw) && kw.length / label.length >= 0.5)) return false;
              const r = el2.getBoundingClientRect();
              if (r.width < 20 || r.height < 10) return false;
              const s = getComputedStyle(el2);
              if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
              let n = el2.parentElement;
              let depth = 0;
              while (n && depth < 8) {
                const cs = getComputedStyle(n);
                if (cs.position === "fixed" || cs.position === "sticky" || n.getAttribute("role") === "dialog" || n.getAttribute("aria-modal") === "true") return true;
                n = n.parentElement;
                depth++;
              }
              return false;
            });
            if (!el) return false;
            el.setAttribute("data-iframer-consent", "1");
            return true;
          });
          if (tagged) {
            await humanClick(page, '[data-iframer-consent="1"]');
            await page.evaluate(() => {
              document.querySelector('[data-iframer-consent="1"]')?.removeAttribute("data-iframer-consent");
            }).catch(() => {
            });
            await page.waitForTimeout(500);
            return { resolved: true, resolution: "dismissed-cookie-consent" };
          }
        } catch {
        }
        return { resolved: false, error: "Could not dismiss cookie consent" };
      }
    };
    HCaptchaResolver = class {
      canResolve(obstacle) {
        return obstacle.type === "hcaptcha";
      }
      async resolve(page, _obstacle, _ctx, monitor) {
        try {
          const result = await solveHCaptcha(page, monitor);
          if (result.solved) {
            return { resolved: true, resolution: `auto-solved-hcaptcha in ${result.rounds} rounds` };
          }
          return { resolved: false, error: result.reason || "hCaptcha solve failed" };
        } catch (err) {
          return { resolved: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    };
    resolvers = [
      new RecaptchaResolver(),
      new HCaptchaResolver(),
      new CookieConsentResolver()
    ];
  }
});

// src/lib/page-state.ts
async function capturePageState(page, ctx, opts) {
  const { screenshot: screenshot2 = false, namePrefix = "state" } = opts ?? {};
  let url = "";
  try {
    url = page.url();
  } catch {
  }
  const title = await withBudget(page.title(), 2e3, "title").catch(() => "");
  if (!screenshot2) return { url, title };
  try {
    const buf = await withBudget(
      page.screenshot({ type: "jpeg", quality: 50, fullPage: false, timeout: 12e3 }),
      13e3,
      "screenshot"
    );
    const screenshotUrl = saveScreenshot(buf, `${namePrefix}-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
}
var init_page_state = __esm({
  "src/lib/page-state.ts"() {
    "use strict";
    init_screenshot();
    init_budget();
  }
});

// src/lib/api-capture.ts
function isAuthHeader(name) {
  return AUTH_HEADER_PATTERNS.some((p) => p.test(name));
}
function isLikelyId(segment) {
  return ID_PATTERNS.some((p) => p.test(segment));
}
function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function parameterizePath(path15) {
  const parts = path15.split("/");
  let idCount = 0;
  const parameterized = parts.map((part) => {
    if (part && isLikelyId(part)) {
      idCount++;
      return idCount === 1 ? "{id}" : `{id${idCount}}`;
    }
    return part;
  });
  return parameterized.join("/");
}
function parseQueryParams(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.toString() === "") return void 0;
    const params = {};
    u.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    return params;
  } catch {
    return void 0;
  }
}
function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      cookies[name] = value;
    }
  }
  return cookies;
}
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function sanitizeString(s) {
  return s.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}
function sanitizeDeep(val) {
  if (typeof val === "string") return sanitizeString(val);
  if (Array.isArray(val)) return val.map(sanitizeDeep);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[sanitizeString(k)] = sanitizeDeep(v);
    }
    return out;
  }
  return val;
}
function hasGraphQLShape(body) {
  if (!body || typeof body !== "object") return false;
  const b = body;
  if (typeof b.query === "string" && /^\s*(query|mutation|subscription|fragment|\{)/.test(b.query)) return true;
  if (typeof b.operationName === "string" && ("variables" in b || "query" in b || "doc_id" in b)) return true;
  if ("doc_id" in b && "variables" in b) return true;
  return false;
}
function gqlActionFromBody(body) {
  if (typeof body === "object" && body !== null) {
    const b = body;
    if (typeof b.operationName === "string" && b.operationName) return b.operationName;
    if (typeof b.fb_api_req_friendly_name === "string") return b.fb_api_req_friendly_name;
    if (b.doc_id != null) return `doc_${String(b.doc_id)}`;
    if (typeof b.queryId === "string") return b.queryId;
    if (typeof b.query === "string") {
      const m = b.query.match(/\b(?:query|mutation|subscription)\s+(\w+)/);
      if (m) return m[1];
    }
  }
  if (typeof body === "string") {
    const friendly = body.match(/fb_api_req_friendly_name=([^&]+)/);
    if (friendly) return decodeURIComponent(friendly[1]);
    const op = body.match(/(?:^|&)operationName=([^&]+)/);
    if (op) return decodeURIComponent(op[1]);
    const doc = body.match(/(?:^|&)doc_id=(\d+)/);
    if (doc) return `doc_${doc[1]}`;
  }
  return void 0;
}
function classifyRequest(req) {
  const path15 = req.path;
  const lowerPath = path15.toLowerCase();
  const ct = (req.requestHeaders["content-type"] || req.requestHeaders["Content-Type"] || "").toLowerCase();
  const body = req.requestBody;
  if (ct.includes("application/grpc")) {
    return { protocol: "grpc-web", action: path15.replace(/^\//, "") };
  }
  const soapAction = req.requestHeaders["soapaction"] || req.requestHeaders["SOAPAction"];
  if (soapAction || ct.includes("text/xml") || ct.includes("application/soap+xml")) {
    return { protocol: "soap", action: (soapAction || path15).replace(/^["/]|["/]$/g, "") };
  }
  if (/\/graphql\b/.test(lowerPath) || hasGraphQLShape(body)) {
    return { protocol: "graphql", action: gqlActionFromBody(body) ?? "anonymous" };
  }
  if (body && typeof body === "object") {
    const b = body;
    if (typeof b.jsonrpc === "string" && typeof b.method === "string") {
      return { protocol: "json-rpc", action: b.method };
    }
  }
  if (typeof body === "string" && /fb_api_req_friendly_name=|^[^=&]+=.+&/.test(body)) {
    const friendly = gqlActionFromBody(body);
    if (friendly) return { protocol: "form-rpc", action: friendly };
  }
  return { protocol: "rest", action: `${req.method} ${parameterizePath(path15)}` };
}
function inferVerb(protocol, action, method, responseBody) {
  const lower = action.toLowerCase();
  if (protocol === "rest") {
    const m = method.toUpperCase();
    if (m === "DELETE") return "delete";
    if (m === "POST") return "create";
    if (m === "PUT" || m === "PATCH") return "update";
    if (m === "GET") return Array.isArray(responseBody) || isRecord(responseBody) && Array.isArray(responseBody.data) ? "list" : "read";
    return "action";
  }
  if (/\b(delete|remove|destroy|unfollow|unlike|dislike)\b/.test(lower)) return "delete";
  if (/\b(create|add|insert|post|send|submit|publish|upload|register|signup|like|follow|react)\b/.test(lower)) return "create";
  if (/\b(update|edit|patch|set|change|rename|modify|mark|move)\b/.test(lower)) return "update";
  if (/\b(list|search|feed|timeline|paginated|browse|index|all|many)\b/.test(lower)) return "list";
  if (/\b(get|fetch|load|read|query|view|show|profile|info|detail|me)\b/.test(lower)) return "read";
  if (protocol === "graphql") {
    const q = isRecord(responseBody) ? responseBody.query : void 0;
    if (typeof q === "string" && /^\s*mutation\b/.test(q)) return "action";
    return "read";
  }
  return "action";
}
function pascalCase(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
function camelCase(s) {
  const p = pascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}
function buildFunctionName(protocol, action, method, verb) {
  if (protocol === "rest") {
    const parts = action.split(" ");
    const httpMethod = parts[0];
    const path15 = parts.slice(1).join(" ");
    const segs = path15.split("/").filter((s) => s && !s.startsWith("{"));
    const verbPrefix = httpMethod === "GET" ? verb === "list" ? "list" : "get" : httpMethod === "POST" ? "create" : httpMethod === "PUT" ? "update" : httpMethod === "PATCH" ? "patch" : httpMethod === "DELETE" ? "delete" : httpMethod.toLowerCase();
    return camelCase(`${verbPrefix} ${segs.join(" ")}`) || camelCase(action);
  }
  if (protocol === "graphql" || protocol === "form-rpc") {
    const base = action.replace(/^(Use|FB|IG)/, "").replace(/(Query|Mutation|Subscription|RootQuery)$/, "");
    return camelCase(base) || camelCase(action);
  }
  if (protocol === "json-rpc") return camelCase(action.replace(/[._]/g, " "));
  if (protocol === "grpc-web") {
    const last = action.split("/").pop() || action;
    return camelCase(last);
  }
  return camelCase(action);
}
function buildCurl(method, url, headers, auth, body) {
  const parts = [`curl -X ${method}`];
  if (auth.authorization) {
    parts.push(`  -H 'Authorization: ${auth.authorization}'`);
  }
  if (Object.keys(auth.cookies).length > 0) {
    const cookieStr = Object.entries(auth.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    parts.push(`  -H 'Cookie: ${cookieStr}'`);
  }
  for (const [k, v] of Object.entries(auth.tokens)) {
    parts.push(`  -H '${k}: ${v}'`);
  }
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`  -H '${k}: ${v}'`);
  }
  if (body !== void 0) {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const safeBody = bodyStr.length > 1e4 ? bodyStr.slice(0, 1e4) + "...[truncated]" : bodyStr;
    parts.push(`  -d '${safeBody.replace(/'/g, "'\\''")}'`);
  }
  parts.push(`  '${url}'`);
  return parts.join(" \\\n");
}
function serverErrorsFrom(requests) {
  const out = [];
  for (const r of requests) {
    if (r.responseStatus < 400) continue;
    let body;
    if (r.responseBody !== void 0 && r.responseBody !== null) {
      const raw = typeof r.responseBody === "string" ? r.responseBody : JSON.stringify(r.responseBody);
      const flat = raw.replace(/\s+/g, " ").trim();
      body = flat.length > SERVER_ERROR_BODY_MAX ? flat.slice(0, SERVER_ERROR_BODY_MAX) + "\u2026" : flat;
      if (/^\s*<(!doctype|html)/i.test(raw)) {
        const m = raw.match(/<title[^>]*>([^<]*)<\/title>|<h1[^>]*>([^<]*)<\/h1>/i);
        body = m ? `[html] ${(m[1] || m[2] || "").trim()}` : "[html page]";
      }
    }
    out.push({ stepIndex: r.triggeredAtStep, method: r.method, url: r.url, status: r.responseStatus, body });
  }
  return out;
}
function extractAuth(requests) {
  const auth = { cookies: {}, tokens: {} };
  for (const req of requests) {
    for (const [key, value] of Object.entries(req.requestHeaders)) {
      const lower = key.toLowerCase();
      if (lower === "authorization" && !auth.authorization) {
        auth.authorization = value;
      } else if (lower === "cookie") {
        const cookies = parseCookies(value);
        Object.assign(auth.cookies, cookies);
      } else if (isAuthHeader(key) && lower !== "authorization" && lower !== "cookie") {
        auth.tokens[key] = value;
      }
    }
  }
  return auth;
}
function splitHeaders(headers) {
  const endpointHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (BROWSER_NOISE_HEADERS.has(lower)) continue;
    if (isAuthHeader(key)) continue;
    if (lower === "user-agent") continue;
    endpointHeaders[key] = value;
  }
  return endpointHeaders;
}
function buildCapturedApi(requests) {
  const byDomain = /* @__PURE__ */ new Map();
  for (const req of requests) {
    try {
      const host = new URL(req.url).origin;
      if (!byDomain.has(host)) byDomain.set(host, []);
      byDomain.get(host)?.push(req);
    } catch {
    }
  }
  const apis = [];
  for (const [baseUrl, domainRequests] of byDomain) {
    const auth = extractAuth(domainRequests);
    const endpointMap = /* @__PURE__ */ new Map();
    for (const req of domainRequests) {
      const paramPath = parameterizePath(req.path);
      const { protocol, action } = classifyRequest(req);
      const key = `${protocol}:${action}`;
      const endpointHeaders = splitHeaders(req.requestHeaders);
      if (!endpointMap.has(key)) {
        const verb = inferVerb(protocol, action, req.method, req.responseBody);
        const functionName = buildFunctionName(protocol, action, req.method, verb);
        endpointMap.set(key, {
          method: req.method,
          path: paramPath,
          rawPaths: [req.path],
          queryParams: req.queryParams,
          headers: endpointHeaders,
          requestBody: req.requestBody,
          responseStatus: req.responseStatus,
          responseBody: req.responseBody,
          triggeredAtStep: req.triggeredAtStep,
          curl: buildCurl(req.method, req.url, endpointHeaders, auth, req.requestBody),
          protocol,
          action,
          verb,
          functionName
        });
      } else {
        const existing = endpointMap.get(key);
        if (!existing) continue;
        if (!existing.rawPaths.includes(req.path)) {
          existing.rawPaths.push(req.path);
        }
      }
    }
    const domain = new URL(baseUrl).hostname.replace(/\./g, "_");
    apis.push({
      domain,
      baseUrl,
      auth,
      endpoints: Array.from(endpointMap.values()).sort((a, b) => a.triggeredAtStep - b.triggeredAtStep),
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return apis.sort((a, b) => b.endpoints.length - a.endpoints.length);
}
var SKIP_RESOURCE_TYPES, SKIP_EXTENSIONS, BROWSER_NOISE_HEADERS, AUTH_HEADER_PATTERNS, ID_PATTERNS, ApiCapture, SERVER_ERROR_BODY_MAX;
var init_api_capture = __esm({
  "src/lib/api-capture.ts"() {
    "use strict";
    SKIP_RESOURCE_TYPES = /* @__PURE__ */ new Set([
      "stylesheet",
      "image",
      "media",
      "font",
      "manifest",
      "other"
    ]);
    SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i;
    BROWSER_NOISE_HEADERS = /* @__PURE__ */ new Set([
      "accept-encoding",
      "accept-language",
      "cache-control",
      "connection",
      "host",
      "pragma",
      "sec-ch-ua",
      "sec-ch-ua-mobile",
      "sec-ch-ua-platform",
      "sec-fetch-dest",
      "sec-fetch-mode",
      "sec-fetch-site",
      "upgrade-insecure-requests",
      "dnt",
      "te",
      "if-none-match",
      "if-modified-since"
    ]);
    AUTH_HEADER_PATTERNS = [
      /^authorization$/i,
      /^cookie$/i,
      /^x-csrf/i,
      /^x-xsrf/i,
      /^x-api-key$/i,
      /^x-auth/i,
      /^x-token/i,
      /^x-session/i,
      /^x-access/i,
      /^x-client-token/i,
      /^x-request-token/i,
      /^x-super-properties$/i,
      /^x-debug-options$/i,
      /^x-fingerprint$/i
    ];
    ID_PATTERNS = [
      /^[0-9]+$/,
      /^[0-9a-f]{8,}$/i,
      /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
      /^\w{20,}$/
    ];
    ApiCapture = class {
      constructor(page) {
        this.page = page;
        this.context = page.context();
        this.pageHandler = (p) => this.hookPage(p);
        this.requestHandler = (req) => {
          const resourceType = req.resourceType();
          if (SKIP_RESOURCE_TYPES.has(resourceType)) return;
          if (SKIP_EXTENSIONS.test(req.url())) return;
          if (resourceType !== "xhr" && resourceType !== "fetch") return;
          this.pendingRequests.set(req, {
            stepIndex: this.currentStep,
            timestamp: Date.now()
          });
        };
        this.responseHandler = async (res) => {
          const req = res.request();
          const meta = this.pendingRequests.get(req);
          if (!meta) return;
          this.pendingRequests.delete(req);
          try {
            const url = req.url();
            const parsed = new URL(url);
            const allHeaders = req.headers();
            let requestBody = void 0;
            try {
              const ct = (allHeaders["content-type"] || allHeaders["Content-Type"] || "").toLowerCase();
              const postData = req.postData();
              if (postData) {
                if (ct.includes("multipart/form-data")) {
                  const fields = [...postData.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
                  requestBody = { _type: "multipart/form-data", fields: [...new Set(fields)] };
                } else if (ct.includes("application/octet-stream") || ct.startsWith("video/") || ct.startsWith("image/") || ct.startsWith("audio/")) {
                  requestBody = { _type: ct, _size: postData.length };
                } else if (postData.length < 5e5) {
                  requestBody = sanitizeDeep(tryParseJson(postData) ?? postData);
                } else {
                  requestBody = `[body truncated \u2014 ${postData.length} bytes, content-type: ${ct}]`;
                }
              }
            } catch {
            }
            let responseBody = void 0;
            try {
              const resText = await res.text();
              if (resText && resText.length < 5e5) {
                responseBody = sanitizeDeep(tryParseJson(resText) ?? resText);
              } else if (resText) {
                responseBody = `[response truncated \u2014 ${resText.length} bytes]`;
              }
            } catch {
            }
            this.requests.push({
              method: req.method(),
              url,
              path: parsed.pathname,
              queryParams: parseQueryParams(url),
              requestHeaders: allHeaders,
              requestBody,
              responseStatus: res.status(),
              responseHeaders: res.headers(),
              responseBody,
              resourceType: req.resourceType(),
              triggeredAtStep: meta.stepIndex,
              timestamp: meta.timestamp
            });
          } catch {
          }
        };
      }
      page;
      requests = [];
      pendingRequests = /* @__PURE__ */ new Map();
      currentStep = 0;
      requestHandler;
      responseHandler;
      // Capture spans every tab in the context, not just the initial page: a click
      // that opens a new tab (which the pipeline now follows) makes its XHR/fetch on
      // a separate Page, so we hook each page opened while capturing.
      context;
      hookedPages = /* @__PURE__ */ new Set();
      pageHandler;
      hookPage(p) {
        if (this.hookedPages.has(p)) return;
        this.hookedPages.add(p);
        p.on("request", this.requestHandler);
        p.on("response", this.responseHandler);
      }
      start() {
        this.hookPage(this.page);
        this.context.on("page", this.pageHandler);
      }
      setStep(index) {
        this.currentStep = index;
      }
      stop() {
        this.context.off("page", this.pageHandler);
        for (const p of this.hookedPages) {
          try {
            p.off("request", this.requestHandler);
            p.off("response", this.responseHandler);
          } catch {
          }
        }
        this.hookedPages.clear();
      }
      /** Keep listening for `ms` additional milliseconds, then wait up to `pendingTimeoutMs`
       *  for any in-flight requests (fired but not yet responded) to complete before stopping.
       *  Catches async post-step requests like auth re-challenges + delayed mutations. */
      async drain(ms = 3e3, pendingTimeoutMs = 5e3) {
        await new Promise((r) => setTimeout(r, ms));
        const deadline = Date.now() + pendingTimeoutMs;
        while (this.pendingRequests.size > 0 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      /** Requests fired but not yet answered. */
      hasPending() {
        return this.pendingRequests.size > 0;
      }
      getResults() {
        return buildCapturedApi(this.requests);
      }
      /** Every HTTP >= 400 response, compact, in capture order. */
      getServerErrors() {
        return serverErrorsFrom(this.requests);
      }
    };
    SERVER_ERROR_BODY_MAX = 600;
  }
});

// src/lib/browser/tab-tracker.ts
function safeUrl(p) {
  try {
    return p.url();
  } catch {
    return "unknown";
  }
}
var log14, TabTracker;
var init_tab_tracker = __esm({
  "src/lib/browser/tab-tracker.ts"() {
    "use strict";
    init_logger();
    log14 = createLogger("tabs");
    TabTracker = class {
      constructor(context, initial) {
        this.context = context;
        this.activePage = initial;
        this.pages = [...context.pages()];
        if (!this.pages.includes(initial)) this.pages.push(initial);
        context.on("page", this.onNewPage);
      }
      context;
      pages;
      activePage;
      newlyOpened = [];
      disposed = false;
      onNewPage = (p) => {
        if (this.disposed) return;
        this.pages.push(p);
        this.newlyOpened.push(p);
        p.on("close", () => this.onClose(p));
        log14.debug(`new tab opened: ${safeUrl(p)}`);
      };
      onClose = (p) => {
        this.pages = this.pages.filter((x) => x !== p);
        this.newlyOpened = this.newlyOpened.filter((x) => x !== p);
        if (this.activePage === p) {
          this.activePage = this.pages[this.pages.length - 1] ?? p;
          log14.debug(`active tab closed, fell back to: ${safeUrl(this.activePage)}`);
        }
      };
      /** The page the pipeline should currently drive. */
      active() {
        return this.activePage;
      }
      /** Number of live tabs currently tracked. */
      count() {
        return this.pages.length;
      }
      /**
       * If a tab opened since the last settle, switch to the newest one (waiting
       * for it to load) and return info about the switch. Returns null if nothing
       * opened. Never throws.
       */
      async settle(opts) {
        if (this.newlyOpened.length === 0 && opts.waitForPendingMs > 0) {
          await this.context.waitForEvent("page", { timeout: opts.waitForPendingMs }).catch(() => null);
        }
        if (this.newlyOpened.length === 0) return null;
        const target = this.newlyOpened[this.newlyOpened.length - 1];
        this.newlyOpened = [];
        if (target.isClosed()) return null;
        await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {
        });
        if (safeUrl(target) === "about:blank" || safeUrl(target) === "") {
          await target.waitForURL((u) => {
            const s = u.toString();
            return !!s && s !== "about:blank";
          }, { timeout: opts.blankResolveMs }).catch(() => {
          });
          await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {
          });
        }
        const url = safeUrl(target);
        if (!url || url === "about:blank") {
          return null;
        }
        await target.bringToFront().catch(() => {
        });
        this.activePage = target;
        const sw = { url, title: await target.title().catch(() => "") };
        log14.info(`followed new tab \u2192 ${sw.url}`);
        return sw;
      }
      /** Drop pending new-tab opens without following them. Used when a step opened
       *  a tab we should NOT switch to (e.g. an incidental popup while the main page
       *  navigated, or any tab opened by a non-click step like login). */
      discardPending() {
        this.newlyOpened = [];
      }
      dispose() {
        this.disposed = true;
        try {
          this.context.off("page", this.onNewPage);
        } catch {
        }
      }
    };
  }
});

// src/lib/knowledge/component-map.ts
function anchorsPath(domain) {
  return import_path10.default.join(getKnowledgeDir(), `${sanitizeDomain(domain)}.anchors.json`);
}
function loadComponentMap(domain) {
  const norm = normalizeDomain(domain);
  try {
    const raw = import_fs9.default.readFileSync(anchorsPath(norm), "utf8");
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
function loadAnchors(domain) {
  const map = /* @__PURE__ */ new Map();
  const cm = loadComponentMap(domain);
  for (const [name, a] of Object.entries(cm.anchors)) map.set(name, a);
  return map;
}
function write(cm) {
  import_fs9.default.mkdirSync(getKnowledgeDir(), { recursive: true });
  import_fs9.default.writeFileSync(anchorsPath(cm.domain), JSON.stringify(cm, null, 2), "utf8");
}
function recordAnchorResult(domain, name, ok, now) {
  try {
    const cm = loadComponentMap(domain);
    const a = cm.anchors[name];
    if (!a) return;
    if (ok) {
      a.uses += 1;
      a.lastVerified = now;
    } else {
      a.fails += 1;
    }
    write(cm);
  } catch {
  }
}
var import_fs9, import_path10;
var init_component_map = __esm({
  "src/lib/knowledge/component-map.ts"() {
    "use strict";
    import_fs9 = __toESM(require("fs"));
    import_path10 = __toESM(require("path"));
    init_knowledge();
  }
});

// src/lib/pipeline.ts
function safePageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}
function classifyError(err, step) {
  if (err instanceof StaleStateError) return "stale-state";
  if (step.type === "solve-captcha") return "captcha-unsolvable";
  const msg = err.message.toLowerCase();
  if (step.type === "login" && (msg.includes("no visible password field") || msg.includes("password field was not visible"))) {
    return "bot-blocked";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("not found") || msg.includes("no element") || msg.includes("waiting for selector")) return "element-not-found";
  if (msg.includes("navigation") || msg.includes("net::err")) return "navigation-failed";
  return "action-failed";
}
async function refineError(page, step, ctx, errorType, message) {
  if (errorType !== "stale-state" && errorType !== "timeout") return { errorType, message };
  const raw = step.selector;
  if (typeof raw !== "string") return { errorType, message };
  let resolved;
  try {
    resolved = resolveSelector(raw, ctx);
  } catch {
    return { errorType, message };
  }
  try {
    const probe = page.evaluate((sel) => !!document.querySelector(sel), resolved);
    const budget = new Promise((r) => setTimeout(() => r(null), TIMING.FAILURE_PROBE));
    const found = await Promise.race([probe, budget]);
    if (found !== false) return { errorType, message };
  } catch {
    return { errorType, message };
  }
  const shown = resolved === raw ? `"${raw}"` : `"${raw}" (\u2192 ${resolved})`;
  return {
    errorType: "element-not-found",
    message: `No element matches ${shown} on the current page \u2014 the step waited for it to appear and it never did. It most likely existed when you looked and was re-rendered away before this step ran. (${message})`
  };
}
function isRetryable(errorType) {
  return errorType === "stale-state" || errorType === "timeout" || errorType === "element-not-found";
}
function getSuggestion(errorType, step, message = "") {
  if (message.includes("tab stopped responding")) return UNRESPONSIVE_SUGGESTION;
  const usedEphemeralRef = typeof step.selector === "string" && step.selector.startsWith("@e");
  if (usedEphemeralRef && (errorType === "element-not-found" || errorType === "timeout" || errorType === "stale-state")) {
    return "The @e ref went stale \u2014 the page (likely a React/SPA) re-rendered and dropped it since the snapshot. Take a fresh `snapshot`/`find` right before acting, or save the element as a durable `@a:` anchor with the `remember` tool.";
  }
  switch (errorType) {
    case "stale-state":
      return "The page stopped responding. The step may have triggered a very slow load or the server may be unreachable.";
    case "element-not-found":
      return "Selector not found. Either it is wrong, or the page re-rendered the element away (SPAs swap DOM nodes on every state change, so a selector that worked a second ago can return nothing now). Take a fresh `snapshot`/`find` immediately before acting and retry; if it keeps vanishing, `wait-for` it first.";
    case "navigation-failed":
      return "Navigation failed. The URL may be unreachable, blocked, or require authentication.";
    case "captcha-unsolvable":
      return "Automatic captcha solving failed. Ask a person to solve it in a binary-headful window, then continue from the same page.";
    case "timeout":
      return "Operation timed out. The page may be slow or the element may not appear.";
    default:
      return void 0;
  }
}
var DEFAULT_STALE_TIMEOUT_MS2, UNRESPONSIVE_SUGGESTION, PipelineRunner;
var init_pipeline = __esm({
  "src/lib/pipeline.ts"() {
    "use strict";
    init_site_protection();
    init_registry2();
    init_types();
    init_stale_monitor();
    init_obstacles();
    init_screenshot();
    init_page_state();
    init_api_capture();
    init_tab_tracker();
    init_constants();
    init_component_map();
    init_resolve_selector();
    init_constants();
    init_budget();
    DEFAULT_STALE_TIMEOUT_MS2 = 2e4;
    UNRESPONSIVE_SUGGESTION = "The tab's JavaScript stopped answering during this step. Run a single `read` or `snapshot` on its own to see if it recovered (it usually does). If this step froze it, don't repeat it as-is: for a route change in a single-page app use `evaluate` with `location.assign(url)`; for a click, use a fresh `@e` ref from `find`; avoid `evaluate` calls that scroll or re-render.";
    PipelineRunner = class {
      constructor(ctx, hooks) {
        this.ctx = ctx;
        this.hooks = hooks;
      }
      ctx;
      hooks;
      /** Live progress, readable while run() is still pending — lets an outer
       *  watchdog report WHICH step hung and what already finished. */
      progress = { stepIndex: -1, results: [] };
      async run(initialPage, pipeline) {
        const tracker = new TabTracker(initialPage.context(), initialPage);
        try {
          return await this.runSteps(initialPage, tracker, pipeline);
        } finally {
          tracker.dispose();
        }
      }
      async runSteps(initialPage, tracker, pipeline) {
        const startTime = Date.now();
        const opts = pipeline.options || {};
        const staleTimeoutMs = opts.staleTimeoutMs ?? this.ctx.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS2;
        const continueOnObstacle = opts.continueOnObstacle ?? true;
        const screenshotAfterEach = opts.screenshotAfterEach ?? false;
        const continueOnError = opts.continueOnError ?? false;
        const results = [];
        const obstacles = [];
        this.progress.results = results;
        const navStep = pipeline.steps.find((s) => s.type === "navigate");
        try {
          const host = new URL(navStep?.url || safePageUrl(initialPage) || "http://x").hostname;
          if (host && host !== "x") {
            this.ctx.anchors = loadAnchors(host);
            this.ctx.anchorDomain = host;
          }
        } catch {
        }
        const recordAnchor = (step, ok) => {
          const name = anchorNameOf(step.selector);
          if (name && this.ctx.anchorDomain) recordAnchorResult(this.ctx.anchorDomain, name, ok, (/* @__PURE__ */ new Date()).toISOString());
        };
        const capture = opts.captureApi ? new ApiCapture(initialPage) : null;
        if (capture) capture.start();
        const finishCapture = async () => {
          if (!capture) return void 0;
          await capture.drain(TIMING.CAPTURE_SETTLE, TIMING.CAPTURE_PENDING_MAX);
          capture.stop();
          for (const se of capture.getServerErrors()) {
            const r = results.find((x) => x.stepIndex === se.stepIndex);
            if (r) (r.serverErrors ??= []).push(se);
          }
          return capture.getResults();
        };
        for (let i = 0; i < pipeline.steps.length; i++) {
          if (capture) capture.setStep(i);
          const step = pipeline.steps[i];
          this.progress.stepIndex = i;
          const page = tracker.active();
          const urlBefore = safePageUrl(page);
          const monitor = new StaleStateMonitor(page, staleTimeoutMs);
          let stepResult;
          try {
            await this.hooks?.before(page, step);
            stepResult = await monitor.withMonitoring(async () => {
              const r = await executeAction(page, step, this.ctx, monitor);
              if (step.type === "navigate") await this.hooks?.after(page, step.url);
              r.stepIndex = i;
              return r;
            });
          } catch (err) {
            if (err instanceof HeadedRequiredError) {
              Object.assign(err, { stepIndex: i, results, obstacles });
              await finishCapture();
              throw err;
            }
            const asError = err instanceof Error ? err : new Error(String(err));
            const refined = await refineError(tracker.active(), step, this.ctx, classifyError(asError, step), asError.message);
            const errorType = refined.errorType;
            const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
            stepResult = failedStepResult(step, refined.message, Date.now() - startTime, i);
            results.push(stepResult);
            recordAnchor(step, false);
            return {
              ok: false,
              completedSteps: i,
              totalSteps: pipeline.steps.length,
              results,
              obstacles,
              finalState: pageState,
              error: {
                failedAtStep: i,
                failedStep: step,
                errorType,
                message: refined.message,
                pageState,
                suggestion: getSuggestion(errorType, step, refined.message),
                retryable: isRetryable(errorType)
              },
              durationMs: Date.now() - startTime,
              capturedApi: await finishCapture()
            };
          }
          recordAnchor(step, true);
          const canOpenTab = step.type === "click" || step.type === "human-click";
          const currentPageNavigated = safePageUrl(page) !== urlBefore;
          if (canOpenTab && !currentPageNavigated) {
            const switched = await tracker.settle({
              waitForPendingMs: TIMEOUTS.TAB_FOLLOW_SETTLE,
              loadTimeoutMs: TIMEOUTS.TAB_LOAD,
              blankResolveMs: TIMEOUTS.TAB_BLANK_RESOLVE
            });
            if (switched) stepResult.tabSwitchedTo = switched.url;
          } else {
            tracker.discardPending();
          }
          if (screenshotAfterEach && stepResult.ok) {
            try {
              const buf = await tracker.active().screenshot({ type: "jpeg", quality: 50, fullPage: false });
              stepResult.screenshotUrl = saveScreenshot(
                buf,
                `step-${i}-${Date.now()}.jpg`,
                this.ctx.screenshotDir,
                this.ctx.publicUrl
              );
            } catch {
            }
          }
          results.push(stepResult);
          if (!stepResult.ok && !continueOnError) {
            const refined = await refineError(
              tracker.active(),
              step,
              this.ctx,
              classifyError(new Error(stepResult.error || ""), step),
              stepResult.error || "Step failed"
            );
            stepResult.error = refined.message;
            const errorType = refined.errorType;
            const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
            return {
              ok: false,
              completedSteps: i,
              totalSteps: pipeline.steps.length,
              results,
              obstacles,
              finalState: pageState,
              error: {
                failedAtStep: i,
                failedStep: step,
                errorType,
                message: stepResult.error || "Step failed",
                pageState,
                suggestion: getSuggestion(errorType, step, refined.message),
                retryable: isRetryable(errorType)
              },
              durationMs: Date.now() - startTime,
              capturedApi: await finishCapture()
            };
          }
          if (step.type === "navigate" && continueOnObstacle) {
            const obstacleStart = Date.now();
            const obstaclePage = tracker.active();
            const obstacle = await withBudget(detectObstacles(obstaclePage), 1e4, "obstacle check").catch(() => null);
            if (obstacle) {
              const resolution = await resolveObstacle(obstaclePage, obstacle, this.ctx, monitor);
              obstacles.push({
                type: obstacle.type,
                detectedAtStep: i,
                resolved: resolution.resolved,
                resolution: resolution.resolution,
                durationMs: Date.now() - obstacleStart
              });
              if (!resolution.resolved && obstacle.type === "captcha") {
                const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
                return {
                  ok: false,
                  completedSteps: i,
                  totalSteps: pipeline.steps.length,
                  results,
                  obstacles,
                  finalState: pageState,
                  error: {
                    failedAtStep: i,
                    failedStep: step,
                    errorType: "obstacle-unresolvable",
                    message: `Obstacle detected (${obstacle.type}) but could not be resolved: ${resolution.error}`,
                    pageState,
                    suggestion: getSuggestion("captcha-unsolvable", step),
                    retryable: true
                  },
                  durationMs: Date.now() - startTime,
                  capturedApi: await finishCapture()
                };
              }
            }
          }
        }
        const capturedApi = await finishCapture();
        const finalState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        return {
          ok: true,
          completedSteps: pipeline.steps.length,
          totalSteps: pipeline.steps.length,
          results,
          obstacles,
          finalState,
          durationMs: Date.now() - startTime,
          capturedApi
        };
      }
    };
  }
});

// src/lib/block-detection.ts
async function detectBlock(page) {
  try {
    const [title, url, bodyText] = await Promise.all([
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
      page.evaluate(() => document.body?.innerText?.slice(0, 1e3) || "").catch(() => "")
    ]);
    if (title.includes("Just a moment") || title.includes("Attention Required")) {
      return { blocked: true, reason: "cloudflare-challenge" };
    }
    if (bodyText.includes("Verify you are human") || bodyText.includes("cf-turnstile")) {
      return { blocked: true, reason: "cloudflare-turnstile" };
    }
    if (bodyText.includes("Checking your browser") || bodyText.includes("Please wait while we verify")) {
      return { blocked: true, reason: "cloudflare-checking" };
    }
    const hasCfChallenge = await page.evaluate(() => {
      return !!document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    }).catch((err) => {
      log15.warn(`CF challenge check failed, assuming blocked: ${err}`);
      return true;
    });
    if (hasCfChallenge) {
      return { blocked: true, reason: "cloudflare-turnstile" };
    }
    if (title.includes("Access Denied") && bodyText.includes("Reference #")) {
      return { blocked: true, reason: "akamai-block" };
    }
    if (bodyText.includes("Press & Hold") && bodyText.includes("human")) {
      return { blocked: true, reason: "perimeterx-block" };
    }
    if (bodyText.includes("datadome") || bodyText.includes("captcha-delivery.com")) {
      return { blocked: true, reason: "datadome-block" };
    }
    if (bodyText.trim().length < THRESHOLDS.MIN_BODY_TEXT) {
      const hasCaptchaIframe = await page.evaluate(() => {
        return !!(document.querySelector('iframe[src*="recaptcha"]') || document.querySelector('iframe[src*="hcaptcha"]'));
      }).catch((err) => {
        log15.warn(`captcha iframe check failed, assuming blocked: ${err}`);
        return true;
      });
      if (hasCaptchaIframe) {
        return { blocked: true, reason: "captcha-wall" };
      }
    }
    if (title.includes("403") || title.includes("Forbidden")) {
      return { blocked: true, reason: "http-403" };
    }
    if (!url.includes("about:blank") && bodyText.trim().length < 20 && title.length < 5) {
    }
    return { blocked: false };
  } catch (err) {
    log15.warn(`page evaluation failed, assuming blocked: ${err}`);
    return { blocked: true, reason: "evaluation-failed" };
  }
}
var log15;
var init_block_detection = __esm({
  "src/lib/block-detection.ts"() {
    "use strict";
    init_constants();
    init_logger();
    log15 = createLogger("block-detection");
  }
});

// src/lib/knowledge/extract-from-run.ts
function extractKnowledgeFromRun(pipeline, result, sessionData, mode) {
  const firstNav = pipeline.steps.find((s) => s.type === "navigate");
  if (!firstNav || firstNav.type !== "navigate") return;
  let domain;
  try {
    domain = new URL(firstNav.url).hostname;
  } catch {
    return;
  }
  const domainRoot = domain.replace(/^www\./, "");
  const hadLogin = pipeline.steps.some((s) => s.type === "login");
  const auth = { type: "unknown" };
  const cookieNames = [];
  const localStorageKeys = [];
  const sessionStorageKeys = [];
  if (sessionData) {
    for (const c of sessionData.cookies ?? []) {
      if (c.domain.endsWith(domainRoot) || domainRoot.endsWith(c.domain.replace(/^\./, ""))) {
        if (!cookieNames.includes(c.name)) cookieNames.push(c.name);
      }
    }
    for (const [origin, store] of Object.entries(sessionData.localStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!localStorageKeys.includes(k)) localStorageKeys.push(k);
        }
      }
    }
    for (const [origin, store] of Object.entries(sessionData.sessionStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!sessionStorageKeys.includes(k)) sessionStorageKeys.push(k);
        }
      }
    }
  }
  if (cookieNames.length > 0 && localStorageKeys.length > 0) {
    auth.type = "cookies+localStorage";
  } else if (localStorageKeys.length > 0) {
    auth.type = "localStorage";
  } else if (cookieNames.length > 0) {
    auth.type = "cookies";
  }
  if (cookieNames.length > 0) auth.cookieNames = cookieNames;
  if (localStorageKeys.length > 0) auth.localStorageKeys = localStorageKeys;
  if (sessionStorageKeys.length > 0) auth.sessionStorageKeys = sessionStorageKeys;
  const endpoints = [];
  const replayHeaders = /* @__PURE__ */ new Set();
  for (const api of result.capturedApi ?? []) {
    if (!api.domain.includes(domainRoot) && !domainRoot.includes(api.domain.replace(/^www\./, ""))) continue;
    if (api.auth?.authorization) replayHeaders.add("Authorization");
    for (const name of Object.keys(api.auth?.tokens ?? {})) replayHeaders.add(name);
    for (const ep of api.endpoints ?? []) {
      endpoints.push({
        method: ep.method,
        path: ep.path,
        description: `Status ${ep.responseStatus}. Triggered at step ${ep.triggeredAtStep}.`,
        example: ep.curl,
        firstSeen: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  if (replayHeaders.size > 0) {
    auth.headers = [...replayHeaders];
    if (!auth.type.includes("header")) auth.type = auth.type === "unknown" ? "headers" : `${auth.type}+headers`;
  }
  const notes = [];
  if (hadLogin) notes.push(`Last successful login via browser in ${mode} mode.`);
  if (result.obstacles?.some((o) => o.type?.includes("captcha"))) notes.push("Captcha encountered \u2014 browser required for fresh logins.");
  mergeKnowledge(domainRoot, {
    lastMode: mode,
    browserRequired: true,
    // will flip to false only when the agent proves direct API works
    auth,
    endpoints,
    notes
  });
}
var init_extract_from_run = __esm({
  "src/lib/knowledge/extract-from-run.ts"() {
    "use strict";
    init_knowledge();
  }
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask2, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask2[i & 3];
      }
    }
    function _unmask(buffer, mask2) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask2[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask2, output, offset, length) {
          if (length < 48) _mask(source, mask2, output, offset, length);
          else bufferUtil.mask(source, mask2, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask2) {
          if (buffer.length < 32) _unmask(buffer, mask2);
          else bufferUtil.unmask(buffer, mask2);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask2;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask2 = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask2);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask2[0] = randomPool[randomPoolPointer++];
            mask2[1] = randomPool[randomPoolPointer++];
            mask2[2] = randomPool[randomPoolPointer++];
            mask2[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask2[0] | mask2[1] | mask2[2] | mask2[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask2[0];
        target[offset - 3] = mask2[1];
        target[offset - 2] = mask2[2];
        target[offset - 1] = mask2[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask2, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask2, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask2, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask: mask2,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask2, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask: mask2,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask2, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask: mask2,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event2 = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event2.prototype, "target", { enumerable: true });
    Object.defineProperty(Event2.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event2 {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event2 {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event2 {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event2("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event: Event2,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http2 = require("http");
    var net2 = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask2, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask2 = void 0;
        } else if (typeof mask2 === "function") {
          cb = mask2;
          mask2 = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask2 === void 0) mask2 = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask2, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask2, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask2 = void 0;
        } else if (typeof mask2 === "function") {
          cb = mask2;
          mask2 = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask2 === void 0) mask2 = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask2, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http2.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location2 = res.headers.location;
        const statusCode = res.statusCode;
        if (location2 && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location2, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location2}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http2 = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http2.createServer((req, res) => {
            const body = http2.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http2.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http2.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/wrapper.mjs
var import_stream, import_extension, import_permessage_deflate, import_receiver, import_sender, import_subprotocol, import_websocket, import_websocket_server;
var init_wrapper = __esm({
  "node_modules/ws/wrapper.mjs"() {
    import_stream = __toESM(require_stream(), 1);
    import_extension = __toESM(require_extension(), 1);
    import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
    import_receiver = __toESM(require_receiver(), 1);
    import_sender = __toESM(require_sender(), 1);
    import_subprotocol = __toESM(require_subprotocol(), 1);
    import_websocket = __toESM(require_websocket(), 1);
    import_websocket_server = __toESM(require_websocket_server(), 1);
  }
});

// src/lib/version.ts
function getVersion() {
  if (cached) return cached;
  if (process.env.IFRAMER_VERSION) return cached = process.env.IFRAMER_VERSION;
  const candidates = [
    import_path11.default.join(__dirname, "..", "..", "package.json"),
    // src/lib -> root (dev)
    import_path11.default.join(__dirname, "..", "package.json"),
    // dist -> root (bundled)
    import_path11.default.join(process.cwd(), "package.json")
  ];
  for (const p of candidates) {
    try {
      const v = JSON.parse(import_fs10.default.readFileSync(p, "utf8")).version;
      if (v) return cached = v;
    } catch {
    }
  }
  return cached = "0.0.0";
}
var import_fs10, import_path11, cached;
var init_version = __esm({
  "src/lib/version.ts"() {
    "use strict";
    import_fs10 = __toESM(require("fs"));
    import_path11 = __toESM(require("path"));
    cached = null;
  }
});

// src/lib/extension/bridge.ts
function cdpKey(clientId, tabId) {
  return `${clientId}:${tabId}`;
}
var import_crypto6, REQUEST_TIMEOUT_MS, HEARTBEAT_MS, CONNECT_GRACE_MS, NOT_CONNECTED_MESSAGE, ExtensionBridge, extensionBridge;
var init_bridge = __esm({
  "src/lib/extension/bridge.ts"() {
    "use strict";
    init_wrapper();
    import_crypto6 = __toESM(require("crypto"));
    init_crypto();
    init_version();
    REQUEST_TIMEOUT_MS = 18e4;
    HEARTBEAT_MS = 15e3;
    CONNECT_GRACE_MS = 35e3;
    NOT_CONNECTED_MESSAGE = "No iframer extension is connected. Open Chrome and make sure the iframer extension is enabled (setup: `iframer install extension chrome`). It pairs by itself; the popup says why if it can't.";
    ExtensionBridge = class {
      wss = null;
      attachedAt = 0;
      clientWaiters = [];
      clients = /* @__PURE__ */ new Map();
      pending = /* @__PURE__ */ new Map();
      nextReqId = 1;
      // tabId -> clientId, refreshed on every listTabs() so execute can route.
      tabOwner = /* @__PURE__ */ new Map();
      // Tab ids that two connected browsers BOTH reported (separate Chromium
      // instances have independent tab-id spaces, so ids can collide). Routing
      // one of these without an explicit clientId would silently pick a winner —
      // refuse instead.
      collidingTabs = /* @__PURE__ */ new Set();
      // CDP relay listeners, one per (clientId, tabId). Each active relay owns
      // exactly one entry; a second relay on the same tab is refused at register
      // time instead of silently stealing the first one's events.
      cdpListeners = /* @__PURE__ */ new Map();
      /** Attach the WS server to the already-listening HTTP server. Idempotent. */
      attach(server) {
        if (this.wss) return;
        this.attachedAt = Date.now();
        this.wss = new import_websocket_server.default({ server, path: "/extension/ws" });
        this.wss.on("connection", (ws, req) => {
          const accepted = getPairingTokens();
          if (accepted.length === 0) {
            ws.close(4001, "unauthorized");
            return;
          }
          const queryToken = new URL(req.url || "", "http://127.0.0.1").searchParams.get("token");
          if (queryToken !== null) {
            if (!accepted.includes(queryToken)) {
              ws.close(4001, "unauthorized");
              return;
            }
            this.acceptClient(ws);
            return;
          }
          const timer = setTimeout(() => ws.close(4001, "auth timeout"), 3e3);
          ws.once("message", (data) => {
            clearTimeout(timer);
            try {
              const m = JSON.parse(data.toString());
              if (m?.type === "auth" && typeof m.token === "string" && accepted.includes(m.token)) {
                this.acceptClient(ws);
                return;
              }
            } catch {
            }
            ws.close(4001, "unauthorized");
          });
        });
      }
      acceptClient(ws) {
        const client = {
          clientId: import_crypto6.default.randomUUID(),
          socket: ws,
          connectedAt: Date.now(),
          tabs: [],
          heartbeat: null
        };
        this.clients.set(client.clientId, client);
        this.startHeartbeat(client);
        for (const wake of this.clientWaiters.splice(0)) wake();
        try {
          ws.send(JSON.stringify({ type: "server_info", version: getVersion() }));
        } catch {
        }
        ws.on("message", (data) => this.onMessage(client, data));
        ws.on("close", () => this.dropClient(client, "socket closed"));
        ws.on("error", () => {
        });
      }
      startHeartbeat(client) {
        client.heartbeat = setInterval(() => {
          this.send(client, "ping", {}).catch(() => {
          });
        }, HEARTBEAT_MS);
        client.heartbeat.unref?.();
      }
      dropClient(client, _reason) {
        if (client.heartbeat) clearInterval(client.heartbeat);
        if (this.clients.get(client.clientId) === client) {
          this.clients.delete(client.clientId);
        }
        for (const [tabId, owner] of this.tabOwner) {
          if (owner === client.clientId) this.tabOwner.delete(tabId);
        }
        for (const [id, p] of this.pending) {
          if (p.clientId === client.clientId) {
            clearTimeout(p.timer);
            p.reject(new Error("Extension disconnected before responding."));
            this.pending.delete(id);
          }
        }
      }
      onMessage(client, data) {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "hello") {
          client.profileId = msg.profileId;
          client.profileName = msg.profileName;
          client.extVersion = msg.extVersion;
          if (msg.profileId) {
            for (const other of this.clients.values()) {
              if (other !== client && other.profileId === msg.profileId) {
                try {
                  other.socket.close(4002, "replaced by same profile reconnect");
                } catch {
                }
              }
            }
          }
          return;
        }
        if (msg.type === "cdp_event") {
          const ev = msg;
          if (typeof ev.tabId === "number") {
            const fn = this.cdpListeners.get(cdpKey(client.clientId, ev.tabId));
            if (fn) fn(ev);
          }
          return;
        }
        if (typeof msg.id !== "number") return;
        const p = this.pending.get(msg.id);
        if (!p || p.clientId !== client.clientId) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || "Extension reported an error."));
      }
      send(client, type, payload) {
        const ws = client.socket;
        if (!ws || ws.readyState !== import_websocket.default.OPEN) {
          return Promise.reject(new Error("Extension client is not connected."));
        }
        const id = this.nextReqId++;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`Extension did not respond within ${REQUEST_TIMEOUT_MS}ms (${type}).`));
          }, REQUEST_TIMEOUT_MS);
          this.pending.set(id, { clientId: client.clientId, resolve, reject, timer });
          try {
            ws.send(JSON.stringify({ id, type, ...payload }));
          } catch (e) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
      hasClients() {
        return this.clients.size > 0;
      }
      /** Resolves once a client is connected, or when the startup grace window ends.
       *  After that window it returns at once, so a machine with no extension still
       *  gets its "not connected" answer immediately. */
      async waitForClient() {
        if (this.clients.size > 0) return;
        const left = this.attachedAt + CONNECT_GRACE_MS - Date.now();
        if (left <= 0) return;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, left);
          timer.unref?.();
          this.clientWaiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      status() {
        return {
          connected: this.clients.size > 0,
          clients: [...this.clients.values()].map((c) => ({
            clientId: c.clientId,
            profileId: c.profileId,
            profileName: c.profileName,
            extVersion: c.extVersion,
            connectedAt: new Date(c.connectedAt).toISOString(),
            tabCount: c.tabs.length
          }))
        };
      }
      /** List tabs across ALL connected clients, tagged with profile/client, and
       *  refresh the tabId → client ownership map used for routing. */
      async listTabs() {
        await this.waitForClient();
        const all = [];
        this.tabOwner.clear();
        this.collidingTabs.clear();
        await Promise.all(
          [...this.clients.values()].map(async (client) => {
            try {
              const res = await this.send(client, "list_tabs", {}) || { tabs: [] };
              const tagged = (res.tabs || []).map((t) => ({
                ...t,
                clientId: client.clientId,
                profileId: client.profileId,
                profileName: client.profileName
              }));
              client.tabs = tagged;
              for (const t of tagged) {
                const prev = this.tabOwner.get(t.id);
                if (prev !== void 0 && prev !== client.clientId) this.collidingTabs.add(t.id);
                this.tabOwner.set(t.id, client.clientId);
              }
              all.push(...tagged);
            } catch {
              client.tabs = [];
            }
          })
        );
        return { tabs: all, clients: this.status().clients };
      }
      /** Resolve which client should run a tab. Prefer an explicit clientId, else
       *  the ownership map, refreshing once if unknown. Errors clearly on ambiguity. */
      async resolveClient(tabId, clientId) {
        if (clientId) {
          const c = this.clients.get(clientId);
          if (!c) throw new Error(`No connected extension with clientId ${clientId}.`);
          return c;
        }
        await this.waitForClient();
        if (this.clients.size === 0) {
          throw new Error(NOT_CONNECTED_MESSAGE);
        }
        if (this.clients.size === 1) {
          return [...this.clients.values()][0];
        }
        let owner = this.tabOwner.get(tabId);
        if (!owner || this.collidingTabs.has(tabId)) {
          await this.listTabs();
          owner = this.tabOwner.get(tabId);
        }
        if (this.collidingTabs.has(tabId)) {
          throw new Error(
            `Tab id ${tabId} exists in more than one connected browser (separate browsers have independent tab-id spaces). Call \`tabs\` and pass the tab's clientId alongside tabId to pick the right one.`
          );
        }
        if (owner) {
          const c = this.clients.get(owner);
          if (c) return c;
        }
        throw new Error(
          `Could not determine which browser profile owns tab ${tabId}. Call \`tabs\` to refresh the list, then pass the tab's clientId alongside tabId.`
        );
      }
      /** Pick a client for a browser-level op that has no tabId (create tab, etc.).
       *  Explicit clientId wins; otherwise require exactly one connected profile. */
      async resolveClientNoTab(clientId) {
        if (clientId) {
          const c = this.clients.get(clientId);
          if (!c) throw new Error(`No connected extension with clientId ${clientId}.`);
          return c;
        }
        await this.waitForClient();
        if (this.clients.size === 0) {
          throw new Error(NOT_CONNECTED_MESSAGE);
        }
        if (this.clients.size === 1) return [...this.clients.values()][0];
        throw new Error(
          "Multiple browser profiles are connected \u2014 pass clientId to say which one to act in. Call `tabs` to see the profiles and their clientIds."
        );
      }
      /** Hot-reload every connected extension (chrome.runtime.reload) so new
       *  background.js takes effect without a manual chrome://extensions reload.
       *  Dev/iteration aid. Clients drop and auto-reconnect within ~seconds. */
      async reloadAll() {
        const clients = [...this.clients.values()];
        await Promise.all(clients.map((c) => this.send(c, "reload", {}).catch(() => {
        })));
        return { reloaded: clients.length };
      }
      /** Group tabs into a native Chrome tab group. */
      async groupTabs(tabIds, opts = {}, clientId) {
        const client = clientId ? await this.resolveClientNoTab(clientId) : await this.resolveClient(tabIds[0]);
        return this.send(client, "group_tabs", {
          tabIds,
          title: opts.title,
          color: opts.color,
          collapsed: opts.collapsed,
          groupId: opts.groupId
        });
      }
      /** Remove tabs from their group (chrome.tabs.ungroup). */
      async ungroupTabs(tabIds, clientId) {
        const client = clientId ? await this.resolveClientNoTab(clientId) : await this.resolveClient(tabIds[0]);
        return this.send(client, "ungroup_tabs", { tabIds });
      }
      /** Rename / recolor / collapse an existing group by id. */
      async updateGroup(groupId, opts, clientId) {
        const client = await this.resolveClientNoTab(clientId);
        return this.send(client, "update_group", { groupId, ...opts });
      }
      /** List all tab groups across the browser. */
      async listGroups(clientId) {
        const client = await this.resolveClientNoTab(clientId);
        return this.send(client, "list_groups", {});
      }
      /** Open a new tab in the user's real Chrome via chrome.tabs.create. */
      async createTab(url, opts = {}, clientId) {
        const client = await this.resolveClientNoTab(clientId);
        const res = await this.send(client, "create_tab", {
          url,
          active: opts.active,
          windowId: opts.windowId
        });
        return { tab: { ...res.tab, clientId: client.clientId, profileId: client.profileId, profileName: client.profileName }, clientId: client.clientId };
      }
      // ─── CDP relay plumbing ───────────────────────────────────────────
      /** Register the relay that owns (clientId, tabId). Throws if another relay
       *  already drives that tab — a loud error instead of a silent event steal. */
      addCdpListener(clientId, tabId, fn) {
        const key = cdpKey(clientId, tabId);
        if (this.cdpListeners.has(key)) {
          throw new Error(`Tab ${tabId} is already being driven by another pipeline. Retry when it finishes.`);
        }
        this.cdpListeners.set(key, fn);
      }
      removeCdpListener(clientId, tabId) {
        this.cdpListeners.delete(cdpKey(clientId, tabId));
      }
      async cdpAttach(tabId, clientId, focus) {
        const client = await this.resolveClient(tabId, clientId);
        const res = await this.send(client, "cdp_attach", { tabId, focus: !!focus }) || {
          targetInfo: null
        };
        return { targetInfo: res.targetInfo, clientId: client.clientId };
      }
      async cdpCommand(clientId, tabId, sessionId, method, params) {
        const client = this.clients.get(clientId);
        if (!client) throw new Error(`CDP: client ${clientId} is gone.`);
        return this.send(client, "cdp_command", { tabId, sessionId, method, params });
      }
      async cdpDetach(clientId, tabId) {
        const client = this.clients.get(clientId);
        if (!client) return;
        try {
          await this.send(client, "cdp_detach", { tabId });
        } catch {
        }
      }
    };
    extensionBridge = new ExtensionBridge();
  }
});

// src/lib/extension/cdp-relay.ts
var import_http, import_crypto8, log16, CdpRelay;
var init_cdp_relay = __esm({
  "src/lib/extension/cdp-relay.ts"() {
    "use strict";
    import_http = __toESM(require("http"));
    init_wrapper();
    import_crypto8 = require("crypto");
    init_bridge();
    init_logger();
    log16 = createLogger("cdp-relay");
    CdpRelay = class {
      constructor(tabId, clientId, focus) {
        this.tabId = tabId;
        this.clientId = clientId;
        this.focus = focus;
      }
      tabId;
      clientId;
      focus;
      httpServer = null;
      wss = null;
      pw = null;
      port = 0;
      path = `/cdp/${(0, import_crypto8.randomUUID)()}`;
      tabSessionId = "pw-tab-1";
      targetInfo = null;
      ownerClientId = "";
      // True only once addCdpListener succeeded — stop() must not remove a
      // listener that belongs to another relay driving the same tab.
      listenerRegistered = false;
      /** Attach the extension debugger, wire event forwarding, and start listening.
       *  Must complete BEFORE connectOverCDP is called. */
      async start() {
        const { targetInfo, clientId } = await extensionBridge.cdpAttach(this.tabId, this.clientId, this.focus);
        this.ownerClientId = clientId;
        this.targetInfo = targetInfo || {
          targetId: `iframer-${this.tabId}`,
          type: "page",
          title: "",
          url: ""
        };
        extensionBridge.addCdpListener(this.ownerClientId, this.tabId, (ev) => {
          this.sendToPw({
            method: ev.method,
            params: ev.params,
            sessionId: ev.sessionId || this.tabSessionId
          });
        });
        this.listenerRegistered = true;
        await new Promise((resolve, reject) => {
          this.httpServer = import_http.default.createServer((req, res) => {
            if (req.url === "/json/version" || req.url === "/json/version/") {
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify({
                  Browser: "Chrome/iframer-extension",
                  "Protocol-Version": "1.3",
                  "User-Agent": "iframer-cdp-relay/1.0",
                  "V8-Version": "",
                  "WebKit-Version": "",
                  webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}${this.path}`
                })
              );
              return;
            }
            res.writeHead(404);
            res.end();
          });
          this.httpServer.on("upgrade", (req) => {
            if (process.env.IFRAMER_RELAY_DEBUG) log16.info(`[relay] upgrade request url=${req.url}`);
          });
          this.wss = new import_websocket_server.default({ server: this.httpServer, path: this.path });
          this.wss.on("connection", (ws) => {
            if (process.env.IFRAMER_RELAY_DEBUG) log16.info(`[relay] playwright connected`);
            if (this.pw) {
              ws.close(4e3, "relay already has a client");
              return;
            }
            this.pw = ws;
            ws.on("message", (data) => this.onPwMessage(data));
            ws.on("close", () => {
              if (this.pw === ws) this.pw = null;
            });
            ws.on("error", () => {
            });
          });
          this.httpServer.on("error", reject);
          this.httpServer.listen(0, "127.0.0.1", () => {
            const addr = this.httpServer.address();
            this.port = typeof addr === "object" && addr ? addr.port : 0;
            resolve();
          });
        });
      }
      /** WS URL (used by the low-level protocol test). */
      cdpEndpoint() {
        return `ws://127.0.0.1:${this.port}${this.path}`;
      }
      /** HTTP DevTools endpoint — pass THIS to connectOverCDP so it fetches
       *  /json/version/ and discovers the ws url (the reliable path). */
      httpEndpoint() {
        return `http://127.0.0.1:${this.port}`;
      }
      sendToPw(msg) {
        if (this.pw && this.pw.readyState === import_websocket.default.OPEN) {
          try {
            this.pw.send(JSON.stringify(msg));
          } catch {
          }
        }
      }
      async onPwMessage(data) {
        if (process.env.IFRAMER_RELAY_DEBUG) log16.info(`[relay] raw pw msg (${data?.length ?? 0} bytes): ${data?.toString().slice(0, 120)}`);
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        const { id, sessionId, method, params } = msg;
        if (process.env.IFRAMER_RELAY_DEBUG) log16.info(`[relay] pw\u2192 ${method} (id=${id}, sess=${sessionId || "-"})`);
        if (!method) return;
        try {
          const result = await this.handleCdpCommand(method, params, sessionId);
          if (typeof id === "number") this.sendToPw({ id, sessionId, result });
        } catch (e) {
          if (typeof id === "number") {
            this.sendToPw({ id, sessionId, error: { message: e instanceof Error ? e.message : String(e) } });
          }
        }
      }
      async handleCdpCommand(method, params, sessionId) {
        switch (method) {
          case "Browser.getVersion":
            return { protocolVersion: "1.3", product: "Chrome/iframer-extension", userAgent: "iframer-cdp-relay/1.0" };
          case "Browser.setDownloadBehavior":
            return {};
          case "Browser.close":
            return {};
          // Disconnect without closing the user's Chrome.
          case "Target.setDiscoverTargets":
            return {};
          case "Target.getTargets":
            return { targetInfos: this.targetInfo ? [{ ...this.targetInfo, attached: true }] : [] };
          case "Target.setAutoAttach":
            if (!sessionId) {
              this.sendToPw({
                method: "Target.attachedToTarget",
                params: {
                  sessionId: this.tabSessionId,
                  targetInfo: { ...this.targetInfo, attached: true },
                  waitingForDebugger: false
                }
              });
              return {};
            }
            break;
          // child auto-attach (has sessionId) → forward so OOPIFs/workers attach
          case "Target.getTargetInfo":
            if (!sessionId) return { targetInfo: this.targetInfo };
            break;
        }
        const realSessionId = sessionId === this.tabSessionId ? void 0 : sessionId;
        if (method === "Page.captureScreenshot") {
          return this.captureScreenshotWithFallback(params, realSessionId);
        }
        return extensionBridge.cdpCommand(this.ownerClientId, this.tabId, realSessionId, method, params);
      }
      /** Screenshots need a compositor frame; a minimized/occluded window may
       *  never produce one, stalling the command indefinitely. Give the normal
       *  capture a short window, then fall back to fromSurface:false — capturing
       *  straight from the renderer, which works without a visible surface (at
       *  the cost of minor scale/color differences on some displays). */
      async captureScreenshotWithFallback(params, sessionId) {
        const base = params && typeof params === "object" ? { ...params } : {};
        const attempt = (p) => extensionBridge.cdpCommand(this.ownerClientId, this.tabId, sessionId, "Page.captureScreenshot", p);
        const first = attempt(base);
        first.catch(() => void 0);
        try {
          return await Promise.race([
            first,
            new Promise((_, reject) => {
              const t = setTimeout(() => reject(new Error("screenshot timed out (no compositor frame)")), 5e3);
              t.unref?.();
            })
          ]);
        } catch {
          return attempt({ ...base, fromSurface: false });
        }
      }
      async stop() {
        const ownedTab = this.listenerRegistered;
        if (ownedTab) {
          extensionBridge.removeCdpListener(this.ownerClientId, this.tabId);
          this.listenerRegistered = false;
        }
        try {
          this.wss?.clients.forEach((c) => {
            try {
              c.terminate();
            } catch {
            }
          });
        } catch {
        }
        try {
          this.pw?.terminate();
        } catch {
        }
        this.pw = null;
        const withTimeout = (fn) => new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              resolve();
            }
          };
          try {
            fn(finish);
          } catch {
            finish();
          }
          setTimeout(finish, 1e3).unref?.();
        });
        if (this.wss) await withTimeout((cb) => this.wss.close(cb));
        if (this.httpServer) await withTimeout((cb) => this.httpServer.close(cb));
        this.wss = null;
        this.httpServer = null;
        if (ownedTab) {
          try {
            await extensionBridge.cdpDetach(this.ownerClientId, this.tabId);
          } catch (e) {
            log16.warn(`cdp detach failed: ${e}`);
          }
        }
      }
    };
  }
});

// src/lib/execution/pipeline-executor.ts
function blankPipelineResult(pipeline, modeUsed, error) {
  return {
    ok: false,
    completedSteps: 0,
    totalSteps: pipeline.steps.length,
    results: [],
    obstacles: [],
    error: {
      failedAtStep: 0,
      failedStep: pipeline.steps[0],
      pageState: { url: "", title: "" },
      ...error
    },
    durationMs: 0,
    modeUsed,
    finalState: { url: "", title: "" }
  };
}
var import_playwright_core, log17, PipelineExecutor;
var init_pipeline_executor = __esm({
  "src/lib/execution/pipeline-executor.ts"() {
    "use strict";
    init_site_protection();
    import_playwright_core = require("playwright-core");
    init_daemon();
    init_pipeline();
    init_crypto();
    init_persistence();
    init_block_detection();
    init_extract_from_run();
    init_page_state();
    init_config();
    init_errors();
    init_logger();
    init_cdp_relay();
    log17 = createLogger("iframer");
    PipelineExecutor = class {
      constructor(deps) {
        this.deps = deps;
      }
      deps;
      /** Shared runtime hook read by local and extension execution;
       *  execute() clears it when the call finishes. */
      pendingElicitOtp;
      /** One pipeline per real tab at a time: chrome.debugger and the CDP relay
       *  can't share a tab, so concurrent executes on the same tab queue up here. */
      extensionTabLocks = /* @__PURE__ */ new Map();
      async execute(userId, token, pipeline, runtime) {
        this.pendingElicitOtp = runtime?.elicitOtp;
        try {
          return await this.executeInner(userId, token, pipeline);
        } finally {
          this.pendingElicitOtp = void 0;
        }
      }
      async executeInner(userId, token, pipeline) {
        const opts = pipeline.options || {};
        if (typeof opts.extensionTabId === "number") {
          const tabId = opts.extensionTabId;
          const lockKey = `${opts.clientId || "auto"}:${tabId}`;
          const prev = this.extensionTabLocks.get(lockKey);
          const run2 = (prev ? prev.catch(() => void 0) : Promise.resolve()).then(
            () => this.executeExtension(userId, token, pipeline, tabId, opts.clientId)
          );
          this.extensionTabLocks.set(lockKey, run2);
          run2.catch(() => void 0).finally(() => {
            if (this.extensionTabLocks.get(lockKey) === run2) this.extensionTabLocks.delete(lockKey);
          });
          return run2;
        }
        const forcedMode = opts.mode;
        const autoEscalate = opts.autoEscalate !== false;
        const instanceId = opts.instanceId || DEFAULT_INSTANCE;
        if (forcedMode === "extension") {
          return blankPipelineResult(pipeline, "extension", {
            errorType: "action-failed",
            message: 'mode="extension" requires options.tabId (the real-Chrome tab to drive).',
            suggestion: "Call the `tabs` tool (or GET /extension/tabs) to list open tabs, then pass that tab id. Nothing was launched.",
            retryable: false
          });
        }
        const firstNav = pipeline.steps.find((s) => s.type === "navigate");
        const domain = firstNav ? new URL(firstNav.url).hostname : null;
        if (!firstNav && !this.deps.daemon.findLiveMode(instanceId)) {
          return blankPipelineResult(pipeline, forcedMode || "headless", {
            errorType: "action-failed",
            message: `No navigate step and no live browser for instanceId "${instanceId}" to act on.`,
            suggestion: "Add a navigate step, or reattach to a live window (check `status` / `iframer instances` for instanceId). To drive a real Chrome tab, pass options.tabId from the `tabs` tool. Nothing was launched.",
            retryable: false
          });
        }
        const availableModes = this.deps.availableModes();
        const liveMode = forcedMode ? null : this.deps.daemon.findLiveMode(instanceId);
        let mode;
        if (forcedMode && availableModes.includes(forcedMode)) {
          mode = forcedMode;
        } else if (liveMode) {
          mode = liveMode;
        } else if (domain) {
          mode = this.deps.domainModes.getBestMode(domain, availableModes);
        } else {
          mode = availableModes[0] || "headless";
        }
        let result = await this.executeWithMode(userId, token, pipeline, mode, instanceId);
        mode = result.modeUsed || mode;
        if (!result.ok && autoEscalate && domain && result.error?.errorType === "bot-blocked") {
          const failedMode = mode;
          if (domain) this.deps.domainModes.recordFailure(domain, failedMode, result.error?.message || "blocked");
          const nextMode = this.deps.domainModes.getNextMode(failedMode, availableModes);
          if (nextMode) {
            log17.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);
            await this.deps.daemon.stopMode(failedMode, instanceId);
            result = await this.executeWithMode(userId, token, pipeline, nextMode, instanceId);
            result.modeEscalated = true;
            result.modeUsed = nextMode;
            if (result.ok && domain) {
              this.deps.domainModes.recordSuccess(domain, nextMode);
            } else if (!result.ok && domain && result.error?.errorType === "bot-blocked") {
              this.deps.domainModes.recordFailure(domain, nextMode, result.error?.message || "blocked");
              const thirdMode = this.deps.domainModes.getNextMode(nextMode, availableModes);
              if (thirdMode) {
                log17.info(`Auto-escalating from ${nextMode} to ${thirdMode} for ${domain}`);
                await this.deps.daemon.stopMode(nextMode, instanceId);
                result = await this.executeWithMode(userId, token, pipeline, thirdMode, instanceId);
                result.modeEscalated = true;
                result.modeUsed = thirdMode;
                if (result.ok && domain) {
                  this.deps.domainModes.recordSuccess(domain, thirdMode);
                }
              }
            }
          }
        } else if (result.ok && domain) {
          this.deps.domainModes.recordSuccess(domain, mode);
        }
        return result;
      }
      async executeWithMode(userId, token, pipeline, mode, instanceId = DEFAULT_INSTANCE, respectful = false) {
        return this.executeLocal(userId, token, pipeline, mode, instanceId, respectful);
      }
      /** Execute against the user's real Chrome tab via the extension CDP relay,
       *  using the SAME PipelineRunner as every other mode. No session inject/extract
       *  (the real profile owns auth) and no escalation (can't escalate a live tab). */
      async executeExtension(userId, token, pipeline, tabId, clientId) {
        const startTime = Date.now();
        const relay = new CdpRelay(tabId, clientId, pipeline.options?.focus);
        let browser;
        let runner;
        try {
          await relay.start();
          browser = await import_playwright_core.chromium.connectOverCDP(relay.httpEndpoint(), { timeout: 3e4 });
          const context = browser.contexts()[0];
          if (!context) throw new Error("no CDP browser context for the tab");
          let page = context.pages()[0];
          if (!page) {
            page = await context.waitForEvent("page", { timeout: 5e3 }).catch(() => void 0);
          }
          if (!page) throw new Error("no page available for the tab (is it still open?)");
          const ctx = this.deps.refStore.makeContext(userId, token);
          if (this.pendingElicitOtp) ctx.elicitOtp = this.pendingElicitOtp;
          ctx.driver = "extension";
          runner = new PipelineRunner(ctx);
          const typeChars = pipeline.steps.reduce((n, s) => {
            const v = s.value;
            return (s.type === "human-type" || s.type === "type-code") && typeof v === "string" ? n + v.length : n;
          }, 0);
          const capMs = Math.min(6e4 + pipeline.steps.length * 15e3 + typeChars * 250, 12e5);
          let watchdog;
          let result;
          try {
            const runPromise = runner.run(page, pipeline);
            runPromise.catch(() => void 0);
            result = await Promise.race([
              runPromise,
              new Promise((_, reject) => {
                watchdog = setTimeout(
                  () => reject(
                    new Error(
                      `pipeline exceeded ${Math.round(capMs / 1e3)}s \u2014 a call into the tab never returned.`
                    )
                  ),
                  capMs
                );
                watchdog.unref?.();
              })
            ]);
          } finally {
            if (watchdog) clearTimeout(watchdog);
          }
          this.deps.refStore.sync(userId, ctx);
          result.modeUsed = "extension";
          if (result.ok) {
            try {
              extractKnowledgeFromRun(pipeline, result, null, "extension");
            } catch (e) {
              log17.warn(`knowledge update failed: ${getErrorMessage(e)}`);
            }
          }
          return result;
        } catch (err) {
          const msg = getErrorMessage(err);
          const stalled = msg.includes("pipeline exceeded");
          const done = runner ? runner.progress.results.filter((r) => r.ok) : [];
          const hungAt = stalled && runner && runner.progress.stepIndex >= 0 ? runner.progress.stepIndex : 0;
          const hungStep = pipeline.steps[hungAt];
          return {
            ok: false,
            completedSteps: stalled ? done.length : 0,
            totalSteps: pipeline.steps.length,
            results: stalled ? done : [],
            finalState: { url: "", title: "" },
            obstacles: [],
            durationMs: Date.now() - startTime,
            modeUsed: "extension",
            error: {
              failedAtStep: hungAt,
              failedStep: hungStep,
              errorType: stalled ? "stale-state" : "action-failed",
              message: stalled ? `Extension mode: step ${hungAt} (${hungStep?.type}) never returned; ${msg}` : `Extension mode failed: ${msg}`,
              pageState: { url: "", title: "" },
              suggestion: stalled ? `Step ${hungAt} (${hungStep?.type}) hung inside the tab. Steps before it completed. Run a single \`read\` or \`snapshot\` on its own to check the tab recovered (it usually does), then continue from that step in its own execute call. Don't repeat the same step unchanged: for a route change use \`evaluate\` with \`location.assign(url)\`, for a click use a fresh \`@e\` ref from \`find\`. If the tab stays unresponsive, tell the user.` : "Ensure the iframer extension is connected (green dot) and the tab is still open. See chrome://extensions.",
              retryable: stalled
            }
          };
        } finally {
          try {
            if (browser) await browser.close();
          } catch {
          }
          try {
            await relay.stop();
          } catch {
          }
        }
      }
      /** Execute via local Chrome daemon (headless + binary-headful). */
      async executeLocal(userId, token, pipeline, mode, instanceId = DEFAULT_INSTANCE, respectful = false) {
        const startTime = Date.now();
        let acquired = false;
        try {
          const sessionProfile = pipeline.options?.sessionProfile || instanceId;
          const { page } = await this.deps.daemon.ensure(mode, instanceId, sessionProfile);
          this.deps.daemon.acquire(mode, instanceId);
          acquired = true;
          const storeKey = sessionStoreKey(userId, sessionProfile);
          const encryptionKey = await deriveKey(token);
          const blob = await this.deps.store.getSession(storeKey);
          let sessionData = null;
          if (blob && blob.length > 0) {
            try {
              sessionData = JSON.parse(decrypt(blob, encryptionKey));
              await injectCookies(page.context(), sessionData);
            } catch {
            }
          }
          const ctx = this.deps.refStore.makeContext(userId, token);
          if (sessionData) ctx.sessionData = sessionData;
          if (this.pendingElicitOtp) ctx.elicitOtp = this.pendingElicitOtp;
          const runner = new PipelineRunner(ctx, protectionHooks(mode === "headless", respectful));
          let result;
          try {
            result = await runner.run(page, pipeline);
          } catch (err) {
            if (!(err instanceof HeadedRequiredError)) throw err;
            this.deps.daemon.release(mode, instanceId);
            acquired = false;
            await this.deps.daemon.stopMode(mode, instanceId);
            const available = this.deps.availableModes();
            const headed = "binary-headful";
            if (!available.includes(headed)) throw new Error("A headed browser is required but unavailable.");
            await new Promise((resolve) => setTimeout(resolve, PROTECTED_INTERVAL_MS));
            const index = err.stepIndex;
            const remaining = pipeline.steps.slice(index);
            const insertedNavigation = remaining[0]?.type !== "navigate";
            if (insertedNavigation) remaining.unshift({ type: "navigate", url: err.url });
            const resumed = await this.executeWithMode(userId, token, { ...pipeline, steps: remaining }, headed, instanceId, true);
            const offset = index - Number(insertedNavigation);
            resumed.results = [...err.results, ...resumed.results.filter((r) => !insertedNavigation || r.stepIndex > 0).map((r) => ({ ...r, stepIndex: r.stepIndex + offset }))];
            resumed.completedSteps = index + Math.max(0, resumed.completedSteps - Number(insertedNavigation));
            resumed.totalSteps = pipeline.steps.length;
            resumed.obstacles = [...err.obstacles, ...resumed.obstacles];
            if (resumed.error) {
              resumed.error.failedAtStep = Math.max(index, resumed.error.failedAtStep + offset);
              resumed.error.failedStep = pipeline.steps[resumed.error.failedAtStep];
            }
            resumed.durationMs = Date.now() - startTime;
            resumed.modeEscalated = true;
            resumed.modeUsed = headed;
            return resumed;
          }
          if (result.ok) {
            const blockResult = await detectBlock(page);
            if (blockResult.blocked) {
              const pageState = await capturePageState(page, ctx, { screenshot: true, namePrefix: "block" });
              return {
                ...result,
                ok: false,
                modeUsed: mode,
                error: {
                  failedAtStep: result.completedSteps - 1,
                  failedStep: pipeline.steps[result.completedSteps - 1],
                  errorType: "bot-blocked",
                  message: `Page blocked by bot detection: ${blockResult.reason}`,
                  pageState,
                  suggestion: `The page was blocked in ${mode} mode. ${mode === "headless" ? "Try binary-headful mode." : "All modes exhausted."}`,
                  retryable: true
                }
              };
            }
          }
          let updatedSession = null;
          if (result.ok) {
            try {
              updatedSession = await extractSession(page.context(), page);
              const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
              await this.deps.store.setSession(storeKey, encrypted);
            } catch {
            }
          }
          if (result.ok) {
            try {
              extractKnowledgeFromRun(pipeline, result, updatedSession, mode);
            } catch (err) {
              log17.warn(`knowledge update failed: ${getErrorMessage(err)}`);
            }
          }
          this.deps.refStore.sync(userId, ctx);
          result.modeUsed = mode;
          return result;
        } catch (err) {
          return {
            ok: false,
            completedSteps: 0,
            totalSteps: pipeline.steps.length,
            results: [],
            finalState: { url: "", title: "" },
            obstacles: [],
            error: {
              failedAtStep: 0,
              failedStep: pipeline.steps[0],
              errorType: "action-failed",
              message: `Failed to launch browser in ${mode} mode: ${getErrorMessage(err)}`,
              pageState: { url: "", title: "" },
              suggestion: `Browser launch failed. ${mode === "binary-headful" ? "Make sure a display is available." : "Check Chrome installation."}`,
              retryable: true
            },
            durationMs: Date.now() - startTime,
            modeUsed: mode
          };
        } finally {
          if (acquired) this.deps.daemon.release(mode, instanceId);
        }
      }
    };
  }
});

// src/lib/execution/fetch-service.ts
var FetchService;
var init_fetch_service = __esm({
  "src/lib/execution/fetch-service.ts"() {
    "use strict";
    init_site_protection();
    init_launcher();
    init_launcher();
    init_stealth();
    init_humanize();
    init_crypto();
    init_persistence();
    init_constants();
    init_errors();
    FetchService = class {
      constructor(store) {
        this.store = store;
      }
      store;
      async fetch(userId, token, request) {
        const { url, browser: preferredBrowser, waitUntil = "domcontentloaded", waitForSelector, extract: extract2, actions = [], returnHtml = false, headers = {}, locale = "pt-BR", sessionless = false } = request;
        const useSession = !sessionless && !!userId && !!token;
        const startedAt = Date.now();
        let context = null;
        try {
          let sessionData = null;
          let encryptionKey = null;
          if (useSession) {
            encryptionKey = await deriveKey(token);
            const blob = await this.store.getSession(userId);
            if (blob && blob.length > 0) {
              sessionData = JSON.parse(decrypt(blob, encryptionKey));
            }
          }
          const { browser, name: browserName } = await getBrowserWithFallback(preferredBrowser);
          context = await browser.newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? void 0));
          if (sessionData) await injectCookies(context, sessionData);
          let page = await context.newPage();
          await applyStealthToPage(page);
          await page.goto(url, { waitUntil: waitUntil || "domcontentloaded", timeout: TIMEOUTS.NAVIGATION });
          let protection = false;
          const pivotIfDetected = async () => {
            if (protection || !await detectSiteProtection(page)) return;
            protection = true;
            const targetUrl = page.url();
            const cookies = await context.cookies();
            await context.close();
            context = await (await getHeadedBrowser()).newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? void 0));
            await context.addCookies(cookies);
            page = await context.newPage();
            await applyStealthToPage(page);
            await new Promise((resolve) => setTimeout(resolve, PROTECTED_INTERVAL_MS));
            await paceProtectedDomain(new URL(targetUrl).hostname);
            await page.goto(targetUrl, { waitUntil, timeout: TIMEOUTS.NAVIGATION });
          };
          await pivotIfDetected();
          if (sessionData) await injectStorage(page, sessionData);
          if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });
          for (const action of actions) {
            await pivotIfDetected();
            if (protection) await paceProtectedDomain(new URL(page.url()).hostname);
            switch (action.type) {
              case "click":
                await page.click(action.selector);
                break;
              case "fill":
                await page.fill(action.selector, action.value);
                break;
              case "wait":
                await page.waitForTimeout(action.ms);
                break;
              case "scroll":
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                break;
              case "human-click":
                await humanClick(page, action.selector);
                break;
              case "human-type":
                await humanType(page, action.selector, action.value);
                break;
              case "recaptcha-click":
                await clickRecaptchaCheckbox(page);
                break;
              case "recaptcha-select":
                await clickChallengeTiles(page, action.tiles);
                break;
              case "recaptcha-verify":
                await clickChallengeVerify(page);
                break;
            }
          }
          await pivotIfDetected();
          const finalUrl = page.url();
          const html = returnHtml ? await page.content() : void 0;
          const result = extract2 ? await page.evaluate(extract2) : void 0;
          if (useSession) {
            const updatedSession = await extractSession(context, page);
            const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
            await this.store.setSession(userId, encrypted);
          }
          return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
        } catch (err) {
          return { ok: false, browser: "unknown", url, error: getErrorMessage(err), durationMs: Date.now() - startedAt };
        } finally {
          if (context) await context.close();
        }
      }
    };
  }
});

// src/lib/execution/capture-manager.ts
var CaptureManager;
var init_capture_manager = __esm({
  "src/lib/execution/capture-manager.ts"() {
    "use strict";
    init_daemon();
    init_api_capture();
    CaptureManager = class {
      constructor(daemon) {
        this.daemon = daemon;
      }
      daemon;
      captures = /* @__PURE__ */ new Map();
      async startCapture(mode = "binary-headful", instanceId = DEFAULT_INSTANCE) {
        const key = `${mode}::${instanceId}`;
        if (this.captures.has(key)) {
          return { ok: true, message: `Capture already running on ${key}. Call capture-stop to flush.` };
        }
        const { page } = await this.daemon.ensure(mode, instanceId);
        const capture = new ApiCapture(page);
        capture.start();
        this.captures.set(key, capture);
        return { ok: true, message: `Capture started on ${key}. Use 'session capture-stop' when ready to collect results.` };
      }
      async stopCapture(mode = "binary-headful", instanceId = DEFAULT_INSTANCE) {
        const key = `${mode}::${instanceId}`;
        const capture = this.captures.get(key);
        if (!capture) {
          return { ok: false, capturedApi: void 0, message: `No active capture on ${key}. Start one with 'session capture-start'.` };
        }
        capture.stop();
        this.captures.delete(key);
        const capturedApi = capture.getResults();
        const total = capturedApi.reduce((n, a) => n + a.endpoints.length, 0);
        return { ok: true, capturedApi, message: `Capture stopped. ${total} endpoints across ${capturedApi.length} domain(s).` };
      }
      /** Extract all cookies from the browser context via CDP — includes HttpOnly/Secure.
       *  No JS sandbox restrictions. Pass urls to scope (e.g. ['https://youtube.com']). */
      async getCookies(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
        const { context } = await this.daemon.ensure(mode, instanceId);
        const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();
        return { ok: true, cookies, message: `${cookies.length} cookies extracted via CDP.` };
      }
      /** Extract cookies + localStorage + sessionStorage in one shot. */
      async getFullAuth(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
        const { context, page } = await this.daemon.ensure(mode, instanceId);
        const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();
        const localStorage = {};
        const sessionStorage2 = {};
        try {
          const stores = await page.evaluate(() => {
            const ls = {};
            const ss = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              ls[k] = window.localStorage.getItem(k) ?? "";
            }
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const k = window.sessionStorage.key(i);
              ss[k] = window.sessionStorage.getItem(k) ?? "";
            }
            return { origin: window.location.origin, ls, ss };
          });
          localStorage[stores.origin] = stores.ls;
          sessionStorage2[stores.origin] = stores.ss;
        } catch {
        }
        return {
          ok: true,
          cookies,
          localStorage,
          sessionStorage: sessionStorage2,
          message: `${cookies.length} cookies, ${Object.values(localStorage).reduce((n, s) => n + Object.keys(s).length, 0)} localStorage keys, ${Object.values(sessionStorage2).reduce((n, s) => n + Object.keys(s).length, 0)} sessionStorage keys.`
        };
      }
    };
  }
});

// src/lib/auth/credential-store.ts
var CredentialStore;
var init_credential_store = __esm({
  "src/lib/auth/credential-store.ts"() {
    "use strict";
    init_crypto();
    init_credential_resolver();
    init_knowledge();
    CredentialStore = class {
      constructor(store) {
        this.store = store;
      }
      store;
      async storeCredential(userId, token, credential) {
        const credKey = await deriveKey(token, "credentials");
        const normalizedDomain = normalizeDomain(credential.domain);
        const data = {
          ...credential,
          domain: normalizedDomain,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const encrypted = encrypt(JSON.stringify(data), credKey);
        await this.store.setCredential(userId, normalizedDomain, encrypted);
      }
      async getCredential(userId, token, domain) {
        const resolved = await resolveCredential(this.store, userId, token, domain);
        return resolved?.credential ?? null;
      }
      async listCredentials(userId) {
        return this.store.listCredentialDomains(userId);
      }
      async deleteCredential(userId, domain) {
        await this.store.deleteCredential(userId, normalizeDomain(domain));
      }
    };
  }
});

// src/lib/iframer.ts
var iframer_exports = {};
__export(iframer_exports, {
  Iframer: () => Iframer
});
var log18, DEFAULT_PUBLIC_URL, DEFAULT_STALE_TIMEOUT_MS3, Iframer;
var init_iframer = __esm({
  "src/lib/iframer.ts"() {
    "use strict";
    init_paths();
    init_launcher();
    init_crypto();
    init_persistence();
    init_storage();
    init_daemon();
    init_domain_modes();
    init_cdp_launcher();
    init_logger();
    init_errors();
    init_config();
    init_ref_store();
    init_pipeline_executor();
    init_fetch_service();
    init_capture_manager();
    init_credential_store();
    log18 = createLogger("iframer");
    DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3022}`;
    DEFAULT_STALE_TIMEOUT_MS3 = 2e4;
    Iframer = class {
      store;
      daemon;
      domainModes;
      config;
      refStore;
      executor;
      fetchService;
      captureManager;
      credentials;
      constructor(config = {}) {
        this.config = {
          screenshotDir: config.screenshotDir || getScreenshotDir(),
          publicUrl: config.publicUrl || DEFAULT_PUBLIC_URL,
          staleTimeoutMs: config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS3
        };
        this.store = createStore({ dataDir: config.dataDir });
        this.daemon = new BrowserDaemon(config.sessionTimeoutMs);
        this.domainModes = new DomainModeStore();
        this.refStore = new RefStore(this.store, this.config);
        this.fetchService = new FetchService(this.store);
        this.captureManager = new CaptureManager(this.daemon);
        this.credentials = new CredentialStore(this.store);
        this.executor = new PipelineExecutor({
          daemon: this.daemon,
          store: this.store,
          domainModes: this.domainModes,
          refStore: this.refStore,
          availableModes: () => this.getAvailableModes()
        });
      }
      // ─── Mode Detection ─────────────────────────────────────────────────
      getAvailableModes() {
        const modes = ["headless"];
        const { binaryHeadful } = checkModeAvailability();
        if (binaryHeadful) modes.push("binary-headful");
        return modes;
      }
      async getModeAvailability() {
        const { binaryHeadful } = checkModeAvailability();
        return {
          headless: { available: true },
          "binary-headful": {
            available: binaryHeadful,
            reason: binaryHeadful ? void 0 : "No display available"
          }
        };
      }
      // ─── Headless Fetch ──────────────────────────────────────────────
      fetch(userId, token, request) {
        return this.fetchService.fetch(userId, token, request);
      }
      // ─── Pipeline Execution ──────────────────────────────────────────
      execute(userId, token, pipeline, runtime) {
        return this.executor.execute(userId, token, pipeline, runtime);
      }
      // ─── Sessions ────────────────────────────────────────────────────
      async stopSession(userId, token) {
        let sessionSaved = false;
        if (token) {
          const encryptionKey = await deriveKey(token);
          for (const inst of this.daemon.liveInstances()) {
            try {
              const data = await extractSession(inst.context, inst.page);
              if (data) {
                const encrypted = encrypt(JSON.stringify(data), encryptionKey);
                await this.store.setSession(sessionStoreKey(userId, inst.sessionProfile ?? inst.instanceId), encrypted);
                sessionSaved = true;
              }
            } catch (err) {
              log18.warn(`stopSession: failed to extract daemon state for ${inst.mode}::${inst.instanceId}: ${getErrorMessage(err)}`);
            }
          }
        }
        await this.daemon.stopAll();
        return { ok: true, sessionSaved };
      }
      // ─── Persistent Capture / Auth extraction ────────────────────────
      startCapture(mode = "binary-headful", instanceId = DEFAULT_INSTANCE) {
        return this.captureManager.startCapture(mode, instanceId);
      }
      stopCapture(mode = "binary-headful", instanceId = DEFAULT_INSTANCE) {
        return this.captureManager.stopCapture(mode, instanceId);
      }
      getCookies(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
        return this.captureManager.getCookies(mode, urls, instanceId);
      }
      getFullAuth(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
        return this.captureManager.getFullAuth(mode, urls, instanceId);
      }
      // ─── Browser health / lifecycle ──────────────────────────────────
      /** Check if any browser is alive and connected (across all named instances). */
      browserHealth() {
        const modes = this.daemon.runningModes();
        return { alive: modes.length > 0, modes };
      }
      /** Live daemon browsers (which page each is on) so an agent can reattach a
       *  task's window by instanceId after an interrupt instead of re-navigating. */
      listInstances() {
        return this.daemon.instancesInfo();
      }
      /** Close browsers that never navigated anywhere. See
       *  BrowserDaemon.sweepBlankInstances — called from the server's reap tick. */
      sweepBlankBrowsers() {
        return this.daemon.sweepBlankInstances();
      }
      /** Kill all browser instances and reset state. Next execute call will
       *  launch a fresh browser automatically — no manual restart needed. */
      async restartBrowser() {
        const health = this.browserHealth();
        await this.daemon.stopAll(true);
        return {
          killed: health.modes,
          message: health.modes.length > 0 ? `Killed browser(s): ${health.modes.join(", ")}. Next execute call will launch a fresh instance.` : "No browsers were running. Next execute call will launch fresh."
        };
      }
      // ─── Credentials ─────────────────────────────────────────────────
      storeCredential(userId, token, credential) {
        return this.credentials.storeCredential(userId, token, credential);
      }
      getCredential(userId, token, domain) {
        return this.credentials.getCredential(userId, token, domain);
      }
      listCredentials(userId) {
        return this.credentials.listCredentials(userId);
      }
      deleteCredential(userId, domain) {
        return this.credentials.deleteCredential(userId, domain);
      }
      // ─── Session Data ─────────────────────────────────────────────────
      async clearSession(userId) {
        await this.store.deleteSession(userId);
      }
      // ─── Lifecycle ───────────────────────────────────────────────────
      async shutdown() {
        await this.daemon.stopAll(true);
        await closeBrowser();
        if ("close" in this.store && typeof this.store.close === "function") {
          this.store.close();
        }
      }
    };
  }
});

// src/lib/extension/native-host-setup.cjs
var require_native_host_setup = __commonJS({
  "src/lib/extension/native-host-setup.cjs"(exports2, module2) {
    "use strict";
    var { spawn: spawn3 } = require("child_process");
    var HOST_NAME = "com.iframer.token";
    var WINDOWS_BROWSERS = [
      { browser: "Chrome", root: "Software\\Google\\Chrome" },
      { browser: "Chromium", root: "Software\\Chromium" },
      { browser: "Edge", root: "Software\\Microsoft\\Edge" },
      { browser: "Brave", root: "Software\\BraveSoftware\\Brave-Browser" },
      { browser: "Vivaldi", root: "Software\\Vivaldi" }
    ];
    function windowsRegistryKey(root) {
      return `HKCU\\${root}\\NativeMessagingHosts\\${HOST_NAME}`;
    }
    function windowsWrapper({ execPath, homeDir, dataDir }) {
      const esc = (s) => s.replace(/%/g, "%%");
      const prefix = homeDir.toLowerCase().replace(/[\\/]+$/, "") + "\\";
      const fromHome = (p) => p.toLowerCase().startsWith(prefix) ? `%USERPROFILE%\\${esc(p.slice(prefix.length))}` : esc(p);
      return [
        "@echo off",
        "chcp 65001 >nul",
        ...dataDir ? [`set "IFRAMER_DATA_DIR=${fromHome(dataDir)}"`] : [],
        `set "NODE_BIN=${fromHome(execPath)}"`,
        'if not exist "%NODE_BIN%" set "NODE_BIN=node"',
        '"%NODE_BIN%" "%~dp0extension-token-host.cjs"',
        ""
      ].join("\r\n");
    }
    function posixWrapper({ execPath, hostScript, dataDir }) {
      return [
        "#!/bin/sh",
        ...dataDir ? [`export IFRAMER_DATA_DIR="${dataDir}"`] : [],
        `for BIN in "${execPath}" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do`,
        `  [ -n "$BIN" ] && [ -x "$BIN" ] && exec "$BIN" "${hostScript}"`,
        "done",
        "exit 1",
        ""
      ].join("\n");
    }
    function hostManifest(wrapperPath, extensionId) {
      return JSON.stringify(
        {
          name: HOST_NAME,
          description: "iframer pairing-token host",
          path: wrapperPath,
          type: "stdio",
          allowed_origins: [`chrome-extension://${extensionId}/`]
        },
        null,
        2
      );
    }
    function testHost(wrapperPath, { timeoutMs = 15e3, platform = process.platform, env = process.env } = {}) {
      return new Promise((resolve) => {
        let child;
        let settled = false;
        let timer;
        let stderr = "";
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            child.kill();
          } catch {
          }
          resolve(result);
        };
        try {
          child = platform === "win32" ? spawn3("cmd.exe", ["/d", "/s", "/c", `"${wrapperPath}"`], { env, windowsVerbatimArguments: true, windowsHide: true }) : spawn3(wrapperPath, [], { env });
        } catch (e) {
          finish({ ok: false, error: e.message });
          return;
        }
        timer = setTimeout(() => finish({ ok: false, error: `no answer within ${timeoutMs}ms` }), timeoutMs);
        child.on("error", (e) => finish({ ok: false, error: e.message }));
        child.stderr.on("data", (d) => {
          stderr += d;
        });
        child.on("exit", (code) => {
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
        child.stdin.on("error", () => {
        });
        child.stdin.write(Buffer.concat([header, payload]));
      });
    }
    module2.exports = {
      HOST_NAME,
      WINDOWS_BROWSERS,
      windowsRegistryKey,
      windowsWrapper,
      posixWrapper,
      hostManifest,
      testHost
    };
  }
});

// src/lib/format-result.ts
var format_result_exports = {};
__export(format_result_exports, {
  formatExecuteResult: () => formatExecuteResult
});
function resultOf(r, _type) {
  return r.result;
}
function captchaBlocked(data) {
  if (data.error?.errorType === "captcha-unsolvable") return true;
  return (data.obstacles || []).some(
    (o) => (o.type === "captcha" || o.type === "hcaptcha") && !o.resolved
  );
}
function formatExecuteResult(data) {
  const lines = [];
  lines.push(`ok: ${data.ok}`);
  lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
  if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);
  if (data.modeUsed) lines.push(`mode: ${data.modeUsed}${data.modeEscalated ? " (auto-escalated)" : ""}`);
  if (data.finalState) {
    lines.push(`
Final page: ${data.finalState.title}`);
    lines.push(`URL: ${data.finalState.url}`);
  }
  for (const r of data.results || []) {
    if (r.tabSwitchedTo) {
      lines.push(`
\u21B3 step ${r.stepIndex} opened a new tab \u2014 pipeline is now on: ${r.tabSwitchedTo}`);
    }
  }
  const meaningful = (data.results || []).filter((r) => r.ok && r.result !== void 0 && r.result !== null);
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
      if (res?.text !== void 0) {
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
    lines.push("\nObstacles handled:");
    for (const o of data.obstacles) {
      lines.push(`  [step ${o.detectedAtStep}] ${o.type}: ${o.resolved ? o.resolution : "UNRESOLVED - " + (o.resolution || "unknown")}`);
    }
  }
  if (data.capturedApi && data.capturedApi.length > 0) {
    lines.push("\n--- Captured API ---");
    for (const api of data.capturedApi) {
      lines.push(`
${api.domain} (${api.baseUrl})`);
      lines.push("  Endpoints:");
      for (const ep of api.endpoints) {
        lines.push(`    ${ep.method} ${ep.path}  [step ${ep.triggeredAtStep}, status ${ep.responseStatus}]`);
      }
    }
  }
  const serverErrors = (data.results || []).flatMap((r) => r.serverErrors || []);
  if (serverErrors.length > 0) {
    lines.push("\n--- Server errors (HTTP >= 400) ---");
    for (const se of serverErrors) {
      lines.push(`  [step ${se.stepIndex}] ${se.method} ${se.url} \u2192 ${se.status}${se.body ? `: ${se.body}` : ""}`);
    }
  }
  if (data.error) {
    lines.push("\n--- Failure ---");
    if (typeof data.error === "string") {
      lines.push(`Error: ${data.error}`);
    } else {
      lines.push(`Failed at step ${data.error.failedAtStep}: ${JSON.stringify(data.error.failedStep)}`);
      lines.push(`Error type: ${data.error.errorType}`);
      lines.push(`Message: ${data.error.message}`);
      lines.push(`Retryable: ${data.error.retryable}`);
      if (data.error.suggestion) lines.push(`Suggestion: ${data.error.suggestion}`);
      const atFailure = serverErrors.filter((se) => se.stepIndex === data.error?.failedAtStep);
      for (const se of atFailure) {
        lines.push(`Server responded: ${se.method} ${se.url} \u2192 ${se.status}${se.body ? `: ${se.body}` : ""}`);
      }
      if (data.error.pageState?.url) lines.push(`URL at failure: ${data.error.pageState.url}`);
    }
  }
  if (captchaBlocked(data)) {
    lines.push(RECAPTCHA_MANUAL);
  }
  return lines;
}
var RECAPTCHA_MANUAL;
var init_format_result = __esm({
  "src/lib/format-result.ts"() {
    "use strict";
    RECAPTCHA_MANUAL = `
--- Captcha workflow ---
A captcha is blocking this run. Use the "recaptcha" step with an action:
  {type:"recaptcha", action:"info"}                \u2192 state + instruction + tile-grid screenshot
  {type:"recaptcha", action:"click"}               \u2192 click the "I'm not a robot" checkbox
  {type:"recaptcha", action:"answer", tiles:[...]} \u2192 select tiles + verify + re-check (handles refreshing grids)
  {type:"recaptcha", action:"select"|"verify"}     \u2192 manual tile-select / submit, if you need finer control
  {type:"recaptcha", action:"solve"}               \u2192 automatic vision solve (needs ANTHROPIC_API_KEY)
Or {type:"solve-captcha"} for one-shot auto-detect + solve (needs ANTHROPIC_API_KEY).
In binary-headful mode, prefer asking the user to solve it in the visible window.`;
  }
});

// src/lib/kit/page-kit.ts
function pageKit(opts) {
  opts = opts || {};
  var w = window;
  var VERSION = 1;
  var KEY = "__ifk_state";
  if (w.__ifk && w.__ifk.version === VERSION) {
    var s0 = w.__ifk.summary();
    return { installed: true, again: true, version: VERSION, seen: s0.seen };
  }
  var mode = opts.mode === "passive" ? "passive" : "hook";
  var hostRe = null;
  try {
    if (opts.hostFilter) hostRe = new RegExp(opts.hostFilter, "i");
  } catch (e) {
  }
  var MAX_BODY = opts.maxBody || 2e5;
  var MAX_CALLS = opts.maxCalls || 50;
  var m = {};
  var po = {};
  var budget = { calls: 0, stopped: null };
  var restored = 0;
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved && saved.v === VERSION) {
      m = saved.m || {};
      po = saved.po || {};
      if (saved.budget) budget = saved.budget;
      restored = Object.keys(m).length;
    }
  } catch (e) {
  }
  var AUTH_H = /^(authorization|cookie|x-csrf|x-xsrf|x-api-key|x-auth|x-token|x-session|x-access|x-client-token|x-request-token)/i;
  var NOISE_H = /^(accept|accept-language|accept-encoding|cache-control|connection|pragma|sec-|user-agent|referer|origin|dnt|te|if-none-match|if-modified-since|upgrade-insecure-requests)$/i;
  var NOISE_H_PREFIX = /^sec-/i;
  function isValueLike(s) {
    if (!s) return false;
    var d = s;
    try {
      d = decodeURIComponent(s);
    } catch (e) {
    }
    if (/^[0-9]+$/.test(d)) return true;
    if (/^[0-9a-f]{8,}$/i.test(d)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d)) return true;
    if (/@/.test(d)) return true;
    if (/^\+?[0-9][0-9 ().-]{6,}$/.test(d)) return true;
    if (/^[\w.~-]{20,}$/.test(d)) return true;
    if (d.length >= 10 && /[0-9]/.test(d) && /[a-z]/i.test(d) && !/^[a-z]+[0-9]{1,2}$/i.test(d)) return true;
    return false;
  }
  function tpl(p) {
    return p.split("/").map(function(s) {
      return isValueLike(s) ? "{id}" : s;
    }).join("/");
  }
  function abs(u, base) {
    try {
      return new URL(String(u), base || location.href);
    } catch (e) {
      return null;
    }
  }
  function shape(v, d) {
    d = d || 0;
    if (v === null) return "null";
    if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1)] : [];
    if (typeof v === "object") {
      if (d > 6) return "object";
      var o = {};
      var keys = Object.keys(v);
      var dyn = keys.filter(isValueLike);
      if (dyn.length && dyn.length >= keys.length / 2) {
        o["{key}"] = shape(v[dyn[0]], d + 1);
        keys = keys.filter(function(k) {
          return !isValueLike(k);
        });
      }
      keys.slice(0, 60).forEach(function(k) {
        if (!isValueLike(k)) o[k] = shape(v[k], d + 1);
      });
      return o;
    }
    return typeof v;
  }
  function keysOf(iter) {
    var o = {};
    iter.forEach(function(_, k) {
      o[isValueLike(k) ? "{key}" : k] = "string";
    });
    return o;
  }
  function bodyShape(b) {
    try {
      if (b == null) return void 0;
      if (typeof b === "string") {
        try {
          return { json: shape(JSON.parse(b)) };
        } catch (e) {
        }
        if (/^[^=&\s]+=[^&]*(&|$)/.test(b)) return { form: keysOf(new URLSearchParams(b)) };
        return { text: b.length };
      }
      if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) return { form: keysOf(b) };
      if (typeof FormData !== "undefined" && b instanceof FormData) return { multipart: keysOf(b) };
      if (typeof Blob !== "undefined" && b instanceof Blob) return { binary: b.size };
      if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return { binary: b.byteLength };
    } catch (e) {
    }
    return { unknown: true };
  }
  function resShape(text, ct) {
    if (!text) return void 0;
    if (/json/i.test(ct || "")) {
      try {
        return shape(JSON.parse(text));
      } catch (e) {
      }
    }
    return { contentType: (ct || "").split(";")[0], bytes: text.length };
  }
  function cap(t) {
    return t && t.length > MAX_BODY ? "" : t;
  }
  var persistTimer = null;
  function persist() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ v: VERSION, m, po, budget }));
    } catch (e) {
    }
  }
  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(function() {
      persistTimer = null;
      persist();
    }, 300);
  }
  function rec(kind, method, url, headers, body, status, ct, text, base) {
    try {
      var u = abs(url, base);
      if (!u || !/^https?:$/.test(u.protocol)) return;
      if (hostRe && !hostRe.test(u.host)) return;
      var k = String(method || "GET").toUpperCase() + " " + u.origin + tpl(u.pathname);
      var e = m[k] || (m[k] = { kind, n: 0, status: [], query: [], headers: [], auth: [] });
      e.n++;
      if (status != null && e.status.indexOf(status) < 0) e.status.push(status);
      u.searchParams.forEach(function(_, q) {
        var qn = isValueLike(q) ? "{key}" : q;
        if (e.query.indexOf(qn) < 0) e.query.push(qn);
      });
      Object.keys(headers || {}).forEach(function(h) {
        var l = h.toLowerCase();
        if (AUTH_H.test(l)) {
          if (e.auth.indexOf(l) < 0) e.auth.push(l);
        } else if (!NOISE_H.test(l) && !NOISE_H_PREFIX.test(l) && e.headers.indexOf(l) < 0) e.headers.push(l);
      });
      if (body !== void 0 && !e.req) e.req = bodyShape(body);
      if (text !== void 0 && !e.res) e.res = resShape(text, ct);
      persistSoon();
    } catch (err) {
    }
  }
  var restores = [];
  function patch(obj, name, make) {
    try {
      var orig = obj[name];
      if (!orig) return;
      var wrapped = make(orig);
      obj[name] = wrapped;
      restores.push(function() {
        try {
          if (obj[name] === wrapped) obj[name] = orig;
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  var origFetch = w.fetch;
  function hookWindow(win) {
    try {
      if (win.__ifkHooked) return;
      win.__ifkHooked = true;
    } catch (e) {
      return;
    }
    var base = function() {
      try {
        return win.location.href;
      } catch (e) {
        return location.href;
      }
    };
    patch(win, "fetch", function(oFetch) {
      return function(input, init) {
        var p = oFetch.apply(this, arguments);
        try {
          var isReq = typeof win.Request !== "undefined" && input instanceof win.Request;
          var method = init && init.method || isReq && input.method || "GET";
          var url = isReq ? input.url : input;
          var hs = {};
          var src = init && init.headers || isReq && input.headers;
          if (src) new win.Headers(src).forEach(function(_, k) {
            hs[k] = 1;
          });
          var b = init && init.body;
          var at = base();
          p.then(function(res) {
            try {
              var ct = res.headers.get("content-type");
              if (/event-stream|octet|video|audio|image/i.test(ct || "")) return rec("fetch", method, url, hs, b, res.status, ct, void 0, at);
              res.clone().text().then(function(t) {
                rec("fetch", method, url, hs, b, res.status, ct, cap(t), at);
              }, function() {
                rec("fetch", method, url, hs, b, res.status, ct, void 0, at);
              });
            } catch (e) {
            }
          }, function() {
          });
        } catch (e) {
        }
        return p;
      };
    });
    var X = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (X) {
      patch(X, "open", function(oOpen) {
        return function(method, url) {
          try {
            this.__ifkI = { method, url, h: {}, at: base() };
          } catch (e) {
          }
          return oOpen.apply(this, arguments);
        };
      });
      patch(X, "setRequestHeader", function(oSet) {
        return function(k) {
          try {
            if (this.__ifkI) this.__ifkI.h[k] = 1;
          } catch (e) {
          }
          return oSet.apply(this, arguments);
        };
      });
      patch(X, "send", function(oSend) {
        return function(b) {
          try {
            var i = this.__ifkI, x = this;
            if (i) x.addEventListener("loadend", function() {
              var t;
              try {
                t = x.responseType === "" || x.responseType === "text" ? cap(x.responseText) : void 0;
              } catch (e) {
              }
              var ct = null;
              try {
                ct = x.getResponseHeader("content-type");
              } catch (e) {
              }
              rec("xhr", i.method, i.url, i.h, b, x.status, ct, t, i.at);
            });
          } catch (e) {
          }
          return oSend.apply(this, arguments);
        };
      });
    }
    if (win.navigator && win.navigator.sendBeacon) {
      patch(win.navigator, "sendBeacon", function(oBeacon) {
        return function(u, d) {
          rec("beacon", "POST", u, {}, d, void 0, void 0, void 0, base());
          return oBeacon.apply(this, arguments);
        };
      });
    }
    ["WebSocket", "EventSource"].forEach(function(name) {
      patch(win, name, function(Orig) {
        var Wrapped = function(u, p) {
          try {
            var url = String(u);
            if (name === "WebSocket") url = url.replace(/^ws/, "http");
            rec(name === "WebSocket" ? "ws" : "sse", "GET", url, {}, void 0, void 0, void 0, void 0, base());
          } catch (e) {
          }
          return p === void 0 ? new Orig(u) : new Orig(u, p);
        };
        Wrapped.prototype = Orig.prototype;
        ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function(k) {
          if (k in Orig) Wrapped[k] = Orig[k];
        });
        return Wrapped;
      });
    });
  }
  function onSubmit(ev) {
    try {
      var f = ev.target;
      var doc = f.ownerDocument || document;
      rec("form", f.method || "GET", f.action || doc.location.href, {}, new FormData(f), void 0, void 0, void 0, doc.location.href);
    } catch (e) {
    }
  }
  function watchDocument(doc) {
    try {
      if (doc.__ifkWatched) return;
      doc.__ifkWatched = true;
      doc.addEventListener("submit", onSubmit, true);
      restores.push(function() {
        try {
          doc.removeEventListener("submit", onSubmit, true);
          doc.__ifkWatched = false;
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
  function attachFrame(f) {
    try {
      var fw = f.contentWindow;
      if (!fw || !fw.document) return;
      if (mode === "hook") hookWindow(fw);
      watchDocument(fw.document);
    } catch (e) {
    }
    try {
      if (!f.__ifkLoad) {
        f.__ifkLoad = true;
        f.addEventListener("load", function() {
          attachFrame(f);
        });
      }
    } catch (e) {
    }
  }
  function scanFrames(root) {
    try {
      Array.prototype.forEach.call((root || document).querySelectorAll("iframe,frame"), attachFrame);
    } catch (e) {
    }
  }
  if (mode === "hook") hookWindow(w);
  watchDocument(document);
  scanFrames(document);
  var mo = null;
  try {
    mo = new MutationObserver(function(muts) {
      muts.forEach(function(mu) {
        Array.prototype.forEach.call(mu.addedNodes || [], function(n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === "IFRAME" || n.tagName === "FRAME") attachFrame(n);
          else if (n.querySelectorAll) scanFrames(n);
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
  }
  var obs = null;
  try {
    obs = new PerformanceObserver(function(l) {
      l.getEntries().forEach(function(r) {
        if (!/fetch|xmlhttprequest|beacon/.test(r.initiatorType)) return;
        var u = abs(r.name);
        if (!u || hostRe && !hostRe.test(u.host)) return;
        po[u.origin + tpl(u.pathname)] = r.responseStatus || 0;
      });
      persistSoon();
    });
    obs.observe({ type: "resource", buffered: true });
  } catch (e) {
  }
  w.addEventListener("pagehide", persist);
  function report() {
    var hooked = {};
    Object.keys(m).forEach(function(k) {
      hooked[k.slice(k.indexOf(" ") + 1)] = 1;
    });
    var pathOnly = Object.keys(po).filter(function(p) {
      return !hooked[p];
    });
    var payload = Object.keys(m).filter(function(k) {
      return m[k].req || m[k].res;
    });
    return {
      kind: "iframer-capture",
      v: VERSION,
      origin: location.origin,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      kit: { mode, hostFilter: opts.hostFilter || null },
      coverage: {
        seen: Object.keys(m).length + pathOnly.length,
        withPayload: payload.length,
        pathOnly: pathOnly.length,
        complete: false,
        blindSpots: ["HttpOnly cookies", "Set-Cookie", "browser-added headers", "worker traffic", "document POST responses", "redirect hops", "cross-origin iframes"]
      },
      endpoints: m,
      pathOnly
    };
  }
  function looksLikeWall(status, text) {
    if (status === 403 || status === 429) return "HTTP " + status;
    if (text && /captcha|cf-chl|challenge-platform|are you a robot|access denied/i.test(text.slice(0, 5e3))) return "bot wall";
    return null;
  }
  w.__ifk = {
    version: VERSION,
    mode,
    summary: function() {
      var c = report().coverage;
      return { installed: true, mode, seen: c.seen, withPayload: c.withPayload, pathOnly: c.pathOnly, replays: budget.calls, stopped: budget.stopped };
    },
    // Fallback for tools that can't download files: page the report through evaluate results.
    drain: function(cursor, maxBytes) {
      var s = JSON.stringify(report());
      cursor = cursor || 0;
      var chunk = s.slice(cursor, cursor + (maxBytes || 6e4));
      return { chunk, next: cursor + chunk.length < s.length ? cursor + chunk.length : null, total: s.length };
    },
    // Writes the report out of the page as a download. T3 lists its local path
    // in preview_status.downloads; `iframer ingest` reads it from there.
    dump: function() {
      var s = JSON.stringify(report());
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([s], { type: "application/json" }));
      a.download = "iframer-capture-" + Date.now() + ".json";
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
      return { bytes: s.length, file: a.download };
    },
    // Replays through the page so the browser attaches its own cookies,
    // including HttpOnly ones. Same-origin, GET/HEAD only unless approved,
    // capped per session, and it stops for good on 403/429 or a bot wall.
    call: function(method, path15, o) {
      o = o || {};
      method = String(method || "GET").toUpperCase();
      if (budget.stopped) return Promise.resolve({ error: "stopped", reason: budget.stopped });
      if (method !== "GET" && method !== "HEAD" && !o.approved) {
        return Promise.resolve({ error: "write needs approval", hint: "ask the user, then pass {approved:true} for this one request" });
      }
      var u = abs(path15);
      if (!u) return Promise.resolve({ error: "bad url" });
      if (u.origin !== location.origin && !o.crossOrigin) return Promise.resolve({ error: "cross-origin", hint: "navigate to " + u.origin + " first" });
      if (budget.calls >= MAX_CALLS) {
        budget.stopped = "budget of " + MAX_CALLS + " calls";
        persist();
        return Promise.resolve({ error: "stopped", reason: budget.stopped });
      }
      budget.calls++;
      var init = { method, credentials: "include", headers: o.headers || {} };
      if (o.json !== void 0) {
        init.body = JSON.stringify(o.json);
        init.headers["content-type"] = "application/json";
      } else if (o.body !== void 0) init.body = o.body;
      var maxBytes = o.maxBytes || 2e4;
      return origFetch.call(w, u.href, init).then(function(r) {
        return r.text().then(function(t) {
          var out = { status: r.status };
          var wall = looksLikeWall(r.status, t);
          if (wall) {
            budget.stopped = wall;
            out.stopped = wall;
          }
          persist();
          if (t.length > maxBytes) {
            out.truncated = t.length;
            t = t.slice(0, maxBytes);
          }
          try {
            out.data = JSON.parse(t);
          } catch (e) {
            out.text = t.slice(0, 2e3);
          }
          return out;
        });
      }, function(e) {
        return { error: String(e && e.message || e) };
      });
    },
    // Removes every hook and forgets the capture.
    stop: function() {
      restores.forEach(function(r) {
        r();
      });
      restores = [];
      try {
        mo && mo.disconnect();
      } catch (e) {
      }
      try {
        obs && obs.disconnect();
      } catch (e) {
      }
      try {
        w.removeEventListener("pagehide", persist);
      } catch (e) {
      }
      try {
        w.__ifkHooked = false;
      } catch (e) {
      }
      try {
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem("__ifk");
      } catch (e) {
      }
      delete w.__ifk;
      return { stopped: true };
    }
  };
  persist();
  return { installed: true, again: false, version: VERSION, mode, restored };
}
var init_page_kit = __esm({
  "src/lib/kit/page-kit.ts"() {
    "use strict";
  }
});

// src/lib/kit/capture.ts
function parseCapture(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new CaptureError("not JSON: expected a file written by the kit's dump() or the joined drain() chunks");
  }
  if (data?.kind !== "iframer-capture" && !(data?.v === 1 && data?.endpoints && data?.coverage)) {
    throw new CaptureError('not an iframer capture (missing kind: "iframer-capture")');
  }
  if (data.v !== 1) throw new CaptureError(`unsupported capture version ${data.v}; update iframer`);
  if (typeof data.origin !== "string" || typeof data.endpoints !== "object") throw new CaptureError("capture is missing origin or endpoints");
  data.pathOnly ??= [];
  return data;
}
function downloadDirs() {
  const home = import_os4.default.homedir();
  const t3Home = process.env.T3_HOME || import_path12.default.join(home, ".t3");
  return [
    import_path12.default.join(t3Home, "userdata", "server-browser", "downloads"),
    import_path12.default.join(home, "Downloads")
  ];
}
function findLatestCapture(dirs = downloadDirs(), maxAgeMs = 24 * 36e5) {
  const now = Date.now();
  let best = null;
  const consider = (p) => {
    try {
      const st = import_fs11.default.statSync(p);
      if (!st.isFile() || st.size > 2e7 || now - st.mtimeMs > maxAgeMs) return;
      if (best && st.mtimeMs <= best.t) return;
      const fd = import_fs11.default.openSync(p, "r");
      const buf = Buffer.alloc(64);
      import_fs11.default.readSync(fd, buf, 0, 64, 0);
      import_fs11.default.closeSync(fd);
      if (!buf.toString("utf8").startsWith('{"kind":"iframer-capture"')) return;
      best = { p, t: st.mtimeMs };
    } catch {
    }
  };
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = import_fs11.default.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = import_path12.default.join(dir, e.name);
      if (e.isDirectory() && depth > 0) walk(p, depth - 1);
      else if (e.isFile()) consider(p);
    }
  };
  for (const d of dirs) walk(d, 2);
  return best?.p ?? null;
}
function mask(s) {
  return s.length <= 4 ? "****" : `${s.slice(0, 3)}\u2026 (${s.length} chars)`;
}
function scanString(s, where, out) {
  if (TYPE_NAMES.has(s)) return;
  for (const [kind, re] of DETECTORS) {
    if (kind === "token") {
      for (const part of s.split(/[/\s?&=#]/)) {
        if (part.includes("{")) continue;
        if (re.test(part)) {
          out.push({ where, kind, sample: mask(part) });
          return;
        }
      }
      continue;
    }
    const hit = s.match(re);
    if (hit) {
      out.push({ where, kind, sample: mask(hit[0]) });
      return;
    }
  }
}
function walkValues(v, where, out) {
  if (typeof v === "string") return scanString(v, where, out);
  if (Array.isArray(v)) return v.forEach((x, i) => walkValues(x, `${where}[${i}]`, out));
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      scanString(k, `${where}.${k} (key)`, out);
      walkValues(x, `${where}.${k}`, out);
    }
  }
}
function scanCapture(report) {
  const out = [];
  for (const [key, ep] of Object.entries(report.endpoints)) {
    const where = `endpoints["${key.length > 80 ? key.slice(0, 80) + "\u2026" : key}"]`;
    scanString(key, where, out);
    walkValues(ep, where, out);
  }
  report.pathOnly.forEach((p, i) => scanString(p, `pathOnly[${i}]`, out));
  return out;
}
function splitKey(key) {
  const sp = key.indexOf(" ");
  const method = key.slice(0, sp);
  const rest = key.slice(sp + 1);
  const m = rest.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  return { method, origin: m ? m[1] : "", path: m?.[2] || "/" };
}
function pascal(s) {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}
function functionNameFor(method, p, res, kind) {
  const segs = p.split("/").filter((s) => s && !s.startsWith("{") && !/^(api|rest|v\d+)$/i.test(s));
  const tail = segs.slice(-2).map(pascal).join("") || "Root";
  let verb = VERB[method] ?? method.toLowerCase();
  const endsWithId = /\{id\}\/?$/.test(p);
  if (method === "GET" && !endsWithId && res && typeof res === "object" && (Array.isArray(res) || Object.values(res).some(Array.isArray))) verb = "list";
  if (kind === "beacon") verb = "send";
  if (kind === "ws" || kind === "sse") verb = "open";
  if (method === "POST" && segs.length && /^(search|login|logout|send|submit|query|graphql)$/i.test(segs[segs.length - 1])) verb = "";
  const name = verb + tail;
  return name[0].toLowerCase() + name.slice(1);
}
function buildApiMap(report) {
  const used = /* @__PURE__ */ new Map();
  const endpoints = Object.entries(report.endpoints).map(([key, ep]) => ({ key, ep, ...splitKey(key) })).sort((a, b) => a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)).map(({ ep, method, origin, path: p }) => {
    let fn = functionNameFor(method, p, ep.res, ep.kind);
    const n = used.get(fn) ?? 0;
    used.set(fn, n + 1);
    if (n) fn += n + 1;
    return {
      method,
      origin,
      path: p,
      kind: ep.kind,
      calls: ep.n,
      status: ep.status,
      query: ep.query,
      headers: ep.headers,
      authHeaders: ep.auth,
      request: ep.req,
      response: ep.res,
      functionName: fn
    };
  });
  return {
    origin: report.origin,
    capturedAt: report.capturedAt,
    coverage: report.coverage,
    replay: "in-page only: load the kit, then the client, and call window.__ifkApi.<fn>() through the agent's evaluate tool. HttpOnly cookies never leave the browser, so the same calls fail from curl.",
    endpoints,
    pathOnly: report.pathOnly
  };
}
function renderClient(map) {
  const lines = [];
  const skipped = [];
  lines.push(`// Generated by \`iframer ingest\` from ${map.origin}${map.capturedAt ? ` (${map.capturedAt.slice(0, 10)})` : ""}.`);
  lines.push(`// Runs IN the page, after the iframer kit, so the browser attaches the session`);
  lines.push(`// cookies. Load it like the kit (file -> sessionStorage -> top-level eval).`);
  lines.push(`// Writes (non-GET) need {approved:true}: ask the user first.`);
  lines.push(`(function () {`);
  lines.push(`  function c(m, p, o) {`);
  lines.push(`    if (!window.__ifk) return Promise.resolve({ error: "NOT_INSTALLED: eval(sessionStorage.__ifk) first" });`);
  lines.push(`    return window.__ifk.call(m, p, o);`);
  lines.push(`  }`);
  lines.push(`  function q(query) {`);
  lines.push(`    if (!query) return "";`);
  lines.push(`    var s = new URLSearchParams(query).toString();`);
  lines.push(`    return s ? "?" + s : "";`);
  lines.push(`  }`);
  lines.push(`  window.__ifkApi = {`);
  for (const ep of map.endpoints) {
    if (ep.kind === "ws" || ep.kind === "sse" || ep.kind === "beacon") {
      skipped.push(`${ep.kind} ${ep.path}`);
      continue;
    }
    if (ep.origin !== map.origin) {
      skipped.push(`${ep.method} ${ep.origin}${ep.path} (cross-origin)`);
      continue;
    }
    let ids = 0;
    const params = [];
    const urlExpr = JSON.stringify(ep.path).replace(/\{id\}/g, () => {
      const name = ids++ === 0 ? "id" : `id${ids}`;
      params.push(name);
      return `" + encodeURIComponent(${name}) + "`;
    }).replace(/ \+ ""$/, "").replace(/^"" \+ /, "");
    const hasBody = ep.method !== "GET" && ep.method !== "HEAD";
    if (hasBody) params.push("body");
    params.push("query", "opts");
    const optsExpr = hasBody ? `Object.assign({ json: body }, opts)` : `opts`;
    const doc = [
      ep.query.length ? `query: ${ep.query.join(", ")}` : "",
      ep.status.length ? `seen ${ep.status.join("/")}` : ""
    ].filter(Boolean).join("; ");
    lines.push(`    // ${ep.method} ${ep.path}${doc ? `  (${doc})` : ""}`);
    lines.push(`    ${ep.functionName}: function (${params.join(", ")}) { return c(${JSON.stringify(ep.method)}, ${urlExpr} + q(query), ${optsExpr}); },`);
  }
  lines.push(`  };`);
  lines.push(`  return Object.keys(window.__ifkApi);`);
  lines.push(`})();`);
  if (skipped.length) lines.push(`// Not wrapped: ${skipped.join("; ")}`);
  return lines.join("\n") + "\n";
}
function tsType(s, indent = "  ") {
  if (typeof s === "string") {
    if (s === "null") return "null";
    if (["string", "number", "boolean"].includes(s)) return s;
    return "unknown";
  }
  if (Array.isArray(s)) return s.length ? `Array<${tsType(s[0], indent)}>` : "unknown[]";
  if (s && typeof s === "object") {
    const entries = Object.entries(s);
    if (!entries.length) return "Record<string, unknown>";
    const inner = indent + "  ";
    const body = entries.map(([k, v]) => k === "{key}" ? `${inner}[key: string]: ${tsType(v, inner)};` : `${inner}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}?: ${tsType(v, inner)};`);
    return `{
${body.join("\n")}
${indent}}`;
  }
  return "unknown";
}
function renderTypes(map) {
  const out = [`// Generated by \`iframer ingest\` from ${map.origin}. Shapes come from one sample each: fields may be optional.`];
  out.push(`type IfkResult<T> = Promise<{ status?: number; data?: T; text?: string; truncated?: number; error?: string; stopped?: string }>;`);
  out.push(`type IfkOpts = { approved?: boolean; headers?: Record<string, string>; maxBytes?: number };`);
  out.push(`interface IfkApi {`);
  for (const ep of map.endpoints) {
    if (ep.kind === "ws" || ep.kind === "sse" || ep.kind === "beacon" || ep.origin !== map.origin) continue;
    const ids = (ep.path.match(/\{id\}/g) || []).map((_, i) => `${i ? `id${i + 1}` : "id"}: string | number`);
    const hasBody = ep.method !== "GET" && ep.method !== "HEAD";
    const req = ep.request?.json !== void 0 ? tsType(ep.request.json, "  ") : ep.request?.form || ep.request?.multipart ? "Record<string, string>" : "unknown";
    const res = ep.response && typeof ep.response === "object" && !Array.isArray(ep.response) && "contentType" in ep.response && "bytes" in ep.response ? "unknown" : tsType(ep.response, "  ");
    const params = [...ids, ...hasBody ? [`body: ${req}`] : [], `query?: Record<string, string>`, `opts?: IfkOpts`];
    out.push(`  /** ${ep.method} ${ep.path} */`);
    out.push(`  ${ep.functionName}(${params.join(", ")}): IfkResult<${res}>;`);
  }
  out.push(`}`);
  out.push(`declare global { interface Window { __ifkApi: IfkApi } }`);
  out.push(`export {};`);
  return out.join("\n") + "\n";
}
function shortShape(s, depth = 0) {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s.length ? `${shortShape(s[0], depth + 1)}[]` : "[]";
  if (s && typeof s === "object") {
    const keys = Object.keys(s);
    if (depth > 0) return `{${keys.slice(0, 4).join(",")}${keys.length > 4 ? ",\u2026" : ""}}`;
    return `{${keys.slice(0, 6).map((k) => `${k}:${shortShape(s[k], depth + 1)}`).join(", ")}${keys.length > 6 ? ", \u2026" : ""}}`;
  }
  return "?";
}
function describeEndpoint(ep) {
  const parts = [ep.kind, ep.status.length ? `status ${ep.status.join("/")}` : ""];
  if (ep.request?.json !== void 0) parts.push(`body ${shortShape(ep.request.json)}`);
  else if (ep.request?.form) parts.push(`form ${Object.keys(ep.request.form).join(",")}`);
  if (ep.response !== void 0) parts.push(`returns ${shortShape(ep.response)}`);
  if (ep.authHeaders.length) parts.push(`auth ${ep.authHeaders.join(",")}`);
  return parts.filter(Boolean).join("; ");
}
var import_fs11, import_os4, import_path12, CaptureError, TYPE_NAMES, DETECTORS, VERB;
var init_capture = __esm({
  "src/lib/kit/capture.ts"() {
    "use strict";
    import_fs11 = __toESM(require("fs"));
    import_os4 = __toESM(require("os"));
    import_path12 = __toESM(require("path"));
    CaptureError = class extends Error {
    };
    TYPE_NAMES = /* @__PURE__ */ new Set(["string", "number", "boolean", "null", "object", "undefined", "bigint", "symbol", "function", "{id}", "{key}"]);
    DETECTORS = [
      ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
      ["jwt", /eyJ[A-Za-z0-9_-]{5,}/],
      ["bearer", /\bbearer\s+\S{6,}/i],
      ["phone", /\+?\d[\d ().-]{8,}\d/],
      ["token", /(?=[A-Za-z0-9_\-.]*\d)(?=[A-Za-z0-9_\-.]*[A-Za-z])^[A-Za-z0-9_\-.]{24,}$/]
    ];
    VERB = { GET: "get", HEAD: "head", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };
  }
});

// src/lib/kit/index.ts
var kit_exports = {};
__export(kit_exports, {
  CaptureError: () => CaptureError,
  KIT_TARGETS: () => KIT_TARGETS,
  buildApiMap: () => buildApiMap,
  describeEndpoint: () => describeEndpoint,
  downloadDirs: () => downloadDirs,
  findLatestCapture: () => findLatestCapture,
  kitDir: () => kitDir,
  kitInstructions: () => kitInstructions,
  kitSource: () => kitSource,
  parseCapture: () => parseCapture,
  renderClient: () => renderClient,
  renderTypes: () => renderTypes,
  scanCapture: () => scanCapture,
  writeKit: () => writeKit
});
function kitSource(opts = {}) {
  const clean = {};
  if (opts.mode) clean.mode = opts.mode;
  if (opts.hostFilter) clean.hostFilter = opts.hostFilter;
  if (opts.maxBody) clean.maxBody = opts.maxBody;
  if (opts.maxCalls) clean.maxCalls = opts.maxCalls;
  return `(${pageKit.toString()})(${JSON.stringify(clean)});
`;
}
function kitDir() {
  return import_path13.default.join(getDataDir(), "kit");
}
function writeKit(opts = {}, file = import_path13.default.join(kitDir(), "iframer-kit.js")) {
  import_fs12.default.mkdirSync(import_path13.default.dirname(file), { recursive: true });
  import_fs12.default.writeFileSync(file, kitSource(opts), "utf8");
  return file;
}
function kitInstructions(target, kitPath, clientPath) {
  const common = [
    ``,
    `Rules:`,
    `- After EVERY full page load, run \`${INSTALL}\` again. It restores what was captured. Check with \`${STATUS}\`.`,
    `- Drive the site with your normal tools while it records. Only shapes are kept, never values.`,
    `- Replay: \`window.__ifk.call('GET','/path')\` runs in the page with the user's cookies. Writes need {approved:true}, so ask the user first. It stops on 403, 429 or a captcha page: do not retry.`,
    `- Coverage is never complete: workers, redirect hops, HttpOnly cookies and cross-origin iframes are invisible to the kit.`,
    `- Done: \`window.__ifk.stop()\` removes the hooks.`
  ];
  if (target === "t3") {
    return [
      `T3 Code preview tab. Use the same tabId on every call.`,
      ``,
      `Install (once per tab session):`,
      `1. preview_evaluate: ${MAKE_INPUT}`,
      `2. preview_act: action=upload, selector=#__ifk_in, paths=["${kitPath}"]`,
      `3. preview_evaluate: ${STASH}`,
      `4. preview_evaluate: ${INSTALL}   -> {installed:true}`,
      ``,
      `Export:`,
      `5. preview_evaluate: window.__ifk.dump()`,
      `6. Run: iframer ingest --latest   (finds the newest capture in T3's downloads; or pass preview_status.downloads[].path)`,
      ...clientPath ? [
        ``,
        `Use the generated client (after the kit is installed):`,
        `a. preview_evaluate: ${MAKE_INPUT}`,
        `b. preview_act: action=upload, selector=#__ifk_in, paths=["${clientPath}"]`,
        `c. preview_evaluate: ${stash("__ifkApi")}`,
        `d. preview_evaluate: eval(sessionStorage.__ifkApi)   -> list of function names`,
        `e. preview_evaluate: window.__ifkApi.<functionName>(...)`,
        `After a page load: eval(sessionStorage.__ifk); eval(sessionStorage.__ifkApi)`
      ] : [],
      ...common
    ].join("\n");
  }
  if (target === "playwright-mcp") {
    return [
      `Playwright MCP (or any tool with browser_evaluate + browser_file_upload).`,
      ``,
      `Install:`,
      `1. browser_evaluate: ${MAKE_INPUT}`,
      `2. Click #__ifk_in so the file chooser opens, then browser_file_upload paths=["${kitPath}"]`,
      `3. browser_evaluate: ${STASH}`,
      `4. browser_evaluate: ${INSTALL}`,
      ``,
      `Export: browser_evaluate window.__ifk.dump(), then \`iframer ingest <download path>\`.`,
      `If downloads aren't saved, use the drain fallback below.`,
      ``,
      drainFallback(),
      ...common
    ].join("\n");
  }
  return [
    `Any browser tool that can evaluate JavaScript in the page.`,
    ``,
    `Install:`,
    `- If the tool can upload files: put a hidden <input type=file id=__ifk_in>, upload ${kitPath} into it, then`,
    `  evaluate ${STASH} and ${INSTALL}.`,
    `- Otherwise evaluate the source from \`iframer kit --print\` (~15 KB). Without the sessionStorage`,
    `  copy, you must evaluate it again after every page load, which costs those tokens each time.`,
    ``,
    `Export: evaluate window.__ifk.dump() and run \`iframer ingest <download path>\` if your tool saves downloads.`,
    ``,
    drainFallback(),
    ...common
  ].join("\n");
}
function drainFallback() {
  return [
    `Drain fallback (no downloads): evaluate window.__ifk.drain(0) -> {chunk, next}. Repeat with drain(next)`,
    `until next is null, write the joined chunks to a file, then \`iframer ingest <file>\`.`
  ].join("\n");
}
var import_fs12, import_path13, KIT_TARGETS, MAKE_INPUT, stash, STASH, INSTALL, STATUS;
var init_kit = __esm({
  "src/lib/kit/index.ts"() {
    "use strict";
    import_fs12 = __toESM(require("fs"));
    import_path13 = __toESM(require("path"));
    init_paths();
    init_page_kit();
    init_capture();
    KIT_TARGETS = ["t3", "playwright-mcp", "any"];
    MAKE_INPUT = `(()=>{let i=document.createElement('input');i.type='file';i.id='__ifk_in';i.style.display='none';document.documentElement.append(i);return 1})()`;
    stash = (key) => `document.getElementById('__ifk_in').files[0].text().then(t=>{sessionStorage.${key}=t;document.getElementById('__ifk_in').remove();return t.length})`;
    STASH = stash("__ifk");
    INSTALL = `eval(sessionStorage.__ifk)`;
    STATUS = `window.__ifk?window.__ifk.summary():'NOT_INSTALLED'`;
  }
});

// bin/cli.js
var fs13 = require("fs");
var os5 = require("os");
var path14 = require("path");
var { execSync: execSync3 } = require("child_process");
var readline = require("readline");
var HOME_DIR = os5.homedir();
var CONFIG_DIR = process.env.IFRAMER_DATA_DIR || path14.join(HOME_DIR, ".iframer");
var CLAUDE_CONFIG_PATH = path14.join(HOME_DIR, ".claude.json");
var CODEX_CONFIG_PATH = path14.join(HOME_DIR, ".codex", "config.toml");
var LOCAL_USER_ID = "iframer-local";
function resolveLocalToken() {
  if (process.env.IFRAMER_SECRET) return process.env.IFRAMER_SECRET;
  const candidates = [
    path14.join(CONFIG_DIR, "secret"),
    path14.join(process.env.XDG_RUNTIME_DIR || os5.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = fs13.readFileSync(file, "utf8").trim();
      if (existing) return existing;
    } catch {
    }
  }
  for (const file of candidates) {
    try {
      fs13.mkdirSync(path14.dirname(file), { recursive: true });
      const secret = require("crypto").randomBytes(32).toString("hex");
      fs13.writeFileSync(file, secret, { mode: 384 });
      return secret;
    } catch {
    }
  }
  throw new Error(
    `iframer: could not read or create a persistent encryption secret in any writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a stable value shared between the MCP server and CLI (openssl rand -hex 32).`
  );
}
var LOCAL_TOKEN = resolveLocalToken();
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
      if (char === "\n" || char === "\r" || char === "") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "") {
        process.stdout.write("\n");
        process.exit(0);
      } else if (char === "\x7F" || char === "\b") {
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
  const mcpServerTS = path14.join(__dirname, "..", "src", "mcp", "server.ts");
  const mcpServerCJS = path14.join(__dirname, "mcp-server.cjs");
  let bunPath;
  try {
    bunPath = execSync3("which bun", { encoding: "utf8" }).trim();
  } catch {
  }
  if (bunPath && fs13.existsSync(mcpServerTS)) {
    return {
      command: bunPath,
      args: ["run", mcpServerTS],
      message: "  Using bun to run MCP server from source (no build needed)"
    };
  }
  if (fs13.existsSync(mcpServerCJS)) {
    return {
      command: "node",
      args: [mcpServerCJS],
      message: "  Using pre-built MCP server bundle"
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
    const envPath = path14.join(__dirname, "..", ".env");
    const envContent = fs13.readFileSync(envPath, "utf8");
    const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
    if (match) secret = match[1].trim();
  } catch {
  }
  return secret;
}
function installSkill() {
  const candidates = [
    path14.join(__dirname, "..", "skills", "iframer.md"),
    path14.join(__dirname, "skills", "iframer.md")
  ];
  let source = null;
  for (const c of candidates) {
    if (fs13.existsSync(c)) {
      source = c;
      break;
    }
  }
  if (!source) return false;
  const destDir = path14.join(HOME_DIR, ".claude", "commands");
  const dest = path14.join(destDir, "iframer.md");
  try {
    fs13.mkdirSync(destDir, { recursive: true });
    fs13.copyFileSync(source, dest);
    return true;
  } catch (err) {
    console.error(`  Warning: could not install skill: ${err.message}`);
    return false;
  }
}
function removeSkill() {
  const dest = path14.join(HOME_DIR, ".claude", "commands", "iframer.md");
  try {
    if (fs13.existsSync(dest)) {
      fs13.unlinkSync(dest);
      return true;
    }
  } catch {
  }
  return false;
}
function writeMachineSecret(secret) {
  try {
    fs13.mkdirSync(CONFIG_DIR, { recursive: true });
    fs13.writeFileSync(path14.join(CONFIG_DIR, "secret"), secret, { mode: 384 });
    return true;
  } catch (err) {
    console.error(`  Warning: could not write ~/.iframer/secret: ${err.message}`);
    return false;
  }
}
function loadClaudeConfig() {
  try {
    return JSON.parse(fs13.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}
function installClaudeMcp(mcpName, mcpEntry) {
  const config = loadClaudeConfig();
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[mcpName] = mcpEntry;
  fs13.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  return CLAUDE_CONFIG_PATH;
}
function removeClaudeMcp(mcpName) {
  let config;
  try {
    config = JSON.parse(fs13.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }
  if (!config.mcpServers || !config.mcpServers[mcpName]) {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }
  delete config.mcpServers[mcpName];
  fs13.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
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
    `args = [${mcpEntry.args.map((arg) => `"${escapeTomlString(arg)}"`).join(", ")}]`
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
  fs13.mkdirSync(path14.dirname(CODEX_CONFIG_PATH), { recursive: true });
  let content = "";
  try {
    content = fs13.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {
  }
  const existing = findCodexMcpSection(content, mcpName);
  if (existing) {
    content = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join("\n");
  }
  const trimmed = content.trimEnd();
  const block = renderCodexMcpBlock(mcpName, mcpEntry);
  fs13.writeFileSync(CODEX_CONFIG_PATH, trimmed ? `${trimmed}

${block}
` : `${block}
`);
  return CODEX_CONFIG_PATH;
}
function removeCodexMcp(mcpName) {
  let content;
  try {
    content = fs13.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }
  const existing = findCodexMcpSection(content, mcpName);
  if (!existing) {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }
  const next = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  fs13.writeFileSync(CODEX_CONFIG_PATH, next ? `${next}
` : "");
  return { removed: true, path: CODEX_CONFIG_PATH };
}
function deriveCliInstanceId() {
  const raw = process.env.IFRAMER_INSTANCE || process.env.CLAUDE_CODE_SESSION_ID || process.env.TERM_SESSION_ID;
  const id = raw ? require("crypto").createHash("sha256").update(raw).digest("hex").slice(0, 10) : require("crypto").randomBytes(5).toString("hex");
  return `cli-${id}`;
}
async function executeViaWarmServer(steps, options) {
  try {
    const { readServerInfo: readServerInfo2, isPidAlive: isPidAlive2 } = await Promise.resolve().then(() => (init_registry(), registry_exports));
    const { LocalServerManager: LocalServerManager2 } = await Promise.resolve().then(() => (init_local_server(), local_server_exports));
    const manager = new LocalServerManager2();
    const info = readServerInfo2();
    if (info && isPidAlive2(info.pid)) {
      let ownVersion = null;
      try {
        ownVersion = JSON.parse(fs13.readFileSync(path14.join(__dirname, "..", "package.json"), "utf8")).version;
      } catch {
      }
      if (ownVersion && info.version !== ownVersion) {
        try {
          await fetch(`http://127.0.0.1:${info.port}/shutdown`, {
            method: "POST",
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(3e3)
          });
        } catch {
        }
        const deadline = Date.now() + 12e3;
        while (Date.now() < deadline && isPidAlive2(info.pid)) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (isPidAlive2(info.pid)) {
          try {
            process.kill(info.pid, "SIGKILL");
          } catch {
          }
        }
      }
    }
    await manager.ensureRunning();
    const res = await fetch(`${manager.getBaseUrl()}/execute`, {
      method: "POST",
      headers: { "x-api-key": LOCAL_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ steps, options }),
      signal: AbortSignal.timeout(18e4)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
var _iframer = null;
async function getLocalIframer() {
  if (_iframer) return _iframer;
  try {
    const { Iframer: Iframer2 } = await Promise.resolve().then(() => (init_iframer(), iframer_exports));
    const publicDir = path14.join(os5.tmpdir(), "iframer-screenshots");
    const screenshotDir = path14.join(publicDir, "screenshots");
    fs13.mkdirSync(screenshotDir, { recursive: true });
    _iframer = new Iframer2({
      screenshotDir,
      publicUrl: `file://${publicDir}`
    });
    return _iframer;
  } catch (err) {
    console.error(`  Failed to initialize local iframer: ${err.message}`);
    console.error("  Make sure you're running with bun.");
    process.exit(1);
  }
}
function parseFlag(args2, flag, hasValue = true) {
  const idx = args2.indexOf(flag);
  if (idx === -1) return hasValue ? void 0 : false;
  if (!hasValue) return true;
  return args2[idx + 1];
}
function hasFlag(args2, flag) {
  return args2.includes(flag);
}
var LAUNCH_MODES = ["headless", "binary-headful"];
function parseModeFlag(args2) {
  const mode = parseFlag(args2, "--mode");
  if (!mode) return void 0;
  if (LAUNCH_MODES.includes(mode)) return mode;
  if (mode === "extension") {
    console.error("\n  --mode extension is not available from the CLI: it needs a tab id.");
    console.error("  Use the `tabs` tool from your agent, or POST /extension/execute with a tabId.\n");
    process.exit(1);
  }
  console.error(`
  Unknown --mode "${mode}". Use one of: ${LAUNCH_MODES.join(", ")}.
`);
  process.exit(1);
}
function printResult(data) {
  console.log(JSON.stringify(data, null, 2));
  if (!data.ok) process.exit(1);
}
var [, , command, ...args] = process.argv;
if (command === "--cache") {
  command = "knowledge";
  args = args.length > 0 ? ["get", ...args] : ["list"];
} else if (command === "--clear-cache") {
  command = "knowledge";
  args = ["clear", ...args];
}
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
  const { downloadChrome: downloadChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), chrome_downloader_exports));
  await downloadChrome2();
}
function isMcpInstalled(mcpName) {
  try {
    const config = JSON.parse(fs13.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
    return !!(config.mcpServers && config.mcpServers[mcpName]);
  } catch {
    return false;
  }
}
var EXTENSION_ID = "mjfdkiicioigljhenkgaldhihllfdpll";
function extensionDir() {
  return path14.join(__dirname, "..", "extension");
}
function semverNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}
async function reloadAndRestartServer(reloadExtension) {
  let info = null;
  try {
    info = JSON.parse(fs13.readFileSync(path14.join(CONFIG_DIR, "server.json"), "utf8"));
  } catch {
  }
  if (!info || !info.port) {
    if (reloadExtension) {
      console.log("  (No running iframer server. The new extension files are on disk \u2014");
      console.log("   reload it from chrome://extensions, or it applies next session.)");
    }
    return;
  }
  const base = `http://127.0.0.1:${info.port}`;
  const headers = { "x-api-key": LOCAL_TOKEN, "content-type": "application/json" };
  if (reloadExtension) {
    try {
      await fetch(`${base}/extension/reload`, { method: "POST", headers });
      console.log("  Told the extension to reload.");
    } catch {
    }
    await new Promise((r) => setTimeout(r, 1e3));
  }
  try {
    await fetch(`${base}/shutdown`, { method: "POST", headers });
    console.log("  Retired the old server (a fresh one spawns on next use).");
  } catch {
  }
}
var NM_HOST_NAME = "com.iframer.token";
function nativeMessagingBrowserDirs() {
  if (process.platform === "darwin") {
    const as = path14.join(HOME_DIR, "Library", "Application Support");
    return [
      { browser: "Chrome", dir: path14.join(as, "Google", "Chrome"), always: true },
      { browser: "Chrome Beta", dir: path14.join(as, "Google", "Chrome Beta") },
      { browser: "Chrome Canary", dir: path14.join(as, "Google", "Chrome Canary") },
      { browser: "Chromium", dir: path14.join(as, "Chromium") },
      { browser: "Brave", dir: path14.join(as, "BraveSoftware", "Brave-Browser") },
      { browser: "Edge", dir: path14.join(as, "Microsoft Edge") },
      { browser: "Vivaldi", dir: path14.join(as, "Vivaldi") },
      { browser: "Arc", dir: path14.join(as, "Arc", "User Data") }
    ];
  }
  const cfg = process.env.XDG_CONFIG_HOME || path14.join(HOME_DIR, ".config");
  return [
    { browser: "Chrome", dir: path14.join(cfg, "google-chrome"), always: true },
    { browser: "Chrome Beta", dir: path14.join(cfg, "google-chrome-beta") },
    { browser: "Chromium", dir: path14.join(cfg, "chromium") },
    { browser: "Brave", dir: path14.join(cfg, "BraveSoftware", "Brave-Browser") },
    { browser: "Edge", dir: path14.join(cfg, "microsoft-edge") },
    { browser: "Vivaldi", dir: path14.join(cfg, "vivaldi") }
  ];
}
function extensionMarkerPath() {
  return path14.join(CONFIG_DIR, "extension.json");
}
function readExtensionMarker() {
  try {
    return JSON.parse(fs13.readFileSync(extensionMarkerPath(), "utf8"));
  } catch {
    return null;
  }
}
function extensionInstalled() {
  return !!readExtensionMarker();
}
function writeExtensionMarker(flavor, browsers) {
  fs13.mkdirSync(CONFIG_DIR, { recursive: true });
  fs13.writeFileSync(extensionMarkerPath(), JSON.stringify({ installed: true, flavor, browsers, installedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2));
}
function clearExtensionMarker() {
  try {
    fs13.unlinkSync(extensionMarkerPath());
  } catch {
  }
}
var EXTENSION_FLAVORS = {
  chrome: { label: "Chrome (Chromium family)", supported: true },
  chromium: { label: "Chrome (Chromium family)", supported: true },
  firefox: { label: "Firefox", supported: false }
};
function installExtensionHost() {
  const setup = require_native_host_setup();
  resolveLocalToken();
  const srcHost = path14.join(__dirname, "..", "extension", "native-host.cjs");
  if (!fs13.existsSync(srcHost)) {
    console.error(`  Host script not found: ${srcHost}`);
    process.exit(1);
  }
  fs13.mkdirSync(CONFIG_DIR, { recursive: true });
  const hostScript = path14.join(CONFIG_DIR, "extension-token-host.cjs");
  fs13.copyFileSync(srcHost, hostScript);
  const dataDir = process.env.IFRAMER_DATA_DIR || void 0;
  const isWindows = process.platform === "win32";
  const wrapper = path14.join(CONFIG_DIR, isWindows ? "extension-token-host.bat" : "extension-token-host.sh");
  if (isWindows) {
    fs13.writeFileSync(wrapper, setup.windowsWrapper({ execPath: process.execPath, homeDir: HOME_DIR, dataDir }));
  } else {
    fs13.writeFileSync(wrapper, setup.posixWrapper({ execPath: process.execPath, hostScript, dataDir }), { mode: 493 });
  }
  const manifest = setup.hostManifest(wrapper, EXTENSION_ID);
  const installed = [];
  if (isWindows) {
    const manifestPath = path14.join(CONFIG_DIR, `${NM_HOST_NAME}.json`);
    fs13.writeFileSync(manifestPath, manifest);
    for (const { browser, root } of setup.WINDOWS_BROWSERS) {
      try {
        require("child_process").execFileSync(
          "reg.exe",
          ["add", setup.windowsRegistryKey(root), "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
          { stdio: "pipe", windowsHide: true }
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
    if (!always && !fs13.existsSync(dir)) continue;
    try {
      const nmDir = path14.join(dir, "NativeMessagingHosts");
      fs13.mkdirSync(nmDir, { recursive: true });
      fs13.writeFileSync(path14.join(nmDir, `${NM_HOST_NAME}.json`), manifest);
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
    const setup = require_native_host_setup();
    for (const { browser, root } of setup.WINDOWS_BROWSERS) {
      try {
        require("child_process").execFileSync("reg.exe", ["delete", setup.windowsRegistryKey(root), "/f"], { stdio: "pipe", windowsHide: true });
        removed.push(browser);
      } catch {
      }
    }
  } else {
    for (const { browser, dir } of nativeMessagingBrowserDirs()) {
      const file = path14.join(dir, "NativeMessagingHosts", `${NM_HOST_NAME}.json`);
      try {
        if (fs13.existsSync(file)) {
          fs13.unlinkSync(file);
          removed.push(browser);
        }
      } catch {
      }
    }
  }
  for (const f of ["extension-token-host.cjs", "extension-token-host.sh", "extension-token-host.bat", `${NM_HOST_NAME}.json`]) {
    try {
      fs13.unlinkSync(path14.join(CONFIG_DIR, f));
    } catch {
    }
  }
  return removed;
}
async function removeChrome() {
  const chromeDir = path14.join(CONFIG_DIR, "chrome");
  if (!fs13.existsSync(chromeDir)) {
    console.log("  Chrome for Testing not found, nothing to remove.");
    return;
  }
  fs13.rmSync(chromeDir, { recursive: true, force: true });
  console.log(`  Removed ${chromeDir}`);
}
async function main() {
  switch (command) {
    // ─── Version ─────────────────────────────────────────────────────
    case "--version":
    case "-v":
    case "version": {
      try {
        console.log(JSON.parse(fs13.readFileSync(path14.join(__dirname, "..", "package.json"), "utf8")).version);
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
        const info = JSON.parse(fs13.readFileSync(path14.join(CONFIG_DIR, "server.json"), "utf8"));
        const res = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) server = `http://127.0.0.1:${info.port}`;
      } catch {
      }
      console.log(`  Server: ${server}`);
      if (process.env.IFRAMER_SECRET) console.log("  Auth: IFRAMER_SECRET set");
      try {
        const { findChromeForTesting: findChromeForTesting2, findChrome: findChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), chrome_downloader_exports));
        const cft = findChromeForTesting2();
        const system = findChrome2();
        console.log(`  Chrome for Testing: ${cft ? cft : "not installed"}`);
        if (!cft && system) console.log(`  System Chrome: ${system}`);
      } catch {
      }
      const hasDisplay2 = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;
      console.log(`  Display: ${hasDisplay2 ? "available" : "none ($DISPLAY not set)"}`);
      console.log(`  Modes: headless${hasDisplay2 ? ", binary-headful" : ""}`);
      break;
    }
    // ─── Instances (live browser windows) ───────────────────────────
    case "instances":
    case "windows": {
      let instances = null;
      let serverUp = false;
      try {
        const info = JSON.parse(fs13.readFileSync(path14.join(CONFIG_DIR, "server.json"), "utf8"));
        if (info && info.port) {
          serverUp = true;
          const res = await fetch(`http://127.0.0.1:${info.port}/instances`, {
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(1e4)
          });
          if (res.ok) instances = (await res.json()).instances;
        }
      } catch {
        serverUp = false;
      }
      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(instances || [], null, 2));
        break;
      }
      if (!serverUp) {
        console.log("  No iframer server running \u2014 no live windows.");
        break;
      }
      if (!instances) {
        console.log("  Server is running but didn't report windows (may be an older build \u2014 restart it).");
        break;
      }
      if (!instances.length) {
        console.log("  No live browser windows.");
        break;
      }
      console.log(`  ${instances.length} live window(s):
`);
      for (const i of instances) {
        const busy = i.busy ? "busy" : "idle";
        const age = i.ageSeconds < 90 ? `${i.ageSeconds}s` : `${Math.round(i.ageSeconds / 60)}m`;
        console.log(`  \u25CF ${i.instanceId}  [${i.mode}, ${busy}, ${age}]`);
        console.log(`    ${i.title || "(untitled)"}`);
        console.log(`    ${i.url || "(blank)"}`);
        if (i.sessionProfile !== i.instanceId) console.log(`    session: ${i.sessionProfile}`);
        console.log("");
      }
      console.log("  Reattach: run execute with the same instanceId and act on the");
      console.log("  current page (snapshot/read/find) \u2014 don't navigate again.");
      break;
    }
    // ─── Modes ───────────────────────────────────────────────────────
    case "modes": {
      const hasDisplay2 = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;
      let chromeInstalled = false;
      try {
        const { findChromeForTesting: findChromeForTesting2 } = await Promise.resolve().then(() => (init_chrome_downloader(), chrome_downloader_exports));
        chromeInstalled = !!findChromeForTesting2();
      } catch {
      }
      console.log("  Available browser modes:\n");
      console.log(`    headless          ${chromeInstalled ? "\u2713 available" : "\u2717 Chrome for Testing not installed"}`);
      console.log(`    binary-headful    ${chromeInstalled && hasDisplay2 ? "\u2713 available" : "\u2717 " + (!chromeInstalled ? "Chrome not installed" : "no display")}`);
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
      const { readKnowledge: readKnowledge2, listKnowledge: listKnowledge2, clearKnowledge: clearKnowledge2, sanitizeDomain: sanitizeDomain2, getKnowledgeDir: getKnowledgeDir2 } = await Promise.resolve().then(() => (init_knowledge(), knowledge_exports));
      if (!sub || sub === "list") {
        const entries = listKnowledge2();
        if (entries.length === 0) {
          console.log(`  No cached knowledge.`);
          console.log(`  Cache location: ${getKnowledgeDir2()}`);
        } else {
          console.log(`  ${entries.length} domain${entries.length === 1 ? "" : "s"} cached (${getKnowledgeDir2()}):
`);
          for (const e of entries) {
            const size = e.sizeBytes < 1024 ? `${e.sizeBytes}B` : `${(e.sizeBytes / 1024).toFixed(1)}KB`;
            console.log(`    ${e.domain.padEnd(30)} ${e.lastMode.padEnd(16)} ${e.lastVerified}  ${size}`);
          }
          console.log(`
  Inspect one: iframer --cache <domain>`);
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
        const md = readKnowledge2(domain);
        if (!md) {
          console.log(`  No cache for ${sanitizeDomain2(domain)}.`);
          process.exit(1);
        }
        console.log(md);
        break;
      }
      if (sub === "clear") {
        const domain = args[1];
        const { removed } = clearKnowledge2(domain);
        if (domain) {
          console.log(`  Cleared ${removed} entr${removed === 1 ? "y" : "ies"} for ${sanitizeDomain2(domain)}.`);
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
        const { findChromeForTesting: findChromeForTesting2 } = await Promise.resolve().then(() => (init_chrome_downloader(), chrome_downloader_exports));
        chromeAlreadyInstalled = !!findChromeForTesting2();
      } catch {
      }
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
      if (!process.env.LOG_LEVEL && !hasFlag(args, "--verbose")) process.env.LOG_LEVEL = "warn";
      let pipeline;
      const input = args[0];
      if (!input) {
        console.error("  Usage: iframer execute <pipeline.json | inline-json>");
        console.error(`    iframer execute '[{"type":"navigate","url":"https://example.com"},{"type":"screenshot"}]'`);
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
      let steps, inputOptions = {};
      if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options) inputOptions = parsed.options;
      } else if (fs13.existsSync(input)) {
        const parsed = JSON.parse(fs13.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options) inputOptions = parsed.options;
      } else {
        console.error(`  File not found: ${input}`);
        process.exit(1);
      }
      const options = { ...inputOptions };
      const mode = parseModeFlag(args);
      if (mode) options.mode = mode;
      if (hasFlag(args, "--capture-api")) options.captureApi = true;
      if (hasFlag(args, "--continue-on-error")) options.continueOnError = true;
      const timeout = parseFlag(args, "--timeout");
      if (timeout) options.staleTimeoutMs = parseInt(timeout);
      let result;
      if (!hasFlag(args, "--in-process")) {
        const warmOptions = { ...options };
        if (!warmOptions.instanceId) {
          warmOptions.instanceId = deriveCliInstanceId();
          warmOptions.sessionProfile = "default";
        }
        result = await executeViaWarmServer(steps, warmOptions);
      }
      if (!result) {
        const iframer = await getLocalIframer();
        result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options });
      }
      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const { formatExecuteResult: formatExecuteResult2 } = await Promise.resolve().then(() => (init_format_result(), format_result_exports));
        console.log(formatExecuteResult2(result).join("\n"));
        let shot = result.error?.pageState?.screenshotUrl ?? result.finalState?.screenshotUrl;
        if (shot && shot.startsWith("http")) {
          try {
            const res = await fetch(shot, { signal: AbortSignal.timeout(1e4) });
            if (res.ok) {
              const dir = path14.join(os5.tmpdir(), "iframer-screenshots", "screenshots");
              fs13.mkdirSync(dir, { recursive: true });
              const file = path14.join(dir, `state-${Date.now()}.jpg`);
              fs13.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
              shot = `file://${file}`;
            }
          } catch {
          }
        }
        if (shot) console.log(`
Screenshot: ${shot}`);
      }
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
      const extract2 = parseFlag(args, "--extract");
      if (extract2) options.extract = extract2;
      if (hasFlag(args, "--html")) options.returnHtml = true;
      if (hasFlag(args, "--sessionless")) options.sessionless = true;
      const waitFor2 = parseFlag(args, "--wait-for");
      if (waitFor2) options.waitForSelector = waitFor2;
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
      const mode = parseModeFlag(args) || "headless";
      const annotate = hasFlag(args, "--annotate");
      const steps = [
        { type: "navigate", url, waitUntil: "networkidle" },
        { type: "wait", ms: 2e3 },
        { type: "screenshot", annotate }
      ];
      const iframer = await getLocalIframer();
      const result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options: { mode } });
      if (result.ok && result.finalState?.screenshotUrl) {
        console.log(`  Screenshot: ${result.finalState.screenshotUrl}`);
        if (annotate) {
          const snapStep = result.results?.find((r) => r.step?.type === "screenshot");
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
        let stopped = false;
        try {
          const info = JSON.parse(fs13.readFileSync(path14.join(CONFIG_DIR, "server.json"), "utf8"));
          if (info && info.port) {
            const res = await fetch(`http://127.0.0.1:${info.port}/interactive/stop`, {
              method: "POST",
              headers: { "x-api-key": LOCAL_TOKEN },
              signal: AbortSignal.timeout(15e3)
            });
            if (res.ok) {
              const data = await res.json();
              console.log(`  Session stopped. State saved: ${data.sessionSaved}`);
              stopped = true;
            }
          }
        } catch {
        }
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
        const hasFlags = args.some((a) => a.startsWith("--"));
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
            if (!domain) {
              console.error("  Domain is required.");
              process.exit(1);
            }
          }
          body.domain = domain;
          console.log(`
  Storing credentials for ${domain}
`);
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
        console.log(`
  Credentials stored for ${domain}`);
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
        if (!domain) {
          console.error("  Usage: iframer credentials remove <domain>");
          process.exit(1);
        }
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
          { type: "wait", ms: 5e3 }
        ];
      } else if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else if (fs13.existsSync(input)) {
        const parsed = JSON.parse(fs13.readFileSync(input, "utf-8"));
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
        fs13.mkdirSync(outputDir, { recursive: true });
        fs13.writeFileSync(path14.join(outputDir, "captured-api.json"), JSON.stringify(result.capturedApi, null, 2));
        console.log(`  Captured ${result.capturedApi.reduce((sum, api) => sum + api.endpoints.length, 0)} endpoints`);
        console.log(`  Saved to: ${outputDir}/captured-api.json`);
        for (const api of result.capturedApi) {
          console.log(`
  ${api.domain} (${api.baseUrl}):`);
          for (const ep of api.endpoints) {
            console.log(`    ${ep.method} ${ep.path} \u2192 ${ep.responseStatus}`);
          }
        }
      } else {
        console.log("  No API calls captured.");
        if (!result.ok) printResult(result);
      }
      break;
    }
    // ─── In-page capture kit (any agent browser, T3 Code first) ─────
    case "kit": {
      const kit = await Promise.resolve().then(() => (init_kit(), kit_exports));
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
      const kitPath = kit.writeKit(opts, outFile ? path14.resolve(outFile) : void 0);
      const client = parseFlag(args, "--client");
      console.log(kit.kitInstructions(target, kitPath, client ? path14.resolve(client) : void 0));
      break;
    }
    case "ingest": {
      const kit = await Promise.resolve().then(() => (init_kit(), kit_exports));
      const json = hasFlag(args, "--json");
      let input = args[0] && !args[0].startsWith("--") ? args[0] : void 0;
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
        console.error("    --json               One-line JSON summary");
        process.exit(1);
      }
      const fromStdin = input === "-";
      const raw = fromStdin ? fs13.readFileSync(0, "utf8") : fs13.readFileSync(input, "utf8");
      const removeInput = () => {
        if (fromStdin || hasFlag(args, "--keep")) return;
        try {
          fs13.unlinkSync(input);
        } catch {
        }
      };
      let report;
      try {
        report = kit.parseCapture(raw);
      } catch (e) {
        console.error(`  ${e.message}`);
        process.exit(1);
      }
      const findings = kit.scanCapture(report);
      if (findings.length) {
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
      const outDir = path14.resolve(parseFlag(args, "--out") || `./${host.replace(/[^a-z0-9.-]/gi, "_")}-api`);
      fs13.mkdirSync(outDir, { recursive: true });
      const written = [];
      const write2 = (name, body) => {
        const p = path14.join(outDir, name);
        fs13.writeFileSync(p, body);
        written.push(p);
      };
      write2("api.json", JSON.stringify(map, null, 2) + "\n");
      write2("client.js", kit.renderClient(map));
      if (hasFlag(args, "--typed")) write2("client.d.ts", kit.renderTypes(map));
      if (!hasFlag(args, "--no-knowledge")) {
        const { mergeKnowledge: mergeKnowledge2 } = await Promise.resolve().then(() => (init_knowledge(), knowledge_exports));
        const authHeaders = [...new Set(map.endpoints.flatMap((e) => e.authHeaders))];
        const c2 = report.coverage;
        mergeKnowledge2(host, {
          lastMode: `kit-${report.kit?.mode || "hook"}`,
          browserRequired: true,
          auth: { type: authHeaders.length ? "session cookies + headers" : "session cookies", headers: authHeaders.length ? authHeaders : void 0 },
          endpoints: map.endpoints.map((e) => ({
            method: e.method,
            path: e.origin === map.origin ? e.path : `${e.origin}${e.path}`,
            description: kit.describeEndpoint(e),
            example: e.origin === map.origin ? `window.__ifk.call(${JSON.stringify(e.method)}, ${JSON.stringify(e.path)})` : void 0,
            firstSeen: report.capturedAt
          })),
          notes: [
            `In-page capture: ${c2.seen} seen, ${c2.withPayload} with payload, ${c2.pathOnly} path only. Not complete: ${c2.blindSpots.join(", ")}.`,
            "Replay in the page (window.__ifk.call): HttpOnly cookies never leave the browser."
          ]
        });
      }
      removeInput();
      const c = report.coverage;
      if (json) {
        console.log(JSON.stringify({ ok: true, origin: report.origin, endpoints: map.endpoints.length, coverage: { seen: c.seen, withPayload: c.withPayload, pathOnly: c.pathOnly }, files: written, inputDeleted: !fromStdin && !hasFlag(args, "--keep") }));
      } else {
        console.log(`  ${report.origin}: ${map.endpoints.length} endpoints (${c.withPayload} with payload, ${c.pathOnly} path only). Not complete.`);
        for (const e of map.endpoints.slice(0, 40)) console.log(`    ${e.method.padEnd(6)} ${e.origin === map.origin ? e.path : e.origin + e.path}  -> ${e.functionName}`);
        if (map.endpoints.length > 40) console.log(`    \u2026 ${map.endpoints.length - 40} more in api.json`);
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
      let secret = resolveIframerSecret();
      let secretSource = secret ? "env/.env" : null;
      if (!secret) {
        try {
          secret = fs13.readFileSync(path14.join(CONFIG_DIR, "secret"), "utf8").trim();
          if (secret) secretSource = "~/.iframer/secret";
        } catch {
        }
      }
      if (!secret) {
        secret = require("crypto").randomBytes(32).toString("hex");
        secretSource = "generated";
      }
      writeMachineSecret(secret);
      const mcpEntry = { command: runtime.command, args: runtime.args };
      mcpEntry.env = { IFRAMER_SECRET: secret };
      const claudeConfigPath = installClaudeMcp(mcpName, mcpEntry);
      const codexConfigPath = installCodexMcp(mcpName, mcpEntry);
      const skillInstalled = installSkill();
      console.log(`
  ${mcpName} MCP installed!`);
      console.log(`  Encryption key: ${secretSource} \u2192 ~/.iframer/secret`);
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
      const file = path14.join(CONFIG_DIR, "telemetry.jsonl");
      if (args.includes("--clear")) {
        try {
          fs13.unlinkSync(file);
        } catch {
        }
        console.log("  Telemetry log cleared.");
        break;
      }
      let lines;
      try {
        lines = fs13.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
      } catch {
        console.log("  No telemetry recorded yet. It logs automatically as agents use iframer");
        console.log("  (new MCP sessions only \u2014 restart a session if it predates telemetry).");
        break;
      }
      const sessions = /* @__PURE__ */ new Map();
      for (const line of lines) {
        let r;
        try {
          r = JSON.parse(line);
        } catch {
          continue;
        }
        let s = sessions.get(r.session);
        if (!s) {
          s = { calls: 0, tokens: 0, defTokens: 0, tools: /* @__PURE__ */ new Map(), first: r.ts, last: r.ts };
          sessions.set(r.session, s);
        }
        s.last = r.ts;
        if (r.kind === "definitions") s.defTokens = r.estTokens || 0;
        else if (r.kind === "call") {
          s.calls++;
          s.tokens += r.estTokens || 0;
          const t = s.tools.get(r.tool) || { calls: 0, tokens: 0 };
          t.calls++;
          t.tokens += r.estTokens || 0;
          s.tools.set(r.tool, t);
        }
      }
      const fmt = (n) => n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
      let grandCalls = 0, grandTokens = 0;
      const toolTotals = /* @__PURE__ */ new Map();
      for (const s of sessions.values()) {
        grandCalls += s.calls;
        grandTokens += s.tokens;
        for (const [name, t] of s.tools) {
          const g = toolTotals.get(name) || { calls: 0, tokens: 0 };
          g.calls += t.calls;
          g.tokens += t.tokens;
          toolTotals.set(name, g);
        }
      }
      console.log(`
  iframer MCP token telemetry (estimated at ~4 chars/token, local only)
`);
      console.log(`  All time: ${sessions.size} session(s), ${grandCalls} call(s), ~${fmt(grandTokens)} tokens of tool traffic`);
      console.log(`
  Per tool (all time):`);
      for (const [name, t] of [...toolTotals.entries()].sort((a, b) => b[1].tokens - a[1].tokens)) {
        console.log(`    ${name.padEnd(18)} ${String(t.calls).padStart(4)} calls  ~${fmt(t.tokens).padStart(7)} tokens`);
      }
      console.log(`
  Recent sessions:`);
      const recent = [...sessions.entries()].slice(-5);
      for (const [id, s] of recent) {
        console.log(`    ${id.padEnd(20)} ${String(s.calls).padStart(4)} calls  ~${fmt(s.tokens).padStart(7)} tokens (+~${fmt(s.defTokens)} definitions overhead, once per session)`);
      }
      console.log(`
  Note: definitions overhead excludes zod schema text \u2014 Claude Code's /context`);
      console.log(`  shows the exact per-session definition footprint. Clear log: iframer telemetry --clear
`);
      break;
    }
    // ─── Extension auto-pairing ──────────────────────────────────────
    case "install-extension": {
      const flavor = (args[0] || "chrome").toLowerCase();
      const spec = EXTENSION_FLAVORS[flavor];
      if (!spec) {
        console.error(`  Unknown browser: ${flavor}. Supported: ${Object.keys(EXTENSION_FLAVORS).filter((k, i, a) => a.indexOf(k) === i).join(", ")}`);
        console.error("  Usage: iframer install extension chrome");
        process.exit(1);
      }
      if (!spec.supported) {
        console.log(`  ${spec.label} extension isn't available yet \u2014 coming soon.`);
        console.log("  For now: iframer install extension chrome");
        break;
      }
      console.log(`  Installing the iframer extension for ${spec.label}...
`);
      const { installed, wrapper } = installExtensionHost();
      if (installed.length === 0) {
        console.log("  No Chromium-family browser directories found \u2014 nothing installed.");
        break;
      }
      console.log(`  Pairing host installed for: ${installed.join(", ")}`);
      const hostTest = await require_native_host_setup().testHost(wrapper);
      if (hostTest.ok && hostTest.info && hostTest.info.token) {
        console.log("  Pairing host test: OK");
      } else {
        console.log(`  Pairing host test FAILED: ${hostTest.error || "host returned no token"}`);
        console.log("  Auto-pairing won't work. To pair by hand, run `iframer extension token`");
        console.log("  and paste the result into the extension popup.");
      }
      try {
        const { LocalServerManager: LocalServerManager2 } = await Promise.resolve().then(() => (init_local_server(), local_server_exports));
        const manager = new LocalServerManager2();
        await manager.ensureRunning();
        console.log(`  Server running: ${manager.getBaseUrl()}`);
      } catch (e) {
        console.log(`  Server failed to start: ${e.message}`);
        console.log("  The extension can't connect until it runs. Log: ~/.iframer/local-server.log");
      }
      console.log("\n  \u250C\u2500 ONE manual step to finish \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
      console.log("  \u2502  1. Open  chrome://extensions");
      console.log("  \u2502  2. Turn on  Developer mode  (top-right)");
      console.log("  \u2502  3. Click  Load unpacked  and select this folder:");
      console.log(`  \u2502       ${extensionDir()}`);
      console.log("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
      console.log("\n  Load it from THAT path (inside the installed package) so `iframer");
      console.log("  update` can refresh it in place. Once loaded it pairs itself \u2014 no");
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
      const pkgRoot = path14.join(__dirname, "..");
      const isDev = fs13.existsSync(path14.join(pkgRoot, ".git"));
      let installed = "unknown";
      try {
        installed = JSON.parse(fs13.readFileSync(path14.join(pkgRoot, "package.json"), "utf8")).version;
      } catch {
      }
      let latest = null;
      try {
        latest = require("child_process").execSync("npm view iframer-toolkit version", { encoding: "utf8" }).trim();
      } catch {
      }
      console.log(`  installed: v${installed}${latest ? `    latest: v${latest}` : "    (could not reach npm registry)"}`);
      if (!latest) {
        if (checkOnly) break;
      }
      const newerAvailable = latest && semverNewer(latest, installed);
      if (latest && !newerAvailable) {
        console.log(installed === latest ? "  Already up to date." : `  You're on v${installed}, ahead of npm's v${latest}. Nothing to do.`);
        break;
      }
      if (checkOnly) {
        if (newerAvailable) console.log("  Update available \u2014 run `iframer update` to apply.");
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
      console.log();
      const hasExt = extensionInstalled();
      await reloadAndRestartServer(hasExt);
      console.log(`
  Updated to v${latest || "latest"}.${hasExt ? "" : " (Extension not installed \u2014 nothing to reload.)"}
`);
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
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      const claudeResult = removeClaudeMcp(mcpName);
      const codexResult = removeCodexMcp(mcpName);
      const skillRemoved = removeSkill();
      if (!claudeResult.removed && !codexResult.removed && !skillRemoved) {
        console.log(`  ${mcpName} MCP is not installed in Claude Code or Codex.`);
        break;
      }
      console.log(`
  ${mcpName} MCP removed!`);
      if (claudeResult.removed) console.log(`  Claude Code config updated: ${claudeResult.path}`);
      if (codexResult.removed) console.log(`  Codex config updated: ${codexResult.path}`);
      if (skillRemoved) console.log("  Skill /iframer removed from Claude Code");
      console.log("  Restart Claude Code and Codex for the change to take effect.\n");
      break;
    }
    // ─── Help ────────────────────────────────────────────────────────
    default:
      console.log(`
  iframer \u2014 browser automation for AI agents

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
