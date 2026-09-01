import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { err, getErrorMessage } from "../helpers";
import { clipboardRead, clipboardWrite } from "../../lib/clipboard";

/**
 * clipboard — read/write the machine's clipboard.
 *
 * iframer runs on the same machine as the user's Chrome, so the OS clipboard it
 * touches IS the one Chrome pastes from. This is the practical answer to
 * "clipboard permission": no page grant is possible via the extension, but the
 * real needs — paste a value into a field, or read what a page copied — are
 * covered here with zero permission prompts.
 *
 *   - set: put text on the clipboard.
 *   - get: read the current clipboard text (e.g. a code/link a site just copied).
 *
 * To PASTE the clipboard INTO a page field, use the `paste` execute step (it
 * inserts via CDP Input.insertText — reliable, unlike ⌘V, whose modifier the
 * extension relay ignores).
 */

export function registerClipboardTool(server: McpServer) {
  server.tool(
    "clipboard",
    `Read/write the machine's clipboard (the same one the user's Chrome uses). get → read what a site copied (codes, links); set <text> → write. To paste INTO a page field use the \`paste\` execute step, not a ⌘V keyboard step (the extension relay ignores modifier keys).`,
    {
      action: z.enum(["get", "set"]).describe("get: read clipboard text | set: write text to clipboard"),
      text: z.string().optional().describe("With action='set': the text to put on the clipboard."),
    },
    async ({ action, text }) => {
      try {
        if (action === "set") {
          if (text === undefined) return err("action='set' requires `text`.");
          await clipboardWrite(text);
          return { content: [{ type: "text" as const, text: `Clipboard set (${text.length} chars). To paste into a field, use the \`paste\` execute step.` }] };
        }
        const value = await clipboardRead();
        return { content: [{ type: "text" as const, text: value.length ? value : "(clipboard is empty)" }] };
      } catch (e: unknown) {
        return err(`clipboard failed: ${getErrorMessage(e)}`);
      }
    },
  );
}
