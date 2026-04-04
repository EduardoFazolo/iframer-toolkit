import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiGet, getIframer, isDockerRunning, err, getErrorMessage, IFRAMER_MODE, LOCAL_USER, LOCAL_TOKEN } from "../helpers";

export function registerCredentialsTool(server: McpServer) {
  server.tool(
    "credentials",
    `Manage login credentials securely. When login is needed: FIRST call action=list to check if credentials exist. If they do, proceed with login. If not, call action=store — this prompts the user with a secure form (you never see passwords). NEVER ask the user "do you have credentials?" — just check and act.`,
    {
      action: z.enum(["store", "login", "list"]).describe("store: prompt user for credentials | login: log in with stored credentials | list: show stored domains"),
      domain: z.string().optional().describe("Domain (required for store and login)"),
      usernameSelector: z.string().optional().describe("CSS selector for username field (for login)"),
      passwordSelector: z.string().optional().describe("CSS selector for password field (for login)"),
      submitSelector: z.string().optional().describe("CSS selector for submit button (for login)"),
      totpSelector: z.string().optional().describe("CSS selector for 2FA code field (for login)"),
    },
    async ({ action, domain, usernameSelector, passwordSelector, submitSelector, totpSelector }) => {
      try {
        const dockerRunning = await isDockerRunning();
        const useLocal = IFRAMER_MODE === "docker" ? false : !dockerRunning;

        if (action === "list") {
          let domains: string[];
          if (useLocal) {
            const iframer = await getIframer();
            domains = await iframer.listCredentials(LOCAL_USER);
          } else {
            const credList = await apiGet<{ ok: boolean; error?: string; domains?: string[] }>("/credentials");
            if (!credList.ok) return err(`Error: ${credList.error}`);
            domains = credList.domains || [];
          }
          if (!domains.length) {
            return { content: [{ type: "text" as const, text: "No credentials stored. Call this tool again with action=store and the domain to prompt the user for credentials now." }] };
          }
          return { content: [{ type: "text" as const, text: `Stored credentials for:\n${domains.map((d: string) => `  - ${d}`).join("\n")}` }] };
        }

        if (action === "store") {
          if (!domain) return err("domain is required for action=store");

          const result = await (server as unknown as { server: { elicitInput: (opts: unknown) => Promise<{ action: string; content?: Record<string, string> }> } }).server.elicitInput({
            mode: "form",
            message: `Enter your login credentials for ${domain}. These are encrypted and stored locally — Claude never sees them.`,
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

          if (result.action === "decline" || !result.content) {
            return { content: [{ type: "text" as const, text: "Cancelled." }] };
          }

          const { username, password, totp_secret } = result.content as { username?: string; password?: string; totp_secret?: string };
          if (useLocal) {
            const iframer = await getIframer();
            await iframer.storeCredential(LOCAL_USER, LOCAL_TOKEN, { domain, username, password, totp_secret: totp_secret || undefined });
          } else {
            const storeResult = await apiPost<{ ok: boolean; error?: string }>("/credentials", { domain, username, password, totp_secret: totp_secret || undefined });
            if (!storeResult.ok) return err(`Error: ${storeResult.error}`);
          }
          return { content: [{ type: "text" as const, text: `Credentials stored for ${domain}.` }] };
        }

        if (action === "login") {
          if (!domain) return err("domain is required for action=login");
          if (useLocal) {
            return { content: [{ type: "text" as const, text: `Use a login step in "execute" to log in with stored credentials for ${domain}. Example: { "type": "login", "domain": "${domain}" }` }] };
          }
          const loginResult = await apiPost<{ ok: boolean; error?: string; url?: string; title?: string; totpGenerated?: boolean; screenshotUrl?: string }>("/credentials/login", { domain, usernameSelector, passwordSelector, submitSelector, totpSelector });
          if (!loginResult.ok) return err(`Error: ${loginResult.error}`);

          const lines = [`Login attempted for ${domain}`, `URL: ${loginResult.url}`, `Title: ${loginResult.title}`];
          if (loginResult.totpGenerated) lines.push("TOTP code generated and entered automatically.");
          if (loginResult.screenshotUrl) lines.push(`Screenshot: ${loginResult.screenshotUrl}`);
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        return err("Unknown action");
      } catch (e: unknown) {
        if (e instanceof Error && e.message?.includes("does not support")) {
          return err(`This client doesn't support secure input prompts. Store credentials via CLI:\n\niframer credentials add ${domain}`);
        }
        return err(`Error: ${getErrorMessage(e)}`);
      }
    }
  );
}
