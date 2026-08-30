import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { err, getErrorMessage } from "../helpers";
import {
  loadComponentMap,
  saveAnchor,
  removeAnchor,
  setDomainQuirks,
  listAnchorDomains,
} from "../../lib/knowledge/component-map";

/**
 * `remember` — the durable component map for a website's UI.
 *
 * snapshot/find locate elements live but forget them the moment the run ends.
 * This tool promotes the ones that matter into persisted, per-domain ANCHORS so
 * the next run skips the search. Reference a saved anchor in ANY selector field
 * as `@a:<name>` (e.g. click `@a:send-button`). Anchors self-heal: each use is
 * scored, so a stale one shows a high fail count — re-locate it and save again.
 */
export function registerRememberTool(server: McpServer) {
  server.tool(
    "remember",
    `Persisted per-domain map of a site's UI elements ("anchors") — recall where things are instead of re-exploring the DOM each run.

(1) Before a UI task: \`remember get <domain>\`; an existing anchor is targeted as @a:<name> in any execute selector — no snapshot needed. (2) A newly discovered selector that worked → \`remember save\` it (prefer stable selectors: aria-label, data-qa, role+name). (3) SELF-HEAL: if @a:<name> fails, the page changed — re-discover with snapshot/find and \`remember save\` the new selector; do NOT retry the stale one. (4) \`remember quirk\` records site-wide gotchas ("synthetic clicks ignored — use trusted"); \`get\` surfaces them.`,
    {
      action: z.enum(["get", "save", "forget", "list", "quirk"]).describe("get: show a domain's anchors+quirks | save: create/overwrite an anchor | forget: delete an anchor | list: all domains with anchors | quirk: add site-wide quirk note(s)"),
      domain: z.string().optional().describe("Site domain, e.g. 'slack.com' or 'app.slack.com' (required for all actions except list)."),
      name: z.string().optional().describe("Anchor name for save/forget, e.g. 'composer', 'send-button', 'search'. Short, stable, kebab-case."),
      selector: z.string().optional().describe("With save: the CSS selector that locates the element. Prefer stable attributes: [aria-label=...], [data-qa=...], role+name. Avoid brittle generated class chains."),
      role: z.string().optional().describe("With save (optional): the element role, e.g. textbox, button, link."),
      description: z.string().optional().describe("With save (optional): a short human note about the element."),
      quirks: z.array(z.string()).optional().describe("With save: element-specific gotchas. With quirk: site-wide gotchas to append."),
    },
    async ({ action, domain, name, selector, role, description, quirks }) => {
      try {
        if (action === "list") {
          const domains = listAnchorDomains();
          if (domains.length === 0) {
            return { content: [{ type: "text" as const, text: "No anchors saved yet. Use `remember save` after locating an element with snapshot/find." }] };
          }
          const lines = ["Domains with saved anchors:\n"];
          for (const d of domains) {
            const cm = loadComponentMap(d);
            lines.push(`  ${d} — ${Object.keys(cm.anchors).length} anchor(s)${cm.quirks.length ? `, ${cm.quirks.length} quirk(s)` : ""}`);
          }
          lines.push("\nCall `remember get <domain>` for details.");
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        if (!domain) return err(`\`${action}\` requires a domain (e.g. 'app.slack.com').`);

        if (action === "get") {
          const cm = loadComponentMap(domain);
          const names = Object.keys(cm.anchors);
          if (names.length === 0 && cm.quirks.length === 0) {
            return { content: [{ type: "text" as const, text: `No anchors saved for ${domain} yet. Discover elements with snapshot/find, then \`remember save\` them.` }] };
          }
          const lines = [`Component map for ${domain}:\n`];
          if (cm.quirks.length) {
            lines.push("Site quirks:");
            for (const q of cm.quirks) lines.push(`  - ${q}`);
            lines.push("");
          }
          lines.push(`Anchors (use as @a:<name> in any selector):`);
          for (const a of Object.values(cm.anchors)) {
            const health = a.fails > 0 ? `  [${a.uses}✓/${a.fails}✗${a.fails >= a.uses && a.fails >= 2 ? " — likely STALE, re-verify" : ""}]` : a.uses > 0 ? `  [${a.uses}✓]` : "";
            lines.push(`  @a:${a.name}${a.role ? ` (${a.role})` : ""} → ${a.selector}${health}`);
            if (a.description) lines.push(`      ${a.description}`);
            if (a.quirks?.length) for (const q of a.quirks) lines.push(`      • ${q}`);
          }
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        if (action === "quirk") {
          if (!quirks || quirks.length === 0) return err("`quirk` requires a non-empty `quirks` array.");
          setDomainQuirks(domain, quirks);
          return { content: [{ type: "text" as const, text: `Added ${quirks.length} quirk(s) to ${domain}.` }] };
        }

        if (action === "forget") {
          if (!name) return err("`forget` requires the anchor `name`.");
          const removed = removeAnchor(domain, name);
          return { content: [{ type: "text" as const, text: removed ? `Removed anchor @a:${name} from ${domain}.` : `No anchor named '${name}' for ${domain}.` }] };
        }

        // save
        if (!name) return err("`save` requires an anchor `name`.");
        if (!selector) return err("`save` requires a `selector` (the CSS that locates the element).");
        saveAnchor(domain, { name, selector, role, description, quirks }, new Date().toISOString());
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved anchor @a:${name} for ${domain} → ${selector}\nUse it in any selector field: e.g. {"type":"click","selector":"@a:${name}"}.`,
            },
          ],
        };
      } catch (e: unknown) {
        return err(`remember failed: ${getErrorMessage(e)}`);
      }
    },
  );
}
