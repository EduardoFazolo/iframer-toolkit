/**
 * In-page capture kit: API reverse engineering inside a browser iframer does
 * not control. Works with any agent browser tool that can evaluate JS in the
 * page; T3 Code's preview tabs get a file-based route that keeps both the kit
 * and the capture out of the agent's context.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths";
import { pageKit } from "./page-kit";

export * from "./capture";

export interface KitOptions {
  mode?: "hook" | "passive";
  hostFilter?: string;
  maxBody?: number;
  maxCalls?: number;
  build?: string;
}

/** The kit as one evaluable expression. Its completion value is the install result. */
export function kitSource(opts: KitOptions = {}): string {
  const clean: KitOptions = {};
  if (opts.mode) clean.mode = opts.mode;
  if (opts.hostFilter) clean.hostFilter = opts.hostFilter;
  if (opts.maxBody) clean.maxBody = opts.maxBody;
  if (opts.maxCalls) clean.maxCalls = opts.maxCalls;
  const fn = pageKit.toString();
  // Build id: a tab running a different kit swaps it out on install instead of keeping the old one.
  const build = crypto.createHash("sha1").update(fn).digest("hex").slice(0, 10);
  return `(${fn})(${JSON.stringify({ ...clean, build })});\n`;
}

export function kitDir(): string {
  return path.join(getDataDir(), "kit");
}

/** Writes the kit to ~/.iframer/kit/iframer-kit.js (or `file`) and returns the path. */
export function writeKit(opts: KitOptions = {}, file = path.join(kitDir(), "iframer-kit.js")): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, kitSource(opts), "utf8");
  return file;
}

// ─── Agent instructions per browser tool ───────────────────────────────────

export type KitTarget = "t3" | "playwright-mcp" | "any";

export const KIT_TARGETS: KitTarget[] = ["t3", "playwright-mcp", "any"];

/** Puts a hidden file input on the page for the upload step. */
const MAKE_INPUT = `(()=>{let i=document.createElement('input');i.type='file';i.id='__ifk_in';i.style.display='none';document.documentElement.append(i);return 1})()`;
/**
 * sessionStorage, or the same storage through a hidden blank iframe on sites
 * that delete window.sessionStorage (Discord). Must match store() in page-kit.ts.
 */
const SS = `(window.sessionStorage||(document.getElementById('__ifk_ss')||(f=>(f.id='__ifk_ss',f.style.display='none',document.documentElement.append(f),f))(document.createElement('iframe'))).contentWindow.sessionStorage)`;
/** Moves the uploaded file into sessionStorage so later reinstalls are one short eval. */
const stash = (key: string) => `document.getElementById('__ifk_in').files[0].text().then(t=>{${SS}.${key}=t;document.getElementById('__ifk_in').remove();return t.length})`;
const STASH = stash("__ifk");
const INSTALL = `eval(${SS}.__ifk)`;
const INSTALL_CLIENT = `eval(${SS}.__ifkApi)`;
const STATUS = `window.__ifk?window.__ifk.summary():'NOT_INSTALLED'`;

export function kitInstructions(target: KitTarget, kitPath: string, clientPath?: string): string {
  const common = [
    ``,
    `Rules:`,
    `- After EVERY full page load, run \`${INSTALL}\` again. It restores what was captured. Check with \`${STATUS}\`.`,
    `- Drive the site with your normal tools while it records. Only shapes are kept, never values.`,
    `- Next.js sites: page data comes back from \`window.__ifk.call('GET','/path',{rsc:true})\` as {components:{Name:props}}. Server Actions: \`window.__ifk.action('exportName',[args],{approved:true})\` (the id is looked up again after deploys).`,
    `- Replay: \`window.__ifk.call('GET','/path')\` runs in the page with the user's cookies. Writes need {approved:true}, so ask the user first. It stops on 403, 429 or a captcha page: do not retry.`,
    `- Coverage is never complete: workers, redirect hops, HttpOnly cookies and cross-origin iframes are invisible to the kit.`,
    `- Done: \`window.__ifk.stop()\` removes the hooks.`,
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
      ...(clientPath ? [
        ``,
        `Use the generated client (after the kit is installed):`,
        `a. preview_evaluate: ${MAKE_INPUT}`,
        `b. preview_act: action=upload, selector=#__ifk_in, paths=["${clientPath}"]`,
        `c. preview_evaluate: ${stash("__ifkApi")}`,
        `d. preview_evaluate: ${INSTALL_CLIENT}   -> list of function names`,
        `e. preview_evaluate: window.__ifkApi.<functionName>(...)`,
        `After a page load: ${INSTALL} then ${INSTALL_CLIENT}`,
      ] : []),
      ...common,
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
      ...common,
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
    ...common,
  ].join("\n");
}

function drainFallback(): string {
  return [
    `Drain fallback (no downloads): evaluate window.__ifk.drain(0) -> {chunk, next}. Repeat with drain(next)`,
    `until next is null, write the joined chunks to a file, then \`iframer ingest <file>\`.`,
  ].join("\n");
}
