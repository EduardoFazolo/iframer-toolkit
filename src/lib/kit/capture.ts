/**
 * Node side of the in-page capture kit: reading a capture file, the privacy
 * gate, and turning shapes into reusable artifacts (endpoint map, in-page
 * client, optional types, knowledge entry).
 *
 * Nothing here talks to a browser. The capture arrives as a file written by
 * the kit's dump() (or pasted drain() chunks), so this works the same for any
 * browser tool an agent drives.
 */
import fs from "fs";
import os from "os";
import path from "path";

// ─── Capture format (written by page-kit.ts) ───────────────────────────────

export type Shape = string | Shape[] | { [k: string]: Shape };

export interface CaptureEndpoint {
  kind: string;
  n: number;
  status: number[];
  query: string[];
  headers: string[];
  auth: string[];
  req?: { json?: Shape; form?: Record<string, string>; multipart?: Record<string, string>; text?: number; binary?: number; unknown?: boolean };
  res?: Shape | { contentType: string; bytes: number };
  /** Kinds of private values ingest swapped for placeholders (token, email, ...). */
  redacted?: string[];
}

/** Where the page keeps an auth header's value. Names only, never the value. */
export interface AuthSource {
  from: "localStorage" | "sessionStorage" | "cookie" | "memory";
  key?: string;
  json?: boolean;
  path?: string[];
  prefix?: string;
}

export interface CaptureReport {
  kind: "iframer-capture";
  v: number;
  origin: string;
  capturedAt?: string;
  kit?: { mode: string; hostFilter: string | null };
  coverage: { seen: number; withPayload: number; pathOnly: number; complete?: boolean; blindSpots: string[] };
  auth?: { cookies?: string; headers?: Record<string, AuthSource> };
  endpoints: Record<string, CaptureEndpoint>;
  pathOnly: string[];
}

export class CaptureError extends Error {}

export function parseCapture(raw: string): CaptureReport {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new CaptureError("not JSON: expected a file written by the kit's dump() or the joined drain() chunks");
  }
  // v1 spike files predate the kind marker; accept them by shape.
  if (data?.kind !== "iframer-capture" && !(data?.v === 1 && data?.endpoints && data?.coverage)) {
    throw new CaptureError("not an iframer capture (missing kind: \"iframer-capture\")");
  }
  if (data.v !== 1) throw new CaptureError(`unsupported capture version ${data.v}; update iframer`);
  if (typeof data.origin !== "string" || typeof data.endpoints !== "object") throw new CaptureError("capture is missing origin or endpoints");
  data.pathOnly ??= [];
  return data as CaptureReport;
}

// ─── Finding the file ──────────────────────────────────────────────────────

/**
 * Where browser tools leave downloads. T3 Code keeps agent-started downloads
 * in its own userdata (one hashed folder per profile, files named by uuid with
 * no extension), so a filename glob can't find them: we sniff contents.
 */
export function downloadDirs(): string[] {
  const home = os.homedir();
  const t3Home = process.env.T3_HOME || path.join(home, ".t3");
  return [
    path.join(t3Home, "userdata", "server-browser", "downloads"),
    path.join(home, "Downloads"),
  ];
}

/** Newest file under `dirs` (two levels deep) that starts like an iframer capture. */
export function findLatestCapture(dirs = downloadDirs(), maxAgeMs = 24 * 3600_000): string | null {
  const now = Date.now();
  let best: { p: string; t: number } | null = null;
  const consider = (p: string) => {
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > 20_000_000 || now - st.mtimeMs > maxAgeMs) return;
      if (best && st.mtimeMs <= best.t) return;
      const fd = fs.openSync(p, "r");
      const buf = Buffer.alloc(64);
      fs.readSync(fd, buf, 0, 64, 0);
      fs.closeSync(fd);
      if (!buf.toString("utf8").startsWith('{"kind":"iframer-capture"')) return;
      best = { p, t: st.mtimeMs };
    } catch {}
  };
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth > 0) walk(p, depth - 1);
      else if (e.isFile()) consider(p);
    }
  };
  for (const d of dirs) walk(d, 2);
  return (best as { p: string } | null)?.p ?? null;
}

// ─── Privacy gate ──────────────────────────────────────────────────────────

export interface PrivacyFinding {
  where: string;
  kind: string;
  sample: string; // masked
}

const TYPE_NAMES = new Set(["string", "number", "boolean", "null", "object", "undefined", "bigint", "symbol", "function", "{id}", "{key}"]);

const DETECTORS: Array<[string, RegExp]> = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{5,}/],
  ["bearer", /\bbearer\s+\S{6,}/i],
  ["phone", /\+?\d[\d ().-]{8,}\d/],
  ["token", /(?=[A-Za-z0-9_\-.]*\d)(?=[A-Za-z0-9_\-.]*[A-Za-z])^[A-Za-z0-9_\-.]{24,}$/],
];

function mask(s: string): string {
  return s.length <= 4 ? "****" : `${s.slice(0, 3)}… (${s.length} chars)`;
}

/** Strings in an endpoint key / path that are value-like. */
function scanString(s: string, where: string, out: PrivacyFinding[]) {
  if (TYPE_NAMES.has(s)) return;
  for (const [kind, re] of DETECTORS) {
    if (kind === "token") {
      // Check each path segment / host label / word, not the whole string.
      for (const part of splitWords(s)) {
        if (part.includes("{")) continue;
        if (re.test(part)) { out.push({ where, kind, sample: mask(part) }); return; }
      }
      continue;
    }
    const hit = s.match(re);
    if (hit) { out.push({ where, kind, sample: mask(hit[0]) }); return; }
  }
}

function walkValues(v: unknown, where: string, out: PrivacyFinding[]) {
  if (typeof v === "string") return scanString(v, where, out);
  if (Array.isArray(v)) return v.forEach((x, i) => walkValues(x, `${where}[${i}]`, out));
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      scanString(k, `${where}.${k} (key)`, out);
      walkValues(x, `${where}.${k}`, out);
    }
  }
}

/**
 * Fails closed on anything that looks like a secret or personal data. The kit
 * exports shapes, so every string should be a type name, a header/query/key
 * name, or a templated path; a hit means redaction missed something.
 */
export function scanCapture(report: CaptureReport): PrivacyFinding[] {
  const out: PrivacyFinding[] = [];
  for (const [key, ep] of Object.entries(report.endpoints)) {
    const where = `endpoints["${key.length > 80 ? key.slice(0, 80) + "…" : key}"]`;
    scanString(key, where, out);
    walkValues(ep, where, out);
  }
  report.pathOnly.forEach((p, i) => scanString(p, `pathOnly[${i}]`, out));
  return out;
}

/** Path segments, host labels and words. Dots split host labels; a file name like a.json stays one part. */
function splitWords(s: string): string[] {
  const m = s.match(/^(?:[A-Z]+ )?https?:\/\/([^/]+)(.*)$/);
  if (!m) return s.split(/[/\s?&=#:;,]/);
  return [...m[1].split(/[.:]/), ...m[2].split(/[/\s?&=#:;,]/)];
}

const PLACEHOLDER = "{id}";

/** Replaces value-like parts of a URL-ish string with {id}. Returns the new string and what was replaced. */
function redactUrl(s: string): { s: string; kinds: string[] } {
  const kinds: string[] = [];
  const hit = (part: string): string | null => {
    if (!part || part.includes("{")) return null;
    let d = part;
    try { d = decodeURIComponent(part); } catch {}
    for (const [kind, re] of DETECTORS) if (re.test(d)) return kind;
    return null;
  };
  const fixSeg = (seg: string): string => {
    // Value inside a segment, like "file-<token>.json": keep the readable parts.
    let found = false;
    const parts = seg.split(/([^A-Za-z0-9_%@+])/).map((p) => {
      const kk = hit(p);
      if (kk) { kinds.push(kk); found = true; return PLACEHOLDER; }
      return p;
    });
    if (found) return parts.join("");
    const k = hit(seg);
    if (k) { kinds.push(k); return PLACEHOLDER; }
    return seg;
  };
  const m = s.match(/^((?:[A-Z]+ )?https?:\/\/)([^/]+)(.*)$/);
  if (!m) return { s: s.split("/").map(fixSeg).join("/"), kinds };
  const host = m[2].split(".").map((l) => {
    const k = hit(l);
    if (k) { kinds.push(k); return "x"; } // keep it a valid host; it's never called cross-origin anyway
    return l;
  }).join(".");
  return { s: m[1] + host + m[3].split("/").map(fixSeg).join("/"), kinds };
}

function redactShape(v: unknown, kinds: string[]): unknown {
  if (typeof v === "string") {
    if (TYPE_NAMES.has(v)) return v;
    const f: PrivacyFinding[] = [];
    scanString(v, "", f);
    if (f.length) { kinds.push(f[0].kind); return "string"; }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => redactShape(x, kinds));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const f: PrivacyFinding[] = [];
      scanString(k, "", f);
      const key = f.length ? "{key}" : k;
      if (f.length) kinds.push(f[0].kind);
      if (!(key in o)) o[key] = redactShape(x, kinds);
    }
    return o;
  }
  return v;
}

const union = <T>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])];

/**
 * Swaps anything secret-looking for a placeholder instead of refusing the
 * capture: path pieces and host labels become {id}, keys become {key}, string
 * values become "string". Endpoints that collapse into the same key merge.
 * Run scanCapture after this; anything left means redaction failed.
 */
export function redactCapture(report: CaptureReport): { report: CaptureReport; redacted: PrivacyFinding[] } {
  const redacted: PrivacyFinding[] = [];
  const endpoints: CaptureReport["endpoints"] = {};
  for (const [key, ep] of Object.entries(report.endpoints)) {
    const kinds: string[] = [];
    const { s: newKey, kinds: keyKinds } = redactUrl(key);
    kinds.push(...keyKinds);
    const clean = { ...ep };
    clean.query = union((ep.query || []).map((q) => { const f: PrivacyFinding[] = []; scanString(q, "", f); if (f.length) kinds.push(f[0].kind); return f.length ? "{key}" : q; }));
    clean.headers = (ep.headers || []).filter((h) => { const f: PrivacyFinding[] = []; scanString(h, "", f); if (f.length) kinds.push(f[0].kind); return !f.length; });
    if (ep.req !== undefined) clean.req = redactShape(ep.req, kinds) as typeof ep.req;
    if (ep.res !== undefined) clean.res = redactShape(ep.res, kinds) as typeof ep.res;
    for (const k of new Set(kinds)) redacted.push({ where: newKey, kind: k, sample: "replaced" });
    if (kinds.length) clean.redacted = union(ep.redacted, kinds);
    const prev = endpoints[newKey];
    endpoints[newKey] = prev ? {
      ...prev, n: prev.n + clean.n,
      status: union(prev.status, clean.status), query: union(prev.query, clean.query),
      headers: union(prev.headers, clean.headers), auth: union(prev.auth, clean.auth),
      req: prev.req ?? clean.req, res: prev.res ?? clean.res,
      ...(prev.redacted || clean.redacted ? { redacted: union(prev.redacted, clean.redacted) } : {}),
    } : clean;
  }
  const pathOnly = union(report.pathOnly.map((p) => {
    const r = redactUrl(p);
    for (const k of new Set(r.kinds)) redacted.push({ where: r.s, kind: k, sample: "replaced" });
    return r.s;
  }));
  return { report: { ...report, endpoints, pathOnly }, redacted };
}

// ─── Artifacts ─────────────────────────────────────────────────────────────

export interface EndpointSpec {
  method: string;
  origin: string;
  path: string;
  kind: string;
  calls: number;
  status: number[];
  query: string[];
  headers: string[];
  authHeaders: string[];
  request?: CaptureEndpoint["req"];
  response?: CaptureEndpoint["res"];
  functionName: string;
  /** Private values seen in this endpoint, now placeholders: pass them per call. */
  privateValues?: string[];
}

export interface ApiMap {
  origin: string;
  capturedAt?: string;
  coverage: CaptureReport["coverage"];
  replay: string;
  /** What a call needs to act as the logged-in user. Values are never stored. */
  identity: { cookies: string; headers: Array<{ name: string; source: string }> };
  endpoints: EndpointSpec[];
  pathOnly: string[];
}

function splitKey(key: string): { method: string; origin: string; path: string } {
  const sp = key.indexOf(" ");
  const method = key.slice(0, sp);
  const rest = key.slice(sp + 1);
  const m = rest.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  return { method, origin: m ? m[1] : "", path: m?.[2] || "/" };
}

const VERB: Record<string, string> = { GET: "get", HEAD: "head", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

function pascal(s: string): string {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

function functionNameFor(method: string, p: string, res: unknown, kind: string): string {
  const segs = p.split("/").filter((s) => s && !s.startsWith("{") && !/^(api|rest|v\d+)$/i.test(s));
  const tail = segs.slice(-2).map(pascal).join("") || "Root";
  let verb = VERB[method] ?? method.toLowerCase();
  const endsWithId = /\{id\}\/?$/.test(p);
  if (method === "GET" && !endsWithId && res && typeof res === "object" &&
      (Array.isArray(res) || Object.values(res as object).some(Array.isArray))) verb = "list";
  if (kind === "beacon") verb = "send";
  if (kind === "ws" || kind === "sse") verb = "open";
  if (method === "POST" && segs.length && /^(search|login|logout|send|submit|query|graphql)$/i.test(segs[segs.length - 1])) verb = "";
  const name = verb + tail;
  return name[0].toLowerCase() + name.slice(1);
}

export function buildApiMap(report: CaptureReport): ApiMap {
  const used = new Map<string, number>();
  const endpoints: EndpointSpec[] = Object.entries(report.endpoints)
    .map(([key, ep]) => ({ key, ep, ...splitKey(key) }))
    .sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)))
    .map(({ ep, method, origin, path: p }) => {
      let fn = functionNameFor(method, p, ep.res, ep.kind);
      const n = used.get(fn) ?? 0;
      used.set(fn, n + 1);
      if (n) fn += n + 1;
      return {
        method, origin, path: p, kind: ep.kind, calls: ep.n,
        status: ep.status, query: ep.query, headers: ep.headers, authHeaders: ep.auth,
        request: ep.req, response: ep.res, functionName: fn,
        ...(ep.redacted?.length ? { privateValues: ep.redacted } : {}),
      };
    });
  return {
    origin: report.origin,
    capturedAt: report.capturedAt,
    coverage: report.coverage,
    identity: {
      cookies: report.auth?.cookies ?? "browser session (sent automatically, HttpOnly included)",
      headers: Object.entries(report.auth?.headers ?? {}).map(([name, src]) => ({ name, source: describeAuthSource(src) })),
    },
    replay: "in-page only: load the kit, then the client, and call window.__ifkApi.<fn>() through the agent's evaluate tool. HttpOnly cookies never leave the browser, so the same calls fail from curl.",
    endpoints,
    pathOnly: report.pathOnly,
  };
}

export function describeAuthSource(s: AuthSource): string {
  const pre = s.prefix ? ` with "${s.prefix.trim()} " prefix` : "";
  if (s.from === "memory") return `kept in page memory${pre}; __ifk.call reuses it after the site sends it once`;
  const at = s.path?.length ? `${s.key} -> ${s.path.join(".")}` : s.key;
  return `${s.from}["${at}"]${pre}; __ifk.call attaches it automatically`;
}

/** Body param only where the method usually carries one, or one was seen. */
function takesBody(ep: EndpointSpec): boolean {
  return ep.request !== undefined || ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH";
}

/** In-page client: thin wrappers over window.__ifk.call, same origin only. */
export function renderClient(map: ApiMap): string {
  const lines: string[] = [];
  const skipped: string[] = [];
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
    if (ep.kind === "ws" || ep.kind === "sse" || ep.kind === "beacon") { skipped.push(`${ep.kind} ${ep.path}`); continue; }
    if (ep.origin !== map.origin) { skipped.push(`${ep.method} ${ep.origin}${ep.path} (cross-origin)`); continue; }
    let ids = 0;
    const params: string[] = [];
    const urlExpr = JSON.stringify(ep.path).replace(/\{id\}/g, () => {
      const name = ids++ === 0 ? "id" : `id${ids}`;
      params.push(name);
      return `" + encodeURIComponent(${name}) + "`;
    }).replace(/ \+ ""$/, "").replace(/^"" \+ /, "");
    const hasBody = takesBody(ep);
    if (hasBody) params.push("body");
    params.push("query", "opts");
    const optsExpr = hasBody
      ? `Object.assign({ json: body }, opts)`
      : `opts`;
    const doc = [
      ep.query.length ? `query: ${ep.query.join(", ")}` : "",
      ep.status.length ? `seen ${ep.status.join("/")}` : "",
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

function tsType(s: unknown, indent = "  "): string {
  if (typeof s === "string") {
    if (s === "null") return "null";
    if (["string", "number", "boolean"].includes(s)) return s;
    return "unknown";
  }
  if (Array.isArray(s)) return s.length ? `Array<${tsType(s[0], indent)}>` : "unknown[]";
  if (s && typeof s === "object") {
    const entries = Object.entries(s as Record<string, unknown>);
    if (!entries.length) return "Record<string, unknown>";
    const inner = indent + "  ";
    const body = entries.map(([k, v]) =>
      k === "{key}" ? `${inner}[key: string]: ${tsType(v, inner)};` : `${inner}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}?: ${tsType(v, inner)};`);
    return `{\n${body.join("\n")}\n${indent}}`;
  }
  return "unknown";
}

/** Type declarations for window.__ifkApi, inferred from the captured shapes. */
export function renderTypes(map: ApiMap): string {
  const out: string[] = [`// Generated by \`iframer ingest\` from ${map.origin}. Shapes come from one sample each: fields may be optional.`];
  out.push(`type IfkResult<T> = Promise<{ status?: number; data?: T; text?: string; truncated?: number; error?: string; stopped?: string }>;`);
  out.push(`type IfkOpts = { approved?: boolean; headers?: Record<string, string>; maxBytes?: number };`);
  out.push(`interface IfkApi {`);
  for (const ep of map.endpoints) {
    if (ep.kind === "ws" || ep.kind === "sse" || ep.kind === "beacon" || ep.origin !== map.origin) continue;
    const ids = (ep.path.match(/\{id\}/g) || []).map((_, i) => `${i ? `id${i + 1}` : "id"}: string | number`);
    const hasBody = takesBody(ep);
    const req = ep.request?.json !== undefined ? tsType(ep.request.json, "  ")
      : ep.request?.form || ep.request?.multipart ? "Record<string, string>" : "unknown";
    const res = ep.response && typeof ep.response === "object" && !Array.isArray(ep.response) && "contentType" in (ep.response as object) && "bytes" in (ep.response as object)
      ? "unknown" : tsType(ep.response, "  ");
    const params = [...ids, ...(hasBody ? [`body: ${req}`] : []), `query?: Record<string, string>`, `opts?: IfkOpts`];
    out.push(`  /** ${ep.method} ${ep.path} */`);
    out.push(`  ${ep.functionName}(${params.join(", ")}): IfkResult<${res}>;`);
  }
  out.push(`}`);
  out.push(`declare global { interface Window { __ifkApi: IfkApi } }`);
  out.push(`export {};`);
  return out.join("\n") + "\n";
}

function shortShape(s: unknown, depth = 0): string {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s.length ? `${shortShape(s[0], depth + 1)}[]` : "[]";
  if (s && typeof s === "object") {
    const keys = Object.keys(s as object);
    if (depth > 0) return `{${keys.slice(0, 4).join(",")}${keys.length > 4 ? ",…" : ""}}`;
    return `{${keys.slice(0, 6).map((k) => `${k}:${shortShape((s as any)[k], depth + 1)}`).join(", ")}${keys.length > 6 ? ", …" : ""}}`;
  }
  return "?";
}

/** One-line description for the knowledge file. */
export function describeEndpoint(ep: EndpointSpec): string {
  const parts = [ep.kind, ep.status.length ? `status ${ep.status.join("/")}` : ""];
  if (ep.request?.json !== undefined) parts.push(`body ${shortShape(ep.request.json)}`);
  else if (ep.request?.form) parts.push(`form ${Object.keys(ep.request.form).join(",")}`);
  if (ep.response !== undefined) parts.push(`returns ${shortShape(ep.response)}`);
  if (ep.authHeaders.length) parts.push(`auth ${ep.authHeaders.join(",")}`);
  return parts.filter(Boolean).join("; ");
}
