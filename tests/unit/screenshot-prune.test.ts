import { describe, test, expect, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { pruneScreenshots } from "../../src/lib/screenshot";

let dir: string;
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

function makeDir(): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-shots-"));
  return dir;
}

function writeShot(d: string, name: string, ageMs: number, now: number): void {
  const full = path.join(d, name);
  fs.writeFileSync(full, "x");
  const t = (now - ageMs) / 1000;
  fs.utimesSync(full, t, t);
}

describe("pruneScreenshots", () => {
  test("deletes files older than maxAge, keeps recent ones", () => {
    const d = makeDir();
    const now = 1_000_000_000_000;
    writeShot(d, "old.jpg", 48 * 3600_000, now);
    writeShot(d, "new.jpg", 1 * 3600_000, now);

    const removed = pruneScreenshots(d, { maxAgeMs: 24 * 3600_000, maxFiles: 1000, now });
    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(d, "old.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(d, "new.jpg"))).toBe(true);
  });

  test("enforces maxFiles by deleting the oldest survivors", () => {
    const d = makeDir();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) writeShot(d, `s${i}.jpg`, i * 60_000, now); // s0 newest … s4 oldest

    const removed = pruneScreenshots(d, { maxAgeMs: 24 * 3600_000, maxFiles: 3, now });
    expect(removed).toBe(2);
    // Oldest two (s4, s3) gone; newest three remain.
    expect(fs.existsSync(path.join(d, "s4.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(d, "s3.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(d, "s0.jpg"))).toBe(true);
  });

  test("ignores non-image files and a missing dir", () => {
    const d = makeDir();
    fs.writeFileSync(path.join(d, "notes.txt"), "keep me");
    expect(pruneScreenshots(d, { maxAgeMs: 0, maxFiles: 0 })).toBe(0);
    expect(fs.existsSync(path.join(d, "notes.txt"))).toBe(true);
    expect(pruneScreenshots(path.join(d, "does-not-exist"))).toBe(0);
  });
});
