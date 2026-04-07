import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, getIframer, isDockerRunning, ensureLocalChrome, fetchScreenshot, err, getErrorMessage, log, LOCAL_USER, LOCAL_TOKEN } from "../helpers";
import { stepSchema } from "./step-schema";

export function registerExecuteTool(server: McpServer) {
  server.tool(
    "execute",
    `Execute a pipeline of browser steps. Auto-starts a session if needed. Handles obstacles (captcha, cookie banners) automatically.

Steps run sequentially. Each step has a 20-second stale-state timeout — if nothing changes on the page for 20s, execution stops and returns a detailed error so you can decide what to do.

Key step types:
- navigate: go to a URL (obstacle detection runs after this)
- snapshot: get the page's interactive elements as a structured list with refs (@e1, @e2...). Use this BEFORE interacting to see what's on the page. Then use refs in click/fill/human-click/human-type steps instead of CSS selectors.
- find: locate a specific element by role, name, text, placeholder, or label. Returns a ref. Use when you know what you're looking for (e.g. find role=button name="Sign In" → @e1, then click @e1).
- screenshot: take a screenshot. Add annotate=true to overlay numbered badges on interactive elements — returns refs you can use in subsequent steps.
- extract: evaluate JS and include the result in the response
- solve-captcha: auto-detect and auto-solve reCAPTCHA OR hCaptcha with vision (uses Claude) — works for both, no config needed
- login: fill login form with stored credentials (never exposes passwords)

IMPORTANT — Element refs (@e1, @e2...): All selector fields (click, fill, human-click, human-type, wait-for) accept @e refs from snapshot, find, or annotated screenshot. PREFER refs over CSS selectors — they're more reliable. Run snapshot first to see what's available.

API capture (options.captureApi): When enabled, records all XHR/fetch requests the page makes during execution. Use this when the user asks to "reverse engineer", "capture endpoints", "map the API", "remember how this works", or "save the endpoints". Returns structured endpoint data grouped by domain with parameterized paths, request/response bodies, and which pipeline step triggered each call. The agent can then save these to a directory for future direct API usage.

Returns: ok, completedSteps, results (with extract values), obstacles (what was detected/resolved), capturedApi (when enabled), and on failure: errorContext with screenshot, URL, errorType, suggestion, retryable.

IMPORTANT — Do NOT specify options.mode unless the user explicitly asks for a specific browser mode. iframer auto-selects the best mode and auto-escalates if blocked (headless → docker-headful → binary-headful) in a single call. Specifying a mode disables auto-escalation and often picks a worse mode than iframer would choose.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute sequentially"),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        screenshotAfterEach: z.boolean().optional().describe("Take a screenshot after every step (expensive)"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
        captureApi: z.boolean().optional().describe("Record all API calls (XHR/fetch) the page makes. Use when the user wants to reverse-engineer, map, or save a site's API endpoints."),
        mode: z.enum(["headless", "binary-headful", "docker-headful"]).optional().describe("DO NOT SET THIS unless user explicitly requests a mode. iframer auto-selects and auto-escalates. Setting this disables auto-escalation."),
        autoEscalate: z.boolean().optional().describe("Auto-retry with a stronger mode if blocked (default: true)"),
      }).optional(),
    },
    async (params) => {
      try {
        const dockerRunning = await isDockerRunning();

        async function runWithMode(mode?: string): Promise<any> {
          if (mode === "binary-headful") {
            await ensureLocalChrome();
            const iframer = await getIframer();
            return iframer.execute(LOCAL_USER, LOCAL_TOKEN, {
              steps: params.steps,
              options: { ...params.options, mode: "binary-headful", autoEscalate: false },
            });
          }
          if (mode === "docker-headful" && dockerRunning) {
            return apiPost("/execute", {
              steps: params.steps,
              options: { ...params.options, mode: "docker-headful", autoEscalate: false },
            });
          }
          if (dockerRunning) {
            return apiPost("/execute", {
              steps: params.steps,
              options: { ...params.options, mode: mode || undefined },
            });
          }
          await ensureLocalChrome();
          const iframer = await getIframer();
          return iframer.execute(LOCAL_USER, LOCAL_TOKEN, {
            steps: params.steps,
            options: { ...params.options, mode: (mode as any) || undefined },
          });
        }

        const requestedMode = params.options?.mode;
        let execResult = await runWithMode(requestedMode);

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

        const content: any[] = [{ type: "text" as const, text: lines.join("\n") }];
        if (screenshotUrl) {
          const img = await fetchScreenshot(screenshotUrl);
          if (img) content.push(img);
        }

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
      const authParts: string[] = [];
      if (api.auth?.authorization) authParts.push("Authorization header");
      if (api.auth?.cookies && Object.keys(api.auth.cookies).length > 0) authParts.push(`${Object.keys(api.auth.cookies).length} cookies`);
      if (api.auth?.tokens && Object.keys(api.auth.tokens).length > 0) authParts.push(`${Object.keys(api.auth.tokens).length} token headers (${Object.keys(api.auth.tokens).join(", ")})`);
      if (authParts.length > 0) lines.push(`  Auth: ${authParts.join(", ")}`);

      lines.push("  Endpoints:");
      for (const ep of api.endpoints) {
        lines.push(`    ${ep.method} ${ep.path}  [step ${ep.triggeredAtStep}, status ${ep.responseStatus}]`);
        if (ep.rawPaths.length > 1) {
          lines.push(`      examples: ${ep.rawPaths.slice(0, 3).join(", ")}`);
        }
      }
    }
    lines.push("\nThe capturedApi field contains full endpoint data including auth, headers, request/response bodies, and curl commands. Save it to a directory for the user — use auth.json for shared credentials and one file per endpoint.");
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
