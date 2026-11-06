import type { StorageBackend } from "../storage";
import type { CredentialInput, Credential } from "../types";
import { deriveKey, encrypt } from "./crypto";
import { resolveCredential } from "./credential-resolver";
import { normalizeDomain } from "../knowledge";

/** Credential CRUD. Extracted from Iframer; lookups go through the shared
 *  resolveCredential. */
export class CredentialStore {
  constructor(private store: StorageBackend) {}

  async storeCredential(userId: string, token: string, credential: CredentialInput): Promise<void> {
    const credKey = await deriveKey(token, "credentials");
    const normalizedDomain = normalizeDomain(credential.domain);
    const data = {
      ...credential,
      domain: normalizedDomain,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const encrypted = encrypt(JSON.stringify(data), credKey);
    await this.store.setCredential(userId, normalizedDomain, encrypted);
  }

  async getCredential(userId: string, token: string, domain: string): Promise<Credential | null> {
    // Throws CredentialDecryptError (with an actionable re-store message) if a
    // row exists but the key changed; returns null when nothing is stored.
    const resolved = await resolveCredential(this.store, userId, token, domain);
    return resolved?.credential ?? null;
  }

  async listCredentials(userId: string): Promise<string[]> {
    return this.store.listCredentialDomains(userId);
  }

  async deleteCredential(userId: string, domain: string): Promise<void> {
    await this.store.deleteCredential(userId, normalizeDomain(domain));
  }
}
