import { FingerprintGenerator } from "fingerprint-generator";
import { CHROME_MIN_VERSION, SCREEN_DEFAULTS } from "../constants";

const generator = new FingerprintGenerator({
  browsers: [{ name: "chrome", minVersion: CHROME_MIN_VERSION }],
  operatingSystems: ["windows"],
  devices: ["desktop"],
  locales: ["en-US"],
});

export interface BrowserFingerprint {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  screenAvailHeight: number;
  colorDepth: number;
  deviceScaleFactor: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  languages: string[];
  uaData: {
    brands: Array<{ brand: string; version: string }>;
    fullVersionList: Array<{ brand: string; version: string }>;
    platformVersion: string;
    uaFullVersion: string;
  };
}

export function generateWindowsFingerprint(): BrowserFingerprint {
  const fp = generator.getFingerprint();
  const { navigator: nav, screen } = fp.fingerprint;

  // Common Windows HiDPI scale factors
  const dprOptions = [1.25, 1.5, 1.25, 1.5, 1.0]; // weighted toward 1.25
  const dpr = dprOptions[Math.floor(Math.random() * dprOptions.length)];

  const w = (screen.width as number) || SCREEN_DEFAULTS.WIDTH;
  const h = (screen.height as number) || SCREEN_DEFAULTS.HEIGHT;

  return {
    userAgent: nav.userAgent as string,
    platform: "Win32",
    screenWidth: w,
    screenHeight: h,
    screenAvailHeight: h - 40, // Windows taskbar ~40px
    colorDepth: 24,
    deviceScaleFactor: dpr,
    hardwareConcurrency: (nav.hardwareConcurrency as number) || 8,
    deviceMemory: (nav.deviceMemory as number) || 8,
    languages: (nav.languages as string[]) || ["en-US", "en"],
    uaData: nav.userAgentData as BrowserFingerprint["uaData"],
  };
}
