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
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/lib/session/persistence.ts
var exports_persistence = {};
__export(exports_persistence, {
  injectStorage: () => injectStorage,
  injectCookies: () => injectCookies,
  extractSession: () => extractSession
});
async function extractSession(context, page) {
  const cookies = await context.cookies();
  const { localStorage, sessionStorage } = await page.evaluate(() => {
    const ls = {};
    const ss = {};
    for (let i = 0;i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      ls[key] = window.localStorage.getItem(key);
    }
    for (let i = 0;i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      ss[key] = window.sessionStorage.getItem(key);
    }
    return { localStorage: ls, sessionStorage: ss };
  });
  const origin = new URL(page.url()).origin;
  return {
    cookies,
    localStorage: { [origin]: localStorage },
    sessionStorage: { [origin]: sessionStorage },
    extractedAt: new Date().toISOString()
  };
}
async function injectCookies(context, sessionData) {
  if (sessionData?.cookies?.length > 0) {
    await context.addCookies(sessionData.cookies);
  }
}
async function injectStorage(page, sessionData) {
  if (!sessionData)
    return;
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

// index.ts
var import_express = __toESM(require("express"));
var import_path10 = __toESM(require("path"));
var import_fs11 = __toESM(require("fs"));
var import_url2 = require("url");

// src/api/routes.ts
var import_patchright3 = require("patchright");

// src/lib/iframer.ts
var import_path9 = __toESM(require("path"));
var import_url = require("url");

// src/lib/browser/session-manager.ts
var import_child_process = require("child_process");
var import_fs2 = __toESM(require("fs"));

// src/lib/browser/launcher.ts
var import_fs = __toESM(require("fs"));
var import_patchright = require("patchright");

// src/lib/browser/stealth.ts
var contextStealthScripts = new Map;
var CHROME_VERSION = "136.0.7103.93";
var USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
var NATIVE_TOSTRING_HELPER = `
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

  // Safely patch Navigator.prototype — delete first to handle non-configurable properties
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

  // WebRTC IP leak prevention — filter private/container IP candidates
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
  // Workers have their own WorkerNavigator global — page.addInitScript doesn't reach them
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
      // Skip wrapping module workers — importScripts doesn't exist in ES module scope
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
var STEALTH_SCRIPT = buildStealthScript();
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
var STEALTH_ARGS = [
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

// src/lib/browser/launcher.ts
var log = createLogger("launcher");
var UBLOCK_PATH = "/extensions/uBlock0.chromium";
function findChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE)
    return process.env.CHROME_EXECUTABLE;
  if (import_fs.default.existsSync("/usr/bin/google-chrome-stable"))
    return "/usr/bin/google-chrome-stable";
  return;
}
var cachedBrowser = null;
async function getBrowser(_name = "chromium") {
  if (cachedBrowser) {
    if (cachedBrowser.isConnected())
      return cachedBrowser;
    try {
      await cachedBrowser.close();
    } catch (e) {
      log.warn(`stale browser close failed: ${e}`);
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
  if (!cachedBrowser)
    return;
  try {
    await cachedBrowser.close();
  } catch (e) {
    log.warn(`closeBrowser failed: ${e}`);
  }
  cachedBrowser = null;
}
async function getBrowserWithFallback(_preferred) {
  return { browser: await getBrowser(), name: "chromium" };
}
async function launchHeadful(displayNum) {
  const executablePath = findChromeExecutable();
  const hasExtensions = import_fs.default.existsSync(UBLOCK_PATH);
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-infobars",
    "--window-size=1920,1080",
    "--force-device-scale-factor=1.25",
    "--use-gl=angle",
    "--use-angle=swiftshader"
  ];
  if (hasExtensions)
    args.push(`--load-extension=${UBLOCK_PATH}`);
  const launchOpts = {
    headless: false,
    args,
    env: { ...process.env, DISPLAY: `:${displayNum}` }
  };
  if (executablePath)
    launchOpts.executablePath = executablePath;
  log.debug(`headful: ${executablePath || "patchright chromium"}, extensions: ${hasExtensions}`);
  return import_patchright.chromium.launch(launchOpts);
}

// src/lib/browser/fingerprint.ts
var import_fingerprint_generator = require("fingerprint-generator");

// src/lib/constants.ts
var TIMING = {
  MOUSE_MOVE: [50, 200],
  CLICK_HOLD: [30, 90],
  POST_CLICK: [100, 300],
  CHAR_DELAY: [30, 150],
  WORD_PAUSE: [200, 500],
  IDLE_MOUSE_X: [100, 400],
  IDLE_MOUSE_Y: [100, 300],
  PRE_CHECKBOX_X: [200, 600],
  PRE_CHECKBOX_Y: [150, 400],
  PRE_CHECKBOX_WAIT: [300, 800],
  POST_CHECKBOX_WAIT: 2500,
  POST_VERIFY_WAIT: 2000,
  TILE_CLICK_DELAY: [200, 500],
  TILE_SETTLE: 800,
  CAPTCHA_DETECT_WAIT: 1500,
  POST_LOGIN_WAIT: 1500,
  POST_SUBMIT_WAIT: 500,
  POST_SUBMIT_EXTENDED: 2000,
  PRE_NAVIGATE: [300, 700],
  DIGIT_DELAY_BASE: 80,
  DIGIT_DELAY_RANGE: 120,
  POST_FORM_CLICK: 200,
  POST_TOTP_WAIT: 300,
  POST_COOKIES_WAIT: 300,
  SCROLL_DELAY: 150,
  STALE_CHECK_INTERVAL: 2000
};
var CAPTCHA_GRID = {
  RECAPTCHA_HEADER_HEIGHT: 112,
  HCAPTCHA_HEADER_HEIGHT: 110,
  DEFAULT_TILE_SIZE: 125,
  GRID_PADDING: 24,
  GRID_MARGIN: 12,
  VERIFY_BTN_BOTTOM_OFFSET: 35,
  VERIFY_BTN_RIGHT_OFFSET: 60
};
var SCREEN_DEFAULTS = {
  WIDTH: 1920,
  HEIGHT: 1080,
  AVAIL_HEIGHT: 1040,
  DPR: 1.25
};
var THRESHOLDS = {
  STALE_CHAR_CHANGE: 100,
  STALE_PERCENT_CHANGE: 0.05,
  MIN_BODY_TEXT: 200,
  MAX_RESPONSE_TEXT: 1e5
};
var TIMEOUTS = {
  DEFAULT_STALE: 20000,
  NAVIGATION: 60000,
  SELECTOR_WAIT: 1e4,
  TOTP_INPUT: 5000,
  API_REQUEST: 180000,
  HEALTH_CHECK: 3000,
  CHALLENGE_FRAME_WAIT: 5000,
  TAB_FOLLOW_SETTLE: 400,
  TAB_LOAD: 15000,
  TAB_BLANK_RESOLVE: 3000
};
var CHROME_MIN_VERSION = 130;

// src/lib/browser/fingerprint.ts
var generator = new import_fingerprint_generator.FingerprintGenerator({
  browsers: [{ name: "chrome", minVersion: CHROME_MIN_VERSION }],
  operatingSystems: ["windows"],
  devices: ["desktop"],
  locales: ["en-US"]
});
function generateWindowsFingerprint() {
  const fp = generator.getFingerprint();
  const { navigator: nav, screen } = fp.fingerprint;
  const dprOptions = [1.25, 1.5, 1.25, 1.5, 1];
  const dpr = dprOptions[Math.floor(Math.random() * dprOptions.length)];
  const w = screen.width || SCREEN_DEFAULTS.WIDTH;
  const h = screen.height || SCREEN_DEFAULTS.HEIGHT;
  return {
    userAgent: nav.userAgent,
    platform: "Win32",
    screenWidth: w,
    screenHeight: h,
    screenAvailHeight: h - 40,
    colorDepth: 24,
    deviceScaleFactor: dpr,
    hardwareConcurrency: nav.hardwareConcurrency || 8,
    deviceMemory: nav.deviceMemory || 8,
    languages: nav.languages || ["en-US", "en"],
    uaData: nav.userAgentData
  };
}

// src/lib/browser/session-manager.ts
var log2 = createLogger("session");
var BASE_DISPLAY = parseInt(process.env.VNC_BASE_DISPLAY || "99", 10);
var MAX_SESSIONS = parseInt(process.env.VNC_MAX_SESSIONS || "20", 10);
var SESSION_TIMEOUT = parseInt(process.env.VNC_SESSION_TIMEOUT_MS || "300000", 10);
var sessions = new Map;
var usedDisplays = new Set;
function allocateDisplay() {
  for (let i = 0;i < MAX_SESSIONS; i++) {
    const num = BASE_DISPLAY + i;
    if (!usedDisplays.has(num)) {
      usedDisplays.add(num);
      return num;
    }
  }
  throw new Error("No available displays. Max concurrent sessions reached.");
}
function freeDisplay(num) {
  usedDisplays.delete(num);
}
function waitForSocket(displayNum, timeoutMs = 5000) {
  const socketPath = `/tmp/.X11-unix/X${displayNum}`;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (import_fs2.default.existsSync(socketPath))
        return resolve();
      if (Date.now() - start > timeoutMs)
        return reject(new Error(`Xvfb socket not ready after ${timeoutMs}ms`));
      setTimeout(check, 100);
    };
    check();
  });
}
function killProcess(proc) {
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
}
async function startSession(userId) {
  if (sessions.has(userId)) {
    return sessions.get(userId);
  }
  const displayNum = allocateDisplay();
  const vncPort = 5900 + displayNum;
  const wsPort = 6080 + (displayNum - BASE_DISPLAY);
  const xvfb = import_child_process.spawn("Xvfb", [`:${displayNum}`, "-screen", "0", "1920x1080x24", "-ac"], {
    stdio: "ignore"
  });
  await waitForSocket(displayNum);
  const x11vnc = import_child_process.spawn("x11vnc", ["-display", `:${displayNum}`, "-nopw", "-listen", "localhost", "-rfbport", String(vncPort), "-shared", "-forever"], { stdio: "ignore" });
  const noVncPath = import_fs2.default.existsSync("/usr/share/novnc") ? "/usr/share/novnc" : "/usr/share/noVNC";
  const websockify = import_child_process.spawn("websockify", ["--web", noVncPath, String(wsPort), `localhost:${vncPort}`], {
    stdio: "ignore"
  });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await launchHeadful(displayNum);
  const fingerprint = generateWindowsFingerprint();
  const ctxOpts = stealthContextOptions({}, userId, fingerprint);
  const context = await browser.newContext(ctxOpts);
  const stealthScript = buildStealthScript(fingerprint);
  contextStealthScripts.set(context, stealthScript);
  const page = await context.newPage();
  log2.debug(`fingerprint: ${fingerprint.userAgent.slice(0, 60)}... DPR=${fingerprint.deviceScaleFactor} screen=${fingerprint.screenWidth}x${fingerprint.screenHeight}`);
  const session = {
    displayNum,
    vncPort,
    wsPort,
    xvfb,
    x11vnc,
    websockify,
    browser,
    context,
    page,
    createdAt: new Date,
    timeoutTimer: null
  };
  session.timeoutTimer = setTimeout(() => stopSession(userId), SESSION_TIMEOUT);
  sessions.set(userId, session);
  return session;
}
function resetTimeout(userId) {
  const session = sessions.get(userId);
  if (session) {
    clearTimeout(session.timeoutTimer);
    session.timeoutTimer = setTimeout(() => stopSession(userId), SESSION_TIMEOUT);
  }
}
function getSession(userId) {
  return sessions.get(userId) || null;
}
async function stopSession(userId) {
  const session = sessions.get(userId);
  if (!session)
    return null;
  clearTimeout(session.timeoutTimer);
  let sessionData = null;
  try {
    const { extractSession: extractSession2 } = await Promise.resolve().then(() => exports_persistence);
    sessionData = await extractSession2(session.context, session.page);
  } catch {}
  contextStealthScripts.delete(session.context);
  try {
    await session.context.close();
  } catch {}
  try {
    await session.browser.close();
  } catch {}
  killProcess(session.websockify);
  killProcess(session.x11vnc);
  killProcess(session.xvfb);
  await new Promise((r) => setTimeout(r, 1000));
  try {
    import_fs2.default.unlinkSync(`/tmp/.X11-unix/X${session.displayNum}`);
  } catch {}
  freeDisplay(session.displayNum);
  sessions.delete(userId);
  return sessionData;
}
async function cleanupAllSessions() {
  const userIds = [...sessions.keys()];
  await Promise.all(userIds.map((id) => stopSession(id)));
}

// src/lib/auth/crypto.ts
var import_crypto = __toESM(require("crypto"));
var import_fs3 = __toESM(require("fs"));
var import_os2 = __toESM(require("os"));
var import_path2 = __toESM(require("path"));

// src/lib/paths.ts
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}

// src/lib/auth/crypto.ts
var SALT = "iframer-session";
var INFO = "encryption";
var KEY_LENGTH = 32;
var IV_LENGTH = 12;
var TAG_LENGTH = 16;
function getLocalToken() {
  if (process.env.IFRAMER_SECRET)
    return process.env.IFRAMER_SECRET;
  const candidates = [
    import_path2.default.join(getDataDir(), "secret"),
    import_path2.default.join(process.env.XDG_RUNTIME_DIR || import_os2.default.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = import_fs3.default.readFileSync(file, "utf8").trim();
      if (existing)
        return existing;
    } catch {}
  }
  for (const file of candidates) {
    try {
      import_fs3.default.mkdirSync(import_path2.default.dirname(file), { recursive: true });
      const secret = import_crypto.default.randomBytes(32).toString("hex");
      import_fs3.default.writeFileSync(file, secret, { mode: 384 });
      return secret;
    } catch {}
  }
  throw new Error("iframer: could not read or create a persistent encryption secret in any " + `writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a ` + "stable value shared between the MCP server and CLI (openssl rand -hex 32).");
}
function deriveKey(token, purpose = INFO) {
  return new Promise((resolve, reject) => {
    import_crypto.default.hkdf("sha256", token, SALT, purpose, KEY_LENGTH, (err, key) => {
      if (err)
        return reject(err);
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
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}
function generateTOTP(secret, period = 30, digits = 6) {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";
  for (const c of cleanSecret) {
    const val = base32Chars.indexOf(c);
    if (val === -1)
      continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const keyBytes = [];
  for (let i = 0;i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(keyBytes);
  const time = Math.floor(Date.now() / 1000 / period);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / 4294967296), 0);
  timeBuffer.writeUInt32BE(time & 4294967295, 4);
  const hmac = import_crypto.default.createHmac("sha1", key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255) % Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}
// src/lib/screenshot.ts
var import_fs4 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var log3 = createLogger("screenshot");
var MAX_AGE_MS = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10);
var MAX_FILES = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_FILES || "500", 10);
var PRUNE_THROTTLE_MS = 5 * 60 * 1000;
var lastPruneAt = 0;
function saveScreenshot(buffer, filename, screenshotDir, publicUrl) {
  import_fs4.default.mkdirSync(screenshotDir, { recursive: true });
  const filePath = import_path3.default.join(screenshotDir, filename);
  import_fs4.default.writeFileSync(filePath, buffer);
  maybePrune(screenshotDir);
  return `${publicUrl}/screenshots/${filename}`;
}
function maybePrune(dir) {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_THROTTLE_MS)
    return;
  lastPruneAt = now;
  pruneScreenshots(dir);
}
function pruneScreenshots(dir, opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? MAX_AGE_MS;
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const now = opts.now ?? Date.now();
  try {
    const entries = import_fs4.default.readdirSync(dir).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png")).map((f) => {
      const full = import_path3.default.join(dir, f);
      try {
        return { full, mtimeMs: import_fs4.default.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
    let removed = 0;
    const survivors = [];
    for (const e of entries) {
      if (now - e.mtimeMs > maxAgeMs) {
        try {
          import_fs4.default.unlinkSync(e.full);
          removed++;
        } catch {}
      } else {
        survivors.push(e);
      }
    }
    if (survivors.length > maxFiles) {
      survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const e of survivors.slice(0, survivors.length - maxFiles)) {
        try {
          import_fs4.default.unlinkSync(e.full);
          removed++;
        } catch {}
      }
    }
    if (removed > 0)
      log3.debug(`pruned ${removed} old screenshot(s) from ${dir}`);
    return removed;
  } catch (err) {
    log3.warn(`screenshot prune failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// src/lib/session/sqlite-store.ts
var import_path4 = __toESM(require("path"));
var import_fs5 = __toESM(require("fs"));
var IS_BUN = typeof globalThis.Bun !== "undefined";
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

class SqliteStore {
  db;
  constructor(dataDir) {
    import_fs5.default.mkdirSync(dataDir, { recursive: true });
    const dbPath = import_path4.default.join(dataDir, "iframer.db");
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
      this.db.run(`INSERT OR IGNORE INTO credentials (user_id, domain, blob)
         SELECT ?, domain, blob FROM credentials WHERE user_id = ?`, CANONICAL, legacy);
      this.db.run(`INSERT OR IGNORE INTO sessions (user_id, blob)
         SELECT ?, blob FROM sessions WHERE user_id = ?`, CANONICAL, legacy);
    }
  }
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
  close() {
    this.db.close();
  }
}

// src/lib/storage.ts
function createStore(options = {}) {
  const dataDir = options.dataDir || getDataDir();
  return new SqliteStore(dataDir);
}

// src/lib/browser/daemon.ts
var import_patchright2 = require("patchright");
var import_crypto2 = require("crypto");

// src/lib/browser/chrome-downloader.ts
var import_fs6 = __toESM(require("fs"));
var import_path5 = __toESM(require("path"));
var import_os3 = __toESM(require("os"));
var import_child_process2 = require("child_process");
var log4 = createLogger("chrome");
var CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
var DEFAULT_INSTALL_DIR = import_path5.default.join(import_os3.default.homedir(), ".iframer", "chrome");
function getPlatform() {
  const arch = process.arch;
  const platform = process.platform;
  if (platform === "darwin")
    return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "linux")
    return arch === "arm64" ? "linux-arm64" : "linux64";
  if (platform === "win32")
    return "win64";
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}
function getChromeExecutablePath(installDir) {
  const platform = process.platform;
  if (platform === "darwin") {
    const entries = import_fs6.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-mac-arm64";
    return import_path5.default.join(installDir, dir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (platform === "linux") {
    const entries = import_fs6.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-linux64";
    return import_path5.default.join(installDir, dir, "chrome");
  }
  if (platform === "win32") {
    const entries = import_fs6.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-win64";
    return import_path5.default.join(installDir, dir, "chrome.exe");
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
async function downloadChrome(installDir = DEFAULT_INSTALL_DIR) {
  log4.info("Downloading Chrome for Testing (first time only)...");
  const res = await fetch(CHROME_VERSIONS_URL);
  if (!res.ok)
    throw new Error(`Failed to fetch Chrome versions: ${res.status}`);
  const data = await res.json();
  const channel = data.channels?.Stable;
  if (!channel)
    throw new Error("No Stable channel found in Chrome for Testing versions");
  const platform = getPlatform();
  const download = channel.downloads?.chrome?.find((d) => d.platform === platform);
  if (!download)
    throw new Error(`No Chrome for Testing download for platform: ${platform}`);
  const url = download.url;
  const version = channel.version;
  log4.debug(`Version ${version} for ${platform}`);
  log4.debug(`URL: ${url}`);
  import_fs6.default.mkdirSync(installDir, { recursive: true });
  const zipPath = import_path5.default.join(installDir, "chrome.zip");
  const dlRes = await fetch(url);
  if (!dlRes.ok)
    throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  import_fs6.default.writeFileSync(zipPath, buf);
  log4.info(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  import_child_process2.execSync(`unzip -o -q "${zipPath}" -d "${installDir}"`, { stdio: "inherit" });
  import_fs6.default.unlinkSync(zipPath);
  const execPath = getChromeExecutablePath(installDir);
  if (!import_fs6.default.existsSync(execPath)) {
    throw new Error(`Chrome executable not found after extraction: ${execPath}`);
  }
  if (process.platform !== "win32") {
    import_fs6.default.chmodSync(execPath, 493);
  }
  import_fs6.default.writeFileSync(import_path5.default.join(installDir, "version.json"), JSON.stringify({ version, platform, downloadedAt: new Date().toISOString() }));
  log4.info(`Installed at: ${execPath}`);
  return execPath;
}
function findChromeForTesting() {
  if (process.env.CHROME_EXECUTABLE) {
    if (import_fs6.default.existsSync(process.env.CHROME_EXECUTABLE))
      return process.env.CHROME_EXECUTABLE;
  }
  try {
    const execPath = getChromeExecutablePath(DEFAULT_INSTALL_DIR);
    if (import_fs6.default.existsSync(execPath))
      return execPath;
  } catch {}
  return null;
}
function findChrome() {
  const cft = findChromeForTesting();
  if (cft)
    return cft;
  const systemPaths = process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ] : process.platform === "linux" ? [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    ...(() => {
      try {
        const dirs = import_fs6.default.readdirSync("/ms-playwright").filter((d) => d.startsWith("chromium-")).sort().reverse();
        return dirs.map((d) => import_path5.default.join("/ms-playwright", d, "chrome-linux", "chrome"));
      } catch {
        return [];
      }
    })()
  ] : [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (const p of systemPaths) {
    if (import_fs6.default.existsSync(p))
      return p;
  }
  return null;
}
async function ensureChrome() {
  const cft = findChromeForTesting();
  if (cft)
    return cft;
  try {
    return await downloadChrome();
  } catch (err) {
    log4.error(`Failed to download Chrome for Testing: ${err instanceof Error ? err.message : String(err)}`);
    const system = findChrome();
    if (system) {
      log4.warn(`Falling back to system Chrome: ${system}`);
      return system;
    }
    throw new Error("No Chrome found. Download failed and no system Chrome available.");
  }
}

// src/lib/browser/cloak-browser.ts
var log5 = createLogger("cloak");
var _available = null;
async function tryImport() {
  try {
    return await import("cloakbrowser");
  } catch {
    return null;
  }
}
async function ensureBinary() {
  const cloak = await tryImport();
  if (!cloak)
    return false;
  try {
    const info = cloak.binaryInfo();
    if (!info.installed) {
      log5.info("Downloading CloakBrowser binary...");
      await cloak.ensureBinary();
      log5.info("CloakBrowser ready");
    }
    _available = true;
    return true;
  } catch (err) {
    log5.warn(`CloakBrowser setup failed: ${err instanceof Error ? err.message : String(err)}`);
    _available = false;
    return false;
  }
}
async function launchCloakBrowser(options) {
  const cloak = await tryImport();
  if (!cloak)
    return null;
  try {
    const ok = await ensureBinary();
    if (!ok)
      return null;
    const browser = await cloak.launch({
      headless: options.headless,
      args: options.args
    });
    log5.info(`CloakBrowser launched (headless=${options.headless})`);
    return browser;
  } catch (err) {
    log5.warn(`CloakBrowser launch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// src/lib/browser/registry.ts
var import_fs7 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
var import_child_process3 = require("child_process");
var log6 = createLogger("registry");
function browsersDir() {
  const dir = import_path6.default.join(getDataDir(), "browsers");
  import_fs7.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function serverInfoPath() {
  return import_path6.default.join(getDataDir(), "server.json");
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
function pidMatchesMarker(pid, marker) {
  if (!isPidAlive(pid))
    return false;
  try {
    const cmd = import_child_process3.execSync(`ps -o command= -p ${pid}`, { encoding: "utf8" });
    return cmd.includes(marker);
  } catch {
    return false;
  }
}
function findChromePidByMarker(marker) {
  try {
    const out = import_child_process3.execSync(`pgrep -f -- "${marker}"`, { encoding: "utf8" }).trim();
    const pids = out.split(`
`).map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n !== process.pid);
    if (pids.length === 0)
      return null;
    return Math.min(...pids);
  } catch {
    return null;
  }
}
function registerBrowser(rec) {
  try {
    import_fs7.default.writeFileSync(import_path6.default.join(browsersDir(), `${rec.chromePid}.json`), JSON.stringify(rec, null, 2));
  } catch (err) {
    log6.warn(`failed to write browser record for pid ${rec.chromePid}: ${err}`);
  }
}
function unregisterBrowser(chromePid) {
  try {
    import_fs7.default.unlinkSync(import_path6.default.join(browsersDir(), `${chromePid}.json`));
  } catch {}
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function forceKillBrowser(rec) {
  if (!isPidAlive(rec.chromePid))
    return true;
  if (!pidMatchesMarker(rec.chromePid, rec.marker)) {
    return true;
  }
  try {
    process.kill(rec.chromePid, "SIGKILL");
  } catch {}
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!isPidAlive(rec.chromePid))
      return true;
    await sleep(100);
  }
  return !isPidAlive(rec.chromePid);
}
async function reapOrphanBrowsers() {
  let reaped = 0;
  let skipped = 0;
  let files = [];
  try {
    files = import_fs7.default.readdirSync(browsersDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return { reaped, skipped };
  }
  for (const file of files) {
    const full = import_path6.default.join(browsersDir(), file);
    let rec;
    try {
      rec = JSON.parse(import_fs7.default.readFileSync(full, "utf8"));
    } catch {
      try {
        import_fs7.default.unlinkSync(full);
      } catch {}
      continue;
    }
    if (!isPidAlive(rec.chromePid) || !pidMatchesMarker(rec.chromePid, rec.marker)) {
      try {
        import_fs7.default.unlinkSync(full);
      } catch {}
      continue;
    }
    if (isPidAlive(rec.ownerPid)) {
      skipped++;
      continue;
    }
    log6.info(`reaping orphan Chrome pid=${rec.chromePid} (${rec.key}), owner ${rec.ownerPid} is dead`);
    if (await forceKillBrowser(rec)) {
      try {
        import_fs7.default.unlinkSync(full);
      } catch {}
      reaped++;
    } else {
      log6.warn(`failed to kill orphan Chrome pid=${rec.chromePid} — leaving record for next sweep`);
    }
  }
  return { reaped, skipped };
}
function writeServerInfo(info) {
  import_fs7.default.writeFileSync(serverInfoPath(), JSON.stringify(info, null, 2));
}
function readServerInfo() {
  try {
    const info = JSON.parse(import_fs7.default.readFileSync(serverInfoPath(), "utf8"));
    if (!Number.isInteger(info.pid) || !Number.isInteger(info.port))
      return null;
    return info;
  } catch {
    return null;
  }
}
function clearServerInfo(pid) {
  const info = readServerInfo();
  if (info && info.pid === pid) {
    try {
      import_fs7.default.unlinkSync(serverInfoPath());
    } catch {}
  }
}

// src/lib/browser/daemon.ts
var log7 = createLogger("daemon");
var DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
var CLOSE_GRACE_MS = 5000;
var DEFAULT_INSTANCE = "default";
function keyOf(mode, instanceId) {
  return `${mode}::${instanceId}`;
}
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));

class BrowserDaemon {
  instances = new Map;
  idleTimers = new Map;
  idleTimeout;
  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;
  }
  async ensure(mode, instanceId = DEFAULT_INSTANCE) {
    if (mode === "docker-headful") {
      throw new Error("Docker mode doesn't use the daemon. Use the Docker API.");
    }
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
            log7.info(`Page for ${mode} is dead, creating fresh context`);
            try {
              await context2.close();
            } catch (err) {
              log7.warn(`dead-page context close failed: ${err}`);
            }
            context2 = await instance.browser.newContext();
            page2 = await context2.newPage();
            instance.context = context2;
            instance.page = page2;
          }
          this.resetIdleTimer(key);
          return { browser: instance.browser, context: context2, page: page2 };
        }
      } catch {}
      log7.info(`Browser for ${key} disconnected (window closed?), relaunching...`);
      await this.stopMode(mode, instanceId);
    }
    const marker = `--iframer-key=${key}-${import_crypto2.randomUUID()}`;
    let browser;
    const cloakBrowser = await launchCloakBrowser({ headless: mode === "headless", args: [marker] });
    if (cloakBrowser) {
      log7.info(`CloakBrowser ${mode} ready`);
      browser = cloakBrowser;
    } else {
      const executablePath = await ensureChrome();
      log7.info(`Falling back to Chrome for Testing in ${mode} mode: ${executablePath}`);
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
        launchedAt: new Date().toISOString()
      });
    } else {
      log7.warn(`could not resolve Chrome PID for ${key} — force-kill unavailable for this instance`);
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    instance = {
      browser,
      context,
      page,
      mode,
      instanceId,
      createdAt: new Date,
      chromePid,
      marker,
      active: 0
    };
    this.instances.set(key, instance);
    this.resetIdleTimer(key);
    log7.info(`Chrome ${key} ready (pid=${chromePid ?? "unknown"})`);
    return { browser, context, page };
  }
  acquire(mode, instanceId = DEFAULT_INSTANCE) {
    const instance = this.instances.get(keyOf(mode, instanceId));
    if (instance)
      instance.active++;
  }
  release(mode, instanceId = DEFAULT_INSTANCE) {
    const key = keyOf(mode, instanceId);
    const instance = this.instances.get(key);
    if (!instance)
      return;
    instance.active = Math.max(0, instance.active - 1);
    if (instance.active === 0)
      this.resetIdleTimer(key);
  }
  isRunning(mode, instanceId = DEFAULT_INSTANCE) {
    const instance = this.instances.get(keyOf(mode, instanceId));
    if (!instance)
      return false;
    try {
      return instance.browser.isConnected();
    } catch {
      return false;
    }
  }
  runningModes() {
    return [...new Set(this.liveInstances().map((i) => i.mode))];
  }
  liveInstances() {
    return [...this.instances.values()].filter((inst) => {
      try {
        return inst.browser.isConnected();
      } catch {
        return false;
      }
    });
  }
  async stopMode(mode, instanceId = DEFAULT_INSTANCE) {
    await this.stopKey(keyOf(mode, instanceId));
  }
  async stopKey(key) {
    const instance = this.instances.get(key);
    if (!instance)
      return;
    const timer = this.idleTimers.get(key);
    if (timer)
      clearTimeout(timer);
    this.idleTimers.delete(key);
    log7.info(`Stopping Chrome ${key} (pid=${instance.chromePid ?? "unknown"})...`);
    const politeClose = (async () => {
      try {
        await instance.context.close();
      } catch (err) {
        log7.warn(`context.close failed for ${key}: ${err}`);
      }
      try {
        await instance.browser.close();
      } catch (err) {
        log7.warn(`browser.close failed for ${key}: ${err}`);
      }
    })();
    const closedInTime = await Promise.race([
      politeClose.then(() => true),
      sleep2(CLOSE_GRACE_MS).then(() => false)
    ]);
    if (!closedInTime) {
      log7.warn(`polite close timed out after ${CLOSE_GRACE_MS}ms for ${key}, force-killing`);
    }
    if (instance.chromePid !== null) {
      const dead = await forceKillBrowser({ chromePid: instance.chromePid, marker: instance.marker });
      if (dead) {
        unregisterBrowser(instance.chromePid);
      } else {
        log7.warn(`Chrome pid=${instance.chromePid} survived SIGKILL?! leaving registry record for reaper`);
      }
    } else if (!closedInTime) {
      log7.warn(`no PID recorded for ${key} and polite close hung — this Chrome may leak until the next reap`);
    }
    this.instances.delete(key);
    log7.info(`Stopped Chrome ${key}`);
  }
  async stopAll(force = false) {
    const keys = [...this.instances.entries()].filter(([, inst]) => force || inst.active === 0).map(([k]) => k);
    await Promise.all(keys.map((k) => this.stopKey(k)));
  }
  resetIdleTimer(key) {
    const existing = this.idleTimers.get(key);
    if (existing)
      clearTimeout(existing);
    this.idleTimers.set(key, setTimeout(() => {
      const instance = this.instances.get(key);
      if (instance && instance.active > 0) {
        this.resetIdleTimer(key);
        return;
      }
      log7.info(`Idle timeout for ${key}, stopping...`);
      this.stopKey(key).catch((err) => log7.warn(`idle stop failed for ${key}: ${err}`));
    }, this.idleTimeout));
  }
  hasLiveProcesses() {
    return [...this.instances.values()].some((inst) => inst.chromePid !== null && isPidAlive(inst.chromePid));
  }
}

// src/lib/domain-modes.ts
var import_fs8 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));
var log8 = createLogger("domain-modes");
function defaultFile() {
  return import_path7.default.join(getDataDir(), "domain-modes.json");
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
      if (import_fs8.default.existsSync(this.filePath)) {
        this.data = JSON.parse(import_fs8.default.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }
  save() {
    try {
      import_fs8.default.mkdirSync(import_path7.default.dirname(this.filePath), { recursive: true });
      import_fs8.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log8.error("Failed to save:", err);
    }
  }
}

// src/lib/browser/cdp-launcher.ts
function hasDisplay() {
  if (process.platform === "darwin" || process.platform === "win32")
    return true;
  return !!process.env.DISPLAY;
}
function checkModeAvailability() {
  return {
    headless: true,
    binaryHeadful: hasDisplay()
  };
}

// src/lib/errors.ts
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/lib/execution/config.ts
function sessionStoreKey(userId, instanceId = DEFAULT_INSTANCE) {
  return instanceId === DEFAULT_INSTANCE ? userId : `${userId}::${instanceId}`;
}

// src/lib/execution/ref-store.ts
class RefStore {
  store;
  config;
  userRefs = new Map;
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }
  makeContext(userId, token) {
    if (!this.userRefs.has(userId)) {
      this.userRefs.set(userId, { refMap: new Map, nextRefId: 1 });
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
  sync(userId, ctx) {
    const refs = this.userRefs.get(userId);
    if (refs)
      refs.nextRefId = ctx.nextRefId;
  }
}

// src/lib/actions/types.ts
function failedStepResult(step, error, durationMs, stepIndex = -1) {
  return { stepIndex, step, ok: false, error, durationMs };
}

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
  for (let i = 0;i <= steps; i++) {
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
var mousePositions = new WeakMap;
async function humanMove(page, toX, toY) {
  const mouse = page.mouse;
  const lastPos = mousePositions.get(page);
  const fromX = lastPos?.x ?? randRange(TIMING.IDLE_MOUSE_X);
  const fromY = lastPos?.y ?? randRange(TIMING.IDLE_MOUSE_Y);
  const path8 = generatePath(fromX, fromY, toX, toY);
  for (const point of path8) {
    await mouse.move(point.x, point.y);
    await sleep3(rand(2, 12));
  }
  mousePositions.set(page, { x: toX, y: toY });
}
async function humanClick(page, selector) {
  const element = await page.waitForSelector(selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
  if (!element)
    throw new Error(`Element not found: ${selector}`);
  const box = await element.boundingBox();
  if (!box)
    throw new Error(`Element not visible: ${selector}`);
  const targetX = box.x + box.width * rand(0.3, 0.7);
  const targetY = box.y + box.height * rand(0.3, 0.7);
  await humanMove(page, targetX, targetY);
  await sleep3(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep3(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep3(randRange(TIMING.POST_CLICK));
}
async function humanClickXY(page, x, y) {
  await humanMove(page, x, y);
  await sleep3(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep3(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep3(randRange(TIMING.POST_CLICK));
}
async function humanType(page, selector, text) {
  await humanClick(page, selector);
  await sleep3(randRange(TIMING.POST_CLICK));
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep3(randRange(TIMING.CHAR_DELAY));
    if (Math.random() < 0.05) {
      await sleep3(randRange(TIMING.WORD_PAUSE));
    }
  }
}
async function clickRecaptchaCheckbox(page) {
  const recaptchaFrame = await page.waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]', { timeout: TIMEOUTS.SELECTOR_WAIT });
  if (!recaptchaFrame)
    throw new Error("reCAPTCHA iframe not found");
  const frame = await recaptchaFrame.contentFrame();
  if (!frame)
    throw new Error("Could not access reCAPTCHA iframe");
  await frame.waitForSelector(".recaptcha-checkbox-border, #recaptcha-anchor", { timeout: TIMEOUTS.SELECTOR_WAIT });
  const recaptchaBox = await recaptchaFrame.boundingBox();
  if (!recaptchaBox)
    throw new Error("reCAPTCHA iframe not visible");
  const checkboxX = recaptchaBox.x + rand(20, 35);
  const checkboxY = recaptchaBox.y + recaptchaBox.height * rand(0.35, 0.65);
  await humanMove(page, randRange(TIMING.PRE_CHECKBOX_X), randRange(TIMING.PRE_CHECKBOX_Y));
  await sleep3(randRange(TIMING.PRE_CHECKBOX_WAIT));
  await humanClickXY(page, checkboxX, checkboxY);
  await sleep3(TIMING.POST_CHECKBOX_WAIT);
  try {
    const checked = await frame.evaluate(() => {
      const anchor = document.querySelector("#recaptcha-anchor");
      return anchor && anchor.getAttribute("aria-checked") === "true";
    });
    if (checked)
      return { solved: true, challenge: false };
  } catch {}
  const challengeInfo = await getChallengeInfo(page);
  return { solved: false, challenge: true, challengeInfo };
}
async function getChallengeInfo(page) {
  const bframe = await page.waitForSelector('iframe[title*="desafio reCAPTCHA"], iframe[title*="recaptcha challenge"], iframe[src*="recaptcha/api2/bframe"]', { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT }).catch(() => null);
  if (!bframe)
    return null;
  const bframeBox = await bframe.boundingBox();
  if (!bframeBox)
    return null;
  const frame = await bframe.contentFrame();
  if (!frame)
    return null;
  const info = await frame.evaluate(() => {
    const promptEl = document.querySelector(".rc-imageselect-desc-wrapper, .rc-imageselect-instructions");
    const prompt = promptEl ? promptEl.innerText.trim() : "";
    const table = document.querySelector("table.rc-imageselect-table, table.rc-imageselect-table-33, table.rc-imageselect-table-44");
    let rows = 0, cols = 0;
    if (table) {
      const trs = table.querySelectorAll("tr");
      rows = trs.length;
      cols = trs[0] ? trs[0].querySelectorAll("td").length : 0;
    }
    const verifyBtn = document.querySelector("#recaptcha-verify-button");
    const verifyText = verifyBtn ? verifyBtn.innerText.trim() : "";
    return { prompt, rows, cols, verifyText };
  }).catch(() => ({ prompt: "", rows: 0, cols: 0, verifyText: "" }));
  const gridStartX = bframeBox.x + CAPTCHA_GRID.GRID_MARGIN;
  const gridStartY = bframeBox.y + CAPTCHA_GRID.HCAPTCHA_HEADER_HEIGHT;
  const gridWidth = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;
  const gridHeight = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;
  const tileWidth = info.cols > 0 ? gridWidth / info.cols : 0;
  const tileHeight = info.rows > 0 ? gridHeight / info.rows : 0;
  const tiles = [];
  for (let r = 0;r < info.rows; r++) {
    for (let c = 0;c < info.cols; c++) {
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
    if (!tile)
      continue;
    await humanClickXY(page, tile.centerX, tile.centerY);
    await sleep3(randRange(TIMING.TILE_CLICK_DELAY));
    clicked.push(idx);
  }
  return { clicked, challengeInfo };
}
async function clickChallengeVerify(page) {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo)
    throw new Error("No active reCAPTCHA challenge found");
  await humanClickXY(page, challengeInfo.verifyButton.x, challengeInfo.verifyButton.y);
  await sleep3(TIMING.POST_VERIFY_WAIT);
  const anchorFrame = await page.waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]', { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT }).catch(() => null);
  if (anchorFrame) {
    const frame = await anchorFrame.contentFrame();
    if (frame) {
      try {
        const checked = await frame.evaluate(() => {
          const anchor = document.querySelector("#recaptcha-anchor");
          return anchor && anchor.getAttribute("aria-checked") === "true";
        });
        if (checked)
          return { solved: true };
      } catch {}
    }
  }
  const newInfo = await getChallengeInfo(page);
  return { solved: false, challengeInfo: newInfo };
}
function sleep3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
// src/lib/actions/resolve-selector.ts
function resolveSelector(selector, ctx) {
  if (selector.startsWith("@e")) {
    const ref = ctx.refMap.get(selector);
    if (!ref) {
      const available = Array.from(ctx.refMap.keys()).join(", ");
      throw new Error(`Unknown ref: ${selector}. ${available ? `Available refs: ${available}` : "No refs available — run a snapshot or annotated screenshot step first."}`);
    }
    return ref.selector;
  }
  return selector;
}

// src/lib/actions/handlers/navigation.ts
var log9 = createLogger("actions");
async function navigate(page, step, ctx) {
  await page.goto(step.url, {
    waitUntil: step.waitUntil || "domcontentloaded",
    timeout: TIMEOUTS.NAVIGATION
  });
  const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
  try {
    await page.evaluate(stealthScript);
  } catch (err) {
    log9.warn(`stealth injection failed: ${err}`);
  }
  if (ctx.sessionData) {
    try {
      await injectStorage(page, ctx.sessionData);
    } catch (err) {
      log9.warn(`storage injection after navigate failed: ${err}`);
    }
  }
}
async function click(page, step, ctx) {
  await page.click(resolveSelector(step.selector, ctx));
}
async function fill(page, step, ctx) {
  await page.fill(resolveSelector(step.selector, ctx), step.value);
}
async function humanClickStep(page, step, ctx) {
  if (step.selector) {
    await humanClick(page, resolveSelector(step.selector, ctx));
  } else if (step.x !== undefined && step.y !== undefined) {
    await humanClickXY(page, step.x, step.y);
  } else {
    throw new Error("human-click requires selector or x/y coordinates");
  }
}
async function rightClick(page, step, ctx) {
  if (step.selector) {
    await page.click(resolveSelector(step.selector, ctx), { button: "right" });
  } else if (step.x !== undefined && step.y !== undefined) {
    await page.mouse.click(step.x, step.y, { button: "right" });
  } else {
    throw new Error("right-click requires selector or x/y coordinates");
  }
}
async function humanTypeStep(page, step, ctx) {
  await humanType(page, resolveSelector(step.selector, ctx), step.value);
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
async function scroll(page, step) {
  await page.evaluate((dy) => window.scrollBy(0, dy || document.body.scrollHeight), step.deltaY ?? 0);
}
async function keyboard(page, step) {
  await page.keyboard.press(step.key);
}
async function typeCode(page, step, ctx) {
  const code = String(step.value || "");
  const selector = step.selector ? resolveSelector(step.selector, ctx) : 'input[type="tel"]';
  const firstInput = await page.waitForSelector(selector, { timeout: TIMEOUTS.TOTP_INPUT });
  if (!firstInput)
    throw new Error(`Input not found: ${selector}`);
  await firstInput.click();
  await page.waitForTimeout(TIMING.POST_FORM_CLICK);
  for (const digit of code) {
    await page.keyboard.press(digit);
    await page.waitForTimeout(TIMING.DIGIT_DELAY_BASE + Math.random() * TIMING.DIGIT_DELAY_RANGE);
  }
  return { typed: code.length };
}

// src/lib/actions/handlers/find.ts
async function find(page, step, ctx) {
  if (!step.role && !step.name && !step.text && !step.placeholder && !step.label) {
    throw new Error("find requires at least one of: role, name, text, placeholder, label");
  }
  let locator;
  if (step.role) {
    const opts = {};
    if (step.name)
      opts.name = step.exact ? step.name : new RegExp(step.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (step.exact !== undefined)
      opts.exact = step.exact;
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
    const path8 = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path8.unshift(`#${current.id}`);
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
      path8.unshift(seg);
      current = parent;
    }
    return { tag, text, selector: path8.join(" > ") };
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

// src/lib/snapshot.ts
var INTERACTIVE_ROLES = new Set([
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
var INTERACTIVE_TAGS = new Set([
  "input",
  "textarea",
  "select",
  "button",
  "a"
]);
async function takeSnapshot(page, ctx, options) {
  const interactiveOnly = options?.interactiveOnly ?? true;
  const maxElements = options?.maxElements ?? 80;
  ctx.refMap.clear();
  ctx.nextRefId = 1;
  const elements = await page.evaluate(({ interactiveOnly: interactiveOnly2, maxElements: maxElements2 }) => {
    const results = [];
    const interactiveTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = new Set([
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
      if (interactiveTags.has(el.tagName))
        return true;
      const role = el.getAttribute("role");
      if (role && interactiveRoles.has(role))
        return true;
      if (el.hasAttribute("contenteditable"))
        return true;
      if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1")
        return true;
      return false;
    }
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0)
        return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
        return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight + 200)
        return false;
      return true;
    }
    function buildSelector(el) {
      const path8 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path8.unshift(`#${current.id}`);
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
        path8.unshift(seg);
        current = parent;
      }
      return path8.join(" > ");
    }
    function getName(el) {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel)
        return ariaLabel.trim();
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label)
          return label.textContent?.trim() || "";
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder)
          return el.placeholder.trim();
      }
      const text2 = el.textContent?.trim() || "";
      return text2.slice(0, 60);
    }
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= maxElements2)
        break;
      if (interactiveOnly2 && !isInteractive(el))
        continue;
      if (!isVisible(el))
        continue;
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
        isVisible: true
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
    if (el.disabled)
      state.push("disabled");
    if (el.checked)
      state.push("checked");
    let description = "";
    if (el.placeholder && el.name !== el.placeholder)
      description = `placeholder="${el.placeholder}"`;
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
    if (node.name)
      line += ` "${node.name}"`;
    if (node.state.length > 0)
      line += ` [${node.state.join(", ")}]`;
    if (node.description)
      line += ` (${node.description})`;
    lines.push(line);
  }
  const text = lines.join(`
`);
  return { nodes, text };
}

// src/lib/annotate.ts
async function annotatedScreenshot(page, ctx) {
  ctx.refMap.clear();
  ctx.nextRefId = 1;
  const elements = await page.evaluate(() => {
    const interactiveTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = new Set([
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
      if (interactiveTags.has(el.tagName))
        return true;
      const role = el.getAttribute("role");
      if (role && interactiveRoles.has(role))
        return true;
      if (el.hasAttribute("contenteditable"))
        return true;
      if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1")
        return true;
      return false;
    }
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0)
        return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
        return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight)
        return false;
      return true;
    }
    function buildSelector(el) {
      const path8 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path8.unshift(`#${current.id}`);
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
        path8.unshift(seg);
        current = parent;
      }
      return path8.join(" > ");
    }
    function getName(el) {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel)
        return ariaLabel.trim();
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label)
          return label.textContent?.trim() || "";
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder)
          return el.placeholder.trim();
      }
      return (el.textContent?.trim() || "").slice(0, 60);
    }
    const results = [];
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= 50)
        break;
      if (!isInteractive(el))
        continue;
      if (!isVisible(el))
        continue;
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
    if (el.tag === "a")
      displayRole = "link";
    if (el.tag === "input")
      displayRole = "input";
    if (el.tag === "textarea")
      displayRole = "textarea";
    if (el.tag === "select")
      displayRole = "select";
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
    if (el)
      el.remove();
  });
  return { screenshotUrl, refs };
}

// src/lib/actions/handlers/screenshot.ts
async function screenshot(page, step, ctx) {
  if (step.annotate) {
    const annotated = await annotatedScreenshot(page, ctx);
    const refLines = annotated.refs.map((r) => `  ${r.ref} ${r.role} "${r.name}"`).join(`
`);
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

// src/lib/captcha/recaptcha.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var log10 = createLogger("captcha-solver");
var MAX_ROUNDS = 8;
var MAX_DURATION_MS = 45000;
var TILE_SETTLE_MS = TIMING.TILE_SETTLE;
var MODEL = "claude-haiku-4-5-20251001";
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY not set — required for captcha auto-solve");
  return new import_sdk.default({ apiKey });
}
function extractTarget(prompt) {
  const lines = prompt.split(`
`).map((l) => l.trim()).filter(Boolean);
  for (let i = 0;i < lines.length; i++) {
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
  return lines[1] || prompt;
}
async function screenshotFullGrid(page, challengeInfo) {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox || rows === 0 || cols === 0)
    return null;
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
    log10.error(`full grid screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function screenshotTiles(page, challengeInfo) {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox)
    return [];
  const gridX = bframeBox.x + 14;
  const gridY = bframeBox.y + 112;
  const gridSize = bframeBox.width - 28;
  const tileW = gridSize / cols;
  const tileH = gridSize / rows;
  const tiles = [];
  for (let r = 0;r < rows; r++) {
    for (let c = 0;c < cols; c++) {
      const clip = {
        x: gridX + c * tileW + 2,
        y: gridY + r * tileH + 2,
        width: tileW - 4,
        height: tileH - 4
      };
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 85, clip });
        tiles.push({ index: r * cols + c, imageBase64: buf.toString("base64") });
      } catch {}
    }
  }
  return tiles;
}
async function classifyTiles(client, fullGridBase64, tiles, target, rows, cols) {
  const results = await Promise.all(tiles.map(async (tile) => {
    const tileRow = Math.floor(tile.index / cols) + 1;
    const tileCol = tile.index % cols + 1;
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 10,
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
      const answer = (response.content[0].text ?? "").toLowerCase().trim();
      const match = answer.startsWith("yes");
      if (match)
        log10.debug(`tile ${tile.index} (r${tileRow}c${tileCol}): YES`);
      return { index: tile.index, match };
    } catch (err) {
      log10.error(`tile ${tile.index} classification failed: ${err instanceof Error ? err.message : String(err)}`);
      return { index: tile.index, match: false };
    }
  }));
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
          log10.info(`Submitting form via: ${selector}`);
          await new Promise((r) => setTimeout(r, 500));
          await humanClick(page, selector);
          await new Promise((r) => setTimeout(r, 2000));
          return true;
        }
      }
    } catch {}
  }
  log10.info("No submit button found — skipping form submission");
  return false;
}
async function solveRecaptcha(page, monitor) {
  const startTime = Date.now();
  const client = getClient();
  let rounds = 0;
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
    log10.info(`Round ${rounds}: looking for "${target}" in ${challengeInfo.rows}x${challengeInfo.cols} grid`);
    const [fullGridImage, tileImages] = await Promise.all([
      screenshotFullGrid(page, challengeInfo),
      screenshotTiles(page, challengeInfo)
    ]);
    if (!fullGridImage || tileImages.length === 0) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }
    monitor?.reportActivity();
    const matchingIndices = await classifyTiles(client, fullGridImage, tileImages, target, challengeInfo.rows, challengeInfo.cols);
    log10.info(`Round ${rounds}: matched tiles [${matchingIndices.join(", ")}]`);
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
              const newMatches = await classifyTiles(client, newFullGrid, replacedTiles, target, newInfo.rows, newInfo.cols);
              if (newMatches.length > 0) {
                log10.info(`Round ${rounds}: dynamic tiles matched [${newMatches.join(", ")}]`);
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
      log10.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      const submitted = await submitForm(page);
      return { solved: true, rounds, durationMs: Date.now() - startTime, submitted };
    }
    challengeInfo = verifyResult.challengeInfo || null;
    if (!challengeInfo) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Challenge disappeared after verify" };
    }
    log10.info(`Round ${rounds}: not solved, new challenge appeared`);
  }
  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS}) exceeded` };
}

// src/lib/captcha/hcaptcha.ts
var import_sdk2 = __toESM(require("@anthropic-ai/sdk"));
var log11 = createLogger("hcaptcha-solver");
var MAX_ROUNDS2 = 8;
var MAX_DURATION_MS2 = 60000;
var MODEL2 = "claude-haiku-4-5-20251001";
function getClient2() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("ANTHROPIC_API_KEY not set — required for captcha auto-solve");
  return new import_sdk2.default({ apiKey });
}
function rand2(min, max) {
  return Math.random() * (max - min) + min;
}
function sleep4(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function clickCheckbox(page) {
  const checkboxFrame = await page.waitForSelector('iframe[src*="hcaptcha.com"], iframe[data-hcaptcha-widget-id], iframe[title*="hCaptcha"]', { timeout: 1e4 }).catch(() => null);
  if (!checkboxFrame)
    throw new Error("hCaptcha checkbox iframe not found");
  const box = await checkboxFrame.boundingBox();
  if (!box)
    throw new Error("hCaptcha iframe not visible");
  await humanMove(page, rand2(200, 500), rand2(150, 400));
  await sleep4(rand2(300, 700));
  const cx = box.x + box.width * rand2(0.15, 0.35);
  const cy = box.y + box.height * rand2(0.3, 0.7);
  await humanClickXY(page, cx, cy);
  await sleep4(2500);
  const frame = await checkboxFrame.contentFrame();
  if (frame) {
    try {
      const checked = await frame.evaluate(() => {
        const cb = document.querySelector("#checkbox");
        return cb?.getAttribute("aria-checked") === "true";
      });
      if (checked)
        return true;
    } catch {}
  }
  return false;
}
async function getChallengeInfo2(page) {
  const challengeFrame = await page.waitForSelector('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]', { timeout: 8000 }).catch(() => null);
  if (!challengeFrame)
    return null;
  const frameBox = await challengeFrame.boundingBox();
  if (!frameBox)
    return null;
  const frame = await challengeFrame.contentFrame();
  if (!frame)
    return null;
  const info = await frame.evaluate(() => {
    const promptEl = document.querySelector(".prompt-text, .task-instructions, [class*='prompt'], [class*='task-description']");
    const prompt = promptEl ? promptEl.innerText.trim() : "";
    const tileEls = document.querySelectorAll(".task-image, [class*='task-grid'] > *, [class*='challenge-container'] .image-wrapper, .image-wrapper");
    const count = tileEls.length;
    let rows = 3, cols = 3;
    if (count === 16) {
      rows = 4;
      cols = 4;
    } else if (count === 9) {
      rows = 3;
      cols = 3;
    } else if (count === 6) {
      rows = 2;
      cols = 3;
    }
    return { prompt, count, rows, cols };
  }).catch(() => ({ prompt: "", count: 0, rows: 3, cols: 3 }));
  if (!info.prompt && info.count === 0)
    return null;
  const gridPadTop = 150;
  const gridPadLeft = 20;
  const gridPadRight = 20;
  const gridPadBottom = 80;
  const gridWidth = frameBox.width - gridPadLeft - gridPadRight;
  const gridHeight = frameBox.height - gridPadTop - gridPadBottom;
  const tileW = gridWidth / info.cols;
  const tileH = gridHeight / info.rows;
  const tiles = [];
  for (let r = 0;r < info.rows; r++) {
    for (let c = 0;c < info.cols; c++) {
      tiles.push({
        index: r * info.cols + c,
        centerX: Math.round(frameBox.x + gridPadLeft + c * tileW + tileW / 2),
        centerY: Math.round(frameBox.y + gridPadTop + r * tileH + tileH / 2)
      });
    }
  }
  const verifyBtnBox = await frame.evaluate(() => {
    const btn = document.querySelector('.button-submit.button, [aria-label="Verify"], [aria-label="Skip Challenge"]');
    if (!btn)
      return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }).catch(() => null);
  const verifyButton = verifyBtnBox ? { x: Math.round(frameBox.x + verifyBtnBox.x), y: Math.round(frameBox.y + verifyBtnBox.y) } : { x: Math.round(frameBox.x + frameBox.width - 55), y: Math.round(frameBox.y + frameBox.height - 30) };
  log11.info(`Round challenge: "${info.prompt}" (${info.rows}x${info.cols})`);
  return { prompt: info.prompt, rows: info.rows, cols: info.cols, tiles, verifyButton, frameBox };
}
async function screenshotChallenge(page, challenge) {
  const { frameBox } = challenge;
  try {
    await sleep4(1000);
    const challengeEl = await page.$('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]').catch(() => null);
    let buf;
    if (challengeEl) {
      buf = Buffer.from(await challengeEl.screenshot({ type: "jpeg", quality: 85 }));
    } else {
      buf = await page.screenshot({ type: "jpeg", quality: 85, clip: frameBox });
    }
    return buf.toString("base64");
  } catch (err) {
    log11.error(`screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
async function classifyTiles2(client, screenshotBase64, challenge) {
  const { prompt, rows, cols } = challenge;
  const total = rows * cols;
  try {
    const response = await client.messages.create({
      model: MODEL2,
      max_tokens: 30,
      system: `Output ONLY a comma-separated list of tile numbers or "none". Valid examples: "0,3,5" or "2" or "none". Output nothing else.`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotBase64 } },
          { type: "text", text: `Task: "${prompt}". Tiles 0-${total - 1} left-to-right top-to-bottom in a ${rows}×${cols} grid. Which tiles match? Reply ONLY with numbers or "none".` }
        ]
      }]
    });
    const text = (response.content[0].text ?? "").trim();
    log11.debug(`classify response: "${text}"`);
    if (text.toLowerCase().startsWith("none"))
      return [];
    return text.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n < total);
  } catch (err) {
    log11.error(`classification failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
async function isSolved(page) {
  const el = await page.$('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]').catch(() => null);
  if (!el)
    return true;
  const visible = await el.isVisible().catch(() => false);
  return !visible;
}
async function clickVerify(page, challenge) {
  await humanClickXY(page, challenge.verifyButton.x, challenge.verifyButton.y);
  await sleep4(2500);
  return isSolved(page);
}
async function solveHCaptcha(page, monitor) {
  const startTime = Date.now();
  const client = getClient2();
  let rounds = 0;
  let solvedOnCheckbox = false;
  try {
    solvedOnCheckbox = await clickCheckbox(page);
  } catch (err) {
    return { solved: false, rounds: 0, durationMs: Date.now() - startTime, reason: err instanceof Error ? err.message : String(err) };
  }
  if (solvedOnCheckbox) {
    log11.info("Solved on checkbox click (no challenge)");
    return { solved: true, rounds: 0, durationMs: Date.now() - startTime };
  }
  while (rounds < MAX_ROUNDS2) {
    if (Date.now() - startTime > MAX_DURATION_MS2) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Timeout exceeded" };
    }
    rounds++;
    monitor?.reportActivity();
    const challenge = await getChallengeInfo2(page);
    if (!challenge) {
      log11.info("Challenge frame gone — assuming solved");
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }
    const screenshotBase64 = await screenshotChallenge(page, challenge);
    if (!screenshotBase64) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }
    monitor?.reportActivity();
    const matchingIndices = await classifyTiles2(client, screenshotBase64, challenge);
    log11.info(`Round ${rounds}: clicking tiles [${matchingIndices.join(", ")}]`);
    monitor?.reportActivity();
    for (const idx of matchingIndices) {
      const tile = challenge.tiles[idx];
      if (!tile)
        continue;
      await humanClickXY(page, tile.centerX + rand2(-5, 5), tile.centerY + rand2(-5, 5));
      await sleep4(rand2(150, 400));
    }
    await sleep4(rand2(500, 1000));
    const solved = await clickVerify(page, challenge);
    monitor?.reportActivity();
    if (solved) {
      log11.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }
    log11.info(`Round ${rounds}: not solved, retrying`);
    await sleep4(rand2(500, 1000));
  }
  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS2}) exceeded` };
}

// src/lib/actions/handlers/captcha.ts
var log12 = createLogger("actions");
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
  if (solveResult.solved)
    return { solved: true };
  const ci = solveResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, prompt: "", tiles: [] };
}
async function recaptchaAnswer(page, step) {
  await clickChallengeTiles(page, step.tiles);
  const verifyResult = await clickChallengeVerify(page);
  if (verifyResult.solved)
    return { solved: true };
  const ci = verifyResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, tiles: [] };
}
async function solveCaptcha(page, _step, _ctx, monitor) {
  await page.waitForTimeout(TIMING.CAPTCHA_DETECT_WAIT);
  const isHCaptcha = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    return iframes.some((f) => {
      const src = f.src || "";
      const title = (f.title || "").toLowerCase();
      return src.includes("hcaptcha.com") || title.includes("hcaptcha") || !!document.querySelector("[data-hcaptcha-widget-id]");
    });
  }).catch((err) => {
    log12.warn(`captcha detection failed: ${err}`);
    return false;
  });
  log12.info(`detected: ${isHCaptcha ? "hCaptcha" : "reCAPTCHA"}`);
  return isHCaptcha ? await solveHCaptcha(page, monitor) : await solveRecaptcha(page, monitor);
}

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
  await handle.scrollIntoViewIfNeeded().catch(() => {});
  await handle.click({ delay: 40 }).catch(() => {});
  await handle.evaluate(applyNativeValue, value);
  if (opts.delay !== false)
    await humanDelay(page);
}
async function fillSelectorNative(page, selector, value) {
  await page.click(selector);
  await page.waitForTimeout(TIMING.SCROLL_DELAY);
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    if (!el)
      return;
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
      if (typed)
        return typed;
      const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'));
      return buttons.find((b) => re.test(b.textContent || "") && b.offsetParent !== null) || null;
    };
    const form = document.querySelector(formAnchor)?.closest("form");
    if (form) {
      const found = pick(form);
      if (found)
        return found;
    }
    return pick(document);
  }, opts);
  return handle.asElement();
}

// src/lib/knowledge.ts
var import_fs9 = __toESM(require("fs"));
var import_path8 = __toESM(require("path"));
var log13 = createLogger("knowledge");
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
function domainLookupChain(input) {
  const normalized = normalizeDomain(input);
  if (!normalized)
    return [];
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
  import_fs9.default.mkdirSync(getKnowledgeDir(), { recursive: true });
}
function readKnowledge(domain) {
  const p = getKnowledgePath(domain);
  try {
    return import_fs9.default.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function parseKnowledge(domain) {
  const raw = readKnowledge(domain);
  if (!raw)
    return null;
  return parseMarkdown(raw);
}
function mergeKnowledge(domain, updates) {
  ensureDir();
  const existing = parseKnowledge(domain);
  const merged = {
    domain: sanitizeDomain(domain),
    lastVerified: updates.lastVerified ?? new Date().toISOString(),
    lastMode: updates.lastMode ?? existing?.lastMode ?? "unknown",
    browserRequired: updates.browserRequired ?? existing?.browserRequired ?? true,
    auth: updates.auth ?? existing?.auth ?? { type: "unknown" },
    endpoints: dedupeEndpoints([...existing?.endpoints ?? [], ...updates.endpoints ?? []]),
    notes: dedupeNotes([...existing?.notes ?? [], ...updates.notes ?? []])
  };
  const md = renderMarkdown(merged);
  import_fs9.default.writeFileSync(getKnowledgePath(domain), md, "utf8");
  log13.info(`knowledge updated: ${merged.domain} (${merged.endpoints.length} endpoints)`);
}
function dedupeEndpoints(endpoints) {
  const seen = new Map;
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
    if (a.path !== b.path)
      return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
}
function dedupeNotes(notes) {
  const seen = new Set;
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
  lines.push("> _Structure only — actual values are stored encrypted in the session store._");
  lines.push("");
  if (data.endpoints.length > 0) {
    lines.push("## Known endpoints");
    lines.push("");
    lines.push("The agent can call these directly (with the auth material above) instead of launching a browser.");
    lines.push("");
    for (const ep of data.endpoints) {
      lines.push(`### ${ep.method.toUpperCase()} ${ep.path}`);
      if (ep.description)
        lines.push("");
      if (ep.description)
        lines.push(ep.description);
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
    for (const n of data.notes)
      lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join(`
`);
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

// src/lib/auth/credential-resolver.ts
class CredentialDecryptError extends Error {
  domain;
  cause;
  constructor(domain, cause) {
    super(`Credentials for ${domain} exist in the store but cannot be decrypted (${cause}). ` + `This usually means the encryption key (~/.iframer/secret or IFRAMER_SECRET) ` + `changed since the row was written, orphaning the old blob. ` + `Fix: ask the user to re-store the credentials by running in their terminal:

` + `  iframer-toolkit credentials add ${normalizeDomain(domain)}

` + `After they confirm it ran, retry.`);
    this.domain = domain;
    this.cause = cause;
    this.name = "CredentialDecryptError";
  }
}
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
  if (!blob)
    return null;
  try {
    const credential = JSON.parse(decrypt(blob, credKey));
    return { credential, matchedDomain };
  } catch (err) {
    throw new CredentialDecryptError(matchedDomain, err instanceof Error ? err.message : String(err));
  }
}

// src/lib/actions/handlers/login/selectors.ts
var EMAIL_CANDIDATES = [
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
var PASSWORD_SELECTOR = 'input[type="password"]:not([disabled]):not([readonly])';
var OTP_SELECTOR = 'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])';
var LOGIN_URL_RE = /\b(login|signin|sign-in|auth|oauth)\b/i;
var EMAIL_FIRST_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next|send.*code|email.*me)\b/i;
var PASSWORD_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;
var EMAIL_FORM_ANCHOR = 'input[type="email"], input[name*="email" i], input[type="text"]';
var PASSWORD_FORM_ANCHOR = PASSWORD_SELECTOR;

// src/lib/actions/handlers/login/index.ts
var log14 = createLogger("actions");
async function login(page, step, ctx) {
  const resolved = await resolveCredential(ctx.store, ctx.userId, ctx.token, step.domain);
  if (!resolved) {
    const stored = await ctx.store.listCredentialDomains(ctx.userId);
    const storedList = stored.length > 0 ? stored.join(", ") : "(none)";
    throw new Error(`No credentials stored for ${normalizeDomain(step.domain)}. Stored domains: ${storedList}. ` + `If you stored credentials under a different domain name, retry the login step with that domain. ` + `If no credentials are stored at all, call the \`credentials\` tool with action=store first.`);
  }
  const { credential, matchedDomain } = resolved;
  if (matchedDomain !== normalizeDomain(step.domain)) {
    log14.info(`login: credentials for ${step.domain} resolved via parent domain ${matchedDomain}`);
  }
  const beforeUrl = page.url();
  const hasExplicitSelectors = !!(step.usernameSelector || step.passwordSelector || step.submitSelector);
  if (hasExplicitSelectors) {
    await runExplicitFlow(page, step, ctx, credential);
  } else {
    const early = await runAutoDetect(page, step, ctx, credential, beforeUrl);
    if (early)
      return early;
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
    await page.waitForLoadState("domcontentloaded").catch(() => {});
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
  log14.info(`login: auto-detecting form on ${beforeUrl}`);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(500);
  const initialCheck = await page.evaluate((pwdSel) => {
    const pwd = document.querySelector(pwdSel);
    const pwdVisible = !!(pwd && pwd.offsetParent !== null);
    return { url: location.href, title: document.title, pwdVisible };
  }, PASSWORD_SELECTOR).catch(() => ({ url: page.url(), title: "", pwdVisible: false }));
  if (!initialCheck.pwdVisible && !LOGIN_URL_RE.test(initialCheck.url)) {
    log14.info(`login: already logged in (no password field, URL=${initialCheck.url})`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: initialCheck.url,
      reason: "Session already authenticated — no login form detected"
    };
  }
  const passwordHandle = await page.waitForSelector(PASSWORD_SELECTOR, { state: "visible", timeout: 5000 }).catch(() => null);
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
    log14.info(`login: no password field and URL left login area (${currentUrl}) — treating as success`);
    return {
      loggedIn: true,
      alreadyLoggedIn: true,
      url: currentUrl,
      reason: "No login form detected after wait — assumed already authenticated"
    };
  }
  const emailOnlyHandle = await page.evaluateHandle((candidates) => {
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null)
        return el;
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
  log14.warn(`login: no visible password or email field on ${currentUrl} — title="${pageDiag.title}", inputs=${pageDiag.inputCount}`);
  const indicators = [];
  if (pageDiag.hasCaptcha)
    indicators.push("CAPTCHA detected");
  if (pageDiag.hasCloudflare)
    indicators.push("Cloudflare challenge");
  if (pageDiag.inputCount === 0)
    indicators.push("no input elements at all");
  if (pageDiag.hiddenPassword)
    indicators.push("password field exists but is hidden/disabled");
  const indicatorStr = indicators.length > 0 ? ` (${indicators.join(", ")})` : "";
  throw new Error(`login: no visible password or email field on ${currentUrl} after 5000ms${indicatorStr}. ` + `Page title: "${pageDiag.title}". ` + `The site may be showing a bot-detection wall, captcha, or an unsupported login flow. ` + `Retry with a stronger browser mode (binary-headful or docker-headful).`);
}
async function runEmailFirstFlow(page, credential, beforeUrl, emailEl) {
  const currentUrl = page.url();
  log14.info(`login: no password field but found email input — running email-first flow on ${currentUrl}`);
  await fillHandleNative(page, emailEl, credential.username);
  const submitEl = await findSubmitButton(page, {
    formAnchor: EMAIL_FORM_ANCHOR,
    reSource: EMAIL_FIRST_SUBMIT_RE.source,
    reFlags: EMAIL_FIRST_SUBMIT_RE.flags
  });
  if (submitEl) {
    await submitEl.scrollIntoViewIfNeeded().catch(() => {});
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el) => el.click());
    });
  } else {
    log14.warn("login: email-first flow, no submit button found — pressing Enter");
    await emailEl.press("Enter").catch(() => {});
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
    page.waitForSelector('input[type="password"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null),
    page.waitForSelector('input[inputmode="numeric"]:not([disabled]), input[autocomplete="one-time-code"]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null)
  ]);
  const laterPasswordHandle = await page.$(PASSWORD_SELECTOR);
  if (laterPasswordHandle && credential.password) {
    log14.info("login: password field appeared after email submit — filling it");
    await fillHandleNative(page, laterPasswordHandle, credential.password);
    const laterSubmit = await page.$('button[type="submit"]:not([disabled])');
    if (laterSubmit) {
      await laterSubmit.click({ delay: 40 }).catch(() => {});
    } else {
      await laterPasswordHandle.press("Enter").catch(() => {});
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
  }
  const afterUrl = page.url();
  const emailFlowDone = afterUrl !== beforeUrl;
  return {
    loggedIn: emailFlowDone,
    emailSubmitted: true,
    url: afterUrl,
    reason: emailFlowDone ? "Email-first flow completed — check for code/OTP prompt if login isn't complete." : "Email submitted, waiting for next step (code entry, password page, or redirect)."
  };
}
async function runPasswordFlow(page, credential, beforeUrl, passwordHandle) {
  const usernameHandle = await page.evaluateHandle((args) => {
    const pwd = document.querySelector(args.pwdSel);
    if (!pwd)
      return null;
    const scope = pwd.closest("form") || document;
    for (const sel of args.candidates) {
      const el = scope.querySelector(sel);
      if (el && el.offsetParent !== null)
        return el;
    }
    return null;
  }, { candidates: EMAIL_CANDIDATES, pwdSel: PASSWORD_SELECTOR });
  const usernameEl = usernameHandle.asElement();
  if (usernameEl && credential.username) {
    await fillHandleNative(page, usernameEl, credential.username);
  } else if (!usernameEl) {
    log14.warn("login: no username field detected, proceeding with password only");
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
    await submitEl.scrollIntoViewIfNeeded().catch(() => {});
    await submitEl.click({ delay: 40 }).catch(async () => {
      await submitEl.evaluate((el) => el.click());
    });
  } else {
    log14.warn("login: no submit button detected, pressing Enter in password field");
    await passwordHandle.press("Enter").catch(() => {});
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await Promise.race([
    page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
    page.waitForSelector(OTP_SELECTOR, { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null)
  ]);
}
async function handleOtp(page, step, ctx, credential, beforeUrl) {
  const totpHandle = await page.$(OTP_SELECTOR);
  if (!totpHandle)
    return;
  let code = null;
  if (credential.totp_secret) {
    code = generateTOTP(credential.totp_secret);
    log14.info(`login: generated TOTP from stored secret for ${step.domain}`);
  } else if (ctx.elicitOtp) {
    log14.info(`login: prompting user for OTP for ${step.domain}`);
    try {
      code = await ctx.elicitOtp(step.domain);
    } catch (err) {
      log14.warn(`login: OTP elicitation failed: ${err instanceof Error ? err.message : String(err)}`);
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
  await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
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

// src/lib/actions/registry.ts
var registry = {
  navigate,
  click,
  fill,
  "human-click": humanClickStep,
  "right-click": rightClick,
  "human-type": humanTypeStep,
  evaluate,
  extract,
  wait,
  "wait-for": waitFor,
  scroll,
  keyboard,
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
var registeredStepTypes = Object.keys(registry);
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

// src/lib/stale-monitor.ts
var DEFAULT_STALE_TIMEOUT_MS = 20000;

class StaleStateMonitor {
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
      const [url, state] = await Promise.all([
        Promise.resolve(this.page.url()),
        this.page.evaluate(() => ({
          documentReadyState: document.readyState,
          bodyTextLength: document.body?.innerText?.length || 0,
          elementCount: document.querySelectorAll("*").length
        })).catch(() => ({
          documentReadyState: "unknown",
          bodyTextLength: 0,
          elementCount: 0
        }))
      ]);
      return {
        url,
        ...state,
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
    if (before.url !== after.url)
      return true;
    if (before.documentReadyState !== after.documentReadyState)
      return true;
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
  reportActivity() {
    this.lastActivity = Date.now();
  }
  async withMonitoring(fn) {
    this.lastActivity = Date.now();
    const beforeSnapshot = await this.snapshot();
    return new Promise((resolve, reject) => {
      let resolved = false;
      let checkInterval = null;
      const cleanup = () => {
        resolved = true;
        if (checkInterval)
          clearInterval(checkInterval);
        if (this.timer)
          clearTimeout(this.timer);
        this.timer = null;
      };
      checkInterval = setInterval(async () => {
        if (resolved)
          return;
        const elapsed = Date.now() - this.lastActivity;
        if (elapsed < this.timeoutMs)
          return;
        try {
          const currentSnapshot = await this.snapshot();
          if (StaleStateMonitor.hasChanged(beforeSnapshot, currentSnapshot)) {
            this.lastActivity = Date.now();
            return;
          }
        } catch {
          this.lastActivity = Date.now();
          return;
        }
        cleanup();
        reject(new StaleStateError(`No state change detected for ${this.timeoutMs}ms`, this.timeoutMs));
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
}

class StaleStateError extends Error {
  timeoutMs;
  constructor(message, timeoutMs) {
    super(message);
    this.name = "StaleStateError";
    this.timeoutMs = timeoutMs;
  }
}

// src/lib/captcha/detector.ts
class RecaptchaDetector {
  async detect(page) {
    try {
      const found = await page.evaluate(() => {
        const hasAnchorFrame = !!document.querySelector('iframe[src*="recaptcha/api2/anchor"], iframe[title*="reCAPTCHA"]');
        const hasSitekey = !!document.querySelector("[data-sitekey], .g-recaptcha");
        return hasAnchorFrame || hasSitekey;
      });
      if (found) {
        return { type: "captcha", confidence: 0.95 };
      }
    } catch {}
    return null;
  }
}

class HCaptchaDetector {
  async detect(page) {
    try {
      const found = await page.evaluate(() => {
        return !!(document.querySelector('iframe[src*="hcaptcha.com"]') || document.querySelector("[data-hcaptcha-widget-id]") || document.querySelector('iframe[title*="hCaptcha"]'));
      });
      if (found)
        return { type: "hcaptcha", confidence: 0.95 };
    } catch {}
    return null;
  }
}

class CookieConsentDetector {
  async detect(page) {
    try {
      const found = await page.evaluate(() => {
        const keywords = ["accept cookies", "accept all", "allow cookies", "i accept", "agree"];
        const buttons = Array.from(document.querySelectorAll("button, a"));
        return buttons.some((el) => {
          const text = el.innerText?.toLowerCase() || "";
          return keywords.some((kw) => text.includes(kw));
        });
      });
      if (found) {
        return { type: "cookie-consent", confidence: 0.8 };
      }
    } catch {}
    return null;
  }
}

class LoginWallDetector {
  async detect(page) {
    try {
      const found = await page.evaluate(() => {
        const hasLoginForm = !!document.querySelector('input[type="password"]') && !!document.querySelector('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]');
        return hasLoginForm;
      });
      if (found) {
        return { type: "login-wall", confidence: 0.85, details: "Login form detected" };
      }
    } catch {}
    return null;
  }
}
var defaultDetectors = [
  new RecaptchaDetector,
  new HCaptchaDetector,
  new CookieConsentDetector,
  new LoginWallDetector
];

// src/lib/obstacles.ts
class RecaptchaResolver {
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
}

class CookieConsentResolver {
  canResolve(obstacle) {
    return obstacle.type === "cookie-consent";
  }
  async resolve(page) {
    const keywords = ["accept all", "accept cookies", "allow cookies", "i accept", "agree"];
    try {
      const buttons = await page.$$("button, a");
      for (const btn of buttons) {
        const text = (await btn.innerText().catch(() => "")).toLowerCase();
        if (keywords.some((kw) => text.includes(kw))) {
          const visible = await btn.isVisible().catch(() => false);
          if (visible) {
            await humanClick(page, await btn.evaluate((el) => {
              if (el.id)
                return `#${el.id}`;
              if (el.className)
                return `${el.tagName.toLowerCase()}.${el.className.split(" ")[0]}`;
              return el.tagName.toLowerCase();
            }));
            await page.waitForTimeout(500);
            return { resolved: true, resolution: "dismissed-cookie-consent" };
          }
        }
      }
    } catch {}
    return { resolved: false, error: "Could not dismiss cookie consent" };
  }
}

class HCaptchaResolver {
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
}
var resolvers = [
  new RecaptchaResolver,
  new HCaptchaResolver,
  new CookieConsentResolver
];
async function detectObstacles(page, detectors = defaultDetectors) {
  for (const detector of detectors) {
    const obstacle = await detector.detect(page);
    if (obstacle)
      return obstacle;
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

// src/lib/page-state.ts
async function capturePageState(page, ctx, opts) {
  const { screenshot: screenshot2 = false, namePrefix = "state" } = opts ?? {};
  let url = "";
  try {
    url = page.url();
  } catch {}
  const title = await page.title().catch(() => "");
  if (!screenshot2)
    return { url, title };
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `${namePrefix}-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
}

// src/lib/api-capture.ts
var SKIP_RESOURCE_TYPES = new Set([
  "stylesheet",
  "image",
  "media",
  "font",
  "manifest",
  "other"
]);
var SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i;
var BROWSER_NOISE_HEADERS = new Set([
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
var AUTH_HEADER_PATTERNS = [
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
function isAuthHeader(name) {
  return AUTH_HEADER_PATTERNS.some((p) => p.test(name));
}
var ID_PATTERNS = [
  /^[0-9]+$/,
  /^[0-9a-f]{8,}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
  /^\w{20,}$/
];
function isLikelyId(segment) {
  return ID_PATTERNS.some((p) => p.test(segment));
}
function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function parameterizePath(path9) {
  const parts = path9.split("/");
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
    if (u.searchParams.toString() === "")
      return;
    const params = {};
    u.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    return params;
  } catch {
    return;
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
    return;
  }
}
function sanitizeString(s) {
  return s.replace(/[\uD800-\uDFFF]/g, "�");
}
function sanitizeDeep(val) {
  if (typeof val === "string")
    return sanitizeString(val);
  if (Array.isArray(val))
    return val.map(sanitizeDeep);
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
  if (!body || typeof body !== "object")
    return false;
  const b = body;
  if (typeof b.query === "string" && /^\s*(query|mutation|subscription|fragment|\{)/.test(b.query))
    return true;
  if (typeof b.operationName === "string" && (("variables" in b) || ("query" in b) || ("doc_id" in b)))
    return true;
  if ("doc_id" in b && "variables" in b)
    return true;
  return false;
}
function gqlActionFromBody(body) {
  if (typeof body === "object" && body !== null) {
    const b = body;
    if (typeof b.operationName === "string" && b.operationName)
      return b.operationName;
    if (typeof b.fb_api_req_friendly_name === "string")
      return b.fb_api_req_friendly_name;
    if (b.doc_id != null)
      return `doc_${String(b.doc_id)}`;
    if (typeof b.queryId === "string")
      return b.queryId;
    if (typeof b.query === "string") {
      const m = b.query.match(/\b(?:query|mutation|subscription)\s+(\w+)/);
      if (m)
        return m[1];
    }
  }
  if (typeof body === "string") {
    const friendly = body.match(/fb_api_req_friendly_name=([^&]+)/);
    if (friendly)
      return decodeURIComponent(friendly[1]);
    const op = body.match(/(?:^|&)operationName=([^&]+)/);
    if (op)
      return decodeURIComponent(op[1]);
    const doc = body.match(/(?:^|&)doc_id=(\d+)/);
    if (doc)
      return `doc_${doc[1]}`;
  }
  return;
}
function classifyRequest(req) {
  const path9 = req.path;
  const lowerPath = path9.toLowerCase();
  const ct = (req.requestHeaders["content-type"] || req.requestHeaders["Content-Type"] || "").toLowerCase();
  const body = req.requestBody;
  if (ct.includes("application/grpc")) {
    return { protocol: "grpc-web", action: path9.replace(/^\//, "") };
  }
  const soapAction = req.requestHeaders["soapaction"] || req.requestHeaders["SOAPAction"];
  if (soapAction || ct.includes("text/xml") || ct.includes("application/soap+xml")) {
    return { protocol: "soap", action: (soapAction || path9).replace(/^["/]|["/]$/g, "") };
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
    if (friendly)
      return { protocol: "form-rpc", action: friendly };
  }
  return { protocol: "rest", action: `${req.method} ${parameterizePath(path9)}` };
}
function inferVerb(protocol, action, method, responseBody) {
  const lower = action.toLowerCase();
  if (protocol === "rest") {
    const m = method.toUpperCase();
    if (m === "DELETE")
      return "delete";
    if (m === "POST")
      return "create";
    if (m === "PUT" || m === "PATCH")
      return "update";
    if (m === "GET")
      return Array.isArray(responseBody) || isRecord(responseBody) && Array.isArray(responseBody.data) ? "list" : "read";
    return "action";
  }
  if (/\b(delete|remove|destroy|unfollow|unlike|dislike)\b/.test(lower))
    return "delete";
  if (/\b(create|add|insert|post|send|submit|publish|upload|register|signup|like|follow|react)\b/.test(lower))
    return "create";
  if (/\b(update|edit|patch|set|change|rename|modify|mark|move)\b/.test(lower))
    return "update";
  if (/\b(list|search|feed|timeline|paginated|browse|index|all|many)\b/.test(lower))
    return "list";
  if (/\b(get|fetch|load|read|query|view|show|profile|info|detail|me)\b/.test(lower))
    return "read";
  if (protocol === "graphql") {
    const q = isRecord(responseBody) ? responseBody.query : undefined;
    if (typeof q === "string" && /^\s*mutation\b/.test(q))
      return "action";
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
    const path9 = parts.slice(1).join(" ");
    const segs = path9.split("/").filter((s) => s && !s.startsWith("{"));
    const verbPrefix = httpMethod === "GET" ? verb === "list" ? "list" : "get" : httpMethod === "POST" ? "create" : httpMethod === "PUT" ? "update" : httpMethod === "PATCH" ? "patch" : httpMethod === "DELETE" ? "delete" : httpMethod.toLowerCase();
    return camelCase(`${verbPrefix} ${segs.join(" ")}`) || camelCase(action);
  }
  if (protocol === "graphql" || protocol === "form-rpc") {
    const base = action.replace(/^(Use|FB|IG)/, "").replace(/(Query|Mutation|Subscription|RootQuery)$/, "");
    return camelCase(base) || camelCase(action);
  }
  if (protocol === "json-rpc")
    return camelCase(action.replace(/[._]/g, " "));
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
  if (body !== undefined) {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const safeBody = bodyStr.length > 1e4 ? bodyStr.slice(0, 1e4) + "...[truncated]" : bodyStr;
    parts.push(`  -d '${safeBody.replace(/'/g, "'\\''")}'`);
  }
  parts.push(`  '${url}'`);
  return parts.join(" \\\n");
}

class ApiCapture {
  page;
  requests = [];
  pendingRequests = new Map;
  currentStep = 0;
  requestHandler;
  responseHandler;
  context;
  hookedPages = new Set;
  pageHandler;
  constructor(page) {
    this.page = page;
    this.context = page.context();
    this.pageHandler = (p) => this.hookPage(p);
    this.requestHandler = (req) => {
      const resourceType = req.resourceType();
      if (SKIP_RESOURCE_TYPES.has(resourceType))
        return;
      if (SKIP_EXTENSIONS.test(req.url()))
        return;
      if (resourceType !== "xhr" && resourceType !== "fetch")
        return;
      this.pendingRequests.set(req, {
        stepIndex: this.currentStep,
        timestamp: Date.now()
      });
    };
    this.responseHandler = async (res) => {
      const req = res.request();
      const meta = this.pendingRequests.get(req);
      if (!meta)
        return;
      this.pendingRequests.delete(req);
      try {
        const url = req.url();
        const parsed = new URL(url);
        const allHeaders = req.headers();
        let requestBody = undefined;
        try {
          const ct = (allHeaders["content-type"] || allHeaders["Content-Type"] || "").toLowerCase();
          const postData = req.postData();
          if (postData) {
            if (ct.includes("multipart/form-data")) {
              const fields = [...postData.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
              requestBody = { _type: "multipart/form-data", fields: [...new Set(fields)] };
            } else if (ct.includes("application/octet-stream") || ct.startsWith("video/") || ct.startsWith("image/") || ct.startsWith("audio/")) {
              requestBody = { _type: ct, _size: postData.length };
            } else if (postData.length < 500000) {
              requestBody = sanitizeDeep(tryParseJson(postData) ?? postData);
            } else {
              requestBody = `[body truncated — ${postData.length} bytes, content-type: ${ct}]`;
            }
          }
        } catch {}
        let responseBody = undefined;
        try {
          const resText = await res.text();
          if (resText && resText.length < 500000) {
            responseBody = sanitizeDeep(tryParseJson(resText) ?? resText);
          } else if (resText) {
            responseBody = `[response truncated — ${resText.length} bytes]`;
          }
        } catch {}
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
      } catch {}
    };
  }
  hookPage(p) {
    if (this.hookedPages.has(p))
      return;
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
      } catch {}
    }
    this.hookedPages.clear();
  }
  async drain(ms = 3000, pendingTimeoutMs = 5000) {
    await new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + pendingTimeoutMs;
    while (this.pendingRequests.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  extractAuth(requests) {
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
  splitHeaders(headers) {
    const endpointHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (BROWSER_NOISE_HEADERS.has(lower))
        continue;
      if (isAuthHeader(key))
        continue;
      if (lower === "user-agent")
        continue;
      endpointHeaders[key] = value;
    }
    return endpointHeaders;
  }
  getResults() {
    const byDomain = new Map;
    for (const req of this.requests) {
      try {
        const host = new URL(req.url).origin;
        if (!byDomain.has(host))
          byDomain.set(host, []);
        byDomain.get(host)?.push(req);
      } catch {}
    }
    const apis = [];
    for (const [baseUrl, requests] of byDomain) {
      const auth = this.extractAuth(requests);
      const endpointMap = new Map;
      for (const req of requests) {
        const paramPath = parameterizePath(req.path);
        const { protocol, action } = classifyRequest(req);
        const key = `${protocol}:${action}`;
        const endpointHeaders = this.splitHeaders(req.requestHeaders);
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
          if (!existing)
            continue;
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
        capturedAt: new Date().toISOString()
      });
    }
    return apis.sort((a, b) => b.endpoints.length - a.endpoints.length);
  }
}

// src/lib/browser/tab-tracker.ts
var log15 = createLogger("tabs");

class TabTracker {
  context;
  pages;
  activePage;
  newlyOpened = [];
  disposed = false;
  constructor(context, initial) {
    this.context = context;
    this.activePage = initial;
    this.pages = [...context.pages()];
    if (!this.pages.includes(initial))
      this.pages.push(initial);
    context.on("page", this.onNewPage);
  }
  onNewPage = (p) => {
    if (this.disposed)
      return;
    this.pages.push(p);
    this.newlyOpened.push(p);
    p.on("close", () => this.onClose(p));
    log15.debug(`new tab opened: ${safeUrl(p)}`);
  };
  onClose = (p) => {
    this.pages = this.pages.filter((x) => x !== p);
    this.newlyOpened = this.newlyOpened.filter((x) => x !== p);
    if (this.activePage === p) {
      this.activePage = this.pages[this.pages.length - 1] ?? p;
      log15.debug(`active tab closed, fell back to: ${safeUrl(this.activePage)}`);
    }
  };
  active() {
    return this.activePage;
  }
  count() {
    return this.pages.length;
  }
  async settle(opts) {
    if (this.newlyOpened.length === 0 && opts.waitForPendingMs > 0) {
      await this.context.waitForEvent("page", { timeout: opts.waitForPendingMs }).catch(() => null);
    }
    if (this.newlyOpened.length === 0)
      return null;
    const target = this.newlyOpened[this.newlyOpened.length - 1];
    this.newlyOpened = [];
    if (target.isClosed())
      return null;
    await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {});
    if (safeUrl(target) === "about:blank" || safeUrl(target) === "") {
      await target.waitForURL((u) => {
        const s = u.toString();
        return !!s && s !== "about:blank";
      }, { timeout: opts.blankResolveMs }).catch(() => {});
      await target.waitForLoadState("domcontentloaded", { timeout: opts.loadTimeoutMs }).catch(() => {});
    }
    const url = safeUrl(target);
    if (!url || url === "about:blank") {
      return null;
    }
    await target.bringToFront().catch(() => {});
    this.activePage = target;
    const sw = { url, title: await target.title().catch(() => "") };
    log15.info(`followed new tab → ${sw.url}`);
    return sw;
  }
  discardPending() {
    this.newlyOpened = [];
  }
  dispose() {
    this.disposed = true;
    try {
      this.context.off("page", this.onNewPage);
    } catch {}
  }
}
function safeUrl(p) {
  try {
    return p.url();
  } catch {
    return "unknown";
  }
}

// src/lib/pipeline.ts
var DEFAULT_STALE_TIMEOUT_MS2 = 20000;
function safePageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}
function classifyError(err, step) {
  if (err instanceof StaleStateError)
    return "stale-state";
  const msg = err.message.toLowerCase();
  if (step.type === "login" && (msg.includes("no visible password field") || msg.includes("password field was not visible"))) {
    return "bot-blocked";
  }
  if (msg.includes("timeout") || msg.includes("timed out"))
    return "timeout";
  if (msg.includes("not found") || msg.includes("no element") || msg.includes("waiting for selector"))
    return "element-not-found";
  if (msg.includes("navigation") || msg.includes("net::err"))
    return "navigation-failed";
  if (step.type === "solve-captcha")
    return "captcha-unsolvable";
  return "action-failed";
}
function isRetryable(errorType) {
  return errorType === "stale-state" || errorType === "timeout" || errorType === "element-not-found";
}
function getSuggestion(errorType, step) {
  switch (errorType) {
    case "stale-state":
      return "The page stopped responding. The step may have triggered a very slow load or the server may be unreachable.";
    case "element-not-found":
      return `Selector not found. The page structure may have changed. Take a screenshot to inspect the current state.`;
    case "navigation-failed":
      return "Navigation failed. The URL may be unreachable, blocked, or require authentication.";
    case "captcha-unsolvable":
      return "Automatic reCAPTCHA solving failed. The challenge may require human intervention.";
    case "timeout":
      return "Operation timed out. The page may be slow or the element may not appear.";
    default:
      return;
  }
}

class PipelineRunner {
  ctx;
  constructor(ctx) {
    this.ctx = ctx;
  }
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
    const capture = opts.captureApi ? new ApiCapture(initialPage) : null;
    if (capture)
      capture.start();
    const finishCapture = async () => {
      if (!capture)
        return;
      capture.stop();
      return capture.getResults();
    };
    for (let i = 0;i < pipeline.steps.length; i++) {
      if (capture)
        capture.setStep(i);
      const step = pipeline.steps[i];
      const page = tracker.active();
      const urlBefore = safePageUrl(page);
      const monitor = new StaleStateMonitor(page, staleTimeoutMs);
      let stepResult;
      try {
        stepResult = await monitor.withMonitoring(async () => {
          const r = await executeAction(page, step, this.ctx, monitor);
          r.stepIndex = i;
          return r;
        });
      } catch (err) {
        const asError = err instanceof Error ? err : new Error(String(err));
        const errorType = classifyError(asError, step);
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        stepResult = failedStepResult(step, asError.message, Date.now() - startTime, i);
        results.push(stepResult);
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
            message: asError.message,
            pageState,
            suggestion: getSuggestion(errorType, step),
            retryable: isRetryable(errorType)
          },
          durationMs: Date.now() - startTime,
          capturedApi: await finishCapture()
        };
      }
      const canOpenTab = step.type === "click" || step.type === "human-click";
      const currentPageNavigated = safePageUrl(page) !== urlBefore;
      if (canOpenTab && !currentPageNavigated) {
        const switched = await tracker.settle({
          waitForPendingMs: TIMEOUTS.TAB_FOLLOW_SETTLE,
          loadTimeoutMs: TIMEOUTS.TAB_LOAD,
          blankResolveMs: TIMEOUTS.TAB_BLANK_RESOLVE
        });
        if (switched)
          stepResult.tabSwitchedTo = switched.url;
      } else {
        tracker.discardPending();
      }
      if (screenshotAfterEach && stepResult.ok) {
        try {
          const buf = await tracker.active().screenshot({ type: "jpeg", quality: 50, fullPage: false });
          stepResult.screenshotUrl = saveScreenshot(buf, `step-${i}-${Date.now()}.jpg`, this.ctx.screenshotDir, this.ctx.publicUrl);
        } catch {}
      }
      results.push(stepResult);
      if (!stepResult.ok && !continueOnError) {
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        const errorType = classifyError(new Error(stepResult.error || ""), step);
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
            suggestion: getSuggestion(errorType, step),
            retryable: isRetryable(errorType)
          },
          durationMs: Date.now() - startTime,
          capturedApi: await finishCapture()
        };
      }
      if (step.type === "navigate" && continueOnObstacle) {
        const obstacleStart = Date.now();
        const obstaclePage = tracker.active();
        const obstacle = await detectObstacles(obstaclePage);
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
}
// src/lib/block-detection.ts
var log16 = createLogger("block-detection");
async function detectBlock(page) {
  try {
    const [title, url, bodyText] = await Promise.all([
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
      page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "").catch(() => "")
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
      log16.warn(`CF challenge check failed, assuming blocked: ${err}`);
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
        log16.warn(`captcha iframe check failed, assuming blocked: ${err}`);
        return true;
      });
      if (hasCaptchaIframe) {
        return { blocked: true, reason: "captcha-wall" };
      }
    }
    if (title.includes("403") || title.includes("Forbidden")) {
      return { blocked: true, reason: "http-403" };
    }
    if (!url.includes("about:blank") && bodyText.trim().length < 20 && title.length < 5) {}
    return { blocked: false };
  } catch (err) {
    log16.warn(`page evaluation failed, assuming blocked: ${err}`);
    return { blocked: true, reason: "evaluation-failed" };
  }
}

// src/lib/knowledge/extract-from-run.ts
function extractKnowledgeFromRun(pipeline, result, sessionData, mode) {
  const firstNav = pipeline.steps.find((s) => s.type === "navigate");
  if (!firstNav || firstNav.type !== "navigate")
    return;
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
        if (!cookieNames.includes(c.name))
          cookieNames.push(c.name);
      }
    }
    for (const [origin, store] of Object.entries(sessionData.localStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!localStorageKeys.includes(k))
            localStorageKeys.push(k);
        }
      }
    }
    for (const [origin, store] of Object.entries(sessionData.sessionStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!sessionStorageKeys.includes(k))
            sessionStorageKeys.push(k);
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
  if (cookieNames.length > 0)
    auth.cookieNames = cookieNames;
  if (localStorageKeys.length > 0)
    auth.localStorageKeys = localStorageKeys;
  if (sessionStorageKeys.length > 0)
    auth.sessionStorageKeys = sessionStorageKeys;
  const endpoints = [];
  const replayHeaders = new Set;
  for (const api of result.capturedApi ?? []) {
    if (!api.domain.includes(domainRoot) && !domainRoot.includes(api.domain.replace(/^www\./, "")))
      continue;
    if (api.auth?.authorization)
      replayHeaders.add("Authorization");
    for (const name of Object.keys(api.auth?.tokens ?? {}))
      replayHeaders.add(name);
    for (const ep of api.endpoints ?? []) {
      endpoints.push({
        method: ep.method,
        path: ep.path,
        description: `Status ${ep.responseStatus}. Triggered at step ${ep.triggeredAtStep}.`,
        example: ep.curl,
        firstSeen: new Date().toISOString()
      });
    }
  }
  if (replayHeaders.size > 0) {
    auth.headers = [...replayHeaders];
    if (!auth.type.includes("header"))
      auth.type = auth.type === "unknown" ? "headers" : `${auth.type}+headers`;
  }
  const notes = [];
  if (hadLogin)
    notes.push(`Last successful login via browser in ${mode} mode.`);
  if (result.obstacles?.some((o) => o.type?.includes("captcha")))
    notes.push("Captcha encountered — browser required for fresh logins.");
  mergeKnowledge(domainRoot, {
    lastMode: mode,
    browserRequired: true,
    auth,
    endpoints,
    notes
  });
}

// src/lib/execution/pipeline-executor.ts
var log17 = createLogger("iframer");

class PipelineExecutor {
  deps;
  pendingElicitOtp;
  constructor(deps) {
    this.deps = deps;
  }
  async execute(userId, token, pipeline, runtime) {
    this.pendingElicitOtp = runtime?.elicitOtp;
    try {
      return await this.executeInner(userId, token, pipeline);
    } finally {
      this.pendingElicitOtp = undefined;
    }
  }
  async executeInner(userId, token, pipeline) {
    const opts = pipeline.options || {};
    const forcedMode = opts.mode;
    const autoEscalate = opts.autoEscalate !== false;
    const instanceId = opts.instanceId || DEFAULT_INSTANCE;
    const firstNav = pipeline.steps.find((s) => s.type === "navigate");
    const domain = firstNav ? new URL(firstNav.url).hostname : null;
    const availableModes = this.deps.availableModes();
    let mode;
    if (forcedMode && availableModes.includes(forcedMode)) {
      mode = forcedMode;
    } else if (domain) {
      mode = this.deps.domainModes.getBestMode(domain, availableModes);
    } else {
      mode = availableModes[0] || "headless";
    }
    let result = await this.executeWithMode(userId, token, pipeline, mode, instanceId);
    if (!result.ok && autoEscalate && domain && result.error?.errorType === "bot-blocked") {
      const failedMode = mode;
      if (domain)
        this.deps.domainModes.recordFailure(domain, failedMode, result.error?.message || "blocked");
      const nextMode = this.deps.domainModes.getNextMode(failedMode, availableModes);
      if (nextMode) {
        log17.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);
        if (failedMode !== "docker-headful") {
          await this.deps.daemon.stopMode(failedMode, instanceId);
        }
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
            if (nextMode !== "docker-headful") {
              await this.deps.daemon.stopMode(nextMode, instanceId);
            }
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
  async executeWithMode(userId, token, pipeline, mode, instanceId = DEFAULT_INSTANCE) {
    if (mode === "docker-headful") {
      return this.executeDocker(userId, token, pipeline);
    }
    return this.executeLocal(userId, token, pipeline, mode, instanceId);
  }
  async executeDocker(userId, token, pipeline) {
    let session = getSession(userId);
    if (!session) {
      const firstNav = pipeline.steps.find((s) => s.type === "navigate");
      await this.deps.startSession(userId, token, firstNav ? { url: firstNav.url } : {});
      session = getSession(userId);
    }
    resetTimeout(userId);
    const ctx = this.deps.refStore.makeContext(userId, token);
    const runner = new PipelineRunner(ctx);
    const result = await runner.run(session.page, pipeline);
    if (result.ok) {
      const blockResult = await detectBlock(session.page);
      if (blockResult.blocked) {
        const pageState = await capturePageState(session.page, ctx, { screenshot: true, namePrefix: "block" });
        return {
          ...result,
          ok: false,
          modeUsed: "docker-headful",
          error: {
            failedAtStep: result.completedSteps - 1,
            failedStep: pipeline.steps[result.completedSteps - 1],
            errorType: "bot-blocked",
            message: `Page blocked by bot detection: ${blockResult.reason}`,
            pageState,
            suggestion: "The page is blocked by bot detection. Try a different browser mode.",
            retryable: true
          }
        };
      }
    }
    this.deps.refStore.sync(userId, ctx);
    result.modeUsed = "docker-headful";
    return result;
  }
  async executeLocal(userId, token, pipeline, mode, instanceId = DEFAULT_INSTANCE) {
    const startTime = Date.now();
    let acquired = false;
    try {
      const { page } = await this.deps.daemon.ensure(mode, instanceId);
      this.deps.daemon.acquire(mode, instanceId);
      acquired = true;
      const storeKey = sessionStoreKey(userId, instanceId);
      const encryptionKey = await deriveKey(token);
      const blob = await this.deps.store.getSession(storeKey);
      let sessionData = null;
      if (blob && blob.length > 0) {
        try {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
          await injectCookies(page.context(), sessionData);
        } catch {}
      }
      const ctx = this.deps.refStore.makeContext(userId, token);
      if (sessionData)
        ctx.sessionData = sessionData;
      if (this.pendingElicitOtp)
        ctx.elicitOtp = this.pendingElicitOtp;
      const runner = new PipelineRunner(ctx);
      const result = await runner.run(page, pipeline);
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
              suggestion: `The page was blocked in ${mode} mode. ${mode === "headless" ? "Try docker-headful mode." : mode === "docker-headful" ? "Try binary-headful mode." : "All modes exhausted."}`,
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
        } catch {}
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
      if (acquired)
        this.deps.daemon.release(mode, instanceId);
    }
  }
}
// src/lib/execution/fetch-service.ts
class FetchService {
  store;
  constructor(store) {
    this.store = store;
  }
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
      context = await browser.newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? undefined));
      if (sessionData)
        await injectCookies(context, sessionData);
      const page = await context.newPage();
      await applyStealthToPage(page);
      await page.goto(url, { waitUntil: waitUntil || "domcontentloaded", timeout: TIMEOUTS.NAVIGATION });
      if (sessionData)
        await injectStorage(page, sessionData);
      if (waitForSelector)
        await page.waitForSelector(waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });
      for (const action of actions) {
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
      const finalUrl = page.url();
      const html = returnHtml ? await page.content() : undefined;
      const result = extract2 ? await page.evaluate(extract2) : undefined;
      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
        await this.store.setSession(userId, encrypted);
      }
      return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
    } catch (err) {
      return { ok: false, browser: "unknown", url, error: getErrorMessage(err), durationMs: Date.now() - startedAt };
    } finally {
      if (context)
        await context.close();
    }
  }
}

// src/lib/execution/capture-manager.ts
class CaptureManager {
  daemon;
  captures = new Map;
  constructor(daemon) {
    this.daemon = daemon;
  }
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
      return { ok: false, capturedApi: undefined, message: `No active capture on ${key}. Start one with 'session capture-start'.` };
    }
    capture.stop();
    this.captures.delete(key);
    const capturedApi = capture.getResults();
    const total = capturedApi.reduce((n, a) => n + a.endpoints.length, 0);
    return { ok: true, capturedApi, message: `Capture stopped. ${total} endpoints across ${capturedApi.length} domain(s).` };
  }
  async getCookies(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
    const { context } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();
    return { ok: true, cookies, message: `${cookies.length} cookies extracted via CDP.` };
  }
  async getFullAuth(mode = "binary-headful", urls, instanceId = DEFAULT_INSTANCE) {
    const { context, page } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();
    const localStorage = {};
    const sessionStorage = {};
    try {
      const stores = await page.evaluate(() => {
        const ls = {};
        const ss = {};
        for (let i = 0;i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          ls[k] = window.localStorage.getItem(k) ?? "";
        }
        for (let i = 0;i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          ss[k] = window.sessionStorage.getItem(k) ?? "";
        }
        return { origin: window.location.origin, ls, ss };
      });
      localStorage[stores.origin] = stores.ls;
      sessionStorage[stores.origin] = stores.ss;
    } catch {}
    return {
      ok: true,
      cookies,
      localStorage,
      sessionStorage,
      message: `${cookies.length} cookies, ${Object.values(localStorage).reduce((n, s) => n + Object.keys(s).length, 0)} localStorage keys, ${Object.values(sessionStorage).reduce((n, s) => n + Object.keys(s).length, 0)} sessionStorage keys.`
    };
  }
}

// src/lib/auth/credential-store.ts
class CredentialStore {
  store;
  config;
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }
  async storeCredential(userId, token, credential) {
    const credKey = await deriveKey(token, "credentials");
    const normalizedDomain = normalizeDomain(credential.domain);
    const data = {
      ...credential,
      domain: normalizedDomain,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
  async loginWithCredentials(userId, token, domain, selectors) {
    const session = getSession(userId);
    if (!session)
      return { ok: false, url: "", title: "", error: "No active interactive session. Start one first." };
    const resolved = await resolveCredential(this.store, userId, token, domain);
    if (!resolved) {
      const stored = await this.store.listCredentialDomains(userId);
      return { ok: false, url: "", title: "", error: `No credentials stored for ${normalizeDomain(domain)}. Stored: ${stored.join(", ") || "(none)"}` };
    }
    const { credential } = resolved;
    const page = session.page;
    resetTimeout(userId);
    if (selectors.username && credential.username) {
      await humanType(page, selectors.username, credential.username);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.password && credential.password) {
      await humanType(page, selectors.password, credential.password);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.submit) {
      await humanClick(page, selectors.submit);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
    }
    if (selectors.totp && credential.totp_secret) {
      const totp = generateTOTP(credential.totp_secret);
      await page.click(selectors.totp);
      await page.keyboard.type(totp, { delay: 50 });
      await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
    }
    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `login-${Date.now()}.jpg`, this.config.screenshotDir, this.config.publicUrl);
    return { ok: true, url: page.url(), title: await page.title(), screenshotUrl };
  }
}

// src/lib/iframer.ts
var log18 = createLogger("iframer");
var DEFAULT_SCREENSHOT_DIR = import_path9.default.join(import_path9.default.dirname(import_url.fileURLToPath("file:///Users/eduardoverona/tools/iframer-toolkit/src/lib/iframer.ts")), "../../.screenshots");
var DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
var DEFAULT_STALE_TIMEOUT_MS3 = 20000;

class Iframer {
  store;
  daemon;
  domainModes;
  operatingMode;
  config;
  refStore;
  executor;
  fetchService;
  captureManager;
  credentials;
  constructor(config = {}) {
    this.config = {
      screenshotDir: config.screenshotDir || DEFAULT_SCREENSHOT_DIR,
      publicUrl: config.publicUrl || DEFAULT_PUBLIC_URL,
      staleTimeoutMs: config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS3
    };
    this.store = createStore({ dataDir: config.dataDir });
    this.daemon = new BrowserDaemon(config.sessionTimeoutMs);
    this.domainModes = new DomainModeStore;
    this.operatingMode = config.mode || "local";
    this.refStore = new RefStore(this.store, this.config);
    this.fetchService = new FetchService(this.store);
    this.captureManager = new CaptureManager(this.daemon);
    this.credentials = new CredentialStore(this.store, this.config);
    this.executor = new PipelineExecutor({
      daemon: this.daemon,
      store: this.store,
      domainModes: this.domainModes,
      refStore: this.refStore,
      availableModes: () => this.getAvailableModes(),
      startSession: (userId, token, options) => this.startSession(userId, token, options)
    });
  }
  getAvailableModes() {
    const modes = ["headless"];
    const { binaryHeadful } = checkModeAvailability();
    if (binaryHeadful)
      modes.push("binary-headful");
    if (this.operatingMode === "docker")
      modes.push("docker-headful");
    return modes;
  }
  async getModeAvailability() {
    const { binaryHeadful } = checkModeAvailability();
    return {
      headless: { available: true },
      "binary-headful": {
        available: binaryHeadful,
        reason: binaryHeadful ? undefined : "No display available"
      },
      "docker-headful": {
        available: this.operatingMode === "docker",
        reason: this.operatingMode === "docker" ? undefined : "Docker not configured"
      }
    };
  }
  fetch(userId, token, request) {
    return this.fetchService.fetch(userId, token, request);
  }
  execute(userId, token, pipeline, runtime) {
    return this.executor.execute(userId, token, pipeline, runtime);
  }
  async startSession(userId, token, options = {}) {
    const existing = getSession(userId);
    if (existing) {
      resetTimeout(userId);
      return {
        noVncUrl: `http://localhost:${existing.wsPort}/vnc.html?autoconnect=true`,
        wsPort: existing.wsPort
      };
    }
    const session = await startSession(userId);
    const encryptionKey = await deriveKey(token);
    const blob = await this.store.getSession(userId);
    let sessionData = null;
    if (blob && blob.length > 0) {
      sessionData = JSON.parse(decrypt(blob, encryptionKey));
      if (sessionData)
        await injectCookies(session.context, sessionData);
    }
    if (options.url) {
      await session.page.goto(options.url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.NAVIGATION });
      if (sessionData)
        await injectStorage(session.page, sessionData);
    }
    return {
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort
    };
  }
  getSession(userId) {
    return getSession(userId);
  }
  async stopSession(userId, token) {
    let sessionSaved = false;
    if (token) {
      const encryptionKey = await deriveKey(token);
      for (const inst of this.daemon.liveInstances()) {
        try {
          const data = await extractSession(inst.context, inst.page);
          if (data) {
            const encrypted = encrypt(JSON.stringify(data), encryptionKey);
            await this.store.setSession(sessionStoreKey(userId, inst.instanceId), encrypted);
            sessionSaved = true;
          }
        } catch (err) {
          log18.warn(`stopSession: failed to extract daemon state for ${inst.mode}::${inst.instanceId}: ${getErrorMessage(err)}`);
        }
      }
    }
    const dockerSessionData = await stopSession(userId);
    if (dockerSessionData && token) {
      const encryptionKey = await deriveKey(token);
      const encrypted = encrypt(JSON.stringify(dockerSessionData), encryptionKey);
      await this.store.setSession(userId, encrypted);
      sessionSaved = true;
    }
    await this.daemon.stopAll();
    return { ok: true, sessionSaved };
  }
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
  browserHealth() {
    const modes = this.daemon.runningModes();
    return { alive: modes.length > 0, modes };
  }
  async restartBrowser() {
    const health = this.browserHealth();
    await this.daemon.stopAll(true);
    await cleanupAllSessions();
    return {
      killed: health.modes,
      message: health.modes.length > 0 ? `Killed browser(s): ${health.modes.join(", ")}. Next execute call will launch a fresh instance.` : "No browsers were running. Next execute call will launch fresh."
    };
  }
  async screenshot(userId) {
    const session = getSession(userId);
    if (!session)
      return null;
    resetTimeout(userId);
    const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `screenshot-${Date.now()}.jpg`, this.config.screenshotDir, this.config.publicUrl);
    return {
      screenshotUrl,
      url: session.page.url(),
      title: await session.page.title()
    };
  }
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
  loginWithCredentials(userId, token, domain, selectors) {
    return this.credentials.loginWithCredentials(userId, token, domain, selectors);
  }
  async clearSession(userId) {
    await this.store.deleteSession(userId);
  }
  async shutdown() {
    await this.daemon.stopAll(true);
    await closeBrowser();
    await cleanupAllSessions();
    if ("close" in this.store && typeof this.store.close === "function") {
      this.store.close();
    }
  }
}

// src/api/error-handler.ts
class AppError extends Error {
  statusCode;
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ ok: false, error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ ok: false, error: message });
}

// src/lib/extension/bridge.ts
var import_ws = require("ws");
var REQUEST_TIMEOUT_MS = 180000;

class ExtensionBridge {
  wss = null;
  socket = null;
  connectedAt = null;
  nextId = 1;
  pending = new Map;
  attach(server) {
    if (this.wss)
      return;
    this.wss = new import_ws.WebSocketServer({ server, path: "/extension/ws" });
    this.wss.on("connection", (ws, req) => {
      const token = new URL(req.url || "", "http://127.0.0.1").searchParams.get("token");
      let expected = "";
      try {
        expected = getLocalToken();
      } catch {
        expected = "";
      }
      if (!expected || token !== expected) {
        ws.close(4001, "unauthorized");
        return;
      }
      if (this.socket && this.socket !== ws) {
        try {
          this.socket.close(4000, "replaced by newer connection");
        } catch {}
      }
      this.socket = ws;
      this.connectedAt = Date.now();
      ws.on("message", (data) => this.onMessage(ws, data));
      ws.on("close", () => {
        if (this.socket === ws) {
          this.socket = null;
          this.connectedAt = null;
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("Extension disconnected before responding."));
          }
          this.pending.clear();
        }
      });
      ws.on("error", () => {});
    });
  }
  onMessage(ws, data) {
    if (ws !== this.socket)
      return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (typeof msg.id !== "number")
      return;
    const p = this.pending.get(msg.id);
    if (!p)
      return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok)
      p.resolve(msg.result);
    else
      p.reject(new Error(msg.error || "Extension reported an error."));
  }
  send(type, payload) {
    const ws = this.socket;
    if (!ws || ws.readyState !== import_ws.WebSocket.OPEN) {
      return Promise.reject(new Error("No iframer extension is connected. Open Chrome, install the iframer " + "extension, click its icon on the tab you want to drive, and make sure " + "it shows 'connected'."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension did not respond within ${REQUEST_TIMEOUT_MS}ms (${type}).`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ id, type, ...payload }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
  isConnected() {
    return !!this.socket && this.socket.readyState === import_ws.WebSocket.OPEN;
  }
  status() {
    return {
      connected: this.isConnected(),
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null
    };
  }
  listTabs() {
    return this.send("list_tabs", {});
  }
  execute(tabId, steps, options = {}) {
    return this.send("execute", { tabId, steps, options });
  }
}
var extensionBridge = new ExtensionBridge;

// src/api/routes.ts
var import_fs10 = __toESM(require("fs"));
function auth(req) {
  return req;
}
var iframer = new Iframer({
  mode: process.env.IFRAMER_MODE || "local"
});
function registerRoutes(app) {
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/browsers", async (_req, res) => {
    const browsers = [];
    try {
      const execPath = import_patchright3.chromium.executablePath();
      browsers.push({ name: "chromium", installed: import_fs10.default.existsSync(execPath), executablePath: execPath });
    } catch {
      browsers.push({ name: "chromium", installed: false, executablePath: null });
    }
    res.json({ ok: true, browsers });
  });
  app.get("/browser/health", (_req, res) => {
    res.json({ ok: true, ...iframer.browserHealth() });
  });
  app.post("/browser/restart", asyncHandler(async (_req, res) => {
    const result = await iframer.restartBrowser();
    res.json({ ok: true, ...result });
  }));
  app.post("/auth/cookies", asyncHandler(async (req, res) => {
    const { mode, urls, instanceId } = req.body || {};
    const result = await iframer.getCookies(mode, urls, instanceId);
    res.json(result);
  }));
  app.post("/auth/full", asyncHandler(async (req, res) => {
    const { mode, urls, instanceId } = req.body || {};
    const result = await iframer.getFullAuth(mode, urls, instanceId);
    res.json(result);
  }));
  app.post("/capture/start", asyncHandler(async (req, res) => {
    const { mode, instanceId } = req.body || {};
    const result = await iframer.startCapture(mode, instanceId);
    res.json(result);
  }));
  app.post("/capture/stop", asyncHandler(async (req, res) => {
    const { mode, instanceId } = req.body || {};
    const result = await iframer.stopCapture(mode, instanceId);
    res.json(result);
  }));
  app.post("/execute", asyncHandler(async (req, res) => {
    const { steps, options } = req.body || {};
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new AppError(400, "steps must be a non-empty array");
    }
    const r = auth(req);
    const result = await iframer.execute(r.userId, r.token, { steps, options });
    res.json(result);
  }));
  app.post("/interactive/start", asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    const r = auth(req);
    const result = await iframer.startSession(r.userId, r.token, { url });
    const existing = iframer.getSession(r.userId);
    res.json({
      ok: true,
      noVncUrl: result.noVncUrl,
      wsPort: result.wsPort,
      message: existing ? "Session already active" : undefined
    });
  }));
  app.get("/interactive/status", (req, res) => {
    const session = iframer.getSession(auth(req).userId);
    if (!session)
      return res.json({ ok: true, active: false });
    res.json({
      ok: true,
      active: true,
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort,
      createdAt: session.createdAt.toISOString()
    });
  });
  app.post("/interactive/stop", asyncHandler(async (req, res) => {
    const r = auth(req);
    const result = await iframer.stopSession(r.userId, r.token);
    res.json(result);
  }));
  app.get("/interactive/screenshot", asyncHandler(async (req, res) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session)
      throw new AppError(404, "No active interactive session");
    if (req.query.format === "raw") {
      const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
      res.set("Content-Type", "image/jpeg");
      res.send(buf);
      return;
    }
    const result = await iframer.screenshot(r.userId);
    if (!result)
      throw new AppError(404, "No active interactive session");
    res.json({ ok: true, ...result });
  }));
  app.post("/interactive/act", asyncHandler(async (req, res) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session)
      throw new AppError(404, "No active interactive session");
    const { action, screenshot: wantScreenshot = true } = req.body || {};
    if (!action || !action.type)
      throw new AppError(400, "Missing action.type");
    const result = await iframer.execute(r.userId, r.token, {
      steps: [action],
      options: { screenshotAfterEach: wantScreenshot, continueOnObstacle: false }
    });
    const stepResult = result.results[0];
    res.json({
      ok: result.ok,
      result: stepResult?.result,
      screenshotUrl: stepResult?.screenshotUrl || result.finalState?.screenshotUrl,
      url: result.finalState?.url,
      title: result.finalState?.title,
      error: result.error?.message
    });
  }));
  app.post("/interactive/batch", asyncHandler(async (req, res) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session)
      throw new AppError(404, "No active interactive session");
    const { actions, screenshot: wantScreenshot = true, continueOnError = false } = req.body || {};
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new AppError(400, "actions must be a non-empty array");
    }
    const result = await iframer.execute(r.userId, r.token, {
      steps: actions,
      options: { continueOnError, screenshotAfterEach: false }
    });
    res.json({
      ok: result.ok,
      results: result.results.map((r2) => ({ index: r2.stepIndex, ok: r2.ok, result: r2.result, error: r2.error })),
      screenshotUrl: wantScreenshot ? result.finalState?.screenshotUrl : undefined,
      url: result.finalState?.url,
      title: result.finalState?.title
    });
  }));
  app.delete("/session", asyncHandler(async (req, res) => {
    await iframer.clearSession(auth(req).userId);
    res.json({ ok: true });
  }));
  app.post("/credentials", asyncHandler(async (req, res) => {
    const { domain, username, password, totp_secret, fields } = req.body || {};
    if (!domain)
      throw new AppError(400, "Missing domain");
    if (!username && !password && !fields) {
      throw new AppError(400, "Must provide username, password, or fields");
    }
    const r = auth(req);
    await iframer.storeCredential(r.userId, r.token, { domain, username, password, totp_secret, fields });
    res.json({ ok: true, domain, message: "Credentials stored" });
  }));
  app.get("/credentials", asyncHandler(async (req, res) => {
    const domains = await iframer.listCredentials(auth(req).userId);
    res.json({ ok: true, domains });
  }));
  app.delete("/credentials/:domain", asyncHandler(async (req, res) => {
    await iframer.deleteCredential(auth(req).userId, req.params.domain);
    res.json({ ok: true, message: `Credentials for ${req.params.domain} deleted` });
  }));
  app.post("/credentials/login", asyncHandler(async (req, res) => {
    const { domain, usernameSelector, passwordSelector, submitSelector, totpSelector } = req.body || {};
    if (!domain)
      throw new AppError(400, "Missing domain");
    const r = auth(req);
    const result = await iframer.loginWithCredentials(r.userId, r.token, domain, {
      username: usernameSelector,
      password: passwordSelector,
      submit: submitSelector,
      totp: totpSelector
    });
    if (!result.ok)
      throw new AppError(400, result.error || "Login failed");
    const { ok: _ok, ...resultRest } = result;
    res.json({ ok: true, message: "Login attempted", ...resultRest });
  }));
  app.get("/extension/status", (_req, res) => {
    res.json({ ok: true, ...extensionBridge.status() });
  });
  app.post("/extension/tabs", asyncHandler(async (_req, res) => {
    const result = await extensionBridge.listTabs();
    res.json({ ok: true, ...result });
  }));
  app.post("/extension/execute", asyncHandler(async (req, res) => {
    const { tabId, steps, options } = req.body || {};
    if (typeof tabId !== "number")
      throw new AppError(400, "tabId (number) is required");
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new AppError(400, "steps must be a non-empty array");
    }
    const result = await extensionBridge.execute(tabId, steps, options || {});
    res.json(result);
  }));
  app.post("/fetch", asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    if (!url)
      throw new AppError(400, "Missing url");
    const r = auth(req);
    const result = await iframer.fetch(r.userId || null, r.token || null, req.body);
    res.json(result);
  }));
}

// src/api/middleware.ts
var CANONICAL_USER = "iframer-local";
function tokenAuth(req, res, next) {
  const secret = process.env.IFRAMER_SECRET;
  if (secret && req.path !== "/health") {
    const header = req.headers["x-api-key"] ?? req.headers.authorization?.replace("Bearer ", "");
    if (header !== secret) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
  }
  req.userId = CANONICAL_USER;
  req.token = getLocalToken();
  next();
}

// index.ts
var app = import_express.default();
var PORT = parseInt(process.env.PORT || "3021", 10);
var REAP_INTERVAL_MS = 60000;
var IDLE_EXIT_MS = parseInt(process.env.IFRAMER_SERVER_IDLE_EXIT_MS || String(30 * 60 * 1000), 10);
var SHUTDOWN_DEADLINE_MS = 1e4;
var SCREENSHOT_DIR = import_path10.default.join(import_path10.default.dirname(import_url2.fileURLToPath("file:///Users/eduardoverona/tools/iframer-toolkit/index.ts")), ".screenshots");
import_fs11.default.mkdirSync(SCREENSHOT_DIR, { recursive: true });
app.use("/screenshots", import_express.default.static(SCREENSHOT_DIR));
app.use(import_express.default.json());
var lastActivity = Date.now();
app.use((_req, _res, next) => {
  lastActivity = Date.now();
  next();
});
app.use(tokenAuth);
registerRoutes(app);
app.use(errorHandler);
process.on("uncaughtException", (err) => {
  console.error(`[local-server] uncaughtException (survived): ${err?.message}`);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[local-server] unhandledRejection (survived): ${reason}`);
});
var server = app.listen(PORT, () => {
  console.log(`iframer listening on ${PORT}`);
  writeServerInfo({ pid: process.pid, port: PORT, startedAt: new Date().toISOString() });
});
extensionBridge.attach(server);
var shutdownStarted = false;
async function gracefulShutdown(reason) {
  if (shutdownStarted)
    return;
  shutdownStarted = true;
  console.log(`[local-server] shutting down (${reason})...`);
  const deadline = setTimeout(() => {
    console.error(`[local-server] shutdown exceeded ${SHUTDOWN_DEADLINE_MS}ms, forcing exit`);
    clearServerInfo(process.pid);
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref?.();
  server.close();
  try {
    await iframer.shutdown();
  } catch (err) {
    console.error(`[local-server] shutdown error: ${err}`);
  }
  clearServerInfo(process.pid);
  process.exit(0);
}
app.post("/shutdown", (_req, res) => {
  res.json({ ok: true });
  setImmediate(() => gracefulShutdown("shutdown endpoint"));
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => gracefulShutdown(signal));
}
(async () => {
  try {
    const { reaped } = await reapOrphanBrowsers();
    if (reaped > 0)
      console.log(`[local-server] reaped ${reaped} orphaned Chrome process(es) at boot`);
  } catch (err) {
    console.error(`[local-server] boot reap failed: ${err}`);
  }
})();
var reapTimer = setInterval(async () => {
  try {
    await reapOrphanBrowsers();
  } catch {}
  const idleMs = Date.now() - lastActivity;
  if (idleMs > IDLE_EXIT_MS && !iframer.browserHealth().alive) {
    gracefulShutdown(`idle for ${Math.round(idleMs / 60000)}min with no browsers`);
  }
}, REAP_INTERVAL_MS);
reapTimer.unref?.();
