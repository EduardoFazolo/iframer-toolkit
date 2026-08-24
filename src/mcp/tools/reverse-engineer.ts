import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PipelineResult, CapturedApi, CapturedEndpoint, ApiProtocol } from "../../lib/types";
import { localApiPost, apiPost, isDockerRunning, resolveScreenshotPath, err, getErrorMessage } from "../helpers";
import { stepSchema } from "./step-schema";

type TextContent = { type: "text"; text: string };

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
3. Returns structured data per domain: shared auth + endpoints classified by protocol (rest, graphql, json-rpc, grpc-web, form-rpc, soap) with method, path, action, verb, headers, body, response, curl

IMPORTANT — one request ≠ one endpoint. Each endpoint has (protocol, action):
- REST: action = "METHOD /parameterized/path". Verb from HTTP method.
- GraphQL: action = operationName (or doc_id for persisted queries). Many ops share the single /graphql URL — EACH operation is its own endpoint.
- JSON-RPC: action = body.method (e.g. eth_getBalance, user.list).
- gRPC-web: action = request path.
- Form-RPC (FB-style urlencoded): action = fb_api_req_friendly_name / doc_id.
- SOAP: action = SOAPAction header.

Generate ONE function per (protocol, action). Do NOT merge different GraphQL operations into one function just because they share the URL.

Output layout — save as RUNNABLE CODE to <outputDir>/:
  auth.{js,ts}                  — shared cookies, tokens, authorization
  transport/
    rest.{js,ts}                — shared REST helper (only if any rest endpoints)
    graphql.{js,ts}             — shared GraphQL client: post(operationName|docId, variables)
    jsonRpc.{js,ts}             — shared JSON-RPC client (if any)
    grpc.{js,ts}                — shared gRPC-web client (if any)
  <protocol>/<verb>/<functionName>.{js,ts}
    e.g. graphql/queries/getTimelineFeed.ts
         graphql/mutations/reactToPost.ts
         rest/read/getChannelMessages.ts
         rest/create/createMessage.ts
         jsonRpc/ethGetBalance.ts
  index.{js,ts}                 — re-exports all endpoint functions
  types.ts                      — (typed mode only) inferred interfaces from responses
  README.md                     — endpoints grouped by protocol + verb, dependency chain, auth expiry warning

Use capturedApi[i].endpoints[j].protocol, .action, .verb, .functionName directly — iframer already classified them. Put queries (verb=read|list) under queries/, mutations (verb=create|update|delete|action) under mutations/ for GraphQL. For REST, group by verb dir.

The outputDir defaults to ./<domain>/. Ask the user where to save if unclear.`,
    {
      steps: z.array(stepSchema).describe("Pipeline steps to execute while capturing API calls"),
      outputDir: z.string().optional().describe("Directory to save the captured API files. If not provided, ask the user or default to ./<domain>/"),
      typed: z.boolean().optional().describe("Save as .ts with inferred types instead of .js. Set to true when the user asks for types, typescript, or type inference."),
      options: z.object({
        staleTimeoutMs: z.number().optional().describe("Override the 20s stale-state timeout per step"),
        continueOnObstacle: z.boolean().optional().describe("Try to auto-resolve obstacles (default: true)"),
        continueOnError: z.boolean().optional().describe("Continue past failing steps (default: false)"),
        mode: z.enum(["headless", "binary-headful", "docker-headful", "extension"]).optional().describe("Browser mode override. Use 'extension' to capture the API of a tab already open in the user's real Chrome — requires options.tabId from the `tabs` tool. Chrome shows its 'is being debugged' bar while the capture runs."),
        tabId: z.number().optional().describe("Only with mode='extension': the real Chrome tab to reverse-engineer (from the `tabs` tool)."),
        clientId: z.string().optional().describe("Only with mode='extension', when multiple profiles are connected and the tab is ambiguous: the owning profile's clientId (from the `tabs` tool)."),
      }).optional(),
    },
    async (params) => {
      try {
        const execParams = {
          steps: params.steps,
          options: { ...params.options, captureApi: true },
        };
        // Route through Docker only for docker-headful mode, local server for everything else
        const mode = params.options?.mode;
        const dockerRunning = await isDockerRunning();
        let captureResult: PipelineResult;
        if (mode === "extension") {
          if (typeof params.options?.tabId !== "number") {
            return err("mode='extension' requires options.tabId. Call the `tabs` tool first to find the tab to reverse-engineer.");
          }
          captureResult = await localApiPost<PipelineResult>("/extension/execute", {
            tabId: params.options.tabId,
            clientId: params.options.clientId,
            steps: params.steps,
            options: { ...params.options, captureApi: true },
          });
        } else if (mode === "docker-headful" && dockerRunning) {
          captureResult = await apiPost<PipelineResult>("/execute", execParams);
        } else {
          captureResult = await localApiPost<PipelineResult>("/execute", execParams);
        }

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

        const screenshotUrl = captureResult.error?.pageState?.screenshotUrl ?? captureResult.finalState?.screenshotUrl;
        if (screenshotUrl) {
          const filePath = await resolveScreenshotPath(screenshotUrl);
          if (filePath) {
            lines.push(`\nScreenshot saved: ${filePath}`);
            lines.push("Use the Read tool on the path above to view the screenshot.");
          }
        }

        // Save the FULL capturedApi JSON to disk so humans/agents can read it
        // via Bash/python later. NEVER inline the full JSON in the MCP response
        // — FB endpoints alone can be 8KB each, and a walk with 30 endpoints
        // would dump 240KB into the agent's context window.
        if (captureResult.capturedApi && captureResult.capturedApi.length > 0) {
          const mainDomain = captureResult.capturedApi[0]?.domain || "api";
          const outDir = params.outputDir || `./${mainDomain}`;
          try {
            const fs = await import("fs");
            const path = await import("path");
            fs.mkdirSync(outDir, { recursive: true });
            const jsonPath = path.join(outDir, "captured-api.json");
            fs.writeFileSync(jsonPath, JSON.stringify(captureResult.capturedApi, null, 2));
            lines.push(`\nFull captured data saved to: ${jsonPath}`);
            lines.push("Read this file for complete curl commands, request/response bodies, and auth data.");
          } catch (writeErr) {
            lines.push(`\n(Could not save captured JSON: ${writeErr instanceof Error ? writeErr.message : String(writeErr)})`);
          }
        }

        let text = lines.join("\n");
        // Hard cap the inline response. Full data is always on disk at the
        // captured-api.json path, so truncation never loses anything — it just
        // keeps a huge capture from flooding the agent's context. 30KB (~7.5k
        // tokens) is plenty for the endpoint index + scaffolding instructions.
        if (text.length > 30_000) {
          text = text.slice(0, 30_000) + "\n\n[... index truncated — read captured-api.json for the full endpoint list and all detail]";
        }
        const content: TextContent[] = [{ type: "text", text }];
        if (!captureResult.ok) return { content, isError: true };
        return { content };
      } catch (e: unknown) {
        return err(`Connection error: ${getErrorMessage(e)}. Try \`session restart\` and retry.`);
      }
    }
  );
}

export function formatCapturedApi(lines: string[], capturedApi: CapturedApi[], params: { outputDir?: string; typed?: boolean }) {
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

    const byProtocol = new Map<ApiProtocol, CapturedEndpoint[]>();
    for (const ep of api.endpoints) {
      const p = ep.protocol || "rest";
      if (!byProtocol.has(p)) byProtocol.set(p, []);
      byProtocol.get(p)!.push(ep);
    }
    const protocolSummary = Array.from(byProtocol.entries()).map(([p, eps]) => `${p}=${eps.length}`).join(", ");
    // Compact one line per endpoint. The FULL detail (curl, request/response
    // bodies, all params, auth) is written to captured-api.json below — inlining
    // multi-line blocks per endpoint used to dump thousands of tokens the agent
    // rarely needed. One line carries what's needed to pick an endpoint; read
    // the file (or grep it) for the rest.
    lines.push(`\nEndpoints (${api.endpoints.length}) [${protocolSummary}] — full detail in captured-api.json:`);
    for (const ep of api.endpoints) {
      const params = ep.requestBody ? extractSignalKeys(ep.requestBody as Record<string, unknown>) : null;
      const tail = params ? `  {${params}}` : "";
      lines.push(`  [${ep.protocol}/${ep.verb}] ${ep.method} ${ep.path} → ${ep.functionName}${tail}`);
    }
  }

  const mainDomain = capturedApi[0]?.domain || "api";
  const dir = params.outputDir || `./${mainDomain}`;
  const ext = params.typed ? ".ts" : ".js";
  lines.push(`\n━━━ Save instructions ━━━`);
  lines.push(`Save to: ${dir}`);
  lines.push(`Format: ${ext} files`);

  const protocolsSeen = new Set<string>();
  for (const api of capturedApi) for (const ep of api.endpoints) protocolsSeen.add(ep.protocol);

  lines.push(`\nLayout (protocols present: ${Array.from(protocolsSeen).join(", ")}):`);
  lines.push(`  auth${ext}`);
  if (protocolsSeen.has("rest")) lines.push(`  transport/rest${ext}            — shared fetch wrapper with auth headers`);
  if (protocolsSeen.has("graphql")) lines.push(`  transport/graphql${ext}         — post(operationName|docId, variables) → shared GraphQL client`);
  if (protocolsSeen.has("json-rpc")) lines.push(`  transport/jsonRpc${ext}         — shared JSON-RPC client`);
  if (protocolsSeen.has("grpc-web")) lines.push(`  transport/grpc${ext}            — shared gRPC-web client`);
  if (protocolsSeen.has("form-rpc")) lines.push(`  transport/formRpc${ext}         — shared urlencoded RPC client`);
  if (protocolsSeen.has("soap")) lines.push(`  transport/soap${ext}            — shared SOAP client`);
  lines.push(`  <protocol>/<verb>/<functionName>${ext}  — one file per endpoint, uses shared transport`);
  lines.push(`    e.g. graphql/queries/<fn>${ext}, graphql/mutations/<fn>${ext}, rest/read/<fn>${ext}, rest/create/<fn>${ext}`);
  lines.push(`  index${ext}                         — re-export all endpoint functions`);
  if (params.typed) lines.push(`  types.ts                         — interfaces inferred from response bodies`);
  lines.push(`  README.md                        — endpoints grouped by protocol + verb, auth expiry warning`);

  lines.push(`\nRules:`);
  lines.push(`  - One function per (protocol, action). Use the functionName field verbatim for the file + export name.`);
  lines.push(`  - verb=read|list → queries/ (GraphQL) or read/ (REST). verb=create|update|delete|action → mutations/ (GraphQL) or verb dir (REST).`);
  lines.push(`  - Each endpoint file is minimal: import transport + auth, call transport with the action id, pass variables, return typed result.`);
  lines.push(`  - GraphQL transport signature: post(opNameOrDocId: string, variables: object). Pick doc_id when present in captured body, else operationName.`);
  lines.push(`  - Do NOT inline auth headers per endpoint — they live in auth${ext} and the transport reads them.`);
  lines.push(`\nIMPORTANT: Auth data contains real tokens/cookies — they expire. Remind the user.`);
}

/** Extract only the meaningful parameter keys from a request body, skipping
 *  framework noise (__csr, __hsdp, __hblp, __dyn, __a, __spin_*, lsd, fb_dtsg, etc.).
 *  Returns a compact string like "doc_id, variables={comment_id,feedback_id}" or null. */
function extractSignalKeys(body: Record<string, unknown>): string | null {
  const NOISE = new Set([
    "__csr", "__hsdp", "__hblp", "__dyn", "__a", "__req", "__hs",
    "__comet_req", "__ccg", "__spin_r", "__spin_b", "__spin_t",
    "__jssesw", "lsd", "fb_dtsg", "fb_api_caller_class",
    "fb_api_req_friendly_name", "jazoest", "server_timestamps",
    "__s", "__user", "dpr", "__rev",
  ]);

  const signalEntries: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (NOISE.has(k)) continue;
    if (typeof v === "string" && v.length > 80) {
      signalEntries.push(`${k}=${v.slice(0, 40)}...`);
    } else if (Array.isArray(v)) {
      // e.g. multipart `fields: ["token","channel","limit",…]` — show the
      // VALUES (the actual param names), not array indices.
      const items = v.slice(0, 8).map((x) => String(x)).join(",");
      signalEntries.push(`${k}=[${items}${v.length > 8 ? ",…" : ""}]`);
    } else if (typeof v === "object" && v !== null) {
      const keys = Object.keys(v).slice(0, 5).join(",");
      signalEntries.push(`${k}={${keys}${Object.keys(v).length > 5 ? ",..." : ""}}`);
    } else {
      signalEntries.push(`${k}=${String(v).slice(0, 40)}`);
    }
  }
  return signalEntries.length > 0 ? signalEntries.join(", ") : null;
}
