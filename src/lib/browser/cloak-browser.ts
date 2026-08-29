import type { Browser } from "patchright";
import { createLogger } from "../logger";

const log = createLogger("cloak");

let _available: boolean | null = null;

// CloakBrowser is OPT-IN. It's an `optionalDependencies` entry, so whether it's
// even installed depends on how `bun install` resolved optional deps — which
// means it could silently become the active browser (replacing the proven
// Chrome-for-Testing + patchright path) just because a reinstall materialized
// it. That is exactly what regressed real sites (opentable, Google) once. So we
// only ever touch it when explicitly enabled with IFRAMER_USE_CLOAKBROWSER=1;
// otherwise the daemon always falls back to Chrome-for-Testing + patchright.
function cloakEnabled(): boolean {
  return process.env.IFRAMER_USE_CLOAKBROWSER === "1" || process.env.IFRAMER_USE_CLOAKBROWSER === "true";
}

async function tryImport(): Promise<any | null> {
  if (!cloakEnabled()) return null;
  try {
    return await import("cloakbrowser");
  } catch {
    return null;
  }
}

export async function isCloakAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  const cloak = await tryImport();
  if (!cloak) { _available = false; return false; }
  try {
    const info = cloak.binaryInfo();
    _available = info.installed === true;
  } catch {
    _available = false;
  }
  return _available;
}

async function ensureBinary(): Promise<boolean> {
  const cloak = await tryImport();
  if (!cloak) return false;
  try {
    const info = cloak.binaryInfo();
    if (!info.installed) {
      log.info("Downloading CloakBrowser binary...");
      await cloak.ensureBinary();
      log.info("CloakBrowser ready");
    }
    _available = true;
    return true;
  } catch (err) {
    log.warn(`CloakBrowser setup failed: ${err instanceof Error ? err.message : String(err)}`);
    _available = false;
    return false;
  }
}

export async function launchCloakBrowser(options: { headless: boolean; args?: string[] }): Promise<Browser | null> {
  const cloak = await tryImport();
  if (!cloak) return null;
  try {
    const ok = await ensureBinary();
    if (!ok) return null;
    const browser = await cloak.launch({
      headless: options.headless,
      args: options.args,
    });
    log.info(`CloakBrowser launched (headless=${options.headless})`);
    return browser as unknown as Browser;
  } catch (err) {
    log.warn(`CloakBrowser launch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
