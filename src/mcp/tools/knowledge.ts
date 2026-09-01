import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readKnowledge, listKnowledge, clearKnowledge, sanitizeDomain } from "../../lib/knowledge";
import { err, getErrorMessage } from "../helpers";

export function registerKnowledgeTool(server: McpServer) {
  server.tool(
    "knowledge",
    `Per-domain knowledge cache (markdown at ~/.iframer/knowledge/<domain>.md): auth mechanism (load-bearing cookies/headers), captured API endpoints, captcha/bot notes, last working browser mode.

MANDATORY: \`knowledge get <domain>\` BEFORE any execute/browse on a site. If it shows a direct-API path that satisfies the request, call the endpoints directly and SKIP the browser entirely — orders of magnitude cheaper. Empty/stale → fall through to \`execute\` (successful runs update the cache automatically). Cached endpoints returning 401/403 → stale session: run an execute pipeline with a \`login\` step.

Actions: get <domain> · list · clear [domain].`,
    {
      action: z.enum(["get", "list", "clear"]).describe("get: return cache for a domain | list: all cached domains | clear: delete cache"),
      domain: z.string().optional().describe("Domain (required for get; optional for clear — omit to clear everything)"),
    },
    async ({ action, domain }) => {
      try {
        if (action === "list") {
          const entries = listKnowledge();
          if (entries.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No cached knowledge yet. Every successful `execute` run populates the cache for its target domain automatically.",
                },
              ],
            };
          }
          const lines = [`${entries.length} domain${entries.length === 1 ? "" : "s"} cached:\n`];
          for (const e of entries) {
            lines.push(`  ${e.domain}  (${e.lastMode}, verified ${e.lastVerified}, ${e.sizeBytes}B)`);
          }
          lines.push("\nCall `knowledge get <domain>` for the full cache contents.");
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        if (action === "get") {
          if (!domain) return err("domain is required for action=get");
          const md = readKnowledge(domain);
          if (!md) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No cache for ${sanitizeDomain(domain)}. Run \`execute\` with a pipeline that navigates to this domain (and optionally enables captureApi) — the cache will be populated automatically on success.`,
                },
              ],
            };
          }
          return { content: [{ type: "text" as const, text: md }] };
        }

        if (action === "clear") {
          const { removed } = clearKnowledge(domain);
          const scope = domain ? `for ${sanitizeDomain(domain)}` : "(all domains)";
          return {
            content: [
              {
                type: "text" as const,
                text: `Cleared ${removed} cache entr${removed === 1 ? "y" : "ies"} ${scope}.`,
              },
            ],
          };
        }

        return err("Unknown action");
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
