import type { ExecutionContext } from "../types";

/** Resolve a selector to a concrete CSS selector.
 *
 *  - `@e<n>`  ephemeral ref from snapshot/find/annotated screenshot (this run).
 *  - `@a:<name>` durable per-domain ANCHOR from the component map (persisted).
 *  - anything else passes through unchanged (plain CSS).
 */
export function resolveSelector(selector: string, ctx: ExecutionContext): string {
  if (selector.startsWith("@a:")) {
    const name = selector.slice(3);
    const anchor = ctx.anchors?.get(name);
    if (!anchor) {
      const available = ctx.anchors ? Array.from(ctx.anchors.keys()).join(", ") : "";
      throw new Error(
        `Unknown anchor: @a:${name}${ctx.anchorDomain ? ` for ${ctx.anchorDomain}` : ""}. ` +
          `${available ? `Known anchors: ${available}. ` : "This domain has no saved anchors yet. "}` +
          `Run a snapshot/find to locate the element, act on it, then save it with the ` +
          `\`remember\` tool so future runs skip the search.`,
      );
    }
    return anchor.selector;
  }
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

/** Extract the anchor name a selector references, or null. Used by the runner
 *  to record use/fail outcomes against the component map (self-heal signal). */
export function anchorNameOf(selector: unknown): string | null {
  return typeof selector === "string" && selector.startsWith("@a:") ? selector.slice(3) : null;
}
