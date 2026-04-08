import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readKnowledge, listKnowledge, clearKnowledge, sanitizeDomain } from "../../lib/knowledge";
import { err, getErrorMessage } from "../helpers";

export function registerKnowledgeTool(server: McpServer) {
  server.tool(
    "knowledge",
    `Per-domain knowledge cache. Call this BEFORE every \`execute\` or \`browse\` on a website — it's orders of magnitude faster than launching a browser when the cache already has what you need.

Each domain's cache is a plain markdown file at ~/.iframer/knowledge/<domain>.md containing:
- Auth mechanism (which cookies / localStorage keys / headers are load-bearing)
- Known API endpoints the site uses (captured from real browser runs)
- Notes about captchas, bot detection, session behavior
- Which browser mode last worked

MANDATORY WORKFLOW — for any task that targets a specific website:

1. Call \`knowledge get <domain>\` first.
2. If the cache shows a direct-API path (auth material + endpoints) that satisfies the request, hit the endpoints directly using the agent's own fetch capability — the session cookies/headers are already injected into the current browser context, and the cache tells you exactly how to call them. Skip the browser entirely.
3. If the cache is empty, outdated, or doesn't cover what you need, fall through to \`execute\` with a pipeline. After \`execute\` succeeds, the cache gets updated automatically — future calls benefit.
4. If cached endpoints return 401/403, the session is stale — run an \`execute\` pipeline containing a \`login\` step to refresh. The cache will be re-verified automatically on success.

Actions:
- get: return the markdown cache for a specific domain
- list: show all cached domains with last-verified timestamps
- clear: delete cache for a specific domain, or everything if domain is omitted`,
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
