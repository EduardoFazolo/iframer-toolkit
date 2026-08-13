import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getDataDir } from "../paths";

const SALT = "iframer-session";
const INFO = "encryption";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Resolve the machine-local encryption token used by both the CLI and the MCP
 * server. Precedence:
 *
 *   1. `IFRAMER_SECRET` env var — user-supplied override (must match between
 *      the MCP server config and any shell running the CLI)
 *   2. `~/.iframer/secret` — persisted on first write, readable by both
 *      processes without requiring env-var setup
 *
 * Returns the same token from both CLI and MCP so credentials stored by one
 * can be decrypted by the other.
 */
export function getLocalToken(): string {
  if (process.env.IFRAMER_SECRET) return process.env.IFRAMER_SECRET;

  // Persistent locations, in order of preference. Both CLI and MCP resolve the
  // same list, so whichever file exists is shared between them.
  const candidates = [
    path.join(getDataDir(), "secret"),
    path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "iframer-secret"),
  ];

  // Reuse the first readable existing secret.
  for (const file of candidates) {
    try {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing) return existing;
    } catch {
      // not present / unreadable here — try the next location
    }
  }

  // None exist yet: create one in the first writable location.
  for (const file of candidates) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const secret = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(file, secret, { mode: 0o600 });
      return secret;
    } catch {
      // this location is not writable — try the next
    }
  }

  // Never fall back to a fixed key: that would encrypt credentials under a
  // value baked into the source. Fail closed and tell the user how to recover.
  throw new Error(
    "iframer: could not read or create a persistent encryption secret in any " +
      `writable location (${candidates.join(", ")}). Set IFRAMER_SECRET to a ` +
      "stable value shared between the MCP server and CLI (openssl rand -hex 32).",
  );
}

export function deriveKey(token: string, purpose: string = INFO): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.hkdf("sha256", token, SALT, purpose, KEY_LENGTH, (err, key) => {
      if (err) return reject(err);
      resolve(Buffer.from(key));
    });
  });
}

export function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decrypt(blob: Buffer, key: Buffer): string {
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

export function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export function generateTOTP(secret: string, period: number = 30, digits: number = 6): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanSecret = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = "";
  for (const c of cleanSecret) {
    const val = base32Chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const keyBytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(keyBytes);

  const time = Math.floor(Date.now() / 1000 / period);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  timeBuffer.writeUInt32BE(time & 0xffffffff, 4);

  const hmac = crypto.createHmac("sha1", key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    Math.pow(10, digits);

  return code.toString().padStart(digits, "0");
}
