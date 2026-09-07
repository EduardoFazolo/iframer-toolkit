import type { Page } from "patchright";
import type { ExecutionContext, PageState } from "./types";
import { saveScreenshot } from "./screenshot";

export interface CapturePageStateOptions {
  /** Capture a JPEG screenshot and include its URL. Default: false. */
  screenshot?: boolean;
  /** Filename prefix for the screenshot (e.g. "state", "block"). Default: "state". */
  namePrefix?: string;
}

/** Capture URL and title, with a best-effort screenshot when requested. */
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
