import type { ExecutionContext } from "../types";

/** Resolve an @e ref (from snapshot/find/annotated screenshot) to a CSS selector.
 *  Non-ref selectors pass through unchanged. */
export function resolveSelector(selector: string, ctx: ExecutionContext): string {
  if (selector.startsWith("@e")) {
    const ref = ctx.refMap.get(selector);
    if (!ref) {
      const available = Array.from(ctx.refMap.keys()).join(", ");
      throw new Error(`Unknown ref: ${selector}. ${available ? `Available refs: ${available}` : "No refs available — run a snapshot or annotated screenshot step first."}`);
    }
    return ref.selector;
  }
  return selector;
}
