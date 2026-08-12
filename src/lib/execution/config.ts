import { DEFAULT_INSTANCE } from "../browser/daemon";

/** Config the execution services need to build ExecutionContexts. */
export interface ExecutionConfig {
  screenshotDir: string;
  publicUrl: string;
  staleTimeoutMs: number;
}

/**
 * Session-store key for a named browser instance. The default instance keeps
 * the bare userId (backward compatible); named instances get their own blob so
 * parallel browsers can hold independent logins.
 */
export function sessionStoreKey(userId: string, instanceId: string = DEFAULT_INSTANCE): string {
  return instanceId === DEFAULT_INSTANCE ? userId : `${userId}::${instanceId}`;
}
