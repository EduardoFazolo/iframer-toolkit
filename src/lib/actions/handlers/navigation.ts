import type { Page } from "patchright";
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
  await page.fill(resolveSelector(step.selector, ctx), step.value);
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

export async function scroll(page: Page, step: Step<"scroll">): Promise<void> {
  await page.evaluate((dy) => window.scrollBy(0, dy || document.body.scrollHeight), step.deltaY ?? 0);
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
  const max = step.maxChars || 20000;
  return { text: text.slice(0, max), truncated: text.length > max };
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
