import fs from "fs";
import { chromium } from "patchright";
import { chromium as realChromium, firefox, webkit } from "playwright";
import { STEALTH_ARGS } from "./stealth";
import type { Browser } from "patchright";
import { createLogger } from "../logger";

const log = createLogger("launcher");
const UBLOCK_PATH = "/extensions/uBlock0.chromium";

function findChromeExecutable(): string | undefined {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  // Real Chrome on amd64 (production)
  if (fs.existsSync("/usr/bin/google-chrome-stable")) return "/usr/bin/google-chrome-stable";
  // On arm64, return undefined — let patchright use its own bundled Chromium
  return undefined;
}

const BROWSER_TYPES: Record<string, typeof chromium> = { chromium, firefox: firefox as unknown as typeof chromium, webkit: webkit as unknown as typeof chromium };
export const BROWSER_ORDER = ["chromium", "firefox", "webkit"];

const browsers: Record<string, Browser> = {};

export async function getBrowser(name: string = "chromium"): Promise<Browser> {
  if (browsers[name] && browsers[name].isConnected()) {
    return browsers[name];
  }

  const type = BROWSER_TYPES[name];
  if (!type) throw new Error(`Unknown browser: ${name}. Must be one of: ${BROWSER_ORDER.join(", ")}`);

  browsers[name] = await type.launch({
    headless: true,
    args: name === "chromium" ? STEALTH_ARGS : [],
  });

  return browsers[name];
}

export async function getBrowserWithFallback(preferred?: string): Promise<{ browser: Browser; name: string }> {
  const order = preferred
    ? [preferred, ...BROWSER_ORDER.filter((b) => b !== preferred)]
    : BROWSER_ORDER;

  const errors: string[] = [];
  for (const name of order) {
    try {
      return { browser: await getBrowser(name), name };
    } catch (err: unknown) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All browsers failed to launch: ${errors.join("; ")}`);
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

  const hasRealChrome = fs.existsSync("/usr/bin/google-chrome-stable") || !!process.env.CHROME_EXECUTABLE;
  log.debug(`headful: ${executablePath || "patchright chromium"}, extensions: ${hasExtensions}, realChrome: ${hasRealChrome}`);

  // Use real Chrome (amd64) with playwright; fall back to patchright's patched Chromium (arm64)
  if (hasRealChrome) {
    return realChromium.launch(launchOpts as Parameters<typeof realChromium.launch>[0]) as unknown as Browser;
  } else {
    return chromium.launch(launchOpts as Parameters<typeof chromium.launch>[0]);
  }
}
