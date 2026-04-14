import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, localApiPost, isDockerRunning, resolveScreenshotPath, err, getErrorMessage, log, localServer } from "../helpers";
import { stepSchema } from "./step-schema";

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

Returns: ok, completedSteps, results, obstacles, capturedApi, and on failure: errorContext with screenshot path, URL, errorType, suggestion, retryable.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
        captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes."),
        mode: z.enum(["headless", "binary-headful", "docker-headful"]).optional().describe("DO NOT SET THIS unless user explicitly requests a mode. iframer auto-selects and auto-escalates."),
        autoEscalate: z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
      }).optional(),
    },
    async (params) => {
      try {
        const dockerRunning = await isDockerRunning();

        async function runWithMode(mode?: string): Promise<any> {
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
            return apiPost("/execute", {
              steps: params.steps,
              options: { ...params.options, mode: "docker-headful", autoEscalate: false },
            });
          }

          // headless, binary-headful, and auto-select all go to the local
          // background server. Auto-escalation stays enabled.
          return localApiPost("/execute", {
            steps: params.steps,
            options: { ...params.options, mode: mode || undefined },
          });
        }

        // Run with crash recovery: if the local server dies mid-pipeline,
        // restart it and retry once.
        let execResult: any;
        try {
          execResult = await runWithMode(params.options?.mode);
        } catch (execErr: unknown) {
          const msg = execErr instanceof Error ? execErr.message : String(execErr);
          const isCrash = /connect|ECONNREFUSED|EPIPE|closed|timed out|abort|fetch failed/i.test(msg);
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

        const content: any[] = [{ type: "text" as const, text: lines.join("\n") }];
        if (!execResult.ok) return { content, isError: true };
        return { content };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}

export function formatExecuteResult(data: any): string[] {
  const lines: string[] = [];
  lines.push(`ok: ${data.ok}`);
  lines.push(`steps: ${data.completedSteps}/${data.totalSteps}`);
  if (data.durationMs) lines.push(`duration: ${data.durationMs}ms`);
  if (data.modeUsed) lines.push(`mode: ${data.modeUsed}${data.modeEscalated ? " (auto-escalated)" : ""}`);

  if (data.finalState) {
    lines.push(`\nFinal page: ${data.finalState.title}`);
    lines.push(`URL: ${data.finalState.url}`);
  }

  // Knowledge cache hint
  if (data.ok && data.finalState?.url) {
    try {
      const domain = new URL(data.finalState.url).hostname.replace(/^www\./, "");
      lines.push(`\nKnowledge cache updated for ${domain}. Before the next browser run on this domain, call \`knowledge get ${domain}\` — you may be able to skip the browser entirely.`);
    } catch {}
  }

  const meaningful = (data.results || []).filter((r: any) => r.ok && r.result !== undefined && r.result !== null);
  for (const r of meaningful) {
    if (r.step?.type === "snapshot" && r.result?.snapshot) {
      lines.push(`\n--- Snapshot (${r.result.elementCount} elements) ---`);
      lines.push(r.result.snapshot);
    } else if (r.step?.type === "find" && r.result?.ref) {
      lines.push(`\nFound: ${r.result.ref} ${r.result.role} "${r.result.name}" (${r.result.matchCount} match${r.result.matchCount > 1 ? "es" : ""})`);
    } else if (r.step?.type === "screenshot" && r.result?.refs) {
      lines.push(`\n--- Annotated screenshot refs ---`);
      lines.push(r.result.refs);
    } else if (r.result !== undefined && r.result !== null) {
      lines.push(`\nstep ${r.stepIndex}: ${JSON.stringify(r.result)}`);
    }
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
