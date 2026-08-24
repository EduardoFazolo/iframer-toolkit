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
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
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
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

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
var contextStealthScripts, CHROME_VERSION = "136.0.7103.93", USER_AGENT, NATIVE_TOSTRING_HELPER = `
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
`, STEALTH_SCRIPT, STEALTH_ARGS;
var init_stealth = __esm(() => {
  contextStealthScripts = new Map;
  USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
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
});

// src/lib/logger.ts
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
var LEVELS, currentLevel;
var init_logger = __esm(() => {
  LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  currentLevel = process.env.LOG_LEVEL || "info";
});

// src/lib/browser/launcher.ts
function findChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE)
    return process.env.CHROME_EXECUTABLE;
  if (import_fs.default.existsSync("/usr/bin/google-chrome-stable"))
    return "/usr/bin/google-chrome-stable";
  return;
}
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
var import_fs, import_patchright, log, UBLOCK_PATH = "/extensions/uBlock0.chromium", cachedBrowser = null;
var init_launcher = __esm(() => {
  init_stealth();
  init_logger();
  import_fs = __toESM(require("fs"));
  import_patchright = require("patchright");
  log = createLogger("launcher");
});

// src/lib/constants.ts
var TIMING, CAPTCHA_GRID, SCREEN_DEFAULTS, THRESHOLDS, TIMEOUTS, CHROME_MIN_VERSION = 130;
var init_constants = __esm(() => {
  TIMING = {
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
  CAPTCHA_GRID = {
    RECAPTCHA_HEADER_HEIGHT: 112,
    HCAPTCHA_HEADER_HEIGHT: 110,
    DEFAULT_TILE_SIZE: 125,
    GRID_PADDING: 24,
    GRID_MARGIN: 12,
    VERIFY_BTN_BOTTOM_OFFSET: 35,
    VERIFY_BTN_RIGHT_OFFSET: 60
  };
  SCREEN_DEFAULTS = {
    WIDTH: 1920,
    HEIGHT: 1080,
    AVAIL_HEIGHT: 1040,
    DPR: 1.25
  };
  THRESHOLDS = {
    STALE_CHAR_CHANGE: 100,
    STALE_PERCENT_CHANGE: 0.05,
    MIN_BODY_TEXT: 200,
    MAX_RESPONSE_TEXT: 1e5
  };
  TIMEOUTS = {
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
});

// src/lib/browser/fingerprint.ts
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
var import_fingerprint_generator, generator;
var init_fingerprint = __esm(() => {
  init_constants();
  import_fingerprint_generator = require("fingerprint-generator");
  generator = new import_fingerprint_generator.FingerprintGenerator({
    browsers: [{ name: "chrome", minVersion: CHROME_MIN_VERSION }],
    operatingSystems: ["windows"],
    devices: ["desktop"],
    locales: ["en-US"]
  });
});

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

// src/lib/browser/session-manager.ts
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
var import_child_process, import_fs2, log2, BASE_DISPLAY, MAX_SESSIONS, SESSION_TIMEOUT, sessions, usedDisplays;
var init_session_manager = __esm(() => {
  init_launcher();
  init_stealth();
  init_logger();
  init_fingerprint();
  import_child_process = require("child_process");
  import_fs2 = __toESM(require("fs"));
  log2 = createLogger("session");
  BASE_DISPLAY = parseInt(process.env.VNC_BASE_DISPLAY || "99", 10);
  MAX_SESSIONS = parseInt(process.env.VNC_MAX_SESSIONS || "20", 10);
  SESSION_TIMEOUT = parseInt(process.env.VNC_SESSION_TIMEOUT_MS || "300000", 10);
  sessions = new Map;
  usedDisplays = new Set;
});

// src/lib/paths.ts
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}
var import_path, import_os;
var init_paths = __esm(() => {
  import_path = __toESM(require("path"));
  import_os = __toESM(require("os"));
});

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
var import_crypto, import_fs3, import_os2, import_path2, SALT = "iframer-session", INFO = "encryption", KEY_LENGTH = 32, IV_LENGTH = 12, TAG_LENGTH = 16;
var init_crypto = __esm(() => {
  init_paths();
  import_crypto = __toESM(require("crypto"));
  import_fs3 = __toESM(require("fs"));
  import_os2 = __toESM(require("os"));
  import_path2 = __toESM(require("path"));
});

// src/lib/screenshot.ts
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
var import_fs4, import_path3, log3, MAX_AGE_MS, MAX_FILES, PRUNE_THROTTLE_MS, lastPruneAt = 0;
var init_screenshot = __esm(() => {
  init_logger();
  import_fs4 = __toESM(require("fs"));
  import_path3 = __toESM(require("path"));
  log3 = createLogger("screenshot");
  MAX_AGE_MS = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10);
  MAX_FILES = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_FILES || "500", 10);
  PRUNE_THROTTLE_MS = 5 * 60 * 1000;
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
var import_path4, import_fs5, IS_BUN;
var init_sqlite_store = __esm(() => {
  import_path4 = __toESM(require("path"));
  import_fs5 = __toESM(require("fs"));
  IS_BUN = typeof globalThis.Bun !== "undefined";
});

// src/lib/storage.ts
function createStore(options = {}) {
  const dataDir = options.dataDir || getDataDir();
  return new SqliteStore(dataDir);
}
var init_storage = __esm(() => {
  init_sqlite_store();
  init_paths();
});

// src/lib/browser/chrome-downloader.ts
var exports_chrome_downloader = {};
__export(exports_chrome_downloader, {
  isChromiumInstalled: () => isChromiumInstalled,
  findChromeForTesting: () => findChromeForTesting,
  findChrome: () => findChrome,
  ensureChrome: () => ensureChrome,
  downloadChrome: () => downloadChrome
});
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
function isChromiumInstalled() {
  return findChrome() !== null;
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
var import_fs6, import_path5, import_os3, import_child_process2, log4, CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json", DEFAULT_INSTALL_DIR;
var init_chrome_downloader = __esm(() => {
  init_logger();
  import_fs6 = __toESM(require("fs"));
  import_path5 = __toESM(require("path"));
  import_os3 = __toESM(require("os"));
  import_child_process2 = require("child_process");
  log4 = createLogger("chrome");
  DEFAULT_INSTALL_DIR = import_path5.default.join(import_os3.default.homedir(), ".iframer", "chrome");
});

// src/lib/browser/cloak-browser.ts
function cloakEnabled() {
  return process.env.IFRAMER_USE_CLOAKBROWSER === "1" || process.env.IFRAMER_USE_CLOAKBROWSER === "true";
}
async function tryImport() {
  if (!cloakEnabled())
    return null;
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
var log5, _available = null;
var init_cloak_browser = __esm(() => {
  init_logger();
  log5 = createLogger("cloak");
});

// src/lib/browser/registry.ts
function browsersDir() {
  const dir = import_path6.default.join(getDataDir(), "browsers");
  import_fs7.default.mkdirSync(dir, { recursive: true });
  return dir;
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
var import_fs7, import_path6, import_child_process3, log6, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var init_registry = __esm(() => {
  init_paths();
  init_logger();
  import_fs7 = __toESM(require("fs"));
  import_path6 = __toESM(require("path"));
  import_child_process3 = require("child_process");
  log6 = createLogger("registry");
});

// src/lib/browser/daemon.ts
function keyOf(mode, instanceId) {
  return `${mode}::${instanceId}`;
}

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
var import_patchright2, import_crypto2, log7, DEFAULT_IDLE_TIMEOUT, CLOSE_GRACE_MS = 5000, DEFAULT_INSTANCE = "default", sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
var init_daemon = __esm(() => {
  init_chrome_downloader();
  init_cloak_browser();
  init_logger();
  init_registry();
  import_patchright2 = require("patchright");
  import_crypto2 = require("crypto");
  log7 = createLogger("daemon");
  DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
});

// src/lib/domain-modes.ts
function defaultFile() {
  return import_path7.default.join(getDataDir(), "domain-modes.json");
}

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
var import_fs8, import_path7, log8, TTL_DAYS = 14, ESCALATION_LADDER;
var init_domain_modes = __esm(() => {
  init_logger();
  init_paths();
  import_fs8 = __toESM(require("fs"));
  import_path7 = __toESM(require("path"));
  log8 = createLogger("domain-modes");
  ESCALATION_LADDER = ["headless", "docker-headful", "binary-headful"];
});

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
var init_config = __esm(() => {
  init_daemon();
});

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
var mousePositions;
var init_humanize = __esm(() => {
  init_constants();
  mousePositions = new WeakMap;
});

// src/lib/actions/resolve-selector.ts
function resolveSelector(selector, ctx) {
  if (selector.startsWith("@a:")) {
    const name = selector.slice(3);
    const anchor = ctx.anchors?.get(name);
    if (!anchor) {
      const available = ctx.anchors ? Array.from(ctx.anchors.keys()).join(", ") : "";
      throw new Error(`Unknown anchor: @a:${name}${ctx.anchorDomain ? ` for ${ctx.anchorDomain}` : ""}. ` + `${available ? `Known anchors: ${available}. ` : "This domain has no saved anchors yet. "}` + `Run a snapshot/find to locate the element, act on it, then save it with the ` + `\`remember\` tool so future runs skip the search.`);
    }
    return anchor.selector;
  }
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
function anchorNameOf(selector) {
  return typeof selector === "string" && selector.startsWith("@a:") ? selector.slice(3) : null;
}

// src/lib/actions/handlers/navigation.ts
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
async function scroll(page, step, ctx) {
  const selector = step.selector ? resolveSelector(step.selector, ctx) : null;
  await page.evaluate(({ dy, sel }) => {
    if (sel) {
      const el = document.querySelector(sel);
      if (!el)
        throw new Error(`scroll: no element for selector ${sel}`);
      el.scrollBy(0, dy || el.scrollHeight);
    } else {
      window.scrollBy(0, dy || document.body.scrollHeight);
    }
  }, { dy: step.deltaY ?? 0, sel: selector });
}
async function keyboard(page, step) {
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
    if (!el)
      return null;
    return el.innerText || el.textContent || "";
  }, selector);
  if (raw == null)
    throw new Error(`read: no element for selector ${selector}`);
  const text = raw.replace(/\n{3,}/g, `

`).trim();
  const max = step.maxChars || 6000;
  return { text: text.slice(0, max), truncated: text.length > max };
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
var log9;
var init_navigation = __esm(() => {
  init_stealth();
  init_humanize();
  init_logger();
  init_constants();
  log9 = createLogger("actions");
});

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
var INTERACTIVE_ROLES, INTERACTIVE_TAGS;
var init_snapshot = __esm(() => {
  INTERACTIVE_ROLES = new Set([
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
  INTERACTIVE_TAGS = new Set([
    "input",
    "textarea",
    "select",
    "button",
    "a"
  ]);
});

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
var init_annotate = __esm(() => {
  init_screenshot();
});

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
var init_screenshot2 = __esm(() => {
  init_screenshot();
  init_snapshot();
  init_annotate();
});

// src/lib/captcha/recaptcha.ts
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
var import_sdk, log10, MAX_ROUNDS = 8, MAX_DURATION_MS = 45000, TILE_SETTLE_MS, MODEL = "claude-haiku-4-5-20251001";
var init_recaptcha = __esm(() => {
  init_humanize();
  init_constants();
  init_logger();
  import_sdk = __toESM(require("@anthropic-ai/sdk"));
  log10 = createLogger("captcha-solver");
  TILE_SETTLE_MS = TIMING.TILE_SETTLE;
});

// src/lib/captcha/hcaptcha.ts
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
var import_sdk2, log11, MAX_ROUNDS2 = 8, MAX_DURATION_MS2 = 60000, MODEL2 = "claude-haiku-4-5-20251001";
var init_hcaptcha = __esm(() => {
  init_humanize();
  init_logger();
  import_sdk2 = __toESM(require("@anthropic-ai/sdk"));
  log11 = createLogger("hcaptcha-solver");
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
var log12;
var init_captcha = __esm(() => {
  init_humanize();
  init_recaptcha();
  init_hcaptcha();
  init_logger();
  init_constants();
  log12 = createLogger("actions");
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
var init_form_fill = __esm(() => {
  init_constants();
});

// src/lib/knowledge.ts
var exports_knowledge = {};
__export(exports_knowledge, {
  sanitizeDomain: () => sanitizeDomain,
  readKnowledge: () => readKnowledge,
  parseKnowledge: () => parseKnowledge,
  normalizeDomain: () => normalizeDomain,
  mergeKnowledge: () => mergeKnowledge,
  listKnowledge: () => listKnowledge,
  getKnowledgePath: () => getKnowledgePath,
  getKnowledgeDir: () => getKnowledgeDir,
  domainLookupChain: () => domainLookupChain,
  clearKnowledge: () => clearKnowledge
});
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
function listKnowledge() {
  const dir = getKnowledgeDir();
  let entries = [];
  try {
    entries = import_fs9.default.readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const file of entries) {
    if (!file.endsWith(".md"))
      continue;
    const full = import_path8.default.join(dir, file);
    try {
      const stat = import_fs9.default.statSync(full);
      const raw = import_fs9.default.readFileSync(full, "utf8");
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
      import_fs9.default.unlinkSync(p);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  let removed = 0;
  try {
    const entries = import_fs9.default.readdirSync(dir);
    for (const f of entries) {
      if (f.endsWith(".md")) {
        try {
          import_fs9.default.unlinkSync(import_path8.default.join(dir, f));
          removed++;
        } catch {}
      }
    }
  } catch {}
  return { removed };
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
var import_fs9, import_path8, log13;
var init_knowledge = __esm(() => {
  init_logger();
  init_paths();
  import_fs9 = __toESM(require("fs"));
  import_path8 = __toESM(require("path"));
  log13 = createLogger("knowledge");
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
  if (!blob)
    return null;
  try {
    const credential = JSON.parse(decrypt(blob, credKey));
    return { credential, matchedDomain };
  } catch (err) {
    throw new CredentialDecryptError(matchedDomain, err instanceof Error ? err.message : String(err));
  }
}
var CredentialDecryptError;
var init_credential_resolver = __esm(() => {
  init_crypto();
  init_knowledge();
  CredentialDecryptError = class CredentialDecryptError extends Error {
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
  };
});

// src/lib/actions/handlers/login/selectors.ts
var EMAIL_CANDIDATES, PASSWORD_SELECTOR = 'input[type="password"]:not([disabled]):not([readonly])', OTP_SELECTOR = 'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])', LOGIN_URL_RE, EMAIL_FIRST_SUBMIT_RE, PASSWORD_SUBMIT_RE, EMAIL_FORM_ANCHOR = 'input[type="email"], input[name*="email" i], input[type="text"]', PASSWORD_FORM_ANCHOR;
var init_selectors = __esm(() => {
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
  LOGIN_URL_RE = /\b(login|signin|sign-in|auth|oauth)\b/i;
  EMAIL_FIRST_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next|send.*code|email.*me)\b/i;
  PASSWORD_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;
  PASSWORD_FORM_ANCHOR = PASSWORD_SELECTOR;
});

// src/lib/actions/handlers/login/index.ts
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
var log14;
var init_login = __esm(() => {
  init_humanize();
  init_form_fill();
  init_crypto();
  init_credential_resolver();
  init_knowledge();
  init_logger();
  init_constants();
  init_selectors();
  log14 = createLogger("actions");
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
var init_registry2 = __esm(() => {
  init_navigation();
  init_screenshot2();
  init_captcha();
  init_login();
  registry = {
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
    read,
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
});

// src/lib/stale-monitor.ts
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
var DEFAULT_STALE_TIMEOUT_MS = 20000, StaleStateError;
var init_stale_monitor = __esm(() => {
  init_constants();
  StaleStateError = class StaleStateError extends Error {
    timeoutMs;
    constructor(message, timeoutMs) {
      super(message);
      this.name = "StaleStateError";
      this.timeoutMs = timeoutMs;
    }
  };
});

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
var defaultDetectors;
var init_detector = __esm(() => {
  defaultDetectors = [
    new RecaptchaDetector,
    new HCaptchaDetector,
    new CookieConsentDetector,
    new LoginWallDetector
  ];
});

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
var resolvers;
var init_obstacles = __esm(() => {
  init_detector();
  init_recaptcha();
  init_hcaptcha();
  init_humanize();
  resolvers = [
    new RecaptchaResolver,
    new HCaptchaResolver,
    new CookieConsentResolver
  ];
});

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
var init_page_state = __esm(() => {
  init_screenshot();
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
  getResults() {
    return buildCapturedApi(this.requests);
  }
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
function buildCapturedApi(requests) {
  const byDomain = new Map;
  for (const req of requests) {
    try {
      const host = new URL(req.url).origin;
      if (!byDomain.has(host))
        byDomain.set(host, []);
      byDomain.get(host)?.push(req);
    } catch {}
  }
  const apis = [];
  for (const [baseUrl, domainRequests] of byDomain) {
    const auth = extractAuth(domainRequests);
    const endpointMap = new Map;
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
var SKIP_RESOURCE_TYPES, SKIP_EXTENSIONS, BROWSER_NOISE_HEADERS, AUTH_HEADER_PATTERNS, ID_PATTERNS;
var init_api_capture = __esm(() => {
  SKIP_RESOURCE_TYPES = new Set([
    "stylesheet",
    "image",
    "media",
    "font",
    "manifest",
    "other"
  ]);
  SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i;
  BROWSER_NOISE_HEADERS = new Set([
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
});

// src/lib/browser/tab-tracker.ts
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
var log15;
var init_tab_tracker = __esm(() => {
  init_logger();
  log15 = createLogger("tabs");
});

// src/lib/knowledge/component-map.ts
function anchorsPath(domain) {
  return import_path9.default.join(getKnowledgeDir(), `${sanitizeDomain(domain)}.anchors.json`);
}
function loadComponentMap(domain) {
  const norm = normalizeDomain(domain);
  try {
    const raw = import_fs10.default.readFileSync(anchorsPath(norm), "utf8");
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
  const map = new Map;
  const cm = loadComponentMap(domain);
  for (const [name, a] of Object.entries(cm.anchors))
    map.set(name, a);
  return map;
}
function write(cm) {
  import_fs10.default.mkdirSync(getKnowledgeDir(), { recursive: true });
  import_fs10.default.writeFileSync(anchorsPath(cm.domain), JSON.stringify(cm, null, 2), "utf8");
}
function recordAnchorResult(domain, name, ok, now) {
  try {
    const cm = loadComponentMap(domain);
    const a = cm.anchors[name];
    if (!a)
      return;
    if (ok) {
      a.uses += 1;
      a.lastVerified = now;
    } else {
      a.fails += 1;
    }
    write(cm);
  } catch {}
}
var import_fs10, import_path9;
var init_component_map = __esm(() => {
  init_knowledge();
  import_fs10 = __toESM(require("fs"));
  import_path9 = __toESM(require("path"));
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
    const navStep = pipeline.steps.find((s) => s.type === "navigate");
    try {
      const host = new URL(navStep?.url || safePageUrl(initialPage) || "http://x").hostname;
      if (host && host !== "x") {
        this.ctx.anchors = loadAnchors(host);
        this.ctx.anchorDomain = host;
      }
    } catch {}
    const recordAnchor = (step, ok) => {
      const name = anchorNameOf(step.selector);
      if (name && this.ctx.anchorDomain)
        recordAnchorResult(this.ctx.anchorDomain, name, ok, new Date().toISOString());
    };
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
            message: asError.message,
            pageState,
            suggestion: getSuggestion(errorType, step),
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
var DEFAULT_STALE_TIMEOUT_MS2 = 20000;
var init_pipeline = __esm(() => {
  init_registry2();
  init_stale_monitor();
  init_obstacles();
  init_screenshot();
  init_page_state();
  init_api_capture();
  init_tab_tracker();
  init_constants();
  init_component_map();
});

// src/lib/block-detection.ts
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
var log16;
var init_block_detection = __esm(() => {
  init_constants();
  init_logger();
  log16 = createLogger("block-detection");
});

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
var init_extract_from_run = __esm(() => {
  init_knowledge();
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS((exports2, module2) => {
  var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
  var hasBlob = typeof Blob !== "undefined";
  if (hasBlob)
    BINARY_TYPES.push("blob");
  module2.exports = {
    BINARY_TYPES,
    CLOSE_TIMEOUT: 30000,
    EMPTY_BUFFER: Buffer.alloc(0),
    GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
    hasBlob,
    kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
    kListener: Symbol("kListener"),
    kStatusCode: Symbol("status-code"),
    kWebSocket: Symbol("websocket"),
    NOOP: () => {}
  };
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS((exports2, module2) => {
  var { EMPTY_BUFFER } = require_constants();
  var FastBuffer = Buffer[Symbol.species];
  function concat(list, totalLength) {
    if (list.length === 0)
      return EMPTY_BUFFER;
    if (list.length === 1)
      return list[0];
    const target = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    for (let i = 0;i < list.length; i++) {
      const buf = list[i];
      target.set(buf, offset);
      offset += buf.length;
    }
    if (offset < totalLength) {
      return new FastBuffer(target.buffer, target.byteOffset, offset);
    }
    return target;
  }
  function _mask(source, mask, output, offset, length) {
    for (let i = 0;i < length; i++) {
      output[offset + i] = source[i] ^ mask[i & 3];
    }
  }
  function _unmask(buffer, mask) {
    for (let i = 0;i < buffer.length; i++) {
      buffer[i] ^= mask[i & 3];
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
    if (Buffer.isBuffer(data))
      return data;
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
      const bufferUtil = (()=>{throw new Error("Cannot require module "+"bufferutil");})();
      module2.exports.mask = function(source, mask, output, offset, length) {
        if (length < 48)
          _mask(source, mask, output, offset, length);
        else
          bufferUtil.mask(source, mask, output, offset, length);
      };
      module2.exports.unmask = function(buffer, mask) {
        if (buffer.length < 32)
          _unmask(buffer, mask);
        else
          bufferUtil.unmask(buffer, mask);
      };
    } catch (e) {}
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS((exports2, module2) => {
  var kDone = Symbol("kDone");
  var kRun = Symbol("kRun");

  class Limiter {
    constructor(concurrency) {
      this[kDone] = () => {
        this.pending--;
        this[kRun]();
      };
      this.concurrency = concurrency || Infinity;
      this.jobs = [];
      this.pending = 0;
    }
    add(job) {
      this.jobs.push(job);
      this[kRun]();
    }
    [kRun]() {
      if (this.pending === this.concurrency)
        return;
      if (this.jobs.length) {
        const job = this.jobs.shift();
        this.pending++;
        job(this[kDone]);
      }
    }
  }
  module2.exports = Limiter;
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS((exports2, module2) => {
  var zlib = require("zlib");
  var bufferUtil = require_buffer_util();
  var Limiter = require_limiter();
  var { kStatusCode } = require_constants();
  var FastBuffer = Buffer[Symbol.species];
  var TRAILER = Buffer.from([0, 0, 255, 255]);
  var kPerMessageDeflate = Symbol("permessage-deflate");
  var kTotalLength = Symbol("total-length");
  var kCallback = Symbol("callback");
  var kBuffers = Symbol("buffers");
  var kError = Symbol("error");
  var zlibLimiter;

  class PerMessageDeflate {
    constructor(options) {
      this._options = options || {};
      this._threshold = this._options.threshold !== undefined ? this._options.threshold : 1024;
      this._maxPayload = this._options.maxPayload | 0;
      this._isServer = !!this._options.isServer;
      this._deflate = null;
      this._inflate = null;
      this.params = null;
      if (!zlibLimiter) {
        const concurrency = this._options.concurrencyLimit !== undefined ? this._options.concurrencyLimit : 10;
        zlibLimiter = new Limiter(concurrency);
      }
    }
    static get extensionName() {
      return "permessage-deflate";
    }
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
    accept(configurations) {
      configurations = this.normalizeParams(configurations);
      this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
      return this.params;
    }
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
          callback(new Error("The deflate stream was closed while data was being processed"));
        }
      }
    }
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
        throw new Error('Unexpected or invalid parameter "client_max_window_bits"');
      }
      return params;
    }
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
                throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
              }
              value = num;
            } else if (!this._isServer) {
              throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
            }
          } else if (key === "server_max_window_bits") {
            const num = +value;
            if (!Number.isInteger(num) || num < 8 || num > 15) {
              throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
            }
            value = num;
          } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
            if (value !== true) {
              throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
            }
          } else {
            throw new Error(`Unknown parameter "${key}"`);
          }
          params[key] = value;
        });
      });
      return configurations;
    }
    decompress(data, fin, callback) {
      zlibLimiter.add((done) => {
        this._decompress(data, fin, (err, result) => {
          done();
          callback(err, result);
        });
      });
    }
    compress(data, fin, callback) {
      zlibLimiter.add((done) => {
        this._compress(data, fin, (err, result) => {
          done();
          callback(err, result);
        });
      });
    }
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
      if (fin)
        this._inflate.write(TRAILER);
      this._inflate.flush(() => {
        const err = this._inflate[kError];
        if (err) {
          this._inflate.close();
          this._inflate = null;
          callback(err);
          return;
        }
        const data2 = bufferUtil.concat(this._inflate[kBuffers], this._inflate[kTotalLength]);
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
        let data2 = bufferUtil.concat(this._deflate[kBuffers], this._deflate[kTotalLength]);
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
  }
  module2.exports = PerMessageDeflate;
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
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS((exports2, module2) => {
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
  ];
  function isValidStatusCode(code) {
    return code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3000 && code <= 4999;
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
        if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || buf[i] === 237 && (buf[i + 1] & 224) === 160) {
          return false;
        }
        i += 3;
      } else if ((buf[i] & 248) === 240) {
        if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
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
      const isValidUTF8 = (()=>{throw new Error("Cannot require module "+"utf-8-validate");})();
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
      };
    } catch (e) {}
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS((exports2, module2) => {
  var { Writable } = require("stream");
  var PerMessageDeflate = require_permessage_deflate();
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

  class Receiver extends Writable {
    constructor(options = {}) {
      super();
      this._allowSynchronousEvents = options.allowSynchronousEvents !== undefined ? options.allowSynchronousEvents : true;
      this._binaryType = options.binaryType || BINARY_TYPES[0];
      this._extensions = options.extensions || {};
      this._isServer = !!options.isServer;
      this._maxBufferedChunks = options.maxBufferedChunks | 0;
      this._maxFragments = options.maxFragments | 0;
      this._maxPayload = options.maxPayload | 0;
      this._skipUTF8Validation = !!options.skipUTF8Validation;
      this[kWebSocket] = undefined;
      this._bufferedBytes = 0;
      this._buffers = [];
      this._compressed = false;
      this._payloadLength = 0;
      this._mask = undefined;
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
    _write(chunk, encoding, cb) {
      if (this._opcode === 8 && this._state == GET_INFO)
        return cb();
      if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
        cb(this.createError(RangeError, "Too many buffered chunks", false, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS"));
        return;
      }
      this._bufferedBytes += chunk.length;
      this._buffers.push(chunk);
      this.startLoop(cb);
    }
    consume(n) {
      this._bufferedBytes -= n;
      if (n === this._buffers[0].length)
        return this._buffers.shift();
      if (n < this._buffers[0].length) {
        const buf = this._buffers[0];
        this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
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
          this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
        }
        n -= buf.length;
      } while (n > 0);
      return dst;
    }
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
      if (!this._errored)
        cb();
    }
    getInfo(cb) {
      if (this._bufferedBytes < 2) {
        this._loop = false;
        return;
      }
      const buf = this.consume(2);
      if ((buf[0] & 48) !== 0) {
        const error = this.createError(RangeError, "RSV2 and RSV3 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_2_3");
        cb(error);
        return;
      }
      const compressed = (buf[0] & 64) === 64;
      if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
        const error = this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1");
        cb(error);
        return;
      }
      this._fin = (buf[0] & 128) === 128;
      this._opcode = buf[0] & 15;
      this._payloadLength = buf[1] & 127;
      if (this._opcode === 0) {
        if (compressed) {
          const error = this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1");
          cb(error);
          return;
        }
        if (!this._fragmented) {
          const error = this.createError(RangeError, "invalid opcode 0", true, 1002, "WS_ERR_INVALID_OPCODE");
          cb(error);
          return;
        }
        this._opcode = this._fragmented;
      } else if (this._opcode === 1 || this._opcode === 2) {
        if (this._fragmented) {
          const error = this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, "WS_ERR_INVALID_OPCODE");
          cb(error);
          return;
        }
        this._compressed = compressed;
      } else if (this._opcode > 7 && this._opcode < 11) {
        if (!this._fin) {
          const error = this.createError(RangeError, "FIN must be set", true, 1002, "WS_ERR_EXPECTED_FIN");
          cb(error);
          return;
        }
        if (compressed) {
          const error = this.createError(RangeError, "RSV1 must be clear", true, 1002, "WS_ERR_UNEXPECTED_RSV_1");
          cb(error);
          return;
        }
        if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
          const error = this.createError(RangeError, `invalid payload length ${this._payloadLength}`, true, 1002, "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH");
          cb(error);
          return;
        }
      } else {
        const error = this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, "WS_ERR_INVALID_OPCODE");
        cb(error);
        return;
      }
      if (!this._fin && !this._fragmented)
        this._fragmented = this._opcode;
      this._masked = (buf[1] & 128) === 128;
      if (this._isServer) {
        if (!this._masked) {
          const error = this.createError(RangeError, "MASK must be set", true, 1002, "WS_ERR_EXPECTED_MASK");
          cb(error);
          return;
        }
      } else if (this._masked) {
        const error = this.createError(RangeError, "MASK must be clear", true, 1002, "WS_ERR_UNEXPECTED_MASK");
        cb(error);
        return;
      }
      if (this._payloadLength === 126)
        this._state = GET_PAYLOAD_LENGTH_16;
      else if (this._payloadLength === 127)
        this._state = GET_PAYLOAD_LENGTH_64;
      else
        this.haveLength(cb);
    }
    getPayloadLength16(cb) {
      if (this._bufferedBytes < 2) {
        this._loop = false;
        return;
      }
      this._payloadLength = this.consume(2).readUInt16BE(0);
      this.haveLength(cb);
    }
    getPayloadLength64(cb) {
      if (this._bufferedBytes < 8) {
        this._loop = false;
        return;
      }
      const buf = this.consume(8);
      const num = buf.readUInt32BE(0);
      if (num > Math.pow(2, 53 - 32) - 1) {
        const error = this.createError(RangeError, "Unsupported WebSocket frame: payload length > 2^53 - 1", false, 1009, "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH");
        cb(error);
        return;
      }
      this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
      this.haveLength(cb);
    }
    haveLength(cb) {
      if (this._payloadLength && this._opcode < 8) {
        this._totalPayloadLength += this._payloadLength;
        if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
          const error = this.createError(RangeError, "Max payload size exceeded", false, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");
          cb(error);
          return;
        }
      }
      if (this._masked)
        this._state = GET_MASK;
      else
        this._state = GET_DATA;
    }
    getMask() {
      if (this._bufferedBytes < 4) {
        this._loop = false;
        return;
      }
      this._mask = this.consume(4);
      this._state = GET_DATA;
    }
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
        const error = this.createError(RangeError, "Too many message fragments", false, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS");
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
    decompress(data, cb) {
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
      perMessageDeflate.decompress(data, this._fin, (err, buf) => {
        if (err)
          return cb(err);
        if (buf.length) {
          this._messageLength += buf.length;
          if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(RangeError, "Max payload size exceeded", false, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");
            cb(error);
            return;
          }
          this._fragments.push(buf);
        }
        this.dataMessage(cb);
        if (this._state === GET_INFO)
          this.startLoop(cb);
      });
    }
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
          const error = this.createError(Error, "invalid UTF-8 sequence", true, 1007, "WS_ERR_INVALID_UTF8");
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
    controlMessage(data, cb) {
      if (this._opcode === 8) {
        if (data.length === 0) {
          this._loop = false;
          this.emit("conclude", 1005, EMPTY_BUFFER);
          this.end();
        } else {
          const code = data.readUInt16BE(0);
          if (!isValidStatusCode(code)) {
            const error = this.createError(RangeError, `invalid status code ${code}`, true, 1002, "WS_ERR_INVALID_CLOSE_CODE");
            cb(error);
            return;
          }
          const buf = new FastBuffer(data.buffer, data.byteOffset + 2, data.length - 2);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(Error, "invalid UTF-8 sequence", true, 1007, "WS_ERR_INVALID_UTF8");
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
    createError(ErrorCtor, message, prefix, statusCode, errorCode) {
      this._loop = false;
      this._errored = true;
      const err = new ErrorCtor(prefix ? `Invalid WebSocket frame: ${message}` : message);
      Error.captureStackTrace(err, this.createError);
      err.code = errorCode;
      err[kStatusCode] = statusCode;
      return err;
    }
  }
  module2.exports = Receiver;
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS((exports2, module2) => {
  var { Duplex } = require("stream");
  var { randomFillSync } = require("crypto");
  var {
    types: { isUint8Array }
  } = require("util");
  var PerMessageDeflate = require_permessage_deflate();
  var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
  var { isBlob, isValidStatusCode } = require_validation();
  var { mask: applyMask, toBuffer } = require_buffer_util();
  var kByteLength = Symbol("kByteLength");
  var maskBuffer = Buffer.alloc(4);
  var RANDOM_POOL_SIZE = 8 * 1024;
  var randomPool;
  var randomPoolPointer = RANDOM_POOL_SIZE;
  var DEFAULT = 0;
  var DEFLATING = 1;
  var GET_BLOB_DATA = 2;

  class Sender {
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
      this[kWebSocket] = undefined;
    }
    static frame(data, options) {
      let mask;
      let merge = false;
      let offset = 2;
      let skipMasking = false;
      if (options.mask) {
        mask = options.maskBuffer || maskBuffer;
        if (options.generateMask) {
          options.generateMask(mask);
        } else {
          if (randomPoolPointer === RANDOM_POOL_SIZE) {
            if (randomPool === undefined) {
              randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
            }
            randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
            randomPoolPointer = 0;
          }
          mask[0] = randomPool[randomPoolPointer++];
          mask[1] = randomPool[randomPoolPointer++];
          mask[2] = randomPool[randomPoolPointer++];
          mask[3] = randomPool[randomPoolPointer++];
        }
        skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
        offset = 6;
      }
      let dataLength;
      if (typeof data === "string") {
        if ((!options.mask || skipMasking) && options[kByteLength] !== undefined) {
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
      if (options.rsv1)
        target[0] |= 64;
      target[1] = payloadLength;
      if (payloadLength === 126) {
        target.writeUInt16BE(dataLength, 2);
      } else if (payloadLength === 127) {
        target[2] = target[3] = 0;
        target.writeUIntBE(dataLength, 4, 6);
      }
      if (!options.mask)
        return [target, data];
      target[1] |= 128;
      target[offset - 4] = mask[0];
      target[offset - 3] = mask[1];
      target[offset - 2] = mask[2];
      target[offset - 1] = mask[3];
      if (skipMasking)
        return [target, data];
      if (merge) {
        applyMask(data, mask, target, offset, dataLength);
        return [target];
      }
      applyMask(data, mask, data, 0, dataLength);
      return [target, data];
    }
    close(code, data, mask, cb) {
      let buf;
      if (code === undefined) {
        buf = EMPTY_BUFFER;
      } else if (typeof code !== "number" || !isValidStatusCode(code)) {
        throw new TypeError("First argument must be a valid error code number");
      } else if (data === undefined || !data.length) {
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
        mask,
        maskBuffer: this._maskBuffer,
        opcode: 8,
        readOnly: false,
        rsv1: false
      };
      if (this._state !== DEFAULT) {
        this.enqueue([this.dispatch, buf, false, options, cb]);
      } else {
        this.sendFrame(Sender.frame(buf, options), cb);
      }
    }
    ping(data, mask, cb) {
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
        mask,
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
        this.sendFrame(Sender.frame(data, options), cb);
      }
    }
    pong(data, mask, cb) {
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
        mask,
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
        this.sendFrame(Sender.frame(data, options), cb);
      }
    }
    send(data, options, cb) {
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
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
      if (options.fin)
        this._firstFragment = true;
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
    getBlobData(blob, compress, options, cb) {
      this._bufferedBytes += options[kByteLength];
      this._state = GET_BLOB_DATA;
      blob.arrayBuffer().then((arrayBuffer) => {
        if (this._socket.destroyed) {
          const err = new Error("The socket was closed while the blob was being read");
          process.nextTick(callCallbacks, this, err, cb);
          return;
        }
        this._bufferedBytes -= options[kByteLength];
        const data = toBuffer(arrayBuffer);
        if (!compress) {
          this._state = DEFAULT;
          this.sendFrame(Sender.frame(data, options), cb);
          this.dequeue();
        } else {
          this.dispatch(data, compress, options, cb);
        }
      }).catch((err) => {
        process.nextTick(onError, this, err, cb);
      });
    }
    dispatch(data, compress, options, cb) {
      if (!compress) {
        this.sendFrame(Sender.frame(data, options), cb);
        return;
      }
      const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
      this._bufferedBytes += options[kByteLength];
      this._state = DEFLATING;
      perMessageDeflate.compress(data, options.fin, (_, buf) => {
        if (this._socket.destroyed) {
          const err = new Error("The socket was closed while data was being compressed");
          callCallbacks(this, err, cb);
          return;
        }
        this._bufferedBytes -= options[kByteLength];
        this._state = DEFAULT;
        options.readOnly = false;
        this.sendFrame(Sender.frame(buf, options), cb);
        this.dequeue();
      });
    }
    dequeue() {
      while (this._state === DEFAULT && this._queue.length) {
        const params = this._queue.shift();
        this._bufferedBytes -= params[3][kByteLength];
        Reflect.apply(params[0], this, params.slice(1));
      }
    }
    enqueue(params) {
      this._bufferedBytes += params[3][kByteLength];
      this._queue.push(params);
    }
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
  }
  module2.exports = Sender;
  function callCallbacks(sender, err, cb) {
    if (typeof cb === "function")
      cb(err);
    for (let i = 0;i < sender._queue.length; i++) {
      const params = sender._queue[i];
      const callback = params[params.length - 1];
      if (typeof callback === "function")
        callback(err);
    }
  }
  function onError(sender, err, cb) {
    callCallbacks(sender, err, cb);
    sender.onerror(err);
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS((exports2, module2) => {
  var { kForOnEventAttribute, kListener } = require_constants();
  var kCode = Symbol("kCode");
  var kData = Symbol("kData");
  var kError = Symbol("kError");
  var kMessage = Symbol("kMessage");
  var kReason = Symbol("kReason");
  var kTarget = Symbol("kTarget");
  var kType = Symbol("kType");
  var kWasClean = Symbol("kWasClean");

  class Event2 {
    constructor(type) {
      this[kTarget] = null;
      this[kType] = type;
    }
    get target() {
      return this[kTarget];
    }
    get type() {
      return this[kType];
    }
  }
  Object.defineProperty(Event2.prototype, "target", { enumerable: true });
  Object.defineProperty(Event2.prototype, "type", { enumerable: true });

  class CloseEvent extends Event2 {
    constructor(type, options = {}) {
      super(type);
      this[kCode] = options.code === undefined ? 0 : options.code;
      this[kReason] = options.reason === undefined ? "" : options.reason;
      this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
    }
    get code() {
      return this[kCode];
    }
    get reason() {
      return this[kReason];
    }
    get wasClean() {
      return this[kWasClean];
    }
  }
  Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
  Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
  Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });

  class ErrorEvent extends Event2 {
    constructor(type, options = {}) {
      super(type);
      this[kError] = options.error === undefined ? null : options.error;
      this[kMessage] = options.message === undefined ? "" : options.message;
    }
    get error() {
      return this[kError];
    }
    get message() {
      return this[kMessage];
    }
  }
  Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
  Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });

  class MessageEvent extends Event2 {
    constructor(type, options = {}) {
      super(type);
      this[kData] = options.data === undefined ? null : options.data;
    }
    get data() {
      return this[kData];
    }
  }
  Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
  var EventTarget = {
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
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS((exports2, module2) => {
  var { tokenChars } = require_validation();
  function push(dest, name, elem) {
    if (dest[name] === undefined)
      dest[name] = [elem];
    else
      dest[name].push(elem);
  }
  function parse(header) {
    const offers = Object.create(null);
    let params = Object.create(null);
    let mustUnescape = false;
    let isEscaping = false;
    let inQuotes = false;
    let extensionName;
    let paramName;
    let start = -1;
    let code = -1;
    let end = -1;
    let i = 0;
    for (;i < header.length; i++) {
      code = header.charCodeAt(i);
      if (extensionName === undefined) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1)
            end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1)
            end = i;
          const name = header.slice(start, end);
          if (code === 44) {
            push(offers, name, params);
            params = Object.create(null);
          } else {
            extensionName = name;
          }
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      } else if (paramName === undefined) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i;
        } else if (code === 32 || code === 9) {
          if (end === -1 && start !== -1)
            end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1)
            end = i;
          push(params, header.slice(start, end), true);
          if (code === 44) {
            push(offers, extensionName, params);
            params = Object.create(null);
            extensionName = undefined;
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
          if (start === -1)
            start = i;
          else if (!mustUnescape)
            mustUnescape = true;
          isEscaping = false;
        } else if (inQuotes) {
          if (tokenChars[code] === 1) {
            if (start === -1)
              start = i;
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
          if (start === -1)
            start = i;
        } else if (start !== -1 && (code === 32 || code === 9)) {
          if (end === -1)
            end = i;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1)
            end = i;
          let value = header.slice(start, end);
          if (mustUnescape) {
            value = value.replace(/\\/g, "");
            mustUnescape = false;
          }
          push(params, paramName, value);
          if (code === 44) {
            push(offers, extensionName, params);
            params = Object.create(null);
            extensionName = undefined;
          }
          paramName = undefined;
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
    }
    if (start === -1 || inQuotes || code === 32 || code === 9) {
      throw new SyntaxError("Unexpected end of input");
    }
    if (end === -1)
      end = i;
    const token = header.slice(start, end);
    if (extensionName === undefined) {
      push(offers, token, params);
    } else {
      if (paramName === undefined) {
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
    return Object.keys(extensions).map((extension) => {
      let configurations = extensions[extension];
      if (!Array.isArray(configurations))
        configurations = [configurations];
      return configurations.map((params) => {
        return [extension].concat(Object.keys(params).map((k) => {
          let values = params[k];
          if (!Array.isArray(values))
            values = [values];
          return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
        })).join("; ");
      }).join(", ");
    }).join(", ");
  }
  module2.exports = { format, parse };
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS((exports2, module2) => {
  var EventEmitter = require("events");
  var https = require("https");
  var http = require("http");
  var net = require("net");
  var tls = require("tls");
  var { randomBytes, createHash } = require("crypto");
  var { Duplex, Readable } = require("stream");
  var { URL: URL2 } = require("url");
  var PerMessageDeflate = require_permessage_deflate();
  var Receiver = require_receiver();
  var Sender = require_sender();
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
  var kAborted = Symbol("kAborted");
  var protocolVersions = [8, 13];
  var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
  var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

  class WebSocket extends EventEmitter {
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
      this._readyState = WebSocket.CONNECTING;
      this._receiver = null;
      this._sender = null;
      this._socket = null;
      if (address !== null) {
        this._bufferedAmount = 0;
        this._isServer = false;
        this._redirects = 0;
        if (protocols === undefined) {
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
    get binaryType() {
      return this._binaryType;
    }
    set binaryType(type) {
      if (!BINARY_TYPES.includes(type))
        return;
      this._binaryType = type;
      if (this._receiver)
        this._receiver._binaryType = type;
    }
    get bufferedAmount() {
      if (!this._socket)
        return this._bufferedAmount;
      return this._socket._writableState.length + this._sender._bufferedBytes;
    }
    get extensions() {
      return Object.keys(this._extensions).join();
    }
    get isPaused() {
      return this._paused;
    }
    get onclose() {
      return null;
    }
    get onerror() {
      return null;
    }
    get onopen() {
      return null;
    }
    get onmessage() {
      return null;
    }
    get protocol() {
      return this._protocol;
    }
    get readyState() {
      return this._readyState;
    }
    get url() {
      return this._url;
    }
    setSocket(socket, head, options) {
      const receiver = new Receiver({
        allowSynchronousEvents: options.allowSynchronousEvents,
        binaryType: this.binaryType,
        extensions: this._extensions,
        isServer: this._isServer,
        maxBufferedChunks: options.maxBufferedChunks,
        maxFragments: options.maxFragments,
        maxPayload: options.maxPayload,
        skipUTF8Validation: options.skipUTF8Validation
      });
      const sender = new Sender(socket, this._extensions, options.generateMask);
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
      if (socket.setTimeout)
        socket.setTimeout(0);
      if (socket.setNoDelay)
        socket.setNoDelay();
      if (head.length > 0)
        socket.unshift(head);
      socket.on("close", socketOnClose);
      socket.on("data", socketOnData);
      socket.on("end", socketOnEnd);
      socket.on("error", socketOnError);
      this._readyState = WebSocket.OPEN;
      this.emit("open");
    }
    emitClose() {
      if (!this._socket) {
        this._readyState = WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
        return;
      }
      if (this._extensions[PerMessageDeflate.extensionName]) {
        this._extensions[PerMessageDeflate.extensionName].cleanup();
      }
      this._receiver.removeAllListeners();
      this._readyState = WebSocket.CLOSED;
      this.emit("close", this._closeCode, this._closeMessage);
    }
    close(code, data) {
      if (this.readyState === WebSocket.CLOSED)
        return;
      if (this.readyState === WebSocket.CONNECTING) {
        const msg = "WebSocket was closed before the connection was established";
        abortHandshake(this, this._req, msg);
        return;
      }
      if (this.readyState === WebSocket.CLOSING) {
        if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
          this._socket.end();
        }
        return;
      }
      this._readyState = WebSocket.CLOSING;
      this._sender.close(code, data, !this._isServer, (err) => {
        if (err)
          return;
        this._closeFrameSent = true;
        if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
          this._socket.end();
        }
      });
      setCloseTimer(this);
    }
    pause() {
      if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) {
        return;
      }
      this._paused = true;
      this._socket.pause();
    }
    ping(data, mask, cb) {
      if (this.readyState === WebSocket.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof data === "function") {
        cb = data;
        data = mask = undefined;
      } else if (typeof mask === "function") {
        cb = mask;
        mask = undefined;
      }
      if (typeof data === "number")
        data = data.toString();
      if (this.readyState !== WebSocket.OPEN) {
        sendAfterClose(this, data, cb);
        return;
      }
      if (mask === undefined)
        mask = !this._isServer;
      this._sender.ping(data || EMPTY_BUFFER, mask, cb);
    }
    pong(data, mask, cb) {
      if (this.readyState === WebSocket.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof data === "function") {
        cb = data;
        data = mask = undefined;
      } else if (typeof mask === "function") {
        cb = mask;
        mask = undefined;
      }
      if (typeof data === "number")
        data = data.toString();
      if (this.readyState !== WebSocket.OPEN) {
        sendAfterClose(this, data, cb);
        return;
      }
      if (mask === undefined)
        mask = !this._isServer;
      this._sender.pong(data || EMPTY_BUFFER, mask, cb);
    }
    resume() {
      if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) {
        return;
      }
      this._paused = false;
      if (!this._receiver._writableState.needDrain)
        this._socket.resume();
    }
    send(data, options, cb) {
      if (this.readyState === WebSocket.CONNECTING) {
        throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
      }
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (typeof data === "number")
        data = data.toString();
      if (this.readyState !== WebSocket.OPEN) {
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
      if (!this._extensions[PerMessageDeflate.extensionName]) {
        opts.compress = false;
      }
      this._sender.send(data || EMPTY_BUFFER, opts, cb);
    }
    terminate() {
      if (this.readyState === WebSocket.CLOSED)
        return;
      if (this.readyState === WebSocket.CONNECTING) {
        const msg = "WebSocket was closed before the connection was established";
        abortHandshake(this, this._req, msg);
        return;
      }
      if (this._socket) {
        this._readyState = WebSocket.CLOSING;
        this._socket.destroy();
      }
    }
  }
  Object.defineProperty(WebSocket, "CONNECTING", {
    enumerable: true,
    value: readyStates.indexOf("CONNECTING")
  });
  Object.defineProperty(WebSocket.prototype, "CONNECTING", {
    enumerable: true,
    value: readyStates.indexOf("CONNECTING")
  });
  Object.defineProperty(WebSocket, "OPEN", {
    enumerable: true,
    value: readyStates.indexOf("OPEN")
  });
  Object.defineProperty(WebSocket.prototype, "OPEN", {
    enumerable: true,
    value: readyStates.indexOf("OPEN")
  });
  Object.defineProperty(WebSocket, "CLOSING", {
    enumerable: true,
    value: readyStates.indexOf("CLOSING")
  });
  Object.defineProperty(WebSocket.prototype, "CLOSING", {
    enumerable: true,
    value: readyStates.indexOf("CLOSING")
  });
  Object.defineProperty(WebSocket, "CLOSED", {
    enumerable: true,
    value: readyStates.indexOf("CLOSED")
  });
  Object.defineProperty(WebSocket.prototype, "CLOSED", {
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
    Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
  });
  ["open", "error", "close", "message"].forEach((method) => {
    Object.defineProperty(WebSocket.prototype, `on${method}`, {
      enumerable: true,
      get() {
        for (const listener of this.listeners(method)) {
          if (listener[kForOnEventAttribute])
            return listener[kListener];
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
        if (typeof handler !== "function")
          return;
        this.addEventListener(method, handler, {
          [kForOnEventAttribute]: true
        });
      }
    });
  });
  WebSocket.prototype.addEventListener = addEventListener;
  WebSocket.prototype.removeEventListener = removeEventListener;
  module2.exports = WebSocket;
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
      socketPath: undefined,
      hostname: undefined,
      protocol: undefined,
      timeout: undefined,
      method: "GET",
      host: undefined,
      path: undefined,
      port: undefined
    };
    websocket._autoPong = opts.autoPong;
    websocket._closeTimeout = opts.closeTimeout;
    if (!protocolVersions.includes(opts.protocolVersion)) {
      throw new RangeError(`Unsupported protocol version: ${opts.protocolVersion} ` + `(supported versions: ${protocolVersions.join(", ")})`);
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
      invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", ` + '"http:", "https:", or "ws+unix:"';
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
    const key = randomBytes(16).toString("base64");
    const request = isSecure ? https.request : http.request;
    const protocolSet = new Set;
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
      perMessageDeflate = new PerMessageDeflate({
        ...opts.perMessageDeflate,
        isServer: false,
        maxPayload: opts.maxPayload
      });
      opts.headers["Sec-WebSocket-Extensions"] = format({
        [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
      });
    }
    if (protocols.length) {
      for (const protocol of protocols) {
        if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
          throw new SyntaxError("An invalid or duplicated subprotocol was specified");
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
          if (!isSameHost)
            delete opts.headers.host;
          opts.auth = undefined;
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
      if (req === null || req[kAborted])
        return;
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
        abortHandshake(websocket, req, `Unexpected server response: ${res.statusCode}`);
      }
    });
    req.on("upgrade", (res, socket, head) => {
      websocket.emit("upgrade", res);
      if (websocket.readyState !== WebSocket.CONNECTING)
        return;
      req = websocket._req = null;
      const upgrade = res.headers.upgrade;
      if (upgrade === undefined || upgrade.toLowerCase() !== "websocket") {
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
      if (serverProt !== undefined) {
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
      if (serverProt)
        websocket._protocol = serverProt;
      const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
      if (secWebSocketExtensions !== undefined) {
        if (!perMessageDeflate) {
          const message = "Server sent a Sec-WebSocket-Extensions header but no extension " + "was requested";
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
        if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
          const message = "Server indicated an extension that was not requested";
          abortHandshake(websocket, socket, message);
          return;
        }
        try {
          perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
        } catch (err) {
          const message = "Invalid Sec-WebSocket-Extensions header";
          abortHandshake(websocket, socket, message);
          return;
        }
        websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
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
    websocket._readyState = WebSocket.CLOSING;
    websocket._errorEmitted = true;
    websocket.emit("error", err);
    websocket.emitClose();
  }
  function netConnect(options) {
    options.path = options.socketPath;
    return net.connect(options);
  }
  function tlsConnect(options) {
    options.path = undefined;
    if (!options.servername && options.servername !== "") {
      options.servername = net.isIP(options.host) ? "" : options.host;
    }
    return tls.connect(options);
  }
  function abortHandshake(websocket, stream, message) {
    websocket._readyState = WebSocket.CLOSING;
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
      if (websocket._socket)
        websocket._sender._bufferedBytes += length;
      else
        websocket._bufferedAmount += length;
    }
    if (cb) {
      const err = new Error(`WebSocket is not open: readyState ${websocket.readyState} ` + `(${readyStates[websocket.readyState]})`);
      process.nextTick(cb, err);
    }
  }
  function receiverOnConclude(code, reason) {
    const websocket = this[kWebSocket];
    websocket._closeFrameReceived = true;
    websocket._closeMessage = reason;
    websocket._closeCode = code;
    if (websocket._socket[kWebSocket] === undefined)
      return;
    websocket._socket.removeListener("data", socketOnData);
    process.nextTick(resume, websocket._socket);
    if (code === 1005)
      websocket.close();
    else
      websocket.close(code, reason);
  }
  function receiverOnDrain() {
    const websocket = this[kWebSocket];
    if (!websocket.isPaused)
      websocket._socket.resume();
  }
  function receiverOnError(err) {
    const websocket = this[kWebSocket];
    if (websocket._socket[kWebSocket] !== undefined) {
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
    if (websocket._autoPong)
      websocket.pong(data, !this._isServer, NOOP);
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
    if (websocket.readyState === WebSocket.CLOSED)
      return;
    if (websocket.readyState === WebSocket.OPEN) {
      websocket._readyState = WebSocket.CLOSING;
      setCloseTimer(websocket);
    }
    this._socket.end();
    if (!websocket._errorEmitted) {
      websocket._errorEmitted = true;
      websocket.emit("error", err);
    }
  }
  function setCloseTimer(websocket) {
    websocket._closeTimer = setTimeout(websocket._socket.destroy.bind(websocket._socket), websocket._closeTimeout);
  }
  function socketOnClose() {
    const websocket = this[kWebSocket];
    this.removeListener("close", socketOnClose);
    this.removeListener("data", socketOnData);
    this.removeListener("end", socketOnEnd);
    websocket._readyState = WebSocket.CLOSING;
    if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
      const chunk = this.read(this._readableState.length);
      websocket._receiver.write(chunk);
    }
    websocket._receiver.end();
    this[kWebSocket] = undefined;
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
    websocket._readyState = WebSocket.CLOSING;
    websocket._receiver.end();
    this.end();
  }
  function socketOnError() {
    const websocket = this[kWebSocket];
    this.removeListener("error", socketOnError);
    this.on("error", NOOP);
    if (websocket) {
      websocket._readyState = WebSocket.CLOSING;
      this.destroy();
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS((exports2, module2) => {
  var WebSocket = require_websocket();
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
  function createWebSocketStream(ws, options) {
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
      if (!duplex.push(data))
        ws.pause();
    });
    ws.once("error", function error(err) {
      if (duplex.destroyed)
        return;
      terminateOnDestroy = false;
      duplex.destroy(err);
    });
    ws.once("close", function close() {
      if (duplex.destroyed)
        return;
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
        if (!called)
          callback(err);
        process.nextTick(emitClose, duplex);
      });
      if (terminateOnDestroy)
        ws.terminate();
    };
    duplex._final = function(callback) {
      if (ws.readyState === ws.CONNECTING) {
        ws.once("open", function open() {
          duplex._final(callback);
        });
        return;
      }
      if (ws._socket === null)
        return;
      if (ws._socket._writableState.finished) {
        callback();
        if (duplex._readableState.endEmitted)
          duplex.destroy();
      } else {
        ws._socket.once("finish", function finish() {
          callback();
        });
        ws.close();
      }
    };
    duplex._read = function() {
      if (ws.isPaused)
        ws.resume();
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
  module2.exports = createWebSocketStream;
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS((exports2, module2) => {
  var { tokenChars } = require_validation();
  function parse(header) {
    const protocols = new Set;
    let start = -1;
    let end = -1;
    let i = 0;
    for (i;i < header.length; i++) {
      const code = header.charCodeAt(i);
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1)
          start = i;
      } else if (i !== 0 && (code === 32 || code === 9)) {
        if (end === -1 && start !== -1)
          end = i;
      } else if (code === 44) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (end === -1)
          end = i;
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
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS((exports2, module2) => {
  var EventEmitter = require("events");
  var http = require("http");
  var { Duplex } = require("stream");
  var { createHash } = require("crypto");
  var extension = require_extension();
  var PerMessageDeflate = require_permessage_deflate();
  var subprotocol = require_subprotocol();
  var WebSocket = require_websocket();
  var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
  var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
  var RUNNING = 0;
  var CLOSING = 1;
  var CLOSED = 2;

  class WebSocketServer extends EventEmitter {
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
        server: null,
        host: null,
        path: null,
        port: null,
        WebSocket,
        ...options
      };
      if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
        throw new TypeError('One and only one of the "port", "server", or "noServer" options ' + "must be specified");
      }
      if (options.port != null) {
        this._server = http.createServer((req, res) => {
          const body = http.STATUS_CODES[426];
          res.writeHead(426, {
            "Content-Length": body.length,
            "Content-Type": "text/plain"
          });
          res.end(body);
        });
        this._server.listen(options.port, options.host, options.backlog, callback);
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
      if (options.perMessageDeflate === true)
        options.perMessageDeflate = {};
      if (options.clientTracking) {
        this.clients = new Set;
        this._shouldEmitClose = false;
      }
      this.options = options;
      this._state = RUNNING;
    }
    address() {
      if (this.options.noServer) {
        throw new Error('The server is operating in "noServer" mode');
      }
      if (!this._server)
        return null;
      return this._server.address();
    }
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
      if (cb)
        this.once("close", cb);
      if (this._state === CLOSING)
        return;
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
    shouldHandle(req) {
      if (this.options.path) {
        const index = req.url.indexOf("?");
        const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
        if (pathname !== this.options.path)
          return false;
      }
      return true;
    }
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
      if (upgrade === undefined || upgrade.toLowerCase() !== "websocket") {
        const message = "Invalid Upgrade header";
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
        return;
      }
      if (key === undefined || !keyRegex.test(key)) {
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
      let protocols = new Set;
      if (secWebSocketProtocol !== undefined) {
        try {
          protocols = subprotocol.parse(secWebSocketProtocol);
        } catch (err) {
          const message = "Invalid Sec-WebSocket-Protocol header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
      }
      const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
      const extensions = {};
      if (this.options.perMessageDeflate && secWebSocketExtensions !== undefined) {
        const perMessageDeflate = new PerMessageDeflate({
          ...this.options.perMessageDeflate,
          isServer: true,
          maxPayload: this.options.maxPayload
        });
        try {
          const offers = extension.parse(secWebSocketExtensions);
          if (offers[PerMessageDeflate.extensionName]) {
            perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
            extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
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
            this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
          });
          return;
        }
        if (!this.options.verifyClient(info))
          return abortHandshake(socket, 401);
      }
      this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
    }
    completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
      if (!socket.readable || !socket.writable)
        return socket.destroy();
      if (socket[kWebSocket]) {
        throw new Error("server.handleUpgrade() was called more than once with the same " + "socket, possibly due to a misconfiguration");
      }
      if (this._state > RUNNING)
        return abortHandshake(socket, 503);
      const digest = createHash("sha1").update(key + GUID).digest("base64");
      const headers = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${digest}`
      ];
      const ws = new this.options.WebSocket(null, undefined, this.options);
      if (protocols.size) {
        const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
        if (protocol) {
          headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
          ws._protocol = protocol;
        }
      }
      if (extensions[PerMessageDeflate.extensionName]) {
        const params = extensions[PerMessageDeflate.extensionName].params;
        const value = extension.format({
          [PerMessageDeflate.extensionName]: [params]
        });
        headers.push(`Sec-WebSocket-Extensions: ${value}`);
        ws._extensions = extensions;
      }
      this.emit("headers", headers, req);
      socket.write(headers.concat(`\r
`).join(`\r
`));
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
  }
  module2.exports = WebSocketServer;
  function addListeners(server, map) {
    for (const event of Object.keys(map))
      server.on(event, map[event]);
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
    message = message || http.STATUS_CODES[code];
    headers = {
      Connection: "close",
      "Content-Type": "text/html",
      "Content-Length": Buffer.byteLength(message),
      ...headers
    };
    socket.once("finish", socket.destroy);
    socket.end(`HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join(`\r
`) + `\r
\r
` + message);
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
});

// node_modules/ws/wrapper.mjs
var import_stream, import_extension, import_permessage_deflate, import_receiver, import_sender, import_subprotocol, import_websocket, import_websocket_server;
var init_wrapper = __esm(() => {
  import_stream = __toESM(require_stream(), 1);
  import_extension = __toESM(require_extension(), 1);
  import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
  import_receiver = __toESM(require_receiver(), 1);
  import_sender = __toESM(require_sender(), 1);
  import_subprotocol = __toESM(require_subprotocol(), 1);
  import_websocket = __toESM(require_websocket(), 1);
  import_websocket_server = __toESM(require_websocket_server(), 1);
});

// src/lib/extension/bridge.ts
class ExtensionBridge {
  wss = null;
  clients = new Map;
  pending = new Map;
  nextReqId = 1;
  tabOwner = new Map;
  collidingTabs = new Set;
  cdpListeners = new Map;
  attach(server) {
    if (this.wss)
      return;
    this.wss = new import_websocket_server.default({ server, path: "/extension/ws" });
    this.wss.on("connection", (ws, req) => {
      let expected = "";
      try {
        expected = getLocalToken();
      } catch {
        expected = "";
      }
      if (!expected) {
        ws.close(4001, "unauthorized");
        return;
      }
      const queryToken = new URL(req.url || "", "http://127.0.0.1").searchParams.get("token");
      if (queryToken !== null) {
        if (queryToken !== expected) {
          ws.close(4001, "unauthorized");
          return;
        }
        this.acceptClient(ws);
        return;
      }
      const timer = setTimeout(() => ws.close(4001, "auth timeout"), 3000);
      ws.once("message", (data) => {
        clearTimeout(timer);
        try {
          const m = JSON.parse(data.toString());
          if (m?.type === "auth" && m.token === expected) {
            this.acceptClient(ws);
            return;
          }
        } catch {}
        ws.close(4001, "unauthorized");
      });
    });
  }
  acceptClient(ws) {
    const client = {
      clientId: import_crypto5.default.randomUUID(),
      socket: ws,
      connectedAt: Date.now(),
      tabs: [],
      heartbeat: null
    };
    this.clients.set(client.clientId, client);
    this.startHeartbeat(client);
    ws.on("message", (data) => this.onMessage(client, data));
    ws.on("close", () => this.dropClient(client, "socket closed"));
    ws.on("error", () => {});
  }
  startHeartbeat(client) {
    client.heartbeat = setInterval(() => {
      this.send(client, "ping", {}).catch(() => {});
    }, HEARTBEAT_MS);
    client.heartbeat.unref?.();
  }
  dropClient(client, _reason) {
    if (client.heartbeat)
      clearInterval(client.heartbeat);
    if (this.clients.get(client.clientId) === client) {
      this.clients.delete(client.clientId);
    }
    for (const [tabId, owner] of this.tabOwner) {
      if (owner === client.clientId)
        this.tabOwner.delete(tabId);
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
            } catch {}
          }
        }
      }
      return;
    }
    if (msg.type === "cdp_event") {
      const ev = msg;
      if (typeof ev.tabId === "number") {
        const fn = this.cdpListeners.get(cdpKey(client.clientId, ev.tabId));
        if (fn)
          fn(ev);
      }
      return;
    }
    if (typeof msg.id !== "number")
      return;
    const p = this.pending.get(msg.id);
    if (!p || p.clientId !== client.clientId)
      return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok)
      p.resolve(msg.result);
    else
      p.reject(new Error(msg.error || "Extension reported an error."));
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
  async listTabs() {
    const all = [];
    this.tabOwner.clear();
    this.collidingTabs.clear();
    await Promise.all([...this.clients.values()].map(async (client) => {
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
          if (prev !== undefined && prev !== client.clientId)
            this.collidingTabs.add(t.id);
          this.tabOwner.set(t.id, client.clientId);
        }
        all.push(...tagged);
      } catch {
        client.tabs = [];
      }
    }));
    return { tabs: all, clients: this.status().clients };
  }
  async resolveClient(tabId, clientId) {
    if (clientId) {
      const c = this.clients.get(clientId);
      if (!c)
        throw new Error(`No connected extension with clientId ${clientId}.`);
      return c;
    }
    if (this.clients.size === 0) {
      throw new Error("No iframer extension is connected. Open Chrome, install/enable the iframer " + "extension, and pair it (paste the token, dot goes green).");
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
      throw new Error(`Tab id ${tabId} exists in more than one connected browser (separate browsers ` + `have independent tab-id spaces). Call \`tabs\` and pass the tab's clientId ` + `alongside tabId to pick the right one.`);
    }
    if (owner) {
      const c = this.clients.get(owner);
      if (c)
        return c;
    }
    throw new Error(`Could not determine which browser profile owns tab ${tabId}. Call \`tabs\` to ` + `refresh the list, then pass the tab's clientId alongside tabId.`);
  }
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
    if (!client)
      throw new Error(`CDP: client ${clientId} is gone.`);
    return this.send(client, "cdp_command", { tabId, sessionId, method, params });
  }
  async cdpDetach(clientId, tabId) {
    const client = this.clients.get(clientId);
    if (!client)
      return;
    try {
      await this.send(client, "cdp_detach", { tabId });
    } catch {}
  }
}
function cdpKey(clientId, tabId) {
  return `${clientId}:${tabId}`;
}
var import_crypto5, REQUEST_TIMEOUT_MS = 180000, HEARTBEAT_MS = 15000, extensionBridge;
var init_bridge = __esm(() => {
  init_wrapper();
  init_crypto();
  import_crypto5 = __toESM(require("crypto"));
  extensionBridge = new ExtensionBridge;
});

// src/lib/extension/cdp-relay.ts
class CdpRelay {
  tabId;
  clientId;
  focus;
  httpServer = null;
  wss = null;
  pw = null;
  port = 0;
  path = `/cdp/${import_crypto7.randomUUID()}`;
  tabSessionId = "pw-tab-1";
  targetInfo = null;
  ownerClientId = "";
  listenerRegistered = false;
  constructor(tabId, clientId, focus) {
    this.tabId = tabId;
    this.clientId = clientId;
    this.focus = focus;
  }
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
          res.end(JSON.stringify({
            Browser: "Chrome/iframer-extension",
            "Protocol-Version": "1.3",
            "User-Agent": "iframer-cdp-relay/1.0",
            "V8-Version": "",
            "WebKit-Version": "",
            webSocketDebuggerUrl: `ws://127.0.0.1:${this.port}${this.path}`
          }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      this.httpServer.on("upgrade", (req) => {
        if (process.env.IFRAMER_RELAY_DEBUG)
          log17.info(`[relay] upgrade request url=${req.url}`);
      });
      this.wss = new import_websocket_server.default({ server: this.httpServer, path: this.path });
      this.wss.on("connection", (ws) => {
        if (process.env.IFRAMER_RELAY_DEBUG)
          log17.info(`[relay] playwright connected`);
        if (this.pw) {
          ws.close(4000, "relay already has a client");
          return;
        }
        this.pw = ws;
        ws.on("message", (data) => this.onPwMessage(data));
        ws.on("close", () => {
          if (this.pw === ws)
            this.pw = null;
        });
        ws.on("error", () => {});
      });
      this.httpServer.on("error", reject);
      this.httpServer.listen(0, "127.0.0.1", () => {
        const addr = this.httpServer.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  }
  cdpEndpoint() {
    return `ws://127.0.0.1:${this.port}${this.path}`;
  }
  httpEndpoint() {
    return `http://127.0.0.1:${this.port}`;
  }
  sendToPw(msg) {
    if (this.pw && this.pw.readyState === import_websocket.default.OPEN) {
      try {
        this.pw.send(JSON.stringify(msg));
      } catch {}
    }
  }
  async onPwMessage(data) {
    if (process.env.IFRAMER_RELAY_DEBUG)
      log17.info(`[relay] raw pw msg (${data?.length ?? 0} bytes): ${data?.toString().slice(0, 120)}`);
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const { id, sessionId, method, params } = msg;
    if (process.env.IFRAMER_RELAY_DEBUG)
      log17.info(`[relay] pw→ ${method} (id=${id}, sess=${sessionId || "-"})`);
    if (!method)
      return;
    try {
      const result = await this.handleCdpCommand(method, params, sessionId);
      if (typeof id === "number")
        this.sendToPw({ id, sessionId, result });
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
      case "Target.getTargetInfo":
        if (!sessionId)
          return { targetInfo: this.targetInfo };
        break;
    }
    const realSessionId = sessionId === this.tabSessionId ? undefined : sessionId;
    if (method === "Page.captureScreenshot") {
      return this.captureScreenshotWithFallback(params, realSessionId);
    }
    return extensionBridge.cdpCommand(this.ownerClientId, this.tabId, realSessionId, method, params);
  }
  async captureScreenshotWithFallback(params, sessionId) {
    const base = params && typeof params === "object" ? { ...params } : {};
    const attempt = (p) => extensionBridge.cdpCommand(this.ownerClientId, this.tabId, sessionId, "Page.captureScreenshot", p);
    const first = attempt(base);
    first.catch(() => {
      return;
    });
    try {
      return await Promise.race([
        first,
        new Promise((_, reject) => {
          const t = setTimeout(() => reject(new Error("screenshot timed out (no compositor frame)")), 1e4);
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
        } catch {}
      });
    } catch {}
    try {
      this.pw?.terminate();
    } catch {}
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
      setTimeout(finish, 1000).unref?.();
    });
    if (this.wss)
      await withTimeout((cb) => this.wss.close(cb));
    if (this.httpServer)
      await withTimeout((cb) => this.httpServer.close(cb));
    this.wss = null;
    this.httpServer = null;
    if (ownedTab) {
      try {
        await extensionBridge.cdpDetach(this.ownerClientId, this.tabId);
      } catch (e) {
        log17.warn(`cdp detach failed: ${e}`);
      }
    }
  }
}
var import_http, import_crypto7, log17;
var init_cdp_relay = __esm(() => {
  init_wrapper();
  init_bridge();
  init_logger();
  import_http = __toESM(require("http"));
  import_crypto7 = require("crypto");
  log17 = createLogger("cdp-relay");
});

// src/lib/execution/pipeline-executor.ts
class PipelineExecutor {
  deps;
  pendingElicitOtp;
  extensionTabLocks = new Map;
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
    if (typeof opts.extensionTabId === "number") {
      const tabId = opts.extensionTabId;
      const lockKey = `${opts.clientId || "auto"}:${tabId}`;
      const prev = this.extensionTabLocks.get(lockKey);
      const run = (prev ? prev.catch(() => {
        return;
      }) : Promise.resolve()).then(() => this.executeExtension(userId, token, pipeline, tabId, opts.clientId));
      this.extensionTabLocks.set(lockKey, run);
      run.catch(() => {
        return;
      }).finally(() => {
        if (this.extensionTabLocks.get(lockKey) === run)
          this.extensionTabLocks.delete(lockKey);
      });
      return run;
    }
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
        log18.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);
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
            log18.info(`Auto-escalating from ${nextMode} to ${thirdMode} for ${domain}`);
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
  async executeExtension(userId, token, pipeline, tabId, clientId) {
    const startTime = Date.now();
    const relay = new CdpRelay(tabId, clientId, pipeline.options?.focus);
    let browser;
    try {
      await relay.start();
      browser = await import_playwright_core.chromium.connectOverCDP(relay.httpEndpoint(), { timeout: 30000 });
      const context = browser.contexts()[0];
      if (!context)
        throw new Error("no CDP browser context for the tab");
      let page = context.pages()[0];
      if (!page) {
        page = await context.waitForEvent("page", { timeout: 5000 }).catch(() => {
          return;
        });
      }
      if (!page)
        throw new Error("no page available for the tab (is it still open?)");
      const ctx = this.deps.refStore.makeContext(userId, token);
      if (this.pendingElicitOtp)
        ctx.elicitOtp = this.pendingElicitOtp;
      const runner = new PipelineRunner(ctx);
      const capMs = Math.min(60000 + pipeline.steps.length * 15000, 150000);
      let watchdog;
      let result;
      try {
        const runPromise = runner.run(page, pipeline);
        runPromise.catch(() => {
          return;
        });
        result = await Promise.race([
          runPromise,
          new Promise((_, reject) => {
            watchdog = setTimeout(() => reject(new Error(`pipeline exceeded ${Math.round(capMs / 1000)}s — the tab may have stopped ` + `rendering (minimized window?). Un-minimize the Chrome window or retry ` + `with options.focus=true.`)), capMs);
            watchdog.unref?.();
          })
        ]);
      } finally {
        if (watchdog)
          clearTimeout(watchdog);
      }
      this.deps.refStore.sync(userId, ctx);
      result.modeUsed = "extension";
      if (result.ok) {
        try {
          extractKnowledgeFromRun(pipeline, result, null, "extension");
        } catch (e) {
          log18.warn(`knowledge update failed: ${getErrorMessage(e)}`);
        }
      }
      return result;
    } catch (err) {
      const msg = getErrorMessage(err);
      const stalled = msg.includes("pipeline exceeded");
      return {
        ok: false,
        completedSteps: 0,
        totalSteps: pipeline.steps.length,
        results: [],
        finalState: { url: "", title: "" },
        obstacles: [],
        durationMs: Date.now() - startTime,
        modeUsed: "extension",
        error: {
          failedAtStep: 0,
          failedStep: pipeline.steps[0],
          errorType: "action-failed",
          message: `Extension mode failed: ${msg}`,
          pageState: { url: "", title: "" },
          suggestion: stalled ? "STOP retrying and tell the user what happened: the Chrome tab being driven stopped " + "responding — its window is likely minimized or the page is wedged. Ask them to " + "un-minimize the Chrome window (leaving it behind other windows is fine), or ask " + "permission to rerun with options.focus=true to bring it to the front." : "Ensure the iframer extension is connected (green dot) and the tab is still open. See chrome://extensions.",
          retryable: !stalled
        }
      };
    } finally {
      try {
        if (browser)
          await browser.close();
      } catch {}
      try {
        await relay.stop();
      } catch {}
    }
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
          log18.warn(`knowledge update failed: ${getErrorMessage(err)}`);
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
var import_playwright_core, log18;
var init_pipeline_executor = __esm(() => {
  init_daemon();
  init_pipeline();
  init_session_manager();
  init_crypto();
  init_block_detection();
  init_extract_from_run();
  init_page_state();
  init_config();
  init_logger();
  init_cdp_relay();
  import_playwright_core = require("playwright-core");
  log18 = createLogger("iframer");
});

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
var init_fetch_service = __esm(() => {
  init_launcher();
  init_stealth();
  init_humanize();
  init_crypto();
  init_constants();
});

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
var init_capture_manager = __esm(() => {
  init_daemon();
  init_api_capture();
});

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
var init_credential_store = __esm(() => {
  init_session_manager();
  init_crypto();
  init_credential_resolver();
  init_knowledge();
  init_humanize();
  init_screenshot();
  init_constants();
});

// src/lib/iframer.ts
var exports_iframer = {};
__export(exports_iframer, {
  Iframer: () => Iframer
});

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
          log19.warn(`stopSession: failed to extract daemon state for ${inst.mode}::${inst.instanceId}: ${getErrorMessage(err)}`);
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
var import_path10, import_url, log19, DEFAULT_SCREENSHOT_DIR, DEFAULT_PUBLIC_URL, DEFAULT_STALE_TIMEOUT_MS3 = 20000;
var init_iframer = __esm(() => {
  init_session_manager();
  init_launcher();
  init_crypto();
  init_screenshot();
  init_storage();
  init_daemon();
  init_domain_modes();
  init_constants();
  init_logger();
  init_config();
  init_pipeline_executor();
  init_fetch_service();
  init_capture_manager();
  init_credential_store();
  import_path10 = __toESM(require("path"));
  import_url = require("url");
  log19 = createLogger("iframer");
  DEFAULT_SCREENSHOT_DIR = import_path10.default.join(import_path10.default.dirname(import_url.fileURLToPath("file:///Users/eduardoverona/tools/iframer-toolkit/src/lib/iframer.ts")), "../../.screenshots");
  DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
});

// bin/cli.js
var __dirname = "/Users/eduardoverona/tools/iframer-toolkit/bin";
var fs11 = require("fs");
var os4 = require("os");
var path11 = require("path");
var { execSync: execSync3 } = require("child_process");
var readline = require("readline");
var HOME_DIR = os4.homedir();
var CONFIG_DIR = process.env.IFRAMER_DATA_DIR || path11.join(HOME_DIR, ".iframer");
var CLAUDE_CONFIG_PATH = path11.join(HOME_DIR, ".claude.json");
var CODEX_CONFIG_PATH = path11.join(HOME_DIR, ".codex", "config.toml");
var DEFAULT_SERVER = process.env.IFRAMER_URL || "http://localhost:3021";
var API_KEY = process.env.IFRAMER_SECRET;
var USE_LOCAL = process.env.IFRAMER_MODE === "local" || !process.env.IFRAMER_URL;
var LOCAL_USER_ID = "iframer-local";
function resolveLocalToken() {
  if (process.env.IFRAMER_SECRET)
    return process.env.IFRAMER_SECRET;
  const candidates = [
    path11.join(CONFIG_DIR, "secret"),
    path11.join(process.env.XDG_RUNTIME_DIR || os4.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = fs11.readFileSync(file, "utf8").trim();
      if (existing)
        return existing;
    } catch {}
  }
  for (const file of candidates) {
    try {
      fs11.mkdirSync(path11.dirname(file), { recursive: true });
      const secret = require("crypto").randomBytes(32).toString("hex");
      fs11.writeFileSync(file, secret, { mode: 384 });
      return secret;
    } catch {}
  }
  throw new Error("iframer: could not read or create a persistent encryption secret in any " + `writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a ` + "stable value shared between the MCP server and CLI (openssl rand -hex 32).");
}
var LOCAL_TOKEN = resolveLocalToken();
function openBrowser(url) {
  try {
    if (process.platform === "darwin")
      execSync3(`open "${url}"`);
    else if (process.platform === "win32")
      execSync3(`start "${url}"`);
    else
      execSync3(`xdg-open "${url}"`);
  } catch {
    console.log(`  Open this URL in your browser:
  ${url}`);
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
      if (char === `
` || char === "\r" || char === "\x04") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write(`
`);
        resolve(input);
      } else if (char === "\x03") {
        process.stdout.write(`
`);
        process.exit(0);
      } else if (char === "" || char === "\b") {
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
  if (API_KEY)
    headers["x-api-key"] = API_KEY;
  return headers;
}
async function apiPost(endpoint, body) {
  const res = await fetch(`${DEFAULT_SERVER}${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000)
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
  const mcpServerTS = path11.join(__dirname, "..", "src", "mcp", "server.ts");
  const mcpServerCJS = path11.join(__dirname, "mcp-server.cjs");
  let bunPath;
  try {
    bunPath = execSync3("which bun", { encoding: "utf8" }).trim();
  } catch {}
  if (bunPath && fs11.existsSync(mcpServerTS)) {
    return {
      command: bunPath,
      args: ["run", mcpServerTS],
      message: "  Using bun to run MCP server from source (no build needed)"
    };
  }
  if (fs11.existsSync(mcpServerCJS)) {
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
  if (secret)
    return secret;
  try {
    const envPath = path11.join(__dirname, "..", ".env");
    const envContent = fs11.readFileSync(envPath, "utf8");
    const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
    if (match)
      secret = match[1].trim();
  } catch {}
  return secret;
}
function installSkill() {
  const candidates = [
    path11.join(__dirname, "..", "skills", "iframer.md"),
    path11.join(__dirname, "skills", "iframer.md")
  ];
  let source = null;
  for (const c of candidates) {
    if (fs11.existsSync(c)) {
      source = c;
      break;
    }
  }
  if (!source)
    return false;
  const destDir = path11.join(HOME_DIR, ".claude", "commands");
  const dest = path11.join(destDir, "iframer.md");
  try {
    fs11.mkdirSync(destDir, { recursive: true });
    fs11.copyFileSync(source, dest);
    return true;
  } catch (err) {
    console.error(`  Warning: could not install skill: ${err.message}`);
    return false;
  }
}
function removeSkill() {
  const dest = path11.join(HOME_DIR, ".claude", "commands", "iframer.md");
  try {
    if (fs11.existsSync(dest)) {
      fs11.unlinkSync(dest);
      return true;
    }
  } catch {}
  return false;
}
function writeMachineSecret(secret) {
  try {
    fs11.mkdirSync(CONFIG_DIR, { recursive: true });
    fs11.writeFileSync(path11.join(CONFIG_DIR, "secret"), secret, { mode: 384 });
    return true;
  } catch (err) {
    console.error(`  Warning: could not write ~/.iframer/secret: ${err.message}`);
    return false;
  }
}
function loadClaudeConfig() {
  try {
    return JSON.parse(fs11.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}
function installClaudeMcp(mcpName, mcpEntry) {
  const config = loadClaudeConfig();
  if (!config.mcpServers)
    config.mcpServers = {};
  config.mcpServers[mcpName] = mcpEntry;
  fs11.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  return CLAUDE_CONFIG_PATH;
}
function removeClaudeMcp(mcpName) {
  let config;
  try {
    config = JSON.parse(fs11.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
  } catch {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }
  if (!config.mcpServers || !config.mcpServers[mcpName]) {
    return { removed: false, path: CLAUDE_CONFIG_PATH };
  }
  delete config.mcpServers[mcpName];
  fs11.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
  return { removed: true, path: CLAUDE_CONFIG_PATH };
}
function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function findCodexMcpSection(content, mcpName) {
  const lines = content.split(`
`);
  const mainHeader = `[mcp_servers.${mcpName}]`;
  const nestedPrefix = `[mcp_servers.${mcpName}.`;
  let start = -1;
  for (let i = 0;i < lines.length; i += 1) {
    if (lines[i].trim() === mainHeader) {
      start = i;
      break;
    }
  }
  if (start === -1)
    return null;
  let end = lines.length;
  for (let i = start + 1;i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith(nestedPrefix)) {
      end = i;
      break;
    }
  }
  let removeStart = start;
  if (removeStart > 0 && lines[removeStart - 1].trim() === "")
    removeStart -= 1;
  let removeEnd = end;
  if (removeEnd < lines.length && lines[removeEnd].trim() === "")
    removeEnd += 1;
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
  return lines.join(`
`);
}
function installCodexMcp(mcpName, mcpEntry) {
  fs11.mkdirSync(path11.dirname(CODEX_CONFIG_PATH), { recursive: true });
  let content = "";
  try {
    content = fs11.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {}
  const existing = findCodexMcpSection(content, mcpName);
  if (existing) {
    content = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join(`
`);
  }
  const trimmed = content.trimEnd();
  const block = renderCodexMcpBlock(mcpName, mcpEntry);
  fs11.writeFileSync(CODEX_CONFIG_PATH, trimmed ? `${trimmed}

${block}
` : `${block}
`);
  return CODEX_CONFIG_PATH;
}
function removeCodexMcp(mcpName) {
  let content;
  try {
    content = fs11.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }
  const existing = findCodexMcpSection(content, mcpName);
  if (!existing) {
    return { removed: false, path: CODEX_CONFIG_PATH };
  }
  const next = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join(`
`).replace(/\n{3,}/g, `

`).trimEnd();
  fs11.writeFileSync(CODEX_CONFIG_PATH, next ? `${next}
` : "");
  return { removed: true, path: CODEX_CONFIG_PATH };
}
var _iframer = null;
async function getLocalIframer() {
  if (_iframer)
    return _iframer;
  try {
    const { Iframer: Iframer2 } = await Promise.resolve().then(() => (init_iframer(), exports_iframer));
    const screenshotDir = path11.join(os4.tmpdir(), "iframer-screenshots");
    fs11.mkdirSync(screenshotDir, { recursive: true });
    _iframer = new Iframer2({
      screenshotDir,
      publicUrl: `file://${screenshotDir}`,
      mode: "local"
    });
    return _iframer;
  } catch (err) {
    console.error(`  Failed to initialize local iframer: ${err.message}`);
    console.error("  Make sure you're running with bun, or use Docker mode (IFRAMER_URL=http://localhost:3021).");
    process.exit(1);
  }
}
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
  if (idx === -1)
    return hasValue ? undefined : false;
  if (!hasValue)
    return true;
  return args[idx + 1];
}
function hasFlag(args, flag) {
  return args.includes(flag);
}
function handleResponse(data, screenshotPath) {
  const { screenshot: screenshot2, tileScreenshots, ...rest } = data;
  if (screenshot2 && screenshotPath) {
    fs11.writeFileSync(screenshotPath, Buffer.from(screenshot2, "base64"));
    rest._screenshotSaved = screenshotPath;
  }
  if (tileScreenshots && tileScreenshots.length > 0) {
    const tileDir = "/tmp/browser-tiles";
    fs11.mkdirSync(tileDir, { recursive: true });
    const tilePaths = [];
    for (const tile of tileScreenshots) {
      if (tile.screenshot) {
        const tilePath = `${tileDir}/tile-${tile.index}.png`;
        fs11.writeFileSync(tilePath, Buffer.from(tile.screenshot, "base64"));
        tilePaths.push(tilePath);
      }
    }
    rest._tilesSaved = tilePaths;
  }
  console.log(JSON.stringify(rest, null, 2));
  if (!data.ok)
    process.exit(1);
}
function printResult(data) {
  console.log(JSON.stringify(data, null, 2));
  if (!data.ok)
    process.exit(1);
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
    if (target === "chromium" || target === "chrome")
      command = "install-chrome";
    else if (target === "mcp")
      command = "install-mcp";
    else if (target === "extension")
      command = "install-extension";
    else if (target === "deps" || target === "dependencies" || target === "all")
      command = "install-all";
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
    if (target === "chromium" || target === "chrome")
      command = "remove-chrome";
    else if (target === "mcp")
      command = "remove-mcp";
    else if (target === "extension")
      command = "remove-extension";
    else {
      console.error(`  Unknown remove target: ${target}`);
      console.error("  Usage: iframer remove <chromium|mcp|extension>");
      process.exit(1);
    }
  }
}
async function installChrome() {
  const { downloadChrome: downloadChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
  await downloadChrome2();
}
function isMcpInstalled(mcpName) {
  try {
    const config = JSON.parse(fs11.readFileSync(CLAUDE_CONFIG_PATH, "utf8"));
    return !!(config.mcpServers && config.mcpServers[mcpName]);
  } catch {
    return false;
  }
}
var EXTENSION_ID = "mjfdkiicioigljhenkgaldhihllfdpll";
var NM_HOST_NAME = "com.iframer.token";
function nativeMessagingBrowserDirs() {
  if (process.platform === "darwin") {
    const as = path11.join(HOME_DIR, "Library", "Application Support");
    return [
      { browser: "Chrome", dir: path11.join(as, "Google", "Chrome"), always: true },
      { browser: "Chrome Beta", dir: path11.join(as, "Google", "Chrome Beta") },
      { browser: "Chrome Canary", dir: path11.join(as, "Google", "Chrome Canary") },
      { browser: "Chromium", dir: path11.join(as, "Chromium") },
      { browser: "Brave", dir: path11.join(as, "BraveSoftware", "Brave-Browser") },
      { browser: "Edge", dir: path11.join(as, "Microsoft Edge") },
      { browser: "Vivaldi", dir: path11.join(as, "Vivaldi") },
      { browser: "Arc", dir: path11.join(as, "Arc", "User Data") }
    ];
  }
  const cfg = process.env.XDG_CONFIG_HOME || path11.join(HOME_DIR, ".config");
  return [
    { browser: "Chrome", dir: path11.join(cfg, "google-chrome"), always: true },
    { browser: "Chrome Beta", dir: path11.join(cfg, "google-chrome-beta") },
    { browser: "Chromium", dir: path11.join(cfg, "chromium") },
    { browser: "Brave", dir: path11.join(cfg, "BraveSoftware", "Brave-Browser") },
    { browser: "Edge", dir: path11.join(cfg, "microsoft-edge") },
    { browser: "Vivaldi", dir: path11.join(cfg, "vivaldi") }
  ];
}
function installExtensionHost() {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    console.error("  Extension auto-pairing is only supported on macOS and Linux.");
    process.exit(1);
  }
  resolveLocalToken();
  const srcHost = path11.join(__dirname, "..", "extension", "native-host.cjs");
  if (!fs11.existsSync(srcHost)) {
    console.error(`  Host script not found: ${srcHost}`);
    process.exit(1);
  }
  fs11.mkdirSync(CONFIG_DIR, { recursive: true });
  const hostScript = path11.join(CONFIG_DIR, "extension-token-host.cjs");
  fs11.copyFileSync(srcHost, hostScript);
  const wrapper = path11.join(CONFIG_DIR, "extension-token-host.sh");
  fs11.writeFileSync(wrapper, [
    "#!/bin/sh",
    `for BIN in "${process.execPath}" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do`,
    `  [ -n "$BIN" ] && [ -x "$BIN" ] && exec "$BIN" "${hostScript}"`,
    "done",
    "exit 1",
    ""
  ].join(`
`), { mode: 493 });
  const manifest = JSON.stringify({
    name: NM_HOST_NAME,
    description: "iframer pairing-token host",
    path: wrapper,
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
  }, null, 2);
  const installed = [];
  for (const { browser, dir, always } of nativeMessagingBrowserDirs()) {
    if (!always && !fs11.existsSync(dir))
      continue;
    try {
      const nmDir = path11.join(dir, "NativeMessagingHosts");
      fs11.mkdirSync(nmDir, { recursive: true });
      fs11.writeFileSync(path11.join(nmDir, `${NM_HOST_NAME}.json`), manifest);
      installed.push(browser);
    } catch (e) {
      console.error(`  ${browser}: failed (${e.message})`);
    }
  }
  return installed;
}
function removeExtensionHost() {
  const removed = [];
  for (const { browser, dir } of nativeMessagingBrowserDirs()) {
    const file = path11.join(dir, "NativeMessagingHosts", `${NM_HOST_NAME}.json`);
    try {
      if (fs11.existsSync(file)) {
        fs11.unlinkSync(file);
        removed.push(browser);
      }
    } catch {}
  }
  for (const f of ["extension-token-host.cjs", "extension-token-host.sh"]) {
    try {
      fs11.unlinkSync(path11.join(CONFIG_DIR, f));
    } catch {}
  }
  return removed;
}
async function removeChrome() {
  const chromeDir = path11.join(CONFIG_DIR, "chrome");
  if (!fs11.existsSync(chromeDir)) {
    console.log("  Chrome for Testing not found, nothing to remove.");
    return;
  }
  fs11.rmSync(chromeDir, { recursive: true, force: true });
  console.log(`  Removed ${chromeDir}`);
}
async function main() {
  switch (command) {
    case "status": {
      const docker = await isDockerRunning();
      console.log(`  Server: ${DEFAULT_SERVER}`);
      console.log(`  Docker API: ${docker ? "running" : "not reachable"}`);
      if (API_KEY)
        console.log("  Auth: IFRAMER_SECRET set");
      try {
        const { findChromeForTesting: findChromeForTesting2, findChrome: findChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
        const cft = findChromeForTesting2();
        const system = findChrome2();
        console.log(`  Chrome for Testing: ${cft ? cft : "not installed"}`);
        if (!cft && system)
          console.log(`  System Chrome: ${system}`);
      } catch {}
      const hasDisplay2 = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;
      console.log(`  Display: ${hasDisplay2 ? "available" : "none ($DISPLAY not set)"}`);
      console.log(`  Modes: headless${hasDisplay2 ? ", binary-headful" : ""}${docker ? ", docker-headful" : ""}`);
      break;
    }
    case "modes": {
      const docker = await isDockerRunning();
      const hasDisplay2 = process.platform === "darwin" || process.platform === "win32" || !!process.env.DISPLAY;
      let chromeInstalled = false;
      try {
        const { findChromeForTesting: findChromeForTesting2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
        chromeInstalled = !!findChromeForTesting2();
      } catch {}
      console.log(`  Available browser modes:
`);
      console.log(`    headless          ${chromeInstalled ? "✓ available" : "✗ Chrome for Testing not installed"}`);
      console.log(`    binary-headful    ${chromeInstalled && hasDisplay2 ? "✓ available" : "✗ " + (!chromeInstalled ? "Chrome not installed" : "no display")}`);
      console.log(`    docker-headful    ${docker ? "✓ available" : "✗ Docker not running at " + DEFAULT_SERVER}`);
      if (!chromeInstalled) {
        console.log(`
  Install Chrome for Testing:`);
        console.log("    iframer install-chrome");
      }
      break;
    }
    case "install-chrome": {
      try {
        await installChrome();
      } catch (err) {
        console.error(`  Failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case "knowledge": {
      const sub = args[0];
      const { readKnowledge: readKnowledge2, listKnowledge: listKnowledge2, clearKnowledge: clearKnowledge2, sanitizeDomain: sanitizeDomain2, getKnowledgeDir: getKnowledgeDir2 } = await Promise.resolve().then(() => (init_knowledge(), exports_knowledge));
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
    case "install-all": {
      console.log(`  Installing iframer-toolkit dependencies...
`);
      console.log("  [1/2] Chrome for Testing");
      let chromeAlreadyInstalled = false;
      try {
        const { findChromeForTesting: findChromeForTesting2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
        chromeAlreadyInstalled = !!findChromeForTesting2();
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
      console.log(`
  [2/2] MCP server registration`);
      const mcpAlreadyInstalled = isMcpInstalled("iframer");
      if (mcpAlreadyInstalled) {
        console.log("  Already installed, skipping.");
        console.log(`
  All dependencies ready.
`);
        break;
      }
      command = "install-mcp";
      return main();
    }
    case "execute": {
      let pipeline;
      const input = args[0];
      if (!input) {
        console.error("  Usage: iframer execute <pipeline.json | inline-json>");
        console.error(`    iframer execute '[{"type":"navigate","url":"https://example.com"},{"type":"screenshot"}]'`);
        console.error("    iframer execute pipeline.json");
        console.error(`
  Options:`);
        console.error("    --mode <headless|binary-headful|docker-headful>");
        console.error("    --capture-api        Record XHR/fetch requests");
        console.error("    --continue-on-error  Don't stop on step failure");
        console.error("    --timeout <ms>       Stale state timeout (default: 20000)");
        process.exit(1);
      }
      let steps;
      if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else if (fs11.existsSync(input)) {
        const parsed = JSON.parse(fs11.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else {
        console.error(`  File not found: ${input}`);
        process.exit(1);
      }
      const options = {};
      const mode = parseFlag(args, "--mode");
      if (mode)
        options.mode = mode;
      if (hasFlag(args, "--capture-api"))
        options.captureApi = true;
      if (hasFlag(args, "--continue-on-error"))
        options.continueOnError = true;
      const timeout = parseFlag(args, "--timeout");
      if (timeout)
        options.staleTimeoutMs = parseInt(timeout);
      const docker = await isDockerRunning();
      let result;
      if (mode === "docker-headful" && docker) {
        result = await apiPost("/execute", { steps, options });
      } else if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options });
      } else {
        result = await apiPost("/execute", { steps, options });
      }
      printResult(result);
      break;
    }
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
      if (extract2)
        options.extract = extract2;
      if (hasFlag(args, "--html"))
        options.returnHtml = true;
      if (hasFlag(args, "--sessionless"))
        options.sessionless = true;
      const waitFor2 = parseFlag(args, "--wait-for");
      if (waitFor2)
        options.waitForSelector = waitFor2;
      const docker = await isDockerRunning();
      let result;
      if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.fetch(LOCAL_USER_ID, LOCAL_TOKEN, options);
      } else {
        result = await apiPost("/fetch", options);
      }
      printResult(result);
      break;
    }
    case "screenshot": {
      const url = args[0];
      const outPath = parseFlag(args, "--output") || parseFlag(args, "-o") || "/tmp/iframer-screenshot.jpg";
      if (url && url.startsWith("http")) {
        const mode = parseFlag(args, "--mode") || "headless";
        const annotate = hasFlag(args, "--annotate");
        const docker = await isDockerRunning();
        const steps = [
          { type: "navigate", url, waitUntil: "networkidle" },
          { type: "wait", ms: 2000 },
          { type: "screenshot", annotate }
        ];
        let result;
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options: { mode } });
        } else {
          result = await apiPost("/execute", { steps, options: { mode } });
        }
        if (result.ok && result.finalState?.screenshotUrl) {
          console.log(`  Screenshot: ${result.finalState.screenshotUrl}`);
          if (annotate) {
            const snapStep = result.results?.find((r) => r.step?.type === "screenshot");
            if (snapStep?.result?.refs) {
              console.log(`
  Refs:`);
              console.log(snapStep.result.refs);
            }
          }
        } else {
          printResult(result);
        }
      } else {
        const res = await fetch(`${DEFAULT_SERVER}/interactive/screenshot?format=raw`, {
          headers: authHeaders()
        });
        if (!res.ok) {
          const data = await res.json();
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        fs11.writeFileSync(outPath, buffer);
        console.log(outPath);
      }
      break;
    }
    case "session": {
      const sub = args[0];
      if (sub === "stop") {
        const docker = await isDockerRunning();
        if (docker) {
          const data = await apiPost("/interactive/stop", null);
          if (!data.ok) {
            console.error(`  Error: ${data.error}`);
            process.exit(1);
          }
          console.log(`  Session stopped. State saved: ${data.sessionSaved}`);
        } else {
          const iframer = await getLocalIframer();
          const result = await iframer.stopSession(LOCAL_USER_ID, LOCAL_TOKEN);
          console.log(`  Session stopped. State saved: ${result.sessionSaved}`);
        }
      } else if (sub === "clear") {
        const docker = await isDockerRunning();
        if (docker) {
          const data = await apiDelete("/session");
          if (!data.ok) {
            console.error(`  Error: ${data.error}`);
            process.exit(1);
          }
        } else {
          const iframer = await getLocalIframer();
          await iframer.clearSession(LOCAL_USER_ID);
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
    case "credentials": {
      const sub = args[0];
      if (sub === "add") {
        let domain = args[1];
        const body = {};
        const hasFlags = args.some((a) => a.startsWith("--"));
        if (hasFlags && domain) {
          body.domain = domain;
          for (let i = 2;i < args.length; i++) {
            if (args[i] === "--username" && args[i + 1])
              body.username = args[++i];
            else if (args[i] === "--password" && args[i + 1])
              body.password = args[++i];
            else if (args[i] === "--totp-secret" && args[i + 1])
              body.totp_secret = args[++i];
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
          if (totp)
            body.totp_secret = totp;
        }
        if (!body.username && !body.password) {
          console.error("  Must provide at least username or password.");
          process.exit(1);
        }
        const docker = await isDockerRunning();
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          await iframer.storeCredential(LOCAL_USER_ID, LOCAL_TOKEN, body);
        } else {
          const data = await apiPost("/credentials", body);
          if (!data.ok) {
            console.error(`  Error: ${data.error}`);
            process.exit(1);
          }
        }
        console.log(`
  Credentials stored for ${domain}`);
      } else if (sub === "list") {
        const docker = await isDockerRunning();
        let domains;
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          domains = await iframer.listCredentials(LOCAL_USER_ID);
        } else {
          const data = await apiGet("/credentials");
          if (!data.ok) {
            console.error(`  Error: ${data.error}`);
            process.exit(1);
          }
          domains = data.domains;
        }
        if (domains.length === 0) {
          console.log("  No credentials stored.");
        } else {
          console.log("  Stored credentials:");
          for (const d of domains)
            console.log(`    - ${d}`);
        }
      } else if (sub === "remove") {
        const domain = args[1];
        if (!domain) {
          console.error("  Usage: iframer credentials remove <domain>");
          process.exit(1);
        }
        const docker = await isDockerRunning();
        if (USE_LOCAL || !docker) {
          const iframer = await getLocalIframer();
          await iframer.deleteCredential(LOCAL_USER_ID, domain);
        } else {
          const data = await apiDelete(`/credentials/${encodeURIComponent(domain)}`);
          if (!data.ok) {
            console.error(`  Error: ${data.error}`);
            process.exit(1);
          }
        }
        console.log(`  Credentials for ${domain} removed.`);
      } else {
        console.error("  Usage: iframer credentials <add|list|remove>");
        process.exit(1);
      }
      break;
    }
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
          { type: "wait", ms: 5000 }
        ];
      } else if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else if (fs11.existsSync(input)) {
        const parsed = JSON.parse(fs11.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
      } else {
        console.error(`  Not a URL or file: ${input}`);
        process.exit(1);
      }
      const options = { captureApi: true };
      const mode = parseFlag(args, "--mode");
      if (mode)
        options.mode = mode;
      const docker = await isDockerRunning();
      let result;
      if (USE_LOCAL || !docker) {
        const iframer = await getLocalIframer();
        result = await iframer.execute(LOCAL_USER_ID, LOCAL_TOKEN, { steps, options });
      } else {
        result = await apiPost("/execute", { steps, options });
      }
      if (result.capturedApi && result.capturedApi.length > 0) {
        const outputDir = parseFlag(args, "--output") || `./${result.capturedApi[0].domain}`;
        fs11.mkdirSync(outputDir, { recursive: true });
        fs11.writeFileSync(path11.join(outputDir, "captured-api.json"), JSON.stringify(result.capturedApi, null, 2));
        console.log(`  Captured ${result.capturedApi.reduce((sum, api) => sum + api.endpoints.length, 0)} endpoints`);
        console.log(`  Saved to: ${outputDir}/captured-api.json`);
        for (const api of result.capturedApi) {
          console.log(`
  ${api.domain} (${api.baseUrl}):`);
          for (const ep of api.endpoints) {
            console.log(`    ${ep.method} ${ep.path} → ${ep.responseStatus}`);
          }
        }
      } else {
        console.log("  No API calls captured.");
        if (!result.ok)
          printResult(result);
      }
      break;
    }
    case "interactive": {
      const sub = args[0];
      if (sub === "stop") {
        const data = await apiPost("/interactive/stop", null);
        if (!data.ok) {
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        console.log("  Interactive session stopped. Session saved.");
      } else if (sub === "status") {
        const data = await apiGet("/interactive/status");
        if (!data.ok) {
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        if (!data.active) {
          console.log("  No active interactive session.");
        } else {
          console.log(`  Active session`);
          console.log(`  noVNC: ${data.noVncUrl}`);
          console.log(`  Started: ${data.createdAt}`);
        }
      } else if (sub) {
        const data = await apiPost("/interactive/start", { url: sub });
        if (!data.ok) {
          console.error(`  Error: ${data.error}`);
          process.exit(1);
        }
        console.log(`
  Interactive session started!`);
        console.log(`  noVNC: ${data.noVncUrl}
`);
        console.log(`  Stop with: iframer interactive stop`);
        openBrowser(data.noVncUrl);
      } else {
        console.error("  Usage: iframer interactive <url|stop|status>");
        process.exit(1);
      }
      break;
    }
    case "watch": {
      console.log(`  Watching for interactive session...
`);
      const poll = async () => {
        try {
          const data = await apiGet("/interactive/status");
          if (data.ok && data.active)
            return data.noVncUrl;
        } catch {}
        return null;
      };
      let vncUrl = await poll();
      if (vncUrl) {
        console.log(`  Session active! Opening noVNC viewer...`);
        console.log(`  ${vncUrl}
`);
        openBrowser(vncUrl);
      }
      let lastUrl = vncUrl;
      const interval = setInterval(async () => {
        const url = await poll();
        if (url && url !== lastUrl) {
          console.log(`  New session detected! Opening noVNC viewer...`);
          console.log(`  ${url}
`);
          openBrowser(url);
        }
        lastUrl = url;
      }, 2000);
      process.on("SIGINT", () => {
        clearInterval(interval);
        console.log(`
  Stopped watching.`);
        process.exit(0);
      });
      await new Promise(() => {});
      break;
    }
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
    case "install-mcp": {
      const runtime = resolveMcpRuntime();
      console.log(runtime.message);
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      let secret = resolveIframerSecret();
      let secretSource = secret ? "env/.env" : null;
      if (!secret) {
        try {
          secret = fs11.readFileSync(path11.join(CONFIG_DIR, "secret"), "utf8").trim();
          if (secret)
            secretSource = "~/.iframer/secret";
        } catch {}
      }
      if (!secret) {
        secret = require("crypto").randomBytes(32).toString("hex");
        secretSource = "generated";
      }
      writeMachineSecret(secret);
      const mcpEntry = { command: runtime.command, args: runtime.args };
      mcpEntry.env = { IFRAMER_SECRET: secret };
      if (!isDev)
        mcpEntry.env.IFRAMER_MODE = "local";
      const claudeConfigPath = installClaudeMcp(mcpName, mcpEntry);
      const codexConfigPath = installCodexMcp(mcpName, mcpEntry);
      const skillInstalled = installSkill();
      console.log(`
  ${mcpName} MCP installed!`);
      console.log(`  Encryption key: ${secretSource} → ~/.iframer/secret`);
      if (!isDev)
        console.log("  Mode: local (headless + binary-headful, no Docker needed)");
      else
        console.log("  Mode: docker (connects to Docker container)");
      console.log(`  Claude Code config written to: ${claudeConfigPath}`);
      console.log(`  Codex config written to: ${codexConfigPath}`);
      if (skillInstalled)
        console.log("  Skill /iframer installed for Claude Code");
      console.log(`  Restart Claude Code and Codex to activate the iframer tools.
`);
      break;
    }
    case "remove-chrome": {
      await removeChrome();
      break;
    }
    case "remove-all": {
      console.log(`  Removing iframer-toolkit dependencies...
`);
      console.log("  [1/2] Chrome for Testing");
      await removeChrome();
      console.log(`
  [2/2] MCP server registration`);
      command = "remove-mcp";
      return main();
    }
    case "telemetry": {
      const file = path11.join(CONFIG_DIR, "telemetry.jsonl");
      if (args.includes("--clear")) {
        try {
          fs11.unlinkSync(file);
        } catch {}
        console.log("  Telemetry log cleared.");
        break;
      }
      let lines;
      try {
        lines = fs11.readFileSync(file, "utf8").trim().split(`
`).filter(Boolean);
      } catch {
        console.log("  No telemetry recorded yet. It logs automatically as agents use iframer");
        console.log("  (new MCP sessions only — restart a session if it predates telemetry).");
        break;
      }
      const sessions2 = new Map;
      for (const line of lines) {
        let r;
        try {
          r = JSON.parse(line);
        } catch {
          continue;
        }
        let s = sessions2.get(r.session);
        if (!s) {
          s = { calls: 0, tokens: 0, defTokens: 0, tools: new Map, first: r.ts, last: r.ts };
          sessions2.set(r.session, s);
        }
        s.last = r.ts;
        if (r.kind === "definitions")
          s.defTokens = r.estTokens || 0;
        else if (r.kind === "call") {
          s.calls++;
          s.tokens += r.estTokens || 0;
          const t = s.tools.get(r.tool) || { calls: 0, tokens: 0 };
          t.calls++;
          t.tokens += r.estTokens || 0;
          s.tools.set(r.tool, t);
        }
      }
      const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      let grandCalls = 0, grandTokens = 0;
      const toolTotals = new Map;
      for (const s of sessions2.values()) {
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
      console.log(`  All time: ${sessions2.size} session(s), ${grandCalls} call(s), ~${fmt(grandTokens)} tokens of tool traffic`);
      console.log(`
  Per tool (all time):`);
      for (const [name, t] of [...toolTotals.entries()].sort((a, b) => b[1].tokens - a[1].tokens)) {
        console.log(`    ${name.padEnd(18)} ${String(t.calls).padStart(4)} calls  ~${fmt(t.tokens).padStart(7)} tokens`);
      }
      console.log(`
  Recent sessions:`);
      const recent = [...sessions2.entries()].slice(-5);
      for (const [id, s] of recent) {
        console.log(`    ${id.padEnd(20)} ${String(s.calls).padStart(4)} calls  ~${fmt(s.tokens).padStart(7)} tokens (+~${fmt(s.defTokens)} definitions overhead, once per session)`);
      }
      console.log(`
  Note: definitions overhead excludes zod schema text — Claude Code's /context`);
      console.log(`  shows the exact per-session definition footprint. Clear log: iframer telemetry --clear
`);
      break;
    }
    case "install-extension": {
      console.log(`  Installing the extension pairing host (native messaging)...
`);
      const installed = installExtensionHost();
      if (installed.length === 0) {
        console.log("  No Chromium-family browser directories found — nothing installed.");
        break;
      }
      console.log(`  Pairing host installed for: ${installed.join(", ")}`);
      console.log(`
  The iframer extension now pairs itself — no token pasting.`);
      console.log("  If the extension is already loaded, quit + reopen the browser (native");
      console.log("  messaging hosts are picked up on browser start), then check the popup dot.");
      console.log(`  Manual pasting in the popup still works as a fallback.
`);
      break;
    }
    case "remove-extension": {
      const removed = removeExtensionHost();
      if (removed.length === 0) {
        console.log("  Extension pairing host was not installed.");
      } else {
        console.log(`  Pairing host removed from: ${removed.join(", ")}`);
      }
      break;
    }
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
      if (claudeResult.removed)
        console.log(`  Claude Code config updated: ${claudeResult.path}`);
      if (codexResult.removed)
        console.log(`  Codex config updated: ${codexResult.path}`);
      if (skillRemoved)
        console.log("  Skill /iframer removed from Claude Code");
      console.log(`  Restart Claude Code and Codex for the change to take effect.
`);
      break;
    }
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
    install                         Install everything (Chromium + MCP)
    install chromium                Download Chrome for Testing
    install mcp [--dev]             Register iframer MCP in Claude Code and Codex
    install extension               Let the browser extension pair itself (no token pasting)
    remove                          Remove everything (Chromium + MCP)
    remove chromium                 Delete downloaded Chrome for Testing
    remove mcp [--dev]              Unregister iframer MCP from Claude Code and Codex
    remove extension                Remove the extension pairing host

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
