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

// src/lib/paths.ts
var exports_paths = {};
__export(exports_paths, {
  getDataDir: () => getDataDir
});
function getDataDir() {
  return process.env.IFRAMER_DATA_DIR || import_path.default.join(import_os.default.homedir(), ".iframer");
}
var import_path, import_os;
var init_paths = __esm(() => {
  import_path = __toESM(require("path"));
  import_os = __toESM(require("os"));
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

// src/lib/browser/registry.ts
var exports_registry = {};
__export(exports_registry, {
  writeServerInfo: () => writeServerInfo,
  unregisterBrowser: () => unregisterBrowser,
  registerBrowser: () => registerBrowser,
  reapOrphanBrowsers: () => reapOrphanBrowsers,
  readServerInfo: () => readServerInfo,
  pidMatchesMarker: () => pidMatchesMarker,
  isPidAlive: () => isPidAlive,
  forceKillBrowser: () => forceKillBrowser,
  findChromePidByMarker: () => findChromePidByMarker,
  clearServerInfo: () => clearServerInfo
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
    const cmd = import_child_process.execSync(`ps -o command= -p ${pid}`, { encoding: "utf8" });
    return cmd.includes(marker);
  } catch {
    return false;
  }
}
function findChromePidByMarker(marker) {
  try {
    const out = import_child_process.execSync(`pgrep -f -- "${marker}"`, { encoding: "utf8" }).trim();
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
    import_fs.default.writeFileSync(import_path2.default.join(browsersDir(), `${rec.chromePid}.json`), JSON.stringify(rec, null, 2));
  } catch (err) {
    log.warn(`failed to write browser record for pid ${rec.chromePid}: ${err}`);
  }
}
function unregisterBrowser(chromePid) {
  try {
    import_fs.default.unlinkSync(import_path2.default.join(browsersDir(), `${chromePid}.json`));
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
      } catch {}
      continue;
    }
    if (!isPidAlive(rec.chromePid) || !pidMatchesMarker(rec.chromePid, rec.marker)) {
      try {
        import_fs.default.unlinkSync(full);
      } catch {}
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
      } catch {}
      reaped++;
    } else {
      log.warn(`failed to kill orphan Chrome pid=${rec.chromePid} — leaving record for next sweep`);
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
      import_fs.default.unlinkSync(serverInfoPath());
    } catch {}
  }
}
var import_fs, import_path2, import_child_process, log, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var init_registry = __esm(() => {
  init_paths();
  init_logger();
  import_fs = __toESM(require("fs"));
  import_path2 = __toESM(require("path"));
  import_child_process = require("child_process");
  log = createLogger("registry");
});

// node_modules/tsx/dist/temporary-directory-BDDVQOvU.mjs
var import_node_path, import_node_os, r, t, e;
var init_temporary_directory_BDDVQOvU = __esm(() => {
  import_node_path = __toESM(require("node:path"));
  import_node_os = __toESM(require("node:os"));
  ({ geteuid: r } = process);
  t = r ? r() : import_node_os.default.userInfo().username;
  e = import_node_path.default.join(import_node_os.default.tmpdir(), `tsx-${t}`);
});

// node_modules/tsx/dist/get-pipe-path-_tAJyU_v.mjs
var import_module, import_node_path2, o2, t2 = (e2, r2) => o2(e2, "name", { value: r2, configurable: true }), m, i, n;
var init_get_pipe_path__tAJyU_v = __esm(() => {
  init_temporary_directory_BDDVQOvU();
  import_module = require("module");
  import_node_path2 = __toESM(require("node:path"));
  o2 = Object.defineProperty;
  m = import_module.createRequire("file:///Users/redacted/tools/iframer-toolkit/node_modules/tsx/dist/get-pipe-path-_tAJyU_v.mjs");
  i = process.platform === "win32";
  n = t2((e2) => {
    const r2 = import_node_path2.default.join(e, `${e2}.pipe`);
    return i ? `\\\\?\\pipe\\${r2}` : r2;
  }, "getPipePath");
});

// node_modules/tsx/dist/node-features-JeyyvQz6.mjs
var i2, o3 = (e2, t3) => i2(e2, "name", { value: t3, configurable: true }), n2, a2, c, u, l, m2, p2, d, R;
var init_node_features_JeyyvQz6 = __esm(() => {
  i2 = Object.defineProperty;
  n2 = o3((e2, t3) => {
    const s2 = e2[0] - t3[0];
    if (s2 === 0) {
      const r2 = e2[1] - t3[1];
      return r2 === 0 ? e2[2] >= t3[2] : r2 > 0;
    }
    return s2 > 0;
  }, "isVersionGreaterOrEqual");
  a2 = process.versions.node.split(".").map(Number);
  c = o3((e2, t3 = a2) => {
    for (let s2 = 0;s2 < e2.length; s2 += 1) {
      const r2 = e2[s2];
      if (s2 === e2.length - 1 || t3[0] === r2[0])
        return n2(t3, r2);
    }
    return false;
  }, "isFeatureSupported");
  u = [[18, 19, 0], [20, 6, 0]];
  l = [[22, 22, 3], [24, 11, 1], [25, 1, 0], [26, 0, 0]];
  m2 = [[18, 19, 0], [20, 10, 0], [21, 0, 0]];
  p2 = [[20, 11, 0], [21, 3, 0]];
  d = [[20, 11, 0], [21, 2, 0]];
  R = [[20, 19, 0], [22, 12, 0], [23, 0, 0]];
});

// node_modules/esbuild/lib/main.js
var require_main = __commonJS((exports2, module2) => {
  var __dirname = "/Users/redacted/tools/iframer-toolkit/node_modules/esbuild/lib", __filename = "/Users/redacted/tools/iframer-toolkit/node_modules/esbuild/lib/main.js";
  var __defProp2 = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames2 = Object.getOwnPropertyNames;
  var __hasOwnProp2 = Object.prototype.hasOwnProperty;
  var __export2 = (target, all) => {
    for (var name in all)
      __defProp2(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames2(from))
        if (!__hasOwnProp2.call(to, key) && key !== except)
          __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp2({}, "__esModule", { value: true }), mod);
  var node_exports = {};
  __export2(node_exports, {
    analyzeMetafile: () => analyzeMetafile,
    analyzeMetafileSync: () => analyzeMetafileSync,
    build: () => build,
    buildSync: () => buildSync,
    context: () => context,
    default: () => node_default,
    formatMessages: () => formatMessages,
    formatMessagesSync: () => formatMessagesSync,
    initialize: () => initialize,
    stop: () => stop,
    transform: () => transform,
    transformSync: () => transformSync,
    version: () => version
  });
  module2.exports = __toCommonJS(node_exports);
  function encodePacket(packet) {
    let visit = (value) => {
      if (value === null) {
        bb.write8(0);
      } else if (typeof value === "boolean") {
        bb.write8(1);
        bb.write8(+value);
      } else if (typeof value === "number") {
        bb.write8(2);
        bb.write32(value | 0);
      } else if (typeof value === "string") {
        bb.write8(3);
        bb.write(encodeUTF8(value));
      } else if (value instanceof Uint8Array) {
        bb.write8(4);
        bb.write(value);
      } else if (value instanceof Array) {
        bb.write8(5);
        bb.write32(value.length);
        for (let item of value) {
          visit(item);
        }
      } else {
        let keys = Object.keys(value);
        bb.write8(6);
        bb.write32(keys.length);
        for (let key of keys) {
          bb.write(encodeUTF8(key));
          visit(value[key]);
        }
      }
    };
    let bb = new ByteBuffer;
    bb.write32(0);
    bb.write32(packet.id << 1 | +!packet.isRequest);
    visit(packet.value);
    writeUInt32LE(bb.buf, bb.len - 4, 0);
    return bb.buf.subarray(0, bb.len);
  }
  function decodePacket(bytes) {
    let visit = () => {
      switch (bb.read8()) {
        case 0:
          return null;
        case 1:
          return !!bb.read8();
        case 2:
          return bb.read32();
        case 3:
          return decodeUTF8(bb.read());
        case 4:
          return bb.read();
        case 5: {
          let count = bb.read32();
          let value2 = [];
          for (let i3 = 0;i3 < count; i3++) {
            value2.push(visit());
          }
          return value2;
        }
        case 6: {
          let count = bb.read32();
          let value2 = {};
          for (let i3 = 0;i3 < count; i3++) {
            value2[decodeUTF8(bb.read())] = visit();
          }
          return value2;
        }
        default:
          throw new Error("Invalid packet");
      }
    };
    let bb = new ByteBuffer(bytes);
    let id = bb.read32();
    let isRequest = (id & 1) === 0;
    id >>>= 1;
    let value = visit();
    if (bb.ptr !== bytes.length) {
      throw new Error("Invalid packet");
    }
    return { id, isRequest, value };
  }
  var ByteBuffer = class {
    constructor(buf = new Uint8Array(1024)) {
      this.buf = buf;
      this.len = 0;
      this.ptr = 0;
    }
    _write(delta) {
      if (this.len + delta > this.buf.length) {
        let clone = new Uint8Array((this.len + delta) * 2);
        clone.set(this.buf);
        this.buf = clone;
      }
      this.len += delta;
      return this.len - delta;
    }
    write8(value) {
      let offset = this._write(1);
      this.buf[offset] = value;
    }
    write32(value) {
      let offset = this._write(4);
      writeUInt32LE(this.buf, value, offset);
    }
    write(bytes) {
      let offset = this._write(4 + bytes.length);
      writeUInt32LE(this.buf, bytes.length, offset);
      this.buf.set(bytes, offset + 4);
    }
    _read(delta) {
      if (this.ptr + delta > this.buf.length) {
        throw new Error("Invalid packet");
      }
      this.ptr += delta;
      return this.ptr - delta;
    }
    read8() {
      return this.buf[this._read(1)];
    }
    read32() {
      return readUInt32LE(this.buf, this._read(4));
    }
    read() {
      let length = this.read32();
      let bytes = new Uint8Array(length);
      let ptr = this._read(bytes.length);
      bytes.set(this.buf.subarray(ptr, ptr + length));
      return bytes;
    }
  };
  var encodeUTF8;
  var decodeUTF8;
  var encodeInvariant;
  if (typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined") {
    let encoder = new TextEncoder;
    let decoder = new TextDecoder;
    encodeUTF8 = (text) => encoder.encode(text);
    decodeUTF8 = (bytes) => decoder.decode(bytes);
    encodeInvariant = 'new TextEncoder().encode("")';
  } else if (typeof Buffer !== "undefined") {
    encodeUTF8 = (text) => Buffer.from(text);
    decodeUTF8 = (bytes) => {
      let { buffer, byteOffset, byteLength } = bytes;
      return Buffer.from(buffer, byteOffset, byteLength).toString();
    };
    encodeInvariant = 'Buffer.from("")';
  } else {
    throw new Error("No UTF-8 codec found");
  }
  if (!(encodeUTF8("") instanceof Uint8Array))
    throw new Error(`Invariant violation: "${encodeInvariant} instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
`);
  function readUInt32LE(buffer, offset) {
    return (buffer[offset++] | buffer[offset++] << 8 | buffer[offset++] << 16 | buffer[offset++] << 24) >>> 0;
  }
  function writeUInt32LE(buffer, value, offset) {
    buffer[offset++] = value;
    buffer[offset++] = value >> 8;
    buffer[offset++] = value >> 16;
    buffer[offset++] = value >> 24;
  }
  var fromCharCode = String.fromCharCode;
  function throwSyntaxError(bytes, index, message) {
    const c2 = bytes[index];
    let line = 1;
    let column = 0;
    for (let i3 = 0;i3 < index; i3++) {
      if (bytes[i3] === 10) {
        line++;
        column = 0;
      } else {
        column++;
      }
    }
    throw new SyntaxError(message ? message : index === bytes.length ? "Unexpected end of input while parsing JSON" : c2 >= 32 && c2 <= 126 ? `Unexpected character ${fromCharCode(c2)} in JSON at position ${index} (line ${line}, column ${column})` : `Unexpected byte 0x${c2.toString(16)} in JSON at position ${index} (line ${line}, column ${column})`);
  }
  function JSON_parse(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error(`JSON input must be a Uint8Array`);
    }
    const propertyStack = [];
    const objectStack = [];
    const stateStack = [];
    const length = bytes.length;
    let property = null;
    let state = 0;
    let object;
    let i3 = 0;
    while (i3 < length) {
      let c2 = bytes[i3++];
      if (c2 <= 32) {
        continue;
      }
      let value;
      if (state === 2 && property === null && c2 !== 34 && c2 !== 125) {
        throwSyntaxError(bytes, --i3);
      }
      switch (c2) {
        case 116: {
          if (bytes[i3++] !== 114 || bytes[i3++] !== 117 || bytes[i3++] !== 101) {
            throwSyntaxError(bytes, --i3);
          }
          value = true;
          break;
        }
        case 102: {
          if (bytes[i3++] !== 97 || bytes[i3++] !== 108 || bytes[i3++] !== 115 || bytes[i3++] !== 101) {
            throwSyntaxError(bytes, --i3);
          }
          value = false;
          break;
        }
        case 110: {
          if (bytes[i3++] !== 117 || bytes[i3++] !== 108 || bytes[i3++] !== 108) {
            throwSyntaxError(bytes, --i3);
          }
          value = null;
          break;
        }
        case 45:
        case 46:
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: {
          let index = i3;
          value = fromCharCode(c2);
          c2 = bytes[i3];
          while (true) {
            switch (c2) {
              case 43:
              case 45:
              case 46:
              case 48:
              case 49:
              case 50:
              case 51:
              case 52:
              case 53:
              case 54:
              case 55:
              case 56:
              case 57:
              case 101:
              case 69: {
                value += fromCharCode(c2);
                c2 = bytes[++i3];
                continue;
              }
            }
            break;
          }
          value = +value;
          if (isNaN(value)) {
            throwSyntaxError(bytes, --index, "Invalid number");
          }
          break;
        }
        case 34: {
          value = "";
          while (true) {
            if (i3 >= length) {
              throwSyntaxError(bytes, length);
            }
            c2 = bytes[i3++];
            if (c2 === 34) {
              break;
            } else if (c2 === 92) {
              switch (bytes[i3++]) {
                case 34:
                  value += '"';
                  break;
                case 47:
                  value += "/";
                  break;
                case 92:
                  value += "\\";
                  break;
                case 98:
                  value += "\b";
                  break;
                case 102:
                  value += "\f";
                  break;
                case 110:
                  value += `
`;
                  break;
                case 114:
                  value += "\r";
                  break;
                case 116:
                  value += "\t";
                  break;
                case 117: {
                  let code = 0;
                  for (let j = 0;j < 4; j++) {
                    c2 = bytes[i3++];
                    code <<= 4;
                    if (c2 >= 48 && c2 <= 57)
                      code |= c2 - 48;
                    else if (c2 >= 97 && c2 <= 102)
                      code |= c2 + (10 - 97);
                    else if (c2 >= 65 && c2 <= 70)
                      code |= c2 + (10 - 65);
                    else
                      throwSyntaxError(bytes, --i3);
                  }
                  value += fromCharCode(code);
                  break;
                }
                default:
                  throwSyntaxError(bytes, --i3);
                  break;
              }
            } else if (c2 <= 127) {
              value += fromCharCode(c2);
            } else if ((c2 & 224) === 192) {
              value += fromCharCode((c2 & 31) << 6 | bytes[i3++] & 63);
            } else if ((c2 & 240) === 224) {
              value += fromCharCode((c2 & 15) << 12 | (bytes[i3++] & 63) << 6 | bytes[i3++] & 63);
            } else if ((c2 & 248) == 240) {
              let codePoint = (c2 & 7) << 18 | (bytes[i3++] & 63) << 12 | (bytes[i3++] & 63) << 6 | bytes[i3++] & 63;
              if (codePoint > 65535) {
                codePoint -= 65536;
                value += fromCharCode(codePoint >> 10 & 1023 | 55296);
                codePoint = 56320 | codePoint & 1023;
              }
              value += fromCharCode(codePoint);
            }
          }
          value[0];
          break;
        }
        case 91: {
          value = [];
          propertyStack.push(property);
          objectStack.push(object);
          stateStack.push(state);
          property = null;
          object = value;
          state = 1;
          continue;
        }
        case 123: {
          value = {};
          propertyStack.push(property);
          objectStack.push(object);
          stateStack.push(state);
          property = null;
          object = value;
          state = 2;
          continue;
        }
        case 93: {
          if (state !== 1) {
            throwSyntaxError(bytes, --i3);
          }
          value = object;
          property = propertyStack.pop();
          object = objectStack.pop();
          state = stateStack.pop();
          break;
        }
        case 125: {
          if (state !== 2) {
            throwSyntaxError(bytes, --i3);
          }
          value = object;
          property = propertyStack.pop();
          object = objectStack.pop();
          state = stateStack.pop();
          break;
        }
        default: {
          throwSyntaxError(bytes, --i3);
        }
      }
      c2 = bytes[i3];
      while (c2 <= 32) {
        c2 = bytes[++i3];
      }
      switch (state) {
        case 0: {
          if (i3 === length) {
            return value;
          }
          break;
        }
        case 1: {
          object.push(value);
          if (c2 === 44) {
            i3++;
            continue;
          }
          if (c2 === 93) {
            continue;
          }
          break;
        }
        case 2: {
          if (property === null) {
            property = value;
            if (c2 === 58) {
              i3++;
              continue;
            }
          } else {
            object[property] = value;
            property = null;
            if (c2 === 44) {
              i3++;
              continue;
            }
            if (c2 === 125) {
              continue;
            }
          }
          break;
        }
      }
      break;
    }
    throwSyntaxError(bytes, i3);
  }
  var quote = JSON.stringify;
  var buildLogLevelDefault = "warning";
  var transformLogLevelDefault = "silent";
  function validateAndJoinStringArray(values, what) {
    const toJoin = [];
    for (const value of values) {
      validateStringValue(value, what);
      if (value.indexOf(",") >= 0)
        throw new Error(`Invalid ${what}: ${value}`);
      toJoin.push(value);
    }
    return toJoin.join(",");
  }
  var canBeAnything = () => null;
  var mustBeBoolean = (value) => typeof value === "boolean" ? null : "a boolean";
  var mustBeString = (value) => typeof value === "string" ? null : "a string";
  var mustBeRegExp = (value) => value instanceof RegExp ? null : "a RegExp object";
  var mustBeInteger = (value) => typeof value === "number" && value === (value | 0) ? null : "an integer";
  var mustBeValidPortNumber = (value) => typeof value === "number" && value === (value | 0) && value >= 0 && value <= 65535 ? null : "a valid port number";
  var mustBeFunction = (value) => typeof value === "function" ? null : "a function";
  var mustBeArray = (value) => Array.isArray(value) ? null : "an array";
  var mustBeArrayOfStrings = (value) => Array.isArray(value) && value.every((x) => typeof x === "string") ? null : "an array of strings";
  var mustBeObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? null : "an object";
  var mustBeEntryPoints = (value) => typeof value === "object" && value !== null ? null : "an array or an object";
  var mustBeWebAssemblyModule = (value) => value instanceof WebAssembly.Module ? null : "a WebAssembly.Module";
  var mustBeObjectOrNull = (value) => typeof value === "object" && !Array.isArray(value) ? null : "an object or null";
  var mustBeStringOrBoolean = (value) => typeof value === "string" || typeof value === "boolean" ? null : "a string or a boolean";
  var mustBeStringOrObject = (value) => typeof value === "string" || typeof value === "object" && value !== null && !Array.isArray(value) ? null : "a string or an object";
  var mustBeStringOrArrayOfStrings = (value) => typeof value === "string" || Array.isArray(value) && value.every((x) => typeof x === "string") ? null : "a string or an array of strings";
  var mustBeStringOrUint8Array = (value) => typeof value === "string" || value instanceof Uint8Array ? null : "a string or a Uint8Array";
  var mustBeStringOrURL = (value) => typeof value === "string" || value instanceof URL ? null : "a string or a URL";
  function getFlag(object, keys, key, mustBeFn) {
    let value = object[key];
    keys[key + ""] = true;
    if (value === undefined)
      return;
    let mustBe = mustBeFn(value);
    if (mustBe !== null)
      throw new Error(`${quote(key)} must be ${mustBe}`);
    return value;
  }
  function checkForInvalidFlags(object, keys, where) {
    for (let key in object) {
      if (!(key in keys)) {
        throw new Error(`Invalid option ${where}: ${quote(key)}`);
      }
    }
  }
  function validateInitializeOptions(options) {
    let keys = /* @__PURE__ */ Object.create(null);
    let wasmURL = getFlag(options, keys, "wasmURL", mustBeStringOrURL);
    let wasmModule = getFlag(options, keys, "wasmModule", mustBeWebAssemblyModule);
    let worker = getFlag(options, keys, "worker", mustBeBoolean);
    checkForInvalidFlags(options, keys, "in initialize() call");
    return {
      wasmURL,
      wasmModule,
      worker
    };
  }
  function validateMangleCache(mangleCache) {
    let validated;
    if (mangleCache !== undefined) {
      validated = /* @__PURE__ */ Object.create(null);
      for (let key in mangleCache) {
        let value = mangleCache[key];
        if (typeof value === "string" || value === false) {
          validated[key] = value;
        } else {
          throw new Error(`Expected ${quote(key)} in mangle cache to map to either a string or false`);
        }
      }
    }
    return validated;
  }
  function pushLogFlags(flags, options, keys, isTTY2, logLevelDefault) {
    let color = getFlag(options, keys, "color", mustBeBoolean);
    let logLevel = getFlag(options, keys, "logLevel", mustBeString);
    let logLimit = getFlag(options, keys, "logLimit", mustBeInteger);
    let logStyle = getFlag(options, keys, "logStyle", mustBeString);
    if (color !== undefined)
      flags.push(`--color=${color}`);
    else if (isTTY2)
      flags.push(`--color=true`);
    flags.push(`--log-level=${logLevel || logLevelDefault}`);
    flags.push(`--log-limit=${logLimit || 0}`);
    if (logStyle)
      flags.push(`--log-style=${logStyle}`);
  }
  function validateStringValue(value, what, key) {
    if (typeof value !== "string") {
      throw new Error(`Expected value for ${what}${key !== undefined ? " " + quote(key) : ""} to be a string, got ${typeof value} instead`);
    }
    return value;
  }
  function pushCommonFlags(flags, options, keys) {
    let legalComments = getFlag(options, keys, "legalComments", mustBeString);
    let sourceRoot = getFlag(options, keys, "sourceRoot", mustBeString);
    let sourcesContent = getFlag(options, keys, "sourcesContent", mustBeBoolean);
    let target = getFlag(options, keys, "target", mustBeStringOrArrayOfStrings);
    let format = getFlag(options, keys, "format", mustBeString);
    let globalName = getFlag(options, keys, "globalName", mustBeString);
    let mangleProps = getFlag(options, keys, "mangleProps", mustBeRegExp);
    let reserveProps = getFlag(options, keys, "reserveProps", mustBeRegExp);
    let mangleQuoted = getFlag(options, keys, "mangleQuoted", mustBeBoolean);
    let minify = getFlag(options, keys, "minify", mustBeBoolean);
    let minifySyntax = getFlag(options, keys, "minifySyntax", mustBeBoolean);
    let minifyWhitespace = getFlag(options, keys, "minifyWhitespace", mustBeBoolean);
    let minifyIdentifiers = getFlag(options, keys, "minifyIdentifiers", mustBeBoolean);
    let lineLimit = getFlag(options, keys, "lineLimit", mustBeInteger);
    let drop = getFlag(options, keys, "drop", mustBeArrayOfStrings);
    let dropLabels = getFlag(options, keys, "dropLabels", mustBeArrayOfStrings);
    let charset = getFlag(options, keys, "charset", mustBeString);
    let treeShaking = getFlag(options, keys, "treeShaking", mustBeBoolean);
    let ignoreAnnotations = getFlag(options, keys, "ignoreAnnotations", mustBeBoolean);
    let jsx = getFlag(options, keys, "jsx", mustBeString);
    let jsxFactory = getFlag(options, keys, "jsxFactory", mustBeString);
    let jsxFragment = getFlag(options, keys, "jsxFragment", mustBeString);
    let jsxImportSource = getFlag(options, keys, "jsxImportSource", mustBeString);
    let jsxDev = getFlag(options, keys, "jsxDev", mustBeBoolean);
    let jsxSideEffects = getFlag(options, keys, "jsxSideEffects", mustBeBoolean);
    let define = getFlag(options, keys, "define", mustBeObject);
    let logOverride = getFlag(options, keys, "logOverride", mustBeObject);
    let supported = getFlag(options, keys, "supported", mustBeObject);
    let pure = getFlag(options, keys, "pure", mustBeArrayOfStrings);
    let keepNames = getFlag(options, keys, "keepNames", mustBeBoolean);
    let platform = getFlag(options, keys, "platform", mustBeString);
    let tsconfigRaw = getFlag(options, keys, "tsconfigRaw", mustBeStringOrObject);
    let absPaths = getFlag(options, keys, "absPaths", mustBeArrayOfStrings);
    if (legalComments)
      flags.push(`--legal-comments=${legalComments}`);
    if (sourceRoot !== undefined)
      flags.push(`--source-root=${sourceRoot}`);
    if (sourcesContent !== undefined)
      flags.push(`--sources-content=${sourcesContent}`);
    if (target)
      flags.push(`--target=${validateAndJoinStringArray(Array.isArray(target) ? target : [target], "target")}`);
    if (format)
      flags.push(`--format=${format}`);
    if (globalName)
      flags.push(`--global-name=${globalName}`);
    if (platform)
      flags.push(`--platform=${platform}`);
    if (tsconfigRaw)
      flags.push(`--tsconfig-raw=${typeof tsconfigRaw === "string" ? tsconfigRaw : JSON.stringify(tsconfigRaw)}`);
    if (minify)
      flags.push("--minify");
    if (minifySyntax)
      flags.push("--minify-syntax");
    if (minifyWhitespace)
      flags.push("--minify-whitespace");
    if (minifyIdentifiers)
      flags.push("--minify-identifiers");
    if (lineLimit)
      flags.push(`--line-limit=${lineLimit}`);
    if (charset)
      flags.push(`--charset=${charset}`);
    if (treeShaking !== undefined)
      flags.push(`--tree-shaking=${treeShaking}`);
    if (ignoreAnnotations)
      flags.push(`--ignore-annotations`);
    if (drop)
      for (let what of drop)
        flags.push(`--drop:${validateStringValue(what, "drop")}`);
    if (dropLabels)
      flags.push(`--drop-labels=${validateAndJoinStringArray(dropLabels, "drop label")}`);
    if (absPaths)
      flags.push(`--abs-paths=${validateAndJoinStringArray(absPaths, "abs paths")}`);
    if (mangleProps)
      flags.push(`--mangle-props=${jsRegExpToGoRegExp(mangleProps)}`);
    if (reserveProps)
      flags.push(`--reserve-props=${jsRegExpToGoRegExp(reserveProps)}`);
    if (mangleQuoted !== undefined)
      flags.push(`--mangle-quoted=${mangleQuoted}`);
    if (jsx)
      flags.push(`--jsx=${jsx}`);
    if (jsxFactory)
      flags.push(`--jsx-factory=${jsxFactory}`);
    if (jsxFragment)
      flags.push(`--jsx-fragment=${jsxFragment}`);
    if (jsxImportSource)
      flags.push(`--jsx-import-source=${jsxImportSource}`);
    if (jsxDev)
      flags.push(`--jsx-dev`);
    if (jsxSideEffects)
      flags.push(`--jsx-side-effects`);
    if (define) {
      for (let key in define) {
        if (key.indexOf("=") >= 0)
          throw new Error(`Invalid define: ${key}`);
        flags.push(`--define:${key}=${validateStringValue(define[key], "define", key)}`);
      }
    }
    if (logOverride) {
      for (let key in logOverride) {
        if (key.indexOf("=") >= 0)
          throw new Error(`Invalid log override: ${key}`);
        flags.push(`--log-override:${key}=${validateStringValue(logOverride[key], "log override", key)}`);
      }
    }
    if (supported) {
      for (let key in supported) {
        if (key.indexOf("=") >= 0)
          throw new Error(`Invalid supported: ${key}`);
        const value = supported[key];
        if (typeof value !== "boolean")
          throw new Error(`Expected value for supported ${quote(key)} to be a boolean, got ${typeof value} instead`);
        flags.push(`--supported:${key}=${value}`);
      }
    }
    if (pure)
      for (let fn of pure)
        flags.push(`--pure:${validateStringValue(fn, "pure")}`);
    if (keepNames)
      flags.push(`--keep-names`);
  }
  function flagsForBuildOptions(callName, options, isTTY2, logLevelDefault, writeDefault) {
    var _a2;
    let flags = [];
    let entries = [];
    let keys = /* @__PURE__ */ Object.create(null);
    let stdinContents = null;
    let stdinResolveDir = null;
    pushLogFlags(flags, options, keys, isTTY2, logLevelDefault);
    pushCommonFlags(flags, options, keys);
    let sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
    let bundle = getFlag(options, keys, "bundle", mustBeBoolean);
    let splitting = getFlag(options, keys, "splitting", mustBeBoolean);
    let preserveSymlinks = getFlag(options, keys, "preserveSymlinks", mustBeBoolean);
    let metafile = getFlag(options, keys, "metafile", mustBeBoolean);
    let outfile = getFlag(options, keys, "outfile", mustBeString);
    let outdir = getFlag(options, keys, "outdir", mustBeString);
    let outbase = getFlag(options, keys, "outbase", mustBeString);
    let tsconfig = getFlag(options, keys, "tsconfig", mustBeString);
    let resolveExtensions = getFlag(options, keys, "resolveExtensions", mustBeArrayOfStrings);
    let nodePathsInput = getFlag(options, keys, "nodePaths", mustBeArrayOfStrings);
    let mainFields = getFlag(options, keys, "mainFields", mustBeArrayOfStrings);
    let conditions = getFlag(options, keys, "conditions", mustBeArrayOfStrings);
    let external = getFlag(options, keys, "external", mustBeArrayOfStrings);
    let packages = getFlag(options, keys, "packages", mustBeString);
    let alias = getFlag(options, keys, "alias", mustBeObject);
    let loader = getFlag(options, keys, "loader", mustBeObject);
    let outExtension = getFlag(options, keys, "outExtension", mustBeObject);
    let publicPath = getFlag(options, keys, "publicPath", mustBeString);
    let entryNames = getFlag(options, keys, "entryNames", mustBeString);
    let chunkNames = getFlag(options, keys, "chunkNames", mustBeString);
    let assetNames = getFlag(options, keys, "assetNames", mustBeString);
    let inject = getFlag(options, keys, "inject", mustBeArrayOfStrings);
    let banner = getFlag(options, keys, "banner", mustBeObject);
    let footer = getFlag(options, keys, "footer", mustBeObject);
    let entryPoints = getFlag(options, keys, "entryPoints", mustBeEntryPoints);
    let absWorkingDir = getFlag(options, keys, "absWorkingDir", mustBeString);
    let stdin = getFlag(options, keys, "stdin", mustBeObject);
    let write = (_a2 = getFlag(options, keys, "write", mustBeBoolean)) != null ? _a2 : writeDefault;
    let allowOverwrite = getFlag(options, keys, "allowOverwrite", mustBeBoolean);
    let mangleCache = getFlag(options, keys, "mangleCache", mustBeObject);
    keys.plugins = true;
    checkForInvalidFlags(options, keys, `in ${callName}() call`);
    if (sourcemap)
      flags.push(`--sourcemap${sourcemap === true ? "" : `=${sourcemap}`}`);
    if (bundle)
      flags.push("--bundle");
    if (allowOverwrite)
      flags.push("--allow-overwrite");
    if (splitting)
      flags.push("--splitting");
    if (preserveSymlinks)
      flags.push("--preserve-symlinks");
    if (metafile)
      flags.push(`--metafile`);
    if (outfile)
      flags.push(`--outfile=${outfile}`);
    if (outdir)
      flags.push(`--outdir=${outdir}`);
    if (outbase)
      flags.push(`--outbase=${outbase}`);
    if (tsconfig)
      flags.push(`--tsconfig=${tsconfig}`);
    if (packages)
      flags.push(`--packages=${packages}`);
    if (resolveExtensions)
      flags.push(`--resolve-extensions=${validateAndJoinStringArray(resolveExtensions, "resolve extension")}`);
    if (publicPath)
      flags.push(`--public-path=${publicPath}`);
    if (entryNames)
      flags.push(`--entry-names=${entryNames}`);
    if (chunkNames)
      flags.push(`--chunk-names=${chunkNames}`);
    if (assetNames)
      flags.push(`--asset-names=${assetNames}`);
    if (mainFields)
      flags.push(`--main-fields=${validateAndJoinStringArray(mainFields, "main field")}`);
    if (conditions)
      flags.push(`--conditions=${validateAndJoinStringArray(conditions, "condition")}`);
    if (external)
      for (let name of external)
        flags.push(`--external:${validateStringValue(name, "external")}`);
    if (alias) {
      for (let old in alias) {
        if (old.indexOf("=") >= 0)
          throw new Error(`Invalid package name in alias: ${old}`);
        flags.push(`--alias:${old}=${validateStringValue(alias[old], "alias", old)}`);
      }
    }
    if (banner) {
      for (let type in banner) {
        if (type.indexOf("=") >= 0)
          throw new Error(`Invalid banner file type: ${type}`);
        flags.push(`--banner:${type}=${validateStringValue(banner[type], "banner", type)}`);
      }
    }
    if (footer) {
      for (let type in footer) {
        if (type.indexOf("=") >= 0)
          throw new Error(`Invalid footer file type: ${type}`);
        flags.push(`--footer:${type}=${validateStringValue(footer[type], "footer", type)}`);
      }
    }
    if (inject)
      for (let path32 of inject)
        flags.push(`--inject:${validateStringValue(path32, "inject")}`);
    if (loader) {
      for (let ext in loader) {
        if (ext.indexOf("=") >= 0)
          throw new Error(`Invalid loader extension: ${ext}`);
        flags.push(`--loader:${ext}=${validateStringValue(loader[ext], "loader", ext)}`);
      }
    }
    if (outExtension) {
      for (let ext in outExtension) {
        if (ext.indexOf("=") >= 0)
          throw new Error(`Invalid out extension: ${ext}`);
        flags.push(`--out-extension:${ext}=${validateStringValue(outExtension[ext], "out extension", ext)}`);
      }
    }
    if (entryPoints) {
      if (Array.isArray(entryPoints)) {
        for (let i3 = 0, n3 = entryPoints.length;i3 < n3; i3++) {
          let entryPoint = entryPoints[i3];
          if (typeof entryPoint === "object" && entryPoint !== null) {
            let entryPointKeys = /* @__PURE__ */ Object.create(null);
            let input = getFlag(entryPoint, entryPointKeys, "in", mustBeString);
            let output = getFlag(entryPoint, entryPointKeys, "out", mustBeString);
            checkForInvalidFlags(entryPoint, entryPointKeys, "in entry point at index " + i3);
            if (input === undefined)
              throw new Error('Missing property "in" for entry point at index ' + i3);
            if (output === undefined)
              throw new Error('Missing property "out" for entry point at index ' + i3);
            entries.push([output, input]);
          } else {
            entries.push(["", validateStringValue(entryPoint, "entry point at index " + i3)]);
          }
        }
      } else {
        for (let key in entryPoints) {
          entries.push([key, validateStringValue(entryPoints[key], "entry point", key)]);
        }
      }
    }
    if (stdin) {
      let stdinKeys = /* @__PURE__ */ Object.create(null);
      let contents = getFlag(stdin, stdinKeys, "contents", mustBeStringOrUint8Array);
      let resolveDir = getFlag(stdin, stdinKeys, "resolveDir", mustBeString);
      let sourcefile = getFlag(stdin, stdinKeys, "sourcefile", mustBeString);
      let loader2 = getFlag(stdin, stdinKeys, "loader", mustBeString);
      checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object');
      if (sourcefile)
        flags.push(`--sourcefile=${sourcefile}`);
      if (loader2)
        flags.push(`--loader=${loader2}`);
      if (resolveDir)
        stdinResolveDir = resolveDir;
      if (typeof contents === "string")
        stdinContents = encodeUTF8(contents);
      else if (contents instanceof Uint8Array)
        stdinContents = contents;
    }
    let nodePaths = [];
    if (nodePathsInput) {
      for (let value of nodePathsInput) {
        value += "";
        nodePaths.push(value);
      }
    }
    return {
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir,
      nodePaths,
      mangleCache: validateMangleCache(mangleCache)
    };
  }
  function flagsForTransformOptions(callName, options, isTTY2, logLevelDefault) {
    let flags = [];
    let keys = /* @__PURE__ */ Object.create(null);
    pushLogFlags(flags, options, keys, isTTY2, logLevelDefault);
    pushCommonFlags(flags, options, keys);
    let sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
    let sourcefile = getFlag(options, keys, "sourcefile", mustBeString);
    let loader = getFlag(options, keys, "loader", mustBeString);
    let banner = getFlag(options, keys, "banner", mustBeString);
    let footer = getFlag(options, keys, "footer", mustBeString);
    let mangleCache = getFlag(options, keys, "mangleCache", mustBeObject);
    checkForInvalidFlags(options, keys, `in ${callName}() call`);
    if (sourcemap)
      flags.push(`--sourcemap=${sourcemap === true ? "external" : sourcemap}`);
    if (sourcefile)
      flags.push(`--sourcefile=${sourcefile}`);
    if (loader)
      flags.push(`--loader=${loader}`);
    if (banner)
      flags.push(`--banner=${banner}`);
    if (footer)
      flags.push(`--footer=${footer}`);
    return {
      flags,
      mangleCache: validateMangleCache(mangleCache)
    };
  }
  function createChannel(streamIn) {
    const requestCallbacksByKey = {};
    const closeData = { didClose: false, reason: "" };
    let responseCallbacks = {};
    let nextRequestID = 0;
    let nextBuildKey = 0;
    let stdout = new Uint8Array(16 * 1024);
    let stdoutUsed = 0;
    let readFromStdout = (chunk) => {
      let limit = stdoutUsed + chunk.length;
      if (limit > stdout.length) {
        let swap = new Uint8Array(limit * 2);
        swap.set(stdout);
        stdout = swap;
      }
      stdout.set(chunk, stdoutUsed);
      stdoutUsed += chunk.length;
      let offset = 0;
      while (offset + 4 <= stdoutUsed) {
        let length = readUInt32LE(stdout, offset);
        if (offset + 4 + length > stdoutUsed) {
          break;
        }
        offset += 4;
        handleIncomingPacket(stdout.subarray(offset, offset + length));
        offset += length;
      }
      if (offset > 0) {
        stdout.copyWithin(0, offset, stdoutUsed);
        stdoutUsed -= offset;
      }
    };
    let afterClose = (error) => {
      closeData.didClose = true;
      if (error)
        closeData.reason = ": " + (error.message || error);
      const text = "The service was stopped" + closeData.reason;
      for (let id in responseCallbacks) {
        responseCallbacks[id](text, null);
      }
      responseCallbacks = {};
    };
    let sendRequest = (refs, value, callback) => {
      if (closeData.didClose)
        return callback("The service is no longer running" + closeData.reason, null);
      let id = nextRequestID++;
      responseCallbacks[id] = (error, response) => {
        try {
          callback(error, response);
        } finally {
          if (refs)
            refs.unref();
        }
      };
      if (refs)
        refs.ref();
      streamIn.writeToStdin(encodePacket({ id, isRequest: true, value }));
    };
    let sendResponse = (id, value) => {
      if (closeData.didClose)
        throw new Error("The service is no longer running" + closeData.reason);
      streamIn.writeToStdin(encodePacket({ id, isRequest: false, value }));
    };
    let handleRequest = async (id, request) => {
      try {
        if (request.command === "ping") {
          sendResponse(id, {});
          return;
        }
        if (typeof request.key === "number") {
          const requestCallbacks = requestCallbacksByKey[request.key];
          if (!requestCallbacks) {
            return;
          }
          const callback = requestCallbacks[request.command];
          if (callback) {
            await callback(id, request);
            return;
          }
        }
        throw new Error(`Invalid command: ` + request.command);
      } catch (e2) {
        const errors = [extractErrorMessageV8(e2, streamIn, null, undefined, "")];
        try {
          sendResponse(id, { errors });
        } catch {}
      }
    };
    let isFirstPacket = true;
    let handleIncomingPacket = (bytes) => {
      if (isFirstPacket) {
        isFirstPacket = false;
        let binaryVersion = String.fromCharCode(...bytes);
        if (binaryVersion !== "0.28.2") {
          throw new Error(`Cannot start service: Host version "${"0.28.2"}" does not match binary version ${quote(binaryVersion)}`);
        }
        return;
      }
      let packet = decodePacket(bytes);
      if (packet.isRequest) {
        handleRequest(packet.id, packet.value);
      } else {
        let callback = responseCallbacks[packet.id];
        delete responseCallbacks[packet.id];
        if (packet.value.error)
          callback(packet.value.error, {});
        else
          callback(null, packet.value);
      }
    };
    let buildOrContext = ({ callName, refs, options, isTTY: isTTY2, defaultWD: defaultWD2, callback }) => {
      let refCount = 0;
      const buildKey = nextBuildKey++;
      const requestCallbacks = {};
      const buildRefs = {
        ref() {
          if (++refCount === 1) {
            if (refs)
              refs.ref();
          }
        },
        unref() {
          if (--refCount === 0) {
            delete requestCallbacksByKey[buildKey];
            if (refs)
              refs.unref();
          }
        }
      };
      requestCallbacksByKey[buildKey] = requestCallbacks;
      buildRefs.ref();
      buildOrContextImpl(callName, buildKey, sendRequest, sendResponse, buildRefs, streamIn, requestCallbacks, options, isTTY2, defaultWD2, (err, res) => {
        try {
          callback(err, res);
        } finally {
          buildRefs.unref();
        }
      });
    };
    let transform2 = ({ callName, refs, input, options, isTTY: isTTY2, fs: fs3, callback }) => {
      const details = createObjectStash();
      let start = (inputPath) => {
        try {
          if (typeof input !== "string" && !(input instanceof Uint8Array))
            throw new Error('The input to "transform" must be a string or a Uint8Array');
          let {
            flags,
            mangleCache
          } = flagsForTransformOptions(callName, options, isTTY2, transformLogLevelDefault);
          let request = {
            command: "transform",
            flags,
            inputFS: inputPath !== null,
            input: inputPath !== null ? encodeUTF8(inputPath) : typeof input === "string" ? encodeUTF8(input) : input
          };
          if (mangleCache)
            request.mangleCache = mangleCache;
          sendRequest(refs, request, (error, response) => {
            if (error)
              return callback(new Error(error), null);
            let errors = replaceDetailsInMessages(response.errors, details);
            let warnings = replaceDetailsInMessages(response.warnings, details);
            let outstanding = 1;
            let next = () => {
              if (--outstanding === 0) {
                let result = {
                  warnings,
                  code: response.code,
                  map: response.map,
                  mangleCache: undefined,
                  legalComments: undefined
                };
                if ("legalComments" in response)
                  result.legalComments = response == null ? undefined : response.legalComments;
                if (response.mangleCache)
                  result.mangleCache = response == null ? undefined : response.mangleCache;
                callback(null, result);
              }
            };
            if (errors.length > 0)
              return callback(failureErrorWithLog("Transform failed", errors, warnings), null);
            if (response.codeFS) {
              outstanding++;
              fs3.readFile(response.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response.code = contents;
                  next();
                }
              });
            }
            if (response.mapFS) {
              outstanding++;
              fs3.readFile(response.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response.map = contents;
                  next();
                }
              });
            }
            next();
          });
        } catch (e2) {
          let flags = [];
          try {
            pushLogFlags(flags, options, {}, isTTY2, transformLogLevelDefault);
          } catch {}
          const error = extractErrorMessageV8(e2, streamIn, details, undefined, "");
          sendRequest(refs, { command: "error", flags, error }, () => {
            error.detail = details.load(error.detail);
            callback(failureErrorWithLog("Transform failed", [error], []), null);
          });
        }
      };
      if ((typeof input === "string" || input instanceof Uint8Array) && input.length > 1024 * 1024) {
        let next = start;
        start = () => fs3.writeFile(input, next);
      }
      start(null);
    };
    let formatMessages2 = ({ callName, refs, messages, options, callback }) => {
      if (!options)
        throw new Error(`Missing second argument in ${callName}() call`);
      let keys = {};
      let kind = getFlag(options, keys, "kind", mustBeString);
      let color = getFlag(options, keys, "color", mustBeBoolean);
      let terminalWidth = getFlag(options, keys, "terminalWidth", mustBeInteger);
      let logStyle = getFlag(options, keys, "logStyle", mustBeString);
      checkForInvalidFlags(options, keys, `in ${callName}() call`);
      if (kind === undefined)
        throw new Error(`Missing "kind" in ${callName}() call`);
      if (kind !== "error" && kind !== "warning")
        throw new Error(`Expected "kind" to be "error" or "warning" in ${callName}() call`);
      let request = {
        command: "format-msgs",
        messages: sanitizeMessages(messages, "messages", null, "", terminalWidth),
        isWarning: kind === "warning"
      };
      if (color !== undefined)
        request.color = color;
      if (terminalWidth !== undefined)
        request.terminalWidth = terminalWidth;
      if (logStyle !== undefined)
        request.logStyle = logStyle;
      sendRequest(refs, request, (error, response) => {
        if (error)
          return callback(new Error(error), null);
        callback(null, response.messages);
      });
    };
    let analyzeMetafile2 = ({ callName, refs, metafile, options, callback }) => {
      if (options === undefined)
        options = {};
      let keys = {};
      let color = getFlag(options, keys, "color", mustBeBoolean);
      let verbose = getFlag(options, keys, "verbose", mustBeBoolean);
      checkForInvalidFlags(options, keys, `in ${callName}() call`);
      let request = {
        command: "analyze-metafile",
        metafile
      };
      if (color !== undefined)
        request.color = color;
      if (verbose !== undefined)
        request.verbose = verbose;
      sendRequest(refs, request, (error, response) => {
        if (error)
          return callback(new Error(error), null);
        callback(null, response.result);
      });
    };
    return {
      readFromStdout,
      afterClose,
      service: {
        buildOrContext,
        transform: transform2,
        formatMessages: formatMessages2,
        analyzeMetafile: analyzeMetafile2
      }
    };
  }
  function buildOrContextImpl(callName, buildKey, sendRequest, sendResponse, refs, streamIn, requestCallbacks, options, isTTY2, defaultWD2, callback) {
    const details = createObjectStash();
    const isContext = callName === "context";
    const handleError = (e2, pluginName) => {
      const flags = [];
      try {
        pushLogFlags(flags, options, {}, isTTY2, buildLogLevelDefault);
      } catch {}
      const message = extractErrorMessageV8(e2, streamIn, details, undefined, pluginName);
      sendRequest(refs, { command: "error", flags, error: message }, () => {
        message.detail = details.load(message.detail);
        callback(failureErrorWithLog(isContext ? "Context failed" : "Build failed", [message], []), null);
      });
    };
    let plugins;
    if (typeof options === "object") {
      const value = options.plugins;
      if (value !== undefined) {
        if (!Array.isArray(value))
          return handleError(new Error(`"plugins" must be an array`), "");
        plugins = value;
      }
    }
    if (plugins && plugins.length > 0) {
      if (streamIn.isSync)
        return handleError(new Error("Cannot use plugins in synchronous API calls"), "");
      handlePlugins(buildKey, sendRequest, sendResponse, refs, streamIn, requestCallbacks, options, plugins, details).then((result) => {
        if (!result.ok)
          return handleError(result.error, result.pluginName);
        try {
          buildOrContextContinue(result.requestPlugins, result.runOnEndCallbacks, result.scheduleOnDisposeCallbacks);
        } catch (e2) {
          handleError(e2, "");
        }
      }, (e2) => handleError(e2, ""));
      return;
    }
    try {
      buildOrContextContinue(null, (result, done) => done([], []), () => {});
    } catch (e2) {
      handleError(e2, "");
    }
    function buildOrContextContinue(requestPlugins, runOnEndCallbacks, scheduleOnDisposeCallbacks) {
      const writeDefault = streamIn.hasFS;
      const {
        entries,
        flags,
        write,
        stdinContents,
        stdinResolveDir,
        absWorkingDir,
        nodePaths,
        mangleCache
      } = flagsForBuildOptions(callName, options, isTTY2, buildLogLevelDefault, writeDefault);
      if (write && !streamIn.hasFS)
        throw new Error(`The "write" option is unavailable in this environment`);
      const request = {
        command: "build",
        key: buildKey,
        entries,
        flags,
        write,
        stdinContents,
        stdinResolveDir,
        absWorkingDir: absWorkingDir || defaultWD2,
        nodePaths,
        context: isContext
      };
      if (requestPlugins)
        request.plugins = requestPlugins;
      if (mangleCache)
        request.mangleCache = mangleCache;
      const buildResponseToResult = (response, callback2) => {
        const result = {
          errors: replaceDetailsInMessages(response.errors, details),
          warnings: replaceDetailsInMessages(response.warnings, details),
          outputFiles: undefined,
          metafile: undefined,
          mangleCache: undefined
        };
        const originalErrors = result.errors.slice();
        const originalWarnings = result.warnings.slice();
        if (response.outputFiles)
          result.outputFiles = response.outputFiles.map(convertOutputFiles);
        if (response.metafile && response.metafile.length)
          result.metafile = parseJSON(response.metafile);
        if (response.mangleCache)
          result.mangleCache = response.mangleCache;
        if (response.writeToStdout !== undefined)
          console.log(decodeUTF8(response.writeToStdout).replace(/\n$/, ""));
        runOnEndCallbacks(result, (onEndErrors, onEndWarnings) => {
          if (originalErrors.length > 0 || onEndErrors.length > 0) {
            const error = failureErrorWithLog("Build failed", originalErrors.concat(onEndErrors), originalWarnings.concat(onEndWarnings));
            return callback2(error, null, onEndErrors, onEndWarnings);
          }
          callback2(null, result, onEndErrors, onEndWarnings);
        });
      };
      let latestResultPromise;
      let provideLatestResult;
      if (isContext)
        requestCallbacks["on-end"] = (id, request2) => new Promise((resolve) => {
          buildResponseToResult(request2, (err, result, onEndErrors, onEndWarnings) => {
            const response = {
              errors: onEndErrors,
              warnings: onEndWarnings
            };
            if (provideLatestResult)
              provideLatestResult(err, result);
            latestResultPromise = undefined;
            provideLatestResult = undefined;
            sendResponse(id, response);
            resolve();
          });
        });
      sendRequest(refs, request, (error, response) => {
        if (error)
          return callback(new Error(error), null);
        if (!isContext) {
          return buildResponseToResult(response, (err, res) => {
            scheduleOnDisposeCallbacks();
            return callback(err, res);
          });
        }
        if (response.errors.length > 0) {
          return callback(failureErrorWithLog("Context failed", response.errors, response.warnings), null);
        }
        let didDispose = false;
        const result = {
          rebuild: () => {
            if (!latestResultPromise)
              latestResultPromise = new Promise((resolve, reject) => {
                let settlePromise;
                provideLatestResult = (err, result2) => {
                  if (!settlePromise)
                    settlePromise = () => err ? reject(err) : resolve(result2);
                };
                const triggerAnotherBuild = () => {
                  const request2 = {
                    command: "rebuild",
                    key: buildKey
                  };
                  sendRequest(refs, request2, (error2, response2) => {
                    if (error2) {
                      reject(new Error(error2));
                    } else if (settlePromise) {
                      settlePromise();
                    } else {
                      triggerAnotherBuild();
                    }
                  });
                };
                triggerAnotherBuild();
              });
            return latestResultPromise;
          },
          watch: (options2 = {}) => new Promise((resolve, reject) => {
            if (!streamIn.hasFS)
              throw new Error(`Cannot use the "watch" API in this environment`);
            const keys = {};
            const delay = getFlag(options2, keys, "delay", mustBeInteger);
            checkForInvalidFlags(options2, keys, `in watch() call`);
            const request2 = {
              command: "watch",
              key: buildKey
            };
            if (delay)
              request2.delay = delay;
            sendRequest(refs, request2, (error2) => {
              if (error2)
                reject(new Error(error2));
              else
                resolve(undefined);
            });
          }),
          serve: (options2 = {}) => new Promise((resolve, reject) => {
            if (!streamIn.hasFS)
              throw new Error(`Cannot use the "serve" API in this environment`);
            const keys = {};
            const port = getFlag(options2, keys, "port", mustBeValidPortNumber);
            const host = getFlag(options2, keys, "host", mustBeString);
            const servedir = getFlag(options2, keys, "servedir", mustBeString);
            const keyfile = getFlag(options2, keys, "keyfile", mustBeString);
            const certfile = getFlag(options2, keys, "certfile", mustBeString);
            const fallback = getFlag(options2, keys, "fallback", mustBeString);
            const cors = getFlag(options2, keys, "cors", mustBeObject);
            const onRequest = getFlag(options2, keys, "onRequest", mustBeFunction);
            checkForInvalidFlags(options2, keys, `in serve() call`);
            const request2 = {
              command: "serve",
              key: buildKey,
              onRequest: !!onRequest
            };
            if (port !== undefined)
              request2.port = port;
            if (host !== undefined)
              request2.host = host;
            if (servedir !== undefined)
              request2.servedir = servedir;
            if (keyfile !== undefined)
              request2.keyfile = keyfile;
            if (certfile !== undefined)
              request2.certfile = certfile;
            if (fallback !== undefined)
              request2.fallback = fallback;
            if (cors) {
              const corsKeys = {};
              const origin = getFlag(cors, corsKeys, "origin", mustBeStringOrArrayOfStrings);
              checkForInvalidFlags(cors, corsKeys, `on "cors" object`);
              if (Array.isArray(origin))
                request2.corsOrigin = origin;
              else if (origin !== undefined)
                request2.corsOrigin = [origin];
            }
            sendRequest(refs, request2, (error2, response2) => {
              if (error2)
                return reject(new Error(error2));
              if (onRequest) {
                requestCallbacks["serve-request"] = (id, request3) => {
                  onRequest(request3.args);
                  sendResponse(id, {});
                };
              }
              resolve(response2);
            });
          }),
          cancel: () => new Promise((resolve) => {
            if (didDispose)
              return resolve();
            const request2 = {
              command: "cancel",
              key: buildKey
            };
            sendRequest(refs, request2, () => {
              resolve();
            });
          }),
          dispose: () => new Promise((resolve) => {
            if (didDispose)
              return resolve();
            didDispose = true;
            const request2 = {
              command: "dispose",
              key: buildKey
            };
            sendRequest(refs, request2, () => {
              resolve();
              scheduleOnDisposeCallbacks();
              refs.unref();
            });
          })
        };
        refs.ref();
        callback(null, result);
      });
    }
  }
  var handlePlugins = async (buildKey, sendRequest, sendResponse, refs, streamIn, requestCallbacks, initialOptions, plugins, details) => {
    let onStartCallbacks = [];
    let onEndCallbacks = [];
    let onResolveCallbacks = {};
    let onLoadCallbacks = {};
    let onDisposeCallbacks = [];
    let nextCallbackID = 0;
    let i3 = 0;
    let requestPlugins = [];
    let isSetupDone = false;
    plugins = [...plugins];
    for (let item of plugins) {
      let keys = {};
      if (typeof item !== "object")
        throw new Error(`Plugin at index ${i3} must be an object`);
      const name = getFlag(item, keys, "name", mustBeString);
      if (typeof name !== "string" || name === "")
        throw new Error(`Plugin at index ${i3} is missing a name`);
      try {
        let setup = getFlag(item, keys, "setup", mustBeFunction);
        if (typeof setup !== "function")
          throw new Error(`Plugin is missing a setup function`);
        checkForInvalidFlags(item, keys, `on plugin ${quote(name)}`);
        let plugin = {
          name,
          onStart: false,
          onEnd: false,
          onResolve: [],
          onLoad: []
        };
        i3++;
        let resolve = (path32, options = {}) => {
          if (!isSetupDone)
            throw new Error('Cannot call "resolve" before plugin setup has completed');
          if (typeof path32 !== "string")
            throw new Error(`The path to resolve must be a string`);
          let keys2 = /* @__PURE__ */ Object.create(null);
          let pluginName = getFlag(options, keys2, "pluginName", mustBeString);
          let importer = getFlag(options, keys2, "importer", mustBeString);
          let namespace = getFlag(options, keys2, "namespace", mustBeString);
          let resolveDir = getFlag(options, keys2, "resolveDir", mustBeString);
          let kind = getFlag(options, keys2, "kind", mustBeString);
          let pluginData = getFlag(options, keys2, "pluginData", canBeAnything);
          let importAttributes = getFlag(options, keys2, "with", mustBeObject);
          checkForInvalidFlags(options, keys2, "in resolve() call");
          return new Promise((resolve2, reject) => {
            const request = {
              command: "resolve",
              path: path32,
              key: buildKey,
              pluginName: name
            };
            if (pluginName != null)
              request.pluginName = pluginName;
            if (importer != null)
              request.importer = importer;
            if (namespace != null)
              request.namespace = namespace;
            if (resolveDir != null)
              request.resolveDir = resolveDir;
            if (kind != null)
              request.kind = kind;
            else
              throw new Error(`Must specify "kind" when calling "resolve"`);
            if (pluginData != null)
              request.pluginData = details.store(pluginData);
            if (importAttributes != null)
              request.with = sanitizeStringMap(importAttributes, "with");
            sendRequest(refs, request, (error, response) => {
              if (error !== null)
                reject(new Error(error));
              else
                resolve2({
                  errors: replaceDetailsInMessages(response.errors, details),
                  warnings: replaceDetailsInMessages(response.warnings, details),
                  path: response.path,
                  external: response.external,
                  sideEffects: response.sideEffects,
                  namespace: response.namespace,
                  suffix: response.suffix,
                  pluginData: details.load(response.pluginData)
                });
            });
          });
        };
        let promise = setup({
          initialOptions,
          resolve,
          onStart(callback) {
            let registeredText = `This error came from the "onStart" callback registered here:`;
            let registeredNote = extractCallerV8(new Error(registeredText), streamIn, "onStart");
            onStartCallbacks.push({ name, callback, note: registeredNote });
            plugin.onStart = true;
          },
          onEnd(callback) {
            let registeredText = `This error came from the "onEnd" callback registered here:`;
            let registeredNote = extractCallerV8(new Error(registeredText), streamIn, "onEnd");
            onEndCallbacks.push({ name, callback, note: registeredNote });
            plugin.onEnd = true;
          },
          onResolve(options, callback) {
            let registeredText = `This error came from the "onResolve" callback registered here:`;
            let registeredNote = extractCallerV8(new Error(registeredText), streamIn, "onResolve");
            let keys2 = {};
            let filter = getFlag(options, keys2, "filter", mustBeRegExp);
            let namespace = getFlag(options, keys2, "namespace", mustBeString);
            checkForInvalidFlags(options, keys2, `in onResolve() call for plugin ${quote(name)}`);
            if (filter == null)
              throw new Error(`onResolve() call is missing a filter`);
            let id = nextCallbackID++;
            onResolveCallbacks[id] = { name, callback, note: registeredNote };
            plugin.onResolve.push({ id, filter: jsRegExpToGoRegExp(filter), namespace: namespace || "" });
          },
          onLoad(options, callback) {
            let registeredText = `This error came from the "onLoad" callback registered here:`;
            let registeredNote = extractCallerV8(new Error(registeredText), streamIn, "onLoad");
            let keys2 = {};
            let filter = getFlag(options, keys2, "filter", mustBeRegExp);
            let namespace = getFlag(options, keys2, "namespace", mustBeString);
            checkForInvalidFlags(options, keys2, `in onLoad() call for plugin ${quote(name)}`);
            if (filter == null)
              throw new Error(`onLoad() call is missing a filter`);
            let id = nextCallbackID++;
            onLoadCallbacks[id] = { name, callback, note: registeredNote };
            plugin.onLoad.push({ id, filter: jsRegExpToGoRegExp(filter), namespace: namespace || "" });
          },
          onDispose(callback) {
            onDisposeCallbacks.push(callback);
          },
          esbuild: streamIn.esbuild
        });
        if (promise)
          await promise;
        requestPlugins.push(plugin);
      } catch (e2) {
        return { ok: false, error: e2, pluginName: name };
      }
    }
    requestCallbacks["on-start"] = async (id, request) => {
      details.clear();
      let response = { errors: [], warnings: [] };
      await Promise.all(onStartCallbacks.map(async ({ name, callback, note }) => {
        try {
          let result = await callback();
          if (result != null) {
            if (typeof result !== "object")
              throw new Error(`Expected onStart() callback in plugin ${quote(name)} to return an object`);
            let keys = {};
            let errors = getFlag(result, keys, "errors", mustBeArray);
            let warnings = getFlag(result, keys, "warnings", mustBeArray);
            checkForInvalidFlags(result, keys, `from onStart() callback in plugin ${quote(name)}`);
            if (errors != null)
              response.errors.push(...sanitizeMessages(errors, "errors", details, name, undefined));
            if (warnings != null)
              response.warnings.push(...sanitizeMessages(warnings, "warnings", details, name, undefined));
          }
        } catch (e2) {
          response.errors.push(extractErrorMessageV8(e2, streamIn, details, note && note(), name));
        }
      }));
      sendResponse(id, response);
    };
    requestCallbacks["on-resolve"] = async (id, request) => {
      let response = {}, name = "", callback, note;
      for (let id2 of request.ids) {
        try {
          ({ name, callback, note } = onResolveCallbacks[id2]);
          let result = await callback({
            path: request.path,
            importer: request.importer,
            namespace: request.namespace,
            resolveDir: request.resolveDir,
            kind: request.kind,
            pluginData: details.load(request.pluginData),
            with: request.with
          });
          if (result != null) {
            if (typeof result !== "object")
              throw new Error(`Expected onResolve() callback in plugin ${quote(name)} to return an object`);
            let keys = {};
            let pluginName = getFlag(result, keys, "pluginName", mustBeString);
            let path32 = getFlag(result, keys, "path", mustBeString);
            let namespace = getFlag(result, keys, "namespace", mustBeString);
            let suffix = getFlag(result, keys, "suffix", mustBeString);
            let external = getFlag(result, keys, "external", mustBeBoolean);
            let sideEffects = getFlag(result, keys, "sideEffects", mustBeBoolean);
            let pluginData = getFlag(result, keys, "pluginData", canBeAnything);
            let errors = getFlag(result, keys, "errors", mustBeArray);
            let warnings = getFlag(result, keys, "warnings", mustBeArray);
            let watchFiles = getFlag(result, keys, "watchFiles", mustBeArrayOfStrings);
            let watchDirs = getFlag(result, keys, "watchDirs", mustBeArrayOfStrings);
            checkForInvalidFlags(result, keys, `from onResolve() callback in plugin ${quote(name)}`);
            response.id = id2;
            if (pluginName != null)
              response.pluginName = pluginName;
            if (path32 != null)
              response.path = path32;
            if (namespace != null)
              response.namespace = namespace;
            if (suffix != null)
              response.suffix = suffix;
            if (external != null)
              response.external = external;
            if (sideEffects != null)
              response.sideEffects = sideEffects;
            if (pluginData != null)
              response.pluginData = details.store(pluginData);
            if (errors != null)
              response.errors = sanitizeMessages(errors, "errors", details, name, undefined);
            if (warnings != null)
              response.warnings = sanitizeMessages(warnings, "warnings", details, name, undefined);
            if (watchFiles != null)
              response.watchFiles = sanitizeStringArray(watchFiles, "watchFiles");
            if (watchDirs != null)
              response.watchDirs = sanitizeStringArray(watchDirs, "watchDirs");
            break;
          }
        } catch (e2) {
          response = { id: id2, errors: [extractErrorMessageV8(e2, streamIn, details, note && note(), name)] };
          break;
        }
      }
      sendResponse(id, response);
    };
    requestCallbacks["on-load"] = async (id, request) => {
      let response = {}, name = "", callback, note;
      for (let id2 of request.ids) {
        try {
          ({ name, callback, note } = onLoadCallbacks[id2]);
          let result = await callback({
            path: request.path,
            namespace: request.namespace,
            suffix: request.suffix,
            pluginData: details.load(request.pluginData),
            with: request.with
          });
          if (result != null) {
            if (typeof result !== "object")
              throw new Error(`Expected onLoad() callback in plugin ${quote(name)} to return an object`);
            let keys = {};
            let pluginName = getFlag(result, keys, "pluginName", mustBeString);
            let contents = getFlag(result, keys, "contents", mustBeStringOrUint8Array);
            let resolveDir = getFlag(result, keys, "resolveDir", mustBeString);
            let pluginData = getFlag(result, keys, "pluginData", canBeAnything);
            let loader = getFlag(result, keys, "loader", mustBeString);
            let errors = getFlag(result, keys, "errors", mustBeArray);
            let warnings = getFlag(result, keys, "warnings", mustBeArray);
            let watchFiles = getFlag(result, keys, "watchFiles", mustBeArrayOfStrings);
            let watchDirs = getFlag(result, keys, "watchDirs", mustBeArrayOfStrings);
            checkForInvalidFlags(result, keys, `from onLoad() callback in plugin ${quote(name)}`);
            response.id = id2;
            if (pluginName != null)
              response.pluginName = pluginName;
            if (contents instanceof Uint8Array)
              response.contents = contents;
            else if (contents != null)
              response.contents = encodeUTF8(contents);
            if (resolveDir != null)
              response.resolveDir = resolveDir;
            if (pluginData != null)
              response.pluginData = details.store(pluginData);
            if (loader != null)
              response.loader = loader;
            if (errors != null)
              response.errors = sanitizeMessages(errors, "errors", details, name, undefined);
            if (warnings != null)
              response.warnings = sanitizeMessages(warnings, "warnings", details, name, undefined);
            if (watchFiles != null)
              response.watchFiles = sanitizeStringArray(watchFiles, "watchFiles");
            if (watchDirs != null)
              response.watchDirs = sanitizeStringArray(watchDirs, "watchDirs");
            break;
          }
        } catch (e2) {
          response = { id: id2, errors: [extractErrorMessageV8(e2, streamIn, details, note && note(), name)] };
          break;
        }
      }
      sendResponse(id, response);
    };
    let runOnEndCallbacks = (result, done) => done([], []);
    if (onEndCallbacks.length > 0) {
      runOnEndCallbacks = (result, done) => {
        (async () => {
          const onEndErrors = [];
          const onEndWarnings = [];
          for (const { name, callback, note } of onEndCallbacks) {
            let newErrors;
            let newWarnings;
            try {
              const value = await callback(result);
              if (value != null) {
                if (typeof value !== "object")
                  throw new Error(`Expected onEnd() callback in plugin ${quote(name)} to return an object`);
                let keys = {};
                let errors = getFlag(value, keys, "errors", mustBeArray);
                let warnings = getFlag(value, keys, "warnings", mustBeArray);
                checkForInvalidFlags(value, keys, `from onEnd() callback in plugin ${quote(name)}`);
                if (errors != null)
                  newErrors = sanitizeMessages(errors, "errors", details, name, undefined);
                if (warnings != null)
                  newWarnings = sanitizeMessages(warnings, "warnings", details, name, undefined);
              }
            } catch (e2) {
              newErrors = [extractErrorMessageV8(e2, streamIn, details, note && note(), name)];
            }
            if (newErrors) {
              onEndErrors.push(...newErrors);
              try {
                result.errors.push(...newErrors);
              } catch {}
            }
            if (newWarnings) {
              onEndWarnings.push(...newWarnings);
              try {
                result.warnings.push(...newWarnings);
              } catch {}
            }
          }
          done(onEndErrors, onEndWarnings);
        })();
      };
    }
    let scheduleOnDisposeCallbacks = () => {
      for (const cb of onDisposeCallbacks) {
        setTimeout(() => cb(), 0);
      }
    };
    isSetupDone = true;
    return {
      ok: true,
      requestPlugins,
      runOnEndCallbacks,
      scheduleOnDisposeCallbacks
    };
  };
  function createObjectStash() {
    const map = /* @__PURE__ */ new Map;
    let nextID = 0;
    return {
      clear() {
        map.clear();
      },
      load(id) {
        return map.get(id);
      },
      store(value) {
        if (value === undefined)
          return -1;
        const id = nextID++;
        map.set(id, value);
        return id;
      }
    };
  }
  function extractCallerV8(e2, streamIn, ident) {
    let note;
    let tried = false;
    return () => {
      if (tried)
        return note;
      tried = true;
      try {
        let lines = (e2.stack + "").split(`
`);
        lines.splice(1, 1);
        let location2 = parseStackLinesV8(streamIn, lines, ident);
        if (location2) {
          note = { text: e2.message, location: location2 };
          return note;
        }
      } catch {}
    };
  }
  function extractErrorMessageV8(e2, streamIn, stash, note, pluginName) {
    let text = "Internal error";
    let location2 = null;
    try {
      text = (e2 && e2.message || e2) + "";
    } catch {}
    try {
      location2 = parseStackLinesV8(streamIn, (e2.stack + "").split(`
`), "");
    } catch {}
    return { id: "", pluginName, text, location: location2, notes: note ? [note] : [], detail: stash ? stash.store(e2) : -1 };
  }
  function parseStackLinesV8(streamIn, lines, ident) {
    let at = "    at ";
    if (streamIn.readFileSync && !lines[0].startsWith(at) && lines[1].startsWith(at)) {
      for (let i3 = 1;i3 < lines.length; i3++) {
        let line = lines[i3];
        if (!line.startsWith(at))
          continue;
        line = line.slice(at.length);
        while (true) {
          let match = /^(?:new |async )?\S+ \((.*)\)$/.exec(line);
          if (match) {
            line = match[1];
            continue;
          }
          match = /^eval at \S+ \((.*)\)(?:, \S+:\d+:\d+)?$/.exec(line);
          if (match) {
            line = match[1];
            continue;
          }
          match = /^(\S+):(\d+):(\d+)$/.exec(line);
          if (match) {
            let contents;
            try {
              contents = streamIn.readFileSync(match[1], "utf8");
            } catch {
              break;
            }
            let lineText = contents.split(/\r\n|\r|\n|\u2028|\u2029/)[+match[2] - 1] || "";
            let column = +match[3] - 1;
            let length = lineText.slice(column, column + ident.length) === ident ? ident.length : 0;
            return {
              file: match[1],
              namespace: "file",
              line: +match[2],
              column: encodeUTF8(lineText.slice(0, column)).length,
              length: encodeUTF8(lineText.slice(column, column + length)).length,
              lineText: lineText + `
` + lines.slice(1).join(`
`),
              suggestion: ""
            };
          }
          break;
        }
      }
    }
    return null;
  }
  function failureErrorWithLog(text, errors, warnings) {
    let limit = 5;
    text += errors.length < 1 ? "" : ` with ${errors.length} error${errors.length < 2 ? "" : "s"}:` + errors.slice(0, limit + 1).map((e2, i3) => {
      if (i3 === limit)
        return `
...`;
      if (!e2.location)
        return `
error: ${e2.text}`;
      let { file, line, column } = e2.location;
      let pluginText = e2.pluginName ? `[plugin: ${e2.pluginName}] ` : "";
      return `
${file}:${line}:${column}: ERROR: ${pluginText}${e2.text}`;
    }).join("");
    let error = new Error(text);
    for (const [key, value] of [["errors", errors], ["warnings", warnings]]) {
      Object.defineProperty(error, key, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (value2) => Object.defineProperty(error, key, {
          configurable: true,
          enumerable: true,
          value: value2
        })
      });
    }
    return error;
  }
  function replaceDetailsInMessages(messages, stash) {
    for (const message of messages) {
      message.detail = stash.load(message.detail);
    }
    return messages;
  }
  function sanitizeLocation(location2, where, terminalWidth) {
    if (location2 == null)
      return null;
    let keys = {};
    let file = getFlag(location2, keys, "file", mustBeString);
    let namespace = getFlag(location2, keys, "namespace", mustBeString);
    let line = getFlag(location2, keys, "line", mustBeInteger);
    let column = getFlag(location2, keys, "column", mustBeInteger);
    let length = getFlag(location2, keys, "length", mustBeInteger);
    let lineText = getFlag(location2, keys, "lineText", mustBeString);
    let suggestion = getFlag(location2, keys, "suggestion", mustBeString);
    checkForInvalidFlags(location2, keys, where);
    if (lineText) {
      const relevantASCII = lineText.slice(0, (column && column > 0 ? column : 0) + (length && length > 0 ? length : 0) + (terminalWidth && terminalWidth > 0 ? terminalWidth : 80));
      if (!/[\x7F-\uFFFF]/.test(relevantASCII) && !/\n/.test(lineText)) {
        lineText = relevantASCII;
      }
    }
    return {
      file: file || "",
      namespace: namespace || "",
      line: line || 0,
      column: column || 0,
      length: length || 0,
      lineText: lineText || "",
      suggestion: suggestion || ""
    };
  }
  function sanitizeMessages(messages, property, stash, fallbackPluginName, terminalWidth) {
    let messagesClone = [];
    let index = 0;
    for (const message of messages) {
      let keys = {};
      let id = getFlag(message, keys, "id", mustBeString);
      let pluginName = getFlag(message, keys, "pluginName", mustBeString);
      let text = getFlag(message, keys, "text", mustBeString);
      let location2 = getFlag(message, keys, "location", mustBeObjectOrNull);
      let notes = getFlag(message, keys, "notes", mustBeArray);
      let detail = getFlag(message, keys, "detail", canBeAnything);
      let where = `in element ${index} of "${property}"`;
      checkForInvalidFlags(message, keys, where);
      let notesClone = [];
      if (notes) {
        for (const note of notes) {
          let noteKeys = {};
          let noteText = getFlag(note, noteKeys, "text", mustBeString);
          let noteLocation = getFlag(note, noteKeys, "location", mustBeObjectOrNull);
          checkForInvalidFlags(note, noteKeys, where);
          notesClone.push({
            text: noteText || "",
            location: sanitizeLocation(noteLocation, where, terminalWidth)
          });
        }
      }
      messagesClone.push({
        id: id || "",
        pluginName: pluginName || fallbackPluginName,
        text: text || "",
        location: sanitizeLocation(location2, where, terminalWidth),
        notes: notesClone,
        detail: stash ? stash.store(detail) : -1
      });
      index++;
    }
    return messagesClone;
  }
  function sanitizeStringArray(values, property) {
    const result = [];
    for (const value of values) {
      if (typeof value !== "string")
        throw new Error(`${quote(property)} must be an array of strings`);
      result.push(value);
    }
    return result;
  }
  function sanitizeStringMap(map, property) {
    const result = /* @__PURE__ */ Object.create(null);
    for (const key in map) {
      const value = map[key];
      if (typeof value !== "string")
        throw new Error(`key ${quote(key)} in object ${quote(property)} must be a string`);
      result[key] = value;
    }
    return result;
  }
  function convertOutputFiles({ path: path32, contents, hash }) {
    let text = null;
    return {
      path: path32,
      contents,
      hash,
      get text() {
        const binary = this.contents;
        if (text === null || binary !== contents) {
          contents = binary;
          text = decodeUTF8(binary);
        }
        return text;
      }
    };
  }
  function jsRegExpToGoRegExp(regexp) {
    let result = regexp.source;
    if (regexp.flags)
      result = `(?${regexp.flags})${result}`;
    return result;
  }
  function parseJSON(bytes) {
    let text;
    try {
      text = decodeUTF8(bytes);
    } catch {
      return JSON_parse(bytes);
    }
    return JSON.parse(text);
  }
  var fs2 = require("fs");
  var os2 = require("os");
  var path3 = require("path");
  var ESBUILD_BINARY_PATH = process.env.ESBUILD_BINARY_PATH || ESBUILD_BINARY_PATH;
  var isValidBinaryPath = (x) => !!x && x !== "/usr/bin/esbuild";
  var packageDarwin_arm64 = "@esbuild/darwin-arm64";
  var packageDarwin_x64 = "@esbuild/darwin-x64";
  var knownWindowsPackages = {
    "win32 arm64 LE": "@esbuild/win32-arm64",
    "win32 ia32 LE": "@esbuild/win32-ia32",
    "win32 x64 LE": "@esbuild/win32-x64"
  };
  var knownUnixlikePackages = {
    "aix ppc64 BE": "@esbuild/aix-ppc64",
    "android arm64 LE": "@esbuild/android-arm64",
    "darwin arm64 LE": "@esbuild/darwin-arm64",
    "darwin x64 LE": "@esbuild/darwin-x64",
    "freebsd arm64 LE": "@esbuild/freebsd-arm64",
    "freebsd x64 LE": "@esbuild/freebsd-x64",
    "linux arm LE": "@esbuild/linux-arm",
    "linux arm64 LE": "@esbuild/linux-arm64",
    "linux ia32 LE": "@esbuild/linux-ia32",
    "linux mips64el LE": "@esbuild/linux-mips64el",
    "linux ppc64 LE": "@esbuild/linux-ppc64",
    "linux riscv64 LE": "@esbuild/linux-riscv64",
    "linux s390x BE": "@esbuild/linux-s390x",
    "linux x64 LE": "@esbuild/linux-x64",
    "linux loong64 LE": "@esbuild/linux-loong64",
    "netbsd arm64 LE": "@esbuild/netbsd-arm64",
    "netbsd x64 LE": "@esbuild/netbsd-x64",
    "openbsd arm64 LE": "@esbuild/openbsd-arm64",
    "openbsd x64 LE": "@esbuild/openbsd-x64",
    "sunos x64 LE": "@esbuild/sunos-x64"
  };
  var knownWebAssemblyFallbackPackages = {
    "android arm LE": "@esbuild/android-arm",
    "android x64 LE": "@esbuild/android-x64",
    "openharmony arm64 LE": "@esbuild/openharmony-arm64"
  };
  function pkgAndSubpathForCurrentPlatform() {
    let pkg;
    let subpath;
    let isWASM = false;
    let platformKey = `${process.platform} ${os2.arch()} ${os2.endianness()}`;
    if (platformKey in knownWindowsPackages) {
      pkg = knownWindowsPackages[platformKey];
      subpath = "esbuild.exe";
    } else if (platformKey in knownUnixlikePackages) {
      pkg = knownUnixlikePackages[platformKey];
      subpath = "bin/esbuild";
    } else if (platformKey in knownWebAssemblyFallbackPackages) {
      pkg = knownWebAssemblyFallbackPackages[platformKey];
      subpath = "bin/esbuild";
      isWASM = true;
    } else {
      throw new Error(`Unsupported platform: ${platformKey}`);
    }
    return { pkg, subpath, isWASM };
  }
  function pkgForSomeOtherPlatform() {
    const libMainJS = require.resolve("esbuild");
    const nodeModulesDirectory = path3.dirname(path3.dirname(path3.dirname(libMainJS)));
    if (path3.basename(nodeModulesDirectory) === "node_modules") {
      for (const unixKey in knownUnixlikePackages) {
        try {
          const pkg = knownUnixlikePackages[unixKey];
          if (fs2.existsSync(path3.join(nodeModulesDirectory, pkg)))
            return pkg;
        } catch {}
      }
      for (const windowsKey in knownWindowsPackages) {
        try {
          const pkg = knownWindowsPackages[windowsKey];
          if (fs2.existsSync(path3.join(nodeModulesDirectory, pkg)))
            return pkg;
        } catch {}
      }
    }
    return null;
  }
  function downloadedBinPath(pkg, subpath) {
    const esbuildLibDir = path3.dirname(require.resolve("esbuild"));
    return path3.join(esbuildLibDir, `downloaded-${pkg.replace("/", "-")}-${path3.basename(subpath)}`);
  }
  function generateBinPath() {
    if (isValidBinaryPath(ESBUILD_BINARY_PATH)) {
      if (!fs2.existsSync(ESBUILD_BINARY_PATH)) {
        console.warn(`[esbuild] Ignoring bad configuration: ESBUILD_BINARY_PATH=${ESBUILD_BINARY_PATH}`);
      } else {
        return { binPath: ESBUILD_BINARY_PATH, isWASM: false };
      }
    }
    const { pkg, subpath, isWASM } = pkgAndSubpathForCurrentPlatform();
    let binPath;
    try {
      binPath = require.resolve(`${pkg}/${subpath}`);
    } catch (e2) {
      binPath = downloadedBinPath(pkg, subpath);
      if (!fs2.existsSync(binPath)) {
        try {
          require.resolve(pkg);
        } catch {
          const otherPkg = pkgForSomeOtherPlatform();
          if (otherPkg) {
            let suggestions = `
Specifically the "${otherPkg}" package is present but this platform
needs the "${pkg}" package instead. People often get into this
situation by installing esbuild on Windows or macOS and copying "node_modules"
into a Docker image that runs Linux, or by copying "node_modules" between
Windows and WSL environments.

If you are installing with npm, you can try not copying the "node_modules"
directory when you copy the files over, and running "npm ci" or "npm install"
on the destination platform after the copy. Or you could consider using yarn
instead of npm which has built-in support for installing a package on multiple
platforms simultaneously.

If you are installing with yarn, you can try listing both this platform and the
other platform in your ".yarnrc.yml" file using the "supportedArchitectures"
feature: https://yarnpkg.com/configuration/yarnrc/#supportedArchitectures
Keep in mind that this means multiple copies of esbuild will be present.
`;
            if (pkg === packageDarwin_x64 && otherPkg === packageDarwin_arm64 || pkg === packageDarwin_arm64 && otherPkg === packageDarwin_x64) {
              suggestions = `
Specifically the "${otherPkg}" package is present but this platform
needs the "${pkg}" package instead. People often get into this
situation by installing esbuild with npm running inside of Rosetta 2 and then
trying to use it with node running outside of Rosetta 2, or vice versa (Rosetta
2 is Apple's on-the-fly x86_64-to-arm64 translation service).

If you are installing with npm, you can try ensuring that both npm and node are
not running under Rosetta 2 and then reinstalling esbuild. This likely involves
changing how you installed npm and/or node. For example, installing node with
the universal installer here should work: https://nodejs.org/en/download/. Or
you could consider using yarn instead of npm which has built-in support for
installing a package on multiple platforms simultaneously.

If you are installing with yarn, you can try listing both "arm64" and "x64"
in your ".yarnrc.yml" file using the "supportedArchitectures" feature:
https://yarnpkg.com/configuration/yarnrc/#supportedArchitectures
Keep in mind that this means multiple copies of esbuild will be present.
`;
            }
            throw new Error(`
You installed esbuild for another platform than the one you're currently using.
This won't work because esbuild is written with native code and needs to
install a platform-specific binary executable.
${suggestions}
Another alternative is to use the "esbuild-wasm" package instead, which works
the same way on all platforms. But it comes with a heavy performance cost and
can sometimes be 10x slower than the "esbuild" package, so you may also not
want to do that.
`);
          }
          throw new Error(`The package "${pkg}" could not be found, and is needed by esbuild.

If you are installing esbuild with npm, make sure that you don't specify the
"--no-optional" or "--omit=optional" flags. The "optionalDependencies" feature
of "package.json" is used by esbuild to install the correct binary executable
for your current platform.`);
        }
        throw e2;
      }
    }
    if (/\.zip\//.test(binPath)) {
      let pnpapi;
      try {
        pnpapi = (()=>{throw new Error("Cannot require module "+"pnpapi");})();
      } catch (e2) {}
      if (pnpapi) {
        const root = pnpapi.getPackageInformation(pnpapi.topLevel).packageLocation;
        const binTargetPath = path3.join(root, "node_modules", ".cache", "esbuild", `pnpapi-${pkg.replace("/", "-")}-${"0.28.2"}-${path3.basename(subpath)}`);
        if (!fs2.existsSync(binTargetPath)) {
          fs2.mkdirSync(path3.dirname(binTargetPath), { recursive: true });
          fs2.copyFileSync(binPath, binTargetPath);
          fs2.chmodSync(binTargetPath, 493);
        }
        return { binPath: binTargetPath, isWASM };
      }
    }
    return { binPath, isWASM };
  }
  var child_process = require("child_process");
  var crypto = require("crypto");
  var path22 = require("path");
  var fs22 = require("fs");
  var os22 = require("os");
  var tty = require("tty");
  var worker_threads;
  if (process.env.ESBUILD_WORKER_THREADS !== "0") {
    try {
      worker_threads = require("worker_threads");
    } catch {}
    let [major, minor] = process.versions.node.split(".");
    if (+major < 12 || +major === 12 && +minor < 17 || +major === 13 && +minor < 13) {
      worker_threads = undefined;
    }
  }
  var _a;
  var isInternalWorkerThread = ((_a = worker_threads == null ? undefined : worker_threads.workerData) == null ? undefined : _a.esbuildVersion) === "0.28.2";
  var esbuildCommandAndArgs = () => {
    if ((!ESBUILD_BINARY_PATH || false) && (path22.basename(__filename) !== "main.js" || path22.basename(__dirname) !== "lib")) {
      throw new Error(`The esbuild JavaScript API cannot be bundled. Please mark the "esbuild" package as external so it's not included in the bundle.

More information: The file containing the code for esbuild's JavaScript API (${__filename}) does not appear to be inside the esbuild package on the file system, which usually means that the esbuild package was bundled into another file. This is problematic because the API needs to run a binary executable inside the esbuild package which is located using a relative path from the API code to the executable. If the esbuild package is bundled, the relative path will be incorrect and the executable won't be found.`);
    }
    if (false) {} else {
      const { binPath, isWASM } = generateBinPath();
      if (isWASM) {
        return ["node", [binPath]];
      } else {
        return [binPath, []];
      }
    }
  };
  var isTTY = () => tty.isatty(2);
  var fsSync = {
    readFile(tempFile, callback) {
      try {
        let contents = fs22.readFileSync(tempFile, "utf8");
        try {
          fs22.unlinkSync(tempFile);
        } catch {}
        callback(null, contents);
      } catch (err) {
        callback(err, null);
      }
    },
    writeFile(contents, callback) {
      try {
        let tempFile = randomFileName();
        fs22.writeFileSync(tempFile, contents);
        callback(tempFile);
      } catch {
        callback(null);
      }
    }
  };
  var fsAsync = {
    readFile(tempFile, callback) {
      try {
        fs22.readFile(tempFile, "utf8", (err, contents) => {
          try {
            fs22.unlink(tempFile, () => callback(err, contents));
          } catch {
            callback(err, contents);
          }
        });
      } catch (err) {
        callback(err, null);
      }
    },
    writeFile(contents, callback) {
      try {
        let tempFile = randomFileName();
        fs22.writeFile(tempFile, contents, (err) => err !== null ? callback(null) : callback(tempFile));
      } catch {
        callback(null);
      }
    }
  };
  var version = "0.28.2";
  var build = (options) => ensureServiceIsRunning().build(options);
  var context = (buildOptions) => ensureServiceIsRunning().context(buildOptions);
  var transform = (input, options) => ensureServiceIsRunning().transform(input, options);
  var formatMessages = (messages, options) => ensureServiceIsRunning().formatMessages(messages, options);
  var analyzeMetafile = (messages, options) => ensureServiceIsRunning().analyzeMetafile(messages, options);
  var buildSync = (options) => {
    if (worker_threads && !isInternalWorkerThread) {
      if (!workerThreadService)
        workerThreadService = startWorkerThreadService(worker_threads);
      return workerThreadService.buildSync(options);
    }
    let result;
    runServiceSync((service) => service.buildOrContext({
      callName: "buildSync",
      refs: null,
      options,
      isTTY: isTTY(),
      defaultWD,
      callback: (err, res) => {
        if (err)
          throw err;
        result = res;
      }
    }));
    return result;
  };
  var transformSync = (input, options) => {
    if (worker_threads && !isInternalWorkerThread) {
      if (!workerThreadService)
        workerThreadService = startWorkerThreadService(worker_threads);
      return workerThreadService.transformSync(input, options);
    }
    let result;
    runServiceSync((service) => service.transform({
      callName: "transformSync",
      refs: null,
      input,
      options: options || {},
      isTTY: isTTY(),
      fs: fsSync,
      callback: (err, res) => {
        if (err)
          throw err;
        result = res;
      }
    }));
    return result;
  };
  var formatMessagesSync = (messages, options) => {
    if (worker_threads && !isInternalWorkerThread) {
      if (!workerThreadService)
        workerThreadService = startWorkerThreadService(worker_threads);
      return workerThreadService.formatMessagesSync(messages, options);
    }
    let result;
    runServiceSync((service) => service.formatMessages({
      callName: "formatMessagesSync",
      refs: null,
      messages,
      options,
      callback: (err, res) => {
        if (err)
          throw err;
        result = res;
      }
    }));
    return result;
  };
  var analyzeMetafileSync = (metafile, options) => {
    if (worker_threads && !isInternalWorkerThread) {
      if (!workerThreadService)
        workerThreadService = startWorkerThreadService(worker_threads);
      return workerThreadService.analyzeMetafileSync(metafile, options);
    }
    let result;
    runServiceSync((service) => service.analyzeMetafile({
      callName: "analyzeMetafileSync",
      refs: null,
      metafile: typeof metafile === "string" ? metafile : JSON.stringify(metafile),
      options,
      callback: (err, res) => {
        if (err)
          throw err;
        result = res;
      }
    }));
    return result;
  };
  var stop = () => {
    if (stopService)
      stopService();
    if (workerThreadService)
      workerThreadService.stop();
    return Promise.resolve();
  };
  var initializeWasCalled = false;
  var initialize = (options) => {
    options = validateInitializeOptions(options || {});
    if (options.wasmURL)
      throw new Error(`The "wasmURL" option only works in the browser`);
    if (options.wasmModule)
      throw new Error(`The "wasmModule" option only works in the browser`);
    if (options.worker)
      throw new Error(`The "worker" option only works in the browser`);
    if (initializeWasCalled)
      throw new Error('Cannot call "initialize" more than once');
    ensureServiceIsRunning();
    initializeWasCalled = true;
    return Promise.resolve();
  };
  var defaultWD = process.cwd();
  var longLivedService;
  var stopService;
  var ensureServiceIsRunning = () => {
    if (longLivedService)
      return longLivedService;
    let [command, args] = esbuildCommandAndArgs();
    let child = child_process.spawn(command, args.concat(`--service=${"0.28.2"}`, "--ping"), {
      windowsHide: true,
      stdio: ["pipe", "pipe", "inherit"],
      cwd: defaultWD
    });
    let { readFromStdout, afterClose, service } = createChannel({
      writeToStdin(bytes) {
        child.stdin.write(bytes, (err) => {
          if (err)
            afterClose(err);
        });
      },
      readFileSync: fs22.readFileSync,
      isSync: false,
      hasFS: true,
      esbuild: node_exports
    });
    child.stdin.on("error", afterClose);
    child.on("error", afterClose);
    const stdin = child.stdin;
    const stdout = child.stdout;
    stdout.on("data", readFromStdout);
    stdout.on("end", afterClose);
    stopService = () => {
      stdin.destroy();
      stdout.destroy();
      child.kill();
      initializeWasCalled = false;
      longLivedService = undefined;
      stopService = undefined;
    };
    let refCount = 0;
    child.unref();
    if (stdin.unref) {
      stdin.unref();
    }
    if (stdout.unref) {
      stdout.unref();
    }
    const refs = {
      ref() {
        if (++refCount === 1)
          child.ref();
      },
      unref() {
        if (--refCount === 0)
          child.unref();
      }
    };
    longLivedService = {
      build: (options) => new Promise((resolve, reject) => {
        service.buildOrContext({
          callName: "build",
          refs,
          options,
          isTTY: isTTY(),
          defaultWD,
          callback: (err, res) => err ? reject(err) : resolve(res)
        });
      }),
      context: (options) => new Promise((resolve, reject) => service.buildOrContext({
        callName: "context",
        refs,
        options,
        isTTY: isTTY(),
        defaultWD,
        callback: (err, res) => err ? reject(err) : resolve(res)
      })),
      transform: (input, options) => new Promise((resolve, reject) => service.transform({
        callName: "transform",
        refs,
        input,
        options: options || {},
        isTTY: isTTY(),
        fs: fsAsync,
        callback: (err, res) => err ? reject(err) : resolve(res)
      })),
      formatMessages: (messages, options) => new Promise((resolve, reject) => service.formatMessages({
        callName: "formatMessages",
        refs,
        messages,
        options,
        callback: (err, res) => err ? reject(err) : resolve(res)
      })),
      analyzeMetafile: (metafile, options) => new Promise((resolve, reject) => service.analyzeMetafile({
        callName: "analyzeMetafile",
        refs,
        metafile: typeof metafile === "string" ? metafile : JSON.stringify(metafile),
        options,
        callback: (err, res) => err ? reject(err) : resolve(res)
      }))
    };
    return longLivedService;
  };
  var runServiceSync = (callback) => {
    let [command, args] = esbuildCommandAndArgs();
    let stdin = new Uint8Array;
    let { readFromStdout, afterClose, service } = createChannel({
      writeToStdin(bytes) {
        if (stdin.length !== 0)
          throw new Error("Must run at most one command");
        stdin = bytes;
      },
      isSync: true,
      hasFS: true,
      esbuild: node_exports
    });
    callback(service);
    let stdout = child_process.execFileSync(command, args.concat(`--service=${"0.28.2"}`), {
      cwd: defaultWD,
      windowsHide: true,
      input: stdin,
      maxBuffer: +process.env.ESBUILD_MAX_BUFFER || 16 * 1024 * 1024
    });
    readFromStdout(stdout);
    afterClose(null);
  };
  var randomFileName = () => {
    return path22.join(os22.tmpdir(), `esbuild-${crypto.randomBytes(32).toString("hex")}`);
  };
  var workerThreadService = null;
  var startWorkerThreadService = (worker_threads2) => {
    let { port1: mainPort, port2: workerPort } = new worker_threads2.MessageChannel;
    let worker = new worker_threads2.Worker(__filename, {
      workerData: { workerPort, defaultWD, esbuildVersion: "0.28.2" },
      transferList: [workerPort],
      execArgv: []
    });
    let nextID = 0;
    let fakeBuildError = (text) => {
      let error = new Error(`Build failed with 1 error:
error: ${text}`);
      let errors = [{ id: "", pluginName: "", text, location: null, notes: [], detail: undefined }];
      error.errors = errors;
      error.warnings = [];
      return error;
    };
    let validateBuildSyncOptions = (options) => {
      if (!options)
        return;
      let plugins = options.plugins;
      if (plugins && plugins.length > 0)
        throw fakeBuildError(`Cannot use plugins in synchronous API calls`);
    };
    let applyProperties = (object, properties) => {
      for (let key in properties) {
        object[key] = properties[key];
      }
    };
    let runCallSync = (command, args) => {
      let id = nextID++;
      let sharedBuffer = new SharedArrayBuffer(8);
      let sharedBufferView = new Int32Array(sharedBuffer);
      let msg = { sharedBuffer, id, command, args };
      worker.postMessage(msg);
      let status = Atomics.wait(sharedBufferView, 0, 0);
      if (status !== "ok" && status !== "not-equal")
        throw new Error("Internal error: Atomics.wait() failed: " + status);
      let { message: { id: id2, resolve, reject, properties } } = worker_threads2.receiveMessageOnPort(mainPort);
      if (id !== id2)
        throw new Error(`Internal error: Expected id ${id} but got id ${id2}`);
      if (reject) {
        applyProperties(reject, properties);
        throw reject;
      }
      return resolve;
    };
    worker.unref();
    return {
      buildSync(options) {
        validateBuildSyncOptions(options);
        return runCallSync("build", [options]);
      },
      transformSync(input, options) {
        return runCallSync("transform", [input, options]);
      },
      formatMessagesSync(messages, options) {
        return runCallSync("formatMessages", [messages, options]);
      },
      analyzeMetafileSync(metafile, options) {
        return runCallSync("analyzeMetafile", [metafile, options]);
      },
      stop() {
        worker.terminate();
        workerThreadService = null;
      }
    };
  };
  var startSyncServiceWorker = () => {
    let workerPort = worker_threads.workerData.workerPort;
    let parentPort = worker_threads.parentPort;
    let extractProperties = (object) => {
      let properties = {};
      if (object && typeof object === "object") {
        for (let key in object) {
          properties[key] = object[key];
        }
      }
      return properties;
    };
    try {
      let service = ensureServiceIsRunning();
      defaultWD = worker_threads.workerData.defaultWD;
      parentPort.on("message", (msg) => {
        (async () => {
          let { sharedBuffer, id, command, args } = msg;
          let sharedBufferView = new Int32Array(sharedBuffer);
          try {
            switch (command) {
              case "build":
                workerPort.postMessage({ id, resolve: await service.build(args[0]) });
                break;
              case "transform":
                workerPort.postMessage({ id, resolve: await service.transform(args[0], args[1]) });
                break;
              case "formatMessages":
                workerPort.postMessage({ id, resolve: await service.formatMessages(args[0], args[1]) });
                break;
              case "analyzeMetafile":
                workerPort.postMessage({ id, resolve: await service.analyzeMetafile(args[0], args[1]) });
                break;
              default:
                throw new Error(`Invalid command: ${command}`);
            }
          } catch (reject) {
            workerPort.postMessage({ id, reject, properties: extractProperties(reject) });
          }
          Atomics.add(sharedBufferView, 0, 1);
          Atomics.notify(sharedBufferView, 0, Infinity);
        })();
      });
    } catch (reject) {
      parentPort.on("message", (msg) => {
        let { sharedBuffer, id } = msg;
        let sharedBufferView = new Int32Array(sharedBuffer);
        workerPort.postMessage({ id, reject, properties: extractProperties(reject) });
        Atomics.add(sharedBufferView, 0, 1);
        Atomics.notify(sharedBufferView, 0, Infinity);
      });
    }
  };
  if (isInternalWorkerThread) {
    startSyncServiceWorker();
  }
  var node_default = node_exports;
});

// node_modules/tsx/dist/lexer-DQCqS3nf.mjs
var exports_lexer_DQCqS3nf = {};
__export(exports_lexer_DQCqS3nf, {
  parse: () => F,
  init: () => G,
  ImportType: () => L
});
function F(A, E = "@") {
  if (!Q)
    return G.then(() => F(A));
  const g = A.length + 1, B = (Q.__heap_base.value || Q.__heap_base) + 4 * g - Q.memory.buffer.byteLength;
  B > 0 && Q.memory.grow(Math.ceil(B / 65536));
  const s2 = Q.sa(g - 1);
  if ((R2 ? c2 : r2)(A, new Uint16Array(Q.memory.buffer, s2, g)), !Q.parse())
    throw Object.assign(new Error(`Parse error ${E}:${A.slice(0, Q.e()).split(`
`).length}:${Q.e() - A.lastIndexOf(`
`, Q.e() - 1)}`), { idx: Q.e() });
  const U = [], t3 = [];
  for (;Q.ri(); ) {
    const C = Q.is(), I = Q.ie(), D = Q.it(), i3 = Q.ai(), w = Q.id(), J = Q.ss(), K = Q.se();
    let o4;
    Q.ip() && (o4 = N(A.slice(w === -1 ? C - 1 : C, w === -1 ? I + 1 : I))), U.push({ n: o4, t: D, s: C, e: I, ss: J, se: K, d: w, a: i3 });
  }
  for (;Q.re(); ) {
    const C = Q.es(), I = Q.ee(), D = Q.els(), i3 = Q.ele(), w = A.slice(C, I), J = w[0], K = D < 0 ? undefined : A.slice(D, i3), o4 = K ? K[0] : "";
    t3.push({ s: C, e: I, ls: D, le: i3, n: J === '"' || J === "'" ? N(w) : w, ln: o4 === '"' || o4 === "'" ? N(K) : K });
  }
  function N(C) {
    try {
      return (0, eval)(C);
    } catch {}
  }
  return k(N, "k"), [U, t3, !!Q.f(), !!Q.ms()];
}
function r2(A, E) {
  const g = A.length;
  let B = 0;
  for (;B < g; ) {
    const s2 = A.charCodeAt(B);
    E[B++] = (255 & s2) << 8 | s2 >>> 8;
  }
}
function c2(A, E) {
  const g = A.length;
  let B = 0;
  for (;B < g; )
    E[B] = A.charCodeAt(B++);
}
var Y, k = (A, E) => Y(A, "name", { value: E, configurable: true }), L, R2, Q, G, a3;
var init_lexer_DQCqS3nf = __esm(() => {
  Y = Object.defineProperty;
  (function(A) {
    A[A.Static = 1] = "Static", A[A.Dynamic = 2] = "Dynamic", A[A.ImportMeta = 3] = "ImportMeta", A[A.StaticSourcePhase = 4] = "StaticSourcePhase", A[A.DynamicSourcePhase = 5] = "DynamicSourcePhase";
  })(L || (L = {}));
  R2 = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  k(F, "parse");
  k(r2, "Q");
  k(c2, "B");
  G = WebAssembly.compile((a3 = "AGFzbQEAAAABKwhgAX8Bf2AEf39/fwBgAAF/YAAAYAF/AGADf39/AX9gAn9/AX9gA39/fwADMTAAAQECAgICAgICAgICAgICAgICAgIAAwMDBAQAAAUAAAAAAAMDAwAGAAAABwAGAgUEBQFwAQEBBQMBAAEGDwJ/AUHA8gALfwBBwPIACwd6FQZtZW1vcnkCAAJzYQAAAWUAAwJpcwAEAmllAAUCc3MABgJzZQAHAml0AAgCYWkACQJpZAAKAmlwAAsCZXMADAJlZQANA2VscwAOA2VsZQAPAnJpABACcmUAEQFmABICbXMAEwVwYXJzZQAUC19faGVhcF9iYXNlAwEKm0EwaAEBf0EAIAA2AoAKQQAoAtwJIgEgAEEBdGoiAEEAOwEAQQAgAEECaiIANgKECkEAIAA2AogKQQBBADYC4AlBAEEANgLwCUEAQQA2AugJQQBBADYC5AlBAEEANgL4CUEAQQA2AuwJIAEL0wEBA39BACgC8AkhBEEAQQAoAogKIgU2AvAJQQAgBDYC9AlBACAFQSRqNgKICiAEQSBqQeAJIAQbIAU2AgBBACgC1AkhBEEAKALQCSEGIAUgATYCACAFIAA2AgggBSACIAJBAmpBACAGIANGIgAbIAQgA0YiBBs2AgwgBSADNgIUIAVBADYCECAFIAI2AgQgBUEANgIgIAVBA0EBQQIgABsgBBs2AhwgBUEAKALQCSADRiICOgAYAkACQCACDQBBACgC1AkgA0cNAQtBAEEBOgCMCgsLXgEBf0EAKAL4CSIEQRBqQeQJIAQbQQAoAogKIgQ2AgBBACAENgL4CUEAIARBFGo2AogKQQBBAToAjAogBEEANgIQIAQgAzYCDCAEIAI2AgggBCABNgIEIAQgADYCAAsIAEEAKAKQCgsVAEEAKALoCSgCAEEAKALcCWtBAXULHgEBf0EAKALoCSgCBCIAQQAoAtwJa0EBdUF/IAAbCxUAQQAoAugJKAIIQQAoAtwJa0EBdQseAQF/QQAoAugJKAIMIgBBACgC3AlrQQF1QX8gABsLCwBBACgC6AkoAhwLHgEBf0EAKALoCSgCECIAQQAoAtwJa0EBdUF/IAAbCzsBAX8CQEEAKALoCSgCFCIAQQAoAtAJRw0AQX8PCwJAIABBACgC1AlHDQBBfg8LIABBACgC3AlrQQF1CwsAQQAoAugJLQAYCxUAQQAoAuwJKAIAQQAoAtwJa0EBdQsVAEEAKALsCSgCBEEAKALcCWtBAXULHgEBf0EAKALsCSgCCCIAQQAoAtwJa0EBdUF/IAAbCx4BAX9BACgC7AkoAgwiAEEAKALcCWtBAXVBfyAAGwslAQF/QQBBACgC6AkiAEEgakHgCSAAGygCACIANgLoCSAAQQBHCyUBAX9BAEEAKALsCSIAQRBqQeQJIAAbKAIAIgA2AuwJIABBAEcLCABBAC0AlAoLCABBAC0AjAoL3Q0BBX8jAEGA0ABrIgAkAEEAQQE6AJQKQQBBACgC2Ak2ApwKQQBBACgC3AlBfmoiATYCsApBACABQQAoAoAKQQF0aiICNgK0CkEAQQA6AIwKQQBBADsBlgpBAEEAOwGYCkEAQQA6AKAKQQBBADYCkApBAEEAOgD8CUEAIABBgBBqNgKkCkEAIAA2AqgKQQBBADoArAoCQAJAAkACQANAQQAgAUECaiIDNgKwCiABIAJPDQECQCADLwEAIgJBd2pBBUkNAAJAAkACQAJAAkAgAkGbf2oOBQEICAgCAAsgAkEgRg0EIAJBL0YNAyACQTtGDQIMBwtBAC8BmAoNASADEBVFDQEgAUEEakGCCEEKEC8NARAWQQAtAJQKDQFBAEEAKAKwCiIBNgKcCgwHCyADEBVFDQAgAUEEakGMCEEKEC8NABAXC0EAQQAoArAKNgKcCgwBCwJAIAEvAQQiA0EqRg0AIANBL0cNBBAYDAELQQEQGQtBACgCtAohAkEAKAKwCiEBDAALC0EAIQIgAyEBQQAtAPwJDQIMAQtBACABNgKwCkEAQQA6AJQKCwNAQQAgAUECaiIDNgKwCgJAAkACQAJAAkACQAJAIAFBACgCtApPDQAgAy8BACICQXdqQQVJDQYCQAJAAkACQAJAAkACQAJAAkACQCACQWBqDgoQDwYPDw8PBQECAAsCQAJAAkACQCACQaB/ag4KCxISAxIBEhISAgALIAJBhX9qDgMFEQYJC0EALwGYCg0QIAMQFUUNECABQQRqQYIIQQoQLw0QEBYMEAsgAxAVRQ0PIAFBBGpBjAhBChAvDQ8QFwwPCyADEBVFDQ4gASkABELsgISDsI7AOVINDiABLwEMIgNBd2oiAUEXSw0MQQEgAXRBn4CABHFFDQwMDQtBAEEALwGYCiIBQQFqOwGYCkEAKAKkCiABQQN0aiIBQQE2AgAgAUEAKAKcCjYCBAwNC0EALwGYCiIDRQ0JQQAgA0F/aiIDOwGYCkEALwGWCiICRQ0MQQAoAqQKIANB//8DcUEDdGooAgBBBUcNDAJAIAJBAnRBACgCqApqQXxqKAIAIgMoAgQNACADQQAoApwKQQJqNgIEC0EAIAJBf2o7AZYKIAMgAUEEajYCDAwMCwJAQQAoApwKIgEvAQBBKUcNAEEAKALwCSIDRQ0AIAMoAgQgAUcNAEEAQQAoAvQJIgM2AvAJAkAgA0UNACADQQA2AiAMAQtBAEEANgLgCQtBAEEALwGYCiIDQQFqOwGYCkEAKAKkCiADQQN0aiIDQQZBAkEALQCsChs2AgAgAyABNgIEQQBBADoArAoMCwtBAC8BmAoiAUUNB0EAIAFBf2oiATsBmApBACgCpAogAUH//wNxQQN0aigCAEEERg0EDAoLQScQGgwJC0EiEBoMCAsgAkEvRw0HAkACQCABLwEEIgFBKkYNACABQS9HDQEQGAwKC0EBEBkMCQsCQAJAAkACQEEAKAKcCiIBLwEAIgMQG0UNAAJAAkAgA0FVag4EAAkBAwkLIAFBfmovAQBBK0YNAwwICyABQX5qLwEAQS1GDQIMBwsgA0EpRw0BQQAoAqQKQQAvAZgKIgJBA3RqKAIEEBxFDQIMBgsgAUF+ai8BAEFQakH//wNxQQpPDQULQQAvAZgKIQILAkACQCACQf//A3EiAkUNACADQeYARw0AQQAoAqQKIAJBf2pBA3RqIgQoAgBBAUcNACABQX5qLwEAQe8ARw0BIAQoAgRBlghBAxAdRQ0BDAULIANB/QBHDQBBACgCpAogAkEDdGoiAigCBBAeDQQgAigCAEEGRg0ECyABEB8NAyADRQ0DIANBL0ZBAC0AoApBAEdxDQMCQEEAKAL4CSICRQ0AIAEgAigCAEkNACABIAIoAgRNDQQLIAFBfmohAUEAKALcCSECAkADQCABQQJqIgQgAk0NAUEAIAE2ApwKIAEvAQAhAyABQX5qIgQhASADECBFDQALIARBAmohBAsCQCADQf//A3EQIUUNACAEQX5qIQECQANAIAFBAmoiAyACTQ0BQQAgATYCnAogAS8BACEDIAFBfmoiBCEBIAMQIQ0ACyAEQQJqIQMLIAMQIg0EC0EAQQE6AKAKDAcLQQAoAqQKQQAvAZgKIgFBA3QiA2pBACgCnAo2AgRBACABQQFqOwGYCkEAKAKkCiADakEDNgIACxAjDAULQQAtAPwJQQAvAZYKQQAvAZgKcnJFIQIMBwsQJEEAQQA6AKAKDAMLECVBACECDAULIANBoAFHDQELQQBBAToArAoLQQBBACgCsAo2ApwKC0EAKAKwCiEBDAALCyAAQYDQAGokACACCxoAAkBBACgC3AkgAEcNAEEBDwsgAEF+ahAmC/4KAQZ/QQBBACgCsAoiAEEMaiIBNgKwCkEAKAL4CSECQQEQKSEDAkACQAJAAkACQAJAAkACQAJAQQAoArAKIgQgAUcNACADEChFDQELAkACQAJAAkACQAJAAkAgA0EqRg0AIANB+wBHDQFBACAEQQJqNgKwCkEBECkhA0EAKAKwCiEEA0ACQAJAIANB//8DcSIDQSJGDQAgA0EnRg0AIAMQLBpBACgCsAohAwwBCyADEBpBAEEAKAKwCkECaiIDNgKwCgtBARApGgJAIAQgAxAtIgNBLEcNAEEAQQAoArAKQQJqNgKwCkEBECkhAwsgA0H9AEYNA0EAKAKwCiIFIARGDQ8gBSEEIAVBACgCtApNDQAMDwsLQQAgBEECajYCsApBARApGkEAKAKwCiIDIAMQLRoMAgtBAEEAOgCUCgJAAkACQAJAAkACQCADQZ9/ag4MAgsEAQsDCwsLCwsFAAsgA0H2AEYNBAwKC0EAIARBDmoiAzYCsAoCQAJAAkBBARApQZ9/ag4GABICEhIBEgtBACgCsAoiBSkAAkLzgOSD4I3AMVINESAFLwEKECFFDRFBACAFQQpqNgKwCkEAECkaC0EAKAKwCiIFQQJqQbIIQQ4QLw0QIAUvARAiAkF3aiIBQRdLDQ1BASABdEGfgIAEcUUNDQwOC0EAKAKwCiIFKQACQuyAhIOwjsA5Ug0PIAUvAQoiAkF3aiIBQRdNDQYMCgtBACAEQQpqNgKwCkEAECkaQQAoArAKIQQLQQAgBEEQajYCsAoCQEEBECkiBEEqRw0AQQBBACgCsApBAmo2ArAKQQEQKSEEC0EAKAKwCiEDIAQQLBogA0EAKAKwCiIEIAMgBBACQQBBACgCsApBfmo2ArAKDwsCQCAEKQACQuyAhIOwjsA5Ug0AIAQvAQoQIEUNAEEAIARBCmo2ArAKQQEQKSEEQQAoArAKIQMgBBAsGiADQQAoArAKIgQgAyAEEAJBAEEAKAKwCkF+ajYCsAoPC0EAIARBBGoiBDYCsAoLQQAgBEEGajYCsApBAEEAOgCUCkEBECkhBEEAKAKwCiEDIAQQLCEEQQAoArAKIQIgBEHf/wNxIgFB2wBHDQNBACACQQJqNgKwCkEBECkhBUEAKAKwCiEDQQAhBAwEC0EAQQE6AIwKQQBBACgCsApBAmo2ArAKC0EBECkhBEEAKAKwCiEDAkAgBEHmAEcNACADQQJqQawIQQYQLw0AQQAgA0EIajYCsAogAEEBEClBABArIAJBEGpB5AkgAhshAwNAIAMoAgAiA0UNBSADQgA3AgggA0EQaiEDDAALC0EAIANBfmo2ArAKDAMLQQEgAXRBn4CABHFFDQMMBAtBASEECwNAAkACQCAEDgIAAQELIAVB//8DcRAsGkEBIQQMAQsCQAJAQQAoArAKIgQgA0YNACADIAQgAyAEEAJBARApIQQCQCABQdsARw0AIARBIHJB/QBGDQQLQQAoArAKIQMCQCAEQSxHDQBBACADQQJqNgKwCkEBECkhBUEAKAKwCiEDIAVBIHJB+wBHDQILQQAgA0F+ajYCsAoLIAFB2wBHDQJBACACQX5qNgKwCg8LQQAhBAwACwsPCyACQaABRg0AIAJB+wBHDQQLQQAgBUEKajYCsApBARApIgVB+wBGDQMMAgsCQCACQVhqDgMBAwEACyACQaABRw0CC0EAIAVBEGo2ArAKAkBBARApIgVBKkcNAEEAQQAoArAKQQJqNgKwCkEBECkhBQsgBUEoRg0BC0EAKAKwCiEBIAUQLBpBACgCsAoiBSABTQ0AIAQgAyABIAUQAkEAQQAoArAKQX5qNgKwCg8LIAQgA0EAQQAQAkEAIARBDGo2ArAKDwsQJQvcCAEGf0EAIQBBAEEAKAKwCiIBQQxqIgI2ArAKQQEQKSEDQQAoArAKIQQCQAJAAkACQAJAAkACQAJAIANBLkcNAEEAIARBAmo2ArAKAkBBARApIgNB8wBGDQAgA0HtAEcNB0EAKAKwCiIDQQJqQZwIQQYQLw0HAkBBACgCnAoiBBAqDQAgBC8BAEEuRg0ICyABIAEgA0EIakEAKALUCRABDwtBACgCsAoiA0ECakGiCEEKEC8NBgJAQQAoApwKIgQQKg0AIAQvAQBBLkYNBwsgA0EMaiEDDAELIANB8wBHDQEgBCACTQ0BQQYhAEEAIQIgBEECakGiCEEKEC8NAiAEQQxqIQMCQCAELwEMIgVBd2oiBEEXSw0AQQEgBHRBn4CABHENAQsgBUGgAUcNAgtBACADNgKwCkEBIQBBARApIQMLAkACQAJAAkAgA0H7AEYNACADQShHDQFBACgCpApBAC8BmAoiA0EDdGoiBEEAKAKwCjYCBEEAIANBAWo7AZgKIARBBTYCAEEAKAKcCi8BAEEuRg0HQQBBACgCsAoiBEECajYCsApBARApIQMgAUEAKAKwCkEAIAQQAQJAAkAgAA0AQQAoAvAJIQQMAQtBACgC8AkiBEEFNgIcC0EAQQAvAZYKIgBBAWo7AZYKQQAoAqgKIABBAnRqIAQ2AgACQCADQSJGDQAgA0EnRg0AQQBBACgCsApBfmo2ArAKDwsgAxAaQQBBACgCsApBAmoiAzYCsAoCQAJAAkBBARApQVdqDgQBAgIAAgtBAEEAKAKwCkECajYCsApBARApGkEAKALwCSIEIAM2AgQgBEEBOgAYIARBACgCsAoiAzYCEEEAIANBfmo2ArAKDwtBACgC8AkiBCADNgIEIARBAToAGEEAQQAvAZgKQX9qOwGYCiAEQQAoArAKQQJqNgIMQQBBAC8BlgpBf2o7AZYKDwtBAEEAKAKwCkF+ajYCsAoPCyAADQJBACgCsAohA0EALwGYCg0BA0ACQAJAAkAgA0EAKAK0Ck8NAEEBECkiA0EiRg0BIANBJ0YNASADQf0ARw0CQQBBACgCsApBAmo2ArAKC0EBECkhBEEAKAKwCiEDAkAgBEHmAEcNACADQQJqQawIQQYQLw0JC0EAIANBCGo2ArAKAkBBARApIgNBIkYNACADQSdHDQkLIAEgA0EAECsPCyADEBoLQQBBACgCsApBAmoiAzYCsAoMAAsLIAANAUEGIQBBACECAkAgA0FZag4EBAMDBAALIANBIkYNAwwCC0EAIANBfmo2ArAKDwtBDCEAQQEhAgtBACgCsAoiAyABIABBAXRqRw0AQQAgA0F+ajYCsAoPC0EALwGYCg0CQQAoArAKIQNBACgCtAohAANAIAMgAE8NAQJAAkAgAy8BACIEQSdGDQAgBEEiRw0BCyABIAQgAhArDwtBACADQQJqIgM2ArAKDAALCxAlCw8LQQBBACgCsApBfmo2ArAKC0cBA39BACgCsApBAmohAEEAKAK0CiEBAkADQCAAIgJBfmogAU8NASACQQJqIQAgAi8BAEF2ag4EAQAAAQALC0EAIAI2ArAKC5gBAQN/QQBBACgCsAoiAUECajYCsAogAUEGaiEBQQAoArQKIQIDQAJAAkACQCABQXxqIAJPDQAgAUF+ai8BACEDAkACQCAADQAgA0EqRg0BIANBdmoOBAIEBAIECyADQSpHDQMLIAEvAQBBL0cNAkEAIAFBfmo2ArAKDAELIAFBfmohAQtBACABNgKwCg8LIAFBAmohAQwACwuIAQEEf0EAKAKwCiEBQQAoArQKIQICQAJAA0AgASIDQQJqIQEgAyACTw0BIAEvAQAiBCAARg0CAkAgBEHcAEYNACAEQXZqDgQCAQECAQsgA0EEaiEBIAMvAQRBDUcNACADQQZqIAEgAy8BBkEKRhshAQwACwtBACABNgKwChAlDwtBACABNgKwCgtsAQF/AkACQCAAQV9qIgFBBUsNAEEBIAF0QTFxDQELIABBRmpB//8DcUEGSQ0AIABBKUcgAEFYakH//wNxQQdJcQ0AAkAgAEGlf2oOBAEAAAEACyAAQf0ARyAAQYV/akH//wNxQQRJcQ8LQQELLgEBf0EBIQECQCAAQaYJQQUQHQ0AIABBlghBAxAdDQAgAEGwCUECEB0hAQsgAQtGAQN/QQAhAwJAIAAgAkEBdCICayIEQQJqIgBBACgC3AkiBUkNACAAIAEgAhAvDQACQCAAIAVHDQBBAQ8LIAQQJiEDCyADC4MBAQJ/QQEhAQJAAkACQAJAAkACQCAALwEAIgJBRWoOBAUEBAEACwJAIAJBm39qDgQDBAQCAAsgAkEpRg0EIAJB+QBHDQMgAEF+akG8CUEGEB0PCyAAQX5qLwEAQT1GDwsgAEF+akG0CUEEEB0PCyAAQX5qQcgJQQMQHQ8LQQAhAQsgAQu0AwECf0EAIQECQAJAAkACQAJAAkACQAJAAkACQCAALwEAQZx/ag4UAAECCQkJCQMJCQQFCQkGCQcJCQgJCwJAAkAgAEF+ai8BAEGXf2oOBAAKCgEKCyAAQXxqQcoIQQIQHQ8LIABBfGpBzghBAxAdDwsCQAJAAkAgAEF+ai8BAEGNf2oOAwABAgoLAkAgAEF8ai8BACICQeEARg0AIAJB7ABHDQogAEF6akHlABAnDwsgAEF6akHjABAnDwsgAEF8akHUCEEEEB0PCyAAQXxqQdwIQQYQHQ8LIABBfmovAQBB7wBHDQYgAEF8ai8BAEHlAEcNBgJAIABBemovAQAiAkHwAEYNACACQeMARw0HIABBeGpB6AhBBhAdDwsgAEF4akH0CEECEB0PCyAAQX5qQfgIQQQQHQ8LQQEhASAAQX5qIgBB6QAQJw0EIABBgAlBBRAdDwsgAEF+akHkABAnDwsgAEF+akGKCUEHEB0PCyAAQX5qQZgJQQQQHQ8LAkAgAEF+ai8BACICQe8ARg0AIAJB5QBHDQEgAEF8akHuABAnDwsgAEF8akGgCUEDEB0hAQsgAQs0AQF/QQEhAQJAIABBd2pB//8DcUEFSQ0AIABBgAFyQaABRg0AIABBLkcgABAocSEBCyABCzABAX8CQAJAIABBd2oiAUEXSw0AQQEgAXRBjYCABHENAQsgAEGgAUYNAEEADwtBAQtOAQJ/QQAhAQJAAkAgAC8BACICQeUARg0AIAJB6wBHDQEgAEF+akH4CEEEEB0PCyAAQX5qLwEAQfUARw0AIABBfGpB3AhBBhAdIQELIAEL3gEBBH9BACgCsAohAEEAKAK0CiEBAkACQAJAA0AgACICQQJqIQAgAiABTw0BAkACQAJAIAAvAQAiA0Gkf2oOBQIDAwMBAAsgA0EkRw0CIAIvAQRB+wBHDQJBACACQQRqIgA2ArAKQQBBAC8BmAoiAkEBajsBmApBACgCpAogAkEDdGoiAkEENgIAIAIgADYCBA8LQQAgADYCsApBAEEALwGYCkF/aiIAOwGYCkEAKAKkCiAAQf//A3FBA3RqKAIAQQNHDQMMBAsgAkEEaiEADAALC0EAIAA2ArAKCxAlCwtwAQJ/AkACQANAQQBBACgCsAoiAEECaiIBNgKwCiAAQQAoArQKTw0BAkACQAJAIAEvAQAiAUGlf2oOAgECAAsCQCABQXZqDgQEAwMEAAsgAUEvRw0CDAQLEC4aDAELQQAgAEEEajYCsAoMAAsLECULCzUBAX9BAEEBOgD8CUEAKAKwCiEAQQBBACgCtApBAmo2ArAKQQAgAEEAKALcCWtBAXU2ApAKC0MBAn9BASEBAkAgAC8BACICQXdqQf//A3FBBUkNACACQYABckGgAUYNAEEAIQEgAhAoRQ0AIAJBLkcgABAqcg8LIAELPQECf0EAIQICQEEAKALcCSIDIABLDQAgAC8BACABRw0AAkAgAyAARw0AQQEPCyAAQX5qLwEAECAhAgsgAgtoAQJ/QQEhAQJAAkAgAEFfaiICQQVLDQBBASACdEExcQ0BCyAAQfj/A3FBKEYNACAAQUZqQf//A3FBBkkNAAJAIABBpX9qIgJBA0sNACACQQFHDQELIABBhX9qQf//A3FBBEkhAQsgAQucAQEDf0EAKAKwCiEBAkADQAJAAkAgAS8BACICQS9HDQACQCABLwECIgFBKkYNACABQS9HDQQQGAwCCyAAEBkMAQsCQAJAIABFDQAgAkF3aiIBQRdLDQFBASABdEGfgIAEcUUNAQwCCyACECFFDQMMAQsgAkGgAUcNAgtBAEEAKAKwCiIDQQJqIgE2ArAKIANBACgCtApJDQALCyACCzEBAX9BACEBAkAgAC8BAEEuRw0AIABBfmovAQBBLkcNACAAQXxqLwEAQS5GIQELIAELnAQBAX8CQCABQSJGDQAgAUEnRg0AECUPC0EAKAKwCiEDIAEQGiAAIANBAmpBACgCsApBACgC0AkQAQJAIAJFDQBBACgC8AlBBDYCHAtBAEEAKAKwCkECajYCsAoCQAJAAkACQEEAECkiAUHhAEYNACABQfcARg0BQQAoArAKIQEMAgtBACgCsAoiAUECakHACEEKEC8NAUEGIQAMAgtBACgCsAoiAS8BAkHpAEcNACABLwEEQfQARw0AQQQhACABLwEGQegARg0BC0EAIAFBfmo2ArAKDwtBACABIABBAXRqNgKwCgJAQQEQKUH7AEYNAEEAIAE2ArAKDwtBACgCsAoiAiEAA0BBACAAQQJqNgKwCgJAAkACQEEBECkiAEEiRg0AIABBJ0cNAUEnEBpBAEEAKAKwCkECajYCsApBARApIQAMAgtBIhAaQQBBACgCsApBAmo2ArAKQQEQKSEADAELIAAQLCEACwJAIABBOkYNAEEAIAE2ArAKDwtBAEEAKAKwCkECajYCsAoCQEEBECkiAEEiRg0AIABBJ0YNAEEAIAE2ArAKDwsgABAaQQBBACgCsApBAmo2ArAKAkACQEEBECkiAEEsRg0AIABB/QBGDQFBACABNgKwCg8LQQBBACgCsApBAmo2ArAKQQEQKUH9AEYNAEEAKAKwCiEADAELC0EAKALwCSIBIAI2AhAgAUEAKAKwCkECajYCDAttAQJ/AkACQANAAkAgAEH//wNxIgFBd2oiAkEXSw0AQQEgAnRBn4CABHENAgsgAUGgAUYNASAAIQIgARAoDQJBACECQQBBACgCsAoiAEECajYCsAogAC8BAiIADQAMAgsLIAAhAgsgAkH//wNxC6sBAQR/AkACQEEAKAKwCiICLwEAIgNB4QBGDQAgASEEIAAhBQwBC0EAIAJBBGo2ArAKQQEQKSECQQAoArAKIQUCQAJAIAJBIkYNACACQSdGDQAgAhAsGkEAKAKwCiEEDAELIAIQGkEAQQAoArAKQQJqIgQ2ArAKC0EBECkhA0EAKAKwCiECCwJAIAIgBUYNACAFIARBACAAIAAgAUYiAhtBACABIAIbEAILIAMLcgEEf0EAKAKwCiEAQQAoArQKIQECQAJAA0AgAEECaiECIAAgAU8NAQJAAkAgAi8BACIDQaR/ag4CAQQACyACIQAgA0F2ag4EAgEBAgELIABBBGohAAwACwtBACACNgKwChAlQQAPC0EAIAI2ArAKQd0AC0kBA39BACEDAkAgAkUNAAJAA0AgAC0AACIEIAEtAAAiBUcNASABQQFqIQEgAEEBaiEAIAJBf2oiAg0ADAILCyAEIAVrIQMLIAMLC+wBAgBBgAgLzgEAAHgAcABvAHIAdABtAHAAbwByAHQAZgBvAHIAZQB0AGEAbwB1AHIAYwBlAHIAbwBtAHUAbgBjAHQAaQBvAG4AcwBzAGUAcgB0AHYAbwB5AGkAZQBkAGUAbABlAGMAbwBuAHQAaQBuAGkAbgBzAHQAYQBuAHQAeQBiAHIAZQBhAHIAZQB0AHUAcgBkAGUAYgB1AGcAZwBlAGEAdwBhAGkAdABoAHIAdwBoAGkAbABlAGkAZgBjAGEAdABjAGYAaQBuAGEAbABsAGUAbABzAABB0AkLEAEAAAACAAAAAAQAAEA5AAA=", typeof Buffer < "u" ? Buffer.from(a3, "base64") : Uint8Array.from(atob(a3), (A) => A.charCodeAt(0)))).then(WebAssembly.instantiate).then(({ exports: A }) => {
    Q = A;
  });
});

// node_modules/tsx/dist/index-DQtFPMc2.mjs
function on(s2, e2 = "@") {
  I = s2, Pe = e2;
  const n3 = 2 * I.length + (2 << 18);
  if (n3 > Y2 || !E) {
    for (;n3 > Y2; )
      Y2 *= 2;
    oe = new ArrayBuffer(Y2), Be(sn, new Uint16Array(oe, 16, 110)), E = function(l2, p3, g) {
      var b = new l2.Int8Array(g), d2 = new l2.Int16Array(g), r3 = new l2.Int32Array(g), S = new l2.Uint8Array(g), O = new l2.Uint16Array(g), _ = 1040;
      function N() {
        var t3 = 0, c3 = 0, h = 0, f = 0, m3 = 0, w = 0, y = 0;
        y = _, _ = _ + 10240 | 0, b[804] = 1, b[803] = 0, d2[399] = 0, d2[400] = 0, r3[69] = r3[2], b[805] = 0, r3[68] = 0, b[802] = 0, r3[70] = y + 2048, r3[71] = y, b[806] = 0, t3 = (r3[3] | 0) + -2 | 0, r3[72] = t3, c3 = t3 + (r3[66] << 1) | 0, r3[73] = c3;
        e:
          for (;; ) {
            if (h = t3 + 2 | 0, r3[72] = h, t3 >>> 0 >= c3 >>> 0) {
              f = 18;
              break;
            }
            t:
              do
                switch (d2[h >> 1] | 0) {
                  case 9:
                  case 10:
                  case 11:
                  case 12:
                  case 13:
                  case 32:
                    break;
                  case 101: {
                    if (!(d2[400] | 0) && K(h) | 0 && !(A(t3 + 4 | 0, 16, 10) | 0) && ($(), (b[804] | 0) == 0)) {
                      f = 9;
                      break e;
                    } else
                      f = 17;
                    break;
                  }
                  case 105: {
                    K(h) | 0 && !(A(t3 + 4 | 0, 26, 10) | 0) && B(), f = 17;
                    break;
                  }
                  case 59: {
                    f = 17;
                    break;
                  }
                  case 47:
                    switch (d2[t3 + 4 >> 1] | 0) {
                      case 47: {
                        pe();
                        break t;
                      }
                      case 42: {
                        ge(1);
                        break t;
                      }
                      default: {
                        f = 16;
                        break e;
                      }
                    }
                  default: {
                    f = 16;
                    break e;
                  }
                }
              while (false);
            (f | 0) == 17 && (f = 0, r3[69] = r3[72]), t3 = r3[72] | 0, c3 = r3[73] | 0;
          }
        (f | 0) == 9 ? (t3 = r3[72] | 0, r3[69] = t3, f = 19) : (f | 0) == 16 ? (b[804] = 0, r3[72] = t3, f = 19) : (f | 0) == 18 && (b[802] | 0 ? t3 = 0 : (t3 = h, f = 19));
        do
          if ((f | 0) == 19) {
            e:
              for (;; ) {
                if (c3 = t3 + 2 | 0, r3[72] = c3, t3 >>> 0 >= (r3[73] | 0) >>> 0) {
                  f = 92;
                  break;
                }
                t:
                  do
                    switch (d2[c3 >> 1] | 0) {
                      case 9:
                      case 10:
                      case 11:
                      case 12:
                      case 13:
                      case 32:
                        break;
                      case 101: {
                        !(d2[400] | 0) && K(c3) | 0 && !(A(t3 + 4 | 0, 16, 10) | 0) && $(), f = 91;
                        break;
                      }
                      case 105: {
                        K(c3) | 0 && !(A(t3 + 4 | 0, 26, 10) | 0) && B(), f = 91;
                        break;
                      }
                      case 99: {
                        K(c3) | 0 && !(A(t3 + 4 | 0, 36, 8) | 0) && W(d2[t3 + 12 >> 1] | 0) | 0 && (b[806] = 1), f = 91;
                        break;
                      }
                      case 40: {
                        h = r3[70] | 0, t3 = d2[400] | 0, f = t3 & 65535, r3[h + (f << 3) >> 2] = 1, c3 = r3[69] | 0, d2[400] = t3 + 1 << 16 >> 16, r3[h + (f << 3) + 4 >> 2] = c3, f = 91;
                        break;
                      }
                      case 41: {
                        if (c3 = d2[400] | 0, !(c3 << 16 >> 16)) {
                          f = 36;
                          break e;
                        }
                        h = c3 + -1 << 16 >> 16, d2[400] = h, f = d2[399] | 0, c3 = f & 65535, f << 16 >> 16 && (r3[(r3[70] | 0) + ((h & 65535) << 3) >> 2] | 0) == 5 && (c3 = r3[(r3[71] | 0) + (c3 + -1 << 2) >> 2] | 0, h = c3 + 4 | 0, r3[h >> 2] | 0 || (r3[h >> 2] = (r3[69] | 0) + 2), r3[c3 + 12 >> 2] = t3 + 4, d2[399] = f + -1 << 16 >> 16), f = 91;
                        break;
                      }
                      case 123: {
                        f = r3[69] | 0, h = r3[63] | 0, t3 = f;
                        do
                          if ((d2[f >> 1] | 0) == 41 & (h | 0) != 0 && (r3[h + 4 >> 2] | 0) == (f | 0))
                            if (c3 = r3[64] | 0, r3[63] = c3, c3) {
                              r3[c3 + 32 >> 2] = 0;
                              break;
                            } else {
                              r3[59] = 0;
                              break;
                            }
                        while (false);
                        h = r3[70] | 0, c3 = d2[400] | 0, f = c3 & 65535, r3[h + (f << 3) >> 2] = b[806] | 0 ? 6 : 2, d2[400] = c3 + 1 << 16 >> 16, r3[h + (f << 3) + 4 >> 2] = t3, b[806] = 0, f = 91;
                        break;
                      }
                      case 125: {
                        if (t3 = d2[400] | 0, !(t3 << 16 >> 16)) {
                          f = 49;
                          break e;
                        }
                        h = r3[70] | 0, f = t3 + -1 << 16 >> 16, d2[400] = f, (r3[h + ((f & 65535) << 3) >> 2] | 0) == 4 && De(), f = 91;
                        break;
                      }
                      case 39: {
                        R3(39), f = 91;
                        break;
                      }
                      case 34: {
                        R3(34), f = 91;
                        break;
                      }
                      case 47:
                        switch (d2[t3 + 4 >> 1] | 0) {
                          case 47: {
                            pe();
                            break t;
                          }
                          case 42: {
                            ge(1);
                            break t;
                          }
                          default: {
                            t3 = r3[69] | 0, c3 = d2[t3 >> 1] | 0;
                            n:
                              do
                                if (!(_t(c3) | 0))
                                  c3 << 16 >> 16 == 41 ? (h = d2[400] | 0, At(r3[(r3[70] | 0) + ((h & 65535) << 3) + 4 >> 2] | 0) | 0 || (f = 65)) : f = 64;
                                else
                                  switch (c3 << 16 >> 16) {
                                    case 46:
                                      if (((d2[t3 + -2 >> 1] | 0) + -48 & 65535) < 10) {
                                        f = 64;
                                        break n;
                                      } else
                                        break n;
                                    case 43:
                                      if ((d2[t3 + -2 >> 1] | 0) == 43) {
                                        f = 64;
                                        break n;
                                      } else
                                        break n;
                                    case 45:
                                      if ((d2[t3 + -2 >> 1] | 0) == 45) {
                                        f = 64;
                                        break n;
                                      } else
                                        break n;
                                    default:
                                      break n;
                                  }
                              while (false);
                            (f | 0) == 64 && (h = d2[400] | 0, f = 65);
                            n:
                              do
                                if ((f | 0) == 65) {
                                  if (f = 0, h << 16 >> 16 && (m3 = r3[70] | 0, w = (h & 65535) + -1 | 0, c3 << 16 >> 16 == 102 ? (r3[m3 + (w << 3) >> 2] | 0) == 1 : 0)) {
                                    if ((d2[t3 + -2 >> 1] | 0) == 111 && L2(r3[m3 + (w << 3) + 4 >> 2] | 0, 44, 3) | 0)
                                      break;
                                  } else
                                    f = 69;
                                  if ((f | 0) == 69 && c3 << 16 >> 16 == 125 && (f = r3[70] | 0, h = h & 65535, Et(r3[f + (h << 3) + 4 >> 2] | 0) | 0 || (r3[f + (h << 3) >> 2] | 0) == 6))
                                    break;
                                  if (!(xt(t3) | 0)) {
                                    switch (c3 << 16 >> 16) {
                                      case 0:
                                        break n;
                                      case 47: {
                                        if (b[805] | 0)
                                          break n;
                                        break;
                                      }
                                      default:
                                    }
                                    if (f = r3[65] | 0, f | 0 && t3 >>> 0 >= (r3[f >> 2] | 0) >>> 0 && t3 >>> 0 <= (r3[f + 4 >> 2] | 0) >>> 0) {
                                      de(), b[805] = 0, f = 91;
                                      break t;
                                    }
                                    h = r3[3] | 0;
                                    do {
                                      if (t3 >>> 0 <= h >>> 0)
                                        break;
                                      t3 = t3 + -2 | 0, r3[69] = t3, c3 = d2[t3 >> 1] | 0;
                                    } while (!(be(c3) | 0));
                                    if (se(c3) | 0) {
                                      do {
                                        if (t3 >>> 0 <= h >>> 0)
                                          break;
                                        t3 = t3 + -2 | 0, r3[69] = t3;
                                      } while (se(d2[t3 >> 1] | 0) | 0);
                                      if (Lt(t3) | 0) {
                                        de(), b[805] = 0, f = 91;
                                        break t;
                                      }
                                    }
                                    b[805] = 1, f = 91;
                                    break t;
                                  }
                                }
                              while (false);
                            de(), b[805] = 0, f = 91;
                            break t;
                          }
                        }
                      case 96: {
                        h = r3[70] | 0, c3 = d2[400] | 0, f = c3 & 65535, r3[h + (f << 3) + 4 >> 2] = r3[69], d2[400] = c3 + 1 << 16 >> 16, r3[h + (f << 3) >> 2] = 3, De(), f = 91;
                        break;
                      }
                      default:
                        f = 91;
                    }
                  while (false);
                (f | 0) == 91 && (f = 0, r3[69] = r3[72]), t3 = r3[72] | 0;
              }
            if ((f | 0) == 36) {
              M(), t3 = 0;
              break;
            } else if ((f | 0) == 49) {
              M(), t3 = 0;
              break;
            } else if ((f | 0) == 92) {
              t3 = b[802] | 0 ? 0 : (d2[399] | d2[400]) << 16 >> 16 == 0;
              break;
            }
          }
        while (false);
        return _ = y, t3 | 0;
      }
      u2(N, "b");
      function $() {
        var t3 = 0, c3 = 0, h = 0, f = 0, m3 = 0, w = 0, y = 0, T = 0, we = 0, ke = 0, Ce = 0, ye = 0, x = 0, v = 0;
        T = r3[72] | 0, we = r3[65] | 0, v = T + 12 | 0, r3[72] = v, h = k2(1) | 0, t3 = r3[72] | 0, (t3 | 0) == (v | 0) && !(ie(h) | 0) || (x = 3);
        e:
          do
            if ((x | 0) == 3) {
              t:
                do
                  switch (h << 16 >> 16) {
                    case 123: {
                      for (r3[72] = t3 + 2, t3 = k2(1) | 0, c3 = r3[72] | 0;; ) {
                        if (X(t3) | 0 ? (R3(t3), t3 = (r3[72] | 0) + 2 | 0, r3[72] = t3) : (j(t3) | 0, t3 = r3[72] | 0), k2(1) | 0, t3 = je(c3, t3) | 0, t3 << 16 >> 16 == 44 && (r3[72] = (r3[72] | 0) + 2, t3 = k2(1) | 0), t3 << 16 >> 16 == 125) {
                          x = 15;
                          break;
                        }
                        if (v = c3, c3 = r3[72] | 0, (c3 | 0) == (v | 0)) {
                          x = 12;
                          break;
                        }
                        if (c3 >>> 0 > (r3[73] | 0) >>> 0) {
                          x = 14;
                          break;
                        }
                      }
                      if ((x | 0) == 12) {
                        M();
                        break e;
                      } else if ((x | 0) == 14) {
                        M();
                        break e;
                      } else if ((x | 0) == 15) {
                        b[803] = 1, r3[72] = (r3[72] | 0) + 2;
                        break t;
                      }
                      break;
                    }
                    case 42: {
                      r3[72] = t3 + 2, k2(1) | 0, v = r3[72] | 0, je(v, v) | 0;
                      break;
                    }
                    default: {
                      switch (b[804] = 0, h << 16 >> 16) {
                        case 100: {
                          switch (T = t3 + 14 | 0, r3[72] = T, (k2(1) | 0) << 16 >> 16) {
                            case 97: {
                              c3 = r3[72] | 0, !(A(c3 + 2 | 0, 72, 8) | 0) && (m3 = c3 + 10 | 0, se(d2[m3 >> 1] | 0) | 0) && (r3[72] = m3, k2(0) | 0, x = 22);
                              break;
                            }
                            case 102: {
                              x = 22;
                              break;
                            }
                            case 99: {
                              c3 = r3[72] | 0, !(A(c3 + 2 | 0, 36, 8) | 0) && (f = c3 + 10 | 0, v = d2[f >> 1] | 0, W(v) | 0 | v << 16 >> 16 == 123) && (r3[72] = f, w = k2(1) | 0, w << 16 >> 16 != 123) && (ye = w, x = 31);
                              break;
                            }
                            default:
                          }
                          n:
                            do
                              if ((x | 0) == 22 && (y = r3[72] | 0, (A(y + 2 | 0, 80, 14) | 0) == 0)) {
                                if (h = y + 16 | 0, c3 = d2[h >> 1] | 0, !(W(c3) | 0))
                                  switch (c3 << 16 >> 16) {
                                    case 40:
                                    case 42:
                                      break;
                                    default:
                                      break n;
                                  }
                                r3[72] = h, c3 = k2(1) | 0, c3 << 16 >> 16 == 42 && (r3[72] = (r3[72] | 0) + 2, c3 = k2(1) | 0), c3 << 16 >> 16 != 40 && (ye = c3, x = 31);
                              }
                            while (false);
                          if ((x | 0) == 31 && (ke = r3[72] | 0, j(ye) | 0, Ce = r3[72] | 0, Ce >>> 0 > ke >>> 0)) {
                            P(t3, T, ke, Ce), r3[72] = (r3[72] | 0) + -2;
                            break e;
                          }
                          P(t3, T, 0, 0), r3[72] = t3 + 12;
                          break e;
                        }
                        case 97: {
                          r3[72] = t3 + 10, k2(0) | 0, t3 = r3[72] | 0, x = 35;
                          break;
                        }
                        case 102: {
                          x = 35;
                          break;
                        }
                        case 99: {
                          if (!(A(t3 + 2 | 0, 36, 8) | 0) && (c3 = t3 + 10 | 0, be(d2[c3 >> 1] | 0) | 0)) {
                            r3[72] = c3, v = k2(1) | 0, x = r3[72] | 0, j(v) | 0, v = r3[72] | 0, P(x, v, x, v), r3[72] = (r3[72] | 0) + -2;
                            break e;
                          }
                          t3 = t3 + 4 | 0, r3[72] = t3;
                          break;
                        }
                        case 108:
                        case 118:
                          break;
                        default:
                          break e;
                      }
                      if ((x | 0) == 35) {
                        r3[72] = t3 + 16, t3 = k2(1) | 0, t3 << 16 >> 16 == 42 && (r3[72] = (r3[72] | 0) + 2, t3 = k2(1) | 0), x = r3[72] | 0, j(t3) | 0, v = r3[72] | 0, P(x, v, x, v), r3[72] = (r3[72] | 0) + -2;
                        break e;
                      }
                      r3[72] = t3 + 6, b[804] = 0, h = k2(1) | 0, t3 = r3[72] | 0, h = (j(h) | 0 | 32) << 16 >> 16 == 123, f = r3[72] | 0, h && (r3[72] = f + 2, v = k2(1) | 0, t3 = r3[72] | 0, j(v) | 0);
                      n:
                        for (;c3 = r3[72] | 0, (c3 | 0) != (t3 | 0); ) {
                          if (P(t3, c3, t3, c3), c3 = k2(1) | 0, h)
                            switch (c3 << 16 >> 16) {
                              case 93:
                              case 125:
                                break e;
                              default:
                            }
                          if (t3 = r3[72] | 0, c3 << 16 >> 16 != 44) {
                            x = 51;
                            break;
                          }
                          switch (r3[72] = t3 + 2, c3 = k2(1) | 0, t3 = r3[72] | 0, c3 << 16 >> 16) {
                            case 91:
                            case 123: {
                              x = 51;
                              break n;
                            }
                            default:
                          }
                          j(c3) | 0;
                        }
                      if ((x | 0) == 51 && (r3[72] = t3 + -2), !h)
                        break e;
                      r3[72] = f + -2;
                      break e;
                    }
                  }
                while (false);
              if (v = (k2(1) | 0) << 16 >> 16 == 102, t3 = r3[72] | 0, v && !(A(t3 + 2 | 0, 66, 6) | 0))
                for (r3[72] = t3 + 8, H(T, k2(1) | 0, 0), t3 = we | 0 ? we + 16 | 0 : 240;; ) {
                  if (t3 = r3[t3 >> 2] | 0, !t3)
                    break e;
                  r3[t3 + 12 >> 2] = 0, r3[t3 + 8 >> 2] = 0, t3 = t3 + 16 | 0;
                }
              r3[72] = t3 + -2;
            }
          while (false);
      }
      u2($, "k");
      function B() {
        var t3 = 0, c3 = 0, h = 0, f = 0, m3 = 0, w = 0, y = 0;
        m3 = r3[72] | 0, h = m3 + 12 | 0, r3[72] = h, f = k2(1) | 0, c3 = r3[72] | 0;
        e:
          do
            if (f << 16 >> 16 != 46)
              f << 16 >> 16 == 115 & c3 >>> 0 > h >>> 0 ? !(A(c3 + 2 | 0, 56, 10) | 0) && (t3 = c3 + 12 | 0, W(d2[t3 >> 1] | 0) | 0) ? w = 14 : (c3 = 6, h = 0, w = 46) : (t3 = f, h = 0, w = 15);
            else
              switch (r3[72] = c3 + 2, (k2(1) | 0) << 16 >> 16) {
                case 109: {
                  if (t3 = r3[72] | 0, A(t3 + 2 | 0, 50, 6) | 0 || (c3 = r3[69] | 0, !(me(c3) | 0) && (d2[c3 >> 1] | 0) == 46))
                    break e;
                  he(m3, m3, t3 + 8 | 0, 2);
                  break e;
                }
                case 115: {
                  if (t3 = r3[72] | 0, A(t3 + 2 | 0, 56, 10) | 0 || (c3 = r3[69] | 0, !(me(c3) | 0) && (d2[c3 >> 1] | 0) == 46))
                    break e;
                  t3 = t3 + 12 | 0, w = 14;
                  break e;
                }
                default:
                  break e;
              }
          while (false);
        (w | 0) == 14 && (r3[72] = t3, t3 = k2(1) | 0, h = 1, w = 15);
        e:
          do
            if ((w | 0) == 15)
              switch (t3 << 16 >> 16) {
                case 40: {
                  if (c3 = r3[70] | 0, y = d2[400] | 0, f = y & 65535, r3[c3 + (f << 3) >> 2] = 5, t3 = r3[72] | 0, d2[400] = y + 1 << 16 >> 16, r3[c3 + (f << 3) + 4 >> 2] = t3, (d2[r3[69] >> 1] | 0) == 46)
                    break e;
                  switch (r3[72] = t3 + 2, c3 = k2(1) | 0, he(m3, r3[72] | 0, 0, t3), h ? (t3 = r3[63] | 0, r3[t3 + 28 >> 2] = 5) : t3 = r3[63] | 0, m3 = r3[71] | 0, y = d2[399] | 0, d2[399] = y + 1 << 16 >> 16, r3[m3 + ((y & 65535) << 2) >> 2] = t3, c3 << 16 >> 16) {
                    case 39: {
                      R3(39);
                      break;
                    }
                    case 34: {
                      R3(34);
                      break;
                    }
                    default: {
                      r3[72] = (r3[72] | 0) + -2;
                      break e;
                    }
                  }
                  switch (t3 = (r3[72] | 0) + 2 | 0, r3[72] = t3, (k2(1) | 0) << 16 >> 16) {
                    case 44: {
                      r3[72] = (r3[72] | 0) + 2, k2(1) | 0, m3 = r3[63] | 0, r3[m3 + 4 >> 2] = t3, y = r3[72] | 0, r3[m3 + 16 >> 2] = y, b[m3 + 24 >> 0] = 1, r3[72] = y + -2;
                      break e;
                    }
                    case 41: {
                      d2[400] = (d2[400] | 0) + -1 << 16 >> 16, y = r3[63] | 0, r3[y + 4 >> 2] = t3, r3[y + 12 >> 2] = (r3[72] | 0) + 2, b[y + 24 >> 0] = 1, d2[399] = (d2[399] | 0) + -1 << 16 >> 16;
                      break e;
                    }
                    default: {
                      r3[72] = (r3[72] | 0) + -2;
                      break e;
                    }
                  }
                }
                case 123: {
                  if (h) {
                    c3 = 12, h = 1, w = 46;
                    break e;
                  }
                  if (t3 = r3[72] | 0, d2[400] | 0) {
                    r3[72] = t3 + -2;
                    break e;
                  }
                  for (;!(t3 >>> 0 >= (r3[73] | 0) >>> 0); ) {
                    if (t3 = k2(1) | 0, X(t3) | 0)
                      R3(t3);
                    else if (t3 << 16 >> 16 == 125) {
                      w = 36;
                      break;
                    }
                    t3 = (r3[72] | 0) + 2 | 0, r3[72] = t3;
                  }
                  if ((w | 0) == 36 && (r3[72] = (r3[72] | 0) + 2), y = (k2(1) | 0) << 16 >> 16 == 102, t3 = r3[72] | 0, y && A(t3 + 2 | 0, 66, 6) | 0) {
                    M();
                    break e;
                  }
                  if (r3[72] = t3 + 8, t3 = k2(1) | 0, X(t3) | 0) {
                    H(m3, t3, 0);
                    break e;
                  } else {
                    M();
                    break e;
                  }
                }
                default: {
                  if (h) {
                    c3 = 12, h = 1, w = 46;
                    break e;
                  }
                  switch (t3 << 16 >> 16) {
                    case 42:
                    case 39:
                    case 34: {
                      h = 0, w = 48;
                      break e;
                    }
                    default: {
                      c3 = 6, h = 0, w = 46;
                      break e;
                    }
                  }
                }
              }
          while (false);
        (w | 0) == 46 && (t3 = r3[72] | 0, (t3 | 0) == (m3 + (c3 << 1) | 0) ? r3[72] = t3 + -2 : w = 48);
        do
          if ((w | 0) == 48) {
            if (d2[400] | 0) {
              r3[72] = (r3[72] | 0) + -2;
              break;
            }
            for (t3 = r3[73] | 0, c3 = r3[72] | 0;; ) {
              if (c3 >>> 0 >= t3 >>> 0) {
                w = 55;
                break;
              }
              if (f = d2[c3 >> 1] | 0, X(f) | 0) {
                w = 53;
                break;
              }
              y = c3 + 2 | 0, r3[72] = y, c3 = y;
            }
            if ((w | 0) == 53) {
              H(m3, f, h);
              break;
            } else if ((w | 0) == 55) {
              M();
              break;
            }
          }
        while (false);
      }
      u2(B, "l");
      function H(t3, c3, h) {
        t3 = t3 | 0, c3 = c3 | 0, h = h | 0;
        var f = 0, m3 = 0;
        switch (f = (r3[72] | 0) + 2 | 0, c3 << 16 >> 16) {
          case 39: {
            R3(39), m3 = 5;
            break;
          }
          case 34: {
            R3(34), m3 = 5;
            break;
          }
          default:
            M();
        }
        do
          if ((m3 | 0) == 5) {
            if (he(t3, f, r3[72] | 0, 1), h && (r3[(r3[63] | 0) + 28 >> 2] = 4), r3[72] = (r3[72] | 0) + 2, c3 = k2(0) | 0, h = c3 << 16 >> 16 == 97, h ? (f = r3[72] | 0, A(f + 2 | 0, 94, 10) | 0 && (m3 = 13)) : (f = r3[72] | 0, c3 << 16 >> 16 == 119 && (d2[f + 2 >> 1] | 0) == 105 && (d2[f + 4 >> 1] | 0) == 116 && (d2[f + 6 >> 1] | 0) == 104 || (m3 = 13)), (m3 | 0) == 13) {
              r3[72] = f + -2;
              break;
            }
            if (r3[72] = f + ((h ? 6 : 4) << 1), (k2(1) | 0) << 16 >> 16 != 123) {
              r3[72] = f;
              break;
            }
            h = r3[72] | 0, c3 = h;
            e:
              for (;; ) {
                switch (r3[72] = c3 + 2, c3 = k2(1) | 0, c3 << 16 >> 16) {
                  case 39: {
                    R3(39), r3[72] = (r3[72] | 0) + 2, c3 = k2(1) | 0;
                    break;
                  }
                  case 34: {
                    R3(34), r3[72] = (r3[72] | 0) + 2, c3 = k2(1) | 0;
                    break;
                  }
                  default:
                    c3 = j(c3) | 0;
                }
                if (c3 << 16 >> 16 != 58) {
                  m3 = 22;
                  break;
                }
                switch (r3[72] = (r3[72] | 0) + 2, (k2(1) | 0) << 16 >> 16) {
                  case 39: {
                    R3(39);
                    break;
                  }
                  case 34: {
                    R3(34);
                    break;
                  }
                  default: {
                    m3 = 26;
                    break e;
                  }
                }
                switch (r3[72] = (r3[72] | 0) + 2, (k2(1) | 0) << 16 >> 16) {
                  case 125: {
                    m3 = 31;
                    break e;
                  }
                  case 44:
                    break;
                  default: {
                    m3 = 30;
                    break e;
                  }
                }
                if (r3[72] = (r3[72] | 0) + 2, (k2(1) | 0) << 16 >> 16 == 125) {
                  m3 = 31;
                  break;
                }
                c3 = r3[72] | 0;
              }
            if ((m3 | 0) == 22) {
              r3[72] = f;
              break;
            } else if ((m3 | 0) == 26) {
              r3[72] = f;
              break;
            } else if ((m3 | 0) == 30) {
              r3[72] = f;
              break;
            } else if ((m3 | 0) == 31) {
              m3 = r3[63] | 0, r3[m3 + 16 >> 2] = h, r3[m3 + 12 >> 2] = (r3[72] | 0) + 2;
              break;
            }
          }
        while (false);
      }
      u2(H, "u");
      function xt(t3) {
        t3 = t3 | 0;
        e:
          do
            switch (d2[t3 >> 1] | 0) {
              case 100:
                switch (d2[t3 + -2 >> 1] | 0) {
                  case 105: {
                    t3 = L2(t3 + -4 | 0, 104, 2) | 0;
                    break e;
                  }
                  case 108: {
                    t3 = L2(t3 + -4 | 0, 108, 3) | 0;
                    break e;
                  }
                  default: {
                    t3 = 0;
                    break e;
                  }
                }
              case 101:
                switch (d2[t3 + -2 >> 1] | 0) {
                  case 115:
                    switch (d2[t3 + -4 >> 1] | 0) {
                      case 108: {
                        t3 = G2(t3 + -6 | 0, 101) | 0;
                        break e;
                      }
                      case 97: {
                        t3 = G2(t3 + -6 | 0, 99) | 0;
                        break e;
                      }
                      default: {
                        t3 = 0;
                        break e;
                      }
                    }
                  case 116: {
                    t3 = L2(t3 + -4 | 0, 114, 4) | 0;
                    break e;
                  }
                  case 117: {
                    t3 = L2(t3 + -4 | 0, 122, 6) | 0;
                    break e;
                  }
                  default: {
                    t3 = 0;
                    break e;
                  }
                }
              case 102: {
                if ((d2[t3 + -2 >> 1] | 0) == 111 && (d2[t3 + -4 >> 1] | 0) == 101)
                  switch (d2[t3 + -6 >> 1] | 0) {
                    case 99: {
                      t3 = L2(t3 + -8 | 0, 134, 6) | 0;
                      break e;
                    }
                    case 112: {
                      t3 = L2(t3 + -8 | 0, 146, 2) | 0;
                      break e;
                    }
                    default: {
                      t3 = 0;
                      break e;
                    }
                  }
                else
                  t3 = 0;
                break;
              }
              case 107: {
                t3 = L2(t3 + -2 | 0, 150, 4) | 0;
                break;
              }
              case 110: {
                t3 = t3 + -2 | 0, G2(t3, 105) | 0 ? t3 = 1 : t3 = L2(t3, 158, 5) | 0;
                break;
              }
              case 111: {
                t3 = G2(t3 + -2 | 0, 100) | 0;
                break;
              }
              case 114: {
                t3 = L2(t3 + -2 | 0, 168, 7) | 0;
                break;
              }
              case 116: {
                t3 = L2(t3 + -2 | 0, 182, 4) | 0;
                break;
              }
              case 119:
                switch (d2[t3 + -2 >> 1] | 0) {
                  case 101: {
                    t3 = G2(t3 + -4 | 0, 110) | 0;
                    break e;
                  }
                  case 111: {
                    t3 = L2(t3 + -4 | 0, 190, 3) | 0;
                    break e;
                  }
                  default: {
                    t3 = 0;
                    break e;
                  }
                }
              default:
                t3 = 0;
            }
          while (false);
        return t3 | 0;
      }
      u2(xt, "o");
      function De() {
        var t3 = 0, c3 = 0, h = 0, f = 0;
        c3 = r3[73] | 0, h = r3[72] | 0;
        e:
          for (;; ) {
            if (t3 = h + 2 | 0, h >>> 0 >= c3 >>> 0) {
              c3 = 10;
              break;
            }
            switch (d2[t3 >> 1] | 0) {
              case 96: {
                c3 = 7;
                break e;
              }
              case 36: {
                if ((d2[h + 4 >> 1] | 0) == 123) {
                  c3 = 6;
                  break e;
                }
                break;
              }
              case 92: {
                t3 = h + 4 | 0;
                break;
              }
              default:
            }
            h = t3;
          }
        (c3 | 0) == 6 ? (t3 = h + 4 | 0, r3[72] = t3, c3 = r3[70] | 0, f = d2[400] | 0, h = f & 65535, r3[c3 + (h << 3) >> 2] = 4, d2[400] = f + 1 << 16 >> 16, r3[c3 + (h << 3) + 4 >> 2] = t3) : (c3 | 0) == 7 ? (r3[72] = t3, h = r3[70] | 0, f = (d2[400] | 0) + -1 << 16 >> 16, d2[400] = f, (r3[h + ((f & 65535) << 3) >> 2] | 0) != 3 && M()) : (c3 | 0) == 10 && (r3[72] = t3, M());
      }
      u2(De, "h");
      function k2(t3) {
        t3 = t3 | 0;
        var c3 = 0, h = 0, f = 0;
        h = r3[72] | 0;
        e:
          do {
            c3 = d2[h >> 1] | 0;
            t:
              do
                if (c3 << 16 >> 16 != 47)
                  if (t3) {
                    if (W(c3) | 0)
                      break;
                    break e;
                  } else {
                    if (se(c3) | 0)
                      break;
                    break e;
                  }
                else
                  switch (d2[h + 2 >> 1] | 0) {
                    case 47: {
                      pe();
                      break t;
                    }
                    case 42: {
                      ge(t3);
                      break t;
                    }
                    default: {
                      c3 = 47;
                      break e;
                    }
                  }
              while (false);
            f = r3[72] | 0, h = f + 2 | 0, r3[72] = h;
          } while (f >>> 0 < (r3[73] | 0) >>> 0);
        return c3 | 0;
      }
      u2(k2, "w");
      function he(t3, c3, h, f) {
        t3 = t3 | 0, c3 = c3 | 0, h = h | 0, f = f | 0;
        var m3 = 0, w = 0;
        w = r3[67] | 0, r3[67] = w + 36, m3 = r3[63] | 0, r3[(m3 | 0 ? m3 + 32 | 0 : 236) >> 2] = w, r3[64] = m3, r3[63] = w, r3[w + 8 >> 2] = t3, (f | 0) == 2 ? (t3 = 3, m3 = h) : (m3 = (f | 0) == 1, t3 = m3 ? 1 : 2, m3 = m3 ? h + 2 | 0 : 0), r3[w + 12 >> 2] = m3, r3[w + 28 >> 2] = t3, r3[w >> 2] = c3, r3[w + 4 >> 2] = h, r3[w + 16 >> 2] = 0, r3[w + 20 >> 2] = f, c3 = (f | 0) == 1, b[w + 24 >> 0] = c3 & 1, r3[w + 32 >> 2] = 0, c3 | (f | 0) == 2 && (b[803] = 1);
      }
      u2(he, "d");
      function R3(t3) {
        t3 = t3 | 0;
        var c3 = 0, h = 0, f = 0, m3 = 0;
        for (m3 = r3[73] | 0, c3 = r3[72] | 0;; ) {
          if (f = c3 + 2 | 0, c3 >>> 0 >= m3 >>> 0) {
            c3 = 9;
            break;
          }
          if (h = d2[f >> 1] | 0, h << 16 >> 16 == t3 << 16 >> 16) {
            c3 = 10;
            break;
          }
          if (h << 16 >> 16 == 92)
            h = c3 + 4 | 0, (d2[h >> 1] | 0) == 13 ? (c3 = c3 + 6 | 0, c3 = (d2[c3 >> 1] | 0) == 10 ? c3 : h) : c3 = h;
          else if (Te(h) | 0) {
            c3 = 9;
            break;
          } else
            c3 = f;
        }
        (c3 | 0) == 9 ? (r3[72] = f, M()) : (c3 | 0) == 10 && (r3[72] = f);
      }
      u2(R3, "v");
      function je(t3, c3) {
        t3 = t3 | 0, c3 = c3 | 0;
        var h = 0, f = 0, m3 = 0, w = 0;
        return h = r3[72] | 0, f = d2[h >> 1] | 0, w = (t3 | 0) == (c3 | 0), m3 = w ? 0 : t3, w = w ? 0 : c3, f << 16 >> 16 == 97 && (r3[72] = h + 4, h = k2(1) | 0, t3 = r3[72] | 0, X(h) | 0 ? (R3(h), c3 = (r3[72] | 0) + 2 | 0, r3[72] = c3) : (j(h) | 0, c3 = r3[72] | 0), f = k2(1) | 0, h = r3[72] | 0), (h | 0) != (t3 | 0) && P(t3, c3, m3, w), f | 0;
      }
      u2(je, "A");
      function vt() {
        var t3 = 0, c3 = 0, h = 0;
        h = r3[73] | 0, c3 = r3[72] | 0;
        e:
          for (;; ) {
            if (t3 = c3 + 2 | 0, c3 >>> 0 >= h >>> 0) {
              c3 = 6;
              break;
            }
            switch (d2[t3 >> 1] | 0) {
              case 13:
              case 10: {
                c3 = 6;
                break e;
              }
              case 93: {
                c3 = 7;
                break e;
              }
              case 92: {
                t3 = c3 + 4 | 0;
                break;
              }
              default:
            }
            c3 = t3;
          }
        return (c3 | 0) == 6 ? (r3[72] = t3, M(), t3 = 0) : (c3 | 0) == 7 && (r3[72] = t3, t3 = 93), t3 | 0;
      }
      u2(vt, "C");
      function de() {
        var t3 = 0, c3 = 0, h = 0;
        e:
          for (;; ) {
            if (t3 = r3[72] | 0, c3 = t3 + 2 | 0, r3[72] = c3, t3 >>> 0 >= (r3[73] | 0) >>> 0) {
              h = 7;
              break;
            }
            switch (d2[c3 >> 1] | 0) {
              case 13:
              case 10: {
                h = 7;
                break e;
              }
              case 47:
                break e;
              case 91: {
                vt() | 0;
                break;
              }
              case 92: {
                r3[72] = t3 + 4;
                break;
              }
              default:
            }
          }
        (h | 0) == 7 && M();
      }
      u2(de, "g");
      function Et(t3) {
        switch (t3 = t3 | 0, d2[t3 >> 1] | 0) {
          case 62: {
            t3 = (d2[t3 + -2 >> 1] | 0) == 61;
            break;
          }
          case 41:
          case 59: {
            t3 = 1;
            break;
          }
          case 104: {
            t3 = L2(t3 + -2 | 0, 210, 4) | 0;
            break;
          }
          case 121: {
            t3 = L2(t3 + -2 | 0, 218, 6) | 0;
            break;
          }
          case 101: {
            t3 = L2(t3 + -2 | 0, 230, 3) | 0;
            break;
          }
          default:
            t3 = 0;
        }
        return t3 | 0;
      }
      u2(Et, "p");
      function ge(t3) {
        t3 = t3 | 0;
        var c3 = 0, h = 0, f = 0, m3 = 0, w = 0;
        for (m3 = (r3[72] | 0) + 2 | 0, r3[72] = m3, h = r3[73] | 0;c3 = m3 + 2 | 0, !(m3 >>> 0 >= h >>> 0 || (f = d2[c3 >> 1] | 0, !t3 && Te(f) | 0)); ) {
          if (f << 16 >> 16 == 42 && (d2[m3 + 4 >> 1] | 0) == 47) {
            w = 8;
            break;
          }
          m3 = c3;
        }
        (w | 0) == 8 && (r3[72] = c3, c3 = m3 + 4 | 0), r3[72] = c3;
      }
      u2(ge, "y");
      function A(t3, c3, h) {
        t3 = t3 | 0, c3 = c3 | 0, h = h | 0;
        var f = 0, m3 = 0;
        e:
          do
            if (!h)
              t3 = 0;
            else {
              for (;f = b[t3 >> 0] | 0, m3 = b[c3 >> 0] | 0, f << 24 >> 24 == m3 << 24 >> 24; )
                if (h = h + -1 | 0, h)
                  t3 = t3 + 1 | 0, c3 = c3 + 1 | 0;
                else {
                  t3 = 0;
                  break e;
                }
              t3 = (f & 255) - (m3 & 255) | 0;
            }
          while (false);
        return t3 | 0;
      }
      u2(A, "m");
      function ie(t3) {
        t3 = t3 | 0;
        e:
          do
            switch (t3 << 16 >> 16) {
              case 38:
              case 37:
              case 33: {
                t3 = 1;
                break;
              }
              default:
                if ((t3 & -8) << 16 >> 16 == 40 | (t3 + -58 & 65535) < 6)
                  t3 = 1;
                else {
                  switch (t3 << 16 >> 16) {
                    case 91:
                    case 93:
                    case 94: {
                      t3 = 1;
                      break e;
                    }
                    default:
                  }
                  t3 = (t3 + -123 & 65535) < 4;
                }
            }
          while (false);
        return t3 | 0;
      }
      u2(ie, "I");
      function _t(t3) {
        t3 = t3 | 0;
        e:
          do
            switch (t3 << 16 >> 16) {
              case 38:
              case 37:
              case 33:
                break;
              default:
                if (!((t3 + -58 & 65535) < 6 | (t3 + -40 & 65535) < 7 & t3 << 16 >> 16 != 41)) {
                  switch (t3 << 16 >> 16) {
                    case 91:
                    case 94:
                      break e;
                    default:
                  }
                  return t3 << 16 >> 16 != 125 & (t3 + -123 & 65535) < 4 | 0;
                }
            }
          while (false);
        return 1;
      }
      u2(_t, "U");
      function Ue(t3) {
        t3 = t3 | 0;
        var c3 = 0;
        c3 = d2[t3 >> 1] | 0;
        e:
          do
            if ((c3 + -9 & 65535) >= 5) {
              switch (c3 << 16 >> 16) {
                case 160:
                case 32: {
                  c3 = 1;
                  break e;
                }
                default:
              }
              if (ie(c3) | 0)
                return c3 << 16 >> 16 != 46 | (me(t3) | 0) | 0;
              c3 = 0;
            } else
              c3 = 1;
          while (false);
        return c3 | 0;
      }
      u2(Ue, "x");
      function It(t3) {
        t3 = t3 | 0;
        var c3 = 0, h = 0, f = 0, m3 = 0;
        return h = _, _ = _ + 16 | 0, f = h, r3[f >> 2] = 0, r3[66] = t3, c3 = r3[3] | 0, m3 = c3 + (t3 << 1) | 0, t3 = m3 + 2 | 0, d2[m3 >> 1] = 0, r3[f >> 2] = t3, r3[67] = t3, r3[59] = 0, r3[63] = 0, r3[61] = 0, r3[60] = 0, r3[65] = 0, r3[62] = 0, _ = h, c3 | 0;
      }
      u2(It, "S");
      function P(t3, c3, h, f) {
        t3 = t3 | 0, c3 = c3 | 0, h = h | 0, f = f | 0;
        var m3 = 0, w = 0;
        m3 = r3[67] | 0, r3[67] = m3 + 20, w = r3[65] | 0, r3[(w | 0 ? w + 16 | 0 : 240) >> 2] = m3, r3[65] = m3, r3[m3 >> 2] = t3, r3[m3 + 4 >> 2] = c3, r3[m3 + 8 >> 2] = h, r3[m3 + 12 >> 2] = f, r3[m3 + 16 >> 2] = 0, b[803] = 1;
      }
      u2(P, "O");
      function L2(t3, c3, h) {
        t3 = t3 | 0, c3 = c3 | 0, h = h | 0;
        var f = 0, m3 = 0;
        return f = t3 + (0 - h << 1) | 0, m3 = f + 2 | 0, t3 = r3[3] | 0, m3 >>> 0 >= t3 >>> 0 && !(A(m3, c3, h << 1) | 0) ? (m3 | 0) == (t3 | 0) ? t3 = 1 : t3 = Ue(f) | 0 : t3 = 0, t3 | 0;
      }
      u2(L2, "$");
      function Lt(t3) {
        switch (t3 = t3 | 0, d2[t3 >> 1] | 0) {
          case 107: {
            t3 = L2(t3 + -2 | 0, 150, 4) | 0;
            break;
          }
          case 101: {
            (d2[t3 + -2 >> 1] | 0) == 117 ? t3 = L2(t3 + -4 | 0, 122, 6) | 0 : t3 = 0;
            break;
          }
          default:
            t3 = 0;
        }
        return t3 | 0;
      }
      u2(Lt, "j");
      function G2(t3, c3) {
        t3 = t3 | 0, c3 = c3 | 0;
        var h = 0;
        return h = r3[3] | 0, h >>> 0 <= t3 >>> 0 && (d2[t3 >> 1] | 0) == c3 << 16 >> 16 ? (h | 0) == (t3 | 0) ? h = 1 : h = be(d2[t3 + -2 >> 1] | 0) | 0 : h = 0, h | 0;
      }
      u2(G2, "B");
      function be(t3) {
        t3 = t3 | 0;
        e:
          do
            if ((t3 + -9 & 65535) < 5)
              t3 = 1;
            else {
              switch (t3 << 16 >> 16) {
                case 32:
                case 160: {
                  t3 = 1;
                  break e;
                }
                default:
              }
              t3 = t3 << 16 >> 16 != 46 & (ie(t3) | 0);
            }
          while (false);
        return t3 | 0;
      }
      u2(be, "E");
      function pe() {
        var t3 = 0, c3 = 0, h = 0;
        t3 = r3[73] | 0, h = r3[72] | 0;
        e:
          for (;c3 = h + 2 | 0, !(h >>> 0 >= t3 >>> 0); )
            switch (d2[c3 >> 1] | 0) {
              case 13:
              case 10:
                break e;
              default:
                h = c3;
            }
        r3[72] = c3;
      }
      u2(pe, "P");
      function j(t3) {
        for (t3 = t3 | 0;!(W(t3) | 0 || ie(t3) | 0); )
          if (t3 = (r3[72] | 0) + 2 | 0, r3[72] = t3, t3 = d2[t3 >> 1] | 0, !(t3 << 16 >> 16)) {
            t3 = 0;
            break;
          }
        return t3 | 0;
      }
      u2(j, "q");
      function Ot() {
        var t3 = 0;
        switch (t3 = r3[(r3[61] | 0) + 20 >> 2] | 0, t3 | 0) {
          case 1: {
            t3 = -1;
            break;
          }
          case 2: {
            t3 = -2;
            break;
          }
          default:
            t3 = t3 - (r3[3] | 0) >> 1;
        }
        return t3 | 0;
      }
      u2(Ot, "z");
      function At(t3) {
        return t3 = t3 | 0, !(L2(t3, 196, 5) | 0) && !(L2(t3, 44, 3) | 0) ? t3 = L2(t3, 206, 2) | 0 : t3 = 1, t3 | 0;
      }
      u2(At, "D");
      function se(t3) {
        switch (t3 = t3 | 0, t3 << 16 >> 16) {
          case 160:
          case 32:
          case 12:
          case 11:
          case 9: {
            t3 = 1;
            break;
          }
          default:
            t3 = 0;
        }
        return t3 | 0;
      }
      u2(se, "F");
      function me(t3) {
        return t3 = t3 | 0, (d2[t3 >> 1] | 0) == 46 && (d2[t3 + -2 >> 1] | 0) == 46 ? t3 = (d2[t3 + -4 >> 1] | 0) == 46 : t3 = 0, t3 | 0;
      }
      u2(me, "G");
      function K(t3) {
        return t3 = t3 | 0, (r3[3] | 0) == (t3 | 0) ? t3 = 1 : t3 = Ue(t3 + -2 | 0) | 0, t3 | 0;
      }
      u2(K, "H");
      function Nt() {
        var t3 = 0;
        return t3 = r3[(r3[62] | 0) + 12 >> 2] | 0, t3 ? t3 = t3 - (r3[3] | 0) >> 1 : t3 = -1, t3 | 0;
      }
      u2(Nt, "J");
      function Rt() {
        var t3 = 0;
        return t3 = r3[(r3[61] | 0) + 12 >> 2] | 0, t3 ? t3 = t3 - (r3[3] | 0) >> 1 : t3 = -1, t3 | 0;
      }
      u2(Rt, "K");
      function Mt() {
        var t3 = 0;
        return t3 = r3[(r3[62] | 0) + 8 >> 2] | 0, t3 ? t3 = t3 - (r3[3] | 0) >> 1 : t3 = -1, t3 | 0;
      }
      u2(Mt, "L");
      function $t() {
        var t3 = 0;
        return t3 = r3[(r3[61] | 0) + 16 >> 2] | 0, t3 ? t3 = t3 - (r3[3] | 0) >> 1 : t3 = -1, t3 | 0;
      }
      u2($t, "M");
      function Dt() {
        var t3 = 0;
        return t3 = r3[(r3[61] | 0) + 4 >> 2] | 0, t3 ? t3 = t3 - (r3[3] | 0) >> 1 : t3 = -1, t3 | 0;
      }
      u2(Dt, "N");
      function jt() {
        var t3 = 0;
        return t3 = r3[61] | 0, t3 = r3[(t3 | 0 ? t3 + 32 | 0 : 236) >> 2] | 0, r3[61] = t3, (t3 | 0) != 0 | 0;
      }
      u2(jt, "Q");
      function Ut() {
        var t3 = 0;
        return t3 = r3[62] | 0, t3 = r3[(t3 | 0 ? t3 + 16 | 0 : 240) >> 2] | 0, r3[62] = t3, (t3 | 0) != 0 | 0;
      }
      u2(Ut, "R");
      function M() {
        b[802] = 1, r3[68] = (r3[72] | 0) - (r3[3] | 0) >> 1, r3[72] = (r3[73] | 0) + 2;
      }
      u2(M, "T");
      function W(t3) {
        return t3 = t3 | 0, (t3 | 128) << 16 >> 16 == 160 | (t3 + -9 & 65535) < 5 | 0;
      }
      u2(W, "V");
      function X(t3) {
        return t3 = t3 | 0, t3 << 16 >> 16 == 39 | t3 << 16 >> 16 == 34 | 0;
      }
      u2(X, "W");
      function Tt() {
        return (r3[(r3[61] | 0) + 8 >> 2] | 0) - (r3[3] | 0) >> 1 | 0;
      }
      u2(Tt, "X");
      function Ft() {
        return (r3[(r3[62] | 0) + 4 >> 2] | 0) - (r3[3] | 0) >> 1 | 0;
      }
      u2(Ft, "Y");
      function Te(t3) {
        return t3 = t3 | 0, t3 << 16 >> 16 == 13 | t3 << 16 >> 16 == 10 | 0;
      }
      u2(Te, "Z");
      function Bt() {
        return (r3[r3[61] >> 2] | 0) - (r3[3] | 0) >> 1 | 0;
      }
      u2(Bt, "_");
      function Pt() {
        return (r3[r3[62] >> 2] | 0) - (r3[3] | 0) >> 1 | 0;
      }
      u2(Pt, "ee");
      function Wt() {
        return S[(r3[61] | 0) + 24 >> 0] | 0 | 0;
      }
      u2(Wt, "ae");
      function Jt(t3) {
        t3 = t3 | 0, r3[3] = t3;
      }
      u2(Jt, "re");
      function qt() {
        return r3[(r3[61] | 0) + 28 >> 2] | 0;
      }
      u2(qt, "ie");
      function zt() {
        return (b[803] | 0) != 0 | 0;
      }
      u2(zt, "se");
      function Ht() {
        return (b[804] | 0) != 0 | 0;
      }
      u2(Ht, "fe");
      function Gt() {
        return r3[68] | 0;
      }
      u2(Gt, "te");
      function Kt(t3) {
        return t3 = t3 | 0, _ = t3 + 992 + 15 & -16, 992;
      }
      return u2(Kt, "ce"), { su: Kt, ai: $t, e: Gt, ee: Ft, ele: Nt, els: Mt, es: Pt, f: Ht, id: Ot, ie: Dt, ip: Wt, is: Bt, it: qt, ms: zt, p: N, re: Ut, ri: jt, sa: It, se: Rt, ses: Jt, ss: Tt };
    }(typeof self < "u" ? self : global, {}, oe), ve = E.su(Y2 - (2 << 17));
  }
  const i3 = I.length + 1;
  E.ses(ve), E.sa(i3 - 1), Be(I, new Uint16Array(oe, ve, i3)), E.p() || (C = E.e(), U());
  const o4 = [], a4 = [];
  for (;E.ri(); ) {
    const l2 = E.is(), p3 = E.ie(), g = E.ai(), b = E.id(), d2 = E.ss(), r3 = E.se(), S = E.it();
    let O;
    E.ip() && (O = Ee(b === -1 ? l2 : l2 + 1, I.charCodeAt(b === -1 ? l2 - 1 : l2))), o4.push({ t: S, n: O, s: l2, e: p3, ss: d2, se: r3, d: b, a: g });
  }
  for (;E.re(); ) {
    const l2 = E.es(), p3 = E.ee(), g = E.els(), b = E.ele(), d2 = I.charCodeAt(l2), r3 = g >= 0 ? I.charCodeAt(g) : -1;
    a4.push({ s: l2, e: p3, ls: g, le: b, n: d2 === 34 || d2 === 39 ? Ee(l2 + 1, d2) : I.slice(l2, p3), ln: g < 0 ? undefined : r3 === 34 || r3 === 39 ? Ee(g + 1, r3) : I.slice(g, b) });
  }
  return [o4, a4, !!E.f(), !!E.ms()];
}
function Ee(s2, e2) {
  C = s2;
  let n3 = "", i3 = C;
  for (;; ) {
    C >= I.length && U();
    const o4 = I.charCodeAt(C);
    if (o4 === e2)
      break;
    o4 === 92 ? (n3 += I.slice(i3, C), n3 += an(), i3 = C) : (o4 === 8232 || o4 === 8233 || We(o4) && U(), ++C);
  }
  return n3 += I.slice(i3, C++), n3;
}
function an() {
  let s2 = I.charCodeAt(++C);
  switch (++C, s2) {
    case 110:
      return `
`;
    case 114:
      return "\r";
    case 120:
      return String.fromCharCode(_e(2));
    case 117:
      return function() {
        const e2 = I.charCodeAt(C);
        let n3;
        return e2 === 123 ? (++C, n3 = _e(I.indexOf("}", C) - C), ++C, n3 > 1114111 && U()) : n3 = _e(4), n3 <= 65535 ? String.fromCharCode(n3) : (n3 -= 65536, String.fromCharCode(55296 + (n3 >> 10), 56320 + (1023 & n3)));
      }();
    case 116:
      return "\t";
    case 98:
      return "\b";
    case 118:
      return "\v";
    case 102:
      return "\f";
    case 13:
      I.charCodeAt(C) === 10 && ++C;
    case 10:
      return "";
    case 56:
    case 57:
      U();
    default:
      if (s2 >= 48 && s2 <= 55) {
        let e2 = I.substr(C - 1, 3).match(/^[0-7]+/)[0], n3 = parseInt(e2, 8);
        return n3 > 255 && (e2 = e2.slice(0, -1), n3 = parseInt(e2, 8)), C += e2.length - 1, s2 = I.charCodeAt(C), e2 === "0" && s2 !== 56 && s2 !== 57 || U(), String.fromCharCode(n3);
      }
      return We(s2) ? "" : String.fromCharCode(s2);
  }
}
function _e(s2) {
  const e2 = C;
  let n3 = 0, i3 = 0;
  for (let o4 = 0;o4 < s2; ++o4, ++C) {
    let a4, l2 = I.charCodeAt(C);
    if (l2 !== 95) {
      if (l2 >= 97)
        a4 = l2 - 97 + 10;
      else if (l2 >= 65)
        a4 = l2 - 65 + 10;
      else {
        if (!(l2 >= 48 && l2 <= 57))
          break;
        a4 = l2 - 48;
      }
      if (a4 >= 16)
        break;
      i3 = l2, n3 = 16 * n3 + a4;
    } else
      i3 !== 95 && o4 !== 0 || U(), i3 = l2;
  }
  return i3 !== 95 && C - e2 === s2 || U(), n3;
}
function We(s2) {
  return s2 === 13 || s2 === 10;
}
function U() {
  throw Object.assign(Error(`Parse error ${Pe}:${I.slice(0, C).split(`
`).length}:${C - I.lastIndexOf(`
`, C - 1)}`), { idx: C });
}
function Q2(s2, e2, n3) {
  let i3 = e2 - n3;
  i3 = i3 < 0 ? -i3 << 1 | 1 : i3 << 1;
  do {
    let o4 = i3 & 31;
    i3 >>>= 5, i3 > 0 && (o4 |= 32), s2.write(qe[o4]);
  } while (i3 > 0);
  return e2;
}
function dn(s2) {
  const e2 = new hn;
  let n3 = 0, i3 = 0, o4 = 0, a4 = 0;
  for (let l2 = 0;l2 < s2.length; l2++) {
    const p3 = s2[l2];
    if (l2 > 0 && e2.write(un), p3.length === 0)
      continue;
    let g = 0;
    for (let b = 0;b < p3.length; b++) {
      const d2 = p3[b];
      b > 0 && e2.write(ln), g = Q2(e2, d2[0], g), d2.length !== 1 && (n3 = Q2(e2, d2[1], n3), i3 = Q2(e2, d2[2], i3), o4 = Q2(e2, d2[3], o4), d2.length !== 4 && (a4 = Q2(e2, d2[4], a4)));
    }
  }
  return e2.flush();
}
function gn() {
  return typeof globalThis < "u" && typeof globalThis.btoa == "function" ? (s2) => globalThis.btoa(unescape(encodeURIComponent(s2))) : typeof Buffer == "function" ? (s2) => Buffer.from(s2, "utf-8").toString("base64") : () => {
    throw new Error("Unsupported environment: `window.btoa` or `Buffer` should be supported.");
  };
}
function mn(s2) {
  const e2 = s2.split(`
`), n3 = e2.filter((a4) => /^\t+/.test(a4)), i3 = e2.filter((a4) => /^ {2,}/.test(a4));
  if (n3.length === 0 && i3.length === 0)
    return null;
  if (n3.length >= i3.length)
    return "\t";
  const o4 = i3.reduce((a4, l2) => {
    const p3 = /^ +/.exec(l2)[0].length;
    return Math.min(p3, a4);
  }, Infinity);
  return new Array(o4 + 1).join(" ");
}
function wn(s2, e2) {
  const n3 = s2.split(/[/\\]/), i3 = e2.split(/[/\\]/);
  for (n3.pop();n3[0] === i3[0]; )
    n3.shift(), i3.shift();
  if (n3.length) {
    let o4 = n3.length;
    for (;o4--; )
      n3[o4] = "..";
  }
  return n3.concat(i3).join("/");
}
function Cn(s2) {
  return kn.call(s2) === "[object Object]";
}
function Ge(s2) {
  const e2 = s2.split(`
`), n3 = [];
  for (let i3 = 0, o4 = 0;i3 < e2.length; i3++)
    n3.push(o4), o4 += e2[i3].length + 1;
  return u2(function(o4) {
    let a4 = 0, l2 = n3.length;
    for (;a4 < l2; ) {
      const b = a4 + l2 >> 1;
      o4 < n3[b] ? l2 = b : a4 = b + 1;
    }
    const p3 = a4 - 1, g = o4 - n3[p3];
    return { line: p3, column: g };
  }, "locate");
}
function Ln(s2) {
  const e2 = new Int32Array(5), n3 = [];
  let i3 = 0;
  do {
    const o4 = On(s2, i3), a4 = [];
    let l2 = true, p3 = 0;
    e2[0] = 0;
    for (let g = i3;g < o4; g++) {
      let b;
      g = ee(s2, g, e2, 0);
      const d2 = e2[0];
      d2 < p3 && (l2 = false), p3 = d2, et(s2, g, o4) ? (g = ee(s2, g, e2, 1), g = ee(s2, g, e2, 2), g = ee(s2, g, e2, 3), et(s2, g, o4) ? (g = ee(s2, g, e2, 4), b = [d2, e2[1], e2[2], e2[3], e2[4]]) : b = [d2, e2[1], e2[2], e2[3]]) : b = [d2], a4.push(b);
    }
    l2 || An(a4), n3.push(a4), i3 = o4 + 1;
  } while (i3 <= s2.length);
  return n3;
}
function On(s2, e2) {
  const n3 = s2.indexOf(";", e2);
  return n3 === -1 ? s2.length : n3;
}
function ee(s2, e2, n3, i3) {
  let o4 = 0, a4 = 0, l2 = 0;
  do {
    const g = s2.charCodeAt(e2++);
    l2 = Ve[g], o4 |= (l2 & 31) << a4, a4 += 5;
  } while (l2 & 32);
  const p3 = o4 & 1;
  return o4 >>>= 1, p3 && (o4 = -2147483648 | -o4), n3[i3] += o4, e2;
}
function et(s2, e2, n3) {
  return e2 >= n3 ? false : s2.charCodeAt(e2) !== Ye;
}
function An(s2) {
  s2.sort(Nn);
}
function Nn(s2, e2) {
  return s2[0] - e2[0];
}
function Rn(s2) {
  const e2 = new Int32Array(5), n3 = 16384, i3 = n3 - 36, o4 = new Uint8Array(n3), a4 = o4.subarray(0, i3);
  let l2 = 0, p3 = "";
  for (let g = 0;g < s2.length; g++) {
    const b = s2[g];
    if (g > 0 && (l2 === n3 && (p3 += Oe.decode(o4), l2 = 0), o4[l2++] = In), b.length !== 0) {
      e2[0] = 0;
      for (let d2 = 0;d2 < b.length; d2++) {
        const r3 = b[d2];
        l2 > i3 && (p3 += Oe.decode(a4), o4.copyWithin(0, i3, l2), l2 -= i3), d2 > 0 && (o4[l2++] = Ye), l2 = te(o4, l2, e2, r3, 0), r3.length !== 1 && (l2 = te(o4, l2, e2, r3, 1), l2 = te(o4, l2, e2, r3, 2), l2 = te(o4, l2, e2, r3, 3), r3.length !== 4 && (l2 = te(o4, l2, e2, r3, 4)));
      }
    }
  }
  return p3 + Oe.decode(o4.subarray(0, l2));
}
function te(s2, e2, n3, i3, o4) {
  const a4 = i3[o4];
  let l2 = a4 - n3[o4];
  n3[o4] = a4, l2 = l2 < 0 ? -l2 << 1 | 1 : l2 << 1;
  do {
    let p3 = l2 & 31;
    l2 >>>= 5, l2 > 0 && (p3 |= 32), s2[e2++] = Ze[p3];
  } while (l2 > 0);
  return e2;
}
function jn(s2) {
  return Mn.test(s2);
}
function Un(s2) {
  return s2.startsWith("//");
}
function tt(s2) {
  return s2.startsWith("/");
}
function Tn(s2) {
  return s2.startsWith("file:");
}
function nt(s2) {
  return /^[.?#]/.test(s2);
}
function le(s2) {
  const e2 = $n.exec(s2);
  return rt(e2[1], e2[2] || "", e2[3], e2[4] || "", e2[5] || "/", e2[6] || "", e2[7] || "");
}
function Fn(s2) {
  const e2 = Dn.exec(s2), n3 = e2[2];
  return rt("file:", "", e2[1] || "", "", tt(n3) ? n3 : "/" + n3, e2[3] || "", e2[4] || "");
}
function rt(s2, e2, n3, i3, o4, a4, l2) {
  return { scheme: s2, user: e2, host: n3, port: i3, path: o4, query: a4, hash: l2, type: 7 };
}
function it(s2) {
  if (Un(s2)) {
    const n3 = le("http:" + s2);
    return n3.scheme = "", n3.type = 6, n3;
  }
  if (tt(s2)) {
    const n3 = le("http://foo.com" + s2);
    return n3.scheme = "", n3.host = "", n3.type = 5, n3;
  }
  if (Tn(s2))
    return Fn(s2);
  if (jn(s2))
    return le(s2);
  const e2 = le("http://foo.com/" + s2);
  return e2.scheme = "", e2.host = "", e2.type = s2 ? s2.startsWith("?") ? 3 : s2.startsWith("#") ? 2 : 4 : 1, e2;
}
function Bn(s2) {
  if (s2.endsWith("/.."))
    return s2;
  const e2 = s2.lastIndexOf("/");
  return s2.slice(0, e2 + 1);
}
function Pn(s2, e2) {
  st(e2, e2.type), s2.path === "/" ? s2.path = e2.path : s2.path = Bn(e2.path) + s2.path;
}
function st(s2, e2) {
  const n3 = e2 <= 4, i3 = s2.path.split("/");
  let o4 = 1, a4 = 0, l2 = false;
  for (let g = 1;g < i3.length; g++) {
    const b = i3[g];
    if (!b) {
      l2 = true;
      continue;
    }
    if (l2 = false, b !== ".") {
      if (b === "..") {
        a4 ? (l2 = true, a4--, o4--) : n3 && (i3[o4++] = b);
        continue;
      }
      i3[o4++] = b, a4++;
    }
  }
  let p3 = "";
  for (let g = 1;g < o4; g++)
    p3 += "/" + i3[g];
  (!p3 || l2 && !p3.endsWith("/..")) && (p3 += "/"), s2.path = p3;
}
function Wn(s2, e2) {
  if (!s2 && !e2)
    return "";
  const n3 = it(s2);
  let i3 = n3.type;
  if (e2 && i3 !== 7) {
    const a4 = it(e2), l2 = a4.type;
    switch (i3) {
      case 1:
        n3.hash = a4.hash;
      case 2:
        n3.query = a4.query;
      case 3:
      case 4:
        Pn(n3, a4);
      case 5:
        n3.user = a4.user, n3.host = a4.host, n3.port = a4.port;
      case 6:
        n3.scheme = a4.scheme;
    }
    l2 > i3 && (i3 = l2);
  }
  st(n3, i3);
  const o4 = n3.query + n3.hash;
  switch (i3) {
    case 2:
    case 3:
      return o4;
    case 4: {
      const a4 = n3.path.slice(1);
      return a4 ? nt(e2 || s2) && !nt(a4) ? "./" + a4 + o4 : a4 + o4 : o4 || ".";
    }
    case 5:
      return n3.path + o4;
    default:
      return n3.scheme + "//" + n3.user + n3.host + n3.port + n3.path + o4;
  }
}
function ot(s2, e2) {
  return e2 && !e2.endsWith("/") && (e2 += "/"), Wn(s2, e2);
}
function Jn(s2) {
  if (!s2)
    return "";
  const e2 = s2.lastIndexOf("/");
  return s2.slice(0, e2 + 1);
}
function qn(s2, e2) {
  const n3 = at(s2, 0);
  if (n3 === s2.length)
    return s2;
  e2 || (s2 = s2.slice());
  for (let i3 = n3;i3 < s2.length; i3 = at(s2, i3 + 1))
    s2[i3] = Hn(s2[i3], e2);
  return s2;
}
function at(s2, e2) {
  for (let n3 = e2;n3 < s2.length; n3++)
    if (!zn(s2[n3]))
      return n3;
  return s2.length;
}
function zn(s2) {
  for (let e2 = 1;e2 < s2.length; e2++)
    if (s2[e2][F2] < s2[e2 - 1][F2])
      return false;
  return true;
}
function Hn(s2, e2) {
  return e2 || (s2 = s2.slice()), s2.sort(Gn);
}
function Gn(s2, e2) {
  return s2[F2] - e2[F2];
}
function Kn(s2, e2, n3, i3) {
  for (;n3 <= i3; ) {
    const o4 = n3 + (i3 - n3 >> 1), a4 = s2[o4][F2] - e2;
    if (a4 === 0)
      return ue = true, o4;
    a4 < 0 ? n3 = o4 + 1 : i3 = o4 - 1;
  }
  return ue = false, n3 - 1;
}
function Xn(s2, e2, n3) {
  for (let i3 = n3 - 1;i3 >= 0 && s2[i3][F2] === e2; n3 = i3--)
    ;
  return n3;
}
function Yn() {
  return { lastKey: -1, lastNeedle: -1, lastIndex: -1 };
}
function Qn(s2, e2, n3, i3) {
  const { lastKey: o4, lastNeedle: a4, lastIndex: l2 } = n3;
  let p3 = 0, g = s2.length - 1;
  if (i3 === o4) {
    if (e2 === a4)
      return ue = l2 !== -1 && s2[l2][F2] === e2, l2;
    e2 >= a4 ? p3 = l2 === -1 ? 0 : l2 : g = l2;
  }
  return n3.lastKey = i3, n3.lastNeedle = e2, n3.lastIndex = Kn(s2, e2, p3, g);
}
function Hr(s2) {
  return s2;
}
function lt(s2) {
  var e2;
  return (e2 = s2)._decoded || (e2._decoded = Ln(s2._encoded));
}
function Zn(s2, e2, n3) {
  const i3 = lt(s2);
  if (e2 >= i3.length)
    return null;
  const o4 = i3[e2], a4 = Vn(o4, s2._decodedMemo, e2, n3);
  return a4 === -1 ? null : o4[a4];
}
function Vn(s2, e2, n3, i3, o4) {
  let a4 = Qn(s2, i3, e2, n3);
  return ue && (a4 = Xn(s2, i3, a4)), a4 === -1 || a4 === s2.length ? -1 : a4;
}
function Gr(s2) {
  return s2;
}
function ut(s2, e2) {
  return s2._indexes[e2];
}
function ne(s2, e2) {
  const n3 = ut(s2, e2);
  if (n3 !== undefined)
    return n3;
  const { array: i3, _indexes: o4 } = s2, a4 = i3.push(e2);
  return o4[e2] = a4 - 1;
}
function er(s2, e2) {
  const n3 = ut(s2, e2);
  if (n3 === undefined)
    return;
  const { array: i3, _indexes: o4 } = s2;
  for (let a4 = n3 + 1;a4 < i3.length; a4++) {
    const l2 = i3[a4];
    i3[a4 - 1] = l2, o4[l2]--;
  }
  o4[e2] = undefined, i3.pop();
}
function Kr(s2) {
  return s2;
}
function cr(s2, e2, n3) {
  const { _sources: i3, _sourcesContent: o4 } = s2, a4 = ne(i3, e2);
  o4[a4] = n3;
}
function lr(s2, e2, n3 = true) {
  const { _sources: i3, _sourcesContent: o4, _ignoreList: a4 } = s2, l2 = ne(i3, e2);
  l2 === o4.length && (o4[l2] = null), n3 ? ne(a4, l2) : er(a4, l2);
}
function ht(s2) {
  const { _mappings: e2, _sources: n3, _sourcesContent: i3, _names: o4, _ignoreList: a4 } = s2;
  return gr(e2), { version: 3, file: s2.file || undefined, names: o4.array, sourceRoot: s2.sourceRoot || undefined, sources: n3.array, sourcesContent: i3, mappings: e2, ignoreList: a4.array };
}
function ur(s2) {
  const e2 = ht(s2);
  return Object.assign(Object.assign({}, e2), { mappings: Rn(e2.mappings) });
}
function fr(s2, e2, n3, i3, o4, a4, l2, p3, g) {
  const { _mappings: b, _sources: d2, _sourcesContent: r3, _names: S } = e2, O = hr(b, n3), _ = dr(O, i3);
  if (!o4)
    return br(O, _) ? undefined : dt(O, _, [i3]);
  const N = ne(d2, o4), $ = p3 ? ne(S, p3) : ft;
  if (N === r3.length && (r3[N] = null), !pr(O, _, N, a4, l2, $))
    return dt(O, _, p3 ? [i3, N, a4, l2, $] : [i3, N, a4, l2]);
}
function hr(s2, e2) {
  for (let n3 = s2.length;n3 <= e2; n3++)
    s2[n3] = [];
  return s2[e2];
}
function dr(s2, e2) {
  let n3 = s2.length;
  for (let i3 = n3 - 1;i3 >= 0; n3 = i3--) {
    const o4 = s2[i3];
    if (e2 >= o4[tr])
      break;
  }
  return n3;
}
function dt(s2, e2, n3) {
  for (let i3 = s2.length;i3 > e2; i3--)
    s2[i3] = s2[i3 - 1];
  s2[e2] = n3;
}
function gr(s2) {
  const { length: e2 } = s2;
  let n3 = e2;
  for (let i3 = n3 - 1;i3 >= 0 && !(s2[i3].length > 0); n3 = i3, i3--)
    ;
  n3 < e2 && (s2.length = n3);
}
function br(s2, e2) {
  return e2 === 0 ? true : s2[e2 - 1].length === 1;
}
function pr(s2, e2, n3, i3, o4, a4) {
  if (e2 === 0)
    return false;
  const l2 = s2[e2 - 1];
  return l2.length === 1 ? false : n3 === l2[nr] && i3 === l2[rr] && o4 === l2[ir] && a4 === (l2.length === 5 ? l2[sr] : ft);
}
function bt(s2, e2, n3, i3, o4, a4) {
  return { source: s2, line: e2, column: n3, name: i3, content: o4, ignore: a4 };
}
function pt(s2, e2, n3, i3, o4) {
  return { map: s2, sources: e2, source: n3, content: i3, ignore: o4 };
}
function mt(s2, e2) {
  return pt(s2, e2, "", null, false);
}
function wr(s2, e2, n3) {
  return pt(null, mr, s2, e2, n3);
}
function kr(s2) {
  const e2 = new or({ file: s2.map.file }), { sources: n3, map: i3 } = s2, o4 = i3.names, a4 = lt(i3);
  for (let l2 = 0;l2 < a4.length; l2++) {
    const p3 = a4[l2];
    for (let g = 0;g < p3.length; g++) {
      const b = p3[g], d2 = b[0];
      let r3 = gt;
      if (b.length !== 1) {
        const H = n3[b[1]];
        if (r3 = wt(H, b[2], b[3], b.length === 5 ? o4[b[4]] : ""), r3 == null)
          continue;
      }
      const { column: S, line: O, name: _, content: N, source: $, ignore: B } = r3;
      ar(e2, l2, d2, $, O, S, _), $ && N != null && cr(e2, $, N), B && lr(e2, $, true);
    }
  }
  return e2;
}
function wt(s2, e2, n3, i3) {
  if (!s2.map)
    return bt(s2.source, e2, n3, i3, s2.content, s2.ignore);
  const o4 = Zn(s2.map, e2, n3);
  return o4 == null ? null : o4.length === 1 ? gt : wt(s2.sources[o4[1]], o4[2], o4[3], o4.length === 5 ? s2.map.names[o4[4]] : i3);
}
function Cr(s2) {
  return Array.isArray(s2) ? s2 : [s2];
}
function yr(s2, e2) {
  const n3 = Cr(s2).map((a4) => new ct(a4, "")), i3 = n3.pop();
  for (let a4 = 0;a4 < n3.length; a4++)
    if (n3[a4].sources.length > 1)
      throw new Error(`Transformation map ${a4} must have exactly one source file.
Did you specify these with the most recent transformation maps first?`);
  let o4 = kt(i3, e2, "", 0);
  for (let a4 = n3.length - 1;a4 >= 0; a4--)
    o4 = mt(n3[a4], [o4]);
  return o4;
}
function kt(s2, e2, n3, i3) {
  const { resolvedSources: o4, sourcesContent: a4, ignoreList: l2 } = s2, p3 = i3 + 1, g = o4.map((b, d2) => {
    const r3 = { importer: n3, depth: p3, source: b || "", content: undefined, ignore: undefined }, S = e2(r3.source, r3), { source: O, content: _, ignore: N } = r3;
    if (S)
      return kt(new ct(S, O), e2, O, p3);
    const $ = _ !== undefined ? _ : a4 ? a4[d2] : null, B = N !== undefined ? N : l2 ? l2.includes(d2) : false;
    return wr(O, $, B);
  });
  return mt(s2, g);
}
function Ct(s2, e2, n3) {
  const i3 = { excludeContent: !!n3, decodedMappings: false }, o4 = yr(s2, e2);
  return new Sr(kr(o4), i3);
}
var import_node_path3, import_node_url, import_esbuild, import_node_crypto, import_node_fs, import_node_os2, Xt, u2 = (s2, e2) => Xt(s2, "name", { value: e2, configurable: true }), xe, E, oe, ve, Y2, Be, sn = "xportmportlassforetaourceromsyncunctionssertvoyiedelecontininstantybreareturdebuggeawaithrwhileifcatcfinallels", I, Pe, C, Ie, ae, cn, ln = 44, un = 59, Je = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", qe, fn, ze = 16384, He, hn, fe, re, bn, pn, kn, yn, Sn, Z = `
`, q, $e, Le = "2", xn, vn, ce, Ke, V, Xe, En, _n, z, Ye = 44, In = 59, Qe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", Ze, Ve, Oe, Mn, $n, Dn, F2 = 0, ue = false, ct, Ae, tr = 0, nr = 1, rr = 2, ir = 3, sr = 4, ft = -1, or, ar, gt, mr, Sr, yt, xr, vr, St, Er, _r, Ir, Lr, Or, Ar, Ne, Re, Me, Nr, Rr, Mr, $r, Dr;
var init_index_DQtFPMc2 = __esm(() => {
  init_node_features_JeyyvQz6();
  init_temporary_directory_BDDVQOvU();
  import_node_path3 = __toESM(require("node:path"));
  import_node_url = require("node:url");
  import_esbuild = __toESM(require_main(), 1);
  import_node_crypto = __toESM(require("node:crypto"));
  import_node_fs = __toESM(require("node:fs"));
  import_node_os2 = __toESM(require("node:os"));
  Xt = Object.defineProperty;
  xe = u2((s2) => import_node_crypto.default.createHash("sha1").update(s2).digest("hex"), "sha1");
  Y2 = 2 << 19;
  Be = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? function(s2, e2) {
    const n3 = s2.length;
    let i3 = 0;
    for (;i3 < n3; )
      e2[i3] = s2.charCodeAt(i3++);
  } : function(s2, e2) {
    const n3 = s2.length;
    let i3 = 0;
    for (;i3 < n3; ) {
      const o4 = s2.charCodeAt(i3);
      e2[i3++] = (255 & o4) << 8 | o4 >>> 8;
    }
  };
  u2(on, "parse");
  u2(Ee, "b");
  u2(an, "k");
  u2(_e, "l");
  u2(We, "u");
  u2(U, "o");
  typeof WebAssembly < "u" && (async () => {
    const { parse: s2, init: e2 } = await Promise.resolve().then(() => (init_lexer_DQCqS3nf(), exports_lexer_DQCqS3nf));
    await e2, Ie = s2;
  })();
  ae = u2((s2, e2) => Ie ? Ie(s2, e2) : on(s2, e2), "parseEsm");
  cn = u2((s2) => {
    if (!s2.includes("import") && !s2.includes("export"))
      return false;
    try {
      return ae(s2)[3];
    } catch {
      return true;
    }
  }, "isESM");
  qe = new Uint8Array(64);
  fn = new Uint8Array(128);
  for (let s2 = 0;s2 < Je.length; s2++) {
    const e2 = Je.charCodeAt(s2);
    qe[s2] = e2, fn[e2] = s2;
  }
  u2(Q2, "encodeInteger$1");
  He = typeof TextDecoder < "u" ? new TextDecoder : typeof Buffer < "u" ? { decode(s2) {
    return Buffer.from(s2.buffer, s2.byteOffset, s2.byteLength).toString();
  } } : { decode(s2) {
    let e2 = "";
    for (let n3 = 0;n3 < s2.length; n3++)
      e2 += String.fromCharCode(s2[n3]);
    return e2;
  } };
  hn = class {
    static {
      u2(this, "StringWriter");
    }
    constructor() {
      this.pos = 0, this.out = "", this.buffer = new Uint8Array(ze);
    }
    write(s2) {
      const { buffer: e2 } = this;
      e2[this.pos++] = s2, this.pos === ze && (this.out += He.decode(e2), this.pos = 0);
    }
    flush() {
      const { buffer: s2, out: e2, pos: n3 } = this;
      return n3 > 0 ? e2 + He.decode(s2.subarray(0, n3)) : e2;
    }
  };
  u2(dn, "encode$1");
  fe = class fe {
    static {
      u2(this, "BitSet");
    }
    constructor(e2) {
      this.bits = e2 instanceof fe ? e2.bits.slice() : [];
    }
    add(e2) {
      this.bits[e2 >> 5] |= 1 << (e2 & 31);
    }
    has(e2) {
      return !!(this.bits[e2 >> 5] & 1 << (e2 & 31));
    }
  };
  re = class re {
    static {
      u2(this, "Chunk");
    }
    constructor(e2, n3, i3) {
      this.start = e2, this.end = n3, this.original = i3, this.intro = "", this.outro = "", this.content = i3, this.storeName = false, this.edited = false, this.previous = null, this.next = null;
    }
    appendLeft(e2) {
      this.outro += e2;
    }
    appendRight(e2) {
      this.intro = this.intro + e2;
    }
    clone() {
      const e2 = new re(this.start, this.end, this.original);
      return e2.intro = this.intro, e2.outro = this.outro, e2.content = this.content, e2.storeName = this.storeName, e2.edited = this.edited, e2;
    }
    contains(e2) {
      return this.start < e2 && e2 < this.end;
    }
    eachNext(e2) {
      let n3 = this;
      for (;n3; )
        e2(n3), n3 = n3.next;
    }
    eachPrevious(e2) {
      let n3 = this;
      for (;n3; )
        e2(n3), n3 = n3.previous;
    }
    edit(e2, n3, i3) {
      return this.content = e2, i3 || (this.intro = "", this.outro = ""), this.storeName = n3, this.edited = true, this;
    }
    prependLeft(e2) {
      this.outro = e2 + this.outro;
    }
    prependRight(e2) {
      this.intro = e2 + this.intro;
    }
    reset() {
      this.intro = "", this.outro = "", this.edited && (this.content = this.original, this.storeName = false, this.edited = false);
    }
    split(e2) {
      const n3 = e2 - this.start, i3 = this.original.slice(0, n3), o4 = this.original.slice(n3);
      this.original = i3;
      const a4 = new re(e2, this.end, o4);
      return a4.outro = this.outro, this.outro = "", this.end = e2, this.edited ? (a4.edit("", false), this.content = "") : this.content = i3, a4.next = this.next, a4.next && (a4.next.previous = a4), a4.previous = this, this.next = a4, a4;
    }
    toString() {
      return this.intro + this.content + this.outro;
    }
    trimEnd(e2) {
      if (this.outro = this.outro.replace(e2, ""), this.outro.length)
        return true;
      const n3 = this.content.replace(e2, "");
      if (n3.length)
        return n3 !== this.content && (this.split(this.start + n3.length).edit("", undefined, true), this.edited && this.edit(n3, this.storeName, true)), true;
      if (this.edit("", undefined, true), this.intro = this.intro.replace(e2, ""), this.intro.length)
        return true;
    }
    trimStart(e2) {
      if (this.intro = this.intro.replace(e2, ""), this.intro.length)
        return true;
      const n3 = this.content.replace(e2, "");
      if (n3.length) {
        if (n3 !== this.content) {
          const i3 = this.split(this.end - n3.length);
          this.edited && i3.edit(n3, this.storeName, true), this.edit("", undefined, true);
        }
        return true;
      } else if (this.edit("", undefined, true), this.outro = this.outro.replace(e2, ""), this.outro.length)
        return true;
    }
  };
  u2(gn, "getBtoa");
  bn = gn();
  pn = class {
    static {
      u2(this, "SourceMap");
    }
    constructor(e2) {
      this.version = 3, this.file = e2.file, this.sources = e2.sources, this.sourcesContent = e2.sourcesContent, this.names = e2.names, this.mappings = dn(e2.mappings), typeof e2.x_google_ignoreList < "u" && (this.x_google_ignoreList = e2.x_google_ignoreList), typeof e2.debugId < "u" && (this.debugId = e2.debugId);
    }
    toString() {
      return JSON.stringify(this);
    }
    toUrl() {
      return "data:application/json;charset=utf-8;base64," + bn(this.toString());
    }
  };
  u2(mn, "guessIndent");
  u2(wn, "getRelativePath");
  kn = Object.prototype.toString;
  u2(Cn, "isObject");
  u2(Ge, "getLocator");
  yn = /\w/;
  Sn = class Sn {
    static {
      u2(this, "Mappings");
    }
    constructor(e2) {
      this.hires = e2, this.generatedCodeLine = 0, this.generatedCodeColumn = 0, this.raw = [], this.rawSegments = this.raw[this.generatedCodeLine] = [], this.pending = null;
    }
    addEdit(e2, n3, i3, o4) {
      if (n3.length) {
        const a4 = n3.length - 1;
        let l2 = n3.indexOf(`
`, 0), p3 = -1;
        for (;l2 >= 0 && a4 > l2; ) {
          const b = [this.generatedCodeColumn, e2, i3.line, i3.column];
          o4 >= 0 && b.push(o4), this.rawSegments.push(b), this.generatedCodeLine += 1, this.raw[this.generatedCodeLine] = this.rawSegments = [], this.generatedCodeColumn = 0, p3 = l2, l2 = n3.indexOf(`
`, l2 + 1);
        }
        const g = [this.generatedCodeColumn, e2, i3.line, i3.column];
        o4 >= 0 && g.push(o4), this.rawSegments.push(g), this.advance(n3.slice(p3 + 1));
      } else
        this.pending && (this.rawSegments.push(this.pending), this.advance(n3));
      this.pending = null;
    }
    addUneditedChunk(e2, n3, i3, o4, a4) {
      let l2 = n3.start, p3 = true, g = false;
      for (;l2 < n3.end; ) {
        if (i3[l2] === `
`)
          o4.line += 1, o4.column = 0, this.generatedCodeLine += 1, this.raw[this.generatedCodeLine] = this.rawSegments = [], this.generatedCodeColumn = 0, p3 = true, g = false;
        else {
          if (this.hires || p3 || a4.has(l2)) {
            const b = [this.generatedCodeColumn, e2, o4.line, o4.column];
            this.hires === "boundary" ? yn.test(i3[l2]) ? g || (this.rawSegments.push(b), g = true) : (this.rawSegments.push(b), g = false) : this.rawSegments.push(b);
          }
          o4.column += 1, this.generatedCodeColumn += 1, p3 = false;
        }
        l2 += 1;
      }
      this.pending = null;
    }
    advance(e2) {
      if (!e2)
        return;
      const n3 = e2.split(`
`);
      if (n3.length > 1) {
        for (let i3 = 0;i3 < n3.length - 1; i3++)
          this.generatedCodeLine++, this.raw[this.generatedCodeLine] = this.rawSegments = [];
        this.generatedCodeColumn = 0;
      }
      this.generatedCodeColumn += n3[n3.length - 1].length;
    }
  };
  q = { insertLeft: false, insertRight: false, storeName: false };
  $e = class $e {
    static {
      u2(this, "MagicString");
    }
    constructor(e2, n3 = {}) {
      const i3 = new re(0, e2.length, e2);
      Object.defineProperties(this, { original: { writable: true, value: e2 }, outro: { writable: true, value: "" }, intro: { writable: true, value: "" }, firstChunk: { writable: true, value: i3 }, lastChunk: { writable: true, value: i3 }, lastSearchedChunk: { writable: true, value: i3 }, byStart: { writable: true, value: {} }, byEnd: { writable: true, value: {} }, filename: { writable: true, value: n3.filename }, indentExclusionRanges: { writable: true, value: n3.indentExclusionRanges }, sourcemapLocations: { writable: true, value: new fe }, storedNames: { writable: true, value: {} }, indentStr: { writable: true, value: undefined }, ignoreList: { writable: true, value: n3.ignoreList }, offset: { writable: true, value: n3.offset || 0 } }), this.byStart[0] = i3, this.byEnd[e2.length] = i3;
    }
    addSourcemapLocation(e2) {
      this.sourcemapLocations.add(e2);
    }
    append(e2) {
      if (typeof e2 != "string")
        throw new TypeError("outro content must be a string");
      return this.outro += e2, this;
    }
    appendLeft(e2, n3) {
      if (e2 = e2 + this.offset, typeof n3 != "string")
        throw new TypeError("inserted content must be a string");
      this._split(e2);
      const i3 = this.byEnd[e2];
      return i3 ? i3.appendLeft(n3) : this.intro += n3, this;
    }
    appendRight(e2, n3) {
      if (e2 = e2 + this.offset, typeof n3 != "string")
        throw new TypeError("inserted content must be a string");
      this._split(e2);
      const i3 = this.byStart[e2];
      return i3 ? i3.appendRight(n3) : this.outro += n3, this;
    }
    clone() {
      const e2 = new $e(this.original, { filename: this.filename, offset: this.offset });
      let n3 = this.firstChunk, i3 = e2.firstChunk = e2.lastSearchedChunk = n3.clone();
      for (;n3; ) {
        e2.byStart[i3.start] = i3, e2.byEnd[i3.end] = i3;
        const o4 = n3.next, a4 = o4 && o4.clone();
        a4 && (i3.next = a4, a4.previous = i3, i3 = a4), n3 = o4;
      }
      return e2.lastChunk = i3, this.indentExclusionRanges && (e2.indentExclusionRanges = this.indentExclusionRanges.slice()), e2.sourcemapLocations = new fe(this.sourcemapLocations), e2.intro = this.intro, e2.outro = this.outro, e2;
    }
    generateDecodedMap(e2) {
      e2 = e2 || {};
      const n3 = 0, i3 = Object.keys(this.storedNames), o4 = new Sn(e2.hires), a4 = Ge(this.original);
      return this.intro && o4.advance(this.intro), this.firstChunk.eachNext((l2) => {
        const p3 = a4(l2.start);
        l2.intro.length && o4.advance(l2.intro), l2.edited ? o4.addEdit(n3, l2.content, p3, l2.storeName ? i3.indexOf(l2.original) : -1) : o4.addUneditedChunk(n3, l2, this.original, p3, this.sourcemapLocations), l2.outro.length && o4.advance(l2.outro);
      }), { file: e2.file ? e2.file.split(/[/\\]/).pop() : undefined, sources: [e2.source ? wn(e2.file || "", e2.source) : e2.file || ""], sourcesContent: e2.includeContent ? [this.original] : undefined, names: i3, mappings: o4.raw, x_google_ignoreList: this.ignoreList ? [n3] : undefined };
    }
    generateMap(e2) {
      return new pn(this.generateDecodedMap(e2));
    }
    _ensureindentStr() {
      this.indentStr === undefined && (this.indentStr = mn(this.original));
    }
    _getRawIndentString() {
      return this._ensureindentStr(), this.indentStr;
    }
    getIndentString() {
      return this._ensureindentStr(), this.indentStr === null ? "\t" : this.indentStr;
    }
    indent(e2, n3) {
      const i3 = /^[^\r\n]/gm;
      if (Cn(e2) && (n3 = e2, e2 = undefined), e2 === undefined && (this._ensureindentStr(), e2 = this.indentStr || "\t"), e2 === "")
        return this;
      n3 = n3 || {};
      const o4 = {};
      n3.exclude && (typeof n3.exclude[0] == "number" ? [n3.exclude] : n3.exclude).forEach((d2) => {
        for (let r3 = d2[0];r3 < d2[1]; r3 += 1)
          o4[r3] = true;
      });
      let a4 = n3.indentStart !== false;
      const l2 = u2((b) => a4 ? `${e2}${b}` : (a4 = true, b), "replacer");
      this.intro = this.intro.replace(i3, l2);
      let p3 = 0, g = this.firstChunk;
      for (;g; ) {
        const b = g.end;
        if (g.edited)
          o4[p3] || (g.content = g.content.replace(i3, l2), g.content.length && (a4 = g.content[g.content.length - 1] === `
`));
        else
          for (p3 = g.start;p3 < b; ) {
            if (!o4[p3]) {
              const d2 = this.original[p3];
              d2 === `
` ? a4 = true : d2 !== "\r" && a4 && (a4 = false, p3 === g.start || (this._splitChunk(g, p3), g = g.next), g.prependRight(e2));
            }
            p3 += 1;
          }
        p3 = g.end, g = g.next;
      }
      return this.outro = this.outro.replace(i3, l2), this;
    }
    insert() {
      throw new Error("magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...)");
    }
    insertLeft(e2, n3) {
      return q.insertLeft || (console.warn("magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead"), q.insertLeft = true), this.appendLeft(e2, n3);
    }
    insertRight(e2, n3) {
      return q.insertRight || (console.warn("magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead"), q.insertRight = true), this.prependRight(e2, n3);
    }
    move(e2, n3, i3) {
      if (e2 = e2 + this.offset, n3 = n3 + this.offset, i3 = i3 + this.offset, i3 >= e2 && i3 <= n3)
        throw new Error("Cannot move a selection inside itself");
      this._split(e2), this._split(n3), this._split(i3);
      const o4 = this.byStart[e2], a4 = this.byEnd[n3], l2 = o4.previous, p3 = a4.next, g = this.byStart[i3];
      if (!g && a4 === this.lastChunk)
        return this;
      const b = g ? g.previous : this.lastChunk;
      return l2 && (l2.next = p3), p3 && (p3.previous = l2), b && (b.next = o4), g && (g.previous = a4), o4.previous || (this.firstChunk = a4.next), a4.next || (this.lastChunk = o4.previous, this.lastChunk.next = null), o4.previous = b, a4.next = g || null, b || (this.firstChunk = o4), g || (this.lastChunk = a4), this;
    }
    overwrite(e2, n3, i3, o4) {
      return o4 = o4 || {}, this.update(e2, n3, i3, { ...o4, overwrite: !o4.contentOnly });
    }
    update(e2, n3, i3, o4) {
      if (e2 = e2 + this.offset, n3 = n3 + this.offset, typeof i3 != "string")
        throw new TypeError("replacement content must be a string");
      if (this.original.length !== 0) {
        for (;e2 < 0; )
          e2 += this.original.length;
        for (;n3 < 0; )
          n3 += this.original.length;
      }
      if (n3 > this.original.length)
        throw new Error("end is out of bounds");
      if (e2 === n3)
        throw new Error("Cannot overwrite a zero-length range – use appendLeft or prependRight instead");
      this._split(e2), this._split(n3), o4 === true && (q.storeName || (console.warn("The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string"), q.storeName = true), o4 = { storeName: true });
      const a4 = o4 !== undefined ? o4.storeName : false, l2 = o4 !== undefined ? o4.overwrite : false;
      if (a4) {
        const b = this.original.slice(e2, n3);
        Object.defineProperty(this.storedNames, b, { writable: true, value: true, enumerable: true });
      }
      const p3 = this.byStart[e2], g = this.byEnd[n3];
      if (p3) {
        let b = p3;
        for (;b !== g; ) {
          if (b.next !== this.byStart[b.end])
            throw new Error("Cannot overwrite across a split point");
          b = b.next, b.edit("", false);
        }
        p3.edit(i3, a4, !l2);
      } else {
        const b = new re(e2, n3, "").edit(i3, a4);
        g.next = b, b.previous = g;
      }
      return this;
    }
    prepend(e2) {
      if (typeof e2 != "string")
        throw new TypeError("outro content must be a string");
      return this.intro = e2 + this.intro, this;
    }
    prependLeft(e2, n3) {
      if (e2 = e2 + this.offset, typeof n3 != "string")
        throw new TypeError("inserted content must be a string");
      this._split(e2);
      const i3 = this.byEnd[e2];
      return i3 ? i3.prependLeft(n3) : this.intro = n3 + this.intro, this;
    }
    prependRight(e2, n3) {
      if (e2 = e2 + this.offset, typeof n3 != "string")
        throw new TypeError("inserted content must be a string");
      this._split(e2);
      const i3 = this.byStart[e2];
      return i3 ? i3.prependRight(n3) : this.outro = n3 + this.outro, this;
    }
    remove(e2, n3) {
      if (e2 = e2 + this.offset, n3 = n3 + this.offset, this.original.length !== 0) {
        for (;e2 < 0; )
          e2 += this.original.length;
        for (;n3 < 0; )
          n3 += this.original.length;
      }
      if (e2 === n3)
        return this;
      if (e2 < 0 || n3 > this.original.length)
        throw new Error("Character is out of bounds");
      if (e2 > n3)
        throw new Error("end must be greater than start");
      this._split(e2), this._split(n3);
      let i3 = this.byStart[e2];
      for (;i3; )
        i3.intro = "", i3.outro = "", i3.edit(""), i3 = n3 > i3.end ? this.byStart[i3.end] : null;
      return this;
    }
    reset(e2, n3) {
      if (e2 = e2 + this.offset, n3 = n3 + this.offset, this.original.length !== 0) {
        for (;e2 < 0; )
          e2 += this.original.length;
        for (;n3 < 0; )
          n3 += this.original.length;
      }
      if (e2 === n3)
        return this;
      if (e2 < 0 || n3 > this.original.length)
        throw new Error("Character is out of bounds");
      if (e2 > n3)
        throw new Error("end must be greater than start");
      this._split(e2), this._split(n3);
      let i3 = this.byStart[e2];
      for (;i3; )
        i3.reset(), i3 = n3 > i3.end ? this.byStart[i3.end] : null;
      return this;
    }
    lastChar() {
      if (this.outro.length)
        return this.outro[this.outro.length - 1];
      let e2 = this.lastChunk;
      do {
        if (e2.outro.length)
          return e2.outro[e2.outro.length - 1];
        if (e2.content.length)
          return e2.content[e2.content.length - 1];
        if (e2.intro.length)
          return e2.intro[e2.intro.length - 1];
      } while (e2 = e2.previous);
      return this.intro.length ? this.intro[this.intro.length - 1] : "";
    }
    lastLine() {
      let e2 = this.outro.lastIndexOf(Z);
      if (e2 !== -1)
        return this.outro.substr(e2 + 1);
      let n3 = this.outro, i3 = this.lastChunk;
      do {
        if (i3.outro.length > 0) {
          if (e2 = i3.outro.lastIndexOf(Z), e2 !== -1)
            return i3.outro.substr(e2 + 1) + n3;
          n3 = i3.outro + n3;
        }
        if (i3.content.length > 0) {
          if (e2 = i3.content.lastIndexOf(Z), e2 !== -1)
            return i3.content.substr(e2 + 1) + n3;
          n3 = i3.content + n3;
        }
        if (i3.intro.length > 0) {
          if (e2 = i3.intro.lastIndexOf(Z), e2 !== -1)
            return i3.intro.substr(e2 + 1) + n3;
          n3 = i3.intro + n3;
        }
      } while (i3 = i3.previous);
      return e2 = this.intro.lastIndexOf(Z), e2 !== -1 ? this.intro.substr(e2 + 1) + n3 : this.intro + n3;
    }
    slice(e2 = 0, n3 = this.original.length - this.offset) {
      if (e2 = e2 + this.offset, n3 = n3 + this.offset, this.original.length !== 0) {
        for (;e2 < 0; )
          e2 += this.original.length;
        for (;n3 < 0; )
          n3 += this.original.length;
      }
      let i3 = "", o4 = this.firstChunk;
      for (;o4 && (o4.start > e2 || o4.end <= e2); ) {
        if (o4.start < n3 && o4.end >= n3)
          return i3;
        o4 = o4.next;
      }
      if (o4 && o4.edited && o4.start !== e2)
        throw new Error(`Cannot use replaced character ${e2} as slice start anchor.`);
      const a4 = o4;
      for (;o4; ) {
        o4.intro && (a4 !== o4 || o4.start === e2) && (i3 += o4.intro);
        const l2 = o4.start < n3 && o4.end >= n3;
        if (l2 && o4.edited && o4.end !== n3)
          throw new Error(`Cannot use replaced character ${n3} as slice end anchor.`);
        const p3 = a4 === o4 ? e2 - o4.start : 0, g = l2 ? o4.content.length + n3 - o4.end : o4.content.length;
        if (i3 += o4.content.slice(p3, g), o4.outro && (!l2 || o4.end === n3) && (i3 += o4.outro), l2)
          break;
        o4 = o4.next;
      }
      return i3;
    }
    snip(e2, n3) {
      const i3 = this.clone();
      return i3.remove(0, e2), i3.remove(n3, i3.original.length), i3;
    }
    _split(e2) {
      if (this.byStart[e2] || this.byEnd[e2])
        return;
      let n3 = this.lastSearchedChunk, i3 = n3;
      const o4 = e2 > n3.end;
      for (;n3; ) {
        if (n3.contains(e2))
          return this._splitChunk(n3, e2);
        if (n3 = o4 ? this.byStart[n3.end] : this.byEnd[n3.start], n3 === i3)
          return;
        i3 = n3;
      }
    }
    _splitChunk(e2, n3) {
      if (e2.edited && e2.content.length) {
        const o4 = Ge(this.original)(n3);
        throw new Error(`Cannot split a chunk that has already been edited (${o4.line}:${o4.column} – "${e2.original}")`);
      }
      const i3 = e2.split(n3);
      return this.byEnd[n3] = e2, this.byStart[n3] = i3, this.byEnd[i3.end] = i3, e2 === this.lastChunk && (this.lastChunk = i3), this.lastSearchedChunk = e2, true;
    }
    toString() {
      let e2 = this.intro, n3 = this.firstChunk;
      for (;n3; )
        e2 += n3.toString(), n3 = n3.next;
      return e2 + this.outro;
    }
    isEmpty() {
      let e2 = this.firstChunk;
      do
        if (e2.intro.length && e2.intro.trim() || e2.content.length && e2.content.trim() || e2.outro.length && e2.outro.trim())
          return false;
      while (e2 = e2.next);
      return true;
    }
    length() {
      let e2 = this.firstChunk, n3 = 0;
      do
        n3 += e2.intro.length + e2.content.length + e2.outro.length;
      while (e2 = e2.next);
      return n3;
    }
    trimLines() {
      return this.trim("[\\r\\n]");
    }
    trim(e2) {
      return this.trimStart(e2).trimEnd(e2);
    }
    trimEndAborted(e2) {
      const n3 = new RegExp((e2 || "\\s") + "+$");
      if (this.outro = this.outro.replace(n3, ""), this.outro.length)
        return true;
      let i3 = this.lastChunk;
      do {
        const o4 = i3.end, a4 = i3.trimEnd(n3);
        if (i3.end !== o4 && (this.lastChunk === i3 && (this.lastChunk = i3.next), this.byEnd[i3.end] = i3, this.byStart[i3.next.start] = i3.next, this.byEnd[i3.next.end] = i3.next), a4)
          return true;
        i3 = i3.previous;
      } while (i3);
      return false;
    }
    trimEnd(e2) {
      return this.trimEndAborted(e2), this;
    }
    trimStartAborted(e2) {
      const n3 = new RegExp("^" + (e2 || "\\s") + "+");
      if (this.intro = this.intro.replace(n3, ""), this.intro.length)
        return true;
      let i3 = this.firstChunk;
      do {
        const o4 = i3.end, a4 = i3.trimStart(n3);
        if (i3.end !== o4 && (i3 === this.lastChunk && (this.lastChunk = i3.next), this.byEnd[i3.end] = i3, this.byStart[i3.next.start] = i3.next, this.byEnd[i3.next.end] = i3.next), a4)
          return true;
        i3 = i3.next;
      } while (i3);
      return false;
    }
    trimStart(e2) {
      return this.trimStartAborted(e2), this;
    }
    hasChanged() {
      return this.original !== this.toString();
    }
    _replaceRegexp(e2, n3) {
      function i3(a4, l2) {
        return typeof n3 == "string" ? n3.replace(/\$(\$|&|\d+)/g, (p3, g) => g === "$" ? "$" : g === "&" ? a4[0] : +g < a4.length ? a4[+g] : `$${g}`) : n3(...a4, a4.index, l2, a4.groups);
      }
      u2(i3, "getReplacement");
      function o4(a4, l2) {
        let p3;
        const g = [];
        for (;p3 = a4.exec(l2); )
          g.push(p3);
        return g;
      }
      if (u2(o4, "matchAll"), e2.global)
        o4(e2, this.original).forEach((l2) => {
          if (l2.index != null) {
            const p3 = i3(l2, this.original);
            p3 !== l2[0] && this.overwrite(l2.index, l2.index + l2[0].length, p3);
          }
        });
      else {
        const a4 = this.original.match(e2);
        if (a4 && a4.index != null) {
          const l2 = i3(a4, this.original);
          l2 !== a4[0] && this.overwrite(a4.index, a4.index + a4[0].length, l2);
        }
      }
      return this;
    }
    _replaceString(e2, n3) {
      const { original: i3 } = this, o4 = i3.indexOf(e2);
      return o4 !== -1 && this.overwrite(o4, o4 + e2.length, n3), this;
    }
    replace(e2, n3) {
      return typeof e2 == "string" ? this._replaceString(e2, n3) : this._replaceRegexp(e2, n3);
    }
    _replaceAllString(e2, n3) {
      const { original: i3 } = this, o4 = e2.length;
      for (let a4 = i3.indexOf(e2);a4 !== -1; a4 = i3.indexOf(e2, a4 + o4))
        i3.slice(a4, a4 + o4) !== n3 && this.overwrite(a4, a4 + o4, n3);
      return this;
    }
    replaceAll(e2, n3) {
      if (typeof e2 == "string")
        return this._replaceAllString(e2, n3);
      if (!e2.global)
        throw new TypeError("MagicString.prototype.replaceAll called with a non-global RegExp argument");
      return this._replaceRegexp(e2, n3);
    }
  };
  xn = ((s2) => {
    const e2 = "default";
    return s2[e2] && typeof s2[e2] == "object" && "__esModule" in s2[e2] ? s2[e2] : s2;
  }).toString();
  vn = `.then(${xn})`;
  ce = u2((s2, e2, n3) => {
    if (n3) {
      if (!e2.includes("import("))
        return;
    } else if (!e2.includes("import"))
      return;
    const o4 = ae(e2, s2)[0].filter((g) => g.d > -1);
    if (o4.length === 0)
      return;
    const a4 = new $e(e2);
    for (const g of o4)
      a4.appendRight(g.se, vn);
    const l2 = a4.toString(), p3 = a4.generateMap({ source: s2, includeContent: false, hires: "boundary" });
    return { code: l2, map: p3 };
  }, "transformDynamicImport");
  Ke = u2((s2) => {
    try {
      const e2 = import_node_fs.default.readFileSync(s2, "utf8");
      return JSON.parse(e2);
    } catch {}
  }, "readJsonFile");
  V = u2(() => {}, "noop");
  Xe = u2(() => Math.floor(Date.now() / 1e8), "getTime");
  En = /^(\d+)-([^-]+)$/;
  _n = class _n extends Map {
    static {
      u2(this, "FileCache");
    }
    cacheDirectory;
    oldCacheDirectory;
    diskCacheIndex;
    diskCacheEntries;
    constructor(e2 = e, n3 = import_node_path3.default.join(import_node_os2.default.tmpdir(), "tsx")) {
      super(), this.cacheDirectory = e2, this.oldCacheDirectory = n3;
    }
    getDiskCacheIndex() {
      if (this.diskCacheIndex)
        return this.diskCacheIndex;
      import_node_fs.default.mkdirSync(this.cacheDirectory, { recursive: true });
      const e2 = new Map, n3 = [];
      for (const i3 of import_node_fs.default.readdirSync(this.cacheDirectory)) {
        const o4 = En.exec(i3);
        if (!o4)
          continue;
        const a4 = Number(o4[1]);
        if (!Number.isSafeInteger(a4))
          continue;
        const l2 = o4[2], p3 = { time: a4, key: l2, fileName: i3 };
        n3.push(p3);
        const g = e2.get(l2);
        (!g || g.time < a4) && e2.set(l2, p3);
      }
      return this.diskCacheIndex = e2, this.diskCacheEntries = n3, setImmediate(() => {
        this.expireDiskCache().catch(V), this.removeOldCacheDirectory().catch(V);
      }), e2;
    }
    removeDiskCacheEntry(e2) {
      const n3 = this.diskCacheEntries.indexOf(e2);
      if (n3 !== -1 && this.diskCacheEntries.splice(n3, 1), this.diskCacheIndex.get(e2.key) === e2) {
        let i3;
        for (const o4 of this.diskCacheEntries)
          o4.key === e2.key && (!i3 || o4.time > i3.time) && (i3 = o4);
        i3 ? this.diskCacheIndex.set(e2.key, i3) : this.diskCacheIndex.delete(e2.key);
      }
    }
    get(e2) {
      const n3 = super.get(e2);
      if (n3)
        return n3;
      const i3 = this.getDiskCacheIndex();
      let o4 = i3.get(e2);
      for (;o4; ) {
        const a4 = import_node_path3.default.join(this.cacheDirectory, o4.fileName), l2 = Ke(a4);
        if (l2)
          return super.set(e2, l2), l2;
        this.removeDiskCacheEntry(o4), import_node_fs.default.promises.unlink(a4).catch(V), o4 = i3.get(e2);
      }
    }
    set(e2, n3) {
      if (super.set(e2, n3), n3) {
        const i3 = Xe(), o4 = `${i3}-${e2}`, a4 = this.getDiskCacheIndex(), l2 = { time: i3, key: e2, fileName: o4 };
        import_node_fs.default.promises.writeFile(import_node_path3.default.join(this.cacheDirectory, o4), JSON.stringify(n3)).then(() => {
          const p3 = a4.get(e2);
          p3?.fileName === o4 && this.removeDiskCacheEntry(p3), a4.set(e2, l2), this.diskCacheEntries.push(l2);
        }, V);
      }
      return this;
    }
    async expireDiskCache() {
      this.getDiskCacheIndex();
      const e2 = Xe(), n3 = [];
      for (const i3 of this.diskCacheEntries)
        e2 - i3.time > 7 && n3.push(import_node_fs.default.promises.unlink(import_node_path3.default.join(this.cacheDirectory, i3.fileName)).then(() => this.removeDiskCacheEntry(i3), V));
      await Promise.all(n3);
    }
    async removeOldCacheDirectory() {
      try {
        await import_node_fs.default.promises.access(this.oldCacheDirectory).then(() => true) && ("rm" in import_node_fs.default.promises ? await import_node_fs.default.promises.rm(this.oldCacheDirectory, { recursive: true, force: true }) : await import_node_fs.default.promises.rmdir(this.oldCacheDirectory, { recursive: true }));
      } catch {}
    }
  };
  z = process.env.TSX_DISABLE_CACHE ? new Map : new _n;
  Ze = new Uint8Array(64);
  Ve = new Uint8Array(128);
  for (let s2 = 0;s2 < Qe.length; s2++) {
    const e2 = Qe.charCodeAt(s2);
    Ze[s2] = e2, Ve[e2] = s2;
  }
  Oe = typeof TextDecoder < "u" ? new TextDecoder : typeof Buffer < "u" ? { decode(s2) {
    return Buffer.from(s2.buffer, s2.byteOffset, s2.byteLength).toString();
  } } : { decode(s2) {
    let e2 = "";
    for (let n3 = 0;n3 < s2.length; n3++)
      e2 += String.fromCharCode(s2[n3]);
    return e2;
  } };
  u2(Ln, "decode");
  u2(On, "indexOf");
  u2(ee, "decodeInteger");
  u2(et, "hasMoreVlq");
  u2(An, "sort");
  u2(Nn, "sortComparator$1");
  u2(Rn, "encode");
  u2(te, "encodeInteger");
  Mn = /^[\w+.-]+:\/\//;
  $n = /^([\w+.-]+:)\/\/([^@/#?]*@)?([^:/#?]*)(:\d+)?(\/[^#?]*)?(\?[^#]*)?(#.*)?/;
  Dn = /^file:(?:\/\/((?![a-z]:)[^/#?]*)?)?(\/?[^#?]*)(\?[^#]*)?(#.*)?/i;
  u2(jn, "isAbsoluteUrl");
  u2(Un, "isSchemeRelativeUrl");
  u2(tt, "isAbsolutePath");
  u2(Tn, "isFileUrl");
  u2(nt, "isRelative");
  u2(le, "parseAbsoluteUrl");
  u2(Fn, "parseFileUrl");
  u2(rt, "makeUrl");
  u2(it, "parseUrl");
  u2(Bn, "stripPathFilename");
  u2(Pn, "mergePaths");
  u2(st, "normalizePath");
  u2(Wn, "resolve$1");
  u2(ot, "resolve");
  u2(Jn, "stripFilename");
  u2(qn, "maybeSort");
  u2(at, "nextUnsortedSegmentLine");
  u2(zn, "isSorted");
  u2(Hn, "sortSegments");
  u2(Gn, "sortComparator");
  u2(Kn, "binarySearch");
  u2(Xn, "lowerBound");
  u2(Yn, "memoizedState");
  u2(Qn, "memoizedBinarySearch");
  ct = class ct {
    static {
      u2(this, "TraceMap");
    }
    constructor(e2, n3) {
      const i3 = typeof e2 == "string";
      if (!i3 && e2._decodedMemo)
        return e2;
      const o4 = i3 ? JSON.parse(e2) : e2, { version: a4, file: l2, names: p3, sourceRoot: g, sources: b, sourcesContent: d2 } = o4;
      this.version = a4, this.file = l2, this.names = p3 || [], this.sourceRoot = g, this.sources = b, this.sourcesContent = d2, this.ignoreList = o4.ignoreList || o4.x_google_ignoreList || undefined;
      const r3 = ot(g || "", Jn(n3));
      this.resolvedSources = b.map((O) => ot(O || "", r3));
      const { mappings: S } = o4;
      typeof S == "string" ? (this._encoded = S, this._decoded = undefined) : (this._encoded = undefined, this._decoded = qn(S, i3)), this._decodedMemo = Yn(), this._bySources = undefined, this._bySourceMemos = undefined;
    }
  };
  u2(Hr, "cast$2");
  u2(lt, "decodedMappings");
  u2(Zn, "traceSegment");
  u2(Vn, "traceSegmentInternal");
  Ae = class Ae {
    static {
      u2(this, "SetArray");
    }
    constructor() {
      this._indexes = { __proto__: null }, this.array = [];
    }
  };
  u2(Gr, "cast$1");
  u2(ut, "get");
  u2(ne, "put");
  u2(er, "remove");
  or = class or {
    static {
      u2(this, "GenMapping");
    }
    constructor({ file: e2, sourceRoot: n3 } = {}) {
      this._names = new Ae, this._sources = new Ae, this._sourcesContent = [], this._mappings = [], this.file = e2, this.sourceRoot = n3, this._ignoreList = new Ae;
    }
  };
  u2(Kr, "cast");
  ar = u2((s2, e2, n3, i3, o4, a4, l2, p3) => fr(true, s2, e2, n3, i3, o4, a4, l2), "maybeAddSegment");
  u2(cr, "setSourceContent");
  u2(lr, "setIgnore");
  u2(ht, "toDecodedMap");
  u2(ur, "toEncodedMap");
  u2(fr, "addSegmentInternal");
  u2(hr, "getLine");
  u2(dr, "getColumnIndex");
  u2(dt, "insert");
  u2(gr, "removeEmptyFinalLines");
  u2(br, "skipSourceless");
  u2(pr, "skipSource");
  gt = bt("", -1, -1, "", null, false);
  mr = [];
  u2(bt, "SegmentObject");
  u2(pt, "Source");
  u2(mt, "MapSource");
  u2(wr, "OriginalSource");
  u2(kr, "traceMappings");
  u2(wt, "originalPositionFor");
  u2(Cr, "asArray");
  u2(yr, "buildSourceMapTree");
  u2(kt, "build");
  Sr = class Sr {
    static {
      u2(this, "SourceMap");
    }
    constructor(e2, n3) {
      const i3 = n3.decodedMappings ? ht(e2) : ur(e2);
      this.version = i3.version, this.file = i3.file, this.mappings = i3.mappings, this.names = i3.names, this.ignoreList = i3.ignoreList, this.sourceRoot = i3.sourceRoot, this.sources = i3.sources, n3.excludeContent || (this.sourcesContent = i3.sourcesContent);
    }
    toString() {
      return JSON.stringify(this);
    }
  };
  u2(Ct, "remapping");
  yt = u2((s2, e2, n3) => {
    const i3 = [], o4 = { code: e2 };
    for (const a4 of n3) {
      const l2 = a4(s2, o4.code);
      l2 && (Object.assign(o4, l2), i3.unshift(l2.map));
    }
    return { ...o4, map: Ct(i3, () => null) };
  }, "applyTransformersSync");
  xr = u2(async (s2, e2, n3) => {
    const i3 = [], o4 = { code: e2 };
    for (const a4 of n3) {
      const l2 = await a4(s2, o4.code);
      l2 && (Object.assign(o4, l2), i3.unshift(l2.map));
    }
    return { ...o4, map: Ct(i3, () => null) };
  }, "applyTransformers");
  vr = u2((s2) => {
    const e2 = [];
    let n3 = false, i3 = true;
    for (let o4 = 0;o4 < s2.length; o4 += 1) {
      let a4 = s2[o4];
      if (a4 === "\\" && n3) {
        if (o4 + 1 === s2.length)
          return e2;
        o4 += 1, a4 = s2[o4];
      } else if (a4 === " " && !n3) {
        i3 = true;
        continue;
      } else if (a4 === '"') {
        n3 = !n3;
        continue;
      }
      i3 ? (e2.push(a4), i3 = false) : e2[e2.length - 1] += a4;
    }
    return e2;
  }, "tokenizeNodeOptionsEnv");
  St = u2((s2, e2, n3) => {
    for (let i3 = 0;i3 < e2.length; i3 += 1) {
      const o4 = e2[i3];
      if (o4.length <= 1 || o4[0] !== "-")
        continue;
      const a4 = o4[1] === "-" ? o4.indexOf("=") : -1;
      let l2 = a4 === -1 ? o4 : o4.slice(0, a4);
      l2.includes("_", 2) && (l2 = l2.slice(0, 2) + l2.slice(2).replaceAll("_", "-"));
      for (const p3 of s2.forms) {
        const [g, b] = p3;
        if (l2 !== g || (b === 3 || b === 5) && a4 === -1)
          continue;
        const d2 = b === 4 || b === 5, r3 = b >= 3 ? 0 : b;
        let S = d2 ? p3[2] : "";
        r3 === 0 && !d2 && (a4 === -1 ? (i3 += 1, S = e2[i3] ?? "", S[0] === "\\" && S[1] === "-" && (S = S.slice(1))) : S = o4.slice(a4 + 1)), n3 = s2.fold(S, n3, r3);
        break;
      }
    }
    return n3;
  }, "scanSource");
  Er = u2((s2) => {
    let e2 = s2.init();
    const n3 = process.env.NODE_OPTIONS;
    return n3 && (e2 = St(s2, vr(n3), e2)), e2 = St(s2, process.execArgv, e2), e2;
  }, "getOptionValue");
  _r = u2((s2, e2, n3) => n3 === 1, "setByEffect");
  Ir = u2((s2, e2) => ({ forms: e2, init: u2(() => s2, "init"), fold: _r }), "booleanFlag");
  Lr = Ir(false, [["--inspect-brk-node", 1], ["--inspect-brk", 1], ["--inspect-wait", 1], ["--inspect", 1], ["--no-inspect", 2]]);
  Or = Object.freeze({ target: `node${process.versions.node}`, loader: "default" });
  Ar = Er(Lr);
  Ne = { ...Or, sourcemap: true, sourcesContent: !!process.env.NODE_V8_COVERAGE || Ar, minifyWhitespace: true, keepNames: true };
  Re = u2((s2) => {
    const e2 = s2.sourcefile;
    if (e2) {
      const n3 = import_node_path3.default.extname(e2.split("?")[0]);
      n3 ? n3 === ".cts" || n3 === ".mts" ? s2.sourcefile = `${e2.slice(0, -3)}ts` : n3 === ".mjs" && (s2.sourcefile = `${e2.slice(0, -3)}js`) : s2.sourcefile += ".js";
    }
    return (n3) => (n3.map && (s2.sourcefile !== e2 && (n3.map = n3.map.replace(JSON.stringify(s2.sourcefile), JSON.stringify(e2))), n3.map = JSON.parse(n3.map)), n3);
  }, "patchOptions");
  Me = u2((s2) => {
    throw s2.name = "TransformError", delete s2.errors, delete s2.warnings, s2;
  }, "formatEsbuildError");
  Nr = u2((s2, e2) => ({ ...c(d) ? { dirname: import_node_path3.default.dirname(s2), filename: s2 } : {}, url: e2 }), "getImportMeta");
  Rr = u2((s2, e2) => {
    if (!s2.includes("import"))
      return false;
    try {
      return ae(s2, e2)[0].some((n3) => n3.d === -2);
    } catch {
      return true;
    }
  }, "hasImportMeta");
  Mr = u2((s2, e2, n3) => {
    let i3, o4, a4;
    if (e2.startsWith("file://")) {
      i3 = e2;
      const r3 = new URL(e2);
      o4 = import_node_url.fileURLToPath(r3);
    } else
      [o4, a4] = e2.split("?"), i3 = import_node_url.pathToFileURL(o4) + (a4 ? `?${a4}` : "");
    const { cjsBanner: l2, ...p3 } = n3 ?? {}, g = { ...Ne, format: "cjs", sourcefile: o4, banner: `__filename=${JSON.stringify(o4)};(()=>{${l2 ?? ""}`, footer: "})()", platform: "node", ...p3 };
    g.format === "cjs" && !o4.endsWith(".cjs") && !o4.endsWith(".cts") && Rr(s2, o4) && (g.define = { ...g.define, "import.meta": JSON.stringify(Nr(o4, i3)) });
    const b = xe([s2, i3, JSON.stringify(g), import_esbuild.version, Le].join("-"));
    let d2 = z.get(b);
    return d2 || (d2 = yt(e2, s2, [(r3, S) => {
      const O = Re(g);
      let _;
      try {
        _ = import_esbuild.transformSync(S, g);
      } catch (N) {
        throw Me(N);
      }
      return O(_);
    }, (r3, S) => ce(r3, S, true)]), z.set(b, d2)), d2;
  }, "transformSync");
  $r = u2(async (s2, e2, n3) => {
    const i3 = { ...Ne, format: "esm", sourcefile: e2, ...n3 }, o4 = xe([s2, JSON.stringify(i3), import_esbuild.version, Le].join("-"));
    let a4 = z.get(o4);
    return a4 || (a4 = await xr(e2, s2, [async (l2, p3) => {
      const g = Re(i3);
      let b;
      try {
        b = await import_esbuild.transform(p3, i3);
      } catch (d2) {
        throw Me(d2);
      }
      return g(b);
    }, (l2, p3) => ce(l2, p3, true)]), z.set(o4, a4)), a4;
  }, "transform");
  Dr = u2((s2, e2, n3) => {
    const i3 = { ...Ne, format: "esm", sourcefile: e2, ...n3 }, o4 = xe([s2, JSON.stringify(i3), import_esbuild.version, Le].join("-"));
    let a4 = z.get(o4);
    return a4 || (a4 = yt(e2, s2, [(l2, p3) => {
      const g = Re(i3);
      let b;
      try {
        b = import_esbuild.transformSync(p3, i3);
      } catch (d2) {
        throw Me(d2);
      }
      return g(b);
    }, (l2, p3) => ce(l2, p3, true)]), z.set(o4, a4)), a4;
  }, "transformEsmSync");
});

// node_modules/tsx/dist/client-D_mPDF5S.mjs
var import_node_net, p3, t3 = (e2, n3) => p3(e2, "name", { value: n3, configurable: true }), o4, m3, s2, a4;
var init_client_D_mPDF5S = __esm(() => {
  init_get_pipe_path__tAJyU_v();
  import_node_net = __toESM(require("node:net"));
  p3 = Object.defineProperty;
  o4 = [];
  m3 = t3(() => new Promise((e2) => {
    const n3 = n(process.ppid), r3 = import_node_net.default.createConnection(n3, () => {
      e2(t3((i3) => {
        const c3 = Buffer.from(JSON.stringify(i3)), f = Buffer.alloc(4);
        f.writeInt32BE(c3.length, 0), r3.write(Buffer.concat([f, c3]));
      }, "sendToParent"));
    });
    r3.on("error", () => {
      e2();
    }), r3.unref();
  }), "connectToServer");
  s2 = { send: t3((e2) => {
    o4.push(e2);
  }, "send") };
  a4 = m3();
  a4.then((e2) => {
    if (e2)
      for (const n3 of o4)
        e2(n3);
    o4 = [], s2.send = e2;
  }, () => {
    o4 = [], s2.send = undefined;
  });
});

// node_modules/tsx/dist/index-gbaejti9.mjs
function e2(s3, n3, r3 = 1) {
  const o5 = `\x1B[${s3}m`, c3 = `\x1B[${n3}m`, a5 = new RegExp(`\\x1b\\[${n3}m`, "g");
  return (p4) => f.enabled && f.supportLevel >= r3 ? o5 + ("" + p4).replace(a5, o5) + c3 : "" + p4;
}
var u3, g2 = (s3, n3) => u3(s3, "name", { value: n3, configurable: true }), t4 = true, l2, i3 = 0, f, b, d2, O, C2, R3, I2, L2, E2, T;
var init_index_gbaejti9 = __esm(() => {
  u3 = Object.defineProperty;
  l2 = typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {};
  if (l2.process && l2.process.env && l2.process.stdout) {
    const { FORCE_COLOR: s3, NODE_DISABLE_COLORS: n3, NO_COLOR: r3, TERM: o5, COLORTERM: c3 } = l2.process.env;
    n3 || r3 || s3 === "0" ? t4 = false : s3 === "1" || s3 === "2" || s3 === "3" ? t4 = true : o5 === "dumb" ? t4 = false : ("CI" in l2.process.env) && ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE", "DRONE"].some((a5) => (a5 in l2.process.env)) ? t4 = true : t4 = process.stdout.isTTY, t4 && (process.platform === "win32" || c3 && (c3 === "truecolor" || c3 === "24bit") ? i3 = 3 : o5 && (o5.endsWith("-256color") || o5.endsWith("256")) ? i3 = 2 : i3 = 1);
  }
  f = { enabled: t4, supportLevel: i3 };
  g2(e2, "kolorist");
  b = e2(30, 39);
  d2 = e2(33, 39);
  O = e2(90, 39);
  C2 = e2(92, 39);
  R3 = e2(95, 39);
  I2 = e2(96, 39);
  L2 = e2(44, 49);
  E2 = e2(100, 49);
  T = e2(103, 49);
});

// node_modules/tsx/dist/register-C9AniqUt.mjs
function Jt(e3, t5) {
  if (!t5.includes(G2) && e3.hasOwnProperty(t5))
    return [t5];
  let r3, n3;
  for (const s3 of Object.keys(e3))
    if (s3.includes(G2)) {
      const [o5, a5, i4] = s3.split(G2);
      if (i4 === undefined && t5.startsWith(o5) && t5.endsWith(a5)) {
        const m4 = t5.slice(o5.length, -a5.length || undefined);
        m4 && (!r3 || Mt(r3, s3)) && (r3 = s3, n3 = m4);
      }
    }
  return [r3, n3];
}
function A(e3) {
  return e3.startsWith("\\\\?\\") ? e3 : e3.replace(/\\/g, "/");
}
function Ie2(e3, t5 = false) {
  const r3 = e3.length;
  let n3 = 0, s3 = "", o5 = 0, a5 = 16, i4 = 0, m4 = 0, u4 = 0, y = 0, f2 = 0;
  function E3(l3, C3) {
    let S = 0, x = 0;
    for (;S < l3; ) {
      let w = e3.charCodeAt(n3);
      if (w >= 48 && w <= 57)
        x = x * 16 + w - 48;
      else if (w >= 65 && w <= 70)
        x = x * 16 + w - 65 + 10;
      else if (w >= 97 && w <= 102)
        x = x * 16 + w - 97 + 10;
      else
        break;
      n3++, S++;
    }
    return S < l3 && (x = -1), x;
  }
  p4(E3, "A"), c3(E3, "scanHexDigits");
  function b2(l3) {
    n3 = l3, s3 = "", o5 = 0, a5 = 16, f2 = 0;
  }
  p4(b2, "O"), c3(b2, "setPosition");
  function k2() {
    let l3 = n3;
    if (e3.charCodeAt(n3) === 48)
      n3++;
    else
      for (n3++;n3 < e3.length && I3(e3.charCodeAt(n3)); )
        n3++;
    if (n3 < e3.length && e3.charCodeAt(n3) === 46)
      if (n3++, n3 < e3.length && I3(e3.charCodeAt(n3)))
        for (n3++;n3 < e3.length && I3(e3.charCodeAt(n3)); )
          n3++;
      else
        return f2 = 3, e3.substring(l3, n3);
    let C3 = n3;
    if (n3 < e3.length && (e3.charCodeAt(n3) === 69 || e3.charCodeAt(n3) === 101))
      if (n3++, (n3 < e3.length && e3.charCodeAt(n3) === 43 || e3.charCodeAt(n3) === 45) && n3++, n3 < e3.length && I3(e3.charCodeAt(n3))) {
        for (n3++;n3 < e3.length && I3(e3.charCodeAt(n3)); )
          n3++;
        C3 = n3;
      } else
        f2 = 3;
    return e3.substring(l3, C3);
  }
  p4(k2, "h"), c3(k2, "scanNumber");
  function v() {
    let l3 = "", C3 = n3;
    for (;; ) {
      if (n3 >= r3) {
        l3 += e3.substring(C3, n3), f2 = 2;
        break;
      }
      const S = e3.charCodeAt(n3);
      if (S === 34) {
        l3 += e3.substring(C3, n3), n3++;
        break;
      }
      if (S === 92) {
        if (l3 += e3.substring(C3, n3), n3++, n3 >= r3) {
          f2 = 2;
          break;
        }
        switch (e3.charCodeAt(n3++)) {
          case 34:
            l3 += '"';
            break;
          case 92:
            l3 += "\\";
            break;
          case 47:
            l3 += "/";
            break;
          case 98:
            l3 += "\b";
            break;
          case 102:
            l3 += "\f";
            break;
          case 110:
            l3 += `
`;
            break;
          case 114:
            l3 += "\r";
            break;
          case 116:
            l3 += "\t";
            break;
          case 117:
            const x = E3(4);
            x >= 0 ? l3 += String.fromCharCode(x) : f2 = 4;
            break;
          default:
            f2 = 5;
        }
        C3 = n3;
        continue;
      }
      if (S >= 0 && S <= 31)
        if (M(S)) {
          l3 += e3.substring(C3, n3), f2 = 2;
          break;
        } else
          f2 = 6;
      n3++;
    }
    return l3;
  }
  p4(v, "D"), c3(v, "scanString");
  function d3() {
    if (s3 = "", f2 = 0, o5 = n3, m4 = i4, y = u4, n3 >= r3)
      return o5 = r3, a5 = 17;
    let l3 = e3.charCodeAt(n3);
    if (te2(l3)) {
      do
        n3++, s3 += String.fromCharCode(l3), l3 = e3.charCodeAt(n3);
      while (te2(l3));
      return a5 = 15;
    }
    if (M(l3))
      return n3++, s3 += String.fromCharCode(l3), l3 === 13 && e3.charCodeAt(n3) === 10 && (n3++, s3 += `
`), i4++, u4 = n3, a5 = 14;
    switch (l3) {
      case 123:
        return n3++, a5 = 1;
      case 125:
        return n3++, a5 = 2;
      case 91:
        return n3++, a5 = 3;
      case 93:
        return n3++, a5 = 4;
      case 58:
        return n3++, a5 = 6;
      case 44:
        return n3++, a5 = 5;
      case 34:
        return n3++, s3 = v(), a5 = 10;
      case 47:
        const C3 = n3 - 1;
        if (e3.charCodeAt(n3 + 1) === 47) {
          for (n3 += 2;n3 < r3 && !M(e3.charCodeAt(n3)); )
            n3++;
          return s3 = e3.substring(C3, n3), a5 = 12;
        }
        if (e3.charCodeAt(n3 + 1) === 42) {
          n3 += 2;
          const S = r3 - 1;
          let x = false;
          for (;n3 < S; ) {
            const w = e3.charCodeAt(n3);
            if (w === 42 && e3.charCodeAt(n3 + 1) === 47) {
              n3 += 2, x = true;
              break;
            }
            n3++, M(w) && (w === 13 && e3.charCodeAt(n3) === 10 && n3++, i4++, u4 = n3);
          }
          return x || (n3++, f2 = 1), s3 = e3.substring(C3, n3), a5 = 13;
        }
        return s3 += String.fromCharCode(l3), n3++, a5 = 16;
      case 45:
        if (s3 += String.fromCharCode(l3), n3++, n3 === r3 || !I3(e3.charCodeAt(n3)))
          return a5 = 16;
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        return s3 += k2(), a5 = 11;
      default:
        for (;n3 < r3 && g3(l3); )
          n3++, l3 = e3.charCodeAt(n3);
        if (o5 !== n3) {
          switch (s3 = e3.substring(o5, n3), s3) {
            case "true":
              return a5 = 8;
            case "false":
              return a5 = 9;
            case "null":
              return a5 = 7;
          }
          return a5 = 16;
        }
        return s3 += String.fromCharCode(l3), n3++, a5 = 16;
    }
  }
  p4(d3, "c"), c3(d3, "scanNext");
  function g3(l3) {
    if (te2(l3) || M(l3))
      return false;
    switch (l3) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  p4(g3, "p"), c3(g3, "isUnknownContentCharacter");
  function T2() {
    let l3;
    do
      l3 = d3();
    while (l3 >= 12 && l3 <= 15);
    return l3;
  }
  return p4(T2, "b"), c3(T2, "scanNextNonTrivia"), { setPosition: b2, getPosition: c3(() => n3, "getPosition"), scan: t5 ? T2 : d3, getToken: c3(() => a5, "getToken"), getTokenValue: c3(() => s3, "getTokenValue"), getTokenOffset: c3(() => o5, "getTokenOffset"), getTokenLength: c3(() => n3 - o5, "getTokenLength"), getTokenStartLine: c3(() => m4, "getTokenStartLine"), getTokenStartCharacter: c3(() => o5 - y, "getTokenStartCharacter"), getTokenError: c3(() => f2, "getTokenError") };
}
function te2(e3) {
  return e3 === 32 || e3 === 9;
}
function M(e3) {
  return e3 === 10 || e3 === 13;
}
function I3(e3) {
  return e3 >= 48 && e3 <= 57;
}
function We2(e3, t5 = [], r3 = ne2.DEFAULT) {
  let n3 = null, s3 = [];
  const o5 = [];
  function a5(i4) {
    Array.isArray(s3) ? s3.push(i4) : n3 !== null && (s3[n3] = i4);
  }
  return p4(a5, "l"), c3(a5, "onValue"), Be2(e3, { onObjectBegin: c3(() => {
    const i4 = {};
    a5(i4), o5.push(s3), s3 = i4, n3 = null;
  }, "onObjectBegin"), onObjectProperty: c3((i4) => {
    n3 = i4;
  }, "onObjectProperty"), onObjectEnd: c3(() => {
    s3 = o5.pop();
  }, "onObjectEnd"), onArrayBegin: c3(() => {
    const i4 = [];
    a5(i4), o5.push(s3), s3 = i4, n3 = null;
  }, "onArrayBegin"), onArrayEnd: c3(() => {
    s3 = o5.pop();
  }, "onArrayEnd"), onLiteralValue: a5, onError: c3((i4, m4, u4) => {
    t5.push({ error: i4, offset: m4, length: u4 });
  }, "onError") }, r3), s3[0];
}
function Be2(e3, t5, r3 = ne2.DEFAULT) {
  const n3 = Ie2(e3, false), s3 = [];
  let o5 = 0;
  function a5(j) {
    return j ? () => o5 === 0 && j(n3.getTokenOffset(), n3.getTokenLength(), n3.getTokenStartLine(), n3.getTokenStartCharacter()) : () => true;
  }
  p4(a5, "l"), c3(a5, "toNoArgVisit");
  function i4(j) {
    return j ? (O2) => o5 === 0 && j(O2, n3.getTokenOffset(), n3.getTokenLength(), n3.getTokenStartLine(), n3.getTokenStartCharacter()) : () => true;
  }
  p4(i4, "g"), c3(i4, "toOneArgVisit");
  function m4(j) {
    return j ? (O2) => o5 === 0 && j(O2, n3.getTokenOffset(), n3.getTokenLength(), n3.getTokenStartLine(), n3.getTokenStartCharacter(), () => s3.slice()) : () => true;
  }
  p4(m4, "m"), c3(m4, "toOneArgVisitWithPath");
  function u4(j) {
    return j ? () => {
      o5 > 0 ? o5++ : j(n3.getTokenOffset(), n3.getTokenLength(), n3.getTokenStartLine(), n3.getTokenStartCharacter(), () => s3.slice()) === false && (o5 = 1);
    } : () => true;
  }
  p4(u4, "k"), c3(u4, "toBeginVisit");
  function y(j) {
    return j ? () => {
      o5 > 0 && o5--, o5 === 0 && j(n3.getTokenOffset(), n3.getTokenLength(), n3.getTokenStartLine(), n3.getTokenStartCharacter());
    } : () => true;
  }
  p4(y, "w"), c3(y, "toEndVisit");
  const f2 = u4(t5.onObjectBegin), E3 = m4(t5.onObjectProperty), b2 = y(t5.onObjectEnd), k2 = u4(t5.onArrayBegin), v = y(t5.onArrayEnd), d3 = m4(t5.onLiteralValue), g3 = i4(t5.onSeparator), T2 = a5(t5.onComment), l3 = i4(t5.onError), C3 = r3 && r3.disallowComments, S = r3 && r3.allowTrailingComma;
  function x() {
    for (;; ) {
      const j = n3.scan();
      switch (n3.getTokenError()) {
        case 4:
          w(14);
          break;
        case 5:
          w(15);
          break;
        case 3:
          w(13);
          break;
        case 1:
          C3 || w(11);
          break;
        case 2:
          w(12);
          break;
        case 6:
          w(16);
          break;
      }
      switch (j) {
        case 12:
        case 13:
          C3 ? w(10) : T2();
          break;
        case 16:
          w(1);
          break;
        case 15:
        case 14:
          break;
        default:
          return j;
      }
    }
  }
  p4(x, "v"), c3(x, "scanNext");
  function w(j, O2 = [], $e2 = []) {
    if (l3(j), O2.length + $e2.length > 0) {
      let q2 = n3.getToken();
      for (;q2 !== 17; ) {
        if (O2.indexOf(q2) !== -1) {
          x();
          break;
        } else if ($e2.indexOf(q2) !== -1)
          break;
        q2 = x();
      }
    }
  }
  p4(w, "d"), c3(w, "handleError");
  function D2(j) {
    const O2 = n3.getTokenValue();
    return j ? d3(O2) : (E3(O2), s3.push(O2)), x(), true;
  }
  p4(D2, "L"), c3(D2, "parseString");
  function L3() {
    switch (n3.getToken()) {
      case 11:
        const j = n3.getTokenValue();
        let O2 = Number(j);
        isNaN(O2) && (w(2), O2 = 0), d3(O2);
        break;
      case 7:
        d3(null);
        break;
      case 8:
        d3(true);
        break;
      case 9:
        d3(false);
        break;
      default:
        return false;
    }
    return x(), true;
  }
  p4(L3, "B"), c3(L3, "parseLiteral");
  function P() {
    return n3.getToken() !== 10 ? (w(3, [], [2, 5]), false) : (D2(false), n3.getToken() === 6 ? (g3(":"), x(), Z2() || w(4, [], [2, 5])) : w(5, [], [2, 5]), s3.pop(), true);
  }
  p4(P, "$"), c3(P, "parseProperty");
  function W() {
    f2(), x();
    let j = false;
    for (;n3.getToken() !== 2 && n3.getToken() !== 17; ) {
      if (n3.getToken() === 5) {
        if (j || w(4, [], []), g3(","), x(), n3.getToken() === 2 && S)
          break;
      } else
        j && w(6, [], []);
      P() || w(4, [], [2, 5]), j = true;
    }
    return b2(), n3.getToken() !== 2 ? w(7, [2], []) : x(), true;
  }
  p4(W, "N"), c3(W, "parseObject");
  function Ae2() {
    k2(), x();
    let j = true, O2 = false;
    for (;n3.getToken() !== 4 && n3.getToken() !== 17; ) {
      if (n3.getToken() === 5) {
        if (O2 || w(4, [], []), g3(","), x(), n3.getToken() === 4 && S)
          break;
      } else
        O2 && w(6, [], []);
      j ? (s3.push(0), j = false) : s3[s3.length - 1]++, Z2() || w(4, [], [4, 5]), O2 = true;
    }
    return v(), j || s3.pop(), n3.getToken() !== 4 ? w(8, [4], []) : x(), true;
  }
  p4(Ae2, "$e"), c3(Ae2, "parseArray");
  function Z2() {
    switch (n3.getToken()) {
      case 3:
        return Ae2();
      case 1:
        return W();
      case 10:
        return D2(true);
      default:
        return L3();
    }
  }
  return p4(Z2, "H"), c3(Z2, "parseValue"), x(), n3.getToken() === 17 ? r3.allowEmptyContent ? true : (w(4, [], []), false) : Z2() ? (n3.getToken() !== 17 && w(9, [], []), true) : (w(4, [], []), false);
}
var import_node_module, import_node_path4, import_node_url2, import_node_fs2, import_fs2, import_os2, import_path3, import_node_util, wt2, p4 = (e3, t5) => wt2(e3, "name", { value: t5, configurable: true }), De, Le2, Ue, B, Re2 = "ERR_INVALID_PACKAGE_CONFIG", ue2 = "ERR_INVALID_PACKAGE_TARGET", It = "ERR_PACKAGE_PATH_NOT_EXPORTED", Nt, Wt, Bt, Fe2, fe2, G2 = "*", Mt, Vt2, Qt2, Gt, Kt, c3, zt, _, K, Ne2, J2 = 200, ne2, Me2, Je2, Ht, Ve2, de, Qe2, Xt2 = "detectTypeScriptVersion:", Yt2, N = "package.json", re2 = "tsconfig.json", Zt2, me, qt, en, he, U2 = "${configDir}", ge, se, tn, nn2, rn, sn2, on2, an2, cn2, ln2, pn2, ye, Ge2, Ke2, un2, ze2, oe2, fn2, dn2, mn2, ke, hn2, ae2, He2, be, Xe2, gn2, yn2, Ye2, we, kn2, bn2, Ze2, wn2, xe2, xn2, qe2 = "**/*", ie = "[^/]", Ee2 = "[^./]", et2, En2, tt2, ve2, nt2, vn2, Cn2, jn2, rt2, Tn2, Sn2, On2, An2, st2, ot2, at2, $n2 = `
//# sourceMappingURL=data:application/json;base64,`, it2, Ce, z2, H, Pn2, _n2, je, V2, X = "file://", Dn2, ct2, Ln2, Rn2, ce2, lt2, Te, le2, pt2, Q3, In2, R4, Nn2, Wn2, Bn2, ut2, Mn2, Jn2, Vn2, ft2, dt2, Qn2, Gn2, Kn2, Y3, zn2, mt2, Se2, Hn2, Xn2, ht2, gt2 = "module.exports", Yn2 = 'Top-level await is currently not supported with the "cjs" output format', yt2, Oe2, Zn2, qn2, er2, pe, tr2, kt2 = "at cjsPreparseModuleExports (node:internal", nr2, rr2, sr2, or2, bt2, ar2;
var init_register_C9AniqUt = __esm(() => {
  init_get_pipe_path__tAJyU_v();
  init_index_DQtFPMc2();
  init_client_D_mPDF5S();
  init_index_gbaejti9();
  init_node_features_JeyyvQz6();
  import_node_module = __toESM(require("node:module"));
  import_node_path4 = __toESM(require("node:path"));
  import_node_url2 = require("node:url");
  import_node_fs2 = __toESM(require("node:fs"));
  import_fs2 = __toESM(require("fs"));
  import_os2 = __toESM(require("os"));
  import_path3 = __toESM(require("path"));
  import_node_util = require("node:util");
  wt2 = Object.defineProperty;
  De = p4((e3) => {
    if (!e3.startsWith("data:text/javascript,"))
      return;
    const t5 = e3.indexOf("?");
    if (t5 === -1)
      return;
    const n3 = new URLSearchParams(e3.slice(t5 + 1)).get("filePath");
    if (n3)
      return n3;
  }, "getOriginalFilePath");
  Le2 = p4((e3) => {
    const t5 = De(e3);
    return t5 && (import_node_module.default._cache[t5] = import_node_module.default._cache[e3], delete import_node_module.default._cache[e3], e3 = t5), e3;
  }, "interopCjsExports");
  Ue = p4((e3) => e3 !== null && typeof e3 == "object", "A");
  B = p4((e3, t5) => Object.assign(new Error(`[${e3}]: ${t5}`), { code: e3 }), "a");
  Nt = /^\d+$/;
  Wt = /^(\.{1,2}|node_modules)$/i;
  Bt = /\/|\\/;
  Fe2 = ((e3) => (e3.Export = "exports", e3.Import = "imports", e3))(Fe2 || {});
  fe2 = p4((e3, t5, r3, n3, s3) => {
    if (t5 == null)
      return [];
    if (typeof t5 == "string") {
      const [o5, ...a5] = t5.split(Bt);
      if (o5 === ".." || a5.some((i4) => Wt.test(i4)))
        throw B(ue2, `Invalid "${e3}" target "${t5}" defined in the package config`);
      return [s3 ? t5.replace(/\*/g, s3) : t5];
    }
    if (Array.isArray(t5))
      return t5.flatMap((o5) => fe2(e3, o5, r3, n3, s3));
    if (Ue(t5)) {
      for (const o5 of Object.keys(t5)) {
        if (Nt.test(o5))
          throw B(Re2, "Cannot contain numeric property keys");
        if (o5 === "default" || n3.includes(o5))
          return fe2(e3, t5[o5], r3, n3, s3);
      }
      return [];
    }
    throw B(ue2, `Invalid "${e3}" target "${t5}"`);
  }, "f");
  Mt = p4((e3, t5) => {
    const r3 = e3.indexOf(G2), n3 = t5.indexOf(G2);
    return r3 === n3 ? t5.length > e3.length : n3 > r3;
  }, "m");
  p4(Jt, "d");
  Vt2 = p4((e3) => Object.keys(e3).reduce((t5, r3) => {
    const n3 = r3 === "" || r3[0] !== ".";
    if (t5 === undefined || t5 === n3)
      return n3;
    throw B(Re2, '"exports" cannot contain some keys starting with "." and some not');
  }, undefined), "p");
  Qt2 = /^\w+:/;
  Gt = p4((e3, t5, r3) => {
    if (!e3)
      throw new Error('"exports" is required');
    t5 = t5 === "" ? "." : `./${t5}`, (typeof e3 == "string" || Array.isArray(e3) || Ue(e3) && Vt2(e3)) && (e3 = { ".": e3 });
    const [n3, s3] = Jt(e3, t5), o5 = fe2(Fe2.Export, e3[n3], t5, r3, s3);
    if (o5.length === 0)
      throw B(It, t5 === "." ? 'No "exports" main defined' : `Package subpath '${t5}' is not defined by "exports"`);
    for (const a5 of o5)
      if (!a5.startsWith("./") && !Qt2.test(a5))
        throw B(ue2, `Invalid "exports" target "${a5}" defined in the package config`);
    return o5;
  }, "v");
  Kt = Object.defineProperty;
  c3 = p4((e3, t5) => Kt(e3, "name", { value: t5, configurable: true }), "i");
  p4(A, "x"), c3(A, "slash");
  zt = c3((e3, t5) => {
    const r3 = `readFileSync:${t5}`;
    let n3 = e3?.get(r3);
    return n3 === undefined && (n3 = import_node_fs2.default.readFileSync(t5, "utf8"), e3?.set(r3, n3)), n3;
  }, "readFile");
  _ = c3((e3, t5) => {
    const r3 = `tryStat:${t5}`;
    let n3 = e3?.get(r3);
    if (n3 === undefined) {
      try {
        n3 = import_node_fs2.default.statSync(t5);
      } catch {
        n3 = null;
      }
      e3?.set(r3, n3);
    }
    return n3 ?? undefined;
  }, "tryStat");
  K = c3((e3, t5, r3) => {
    for (;; ) {
      const n3 = import_node_path4.default.posix.join(e3, t5);
      if (_(r3, n3))
        return n3;
      const s3 = import_node_path4.default.dirname(e3);
      if (s3 === e3)
        return;
      e3 = s3;
    }
  }, "findUp");
  p4(Ie2, "Ne"), c3(Ie2, "createScanner");
  p4(te2, "X"), c3(te2, "isWhiteSpace");
  p4(M, "P"), c3(M, "isLineBreak");
  p4(I3, "S"), c3(I3, "isDigit");
  (function(e3) {
    e3[e3.lineFeed = 10] = "lineFeed", e3[e3.carriageReturn = 13] = "carriageReturn", e3[e3.space = 32] = "space", e3[e3._0 = 48] = "_0", e3[e3._1 = 49] = "_1", e3[e3._2 = 50] = "_2", e3[e3._3 = 51] = "_3", e3[e3._4 = 52] = "_4", e3[e3._5 = 53] = "_5", e3[e3._6 = 54] = "_6", e3[e3._7 = 55] = "_7", e3[e3._8 = 56] = "_8", e3[e3._9 = 57] = "_9", e3[e3.a = 97] = "a", e3[e3.b = 98] = "b", e3[e3.c = 99] = "c", e3[e3.d = 100] = "d", e3[e3.e = 101] = "e", e3[e3.f = 102] = "f", e3[e3.g = 103] = "g", e3[e3.h = 104] = "h", e3[e3.i = 105] = "i", e3[e3.j = 106] = "j", e3[e3.k = 107] = "k", e3[e3.l = 108] = "l", e3[e3.m = 109] = "m", e3[e3.n = 110] = "n", e3[e3.o = 111] = "o", e3[e3.p = 112] = "p", e3[e3.q = 113] = "q", e3[e3.r = 114] = "r", e3[e3.s = 115] = "s", e3[e3.t = 116] = "t", e3[e3.u = 117] = "u", e3[e3.v = 118] = "v", e3[e3.w = 119] = "w", e3[e3.x = 120] = "x", e3[e3.y = 121] = "y", e3[e3.z = 122] = "z", e3[e3.A = 65] = "A", e3[e3.B = 66] = "B", e3[e3.C = 67] = "C", e3[e3.D = 68] = "D", e3[e3.E = 69] = "E", e3[e3.F = 70] = "F", e3[e3.G = 71] = "G", e3[e3.H = 72] = "H", e3[e3.I = 73] = "I", e3[e3.J = 74] = "J", e3[e3.K = 75] = "K", e3[e3.L = 76] = "L", e3[e3.M = 77] = "M", e3[e3.N = 78] = "N", e3[e3.O = 79] = "O", e3[e3.P = 80] = "P", e3[e3.Q = 81] = "Q", e3[e3.R = 82] = "R", e3[e3.S = 83] = "S", e3[e3.T = 84] = "T", e3[e3.U = 85] = "U", e3[e3.V = 86] = "V", e3[e3.W = 87] = "W", e3[e3.X = 88] = "X", e3[e3.Y = 89] = "Y", e3[e3.Z = 90] = "Z", e3[e3.asterisk = 42] = "asterisk", e3[e3.backslash = 92] = "backslash", e3[e3.closeBrace = 125] = "closeBrace", e3[e3.closeBracket = 93] = "closeBracket", e3[e3.colon = 58] = "colon", e3[e3.comma = 44] = "comma", e3[e3.dot = 46] = "dot", e3[e3.doubleQuote = 34] = "doubleQuote", e3[e3.minus = 45] = "minus", e3[e3.openBrace = 123] = "openBrace", e3[e3.openBracket = 91] = "openBracket", e3[e3.plus = 43] = "plus", e3[e3.slash = 47] = "slash", e3[e3.formFeed = 12] = "formFeed", e3[e3.tab = 9] = "tab";
  })(Ne2 || (Ne2 = {})), new Array(20).fill(0).map((e3, t5) => " ".repeat(t5));
  new Array(J2).fill(0).map((e3, t5) => `
` + " ".repeat(t5)), new Array(J2).fill(0).map((e3, t5) => "\r" + " ".repeat(t5)), new Array(J2).fill(0).map((e3, t5) => `\r
` + " ".repeat(t5)), new Array(J2).fill(0).map((e3, t5) => `
` + "\t".repeat(t5)), new Array(J2).fill(0).map((e3, t5) => "\r" + "\t".repeat(t5)), new Array(J2).fill(0).map((e3, t5) => `\r
` + "\t".repeat(t5));
  (function(e3) {
    e3.DEFAULT = { allowTrailingComma: false };
  })(ne2 || (ne2 = {}));
  p4(We2, "Re"), c3(We2, "parse$1");
  p4(Be2, "Pe"), c3(Be2, "visit");
  (function(e3) {
    e3[e3.None = 0] = "None", e3[e3.UnexpectedEndOfComment = 1] = "UnexpectedEndOfComment", e3[e3.UnexpectedEndOfString = 2] = "UnexpectedEndOfString", e3[e3.UnexpectedEndOfNumber = 3] = "UnexpectedEndOfNumber", e3[e3.InvalidUnicode = 4] = "InvalidUnicode", e3[e3.InvalidEscapeCharacter = 5] = "InvalidEscapeCharacter", e3[e3.InvalidCharacter = 6] = "InvalidCharacter";
  })(Me2 || (Me2 = {}));
  (function(e3) {
    e3[e3.OpenBraceToken = 1] = "OpenBraceToken", e3[e3.CloseBraceToken = 2] = "CloseBraceToken", e3[e3.OpenBracketToken = 3] = "OpenBracketToken", e3[e3.CloseBracketToken = 4] = "CloseBracketToken", e3[e3.CommaToken = 5] = "CommaToken", e3[e3.ColonToken = 6] = "ColonToken", e3[e3.NullKeyword = 7] = "NullKeyword", e3[e3.TrueKeyword = 8] = "TrueKeyword", e3[e3.FalseKeyword = 9] = "FalseKeyword", e3[e3.StringLiteral = 10] = "StringLiteral", e3[e3.NumericLiteral = 11] = "NumericLiteral", e3[e3.LineCommentTrivia = 12] = "LineCommentTrivia", e3[e3.BlockCommentTrivia = 13] = "BlockCommentTrivia", e3[e3.LineBreakTrivia = 14] = "LineBreakTrivia", e3[e3.Trivia = 15] = "Trivia", e3[e3.Unknown = 16] = "Unknown", e3[e3.EOF = 17] = "EOF";
  })(Je2 || (Je2 = {}));
  Ht = We2;
  (function(e3) {
    e3[e3.InvalidSymbol = 1] = "InvalidSymbol", e3[e3.InvalidNumberFormat = 2] = "InvalidNumberFormat", e3[e3.PropertyNameExpected = 3] = "PropertyNameExpected", e3[e3.ValueExpected = 4] = "ValueExpected", e3[e3.ColonExpected = 5] = "ColonExpected", e3[e3.CommaExpected = 6] = "CommaExpected", e3[e3.CloseBraceExpected = 7] = "CloseBraceExpected", e3[e3.CloseBracketExpected = 8] = "CloseBracketExpected", e3[e3.EndOfFileExpected = 9] = "EndOfFileExpected", e3[e3.InvalidCommentToken = 10] = "InvalidCommentToken", e3[e3.UnexpectedEndOfComment = 11] = "UnexpectedEndOfComment", e3[e3.UnexpectedEndOfString = 12] = "UnexpectedEndOfString", e3[e3.UnexpectedEndOfNumber = 13] = "UnexpectedEndOfNumber", e3[e3.InvalidUnicode = 14] = "InvalidUnicode", e3[e3.InvalidEscapeCharacter = 15] = "InvalidEscapeCharacter", e3[e3.InvalidCharacter = 16] = "InvalidCharacter";
  })(Ve2 || (Ve2 = {}));
  de = c3((e3, t5) => Ht(zt(t5, e3)), "readJsonc");
  Qe2 = c3(() => {
    const { findPnpApi: e3 } = import_node_module.default;
    return e3 && e3(process.cwd());
  }, "getPnpApi");
  Yt2 = c3((e3, t5) => {
    const r3 = `${Xt2}${e3}`, n3 = t5?.get(r3);
    if (n3 !== undefined)
      return n3 ?? undefined;
    let s3;
    const o5 = Qe2();
    if (o5)
      try {
        s3 = o5.resolveRequest("typescript/package.json", e3) ?? undefined;
      } catch {}
    s3 ??= K(import_node_path4.default.resolve(e3), import_node_path4.default.join("node_modules", "typescript", "package.json"), t5);
    let a5;
    if (s3)
      try {
        const i4 = de(s3, t5);
        typeof i4?.version == "string" && (a5 = i4.version);
      } catch {}
    return t5?.set(r3, a5 ?? null), a5;
  }, "detectTypeScriptVersion");
  Zt2 = c3((e3, t5, r3) => {
    const n3 = import_node_module.default.createRequire(import_node_path4.default.join(r3, "tsconfig.json"));
    if (e3 !== t5)
      try {
        return n3.resolve(e3);
      } catch {}
    try {
      return n3.resolve(t5);
    } catch {}
    try {
      return n3.resolve(`${t5}/${N}`);
    } catch {}
  }, "resolvePackageEntryWithNode");
  me = c3((e3, t5, r3, n3) => {
    const s3 = `resolveFromPackageJsonPath:${e3}:${t5}:${r3}`;
    if (n3?.has(s3))
      return n3.get(s3) || false;
    const o5 = de(e3, n3);
    if (!o5)
      return;
    let a5 = t5 || re2;
    if (!r3 && o5.exports)
      try {
        const [i4] = Gt(o5.exports, t5, ["require", "types"]);
        a5 = i4;
      } catch {
        return n3?.set(s3, ""), false;
      }
    else
      !t5 && o5.tsconfig && (a5 = o5.tsconfig);
    return a5 = import_node_path4.default.join(e3, "..", a5), n3?.set(s3, a5), a5;
  }, "resolveFromPackageJsonPath");
  qt = c3((e3, t5, r3) => {
    const n3 = `resolveExtendsPath:${e3}:${t5}`;
    if (r3?.has(n3))
      return r3.get(n3) || undefined;
    const s3 = en(e3, t5, r3);
    return r3?.set(n3, s3 || ""), s3;
  }, "resolveExtendsPath");
  en = c3((e3, t5, r3) => {
    let n3 = e3;
    if (e3 === ".." && (n3 = import_node_path4.default.join(n3, re2)), e3[0] === "." && (n3 = import_node_path4.default.resolve(t5, n3)), import_node_path4.default.isAbsolute(n3)) {
      const d3 = _(r3, n3);
      if (d3) {
        if (d3.isFile())
          return n3;
      } else if (!n3.endsWith(".json")) {
        const g3 = `${n3}.json`;
        if (_(r3, g3))
          return g3;
      }
      return;
    }
    const [s3, ...o5] = e3.split("/"), a5 = s3[0] === "@" ? `${s3}/${o5.shift()}` : s3, i4 = o5.join("/"), m4 = Qe2();
    if (m4) {
      const { resolveRequest: d3 } = m4;
      try {
        if (a5 === e3) {
          const g3 = d3(import_node_path4.default.join(a5, N), t5);
          if (g3) {
            const T2 = me(g3, i4, false, r3);
            if (T2 && _(r3, T2))
              return T2;
          }
        } else {
          let g3;
          try {
            g3 = d3(e3, t5, { extensions: [".json"] });
          } catch {
            g3 = d3(import_node_path4.default.join(e3, re2), t5);
          }
          if (g3)
            return g3;
        }
      } catch {}
    }
    const u4 = Zt2(e3, a5, t5);
    let y;
    if (u4) {
      if (import_node_path4.default.basename(u4) !== N && u4.endsWith(".json"))
        return u4;
      y = import_node_path4.default.basename(u4) === N ? u4 : K(import_node_path4.default.dirname(u4), N, r3);
    }
    const f2 = y && import_node_path4.default.dirname(y) || K(import_node_path4.default.resolve(t5), import_node_path4.default.join("node_modules", a5), r3);
    if (!f2 || !_(r3, f2)?.isDirectory())
      return;
    const E3 = import_node_path4.default.join(f2, N);
    if (_(r3, E3)) {
      const d3 = me(E3, i4, false, r3);
      if (d3 === false)
        return;
      if (d3 && _(r3, d3)?.isFile())
        return d3;
    }
    const b2 = import_node_path4.default.join(f2, i4), k2 = b2.endsWith(".json");
    if (!k2) {
      const d3 = `${b2}.json`;
      if (_(r3, d3))
        return d3;
    }
    const v = _(r3, b2);
    if (v) {
      if (v.isDirectory()) {
        const d3 = import_node_path4.default.join(b2, N);
        if (_(r3, d3)) {
          const T2 = me(d3, "", true, r3);
          if (T2 && _(r3, T2))
            return T2;
        }
        const g3 = import_node_path4.default.join(b2, re2);
        if (_(r3, g3))
          return g3;
      } else if (k2)
        return b2;
    }
  }, "resolveExtendsPathUncached");
  he = Symbol("implicitBaseUrl");
  ge = /^\.{1,2}(\/.*)?$/;
  se = c3((e3) => {
    const t5 = A(e3);
    return ge.test(t5) ? t5 : `./${t5}`;
  }, "normalizeRelativePath");
  tn = c3((e3) => {
    const t5 = { ...e3 };
    if (t5.strict) {
      const r3 = ["noImplicitAny", "noImplicitThis", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization", "strictBuiltinIteratorReturn", "alwaysStrict", "useUnknownInCatchVariables"];
      for (const n3 of r3)
        t5[n3] === undefined && (t5[n3] = true);
    }
    if (t5.composite && (t5.declaration ??= true, t5.incremental ??= true), t5.target) {
      let r3 = t5.target.toLowerCase();
      r3 === "es2015" && (r3 = "es6"), t5.target = r3, r3 === "esnext" && (t5.module ??= "es6", t5.useDefineForClassFields ??= true), (r3 === "es6" || r3 === "es2016" || r3 === "es2017" || r3 === "es2018" || r3 === "es2019" || r3 === "es2020" || r3 === "es2021" || r3 === "es2022" || r3 === "es2023" || r3 === "es2024" || r3 === "es2025") && (t5.module ??= "es6"), (r3 === "es2022" || r3 === "es2023" || r3 === "es2024" || r3 === "es2025") && (t5.useDefineForClassFields ??= true);
    }
    if (t5.module) {
      let r3 = t5.module.toLowerCase();
      if (r3 === "es2015" && (r3 = "es6"), t5.module = r3, (r3 === "es6" || r3 === "es2020" || r3 === "es2022" || r3 === "esnext" || r3 === "none" || r3 === "system" || r3 === "umd" || r3 === "amd") && (t5.moduleResolution ??= "classic"), r3 === "system" && (t5.allowSyntheticDefaultImports ??= true), (r3 === "node16" || r3 === "node18" || r3 === "node20" || r3 === "nodenext" || r3 === "preserve") && (t5.esModuleInterop ??= true, t5.allowSyntheticDefaultImports ??= true), (r3 === "node16" || r3 === "node18" || r3 === "node20" || r3 === "nodenext") && (t5.moduleDetection ??= "force"), (r3 === "node16" || r3 === "node18") && (t5.target ??= "es2022", t5.moduleResolution ??= "node16"), r3 === "node20" && (t5.target ??= "es2023", t5.moduleResolution ??= "node16", t5.resolveJsonModule ??= true), r3 === "nodenext" && (t5.target ??= "esnext", t5.moduleResolution ??= "nodenext", t5.resolveJsonModule ??= true), r3 === "node16" || r3 === "node18" || r3 === "node20" || r3 === "nodenext") {
        const n3 = t5.target;
        (n3 === "es3" || n3 === "es2022" || n3 === "es2023" || n3 === "es2024" || n3 === "esnext") && (t5.useDefineForClassFields ??= true);
      }
      r3 === "preserve" && (t5.moduleResolution ??= "bundler");
    }
    if (t5.moduleResolution) {
      let r3 = t5.moduleResolution.toLowerCase();
      r3 === "node" && (r3 = "node10"), t5.moduleResolution = r3, (r3 === "node16" || r3 === "nodenext" || r3 === "bundler") && (t5.resolvePackageJsonExports ??= true, t5.resolvePackageJsonImports ??= true), r3 === "bundler" && (t5.allowSyntheticDefaultImports ??= true, t5.resolveJsonModule ??= true);
    }
    for (const r3 of ["jsx", "moduleDetection", "importsNotUsedAsValues", "newLine"])
      t5[r3] && (t5[r3] = t5[r3].toLowerCase());
    return t5.esModuleInterop && (t5.allowSyntheticDefaultImports ??= true), t5.verbatimModuleSyntax && (t5.isolatedModules ??= true, t5.preserveConstEnums ??= true), t5.isolatedModules && (t5.preserveConstEnums ??= true), t5.rewriteRelativeImportExtensions && (t5.allowImportingTsExtensions ??= true), t5.lib && (t5.lib = t5.lib.map((r3) => r3.toLowerCase())), t5.checkJs && (t5.allowJs ??= true), t5;
  }, "normalizeCompilerOptions");
  nn2 = c3((e3, t5) => {
    !t5.has("target") && !rn(e3.module) && (e3.target = "es3");
  }, "applyV4Defaults");
  rn = c3((e3) => e3 === "node16" || e3 === "node18" || e3 === "node20" || e3 === "nodenext", "moduleDictatesTarget$1");
  sn2 = c3((e3, t5) => {
    !t5.has("target") && !on2(e3.module) && (e3.target = "es5");
  }, "applyV5Defaults");
  on2 = c3((e3) => e3 === "node16" || e3 === "node18" || e3 === "node20" || e3 === "nodenext", "moduleDictatesTarget");
  an2 = c3((e3, t5) => {
    t5.has("strict") || (e3.strict = true), t5.has("target") || (e3.target = "es2025"), t5.has("module") || (e3.module = "es2022"), t5.has("moduleResolution") || (e3.moduleResolution = "bundler"), t5.has("rootDir") || (e3.rootDir = "."), t5.has("types") || (e3.types = []), t5.has("noUncheckedSideEffectImports") || (e3.noUncheckedSideEffectImports = true), t5.has("libReplacement") || (e3.libReplacement = false);
  }, "applyV6Defaults");
  cn2 = [[4, nn2], [5, sn2], [6, an2]];
  ln2 = c3((e3) => {
    const t5 = /^v?(\d+)/.exec(e3);
    return t5 ? Number(t5[1]) : undefined;
  }, "parseMajor");
  pn2 = c3((e3, t5) => {
    const r3 = ln2(t5);
    if (r3 === undefined)
      return;
    const n3 = new Set(Object.keys(e3));
    for (const [s3, o5] of cn2)
      s3 <= r3 && o5(e3, n3);
  }, "applyVersionDefaults");
  ye = c3((e3, t5) => se(import_node_path4.default.relative(e3, t5)), "pathRelative");
  Ge2 = ["files", "include", "exclude"];
  Ke2 = c3((e3, t5, r3) => {
    const n3 = import_node_path4.default.join(t5, r3), s3 = import_node_path4.default.relative(e3, n3);
    return A(s3) || "./";
  }, "resolveAndRelativize");
  un2 = c3((e3, t5, r3) => {
    const n3 = import_node_path4.default.relative(e3, t5);
    if (!n3)
      return r3;
    const s3 = r3.startsWith("./") ? r3.slice(2) : r3;
    return A(`${n3}/${s3}`);
  }, "prefixPattern");
  ze2 = ["outDir", "declarationDir"];
  oe2 = c3((e3, t5) => {
    if (e3.startsWith(U2))
      return A(import_node_path4.default.join(t5, e3.slice(U2.length)));
  }, "interpolateConfigDir");
  fn2 = ["outDir", "declarationDir", "outFile", "rootDir", "baseUrl", "tsBuildInfoFile"];
  dn2 = c3((e3, t5 = {}) => {
    if (e3.length === 0)
      throw new Error("Chain must not be empty");
    const { typescriptVersion: r3 } = t5, n3 = new Map(e3.map((f2) => [f2.path, f2])), s3 = new Map, o5 = c3((f2) => {
      const E3 = s3.get(f2);
      if (E3)
        return E3;
      const b2 = n3.get(f2);
      if (!b2)
        throw new Error(`Config not found in chain: ${f2}`);
      const k2 = b2.config, v = import_node_path4.default.dirname(f2);
      let d3 = { ...k2, ...k2.compilerOptions && { compilerOptions: { ...k2.compilerOptions } }, ...k2.watchOptions && { watchOptions: { ...k2.watchOptions } } };
      if (delete d3.extends, d3.compilerOptions?.paths && !d3.compilerOptions.baseUrl && (d3.compilerOptions[he] = v), k2.extends) {
        const g3 = Array.isArray(k2.extends) ? k2.extends : [k2.extends];
        for (const T2 of g3.toReversed()) {
          const l3 = o5(T2), C3 = import_node_path4.default.dirname(T2), { references: S, ...x } = l3;
          if (x.compilerOptions) {
            const D2 = { ...x.compilerOptions };
            for (const L3 of ["baseUrl", "outDir", "declarationDir", "rootDir"]) {
              const P = D2[L3];
              P && !P.startsWith(U2) && (D2[L3] = Ke2(v, C3, P));
            }
            for (const L3 of ["rootDirs", "typeRoots"]) {
              const P = D2[L3];
              P && (D2[L3] = P.map((W) => W.startsWith(U2) ? W : Ke2(v, C3, W)));
            }
            x.compilerOptions = D2;
          }
          for (const D2 of Ge2) {
            const L3 = x[D2];
            L3 && (x[D2] = L3.map((P) => P.startsWith(U2) ? P : un2(v, C3, P)));
          }
          const w = { ...x, ...d3, compilerOptions: { ...x.compilerOptions, ...d3.compilerOptions } };
          x.watchOptions && (w.watchOptions = { ...x.watchOptions, ...d3.watchOptions }), d3 = w;
        }
      }
      if (d3.compilerOptions) {
        const { compilerOptions: g3 } = d3, T2 = ["baseUrl", "rootDir"];
        for (const l3 of T2) {
          const C3 = g3[l3];
          if (C3 && !C3.startsWith(U2)) {
            const S = import_node_path4.default.resolve(v, C3), x = ye(v, S);
            g3[l3] = x;
          }
        }
        for (const l3 of ze2) {
          let C3 = g3[l3];
          C3 && (Array.isArray(d3.exclude) || (d3.exclude = ze2.map((S) => g3[S]).filter(Boolean)), C3.startsWith(U2) || (C3 = se(C3)), g3[l3] = C3);
        }
      } else
        d3.compilerOptions = {};
      if (d3.include && (d3.include = d3.include.map(A)), d3.files && (d3.files = d3.files.map((g3) => g3.startsWith(U2) ? g3 : se(g3))), d3.watchOptions) {
        const { watchOptions: g3 } = d3;
        for (const T2 of ["excludeDirectories", "excludeFiles"])
          g3[T2] && (g3[T2] = g3[T2].map((l3) => A(import_node_path4.default.resolve(v, l3))));
        for (const T2 of ["watchFile", "watchDirectory", "fallbackPolling"])
          if (g3[T2]) {
            const l3 = g3;
            l3[T2] = g3[T2].toLowerCase();
          }
      }
      return s3.set(f2, d3), d3;
    }, "resolveEntry"), a5 = e3[0], i4 = o5(a5.path), m4 = import_node_path4.default.dirname(a5.path), u4 = { ...i4, compilerOptions: i4.compilerOptions ? { ...i4.compilerOptions } : {} }, { compilerOptions: y } = u4;
    if (y) {
      for (const f2 of fn2) {
        const E3 = y[f2];
        if (E3) {
          const b2 = oe2(E3, m4);
          y[f2] = b2 ? ye(m4, b2) : E3;
        }
      }
      for (const f2 of ["rootDirs", "typeRoots"]) {
        const E3 = y[f2];
        E3 && (y[f2] = E3.map((b2) => {
          const k2 = oe2(b2, m4);
          return k2 ? ye(m4, k2) : se(b2);
        }));
      }
      if (y.paths) {
        const f2 = {};
        for (const [E3, b2] of Object.entries(y.paths))
          f2[E3] = b2.map((k2) => oe2(k2, m4) ?? k2);
        y.paths = f2;
      }
      r3 && pn2(y, r3), u4.compilerOptions = tn(y);
    }
    for (const f2 of Ge2) {
      const E3 = u4[f2];
      E3 && (u4[f2] = E3.map((b2) => oe2(b2, m4) ?? b2));
    }
    return { path: a5.path, config: u4, sources: e3.map((f2) => f2.path) };
  }, "resolveExtendsChain");
  mn2 = c3((e3, t5 = {}) => {
    const { cache: r3 = new Map } = t5, n3 = import_node_path4.default.resolve(e3), s3 = [], o5 = new Set, a5 = c3((i4, m4) => {
      const u4 = A(i4);
      if (o5.has(u4))
        return;
      o5.add(u4);
      let y;
      try {
        y = de(i4, r3) || {};
      } catch {
        throw new Error(`Cannot resolve tsconfig at path: ${i4}`);
      }
      if (typeof y != "object")
        throw new SyntaxError(`Failed to parse tsconfig at: ${i4}`);
      const f2 = import_node_path4.default.dirname(i4);
      if (y.extends) {
        const E3 = Array.isArray(y.extends), b2 = (E3 ? y.extends : [y.extends]).map((v) => {
          const d3 = qt(v, f2, r3);
          if (!d3)
            throw new Error(`File '${v}' not found.`);
          const g3 = A(d3);
          if (m4.has(g3) || g3 === u4)
            throw new Error(`Circularity detected while resolving configuration: ${g3}`);
          return g3;
        });
        y.extends = E3 ? b2 : b2[0], s3.push({ path: u4, config: y });
        const k2 = new Set(m4);
        k2.add(u4);
        for (const v of [...b2].reverse())
          a5(v, k2);
      } else
        s3.push({ path: u4, config: y });
    }, "collect");
    return a5(n3, new Set), s3;
  }, "getExtendsChain");
  ke = c3((e3, t5 = {}) => {
    const { cache: r3 = new Map, typescriptVersion: n3 = "auto" } = t5, s3 = mn2(e3, { cache: r3 });
    let o5;
    return n3 === "auto" ? o5 = Yt2(import_node_path4.default.dirname(s3[0].path), r3) : n3 !== false && (o5 = n3), dn2(s3, { typescriptVersion: o5 });
  }, "readTsconfig");
  hn2 = Object.defineProperty;
  ae2 = c3((e3, t5) => hn2(e3, "name", { value: t5, configurable: true }), "s");
  He2 = ae2((e3) => {
    let t5 = "";
    for (let r3 = 0;r3 < e3.length; r3 += 1) {
      const n3 = e3[r3], s3 = n3.toUpperCase();
      t5 += n3 === s3 ? n3.toLowerCase() : s3;
    }
    return t5;
  }, "invertCase");
  be = new Map;
  Xe2 = ae2((e3, t5) => {
    const r3 = import_path3.default.join(e3, `.is-fs-case-sensitive-test-${process.pid}`);
    try {
      return t5.writeFileSync(r3, ""), !t5.existsSync(He2(r3));
    } finally {
      try {
        t5.unlinkSync(r3);
      } catch {}
    }
  }, "checkDirectoryCaseWithWrite");
  gn2 = ae2((e3, t5, r3) => {
    try {
      return Xe2(e3, r3);
    } catch (n3) {
      if (t5 === undefined)
        return Xe2(import_os2.default.tmpdir(), r3);
      throw n3;
    }
  }, "checkDirectoryCaseWithFallback");
  yn2 = ae2((e3, t5 = import_fs2.default, r3 = true) => {
    const n3 = e3 ?? process.cwd();
    if (r3 && be.has(n3))
      return be.get(n3);
    let s3;
    const o5 = He2(n3);
    return o5 !== n3 && t5.existsSync(n3) ? s3 = !t5.existsSync(o5) : s3 = gn2(n3, e3, t5), r3 && be.set(n3, s3), s3;
  }, "isFsCaseSensitive");
  ({ join: Ye2 } = import_node_path4.default.posix);
  we = { ts: [".ts", ".tsx", ".d.ts"], cts: [".cts", ".d.cts"], mts: [".mts", ".d.mts"] };
  kn2 = c3((e3) => {
    const t5 = [...we.ts], r3 = [...we.cts], n3 = [...we.mts];
    return e3?.allowJs && (t5.push(".js", ".jsx"), r3.push(".cjs"), n3.push(".mjs")), [...t5, ...r3, ...n3];
  }, "getSupportedExtensions");
  bn2 = c3((e3) => {
    const t5 = [];
    if (!e3)
      return t5;
    const { outDir: r3, declarationDir: n3 } = e3;
    return r3 && t5.push(r3), n3 && t5.push(n3), t5;
  }, "getDefaultExcludeSpec");
  Ze2 = c3((e3) => e3.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), "escapeForRegexp");
  wn2 = ["node_modules", "bower_components", "jspm_packages"];
  xe2 = `(?!(${wn2.join("|")})(/|$))`;
  xn2 = /(?:^|\/)[^.*?]+$/;
  et2 = process.platform === "win32";
  En2 = c3(({ config: e3, path: t5 }, r3) => {
    if ("extends" in e3)
      throw new Error("tsconfig#extends must be resolved. Use getTsconfig or readTsconfig to resolve it.");
    if (!import_node_path4.default.isAbsolute(t5))
      throw new Error("The tsconfig path must be absolute");
    et2 && (t5 = A(t5));
    const n3 = import_node_path4.default.dirname(t5), { files: s3, include: o5, exclude: a5, compilerOptions: i4 } = e3, m4 = c3((v) => import_node_path4.default.isAbsolute(v) ? v : Ye2(n3, v), "resolvePattern"), u4 = s3 ? new Set(s3.map(m4)) : undefined, y = kn2(i4), f2 = r3 ? "" : "i", E3 = (a5 || bn2(i4)).map((v) => {
      const d3 = m4(v), g3 = Ze2(d3).replaceAll(String.raw`\*\*/`, "(.+/)?").replaceAll(String.raw`\*`, `${ie}*`).replaceAll(String.raw`\?`, ie);
      return new RegExp(`^${g3}($|/)`, f2);
    }), b2 = s3 || o5 ? o5 : [qe2], k2 = b2 ? b2.map((v) => {
      let d3 = m4(v);
      xn2.test(d3) && (d3 = Ye2(d3, qe2));
      const g3 = Ze2(d3).replaceAll(String.raw`/\*\*`, `(/${xe2}${Ee2}${ie}*)*?`).replaceAll(/(\/)?\\\*/g, (T2, l3) => {
        const C3 = String.raw`(${Ee2}|(\.(?!min\.js$))?)*`;
        return l3 ? `/${xe2}${Ee2}${C3}` : C3;
      }).replaceAll(/(\/)?\\\?/g, (T2, l3) => {
        const C3 = ie;
        return l3 ? `/${xe2}${C3}` : C3;
      });
      return new RegExp(`^${g3}$`, f2);
    }) : undefined;
    return { filesSet: u4, extensions: y, excludePatterns: E3, includePatterns: k2 };
  }, "compilePatterns");
  tt2 = new WeakMap;
  ve2 = c3((e3, t5) => {
    if (!import_node_path4.default.isAbsolute(t5))
      return false;
    et2 && (t5 = A(t5));
    let r3 = tt2.get(e3);
    r3 || (r3 = En2(e3, yn2()), tt2.set(e3, r3));
    const { filesSet: n3, extensions: s3, excludePatterns: o5, includePatterns: a5 } = r3;
    return n3?.has(t5) ? true : !s3.some((i4) => t5.endsWith(i4)) || o5.some((i4) => i4.test(t5)) ? false : !!(a5 && a5.some((i4) => i4.test(t5)));
  }, "isFileIncluded");
  nt2 = c3((e3, t5, r3, n3) => {
    const s3 = import_node_path4.default.resolve(e3);
    let o5 = A(e3);
    for (;; ) {
      const a5 = K(o5, t5, r3);
      if (!a5)
        return;
      const i4 = import_node_path4.default.resolve(a5), m4 = ke(i4, { cache: r3, typescriptVersion: n3 });
      if (ve2(m4, s3))
        return m4;
      const u4 = import_node_path4.default.dirname(a5), y = import_node_path4.default.dirname(u4);
      if (y === u4)
        return;
      o5 = y;
    }
  }, "findConfigApplicable");
  vn2 = c3((e3 = process.cwd(), t5 = {}) => {
    const { configName: r3 = "tsconfig.json", cache: n3 = new Map, includes: s3 = false } = t5;
    if (!s3) {
      const o5 = import_node_path4.default.resolve(e3);
      return import_node_path4.default.basename(o5) === r3 && _(n3, o5)?.isFile() ? A(o5) : K(A(e3), r3, n3);
    }
    return nt2(e3, r3, n3, false)?.path;
  }, "findTsconfig");
  Cn2 = c3((e3 = process.cwd(), t5 = {}) => {
    const { configName: r3 = "tsconfig.json", cache: n3 = new Map, includes: s3 = false, typescriptVersion: o5 = "auto" } = t5;
    if (!s3) {
      const a5 = vn2(e3, { configName: r3, cache: n3 });
      return a5 ? ke(a5, { cache: n3, typescriptVersion: o5 }) : undefined;
    }
    return nt2(e3, r3, n3, o5);
  }, "getTsconfig");
  jn2 = /\*/g;
  rt2 = c3((e3, t5) => {
    const r3 = e3.match(jn2);
    if (r3 && r3.length > 1)
      throw new Error(t5);
  }, "assertStarCount");
  Tn2 = c3((e3) => {
    if (e3.includes("*")) {
      const [t5, r3] = e3.split("*");
      return { prefix: t5, suffix: r3 };
    }
    return e3;
  }, "parsePattern");
  Sn2 = c3(({ prefix: e3, suffix: t5 }, r3) => r3.startsWith(e3) && r3.endsWith(t5), "isPatternMatch");
  On2 = c3((e3, t5, r3) => Object.entries(e3).map(([n3, s3]) => (rt2(n3, `Pattern '${n3}' can have at most one '*' character.`), { pattern: Tn2(n3), substitutions: s3.map((o5) => {
    if (rt2(o5, `Substitution '${o5}' in pattern '${n3}' can have at most one '*' character.`), !t5 && !ge.test(o5) && !import_node_path4.default.isAbsolute(o5))
      throw new Error("Non-relative paths are not allowed when 'baseUrl' is not set. Did you forget a leading './'?");
    return import_node_path4.default.resolve(r3, o5);
  }) })), "parsePaths");
  An2 = c3((e3) => {
    const { compilerOptions: t5 } = e3.config;
    if (!t5)
      return null;
    const { baseUrl: r3, paths: n3 } = t5;
    if (!r3 && !n3)
      return null;
    const s3 = he in t5 && t5[he], o5 = import_node_path4.default.resolve(import_node_path4.default.dirname(e3.path), r3 || s3 || "."), a5 = n3 ? On2(n3, r3, o5) : [], i4 = new Map, m4 = [];
    for (const u4 of a5)
      typeof u4.pattern == "string" ? i4.set(u4.pattern, u4.substitutions) : m4.push(u4);
    return { exactEntries: i4, patternEntries: m4, resolvedBaseUrl: o5, baseUrl: r3 };
  }, "compilePaths");
  st2 = new WeakMap;
  ot2 = c3((e3, t5) => {
    let r3 = st2.get(e3);
    if (r3 === undefined && (r3 = An2(e3), st2.set(e3, r3)), !r3)
      return [];
    if (ge.test(t5))
      return [];
    const { exactEntries: n3, patternEntries: s3, resolvedBaseUrl: o5, baseUrl: a5 } = r3, i4 = n3.get(t5);
    if (i4)
      return i4.map(A);
    let m4, u4 = -1;
    for (const f2 of s3)
      Sn2(f2.pattern, t5) && f2.pattern.prefix.length > u4 && (u4 = f2.pattern.prefix.length, m4 = f2);
    if (!m4)
      return a5 ? [A(import_node_path4.default.join(o5, t5))] : [];
    const y = t5.slice(m4.pattern.prefix.length, t5.length - m4.pattern.suffix.length);
    return m4.substitutions.map((f2) => A(f2.replace("*", y)));
  }, "resolvePathAlias");
  at2 = p4((e3) => {
    if (e3)
      return ke(e3);
    try {
      return Cn2() ?? undefined;
    } catch {}
  }, "loadTsconfig");
  it2 = p4(() => process.sourceMapsEnabled ?? true, "shouldApplySourceMap");
  Ce = p4(({ code: e3, map: t5 }) => e3 + $n2 + Buffer.from(JSON.stringify(t5), "utf8").toString("base64"), "inlineSourceMap");
  z2 = Symbol.for("tsx:global-cjs-loader-count");
  H = globalThis;
  Pn2 = p4(() => (H[z2] ?? 0) > 0, "isGlobalCjsLoaderActive");
  _n2 = p4(() => (H[z2] = (H[z2] ?? 0) + 1, () => {
    H[z2] = Math.max((H[z2] ?? 1) - 1, 0);
  }), "activateGlobalCjsLoader");
  je = p4((e3) => e3[0] === "." && (e3[1] === "/" || e3[1] === "." || e3[2] === "/"), "isRelativePath");
  V2 = p4((e3) => je(e3) || import_node_path4.default.isAbsolute(e3), "isFilePath");
  Dn2 = [".ts", ".tsx", ".jsx", ".mts", ".cts"];
  ct2 = /\.([cm]?ts|[tj]sx)(?:$|[?#])/;
  Ln2 = /\.(?:ts|tsx|jsx)(?:$|[?#])/;
  Rn2 = /\.json(?:$|[?#])/;
  ce2 = /\/(?:$|[?#])/;
  lt2 = `${import_node_path4.default.sep}node_modules${import_node_path4.default.sep}`;
  Te = p4((e3) => e3?.split(import_node_path4.default.sep).includes("node_modules") ?? false, "isDependencyPath");
  le2 = Number(process.env.TSX_DEBUG);
  le2 && (f.enabled = true, f.supportLevel = 3);
  pt2 = p4((e3) => (t5, ...r3) => {
    if (!le2 || t5 > le2)
      return;
    const n3 = `${E2(` tsx P${process.pid} `)} ${e3}`, s3 = r3.map((o5) => typeof o5 == "string" ? o5 : import_node_util.inspect(o5, { colors: true })).join(" ");
    import_node_fs2.writeSync(1, `${n3} ${s3}
`);
  }, "createLog");
  Q3 = pt2(T(b(" CJS ")));
  In2 = pt2(L2(" ESM "));
  R4 = new Map;
  Nn2 = p4(async (e3) => {
    if (R4.has(e3))
      return R4.get(e3);
    if (!await import_node_fs2.default.promises.access(e3).then(() => true, () => false)) {
      R4.set(e3, undefined);
      return;
    }
    const r3 = await import_node_fs2.default.promises.readFile(e3, "utf8");
    try {
      const n3 = JSON.parse(r3);
      return R4.set(e3, n3), n3;
    } catch {
      throw new Error(`Error parsing: ${e3}`);
    }
  }, "readPackageJson");
  Wn2 = p4((e3) => {
    if (R4.has(e3))
      return R4.get(e3);
    if (!import_node_fs2.default.existsSync(e3)) {
      R4.set(e3, undefined);
      return;
    }
    const t5 = import_node_fs2.default.readFileSync(e3, "utf8");
    try {
      const r3 = JSON.parse(t5);
      return R4.set(e3, r3), r3;
    } catch {
      throw new Error(`Error parsing: ${e3}`);
    }
  }, "readPackageJsonSync");
  Bn2 = p4(async (e3) => {
    let t5 = new URL("package.json", e3);
    for (;!t5.pathname.endsWith("/node_modules/package.json"); ) {
      const r3 = import_node_url2.fileURLToPath(t5), n3 = await Nn2(r3);
      if (n3)
        return n3;
      const s3 = t5;
      if (t5 = new URL("../package.json", t5), t5.pathname === s3.pathname)
        break;
    }
  }, "findPackageJson");
  ut2 = p4((e3) => {
    let t5 = new URL("package.json", e3);
    for (;!t5.pathname.endsWith("/node_modules/package.json"); ) {
      const r3 = import_node_url2.fileURLToPath(t5), n3 = Wn2(r3);
      if (n3)
        return n3;
      const s3 = t5;
      if (t5 = new URL("../package.json", t5), t5.pathname === s3.pathname)
        break;
    }
  }, "findPackageJsonSync");
  Mn2 = p4(async (e3) => (await Bn2(e3))?.type ?? "commonjs", "getPackageType");
  Jn2 = p4((e3) => ut2(e3)?.type ?? "commonjs", "getPackageTypeSync");
  Vn2 = p4((e3) => ut2(e3)?.type, "getNearestPackageTypeSync");
  ft2 = [".js", ".json"];
  dt2 = [".ts", ".tsx", ".jsx"];
  Qn2 = new Set([".json", ".node"]);
  Gn2 = [...dt2, ...ft2];
  Kn2 = [...ft2, ...dt2];
  Y3 = Object.create(null);
  Y3[".js"] = [".ts", ".tsx", ".js", ".jsx"], Y3[".jsx"] = [".tsx", ".ts", ".jsx", ".js"], Y3[".cjs"] = [".cts"], Y3[".mjs"] = [".mts"];
  zn2 = new Set([".ts", ".tsx", ".mts", ".cts"]);
  mt2 = p4((e3, t5 = false) => {
    const r3 = e3.indexOf("?"), n3 = r3 === -1 ? e3 : e3.slice(0, r3), s3 = r3 === -1 ? "" : e3.slice(r3);
    if (!t5 && !V2(n3) && !n3.startsWith(X))
      return;
    const o5 = import_node_path4.default.extname(n3);
    if (zn2.has(o5))
      return;
    const a5 = Y3[o5];
    if (a5) {
      const m4 = n3.slice(0, -o5.length);
      return a5.map((u4) => m4 + u4 + s3);
    }
    return Qn2.has(o5) ? undefined : (!(e3.startsWith(X) || V2(n3)) || n3.includes(lt2) || n3.includes("/node_modules/") ? Kn2 : Gn2).map((m4) => n3 + m4 + s3);
  }, "getExtensionResolution");
  Se2 = p4((e3) => Array.from(e3).length > 0 ? `?${e3.toString()}` : "", "urlSearchParamsStringify");
  Hn2 = [".cts", ".mts", ".ts", ".tsx", ".jsx"];
  Xn2 = [".js", ".cjs", ".mjs"];
  ht2 = [".ts", ".tsx", ".jsx"];
  yt2 = p4((e3) => {
    const t5 = import_node_path4.default.extname(e3);
    return t5 === ".mjs" || t5 === ".mts" || (t5 === ".js" || t5 === ".ts") && Vn2(import_node_url2.pathToFileURL(e3).toString()) !== "commonjs";
  }, "isRequireEsmCandidate");
  Oe2 = p4((e3, t5, r3, n3) => {
    const s3 = Object.getOwnPropertyDescriptor(e3, t5);
    s3?.set ? e3[t5] = r3 : (!s3 || s3.configurable) && Object.defineProperty(e3, t5, { value: r3, enumerable: s3?.enumerable || n3?.enumerable, writable: n3?.writable ?? (s3 ? s3.writable : true), configurable: n3?.configurable ?? (s3 ? s3.configurable : true) });
  }, "safeSet");
  Zn2 = p4((e3, t5, r3, n3) => {
    const s3 = t5[".js"], o5 = process.features.require_module ?? c(R), a5 = p4((i4, m4) => {
      if (e3.enabled === false)
        return s3(i4, m4);
      const [u4, y] = m4.split("?");
      if ((new URLSearchParams(y).get("namespace") ?? undefined) !== n3)
        return s3(i4, m4);
      Q3(2, "load", { filePath: m4 }), i4.id?.startsWith("data:text/javascript,") && (i4.path = import_node_path4.default.dirname(u4)), s2?.send && s2.send({ type: "dependency", path: u4 });
      const E3 = Hn2.some((l3) => u4.endsWith(l3)), b2 = Xn2.some((l3) => u4.endsWith(l3));
      if (!E3 && !b2)
        return s3(i4, u4);
      let k2 = import_node_fs2.default.readFileSync(u4, "utf8");
      const v = b2 && !u4.endsWith(".cjs") && !u4.endsWith(".cts") && cn(k2), d3 = (E3 || v) && r3 && ve2(r3, u4) ? r3.config : undefined;
      if (u4.endsWith(".cjs")) {
        const l3 = ce(m4, k2);
        l3 && (k2 = it2() ? Ce(l3) : l3.code);
      } else if (E3 || v)
        try {
          const l3 = Mr(k2, m4, { tsconfigRaw: d3 });
          k2 = it2() ? Ce(l3) : l3.code;
        } catch (l3) {
          throw yt2(u4) && l3 instanceof Error && l3.name === "TransformError" && l3.message.includes(Yn2) && Object.assign(l3, { code: o5 ? "ERR_REQUIRE_ASYNC_MODULE" : "ERR_REQUIRE_ESM" }), l3;
        }
      Q3(1, "loaded", { filePath: u4 }), i4._compile(k2, u4), y && import_node_module.default._cache[u4] === i4 && (import_node_module.default._cache[m4] = i4, delete import_node_module.default._cache[u4]);
      const { exports: g3 } = i4;
      (o5 && g3 && (typeof g3 == "object" || typeof g3 == "function") ? Object.getOwnPropertyDescriptor(g3, gt2) : undefined)?.get && yt2(u4) && (i4.exports = g3[gt2]);
    }, "transformer");
    Oe2(t5, ".js", a5);
    for (const i4 of ht2)
      Oe2(t5, i4, a5, { enumerable: !n3, writable: true, configurable: true });
    return Oe2(t5, ".mjs", a5, { writable: true, configurable: true }), () => {
      t5[".js"] === a5 && (t5[".js"] = s3);
      for (const i4 of [...ht2, ".mjs"])
        t5[i4] === a5 && delete t5[i4];
    };
  }, "createExtensions");
  qn2 = p4((e3) => (t5) => {
    if ((t5 === "." || t5 === ".." || t5.endsWith("/..")) && (t5 += "/"), ce2.test(t5)) {
      let r3 = import_node_path4.default.join(t5, "index");
      t5.startsWith("./") && (r3 = `./${r3}`);
      try {
        return e3(r3);
      } catch {}
    }
    try {
      return e3(t5);
    } catch (r3) {
      const n3 = r3;
      if (n3.code === "MODULE_NOT_FOUND")
        try {
          return e3(`${t5}${import_node_path4.default.sep}index`);
        } catch {}
      throw n3;
    }
  }, "createImplicitResolver");
  er2 = p4((e3, t5) => {
    let r3;
    return import_node_path4.default.isAbsolute(e3) ? r3 = e3 : je(e3) && t5 && (r3 = import_node_path4.default.resolve(t5, e3)), r3 !== undefined && !import_node_fs2.existsSync(r3);
  }, "candidateDoesntExist");
  pe = p4((e3, t5, r3, n3) => {
    if (Q3(3, "resolveTsFilename", { request: t5, isDirectory: ce2.test(t5) }), ce2.test(t5))
      return;
    const s3 = mt2(t5, n3);
    if (s3) {
      for (const o5 of s3)
        if (!er2(o5, r3))
          try {
            return e3(o5);
          } catch (a5) {
            const { code: i4 } = a5;
            if (i4 !== "MODULE_NOT_FOUND" && i4 !== "ERR_PACKAGE_PATH_NOT_EXPORTED")
              throw a5;
          }
    }
  }, "resolveTsFilename");
  tr2 = p4((e3, t5, r3, n3) => (s3) => {
    if (Q3(3, "resolveTsFilename", { request: s3, resolveTsExtensions: r3, isFilePath: V2(s3) }), r3 && V2(s3)) {
      const o5 = pe(e3, s3, t5, n3);
      if (o5)
        return o5;
    }
    try {
      return e3(s3);
    } catch (o5) {
      const a5 = o5;
      if (r3 && a5.code === "MODULE_NOT_FOUND") {
        if (a5.path) {
          const m4 = a5.message.match(/^Cannot find module '([^']+)'$/);
          if (m4) {
            const y = m4[1], f2 = pe(e3, y, t5, n3);
            if (f2)
              return f2;
          }
          const u4 = a5.message.match(/^Cannot find module '([^']+)'. Please verify that the package.json has a valid "main" entry$/);
          if (u4) {
            const y = u4[1], f2 = pe(e3, y, t5, n3);
            if (f2)
              return f2;
          }
        }
        const i4 = pe(e3, s3, t5, n3);
        if (i4)
          return i4;
      }
      throw a5;
    }
  }, "createTsExtensionResolver");
  nr2 = p4((e3) => {
    const t5 = e3.stack.split(`
`).slice(1);
    return t5[1].includes(kt2) || t5[2].includes(kt2);
  }, "isFromCjsLexer");
  rr2 = p4((e3, t5) => {
    const r3 = e3.split("?"), n3 = new URLSearchParams(r3[1]);
    if (t5?.filename) {
      const s3 = De(t5.filename);
      let o5;
      if (s3) {
        const m4 = s3.split("?"), u4 = m4[0];
        o5 = m4[1];
        const f2 = new URLSearchParams(o5).get("namespace");
        t5.filename = u4, t5.path = import_node_path4.default.dirname(u4), t5.paths = import_node_module.default._nodeModulePaths(t5.path), f2 || (import_node_module.default._cache[u4] = t5);
      }
      o5 || (o5 = t5.filename.split("?")[1]);
      const i4 = new URLSearchParams(o5).get("namespace");
      i4 && n3.append("namespace", i4);
    }
    return [r3[0], n3, (s3, o5) => (import_node_path4.default.isAbsolute(s3) && !s3.endsWith(".json") && !s3.endsWith(".node") && !(o5 === 0 && nr2(new Error)) && (s3 += Se2(n3)), s3)];
  }, "preserveQuery");
  sr2 = p4((e3, t5, r3, n3) => {
    if (e3.startsWith(X) && (e3 = import_node_url2.fileURLToPath(e3)), n3 && !V2(e3) && !Te(t5?.filename)) {
      const s3 = ot2(n3, e3);
      for (const o5 of s3)
        try {
          return r3(o5);
        } catch {}
    }
    return r3(e3);
  }, "resolveTsPaths");
  or2 = p4((e3, t5, r3, n3) => (s3, o5, ...a5) => {
    if (e3.enabled === false)
      return t5(s3, o5, ...a5);
    s3 = Le2(s3);
    const [i4, m4, u4] = rr2(s3, o5);
    if ((m4.get("namespace") ?? undefined) !== n3)
      return t5(s3, o5, ...a5);
    Q3(2, "resolve", { request: s3, parent: o5?.filename ?? o5, restOfArgs: a5 });
    let y = p4((v) => t5(v, o5, ...a5), "nextResolveSimple");
    const f2 = Te(o5?.filename), E3 = !!(n3 || o5?.filename && ct2.test(o5.filename)), b2 = !!(E3 || r3?.config.compilerOptions?.allowJs && !f2);
    y = tr2(y, o5?.path ?? undefined, b2, E3), y = qn2(y);
    const k2 = u4(sr2(i4, o5, y, r3), a5.length);
    return Q3(1, "resolved", { request: s3, parent: o5?.filename ?? o5, resolved: k2 }), k2;
  }, "createResolveFilename");
  bt2 = p4((e3, t5) => {
    if (!t5)
      throw new Error("The current file path (__filename or import.meta.url) must be provided in the second argument of tsx.require()");
    return e3.startsWith(".") ? ((typeof t5 == "string" && t5.startsWith(X) || t5 instanceof URL) && (t5 = import_node_url2.fileURLToPath(t5)), import_node_path4.default.resolve(import_node_path4.default.dirname(t5), e3)) : e3;
  }, "resolveContext");
  ar2 = p4((e3) => {
    const { sourceMapsEnabled: t5 } = process, r3 = { enabled: true }, n3 = at2(process.env.TSX_TSCONFIG_PATH);
    process.setSourceMapsEnabled(true);
    const s3 = import_node_module.default._resolveFilename, o5 = or2(r3, s3, n3, e3?.namespace);
    import_node_module.default._resolveFilename = o5;
    const a5 = Zn2(r3, import_node_module.default._extensions, n3, e3?.namespace), i4 = e3?.namespace ? undefined : _n2(), m4 = p4(() => {
      t5 === false && process.setSourceMapsEnabled(false), r3.enabled = false, import_node_module.default._resolveFilename === o5 && (import_node_module.default._resolveFilename = s3), a5(), i4?.();
    }, "unregister");
    if (e3?.namespace) {
      const u4 = p4((f2, E3) => {
        const b2 = bt2(f2, E3), [k2, v] = b2.split("?"), d3 = new URLSearchParams(v);
        return e3.namespace && !k2.startsWith("node:") && d3.set("namespace", e3.namespace), m(k2 + Se2(d3));
      }, "scopedRequire");
      m4.require = u4;
      const y = p4((f2, E3, b2) => {
        const k2 = bt2(f2, E3), [v, d3] = k2.split("?"), g3 = new URLSearchParams(d3);
        return e3.namespace && !v.startsWith("node:") && g3.set("namespace", e3.namespace), o5(v + Se2(g3), module_register_C9AniqUt, false, b2);
      }, "scopedResolve");
      m4.resolve = y, m4.unregister = m4;
    }
    return m4;
  }, "register");
});

// node_modules/tsx/dist/register-C4vWVmug.mjs
var import_node_crypto2, import_node_module2, import_node_worker_threads, import_node_url3, import_node_fs3, import_promises, import_node_path5, Xt3, c4 = (t5, r3) => Xt3(t5, "name", { value: r3, configurable: true }), ce3, wt3, me2, de2, le3, ue3, Rt = "tsx-namespace", I4, W = "tsx-commonjs-export-preparse", fe3, O2 = "tsx-commonjs-virtual-query", $2, pe2, T2, rt3, x, he2, ge2, ye2, w, It2, Tt2, Et2, Pe2, Se3, G3, E3, ve3, st3, jt2, Lt, Ue2, Ft, we2, Wt2, Ot, nt3, Re3, Ie3, Te2, Ee3, $t, je2, bt3, Ct3, D2, b2, X2, k2, ot3, Jt2, Nt2, Le3, C3, Mt2, _t, Fe3, At, z3, J3, We3, at3, it3, ct3, Oe3, $e2, V3 = "tsx://", mt3, K2, Bt2, qt2, be2, Ce2, Qt3, Ht2 = false, Je3, Ne3, xt, Me3, _e2, Gt2, Ae2, Be3, Dt, qe3;
var init_register_C4vWVmug = __esm(() => {
  init_node_features_JeyyvQz6();
  init_register_C9AniqUt();
  init_index_DQtFPMc2();
  init_client_D_mPDF5S();
  import_node_crypto2 = __toESM(require("node:crypto"));
  import_node_module2 = __toESM(require("node:module"));
  import_node_worker_threads = require("node:worker_threads");
  import_node_url3 = require("node:url");
  import_node_fs3 = require("node:fs");
  import_promises = require("node:fs/promises");
  import_node_path5 = __toESM(require("node:path"));
  Xt3 = Object.defineProperty;
  ce3 = c4(() => ({ active: true, parsedTsconfig: undefined }), "createDefaultData");
  wt3 = c4((t5) => {
    const r3 = { active: true, namespace: t5?.namespace, onImport: t5?.onImport, parsedTsconfig: undefined, port: t5?.port, tsconfig: t5?.tsconfig };
    return t5?.tsconfig !== false && (r3.parsedTsconfig = at2(t5?.tsconfig ?? process.env.TSX_TSCONFIG_PATH)), r3;
  }, "createData");
  me2 = c4((t5) => async (r3) => {
    if (!r3)
      throw new Error(`tsx must be loaded with --import instead of --loader
The --loader flag was deprecated in Node v20.6.0 and v18.19.0`);
    Object.assign(t5, wt3(r3)), r3.port && r3.port.on("message", (e3) => {
      e3 === "deactivate" && (t5.active = false, r3.port.postMessage({ type: "deactivated" }));
    });
  }, "createInitialize");
  de2 = c4((t5) => () => (t5.parsedTsconfig = at2(process.env.TSX_TSCONFIG_PATH), "process.setSourceMapsEnabled(true);"), "createGlobalPreload");
  le3 = c4((t5) => {
    const { pathname: r3 } = new URL(t5), e3 = import_node_path5.default.extname(r3);
    if (e3 === ".mts" || e3 === ".mjs")
      return "module";
    if (e3 === ".cts" || e3 === ".cjs")
      return "commonjs";
    if (e3 === ".js" || Dn2.includes(e3))
      return Mn2(t5);
  }, "getFormatFromFileUrl");
  ue3 = c4((t5) => {
    const { pathname: r3 } = new URL(t5), e3 = import_node_path5.default.extname(r3);
    if (e3 === ".mts" || e3 === ".mjs")
      return "module";
    if (e3 === ".cts" || e3 === ".cjs")
      return "commonjs";
    if (e3 === ".js" || Dn2.includes(e3))
      return Jn2(t5);
  }, "getFormatFromFileUrlSync");
  I4 = `${Rt}=`;
  fe3 = `${W}=1`;
  $2 = new Map;
  pe2 = /^data:/i;
  T2 = c4((t5) => pe2.test(t5), "isDataUrl");
  rt3 = c4((t5, r3) => t5.slice(1).split("&").filter((e3) => e3 && r3.every((s3) => !e3.startsWith(s3))).join("&"), "getQueryWithoutParameters");
  x = c4((t5, r3) => {
    const e3 = rt3(t5, r3);
    return e3 ? `?${e3}` : "";
  }, "getSearchWithoutParameters");
  he2 = c4((t5) => t5.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, ""), "stripComments");
  ge2 = c4((t5) => {
    const r3 = he2(t5);
    if (/^\s*export\s*\*/.test(r3))
      return "named";
    if (/^\s*import\s*\*\s*as\s+[\w$]+/.test(r3))
      return "namespace";
    const e3 = r3.match(/\{([^}]*)\}/)?.[1];
    if (e3)
      return e3.split(",").some((s3) => {
        const n3 = s3.trim().split(/\s+as\s+/)[0];
        return !!(n3 && n3 !== "default");
      }) ? "named" : undefined;
  }, "getCommonJsImportBinding");
  ye2 = c4((t5, r3, e3) => {
    const s3 = $2.get(t5);
    if (!s3)
      return false;
    try {
      const [n3] = ae(s3);
      return n3.some((o5) => {
        if (o5.d !== -1 || o5.n !== r3)
          return false;
        const a5 = ge2(s3.slice(o5.ss, o5.s));
        return a5 === "named" || e3 && a5 === "namespace";
      });
    } catch {
      return false;
    }
  }, "parentImportsCommonJsExports");
  w = c4((t5) => {
    const r3 = t5.indexOf("?"), e3 = t5.indexOf("#");
    if (T2(t5)) {
      if (e3 === -1)
        return;
      const s3 = t5.slice(e3 + 1), n3 = s3.lastIndexOf("&"), o5 = s3.slice(n3 + 1);
      return o5.startsWith(I4) ? o5.slice(I4.length) : undefined;
    }
    if (!(r3 === -1 || e3 !== -1 && e3 < r3))
      return new URLSearchParams(t5.slice(r3, e3 === -1 ? undefined : e3)).get(Rt) ?? undefined;
  }, "getNamespace");
  It2 = c(m2) ? "importAttributes" : "importAssertions";
  Tt2 = c4((t5) => t5 === "commonjs" || t5 === "commonjs-typescript", "isCommonJsFormat");
  Et2 = c4((t5) => t5 === "module-typescript" || t5 === "typescript", "isModuleTypeScriptFormat");
  Pe2 = c(p2);
  Se3 = [`${O2}=`];
  G3 = [`${W}=`, `${O2}=`];
  E3 = c4((t5, r3) => r3.parsedTsconfig && ve2(r3.parsedTsconfig, t5) ? r3.parsedTsconfig.config : undefined, "getTsconfigRaw");
  ve3 = c4((t5) => {
    if (!t5.searchParams.has(O2))
      return;
    const { pathname: r3 } = t5, e3 = r3.toLowerCase().lastIndexOf("%3f");
    if (e3 === -1)
      return;
    const s3 = new URL(t5);
    return s3.pathname = r3.slice(0, e3), s3.search = "", import_node_url3.fileURLToPath(s3);
  }, "getFilePathFromVirtualQuery");
  st3 = c4((t5) => {
    const r3 = t5.startsWith(X) ? new URL(t5) : undefined, e3 = r3 ? import_node_url3.fileURLToPath(r3) : t5, s3 = r3 && ve3(r3), n3 = s3 || e3, o5 = r3 && s3 ? import_node_url3.pathToFileURL(n3).toString() + x(r3.search, Se3) : t5;
    return { fileUrl: r3, filePath: n3, loadUrl: o5 };
  }, "getFileLoadContext");
  jt2 = c4((t5, r3) => {
    if (!r3?.search)
      return t5;
    const e3 = x(r3.search, G3);
    return e3 ? import_node_url3.pathToFileURL(t5).toString() + e3 : t5;
  }, "getTransformPath");
  Lt = c4((t5, r3, e3) => {
    const s3 = [...r3 ? rt3(r3.search, [I4, ...G3]).split("&").filter(Boolean) : [], ...e3 ? [`namespace=${encodeURIComponent(e3)}`] : []].join("&");
    return s3 ? `${t5}?${s3}` : t5;
  }, "getFilePathWithQuery");
  Ue2 = new TextDecoder;
  Ft = c4((t5) => typeof t5 == "string" ? t5 : Ue2.decode(t5), "decodeSource");
  we2 = c4((t5, r3) => {
    const e3 = new URL(r3), s3 = r3.startsWith(X) ? st3(r3).filePath : undefined;
    if (T2(r3)) {
      if (t5.namespace) {
        const o5 = `${I4}${t5.namespace}`;
        e3.hash === `#${o5}` ? e3.hash = "" : e3.hash.endsWith(`&${o5}`) && (e3.hash = e3.hash.slice(0, -o5.length - 1));
      }
    } else
      e3.searchParams.delete("tsx-namespace"), e3.searchParams.delete(W), e3.searchParams.delete(O2);
    s3 && (e3.pathname = new URL(import_node_url3.pathToFileURL(s3)).pathname);
    const n3 = e3.toString();
    return t5.port && t5.port.postMessage({ type: "load", url: n3 }), t5.onImport?.(n3), n3;
  }, "notifyLoad");
  Wt2 = c4((t5, r3) => {
    if (!t5.active)
      return false;
    const e3 = w(r3);
    if (t5.namespace !== e3)
      return false;
    const s3 = we2(t5, r3);
    return s2.send && s2.send({ type: "dependency", path: s3 }), true;
  }, "prepareLoad");
  Ot = c4((t5, r3) => {
    if (!Rn2.test(t5))
      return r3;
    const e3 = r3[It2];
    return e3?.type ? r3 : { ...r3, [It2]: { ...e3, type: "json" } };
  }, "prepareJsonAttributes");
  nt3 = c4(({ conditions: t5 }) => t5?.includes("require") === true && !t5.includes("import"), "isCommonJsRequireContext$1");
  Re3 = c4((t5) => {
    const r3 = c4(async (e3, s3, n3) => {
      if (!Wt2(t5, e3))
        return n3(e3, s3);
      const o5 = w(e3), { fileUrl: a5, filePath: i4, loadUrl: l3 } = st3(e3), f2 = Ot(l3, s3), m4 = await n3(l3, f2);
      In2(3, "loaded by next loader", { url: e3, loadUrl: l3, loaded: m4 });
      const d3 = a5?.searchParams.has(W) === true, p5 = m4.format, h2 = a5 ? new URL(import_node_url3.pathToFileURL(i4)) : undefined;
      if (h2 && a5 && (h2.search = x(a5.search, G3)), Tt2(p5) && a5 && m4.responseURL?.startsWith("file:") && !i4.endsWith(".cjs")) {
        const g3 = await import_promises.readFile(import_node_url3.pathToFileURL(i4), "utf8"), M2 = cn(g3);
        if (p5 === "commonjs-typescript" || !i4.endsWith(".js") || M2) {
          if (!Pe2) {
            if (d3 && M2 && Ln2.test(i4)) {
              const _2 = await $r(g3, i4, { define: { "import.meta.url": JSON.stringify(h2.toString()) }, tsconfigRaw: E3(i4, t5) });
              return $2.set(e3, _2.code), { format: "module", source: Ce(_2) };
            }
            return m4;
          }
          if (!o5 && !d3 && !i4.endsWith(".cts"))
            return m4;
          const dt3 = !!(o5 || d3 || x(a5.search, G3)), lt3 = Mr(g3, jt2(i4, a5), { cjsBanner: dt3 ? `require = require("node:module").createRequire(${JSON.stringify(import_node_url3.pathToFileURL(i4).toString())});` : undefined, tsconfigRaw: E3(i4, t5) });
          if (m4.format = "commonjs", m4.source = Ce(lt3), dt3) {
            const _2 = Lt(i4, a5, o5);
            m4.responseURL = `data:text/javascript,${encodeURIComponent(lt3.code)}?filePath=${encodeURIComponent(_2)}`;
          }
          return In2(3, "returning CJS export annotation", m4), m4;
        }
      }
      if (!m4.source)
        return m4;
      const y = Ft(m4.source), N2 = p5 === "json" && !nt3(s3);
      if (p5 === "commonjs-typescript") {
        const g3 = Mr(y, i4, { tsconfigRaw: E3(i4, t5) });
        return { ...m4, format: "commonjs", source: Ce(g3) };
      }
      if (N2 || Et2(p5) || ct2.test(e3)) {
        const g3 = await $r(y, i4, { tsconfigRaw: E3(i4, t5) });
        return $2.set(e3, g3.code), { format: "module", source: Ce(g3) };
      }
      if (m4.format === "module") {
        const g3 = ce(i4, y);
        g3 ? (m4.source = Ce(g3), $2.set(e3, g3.code)) : $2.set(e3, y);
      }
      return m4;
    }, "load");
    return le2 ? async (e3, s3, n3) => {
      In2(2, "load", { url: e3, context: s3 });
      const o5 = await r3(e3, s3, n3);
      return In2(1, "loaded", { url: e3, result: o5 }), o5;
    } : r3;
  }, "createLoad");
  Ie3 = c4((t5) => {
    const r3 = c4((e3, s3, n3) => {
      if (nt3(s3) && Pn2() || !Wt2(t5, e3))
        return n3(e3, s3);
      const o5 = w(e3), { fileUrl: a5, filePath: i4, loadUrl: l3 } = st3(e3), f2 = Ot(l3, s3), m4 = n3(l3, f2);
      In2(3, "loaded by next loader", { url: e3, loadUrl: l3, loaded: m4 });
      const d3 = m4.format;
      if (Tt2(d3) && c(p2) && m4.responseURL?.startsWith("file:") && !i4.endsWith(".cjs")) {
        const y = import_node_fs3.readFileSync(import_node_url3.pathToFileURL(i4), "utf8");
        if (d3 === "commonjs-typescript" || !i4.endsWith(".js") || cn(y)) {
          const N2 = Mr(y, jt2(i4, a5), { tsconfigRaw: E3(i4, t5) }), g3 = !o5 && Pn2(), M2 = Lt(i4, a5, o5);
          return m4.format = "commonjs", m4.shouldBeReloadedByCJSLoader = g3, m4.source = Ce(N2), g3 || (m4.responseURL = `data:text/javascript,${encodeURIComponent(N2.code)}?filePath=${encodeURIComponent(M2)}`), In2(3, "returning CJS export annotation", m4), m4;
        }
      }
      if (!m4.source)
        return m4;
      const p5 = Ft(m4.source), h2 = d3 === "json" && !nt3(s3);
      if (d3 === "commonjs-typescript") {
        const y = Mr(p5, i4, { tsconfigRaw: E3(i4, t5) });
        return { ...m4, format: "commonjs", shouldBeReloadedByCJSLoader: false, source: Ce(y) };
      }
      if (h2 || Et2(d3) || ct2.test(e3)) {
        const y = Dr(p5, i4, { tsconfigRaw: E3(i4, t5) });
        return { format: "module", source: Ce(y) };
      }
      if (m4.format === "module") {
        const y = ce(i4, p5);
        y && (m4.source = Ce(y));
      }
      return m4;
    }, "load");
    return le2 ? (e3, s3, n3) => {
      In2(2, "loadSync", { url: e3, context: s3 });
      const o5 = r3(e3, s3, n3);
      return In2(1, "loadedSync", { url: e3, result: o5 }), o5;
    } : r3;
  }, "createLoadSync");
  Te2 = c4((t5) => {
    if (V2(t5) || t5.startsWith("#") || t5.includes(":"))
      return false;
    const r3 = t5.split("/"), e3 = r3[0]?.startsWith("@") ? 2 : 1;
    return r3.length > e3 && r3.slice(0, e3).every(Boolean);
  }, "isBarePackageSubpath");
  Ee3 = c4((t5) => {
    const r3 = t5.lastIndexOf(lt2);
    if (r3 === -1)
      return;
    const s3 = t5.slice(r3 + lt2.length).split(import_node_path5.default.sep), n3 = s3[0]?.startsWith("@") ? 2 : 1;
    if (!(s3.length <= n3 || !s3[n3 - 1]))
      return import_node_path5.default.join(t5.slice(0, r3), "node_modules", ...s3.slice(0, n3));
  }, "getPackageDirectory");
  $t = c4((t5, r3) => {
    if (!Te2(t5) || !r3.startsWith(X))
      return;
    const e3 = import_node_url3.fileURLToPath(r3), s3 = Ee3(e3);
    if (!s3)
      return;
    const o5 = Ke(import_node_path5.default.join(s3, "package.json"))?.exports;
    if (o5 != null)
      return { kind: "root-exports" };
    const a5 = Ke(import_node_path5.default.join(e3, "package.json"));
    return typeof a5?.main != "string" || !a5.main ? { kind: "legacy-directory" } : { kind: "legacy-directory", mainUrl: import_node_url3.pathToFileURL(import_node_path5.default.resolve(e3, a5.main)).toString() };
  }, "getPackageSubpathDirectoryInfo");
  je2 = c(p2);
  bt3 = /^(?:[a-z][\d+.a-z-]*:\/\/|data:|file:|node:)/i;
  Ct3 = c4((t5) => !V2(t5) && !bt3.test(t5), "isTsconfigPathAliasSpecifier");
  D2 = c4((t5) => {
    if (t5.url)
      return t5.url;
    const r3 = t5.message.match(/^Cannot find module '([^']+)'/);
    if (r3) {
      const [, s3] = r3;
      return s3;
    }
    const e3 = t5.message.match(/^Cannot find package '([^']+)'/);
    if (e3) {
      const [, s3] = e3;
      if (!import_node_path5.default.isAbsolute(s3))
        return;
      const n3 = import_node_url3.pathToFileURL(s3);
      if (n3.pathname.endsWith("/") && (n3.pathname += "package.json"), n3.pathname.endsWith("/package.json")) {
        const o5 = Ke(n3);
        if (o5?.main)
          return new URL(o5.main, n3).toString();
      } else
        return n3.toString();
    }
  }, "getMissingPathFromNotFound");
  b2 = c4((t5) => t5 === "ERR_MODULE_NOT_FOUND" || t5 === "MODULE_NOT_FOUND", "isModuleNotFound");
  X2 = c4((t5) => t5 instanceof Error && (b2(t5.code) || t5.code === "ERR_UNSUPPORTED_DIR_IMPORT"), "isDirectoryEntryMiss");
  k2 = c4((t5) => t5.conditions.includes("require") && !t5.conditions.includes("import"), "isCommonJsRequireContext");
  ot3 = c4((t5) => {
    const r3 = t5.indexOf("?"), e3 = t5.indexOf("#");
    return r3 === -1 ? e3 : e3 === -1 ? r3 : Math.min(r3, e3);
  }, "getUrlMetadataIndex");
  Jt2 = c4((t5, r3) => r3 || !V2(t5) && !bt3.test(t5) ? t5.indexOf("?") : ot3(t5), "getSpecifierMetadataIndex");
  Nt2 = c4((t5) => {
    if (t5?.startsWith(X))
      return import_node_url3.fileURLToPath(new URL(t5));
  }, "getParentFilePath");
  Le3 = c4((t5) => {
    if (!t5)
      return false;
    const r3 = Nt2(t5);
    if (r3)
      return ct2.test(r3);
    const e3 = ot3(t5);
    return ct2.test(e3 === -1 ? t5 : t5.slice(0, e3));
  }, "isTypeScriptParent");
  C3 = c4((t5) => {
    const r3 = Nt2(t5);
    return r3 !== undefined && Te(r3);
  }, "isParentDependency");
  Mt2 = c4((t5) => import_node_path5.default.extname(new URL(t5).pathname) === ".js" && Te(import_node_url3.fileURLToPath(t5)), "isImplicitJavaScriptDependency");
  _t = c4((t5, r3) => Le3(t5) || r3 && !C3(t5), "resolvesTsExtensions");
  Fe3 = c4((t5, r3) => {
    const e3 = ot3(t5), s3 = e3 === -1 ? t5 : t5.slice(0, e3);
    try {
      if (s3.startsWith(X))
        return import_node_url3.fileURLToPath(s3);
      if (import_node_path5.default.isAbsolute(s3))
        return s3;
      if (je(s3) && r3?.startsWith(X))
        return import_node_url3.fileURLToPath(new URL(s3, r3));
    } catch {}
  }, "getProbeFilePath");
  At = c4((t5, r3) => {
    const e3 = Fe3(t5, r3);
    return e3 !== undefined && !import_node_fs3.existsSync(e3);
  }, "candidateDoesntExist");
  z3 = c4(async (t5, r3, e3, s3) => {
    const n3 = mt2(t5);
    if (In2(3, "resolveExtensions", { url: t5, context: r3, throwError: s3, tryPaths: n3 }), !n3)
      return;
    let o5;
    for (const a5 of n3)
      if (!At(a5, r3.parentURL))
        try {
          return await e3(a5, r3);
        } catch (i4) {
          const { code: l3 } = i4;
          if (!b2(l3) && l3 !== "ERR_PACKAGE_PATH_NOT_EXPORTED")
            throw i4;
          o5 = i4;
        }
    if (s3) {
      if (o5 === undefined)
        return e3(n3[0], r3);
      throw o5;
    }
  }, "resolveExtensions");
  J3 = c4((t5, r3, e3, s3) => {
    const n3 = mt2(t5);
    if (In2(3, "resolveExtensionsSync", { url: t5, context: r3, throwError: s3, tryPaths: n3 }), !n3)
      return;
    let o5;
    for (const a5 of n3)
      if (!At(a5, r3.parentURL))
        try {
          return e3(a5, r3);
        } catch (i4) {
          const { code: l3 } = i4;
          if (!b2(l3) && l3 !== "ERR_PACKAGE_PATH_NOT_EXPORTED")
            throw i4;
          o5 = i4;
        }
    if (s3) {
      if (o5 === undefined)
        return e3(n3[0], r3);
      throw o5;
    }
  }, "resolveExtensionsSync");
  We3 = c4(async (t5, r3, e3, s3) => {
    const n3 = s3.parsedTsconfig?.config.compilerOptions?.allowJs ?? false, o5 = _t(r3.parentURL, n3);
    if (In2(3, "resolveBase", { specifier: t5, context: r3, specifierStartsWithFileUrl: t5.startsWith(X), isRelativePath: je(t5), resolveTsExtensions: o5, allowJs: n3 }), (t5.startsWith(X) || je(t5)) && o5) {
      const a5 = await z3(t5, r3, e3, undefined);
      if (In2(3, "resolveBase resolved", { specifier: t5, context: r3, resolved: a5 }), a5)
        return a5;
    }
    try {
      return await e3(t5, r3);
    } catch (a5) {
      if (In2(3, "resolveBase error", { specifier: t5, context: r3, error: a5 }), a5 instanceof Error) {
        const i4 = a5;
        if (b2(i4.code)) {
          const l3 = D2(i4);
          if (l3) {
            const f2 = await z3(l3, r3, e3, undefined);
            if (f2)
              return f2;
          }
        }
      }
      throw a5;
    }
  }, "resolveBase");
  at3 = c4((t5, r3, e3, s3) => {
    const n3 = s3.parsedTsconfig?.config.compilerOptions?.allowJs ?? false, o5 = _t(r3.parentURL, n3);
    if (In2(3, "resolveBaseSync", { specifier: t5, context: r3, specifierStartsWithFileUrl: t5.startsWith(X), isRelativePath: je(t5), resolveTsExtensions: o5, allowJs: n3 }), (t5.startsWith(X) || je(t5)) && o5) {
      const a5 = J3(t5, r3, e3, undefined);
      if (In2(3, "resolveBaseSync resolved", { specifier: t5, context: r3, resolved: a5 }), a5)
        return a5;
    }
    try {
      return e3(t5, r3);
    } catch (a5) {
      if (In2(3, "resolveBaseSync error", { specifier: t5, context: r3, error: a5 }), a5 instanceof Error) {
        const i4 = a5;
        if (b2(i4.code)) {
          const l3 = D2(i4);
          if (l3) {
            const f2 = J3(l3, r3, e3, undefined);
            if (f2)
              return f2;
          }
        }
      }
      throw a5;
    }
  }, "resolveBaseSync");
  it3 = c4(async (t5, r3, e3, s3) => {
    if (In2(3, "resolveDirectory", { specifier: t5, context: r3, isDirectory: ce2.test(t5) }), (t5 === "." || t5 === ".." || t5.endsWith("/..")) && (t5 += "/"), ce2.test(t5)) {
      const n3 = new URL(t5, r3.parentURL);
      return n3.pathname = import_node_path5.default.join(n3.pathname, "index"), await z3(n3.toString(), r3, e3, true);
    }
    try {
      return await We3(t5, r3, e3, s3);
    } catch (n3) {
      if (n3 instanceof Error) {
        In2(3, "resolveDirectory error", { specifier: t5, context: r3, error: n3 });
        const o5 = n3;
        if (o5.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
          const a5 = D2(o5);
          if (a5) {
            if (t5.startsWith("#"))
              throw n3;
            const i4 = $t(t5, a5);
            if (i4?.kind === "root-exports")
              throw n3;
            if (i4?.mainUrl) {
              try {
                return await e3(i4.mainUrl, r3);
              } catch (m4) {
                if (!X2(m4))
                  throw m4;
              }
              try {
                return await it3(i4.mainUrl, r3, e3, s3);
              } catch (m4) {
                if (!X2(m4))
                  throw m4;
              }
            }
            const l3 = `${a5}/index`, f2 = await z3(l3, r3, e3);
            if (f2)
              return f2;
          }
        }
      }
      throw n3;
    }
  }, "resolveDirectory");
  ct3 = c4((t5, r3, e3, s3) => {
    if (In2(3, "resolveDirectorySync", { specifier: t5, context: r3, isDirectory: ce2.test(t5) }), (t5 === "." || t5 === ".." || t5.endsWith("/..")) && (t5 += "/"), ce2.test(t5)) {
      const n3 = k2(r3);
      if (n3 && !V2(t5))
        return at3(t5, r3, e3, s3);
      const o5 = new URL(t5, r3.parentURL);
      return o5.pathname = import_node_path5.default.join(o5.pathname, "index"), n3 ? J3(import_node_url3.fileURLToPath(o5), r3, e3, false) ?? at3(t5, r3, e3, s3) : J3(o5.toString(), r3, e3, true);
    }
    try {
      return at3(t5, r3, e3, s3);
    } catch (n3) {
      if (n3 instanceof Error) {
        In2(3, "resolveDirectorySync error", { specifier: t5, context: r3, error: n3 });
        const o5 = n3;
        if (o5.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
          const a5 = D2(o5);
          if (a5) {
            if (t5.startsWith("#"))
              throw n3;
            const i4 = $t(t5, a5);
            if (i4?.kind === "root-exports")
              throw n3;
            if (i4?.mainUrl) {
              try {
                return e3(i4.mainUrl, r3);
              } catch (m4) {
                if (!X2(m4))
                  throw m4;
              }
              try {
                return ct3(i4.mainUrl, r3, e3, s3);
              } catch (m4) {
                if (!X2(m4))
                  throw m4;
              }
            }
            const l3 = `${a5}/index`, f2 = J3(l3, r3, e3);
            if (f2)
              return f2;
          }
        }
      }
      throw n3;
    }
  }, "resolveDirectorySync");
  Oe3 = c4(async (t5, r3, e3, s3) => {
    const n3 = Ct3(t5);
    if (In2(3, "resolveTsPaths", { specifier: t5, context: r3, tsconfigPathAliasSpecifier: n3, tsconfig: s3.parsedTsconfig, fromNodeModules: C3(r3.parentURL) }), n3 && s3.parsedTsconfig && !C3(r3.parentURL)) {
      const o5 = ot2(s3.parsedTsconfig, t5);
      In2(3, "resolveTsPaths", { possiblePaths: o5 });
      for (const a5 of o5)
        try {
          return await it3(import_node_url3.pathToFileURL(a5).toString(), r3, e3, s3);
        } catch {}
    }
    return it3(t5, r3, e3, s3);
  }, "resolveTsPaths");
  $e2 = c4((t5, r3, e3, s3) => {
    const n3 = Ct3(t5);
    if (In2(3, "resolveTsPathsSync", { specifier: t5, context: r3, tsconfigPathAliasSpecifier: n3, tsconfig: s3.parsedTsconfig, fromNodeModules: C3(r3.parentURL) }), n3 && s3.parsedTsconfig && !C3(r3.parentURL)) {
      const o5 = ot2(s3.parsedTsconfig, t5);
      In2(3, "resolveTsPathsSync", { possiblePaths: o5 });
      for (const a5 of o5)
        try {
          return ct3(import_node_url3.pathToFileURL(a5).toString(), r3, e3, s3);
        } catch {}
    }
    return ct3(t5, r3, e3, s3);
  }, "resolveTsPathsSync");
  mt3 = c4((t5, r3) => {
    const e3 = t5.indexOf("#"), s3 = e3 === -1 ? t5 : t5.slice(0, e3), n3 = e3 === -1 ? "" : t5.slice(e3);
    return `${s3}${s3.includes("?") ? "&" : "?"}${r3}${n3}`;
  }, "addQuery");
  K2 = c4((t5, r3) => T2(t5) ? `${t5}${t5.includes("#") ? "&" : "#"}${I4}${r3}` : mt3(t5, `${I4}${r3}`), "addNamespace");
  Bt2 = c4((t5, r3) => {
    const e3 = r3.indexOf("#"), s3 = r3[0] === "?" ? r3.slice(1, e3 === -1 ? undefined : e3) : "", n3 = e3 === -1 ? "" : r3.slice(e3), o5 = t5.indexOf("#"), a5 = o5 === -1 ? t5 : t5.slice(0, o5), i4 = o5 === -1 ? "" : t5.slice(o5), l3 = s3 ? mt3(a5, s3) : a5;
    return new URL(`${l3}${n3 || i4}`).toString();
  }, "mergeUrlMetadata");
  qt2 = c4((t5, r3, e3) => {
    if (r3 !== "commonjs" || !t5.startsWith(X) || !Ln2.test(t5))
      return t5;
    const s3 = new URL(t5), n3 = [rt3(s3.search, [I4]), ...e3 ? [`namespace=${encodeURIComponent(e3)}`] : []].filter(Boolean).join("&");
    return n3 ? (s3.pathname += `%3F${n3}`, s3.searchParams.set(O2, "1"), s3.toString()) : t5;
  }, "preserveCommonJsQueryIdentity");
  be2 = c4((t5) => {
    const r3 = c4(async (e3, s3, n3) => {
      if (!t5.active || e3.startsWith("node:"))
        return n3(e3, s3);
      const o5 = s3.parentURL && w(s3.parentURL);
      let a5 = T2(e3) ? o5 : w(e3) ?? o5;
      if (t5.namespace) {
        let h2;
        if (e3.startsWith(V3)) {
          try {
            h2 = JSON.parse(e3.slice(V3.length));
          } catch {}
          h2?.namespace && (a5 = h2.namespace);
        }
        if (t5.namespace !== a5)
          return n3(e3, s3);
        h2 && (e3 = h2.specifier, s3.parentURL = h2.parentURL);
      }
      if (T2(e3)) {
        const h2 = await n3(e3, s3);
        return t5.namespace ? { ...h2, url: K2(h2.url, t5.namespace) } : h2;
      }
      const i4 = Jt2(e3, k2(s3)), l3 = i4 === -1 ? e3 : e3.slice(0, i4), f2 = i4 === -1 ? "" : e3.slice(i4), m4 = await Oe3(l3, s3, n3, t5);
      if (In2(2, "nextResolve", { resolved: m4 }), m4.format === "builtin")
        return m4;
      const d3 = { ...m4 };
      d3.url.startsWith(X) && (d3.format === "module-typescript" ? d3.format = "module" : d3.format === "commonjs-typescript" ? d3.format = "commonjs" : !d3.format && !Mt2(d3.url) && (d3.format = await le3(d3.url), In2(2, "getFormatFromFileUrl", { resolved: d3, format: d3.format }))), f2 && (d3.url = Bt2(d3.url, f2));
      const p5 = s3.parentURL && d3.format === "commonjs" && Ln2.test(d3.url) && (new URL(s3.parentURL).searchParams.has(W) || ye2(s3.parentURL, e3, je2));
      return a5 && w(d3.url) === undefined && (d3.url = K2(d3.url, a5)), p5 && (d3.url = mt3(d3.url, fe3)), (a5 || p5) && (d3.url = qt2(d3.url, d3.format, a5)), d3;
    }, "resolve");
    return le2 ? async (e3, s3, n3) => {
      In2(2, "resolve", { specifier: e3, context: s3 });
      const o5 = await r3(e3, s3, n3);
      return In2(1, "resolved", { specifier: e3, context: s3, result: o5 }), o5;
    } : r3;
  }, "createResolve");
  Ce2 = c4((t5) => {
    const r3 = c4((e3, s3, n3) => {
      if (!t5.active || e3.startsWith("node:") || k2(s3) && Pn2())
        return n3(e3, s3);
      const o5 = s3.parentURL && w(s3.parentURL);
      let a5 = T2(e3) ? o5 : w(e3) ?? o5;
      if (t5.namespace) {
        let p5;
        if (e3.startsWith(V3)) {
          try {
            p5 = JSON.parse(e3.slice(V3.length));
          } catch {}
          p5?.namespace && (a5 = p5.namespace);
        }
        if (t5.namespace !== a5)
          return n3(e3, s3);
        p5 && (e3 = p5.specifier, s3.parentURL = p5.parentURL);
      }
      if (T2(e3)) {
        const p5 = n3(e3, s3);
        return t5.namespace ? { ...p5, url: K2(p5.url, t5.namespace) } : p5;
      }
      const i4 = Jt2(e3, k2(s3)), l3 = i4 === -1 ? e3 : e3.slice(0, i4), f2 = i4 === -1 ? "" : e3.slice(i4), m4 = $e2(l3, s3, n3, t5);
      if (In2(2, "nextResolve", { resolved: m4 }), m4.format === "builtin")
        return m4;
      const d3 = { ...m4 };
      return d3.url.startsWith(X) && (d3.format === "module-typescript" ? d3.format = "module" : d3.format === "commonjs-typescript" ? d3.format = "commonjs" : !d3.format && !Mt2(d3.url) && (d3.format = ue3(d3.url), In2(2, "getFormatFromFileUrlSync", { resolved: d3, format: d3.format }))), f2 && (d3.url = Bt2(d3.url, f2)), a5 && w(d3.url) === undefined && (d3.url = K2(d3.url, a5)), d3.url = qt2(d3.url, d3.format, a5), d3;
    }, "resolve");
    return le2 ? (e3, s3, n3) => {
      In2(2, "resolveSync", { specifier: e3, context: s3 });
      const o5 = r3(e3, s3, n3);
      return In2(1, "resolvedSync", { specifier: e3, context: s3, result: o5 }), o5;
    } : r3;
  }, "createResolveSync");
  Qt3 = c4((t5) => (r3, e3) => {
    if (!e3)
      throw new Error("The current file path (import.meta.url) must be provided in the second argument of tsImport()");
    const s3 = e3.startsWith(X) ? e3 : import_node_url3.pathToFileURL(e3).toString();
    return import(`tsx://${JSON.stringify({ specifier: r3, parentURL: s3, namespace: t5 })}`);
  }, "createScopedImport");
  Je3 = c4((t5) => {
    const r3 = [];
    for (let e3 = 0;e3 < t5.length; e3 += 1) {
      const s3 = t5[e3];
      if (s3 === "--import") {
        const n3 = t5[e3 + 1];
        n3 && r3.push(n3), e3 += 1;
      } else
        s3.startsWith("--import=") && r3.push(s3.slice(9));
    }
    return r3;
  }, "collectImportSpecifiers");
  Ne3 = c4(() => [...(process.env.NODE_OPTIONS ?? "").matchAll(/(?:^|\s)--import(?:=|\s+)(\S+)/g)].map(([, t5]) => t5), "collectNodeOptionsImportSpecifiers");
  xt = [new URL("loader.mjs", "file:///Users/redacted/tools/iframer-toolkit/node_modules/tsx/dist/register-C4vWVmug.mjs").toString(), new URL("esm/index.mjs", "file:///Users/redacted/tools/iframer-toolkit/node_modules/tsx/dist/register-C4vWVmug.mjs").toString()];
  Me3 = new Set(["tsx", "tsx/esm", ...xt, ...xt.map((t5) => decodeURI(new URL(t5).pathname))]);
  _e2 = c4((t5) => Me3.has(t5), "isTsxImport");
  Gt2 = c4((t5) => /\.(?:[cm]?ts|tsx)(?:[?#].*)?$/.test(t5), "isTypeScriptImport");
  Ae2 = c4(() => {
    const t5 = Je3(process.execArgv), r3 = t5.findIndex(_e2);
    return r3 > 0 && t5.slice(0, r3).some(Gt2);
  }, "hasCliTypeScriptPreload");
  Be3 = Ne3().some(Gt2) || Ae2();
  Dt = typeof import_node_module2.default.registerHooks == "function" && c(l) && !Be3;
  qe3 = c4((t5) => {
    if (!import_node_module2.default.register && !Dt)
      throw new Error(`This version of Node.js (${process.version}) does not support module.register(). Please upgrade to Node v18.19 or v20.6 and above.`);
    if (!Ht2) {
      const { _resolveFilename: i4 } = import_node_module2.default;
      import_node_module2.default._resolveFilename = (l3, ...f2) => i4(Le2(l3), ...f2), Ht2 = true;
    }
    const { sourceMapsEnabled: r3 } = process;
    if (process.setSourceMapsEnabled(true), Dt) {
      const i4 = wt3({ namespace: t5?.namespace, onImport: t5?.onImport, tsconfig: t5?.tsconfig }), l3 = import_node_module2.default.registerHooks({ load: Ie3(i4), resolve: Ce2(i4) }), f2 = c4(async () => {
        i4.active = false, l3.deregister(), r3 === false && process.setSourceMapsEnabled(false);
      }, "unregister2");
      return t5?.namespace && (f2.import = Qt3(t5.namespace), f2.unregister = f2), f2;
    }
    const { port1: e3, port2: s3 } = new import_node_worker_threads.MessageChannel;
    import_node_module2.default.register(`./esm/index.mjs?${import_node_crypto2.default.randomUUID()}`, { parentURL: "file:///Users/redacted/tools/iframer-toolkit/node_modules/tsx/dist/register-C4vWVmug.mjs", data: { port: s3, namespace: t5?.namespace, tsconfig: t5?.tsconfig }, transferList: [s3] });
    const n3 = t5?.onImport, o5 = n3 && ((i4) => {
      i4.type === "load" && n3(i4.url);
    });
    o5 && (e3.on("message", o5), e3.unref());
    const a5 = c4(() => (r3 === false && process.setSourceMapsEnabled(false), o5 && e3.off("message", o5), e3.postMessage("deactivate"), new Promise((i4) => {
      const l3 = c4((f2) => {
        f2.type === "deactivated" && (i4(), e3.off("message", l3));
      }, "onDeactivated");
      e3.on("message", l3);
    })), "unregister");
    return t5?.namespace && (a5.import = Qt3(t5.namespace), a5.unregister = a5), a5;
  }, "register");
});

// node_modules/tsx/dist/require-CywAB2e6.mjs
var m4, a5 = (r3, t5) => m4(r3, "name", { value: t5, configurable: true }), e3, s3, i4;
var init_require_CywAB2e6 = __esm(() => {
  init_get_pipe_path__tAJyU_v();
  init_register_C9AniqUt();
  m4 = Object.defineProperty;
  s3 = a5((r3, t5) => (e3 || (e3 = ar2({ namespace: Date.now().toString() })), e3.require(r3, t5)), "tsxRequire");
  i4 = a5((r3, t5, c5) => (e3 || (e3 = ar2({ namespace: Date.now().toString() })), e3.resolve(r3, t5, c5)), "resolve");
  i4.paths = m.resolve.paths, s3.resolve = i4, s3.main = m.main, s3.extensions = m.extensions, s3.cache = m.cache;
});

// node_modules/tsx/dist/esm/index.mjs
var o5, import_esbuild2, r3, c5, n3, f2, u4;
var init_esm = __esm(() => {
  init_node_features_JeyyvQz6();
  init_register_C4vWVmug();
  init_get_pipe_path__tAJyU_v();
  init_register_C9AniqUt();
  init_index_DQtFPMc2();
  init_client_D_mPDF5S();
  init_require_CywAB2e6();
  init_temporary_directory_BDDVQOvU();
  init_index_gbaejti9();
  o5 = __toESM(require("node:worker_threads"));
  import_esbuild2 = __toESM(require_main(), 1);
  (c(l) && !o5.isInternalThread || c(u) && o5.isMainThread) && qe3();
  r3 = ce3();
  c5 = me2(r3);
  n3 = de2(r3);
  f2 = Re3(r3);
  u4 = be2(r3);
});

// node_modules/tsx/dist/loader.mjs
var exports_loader = {};
__export(exports_loader, {
  resolve: () => u4,
  load: () => f2,
  initialize: () => c5,
  globalPreload: () => n3
});
var import_esbuild3;
var init_loader = __esm(() => {
  init_get_pipe_path__tAJyU_v();
  init_esm();
  init_temporary_directory_BDDVQOvU();
  init_node_features_JeyyvQz6();
  init_register_C4vWVmug();
  init_register_C9AniqUt();
  init_index_DQtFPMc2();
  init_client_D_mPDF5S();
  init_index_gbaejti9();
  init_require_CywAB2e6();
  import_esbuild3 = __toESM(require_main(), 1);
  m("./cjs/index.cjs");
});

// src/mcp/local-server.ts
var exports_local_server = {};
__export(exports_local_server, {
  LocalServerManager: () => LocalServerManager
});

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
          await sleep2(HEALTH_POLL_MS);
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
      const child = import_child_process2.spawn(command, args, {
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
        await sleep2(HEALTH_POLL_MS);
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
        require.resolve("/Users/redacted/tools/iframer-toolkit/node_modules/tsx/dist/loader.mjs");
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
        await sleep2(200);
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
function sleep2(ms) {
  return new Promise((r4) => setTimeout(r4, ms));
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
    const tryPort = (p5) => {
      if (p5 >= start + attempts) {
        reject(new Error(`No free port found in ${start}-${start + attempts}`));
        return;
      }
      const srv = import_net.default.createServer();
      srv.once("error", () => {
        srv.close();
        tryPort(p5 + 1);
      });
      srv.once("listening", () => {
        srv.close(() => resolve(p5));
      });
      srv.listen(p5, "127.0.0.1");
    };
    tryPort(start);
  });
}
var import_child_process2, import_net, import_fs3, import_path4, __dirname = "/Users/redacted/tools/iframer-toolkit/src/mcp", BASE_PORT, PORT_SCAN_ATTEMPTS = 21, STARTUP_TIMEOUT_MS = 15000, HEALTH_POLL_MS = 300, SPAWN_LOCK_STALE_MS = 20000;
var init_local_server = __esm(() => {
  init_paths();
  init_registry();
  import_child_process2 = require("child_process");
  import_net = __toESM(require("net"));
  import_fs3 = __toESM(require("fs"));
  import_path4 = __toESM(require("path"));
  BASE_PORT = parseInt(process.env.IFRAMER_LOCAL_PORT || "3022", 10);
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
function buildStealthScriptInner(p5) {
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
    safeProp(Navigator.prototype, "platform", { get: () => "${p5.platform}" });
    safeProp(Navigator.prototype, "languages", { get: () => Object.freeze(${p5.langs}) });
    safeProp(Navigator.prototype, "hardwareConcurrency", { get: () => ${p5.hw} });
    safeProp(Navigator.prototype, "deviceMemory", { get: () => ${p5.mem} });

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
  try { Object.defineProperty(screen, "width",       { get: () => ${p5.sw}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "height",      { get: () => ${p5.sh}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "availWidth",  { get: () => ${p5.sw}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "availHeight", { get: () => ${p5.sah}, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "colorDepth",  { get: () => 24, configurable: true }); } catch(e) {}
  try { Object.defineProperty(screen, "pixelDepth",  { get: () => 24, configurable: true }); } catch(e) {}
  // devicePixelRatio
  try { Object.defineProperty(window, "devicePixelRatio", { get: () => ${p5.dpr}, configurable: true }); } catch(e) {}

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
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${p5.hw}, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${p5.mem}, configurable: true });
      Object.defineProperty(navigator, 'platform', { get: () => '${p5.platform}', configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => Object.freeze(${p5.langs}), configurable: true });
      Object.defineProperty(navigator, 'userAgent', { get: () => '${p5.ua.replace(/'/g, "\\'")}', configurable: true });
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
    const _brands = ${JSON.stringify(p5.brands)};
    const _fullVersionBrands = ${JSON.stringify(p5.fullVersionList)};
    Object.defineProperty(Navigator.prototype, "userAgentData", {
      configurable: true,
      get: () => ({
        brands: _brands, mobile: false, platform: "Windows",
        getHighEntropyValues: (hints) => Promise.resolve({
          brands: _brands, fullVersionList: _fullVersionBrands, mobile: false, model: "",
          platform: "Windows", platformVersion: "${p5.platformVersion}", architecture: "x86", bitness: "64", uaFullVersion: "${p5.uaFullVersion}",
        }),
        toJSON: () => ({ brands: _brands, mobile: false, platform: "Windows" }),
      }),
    });
  }
  `;
}
function stealthContextOptions(overrides = {}, _sessionId, fp) {
  const uaVersion = fp?.uaData?.brands?.find((b3) => b3.brand === "Google Chrome")?.version ?? "136";
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

// src/lib/browser/launcher.ts
function findChromeExecutable() {
  if (process.env.CHROME_EXECUTABLE)
    return process.env.CHROME_EXECUTABLE;
  if (import_fs4.default.existsSync("/usr/bin/google-chrome-stable"))
    return "/usr/bin/google-chrome-stable";
  return;
}
async function getBrowser(_name = "chromium") {
  if (cachedBrowser) {
    if (cachedBrowser.isConnected())
      return cachedBrowser;
    try {
      await cachedBrowser.close();
    } catch (e4) {
      log2.warn(`stale browser close failed: ${e4}`);
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
  } catch (e4) {
    log2.warn(`closeBrowser failed: ${e4}`);
  }
  cachedBrowser = null;
}
async function getBrowserWithFallback(_preferred) {
  return { browser: await getBrowser(), name: "chromium" };
}
async function launchHeadful(displayNum) {
  const executablePath = findChromeExecutable();
  const hasExtensions = import_fs4.default.existsSync(UBLOCK_PATH);
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
  log2.debug(`headful: ${executablePath || "patchright chromium"}, extensions: ${hasExtensions}`);
  return import_patchright.chromium.launch(launchOpts);
}
var import_fs4, import_patchright, log2, UBLOCK_PATH = "/extensions/uBlock0.chromium", cachedBrowser = null;
var init_launcher = __esm(() => {
  init_stealth();
  init_logger();
  import_fs4 = __toESM(require("fs"));
  import_patchright = require("patchright");
  log2 = createLogger("launcher");
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
  const w2 = screen.width || SCREEN_DEFAULTS.WIDTH;
  const h2 = screen.height || SCREEN_DEFAULTS.HEIGHT;
  return {
    userAgent: nav.userAgent,
    platform: "Win32",
    screenWidth: w2,
    screenHeight: h2,
    screenAvailHeight: h2 - 40,
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
    for (let i5 = 0;i5 < window.localStorage.length; i5++) {
      const key = window.localStorage.key(i5);
      ls[key] = window.localStorage.getItem(key);
    }
    for (let i5 = 0;i5 < window.sessionStorage.length; i5++) {
      const key = window.sessionStorage.key(i5);
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
  for (let i5 = 0;i5 < MAX_SESSIONS; i5++) {
    const num = BASE_DISPLAY + i5;
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
      if (import_fs5.default.existsSync(socketPath))
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
  const xvfb = import_child_process3.spawn("Xvfb", [`:${displayNum}`, "-screen", "0", "1920x1080x24", "-ac"], {
    stdio: "ignore"
  });
  await waitForSocket(displayNum);
  const x11vnc = import_child_process3.spawn("x11vnc", ["-display", `:${displayNum}`, "-nopw", "-listen", "localhost", "-rfbport", String(vncPort), "-shared", "-forever"], { stdio: "ignore" });
  const noVncPath = import_fs5.default.existsSync("/usr/share/novnc") ? "/usr/share/novnc" : "/usr/share/noVNC";
  const websockify = import_child_process3.spawn("websockify", ["--web", noVncPath, String(wsPort), `localhost:${vncPort}`], {
    stdio: "ignore"
  });
  await new Promise((r4) => setTimeout(r4, 500));
  const browser = await launchHeadful(displayNum);
  const fingerprint = generateWindowsFingerprint();
  const ctxOpts = stealthContextOptions({}, userId, fingerprint);
  const context = await browser.newContext(ctxOpts);
  const stealthScript = buildStealthScript(fingerprint);
  contextStealthScripts.set(context, stealthScript);
  const page = await context.newPage();
  log3.debug(`fingerprint: ${fingerprint.userAgent.slice(0, 60)}... DPR=${fingerprint.deviceScaleFactor} screen=${fingerprint.screenWidth}x${fingerprint.screenHeight}`);
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
  await new Promise((r4) => setTimeout(r4, 1000));
  try {
    import_fs5.default.unlinkSync(`/tmp/.X11-unix/X${session.displayNum}`);
  } catch {}
  freeDisplay(session.displayNum);
  sessions.delete(userId);
  return sessionData;
}
async function cleanupAllSessions() {
  const userIds = [...sessions.keys()];
  await Promise.all(userIds.map((id) => stopSession(id)));
}
var import_child_process3, import_fs5, log3, BASE_DISPLAY, MAX_SESSIONS, SESSION_TIMEOUT, sessions, usedDisplays;
var init_session_manager = __esm(() => {
  init_launcher();
  init_stealth();
  init_logger();
  init_fingerprint();
  import_child_process3 = require("child_process");
  import_fs5 = __toESM(require("fs"));
  log3 = createLogger("session");
  BASE_DISPLAY = parseInt(process.env.VNC_BASE_DISPLAY || "99", 10);
  MAX_SESSIONS = parseInt(process.env.VNC_MAX_SESSIONS || "20", 10);
  SESSION_TIMEOUT = parseInt(process.env.VNC_SESSION_TIMEOUT_MS || "300000", 10);
  sessions = new Map;
  usedDisplays = new Set;
});

// src/lib/auth/crypto.ts
function getLocalToken() {
  if (process.env.IFRAMER_SECRET)
    return process.env.IFRAMER_SECRET;
  const candidates = [
    import_path5.default.join(getDataDir(), "secret"),
    import_path5.default.join(process.env.XDG_RUNTIME_DIR || import_os3.default.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = import_fs6.default.readFileSync(file, "utf8").trim();
      if (existing)
        return existing;
    } catch {}
  }
  for (const file of candidates) {
    try {
      import_fs6.default.mkdirSync(import_path5.default.dirname(file), { recursive: true });
      const secret = import_crypto.default.randomBytes(32).toString("hex");
      import_fs6.default.writeFileSync(file, secret, { mode: 384 });
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
  for (const c6 of cleanSecret) {
    const val = base32Chars.indexOf(c6);
    if (val === -1)
      continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const keyBytes = [];
  for (let i5 = 0;i5 + 8 <= bits.length; i5 += 8) {
    keyBytes.push(parseInt(bits.substring(i5, i5 + 8), 2));
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
var import_crypto, import_fs6, import_os3, import_path5, SALT = "iframer-session", INFO = "encryption", KEY_LENGTH = 32, IV_LENGTH = 12, TAG_LENGTH = 16;
var init_crypto = __esm(() => {
  init_paths();
  import_crypto = __toESM(require("crypto"));
  import_fs6 = __toESM(require("fs"));
  import_os3 = __toESM(require("os"));
  import_path5 = __toESM(require("path"));
});

// src/lib/screenshot.ts
function saveScreenshot(buffer, filename, screenshotDir, publicUrl) {
  import_fs7.default.mkdirSync(screenshotDir, { recursive: true });
  const filePath = import_path6.default.join(screenshotDir, filename);
  import_fs7.default.writeFileSync(filePath, buffer);
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
    const entries = import_fs7.default.readdirSync(dir).filter((f3) => f3.endsWith(".jpg") || f3.endsWith(".jpeg") || f3.endsWith(".png")).map((f3) => {
      const full = import_path6.default.join(dir, f3);
      try {
        return { full, mtimeMs: import_fs7.default.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    }).filter((e4) => e4 !== null);
    let removed = 0;
    const survivors = [];
    for (const e4 of entries) {
      if (now - e4.mtimeMs > maxAgeMs) {
        try {
          import_fs7.default.unlinkSync(e4.full);
          removed++;
        } catch {}
      } else {
        survivors.push(e4);
      }
    }
    if (survivors.length > maxFiles) {
      survivors.sort((a6, b3) => a6.mtimeMs - b3.mtimeMs);
      for (const e4 of survivors.slice(0, survivors.length - maxFiles)) {
        try {
          import_fs7.default.unlinkSync(e4.full);
          removed++;
        } catch {}
      }
    }
    if (removed > 0)
      log4.debug(`pruned ${removed} old screenshot(s) from ${dir}`);
    return removed;
  } catch (err) {
    log4.warn(`screenshot prune failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
var import_fs7, import_path6, log4, MAX_AGE_MS, MAX_FILES, PRUNE_THROTTLE_MS, lastPruneAt = 0;
var init_screenshot = __esm(() => {
  init_logger();
  import_fs7 = __toESM(require("fs"));
  import_path6 = __toESM(require("path"));
  log4 = createLogger("screenshot");
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
    import_fs8.default.mkdirSync(dataDir, { recursive: true });
    const dbPath = import_path7.default.join(dataDir, "iframer.db");
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
    return rows.map((r4) => r4.domain);
  }
  close() {
    this.db.close();
  }
}
var import_path7, import_fs8, IS_BUN;
var init_sqlite_store = __esm(() => {
  import_path7 = __toESM(require("path"));
  import_fs8 = __toESM(require("fs"));
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
    const entries = import_fs9.default.readdirSync(installDir).filter((e4) => e4.startsWith("chrome-"));
    const dir = entries[0] || "chrome-mac-arm64";
    return import_path8.default.join(installDir, dir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (platform === "linux") {
    const entries = import_fs9.default.readdirSync(installDir).filter((e4) => e4.startsWith("chrome-"));
    const dir = entries[0] || "chrome-linux64";
    return import_path8.default.join(installDir, dir, "chrome");
  }
  if (platform === "win32") {
    const entries = import_fs9.default.readdirSync(installDir).filter((e4) => e4.startsWith("chrome-"));
    const dir = entries[0] || "chrome-win64";
    return import_path8.default.join(installDir, dir, "chrome.exe");
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
async function downloadChrome(installDir = DEFAULT_INSTALL_DIR) {
  log5.info("Downloading Chrome for Testing (first time only)...");
  const res = await fetch(CHROME_VERSIONS_URL);
  if (!res.ok)
    throw new Error(`Failed to fetch Chrome versions: ${res.status}`);
  const data = await res.json();
  const channel = data.channels?.Stable;
  if (!channel)
    throw new Error("No Stable channel found in Chrome for Testing versions");
  const platform = getPlatform();
  const download = channel.downloads?.chrome?.find((d3) => d3.platform === platform);
  if (!download)
    throw new Error(`No Chrome for Testing download for platform: ${platform}`);
  const url = download.url;
  const version = channel.version;
  log5.debug(`Version ${version} for ${platform}`);
  log5.debug(`URL: ${url}`);
  import_fs9.default.mkdirSync(installDir, { recursive: true });
  const zipPath = import_path8.default.join(installDir, "chrome.zip");
  const dlRes = await fetch(url);
  if (!dlRes.ok)
    throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  import_fs9.default.writeFileSync(zipPath, buf);
  log5.info(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  import_child_process4.execSync(`unzip -o -q "${zipPath}" -d "${installDir}"`, { stdio: "inherit" });
  import_fs9.default.unlinkSync(zipPath);
  const execPath = getChromeExecutablePath(installDir);
  if (!import_fs9.default.existsSync(execPath)) {
    throw new Error(`Chrome executable not found after extraction: ${execPath}`);
  }
  if (process.platform !== "win32") {
    import_fs9.default.chmodSync(execPath, 493);
  }
  import_fs9.default.writeFileSync(import_path8.default.join(installDir, "version.json"), JSON.stringify({ version, platform, downloadedAt: new Date().toISOString() }));
  log5.info(`Installed at: ${execPath}`);
  return execPath;
}
function findChromeForTesting() {
  if (process.env.CHROME_EXECUTABLE) {
    if (import_fs9.default.existsSync(process.env.CHROME_EXECUTABLE))
      return process.env.CHROME_EXECUTABLE;
  }
  try {
    const execPath = getChromeExecutablePath(DEFAULT_INSTALL_DIR);
    if (import_fs9.default.existsSync(execPath))
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
        const dirs = import_fs9.default.readdirSync("/ms-playwright").filter((d3) => d3.startsWith("chromium-")).sort().reverse();
        return dirs.map((d3) => import_path8.default.join("/ms-playwright", d3, "chrome-linux", "chrome"));
      } catch {
        return [];
      }
    })()
  ] : [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  for (const p5 of systemPaths) {
    if (import_fs9.default.existsSync(p5))
      return p5;
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
    log5.error(`Failed to download Chrome for Testing: ${err instanceof Error ? err.message : String(err)}`);
    const system = findChrome();
    if (system) {
      log5.warn(`Falling back to system Chrome: ${system}`);
      return system;
    }
    throw new Error("No Chrome found. Download failed and no system Chrome available.");
  }
}
var import_fs9, import_path8, import_os4, import_child_process4, log5, CHROME_VERSIONS_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json", DEFAULT_INSTALL_DIR;
var init_chrome_downloader = __esm(() => {
  init_logger();
  import_fs9 = __toESM(require("fs"));
  import_path8 = __toESM(require("path"));
  import_os4 = __toESM(require("os"));
  import_child_process4 = require("child_process");
  log5 = createLogger("chrome");
  DEFAULT_INSTALL_DIR = import_path8.default.join(import_os4.default.homedir(), ".iframer", "chrome");
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
      log6.info("Downloading CloakBrowser binary...");
      await cloak.ensureBinary();
      log6.info("CloakBrowser ready");
    }
    _available = true;
    return true;
  } catch (err) {
    log6.warn(`CloakBrowser setup failed: ${err instanceof Error ? err.message : String(err)}`);
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
    log6.info(`CloakBrowser launched (headless=${options.headless})`);
    return browser;
  } catch (err) {
    log6.warn(`CloakBrowser launch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
var log6, _available = null;
var init_cloak_browser = __esm(() => {
  init_logger();
  log6 = createLogger("cloak");
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
  async ensure(mode, instanceId = DEFAULT_INSTANCE, sessionProfile = instanceId) {
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
          instance.sessionProfile = sessionProfile;
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
      sessionProfile,
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
    return [...new Set(this.liveInstances().map((i5) => i5.mode))];
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
  findLiveMode(instanceId) {
    for (const inst of this.liveInstances()) {
      if (inst.instanceId === instanceId)
        return inst.mode;
    }
    return null;
  }
  async instancesInfo() {
    const now = Date.now();
    const out = [];
    for (const inst of this.liveInstances()) {
      let url = "";
      let title = "";
      try {
        url = inst.page.url();
      } catch {}
      try {
        title = await inst.page.title();
      } catch {}
      out.push({
        mode: inst.mode,
        instanceId: inst.instanceId,
        sessionProfile: inst.sessionProfile ?? inst.instanceId,
        url,
        title,
        busy: inst.active > 0,
        createdAt: inst.createdAt.toISOString(),
        ageSeconds: Math.round((now - inst.createdAt.getTime()) / 1000)
      });
    }
    return out;
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
      sleep3(CLOSE_GRACE_MS).then(() => false)
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
    const keys = [...this.instances.entries()].filter(([, inst]) => force || inst.active === 0).map(([k3]) => k3);
    await Promise.all(keys.map((k3) => this.stopKey(k3)));
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
var import_patchright2, import_crypto2, log7, DEFAULT_IDLE_TIMEOUT, CLOSE_GRACE_MS = 5000, DEFAULT_INSTANCE = "default", sleep3 = (ms) => new Promise((r4) => setTimeout(r4, ms));
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
  return import_path9.default.join(getDataDir(), "domain-modes.json");
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
    for (let i5 = idx + 1;i5 < ESCALATION_LADDER.length; i5++) {
      if (availableModes.includes(ESCALATION_LADDER[i5])) {
        return ESCALATION_LADDER[i5];
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
    const entries = Object.entries(this.data).filter(([, e4]) => !this.isExpired(e4)).sort(([, a6], [, b3]) => b3.lastSuccess.localeCompare(a6.lastSuccess));
    return {
      totalDomains: entries.length,
      recentDomains: entries.slice(0, 5).map(([d3, e4]) => `${d3} (${e4.mode})`)
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
      if (import_fs10.default.existsSync(this.filePath)) {
        this.data = JSON.parse(import_fs10.default.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }
  save() {
    try {
      import_fs10.default.mkdirSync(import_path9.default.dirname(this.filePath), { recursive: true });
      import_fs10.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log8.error("Failed to save:", err);
    }
  }
}
var import_fs10, import_path9, log8, TTL_DAYS = 14, ESCALATION_LADDER;
var init_domain_modes = __esm(() => {
  init_logger();
  init_paths();
  import_fs10 = __toESM(require("fs"));
  import_path9 = __toESM(require("path"));
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

// src/lib/clipboard.ts
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
      child = import_child_process5.spawn(cmd[0], cmd.slice(1));
    } catch {
      resolve({ ok: false, out: "", err: `spawn ${cmd[0]} failed` });
      return;
    }
    let out = "";
    let errOut = "";
    child.stdout?.on("data", (d3) => out += d3);
    child.stderr?.on("data", (d3) => errOut += d3);
    child.on("error", (e4) => resolve({ ok: false, out: "", err: e4.message }));
    child.on("close", (code) => resolve({ ok: code === 0, out, err: errOut }));
    if (input !== undefined) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}
async function clipboardRead() {
  const tools = platformTools("read");
  let lastErr = "";
  for (const cmd of tools) {
    const r4 = await run(cmd);
    if (r4.ok)
      return r4.out;
    lastErr = r4.err;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t5) => t5[0]).join(", ")}). ${lastErr}`);
}
var import_child_process5;
var init_clipboard = __esm(() => {
  import_child_process5 = require("child_process");
});

// src/lib/browser/humanize.ts
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randRange(range) {
  return rand(range[0], range[1]);
}
function bezierPoint(t5, p0, p1, p22, p32) {
  const u5 = 1 - t5;
  return u5 * u5 * u5 * p0 + 3 * u5 * u5 * t5 * p1 + 3 * u5 * t5 * t5 * p22 + t5 * t5 * t5 * p32;
}
function generatePath(fromX, fromY, toX, toY) {
  const steps = Math.floor(rand(25, 55));
  const points = [];
  const cx1 = fromX + (toX - fromX) * rand(0.1, 0.4) + rand(-50, 50);
  const cy1 = fromY + (toY - fromY) * rand(-0.2, 0.5) + rand(-50, 50);
  const cx2 = fromX + (toX - fromX) * rand(0.6, 0.9) + rand(-30, 30);
  const cy2 = fromY + (toY - fromY) * rand(0.5, 1.2) + rand(-30, 30);
  for (let i5 = 0;i5 <= steps; i5++) {
    const t5 = i5 / steps;
    const eased = t5 < 0.5 ? 2 * t5 * t5 : 1 - Math.pow(-2 * t5 + 2, 2) / 2;
    let x2 = bezierPoint(eased, fromX, cx1, cx2, toX);
    let y = bezierPoint(eased, fromY, cy1, cy2, toY);
    const jitterScale = Math.sin(t5 * Math.PI) * 2;
    x2 += rand(-jitterScale, jitterScale);
    y += rand(-jitterScale, jitterScale);
    points.push({ x: Math.round(x2), y: Math.round(y) });
  }
  points[points.length - 1] = { x: Math.round(toX), y: Math.round(toY) };
  return points;
}
async function humanMove(page, toX, toY) {
  const mouse = page.mouse;
  const lastPos = mousePositions.get(page);
  const fromX = lastPos?.x ?? randRange(TIMING.IDLE_MOUSE_X);
  const fromY = lastPos?.y ?? randRange(TIMING.IDLE_MOUSE_Y);
  const path9 = generatePath(fromX, fromY, toX, toY);
  for (const point of path9) {
    await mouse.move(point.x, point.y);
    await sleep4(rand(2, 12));
  }
  mousePositions.set(page, { x: toX, y: toY });
}
async function humanClick(page, selector) {
  const element = await page.waitForSelector(selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
  if (!element)
    throw new Error(`Element not found: ${selector}`);
  await element.scrollIntoViewIfNeeded().catch(() => {});
  const box = await element.boundingBox();
  if (!box)
    throw new Error(`Element not visible: ${selector}`);
  const targetX = box.x + box.width * rand(0.3, 0.7);
  const targetY = box.y + box.height * rand(0.3, 0.7);
  await humanMove(page, targetX, targetY);
  await sleep4(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep4(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep4(randRange(TIMING.POST_CLICK));
}
async function humanClickXY(page, x2, y) {
  await humanMove(page, x2, y);
  await sleep4(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep4(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep4(randRange(TIMING.POST_CLICK));
}
async function assertFocused(page, selector, clicked) {
  const r4 = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el)
      return { ok: false, active: "(target not found)" };
    const a6 = document.activeElement;
    const ok = !!a6 && (a6 === el || el.contains(a6));
    const desc = a6 ? `${a6.tagName.toLowerCase()}${a6.id ? "#" + a6.id : ""}` : "nothing";
    return { ok, active: desc };
  }, selector);
  if (!r4.ok) {
    throw new Error(`human-type aborted: after ${clicked ? "clicking" : "skip-click on"} "${selector}", it is NOT focused ` + `(focus is on ${r4.active}). Typing now would send keystrokes to the page, where single keys act as ` + `shortcuts — a real hazard. Fix the selector, or focus the field first and pass skipClick. No keys were sent.`);
  }
}
async function humanType(page, selector, text, opts = {}) {
  if (!opts.skipClick) {
    await humanClick(page, selector);
    await sleep4(randRange(TIMING.POST_CLICK));
  }
  await assertFocused(page, selector, !opts.skipClick);
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
  if (abs === 0)
    return;
  const dir = Math.sign(deltaY) || 1;
  const ticks = Math.max(3, Math.min(20, Math.round(abs / rand(80, 140))));
  let done = 0;
  for (let i5 = 0;i5 < ticks; i5++) {
    const t5 = (i5 + 1) / ticks;
    const ease = Math.sin(t5 * Math.PI);
    let step = Math.round(abs / ticks * (0.6 + ease * 0.8) + rand(-8, 8));
    step = Math.max(10, step);
    if (done + step > abs)
      step = abs - done;
    await page.mouse.wheel(0, dir * step);
    done += step;
    await sleep4(rand(30, 90));
    if (Math.random() < 0.15)
      await sleep4(rand(120, 300));
    if (done >= abs)
      break;
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
  await sleep4(randRange(TIMING.PRE_CHECKBOX_WAIT));
  await humanClickXY(page, checkboxX, checkboxY);
  await sleep4(TIMING.POST_CHECKBOX_WAIT);
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
  for (let r4 = 0;r4 < info.rows; r4++) {
    for (let c6 = 0;c6 < info.cols; c6++) {
      tiles.push({
        row: r4,
        col: c6,
        index: r4 * info.cols + c6,
        centerX: Math.round(gridStartX + c6 * tileWidth + tileWidth / 2),
        centerY: Math.round(gridStartY + r4 * tileHeight + tileHeight / 2)
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
    const tile = challengeInfo.tiles.find((t5) => t5.index === idx);
    if (!tile)
      continue;
    await humanClickXY(page, tile.centerX, tile.centerY);
    await sleep4(randRange(TIMING.TILE_CLICK_DELAY));
    clicked.push(idx);
  }
  return { clicked, challengeInfo };
}
async function clickChallengeVerify(page) {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo)
    throw new Error("No active reCAPTCHA challenge found");
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
        if (checked)
          return { solved: true };
      } catch {}
    }
  }
  const newInfo = await getChallengeInfo(page);
  return { solved: false, challengeInfo: newInfo };
}
function sleep4(ms) {
  return new Promise((r4) => setTimeout(r4, ms));
}
var mousePositions, SPEED_FACTOR;
var init_humanize = __esm(() => {
  init_constants();
  mousePositions = new WeakMap;
  SPEED_FACTOR = { slow: 1.5, normal: 1, fast: 0.35 };
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
  const selector = resolveSelector(step.selector, ctx);
  const value = step.value;
  await page.fill(selector, value);
  const stuck = await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el)
      return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    try {
      el.focus();
    } catch {}
    try {
      setter ? setter.call(el, val) : el.value = val;
    } catch {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      el.blur();
    } catch {}
    return el.value === val;
  }, { sel: selector, val: value });
  if (!stuck) {
    const loc = page.locator(selector);
    try {
      await loc.click();
      await loc.fill("");
      await loc.pressSequentially(value, { delay: 15 });
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        el?.blur?.();
      }, selector);
    } catch {}
  }
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
  await humanType(page, resolveSelector(step.selector, ctx), step.value, { skipClick: step.skipClick, speed: step.speed });
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
      if (box)
        await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
    }
    await humanScroll(page, dy);
    return;
  }
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
async function upload(page, step, ctx) {
  if (!step.files || step.files.length === 0)
    throw new Error("upload: `files` must be a non-empty array of local paths");
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
  if (!step.url)
    throw new Error("download: `url` is required");
  const resp = await page.request.get(step.url);
  const status = resp.status();
  if (!resp.ok())
    throw new Error(`download: HTTP ${status} for ${step.url}`);
  const buf = await resp.body();
  const fs10 = await import("fs");
  const pathMod = await import("path");
  const { getDataDir: getDataDir2 } = await Promise.resolve().then(() => (init_paths(), exports_paths));
  let outPath;
  if (step.path && pathMod.isAbsolute(step.path)) {
    outPath = step.path;
  } else {
    let name = "download";
    try {
      name = decodeURIComponent(new URL(step.url).pathname.split("/").pop() || "") || "download";
    } catch {}
    outPath = pathMod.join(getDataDir2(), "downloads", step.path || name);
  }
  fs10.mkdirSync(pathMod.dirname(outPath), { recursive: true });
  fs10.writeFileSync(outPath, buf);
  return { path: outPath, size: buf.length, status };
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
  init_clipboard();
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
    const path9 = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path9.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      if (parent && current) {
        const currentTag = current.tagName;
        const siblings = Array.from(parent.children).filter((c6) => c6.tagName === currentTag);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
      path9.unshift(seg);
      current = parent;
    }
    return { tag, text, selector: path9.join(" > ") };
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
      const path9 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path9.unshift(`#${current.id}`);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const currentTag = current.tagName;
          const siblings = Array.from(parent.children).filter((c6) => c6.tagName === currentTag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        path9.unshift(seg);
        current = parent;
      }
      return path9.join(" > ");
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
      const path9 = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path9.unshift(`#${current.id}`);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const currentTag = current.tagName;
          const siblings = Array.from(parent.children).filter((c6) => c6.tagName === currentTag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        path9.unshift(seg);
        current = parent;
      }
      return path9.join(" > ");
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
    for (const { num, x: x2, y } of annotations) {
      const badge = document.createElement("div");
      badge.style.cssText = `
        position:absolute;
        left:${x2 - 10}px;
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
  }, refs.map((r4, i5) => ({ num: i5 + 1, x: r4.x, y: r4.y })));
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
    const refLines = annotated.refs.map((r4) => `  ${r4.ref} ${r4.role} "${r4.name}"`).join(`
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
`).map((l3) => l3.trim()).filter(Boolean);
  for (let i5 = 0;i5 < lines.length; i5++) {
    if (/select all (images|squares) with/i.test(lines[i5])) {
      const afterWith = lines[i5].replace(/.*with\s*/i, "").trim();
      if (afterWith && afterWith.length > 1 && !/click/i.test(afterWith)) {
        return afterWith.replace(/^a\s+/i, "").trim();
      }
      if (i5 + 1 < lines.length && !/click/i.test(lines[i5 + 1])) {
        return lines[i5 + 1].replace(/^a\s+/i, "").trim();
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
  for (let r4 = 0;r4 < rows; r4++) {
    for (let c6 = 0;c6 < cols; c6++) {
      const clip = {
        x: gridX + c6 * tileW + 2,
        y: gridY + r4 * tileH + 2,
        width: tileW - 4,
        height: tileH - 4
      };
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 85, clip });
        tiles.push({ index: r4 * cols + c6, imageBase64: buf.toString("base64") });
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
  return results.filter((r4) => r4.match).map((r4) => r4.index);
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
          await new Promise((r4) => setTimeout(r4, 500));
          await humanClick(page, selector);
          await new Promise((r4) => setTimeout(r4, 2000));
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
        await new Promise((r4) => setTimeout(r4, TILE_SETTLE_MS));
        const newInfo = await getChallengeInfo(page);
        if (newInfo) {
          const [newFullGrid, newTiles] = await Promise.all([
            screenshotFullGrid(page, newInfo),
            screenshotTiles(page, newInfo)
          ]);
          if (newFullGrid && newTiles.length > 0) {
            const replacedTiles = newTiles.filter((t5) => matchingIndices.includes(t5.index));
            if (replacedTiles.length > 0) {
              monitor?.reportActivity();
              const newMatches = await classifyTiles(client, newFullGrid, replacedTiles, target, newInfo.rows, newInfo.cols);
              if (newMatches.length > 0) {
                log10.info(`Round ${rounds}: dynamic tiles matched [${newMatches.join(", ")}]`);
                await clickChallengeTiles(page, newMatches);
                await new Promise((r4) => setTimeout(r4, TILE_SETTLE_MS));
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
function sleep5(ms) {
  return new Promise((r4) => setTimeout(r4, ms));
}
async function clickCheckbox(page) {
  const checkboxFrame = await page.waitForSelector('iframe[src*="hcaptcha.com"], iframe[data-hcaptcha-widget-id], iframe[title*="hCaptcha"]', { timeout: 1e4 }).catch(() => null);
  if (!checkboxFrame)
    throw new Error("hCaptcha checkbox iframe not found");
  const box = await checkboxFrame.boundingBox();
  if (!box)
    throw new Error("hCaptcha iframe not visible");
  await humanMove(page, rand2(200, 500), rand2(150, 400));
  await sleep5(rand2(300, 700));
  const cx = box.x + box.width * rand2(0.15, 0.35);
  const cy = box.y + box.height * rand2(0.3, 0.7);
  await humanClickXY(page, cx, cy);
  await sleep5(2500);
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
  for (let r4 = 0;r4 < info.rows; r4++) {
    for (let c6 = 0;c6 < info.cols; c6++) {
      tiles.push({
        index: r4 * info.cols + c6,
        centerX: Math.round(frameBox.x + gridPadLeft + c6 * tileW + tileW / 2),
        centerY: Math.round(frameBox.y + gridPadTop + r4 * tileH + tileH / 2)
      });
    }
  }
  const verifyBtnBox = await frame.evaluate(() => {
    const btn = document.querySelector('.button-submit.button, [aria-label="Verify"], [aria-label="Skip Challenge"]');
    if (!btn)
      return null;
    const r4 = btn.getBoundingClientRect();
    return { x: r4.x + r4.width / 2, y: r4.y + r4.height / 2 };
  }).catch(() => null);
  const verifyButton = verifyBtnBox ? { x: Math.round(frameBox.x + verifyBtnBox.x), y: Math.round(frameBox.y + verifyBtnBox.y) } : { x: Math.round(frameBox.x + frameBox.width - 55), y: Math.round(frameBox.y + frameBox.height - 30) };
  log11.info(`Round challenge: "${info.prompt}" (${info.rows}x${info.cols})`);
  return { prompt: info.prompt, rows: info.rows, cols: info.cols, tiles, verifyButton, frameBox };
}
async function screenshotChallenge(page, challenge) {
  const { frameBox } = challenge;
  try {
    await sleep5(1000);
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
    return text.split(/[,\s]+/).map((s4) => parseInt(s4.trim(), 10)).filter((n4) => !isNaN(n4) && n4 >= 0 && n4 < total);
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
  await sleep5(2500);
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
      await sleep5(rand2(150, 400));
    }
    await sleep5(rand2(500, 1000));
    const solved = await clickVerify(page, challenge);
    monitor?.reportActivity();
    if (solved) {
      log11.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }
    log11.info(`Round ${rounds}: not solved, retrying`);
    await sleep5(rand2(500, 1000));
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
    return iframes.some((f3) => {
      const src = f3.src || "";
      const title = (f3.title || "").toLowerCase();
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
    const re3 = new RegExp(reSource, reFlags);
    const pick = (scope) => {
      const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])');
      if (typed)
        return typed;
      const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'));
      return buttons.find((b3) => re3.test(b3.textContent || "") && b3.offsetParent !== null) || null;
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
  return import_path10.default.join(getDataDir(), "knowledge");
}
function getKnowledgePath(domain) {
  const safe = sanitizeDomain(domain);
  return import_path10.default.join(getKnowledgeDir(), `${safe}.md`);
}
function normalizeDomain(input) {
  let d3 = (input || "").trim().toLowerCase();
  if (!d3)
    return "";
  try {
    if (d3.includes("://")) {
      d3 = new URL(d3).hostname;
    } else if (d3.includes("/")) {
      d3 = new URL(`https://${d3}`).hostname;
    }
  } catch {}
  d3 = d3.replace(/:\d+$/, "");
  d3 = d3.replace(/^www\./, "");
  return d3;
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
  import_fs11.default.mkdirSync(getKnowledgeDir(), { recursive: true });
}
function readKnowledge(domain) {
  const p5 = getKnowledgePath(domain);
  try {
    return import_fs11.default.readFileSync(p5, "utf8");
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
    entries = import_fs11.default.readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const file of entries) {
    if (!file.endsWith(".md"))
      continue;
    const full = import_path10.default.join(dir, file);
    try {
      const stat = import_fs11.default.statSync(full);
      const raw = import_fs11.default.readFileSync(full, "utf8");
      const parsed = parseMarkdown(raw);
      results.push({
        domain: parsed?.domain ?? file.replace(/\.md$/, ""),
        lastVerified: parsed?.lastVerified ?? new Date(stat.mtimeMs).toISOString(),
        lastMode: parsed?.lastMode ?? "unknown",
        sizeBytes: stat.size
      });
    } catch {}
  }
  results.sort((a6, b3) => a6.lastVerified < b3.lastVerified ? 1 : -1);
  return results;
}
function clearKnowledge(domain) {
  const dir = getKnowledgeDir();
  if (domain) {
    const p5 = getKnowledgePath(domain);
    try {
      import_fs11.default.unlinkSync(p5);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  let removed = 0;
  try {
    const entries = import_fs11.default.readdirSync(dir);
    for (const f3 of entries) {
      if (f3.endsWith(".md")) {
        try {
          import_fs11.default.unlinkSync(import_path10.default.join(dir, f3));
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
  import_fs11.default.writeFileSync(getKnowledgePath(domain), md, "utf8");
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
  return [...seen.values()].sort((a6, b3) => {
    if (a6.path !== b3.path)
      return a6.path < b3.path ? -1 : 1;
    return a6.method < b3.method ? -1 : 1;
  });
}
function dedupeNotes(notes) {
  const seen = new Set;
  const out = [];
  for (const note of notes) {
    const n4 = note.trim();
    if (n4 && !seen.has(n4)) {
      seen.add(n4);
      out.push(n4);
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
    lines.push(`**Required cookies:** ${data.auth.cookieNames.map((n4) => `\`${n4}\``).join(", ")}`);
  }
  if (data.auth.localStorageKeys?.length) {
    lines.push(`**localStorage keys:** ${data.auth.localStorageKeys.map((n4) => `\`${n4}\``).join(", ")}`);
  }
  if (data.auth.sessionStorageKeys?.length) {
    lines.push(`**sessionStorage keys:** ${data.auth.sessionStorageKeys.map((n4) => `\`${n4}\``).join(", ")}`);
  }
  if (data.auth.headers?.length) {
    lines.push(`**Request headers:** ${data.auth.headers.map((n4) => `\`${n4}\``).join(", ")}`);
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
    for (const n4 of data.notes)
      lines.push(`- ${n4}`);
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
    const m5 = line.match(/^(\w+):\s*(.*)$/);
    if (m5)
      fm[m5[1]] = m5[2].trim();
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
    let m5;
    while ((m5 = endpointRegex.exec(endpointSection)) !== null) {
      endpoints.push({ method: m5[1], path: m5[2] });
    }
  }
  const notes = [];
  const notesSection = extractSection(body, "Notes");
  if (notesSection) {
    for (const line of notesSection.split(`
`)) {
      const m5 = line.match(/^-\s+(.+)$/);
      if (m5)
        notes.push(m5[1].trim());
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
  const re3 = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const match = body.match(re3);
  if (!match || match.index === undefined)
    return null;
  const start = match.index + match[0].length;
  const nextSection = body.slice(start).match(/^##\s+/m);
  const end = nextSection?.index != null ? start + nextSection.index : body.length;
  return body.slice(start, end);
}
function extractBackticks(re3, text) {
  const m5 = text.match(re3);
  if (!m5)
    return;
  const items = [...m5[1].matchAll(/`([^`]+)`/g)].map((x2) => x2[1]);
  return items.length > 0 ? items : undefined;
}
var import_fs11, import_path10, log13;
var init_knowledge = __esm(() => {
  init_logger();
  init_paths();
  import_fs11 = __toESM(require("fs"));
  import_path10 = __toESM(require("path"));
  log13 = createLogger("knowledge");
});

// src/lib/auth/credential-resolver.ts
async function resolveCredential(store, userId, token, domain) {
  const credKey = await deriveKey(token, "credentials");
  let blob = null;
  let matchedDomain = "";
  for (const candidate of domainLookupChain(domain)) {
    const b3 = await store.getCredential(userId, candidate);
    if (b3 && b3.length > 0) {
      blob = b3;
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
    page.waitForURL((u5) => u5.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
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
    await page.waitForURL((u5) => u5.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
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
    page.waitForURL((u5) => u5.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {}),
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
  await page.waitForURL((u5) => u5.toString() !== beforeUrl, { timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
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
  async withMonitoring(fn3) {
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
      fn3().then((result) => {
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
      const active = await page.evaluate(() => [
        'iframe[src*="recaptcha/api2/anchor"], iframe[title*="reCAPTCHA"]',
        'iframe[src*="recaptcha/api2/bframe"]',
        '.g-recaptcha:not([data-size="invisible"]), [data-sitekey]:not([data-size="invisible"])'
      ].some((sel) => {
        const el = document.querySelector(sel);
        if (!el)
          return false;
        const r4 = el.getBoundingClientRect();
        if (r4.width < 20 || r4.height < 20)
          return false;
        const s4 = getComputedStyle(el);
        return s4.visibility !== "hidden" && s4.display !== "none" && s4.opacity !== "0";
      }));
      if (active)
        return { type: "captcha", confidence: 0.95 };
    } catch {}
    return null;
  }
}

class HCaptchaDetector {
  async detect(page) {
    try {
      const active = await page.evaluate(() => [
        'iframe[src*="hcaptcha.com"]',
        'iframe[title*="hCaptcha"]',
        "[data-hcaptcha-widget-id]"
      ].some((sel) => {
        const el = document.querySelector(sel);
        if (!el)
          return false;
        const r4 = el.getBoundingClientRect();
        if (r4.width < 20 || r4.height < 20)
          return false;
        const s4 = getComputedStyle(el);
        return s4.visibility !== "hidden" && s4.display !== "none" && s4.opacity !== "0";
      }));
      if (active)
        return { type: "hcaptcha", confidence: 0.95 };
    } catch {}
    return null;
  }
}

class CookieConsentDetector {
  async detect(page) {
    try {
      const found = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).some((el) => {
        const label = ((el.innerText || el.value || "") + "").trim().toLowerCase();
        if (!label || label.length > 32)
          return false;
        const kws = ["accept cookies", "accept all", "allow cookies", "i accept", "i agree", "agree"];
        if (!kws.some((kw) => label === kw || label.includes(kw) && kw.length / label.length >= 0.5))
          return false;
        const r4 = el.getBoundingClientRect();
        if (r4.width < 20 || r4.height < 10)
          return false;
        const s4 = getComputedStyle(el);
        if (s4.visibility === "hidden" || s4.display === "none" || s4.opacity === "0")
          return false;
        let n4 = el.parentElement;
        let depth = 0;
        while (n4 && depth < 8) {
          const cs = getComputedStyle(n4);
          if (cs.position === "fixed" || cs.position === "sticky" || n4.getAttribute("role") === "dialog" || n4.getAttribute("aria-modal") === "true")
            return true;
          n4 = n4.parentElement;
          depth++;
        }
        return false;
      }));
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
    try {
      const tagged = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).find((el2) => {
          const label = ((el2.innerText || el2.value || "") + "").trim().toLowerCase();
          if (!label || label.length > 32)
            return false;
          const kws = ["accept cookies", "accept all", "allow cookies", "i accept", "i agree", "agree"];
          if (!kws.some((kw) => label === kw || label.includes(kw) && kw.length / label.length >= 0.5))
            return false;
          const r4 = el2.getBoundingClientRect();
          if (r4.width < 20 || r4.height < 10)
            return false;
          const s4 = getComputedStyle(el2);
          if (s4.visibility === "hidden" || s4.display === "none" || s4.opacity === "0")
            return false;
          let n4 = el2.parentElement;
          let depth = 0;
          while (n4 && depth < 8) {
            const cs = getComputedStyle(n4);
            if (cs.position === "fixed" || cs.position === "sticky" || n4.getAttribute("role") === "dialog" || n4.getAttribute("aria-modal") === "true")
              return true;
            n4 = n4.parentElement;
            depth++;
          }
          return false;
        });
        if (!el)
          return false;
        el.setAttribute("data-iframer-consent", "1");
        return true;
      });
      if (tagged) {
        await humanClick(page, '[data-iframer-consent="1"]');
        await page.evaluate(() => {
          document.querySelector('[data-iframer-consent="1"]')?.removeAttribute("data-iframer-consent");
        }).catch(() => {});
        await page.waitForTimeout(500);
        return { resolved: true, resolution: "dismissed-cookie-consent" };
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
  return AUTH_HEADER_PATTERNS.some((p5) => p5.test(name));
}
function isLikelyId(segment) {
  return ID_PATTERNS.some((p5) => p5.test(segment));
}
function isRecord(x2) {
  return typeof x2 === "object" && x2 !== null && !Array.isArray(x2);
}
function parameterizePath(path10) {
  const parts = path10.split("/");
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
    const u5 = new URL(url);
    if (u5.searchParams.toString() === "")
      return;
    const params = {};
    u5.searchParams.forEach((v2, k3) => {
      params[k3] = v2;
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
function sanitizeString(s4) {
  return s4.replace(/[\uD800-\uDFFF]/g, "�");
}
function sanitizeDeep(val) {
  if (typeof val === "string")
    return sanitizeString(val);
  if (Array.isArray(val))
    return val.map(sanitizeDeep);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k3, v2] of Object.entries(val)) {
      out[sanitizeString(k3)] = sanitizeDeep(v2);
    }
    return out;
  }
  return val;
}
function hasGraphQLShape(body) {
  if (!body || typeof body !== "object")
    return false;
  const b3 = body;
  if (typeof b3.query === "string" && /^\s*(query|mutation|subscription|fragment|\{)/.test(b3.query))
    return true;
  if (typeof b3.operationName === "string" && (("variables" in b3) || ("query" in b3) || ("doc_id" in b3)))
    return true;
  if ("doc_id" in b3 && "variables" in b3)
    return true;
  return false;
}
function gqlActionFromBody(body) {
  if (typeof body === "object" && body !== null) {
    const b3 = body;
    if (typeof b3.operationName === "string" && b3.operationName)
      return b3.operationName;
    if (typeof b3.fb_api_req_friendly_name === "string")
      return b3.fb_api_req_friendly_name;
    if (b3.doc_id != null)
      return `doc_${String(b3.doc_id)}`;
    if (typeof b3.queryId === "string")
      return b3.queryId;
    if (typeof b3.query === "string") {
      const m5 = b3.query.match(/\b(?:query|mutation|subscription)\s+(\w+)/);
      if (m5)
        return m5[1];
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
  const path10 = req.path;
  const lowerPath = path10.toLowerCase();
  const ct4 = (req.requestHeaders["content-type"] || req.requestHeaders["Content-Type"] || "").toLowerCase();
  const body = req.requestBody;
  if (ct4.includes("application/grpc")) {
    return { protocol: "grpc-web", action: path10.replace(/^\//, "") };
  }
  const soapAction = req.requestHeaders["soapaction"] || req.requestHeaders["SOAPAction"];
  if (soapAction || ct4.includes("text/xml") || ct4.includes("application/soap+xml")) {
    return { protocol: "soap", action: (soapAction || path10).replace(/^["/]|["/]$/g, "") };
  }
  if (/\/graphql\b/.test(lowerPath) || hasGraphQLShape(body)) {
    return { protocol: "graphql", action: gqlActionFromBody(body) ?? "anonymous" };
  }
  if (body && typeof body === "object") {
    const b3 = body;
    if (typeof b3.jsonrpc === "string" && typeof b3.method === "string") {
      return { protocol: "json-rpc", action: b3.method };
    }
  }
  if (typeof body === "string" && /fb_api_req_friendly_name=|^[^=&]+=.+&/.test(body)) {
    const friendly = gqlActionFromBody(body);
    if (friendly)
      return { protocol: "form-rpc", action: friendly };
  }
  return { protocol: "rest", action: `${req.method} ${parameterizePath(path10)}` };
}
function inferVerb(protocol, action, method, responseBody) {
  const lower = action.toLowerCase();
  if (protocol === "rest") {
    const m5 = method.toUpperCase();
    if (m5 === "DELETE")
      return "delete";
    if (m5 === "POST")
      return "create";
    if (m5 === "PUT" || m5 === "PATCH")
      return "update";
    if (m5 === "GET")
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
    const q2 = isRecord(responseBody) ? responseBody.query : undefined;
    if (typeof q2 === "string" && /^\s*mutation\b/.test(q2))
      return "action";
    return "read";
  }
  return "action";
}
function pascalCase(s4) {
  return s4.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).map((w2) => w2.charAt(0).toUpperCase() + w2.slice(1)).join("");
}
function camelCase(s4) {
  const p5 = pascalCase(s4);
  return p5.charAt(0).toLowerCase() + p5.slice(1);
}
function buildFunctionName(protocol, action, method, verb) {
  if (protocol === "rest") {
    const parts = action.split(" ");
    const httpMethod = parts[0];
    const path10 = parts.slice(1).join(" ");
    const segs = path10.split("/").filter((s4) => s4 && !s4.startsWith("{"));
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
    const cookieStr = Object.entries(auth.cookies).map(([k3, v2]) => `${k3}=${v2}`).join("; ");
    parts.push(`  -H 'Cookie: ${cookieStr}'`);
  }
  for (const [k3, v2] of Object.entries(auth.tokens)) {
    parts.push(`  -H '${k3}: ${v2}'`);
  }
  for (const [k3, v2] of Object.entries(headers)) {
    parts.push(`  -H '${k3}: ${v2}'`);
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
    this.pageHandler = (p5) => this.hookPage(p5);
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
          const ct4 = (allHeaders["content-type"] || allHeaders["Content-Type"] || "").toLowerCase();
          const postData = req.postData();
          if (postData) {
            if (ct4.includes("multipart/form-data")) {
              const fields = [...postData.matchAll(/name="([^"]+)"/g)].map((m5) => m5[1]);
              requestBody = { _type: "multipart/form-data", fields: [...new Set(fields)] };
            } else if (ct4.includes("application/octet-stream") || ct4.startsWith("video/") || ct4.startsWith("image/") || ct4.startsWith("audio/")) {
              requestBody = { _type: ct4, _size: postData.length };
            } else if (postData.length < 500000) {
              requestBody = sanitizeDeep(tryParseJson(postData) ?? postData);
            } else {
              requestBody = `[body truncated — ${postData.length} bytes, content-type: ${ct4}]`;
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
  hookPage(p5) {
    if (this.hookedPages.has(p5))
      return;
    this.hookedPages.add(p5);
    p5.on("request", this.requestHandler);
    p5.on("response", this.responseHandler);
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
    for (const p5 of this.hookedPages) {
      try {
        p5.off("request", this.requestHandler);
        p5.off("response", this.responseHandler);
      } catch {}
    }
    this.hookedPages.clear();
  }
  async drain(ms = 3000, pendingTimeoutMs = 5000) {
    await new Promise((r4) => setTimeout(r4, ms));
    const deadline = Date.now() + pendingTimeoutMs;
    while (this.pendingRequests.size > 0 && Date.now() < deadline) {
      await new Promise((r4) => setTimeout(r4, 100));
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
      endpoints: Array.from(endpointMap.values()).sort((a6, b3) => a6.triggeredAtStep - b3.triggeredAtStep),
      capturedAt: new Date().toISOString()
    });
  }
  return apis.sort((a6, b3) => b3.endpoints.length - a6.endpoints.length);
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
  onNewPage = (p5) => {
    if (this.disposed)
      return;
    this.pages.push(p5);
    this.newlyOpened.push(p5);
    p5.on("close", () => this.onClose(p5));
    log15.debug(`new tab opened: ${safeUrl(p5)}`);
  };
  onClose = (p5) => {
    this.pages = this.pages.filter((x2) => x2 !== p5);
    this.newlyOpened = this.newlyOpened.filter((x2) => x2 !== p5);
    if (this.activePage === p5) {
      this.activePage = this.pages[this.pages.length - 1] ?? p5;
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
      await target.waitForURL((u5) => {
        const s4 = u5.toString();
        return !!s4 && s4 !== "about:blank";
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
function safeUrl(p5) {
  try {
    return p5.url();
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
  return import_path11.default.join(getKnowledgeDir(), `${sanitizeDomain(domain)}.anchors.json`);
}
function loadComponentMap(domain) {
  const norm = normalizeDomain(domain);
  try {
    const raw = import_fs12.default.readFileSync(anchorsPath(norm), "utf8");
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
  for (const [name, a6] of Object.entries(cm.anchors))
    map.set(name, a6);
  return map;
}
function write(cm) {
  import_fs12.default.mkdirSync(getKnowledgeDir(), { recursive: true });
  import_fs12.default.writeFileSync(anchorsPath(cm.domain), JSON.stringify(cm, null, 2), "utf8");
}
function recordAnchorResult(domain, name, ok, now) {
  try {
    const cm = loadComponentMap(domain);
    const a6 = cm.anchors[name];
    if (!a6)
      return;
    if (ok) {
      a6.uses += 1;
      a6.lastVerified = now;
    } else {
      a6.fails += 1;
    }
    write(cm);
  } catch {}
}
var import_fs12, import_path11;
var init_component_map = __esm(() => {
  init_knowledge();
  import_fs12 = __toESM(require("fs"));
  import_path11 = __toESM(require("path"));
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
  const usedEphemeralRef = typeof step.selector === "string" && step.selector.startsWith("@e");
  if (usedEphemeralRef && (errorType === "element-not-found" || errorType === "timeout" || errorType === "stale-state")) {
    return "The @e ref went stale — the page (likely a React/SPA) re-rendered and dropped it since the snapshot. Take a fresh `snapshot`/`find` right before acting, or save the element as a durable `@a:` anchor with the `remember` tool.";
  }
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
    const navStep = pipeline.steps.find((s4) => s4.type === "navigate");
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
    for (let i5 = 0;i5 < pipeline.steps.length; i5++) {
      if (capture)
        capture.setStep(i5);
      const step = pipeline.steps[i5];
      const page = tracker.active();
      const urlBefore = safePageUrl(page);
      const monitor = new StaleStateMonitor(page, staleTimeoutMs);
      let stepResult;
      try {
        stepResult = await monitor.withMonitoring(async () => {
          const r4 = await executeAction(page, step, this.ctx, monitor);
          r4.stepIndex = i5;
          return r4;
        });
      } catch (err) {
        const asError = err instanceof Error ? err : new Error(String(err));
        const errorType = classifyError(asError, step);
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        stepResult = failedStepResult(step, asError.message, Date.now() - startTime, i5);
        results.push(stepResult);
        recordAnchor(step, false);
        return {
          ok: false,
          completedSteps: i5,
          totalSteps: pipeline.steps.length,
          results,
          obstacles,
          finalState: pageState,
          error: {
            failedAtStep: i5,
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
          stepResult.screenshotUrl = saveScreenshot(buf, `step-${i5}-${Date.now()}.jpg`, this.ctx.screenshotDir, this.ctx.publicUrl);
        } catch {}
      }
      results.push(stepResult);
      if (!stepResult.ok && !continueOnError) {
        const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
        const errorType = classifyError(new Error(stepResult.error || ""), step);
        return {
          ok: false,
          completedSteps: i5,
          totalSteps: pipeline.steps.length,
          results,
          obstacles,
          finalState: pageState,
          error: {
            failedAtStep: i5,
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
            detectedAtStep: i5,
            resolved: resolution.resolved,
            resolution: resolution.resolution,
            durationMs: Date.now() - obstacleStart
          });
          if (!resolution.resolved && obstacle.type === "captcha") {
            const pageState = await capturePageState(tracker.active(), this.ctx, { screenshot: true });
            return {
              ok: false,
              completedSteps: i5,
              totalSteps: pipeline.steps.length,
              results,
              obstacles,
              finalState: pageState,
              error: {
                failedAtStep: i5,
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
  const firstNav = pipeline.steps.find((s4) => s4.type === "navigate");
  if (!firstNav || firstNav.type !== "navigate")
    return;
  let domain;
  try {
    domain = new URL(firstNav.url).hostname;
  } catch {
    return;
  }
  const domainRoot = domain.replace(/^www\./, "");
  const hadLogin = pipeline.steps.some((s4) => s4.type === "login");
  const auth = { type: "unknown" };
  const cookieNames = [];
  const localStorageKeys = [];
  const sessionStorageKeys = [];
  if (sessionData) {
    for (const c6 of sessionData.cookies ?? []) {
      if (c6.domain.endsWith(domainRoot) || domainRoot.endsWith(c6.domain.replace(/^\./, ""))) {
        if (!cookieNames.includes(c6.name))
          cookieNames.push(c6.name);
      }
    }
    for (const [origin, store] of Object.entries(sessionData.localStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k3 of Object.keys(store)) {
          if (!localStorageKeys.includes(k3))
            localStorageKeys.push(k3);
        }
      }
    }
    for (const [origin, store] of Object.entries(sessionData.sessionStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k3 of Object.keys(store)) {
          if (!sessionStorageKeys.includes(k3))
            sessionStorageKeys.push(k3);
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
  if (result.obstacles?.some((o6) => o6.type?.includes("captcha")))
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
    for (let i5 = 0;i5 < list.length; i5++) {
      const buf = list[i5];
      target.set(buf, offset);
      offset += buf.length;
    }
    if (offset < totalLength) {
      return new FastBuffer(target.buffer, target.byteOffset, offset);
    }
    return target;
  }
  function _mask(source, mask, output, offset, length) {
    for (let i5 = 0;i5 < length; i5++) {
      output[offset + i5] = source[i5] ^ mask[i5 & 3];
    }
  }
  function _unmask(buffer, mask) {
    for (let i5 = 0;i5 < buffer.length; i5++) {
      buffer[i5] ^= mask[i5 & 3];
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
    } catch (e4) {}
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
    let i5 = 0;
    while (i5 < len) {
      if ((buf[i5] & 128) === 0) {
        i5++;
      } else if ((buf[i5] & 224) === 192) {
        if (i5 + 1 === len || (buf[i5 + 1] & 192) !== 128 || (buf[i5] & 254) === 192) {
          return false;
        }
        i5 += 2;
      } else if ((buf[i5] & 240) === 224) {
        if (i5 + 2 >= len || (buf[i5 + 1] & 192) !== 128 || (buf[i5 + 2] & 192) !== 128 || buf[i5] === 224 && (buf[i5 + 1] & 224) === 128 || buf[i5] === 237 && (buf[i5 + 1] & 224) === 160) {
          return false;
        }
        i5 += 3;
      } else if ((buf[i5] & 248) === 240) {
        if (i5 + 3 >= len || (buf[i5 + 1] & 192) !== 128 || (buf[i5 + 2] & 192) !== 128 || (buf[i5 + 3] & 192) !== 128 || buf[i5] === 240 && (buf[i5 + 1] & 240) === 128 || buf[i5] === 244 && buf[i5 + 1] > 143 || buf[i5] > 244) {
          return false;
        }
        i5 += 4;
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
    } catch (e4) {}
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
    consume(n4) {
      this._bufferedBytes -= n4;
      if (n4 === this._buffers[0].length)
        return this._buffers.shift();
      if (n4 < this._buffers[0].length) {
        const buf = this._buffers[0];
        this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n4, buf.length - n4);
        return new FastBuffer(buf.buffer, buf.byteOffset, n4);
      }
      const dst = Buffer.allocUnsafe(n4);
      do {
        const buf = this._buffers[0];
        const offset = dst.length - n4;
        if (n4 >= buf.length) {
          dst.set(this._buffers.shift(), offset);
        } else {
          dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n4), offset);
          this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n4, buf.length - n4);
        }
        n4 -= buf.length;
      } while (n4 > 0);
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
      perMessageDeflate.compress(data, options.fin, (_2, buf) => {
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
    for (let i5 = 0;i5 < sender._queue.length; i5++) {
      const params = sender._queue[i5];
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
    let i5 = 0;
    for (;i5 < header.length; i5++) {
      code = header.charCodeAt(i5);
      if (extensionName === undefined) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i5;
        } else if (i5 !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1)
            end = i5;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i5}`);
          }
          if (end === -1)
            end = i5;
          const name = header.slice(start, end);
          if (code === 44) {
            push(offers, name, params);
            params = Object.create(null);
          } else {
            extensionName = name;
          }
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i5}`);
        }
      } else if (paramName === undefined) {
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i5;
        } else if (code === 32 || code === 9) {
          if (end === -1 && start !== -1)
            end = i5;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i5}`);
          }
          if (end === -1)
            end = i5;
          push(params, header.slice(start, end), true);
          if (code === 44) {
            push(offers, extensionName, params);
            params = Object.create(null);
            extensionName = undefined;
          }
          start = end = -1;
        } else if (code === 61 && start !== -1 && end === -1) {
          paramName = header.slice(start, i5);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i5}`);
        }
      } else {
        if (isEscaping) {
          if (tokenChars[code] !== 1) {
            throw new SyntaxError(`Unexpected character at index ${i5}`);
          }
          if (start === -1)
            start = i5;
          else if (!mustUnescape)
            mustUnescape = true;
          isEscaping = false;
        } else if (inQuotes) {
          if (tokenChars[code] === 1) {
            if (start === -1)
              start = i5;
          } else if (code === 34 && start !== -1) {
            inQuotes = false;
            end = i5;
          } else if (code === 92) {
            isEscaping = true;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i5}`);
          }
        } else if (code === 34 && header.charCodeAt(i5 - 1) === 61) {
          inQuotes = true;
        } else if (end === -1 && tokenChars[code] === 1) {
          if (start === -1)
            start = i5;
        } else if (start !== -1 && (code === 32 || code === 9)) {
          if (end === -1)
            end = i5;
        } else if (code === 59 || code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i5}`);
          }
          if (end === -1)
            end = i5;
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
          throw new SyntaxError(`Unexpected character at index ${i5}`);
        }
      }
    }
    if (start === -1 || inQuotes || code === 32 || code === 9) {
      throw new SyntaxError("Unexpected end of input");
    }
    if (end === -1)
      end = i5;
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
        return [extension].concat(Object.keys(params).map((k3) => {
          let values = params[k3];
          if (!Array.isArray(values))
            values = [values];
          return values.map((v2) => v2 === true ? k3 : `${k3}=${v2}`).join("; ");
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
  var net2 = require("net");
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
        } catch (e4) {
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
    return net2.connect(options);
  }
  function tlsConnect(options) {
    options.path = undefined;
    if (!options.servername && options.servername !== "") {
      options.servername = net2.isIP(options.host) ? "" : options.host;
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
    let i5 = 0;
    for (i5;i5 < header.length; i5++) {
      const code = header.charCodeAt(i5);
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1)
          start = i5;
      } else if (i5 !== 0 && (code === 32 || code === 9)) {
        if (end === -1 && start !== -1)
          end = i5;
      } else if (code === 44) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i5}`);
        }
        if (end === -1)
          end = i5;
        const protocol2 = header.slice(start, end);
        if (protocols.has(protocol2)) {
          throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
        }
        protocols.add(protocol2);
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i5}`);
      }
    }
    if (start === -1 || end !== -1) {
      throw new SyntaxError("Unexpected end of input");
    }
    const protocol = header.slice(start, i5);
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
` + Object.keys(headers).map((h2) => `${h2}: ${headers[h2]}`).join(`\r
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

// src/lib/version.ts
function getVersion() {
  if (cached)
    return cached;
  if (process.env.IFRAMER_VERSION)
    return cached = process.env.IFRAMER_VERSION;
  const candidates = [
    import_path12.default.join(__dirname, "..", "..", "package.json"),
    import_path12.default.join(__dirname, "..", "package.json"),
    import_path12.default.join(process.cwd(), "package.json")
  ];
  for (const p5 of candidates) {
    try {
      const v2 = JSON.parse(import_fs13.default.readFileSync(p5, "utf8")).version;
      if (v2)
        return cached = v2;
    } catch {}
  }
  return cached = "0.0.0";
}
var import_fs13, import_path12, __dirname = "/Users/redacted/tools/iframer-toolkit/src/lib", cached = null;
var init_version = __esm(() => {
  import_fs13 = __toESM(require("fs"));
  import_path12 = __toESM(require("path"));
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
          const m5 = JSON.parse(data.toString());
          if (m5?.type === "auth" && m5.token === expected) {
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
    try {
      ws.send(JSON.stringify({ type: "server_info", version: getVersion() }));
    } catch {}
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
    for (const [id, p5] of this.pending) {
      if (p5.clientId === client.clientId) {
        clearTimeout(p5.timer);
        p5.reject(new Error("Extension disconnected before responding."));
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
        const fn3 = this.cdpListeners.get(cdpKey(client.clientId, ev.tabId));
        if (fn3)
          fn3(ev);
      }
      return;
    }
    if (typeof msg.id !== "number")
      return;
    const p5 = this.pending.get(msg.id);
    if (!p5 || p5.clientId !== client.clientId)
      return;
    this.pending.delete(msg.id);
    clearTimeout(p5.timer);
    if (msg.ok)
      p5.resolve(msg.result);
    else
      p5.reject(new Error(msg.error || "Extension reported an error."));
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
      } catch (e4) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e4 instanceof Error ? e4 : new Error(String(e4)));
      }
    });
  }
  hasClients() {
    return this.clients.size > 0;
  }
  status() {
    return {
      connected: this.clients.size > 0,
      clients: [...this.clients.values()].map((c6) => ({
        clientId: c6.clientId,
        profileId: c6.profileId,
        profileName: c6.profileName,
        extVersion: c6.extVersion,
        connectedAt: new Date(c6.connectedAt).toISOString(),
        tabCount: c6.tabs.length
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
        const tagged = (res.tabs || []).map((t5) => ({
          ...t5,
          clientId: client.clientId,
          profileId: client.profileId,
          profileName: client.profileName
        }));
        client.tabs = tagged;
        for (const t5 of tagged) {
          const prev = this.tabOwner.get(t5.id);
          if (prev !== undefined && prev !== client.clientId)
            this.collidingTabs.add(t5.id);
          this.tabOwner.set(t5.id, client.clientId);
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
      const c6 = this.clients.get(clientId);
      if (!c6)
        throw new Error(`No connected extension with clientId ${clientId}.`);
      return c6;
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
      const c6 = this.clients.get(owner);
      if (c6)
        return c6;
    }
    throw new Error(`Could not determine which browser profile owns tab ${tabId}. Call \`tabs\` to ` + `refresh the list, then pass the tab's clientId alongside tabId.`);
  }
  resolveClientNoTab(clientId) {
    if (clientId) {
      const c6 = this.clients.get(clientId);
      if (!c6)
        throw new Error(`No connected extension with clientId ${clientId}.`);
      return c6;
    }
    if (this.clients.size === 0) {
      throw new Error("No iframer extension is connected. Open Chrome, install/enable the iframer " + "extension, and pair it (paste the token, dot goes green).");
    }
    if (this.clients.size === 1)
      return [...this.clients.values()][0];
    throw new Error("Multiple browser profiles are connected — pass clientId to say which one to act in. " + "Call `tabs` to see the profiles and their clientIds.");
  }
  async reloadAll() {
    const clients = [...this.clients.values()];
    await Promise.all(clients.map((c6) => this.send(c6, "reload", {}).catch(() => {})));
    return { reloaded: clients.length };
  }
  async groupTabs(tabIds, opts = {}, clientId) {
    const client = clientId ? this.resolveClientNoTab(clientId) : await this.resolveClient(tabIds[0]);
    return this.send(client, "group_tabs", {
      tabIds,
      title: opts.title,
      color: opts.color,
      collapsed: opts.collapsed,
      groupId: opts.groupId
    });
  }
  async ungroupTabs(tabIds, clientId) {
    const client = clientId ? this.resolveClientNoTab(clientId) : await this.resolveClient(tabIds[0]);
    return this.send(client, "ungroup_tabs", { tabIds });
  }
  async updateGroup(groupId, opts, clientId) {
    const client = this.resolveClientNoTab(clientId);
    return this.send(client, "update_group", { groupId, ...opts });
  }
  async listGroups(clientId) {
    const client = this.resolveClientNoTab(clientId);
    return this.send(client, "list_groups", {});
  }
  async createTab(url, opts = {}, clientId) {
    const client = this.resolveClientNoTab(clientId);
    const res = await this.send(client, "create_tab", {
      url,
      active: opts.active,
      windowId: opts.windowId
    });
    return { tab: { ...res.tab, clientId: client.clientId, profileId: client.profileId, profileName: client.profileName }, clientId: client.clientId };
  }
  addCdpListener(clientId, tabId, fn3) {
    const key = cdpKey(clientId, tabId);
    if (this.cdpListeners.has(key)) {
      throw new Error(`Tab ${tabId} is already being driven by another pipeline. Retry when it finishes.`);
    }
    this.cdpListeners.set(key, fn3);
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
  init_version();
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
    } catch (e4) {
      if (typeof id === "number") {
        this.sendToPw({ id, sessionId, error: { message: e4 instanceof Error ? e4.message : String(e4) } });
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
    const attempt = (p5) => extensionBridge.cdpCommand(this.ownerClientId, this.tabId, sessionId, "Page.captureScreenshot", p5);
    const first = attempt(base);
    first.catch(() => {
      return;
    });
    try {
      return await Promise.race([
        first,
        new Promise((_2, reject) => {
          const t5 = setTimeout(() => reject(new Error("screenshot timed out (no compositor frame)")), 1e4);
          t5.unref?.();
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
      this.wss?.clients.forEach((c6) => {
        try {
          c6.terminate();
        } catch {}
      });
    } catch {}
    try {
      this.pw?.terminate();
    } catch {}
    this.pw = null;
    const withTimeout = (fn3) => new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        fn3(finish);
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
      } catch (e4) {
        log17.warn(`cdp detach failed: ${e4}`);
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
      const run2 = (prev ? prev.catch(() => {
        return;
      }) : Promise.resolve()).then(() => this.executeExtension(userId, token, pipeline, tabId, opts.clientId));
      this.extensionTabLocks.set(lockKey, run2);
      run2.catch(() => {
        return;
      }).finally(() => {
        if (this.extensionTabLocks.get(lockKey) === run2)
          this.extensionTabLocks.delete(lockKey);
      });
      return run2;
    }
    const forcedMode = opts.mode;
    const autoEscalate = opts.autoEscalate !== false;
    const instanceId = opts.instanceId || DEFAULT_INSTANCE;
    const firstNav = pipeline.steps.find((s4) => s4.type === "navigate");
    const domain = firstNav ? new URL(firstNav.url).hostname : null;
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
      const typeChars = pipeline.steps.reduce((n4, s4) => {
        const v2 = s4.value;
        return (s4.type === "human-type" || s4.type === "type-code") && typeof v2 === "string" ? n4 + v2.length : n4;
      }, 0);
      const capMs = Math.min(60000 + pipeline.steps.length * 15000 + typeChars * 250, 1200000);
      let watchdog;
      let result;
      try {
        const runPromise = runner.run(page, pipeline);
        runPromise.catch(() => {
          return;
        });
        result = await Promise.race([
          runPromise,
          new Promise((_2, reject) => {
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
        } catch (e4) {
          log18.warn(`knowledge update failed: ${getErrorMessage(e4)}`);
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
      const firstNav = pipeline.steps.find((s4) => s4.type === "navigate");
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
    const total = capturedApi.reduce((n4, a6) => n4 + a6.endpoints.length, 0);
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
        for (let i5 = 0;i5 < window.localStorage.length; i5++) {
          const k3 = window.localStorage.key(i5);
          ls[k3] = window.localStorage.getItem(k3) ?? "";
        }
        for (let i5 = 0;i5 < window.sessionStorage.length; i5++) {
          const k3 = window.sessionStorage.key(i5);
          ss[k3] = window.sessionStorage.getItem(k3) ?? "";
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
      message: `${cookies.length} cookies, ${Object.values(localStorage).reduce((n4, s4) => n4 + Object.keys(s4).length, 0)} localStorage keys, ${Object.values(sessionStorage).reduce((n4, s4) => n4 + Object.keys(s4).length, 0)} sessionStorage keys.`
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
            await this.store.setSession(sessionStoreKey(userId, inst.sessionProfile ?? inst.instanceId), encrypted);
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
  listInstances() {
    return this.daemon.instancesInfo();
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
var import_path13, import_url, log19, DEFAULT_SCREENSHOT_DIR, DEFAULT_PUBLIC_URL, DEFAULT_STALE_TIMEOUT_MS3 = 20000;
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
  import_path13 = __toESM(require("path"));
  import_url = require("url");
  log19 = createLogger("iframer");
  DEFAULT_SCREENSHOT_DIR = import_path13.default.join(import_path13.default.dirname(import_url.fileURLToPath("file:///Users/redacted/tools/iframer-toolkit/src/lib/iframer.ts")), "../../.screenshots");
  DEFAULT_PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;
});

// src/lib/format-result.ts
var exports_format_result = {};
__export(exports_format_result, {
  formatExecuteResult: () => formatExecuteResult
});
function resultOf(r4, _type) {
  return r4.result;
}
function captchaBlocked(data) {
  if (data.error?.errorType === "captcha-unsolvable")
    return true;
  return (data.obstacles || []).some((o6) => (o6.type === "captcha" || o6.type === "hcaptcha") && !o6.resolved);
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
  for (const r4 of data.results || []) {
    if (r4.tabSwitchedTo) {
      lines.push(`
↳ step ${r4.stepIndex} opened a new tab — pipeline is now on: ${r4.tabSwitchedTo}`);
    }
  }
  const meaningful = (data.results || []).filter((r4) => r4.ok && r4.result !== undefined && r4.result !== null);
  for (const r4 of meaningful) {
    if (r4.step.type === "snapshot") {
      const res = resultOf(r4, "snapshot");
      if (res?.snapshot) {
        lines.push(`
--- Snapshot (${res.elementCount} elements) ---`);
        lines.push(res.snapshot);
      }
    } else if (r4.step.type === "find") {
      const res = resultOf(r4, "find");
      if (res?.ref) {
        lines.push(`
Found: ${res.ref} ${res.role} "${res.name}" (${res.matchCount} match${res.matchCount > 1 ? "es" : ""})`);
      }
    } else if (r4.step.type === "screenshot") {
      const res = resultOf(r4, "screenshot");
      if (res?.refs) {
        lines.push(`
--- Annotated screenshot refs ---`);
        lines.push(res.refs);
      }
    } else if (r4.step.type === "read") {
      const res = r4.result;
      if (res?.text !== undefined) {
        lines.push(`
--- Read (step ${r4.stepIndex}${res.truncated ? ", truncated" : ""}) ---`);
        lines.push(res.text);
      }
    } else if (r4.step.type === "extract" || r4.step.type === "evaluate") {
      lines.push(`
step ${r4.stepIndex} (${r4.step.type}): ${JSON.stringify(r4.result)}`);
    }
  }
  if (data.obstacles && data.obstacles.length > 0) {
    lines.push(`
Obstacles handled:`);
    for (const o6 of data.obstacles) {
      lines.push(`  [step ${o6.detectedAtStep}] ${o6.type}: ${o6.resolved ? o6.resolution : "UNRESOLVED - " + (o6.resolution || "unknown")}`);
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

// bin/cli.js
var __dirname = "/Users/redacted/tools/iframer-toolkit/bin";
var fs13 = require("fs");
var os4 = require("os");
var path13 = require("path");
var { execSync: execSync3 } = require("child_process");
var readline = require("readline");
var HOME_DIR = os4.homedir();
var CONFIG_DIR = process.env.IFRAMER_DATA_DIR || path13.join(HOME_DIR, ".iframer");
var CLAUDE_CONFIG_PATH = path13.join(HOME_DIR, ".claude.json");
var CODEX_CONFIG_PATH = path13.join(HOME_DIR, ".codex", "config.toml");
var DEFAULT_SERVER = process.env.IFRAMER_URL || "http://localhost:3021";
var API_KEY = process.env.IFRAMER_SECRET;
var USE_LOCAL = process.env.IFRAMER_MODE === "local" || !process.env.IFRAMER_URL;
var LOCAL_USER_ID = "iframer-local";
function resolveLocalToken() {
  if (process.env.IFRAMER_SECRET)
    return process.env.IFRAMER_SECRET;
  const candidates = [
    path13.join(CONFIG_DIR, "secret"),
    path13.join(process.env.XDG_RUNTIME_DIR || os4.tmpdir(), "iframer-secret")
  ];
  for (const file of candidates) {
    try {
      const existing = fs13.readFileSync(file, "utf8").trim();
      if (existing)
        return existing;
    } catch {}
  }
  for (const file of candidates) {
    try {
      fs13.mkdirSync(path13.dirname(file), { recursive: true });
      const secret = require("crypto").randomBytes(32).toString("hex");
      fs13.writeFileSync(file, secret, { mode: 384 });
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
  const mcpServerTS = path13.join(__dirname, "..", "src", "mcp", "server.ts");
  const mcpServerCJS = path13.join(__dirname, "mcp-server.cjs");
  let bunPath;
  try {
    bunPath = execSync3("which bun", { encoding: "utf8" }).trim();
  } catch {}
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
  if (secret)
    return secret;
  try {
    const envPath = path13.join(__dirname, "..", ".env");
    const envContent = fs13.readFileSync(envPath, "utf8");
    const match = envContent.match(/^IFRAMER_SECRET=(.+)$/m);
    if (match)
      secret = match[1].trim();
  } catch {}
  return secret;
}
function installSkill() {
  const candidates = [
    path13.join(__dirname, "..", "skills", "iframer.md"),
    path13.join(__dirname, "skills", "iframer.md")
  ];
  let source = null;
  for (const c6 of candidates) {
    if (fs13.existsSync(c6)) {
      source = c6;
      break;
    }
  }
  if (!source)
    return false;
  const destDir = path13.join(HOME_DIR, ".claude", "commands");
  const dest = path13.join(destDir, "iframer.md");
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
  const dest = path13.join(HOME_DIR, ".claude", "commands", "iframer.md");
  try {
    if (fs13.existsSync(dest)) {
      fs13.unlinkSync(dest);
      return true;
    }
  } catch {}
  return false;
}
function writeMachineSecret(secret) {
  try {
    fs13.mkdirSync(CONFIG_DIR, { recursive: true });
    fs13.writeFileSync(path13.join(CONFIG_DIR, "secret"), secret, { mode: 384 });
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
  if (!config.mcpServers)
    config.mcpServers = {};
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
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function findCodexMcpSection(content, mcpName) {
  const lines = content.split(`
`);
  const mainHeader = `[mcp_servers.${mcpName}]`;
  const nestedPrefix = `[mcp_servers.${mcpName}.`;
  let start = -1;
  for (let i5 = 0;i5 < lines.length; i5 += 1) {
    if (lines[i5].trim() === mainHeader) {
      start = i5;
      break;
    }
  }
  if (start === -1)
    return null;
  let end = lines.length;
  for (let i5 = start + 1;i5 < lines.length; i5 += 1) {
    const line = lines[i5].trim();
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith(nestedPrefix)) {
      end = i5;
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
  fs13.mkdirSync(path13.dirname(CODEX_CONFIG_PATH), { recursive: true });
  let content = "";
  try {
    content = fs13.readFileSync(CODEX_CONFIG_PATH, "utf8");
  } catch {}
  const existing = findCodexMcpSection(content, mcpName);
  if (existing) {
    content = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join(`
`);
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
  const next = [...existing.lines.slice(0, existing.start), ...existing.lines.slice(existing.end)].join(`
`).replace(/\n{3,}/g, `

`).trimEnd();
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
    const { readServerInfo: readServerInfo2, isPidAlive: isPidAlive2 } = await Promise.resolve().then(() => (init_registry(), exports_registry));
    const { LocalServerManager: LocalServerManager2 } = await Promise.resolve().then(() => (init_local_server(), exports_local_server));
    const manager = new LocalServerManager2;
    const info = readServerInfo2();
    if (info && isPidAlive2(info.pid)) {
      let ownVersion = null;
      try {
        ownVersion = JSON.parse(fs13.readFileSync(path13.join(__dirname, "..", "package.json"), "utf8")).version;
      } catch {}
      if (ownVersion && info.version !== ownVersion) {
        try {
          await fetch(`http://127.0.0.1:${info.port}/shutdown`, {
            method: "POST",
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(3000)
          });
        } catch {}
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline && isPidAlive2(info.pid)) {
          await new Promise((r4) => setTimeout(r4, 200));
        }
        if (isPidAlive2(info.pid)) {
          try {
            process.kill(info.pid, "SIGKILL");
          } catch {}
        }
      }
    }
    await manager.ensureRunning();
    const res = await fetch(`${manager.getBaseUrl()}/execute`, {
      method: "POST",
      headers: { "x-api-key": LOCAL_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ steps, options }),
      signal: AbortSignal.timeout(180000)
    });
    if (!res.ok)
      return null;
    return await res.json();
  } catch {
    return null;
  }
}
var _iframer = null;
async function getLocalIframer() {
  if (_iframer)
    return _iframer;
  try {
    const { Iframer: Iframer2 } = await Promise.resolve().then(() => (init_iframer(), exports_iframer));
    const screenshotDir = path13.join(os4.tmpdir(), "iframer-screenshots");
    fs13.mkdirSync(screenshotDir, { recursive: true });
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
    fs13.writeFileSync(screenshotPath, Buffer.from(screenshot2, "base64"));
    rest._screenshotSaved = screenshotPath;
  }
  if (tileScreenshots && tileScreenshots.length > 0) {
    const tileDir = "/tmp/browser-tiles";
    fs13.mkdirSync(tileDir, { recursive: true });
    const tilePaths = [];
    for (const tile of tileScreenshots) {
      if (tile.screenshot) {
        const tilePath = `${tileDir}/tile-${tile.index}.png`;
        fs13.writeFileSync(tilePath, Buffer.from(tile.screenshot, "base64"));
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
if (command === "extension") {
  const sub = args.shift();
  if (sub === "path")
    command = "extension-path";
  else {
    console.error("  Usage: iframer extension path");
    process.exit(1);
  }
}
async function installChrome() {
  const { downloadChrome: downloadChrome2 } = await Promise.resolve().then(() => (init_chrome_downloader(), exports_chrome_downloader));
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
  return path13.join(__dirname, "..", "extension");
}
function semverNewer(a6, b3) {
  const pa = String(a6).split(".").map((n4) => parseInt(n4, 10) || 0);
  const pb = String(b3).split(".").map((n4) => parseInt(n4, 10) || 0);
  for (let i5 = 0;i5 < 3; i5++) {
    if ((pa[i5] || 0) > (pb[i5] || 0))
      return true;
    if ((pa[i5] || 0) < (pb[i5] || 0))
      return false;
  }
  return false;
}
async function reloadAndRestartServer(reloadExtension) {
  let info = null;
  try {
    info = JSON.parse(fs13.readFileSync(path13.join(CONFIG_DIR, "server.json"), "utf8"));
  } catch {}
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
    try {
      await fetch(`${base}/extension/reload`, { method: "POST", headers });
      console.log("  Told the extension to reload.");
    } catch {}
    await new Promise((r4) => setTimeout(r4, 1000));
  }
  try {
    await fetch(`${base}/shutdown`, { method: "POST", headers });
    console.log("  Retired the old server (a fresh one spawns on next use).");
  } catch {}
}
var NM_HOST_NAME = "com.iframer.token";
function nativeMessagingBrowserDirs() {
  if (process.platform === "darwin") {
    const as = path13.join(HOME_DIR, "Library", "Application Support");
    return [
      { browser: "Chrome", dir: path13.join(as, "Google", "Chrome"), always: true },
      { browser: "Chrome Beta", dir: path13.join(as, "Google", "Chrome Beta") },
      { browser: "Chrome Canary", dir: path13.join(as, "Google", "Chrome Canary") },
      { browser: "Chromium", dir: path13.join(as, "Chromium") },
      { browser: "Brave", dir: path13.join(as, "BraveSoftware", "Brave-Browser") },
      { browser: "Edge", dir: path13.join(as, "Microsoft Edge") },
      { browser: "Vivaldi", dir: path13.join(as, "Vivaldi") },
      { browser: "Arc", dir: path13.join(as, "Arc", "User Data") }
    ];
  }
  const cfg = process.env.XDG_CONFIG_HOME || path13.join(HOME_DIR, ".config");
  return [
    { browser: "Chrome", dir: path13.join(cfg, "google-chrome"), always: true },
    { browser: "Chrome Beta", dir: path13.join(cfg, "google-chrome-beta") },
    { browser: "Chromium", dir: path13.join(cfg, "chromium") },
    { browser: "Brave", dir: path13.join(cfg, "BraveSoftware", "Brave-Browser") },
    { browser: "Edge", dir: path13.join(cfg, "microsoft-edge") },
    { browser: "Vivaldi", dir: path13.join(cfg, "vivaldi") }
  ];
}
function extensionMarkerPath() {
  return path13.join(CONFIG_DIR, "extension.json");
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
  fs13.writeFileSync(extensionMarkerPath(), JSON.stringify({ installed: true, flavor, browsers, installedAt: new Date().toISOString() }, null, 2));
}
function clearExtensionMarker() {
  try {
    fs13.unlinkSync(extensionMarkerPath());
  } catch {}
}
var EXTENSION_FLAVORS = {
  chrome: { label: "Chrome (Chromium family)", supported: true },
  chromium: { label: "Chrome (Chromium family)", supported: true },
  firefox: { label: "Firefox", supported: false }
};
function installExtensionHost() {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    console.error("  Extension auto-pairing is only supported on macOS and Linux.");
    process.exit(1);
  }
  resolveLocalToken();
  const srcHost = path13.join(__dirname, "..", "extension", "native-host.cjs");
  if (!fs13.existsSync(srcHost)) {
    console.error(`  Host script not found: ${srcHost}`);
    process.exit(1);
  }
  fs13.mkdirSync(CONFIG_DIR, { recursive: true });
  const hostScript = path13.join(CONFIG_DIR, "extension-token-host.cjs");
  fs13.copyFileSync(srcHost, hostScript);
  const wrapper = path13.join(CONFIG_DIR, "extension-token-host.sh");
  fs13.writeFileSync(wrapper, [
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
    if (!always && !fs13.existsSync(dir))
      continue;
    try {
      const nmDir = path13.join(dir, "NativeMessagingHosts");
      fs13.mkdirSync(nmDir, { recursive: true });
      fs13.writeFileSync(path13.join(nmDir, `${NM_HOST_NAME}.json`), manifest);
      installed.push(browser);
    } catch (e4) {
      console.error(`  ${browser}: failed (${e4.message})`);
    }
  }
  if (installed.length)
    writeExtensionMarker("chrome", installed);
  return installed;
}
function removeExtensionHost() {
  const removed = [];
  for (const { browser, dir } of nativeMessagingBrowserDirs()) {
    const file = path13.join(dir, "NativeMessagingHosts", `${NM_HOST_NAME}.json`);
    try {
      if (fs13.existsSync(file)) {
        fs13.unlinkSync(file);
        removed.push(browser);
      }
    } catch {}
  }
  for (const f3 of ["extension-token-host.cjs", "extension-token-host.sh"]) {
    try {
      fs13.unlinkSync(path13.join(CONFIG_DIR, f3));
    } catch {}
  }
  return removed;
}
async function removeChrome() {
  const chromeDir = path13.join(CONFIG_DIR, "chrome");
  if (!fs13.existsSync(chromeDir)) {
    console.log("  Chrome for Testing not found, nothing to remove.");
    return;
  }
  fs13.rmSync(chromeDir, { recursive: true, force: true });
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
    case "instances":
    case "windows": {
      let instances = null;
      let serverUp = false;
      try {
        const info = JSON.parse(fs13.readFileSync(path13.join(CONFIG_DIR, "server.json"), "utf8"));
        if (info && info.port) {
          serverUp = true;
          const res = await fetch(`http://127.0.0.1:${info.port}/instances`, {
            headers: { "x-api-key": LOCAL_TOKEN },
            signal: AbortSignal.timeout(1e4)
          });
          if (res.ok)
            instances = (await res.json()).instances;
        }
      } catch {
        serverUp = false;
      }
      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(instances || [], null, 2));
        break;
      }
      if (!serverUp) {
        console.log("  No iframer server running — no live windows.");
        break;
      }
      if (!instances) {
        console.log("  Server is running but didn't report windows (may be an older build — restart it).");
        break;
      }
      if (!instances.length) {
        console.log("  No live browser windows.");
        break;
      }
      console.log(`  ${instances.length} live window(s):
`);
      for (const i5 of instances) {
        const busy = i5.busy ? "busy" : "idle";
        const age = i5.ageSeconds < 90 ? `${i5.ageSeconds}s` : `${Math.round(i5.ageSeconds / 60)}m`;
        console.log(`  ● ${i5.instanceId}  [${i5.mode}, ${busy}, ${age}]`);
        console.log(`    ${i5.title || "(untitled)"}`);
        console.log(`    ${i5.url || "(blank)"}`);
        if (i5.sessionProfile !== i5.instanceId)
          console.log(`    session: ${i5.sessionProfile}`);
        console.log("");
      }
      console.log("  Reattach: run execute with the same instanceId and act on the");
      console.log("  current page (snapshot/read/find) — don't navigate again.");
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
          for (const e4 of entries) {
            const size = e4.sizeBytes < 1024 ? `${e4.sizeBytes}B` : `${(e4.sizeBytes / 1024).toFixed(1)}KB`;
            console.log(`    ${e4.domain.padEnd(30)} ${e4.lastMode.padEnd(16)} ${e4.lastVerified}  ${size}`);
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
      if (!process.env.LOG_LEVEL && !hasFlag(args, "--verbose"))
        process.env.LOG_LEVEL = "warn";
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
        console.error("    --json               Print raw PipelineResult JSON (default: compact agent-readable text)");
        console.error("    --in-process         Skip the shared warm server; run a private in-process browser");
        process.exit(1);
      }
      let steps, inputOptions = {};
      if (input.startsWith("[") || input.startsWith("{")) {
        const parsed = JSON.parse(input);
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options)
          inputOptions = parsed.options;
      } else if (fs13.existsSync(input)) {
        const parsed = JSON.parse(fs13.readFileSync(input, "utf-8"));
        steps = Array.isArray(parsed) ? parsed : parsed.steps;
        if (!Array.isArray(parsed) && parsed.options)
          inputOptions = parsed.options;
      } else {
        console.error(`  File not found: ${input}`);
        process.exit(1);
      }
      const options = { ...inputOptions };
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
      } else {
        result = await apiPost("/execute", { steps, options });
      }
      if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const { formatExecuteResult: formatExecuteResult2 } = await Promise.resolve().then(() => exports_format_result);
        console.log(formatExecuteResult2(result).join(`
`));
        let shot = result.error?.pageState?.screenshotUrl ?? result.finalState?.screenshotUrl;
        if (shot && shot.startsWith("http")) {
          try {
            const res = await fetch(shot, { signal: AbortSignal.timeout(1e4) });
            if (res.ok) {
              const dir = path13.join(os4.tmpdir(), "iframer-screenshots", "screenshots");
              fs13.mkdirSync(dir, { recursive: true });
              const file = path13.join(dir, `state-${Date.now()}.jpg`);
              fs13.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
              shot = `file://${file}`;
            }
          } catch {}
        }
        if (shot)
          console.log(`
Screenshot: ${shot}`);
      }
      process.exit(result.ok ? 0 : 1);
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
            const snapStep = result.results?.find((r4) => r4.step?.type === "screenshot");
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
        fs13.writeFileSync(outPath, buffer);
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
          let stopped = false;
          try {
            const info = JSON.parse(fs13.readFileSync(path13.join(CONFIG_DIR, "server.json"), "utf8"));
            if (info && info.port) {
              const res = await fetch(`http://127.0.0.1:${info.port}/interactive/stop`, {
                method: "POST",
                headers: { "x-api-key": LOCAL_TOKEN },
                signal: AbortSignal.timeout(15000)
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
        const hasFlags = args.some((a6) => a6.startsWith("--"));
        if (hasFlags && domain) {
          body.domain = domain;
          for (let i5 = 2;i5 < args.length; i5++) {
            if (args[i5] === "--username" && args[i5 + 1])
              body.username = args[++i5];
            else if (args[i5] === "--password" && args[i5 + 1])
              body.password = args[++i5];
            else if (args[i5] === "--totp-secret" && args[i5 + 1])
              body.totp_secret = args[++i5];
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
          for (const d3 of domains)
            console.log(`    - ${d3}`);
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
      } else if (fs13.existsSync(input)) {
        const parsed = JSON.parse(fs13.readFileSync(input, "utf-8"));
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
        fs13.mkdirSync(outputDir, { recursive: true });
        fs13.writeFileSync(path13.join(outputDir, "captured-api.json"), JSON.stringify(result.capturedApi, null, 2));
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
          secret = fs13.readFileSync(path13.join(CONFIG_DIR, "secret"), "utf8").trim();
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
      const file = path13.join(CONFIG_DIR, "telemetry.jsonl");
      if (args.includes("--clear")) {
        try {
          fs13.unlinkSync(file);
        } catch {}
        console.log("  Telemetry log cleared.");
        break;
      }
      let lines;
      try {
        lines = fs13.readFileSync(file, "utf8").trim().split(`
`).filter(Boolean);
      } catch {
        console.log("  No telemetry recorded yet. It logs automatically as agents use iframer");
        console.log("  (new MCP sessions only — restart a session if it predates telemetry).");
        break;
      }
      const sessions2 = new Map;
      for (const line of lines) {
        let r4;
        try {
          r4 = JSON.parse(line);
        } catch {
          continue;
        }
        let s4 = sessions2.get(r4.session);
        if (!s4) {
          s4 = { calls: 0, tokens: 0, defTokens: 0, tools: new Map, first: r4.ts, last: r4.ts };
          sessions2.set(r4.session, s4);
        }
        s4.last = r4.ts;
        if (r4.kind === "definitions")
          s4.defTokens = r4.estTokens || 0;
        else if (r4.kind === "call") {
          s4.calls++;
          s4.tokens += r4.estTokens || 0;
          const t5 = s4.tools.get(r4.tool) || { calls: 0, tokens: 0 };
          t5.calls++;
          t5.tokens += r4.estTokens || 0;
          s4.tools.set(r4.tool, t5);
        }
      }
      const fmt = (n4) => n4 >= 1000 ? `${(n4 / 1000).toFixed(1)}k` : String(n4);
      let grandCalls = 0, grandTokens = 0;
      const toolTotals = new Map;
      for (const s4 of sessions2.values()) {
        grandCalls += s4.calls;
        grandTokens += s4.tokens;
        for (const [name, t5] of s4.tools) {
          const g3 = toolTotals.get(name) || { calls: 0, tokens: 0 };
          g3.calls += t5.calls;
          g3.tokens += t5.tokens;
          toolTotals.set(name, g3);
        }
      }
      console.log(`
  iframer MCP token telemetry (estimated at ~4 chars/token, local only)
`);
      console.log(`  All time: ${sessions2.size} session(s), ${grandCalls} call(s), ~${fmt(grandTokens)} tokens of tool traffic`);
      console.log(`
  Per tool (all time):`);
      for (const [name, t5] of [...toolTotals.entries()].sort((a6, b3) => b3[1].tokens - a6[1].tokens)) {
        console.log(`    ${name.padEnd(18)} ${String(t5.calls).padStart(4)} calls  ~${fmt(t5.tokens).padStart(7)} tokens`);
      }
      console.log(`
  Recent sessions:`);
      const recent = [...sessions2.entries()].slice(-5);
      for (const [id, s4] of recent) {
        console.log(`    ${id.padEnd(20)} ${String(s4.calls).padStart(4)} calls  ~${fmt(s4.tokens).padStart(7)} tokens (+~${fmt(s4.defTokens)} definitions overhead, once per session)`);
      }
      console.log(`
  Note: definitions overhead excludes zod schema text — Claude Code's /context`);
      console.log(`  shows the exact per-session definition footprint. Clear log: iframer telemetry --clear
`);
      break;
    }
    case "install-extension": {
      const flavor = (args[0] || "chrome").toLowerCase();
      const spec = EXTENSION_FLAVORS[flavor];
      if (!spec) {
        console.error(`  Unknown browser: ${flavor}. Supported: ${Object.keys(EXTENSION_FLAVORS).filter((k3, i5, a6) => a6.indexOf(k3) === i5).join(", ")}`);
        console.error("  Usage: iframer install extension chrome");
        process.exit(1);
      }
      if (!spec.supported) {
        console.log(`  ${spec.label} extension isn't available yet — coming soon.`);
        console.log("  For now: iframer install extension chrome");
        break;
      }
      console.log(`  Installing the iframer extension for ${spec.label}...
`);
      const installed = installExtensionHost();
      if (installed.length === 0) {
        console.log("  No Chromium-family browser directories found — nothing installed.");
        break;
      }
      console.log(`  Pairing host installed for: ${installed.join(", ")}`);
      console.log(`
  ┌─ ONE manual step to finish ────────────────────────────────┐`);
      console.log("  │  1. Open  chrome://extensions");
      console.log("  │  2. Turn on  Developer mode  (top-right)");
      console.log("  │  3. Click  Load unpacked  and select this folder:");
      console.log(`  │       ${extensionDir()}`);
      console.log("  └────────────────────────────────────────────────────────────┘");
      console.log("\n  Load it from THAT path (inside the installed package) so `iframer");
      console.log("  update` can refresh it in place. Once loaded it pairs itself — no");
      console.log(`  token pasting. Get the path again anytime with: iframer extension path
`);
      break;
    }
    case "extension-path": {
      console.log(extensionDir());
      break;
    }
    case "update": {
      const checkOnly = args.includes("--check");
      const pkgRoot = path13.join(__dirname, "..");
      const isDev = fs13.existsSync(path13.join(pkgRoot, ".git"));
      let installed = "unknown";
      try {
        installed = JSON.parse(fs13.readFileSync(path13.join(pkgRoot, "package.json"), "utf8")).version;
      } catch {}
      let latest = null;
      try {
        latest = require("child_process").execSync("npm view iframer-toolkit version", { encoding: "utf8" }).trim();
      } catch {}
      console.log(`  installed: v${installed}${latest ? `    latest: v${latest}` : "    (could not reach npm registry)"}`);
      if (!latest) {
        if (checkOnly)
          break;
      }
      const newerAvailable = latest && semverNewer(latest, installed);
      if (latest && !newerAvailable) {
        console.log(installed === latest ? "  Already up to date." : `  You're on v${installed}, ahead of npm's v${latest}. Nothing to do.`);
        break;
      }
      if (checkOnly) {
        if (newerAvailable)
          console.log("  Update available — run `iframer update` to apply.");
        break;
      }
      if (isDev) {
        console.log(`
  This is a dev/linked install (the package has a .git repo).`);
        console.log("  Update it with `git pull && bun run build`, not npm.");
        break;
      }
      console.log(`
  Updating via npm...`);
      try {
        require("child_process").execSync("npm install -g iframer-toolkit@latest", { stdio: "inherit" });
      } catch {
        console.error(`
  npm install failed. If it's a permissions error:`);
        console.error("    sudo npm install -g iframer-toolkit@latest");
        process.exit(1);
      }
      console.log();
      const hasExt = extensionInstalled();
      await reloadAndRestartServer(hasExt);
      console.log(`
  Updated to v${latest || "latest"}.${hasExt ? "" : " (Extension not installed — nothing to reload.)"}
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
    instances                       List live browser windows (instanceId -> current page)
    windows                         Alias of instances
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
    install extension chrome        Install the (optional) browser extension for Chrome/Chromium
    extension path                  Print the extension folder to load in chrome://extensions
    update                          Update iframer via npm; reload the extension too if it's installed
    update --check                  Report whether a newer version is available (no install)
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
