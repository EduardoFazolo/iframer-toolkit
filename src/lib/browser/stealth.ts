import type { Page } from "patchright";
import type { BrowserFingerprint } from "./fingerprint";

export const CHROME_VERSION = "136.0.7103.93";
// Default UA — will be overridden per-session by fingerprint-generator
export const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

const NATIVE_TOSTRING_HELPER = `
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

// Build a parameterized stealth script from a fingerprint
export function buildStealthScript(fp?: BrowserFingerprint): string {
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
    { brand: "Not.A/Brand", version: "99" },
  ];
  const fullVersionList = uaData?.fullVersionList ?? [
    { brand: "Chromium", version: "136.0.7103.93" },
    { brand: "Google Chrome", version: "136.0.7103.93" },
    { brand: "Not.A/Brand", version: "99.0.0.0" },
  ];
  const platformVersion = uaData?.platformVersion ?? "15.0.0";
  const uaFullVersion = uaData?.uaFullVersion ?? "136.0.7103.93";

  return buildStealthScriptInner({
    ua, platform, hw, mem, dpr, sw, sh, sah, langs,
    brands, fullVersionList, platformVersion, uaFullVersion,
  });
}

function buildStealthScriptInner(p: {
  ua: string; platform: string; hw: number; mem: number; dpr: number;
  sw: number; sh: number; sah: number; langs: string;
  brands: any[]; fullVersionList: any[]; platformVersion: string; uaFullVersion: string;
}): string {
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
      return /^10\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^127\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^::1$/.test(ip) ||
        /^fc|^fd/.test(ip);
    }

    function extractIP(candidateStr) {
      const m = candidateStr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-f0-9:]{3,})/);
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

// Default static script (Windows) — used as fallback before fingerprint is generated
export const STEALTH_SCRIPT = buildStealthScript();

export function stealthContextOptions(overrides: Record<string, any> = {}, _sessionId?: string, fp?: BrowserFingerprint): Record<string, any> {
  const uaVersion = fp?.uaData?.brands?.find((b: { brand: string; version: string }) => b.brand === "Google Chrome")?.version ?? "136";
  return {
    userAgent: fp?.userAgent ?? USER_AGENT,
    locale: overrides.locale || "en-US",
    timezoneId: overrides.timezoneId || "America/New_York",
    deviceScaleFactor: fp?.deviceScaleFactor ?? 1.25,
    viewport: {
      width: fp?.screenWidth ?? 1920,
      height: fp?.screenHeight ?? 1080,
    },
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": `"Chromium";v="${uaVersion}", "Google Chrome";v="${uaVersion}", "Not:A-Brand";v="99"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"Windows"`,
      ...overrides.extraHTTPHeaders,
    },
    ...overrides,
  };
}

export async function applyStealthToPage(page: Page): Promise<void> {
  // Use context-level init script — more reliable with patchright than page-level
  await (page.context() as unknown as { addInitScript(script: string): Promise<void> }).addInitScript(STEALTH_SCRIPT);
}

export const STEALTH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-infobars",
  "--window-size=1920,1080",
  "--enable-features=NetworkService,NetworkServiceInProcess",
  "--use-gl=angle",
  "--use-angle=swiftshader",
];
