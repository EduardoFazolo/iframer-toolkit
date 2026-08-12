import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import fs from "fs";
import type { CapturedApi } from "../../lib/types";
import { localApiPost, localApiDelete, apiPost, isDockerRunning, err, getErrorMessage, localServer } from "../helpers";
import { formatCapturedApi } from "./reverse-engineer";
import { getDataDir } from "../../lib/paths";

/** Cookie shape as returned by the browser context over the HTTP boundary. */
interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}
type OriginStore = Record<string, Record<string, string>>;

export function registerSessionTool(server: McpServer) {
  server.tool(
    "session",
    `Manage the browser session and lifecycle.

Actions:
- **stop**: save cookies/localStorage to the store, then close the browser. Session data persists for the next run.
- **clear**: wipe all stored session data (cookies/localStorage) from the database. Does NOT kill running browsers.
- **restart**: kill all running browser instances (local + Docker) and reset state. The next \`execute\` call will launch a fresh browser automatically. Use this when the browser is frozen, crashed, or in a bad state. Credentials and knowledge cache are NOT affected.
- **capture-start**: attach a persistent XHR/fetch listener to the running browser. Accumulates ALL requests indefinitely — not tied to any pipeline. Use before triggering the action you want to capture (e.g. upload, delete, async mutation).
- **capture-stop**: stop the persistent listener and return all captured endpoints + save to disk. Call this when you're satisfied you've seen the requests you need.
- **get-cookies**: extract ALL cookies from the browser context via CDP (including HttpOnly/Secure — below the JS sandbox). Pass urls to scope. Returns name, value, domain, path, httpOnly, secure, expiry.
- **get-auth**: extract cookies + localStorage + sessionStorage in one shot. Everything needed to replay authenticated requests from Node.js.

Sessions live in the single local SQLite database (~/.iframer/iframer.db), shared across every browser mode.`,
    {
      action: z.enum(["stop", "clear", "restart", "capture-start", "capture-stop", "get-cookies", "get-auth"]).describe("stop | clear | restart | capture-start | capture-stop | get-cookies | get-auth"),
      mode: z.enum(["headless", "binary-headful"]).optional().describe("Browser mode (default: binary-headful)"),
      urls: z.array(z.string()).optional().describe("URLs to scope cookie extraction (get-cookies/get-auth). Omit for all cookies."),
      instanceId: z.string().optional().describe("Target a named parallel browser within this session (default: 'default'). Match the instanceId used in execute."),
      outputDir: z.string().optional().describe("Where to save captured-api.json for capture-stop"),
    },
    async ({ action, mode, urls, instanceId, outputDir }) => {
      try {
        if (action === "stop") {
          const result = await localApiPost<{ ok: boolean; sessionSaved?: boolean }>("/interactive/stop").catch(() => ({ ok: true, sessionSaved: false }));
          return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${result.sessionSaved ?? false}` }] };
        }

        if (action === "clear") {
          await localApiDelete("/session").catch(() => {});
          return { content: [{ type: "text" as const, text: "Session data cleared from database." }] };
        }

        if (action === "restart") {
          // Restart local background server (kills browsers, spawns fresh process)
          const parts: string[] = [];
          try {
            await localApiPost("/browser/restart");
            parts.push("Local browser restarted.");
          } catch {
            // Server might be dead — restart the whole process
            try {
              await localServer.restart();
              parts.push("Local server respawned.");
            } catch (e: unknown) {
              parts.push(`Local restart failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          // Also restart Docker browser if available
          try {
            if (await isDockerRunning()) {
              await apiPost("/browser/restart");
              parts.push("Docker browser restarted.");
            }
          } catch {}

          parts.push("Credentials and knowledge cache are untouched. Next execute launches a fresh browser.");
          return { content: [{ type: "text" as const, text: parts.join(" ") }] };
        }

        if (action === "capture-start") {
          const result = await localApiPost<{ ok: boolean; message: string }>("/capture/start", { mode: mode ?? "binary-headful", instanceId });
          return { content: [{ type: "text" as const, text: result.message }] };
        }

        if (action === "capture-stop") {
          const result = await localApiPost<{ ok: boolean; capturedApi: CapturedApi[]; message: string }>("/capture/stop", { mode: mode ?? "binary-headful", instanceId });
          const lines: string[] = [result.message];

          if (result.capturedApi && result.capturedApi.length > 0) {
            formatCapturedApi(lines, result.capturedApi, { outputDir, typed: false });

            // Save to disk
            const outDir = outputDir || path.join(getDataDir(), "capture");
            try {
              fs.mkdirSync(outDir, { recursive: true });
              const jsonPath = path.join(outDir, "captured-api.json");
              fs.writeFileSync(jsonPath, JSON.stringify(result.capturedApi, null, 2));
              lines.push(`\nFull data saved to: ${jsonPath}`);
            } catch (writeErr) {
              lines.push(`\n(Could not save: ${writeErr instanceof Error ? writeErr.message : String(writeErr)})`);
            }
          }

          let text = lines.join("\n");
          if (text.length > 80_000) text = text.slice(0, 80_000) + "\n\n[truncated — read captured-api.json]";
          return { content: [{ type: "text" as const, text }] };
        }

        if (action === "get-cookies") {
          const result = await localApiPost<{ ok: boolean; cookies: BrowserCookie[]; message: string }>("/auth/cookies", { mode: mode ?? "binary-headful", urls, instanceId });
          const lines = [result.message, ""];
          for (const c of result.cookies) {
            lines.push(`${c.name}=${c.value}  [domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} secure=${c.secure}]`);
          }
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        if (action === "get-auth") {
          const result = await localApiPost<{ ok: boolean; cookies: BrowserCookie[]; localStorage: OriginStore; sessionStorage: OriginStore; message: string }>("/auth/full", { mode: mode ?? "binary-headful", urls, instanceId });
          const lines = [result.message, ""];
          lines.push("=== Cookies ===");
          for (const c of result.cookies) {
            lines.push(`${c.name}=${c.value}  [domain=${c.domain} httpOnly=${c.httpOnly}]`);
          }
          if (Object.keys(result.localStorage || {}).length > 0) {
            lines.push("\n=== localStorage ===");
            for (const [origin, store] of Object.entries(result.localStorage as Record<string, Record<string, string>>)) {
              lines.push(`[${origin}]`);
              for (const [k, v] of Object.entries(store)) {
                const val = String(v);
                lines.push(`  ${k}: ${val.length > 120 ? val.slice(0, 120) + "…" : val}`);
              }
            }
          }
          if (Object.keys(result.sessionStorage || {}).length > 0) {
            lines.push("\n=== sessionStorage ===");
            for (const [origin, store] of Object.entries(result.sessionStorage as Record<string, Record<string, string>>)) {
              lines.push(`[${origin}]`);
              for (const [k, v] of Object.entries(store)) {
                const val = String(v);
                lines.push(`  ${k}: ${val.length > 120 ? val.slice(0, 120) + "…" : val}`);
              }
            }
          }
          let text = lines.join("\n");
          if (text.length > 80_000) text = text.slice(0, 80_000) + "\n[truncated]";
          return { content: [{ type: "text" as const, text }] };
        }

        return err("Unknown action");
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
