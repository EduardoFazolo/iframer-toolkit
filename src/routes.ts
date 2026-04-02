import { chromium } from "patchright";
import { firefox, webkit } from "playwright";
import type { Express, Response } from "express";
import type { AuthRequest } from "./auth";
import { getBrowserWithFallback, BROWSER_ORDER } from "./browser";
import { deriveKey, encrypt, decrypt, generateTOTP } from "./crypto";
import { getSession, setSession, setCredential, getCredential, deleteCredential, listCredentialDomains } from "./redis";
import { extractSession, injectCookies, injectStorage } from "./session";
import {
  humanMove,
  humanClick,
  humanClickXY,
  humanType,
  clickRecaptchaCheckbox,
  clickChallengeTiles,
  clickChallengeVerify,
  getChallengeInfo,
} from "./humanize";
import { stealthContextOptions, applyStealthToPage } from "./stealth";
import { solveRecaptcha } from "./captcha-solver";
import * as display from "./display";

import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(import.meta.dir, "..", ".screenshots");
const BASE_URL_ENV = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3021}`;

function saveScreenshot(buffer: Buffer, filename: string): string {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return `${BASE_URL_ENV}/screenshots/${filename}`;
}

const VALID_WAIT_UNTIL = ["networkidle", "domcontentloaded", "load", "commit"];
const VALID_ACTION_TYPES = [
  "click",
  "fill",
  "wait",
  "scroll",
  "human-click",
  "human-type",
  "recaptcha-click",
  "recaptcha-select",
  "recaptcha-verify",
];

function validateFetchBody(body: any): string[] {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object"];
  }

  if (!body.url || typeof body.url !== "string") {
    errors.push("Missing or invalid url");
  }

  if (body.browser !== undefined && !BROWSER_ORDER.includes(body.browser)) {
    errors.push(`Invalid browser. Must be one of: ${BROWSER_ORDER.join(", ")}`);
  }

  if (body.waitUntil !== undefined && !VALID_WAIT_UNTIL.includes(body.waitUntil)) {
    errors.push(`Invalid waitUntil value. Must be one of: ${VALID_WAIT_UNTIL.join(", ")}`);
  }

  if (body.headers !== undefined && (typeof body.headers !== "object" || Array.isArray(body.headers))) {
    errors.push("headers must be a plain object");
  }

  if (body.actions !== undefined) {
    if (!Array.isArray(body.actions)) {
      errors.push("actions must be an array");
    } else {
      for (let i = 0; i < body.actions.length; i++) {
        const action = body.actions[i];
        if (!action || typeof action !== "object") {
          errors.push(`actions[${i}] must be an object`);
          continue;
        }
        if (!VALID_ACTION_TYPES.includes(action.type)) {
          errors.push(`actions[${i}].type must be one of: ${VALID_ACTION_TYPES.join(", ")}`);
          continue;
        }
        if (
          (action.type === "click" ||
            action.type === "fill" ||
            action.type === "human-click" ||
            action.type === "human-type") &&
          !action.selector
        ) {
          errors.push(`actions[${i}] requires a selector`);
        }
        if ((action.type === "fill" || action.type === "human-type") && (action.value === undefined || action.value === null)) {
          errors.push(`actions[${i}] requires a value`);
        }
        if (action.type === "wait" && (typeof action.ms !== "number" || action.ms <= 0)) {
          errors.push(`actions[${i}].ms must be a positive number`);
        }
      }
    }
  }

  return errors;
}

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
        const execPath = (type as any).executablePath();
        browsers.push({ name, installed: fs.existsSync(execPath), executablePath: execPath });
      } catch {
        browsers.push({ name, installed: false, executablePath: null });
      }
    }
    res.json({ ok: true, browsers });
  });

  // ─── Interactive session endpoints ───────────────────────────────

  app.post("/interactive/start", async (req: AuthRequest, res: Response) => {
    if (!req.userId || !req.token) {
      return res.status(400).json({ ok: false, error: "Interactive sessions require token auth" });
    }

    const existing = display.getSession(req.userId);
    if (existing) {
      display.resetTimeout(req.userId);
      return res.json({
        ok: true,
        noVncUrl: `http://localhost:${existing.wsPort}/vnc.html?autoconnect=true`,
        wsPort: existing.wsPort,
        message: "Session already active",
      });
    }

    const { url, headers = {}, locale = "pt-BR" } = req.body || {};

    try {
      const session = await display.startSession(req.userId);

      const useSession = req.userId && req.token;
      let sessionData = null;

      if (useSession) {
        const encryptionKey = await deriveKey(req.token!);
        const blob = await getSession(req.userId);
        if (blob && blob.length > 0) {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
          await injectCookies(session.context, sessionData);
        }
      }

      if (url) {
        await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        if (sessionData) {
          await injectStorage(session.page, sessionData);
        }
      }

      res.json({
        ok: true,
        noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
        wsPort: session.wsPort,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/interactive/status", (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }
    const session = display.getSession(req.userId);
    if (!session) {
      return res.json({ ok: true, active: false });
    }
    display.resetTimeout(req.userId);
    res.json({
      ok: true,
      active: true,
      noVncUrl: `http://localhost:${session.wsPort}/vnc.html?autoconnect=true`,
      wsPort: session.wsPort,
      createdAt: session.createdAt.toISOString(),
    });
  });

  app.post("/interactive/stop", async (req: AuthRequest, res: Response) => {
    if (!req.userId || !req.token) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }

    try {
      const sessionData = await display.stopSession(req.userId);

      if (sessionData && req.token) {
        const encryptionKey = await deriveKey(req.token);
        const encrypted = encrypt(JSON.stringify(sessionData), encryptionKey);
        await setSession(req.userId, encrypted);
      }

      res.json({ ok: true, sessionSaved: !!sessionData });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Agent loop endpoints (screenshot + act) ────────────────────

  app.get("/interactive/screenshot", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }
    const session = display.getSession(req.userId);
    if (!session) {
      return res.status(404).json({ ok: false, error: "No active interactive session" });
    }
    display.resetTimeout(req.userId);

    try {
      const screenshot = await session.page.screenshot({
        type: "jpeg",
        quality: 50,
        fullPage: false,
      });

      if (req.query.format === "raw") {
        res.set("Content-Type", "image/jpeg");
        res.send(screenshot);
      } else {
        const url = saveScreenshot(screenshot, `screenshot-${Date.now()}.jpg`);
        res.json({
          ok: true,
          screenshotUrl: url,
          url: session.page.url(),
          title: await session.page.title(),
        });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/interactive/act", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }
    const session = display.getSession(req.userId);
    if (!session) {
      return res.status(404).json({ ok: false, error: "No active interactive session" });
    }
    display.resetTimeout(req.userId);

    const { action } = req.body || {};
    if (!action || !action.type) {
      return res.status(400).json({ ok: false, error: "Missing action.type" });
    }

    const page = session.page;

    try {
      let result: any = null;

      switch (action.type) {
        case "click":
          await page.click(action.selector);
          break;
        case "fill":
          await page.fill(action.selector, action.value);
          break;
        case "human-click":
          if (action.selector) {
            await humanClick(page, action.selector);
          } else if (action.x !== undefined && action.y !== undefined) {
            await humanClickXY(page, action.x, action.y);
          } else {
            return res.status(400).json({ ok: false, error: "human-click requires selector or x/y coordinates" });
          }
          break;
        case "human-type":
          await humanType(page, action.selector, action.value);
          break;
        case "scroll":
          await page.evaluate((dy: number) => window.scrollBy(0, dy || document.body.scrollHeight), action.deltaY);
          break;
        case "wait":
          await page.waitForTimeout(action.ms || 1000);
          break;
        case "navigate":
          await page.goto(action.url, { waitUntil: action.waitUntil || "domcontentloaded", timeout: 60_000 });
          break;
        case "recaptcha-click":
          result = await clickRecaptchaCheckbox(page);
          break;
        case "recaptcha-select":
          result = await clickChallengeTiles(page, action.tiles);
          break;
        case "recaptcha-verify":
          result = await clickChallengeVerify(page);
          break;
        case "recaptcha-info":
          result = await getChallengeInfo(page);
          break;
        case "recaptcha-solve": {
          const solveResult = await clickRecaptchaCheckbox(page);
          if (solveResult.solved) {
            result = { solved: true };
            break;
          }
          const ci = solveResult.challengeInfo;
          if (ci && ci.tiles && ci.tiles.length > 0) {
            const tileSize = ci.bframeBox ? Math.round((ci.bframeBox.width - 24) / ci.cols) : 125;
            const tiles: { index: number; image: string | null }[] = [];
            for (const tile of ci.tiles) {
              const clip = {
                x: tile.centerX - tileSize / 2,
                y: tile.centerY - tileSize / 2,
                width: tileSize,
                height: tileSize,
              };
              try {
                const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
                tiles.push({ index: tile.index, image: tileBuf.toString("base64") });
              } catch {
                tiles.push({ index: tile.index, image: null });
              }
            }
            result = { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles };
          } else {
            result = { solved: false, prompt: "", tiles: [] };
          }
          break;
        }
        case "recaptcha-answer": {
          await clickChallengeTiles(page, action.tiles);
          const verifyResult = await clickChallengeVerify(page);
          if (verifyResult.solved) {
            result = { solved: true };
          } else {
            const ci2 = verifyResult.challengeInfo;
            if (ci2 && ci2.tiles && ci2.tiles.length > 0) {
              const tileSize2 = ci2.bframeBox ? Math.round((ci2.bframeBox.width - 24) / ci2.cols) : 125;
              const tiles2: { index: number; image: string | null }[] = [];
              for (const tile of ci2.tiles) {
                const clip = {
                  x: tile.centerX - tileSize2 / 2,
                  y: tile.centerY - tileSize2 / 2,
                  width: tileSize2,
                  height: tileSize2,
                };
                try {
                  const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
                  tiles2.push({ index: tile.index, image: tileBuf.toString("base64") });
                } catch {
                  tiles2.push({ index: tile.index, image: null });
                }
              }
              result = { solved: false, prompt: ci2.prompt, rows: ci2.rows, cols: ci2.cols, tiles: tiles2 };
            } else {
              result = { solved: false, tiles: [] };
            }
          }
          break;
        }
        case "recaptcha-solve-auto": {
          result = await solveRecaptcha(page);
          break;
        }
        case "evaluate":
          result = await page.evaluate(action.expression);
          break;
        case "wait-for-selector":
          await page.waitForSelector(action.selector, { timeout: action.timeout || 10_000 });
          break;
        case "keyboard":
          await page.keyboard.press(action.key);
          break;
        case "type-code": {
          const code = String(action.value || "");
          const selector = action.selector || 'input[type="tel"]';
          const firstInput = await page.waitForSelector(selector, { timeout: 5_000 });
          await firstInput!.click();
          await page.waitForTimeout(200);
          for (const digit of code) {
            await page.keyboard.press(digit);
            await page.waitForTimeout(80 + Math.random() * 120);
          }
          result = { typed: code.length };
          break;
        }
        default:
          return res.status(400).json({ ok: false, error: `Unknown action type: ${action.type}` });
      }

      const wantScreenshot = req.body.screenshot !== false;
      let screenshotUrl: string | undefined;
      if (wantScreenshot) {
        const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
        screenshotUrl = saveScreenshot(buf, `act-${Date.now()}.jpg`);
      }

      const response: any = {
        ok: true,
        result,
        screenshotUrl,
        url: page.url(),
        title: await page.title(),
      };

      const challengeInfo = wantScreenshot && result?.challengeInfo ? result.challengeInfo : null;
      if (challengeInfo && challengeInfo.tiles && challengeInfo.tiles.length > 0) {
        const tileSize = challengeInfo.bframeBox
          ? Math.round((challengeInfo.bframeBox.width - 24) / challengeInfo.cols)
          : 125;
        const tileUrls: { index: number; url: string | null }[] = [];
        const ts = Date.now();
        for (const tile of challengeInfo.tiles) {
          const clip = {
            x: tile.centerX - tileSize / 2,
            y: tile.centerY - tileSize / 2,
            width: tileSize,
            height: tileSize,
          };
          try {
            const tileBuf = await page.screenshot({ type: "jpeg", quality: 60, clip });
            const tileUrl = saveScreenshot(tileBuf, `tile-${tile.index}-${ts}.jpg`);
            tileUrls.push({ index: tile.index, url: tileUrl });
          } catch {
            tileUrls.push({ index: tile.index, url: null });
          }
        }
        response.tileUrls = tileUrls;
      }

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Batch actions ───────────────────────────────────────────────

  app.post("/interactive/batch", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }
    const session = display.getSession(req.userId);
    if (!session) {
      return res.status(404).json({ ok: false, error: "No active interactive session" });
    }
    display.resetTimeout(req.userId);

    const { actions } = req.body || {};
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ ok: false, error: "actions must be a non-empty array" });
    }

    const page = session.page;
    const results: any[] = [];

    try {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        let result: any = null;

        try {
          switch (action.type) {
            case "click":
              await page.click(action.selector);
              break;
            case "human-click":
              if (action.selector) await humanClick(page, action.selector);
              else if (action.x !== undefined && action.y !== undefined) await humanClickXY(page, action.x, action.y);
              break;
            case "human-type":
              await humanType(page, action.selector, action.value);
              break;
            case "fill":
              await page.fill(action.selector, action.value);
              break;
            case "navigate":
              await page.goto(action.url, { waitUntil: action.waitUntil || "domcontentloaded", timeout: 60_000 });
              break;
            case "scroll":
              await page.evaluate((dy: number) => window.scrollBy(0, dy || document.body.scrollHeight), action.deltaY);
              break;
            case "wait":
              await page.waitForTimeout(action.ms || 1000);
              break;
            case "evaluate":
              result = await page.evaluate(action.expression);
              break;
            case "wait-for-selector":
              await page.waitForSelector(action.selector, { timeout: action.timeout || 10_000 });
              break;
            case "keyboard":
              await page.keyboard.press(action.key);
              break;
            case "recaptcha-click":
              result = await clickRecaptchaCheckbox(page);
              break;
            case "recaptcha-select":
              result = await clickChallengeTiles(page, action.tiles);
              break;
            case "recaptcha-verify":
              result = await clickChallengeVerify(page);
              break;
          }
          results.push({ index: i, ok: true, result });
        } catch (err: any) {
          results.push({ index: i, ok: false, error: err.message });
          if (!req.body.continueOnError) break;
        }
      }

      let screenshotUrl: string | undefined;
      if (req.body.screenshot !== false) {
        const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
        screenshotUrl = saveScreenshot(buf, `batch-${Date.now()}.jpg`);
      }

      res.json({
        ok: true,
        results,
        screenshotUrl,
        url: page.url(),
        title: await page.title(),
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Session management ─────────────────────────────────────────

  app.delete("/session", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Session management requires token auth" });
    }
    const { deleteSession } = await import("./redis");
    await deleteSession(req.userId);
    res.json({ ok: true });
  });

  // ─── Credential management ──────────────────────────────────────

  app.post("/credentials", async (req: AuthRequest, res: Response) => {
    if (!req.userId || !req.token) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }

    const { domain, username, password, totp_secret, fields } = req.body || {};
    if (!domain) return res.status(400).json({ ok: false, error: "Missing domain" });
    if (!username && !password && !fields) {
      return res.status(400).json({ ok: false, error: "Must provide username, password, or fields" });
    }

    try {
      const credKey = await deriveKey(req.token, "credentials");
      const credential = {
        domain,
        username: username || null,
        password: password || null,
        totp_secret: totp_secret || null,
        fields: fields || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const encrypted = encrypt(JSON.stringify(credential), credKey);
      await setCredential(req.userId, domain, encrypted);

      res.json({ ok: true, domain, message: "Credentials stored" });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/credentials", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }

    try {
      const domains = await listCredentialDomains(req.userId);
      res.json({ ok: true, domains });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete("/credentials/:domain", async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }

    try {
      await deleteCredential(req.userId, req.params.domain);
      res.json({ ok: true, message: `Credentials for ${req.params.domain} deleted` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/credentials/login", async (req: AuthRequest, res: Response) => {
    if (!req.userId || !req.token) {
      return res.status(400).json({ ok: false, error: "Requires token auth" });
    }

    const { domain, usernameSelector, passwordSelector, submitSelector, totpSelector } = req.body || {};
    if (!domain) return res.status(400).json({ ok: false, error: "Missing domain" });

    const session = display.getSession(req.userId);
    if (!session) {
      return res.status(400).json({ ok: false, error: "No active interactive session. Start one first." });
    }

    try {
      const credKey = await deriveKey(req.token, "credentials");
      const blob = await getCredential(req.userId, domain);
      if (!blob || blob.length === 0) {
        return res.status(404).json({ ok: false, error: `No credentials stored for ${domain}` });
      }

      const credential = JSON.parse(decrypt(blob, credKey));
      const page = session.page;

      display.resetTimeout(req.userId);

      if (usernameSelector && credential.username) {
        await humanType(page, usernameSelector, credential.username);
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      }

      if (passwordSelector && credential.password) {
        await humanType(page, passwordSelector, credential.password);
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      }

      if (credential.fields) {
        for (const [selector, value] of Object.entries(credential.fields)) {
          await humanType(page, selector, value as string);
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
        }
      }

      if (submitSelector) {
        await humanClick(page, submitSelector);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      }

      let totpGenerated = false;
      if (totpSelector && credential.totp_secret) {
        const totp = generateTOTP(credential.totp_secret);
        await page.click(totpSelector);
        await page.keyboard.type(totp, { delay: 50 });
        totpGenerated = true;
        await new Promise((r) => setTimeout(r, 300));
      }

      const screenshotBuf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
      const screenshotUrl = saveScreenshot(screenshotBuf, `login-${Date.now()}.jpg`);

      res.json({
        ok: true,
        message: "Login attempted",
        totpGenerated,
        url: page.url(),
        title: await page.title(),
        screenshotUrl,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Headless fetch ─────────────────────────────────────────────

  app.post("/fetch", async (req: AuthRequest, res: Response) => {
    const errors = validateFetchBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, error: errors.join("; ") });
    }

    const {
      url,
      browser: preferredBrowser,
      waitUntil = "domcontentloaded",
      waitForSelector,
      extract,
      actions = [],
      returnHtml = false,
      headers = {},
      locale = "pt-BR",
      sessionless = false,
    } = req.body;

    const useSession = !sessionless && !!req.userId && !!req.token;
    const startedAt = Date.now();
    let context: any;

    try {
      let sessionData: any = null;
      let encryptionKey: Buffer | null = null;

      if (useSession) {
        encryptionKey = await deriveKey(req.token!);
        const blob = await getSession(req.userId!);
        if (blob && blob.length > 0) {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
        }
      }

      const { browser, name: browserName } = await getBrowserWithFallback(preferredBrowser);
      context = await browser.newContext(
        stealthContextOptions({
          locale,
          extraHTTPHeaders: { ...headers },
        })
      );

      if (sessionData) {
        await injectCookies(context, sessionData);
      }

      const page = await context.newPage();
      await applyStealthToPage(page);

      await page.goto(url, { waitUntil, timeout: 60_000 });

      if (sessionData) {
        await injectStorage(page, sessionData);
      }

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10_000 });
      }

      for (const action of actions) {
        if (action.type === "click") await page.click(action.selector);
        else if (action.type === "fill") await page.fill(action.selector, action.value);
        else if (action.type === "wait") await page.waitForTimeout(action.ms);
        else if (action.type === "scroll") await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        else if (action.type === "human-click") await humanClick(page, action.selector);
        else if (action.type === "human-type") await humanType(page, action.selector, action.value);
        else if (action.type === "recaptcha-click") action._result = await clickRecaptchaCheckbox(page);
        else if (action.type === "recaptcha-select") action._result = await clickChallengeTiles(page, action.tiles);
        else if (action.type === "recaptcha-verify") action._result = await clickChallengeVerify(page);
      }

      const finalUrl = page.url();
      const html = returnHtml ? await page.content() : undefined;
      const result = extract ? await page.evaluate(extract) : undefined;

      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey!);
        await setSession(req.userId!, encrypted);
      }

      res.json({ ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message, durationMs: Date.now() - startedAt });
    } finally {
      if (context) await context.close();
    }
  });
}
