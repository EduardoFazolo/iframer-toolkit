import type { Page } from "patchright";

/**
 * Human-reachability probe for form fields — the honeypot guard.
 *
 * A honeypot must be two things at once: absent for humans, present for bots.
 * Bots read the DOM; humans see rendered pixels. Every trick lives in that gap
 * (offscreen ancestor, 1px overflow:hidden wrapper, opacity on a parent,
 * clip-path, transform:scale(0)…). Enumerating tricks never ends, so instead
 * we ask the renderer the one question that matters: "if a mouse were at this
 * field's center, would it touch the field?" — `document.elementFromPoint`.
 * Geometry pre-checks cover what the hit test can't (opacity is still hit,
 * anything outside the viewport returns null).
 *
 * `hiddenReason` values that are honeypot-class (a human can NEVER reach the
 * field without changing CSS): zero-size, hidden, transparent, offscreen,
 * clipped. `covered` (a modal/overlay sits on top) is informational only — a
 * real field temporarily behind a cookie banner is not a trap.
 *
 * NOTE: the in-page logic is duplicated in snapshot.ts (Playwright serialises
 * the evaluate callback, so it can't reference module functions). Keep both
 * copies in sync.
 */

export type HiddenReason = "zero-size" | "hidden" | "transparent" | "offscreen" | "clipped" | "covered";

export const HONEYPOT_REASONS: ReadonlySet<string> = new Set(["zero-size", "hidden", "transparent", "offscreen", "clipped"]);

/** Field names/ids that are classic bait. Flag only — real forms have Website fields too. */
export const HONEYPOT_NAME_RE = /^(website|url|homepage|fax|honeypot|honey|hp|hp_[\w-]*|bot|bot_[\w-]*|trap|_gotcha|leave_?blank|do_?not_?fill)$/i;

export interface FieldProbe {
  found: boolean;
  /** Why a human can't reach it, or null when reachable. */
  hiddenReason: HiddenReason | null;
  /** Name/id matches bait list, or a text field is pulled out of the tab order. */
  suspiciousName: boolean;
  tag?: string;
  name?: string;
}

export function isHoneypotReason(reason: string | null | undefined): boolean {
  return !!reason && HONEYPOT_REASONS.has(reason);
}

/** Bait signal from attributes alone (pure, testable). */
export function looksLikeBaitField(attrs: { name?: string | null; id?: string | null; tabindex?: string | null; type?: string | null }): boolean {
  const name = attrs.name || "";
  const id = attrs.id || "";
  if (HONEYPOT_NAME_RE.test(name) || HONEYPOT_NAME_RE.test(id)) return true;
  // Keyboard users can never tab into it, yet it is a text field: strong bait signal.
  const textual = !attrs.type || /^(text|email|url|tel|search|number)$/i.test(attrs.type);
  if (textual && attrs.tabindex === "-1") return true;
  return false;
}

export function honeypotRefusalMessage(selector: string, reason: string, name?: string): string {
  const what = name ? `"${name}" (${selector})` : selector;
  return (
    `fill: refusing to fill ${what} — no human can reach this field (${reason}). ` +
    `It is almost certainly a honeypot: filling it marks the submission as a bot and the form fails with a generic error. ` +
    `Skip it. If you are certain it is a real field, retry with force: true.`
  );
}

/**
 * Probe a field. Scrolls the window so it is in the viewport first, so the hit
 * test is meaningful for below-the-fold fields too.
 */
export async function probeField(page: Page, selector: string): Promise<FieldProbe> {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { found: false } as const;
    const attrs = {
      name: el.getAttribute("name"),
      id: el.id || null,
      tabindex: el.getAttribute("tabindex"),
      type: el.getAttribute("type"),
    };
    const tag = el.tagName.toLowerCase();

    // Bring it into the viewport by scrolling the WINDOW only. Not
    // scrollIntoView(): that also scrolls overflow:hidden wrappers, which
    // re-arranges a 1px trap so its own clipping no longer shows.
    {
      const r0 = el.getBoundingClientRect();
      const cx0 = r0.left + r0.width / 2, cy0 = r0.top + r0.height / 2;
      const dx = cx0 < 0 || cx0 >= window.innerWidth ? cx0 - window.innerWidth / 2 : 0;
      const dy = cy0 < 0 || cy0 >= window.innerHeight ? cy0 - window.innerHeight / 2 : 0;
      if (dx || dy) try { window.scrollBy(dx, dy); } catch {}
    }

    const rect = el.getBoundingClientRect();
    let reason: string | null = null;
    if (rect.width === 0 || rect.height === 0) reason = "zero-size";
    const style = getComputedStyle(el);
    if (!reason && (style.display === "none" || style.visibility === "hidden")) reason = "hidden";
    if (!reason) {
      let opacity = 1;
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        const o = parseFloat(getComputedStyle(n).opacity);
        // A node mid fade-in (CSS transition/animation running) is not a trap.
        const animating = o < 1 && typeof n.getAnimations === "function" && n.getAnimations().length > 0;
        if (!isNaN(o) && !animating) opacity *= o;
      }
      if (opacity < 0.05) reason = "transparent";
    }
    if (!reason) {
      const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const left = rect.left + window.scrollX, right = rect.right + window.scrollX;
      const top = rect.top + window.scrollY, bottom = rect.bottom + window.scrollY;
      if (right <= 0 || left >= docW || bottom <= 0 || top >= docH) reason = "offscreen";
    }
    if (!reason) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const inViewport = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        const clipsX = /hidden|clip/.test(s.overflowX), clipsY = /hidden|clip/.test(s.overflowY);
        if (!clipsX && !clipsY) continue;
        const ar = a.getBoundingClientRect();
        // Centre outside the clip box, or a wrapper ≤2px in the clipping axis
        // (no real layout puts a text field in a 1px-tall box).
        const outside = (clipsX && (cx < ar.left || cx > ar.right)) || (clipsY && (cy < ar.top || cy > ar.bottom));
        const tiny = (clipsY && ar.height <= 2) || (clipsX && ar.width <= 2);
        if (outside || tiny) { clipped = true; break; }
      }
      if (inViewport) {
        const hit = document.elementFromPoint(cx, cy);
        if (!(hit && (hit === el || el.contains(hit)))) reason = clipped ? "clipped" : "covered";
      } else if (clipped) {
        reason = "clipped";
      }
    }
    return { found: true, reason, attrs, tag } as const;
  }, selector);

  if (!r.found) return { found: false, hiddenReason: null, suspiciousName: false };
  return {
    found: true,
    hiddenReason: (r.reason as HiddenReason | null) ?? null,
    suspiciousName: looksLikeBaitField(r.attrs),
    tag: r.tag,
    name: r.attrs.name ?? undefined,
  };
}
