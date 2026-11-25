/**
 * Tab bridge, CLI side: start, replace and stop the daemon, and the attach
 * instructions per browser tool. The daemon itself is server.ts.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDataDir } from "../paths";
import { clientModuleSource } from "./client";
import { relaySource } from "./relay";
import { BRIDGE_VERSION, bridgePort, clearState, covers, masterKey, readState, siteFor, tabKey, validName, validSite, type BridgeState } from "./state";

export { BRIDGE_VERSION, readState, siteFor, validName, validSite, covers } from "./state";
export { relaySource } from "./relay";
export { tabBridgeClient, clientModuleSource } from "./client";

export interface TabInfo { site: string; name: string; url: string; since: number; stalled: boolean; readOnly: boolean }
export interface BridgeStatus { pid: number; v: number; tabs: TabInfo[]; detached: Array<{ site: string; name: string; at: number }> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The running daemon's answer, or null when it is not there. */
export async function ping(st: BridgeState | null = readState()): Promise<BridgeStatus | null> {
  if (!st) return null;
  try {
    const r = await fetch(`http://127.0.0.1:${st.port}/status`, { headers: { Authorization: `Bearer ${st.token}` }, signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as BridgeStatus) : null;
  } catch { return null; }
}

function packageRoot(): string {
  let d = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try { if (JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")).name === "iframer-toolkit") return d; } catch { /* keep looking */ }
    d = path.dirname(d);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** How to run the daemon: the built bundle, or the source in a development checkout. */
function serverCommand(): { cmd: string; args: string[] } {
  const root = packageRoot();
  const cjs = path.join(root, "dist", "bridge-server.cjs");
  const ts = path.join(root, "src", "lib", "tabbridge", "server-main.ts");
  const bun = !!(process.versions as Record<string, string>).bun;
  // Running from source (tests, `bun bin/cli.js`): use the source, the bundle may be older.
  if (bun && fs.existsSync(ts) && !/[\\/]dist[\\/]/.test(fileURLToPath(import.meta.url))) return { cmd: process.execPath, args: ["run", ts] };
  if (fs.existsSync(cjs)) return { cmd: process.execPath, args: [cjs] };
  if (fs.existsSync(ts)) return bun ? { cmd: process.execPath, args: ["run", ts] } : { cmd: process.execPath, args: ["--import", "tsx", ts] };
  throw new Error("the tab bridge daemon is missing from this install (dist/bridge-server.cjs): reinstall iframer-toolkit");
}

async function stopPid(st: BridgeState): Promise<void> {
  try { await fetch(`http://127.0.0.1:${st.port}/shutdown`, { method: "POST", headers: { Authorization: `Bearer ${st.token}` }, signal: AbortSignal.timeout(3000) }); } catch { /* fall through to the signal */ }
  for (let i = 0; i < 20 && (await ping(st)); i++) await sleep(150);
  if (await ping(st)) { try { process.kill(st.pid, "SIGTERM"); } catch { /* gone */ } }
  for (let i = 0; i < 20 && (await ping(st)); i++) await sleep(150);
  clearState(st.pid);
}

/** Starts the daemon if it isn't running. A daemon from older code is replaced; attached tabs reconnect by themselves. */
export async function start(): Promise<BridgeState> {
  const now = readState();
  if (now && (await ping(now))) {
    if (now.v === BRIDGE_VERSION) return now;
    await stopPid(now);
  }
  const { cmd, args } = serverCommand();
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, IFRAMER_DATA_DIR: getDataDir() } });
  child.on("error", () => { /* reported by the wait below */ });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    const st = readState();
    // Another CLI may have started it at the same moment: any live daemon of this version will do.
    if (st && st.v === BRIDGE_VERSION && (await ping(st))) return st;
  }
  throw new Error(`the tab bridge did not start on 127.0.0.1:${bridgePort()} (port in use? set IFRAMER_BRIDGE_PORT). Scripts still work the old way`);
}

export async function stop(): Promise<boolean> {
  const st = readState();
  if (!st || !(await ping(st))) { if (st) clearState(st.pid); return false; }
  await stopPid(st);
  return true;
}

export type BridgeTarget = "t3" | "playwright-mcp" | "any";
export const BRIDGE_TARGETS: BridgeTarget[] = ["t3", "playwright-mcp", "any"];

export interface AttachOptions { host: string; site?: string; name?: string; readOnly?: boolean; target?: BridgeTarget }

/** Starts the daemon and returns what the agent has to do: one evaluate call in the logged-in tab. */
export async function attach(o: AttachOptions): Promise<{ site: string; name: string; expression: string; text: string }> {
  const host = o.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const site = o.site ? siteFor(o.site) : siteFor(host);
  const name = o.name || "default";
  if (!validSite(site)) throw new Error(`not a site: ${site}. Give the host of the logged-in tab, e.g. iframer bridge attach www.example.com`);
  if (!validName(name)) throw new Error(`--name takes letters, digits, dot, dash and underscore: ${name}`);
  const origin = `${/^(127\.0\.0\.1|localhost)(:|$)/.test(host) ? "http" : "https"}://${host}`;
  if (!covers(site, origin)) throw new Error(`--site ${site} does not cover ${host}: it must be ${host} or a parent domain of it`);
  const st = await start();
  const expression = relaySource({ port: st.port, site, name, readOnly: !!o.readOnly, key: tabKey(masterKey(), site, name, !!o.readOnly) });
  const target = o.target || "t3";
  const scope = `${site}${site === host ? "" : " and its subdomains"}${name === "default" ? "" : `, tab name "${name}"`}${o.readOnly ? ", read-only" : ""}`;
  const steps = target === "t3"
    ? [
      `1. A T3 Code tab on ${host}, logged in (preview_open ${origin}/ if this thread has none; reuse the same tabId).`,
      `2. preview_evaluate in that tab, with the expression below. It answers ATTACHED (or ALREADY_ATTACHED).`,
    ]
    : target === "playwright-mcp"
      ? [
        `1. A Playwright MCP tab on ${host}, logged in (browser_navigate ${origin}/).`,
        `2. browser_evaluate with function: () => <the expression below>. It answers ATTACHED (or ALREADY_ATTACHED).`,
      ]
      : [
        `1. A browser tab on ${host}, logged in.`,
        `2. Evaluate the expression below in that page (any tool that runs JS in the page, or the DevTools console). It answers ATTACHED (or ALREADY_ATTACHED).`,
      ];
  const text = [
    `Tab bridge for ${scope}. Node scripts (client.mjs, recipes, any script) then send their requests through that tab: the tab does the fetch with its own login. No cookie is read or saved.`,
    ``,
    ...steps,
    `3. Check: iframer bridge status   ->   ${site} listed under "attached".`,
    ``,
    `Answers:`,
    `- CSP_BLOCKED: this site forbids the connection. The bridge can't be used here: use iframer auth ${host}, or iframer recipe ${host} --in-page.`,
    `- NO_BRIDGE or WAITING: run this command again and use the fresh expression. Chrome 147+ may ask to allow local network access for the site: allow it.`,
    `- The tab shows a login page: the user logs in there, then evaluate the expression again.`,
    ``,
    `Rules:`,
    `- Leave the tab open. A page reload, navigation to another page load or a closed tab drops it: evaluate the same expression again (it stays valid).`,
    `- A daemon restart does not drop it: the tab reconnects by itself (a background tab can take a minute).`,
    `- Scripts print "stopped: tab bridge: ..." with the next step when the tab can't answer. A write is never sent twice: when an error says it may have reached the site, check the site before running it again.`,
    `- Stop using the tab: iframer bridge stop (scripts go back to the saved session).`,
    ``,
    `Expression:`,
    expression,
  ].join("\n");
  return { site, name, expression, text };
}

/** `iframer bridge status`, as lines for the agent. */
export async function statusText(): Promise<string> {
  const st = readState();
  const s = await ping(st);
  if (!s) return "tab bridge not running (scripts use their saved session). Start it by attaching a tab: iframer bridge attach <host>";
  const now = Date.now();
  const pools = [...new Set(s.tabs.map((x) => `${x.site}\n${x.name}`))].map((key) => {
    const [site, name] = key.split("\n");
    const tabs = s.tabs.filter((x) => x.site === site && x.name === name);
    const last = Math.max(...tabs.map((x) => x.since));
    const stuck = tabs.filter((x) => x.stalled).length;
    const bits = [
      tabs.length > 1 ? `${tabs.length} tabs, newest attached ${Math.round((now - last) / 60000)} min ago` : `attached ${Math.round((now - last) / 60000)} min ago`,
      ...(name === "default" ? [] : [`name ${name}`]),
      ...(tabs.every((x) => x.readOnly) ? ["read-only"] : []),
      ...(stuck ? [stuck === tabs.length ? "NOT ANSWERING: evaluate the attach expression in a fresh tab" : `${stuck} not answering`] : []),
    ];
    return `${site} (${bits.join("; ")})`;
  });
  const gone = s.detached.map((x) => `${x.site}${x.name === "default" ? "" : ` [${x.name}]`} (detached ${Math.round((now - x.at) / 60000)} min ago: page reloaded, navigated or closed. Attach again)`);
  return [
    `tab bridge running (pid ${s.pid}, 127.0.0.1:${st!.port})${s.v === BRIDGE_VERSION ? "" : " (older version: `iframer bridge attach <host>` replaces it)"}`,
    `attached: ${pools.join(", ") || "none"}`,
    ...(gone.length ? [`detached: ${gone.join(", ")}`] : []),
  ].join("\n");
}

/** Writes the standalone client module for scripts that are not a generated client.mjs. */
export function writeClientModule(file = path.join(getDataDir(), "bridge", "tab-bridge.mjs")): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, clientModuleSource());
  return file;
}
