import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { __readCookieRowsForTest } from "../../src/lib/kit/browser-cookies";

const IS_BUN = typeof (globalThis as any).Bun !== "undefined";

/** Create a SQLite file with the runtime's own driver (bun:sqlite under Bun,
 *  node:sqlite under Node) so the fixture and the reader share one engine. */
function execSql(file: string, stmts: string[]): void {
  if (IS_BUN) {
    const { Database } = require("bun:sqlite");
    const d = new Database(file);
    try { for (const s of stmts) d.run(s); } finally { d.close(); }
    return;
  }
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(file);
  try { for (const s of stmts) d.exec(s); } finally { d.close(); }
}

/** Build a Chromium-schema Cookies DB with a real-sized microsecond timestamp. */
function makeCookieDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-ck-test-"));
  const file = path.join(dir, "Cookies");
  execSql(file, [
    "CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, last_access_utc INTEGER)",
    "CREATE TABLE meta (key TEXT, value TEXT)",
    "INSERT INTO meta VALUES ('version', '24')",
    // 13388888888000000 µs is past 2^53: the value that broke node:sqlite's default read.
    "INSERT INTO cookies VALUES ('.example.com', 'sid', 'abc123', x'', '/', 13388888888000000, 13388888000000000)",
    "INSERT INTO cookies VALUES ('.example.com', 'enc', '', x'7631300102', '/', 0, 0)",
  ]);
  return file;
}

/**
 * The real Windows failure was not a locked file — the T3 Code tab partition
 * copied fine — it was the native better-sqlite3 binary refusing to load on a
 * newer Node ("The module '...' could not be read"). The reader now prefers the
 * built-in node:sqlite, which has no native addon. These tests exercise the
 * reader through whichever driver the runtime provides.
 */
describe("browser-cookies reader", () => {
  test("reads a copied cookie DB and returns timestamps as numbers", () => {
    const file = makeCookieDb();
    try {
      const rows = __readCookieRowsForTest(
        file,
        "SELECT host_key, name, value, hex(encrypted_value) AS enc, path, expires_utc, last_access_utc FROM cookies ORDER BY name",
      );
      expect(rows.length).toBe(2);
      const sid = rows.find((r) => r.name === "sid");
      expect(sid.value).toBe("abc123");
      // Large Chrome timestamps must come back as JS numbers, never BigInt.
      expect(typeof sid.expires_utc).toBe("number");
      expect(typeof sid.last_access_utc).toBe("number");
      expect(sid.expires_utc).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
      // The Chrome-epoch conversion the caller does must stay finite.
      expect(Number.isFinite(sid.expires_utc / 1000 - 11644473600000)).toBe(true);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test("hex(encrypted_value) comes back as an uppercase hex string", () => {
    const file = makeCookieDb();
    try {
      const rows = __readCookieRowsForTest(
        file,
        "SELECT name, hex(encrypted_value) AS enc FROM cookies ORDER BY name",
      );
      const enc = rows.find((r) => r.name === "enc");
      expect(typeof enc.enc).toBe("string");
      expect(enc.enc).toBe("7631300102");
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test("the meta version query the reader relies on works", () => {
    const file = makeCookieDb();
    try {
      const rows = __readCookieRowsForTest(file, "SELECT value FROM meta WHERE key='version'");
      expect(rows[0].value).toBe("24");
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test("a missing cookie DB is reported unreadable, not thrown", () => {
    const rows = __readCookieRowsForTest(
      path.join(os.tmpdir(), "does-not-exist-" + Date.now(), "Cookies"),
      "SELECT 1",
    );
    expect(rows).toEqual([]);
  });
});
