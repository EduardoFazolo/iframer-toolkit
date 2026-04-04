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
      // aria-label first
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();

      // associated label
      const id = el.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() || "";
      }

      // placeholder
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.placeholder) return el.placeholder.trim();
      }

      // text content (for buttons, links)
      const text = el.textContent?.trim() || "";
      return text.slice(0, 60);
    }

    // Walk the DOM
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= maxElements) break;
      if (interactiveOnly && !isInteractive(el)) continue;
      if (!isVisible(el)) continue;

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
      });
    }

    return results;
  }, { interactiveOnly, maxElements });

  const nodes: SnapshotNode[] = [];

  for (const el of elements) {
    const ref = `@e${ctx.nextRefId++}`;

    // Determine display role
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

    // Store ref for later resolution
    ctx.refMap.set(ref, {
      ref,
      role: displayRole,
      name: el.name,
      selector: el.selector,
      description,
    });
  }

  // Format as text
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
