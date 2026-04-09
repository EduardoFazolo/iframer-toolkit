import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { getIframer, err, getErrorMessage, LOCAL_USER, LOCAL_TOKEN } from "../helpers";
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

/** Returns true when the given (normalized) domain already has credentials stored,
 *  either exactly or via parent-domain fallback in either direction. */
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

Domain matching is flexible: \`figma.com\` in the store matches \`www.figma.com\`, \`auth.figma.com\`, etc. via parent-domain fallback. Store the bare registrable domain (e.g. \`figma.com\`, not \`www.figma.com\`).

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES — violating these is a bug, not creative problem solving
═══════════════════════════════════════════════════════════════════════

1. **NEVER re-store credentials as a recovery from a failed login.** If credentials already exist for a domain, the store call will be REJECTED by this tool. A login step failure is ALMOST NEVER a credential problem — it is browser-mode / bot-detection / site-structure. The correct recovery is to retry the \`execute\` call with a stronger \`options.mode\` (binary-headful or docker-headful), NOT to re-ask the user for their password.

2. **NEVER ask the user "do you have credentials?"** — call action=list and read the response.

3. **NEVER confabulate.** If action=list returns "No credentials stored", the database is empty. Do not claim anything is stored.

4. **NEVER pretend a store call succeeded if the response was an error.** Read the error text and relay it verbatim to the user.

5. **NEVER ask the user to paste their password in chat.** Always use action=store (which pops a secure form), or the CLI fallback from the error message.

6. **\`force: true\` on store is ONLY for explicit password changes.** If the user says "my password changed" or "update my credentials for X", use force. Otherwise never.`,
    {
      action: z.enum(["store", "list"]).describe("store: prompt the user for credentials via a secure form (NEVER use this as a recovery from a login failure — if credentials already exist, this call will be rejected) | list: show which domains already have stored credentials"),
      domain: z.string().optional().describe("Domain (required for store). Use the bare registrable domain, e.g. \"figma.com\" not \"www.figma.com\"."),
      force: z.boolean().optional().describe("Overwrite existing credentials. Only use this when the user EXPLICITLY asks to change their stored credentials. Never use `force` to recover from a login failure."),
    },
    async ({ action, domain, force }) => {
      try {
        const iframer = await getIframer();

        if (action === "list") {
          const domains = await iframer.listCredentials(LOCAL_USER);
          if (!domains.length) {
            return { content: [{ type: "text" as const, text: "No credentials stored. Call this tool again with action=store and the domain to prompt the user for credentials now." }] };
          }
          return { content: [{ type: "text" as const, text: `Stored credentials for:\n${domains.map((d) => `  - ${d}`).join("\n")}` }] };
        }

        if (action !== "store") return err("Unknown action");
        if (!domain) return err("domain is required for action=store");

        // Guard: refuse to re-store credentials that already exist unless the
        // caller explicitly opted in with force:true. Login failures are almost
        // never credential-validity failures — they're browser-mode / bot-
        // detection / site-structure. This rule stops the "login failed → re-ask
        // user for credentials" confabulation pattern dead.
        const normalized = normalizeDomain(domain);
        const stored = await iframer.listCredentials(LOCAL_USER);
        const alreadyExists = domainMatches(normalized, stored);

        if (alreadyExists && !force) {
          mcpLog("credentials.store.rejected_already_exists", { domain: normalized });
          return err(
            `REFUSING TO RE-STORE: credentials for "${normalized}" already exist in the store. ` +
            `If a login using these credentials just failed, the problem is NOT the credentials — it is almost always browser-mode / bot-detection / page-structure. ` +
            `DO NOT ask the user to re-enter their password. INSTEAD:\n\n` +
            `  1. Retry the \`execute\` call with \`options.mode: "binary-headful"\` (or "docker-headful" if Docker is running).\n` +
            `  2. If you already tried stronger modes and they also failed, take a \`snapshot\` of the login page to see what the site is actually rendering.\n` +
            `  3. ONLY if the user EXPLICITLY says "my password changed" or "I want to update my credentials" should you call this tool again with \`force: true\`.\n\n` +
            `NEVER use this tool as a reflexive "recovery" from a failed login.`
          );
        }

        mcpLog("credentials.store.attempt", { domain: normalized, force: !!force, alreadyExists });

        // Race the elicitation against a hard timeout. Some MCP clients accept
        // the request but never send a response; without a timeout, every
        // subsequent MCP call queues behind this one forever.
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
            setTimeout(() => reject(new Error(`elicitation timed out after ${ELICIT_TIMEOUT_MS}ms — the client did not respond`)), ELICIT_TIMEOUT_MS)
          );
          result = await Promise.race([elicitPromise, timeoutPromise]);
        } catch (elicitErr) {
          const msg = elicitErr instanceof Error ? elicitErr.message : String(elicitErr);
          mcpLog("credentials.store.elicit_failed", { domain: normalized, error: msg });
          return err(
            `FAILED TO STORE CREDENTIALS for ${normalized}: ${msg}\n\n` +
            `This MCP client cannot collect credentials via the secure form flow. The user MUST run this command in their terminal:\n\n` +
            `  iframer-toolkit credentials add ${normalized}\n\n` +
            `After they run it, retry the login. ` +
            `DO NOT pretend credentials were stored. ` +
            `DO NOT call \`credentials list\` and assume success from its output. ` +
            `DO NOT proceed with login until the user explicitly confirms they ran the CLI command.`
          );
        }

        mcpLog("credentials.store.elicit_result", { domain: normalized, action: result.action, hasContent: !!result.content });

        if (result.action !== "accept" || !result.content) {
          return err(
            `Credential form was ${result.action || "dismissed"}. No credentials were saved for ${normalized}. ` +
            `Ask the user to retry or store credentials via CLI: \`iframer-toolkit credentials add ${normalized}\`.`
          );
        }

        const { username, password, totp_secret } = result.content as { username?: string; password?: string; totp_secret?: string };
        if (!username || !password) {
          mcpLog("credentials.store.incomplete", { domain: normalized, hasUsername: !!username, hasPassword: !!password });
          return err(`Credential form was submitted but username or password was empty. No credentials were saved for ${normalized}.`);
        }

        try {
          await iframer.storeCredential(LOCAL_USER, LOCAL_TOKEN, {
            domain: normalized,
            username,
            password,
            totp_secret: totp_secret || undefined,
          });
        } catch (storeErr) {
          const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
          mcpLog("credentials.store.write_failed", { domain: normalized, error: msg });
          return err(`Failed to write credentials to store: ${msg}`);
        }

        mcpLog("credentials.store.success", { domain: normalized });
        return { content: [{ type: "text" as const, text: `Credentials stored for ${normalized}. These are shared across all browser modes (headless, binary-headful, docker-headful).` }] };
      } catch (e: unknown) {
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
