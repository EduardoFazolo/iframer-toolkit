import type { Page } from "patchright";
import type { PipelineStep, StepResult, ExecutionContext } from "./types";
import { STEALTH_SCRIPT } from "./browser/stealth";
import { contextStealthScripts } from "./browser/session-manager";
import {
  humanClick,
  humanClickXY,
  humanType,
  clickRecaptchaCheckbox,
  clickChallengeTiles,
  clickChallengeVerify,
  getChallengeInfo,
} from "./browser/humanize";
import { solveRecaptcha } from "./captcha/recaptcha";
import { solveHCaptcha } from "./captcha/hcaptcha";
import { deriveKey, decrypt, generateTOTP } from "./auth/crypto";
import { getCredential } from "./session/redis";
import { saveScreenshot } from "./screenshot";
import type { StaleStateMonitor } from "./stale-monitor";

export async function executeAction(
  page: Page,
  step: PipelineStep,
  ctx: ExecutionContext,
  monitor?: StaleStateMonitor
): Promise<StepResult> {
  const start = Date.now();
  const stepIndex = -1; // caller sets this

  try {
    let result: any = null;

    switch (step.type) {
      case "navigate":
        await page.goto(step.url, {
          waitUntil: (step.waitUntil as any) || "domcontentloaded",
          timeout: 60_000,
        });
        // patchright blocks addInitScript — evaluate stealth patches post-load instead
        // Use per-session fingerprinted script if available, else fall back to default
        const stealthScript = contextStealthScripts.get(page.context()) ?? STEALTH_SCRIPT;
        try { await page.evaluate(stealthScript); } catch (_) {}
        break;

      case "click":
        await page.click(step.selector);
        break;

      case "fill":
        await page.fill(step.selector, step.value);
        break;

      case "human-click":
        if (step.selector) {
          await humanClick(page, step.selector);
        } else if (step.x !== undefined && step.y !== undefined) {
          await humanClickXY(page, step.x, step.y);
        } else {
          throw new Error("human-click requires selector or x/y coordinates");
        }
        break;

      case "right-click":
        if (step.selector) {
          await page.click(step.selector, { button: "right" });
        } else if (step.x !== undefined && step.y !== undefined) {
          await page.mouse.click(step.x, step.y, { button: "right" });
        } else {
          throw new Error("right-click requires selector or x/y coordinates");
        }
        break;

      case "human-type":
        await humanType(page, step.selector, step.value);
        break;

      case "evaluate":
        result = await page.evaluate(step.expression as any);
        break;

      case "extract":
        result = await page.evaluate(step.expression as any);
        break;

      case "wait":
        await page.waitForTimeout(step.ms);
        break;

      case "wait-for":
        await page.waitForSelector(step.selector, { timeout: step.timeout || 10_000 });
        break;

      case "scroll":
        await page.evaluate((dy) => window.scrollBy(0, dy || document.body.scrollHeight), step.deltaY ?? 0);
        break;

      case "keyboard":
        await page.keyboard.press(step.key);
        break;

      case "type-code": {
        const code = String(step.value || "");
        const selector = step.selector || 'input[type="tel"]';
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

      case "recaptcha-click":
        result = await clickRecaptchaCheckbox(page);
        break;

      case "recaptcha-select":
        result = await clickChallengeTiles(page, step.tiles);
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
        await clickChallengeTiles(page, step.tiles);
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

      case "solve-captcha": {
        // Wait briefly for captcha iframes to load, then auto-detect type
        await page.waitForTimeout(1500);

        const isHCaptcha = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          return iframes.some(f => {
            const src = f.src || '';
            const title = (f.title || '').toLowerCase();
            return src.includes('hcaptcha.com') ||
                   title.includes('hcaptcha') ||
                   !!document.querySelector('[data-hcaptcha-widget-id]');
          });
        }).catch(() => false);

        console.log(`[solve-captcha] detected: ${isHCaptcha ? 'hCaptcha' : 'reCAPTCHA'}`);

        result = isHCaptcha
          ? await solveHCaptcha(page, monitor)
          : await solveRecaptcha(page, monitor);
        break;
      }

      case "screenshot": {
        const buf = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false });
        const url = saveScreenshot(buf, `step-${Date.now()}.jpg`, ctx.screenshotDir, ctx.publicUrl);
        result = { screenshotUrl: url };
        break;
      }

      case "login": {
        const credKey = await deriveKey(ctx.token, "credentials");
        const blob = await getCredential(ctx.userId, step.domain);
        if (!blob || blob.length === 0) {
          throw new Error(`No credentials stored for ${step.domain}`);
        }
        const credential = JSON.parse(decrypt(blob, credKey));

        const reactFill = async (selector: string, value: string) => {
          await page.click(selector);
          await page.waitForTimeout(150);
          await page.evaluate(([sel, val]) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, [selector, value]);
          await page.waitForTimeout(300 + Math.random() * 400);
        };

        if (step.usernameSelector && credential.username) {
          await reactFill(step.usernameSelector, credential.username);
        }
        if (step.passwordSelector && credential.password) {
          await reactFill(step.passwordSelector, credential.password);
        }
        if (step.submitSelector) {
          await humanClick(page, step.submitSelector);
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForTimeout(1500);
        }
        if (step.totpSelector && credential.totp_secret) {
          const totp = generateTOTP(credential.totp_secret);
          await page.click(step.totpSelector);
          await page.keyboard.type(totp, { delay: 50 });
          await page.waitForTimeout(300);
        }
        result = { loggedIn: true, url: page.url() };
        break;
      }

      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }

    return {
      stepIndex,
      step,
      ok: true,
      result,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      stepIndex,
      step,
      ok: false,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}
