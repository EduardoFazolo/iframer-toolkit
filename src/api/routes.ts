import { chromium } from "patchright";
import type { Express, Request, Response } from "express";
import type { AuthRequest } from "./middleware";
import { Iframer } from "../lib/iframer";
import { asyncHandler, AppError } from "./error-handler";
import { extensionBridge } from "../lib/extension/bridge";
import { getVersion } from "../lib/version";
import fs from "fs";

/** Cast Request to AuthRequest (populated by tokenAuth middleware) */
function auth(req: Request): AuthRequest {
  return req as AuthRequest;
}

const iframer = new Iframer();

export function registerRoutes(app: Express): void {
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/browsers", async (_req, res) => {
    const browsers: { name: string; installed: boolean; executablePath: string | null }[] = [];
    try {
      const execPath = (chromium as unknown as { executablePath(): string }).executablePath();
      browsers.push({ name: "chromium", installed: fs.existsSync(execPath), executablePath: execPath });
    } catch {
      browsers.push({ name: "chromium", installed: false, executablePath: null });
    }
    res.json({ ok: true, browsers });
  });

  // ─── Browser lifecycle ──────────────────────────────────────────

  app.get("/browser/health", (_req, res) => {
    res.json({ ok: true, ...iframer.browserHealth() });
  });

  // Live daemon browsers + the page each is on — for reattach-by-instanceId.
  app.get("/instances", asyncHandler(async (_req: Request, res: Response) => {
    res.json({ ok: true, instances: await iframer.listInstances() });
  }));

  app.post("/browser/restart", asyncHandler(async (_req: Request, res: Response) => {
    const result = await iframer.restartBrowser();
    res.json({ ok: true, ...result });
  }));

  app.post("/auth/cookies", asyncHandler(async (req: Request, res: Response) => {
    const { mode, urls, instanceId } = req.body || {};
    const result = await iframer.getCookies(mode, urls, instanceId);
    res.json(result);
  }));

  app.post("/auth/full", asyncHandler(async (req: Request, res: Response) => {
    const { mode, urls, instanceId } = req.body || {};
    const result = await iframer.getFullAuth(mode, urls, instanceId);
    res.json(result);
  }));

  app.post("/capture/start", asyncHandler(async (req: Request, res: Response) => {
    const { mode, instanceId } = req.body || {};
    const result = await iframer.startCapture(mode, instanceId);
    res.json(result);
  }));

  app.post("/capture/stop", asyncHandler(async (req: Request, res: Response) => {
    const { mode, instanceId } = req.body || {};
    const result = await iframer.stopCapture(mode, instanceId);
    res.json(result);
  }));

  // ─── Pipeline execution (new primary endpoint) ───────────────────

  app.post("/execute", asyncHandler(async (req: Request, res: Response) => {
    const { steps, options } = req.body || {};
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new AppError(400, "steps must be a non-empty array");
    }

    const r = auth(req);
    const result = await iframer.execute(r.userId, r.token, { steps, options });
    res.json(result);
  }));

  // ─── Session management ─────────────────────────────────────────

  // Saves browser state and closes idle browsers. Older CLI and MCP processes
  // can talk to a newer server (and the reverse), so the path stays as it is.
  app.post("/interactive/stop", asyncHandler(async (req: Request, res: Response) => {
    const r = auth(req);
    const result = await iframer.stopSession(r.userId, r.token);
    res.json(result);
  }));

  app.delete("/session", asyncHandler(async (req: Request, res: Response) => {
    await iframer.clearSession(auth(req).userId);
    res.json({ ok: true });
  }));

  // ─── Credential management ──────────────────────────────────────

  app.post("/credentials", asyncHandler(async (req: Request, res: Response) => {
    const { domain, username, password, totp_secret, fields } = req.body || {};
    if (!domain) throw new AppError(400, "Missing domain");
    if (!username && !password && !fields) {
      throw new AppError(400, "Must provide username, password, or fields");
    }

    const r = auth(req);
    await iframer.storeCredential(r.userId, r.token, { domain, username, password, totp_secret, fields });
    res.json({ ok: true, domain, message: "Credentials stored" });
  }));

  app.get("/credentials", asyncHandler(async (req: Request, res: Response) => {
    const domains = await iframer.listCredentials(auth(req).userId);
    res.json({ ok: true, domains });
  }));

  app.delete("/credentials/:domain", asyncHandler(async (req: Request, res: Response) => {
    await iframer.deleteCredential(auth(req).userId, req.params.domain as string);
    res.json({ ok: true, message: `Credentials for ${req.params.domain} deleted` });
  }));

  // ─── Extension bridge (real-tab control) ─────────────────────────

  app.get("/extension/status", (_req, res) => {
    res.json({ ok: true, version: getVersion(), ...extensionBridge.status() });
  });

  app.post("/extension/tabs", asyncHandler(async (_req: Request, res: Response) => {
    const result = await extensionBridge.listTabs();
    res.json({ ok: true, ...result });
  }));

  // Hot-reload connected extensions (dev aid — new background.js without a
  // manual chrome://extensions reload).
  app.post("/extension/reload", asyncHandler(async (_req: Request, res: Response) => {
    const result = await extensionBridge.reloadAll();
    res.json({ ok: true, ...result });
  }));

  // Open a new tab in the user's real Chrome (native chrome.tabs.create).
  app.post("/extension/tab/create", asyncHandler(async (req: Request, res: Response) => {
    const { url, active, windowId, clientId } = req.body || {};
    if (url !== undefined && typeof url !== "string") throw new AppError(400, "url must be a string");
    const result = await extensionBridge.createTab(url || "", { active, windowId }, clientId);
    res.json({ ok: true, ...result });
  }));

  // Group tabs into a native Chrome tab group (chrome.tabs.group + tabGroups.update).
  app.post("/extension/tab/group", asyncHandler(async (req: Request, res: Response) => {
    const { tabIds, title, color, collapsed, groupId, clientId } = req.body || {};
    if (!Array.isArray(tabIds) || tabIds.length === 0 || !tabIds.every((t) => typeof t === "number")) {
      throw new AppError(400, "tabIds must be a non-empty array of numbers");
    }
    const result = await extensionBridge.groupTabs(tabIds, { title, color, collapsed, groupId }, clientId);
    res.json({ ok: true, group: result });
  }));

  // Remove tabs from their group (chrome.tabs.ungroup).
  app.post("/extension/tab/ungroup", asyncHandler(async (req: Request, res: Response) => {
    const { tabIds, clientId } = req.body || {};
    if (!Array.isArray(tabIds) || tabIds.length === 0 || !tabIds.every((t) => typeof t === "number")) {
      throw new AppError(400, "tabIds must be a non-empty array of numbers");
    }
    const result = await extensionBridge.ungroupTabs(tabIds, clientId);
    res.json({ ok: true, ...result });
  }));

  // Rename / recolor / collapse an existing group (chrome.tabGroups.update).
  app.post("/extension/group/update", asyncHandler(async (req: Request, res: Response) => {
    const { groupId, title, color, collapsed, clientId } = req.body || {};
    if (typeof groupId !== "number") throw new AppError(400, "groupId (number) is required");
    const result = await extensionBridge.updateGroup(groupId, { title, color, collapsed }, clientId);
    res.json({ ok: true, group: result });
  }));

  // List all tab groups (chrome.tabGroups.query).
  app.post("/extension/groups", asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.body || {};
    const result = await extensionBridge.listGroups(clientId);
    res.json({ ok: true, ...result });
  }));

  // Drive a REAL Chrome tab through iframer's full pipeline via the extension
  // CDP relay (connectOverCDP). Same engine as every other mode.
  app.post("/extension/execute", asyncHandler(async (req: Request, res: Response) => {
    const { tabId, steps, options, clientId } = req.body || {};
    if (typeof tabId !== "number") throw new AppError(400, "tabId (number) is required");
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new AppError(400, "steps must be a non-empty array");
    }
    const r = auth(req);
    const result = await iframer.execute(r.userId, r.token, {
      steps,
      options: { ...(options || {}), extensionTabId: tabId, clientId },
    });
    res.json(result);
  }));

  // ─── Headless fetch ─────────────────────────────────────────────

  app.post("/fetch", asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.body || {};
    if (!url) throw new AppError(400, "Missing url");

    const r = auth(req);
    const result = await iframer.fetch(r.userId || null, r.token || null, req.body);
    res.json(result);
  }));
}

export { iframer };
