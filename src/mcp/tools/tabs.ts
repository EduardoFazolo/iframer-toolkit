import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { localApiPost, localApiGet, err, getErrorMessage } from "../helpers";

interface ExtensionTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
  favIconUrl?: string;
}

/**
 * List the tabs open in the user's real Chrome (via the banner-free extension
 * bridge). This is how the agent satisfies "use my tab HERE and do X": call
 * `tabs`, match the user's reference (a URL, a site name, a screenshot) against
 * the returned list, then pass the chosen tab's id to `execute` with
 * options.mode="extension" and options.tabId.
 */
export function registerTabsTool(server: McpServer) {
  server.tool(
    "tabs",
    `List the tabs currently open in the user's REAL Chrome browser, through the iframer browser extension.

Use this when the user says something like "use my open tab", "the tab I have here", "my Gmail tab", or references a site/screenshot they already have open. Match their reference against the returned tabs (by url or title), pick the tab id, then call \`execute\` with options.mode="extension" and options.tabId=<id> to drive that exact tab — banner-free, on their real logged-in session.

Requires the iframer Chrome extension to be installed and connected (the user clicks its icon on the tab they want to allow). If nothing is connected, this returns a clear message telling the user how to connect.

Returns: connected (bool), and tabs: [{ id, title, url, active, windowId }]. If several tabs match the user's reference, ask them which one rather than guessing.`,
    {
      filter: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring to match against tab url or title (e.g. 'gmail', 'github.com'). Omit to list every open tab."),
    },
    async ({ filter }) => {
      try {
        // Cheap connectivity probe first, so we can give a precise nudge.
        const status = (await localApiGet("/extension/status")) as {
          ok?: boolean;
          connected?: boolean;
        };
        if (!status.connected) {
          return err(
            "No iframer extension is connected.\n\n" +
              "To use your real Chrome tab:\n" +
              "1. Install the iframer extension (chrome://extensions → Load unpacked → the `extension/` folder).\n" +
              "2. Click the iframer icon and paste your pairing token (from `cat ~/.iframer/secret` or your IFRAMER_SECRET).\n" +
              "3. Open the tab you want, click the iframer icon, and press 'Allow this tab'.\n" +
              "Then run `tabs` again.",
          );
        }

        const data = (await localApiPost("/extension/tabs", {})) as {
          ok?: boolean;
          tabs?: ExtensionTab[];
        };
        let tabs = data.tabs || [];

        if (filter) {
          const f = filter.toLowerCase();
          tabs = tabs.filter(
            (t) => t.url.toLowerCase().includes(f) || (t.title || "").toLowerCase().includes(f),
          );
        }

        if (tabs.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: filter
                  ? `Extension connected, but no open tab matches "${filter}".`
                  : "Extension connected, but no tabs were reported.",
              },
            ],
          };
        }

        const lines = [`Connected. ${tabs.length} tab${tabs.length > 1 ? "s" : ""}${filter ? ` matching "${filter}"` : ""}:`, ""];
        for (const t of tabs) {
          lines.push(`  [id ${t.id}]${t.active ? " (active)" : ""} ${t.title}`);
          lines.push(`         ${t.url}`);
        }
        lines.push("");
        lines.push('To drive one: execute with options.mode="extension", options.tabId=<id>.');

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e: unknown) {
        return err(`Error listing tabs: ${getErrorMessage(e)}`);
      }
    },
  );
}
