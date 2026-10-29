import type { Page } from "patchright";
import { clipboardRead } from "../../clipboard";
import type { PipelineStep, ExecutionContext } from "../../types";
import { STEALTH_SCRIPT, contextStealthScripts } from "../../browser/stealth";
import { humanClick, humanClickXY, humanType, humanScroll, humanMove } from "../../browser/humanize";
import { injectStorage } from "../../session/persistence";
import { createLogger } from "../../logger";
import { TIMING, TIMEOUTS } from "../../constants";
import { withBudget } from "../../budget";
import type { StaleStateMonitor } from "../../stale-monitor";
import { resolveSelector } from "../resolve-selector";
import { probeField, isHoneypotReason, honeypotRefusalMessage, type FieldProbe } from "../../reachability";

const log = createLogger("actions");

type Step<K extends PipelineStep["type"]> = Extract<PipelineStep, { type: K }>;

/** How long goto may go without committing before we suspect it was blocked. */
const NAV_COMMIT_SUSPECT_MS = 12_000;

export async function navigate(page: Page, step: Step<"navigate">, ctx: ExecutionContext, monitor?: StaleStateMonitor): Promise<void> {
  const waitUntil = (step.waitUntil || "domcontentloaded") as "load" | "domcontentloaded" | "networkidle" | "commit";
  const urlBefore = page.url();

  // A navigate step is an explicit order to leave the page, so answer a
  // "Leave site?" (beforeunload) prompt with yes; with no listener Playwright
  // would dismiss it. Other dialogs keep the default dismiss.
  const onDialog = (d: { type(): string; accept(): Promise<void>; dismiss(): Promise<void> }) => {
    (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => undefined);
  };
  page.on("dialog", onDialog);
  try {
    const nav = page.goto(step.url, { waitUntil, timeout: TIMEOUTS.NAVIGATION });
    nav.catch(() => undefined);
    let suspectTimer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      nav.then(() => "done" as const),
      new Promise<"slow">((r) => { suspectTimer = setTimeout(() => r("slow"), NAV_COMMIT_SUSPECT_MS); }),
    ]).finally(() => clearTimeout(suspectTimer));

    if (outcome === "slow") {
      if (page.url() !== urlBefore) {
        await nav; // committed, just a slow load — keep waiting normally
      } else {
        // Never even committed: some single-page apps swallow a CDP navigation
        // (service worker, router guard). Ask the page itself to go there.
        log.warn(`navigate: no commit after ${NAV_COMMIT_SUSPECT_MS}ms, falling back to location.assign`);
        monitor?.reportActivity(); // the fallback is progress — don't let the stale timer eat it
        await withBudget(page.evaluate((u) => { location.assign(u); }, step.url), 3_000, "location.assign").catch(() => undefined);
        try {
          await page.waitForURL((u) => u.toString() !== urlBefore, { timeout: 15_000, waitUntil });
        } catch {
          throw new Error(
            `navigate: the page never left ${urlBefore} for ${step.url} (tried a normal navigation, then location.assign). ` +
              `The site is blocking the route change. Use a click on the site's own link to get there.`,
          );
        }
      }
    }
  } finally {
    page.off("dialog", onDialog);
  }
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
  await page.click(resolveSelector(step.selector, ctx), { timeout: TIMEOUTS.CLICK });
}

/** Comboboxes (MUI/Headless UI autocompletes, react-select…) restore their
 *  selected option's label when they lose focus, undoing whatever was typed. */
async function isCombobox(page: Page, selector: string): Promise<boolean> {
  return withBudget(
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const role = el.getAttribute("role");
      return (
        role === "combobox" ||
        el.hasAttribute("aria-autocomplete") ||
        el.getAttribute("aria-haspopup") === "listbox" ||
        el.hasAttribute("list") ||
        !!el.closest('[role="combobox"]')
      );
    }, selector),
    3_000,
  ).catch(() => false);
}

export async function fill(page: Page, step: Step<"fill">, ctx: ExecutionContext): Promise<void> {
  const selector = resolveSelector(step.selector, ctx);
  const value = step.value;

  // 0) Honeypot guard. Playwright's fill only checks the element's own box and
  //    visibility, so a field pushed offscreen by an ANCESTOR (the classic
  //    trap) fills fine — and the submission is silently rejected as a bot.
  //    Ask the renderer whether a human could reach it; refuse if not. A probe
  //    failure (bad selector, dead page) falls through to page.fill, which
  //    reports it the way it always has.
  if (!step.force) {
    let probe: FieldProbe | null = null;
    try { probe = await probeField(page, selector); } catch { probe = null; }
    if (probe?.found && isHoneypotReason(probe.hiddenReason)) {
      throw new Error(honeypotRefusalMessage(step.selector, probe.hiddenReason as string, probe.name));
    }
  }

  // Don't blur a combobox: blur makes it put back the previous option's label,
  // so the next keystrokes would append to it ("RandomUnite" + "United St").
  // Left focused, it shows the filtered option list — click the option next.
  const combobox = await isCombobox(page, selector);

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
    ({ sel, val, keepFocus }) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      try { el.focus(); } catch {}
      try { setter ? setter.call(el, val) : (el.value = val); } catch { (el as HTMLInputElement).value = val; }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (!keepFocus) { try { el.blur(); } catch {} }
      return el.value === val;
    },
    { sel: selector, val: value, keepFocus: combobox },
  );

  // 3) Last resort for frameworks that only trust real keystrokes: clear and
  //    type character-by-character (fires keydown/input per char), then blur.
  if (!stuck) {
    const loc = page.locator(selector);
    try {
      await loc.click();
      await loc.fill("");
      await loc.pressSequentially(value, { delay: 15 });
      if (!combobox) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          el?.blur?.();
        }, selector);
      }
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
  await humanType(page, resolveSelector(step.selector, ctx), step.value, { skipClick: step.skipClick, speed: step.speed, clear: step.clear });
}

export async function selectOption(page: Page, step: Step<"select">, ctx: ExecutionContext): Promise<void> {
  const selector = resolveSelector(step.selector, ctx);
  // Native selection via Playwright: real change/input events, framework-safe
  // (unlike setting .value from evaluate). Matches by option value.
  await page.selectOption(selector, step.value);
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

  // Human mode: real wheel events in eased chunks (see humanScroll). Needs a
  // concrete distance — fall back to a viewport-ish default when deltaY is omitted.
  if (step.human) {
    const dy = step.deltaY ?? 600;
    if (selector) {
      // Hover the element so the wheel scrolls IT, not the page.
      const el = await page.$(selector);
      const box = el ? await el.boundingBox() : null;
      if (box) await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
    }
    await humanScroll(page, dy);
    return;
  }

  // Instant mode (default): precise, fast — for when realism doesn't matter.
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

/** Select all text in the focused element, from inside the page. Works in every
 *  mode, including the extension relay where a Cmd/Ctrl+A keystroke is dropped. */
async function selectAllInFocused(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.select();
    } else if (el && el.isContentEditable) {
      const sel = window.getSelection();
      sel?.selectAllChildren(el);
    } else {
      window.getSelection()?.selectAllChildren(document.body);
    }
  });
}

export async function keyboard(page: Page, step: Step<"keyboard">, ctx: ExecutionContext): Promise<void> {
  if ((step.meta || step.ctrl) && step.key.toLowerCase() === "a" && !step.shift && !step.alt) {
    await selectAllInFocused(page);
    return;
  }
  if ((step.meta || step.ctrl) && ctx.driver === "extension") {
    throw new Error(
      `keyboard: ${step.meta ? "Cmd" : "Ctrl"}+${step.key} can't be sent in extension mode (the relay drops Cmd/Ctrl, so it would ` +
        `arrive as a plain "${step.key}"). Nothing was pressed. Instead: select-all → keyboard {key:"a", meta:true} (handled in-page); ` +
        `replace a field's text → fill, or human-type with clear:true; paste → the paste step.`,
    );
  }
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
