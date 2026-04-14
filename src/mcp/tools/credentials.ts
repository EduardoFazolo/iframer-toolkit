import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { localApiGet, localApiPost, err, getErrorMessage } from "../helpers";
import { getDataDir } from "../../lib/paths";
import { normalizeDomain } from "../../lib/knowledge";

const ELICIT_TIMEOUT_MS = 45_000;

/** Append a diagnostic line to <dataDir>/mcp.log. Best-effort, ignores write failures. */
function mcpLog(event: string, data?: Record<string, unknown>): void {
  try {
    const dir = getDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "mcp.log"),
      JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + "\n"
    );
  } catch {}
}

/** Returns true when the given (normalized) domain already has credentials stored. */
function domainMatches(normalized: string, stored: string[]): boolean {
  return stored.some(
    (d) => d === normalized || normalized.endsWith("." + d) || d.endsWith("." + normalized)
  );
}

export function registerCredentialsTool(server: McpServer) {
  server.tool(
    "credentials",
    `Manage stored login credentials. This tool ONLY stores and lists credentials — it does NOT log you into anything. Actual logins happen via the \`execute\` tool with a \`login\` step. Credentials are stored in a single local SQLite database shared by ALL browser modes (headless, binary-headful, docker-headful) — store once, login anywhere.

CORRECT WORKFLOW when the user needs to be logged into a site:
1. Call \`credentials\` with \`action=list\`. READ THE RESPONSE LITERALLY. If it says "No credentials stored" then NO credentials exist. If it lists domains, those are the only ones stored.
2. If the target domain IS in the list → skip to step 4. Credentials exist and are valid. Move on.
3. If the target domain is NOT in the list → call \`credentials\` with \`action=store, domain=<site>\`. This attempts to pop a secure form in the user's UI. The response is either \`Credentials stored for <site>.\` (success) OR a loud error telling you the client doesn't support form elicitation, with instructions for the user to run a CLI command. Relay the error verbatim and STOP — do not proceed with login until the user confirms they ran the command.
4. Call \`execute\` with \`[{type:"navigate", url:"https://<site>/login"}, {type:"login", domain:"<site>"}]\`. The login step auto-detects the form, fills stored credentials, handles 2FA, submits, and auto-escalates browser modes if blocked.

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════════════

1. **NEVER re-store credentials as a recovery from a failed login.** If credentials already exist, the store call will be REJECTED. Login failures are browser-mode / bot-detection / page-structure problems, not credential problems.

2. **NEVER ask the user "do you have credentials?"** — call action=list and read the response.

3. **NEVER confabulate.** If action=list returns "No credentials stored", the database is empty.

4. **NEVER pretend a store call succeeded if the response was an error.**

5. **NEVER ask the user to paste their password in chat.**

6. **\`force: true\` on store is ONLY for explicit password changes.**`,
    {
      action: z.enum(["store", "list"]).describe("store: prompt for credentials | list: show stored domains"),
      domain: z.string().optional().describe("Domain (required for store). Use the bare registrable domain."),
      force: z.boolean().optional().describe("Overwrite existing. ONLY for explicit password changes."),
    },
    async ({ action, domain, force }) => {
      try {
        if (action === "list") {
          const credData = await localApiGet<{ ok: boolean; domains?: string[] }>("/credentials");
          const domains = credData.domains || [];
          if (!domains.length) {
            return { content: [{ type: "text" as const, text: "No credentials stored. Call this tool again with action=store and the domain to prompt the user for credentials now." }] };
          }
          return { content: [{ type: "text" as const, text: `Stored credentials for:\n${domains.map((d) => `  - ${d}`).join("\n")}` }] };
        }

        if (action !== "store") return err("Unknown action");
        if (!domain) return err("domain is required for action=store");

        const normalized = normalizeDomain(domain);

        // Guard: refuse to re-store if already exists (unless force:true)
        const credData = await localApiGet<{ ok: boolean; domains?: string[] }>("/credentials");
        const stored = credData.domains || [];
        if (domainMatches(normalized, stored) && !force) {
          mcpLog("credentials.store.rejected_already_exists", { domain: normalized });
          return err(
            `REFUSING TO RE-STORE: credentials for "${normalized}" already exist. ` +
            `Login failures are NOT credential problems — retry with a stronger browser mode.\n\n` +
            `Use \`force: true\` ONLY if the user explicitly says their password changed.`
          );
        }

        mcpLog("credentials.store.attempt", { domain: normalized, force: !!force });

        // Elicit credentials from the user with a timeout
        let result: { action: string; content?: Record<string, string> };
        try {
          const elicitPromise = (server as unknown as { server: { elicitInput: (opts: unknown) => Promise<{ action: string; content?: Record<string, string> }> } }).server.elicitInput({
            mode: "form",
            message: `Enter your login credentials for ${normalized}. These are encrypted and stored locally — the agent never sees them.`,
            requestedSchema: {
              type: "object",
              properties: {
                username: { type: "string", title: "Username / Email" },
                password: { type: "string", title: "Password" },
                totp_secret: { type: "string", title: "TOTP Secret (leave empty if no 2FA)" },
              },
              required: ["username", "password"],
            },
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`elicitation timed out after ${ELICIT_TIMEOUT_MS}ms`)), ELICIT_TIMEOUT_MS)
          );
          result = await Promise.race([elicitPromise, timeoutPromise]);
        } catch (elicitErr) {
          const msg = elicitErr instanceof Error ? elicitErr.message : String(elicitErr);
          mcpLog("credentials.store.elicit_failed", { domain: normalized, error: msg });
          return err(
            `FAILED TO STORE CREDENTIALS for ${normalized}: ${msg}\n\n` +
            `The user MUST run this command in their terminal:\n\n` +
            `  iframer-toolkit credentials add ${normalized}\n\n` +
            `After they run it, retry the login. DO NOT pretend credentials were stored.`
          );
        }

        mcpLog("credentials.store.elicit_result", { domain: normalized, action: result.action, hasContent: !!result.content });

        if (result.action !== "accept" || !result.content) {
          return err(`Credential form was ${result.action || "dismissed"}. No credentials saved for ${normalized}.`);
        }

        const { username, password, totp_secret } = result.content as { username?: string; password?: string; totp_secret?: string };
        if (!username || !password) {
          return err(`Form submitted but username or password was empty. No credentials saved.`);
        }

        // Store via the local server's HTTP API
        try {
          const storeResult = await localApiPost<{ ok: boolean; error?: string }>("/credentials", {
            domain: normalized,
            username,
            password,
            totp_secret: totp_secret || undefined,
          });
          if (!storeResult.ok) return err(`Failed to store: ${storeResult.error}`);
        } catch (storeErr) {
          const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
          mcpLog("credentials.store.write_failed", { domain: normalized, error: msg });
          return err(`Failed to write credentials: ${msg}`);
        }

        mcpLog("credentials.store.success", { domain: normalized });
        return { content: [{ type: "text" as const, text: `Credentials stored for ${normalized}. Shared across all browser modes.` }] };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
