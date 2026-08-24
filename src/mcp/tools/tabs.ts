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
  clientId: string;
  profileId?: string;
  profileName?: string;
}

interface ClientInfo {
  clientId: string;
  profileName?: string;
  extVersion?: string;
  tabCount: number;
}

/**
 * List the tabs open in the user's real Chrome (via the extension bridge). This is how the agent satisfies "use my tab HERE and do X": call
 * `tabs`, match the user's reference (a URL, a site name, a screenshot) against
 * the returned list, then pass the chosen tab's id to `execute` with
 * options.mode="extension" and options.tabId.
 */
export function registerTabsTool(server: McpServer) {
  server.tool(
    "tabs",
    `List the tabs currently open in the user's REAL Chrome browser, through the iframer browser extension.

Use this when the user says something like "use my open tab", "the tab I have here", "my Gmail tab", or references a site/screenshot they already have open. Match their reference against the returned tabs (by url or title), pick the tab id, then call \`execute\` with options.mode="extension" and options.tabId=<id> to drive that exact tab on their real logged-in session (Chrome shows its "is being debugged" bar while a run is in progress).

Requires the iframer Chrome extension to be installed and connected (paired once with the token). Once connected, iframer can see and drive any open tab. If nothing is connected, this returns a clear message telling the user how to connect.

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
              "To use your real Chrome tabs:\n" +
              "1. Install the iframer extension (chrome://extensions → Load unpacked → the `extension/` folder).\n" +
              "2. Run `iframer install extension` in a terminal, then restart the browser — the extension pairs itself.\n" +
              "   (Manual fallback: click the iframer icon and paste the token from `cat ~/.iframer/secret`.)\n" +
              "Once the dot is green, run `tabs` again — iframer can then see and drive any open tab.",
          );
        }

        const data = (await localApiPost("/extension/tabs", {})) as {
          ok?: boolean;
          tabs?: ExtensionTab[];
          clients?: ClientInfo[];
        };
        let tabs = data.tabs || [];
        const clients = data.clients || [];
        const multiProfile = clients.length > 1;

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

        const profiles = clients.map((c) => c.profileName || c.clientId.slice(0, 8)).join(", ");
        const ver = clients[0]?.extVersion ? ` [ext v${clients[0].extVersion}]` : "";
        const lines = [
          `Connected: ${clients.length} profile${clients.length > 1 ? "s" : ""}${profiles ? ` (${profiles})` : ""}${ver}.`,
          `${tabs.length} tab${tabs.length > 1 ? "s" : ""}${filter ? ` matching "${filter}"` : ""}:`,
          "",
        ];
        for (const t of tabs) {
          const prof = multiProfile ? `  «${t.profileName || t.clientId.slice(0, 8)}»` : "";
          lines.push(`  [id ${t.id}]${t.active ? " (active)" : ""}${prof} ${t.title}`);
          lines.push(`         ${t.url}`);
          if (multiProfile) lines.push(`         clientId: ${t.clientId}`);
        }
        lines.push("");
        lines.push('To drive one: execute with options.mode="extension", options.tabId=<id>.');
        if (multiProfile) {
          lines.push(
            "Multiple profiles are connected — if two tabs share a title, also pass options.clientId " +
              "(shown as «profile» above maps to a clientId) so the right profile is driven.",
          );
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e: unknown) {
        return err(`Error listing tabs: ${getErrorMessage(e)}`);
      }
    },
  );
}
