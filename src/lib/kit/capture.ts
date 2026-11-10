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
  /** The recorded response shape came from a 2xx. */
  resOk?: boolean;
  /** Kinds of private values ingest swapped for placeholders (token, email, ...). */
  redacted?: string[];
  /** Next.js Server Action: its id (a public build hash, changes per deploy) and export name. */
  next?: { action: string; name?: string };
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
  /** Static route segment names from the app's route data: never templated. */
  routes?: { static?: string[] };
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
  if (data?.kind !== "iframer-capture") {
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
  if (TYPE_NAMES.has(s) || s.split("|").every((t) => TYPE_NAMES.has(t))) return;
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
    walkValues({ ...ep, next: undefined }, where, out); // action ids are public build hashes
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
let STATICS = new Set<string>();

/** Replaces value-like parts of a URL-ish string with {id}. Returns the new string and what was replaced. */
function redactUrl(s: string): { s: string; kinds: string[] } {
  const kinds: string[] = [];
  const hit = (part: string): string | null => {
    if (!part || part.includes("{") || STATICS.has(part)) return null;
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
  STATICS = new Set(report.routes?.static ?? []);
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
  /** Next.js: send with the RSC header to get page data instead of HTML. */
  rsc?: boolean;
  /** Next.js Server Action, called by export name through window.__ifk.action. */
  action?: { name?: string; id: string };
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
  const m = rest.split("#")[0].match(/^(https?:\/\/[^/]+)(\/.*)?$/);
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
      let fn = ep.next?.name || (ep.next ? "action" + (pascal(p.split("/").filter((x) => x && !x.startsWith("{")).slice(-2).join(" ")) || "Root") : functionNameFor(method, p, ep.res, ep.kind));
      const n = used.get(fn) ?? 0;
      used.set(fn, n + 1);
      if (n) fn += n + 1;
      return {
        method, origin, path: p, kind: ep.kind, calls: ep.n,
        status: ep.status, query: ep.query, headers: ep.headers, authHeaders: ep.auth,
        request: ep.req, response: ep.res, functionName: fn,
        ...(ep.redacted?.length ? { privateValues: ep.redacted } : {}),
        ...((ep.headers || []).includes("rsc") || (ep.query || []).includes("_rsc") ? { rsc: true } : {}),
        ...(ep.next ? { action: { name: ep.next.name, id: ep.next.action } } : {}),
      };
    });
  return {
    origin: report.origin,
    capturedAt: report.capturedAt,
    coverage: report.coverage,
    identity: {
      cookies: report.auth?.cookies ?? "session cookies, HttpOnly included (COOKIE in .env)",
      headers: Object.entries(report.auth?.headers ?? {}).map(([name, src]) => ({ name, source: describeAuthSource(src) })),
    },
    replay: "client.mjs next to this file (Node, no browser). Session: .env (iframer auth <host>). In-page fallback for sites that block Node: window.__ifk.call, or iframer recipe --in-page.",
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
  const parts = [ep.action ? `Next.js Server Action ${ep.action.name || ep.action.id.slice(0, 8)}` : ep.kind, ep.rsc ? "RSC (page data)" : "", ep.status.length ? `status ${ep.status.join("/")}` : ""];
  if (ep.request?.json !== undefined) parts.push(`body ${shortShape(ep.request.json)}`);
  else if (ep.request?.form) parts.push(`form ${Object.keys(ep.request.form).join(",")}`);
  if (ep.response !== undefined) parts.push(`returns ${shortShape(ep.response)}`);
  if (ep.authHeaders.length) parts.push(`auth ${ep.authHeaders.join(",")}`);
  return parts.filter(Boolean).join("; ");
}

// ─── Cleanup before building the map ───────────────────────────────────────

function mergeEp(p: CaptureEndpoint, e: CaptureEndpoint): CaptureEndpoint {
  return {
    ...p, n: p.n + e.n,
    status: union(p.status, e.status), query: union(p.query, e.query),
    headers: union(p.headers, e.headers), auth: union(p.auth, e.auth),
    req: p.req ?? e.req, res: p.res ?? e.res,
    ...(p.redacted || e.redacted ? { redacted: union(p.redacted, e.redacted) } : {}),
  };
}

/** Same site: equal hosts, or the same last two labels (www.x.io and api.x.io). */
function sameSite(a: string, b: string): boolean {
  const h = (o: string) => { try { return new URL(o).hostname; } catch { return o; } };
  const x = h(a), y = h(b);
  return x === y || x.split(".").slice(-2).join(".") === y.split(".").slice(-2).join(".");
}

const NOISE_PATH = /^\/(_next\/(static|image|webpack-hmr)|_vercel\/|__nextjs|favicon|robots\.txt|sitemap)/;

/**
 * Drops what isn't the site's API (third-party hosts, framework assets),
 * merges Server Actions posted from several pages, and merges paths that
 * differ only where another endpoint has a named param ({communitySlug}).
 */
export function cleanCapture(report: CaptureReport, opts: { all?: boolean } = {}): { report: CaptureReport; dropped: string[] } {
  const dropped: string[] = [];
  let eps = Object.entries(report.endpoints);
  if (!opts.all) {
    eps = eps.filter(([k]) => {
      const { origin, path: p } = splitKey(k);
      const keep = sameSite(origin, report.origin) && !NOISE_PATH.test(p);
      if (!keep) dropped.push(k);
      return keep;
    });
  }
  // One entry per Server Action id.
  const byAction = new Map<string, string>();
  const out: Record<string, CaptureEndpoint> = {};
  for (const [k, ep] of eps) {
    const id = ep.next?.action;
    if (id && byAction.has(id)) { const first = byAction.get(id)!; out[first] = mergeEp(out[first], ep); continue; }
    if (id) byAction.set(id, k);
    out[k] = out[k] ? mergeEp(out[k], ep) : ep;
  }
  const statics = new Set(report.routes?.static ?? []);
  // Named params, by position, from paths that already have them.
  const named = new Map<string, string>(); // "METHOD|segcount|i" -> {name}
  const segs = (k: string) => { const s = splitKey(k); return { ...s, parts: s.path.split("#")[0].split("/") }; };
  for (const k of Object.keys(out)) {
    const { method, parts } = segs(k);
    parts.forEach((p, i) => { if (/^\{[A-Za-z_$][\w$]*\}$/.test(p) && p !== "{id}") named.set(`${method}|${parts.length}|${i}`, p); });
  }
  const result: Record<string, CaptureEndpoint> = {};
  for (const [k, ep] of Object.entries(out)) {
    const { method, origin, parts } = segs(k);
    const frag = k.includes("#") ? k.slice(k.indexOf("#")) : "";
    let changed = false;
    const np = parts.map((p, i) => {
      const nm = named.get(`${method}|${parts.length}|${i}`);
      if (!nm || p === nm || p.startsWith("{") || statics.has(p)) return p;
      // Only when the rest of the path matches an endpoint that has the param there.
      const sib = [...parts]; sib[i] = nm;
      const sibKey = `${method} ${origin}${sib.join("/")}${frag}`;
      if (!(sibKey in out)) return p;
      changed = true;
      return nm;
    });
    const nk = changed ? `${method} ${origin}${np.join("/")}${frag}` : k;
    result[nk] = result[nk] ? mergeEp(result[nk], ep) : ep;
  }
  const pathOnly = opts.all ? report.pathOnly : report.pathOnly.filter((p) => sameSite(p, report.origin) && !NOISE_PATH.test(splitKey(`GET ${p}`).path));
  const withPayload = Object.values(result).filter((e) => e.req || e.res).length;
  const coverage = { ...report.coverage, seen: Object.keys(result).length + pathOnly.length, withPayload, pathOnly: pathOnly.length };
  return { report: { ...report, endpoints: result, pathOnly, coverage }, dropped };
}

/** One line per endpoint, for agents: name, method, path, what it returns. */
const hasList = (v: unknown, d = 0): boolean => d < 6 && !!v && typeof v === "object" && (Array.isArray(v) || Object.values(v as object).some((x) => hasList(x, d + 1)));

export function renderIndex(map: ApiMap): string {
  const lines = [`# ${map.origin}: ${map.endpoints.length} endpoints. Call from Node: node client.mjs get <path> [--rsc] [--schema] (session in .env: iframer auth). Details: api.json`];
  for (const e of map.endpoints) {
    const what = e.action ? `action ${e.action.name || e.action.id.slice(0, 8)}` : `${e.method} ${e.origin === map.origin ? e.path : e.origin + e.path}`;
    const r: any = e.response;
    // Components holding lists first: that's where page data is.
    const comps = r?.rsc?.components && r?.rsc?.action === undefined
      ? Object.fromEntries(Object.entries(r.rsc.components).sort(([, a], [, b]) => Number(hasList(b)) - Number(hasList(a))))
      : undefined;
    let ret = r !== undefined ? shortShape(r?.rsc?.action ?? comps ?? r) : "";
    if (ret.length > 90) ret = ret.slice(0, 87) + "...";
    const html = r?.rsc?.nodes;
    if (html) ret += `${ret ? " " : ""}+html(${html}): --nodes tag`;
    lines.push(`${e.functionName}  ${what}${e.rsc ? " [rsc]" : ""}${ret ? `  -> ${ret}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * The captured structure of one endpoint as paste-able paths, one line each
 * (shapes only: types, no values or lengths). Same layout as {schema:true}.
 */
export function schemaFromMap(map: ApiMap, target: string, budget = 1500): string | null {
  const want = target.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const matches = (tplPath: string) => tplPath === want || new RegExp("^" + tplPath.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}|\{[^}]+\}/g, "[^/]+(?:/[^/]+)*?") + "$").test(want);
  const eps = map.endpoints.filter((e) => e.origin === map.origin && matches(e.path));
  if (!eps.length) return null;
  const lines: string[] = [];
  // Same rule as {schema:true}: lists of records with their keys (shapes only here).
  const walk = (p: string, v: unknown, d: number) => {
    if (d > 8 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      const item = v[0];
      if (!item || typeof item !== "object" || Array.isArray(item)) return;
      lines.push(`${p}[] {${Object.keys(item).join(",")}}`);
      for (const [k, x] of Object.entries(item)) walk(`${p}[].${k}`, x, d + 1);
      return;
    }
    for (const [k, x] of Object.entries(v as object)) walk(p ? `${p}.${k}` : k, x, d + 1);
  };
  for (const e of eps) {
    const r: any = e.response;
    lines.push(`# ${e.action ? `action ${e.action.name || e.action.id.slice(0, 8)}` : `${e.method} ${e.path}`}${e.rsc ? " [rsc]" : ""}`);
    if (r?.rsc?.components) {
      for (const [n, c] of Object.entries(r.rsc.components)) walk(n, Array.isArray(c) ? (c as unknown[])[0] : c, 0);
      if (r.rsc.nodes) lines.push(`nodes: ${r.rsc.nodes}  -> {nodes:'tag'}`);
    } else walk("", r?.rsc?.action ?? r, 0);
  }
  let out = "", used = 0;
  for (const l of lines) { if (used + l.length + 1 > budget) { out += `# +more: --budget 4000\n`; break; } out += l + "\n"; used += l.length + 1; }
  return out;
}
