import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const CHROME_VERSIONS_URL =
  "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

const DEFAULT_INSTALL_DIR = path.join(os.homedir(), ".iframer", "chrome");

function getPlatform(): string {
  const arch = process.arch;
  const platform = process.platform;

  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "linux") return "linux64";
  if (platform === "win32") return "win64";
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function getChromeExecutablePath(installDir: string): string {
  const platform = process.platform;
  if (platform === "darwin") {
    // Chrome for Testing on macOS unpacks to: chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
    const entries = fs.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-mac-arm64";
    return path.join(installDir, dir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (platform === "linux") {
    const entries = fs.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-linux64";
    return path.join(installDir, dir, "chrome");
  }
  if (platform === "win32") {
    const entries = fs.readdirSync(installDir).filter((e) => e.startsWith("chrome-"));
    const dir = entries[0] || "chrome-win64";
    return path.join(installDir, dir, "chrome.exe");
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

export async function downloadChrome(installDir: string = DEFAULT_INSTALL_DIR): Promise<string> {
  console.log("[chrome] Downloading Chrome for Testing (first time only)...");

  // Fetch version info
  const res = await fetch(CHROME_VERSIONS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Chrome versions: ${res.status}`);
  const data = (await res.json()) as any;

  const channel = data.channels?.Stable;
  if (!channel) throw new Error("No Stable channel found in Chrome for Testing versions");

  const platform = getPlatform();
  const download = channel.downloads?.chrome?.find((d: any) => d.platform === platform);
  if (!download) throw new Error(`No Chrome for Testing download for platform: ${platform}`);

  const url = download.url as string;
  const version = channel.version as string;
  console.log(`[chrome] Version ${version} for ${platform}`);
  console.log(`[chrome] URL: ${url}`);

  // Create install directory
  fs.mkdirSync(installDir, { recursive: true });

  // Download zip
  const zipPath = path.join(installDir, "chrome.zip");
  const dlRes = await fetch(url);
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  fs.writeFileSync(zipPath, buf);
  console.log(`[chrome] Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`);

  // Extract
  execSync(`unzip -o -q "${zipPath}" -d "${installDir}"`, { stdio: "inherit" });
  fs.unlinkSync(zipPath);

  const execPath = getChromeExecutablePath(installDir);
  if (!fs.existsSync(execPath)) {
    throw new Error(`Chrome executable not found after extraction: ${execPath}`);
  }

  // Make executable on Unix
  if (process.platform !== "win32") {
    fs.chmodSync(execPath, 0o755);
  }

  // Save version info
  fs.writeFileSync(path.join(installDir, "version.json"), JSON.stringify({ version, platform, downloadedAt: new Date().toISOString() }));

  console.log(`[chrome] Installed at: ${execPath}`);
  return execPath;
}

/**
 * Find Chrome for Testing (our downloaded copy).
 * Does NOT fall back to system Chrome — use findAnyChrome() for that.
 */
export function findChromeForTesting(): string | null {
  // 1. Environment variable override
  if (process.env.CHROME_EXECUTABLE) {
    if (fs.existsSync(process.env.CHROME_EXECUTABLE)) return process.env.CHROME_EXECUTABLE;
  }

  // 2. Our downloaded Chrome for Testing
  try {
    const execPath = getChromeExecutablePath(DEFAULT_INSTALL_DIR);
    if (fs.existsSync(execPath)) return execPath;
  } catch {}

  return null;
}

/**
 * Find any Chrome — Chrome for Testing first, then system Chrome.
 * Only used as fallback when download fails.
 */
export function findChrome(): string | null {
  const cft = findChromeForTesting();
  if (cft) return cft;

  // System Chrome — last resort
  const systemPaths =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "linux"
        ? [
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
          ]
        : [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          ];

  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

export function isChromiumInstalled(): boolean {
  return findChrome() !== null;
}

/**
 * Ensure Chrome for Testing is available. Downloads it if needed.
 * Prefers Chrome for Testing over system Chrome for stealth reasons.
 */
export async function ensureChrome(): Promise<string> {
  // Prefer Chrome for Testing (no detectable automation fingerprint)
  const cft = findChromeForTesting();
  if (cft) return cft;

  // Download Chrome for Testing
  try {
    return await downloadChrome();
  } catch (err: any) {
    console.error(`[chrome] Failed to download Chrome for Testing: ${err.message}`);
    // Fall back to system Chrome only if download fails
    const system = findChrome();
    if (system) {
      console.log(`[chrome] Falling back to system Chrome: ${system}`);
      return system;
    }
    throw new Error("No Chrome found. Download failed and no system Chrome available.");
  }
}
