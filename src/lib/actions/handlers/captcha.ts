import type { Page } from "patchright";
import type { PipelineStep } from "../../types";
import type { StaleStateMonitor } from "../../stale-monitor";
import type { ChallengePresentation, ChallengeTile, CaptchaSolveResult } from "../types";
import {
  clickRecaptchaCheckbox,
  clickChallengeTiles,
  clickChallengeVerify,
  getChallengeInfo,
} from "../../browser/humanize";
import { solveRecaptcha } from "../../captcha/recaptcha";
import { solveHCaptcha } from "../../captcha/hcaptcha";
import { createLogger } from "../../logger";
import { TIMING, CAPTCHA_GRID } from "../../constants";

const log = createLogger("actions");

type Step<K extends PipelineStep["type"]> = Extract<PipelineStep, { type: K }>;

async function screenshotTiles(
  page: Page,
  ci: NonNullable<Awaited<ReturnType<typeof clickRecaptchaCheckbox>>["challengeInfo"]>
): Promise<ChallengeTile[]> {
  const tileSize = ci.bframeBox ? Math.round((ci.bframeBox.width - CAPTCHA_GRID.GRID_PADDING) / ci.cols) : CAPTCHA_GRID.DEFAULT_TILE_SIZE;
  const tiles: ChallengeTile[] = [];
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
  return tiles;
}

// ─── Direct recaptcha step handlers ─────────────────────────────────

export function recaptchaClick(page: Page) {
  return clickRecaptchaCheckbox(page);
}

export function recaptchaSelect(page: Page, step: Step<"recaptcha-select">) {
  return clickChallengeTiles(page, step.tiles);
}

export function recaptchaVerify(page: Page) {
  return clickChallengeVerify(page);
}

export function recaptchaInfo(page: Page) {
  return getChallengeInfo(page);
}

// ─── Composed captcha handlers ──────────────────────────────────────

export async function recaptchaSolve(page: Page): Promise<ChallengePresentation> {
  const solveResult = await clickRecaptchaCheckbox(page);
  if (solveResult.solved) return { solved: true };

  const ci = solveResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles(page, ci) };
  }
  return { solved: false, prompt: "", tiles: [] };
}

export async function recaptchaAnswer(page: Page, step: Step<"recaptcha-answer">): Promise<ChallengePresentation> {
  await clickChallengeTiles(page, step.tiles);
  const verifyResult = await clickChallengeVerify(page);
  if (verifyResult.solved) return { solved: true };

  const ci = verifyResult.challengeInfo;
  if (ci && ci.tiles && ci.tiles.length > 0) {
    return { solved: false, prompt: ci.prompt, rows: ci.rows, cols: ci.cols, tiles: await screenshotTiles(page, ci) };
  }
  return { solved: false, tiles: [] };
}

export async function solveCaptcha(page: Page, _step: Step<"solve-captcha">, _ctx: unknown, monitor?: StaleStateMonitor): Promise<CaptchaSolveResult> {
  await page.waitForTimeout(TIMING.CAPTCHA_DETECT_WAIT);

  const isHCaptcha = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    return iframes.some(f => {
      const src = f.src || '';
      const title = (f.title || '').toLowerCase();
      return src.includes('hcaptcha.com') ||
             title.includes('hcaptcha') ||
             !!document.querySelector('[data-hcaptcha-widget-id]');
    });
  }).catch((err) => {
    log.warn(`captcha detection failed: ${err}`);
    return false;
  });

  log.info(`detected: ${isHCaptcha ? 'hCaptcha' : 'reCAPTCHA'}`);

  return isHCaptcha
    ? await solveHCaptcha(page, monitor)
    : await solveRecaptcha(page, monitor);
}
