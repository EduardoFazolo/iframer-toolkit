import path from "path";
import os from "os";
import { SqliteStore } from "./session/sqlite-store";

export interface StorageBackend {
  getSession(userId: string): Promise<Buffer | null>;
  setSession(userId: string, blob: Buffer): Promise<void>;
  deleteSession(userId: string): Promise<void>;
  setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void>;
  getCredential(userId: string, domain: string): Promise<Buffer | null>;
  deleteCredential(userId: string, domain: string): Promise<void>;
  listCredentialDomains(userId: string): Promise<string[]>;
}

export function createStore(options: { dataDir?: string } = {}): StorageBackend {
  const dataDir = options.dataDir || path.join(os.homedir(), ".iframer");
  return new SqliteStore(dataDir);
}
