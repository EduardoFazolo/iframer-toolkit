import fs from "fs";
import { chromium } from "patchright";
import { STEALTH_ARGS } from "./stealth";
import type { Browser } from "patchright";
import { createLogger } from "../logger";

const log = createLogger("launcher");
const UBLOCK_PATH = "/extensions/uBlock0.chromium";

function findChromeExecutable(): string | undefined {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  // Real Chrome on amd64 (production)
  if (fs.existsSync("/usr/bin/google-chrome-stable")) return "/usr/bin/google-chrome-stable";
  // Otherwise return undefined — let patchright use its own bundled Chromium
  return undefined;
}

export const BROWSER_ORDER = ["chromium"];

let cachedBrowser: Browser | null = null;

export async function getBrowser(_name: string = "chromium"): Promise<Browser> {
  if (cachedBrowser) {
    if (cachedBrowser.isConnected()) return cachedBrowser;
    // Stale handle: the CDP connection dropped but the Chrome process may still
    // be alive. Close it before relaunching, otherwise we orphan a process.
    try { await cachedBrowser.close(); } catch (e) { log.warn(`stale browser close failed: ${e}`); }
    cachedBrowser = null;
  }
  cachedBrowser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });
  return cachedBrowser;
}

/** Close the cached ephemeral browser (used by fetch()). Call on shutdown. */
export async function closeBrowser(): Promise<void> {
  if (!cachedBrowser) return;
  try { await cachedBrowser.close(); } catch (e) { log.warn(`closeBrowser failed: ${e}`); }
  cachedBrowser = null;
}

export async function getBrowserWithFallback(_preferred?: string): Promise<{ browser: Browser; name: string }> {
  // Chromium-only via patchright (stealth-patched fork). No firefox/webkit fallback.
  return { browser: await getBrowser(), name: "chromium" };
}

export async function launchHeadful(displayNum: number): Promise<Browser> {
  const executablePath = findChromeExecutable();
  const hasExtensions = fs.existsSync(UBLOCK_PATH);

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
    "--use-angle=swiftshader",
  ];

  if (hasExtensions) args.push(`--load-extension=${UBLOCK_PATH}`);

  const launchOpts: Record<string, unknown> = {
    headless: false,
    args,
    env: { ...process.env, DISPLAY: `:${displayNum}` },
  };

  if (executablePath) launchOpts.executablePath = executablePath;

  log.debug(`headful: ${executablePath || "patchright chromium"}, extensions: ${hasExtensions}`);

  return chromium.launch(launchOpts as Parameters<typeof chromium.launch>[0]);
}
