import type { Page } from "patchright";
import type { PipelineStep, ExecutionContext } from "../../types";
import type { FindResult } from "../types";

type FindStep = Extract<PipelineStep, { type: "find" }>;

export async function find(page: Page, step: FindStep, ctx: ExecutionContext): Promise<FindResult> {
  if (!step.role && !step.name && !step.text && !step.placeholder && !step.label) {
    throw new Error("find requires at least one of: role, name, text, placeholder, label");
  }

  let locator;
  if (step.role) {
    const opts: { name?: string | RegExp; exact?: boolean } = {};
    if (step.name) opts.name = step.exact ? step.name : new RegExp(step.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (step.exact !== undefined) opts.exact = step.exact;
    locator = page.getByRole(step.role as Parameters<typeof page.getByRole>[0], opts);
  } else if (step.label) {
    locator = page.getByLabel(step.label, { exact: step.exact });
  } else if (step.placeholder) {
    locator = page.getByPlaceholder(step.placeholder, { exact: step.exact });
  } else if (step.text) {
    locator = page.getByText(step.text, { exact: step.exact });
  } else {
    locator = page.locator(`[aria-label="${step.name}"], [title="${step.name}"]`);
  }

  const count = await locator.count();
  if (count === 0) {
    throw new Error(`No element found matching: ${JSON.stringify({ role: step.role, name: step.name, text: step.text, placeholder: step.placeholder, label: step.label })}`);
  }

  const element = locator.first();
  const box = await element.boundingBox();
  const elInfo = await element.evaluate((el: Element) => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent?.trim() || "").slice(0, 60);

    const path: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let seg = current.tagName.toLowerCase();
      if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
        path.unshift(`#${current.id}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      if (parent && current) {
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

    return { tag, text, selector: path.join(" > ") };
  });

  const ref = `@e${ctx.nextRefId++}`;
  const displayRole = step.role || elInfo.tag;

  ctx.refMap.set(ref, {
    ref,
    role: displayRole,
    name: elInfo.text,
    selector: elInfo.selector,
  });

  return {
    ref,
    role: displayRole,
    name: elInfo.text,
    tag: elInfo.tag,
    boundingBox: box,
    matchCount: count,
  };
}
