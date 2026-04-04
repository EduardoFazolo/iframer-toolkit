import { chromium } from "patchright";
import { firefox, webkit } from "playwright";
import type { Express, Response } from "express";
import type { AuthRequest } from "./middleware";
import { Iframer } from "../lib/iframer";
import { BROWSER_ORDER } from "../lib/browser/launcher";
import fs from "fs";

const iframer = new Iframer();

export function registerRoutes(app: Express): void {
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/browsers", async (_req, res) => {
    const browsers: { name: string; installed: boolean; executablePath: string | null }[] = [];
    for (const [name, type] of [
      ["chromium", chromium],
      ["firefox", firefox],
      ["webkit", webkit],
    ] as const) {
      try {
        const execPath = (type as unknown as { executablePath(): string }).executablePath();
        browsers.push({ name, installed: fs.existsSync(execPath), executablePath: execPath });
      } catch {
        browsers.push({ name, installed: false, executablePath: null });
      }
    }
    res.json({ ok: true, browsers });
  });

  // ─── Pipeline execution (new primary endpoint) ───────────────────

  app.post("/execute", async (req: AuthRequest, res: Response) => {
    const { steps, options } = req.body || {};
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ ok: false, error: "steps must be a non-empty array" });
    }

    try {
      const result = await iframer.execute(req.userId, req.token, { steps, options });
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Interactive session endpoints ───────────────────────────────

  app.post("/interactive/start", async (req: AuthRequest, res: Response) => {
    const { url, headers = {}, locale = "pt-BR" } = req.body || {};

    try {
      const result = await iframer.startSession(req.userId, req.token, { url });
      const existing = iframer.getSession(req.userId);
      res.json({
        ok: true,
        noVncUrl: result.noVncUrl,
        wsPort: result.wsPort,
        message: existing ? "Session already active" : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/interactive/status", (req: AuthRequest, res: Response) => {
    const session = iframer.getSession(req.userId);
    if (!session) return res.json({ ok: true, active: false });

    res.json({
      ok: true,
      active: true,
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort,
      createdAt: session.createdAt.toISOString(),
    });
  });

  app.post("/interactive/stop", async (req: AuthRequest, res: Response) => {
    try {
      const result = await iframer.stopSession(req.userId, req.token);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/interactive/screenshot", async (req: AuthRequest, res: Response) => {
    const session = iframer.getSession(req.userId);
    if (!session) return res.status(404).json({ ok: false, error: "No active interactive session" });

    try {
      if (req.query.format === "raw") {
        const buf = await session.page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
        res.set("Content-Type", "image/jpeg");
        res.send(buf);
        return;
      }

      const result = await iframer.screenshot(req.userId);
      if (!result) return res.status(404).json({ ok: false, error: "No active interactive session" });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Legacy single-action endpoint (delegates to execute) ────────

  app.post("/interactive/act", async (req: AuthRequest, res: Response) => {
    const session = iframer.getSession(req.userId);
    if (!session) return res.status(404).json({ ok: false, error: "No active interactive session" });

    const { action, screenshot: wantScreenshot = true } = req.body || {};
    if (!action || !action.type) return res.status(400).json({ ok: false, error: "Missing action.type" });

    try {
      const result = await iframer.execute(req.userId, req.token, {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Legacy batch endpoint (delegates to execute) ────────────────

  app.post("/interactive/batch", async (req: AuthRequest, res: Response) => {
    const session = iframer.getSession(req.userId);
    if (!session) return res.status(404).json({ ok: false, error: "No active interactive session" });

    const { actions, screenshot: wantScreenshot = true, continueOnError = false } = req.body || {};
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ ok: false, error: "actions must be a non-empty array" });
    }

    try {
      const result = await iframer.execute(req.userId, req.token, {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Session management ─────────────────────────────────────────

  app.delete("/session", async (req: AuthRequest, res: Response) => {
    await iframer.clearSession(req.userId);
    res.json({ ok: true });
  });

  // ─── Credential management ──────────────────────────────────────

  app.post("/credentials", async (req: AuthRequest, res: Response) => {
    const { domain, username, password, totp_secret, fields } = req.body || {};
    if (!domain) return res.status(400).json({ ok: false, error: "Missing domain" });
    if (!username && !password && !fields) {
      return res.status(400).json({ ok: false, error: "Must provide username, password, or fields" });
    }

    try {
      await iframer.storeCredential(req.userId, req.token, { domain, username, password, totp_secret, fields });
      res.json({ ok: true, domain, message: "Credentials stored" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/credentials", async (req: AuthRequest, res: Response) => {
    try {
      const domains = await iframer.listCredentials(req.userId);
      res.json({ ok: true, domains });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.delete("/credentials/:domain", async (req: AuthRequest, res: Response) => {
    try {
      await iframer.deleteCredential(req.userId, req.params.domain as string);
      res.json({ ok: true, message: `Credentials for ${req.params.domain} deleted` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/credentials/login", async (req: AuthRequest, res: Response) => {
    const { domain, usernameSelector, passwordSelector, submitSelector, totpSelector } = req.body || {};
    if (!domain) return res.status(400).json({ ok: false, error: "Missing domain" });

    try {
      const result = await iframer.loginWithCredentials(req.userId, req.token, domain, {
        username: usernameSelector,
        password: passwordSelector,
        submit: submitSelector,
        totp: totpSelector,
      });

      if (!result.ok) return res.status(400).json(result);
      const { ok: _ok, ...resultRest } = result;
      res.json({ ok: true, message: "Login attempted", ...resultRest });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // ─── Headless fetch ─────────────────────────────────────────────

  app.post("/fetch", async (req: AuthRequest, res: Response) => {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

    try {
      const result = await iframer.fetch(req.userId || null, req.token || null, req.body);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
}

export { iframer };
