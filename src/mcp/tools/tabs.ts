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
    `List/control tabs in the user's REAL Chrome via the iframer extension (must be installed + paired; returns a connect hint otherwise).

Use when the user references an open tab ("my Gmail tab"). Match by url/title from the returned tabs, then drive that tab with \`execute\` options.mode="extension", options.tabId=<id> (Chrome shows its debug bar during runs). Several matches → ask, don't guess.

Actions: list (default) → {connected, tabs:[{id,title,url,active,windowId}]} · open → new native tab at options.url, returns its id · group / ungroup / update-group / groups → native Chrome tab-group management (title/color/collapsed; groups lists ids).`,
    {
      action: z.enum(["list", "open", "group", "ungroup", "update-group", "groups"]).optional().describe("'list' (default) lists open tabs; 'open' opens a new tab; 'group'/'ungroup' add/remove tabIds to a group; 'update-group' renames/recolors an existing group by groupId; 'groups' lists all groups."),
      url: z.string().optional().describe("With action='open': the URL to open (omit for a blank tab)."),
      active: z.boolean().optional().describe("With action='open': focus the new tab (default true)."),
      tabIds: z.array(z.number()).optional().describe("With action='group': the tab ids to group (must be in the same window)."),
      title: z.string().optional().describe("With action='group': the group's label."),
      color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]).optional().describe("With action='group': the group's color."),
      collapsed: z.boolean().optional().describe("With action='group': collapse the group."),
      groupId: z.number().optional().describe("With action='group': add tabs to this existing group instead of creating a new one."),
      clientId: z.string().optional().describe("With action='open'/'group' and multiple profiles connected: which profile to act in."),
      filter: z
        .string()
        .optional()
        .describe("With action='list': case-insensitive substring to match against tab url or title (e.g. 'gmail', 'github.com'). Omit to list every open tab."),
    },
    async ({ action, url, active, tabIds, title, color, collapsed, groupId, clientId, filter }) => {
      try {
        if (action === "open") {
          const res = (await localApiPost("/extension/tab/create", { url, active, clientId })) as {
            ok?: boolean;
            tab?: ExtensionTab;
            error?: string;
          };
          if (!res.ok || !res.tab) return err(res.error || "Failed to open tab.");
          const t = res.tab;
          return {
            content: [
              {
                type: "text" as const,
                text: `Opened tab [id ${t.id}] ${t.title || t.url}\n${t.url}\nDrive it with: execute mode="extension", tabId=${t.id}.`,
              },
            ],
          };
        }

        if (action === "group") {
          if (!tabIds || tabIds.length === 0) return err("action='group' requires tabIds (array of tab ids).");
          const res = (await localApiPost("/extension/tab/group", { tabIds, title, color, collapsed, groupId, clientId })) as {
            ok?: boolean;
            group?: { groupId: number; title: string; color: string; collapsed: boolean };
            error?: string;
          };
          if (!res.ok || !res.group) return err(res.error || "Failed to group tabs.");
          const g = res.group;
          return {
            content: [
              {
                type: "text" as const,
                text: `Grouped ${tabIds.length} tab(s) into group ${g.groupId}${g.title ? ` "${g.title}"` : ""}${g.color ? ` (${g.color})` : ""}${g.collapsed ? ", collapsed" : ""}.`,
              },
            ],
          };
        }

        if (action === "ungroup") {
          if (!tabIds || tabIds.length === 0) return err("action='ungroup' requires tabIds.");
          const res = (await localApiPost("/extension/tab/ungroup", { tabIds, clientId })) as { ok?: boolean; error?: string };
          if (!res.ok) return err(res.error || "Failed to ungroup tabs.");
          return { content: [{ type: "text" as const, text: `Ungrouped ${tabIds.length} tab(s).` }] };
        }

        if (action === "update-group") {
          if (typeof groupId !== "number") return err("action='update-group' requires groupId (from action='groups'). Pass any of title, color, collapsed.");
          const res = (await localApiPost("/extension/group/update", { groupId, title, color, collapsed, clientId })) as {
            ok?: boolean;
            group?: { groupId: number; title: string; color: string; collapsed: boolean };
            error?: string;
          };
          if (!res.ok || !res.group) return err(res.error || "Failed to update group.");
          const g = res.group;
          return { content: [{ type: "text" as const, text: `Updated group ${g.groupId} → title "${g.title}", color ${g.color}${g.collapsed ? ", collapsed" : ""}.` }] };
        }

        if (action === "groups") {
          const res = (await localApiPost("/extension/groups", { clientId })) as {
            ok?: boolean;
            groups?: Array<{ groupId: number; title: string; color: string; collapsed: boolean; windowId: number }>;
            error?: string;
          };
          if (!res.ok) return err(res.error || "Failed to list groups.");
          const groups = res.groups || [];
          if (groups.length === 0) return { content: [{ type: "text" as const, text: "No tab groups open." }] };
          const lines = [`${groups.length} tab group(s):`, ""];
          for (const g of groups) lines.push(`  [group ${g.groupId}] "${g.title || "(untitled)"}" — ${g.color}${g.collapsed ? ", collapsed" : ""} (window ${g.windowId})`);
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }
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
