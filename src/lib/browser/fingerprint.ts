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
