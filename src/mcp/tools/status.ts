import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BASE_URL, apiGet, detectAvailableModes, getIframer, err, getErrorMessage, LOCAL_USER } from "../helpers";

export function registerStatusTool(server: McpServer) {
  server.tool(
    "status",
    `Get the full state of iframer in one call. Call this first. Returns: available browser modes, API health, active session, stored credentials, and domain memory.`,
    {},
    async () => {
      try {
        const status: { modes: Record<string, Record<string, unknown>>; api: boolean; session: unknown; credentials: string[]; domainMemory: unknown } = { modes: {}, api: false, session: null, credentials: [], domainMemory: null };

        status.modes = await detectAvailableModes();

        try {
          const health = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
          const healthCheck = await health.json() as { ok?: boolean };
          status.api = healthCheck.ok === true;
        } catch {
          status.api = false;
        }

        if (status.api) {
          try {
            const sessionData = await apiGet<{ active?: boolean; noVncUrl?: string; createdAt?: string; url?: string }>("/interactive/status");
            status.session = sessionData.active
              ? { active: true, noVncUrl: sessionData.noVncUrl, createdAt: sessionData.createdAt, url: sessionData.url }
              : { active: false };
          } catch {}
        }

        // Credentials live in the single local SQLite database — NEVER read from
        // the Docker container. The Docker API has its own stale credential store
        // that doesn't reflect reality. Credentials are host-local, shared across
        // every browser mode (headless, binary-headful, docker-headful) via the
        // login step which always reads from ~/.iframer/iframer.db.
        try {
          const iframer = await getIframer();
          status.credentials = await iframer.listCredentials(LOCAL_USER);
        } catch {}

        try {
          const { DomainModeStore } = await import("../../lib/domain-modes");
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
