import type { Page } from "patchright";
import type { ElementRef, ExecutionContext } from "./types";

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option", "searchbox",
  "slider", "spinbutton", "switch", "tab", "treeitem",
]);

const INTERACTIVE_TAGS = new Set([
  "input", "textarea", "select", "button", "a",
]);

interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  tag: string;
  selector: string;
  state: string[];  // focused, disabled, checked, etc.
  description: string;
}

/** Walk the page and build a flat list of interactive elements with refs */
export async function takeSnapshot(
  page: Page,
  ctx: ExecutionContext,
  options?: { interactiveOnly?: boolean; maxElements?: number }
): Promise<{ nodes: SnapshotNode[]; text: string }> {
  const interactiveOnly = options?.interactiveOnly ?? true;
  const maxElements = options?.maxElements ?? 80;

  // Reset refs on each snapshot
  ctx.refMap.clear();
  ctx.nextRefId = 1;

  const elements = await page.evaluate(({ interactiveOnly, maxElements }) => {
    const results: {
      tag: string;
      role: string;
      name: string;
      type: string;
      placeholder: string;
      checked: boolean;
      disabled: boolean;
      selector: string;
      isVisible: boolean;
      /** "honeypot?" when the field looks like bait (name/tab-order signal). */
      suspect?: string;
    }[] = [];

    const interactiveTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = new Set([
      "button", "link", "textbox", "checkbox", "radio", "combobox", "listbox",
      "menuitem", "menuitemcheckbox", "menuitemradio", "option", "searchbox",
      "slider", "spinbutton", "switch", "tab", "treeitem",
    ]);

    function isInteractive(el: Element): boolean {
      if (interactiveTags.has(el.tagName)) return true;
      const role = el.getAttribute("role");
      if (role && interactiveRoles.has(role)) return true;
      if (el.hasAttribute("contenteditable")) return true;
      if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") return true;
      return false;
    }

    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      // In viewport (with some buffer)
      if (rect.bottom < 0 || rect.top > window.innerHeight + 200) return false;
      return true;
    }

    // Honeypot guard for fillable fields. Mirrors probeField() in
    // ../reachability.ts (duplicated: this callback is serialised by
    // Playwright, so it can't import). Keep both in sync.
    function isFillable(el: Element): boolean {
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") return true;
      if (el.tagName !== "INPUT") return false;
      const t = ((el as HTMLInputElement).type || "text").toLowerCase();
      return !["button", "submit", "reset", "image", "checkbox", "radio", "file", "hidden", "range", "color"].includes(t);
    }

    /** Why a human can NEVER reach this field (honeypot-class), or null. A
     *  field merely covered by an overlay is NOT reported — that's temporary. */
    function unreachableReason(el: Element): string | null {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      let opacity = 1;
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        const o = parseFloat(n === el ? style.opacity : getComputedStyle(n).opacity);
        // A node mid fade-in (CSS transition/animation running) is not a trap.
        const animating = o < 1 && typeof n.getAnimations === "function" && n.getAnimations().length > 0;
        if (!isNaN(o) && !animating) opacity *= o;
      }
      if (opacity < 0.05) return "transparent";
      const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const left = rect.left + window.scrollX, right = rect.right + window.scrollX;
      const top = rect.top + window.scrollY, bottom = rect.bottom + window.scrollY;
      if (right <= 0 || left >= docW || bottom <= 0 || top >= docH) return "offscreen";
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
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
        if (tiny) return "clipped";
        if (outside) clipped = true;
      }
      const inViewport = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
      if (inViewport) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && (hit === el || el.contains(hit))) return null;
        return clipped ? "clipped" : null; // covered → keep listing
      }
      // Below the fold: no hit test possible, and "centre outside the clip box"
      // alone is not proof (absolute children escape non-positioned wrappers).
      return null;
    }

    const baitName = /^(website|url|homepage|fax|honeypot|honey|hp|hp_[\w-]*|bot|bot_[\w-]*|trap|_gotcha|leave_?blank|do_?not_?fill)$/i;
    function looksLikeBait(el: Element): boolean {
      const name = el.getAttribute("name") || "", id = el.id || "";
      if (baitName.test(name) || baitName.test(id)) return true;
      const type = (el.getAttribute("type") || "text").toLowerCase();
      const textual = /^(text|email|url|tel|search|number)$/.test(type);
      return textual && el.getAttribute("tabindex") === "-1";
    }

    function buildSelector(el: Element): string {
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body && current !== document.documentElement) {
        let seg = current.tagName.toLowerCase();
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
          path.unshift(`#${current.id}`);
          break;
        }
        const parent: Element | null = current.parentElement;
        if (parent) {
          const currentTag = current.tagName;
          const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        path.unshift(seg);
        current = parent;
      }
      return path.join(" > ");
    }

    function getName(el: Element): string {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();

      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() || "";
      }

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder) return el.placeholder.trim();
      }

      const text = el.textContent?.trim() || "";
      return text.slice(0, 60);
    }

    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= maxElements) break;
      if (interactiveOnly && !isInteractive(el)) continue;
      if (!isVisible(el)) continue;

      // Fillable fields only: a text field no human can reach is a honeypot —
      // never list it, or the agent will fill it. Buttons/links are untouched.
      let suspect: string | undefined;
      if (isFillable(el)) {
        if (unreachableReason(el)) continue;
        if (looksLikeBait(el)) suspect = "honeypot?";
      }

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";
      const type = (el as HTMLInputElement).type || "";

      results.push({
        tag,
        role,
        name: getName(el),
        type,
        placeholder: (el as HTMLInputElement).placeholder || "",
        checked: (el as HTMLInputElement).checked || false,
        disabled: (el as HTMLInputElement).disabled || false,
        selector: buildSelector(el),
        isVisible: true,
        suspect,
      });
    }

    return results;
  }, { interactiveOnly, maxElements });

  const nodes: SnapshotNode[] = [];

  for (const el of elements) {
    const ref = `@e${ctx.nextRefId++}`;

    let displayRole = el.role || el.tag;
    if (el.tag === "input") {
      displayRole = el.type === "password" ? "password" : el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : "input";
    } else if (el.tag === "textarea") {
      displayRole = "textarea";
    } else if (el.tag === "select") {
      displayRole = "select";
    } else if (el.tag === "a") {
      displayRole = "link";
    }

    const state: string[] = [];
    if (el.disabled) state.push("disabled");
    if (el.checked) state.push("checked");
    // Bait-looking field (name like "website"/"fax", or a text input pulled out
    // of the tab order). Still listed — real forms have Website fields — but
    // the agent should leave it empty unless the task clearly needs it.
    if (el.suspect) state.push(el.suspect);

    let description = "";
    if (el.placeholder && el.name !== el.placeholder) description = `placeholder="${el.placeholder}"`;
    if (el.type && !["text", "submit", "button", ""].includes(el.type)) {
      description = description ? `${description} type=${el.type}` : `type=${el.type}`;
    }

    const node: SnapshotNode = {
      ref,
      role: displayRole,
      name: el.name,
      tag: el.tag,
      selector: el.selector,
      state,
      description,
    };

    nodes.push(node);

    ctx.refMap.set(ref, {
      ref,
      role: displayRole,
      name: el.name,
      selector: el.selector,
      description,
    });
  }

  const lines: string[] = [];
  for (const node of nodes) {
    let line = `${node.ref} ${node.role}`;
    if (node.name) line += ` "${node.name}"`;
    if (node.state.length > 0) line += ` [${node.state.join(", ")}]`;
    if (node.description) line += ` (${node.description})`;
    lines.push(line);
  }

  const text = lines.join("\n");
  return { nodes, text };
}
