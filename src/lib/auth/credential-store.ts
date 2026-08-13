import type { StorageBackend } from "../storage";
import type { CredentialInput, Credential } from "../types";
import type { ExecutionConfig } from "../execution/config";
import * as sessionManager from "../browser/session-manager";
import { deriveKey, encrypt, generateTOTP } from "./crypto";
import { resolveCredential } from "./credential-resolver";
import { normalizeDomain } from "../knowledge";
import { humanClick, humanType } from "../browser/humanize";
import { saveScreenshot } from "../screenshot";
import { TIMING } from "../constants";

/** Credential CRUD + interactive credential-based login. Extracted from
 *  Iframer; lookups go through the shared resolveCredential. */
export class CredentialStore {
  constructor(private store: StorageBackend, private config: ExecutionConfig) {}

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

  async loginWithCredentials(
    userId: string,
    token: string,
    domain: string,
    selectors: { username?: string; password?: string; submit?: string; totp?: string }
  ): Promise<{ ok: boolean; url: string; title: string; screenshotUrl?: string; error?: string }> {
    const session = sessionManager.getSession(userId);
    if (!session) return { ok: false, url: "", title: "", error: "No active interactive session. Start one first." };

    const resolved = await resolveCredential(this.store, userId, token, domain);
    if (!resolved) {
      const stored = await this.store.listCredentialDomains(userId);
      return { ok: false, url: "", title: "", error: `No credentials stored for ${normalizeDomain(domain)}. Stored: ${stored.join(", ") || "(none)"}` };
    }
    const { credential } = resolved;

    const page = session.page;
    sessionManager.resetTimeout(userId);

    if (selectors.username && credential.username) {
      await humanType(page, selectors.username, credential.username);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.password && credential.password) {
      await humanType(page, selectors.password, credential.password);
      await page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
    }
    if (selectors.submit) {
      await humanClick(page, selectors.submit);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(TIMING.POST_LOGIN_WAIT);
    }
    if (selectors.totp && credential.totp_secret) {
      const totp = generateTOTP(credential.totp_secret);
      await page.click(selectors.totp);
      await page.keyboard.type(totp, { delay: 50 });
      await page.waitForTimeout(TIMING.POST_TOTP_WAIT);
    }

    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `login-${Date.now()}.jpg`, this.config.screenshotDir, this.config.publicUrl);

    return { ok: true, url: page.url(), title: await page.title(), screenshotUrl };
  }
}
