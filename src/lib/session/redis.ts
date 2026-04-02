import Redis from "ioredis";

const client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

let connected = false;

async function ensureConnected() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
}

export async function getSession(userId: string): Promise<Buffer | null> {
  await ensureConnected();
  return client.getBuffer("session:" + userId);
}

export async function setSession(userId: string, blob: Buffer): Promise<string | null> {
  await ensureConnected();
  return client.set("session:" + userId, blob);
}

export async function deleteSession(userId: string): Promise<number> {
  await ensureConnected();
  return client.del("session:" + userId);
}

export async function setCredential(userId: string, domain: string, encryptedBlob: Buffer): Promise<void> {
  await ensureConnected();
  await client.set(`cred:${userId}:${domain}`, encryptedBlob);
  await client.sadd(`cred-domains:${userId}`, domain);
}

export async function getCredential(userId: string, domain: string): Promise<Buffer | null> {
  await ensureConnected();
  return client.getBuffer(`cred:${userId}:${domain}`);
}

export async function deleteCredential(userId: string, domain: string): Promise<void> {
  await ensureConnected();
  await client.del(`cred:${userId}:${domain}`);
  await client.srem(`cred-domains:${userId}`, domain);
}

export async function listCredentialDomains(userId: string): Promise<string[]> {
  await ensureConnected();
  return client.smembers(`cred-domains:${userId}`);
}

export async function closeRedis(): Promise<void> {
  if (connected) {
    await client.quit();
    connected = false;
  }
}
