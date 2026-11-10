/**
 * The local output of a reverse-engineered site: client.mjs, a Node client
 * (no browser) with the site's actions and the saved recipes as functions,
 * auth read from .env next to it. A recipe is a mapped task saved as a small
 * JSON spec that returns one short line.
 *
 * Fallback for sites that block non-browser clients: the same recipes as an
 * in-page bundle (recipes.js, `iframer recipe --in-page`), run in a logged-in tab.
 */
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { recipeCore, recipeRunner } from "./recipe-core";

/** dist/cli.js of the iframer that writes a client: the client calls that one, not whatever PATH finds. */
function iframerCli(): string | null {
  try {
    let d = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      const pkg = path.join(d, "package.json");
      if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, "utf8")).name === "iframer-toolkit") {
        // A development checkout: its launcher rebuilds before running.
        const dev = path.join(d, "bin", "iframer-dev");
        if (fs.existsSync(dev)) return dev;
        const cli = path.join(d, "dist", "cli.js");
        return fs.existsSync(cli) ? cli : null;
      }
      d = path.dirname(d);
    }
  } catch {}
  return null;
}

/** Identifies the recipe runtime (core + runner). A tab holding another one must reload the bundle. */
export const RUNTIME = crypto.createHash("sha1").update(recipeCore.toString()).update(recipeRunner.toString()).update(renderRecipes.toString()).digest("hex").slice(0, 8);

export interface RecipeSpec {
  name: string;
  host: string;
  /** Path template, e.g. /{communitySlug}/dashboard. {x} is filled from args.x. */
  path?: string;
  /** Send the RSC header (Next.js page data). */
  rsc?: boolean;
  /** Next.js Server Action export name: POSTs to `path` (or the current page). */
  action?: string;
  /** Inline action: the prop that holds it on the page at `path`, found by `find`. */
  actionProp?: string;
  /** Action arguments as JSON; strings like "{communitySlug}" are filled from args. */
  args?: unknown;
  /** Path that must exist in the wanted object ("data.tablesNeeded"), or JS function source. */
  find?: string;
  /** Server-rendered elements instead of component props: "a", "li|tr", "*". */
  nodes?: string;
  /** Filter the list before pick: "tablesNeeded>0", "status=PUBLISHED&x~y", or JS function source. */
  where?: string;
  /** After pick: count by this key ({count, by}). */
  group?: string;
  /** After pick: just the number of items. */
  count?: boolean;
  /** After pick: first N items. */
  limit?: number;
  /** Path spec ("data.{name,status}") or JS function source, applied after find. */
  pick?: string;
  /**
   * Code recipe, for flows one request can't do (pagination, polling, several
   * calls): JS source `async (core, args) => string`. core has get, action,
   * find, pick, answer, need, sleep.
   */
  run?: string;
  /** JS function source (data, args) => string: the one line the recipe returns. */
  format?: string;
  description?: string;
  /** Writes need the user's OK when the recipe is made; recorded here. */
  writes?: boolean;
}

export function apisDir(host: string): string {
  return path.join(getDataDir(), "apis", normalizeHost(host));
}

export function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

const recipesDir = (host: string) => path.join(apisDir(host), "recipes");

export function listRecipes(host: string): RecipeSpec[] {
  const dir = recipesDir(host);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RecipeSpec);
}

export function saveRecipe(spec: RecipeSpec): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(spec.name)) throw new Error(`recipe name must be a JS identifier: ${spec.name}`);
  if (RESERVED.has(spec.name)) throw new Error(`recipe name ${spec.name} is taken by the client: pick another`);
  if (!spec.path && !spec.action && !spec.actionProp && !spec.run) throw new Error("a recipe needs --path, --action, --action-prop or --run");
  if (spec.actionProp && (!spec.path || !spec.find)) throw new Error("--action-prop needs --path (the page) and --find (the props shape)");
  for (const k of ["find", "pick", "format"] as const) if (spec[k] && isCode(spec[k]!)) checkCode(spec[k]!, k);
  if (spec.run) { if (!isCode(spec.run)) throw new Error("--run must be a JS function: async (core, args) => ..."); checkCode(spec.run, "run"); }
  const dir = recipesDir(spec.host);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${spec.name}.json`), JSON.stringify(spec, null, 2) + "\n");
  writeOutputs(spec.host);
  return clientPath(spec.host);
}

export function removeRecipe(host: string, name: string): boolean {
  const f = path.join(recipesDir(host), `${name}.json`);
  if (!fs.existsSync(f)) return false;
  fs.unlinkSync(f);
  writeOutputs(host);
  return true;
}

const RESERVED = new Set(["get", "page", "action", "actions", "recipes", "schema", "core", "run", "default"]);

/** Folders the user asked ingest to write to (--out), kept in sync with recipe changes. */
function outputsFile(host: string) { return path.join(apisDir(host), "outputs.json"); }
export function outputDirs(host: string): string[] {
  const dirs = [apisDir(host)];
  try { for (const d of JSON.parse(fs.readFileSync(outputsFile(host), "utf8"))) if (!dirs.includes(d)) dirs.push(d); } catch {}
  return dirs;
}
export function addOutputDir(host: string, dir: string): void {
  const abs = path.resolve(dir);
  if (abs === path.resolve(apisDir(host))) return;
  const extra = outputDirs(host).slice(1).filter((d) => fs.existsSync(d));
  if (!extra.includes(abs)) extra.push(abs);
  fs.mkdirSync(apisDir(host), { recursive: true });
  fs.writeFileSync(outputsFile(host), JSON.stringify(extra, null, 2) + "\n");
}

/** The client in the host's folder (~/.iframer/apis/<host>/client.mjs). */
export function clientPath(host: string, dir = apisDir(host)): string { return path.join(dir, "client.mjs"); }

/**
 * Rewrites client.mjs (and its README/.env.example/.gitignore) in every folder
 * for the host, plus the in-page bundle where one was made with --in-page.
 */
export function writeOutputs(host: string): string[] {
  const written: string[] = [];
  for (const dir of outputDirs(host)) {
    if (dir !== apisDir(host) && !fs.existsSync(dir)) continue;
    written.push(...writeClient(host, dir));
  }
  if (fs.existsSync(path.join(apisDir(host), "recipes.js"))) written.push(writeBundle(host));
  return written;
}

/** Writes client.mjs and its companions into dir. The map and auth sources come from the host's folder. */
export function writeClient(host: string, dir = apisDir(host)): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const map = readMap(host, dir);
  const auth = readAuth(host, dir);
  const specs = listRecipes(host);
  const out: string[] = [];
  const put = (name: string, body: string, mode?: number) => { const p = path.join(dir, name); fs.writeFileSync(p, body, mode ? { mode } : undefined); out.push(p); };
  put("client.mjs", renderClient(host, map, auth, specs, dir), 0o755);
  put(".env.example", envExample(host, auth));
  const gi = path.join(dir, ".gitignore");
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  for (const line of [".env", ".fingerprints.json"]) if (!cur.split("\n").includes(line)) fs.appendFileSync(gi, (cur && !cur.endsWith("\n") ? "\n" : "") + line + "\n");
  return out;
}

/** Writes ~/.iframer/apis/<host>/recipes.js: the in-page fallback bundle. */
export function writeBundle(host: string): string {
  const file = path.join(apisDir(host), "recipes.js");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderRecipes(listRecipes(host), readAuth(host)));
  return file;
}

/** Rewrites every host's client (and in-page bundle) with this version's runtime (`iframer refresh` / `update`). */
export function rebuildAllBundles(): string[] {
  const root = path.join(getDataDir(), "apis");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((h) => !h.includes(".bak-") && (fs.existsSync(path.join(root, h, "api.json")) || fs.existsSync(path.join(root, h, "recipes"))))
    .flatMap((h) => writeOutputs(h));
}

interface MapLite { origin?: string; pathOnly?: string[]; endpoints?: Array<{ method: string; path: string; functionName?: string; rsc?: boolean; action?: { name?: string; id?: string }; origin?: string }> }
function readMap(host: string, dir: string): MapLite {
  for (const d of [dir, apisDir(host)]) {
    try { return JSON.parse(fs.readFileSync(path.join(d, "api.json"), "utf8")); } catch {}
  }
  return { origin: `https://${host}`, endpoints: [] };
}

function envExample(host: string, auth: Record<string, unknown>): string {
  const lines = [
    `# Session for ${host}. Copy to .env (never commit it) or run: iframer auth ${host}`,
    `# COOKIE: the Cookie request header of a logged-in request (DevTools > Network > a request > Request Headers).`,
    `COOKIE=`,
  ];
  for (const h of Object.keys(auth)) lines.push(`# ${h} header (the page keeps it in ${describeSource(auth[h])})`, `${envName(h)}=`);
  return lines.join("\n") + "\n";
}
function describeSource(s: any): string {
  if (!s || typeof s !== "object") return "an unknown place";
  return s.key ? `${s.from} "${s.key}"${s.path?.length ? ` at ${s.path.join(".")}` : ""}` : String(s.from);
}
export const envName = (h: string) => h.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();

/** Auth header sources found at ingest (names and where they live, no values). */
export function readAuth(host: string, dir = apisDir(host)): Record<string, unknown> {
  for (const d of [dir, apisDir(host)]) {
    try { return JSON.parse(fs.readFileSync(path.join(d, "auth.json"), "utf8")); } catch {}
  }
  return {};
}

const isCode = (s: string) => /=>|^\s*(async\s+)?function\b/.test(s);

function checkCode(src: string, what: string) {
  try { new Function(`return (${src});`); }
  catch (e) { throw new Error(`--${what} is not valid JS: ${(e as Error).message}`); }
}

/** Code or a JSON literal for a spec field. */
const lit = (s: string | undefined) => (s === undefined ? "undefined" : isCode(s) ? `(${s})` : JSON.stringify(s));

/** One standalone bundle defining window.__ifkRecipes.<name>(args) -> Promise<string>. */
/** One line an agent evaluates to add this recipe to an already loaded bundle (and its stored copy). */
export function addSnippet(s: RecipeSpec): string {
  const f: string[] = [];
  const put = (k: string, v: string | undefined) => { if (v !== undefined) f.push(`${k}: ${v}`); };
  put("path", s.path === undefined ? undefined : JSON.stringify(s.path));
  if (s.rsc) f.push("rsc: true");
  put("action", s.action === undefined ? undefined : JSON.stringify(s.action));
  put("actionProp", s.actionProp === undefined ? undefined : JSON.stringify(s.actionProp));
  put("args", s.args === undefined ? undefined : JSON.stringify(s.args));
  for (const k of ["find", "pick", "format", "run", "where"] as const) if (s[k] !== undefined) f.push(`${k}: ${lit(s[k])}`);
  put("nodes", s.nodes === undefined ? undefined : JSON.stringify(s.nodes));
  put("group", s.group === undefined ? undefined : JSON.stringify(s.group));
  if (s.count) f.push("count: true");
  if (s.limit) f.push(`limit: ${s.limit}`);
  return `__ifkRecipes.__add(${JSON.stringify(s.name)}, { ${f.join(", ")} }, 1, ${JSON.stringify(RUNTIME)})`;
}

/** A recipe spec as a JS object literal (code fields stay code). */
function specLiteral(s: RecipeSpec): string {
  const fields = [
    `name: ${JSON.stringify(s.name)}`,
    `path: ${JSON.stringify(s.path)}`,
    `rsc: ${!!s.rsc}`,
    `action: ${JSON.stringify(s.action)}`,
    `actionProp: ${JSON.stringify(s.actionProp)}`,
    `args: ${JSON.stringify(s.args ?? null)}`,
    `find: ${lit(s.find)}`,
    `findText: ${JSON.stringify(s.find ?? "")}`,
    `pick: ${lit(s.pick)}`,
    `format: ${lit(s.format)}`,
    `run: ${lit(s.run)}`,
    `nodes: ${JSON.stringify(s.nodes)}`,
    `where: ${lit(s.where)}`,
    `group: ${JSON.stringify(s.group)}`,
    `count: ${!!s.count}`,
    `limit: ${JSON.stringify(s.limit ?? null)}`,
  ];
  return `{ ${fields.join(", ")} }`;
}

/**
 * client.mjs: the site's API as a Node module and CLI. No browser, no iframer
 * needed to run it. Auth comes from .env next to the file (COOKIE plus any
 * header the page sends, e.g. AUTHORIZATION).
 */
export function renderClient(host: string, map: MapLite, auth: Record<string, unknown>, specs: RecipeSpec[], dir: string): string {
  const origin = map.origin || `https://${host}`;
  const eps = (map.endpoints || []).filter((e) => !e.origin || e.origin === origin);
  const actions: Record<string, { id?: string; page: string }> = {};
  for (const e of eps) if (e.action?.name && !actions[e.action.name]) actions[e.action.name] = { id: e.action.id, page: e.path };
  const pages = eps.filter((e) => e.method === "GET").map((e) => `${e.rsc ? "page" : "get "} ${e.path}`);
  // Pages the browser loaded but the kit only saw by URL (full page loads): try them with --rsc.
  for (const u of map.pathOnly || []) {
    try { const x = new URL(u); if (x.origin === origin && !pages.some((p) => p.endsWith(" " + x.pathname))) pages.push(`seen ${x.pathname}`); } catch {}
  }
  const out: string[] = [];
  out.push(`#!/usr/bin/env node`);
  out.push(`// ${host} API client, generated by iframer from a capture of ${origin}. Node 18+, no browser.`);
  out.push(`// Regenerated by \`iframer ingest\` and \`iframer recipe\`: don't edit, add recipes instead.`);
  out.push(`//`);
  out.push(`// Auth: .env next to this file (see .env.example). Refresh it with: iframer auth ${host} --out ${JSON.stringify(dir)}`);
  out.push(`//`);
  out.push(`// CLI:     node client.mjs                         everything this client knows`);
  out.push(`//          node client.mjs <recipe> '{"arg":"x"}'  one saved task, one line`);
  out.push(`//          node client.mjs get <path> --rsc --schema     learn a page's data (then --find/--pick/--where/--group/--count/--limit)`);
  out.push(`//          node client.mjs action <name> '[args]' --approved`);
  out.push(`// Library: import { get, page, action, recipes } from "./client.mjs"`);
  out.push(``);
  out.push(`import fs from "node:fs";`);
  out.push(`import path from "node:path";`);
  out.push(`import { fileURLToPath } from "node:url";`);
  out.push(``);
  out.push(`const DIR = path.dirname(fileURLToPath(import.meta.url));`);
  out.push(`export const ORIGIN = ${JSON.stringify(origin)};`);
  out.push(`const AUTH = ${JSON.stringify(auth)}; // auth headers the site sends (names and where the page keeps them, no values)`);
  out.push(`const ACTIONS = ${JSON.stringify(actions, null, 2)};`);
  out.push(`const PAGES = ${JSON.stringify(pages)};`);
  out.push(``);
  out.push(READ_ENV);
  out.push(`const HOST = ${JSON.stringify(host)};`);
  out.push(`const IFRAMER = process.env.IFRAMER_BIN || ${JSON.stringify(iframerCli() || "iframer")}; // the iframer that wrote this client`);
  out.push(`const env = { ...readEnv(path.join(DIR, ".env")), ...process.env };`);
  out.push(REFRESH);
  out.push(`export const core = (${recipeCore.toString()})();`);
  out.push(`core.setAuth(AUTH);`);
  out.push(`core.setTransport({ base: ORIGIN, cookie: env.COOKIE || null, env, actions: ACTIONS, relogin: ${JSON.stringify(`log in to ${host} in a browser on this machine, then: iframer auth ${host} --out ${dir}`)}, onExpired: refreshSession });`);
  out.push(``);
  out.push(`const FP = path.join(DIR, ".fingerprints.json");`);
  out.push(`const fps = {`);
  out.push(`  get() { try { return JSON.parse(fs.readFileSync(FP, "utf8")); } catch { return {}; } },`);
  out.push(`  set(m) { try { fs.writeFileSync(FP, JSON.stringify(m, null, 2)); } catch {} },`);
  out.push(`};`);
  out.push(`const run = (${recipeRunner.toString()})(core, fps);`);
  out.push(``);
  out.push(`/** Any same-site request. Next.js page data: {rsc: true}. Returns parsed data. */`);
  out.push(`// No session yet: take it from a logged-in browser before the first call.`);
  out.push(`const ready = env.COOKIE ? Promise.resolve() : refreshSession();`);
  out.push(`export const get = (p, o) => ready.then(() => core.get(p, o));`);
  out.push(`/** A Next.js page's data: {components: {Name: props}, rows, ...}. */`);
  out.push(`export const page = (p, o) => get(p, { ...o, rsc: true });`);
  out.push(`/** A Next.js Server Action by export name (its id is re-found after a deploy). Changes data unless it only reads. */`);
  out.push(`export const action = (name, args = [], pagePath) => ready.then(() => core.action(name, args, pagePath));`);
  out.push(`export const actions = Object.fromEntries(Object.keys(ACTIONS).map((n) => [n, (...args) => action(n, args)]));`);
  out.push(``);
  out.push(`const SPECS = {`);
  for (const r of specs) {
    out.push(`  // ${r.name}${r.description ? `: ${r.description}` : ""}${r.writes ? "  [writes]" : ""}`);
    out.push(`  ${JSON.stringify(r.name)}: ${specLiteral(r)},`);
  }
  out.push(`};`);
  out.push(`/** Saved recipes: each takes its args object and resolves to one short line ("error: ..." on failure). */`);
  out.push(`export const recipes = Object.fromEntries(Object.keys(SPECS).map((n) => [n, (a, max) => ready.then(() => run(SPECS[n], a, max))]));`);
  for (const r of specs) out.push(`export const ${r.name} = recipes[${JSON.stringify(r.name)}];`);
  out.push(``);
  out.push(CLI_SOURCE.replace(/__HOST__/g, host));
  return out.join("\n") + "\n";
}

// .env reader of client.mjs: KEY=value lines, optional quotes and "export".
const READ_ENV = String.raw`function readEnv(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
  return env;
}`;

// Session refresh of client.mjs: once per process, re-read the session from a
// logged-in browser on this machine (iframer auth --auto). Off with IFRAMER_NO_AUTO_AUTH=1.
const REFRESH = String.raw`let refreshed = null;
function refreshSession() {
  if (refreshed) return refreshed;
  refreshed = new Promise((ok) => {
    if (process.env.IFRAMER_NO_AUTO_AUTH === "1") return ok(false);
    import("node:child_process").then(({ execFile }) => {
      const argv = ["auth", HOST, "--out", DIR, "--auto"];
      const [cmd, a] = /\.[cm]?js$/.test(IFRAMER) ? [process.execPath, [IFRAMER, ...argv]] : [IFRAMER, argv];
      execFile(cmd, a, { timeout: 90000 }, (err) => {
        if (err) return ok(false);
        const e = readEnv(path.join(DIR, ".env"));
        if (!e.COOKIE || e.COOKIE === env.COOKIE) return ok(false);
        env.COOKIE = e.COOKIE;
        core.setTransport({ cookie: e.COOKIE });
        ok(true);
      });
    }, () => ok(false));
  });
  return refreshed;
}`;

// The CLI part of client.mjs (plain JS, kept here so it is easy to read).
const CLI_SOURCE = String.raw`function flags(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2), next = argv[i + 1];
    if (["rsc", "schema", "count", "full", "approved", "json"].includes(k)) o[k] = true;
    else { o[k] = next; i++; }
  }
  return o;
}
function args(s) {
  if (!s) return {};
  if (/^[\[{]/.test(s.trim())) return JSON.parse(s);
  return Object.fromEntries(s.split(/\s+/).filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));
}
const show = (v, max) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.length <= max) return s;
  const over = v && typeof v === "object" ? core.schema(v.components || v) : "";
  return s.slice(0, Math.min(max, 1500)) + " …(" + s.length + " chars; narrow it with --find/--pick/--where/--group/--count/--limit, or --full)" + (over ? "\n" + over : "");
};
async function main(argv) {
  const f = flags(argv), cmd = f._[0], max = f.full ? 30000 : 4000;
  if (!cmd) {
    const need = ["COOKIE", ...Object.keys(AUTH).map(core.envName)];
    console.log("__HOST__ (" + ORIGIN + ")");
    await ready;
    console.log("auth: " + need.map((n) => n + (env[n] ? " set" : " missing")).join(", ") + (need.some((n) => !env[n]) ? "  -> log in to __HOST__ in a browser here, then iframer auth __HOST__" : ""));
    console.log("recipes: " + (Object.keys(SPECS).join(", ") || "none yet (iframer recipe __HOST__ <name> ...)"));
    console.log("actions: " + (Object.keys(ACTIONS).join(", ") || "none"));
    console.log("pages/endpoints (" + PAGES.length + "): " + PAGES.slice(0, 30).join(" | ") + (PAGES.length > 30 ? " | ..." : ""));
    return 0;
  }
  if (cmd === "get" || cmd === "page") {
    const p = f._[1];
    if (!p) throw new Error("usage: node client.mjs get <path> [--rsc] [--schema] [--find F] [--pick P] [--where W] [--group G] [--count] [--limit N] [--nodes a]");
    let d = await get(p, { rsc: f.rsc || cmd === "page", find: f.find });
    if (f.schema) { console.log(core.schema(d, { under: f.under })); return 0; }
    if (f.nodes) { if (!d || !d.rows) throw new Error("--nodes needs a Next.js page (--rsc)"); d = core.nodes(d.rows, f.nodes); }
    else if (f.find) {
      const amb = core.ambiguity(core.findAll(d && d.components ? d.components : d, f.find));
      if (amb) throw new Error(core.ambiguousMsg(f.find, amb));
      d = core.find(d && d.components ? d.components : d, f.find);
      if (d === undefined) throw new Error("nothing matches --find " + f.find + ": see --schema");
    }
    d = core.answer(d, { pick: f.pick, where: f.where, group: f.group, count: f.count, limit: f.limit && +f.limit });
    console.log(show(d, max));
    return 0;
  }
  if (cmd === "action") {
    if (!f._[1]) throw new Error("usage: node client.mjs action <name> '[args]' --approved [--path /page]");
    if (!f.approved) throw new Error("actions can change data: re-run with --approved once the user OKs it");
    const a = f._[2] ? JSON.parse(f._[2]) : [];
    console.log(show(await action(f._[1], Array.isArray(a) ? a : [a], f.path), max));
    return 0;
  }
  if (SPECS[cmd]) {
    const line = await recipes[cmd](args(f._.slice(1).join(" ")), max);
    console.log(line);
    return line.startsWith("error:") ? 1 : 0;
  }
  throw new Error("unknown command " + cmd + ". Recipes: " + (Object.keys(SPECS).join(", ") || "none"));
}
const isMain = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]); } catch { return false; } })();
if (isMain) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.log("error: " + (e && e.message || e)); process.exitCode = 1; });
}`;

export function renderRecipes(specs: RecipeSpec[], auth: Record<string, unknown> = {}): string {
  const out: string[] = [];
  out.push(`// iframer in-page recipes${specs[0] ? ` for ${specs[0].host}` : ""}: the fallback for sites that block non-browser clients.`);
  out.push(`// Prefer client.mjs (Node). Here: run in a logged-in tab on the site: window.__ifkRecipes.<name>({...args}) returns one short line.`);
  for (const s of specs) out.push(`//   ${s.name}${s.description ? `: ${s.description}` : ""}${s.writes ? "  [writes]" : ""}`);
  out.push(`(function () {`);
  out.push(`  var core = (${recipeCore.toString()})();`);
  out.push(`  core.setAuth(${JSON.stringify(auth)}); // where the site keeps its auth headers: read fresh on every call`);
  out.push(`  var run = (${recipeRunner.toString()})(core, { get: fpStore, set: fpSave });`);
  out.push(`  var R = window.__ifkRecipes = { __runtime: ${JSON.stringify(RUNTIME)} };`);
  // Storage that survives reloads and new tabs on this origin (iframe fallback for sites that delete it).
  out.push(`  function store() {`);
  out.push(`    try { if (window.localStorage) return window.localStorage; } catch (e) {}`);
  out.push(`    try { var f = document.getElementById("__ifk_ss"); if (!f) { f = document.createElement("iframe"); f.id = "__ifk_ss"; f.style.display = "none"; document.documentElement.appendChild(f); } return f.contentWindow.localStorage; } catch (e) { return null; }`);
  out.push(`  }`);
  out.push(`  function fpStore() { try { return JSON.parse((store() || {}).getItem && store().getItem("__ifkFP") || "{}"); } catch (e) { return {}; } }`);
  out.push(`  function fpSave(m) { try { store().setItem("__ifkFP", JSON.stringify(m)); } catch (e) {} }`);
  out.push(`  function src(v) { return typeof v === "function" ? "(" + v.toString() + ")" : JSON.stringify(v === undefined ? null : v); }`);
  // Adds one recipe to the loaded bundle, and (persist) to the stored copy, without re-uploading.
  out.push(`  R.__add = function (name, spec, persist, runtime) {`);
  out.push(`    if (runtime && runtime !== R.__runtime) return "recipe runtime outdated in this tab: reload the bundle (the 3 upload calls), then add again";`);
  out.push(`    spec.findText = spec.findText || (typeof spec.find === "string" ? spec.find : "");`);
  out.push(`    spec.name = name;`);
  out.push(`    R[name] = function (a) { return run(spec, a); };`);
  out.push(`    if (persist) { var st = store(); if (st && st.getItem("__ifkR")) { var body = Object.keys(spec).map(function (k) { return JSON.stringify(k) + ":" + src(spec[k]); }).join(","); st.setItem("__ifkR", st.getItem("__ifkR") + "\\n;window.__ifkRecipes.__add(" + JSON.stringify(name) + ",{" + body + "});"); } }`);
  out.push(`    return name;`);
  out.push(`  };`);
  for (const s of specs) out.push(`  R[${JSON.stringify(s.name)}] = function (a) { return run(${specLiteral(s)}, a); };`);
  out.push(`  return Object.keys(R);`);
  out.push(`})();`);
  return out.join("\n") + "\n";
}
