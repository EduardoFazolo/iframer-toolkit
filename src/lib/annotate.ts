import type { Page } from "patchright";
import type { ExecutionContext } from "./types";
import { saveScreenshot } from "./screenshot";

interface AnnotationInfo {
  ref: string;
  role: string;
  name: string;
  x: number;
  y: number;
}

/** Take a screenshot with numbered badges overlaid on interactive elements */
export async function annotatedScreenshot(
  page: Page,
  ctx: ExecutionContext,
): Promise<{ screenshotUrl: string; refs: AnnotationInfo[] }> {
  // Reset refs
  ctx.refMap.clear();
  ctx.nextRefId = 1;

  // Find interactive elements and get their positions
  const elements = await page.evaluate(() => {
    const interactiveTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
    const interactiveRoles = new Set([
      "button", "link", "textbox", "checkbox", "radio", "combobox",
      "menuitem", "option", "searchbox", "switch", "tab",
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
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
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
          const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === current!.tagName);
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
      return (el.textContent?.trim() || "").slice(0, 60);
    }

    const results: {
      tag: string;
      role: string;
      name: string;
      x: number;
      y: number;
      selector: string;
    }[] = [];

    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (results.length >= 50) break;
      if (!isInteractive(el)) continue;
      if (!isVisible(el)) continue;

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";

      results.push({
        tag,
        role: role || tag,
        name: getName(el),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        selector: buildSelector(el),
      });
    }

    return results;
  });

  // Assign refs and store
  const refs: AnnotationInfo[] = [];
  for (const el of elements) {
    const ref = `@e${ctx.nextRefId++}`;
    const num = ctx.nextRefId - 1;

    let displayRole = el.role;
    if (el.tag === "a") displayRole = "link";
    if (el.tag === "input") displayRole = "input";
    if (el.tag === "textarea") displayRole = "textarea";
    if (el.tag === "select") displayRole = "select";

    refs.push({ ref, role: displayRole, name: el.name, x: el.x, y: el.y });

    ctx.refMap.set(ref, {
      ref,
      role: displayRole,
      name: el.name,
      selector: el.selector,
    });
  }

  // Inject overlay badges
  await page.evaluate((annotations: { num: number; x: number; y: number }[]) => {
    const container = document.createElement("div");
    container.id = "__iframer_annotations__";
    container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;";

    for (const { num, x, y } of annotations) {
      const badge = document.createElement("div");
      badge.style.cssText = `
        position:absolute;
        left:${x - 10}px;
        top:${y - 10}px;
        width:20px;
        height:20px;
        border-radius:50%;
        background:#ff6d00;
        color:#fff;
        font:bold 11px/20px sans-serif;
        text-align:center;
        box-shadow:0 1px 3px rgba(0,0,0,0.5);
      `;
      badge.textContent = String(num);
      container.appendChild(badge);
    }

    document.body.appendChild(container);
  }, refs.map((r, i) => ({ num: i + 1, x: r.x, y: r.y })));

  // Take screenshot
  const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
  const screenshotUrl = saveScreenshot(buf, `annotated-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);

  // Remove overlay
  await page.evaluate(() => {
    const el = document.getElementById("__iframer_annotations__");
    if (el) el.remove();
  });

  return { screenshotUrl, refs };
}
