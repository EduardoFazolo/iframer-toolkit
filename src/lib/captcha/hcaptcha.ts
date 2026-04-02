import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "patchright";
import { humanClickXY, humanMove } from "../browser/humanize";
import type { StaleStateMonitor } from "../stale-monitor";
import type { SolveResult } from "./recaptcha";

const MAX_ROUNDS = 8;
const MAX_DURATION_MS = 60_000;
const MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — required for captcha auto-solve");
  return new Anthropic({ apiKey });
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Checkbox ───────────────────────────────────────────────────────

async function clickCheckbox(page: Page): Promise<boolean> {
  const checkboxFrame = await page
    .waitForSelector(
      'iframe[src*="hcaptcha.com"], iframe[data-hcaptcha-widget-id], iframe[title*="hCaptcha"]',
      { timeout: 10_000 }
    )
    .catch(() => null);

  if (!checkboxFrame) throw new Error("hCaptcha checkbox iframe not found");

  const box = await checkboxFrame.boundingBox();
  if (!box) throw new Error("hCaptcha iframe not visible");

  await humanMove(page, rand(200, 500), rand(150, 400));
  await sleep(rand(300, 700));

  const cx = box.x + box.width * rand(0.15, 0.35);
  const cy = box.y + box.height * rand(0.3, 0.7);
  await humanClickXY(page, cx, cy);
  await sleep(2500);

  const frame = await checkboxFrame.contentFrame();
  if (frame) {
    try {
      const checked = await frame.evaluate(() => {
        const cb = document.querySelector("#checkbox");
        return cb?.getAttribute("aria-checked") === "true";
      });
      if (checked) return true;
    } catch {}
  }

  return false;
}

// ─── Challenge info ─────────────────────────────────────────────────

interface HCaptchaChallenge {
  prompt: string;
  rows: number;
  cols: number;
  tiles: { index: number; centerX: number; centerY: number }[];
  verifyButton: { x: number; y: number };
  frameBox: { x: number; y: number; width: number; height: number };
}

async function getChallengeInfo(page: Page): Promise<HCaptchaChallenge | null> {
  const challengeFrame = await page
    .waitForSelector(
      'iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]',
      { timeout: 8_000 }
    )
    .catch(() => null);

  if (!challengeFrame) return null;

  const frameBox = await challengeFrame.boundingBox();
  if (!frameBox) return null;

  const frame = await challengeFrame.contentFrame();
  if (!frame) return null;

  const info = await frame
    .evaluate(() => {
      const promptEl = document.querySelector(
        ".prompt-text, .task-instructions, [class*='prompt'], [class*='task-description']"
      );
      const prompt = promptEl ? (promptEl as HTMLElement).innerText.trim() : "";

      const tileEls = document.querySelectorAll(
        ".task-image, [class*='task-grid'] > *, [class*='challenge-container'] .image-wrapper, .image-wrapper"
      );
      const count = tileEls.length;

      let rows = 3, cols = 3;
      if (count === 16) { rows = 4; cols = 4; }
      else if (count === 9) { rows = 3; cols = 3; }
      else if (count === 6) { rows = 2; cols = 3; }

      return { prompt, count, rows, cols };
    })
    .catch(() => ({ prompt: "", count: 0, rows: 3, cols: 3 }));

  if (!info.prompt && info.count === 0) return null;

  const gridPadTop = 150;
  const gridPadLeft = 20;
  const gridPadRight = 20;
  const gridPadBottom = 80;

  const gridWidth = frameBox.width - gridPadLeft - gridPadRight;
  const gridHeight = frameBox.height - gridPadTop - gridPadBottom;

  const tileW = gridWidth / info.cols;
  const tileH = gridHeight / info.rows;

  const tiles: { index: number; centerX: number; centerY: number }[] = [];
  for (let r = 0; r < info.rows; r++) {
    for (let c = 0; c < info.cols; c++) {
      tiles.push({
        index: r * info.cols + c,
        centerX: Math.round(frameBox.x + gridPadLeft + c * tileW + tileW / 2),
        centerY: Math.round(frameBox.y + gridPadTop + r * tileH + tileH / 2),
      });
    }
  }

  const verifyBtnBox = await frame.evaluate(() => {
    const btn = document.querySelector('.button-submit.button, [aria-label="Verify"], [aria-label="Skip Challenge"]') as HTMLElement;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }).catch(() => null);

  const verifyButton = verifyBtnBox
    ? { x: Math.round(frameBox.x + verifyBtnBox.x), y: Math.round(frameBox.y + verifyBtnBox.y) }
    : { x: Math.round(frameBox.x + frameBox.width - 55), y: Math.round(frameBox.y + frameBox.height - 30) };

  console.log(`[hcaptcha-solver] Round challenge: "${info.prompt}" (${info.rows}x${info.cols})`);

  return { prompt: info.prompt, rows: info.rows, cols: info.cols, tiles, verifyButton, frameBox };
}

// ─── Vision classification ──────────────────────────────────────────

async function screenshotChallenge(page: Page, challenge: HCaptchaChallenge): Promise<string | null> {
  const { frameBox } = challenge;
  try {
    await sleep(1000);
    const challengeEl = await page.$('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]').catch(() => null);
    let buf: Buffer;
    if (challengeEl) {
      buf = await challengeEl.screenshot({ type: "jpeg", quality: 85 }) as unknown as Buffer;
    } else {
      buf = await page.screenshot({ type: "jpeg", quality: 85, clip: frameBox });
    }
    return buf.toString("base64");
  } catch (err: any) {
    console.error(`[hcaptcha-solver] screenshot failed: ${err.message}`);
    return null;
  }
}

async function classifyTiles(
  client: Anthropic,
  screenshotBase64: string,
  challenge: HCaptchaChallenge
): Promise<number[]> {
  const { prompt, rows, cols } = challenge;
  const total = rows * cols;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 30,
      system: `Output ONLY a comma-separated list of tile numbers or "none". Valid examples: "0,3,5" or "2" or "none". Output nothing else.`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotBase64 } },
          { type: "text", text: `Task: "${prompt}". Tiles 0-${total - 1} left-to-right top-to-bottom in a ${rows}×${cols} grid. Which tiles match? Reply ONLY with numbers or "none".` },
        ],
      }],
    });

    const text = (response.content[0] as any).text?.trim() || "";
    console.log(`[hcaptcha-solver] classify response: "${text}"`);

    if (text.toLowerCase().startsWith("none")) return [];
    return text
      .split(/[,\s]+/)
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n) && n >= 0 && n < total);
  } catch (err: any) {
    console.error(`[hcaptcha-solver] classification failed: ${err.message}`);
    return [];
  }
}

// ─── Verify ─────────────────────────────────────────────────────────

async function isSolved(page: Page): Promise<boolean> {
  const el = await page
    .$('iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]')
    .catch(() => null);
  if (!el) return true;
  const visible = await el.isVisible().catch(() => false);
  return !visible;
}

async function clickVerify(page: Page, challenge: HCaptchaChallenge): Promise<boolean> {
  await humanClickXY(page, challenge.verifyButton.x, challenge.verifyButton.y);
  await sleep(2500);
  return isSolved(page);
}

// ─── Main solver ─────────────────────────────────────────────────────

export async function solveHCaptcha(page: Page, monitor?: StaleStateMonitor): Promise<SolveResult> {
  const startTime = Date.now();
  const client = getClient();
  let rounds = 0;

  let solvedOnCheckbox = false;
  try {
    solvedOnCheckbox = await clickCheckbox(page);
  } catch (err: any) {
    return { solved: false, rounds: 0, durationMs: Date.now() - startTime, reason: err.message };
  }

  if (solvedOnCheckbox) {
    console.log("[hcaptcha-solver] Solved on checkbox click (no challenge)");
    return { solved: true, rounds: 0, durationMs: Date.now() - startTime };
  }

  while (rounds < MAX_ROUNDS) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Timeout exceeded" };
    }

    rounds++;
    monitor?.reportActivity();

    const challenge = await getChallengeInfo(page);
    if (!challenge) {
      console.log("[hcaptcha-solver] Challenge frame gone — assuming solved");
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }

    const screenshotBase64 = await screenshotChallenge(page, challenge);
    if (!screenshotBase64) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }

    monitor?.reportActivity();
    const matchingIndices = await classifyTiles(client, screenshotBase64, challenge);
    console.log(`[hcaptcha-solver] Round ${rounds}: clicking tiles [${matchingIndices.join(", ")}]`);

    monitor?.reportActivity();

    for (const idx of matchingIndices) {
      const tile = challenge.tiles[idx];
      if (!tile) continue;
      await humanClickXY(page, tile.centerX + rand(-5, 5), tile.centerY + rand(-5, 5));
      await sleep(rand(150, 400));
    }

    await sleep(rand(500, 1000));

    const solved = await clickVerify(page, challenge);
    monitor?.reportActivity();

    if (solved) {
      console.log(`[hcaptcha-solver] Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      return { solved: true, rounds, durationMs: Date.now() - startTime };
    }

    console.log(`[hcaptcha-solver] Round ${rounds}: not solved, retrying`);
    await sleep(rand(500, 1000));
  }

  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS}) exceeded` };
}
