import { describe, it, expect } from "bun:test";
import { deriveKey, encrypt, decrypt, sha256 } from "../../src/lib/auth/crypto";

describe("deriveKey", () => {
  it("returns a 32-byte buffer", async () => {
    const key = await deriveKey("test-token");
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("is deterministic for the same token", async () => {
    const key1 = await deriveKey("same-token");
    const key2 = await deriveKey("same-token");
    expect(key1.equals(key2)).toBe(true);
  });

  it("produces different keys for different tokens", async () => {
    const key1 = await deriveKey("token-a");
    const key2 = await deriveKey("token-b");
    expect(key1.equals(key2)).toBe(false);
  });

  it("produces different keys for different purposes", async () => {
    const key1 = await deriveKey("token", "encryption");
    const key2 = await deriveKey("token", "credentials");
    expect(key1.equals(key2)).toBe(false);
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", async () => {
    const key = await deriveKey("test-token");
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips JSON", async () => {
    const key = await deriveKey("test-token");
    const obj = { username: "alice", password: "secret123", nested: { a: 1 } };
    const encrypted = encrypt(JSON.stringify(obj), key);
    const decrypted = JSON.parse(decrypt(encrypted, key));
    expect(decrypted).toEqual(obj);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const key = await deriveKey("test-token");
    const encrypted1 = encrypt("same text", key);
    const encrypted2 = encrypt("same text", key);
    expect(encrypted1.equals(encrypted2)).toBe(false);
  });

  it("fails to decrypt with wrong key", async () => {
    const key1 = await deriveKey("token-a");
    const key2 = await deriveKey("token-b");
    const encrypted = encrypt("secret", key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it("fails on tampered ciphertext", async () => {
    const key = await deriveKey("test-token");
    const encrypted = encrypt("secret", key);
    encrypted[encrypted.length - 1] ^= 0xff; // flip last byte
    expect(() => decrypt(encrypted, key)).toThrow();
  });
});

describe("sha256", () => {
  it("returns a 64-char hex string", () => {
    const hash = sha256("test");
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic", () => {
    expect(sha256("test")).toBe(sha256("test"));
  });

  it("differs for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});
