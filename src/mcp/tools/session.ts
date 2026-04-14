import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { localApiPost, localApiDelete, apiPost, isDockerRunning, err, getErrorMessage, localServer } from "../helpers";

export function registerSessionTool(server: McpServer) {
  server.tool(
    "session",
    `Manage the browser session and lifecycle.

Actions:
- **stop**: save cookies/localStorage to the store, then close the browser. Session data persists for the next run.
- **clear**: wipe all stored session data (cookies/localStorage) from the database. Does NOT kill running browsers.
- **restart**: kill all running browser instances (local + Docker) and reset state. The next \`execute\` call will launch a fresh browser automatically. Use this when the browser is frozen, crashed, or in a bad state. Credentials and knowledge cache are NOT affected.

Sessions live in the single local SQLite database (~/.iframer/iframer.db), shared across every browser mode.`,
    {
      action: z.enum(["stop", "clear", "restart"]).describe("stop: save session state + close browser | clear: wipe stored session data | restart: kill all browsers, fresh start on next execute"),
    },
    async ({ action }) => {
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

        return err("Unknown action");
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
