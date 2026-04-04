import path from "path";
import fs from "fs";
import type { StorageBackend } from "../storage";

// Detect runtime: Bun has bun:sqlite built-in, Node.js needs better-sqlite3
const IS_BUN = typeof globalThis.Bun !== "undefined";

interface DbAdapter {
  queryGet(sql: string, ...params: any[]): any;
  queryAll(sql: string, ...params: any[]): any[];
  run(sql: string, ...params: any[]): void;
  close(): void;
}

function createBunDb(dbPath: string): DbAdapter {
  // Dynamic require to avoid bundler issues in Node
  const { Database } = require("bun:sqlite");
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  return {
    queryGet: (sql: string, ...params: any[]) => db.query(sql).get(...params),
    queryAll: (sql: string, ...params: any[]) => db.query(sql).all(...params),
    run: (sql: string, ...params: any[]) => {
      if (params.length > 0) {
        db.query(sql).run(...params);
      } else {
        db.run(sql);
      }
    },
    close: () => db.close(),
  };
}

function createNodeDb(dbPath: string): DbAdapter {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return {
    queryGet: (sql: string, ...params: any[]) => db.prepare(sql).get(...params),
    queryAll: (sql: string, ...params: any[]) => db.prepare(sql).all(...params),
    run: (sql: string, ...params: any[]) => {
      if (params.length > 0) {
        db.prepare(sql).run(...params);
      } else {
        db.exec(sql);
      }
    },
    close: () => db.close(),
  };
}

export class SqliteStore implements StorageBackend {
  private db: DbAdapter;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "iframer.db");
    this.db = IS_BUN ? createBunDb(dbPath) : createNodeDb(dbPath);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        user_id TEXT PRIMARY KEY,
        blob    BLOB NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        user_id TEXT NOT NULL,
        domain  TEXT NOT NULL,
        blob    BLOB NOT NULL,
        PRIMARY KEY (user_id, domain)
      )
    `);
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  async getSession(userId: string): Promise<Buffer | null> {
    const row = this.db.queryGet("SELECT blob FROM sessions WHERE user_id = ?", userId) as { blob: Buffer | Uint8Array } | undefined;
    return row ? Buffer.from(row.blob) : null;
  }

  async setSession(userId: string, blob: Buffer): Promise<void> {
    this.db.run("INSERT OR REPLACE INTO sessions (user_id, blob) VALUES (?, ?)", userId, blob);
  }

  async deleteSession(userId: string): Promise<void> {
    this.db.run("DELETE FROM sessions WHERE user_id = ?", userId);
  }

  // ─── Credentials ────────────────────────────────────────────────────

  async setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void> {
    this.db.run("INSERT OR REPLACE INTO credentials (user_id, domain, blob) VALUES (?, ?, ?)", userId, domain, encryptedBlob);
  }

  async getCredential(userId: string, domain: string): Promise<Buffer | null> {
    const row = this.db.queryGet("SELECT blob FROM credentials WHERE user_id = ? AND domain = ?", userId, domain) as { blob: Buffer | Uint8Array } | undefined;
    return row ? Buffer.from(row.blob) : null;
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    this.db.run("DELETE FROM credentials WHERE user_id = ? AND domain = ?", userId, domain);
  }

  async listCredentialDomains(userId: string): Promise<string[]> {
    const rows = this.db.queryAll("SELECT domain FROM credentials WHERE user_id = ?", userId) as { domain: string }[];
    return rows.map((r) => r.domain);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
