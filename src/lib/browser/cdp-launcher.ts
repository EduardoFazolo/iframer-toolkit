import { spawn, type ChildProcess } from "child_process";
import net from "net";
import os from "os";
import path from "path";
import fs from "fs";
import { ensureChrome } from "./chrome-downloader";
import type { BrowserMode } from "../types";
import { createLogger } from "../logger";

const log = createLogger("cdp-launcher");
export interface ChromeLaunchResult {
  process: ChildProcess;
  cdpUrl: string;       // ws://127.0.0.1:<port>/devtools/browser/<id>
  port: number;
}

export interface ChromeLaunchOptions {
  mode: BrowserMode;
  executablePath?: string;
  userDataDir?: string;
  args?: string[];
  proxy?: string;
  port?: number;         // specific CDP port (default: random)
}

async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        srv.close(() => resolve(addr.port));
      } else {
        srv.close(() => reject(new Error("Could not allocate port")));
      }
    });
    srv.on("error", reject);
  });
}

function hasDisplay(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return !!process.env.DISPLAY;
}

export async function launchChrome(options: ChromeLaunchOptions): Promise<ChromeLaunchResult> {
  if (options.mode === "docker-headful") {
    throw new Error("Docker mode uses the Docker container's browser, not direct launch. Connect via HTTP API.");
  }

  if (options.mode === "binary-headful" && !hasDisplay()) {
    throw new Error("binary-headful mode requires a display. On Linux, set $DISPLAY or use docker-headful mode.");
  }

  const chromePath = options.executablePath || await ensureChrome();
  const port = options.port || await getRandomPort();

  log.debug(`Chrome: ${chromePath}`);
  log.debug(`Mode: ${options.mode}, Port: ${port}`);

  const args = [
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-client-side-phishing-detection",
    "--disable-default-apps",
    "--disable-hang-monitor",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    ...(options.args || []),
  ];

  if (options.mode === "headless") {
    args.push("--headless=new");
  }

  if (options.proxy) {
    args.push(`--proxy-server=${options.proxy}`);
  }

  // Always use a dedicated user-data-dir to avoid conflicting with a running Chrome instance
  const userDataDir = options.userDataDir || path.join(os.homedir(), ".iframer", "chrome-profile", options.mode);
  fs.mkdirSync(userDataDir, { recursive: true });
  args.push(`--user-data-dir=${userDataDir}`);

  // Start with about:blank so Chrome is ready
  args.push("about:blank");

  const chromeProcess = spawn(chromePath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  // Parse CDP WebSocket URL from stderr
  const cdpUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Chrome CDP URL (10s)"));
    }, 10_000);

    let stderrBuf = "";

    chromeProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      // Chrome prints: DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    chromeProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to launch Chrome: ${err.message}`));
    });

    chromeProcess.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null) {
        reject(new Error(`Chrome exited with code ${code}. stderr: ${stderrBuf.slice(0, 500)}`));
      }
    });
  });

  return { process: chromeProcess, cdpUrl, port };
}

export function checkModeAvailability(): { headless: boolean; binaryHeadful: boolean } {
  return {
    headless: true,  // Always available — we can auto-download Chrome
    binaryHeadful: hasDisplay(),
  };
}
