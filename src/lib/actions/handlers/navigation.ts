import type { Page } from "patchright";
import { clipboardRead } from "../../clipboard";
import type { PipelineStep, ExecutionContext } from "../../types";
import { STEALTH_SCRIPT, contextStealthScripts } from "../../browser/stealth";
import { humanClick, humanClickXY, humanType } from "../../browser/humanize";
import { injectStorage } from "../../session/persistence";
import { createLogger } from "../../logger";
import { TIMING, TIMEOUTS } from "../../constants";
import { resolveSelector } from "../resolve-selector";

const log = createLogger("actions");

type Step<K extends PipelineStep["type"]> = Extract<PipelineStep, { type: K }>;

export async function navigate(page: Page, step: Step<"navigate">, ctx: ExecutionContext): Promise<void> {
  await page.goto(step.url, {
    waitUntil: (step.waitUntil || "domcontentloaded") as "load" | "domcontentloaded" | "networkidle" | "commit",
    timeout: TIMEOUTS.NAVIGATION,
  });
  const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
  try {
    await page.evaluate(stealthScript);
  } catch (err) {
    log.warn(`stealth injection failed: ${err}`);
  }
  // Re-inject localStorage/sessionStorage for this origin (origin-scoped, idempotent).
  // Cookies were already injected at context level before the pipeline started.
  if (ctx.sessionData) {
    try {
      await injectStorage(page, ctx.sessionData);
    } catch (err) {
      log.warn(`storage injection after navigate failed: ${err}`);
    }
  }
}

export async function click(page: Page, step: Step<"click">, ctx: ExecutionContext): Promise<void> {
  await page.click(resolveSelector(step.selector, ctx));
}

export async function fill(page: Page, step: Step<"fill">, ctx: ExecutionContext): Promise<void> {
  const selector = resolveSelector(step.selector, ctx);
  const value = step.value;

  // 1) Playwright fill: focus + native value setter + input/change events.
  //    Works for most sites on its own.
  await page.fill(selector, value);

  // 2) Reinforce for framework-controlled inputs. Many forms (React,
  //    react-hook-form, Formik, Vue) don't read the DOM value — they track
  //    their own state, updated only through the right event sequence:
  //    - React ignores a directly-set value (its private _valueTracker sees no
  //      change), so we set via the NATIVE setter to force onChange to fire.
  //    - Validation libraries mark a field "valid/filled" only once it's been
  //      BLURRED (touched). Without that, submit falsely reports it empty — the
  //      exact "filled fields still count as missing" bug. el.blur() fires the
  //      real blur + focusout that React's onBlur delegation listens for.
  const stuck = await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      try { el.focus(); } catch {}
      try { setter ? setter.call(el, val) : (el.value = val); } catch { (el as HTMLInputElement).value = val; }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      try { el.blur(); } catch {}
      return el.value === val;
    },
    { sel: selector, val: value },
  );

  // 3) Last resort for frameworks that only trust real keystrokes: clear and
  //    type character-by-character (fires keydown/input per char), then blur.
  if (!stuck) {
    const loc = page.locator(selector);
    try {
      await loc.click();
      await loc.fill("");
      await loc.pressSequentially(value, { delay: 15 });
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        el?.blur?.();
      }, selector);
    } catch {
      /* keep the value from steps 1-2 — better than throwing */
    }
  }
}

export async function humanClickStep(page: Page, step: Step<"human-click">, ctx: ExecutionContext): Promise<void> {
  if (step.selector) {
    await humanClick(page, resolveSelector(step.selector, ctx));
  } else if (step.x !== undefined && step.y !== undefined) {
    await humanClickXY(page, step.x, step.y);
  } else {
    throw new Error("human-click requires selector or x/y coordinates");
  }
}

export async function rightClick(page: Page, step: Step<"right-click">, ctx: ExecutionContext): Promise<void> {
  if (step.selector) {
    await page.click(resolveSelector(step.selector, ctx), { button: "right" });
  } else if (step.x !== undefined && step.y !== undefined) {
    await page.mouse.click(step.x, step.y, { button: "right" });
  } else {
    throw new Error("right-click requires selector or x/y coordinates");
  }
}

export async function humanTypeStep(page: Page, step: Step<"human-type">, ctx: ExecutionContext): Promise<void> {
  await humanType(page, resolveSelector(step.selector, ctx), step.value);
}

export async function evaluate(page: Page, step: Step<"evaluate">): Promise<unknown> {
  return page.evaluate(step.expression);
}

export async function extract(page: Page, step: Step<"extract">): Promise<unknown> {
  return page.evaluate(step.expression);
}

export async function wait(page: Page, step: Step<"wait">): Promise<void> {
  await page.waitForTimeout(step.ms);
}

export async function waitFor(page: Page, step: Step<"wait-for">, ctx: ExecutionContext): Promise<void> {
  await page.waitForSelector(resolveSelector(step.selector, ctx), { timeout: step.timeout || TIMEOUTS.SELECTOR_WAIT });
}

export async function scroll(page: Page, step: Step<"scroll">, ctx: ExecutionContext): Promise<void> {
  const selector = step.selector ? resolveSelector(step.selector, ctx) : null;
  await page.evaluate(
    ({ dy, sel }) => {
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`scroll: no element for selector ${sel}`);
        el.scrollBy(0, dy || el.scrollHeight);
      } else {
        window.scrollBy(0, dy || document.body.scrollHeight);
      }
    },
    { dy: step.deltaY ?? 0, sel: selector },
  );
}

export async function keyboard(page: Page, step: Step<"keyboard">): Promise<void> {
  const mods = [
    step.meta ? "Meta" : null,
    step.ctrl ? "Control" : null,
    step.shift ? "Shift" : null,
    step.alt ? "Alt" : null,
  ].filter(Boolean);
  await page.keyboard.press(mods.length ? `${mods.join("+")}+${step.key}` : step.key);
}

export async function read(
  page: Page,
  step: Step<"read">,
  ctx: ExecutionContext
): Promise<{ text: string; truncated?: boolean }> {
  const selector = step.selector ? resolveSelector(step.selector, ctx) : "body";
  const raw = await page.evaluate((sel) => {
    const el = sel === "body" ? document.body : document.querySelector(sel);
    if (!el) return null;
    return (el as HTMLElement).innerText || el.textContent || "";
  }, selector);
  if (raw == null) throw new Error(`read: no element for selector ${selector}`);
  const text = raw.replace(/\n{3,}/g, "\n\n").trim();
  // Default kept modest so a blind `read` of a whole page doesn't dump ~5k
  // tokens into context. Agents that genuinely need the full text pass maxChars.
  const max = step.maxChars || 6000;
  return { text: text.slice(0, max), truncated: text.length > max };
}

export async function upload(
  page: Page,
  step: Step<"upload">,
  ctx: ExecutionContext
): Promise<{ uploaded: number; files: string[] }> {
  if (!step.files || step.files.length === 0) throw new Error("upload: `files` must be a non-empty array of local paths");
  // page.setInputFiles drives CDP DOM.setFileInputFiles — the only way to put
  // real bytes on an <input type=file> (page JS can't forge a trusted File).
  // Over the extension relay this reaches the user's real Chrome; local paths
  // work because iframer runs on the same machine.
  await page.setInputFiles(resolveSelector(step.selector, ctx), step.files);
  return { uploaded: step.files.length, files: step.files };
}

export async function paste(
  page: Page,
  step: Step<"paste">,
  ctx: ExecutionContext
): Promise<{ pasted: number }> {
  // Read the OS clipboard (iframer runs on the same machine as the browser) and
  // insert it via CDP Input.insertText — a page-level command that works over
  // the extension relay, unlike a ⌘V keystroke (whose modifier the relay drops).
  const text = await clipboardRead();
  if (step.selector) {
    // Focus the target first so the insert lands there.
    await page.click(resolveSelector(step.selector, ctx));
  }
  await page.keyboard.insertText(text);
  return { pasted: text.length };
}

export async function download(
  page: Page,
  step: Step<"download">
): Promise<{ path: string; size: number; status: number }> {
  if (!step.url) throw new Error("download: `url` is required");
  // Fetch through the browser context (cookies/session included) and write the
  // bytes with plain Node fs. No chrome.downloads, no Save-As dialog, no OS
  // specifics — works in every mode. Cross-origin is fine (server-side request).
  const resp = await page.request.get(step.url);
  const status = resp.status();
  if (!resp.ok()) throw new Error(`download: HTTP ${status} for ${step.url}`);
  const buf = await resp.body();
  const fs = await import("fs");
  const pathMod = await import("path");
  const { getDataDir } = await import("../../paths");
  let outPath: string;
  if (step.path && pathMod.isAbsolute(step.path)) {
    outPath = step.path;
  } else {
    let name = "download";
    try { name = decodeURIComponent(new URL(step.url).pathname.split("/").pop() || "") || "download"; } catch {}
    outPath = pathMod.join(getDataDir(), "downloads", step.path || name);
  }
  fs.mkdirSync(pathMod.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return { path: outPath, size: buf.length, status };
}

export async function typeCode(page: Page, step: Step<"type-code">, ctx: ExecutionContext): Promise<{ typed: number }> {
  const code = String(step.value || "");
  const selector = step.selector ? resolveSelector(step.selector, ctx) : 'input[type="tel"]';
  const firstInput = await page.waitForSelector(selector, { timeout: TIMEOUTS.TOTP_INPUT });
  if (!firstInput) throw new Error(`Input not found: ${selector}`);
  await firstInput.click();
  await page.waitForTimeout(TIMING.POST_FORM_CLICK);
  for (const digit of code) {
    await page.keyboard.press(digit);
    await page.waitForTimeout(TIMING.DIGIT_DELAY_BASE + Math.random() * TIMING.DIGIT_DELAY_RANGE);
  }
  return { typed: code.length };
}
