#!/usr/bin/env node
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
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
    CHALLENGE_FRAME_WAIT: 5000
  };
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
  const path = generatePath(fromX, fromY, toX, toY);
  for (const point of path) {
    await mouse.move(point.x, point.y);
    await sleep(rand(2, 12));
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
  await sleep(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep(randRange(TIMING.POST_CLICK));
}
async function humanClickXY(page, x, y) {
  await humanMove(page, x, y);
  await sleep(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep(randRange(TIMING.POST_CLICK));
}
async function humanType(page, selector, text) {
  await humanClick(page, selector);
  await sleep(randRange(TIMING.POST_CLICK));
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(randRange(TIMING.CHAR_DELAY));
    if (Math.random() < 0.05) {
      await sleep(randRange(TIMING.WORD_PAUSE));
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
  await sleep(randRange(TIMING.PRE_CHECKBOX_WAIT));
  await humanClickXY(page, checkboxX, checkboxY);
  await sleep(TIMING.POST_CHECKBOX_WAIT);
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
    await sleep(randRange(TIMING.TILE_CLICK_DELAY));
    clicked.push(idx);
  }
  return { clicked, challengeInfo };
}
async function clickChallengeVerify(page) {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo)
    throw new Error("No active reCAPTCHA challenge found");
  await humanClickXY(page, challengeInfo.verifyButton.x, challengeInfo.verifyButton.y);
  await sleep(TIMING.POST_VERIFY_WAIT);
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var mousePositions;
var init_humanize = __esm(() => {
  init_constants();
  mousePositions = new WeakMap;
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
    log.error(`full grid screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
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
        log.debug(`tile ${tile.index} (r${tileRow}c${tileCol}): YES`);
      return { index: tile.index, match };
    } catch (err) {
      log.error(`tile ${tile.index} classification failed: ${err instanceof Error ? err.message : String(err)}`);
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
          log.info(`Submitting form via: ${selector}`);
          await new Promise((r) => setTimeout(r, 500));
          await humanClick(page, selector);
          await new Promise((r) => setTimeout(r, 2000));
          return true;
        }
      }
    } catch {}
  }
  log.info("No submit button found — skipping form submission");
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
    log.info(`Round ${rounds}: looking for "${target}" in ${challengeInfo.rows}x${challengeInfo.cols} grid`);
    const [fullGridImage, tileImages] = await Promise.all([
      screenshotFullGrid(page, challengeInfo),
      screenshotTiles(page, challengeInfo)
    ]);
    if (!fullGridImage || tileImages.length === 0) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }
    monitor?.reportActivity();
    const matchingIndices = await classifyTiles(client, fullGridImage, tileImages, target, challengeInfo.rows, challengeInfo.cols);
    log.info(`Round ${rounds}: matched tiles [${matchingIndices.join(", ")}]`);
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
                log.info(`Round ${rounds}: dynamic tiles matched [${newMatches.join(", ")}]`);
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
      log.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      const submitted = await submitForm(page);
      return { solved: true, rounds, durationMs: Date.now() - startTime, submitted };
    }
    challengeInfo = verifyResult.challengeInfo || null;
    if (!challengeInfo) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Challenge disappeared after verify" };
    }
    log.info(`Round ${rounds}: not solved, new challenge appeared`);
  }
  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS}) exceeded` };
}
var import_sdk, log, MAX_ROUNDS = 8, MAX_DURATION_MS = 45000, TILE_SETTLE_MS, MODEL = "claude-haiku-4-5-20251001";
var init_recaptcha = __esm(() => {
  init_humanize();
  init_constants();
  init_logger();
  import_sdk = __toESM(require("@anthropic-ai/sdk"));
  log = createLogger("captcha-solver");
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
function sleep2(ms) {
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
  await sleep2(rand2(300, 700));
  const cx = box.x + box.width * rand2(0.15, 0.35);
  const cy = box.y + box.height * rand2(0.3, 0.7);
  await humanClickXY(page, cx, cy);
  await sleep2(2500);
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
  log2.info(`Round challenge: "${info.prompt}" (${info.rows}x${info.cols})`);
  return { prompt: info.prompt, rows: info.rows, cols: info.cols, tiles, verifyButton, frameBox };
}
async function screenshotChallenge(page, challenge) {
  const { frameBox } = challenge;
  try {
    await sleep2(1000);
    const challengeEl = await page.$('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]').catch(() => null);
    let buf;
    if (challengeEl) {
      buf = Buffer.from(await challengeEl.screenshot({ type: "jpeg", quality: 85 }));
    } else {
      buf = await page.screenshot({ type: "jpeg", quality: 85, clip: frameBox });
    }
    return buf.toString("base64");
  } catch (err) {
    log2.error(`screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
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
    log2.debug(`classify response: "${text}"`);
    if (text.toLowerCase().startsWith("none"))
      return [];
    return text.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n < total);
  } catch (err) {
    log2.error(`classification failed: ${err instanceof Error ? err.message : String(err)}`);
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
  await sleep2(2500);
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
    log2.info("Solved on checkbox click (no challenge)");
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
      log2.info("Challenge frame gone — assuming solved");
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }
    const screenshotBase64 = await screenshotChallenge(page, challenge);
    if (!screenshotBase64) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }
    monitor?.reportActivity();
    const matchingIndices = await classifyTiles2(client, screenshotBase64, challenge);
    log2.info(`Round ${rounds}: clicking tiles [${matchingIndices.join(", ")}]`);
    monitor?.reportActivity();
    for (const idx of matchingIndices) {
      const tile = challenge.tiles[idx];
      if (!tile)
        continue;
      await humanClickXY(page, tile.centerX + rand2(-5, 5), tile.centerY + rand2(-5, 5));
      await sleep2(rand2(150, 400));
    }
    await sleep2(rand2(500, 1000));
    const solved = await clickVerify(page, challenge);
    monitor?.reportActivity();
    if (solved) {
      log2.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }
    log2.info(`Round ${rounds}: not solved, retrying`);
    await sleep2(rand2(500, 1000));
  }
  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS2}) exceeded` };
}
var import_sdk2, log2, MAX_ROUNDS2 = 8, MAX_DURATION_MS2 = 60000, MODEL2 = "claude-haiku-4-5-20251001";
var init_hcaptcha = __esm(() => {
  init_humanize();
  init_logger();
  import_sdk2 = __toESM(require("@anthropic-ai/sdk"));
  log2 = createLogger("hcaptcha-solver");
});

// src/lib/auth/crypto.ts
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
var import_crypto, SALT = "iframer-session", INFO = "encryption", KEY_LENGTH = 32, IV_LENGTH = 12, TAG_LENGTH = 16;
var init_crypto = __esm(() => {
  import_crypto = __toESM(require("crypto"));
});

// src/lib/screenshot.ts
function saveScreenshot(buffer, filename, screenshotDir, publicUrl) {
  import_fs.default.mkdirSync(screenshotDir, { recursive: true });
  const filePath = import_path.default.join(screenshotDir, filename);
  import_fs.default.writeFileSync(filePath, buffer);
  return `${publicUrl}/screenshots/${filename}`;
}
var import_fs, import_path;
var init_screenshot = __esm(() => {
  import_fs = __toESM(require("fs"));
  import_path = __toESM(require("path"));
});

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
      const path2 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path2.unshift(`#${current.id}`);
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
        path2.unshift(seg);
        current = parent;
      }
      return path2.join(" > ");
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
      const path2 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path2.unshift(`#${current.id}`);
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
        path2.unshift(seg);
        current = parent;
      }
      return path2.join(" > ");
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

// src/lib/actions.ts
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
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
async function handleRecaptchaSolve(page) {
  const solveResult = await clickRecaptchaCheckbox(page);
  if (solveResult.solved)
    return { solved: true };
  const ci = solveResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, prompt: "", tiles: [] };
}
async function handleRecaptchaAnswer(page, tiles) {
  await clickChallengeTiles(page, tiles);
  const verifyResult = await clickChallengeVerify(page);
  if (verifyResult.solved)
    return { solved: true };
  const ci = verifyResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles2(page, ci) };
  }
  return { solved: false, tiles: [] };
}
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
async function handleSolveCaptcha(page, monitor) {
  await page.waitForTimeout(TIMING.CAPTCHA_DETECT_WAIT);
  const isHCaptcha = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll("iframe"));
    return iframes.some((f) => {
      const src = f.src || "";
      const title = (f.title || "").toLowerCase();
      return src.includes("hcaptcha.com") || title.includes("hcaptcha") || !!document.querySelector("[data-hcaptcha-widget-id]");
    });
  }).catch((err) => {
    log3.warn(`captcha detection failed: ${err}`);
    return false;
  });
  log3.info(`detected: ${isHCaptcha ? "hCaptcha" : "reCAPTCHA"}`);
  return isHCaptcha ? await solveHCaptcha(page, monitor) : await solveRecaptcha(page, monitor);
}
async function handleFind(page, step, ctx) {
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
    const path2 = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path2.unshift(`#${current.id}`);
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
      path2.unshift(seg);
      current = parent;
    }
    return { tag, text, selector: path2.join(" > ") };
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
async function handleLogin(page, step, ctx) {
  const credKey = await deriveKey(ctx.token, "credentials");
  const blob = await ctx.store.getCredential(ctx.userId, step.domain);
  if (!blob || blob.length === 0) {
    throw new Error(`No credentials stored for ${step.domain}`);
  }
  const credential = JSON.parse(decrypt(blob, credKey));
  const beforeUrl = page.url();
  const reactFillSelector = async (selector, value) => {
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
    await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
  };
  const hasExplicitSelectors = !!(step.usernameSelector || step.passwordSelector || step.submitSelector);
  if (hasExplicitSelectors) {
    if (step.usernameSelector && credential.username) {
      await reactFillSelector(resolveSelector(step.usernameSelector, ctx), credential.username);
    }
    if (step.passwordSelector && credential.password) {
      await reactFillSelector(resolveSelector(step.passwordSelector, ctx), credential.password);
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
  } else {
    log3.info(`login: auto-detecting form on ${beforeUrl}`);
    const passwordHandle = await page.waitForSelector('input[type="password"]:not([disabled]):not([readonly])', { state: "visible", timeout: TIMEOUTS.SELECTOR_WAIT }).catch(() => null);
    if (!passwordHandle) {
      throw new Error(`login: no visible password field found on ${beforeUrl}. If the site uses a multi-step form, navigate to the actual password page first, or pass explicit selectors.`);
    }
    const usernameHandle = await page.evaluateHandle(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])');
      if (!pwd)
        return null;
      const scope = pwd.closest("form") || document;
      const candidates = [
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
      for (const sel of candidates) {
        const el = scope.querySelector(sel);
        if (el && el.offsetParent !== null)
          return el;
      }
      return null;
    });
    const usernameEl = usernameHandle.asElement();
    const fillHandle = async (handle, value) => {
      await handle.scrollIntoViewIfNeeded().catch(() => {});
      await handle.click({ delay: 40 }).catch(() => {});
      await handle.evaluate((el, val) => {
        const input = el;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, val);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    };
    if (usernameEl && credential.username) {
      await fillHandle(usernameEl, credential.username);
    } else if (!usernameEl) {
      log3.warn("login: no username field detected, proceeding with password only");
    }
    if (credential.password) {
      await fillHandle(passwordHandle, credential.password);
    }
    const submitHandle = await page.evaluateHandle(() => {
      const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])');
      const form = pwd?.closest("form");
      const loginRe = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;
      const pick = (scope) => {
        const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])');
        if (typed)
          return typed;
        const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'));
        return buttons.find((b) => loginRe.test(b.textContent || "") && b.offsetParent !== null) || null;
      };
      if (form) {
        const found = pick(form);
        if (found)
          return found;
      }
      return pick(document);
    });
    const submitEl = submitHandle.asElement();
    if (submitEl) {
      await submitEl.scrollIntoViewIfNeeded().catch(() => {});
      await submitEl.click({ delay: 40 }).catch(async () => {
        await submitEl.evaluate((el) => el.click());
      });
    } else {
      log3.warn("login: no submit button detected, pressing Enter in password field");
      await passwordHandle.press("Enter").catch(() => {});
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await Promise.race([
      page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
      page.waitForSelector('input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])', { state: "visible", timeout: TIMEOUTS.NAVIGATION }).catch(() => null)
    ]);
    if (credential.totp_secret) {
      const totpHandle = await page.$('input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])');
      if (totpHandle) {
        const totp = generateTOTP(credential.totp_secret);
        await totpHandle.scrollIntoViewIfNeeded().catch(() => {});
        await totpHandle.click({ delay: 40 }).catch(() => {});
        await page.keyboard.type(totp, { delay: 60 });
        await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
        const totpSubmit = await page.$('button[type="submit"]:not([disabled])');
        if (totpSubmit) {
          await totpSubmit.click({ delay: 40 }).catch(() => {});
        }
        await page.waitForURL((u) => u.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
      }
    }
    await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
  }
  const afterUrl = page.url();
  const stillHasPasswordField = await page.evaluate(() => {
    const pwd = document.querySelector('input[type="password"]:not([disabled]):not([readonly])');
    return !!(pwd && pwd.offsetParent !== null);
  }).catch(() => false);
  const loggedIn = afterUrl !== beforeUrl && !stillHasPasswordField;
  return { loggedIn, url: afterUrl, changedUrl: afterUrl !== beforeUrl, passwordFieldRemains: stillHasPasswordField };
}
async function executeAction(page, step, ctx, monitor) {
  const start = Date.now();
  const stepIndex = -1;
  try {
    let result = null;
    switch (step.type) {
      case "navigate":
        await page.goto(step.url, {
          waitUntil: step.waitUntil || "domcontentloaded",
          timeout: TIMEOUTS.NAVIGATION
        });
        const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
        try {
          await page.evaluate(stealthScript);
        } catch (err) {
          log3.warn(`stealth injection failed: ${err}`);
        }
        break;
      case "click":
        await page.click(resolveSelector(step.selector, ctx));
        break;
      case "fill":
        await page.fill(resolveSelector(step.selector, ctx), step.value);
        break;
      case "human-click":
        if (step.selector) {
          await humanClick(page, resolveSelector(step.selector, ctx));
        } else if (step.x !== undefined && step.y !== undefined) {
          await humanClickXY(page, step.x, step.y);
        } else {
          throw new Error("human-click requires selector or x/y coordinates");
        }
        break;
      case "right-click":
        if (step.selector) {
          await page.click(resolveSelector(step.selector, ctx), { button: "right" });
        } else if (step.x !== undefined && step.y !== undefined) {
          await page.mouse.click(step.x, step.y, { button: "right" });
        } else {
          throw new Error("right-click requires selector or x/y coordinates");
        }
        break;
      case "human-type":
        await humanType(page, resolveSelector(step.selector, ctx), step.value);
        break;
      case "evaluate":
        result = await page.evaluate(step.expression);
        break;
      case "extract":
        result = await page.evaluate(step.expression);
        break;
      case "wait":
        await page.waitForTimeout(step.ms);
        break;
      case "wait-for":
        await page.waitForSelector(resolveSelector(step.selector, ctx), { timeout: step.timeout || TIMEOUTS.SELECTOR_WAIT });
        break;
      case "scroll":
        await page.evaluate((dy) => window.scrollBy(0, dy || document.body.scrollHeight), step.deltaY ?? 0);
        break;
      case "keyboard":
        await page.keyboard.press(step.key);
        break;
      case "type-code": {
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
        result = { typed: code.length };
        break;
      }
      case "recaptcha-click":
        result = await clickRecaptchaCheckbox(page);
        break;
      case "recaptcha-select":
        result = await clickChallengeTiles(page, step.tiles);
        break;
      case "recaptcha-verify":
        result = await clickChallengeVerify(page);
        break;
      case "recaptcha-info":
        result = await getChallengeInfo(page);
        break;
      case "recaptcha-solve":
        result = await handleRecaptchaSolve(page);
        break;
      case "recaptcha-answer":
        result = await handleRecaptchaAnswer(page, step.tiles);
        break;
      case "solve-captcha":
        result = await handleSolveCaptcha(page, monitor);
        break;
      case "screenshot": {
        if (step.annotate) {
          const annotated = await annotatedScreenshot(page, ctx);
          const refLines = annotated.refs.map((r) => `  ${r.ref} ${r.role} "${r.name}"`).join(`
`);
          result = { screenshotUrl: annotated.screenshotUrl, refs: refLines };
        } else {
          const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
          const url = saveScreenshot(buf, `step-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
          result = { screenshotUrl: url };
        }
        break;
      }
      case "snapshot": {
        const snap = await takeSnapshot(page, ctx, {
          interactiveOnly: step.interactiveOnly,
          maxElements: step.maxElements
        });
        result = { elementCount: snap.nodes.length, snapshot: snap.text };
        break;
      }
      case "find":
        result = await handleFind(page, step, ctx);
        break;
      case "login":
        result = await handleLogin(page, step, ctx);
        break;
      default: {
        const _exhaustive = step;
        throw new Error(`Unknown step type: ${_exhaustive.type}`);
      }
    }
    return {
      stepIndex,
      step,
      ok: true,
      result,
      durationMs: Date.now() - start
    };
  } catch (err) {
    return {
      stepIndex,
      step,
      ok: false,
      error: getErrorMessage(err),
      durationMs: Date.now() - start
    };
  }
}
var log3;
var init_actions = __esm(() => {
  init_stealth();
  init_humanize();
  init_recaptcha();
  init_hcaptcha();
  init_crypto();
  init_screenshot();
  init_snapshot();
  init_annotate();
  init_logger();
  init_constants();
  log3 = createLogger("actions");
});

// src/lib/stale-monitor.ts
class StaleStateMonitor {
  page;
  timeoutMs;
  timer = null;
  lastActivity = Date.now();
  abortController = null;
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
    this.abortController = new AbortController;
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
        this.abortController = null;
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

// src/lib/api-capture.ts
function isAuthHeader(name) {
  return AUTH_HEADER_PATTERNS.some((p) => p.test(name));
}
function isLikelyId(segment) {
  return ID_PATTERNS.some((p) => p.test(segment));
}
function parameterizePath(path2) {
  const parts = path2.split("/");
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
    parts.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
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
  constructor(page) {
    this.page = page;
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
          const postData = req.postData();
          if (postData) {
            requestBody = tryParseJson(postData) ?? postData;
          }
        } catch {}
        let responseBody = undefined;
        try {
          const resText = await res.text();
          if (resText && resText.length < 1e5) {
            responseBody = tryParseJson(resText) ?? resText;
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
  start() {
    this.page.on("request", this.requestHandler);
    this.page.on("response", this.responseHandler);
  }
  setStep(index) {
    this.currentStep = index;
  }
  stop() {
    this.page.off("request", this.requestHandler);
    this.page.off("response", this.responseHandler);
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
        const key = `${req.method} ${paramPath}`;
        const endpointHeaders = this.splitHeaders(req.requestHeaders);
        if (!endpointMap.has(key)) {
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
            curl: buildCurl(req.method, req.url, endpointHeaders, auth, req.requestBody)
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

// src/lib/pipeline.ts
async function getPageState(page, ctx, withScreenshot = false) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  if (!withScreenshot) {
    return { url, title };
  }
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `state-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
}
function classifyError(err, step) {
  if (err instanceof StaleStateError)
    return "stale-state";
  const msg = err.message.toLowerCase();
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
  async run(page, pipeline) {
    const startTime = Date.now();
    const opts = pipeline.options || {};
    const staleTimeoutMs = opts.staleTimeoutMs ?? this.ctx.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS2;
    const continueOnObstacle = opts.continueOnObstacle ?? true;
    const screenshotAfterEach = opts.screenshotAfterEach ?? false;
    const continueOnError = opts.continueOnError ?? false;
    const results = [];
    const obstacles = [];
    const capture = opts.captureApi ? new ApiCapture(page) : null;
    if (capture)
      capture.start();
    const finishCapture = () => {
      if (!capture)
        return;
      capture.stop();
      return capture.getResults();
    };
    for (let i = 0;i < pipeline.steps.length; i++) {
      if (capture)
        capture.setStep(i);
      const step = pipeline.steps[i];
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
        const pageState = await getPageState(page, this.ctx, true);
        stepResult = {
          stepIndex: i,
          step,
          ok: false,
          error: asError.message,
          durationMs: Date.now() - startTime
        };
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
          capturedApi: finishCapture()
        };
      }
      if (screenshotAfterEach && stepResult.ok) {
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
          stepResult.screenshotUrl = saveScreenshot(buf, `step-${i}-${Date.now()}.jpg`, this.ctx.screenshotDir, this.ctx.publicUrl);
        } catch {}
      }
      results.push(stepResult);
      if (!stepResult.ok && !continueOnError) {
        const pageState = await getPageState(page, this.ctx, true);
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
          capturedApi: finishCapture()
        };
      }
      if (step.type === "navigate" && continueOnObstacle) {
        const obstacleStart = Date.now();
        const obstacle = await detectObstacles(page);
        if (obstacle) {
          const resolution = await resolveObstacle(page, obstacle, this.ctx, monitor);
          obstacles.push({
            type: obstacle.type,
            detectedAtStep: i,
            resolved: resolution.resolved,
            resolution: resolution.resolution,
            durationMs: Date.now() - obstacleStart
          });
          if (!resolution.resolved && obstacle.type === "captcha") {
            const pageState = await getPageState(page, this.ctx, true);
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
              capturedApi: finishCapture()
            };
          }
        }
      }
    }
    const finalState = await getPageState(page, this.ctx, true);
    return {
      ok: true,
      completedSteps: pipeline.steps.length,
      totalSteps: pipeline.steps.length,
      results,
      obstacles,
      finalState,
      durationMs: Date.now() - startTime,
      capturedApi: finishCapture()
    };
  }
}
var DEFAULT_STALE_TIMEOUT_MS2 = 20000;
var init_pipeline = __esm(() => {
  init_actions();
  init_stale_monitor();
  init_obstacles();
  init_screenshot();
  init_api_capture();
});

// src/lib/browser/launcher.ts
function findChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE)
    return process.env.CHROME_EXECUTABLE;
  if (import_fs2.default.existsSync("/usr/bin/google-chrome-stable"))
    return "/usr/bin/google-chrome-stable";
  return;
}
async function getBrowser(_name = "chromium") {
  if (cachedBrowser && cachedBrowser.isConnected())
    return cachedBrowser;
  cachedBrowser = await import_patchright.chromium.launch({
    headless: true,
    args: STEALTH_ARGS
  });
  return cachedBrowser;
}
async function getBrowserWithFallback(_preferred) {
  return { browser: await getBrowser(), name: "chromium" };
}
async function launchHeadful(displayNum) {
  const executablePath = findChromeExecutable();
  const hasExtensions = import_fs2.default.existsSync(UBLOCK_PATH);
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
  log4.debug(`headful: ${executablePath || "patchright chromium"}, extensions: ${hasExtensions}`);
  return import_patchright.chromium.launch(launchOpts);
}
var import_fs2, import_patchright, log4, UBLOCK_PATH = "/extensions/uBlock0.chromium", cachedBrowser = null;
var init_launcher = __esm(() => {
  init_stealth();
  init_logger();
  import_fs2 = __toESM(require("fs"));
  import_patchright = require("patchright");
  log4 = createLogger("launcher");
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
      if (import_fs3.default.existsSync(socketPath))
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
  const noVncPath = import_fs3.default.existsSync("/usr/share/novnc") ? "/usr/share/novnc" : "/usr/share/noVNC";
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
  log5.debug(`fingerprint: ${fingerprint.userAgent.slice(0, 60)}... DPR=${fingerprint.deviceScaleFactor} screen=${fingerprint.screenWidth}x${fingerprint.screenHeight}`);
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
    import_fs3.default.unlinkSync(`/tmp/.X11-unix/X${session.displayNum}`);
  } catch {}
  freeDisplay(session.displayNum);
  sessions.delete(userId);
  return sessionData;
}
async function cleanupAllSessions() {
  const userIds = [...sessions.keys()];
  await Promise.all(userIds.map((id) => stopSession(id)));
}
var import_child_process, import_fs3, log5, BASE_DISPLAY, MAX_SESSIONS, SESSION_TIMEOUT, sessions, usedDisplays;
var init_session_manager = __esm(() => {
  init_launcher();
  init_stealth();
  init_logger();
  init_fingerprint();
  import_child_process = require("child_process");
  import_fs3 = __toESM(require("fs"));
  log5 = createLogger("session");
  BASE_DISPLAY = parseInt(process.env.VNC_BASE_DISPLAY || "99", 10);
  MAX_SESSIONS = parseInt(process.env.VNC_MAX_SESSIONS || "20", 10);
  SESSION_TIMEOUT = parseInt(process.env.VNC_SESSION_TIMEOUT_MS || "300000", 10);
  sessions = new Map;
  usedDisplays = new Set;
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
    import_fs4.default.mkdirSync(dataDir, { recursive: true });
    const dbPath = import_path2.default.join(dataDir, "iframer.db");
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
var import_path2, import_fs4, IS_BUN;
var init_sqlite_store = __esm(() => {
  import_path2 = __toESM(require("path"));
  import_fs4 = __toESM(require("fs"));
  IS_BUN = typeof globalThis.Bun !== "undefined";
});

// src/lib/storage.ts
function createStore(options = {}) {
  const dataDir = options.dataDir || import_path3.default.join(import_os.default.homedir(), ".iframer");
  return new SqliteStore(dataDir);
}
var import_path3, import_os;
var init_storage = __esm(() => {
  init_sqlite_store();
  import_path3 = __toESM(require("path"));
  import_os = __toESM(require("os"));
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
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-mac-arm64";
    return import_path4.default.join(installDir, dir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (platform === "linux") {
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-linux64";
    return import_path4.default.join(installDir, dir, "chrome");
  }
  if (platform === "win32") {
    const entries = import_fs5.default.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-win64";
    return import_path4.default.join(installDir, dir, "chrome.exe");
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
async function downloadChrome(installDir = DEFAULT_INSTALL_DIR) {
  log6.info("Downloading Chrome for Testing (first time only)...");
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
  log6.debug(`Version ${version} for ${platform}`);
  log6.debug(`URL: ${url}`);
  import_fs5.default.mkdirSync(installDir, { recursive: true });
  const zipPath = import_path4.default.join(installDir, "chrome.zip");
  const dlRes = await fetch(url);
  if (!dlRes.ok)
    throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  import_fs5.default.writeFileSync(zipPath, buf);
  log6.info(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  import_child_process2.execSync(`unzip -o -q "${zipPath}" -d "${installDir}"`, { stdio: "inherit" });
  import_fs5.default.unlinkSync(zipPath);
  const execPath = getChromeExecutablePath(installDir);
  if (!import_fs5.default.existsSync(execPath)) {
    throw new Error(`Chrome executable not found after extraction: ${execPath}`);
  }
  if (process.platform !== "win32") {
    import_fs5.default.chmodSync(execPath, 493);
  }
  import_fs5.default.writeFileSync(import_path4.default.join(installDir, "version.json"), JSON.stringify({ version, platform, downloadedAt: new Date().toISOString() }));
  log6.info(`Installed at: ${execPath}`);
  return execPath;
}
function findChromeForTesting() {
  if (process.env.CHROME_EXECUTABLE) {
    if (import_fs5.default.existsSync(process.env.CHROME_EXECUTABLE))
      return process.env.CHROME_EXECUTABLE;
  }
  try {
    const execPath = getChromeExecutablePath(DEFAULT_INSTALL_DIR);
    if (import_fs5.default.existsSync(execPath))
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
        const dirs = import_fs5.default.readdirSync("/ms-playwright").filter((d) => d.startsWith("chromium-")).sort().reverse();
        return dirs.map((d) => import_path4.default.join("/ms-playwright", d, "chrome-linux", "chrome"));
      } catch {
        return [];
      }
    })()
  ] : [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (const p of systemPaths) {
    if (import_fs5.default.existsSync(p))
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
    log6.error(`Failed to download Chrome for Testing: ${err instanceof Error ? err.message : String(err)}`);
    const system = findChrome();
    if (system) {
      log6.warn(`Falling back to system Chrome: ${system}`);
      return system;
    }
    throw new Error("No Chrome found. Download failed and no system Chrome available.");
  }
}
var import_fs5, import_path4, import_os2, import_child_process2, log6, CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json", DEFAULT_INSTALL_DIR;
var init_chrome_downloader = __esm(() => {
  init_logger();
  import_fs5 = __toESM(require("fs"));
  import_path4 = __toESM(require("path"));
  import_os2 = __toESM(require("os"));
  import_child_process2 = require("child_process");
  log6 = createLogger("chrome");
  DEFAULT_INSTALL_DIR = import_path4.default.join(import_os2.default.homedir(), ".iframer", "chrome");
});

// src/lib/browser/daemon.ts
class BrowserDaemon {
  instances = new Map;
  idleTimers = new Map;
  idleTimeout;
  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;
    const cleanup = () => this.stopAll().catch((err) => log7.warn(`cleanup failed: ${err}`));
    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }
  async ensure(mode) {
    if (mode === "docker-headful") {
      throw new Error("Docker mode doesn't use the daemon. Use the Docker API.");
    }
    let instance = this.instances.get(mode);
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
            } catch {}
            context2 = await instance.browser.newContext();
            page2 = await context2.newPage();
            instance.context = context2;
            instance.page = page2;
          }
          this.resetIdleTimer(mode);
          return { browser: instance.browser, context: context2, page: page2 };
        }
      } catch {}
      await this.stopMode(mode);
    }
    const executablePath = await ensureChrome();
    log7.info(`Launching Chrome for Testing in ${mode} mode: ${executablePath}`);
    const userDataDir = import_path5.default.join(import_os3.default.homedir(), ".iframer", "chrome-profile", mode);
    import_fs6.default.mkdirSync(userDataDir, { recursive: true });
    const browser = await import_patchright2.chromium.launch({
      executablePath,
      headless: mode === "headless",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars"
      ]
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    instance = {
      browser,
      context,
      page,
      mode,
      createdAt: new Date
    };
    this.instances.set(mode, instance);
    this.resetIdleTimer(mode);
    log7.info(`Chrome ${mode} ready`);
    return { browser, context, page };
  }
  isRunning(mode) {
    const instance = this.instances.get(mode);
    if (!instance)
      return false;
    try {
      return instance.browser.isConnected();
    } catch {
      return false;
    }
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
  async stopMode(mode) {
    const instance = this.instances.get(mode);
    if (!instance)
      return;
    const timer = this.idleTimers.get(mode);
    if (timer)
      clearTimeout(timer);
    this.idleTimers.delete(mode);
    log7.info(`Stopping Chrome ${mode}...`);
    try {
      await instance.context.close();
    } catch {}
    try {
      await instance.browser.close();
    } catch {}
    this.instances.delete(mode);
  }
  async stopAll() {
    const modes = [...this.instances.keys()];
    await Promise.all(modes.map((m) => this.stopMode(m)));
  }
  resetIdleTimer(mode) {
    const existing = this.idleTimers.get(mode);
    if (existing)
      clearTimeout(existing);
    this.idleTimers.set(mode, setTimeout(() => {
      log7.info(`Idle timeout for ${mode}, stopping...`);
      this.stopMode(mode);
    }, this.idleTimeout));
  }
}
var import_patchright2, import_os3, import_path5, import_fs6, log7, DEFAULT_IDLE_TIMEOUT;
var init_daemon = __esm(() => {
  init_chrome_downloader();
  init_logger();
  import_patchright2 = require("patchright");
  import_os3 = __toESM(require("os"));
  import_path5 = __toESM(require("path"));
  import_fs6 = __toESM(require("fs"));
  log7 = createLogger("daemon");
  DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
});

// src/lib/domain-modes.ts
class DomainModeStore {
  data = {};
  filePath;
  constructor(filePath = DEFAULT_FILE) {
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
      if (import_fs7.default.existsSync(this.filePath)) {
        this.data = JSON.parse(import_fs7.default.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }
  save() {
    try {
      import_fs7.default.mkdirSync(import_path6.default.dirname(this.filePath), { recursive: true });
      import_fs7.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log8.error("Failed to save:", err);
    }
  }
}
var import_fs7, import_path6, import_os4, log8, DEFAULT_FILE, TTL_DAYS = 14, ESCALATION_LADDER;
var init_domain_modes = __esm(() => {
  init_logger();
  import_fs7 = __toESM(require("fs"));
  import_path6 = __toESM(require("path"));
  import_os4 = __toESM(require("os"));
  log8 = createLogger("domain-modes");
  DEFAULT_FILE = import_path6.default.join(import_os4.default.homedir(), ".iframer", "domain-modes.json");
  ESCALATION_LADDER = ["headless", "docker-headful", "binary-headful"];
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
      log9.warn(`CF challenge check failed, assuming blocked: ${err}`);
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
        log9.warn(`captcha iframe check failed, assuming blocked: ${err}`);
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
    log9.warn(`page evaluation failed, assuming blocked: ${err}`);
    return { blocked: true, reason: "evaluation-failed" };
  }
}
var log9;
var init_block_detection = __esm(() => {
  init_constants();
  init_logger();
  log9 = createLogger("block-detection");
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
var log10;
var init_cdp_launcher = __esm(() => {
  init_chrome_downloader();
  init_logger();
  log10 = createLogger("cdp-launcher");
});

// src/lib/iframer.ts
var exports_iframer = {};
__export(exports_iframer, {
  Iframer: () => Iframer
});
function getErrorMessage2(err) {
  return err instanceof Error ? err.message : String(err);
}

class Iframer {
  screenshotDir;
  publicUrl;
  staleTimeoutMs;
  userRefs = new Map;
  store;
  daemon;
  domainModes;
  operatingMode;
  constructor(config = {}) {
    this.screenshotDir = config.screenshotDir || DEFAULT_SCREENSHOT_DIR;
    this.publicUrl = config.publicUrl || DEFAULT_PUBLIC_URL;
    this.staleTimeoutMs = config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS3;
    this.store = createStore({
      dataDir: config.dataDir || import_path7.default.join(import_os5.default.homedir(), ".iframer")
    });
    this.daemon = new BrowserDaemon(config.sessionTimeoutMs);
    this.domainModes = new DomainModeStore;
    this.operatingMode = config.mode || "local";
  }
  makeContext(userId, token) {
    if (!this.userRefs.has(userId)) {
      this.userRefs.set(userId, { refMap: new Map, nextRefId: 1 });
    }
    const refs = this.userRefs.get(userId);
    return {
      userId,
      token,
      screenshotDir: this.screenshotDir,
      publicUrl: this.publicUrl,
      staleTimeoutMs: this.staleTimeoutMs,
      refMap: refs.refMap,
      nextRefId: refs.nextRefId,
      store: this.store
    };
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
  async fetch(userId, token, request) {
    const { url, browser: preferredBrowser, waitUntil = "domcontentloaded", waitForSelector, extract, actions = [], returnHtml = false, headers = {}, locale = "pt-BR", sessionless = false } = request;
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
      const result = extract ? await page.evaluate(extract) : undefined;
      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
        await this.store.setSession(userId, encrypted);
      }
      return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
    } catch (err) {
      return { ok: false, browser: "unknown", url, error: getErrorMessage2(err), durationMs: Date.now() - startedAt };
    } finally {
      if (context)
        await context.close();
    }
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
            await this.store.setSession(userId, encrypted);
            sessionSaved = true;
            break;
          }
        } catch (err) {
          log11.warn(`stopSession: failed to extract daemon state: ${getErrorMessage2(err)}`);
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
  async execute(userId, token, pipeline) {
    const opts = pipeline.options || {};
    const forcedMode = opts.mode;
    const autoEscalate = opts.autoEscalate !== false;
    const firstNav = pipeline.steps.find((s) => s.type === "navigate");
    const domain = firstNav ? new URL(firstNav.url).hostname : null;
    const availableModes = this.getAvailableModes();
    let mode;
    if (forcedMode && availableModes.includes(forcedMode)) {
      mode = forcedMode;
    } else if (domain) {
      mode = this.domainModes.getBestMode(domain, availableModes);
    } else {
      mode = availableModes[0] || "headless";
    }
    let result = await this.executeWithMode(userId, token, pipeline, mode);
    if (!result.ok && autoEscalate && domain && result.error?.errorType === "bot-blocked") {
      const failedMode = mode;
      if (domain)
        this.domainModes.recordFailure(domain, failedMode, result.error?.message || "blocked");
      const nextMode = this.domainModes.getNextMode(failedMode, availableModes);
      if (nextMode) {
        log11.info(`Auto-escalating from ${failedMode} to ${nextMode} for ${domain}`);
        if (failedMode !== "docker-headful") {
          await this.daemon.stopMode(failedMode);
        }
        result = await this.executeWithMode(userId, token, pipeline, nextMode);
        result.modeEscalated = true;
        result.modeUsed = nextMode;
        if (result.ok && domain) {
          this.domainModes.recordSuccess(domain, nextMode);
        } else if (!result.ok && domain && result.error?.errorType === "bot-blocked") {
          this.domainModes.recordFailure(domain, nextMode, result.error?.message || "blocked");
          const thirdMode = this.domainModes.getNextMode(nextMode, availableModes);
          if (thirdMode) {
            log11.info(`Auto-escalating from ${nextMode} to ${thirdMode} for ${domain}`);
            if (nextMode !== "docker-headful") {
              await this.daemon.stopMode(nextMode);
            }
            result = await this.executeWithMode(userId, token, pipeline, thirdMode);
            result.modeEscalated = true;
            result.modeUsed = thirdMode;
            if (result.ok && domain) {
              this.domainModes.recordSuccess(domain, thirdMode);
            }
          }
        }
      }
    } else if (result.ok && domain) {
      this.domainModes.recordSuccess(domain, mode);
    }
    return result;
  }
  async executeWithMode(userId, token, pipeline, mode) {
    if (mode === "docker-headful") {
      return this.executeDocker(userId, token, pipeline);
    }
    return this.executeLocal(userId, token, pipeline, mode);
  }
  async executeDocker(userId, token, pipeline) {
    let session = getSession(userId);
    if (!session) {
      const firstNav = pipeline.steps.find((s) => s.type === "navigate");
      await this.startSession(userId, token, firstNav ? { url: firstNav.url } : {});
      session = getSession(userId);
    }
    resetTimeout(userId);
    const ctx = this.makeContext(userId, token);
    const runner = new PipelineRunner(ctx);
    const result = await runner.run(session.page, pipeline);
    if (result.ok) {
      const blockResult = await detectBlock(session.page);
      if (blockResult.blocked) {
        const pageState = await this.getPageState(session.page, ctx);
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
    const refs = this.userRefs.get(userId);
    if (refs)
      refs.nextRefId = ctx.nextRefId;
    result.modeUsed = "docker-headful";
    return result;
  }
  async executeLocal(userId, token, pipeline, mode) {
    const startTime = Date.now();
    try {
      const { page } = await this.daemon.ensure(mode);
      const encryptionKey = await deriveKey(token);
      const blob = await this.store.getSession(userId);
      if (blob && blob.length > 0) {
        try {
          const sessionData = JSON.parse(decrypt(blob, encryptionKey));
          await injectCookies(page.context(), sessionData);
        } catch {}
      }
      const ctx = this.makeContext(userId, token);
      const runner = new PipelineRunner(ctx);
      const result = await runner.run(page, pipeline);
      if (result.ok) {
        const blockResult = await detectBlock(page);
        if (blockResult.blocked) {
          const pageState = await this.getPageState(page, ctx);
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
      if (result.ok) {
        try {
          const updatedSession = await extractSession(page.context(), page);
          const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey);
          await this.store.setSession(userId, encrypted);
        } catch {}
      }
      const refs = this.userRefs.get(userId);
      if (refs)
        refs.nextRefId = ctx.nextRefId;
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
          message: `Failed to launch browser in ${mode} mode: ${getErrorMessage2(err)}`,
          pageState: { url: "", title: "" },
          suggestion: `Browser launch failed. ${mode === "binary-headful" ? "Make sure a display is available." : "Check Chrome installation."}`,
          retryable: true
        },
        durationMs: Date.now() - startTime,
        modeUsed: mode
      };
    }
  }
  async getPageState(page, ctx) {
    try {
      const url = page.url();
      const title = await page.title().catch(() => "");
      const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false }).catch(() => null);
      const screenshotUrl = buf ? saveScreenshot(buf, `block-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl) : undefined;
      return { url, title, screenshotUrl };
    } catch {
      return { url: "", title: "" };
    }
  }
  async screenshot(userId) {
    const session = getSession(userId);
    if (!session)
      return null;
    resetTimeout(userId);
    const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `screenshot-${Date.now()}.jpg`, this.screenshotDir, this.publicUrl);
    return {
      screenshotUrl,
      url: session.page.url(),
      title: await session.page.title()
    };
  }
  async storeCredential(userId, token, credential) {
    const credKey = await deriveKey(token, "credentials");
    const data = {
      ...credential,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const encrypted = encrypt(JSON.stringify(data), credKey);
    await this.store.setCredential(userId, credential.domain, encrypted);
  }
  async getCredential(userId, token, domain) {
    const credKey = await deriveKey(token, "credentials");
    const blob = await this.store.getCredential(userId, domain);
    if (!blob || blob.length === 0)
      return null;
    return JSON.parse(decrypt(blob, credKey));
  }
  async listCredentials(userId) {
    return this.store.listCredentialDomains(userId);
  }
  async deleteCredential(userId, domain) {
    await this.store.deleteCredential(userId, domain);
  }
  async loginWithCredentials(userId, token, domain, selectors) {
    const session = getSession(userId);
    if (!session)
      return { ok: false, url: "", title: "", error: "No active interactive session. Start one first." };
    const credKey = await deriveKey(token, "credentials");
    const blob = await this.store.getCredential(userId, domain);
    if (!blob || blob.length === 0) {
      return { ok: false, url: "", title: "", error: `No credentials stored for ${domain}` };
    }
    const credential = JSON.parse(decrypt(blob, credKey));
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
    const screenshotUrl = saveScreenshot(buf, `login-${Date.now()}.jpg`, this.screenshotDir, this.publicUrl);
    return { ok: true, url: page.url(), title: await page.title(), screenshotUrl };
  }
  async clearSession(userId) {
    await this.store.deleteSession(userId);
  }
  async shutdown() {
    await this.daemon.stopAll();
    await cleanupAllSessions();
    if ("close" in this.store && typeof this.store.close === "function") {
      this.store.close();
    }
  }
}
var import_path7, import_os5, log11, DEFAULT_SCREENSHOT_DIR, DEFAULT_PUBLIC_URL, DEFAULT_STALE_TIMEOUT_MS3 = 20000;
var init_iframer = __esm(() => {
  init_pipeline();
  init_session_manager();
  init_launcher();
  init_stealth();
  init_humanize();
  init_crypto();
  init_screenshot();
  init_storage();
  init_daemon();
  init_domain_modes();
  init_block_detection();
  init_cdp_launcher();
  init_constants();
  init_logger();
  import_path7 = __toESM(require("path"));
  import_os5 = __toESM(require("os"));
  log11 = createLogger("iframer");
  DEFAULT_SCREENSHOT_DIR = import_path7.default.join("/Users/eduardoverona/tools/iframer-toolkit/src/lib", "../../.screenshots");
  DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
});

// bin/cli.js
var __dirname = "/Users/eduardoverona/tools/iframer-toolkit/bin";
var fs8 = require("fs");
var path8 = require("path");
var { execSync: execSync2 } = require("child_process");
var readline = require("readline");
var CONFIG_DIR = path8.join(require("os").homedir(), ".iframer");
var DEFAULT_SERVER = process.env.IFRAMER_URL || "http://localhost:3021";
var API_KEY = process.env.IFRAMER_SECRET;
var USE_LOCAL = process.env.IFRAMER_MODE === "local" || !process.env.IFRAMER_URL;
function openBrowser(url) {
  try {
    if (process.platform === "darwin")
      execSync2(`open "${url}"`);
    else if (process.platform === "win32")
      execSync2(`start "${url}"`);
    else
      execSync2(`xdg-open "${url}"`);
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
var _iframer = null;
async function getLocalIframer() {
  if (_iframer)
    return _iframer;
  try {
    const { Iframer: Iframer2 } = await Promise.resolve().then(() => (init_iframer(), exports_iframer));
    const screenshotDir = path8.join(require("os").tmpdir(), "iframer-screenshots");
    fs8.mkdirSync(screenshotDir, { recursive: true });
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
  const { screenshot, tileScreenshots, ...rest } = data;
  if (screenshot && screenshotPath) {
    fs8.writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
    rest._screenshotSaved = screenshotPath;
  }
  if (tileScreenshots && tileScreenshots.length > 0) {
    const tileDir = "/tmp/browser-tiles";
    fs8.mkdirSync(tileDir, { recursive: true });
    const tilePaths = [];
    for (const tile of tileScreenshots) {
      if (tile.screenshot) {
        const tilePath = `${tileDir}/tile-${tile.index}.png`;
        fs8.writeFileSync(tilePath, Buffer.from(tile.screenshot, "base64"));
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
if (command === "install" && args.length > 0) {
  const target = args.shift();
  if (target === "chromium" || target === "chrome")
    command = "install-chrome";
  else if (target === "mcp")
    command = "install-mcp";
  else if (target === "deps" || target === "dependencies" || target === "all")
    command = "install-all";
  else {
    console.error(`  Unknown install target: ${target}`);
    console.error("  Usage: iframer install <chromium|mcp|deps>");
    process.exit(1);
  }
}
async function installChrome() {
  const { downloadChrome: downloadChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
  await downloadChrome2();
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
    case "install-all": {
      console.log(`  Installing iframer-toolkit dependencies...
`);
      console.log("  [1/2] Chrome for Testing");
      try {
        await installChrome();
      } catch (err) {
        console.error(`  Chrome install failed: ${err.message}`);
        process.exit(1);
      }
      console.log(`
  [2/2] MCP server registration`);
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
      } else if (fs8.existsSync(input)) {
        const parsed = JSON.parse(fs8.readFileSync(input, "utf-8"));
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
        result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options });
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
      const extract = parseFlag(args, "--extract");
      if (extract)
        options.extract = extract;
      if (hasFlag(args, "--html"))
        options.returnHtml = true;
      if (hasFlag(args, "--sessionless"))
        options.sessionless = true;
      const waitFor = parseFlag(args, "--wait-for");
      if (waitFor)
        options.waitForSelector = waitFor;
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
          result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options: { mode } });
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
        fs8.writeFileSync(outPath, buffer);
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
          const result = await iframer.stopSession("cli-user", API_KEY || "cli-local");
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
          await iframer.storeCredential("cli-user", API_KEY || "cli-local", body);
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
          domains = await iframer.listCredentials("cli-user");
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
          await iframer.deleteCredential("cli-user", domain);
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
      } else if (fs8.existsSync(input)) {
        const parsed = JSON.parse(fs8.readFileSync(input, "utf-8"));
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
        result = await iframer.execute("cli-user", API_KEY || "cli-local", { steps, options });
      } else {
        result = await apiPost("/execute", { steps, options });
      }
      if (result.capturedApi && result.capturedApi.length > 0) {
        const outputDir = parseFlag(args, "--output") || `./${result.capturedApi[0].domain}`;
        fs8.mkdirSync(outputDir, { recursive: true });
        fs8.writeFileSync(path8.join(outputDir, "captured-api.json"), JSON.stringify(result.capturedApi, null, 2));
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
      const mcpServerTS = path8.join(__dirname, "..", "src", "mcp", "server.ts");
      const mcpServerCJS = path8.join(__dirname, "mcp-server.cjs");
      let mcpCommand, mcpArgs;
      let bunPath;
      try {
        bunPath = execSync2("which bun", { encoding: "utf8" }).trim();
      } catch {}
      if (bunPath && fs8.existsSync(mcpServerTS)) {
        mcpCommand = bunPath;
        mcpArgs = ["run", mcpServerTS];
        console.log("  Using bun to run MCP server from source (no build needed)");
      } else if (fs8.existsSync(mcpServerCJS)) {
        mcpCommand = "node";
        mcpArgs = [mcpServerCJS];
        console.log("  Using pre-built MCP server bundle");
      } else {
        console.error("  MCP server not found. Need either bun + source or pre-built bundle.");
        console.error("  Run: bun build src/mcp/server.ts --target node --format cjs --outfile bin/mcp-server.cjs");
        process.exit(1);
      }
      const claudeConfigPath = path8.join(require("os").homedir(), ".claude.json");
      let config = {};
      try {
        config = JSON.parse(fs8.readFileSync(claudeConfigPath, "utf8"));
      } catch {}
      const isDev = args.includes("--dev");
      const mcpName = isDev ? "iframer-dev" : "iframer";
      let secret = process.env.IFRAMER_SECRET;
      if (!secret) {
        try {
          const envPath = path8.join(__dirname, "..", ".env");
          const envContent = fs8.readFileSync(envPath, "utf8");
          const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
          if (match)
            secret = match[1].trim();
        } catch {}
      }
      if (!config.mcpServers)
        config.mcpServers = {};
      const mcpEntry = { command: mcpCommand, args: mcpArgs };
      if (secret)
        mcpEntry.env = { IFRAMER_SECRET: secret };
      if (!isDev) {
        if (!mcpEntry.env)
          mcpEntry.env = {};
        mcpEntry.env.IFRAMER_MODE = "local";
      }
      config.mcpServers[mcpName] = mcpEntry;
      fs8.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
      console.log(`
  ${mcpName} MCP installed!`);
      if (secret)
        console.log("  IFRAMER_SECRET loaded from .env");
      if (!isDev)
        console.log("  Mode: local (headless + binary-headful, no Docker needed)");
      else
        console.log("  Mode: docker (connects to Docker container)");
      console.log(`  Config written to: ${claudeConfigPath}`);
      console.log(`  Restart Claude Code to activate the iframer tools.
`);
      break;
    }
    case "remove-mcp": {
      const claudeConfigPath2 = path8.join(require("os").homedir(), ".claude.json");
      let config2 = {};
      try {
        config2 = JSON.parse(fs8.readFileSync(claudeConfigPath2, "utf8"));
      } catch {
        console.log("  No ~/.claude.json found — nothing to remove.");
        break;
      }
      const isDev2 = args.includes("--dev");
      const mcpName2 = isDev2 ? "iframer-dev" : "iframer";
      if (!config2.mcpServers || !config2.mcpServers[mcpName2]) {
        console.log(`  ${mcpName2} MCP is not installed.`);
        break;
      }
      delete config2.mcpServers[mcpName2];
      fs8.writeFileSync(claudeConfigPath2, JSON.stringify(config2, null, 2));
      console.log(`
  ${mcpName2} MCP removed!`);
      console.log(`  Config updated: ${claudeConfigPath2}`);
      console.log(`  Restart Claude Code for the change to take effect.
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
    install-mcp [--dev]             Install iframer MCP into Claude Code
    remove-mcp [--dev]              Remove iframer MCP from Claude Code

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
