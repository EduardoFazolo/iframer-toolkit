import { chromium } from "patchright";
import type { Express, Request, Response } from "express";
import type { AuthRequest } from "./middleware";
import { Iframer } from "../lib/iframer";
import { asyncHandler, AppError } from "./error-handler";
import { extensionBridge } from "../lib/extension/bridge";
import fs from "fs";

/** Cast Request to AuthRequest (populated by tokenAuth middleware) */
function auth(req: Request): AuthRequest {
  return req as AuthRequest;
}

const iframer = new Iframer({
  mode: (process.env.IFRAMER_MODE as "local" | "docker") || "local",
});

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

  // ─── Interactive session endpoints ───────────────────────────────

  app.post("/interactive/start", asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.body || {};
    const r = auth(req);
    const result = await iframer.startSession(r.userId, r.token, { url });
    const existing = iframer.getSession(r.userId);
    res.json({
      ok: true,
      noVncUrl: result.noVncUrl,
      wsPort: result.wsPort,
      message: existing ? "Session already active" : undefined,
    });
  }));

  app.get("/interactive/status", (req: Request, res: Response) => {
    const session = iframer.getSession(auth(req).userId);
    if (!session) return res.json({ ok: true, active: false });

    res.json({
      ok: true,
      active: true,
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort,
      createdAt: session.createdAt.toISOString(),
    });
  });

  app.post("/interactive/stop", asyncHandler(async (req: Request, res: Response) => {
    const r = auth(req);
    const result = await iframer.stopSession(r.userId, r.token);
    res.json(result);
  }));

  app.get("/interactive/screenshot", asyncHandler(async (req: Request, res: Response) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session) throw new AppError(404, "No active interactive session");

    if (req.query.format === "raw") {
      const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
      res.set("Content-Type", "image/jpeg");
      res.send(buf);
      return;
    }

    const result = await iframer.screenshot(r.userId);
    if (!result) throw new AppError(404, "No active interactive session");
    res.json({ ok: true, ...result });
  }));

  // ─── Legacy single-action endpoint (delegates to execute) ────────

  app.post("/interactive/act", asyncHandler(async (req: Request, res: Response) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session) throw new AppError(404, "No active interactive session");

    const { action, screenshot: wantScreenshot = true } = req.body || {};
    if (!action || !action.type) throw new AppError(400, "Missing action.type");

    const result = await iframer.execute(r.userId, r.token, {
      steps: [action],
      options: { screenshotAfterEach: wantScreenshot, continueOnObstacle: false },
    });

    const stepResult = result.results[0];
    res.json({
      ok: result.ok,
      result: stepResult?.result,
      screenshotUrl: stepResult?.screenshotUrl || result.finalState?.screenshotUrl,
      url: result.finalState?.url,
      title: result.finalState?.title,
      error: result.error?.message,
    });
  }));

  // ─── Legacy batch endpoint (delegates to execute) ────────────────

  app.post("/interactive/batch", asyncHandler(async (req: Request, res: Response) => {
    const r = auth(req);
    const session = iframer.getSession(r.userId);
    if (!session) throw new AppError(404, "No active interactive session");

    const { actions, screenshot: wantScreenshot = true, continueOnError = false } = req.body || {};
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new AppError(400, "actions must be a non-empty array");
    }

    const result = await iframer.execute(r.userId, r.token, {
      steps: actions,
      options: { continueOnError, screenshotAfterEach: false },
    });

    res.json({
      ok: result.ok,
      results: result.results.map((r) => ({ index: r.stepIndex, ok: r.ok, result: r.result, error: r.error })),
      screenshotUrl: wantScreenshot ? result.finalState?.screenshotUrl : undefined,
      url: result.finalState?.url,
      title: result.finalState?.title,
    });
  }));

  // ─── Session management ─────────────────────────────────────────

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

  app.post("/credentials/login", asyncHandler(async (req: Request, res: Response) => {
    const { domain, usernameSelector, passwordSelector, submitSelector, totpSelector } = req.body || {};
    if (!domain) throw new AppError(400, "Missing domain");

    const r = auth(req);
    const result = await iframer.loginWithCredentials(r.userId, r.token, domain, {
      username: usernameSelector,
      password: passwordSelector,
      submit: submitSelector,
      totp: totpSelector,
    });

    if (!result.ok) throw new AppError(400, result.error || "Login failed");
    const { ok: _ok, ...resultRest } = result;
    res.json({ ok: true, message: "Login attempted", ...resultRest });
  }));

  // ─── Extension bridge (real-tab control) ─────────────────────────

  app.get("/extension/status", (_req, res) => {
    res.json({ ok: true, ...extensionBridge.status() });
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
