import type { Page } from "patchright";
import type { ExecutionContext, PageState } from "./types";
import { saveScreenshot } from "./screenshot";

export interface CapturePageStateOptions {
  /** Capture a JPEG screenshot and include its URL. Default: false. */
  screenshot?: boolean;
  /** Filename prefix for the screenshot (e.g. "state", "block"). Default: "state". */
  namePrefix?: string;
}

/**
 * Snapshot the page's URL + title, optionally with a screenshot.
 * Unifies the previously-duplicated getPageState implementations in
 * pipeline.ts ("state-" prefix, screenshot optional) and iframer.ts
 * ("block-" prefix, screenshot always on) — pass options to reproduce
 * either caller's behavior.
 */
export async function capturePageState(
  page: Page,
  ctx: ExecutionContext,
  opts?: CapturePageStateOptions
): Promise<PageState> {
  const { screenshot = false, namePrefix = "state" } = opts ?? {};

  let url = "";
  try { url = page.url(); } catch {}
  const title = await page.title().catch(() => "");

  if (!screenshot) return { url, title };

  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
    const screenshotUrl = saveScreenshot(buf, `${namePrefix}-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
}
