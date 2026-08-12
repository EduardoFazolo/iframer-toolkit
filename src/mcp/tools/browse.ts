import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchResult } from "../../lib/types";
import { localApiPost, err, getErrorMessage } from "../helpers";

export function registerBrowseTool(server: McpServer) {
  server.tool(
    "browse",
    `Fetch a web page with a headless browser. Use for pages that need JavaScript rendering but don't have bot detection walls. Session cookies and stored credentials persist across calls via the single local SQLite store.

PRE-FLIGHT: Call \`knowledge get <domain>\` first. If the cache shows a direct-API path for the data you need, skip this tool and hit the endpoints directly — it's orders of magnitude faster.`,
    {
      url: z.string().describe("URL to navigate to"),
      extract: z.string().optional().describe("JavaScript expression to evaluate (e.g. 'document.title')"),
      actions: z.array(z.object({
        type: z.enum(["click", "fill", "wait", "scroll", "human-click", "human-type"]),
        selector: z.string().optional(),
        value: z.string().optional(),
        ms: z.number().optional(),
      })).optional().describe("Actions to execute before extracting"),
      returnHtml: z.boolean().optional().describe("Return full page HTML"),
      waitForSelector: z.string().optional().describe("Wait for this CSS selector before proceeding"),
      sessionless: z.boolean().optional().describe("Skip session persistence"),
    },
    async (params) => {
      try {
        const fetchResult = await localApiPost<FetchResult>("/fetch", params);
        if (!fetchResult.ok) return err(`Error: ${fetchResult.error}`);
        const { html, ...rest } = fetchResult;
        const text = html
          ? JSON.stringify(rest, null, 2) + "\n\n--- HTML ---\n" + html
          : JSON.stringify(rest, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
