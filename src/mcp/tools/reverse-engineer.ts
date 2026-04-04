import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, fetchScreenshot, err, getErrorMessage, BASE_URL } from "../helpers";
import { stepSchema } from "./step-schema";

export function registerReverseEngineerTool(server: McpServer) {
  server.tool(
    "reverse-engineer",
    `Reverse-engineer a website's API. Navigates to a URL, performs the steps you specify, and captures every XHR/fetch request the page makes — including auth tokens, cookies, headers, request/response bodies, and ready-to-use curl commands.

Use this when the user asks to:
- "reverse engineer" or "map" a site's API
- "capture the endpoints" or "save the API"
- "figure out how this site works under the hood"
- "record the API calls" so they can be replayed later

How it works:
1. You provide steps (same as execute) — navigate, click, fill, extract, etc.
2. iframer runs them while recording all API calls the page makes
3. Returns structured data per domain: shared auth (cookies, tokens, Authorization header) + each endpoint with method, path, headers, body, response, and a curl command

After getting results, save them as RUNNABLE CODE to a directory:
  <outputDir>/
    auth.js                — exports shared cookies, tokens, authorization as an object
    getMessages.js         — one .js file per endpoint: exports an async function that calls the endpoint using fetch, with auth imported from auth.js
    index.js               — re-exports all endpoint functions
    README.md              — summary of all endpoints and their dependency chain

If typed=true (user asks to "infer types", "add types", "save as typescript", etc.), save as .ts instead:
    auth.ts                — typed auth config with interface
    getMessages.ts         — async function with inferred request/response types based on captured data
    types.ts               — all inferred interfaces (e.g. Message, Channel, User) derived from response bodies
    index.ts               — re-exports all endpoint functions

Naming: convert endpoint paths to camelCase function names (e.g. GET /api/v9/channels/{id}/messages → getChannelMessages). Group related endpoints logically.

The outputDir defaults to the current working directory + the domain name (e.g. ./example_com/). Ask the user where to save if unclear.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute while capturing API calls"),
      outputDir: z.string().optional().describe("Directory to save the captured API files. If not provided, ask the user or default to ./<domain>/"),
      typed: z.boolean().optional().describe("Save as .ts with inferred types instead of .js. Set to true when the user asks for types, typescript, or type inference."),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
      }).optional(),
    },
    async (params) => {
      try {
        const execParams = {
          steps: params.steps,
          options: { ...params.options, captureApi: true },
        };
        const captureResult = await apiPost<any>("/execute", execParams);

        const lines: string[] = [];
        lines.push(`ok: ${captureResult.ok}`);
        lines.push(`steps: ${captureResult.completedSteps}/${captureResult.totalSteps}`);
        if (captureResult.durationMs) lines.push(`duration: ${captureResult.durationMs}ms`);

        if (captureResult.finalState) {
          lines.push(`\nFinal page: ${captureResult.finalState.title}`);
          lines.push(`URL: ${captureResult.finalState.url}`);
        }

        if (captureResult.capturedApi && captureResult.capturedApi.length > 0) {
          formatCapturedApi(lines, captureResult.capturedApi, params);
        } else {
          lines.push("\nNo API calls were captured. The page may not have made any XHR/fetch requests during the steps, or the steps may not have triggered the expected behavior.");
        }

        if (captureResult.error) {
          lines.push("\n--- Failure ---");
          if (typeof captureResult.error === "string") {
            lines.push(`Error: ${captureResult.error}`);
          } else {
            lines.push(`Failed at step ${captureResult.error.failedAtStep}: ${JSON.stringify(captureResult.error.failedStep)}`);
            lines.push(`Error type: ${captureResult.error.errorType}`);
            lines.push(`Message: ${captureResult.error.message}`);
            if (captureResult.error.suggestion) lines.push(`Suggestion: ${captureResult.error.suggestion}`);
          }
        }

        const content: any[] = [{ type: "text" as const, text: lines.join("\n") }];

        const screenshotUrl = captureResult.error?.pageState?.screenshotUrl ?? captureResult.finalState?.screenshotUrl;
        if (screenshotUrl) {
          const img = await fetchScreenshot(screenshotUrl);
          if (img) content.push(img);
        }

        if (captureResult.capturedApi && captureResult.capturedApi.length > 0) {
          content.push({
            type: "text" as const,
            text: "--- capturedApi JSON ---\n" + JSON.stringify(captureResult.capturedApi, null, 2),
          });
        }

        if (!captureResult.ok) return { content, isError: true };
        return { content };
      } catch (e: unknown) {
        return err(`Connection error: ${getErrorMessage(e)}. Is the API running at ${BASE_URL}?`);
      }
    }
  );
}

function formatCapturedApi(lines: string[], capturedApi: any[], params: { outputDir?: string; typed?: boolean }) {
  for (const api of capturedApi) {
    lines.push(`\n━━━ ${api.domain} (${api.baseUrl}) ━━━`);

    const authParts: string[] = [];
    if (api.auth?.authorization) authParts.push(`Authorization: ${api.auth.authorization.slice(0, 30)}...`);
    if (api.auth?.cookies && Object.keys(api.auth.cookies).length > 0) authParts.push(`${Object.keys(api.auth.cookies).length} cookies`);
    if (api.auth?.tokens && Object.keys(api.auth.tokens).length > 0) {
      for (const [k, v] of Object.entries(api.auth.tokens)) {
        authParts.push(`${k}: ${String(v).slice(0, 30)}...`);
      }
    }
    if (authParts.length > 0) {
      lines.push(`\nAuth:`);
      for (const part of authParts) lines.push(`  ${part}`);
    }

    lines.push(`\nEndpoints (${api.endpoints.length}):`);
    for (const ep of api.endpoints) {
      lines.push(`\n  ${ep.method} ${ep.path}`);
      lines.push(`    Status: ${ep.responseStatus}`);
      lines.push(`    Triggered at step: ${ep.triggeredAtStep}`);
      if (ep.rawPaths.length > 1) {
        lines.push(`    Seen paths: ${ep.rawPaths.slice(0, 5).join(", ")}`);
      }
      if (ep.headers && Object.keys(ep.headers).length > 0) {
        lines.push(`    Headers: ${Object.keys(ep.headers).join(", ")}`);
      }
      if (ep.requestBody) {
        const bodyPreview = JSON.stringify(ep.requestBody).slice(0, 200);
        lines.push(`    Request body: ${bodyPreview}${bodyPreview.length >= 200 ? "..." : ""}`);
      }
      if (ep.responseBody) {
        const resPreview = JSON.stringify(ep.responseBody).slice(0, 200);
        lines.push(`    Response: ${resPreview}${resPreview.length >= 200 ? "..." : ""}`);
      }
    }
  }

  const mainDomain = capturedApi[0]?.domain || "api";
  const dir = params.outputDir || `./${mainDomain}`;
  const ext = params.typed ? ".ts" : ".js";
  lines.push(`\n━━━ Save instructions ━━━`);
  lines.push(`Save to: ${dir}`);
  lines.push(`Format: ${ext} files`);
  lines.push(`\nGenerate these files from the capturedApi data:`);
  if (params.typed) {
    lines.push(`  1. auth.ts — export the auth object with a typed interface (AuthConfig)`);
    lines.push(`  2. types.ts — infer TypeScript interfaces from the response bodies (e.g. if response has {id: "123", content: "hi"} → interface Message { id: string; content: string; }). Name types based on the endpoint context.`);
    lines.push(`  3. One .ts file per endpoint — export an async function that calls fetch with the right method, headers (from auth.ts), and body. Use the inferred types for params and return values.`);
    lines.push(`  4. index.ts — re-export all endpoint functions`);
    lines.push(`  5. README.md — endpoint summary and dependency chain`);
  } else {
    lines.push(`  1. auth.js — module.exports the auth object (cookies, tokens, authorization)`);
    lines.push(`  2. One .js file per endpoint — module.exports an async function that calls fetch with the right method, headers (require from auth.js), and body.`);
    lines.push(`  3. index.js — re-export all endpoint functions`);
    lines.push(`  4. README.md — endpoint summary and dependency chain`);
  }
  lines.push(`\nFunction naming: convert paths to camelCase (e.g. GET /api/v9/channels/{id}/messages → getChannelMessages, DELETE /api/v9/channels/{id}/messages/{id2} → deleteChannelMessage).`);
  lines.push(`\nIMPORTANT: Auth data contains real tokens/cookies — they expire. Remind the user.`);
}
