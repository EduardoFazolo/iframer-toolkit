import path from "path";
import os from "os";

/**
 * The single directory where iframer persists host-local shared state:
 * SQLite DB, encryption secret, knowledge cache, domain-mode memory, logs.
 *
 * Precedence:
 *   1. IFRAMER_DATA_DIR env var — used by the Docker container via a
 *      bind-mount so container and host share ONE source of truth for
 *      credentials, sessions, knowledge, and the encryption secret.
 *   2. ~/.iframer on the host.
 *
 * Chrome binaries and per-mode browser profiles do NOT live here — those are
 * platform-specific and resolved separately by the browser layer.
 */
export function getDataDir(): string {
  return process.env.IFRAMER_DATA_DIR || path.join(os.homedir(), ".iframer");
}
