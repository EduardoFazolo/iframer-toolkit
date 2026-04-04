import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiDelete, getIframer, isDockerRunning, err, getErrorMessage, IFRAMER_MODE, LOCAL_USER, LOCAL_TOKEN } from "../helpers";

export function registerSessionTool(server: McpServer) {
  server.tool(
    "session",
    `Manage the browser session lifecycle. Use action=stop when done to save cookies/localStorage for future use. Use action=clear to wipe all stored session data.`,
    {
      action: z.enum(["stop", "clear"]).describe("stop: end session and save state | clear: delete all stored session data"),
    },
    async ({ action }) => {
      try {
        const dockerRunning = await isDockerRunning();
        const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

        if (action === "stop") {
          if (useLocal) {
            const iframer = await getIframer();
            const stopResult = await iframer.stopSession(LOCAL_USER, LOCAL_TOKEN);
            return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${stopResult.sessionSaved}` }] };
          }
          const stopResult = await apiPost<{ ok: boolean; error?: string; sessionSaved?: boolean }>("/interactive/stop");
          if (!stopResult.ok) return err(`Error: ${stopResult.error}`);
          return { content: [{ type: "text" as const, text: `Session stopped. State saved: ${stopResult.sessionSaved}` }] };
        } else {
          if (useLocal) {
            const iframer = await getIframer();
            await iframer.clearSession(LOCAL_USER);
            return { content: [{ type: "text" as const, text: "Session data cleared." }] };
          }
          const clearResult = await apiDelete<{ ok: boolean; error?: string }>("/session");
          if (!clearResult.ok) return err(`Error: ${clearResult.error}`);
          return { content: [{ type: "text" as const, text: "Session data cleared." }] };
        }
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
