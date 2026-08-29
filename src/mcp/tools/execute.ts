import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PipelineResult, PipelineStep, StepResult } from "../../lib/types";
import type { StepResultMap } from "../../lib/actions/types";
import { apiPost, localApiPost, isDockerRunning, resolveScreenshotPath, err, getErrorMessage, log, localServer } from "../helpers";
import { stepSchema } from "./step-schema";

type TextContent = { type: "text"; text: string };

/**
 * Read a step's result at its registry-guaranteed type. TS can't narrow the
 * nested `r.step.type` discriminant onto `r.result`, so this bridges the gap
 * with a single assertion justified by the StepHandlerRegistry invariant.
 */
function resultOf<K extends PipelineStep["type"]>(r: StepResult, _type: K): StepResultMap[K] | undefined {
  return r.result as StepResultMap[K] | undefined;
}

export function registerExecuteTool(server: McpServer) {
  server.tool(
    "execute",
    `Execute a pipeline of browser steps. Auto-starts a session if needed. Handles obstacles (captcha, cookie banners) automatically.

MANDATORY PRE-FLIGHT: Before calling this tool for any website, call \`knowledge get <domain>\` first. If the cache shows a direct-API path that satisfies the user's request, skip this tool entirely — direct API calls are orders of magnitude faster. Only fall through to \`execute\` when the cache is missing, stale, or insufficient. Every successful run here updates the knowledge cache automatically.

Steps run sequentially. Each step has a 20-second stale-state timeout — if nothing changes on the page for 20s, execution stops and returns a detailed error so you can decide what to do.

Key step types:
- navigate: go to a URL (obstacle detection runs after this)
- snapshot: get the page's interactive elements as a structured list with refs (@e1, @e2...). Use this BEFORE interacting to see what's on the page. Then use refs in click/fill/human-click/human-type steps instead of CSS selectors.
- find: locate a specific element by role, name, text, placeholder, or label. Returns a ref.
- screenshot: take a screenshot. Add annotate=true to overlay numbered badges on interactive elements.
- extract: evaluate JS and include the result in the response
- solve-captcha: auto-detect and solve reCAPTCHA/hCaptcha with vision AI
- login: fill login form with stored credentials (never exposes passwords). Handles email-first flows (Slack, Microsoft, Google) and standard forms.

IMPORTANT — Element refs (@e1, @e2...): All selector fields accept @e refs from snapshot, find, or annotated screenshot. PREFER refs over CSS selectors.

IMPORTANT — Saved anchors (@a:<name>): Selector fields also accept persisted, per-domain anchors from the \`remember\` tool. Call \`remember get <domain>\` before a UI task; if an anchor exists, target it directly (e.g. selector="@a:composer") — no snapshot needed. After finding a new element that works, \`remember save\` it. Unlike @e refs (which reset every snapshot), @a: anchors persist across runs.

FILLING FORMS: Always use the \`fill\` step for text inputs/textareas — NOT \`evaluate\` to set .value. \`fill\` is framework-aware: it fires the React-safe native setter plus input/change/blur, so controlled forms (React, react-hook-form, Formik, Vue) actually register the value and mark the field "touched". This prevents the common "I filled every field but submit still says they're required/empty" failure — which is a form-framework state issue, not a real empty field. If a submit is still rejected as incomplete after filling, re-run \`fill\` on the flagged field (it re-triggers the blur/validation) rather than assuming the value didn't land.

Returns: ok, completedSteps, results, obstacles, capturedApi, and on failure: errorContext with screenshot path, URL, errorType, suggestion, retryable.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
        captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes."),
        mode: z.enum(["headless", "binary-headful", "docker-headful", "extension"]).optional().describe("DO NOT SET THIS unless user explicitly requests a mode. iframer auto-selects and auto-escalates. Use 'extension' ONLY to drive a tab in the user's real Chrome via the iframer extension — requires options.tabId (get it from the `tabs` tool)."),
        autoEscalate: z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
        instanceId: z.string().optional().describe("Run in a named parallel browser within this session (default: 'default'). Use distinct ids to drive several browsers at once, e.g. one per account — each keeps its own login/session state."),
        tabId: z.number().optional().describe("Only with mode='extension': the id of the real Chrome tab to drive (from the `tabs` tool). Input is trusted OS-level (chrome.debugger); Chrome shows its 'is being debugged' bar while the run is in progress."),
        clientId: z.string().optional().describe("Only with mode='extension', and only needed when several profiles/browsers are connected and a tab is ambiguous: the clientId of the profile that owns the tab (from the `tabs` tool)."),
        focus: z.boolean().optional().describe("Only with mode='extension': bring the tab's window to the OS foreground while driving. Default false — the tab is driven in the background (activated in its window, focus-emulated) without interrupting the user. Set true only if a site ignores background input."),
      }).optional(),
    },
    async (params) => {
      try {
        // Extension mode: drive a tab in the user's real Chrome.
        // Bypasses the whole launch/escalation machinery — the extension owns
        // the browser, iframer just streams the step pipeline to it.
        if (params.options?.mode === "extension") {
          const tabId = params.options?.tabId;
          if (typeof tabId !== "number") {
            return err(
              "mode='extension' requires options.tabId. Call the `tabs` tool first to " +
                "find the id of the tab the user wants to drive.",
            );
          }
          // Match the server watchdog's typing-aware cap (+buffer) so long
          // human-type isn't cut off by the client fetch abort.
          const typeChars = (params.steps || []).reduce((n: number, s: { type?: string; value?: unknown }) => {
            return (s.type === "human-type" || s.type === "type-code") && typeof s.value === "string" ? n + s.value.length : n;
          }, 0);
          const timeoutMs = Math.min(60_000 + (params.steps?.length || 0) * 15_000 + typeChars * 250, 1_200_000) + 30_000;
          const extResult = await localApiPost<PipelineResult>("/extension/execute", {
            tabId,
            clientId: params.options?.clientId,
            steps: params.steps,
            options: params.options,
          }, timeoutMs);
          const extLines = formatExecuteResult(extResult);
          const content: TextContent[] = [{ type: "text", text: extLines.join("\n") }];
          if (!extResult.ok) return { content, isError: true };
          return { content };
        }

        const dockerRunning = await isDockerRunning();

        async function runWithMode(mode?: string): Promise<PipelineResult> {
          // docker-headful is the only mode that goes through the Docker API.
          // Every other mode runs on the local background server so CLI, MCP,
          // and all browser modes share one credential / session / knowledge store.
          if (mode === "docker-headful") {
            if (!dockerRunning) {
              return {
                ok: false, completedSteps: 0, totalSteps: params.steps.length,
                results: [], finalState: { url: "", title: "" }, obstacles: [],
                durationMs: 0, modeUsed: "docker-headful",
                error: {
                  failedAtStep: 0, failedStep: params.steps[0],
                  errorType: "action-failed",
                  message: "docker-headful mode was requested but the Docker API is not reachable.",
                  pageState: { url: "", title: "" },
                  suggestion: "Start Docker with `bun run start:docker`, or omit options.mode.",
                  retryable: false,
                },
              };
            }
            return apiPost<PipelineResult>("/execute", {
              steps: params.steps,
              options: { ...params.options, mode: "docker-headful", autoEscalate: false },
            });
          }

          // headless, binary-headful, and auto-select all go to the local
          // background server. Auto-escalation stays enabled.
          return localApiPost<PipelineResult>("/execute", {
            steps: params.steps,
            options: { ...params.options, mode: mode || undefined },
          });
        }

        // Run with crash recovery: if the local server dies mid-pipeline,
        // restart it and retry once.
        let execResult: PipelineResult;
        try {
          execResult = await runWithMode(params.options?.mode);
        } catch (execErr: unknown) {
          const msg = execErr instanceof Error ? execErr.message : String(execErr);
          // Connection-level failures only. Deliberately EXCLUDES abort/timeout:
          // AbortSignal.timeout(180s) on a slow-but-healthy pipeline used to
          // match here, restart the server, and re-run the whole pipeline —
          // double-executing non-idempotent steps (form submits, purchases).
          const isCrash = /ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|fetch failed/i.test(msg);
          if (isCrash) {
            log.info(`Execute crashed (${msg.slice(0, 80)}), restarting local server and retrying...`);
            try { await localServer.restart(); } catch {}
            try {
              execResult = await runWithMode(params.options?.mode);
            } catch (retryErr: unknown) {
              return err(
                `Browser server crashed and retry also failed.\n` +
                `Original: ${msg}\nRetry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}\n\n` +
                `Call \`session restart\` to reset, then retry.`
              );
            }
          } else {
            throw execErr;
          }
        }

        // Bot-block auto-escalation at the MCP level (in case the server-side
        // escalation didn't fire — e.g., server returned before escalating)
        const requestedMode = params.options?.mode;
        if (!execResult.ok && execResult.error?.errorType === "bot-blocked" && params.options?.autoEscalate !== false && !requestedMode) {
          const escalation = ["docker-headful", "binary-headful"];
          for (const nextMode of escalation) {
            if (nextMode === "docker-headful" && !dockerRunning) continue;
            log.info(`Auto-escalating to ${nextMode}`);
            execResult = await runWithMode(nextMode);
            if (execResult.ok) break;
            if (execResult.error?.errorType !== "bot-blocked") break;
          }
        }

        const lines = formatExecuteResult(execResult);

        let screenshotUrl: string | null = null;
        if (execResult.error) {
          screenshotUrl = execResult.error.pageState?.screenshotUrl ?? null;
        } else {
          screenshotUrl = execResult.finalState?.screenshotUrl ?? null;
        }

        // Return screenshot as file path, never base64.
        if (screenshotUrl) {
          const filePath = await resolveScreenshotPath(screenshotUrl);
          if (filePath) {
            lines.push(`\nScreenshot saved: ${filePath}`);
            lines.push("Use the Read tool on the path above to view the screenshot.");
          }
        }

        const content: TextContent[] = [{ type: "text", text: lines.join("\n") }];
        if (!execResult.ok) return { content, isError: true };
        return { content };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
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

  return lines;
}
