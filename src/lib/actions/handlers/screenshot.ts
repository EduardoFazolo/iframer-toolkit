import type { Page } from "patchright";
import type { PipelineStep, ExecutionContext } from "../../types";
import { saveScreenshot } from "../../screenshot";
import { takeSnapshot } from "../../snapshot";
import { annotatedScreenshot } from "../../annotate";

type Step<K extends PipelineStep["type"]> = Extract<PipelineStep, { type: K }>;

export async function screenshot(
  page: Page,
  step: Step<"screenshot">,
  ctx: ExecutionContext
): Promise<{ screenshotUrl: string; refs?: string }> {
  if (step.annotate) {
    const annotated = await annotatedScreenshot(page, ctx);
    const refLines = annotated.refs.map((r) => `  ${r.ref} ${r.role} "${r.name}"`).join("\n");
    return { screenshotUrl: annotated.screenshotUrl, refs: refLines };
  }
  const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
  const url = saveScreenshot(buf, `step-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
  return { screenshotUrl: url };
}

export async function snapshot(
  page: Page,
  step: Step<"snapshot">,
  ctx: ExecutionContext
): Promise<{ elementCount: number; snapshot: string }> {
  const snap = await takeSnapshot(page, ctx, {
    interactiveOnly: step.interactiveOnly,
    maxElements: step.maxElements,
  });
  return { elementCount: snap.nodes.length, snapshot: snap.text };
}
