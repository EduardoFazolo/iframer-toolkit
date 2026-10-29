import type { Page } from "patchright";
import type { ExecutionContext, PageState } from "./types";
import { saveScreenshot } from "./screenshot";
import { withBudget } from "./budget";

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
  // Budgeted: this runs on the failure path, often against the very tab that
  // just stopped answering. An unbounded call here hung the error report itself.
  const title = await withBudget(page.title(), 2_000, "title").catch(() => "");

  if (!screenshot) return { url, title };

  try {
    const buf = await withBudget(
      page.screenshot({ type: "jpeg", quality: 50, fullPage: false, timeout: 12_000 }),
      13_000,
      "screenshot",
    );
    const screenshotUrl = saveScreenshot(buf, `${namePrefix}-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
    return { url, title, screenshotUrl };
  } catch {
    return { url, title };
  }
}
