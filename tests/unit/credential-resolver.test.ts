import { describe, test, expect } from "bun:test";
import type { StorageBackend } from "../../src/lib/storage";
import { resolveCredential, CredentialDecryptError } from "../../src/lib/auth/credential-resolver";
import { deriveKey, encrypt } from "../../src/lib/auth/crypto";

const USER = "u";
const TOKEN = "test-token";

/** Fake store backed by an in-memory domain→blob map. Only the two methods
 *  resolveCredential touches are implemented. */
function fakeStore(rows: Record<string, Buffer>): StorageBackend {
  return {
    async getCredential(_userId: string, domain: string) {
      return rows[domain] ?? null;
    },
    async listCredentialDomains() {
      return Object.keys(rows);
    },
  } as unknown as StorageBackend;
}

async function encryptedCred(obj: object): Promise<Buffer> {
  const key = await deriveKey(TOKEN, "credentials");
  return encrypt(JSON.stringify(obj), key);
}

describe("resolveCredential", () => {
  test("resolves an exact-domain credential", async () => {
    const store = fakeStore({ "figma.com": await encryptedCred({ username: "a@b.com", password: "pw" }) });
    const res = await resolveCredential(store, USER, TOKEN, "figma.com");
    expect(res).not.toBeNull();
    expect(res!.matchedDomain).toBe("figma.com");
    expect(res!.credential.username).toBe("a@b.com");
  });

  test("walks the parent-domain chain (auth.figma.com → figma.com)", async () => {
    const store = fakeStore({ "figma.com": await encryptedCred({ username: "a@b.com" }) });
    const res = await resolveCredential(store, USER, TOKEN, "auth.figma.com");
    expect(res!.matchedDomain).toBe("figma.com");
  });

  test("returns null when nothing is stored for any candidate", async () => {
    const store = fakeStore({ "other.com": await encryptedCred({ username: "x" }) });
    const res = await resolveCredential(store, USER, TOKEN, "figma.com");
    expect(res).toBeNull();
  });

  test("throws CredentialDecryptError when the blob can't be decrypted", async () => {
    // Blob written under a DIFFERENT token → decrypt fails under TOKEN.
    const otherKey = await deriveKey("a-different-token", "credentials");
    const badBlob = encrypt(JSON.stringify({ username: "x" }), otherKey);
    const store = fakeStore({ "figma.com": badBlob });

    let thrown: unknown;
    try {
      await resolveCredential(store, USER, TOKEN, "figma.com");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CredentialDecryptError);
    expect((thrown as CredentialDecryptError).domain).toBe("figma.com");
    expect((thrown as Error).message).toContain("iframer-toolkit credentials add figma.com");
  });
});
