import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { localApiGet, apiGet, isDockerRunning, err, getErrorMessage } from "../helpers";
import { DomainModeStore } from "../../lib/domain-modes";

export function registerStatusTool(server: McpServer) {
  server.tool(
    "status",
    `Get the full state of iframer in one call. Call this first. Returns: available browser modes, API health, active session, stored credentials, and domain memory.`,
    {},
    async () => {
      try {
        const status: Record<string, unknown> = {};

        // Docker health
        const dockerRunning = await isDockerRunning();
        status.dockerApi = dockerRunning;

        // Local server health + modes
        try {
          const localHealth = await localApiGet<{ ok: boolean }>("/health");
          status.localServer = localHealth.ok;
        } catch {
          status.localServer = false;
        }

        try {
          const browserHealth = await localApiGet<{ ok: boolean; alive: boolean; modes: string[] }>("/browser/health");
          status.browserAlive = browserHealth.alive;
          status.runningModes = browserHealth.modes;
        } catch {}

        // Docker session (if running)
        if (dockerRunning) {
          try {
            const sessionData = await apiGet<{ active?: boolean; noVncUrl?: string }>("/interactive/status");
            status.dockerSession = sessionData.active
              ? { active: true, noVncUrl: sessionData.noVncUrl }
              : { active: false };
          } catch {}
        }

        // Credentials from local store
        try {
          const credData = await localApiGet<{ ok: boolean; domains?: string[] }>("/credentials");
          status.credentials = credData.domains || [];
        } catch {
          status.credentials = [];
        }

        // Domain mode memory (filesystem read, no browser dependency)
        try {
          const domainModes = new DomainModeStore();
          status.domainMemory = domainModes.getSummary();
        } catch {}

        return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
