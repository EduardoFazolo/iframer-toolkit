import type { Page, ElementHandle } from "patchright";
import { TIMING } from "../constants";

/**
 * Canonical form-fill + submit-finder helpers. These collapse what used to be
 * three copy-pasted "native-setter fill" implementations and two copy-pasted
 * "find & click submit" implementations inside handleLogin.
 *
 * "Native value" means setting the input's value through the prototype's value
 * setter and dispatching input/change — the way React/Vue controlled inputs
 * require, which plain page.fill() doesn't reliably trigger.
 */

/** In-page: set an input's value via the native setter and fire input/change. */
function applyNativeValue(el: Element, val: string): void {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, val);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function humanDelay(page: Page): Promise<void> {
  return page.waitForTimeout(TIMING.PRE_NAVIGATE[0] + Math.random() * (TIMING.PRE_NAVIGATE[1] - TIMING.PRE_NAVIGATE[0]));
}

/** Set a value on an already-resolved element handle, no clicks or waits.
 *  Used for the post-auth OTP field where anti-bot checks are already passed. */
export async function setValueNative(handle: ElementHandle, value: string): Promise<void> {
  await handle.evaluate(applyNativeValue, value);
}

/** Fill an element handle: scroll into view, click, native-set, optional human delay. */
export async function fillHandleNative(
  page: Page,
  handle: ElementHandle,
  value: string,
  opts: { delay?: boolean } = {}
): Promise<void> {
  await handle.scrollIntoViewIfNeeded().catch(() => {});
  await handle.click({ delay: 40 }).catch(() => {});
  await handle.evaluate(applyNativeValue, value);
  if (opts.delay !== false) await humanDelay(page);
}

/** Fill by CSS selector: click, settle, native-set, human delay. */
export async function fillSelectorNative(page: Page, selector: string, value: string): Promise<void> {
  await page.click(selector);
  await page.waitForTimeout(TIMING.SCROLL_DELAY);
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value] as [string, string]);
  await humanDelay(page);
}

export interface SubmitButtonOptions {
  /** Selector whose closest <form> is searched first (falls back to document). */
  formAnchor: string;
  /** Text pattern for matching button labels when no typed submit exists.
   *  Passed as source+flags so it can cross into the page context. */
  reSource: string;
  reFlags: string;
}

/** Find the submit button: prefer a typed submit inside the anchor's form,
 *  else a button whose text matches the pattern, scoped to the form then the
 *  whole document. Returns null if none found. */
export async function findSubmitButton(page: Page, opts: SubmitButtonOptions): Promise<ElementHandle | null> {
  const handle = await page.evaluateHandle(({ formAnchor, reSource, reFlags }) => {
    const re = new RegExp(reSource, reFlags);
    const pick = (scope: ParentNode): HTMLElement | null => {
      const typed = scope.querySelector('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])') as HTMLElement | null;
      if (typed) return typed;
      const buttons = Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])')) as HTMLElement[];
      return buttons.find((b) => re.test(b.textContent || "") && b.offsetParent !== null) || null;
    };
    const form = document.querySelector(formAnchor)?.closest("form");
    if (form) {
      const found = pick(form);
      if (found) return found;
    }
    return pick(document);
  }, opts);
  return handle.asElement();
}
