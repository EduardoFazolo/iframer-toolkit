import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PipelineResult } from "../../lib/types";
import { apiPost, localApiPost, isDockerRunning, resolveScreenshotPath, err, getErrorMessage, log, localServer } from "../helpers";
import { stepSchema, normalizeSteps } from "./step-schema";
import { formatExecuteResult } from "../../lib/format-result";

// Re-export so existing importers (benchmark harness, tests) keep working.
export { formatExecuteResult };

type TextContent = { type: "text"; text: string };

export function registerExecuteTool(server: McpServer) {
  server.tool(
    "execute",
    `Execute a pipeline of browser steps. Auto-starts a session; handles obstacles (captcha, cookie banners) automatically.

MANDATORY PRE-FLIGHT: call \`knowledge get <domain>\` first. If the cache shows a direct-API path that satisfies the request, skip the browser entirely — direct API calls are orders of magnitude cheaper. Every successful run updates the cache silently.

Steps run sequentially (20s stale-state timeout per step; failures return errorType + suggestion).

Seeing the page: \`snapshot\` lists interactive elements with refs (@e1…), \`find\` locates one element by role/name/text, \`screenshot\` with annotate=true overlays numbered badges, \`extract\` evaluates JS and returns the result. \`login\` fills login forms from stored credentials (never exposes passwords; handles email-first flows).

Selectors: every selector field accepts @e refs (PREFER them over CSS) and persisted per-domain @a:<name> anchors from the \`remember\` tool. \`remember get <domain>\` before a UI task — an existing anchor can be targeted directly with no snapshot. When a newly found selector works, \`remember save\` it (@e refs reset each snapshot; @a: anchors persist across runs).

FORMS: use \`fill\` for text inputs — never evaluate-set .value (fill fires the framework-aware events; see its description). If a submit still claims fields are empty/required, re-run fill on the flagged field rather than assuming the value didn't land.

Returns: ok, completedSteps, output for snapshot/find/read/extract steps, obstacles, capturedApi, and on failure a screenshot path + errorType + suggestion + retryable.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
        captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes."),
        mode: z.enum(["headless", "binary-headful", "docker-headful", "extension"]).optional().describe("DO NOT SET unless the user explicitly requests a mode — iframer auto-selects and auto-escalates. 'extension' drives a real-Chrome tab (requires options.tabId from the `tabs` tool)."),
        autoEscalate: z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
        instanceId: z.string().optional().describe("Named parallel browser (default 'default') — distinct ids drive several browsers at once, each with its own session state."),
        tabId: z.number().optional().describe("mode='extension': the real-Chrome tab id to drive (from the `tabs` tool)."),
        clientId: z.string().optional().describe("mode='extension': owning profile's clientId, only when several browsers are connected and the tab is ambiguous."),
        focus: z.boolean().optional().describe("mode='extension': raise the window to the foreground while driving (default false — background drive with focus emulation). Only if a site ignores background input."),
      }).optional(),
    },
    async (params) => {
      try {
        // Translate MCP-level step sugar (e.g. the collapsed `recaptcha` step)
        // into the stable server wire format before anything is POSTed.
        const steps = normalizeSteps(params.steps);
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
          const typeChars = (steps || []).reduce((n: number, s: { type?: string; value?: unknown }) => {
            return (s.type === "human-type" || s.type === "type-code") && typeof s.value === "string" ? n + s.value.length : n;
          }, 0);
          const timeoutMs = Math.min(60_000 + (steps.length || 0) * 15_000 + typeChars * 250, 1_200_000) + 30_000;
          const extResult = await localApiPost<PipelineResult>("/extension/execute", {
            tabId,
            clientId: params.options?.clientId,
            steps,
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
                ok: false, completedSteps: 0, totalSteps: steps.length,
                results: [], finalState: { url: "", title: "" }, obstacles: [],
                durationMs: 0, modeUsed: "docker-headful",
                error: {
                  failedAtStep: 0, failedStep: steps[0],
                  errorType: "action-failed",
                  message: "docker-headful mode was requested but the Docker API is not reachable.",
                  pageState: { url: "", title: "" },
                  suggestion: "Start Docker with `bun run start:docker`, or omit options.mode.",
                  retryable: false,
                },
              };
            }
            return apiPost<PipelineResult>("/execute", {
              steps,
              options: { ...params.options, mode: "docker-headful", autoEscalate: false },
            });
          }

          // headless, binary-headful, and auto-select all go to the local
          // background server. Auto-escalation stays enabled.
          return localApiPost<PipelineResult>("/execute", {
            steps,
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

// formatExecuteResult now lives in src/lib/format-result.ts (shared with the
// CLI) and is re-exported at the top of this file.
