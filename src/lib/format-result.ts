import type { PipelineResult, PipelineStep } from "./types";
import type { StepResult } from "./actions/types";
import type { StepResultMap } from "./actions/types";

/**
 * Formats a PipelineResult into the agent-facing text — the ONE surface both
 * the MCP `execute` tool and the CLI print. Lives in lib (not mcp/) so the CLI
 * can use it without dragging in MCP dependencies.
 *
 * Design rule: mutating steps (click/fill/navigate/…) print nothing on success
 * — "steps N/N" is their trace. Only steps whose point is their output
 * (snapshot/find/read/extract/screenshot refs) render, plus obstacles/failures.
 */

/** Read a step's result at its registry-guaranteed type. TS can't narrow the
 *  nested `r.step.type` discriminant onto `r.result`, so this bridges the gap
 *  with a single assertion justified by the StepHandlerRegistry invariant. */
function resultOf<K extends PipelineStep["type"]>(r: StepResult, _type: K): StepResultMap[K] | undefined {
  return r.result as StepResultMap[K] | undefined;
}

/** Just-in-time captcha manual. The step schema deliberately carries only a
 *  slim `recaptcha` entry — the full workflow is injected HERE, the moment a
 *  captcha actually blocks a run, so it costs tokens only when one is on
 *  screen (guaranteed delivery: it rides the result the agent is reading). */
const RECAPTCHA_MANUAL = `
--- Captcha workflow ---
A captcha is blocking this run. Use the "recaptcha" step with an action:
  {type:"recaptcha", action:"info"}                → state + instruction + tile-grid screenshot
  {type:"recaptcha", action:"click"}               → click the "I'm not a robot" checkbox
  {type:"recaptcha", action:"answer", tiles:[...]} → select tiles + verify + re-check (handles refreshing grids)
  {type:"recaptcha", action:"select"|"verify"}     → manual tile-select / submit, if you need finer control
  {type:"recaptcha", action:"solve"}               → automatic vision solve (docker-headful)
Or {type:"solve-captcha"} for one-shot auto-detect + solve.
In binary-headful mode, prefer asking the user to solve it in the visible window.`;

function captchaBlocked(data: PipelineResult): boolean {
  if (data.error?.errorType === "captcha-unsolvable") return true;
  return (data.obstacles || []).some(
    (o) => (o.type === "captcha" || o.type === "hcaptcha") && !o.resolved,
  );
}

export function formatExecuteResult(data: PipelineResult): string[] {
  const lines: string[] = [];
  lines.push(`ok: ${data.ok}`);
  lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
  if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);
  if (data.modeUsed) lines.push(`mode: ${data.modeUsed}${data.modeEscalated ? " (auto-escalated)" : ""}`);

  if (data.finalState) {
    lines.push(`\nFinal page: ${data.finalState.title}`);
    lines.push(`URL: ${data.finalState.url}`);
  }

  // (The per-run "call knowledge get <domain>" nag was removed — it was noise on
  // every response that agents never acted on. The cache still updates silently;
  // the pre-flight instruction in the tool description covers when to read it.)

  // Report any tabs the pipeline followed (a click that opened a new tab).
  for (const r of data.results || []) {
    if (r.tabSwitchedTo) {
      lines.push(`\n↳ step ${r.stepIndex} opened a new tab — pipeline is now on: ${r.tabSwitchedTo}`);
    }
  }

  const meaningful = (data.results || []).filter((r) => r.ok && r.result !== undefined && r.result !== null);
  for (const r of meaningful) {
    if (r.step.type === "snapshot") {
      const res = resultOf(r, "snapshot");
      if (res?.snapshot) {
        lines.push(`\n--- Snapshot (${res.elementCount} elements) ---`);
        lines.push(res.snapshot);
      }
    } else if (r.step.type === "find") {
      const res = resultOf(r, "find");
      if (res?.ref) {
        lines.push(`\nFound: ${res.ref} ${res.role} "${res.name}" (${res.matchCount} match${res.matchCount > 1 ? "es" : ""})`);
      }
    } else if (r.step.type === "screenshot") {
      const res = resultOf(r, "screenshot");
      if (res?.refs) {
        lines.push(`\n--- Annotated screenshot refs ---`);
        lines.push(res.refs);
      }
    } else if (r.step.type === "read") {
      const res = r.result as { text?: string; truncated?: boolean } | undefined;
      if (res?.text !== undefined) {
        lines.push(`\n--- Read (step ${r.stepIndex}${res.truncated ? ", truncated" : ""}) ---`);
        lines.push(res.text);
      }
    } else if (r.step.type === "extract" || r.step.type === "evaluate") {
      // The point of these steps IS their return value — always show it.
      lines.push(`\nstep ${r.stepIndex} (${r.step.type}): ${JSON.stringify(r.result)}`);
    }
    // Trivial action confirmations (click/fill/navigate/scroll/wait →
    // {clicked:true} etc.) are intentionally NOT printed per-step: for a
    // multi-step pipeline that was pure context noise. The "steps N/N" count
    // above already says they ran; failures are reported separately below.
  }

  if (data.obstacles && data.obstacles.length > 0) {
    lines.push("\nObstacles handled:");
    for (const o of data.obstacles) {
      lines.push(`  [step ${o.detectedAtStep}] ${o.type}: ${o.resolved ? o.resolution : "UNRESOLVED - " + (o.resolution || "unknown")}`);
    }
  }

  if (data.capturedApi && data.capturedApi.length > 0) {
    lines.push("\n--- Captured API ---");
    for (const api of data.capturedApi) {
      lines.push(`\n${api.domain} (${api.baseUrl})`);
      lines.push("  Endpoints:");
      for (const ep of api.endpoints) {
        lines.push(`    ${ep.method} ${ep.path}  [step ${ep.triggeredAtStep}, status ${ep.responseStatus}]`);
      }
    }
  }

  if (data.error) {
    lines.push("\n--- Failure ---");
    if (typeof data.error === "string") {
      lines.push(`Error: ${data.error}`);
    } else {
      lines.push(`Failed at step ${data.error.failedAtStep}: ${JSON.stringify(data.error.failedStep)}`);
      lines.push(`Error type: ${data.error.errorType}`);
      lines.push(`Message: ${data.error.message}`);
      lines.push(`Retryable: ${data.error.retryable}`);
      if (data.error.suggestion) lines.push(`Suggestion: ${data.error.suggestion}`);
      if (data.error.pageState?.url) lines.push(`URL at failure: ${data.error.pageState.url}`);
    }
  }

  // Instructions travel with the event, not the schema: the captcha manual
  // appears only when a captcha actually blocked this run.
  if (captchaBlocked(data)) {
    lines.push(RECAPTCHA_MANUAL);
  }

  return lines;
}
