import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, getIframer, isDockerRunning, err, getErrorMessage, IFRAMER_MODE, LOCAL_USER, LOCAL_TOKEN } from "../helpers";

export function registerBrowseTool(server: McpServer) {
  server.tool(
    "browse",
    `Fetch a web page with a headless browser. Use for pages that need JavaScript rendering but don't have bot detection walls. Session cookies persist across calls.`,
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
        const dockerRunning = await isDockerRunning();
        const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

        let fetchResult: any;
        if (useLocal) {
          const iframer = await getIframer();
          fetchResult = await iframer.fetch(LOCAL_USER, LOCAL_TOKEN, params as any);
        } else {
          fetchResult = await apiPost("/fetch", params);
        }

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
