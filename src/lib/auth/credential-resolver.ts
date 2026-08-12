import type { StorageBackend } from "../storage";
import type { Credential } from "../types";
import { deriveKey, decrypt } from "./crypto";
import { domainLookupChain, normalizeDomain } from "../knowledge";

export interface ResolvedCredential {
  credential: Credential;
  /** The domain the credential was actually stored under (may be a parent of
   *  the requested domain, e.g. "figma.com" for a request of "auth.figma.com"). */
  matchedDomain: string;
}

/** Thrown when a credential row exists but the stored blob cannot be decrypted
 *  (the encryption key changed since it was written). Carries the domain so
 *  callers can surface an actionable re-store instruction. */
export class CredentialDecryptError extends Error {
  constructor(public readonly domain: string, public readonly cause: string) {
    super(
      `Credentials for ${domain} exist in the store but cannot be decrypted (${cause}). ` +
      `This usually means the encryption key (~/.iframer/secret or IFRAMER_SECRET) ` +
      `changed since the row was written, orphaning the old blob. ` +
      `Fix: ask the user to re-store the credentials by running in their terminal:\n\n` +
      `  iframer-toolkit credentials add ${normalizeDomain(domain)}\n\n` +
      `After they confirm it ran, retry.`
    );
    this.name = "CredentialDecryptError";
  }
}

/**
 * Resolve stored credentials for a domain, walking the parent-domain chain so
 * "auth.figma.com" finds credentials stored under "figma.com". Shared by the
 * login step handler and the Iframer credential API so the lookup + decrypt
 * logic lives in exactly one place.
 *
 * Returns `null` when no credential row exists for any candidate domain (each
 * caller decides how to report "not stored"). Throws `CredentialDecryptError`
 * when a row exists but the blob can't be decrypted.
 */
export async function resolveCredential(
  store: StorageBackend,
  userId: string,
  token: string,
  domain: string
): Promise<ResolvedCredential | null> {
  const credKey = await deriveKey(token, "credentials");

  let blob: Buffer | null = null;
  let matchedDomain = "";
  for (const candidate of domainLookupChain(domain)) {
    const b = await store.getCredential(userId, candidate);
    if (b && b.length > 0) {
      blob = b;
      matchedDomain = candidate;
      break;
    }
  }

  if (!blob) return null;

  try {
    const credential = JSON.parse(decrypt(blob, credKey)) as Credential;
    return { credential, matchedDomain };
  } catch (err) {
    throw new CredentialDecryptError(matchedDomain, err instanceof Error ? err.message : String(err));
  }
}
