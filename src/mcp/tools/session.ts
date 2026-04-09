import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getIframer, err, getErrorMessage, LOCAL_USER, LOCAL_TOKEN } from "../helpers";

export function registerSessionTool(server: McpServer) {
  server.tool(
    "session",
    `Manage the browser session lifecycle. Use action=stop when done to save cookies/localStorage for future use. Use action=clear to wipe all stored session data.

Sessions live in the single local SQLite database (~/.iframer/iframer.db) and are shared across every browser mode (headless, binary-headful, docker-headful). There is no separate Docker-side session store.`,
    {
      action: z.enum(["stop", "clear"]).describe("stop: end session and save state | clear: delete all stored session data"),
    },
    async ({ action }) => {
      try {
        // Sessions are host-local, NEVER routed through the Docker API.
        // See status.ts / credentials.ts for the same pattern — the Docker
        // container no longer owns any state, only browser execution.
        const iframer = await getIframer();

        if (action === "stop") {
          const stopResult = await iframer.stopSession(LOCAL_USER, LOCAL_TOKEN);
          return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${stopResult.sessionSaved}` }] };
        } else {
          await iframer.clearSession(LOCAL_USER);
          return { content: [{ type: "text" as const, text: "Session data cleared." }] };
        }
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
