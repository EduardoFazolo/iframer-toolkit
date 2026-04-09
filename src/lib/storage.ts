import { SqliteStore } from "./session/sqlite-store";
import { getDataDir } from "./paths";

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
  const dataDir = options.dataDir || getDataDir();
  return new SqliteStore(dataDir);
}
