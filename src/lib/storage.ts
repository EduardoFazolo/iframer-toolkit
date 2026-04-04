import path from "path";
import os from "os";
import { FileStore } from "./session/file-store";

export interface StorageBackend {
  getSession(userId: string): Promise<Buffer | null>;
  setSession(userId: string, blob: Buffer): Promise<void>;
  deleteSession(userId: string): Promise<void>;
  setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void>;
  getCredential(userId: string, domain: string): Promise<Buffer | null>;
  deleteCredential(userId: string, domain: string): Promise<void>;
  listCredentialDomains(userId: string): Promise<string[]>;
}

// Redis adapter — wraps the existing redis module to match StorageBackend
class RedisStoreAdapter implements StorageBackend {
  private redis: typeof import("./session/redis") | null = null;

  private async getRedis() {
    if (!this.redis) {
      this.redis = await import("./session/redis");
    }
    return this.redis;
  }

  async getSession(userId: string): Promise<Buffer | null> {
    const r = await this.getRedis();
    return r.getSession(userId);
  }

  async setSession(userId: string, blob: Buffer): Promise<void> {
    const r = await this.getRedis();
    await r.setSession(userId, blob);
  }

  async deleteSession(userId: string): Promise<void> {
    const r = await this.getRedis();
    await r.deleteSession(userId);
  }

  async setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void> {
    const r = await this.getRedis();
    await r.setCredential(userId, domain, encryptedBlob);
  }

  async getCredential(userId: string, domain: string): Promise<Buffer | null> {
    const r = await this.getRedis();
    return r.getCredential(userId, domain);
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    const r = await this.getRedis();
    await r.deleteCredential(userId, domain);
  }

  async listCredentialDomains(userId: string): Promise<string[]> {
    const r = await this.getRedis();
    return r.listCredentialDomains(userId);
  }
}

export function createStore(options: { redisUrl?: string; dataDir?: string }): StorageBackend {
  if (options.redisUrl) {
    return new RedisStoreAdapter();
  }
  const dataDir = options.dataDir || path.join(os.homedir(), ".iframer");
  return new FileStore(dataDir);
}
