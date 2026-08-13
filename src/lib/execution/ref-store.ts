import type { StorageBackend } from "../storage";
import type { ExecutionContext, ElementRef } from "../types";
import type { ExecutionConfig } from "./config";

/**
 * Owns per-user @e ref maps and the nextRefId counter, and builds the
 * ExecutionContext passed into the pipeline. Extracted from Iframer so ref
 * bookkeeping lives in one place.
 */
export class RefStore {
  private userRefs = new Map<string, { refMap: Map<string, ElementRef>; nextRefId: number }>();

  constructor(private store: StorageBackend, private config: ExecutionConfig) {}

  makeContext(userId: string, token: string): ExecutionContext {
    if (!this.userRefs.has(userId)) {
      this.userRefs.set(userId, { refMap: new Map(), nextRefId: 1 });
    }
    const refs = this.userRefs.get(userId)!;

    return {
      userId,
      token,
      screenshotDir: this.config.screenshotDir,
      publicUrl: this.config.publicUrl,
      staleTimeoutMs: this.config.staleTimeoutMs,
      refMap: refs.refMap,
      nextRefId: refs.nextRefId,
      store: this.store,
    };
  }

  /** Persist the ref counter advanced by a run back onto the user's ref state. */
  sync(userId: string, ctx: ExecutionContext): void {
    const refs = this.userRefs.get(userId);
    if (refs) refs.nextRefId = ctx.nextRefId;
  }
}
