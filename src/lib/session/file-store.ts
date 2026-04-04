import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".iframer");

export class FileStore {
  private dataDir: string;
  private sessionsDir: string;
  private credentialsDir: string;

  constructor(dataDir: string = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
    this.sessionsDir = path.join(dataDir, "sessions");
    this.credentialsDir = path.join(dataDir, "credentials");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    fs.mkdirSync(this.credentialsDir, { recursive: true });
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  async getSession(userId: string): Promise<Buffer | null> {
    const filePath = path.join(this.sessionsDir, `${this.sanitize(userId)}.bin`);
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  async setSession(userId: string, blob: Buffer): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${this.sanitize(userId)}.bin`);
    fs.writeFileSync(filePath, blob);
  }

  async deleteSession(userId: string): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${this.sanitize(userId)}.bin`);
    try { fs.unlinkSync(filePath); } catch {}
  }

  // ─── Credentials ────────────────────────────────────────────────────

  async setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void> {
    const userDir = path.join(this.credentialsDir, this.sanitize(userId));
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, `${this.sanitize(domain)}.bin`), encryptedBlob);
  }

  async getCredential(userId: string, domain: string): Promise<Buffer | null> {
    const filePath = path.join(this.credentialsDir, this.sanitize(userId), `${this.sanitize(domain)}.bin`);
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    const filePath = path.join(this.credentialsDir, this.sanitize(userId), `${this.sanitize(domain)}.bin`);
    try { fs.unlinkSync(filePath); } catch {}
  }

  async listCredentialDomains(userId: string): Promise<string[]> {
    const userDir = path.join(this.credentialsDir, this.sanitize(userId));
    try {
      const files = fs.readdirSync(userDir);
      return files
        .filter((f) => f.endsWith(".bin"))
        .map((f) => f.replace(/\.bin$/, "").replace(/_/g, "."));
    } catch {
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private sanitize(name: string): string {
    // Replace dots and special chars with underscores for filenames
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}
