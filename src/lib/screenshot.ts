import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const log = createLogger("screenshot");

// Retention policy for the screenshot dir. Screenshots are ephemeral debugging
// artifacts (step/block/annotate captures); nothing reads them after the run
// that produced them, so they can be pruned aggressively. Overridable via env.
const MAX_AGE_MS = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10); // 24h
const MAX_FILES = parseInt(process.env.IFRAMER_SCREENSHOT_MAX_FILES || "500", 10);
const PRUNE_THROTTLE_MS = 5 * 60 * 1000; // scan at most once per 5 min

let lastPruneAt = 0;

export function saveScreenshot(
  buffer: Buffer,
  filename: string,
  screenshotDir: string,
  publicUrl: string
): string {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, filename);
  fs.writeFileSync(filePath, buffer);
  maybePrune(screenshotDir);
  return `${publicUrl}/screenshots/${filename}`;
}

/** Throttled wrapper around pruneScreenshots (scans at most once per 5 min). */
function maybePrune(dir: string): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_THROTTLE_MS) return;
  lastPruneAt = now;
  pruneScreenshots(dir);
}

/** Delete screenshots older than maxAgeMs, then if still over maxFiles, delete
 *  the oldest until under the cap. Best-effort; never throws. Returns the count
 *  removed. */
export function pruneScreenshots(
  dir: string,
  opts: { maxAgeMs?: number; maxFiles?: number; now?: number } = {}
): number {
  const maxAgeMs = opts.maxAgeMs ?? MAX_AGE_MS;
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const now = opts.now ?? Date.now();

  try {
    const entries = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png"))
      .map((f) => {
        const full = path.join(dir, f);
        try {
          return { full, mtimeMs: fs.statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((e): e is { full: string; mtimeMs: number } => e !== null);

    let removed = 0;

    // 1) Age-based.
    const survivors: { full: string; mtimeMs: number }[] = [];
    for (const e of entries) {
      if (now - e.mtimeMs > maxAgeMs) {
        try { fs.unlinkSync(e.full); removed++; } catch {}
      } else {
        survivors.push(e);
      }
    }

    // 2) Count-based: delete oldest survivors beyond the cap.
    if (survivors.length > maxFiles) {
      survivors.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
      for (const e of survivors.slice(0, survivors.length - maxFiles)) {
        try { fs.unlinkSync(e.full); removed++; } catch {}
      }
    }

    if (removed > 0) log.debug(`pruned ${removed} old screenshot(s) from ${dir}`);
    return removed;
  } catch (err) {
    log.warn(`screenshot prune failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
