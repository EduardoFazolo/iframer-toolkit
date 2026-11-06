import path from "path";
import os from "os";

/**
 * The single directory where iframer persists host-local shared state:
 * SQLite DB, encryption secret, knowledge cache, domain-mode memory, logs.
 *
 * Precedence:
 *   1. IFRAMER_DATA_DIR env var.
 *   2. ~/.iframer.
 *
 * Chrome binaries and per-mode browser profiles do NOT live here — those are
 * platform-specific and resolved separately by the browser layer.
 */
export function getDataDir(): string {
  return process.env.IFRAMER_DATA_DIR || path.join(os.homedir(), ".iframer");
}

/** Where the server saves screenshots and serves /screenshots from. Must not
 *  depend on the code's location: built, the two callers sit in different dirs. */
export function getScreenshotDir(): string {
  return path.join(getDataDir(), "screenshots");
}
