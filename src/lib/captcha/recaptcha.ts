import Anthropic from "@anthropic-ai/sdk";
import type { Page } from "patchright";
import {
  clickRecaptchaCheckbox,
  getChallengeInfo,
  clickChallengeTiles,
  clickChallengeVerify,
  humanClick,
  type ChallengeInfo,
} from "../browser/humanize";
import type { StaleStateMonitor } from "../stale-monitor";

const MAX_ROUNDS = 8;
const MAX_DURATION_MS = 45_000;
const TILE_SETTLE_MS = 800;
const MODEL = "claude-haiku-4-5-20251001";

export interface SolveResult {
  solved: boolean;
  rounds: number;
  durationMs: number;
  submitted?: boolean;
  reason?: string;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — required for captcha auto-solve");
  return new Anthropic({ apiKey });
}

function extractTarget(prompt: string): string {
  const lines = prompt.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/select all (images|squares) with/i.test(lines[i])) {
      const afterWith = lines[i].replace(/.*with\s*/i, "").trim();
      if (afterWith && afterWith.length > 1 && !/click/i.test(afterWith)) {
        return afterWith.replace(/^a\s+/i, "").trim();
      }
      if (i + 1 < lines.length && !/click/i.test(lines[i + 1])) {
        return lines[i + 1].replace(/^a\s+/i, "").trim();
      }
    }
  }

  return lines[1] || prompt;
}

async function screenshotFullGrid(
  page: Page,
  challengeInfo: ChallengeInfo
): Promise<string | null> {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox || rows === 0 || cols === 0) return null;

  const gridClip = {
    x: bframeBox.x + 14,
    y: bframeBox.y + 112,
    width: bframeBox.width - 28,
    height: bframeBox.width - 28,
  };

  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 85, clip: gridClip });
    return buf.toString("base64");
  } catch (err: any) {
    console.error(`[captcha-solver] full grid screenshot failed: ${err.message}`);
    return null;
  }
}

async function screenshotTiles(
  page: Page,
  challengeInfo: ChallengeInfo
): Promise<{ index: number; imageBase64: string }[]> {
  const { bframeBox, rows, cols } = challengeInfo;
  if (!bframeBox) return [];

  const gridX = bframeBox.x + 14;
  const gridY = bframeBox.y + 112;
  const gridSize = bframeBox.width - 28;
  const tileW = gridSize / cols;
  const tileH = gridSize / rows;

  const tiles: { index: number; imageBase64: string }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clip = {
        x: gridX + c * tileW + 2,
        y: gridY + r * tileH + 2,
        width: tileW - 4,
        height: tileH - 4,
      };
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 85, clip });
        tiles.push({ index: r * cols + c, imageBase64: buf.toString("base64") });
      } catch {}
    }
  }

  return tiles;
}

async function classifyTiles(
  client: Anthropic,
  fullGridBase64: string,
  tiles: { index: number; imageBase64: string }[],
  target: string,
  rows: number,
  cols: number
): Promise<number[]> {
  const results = await Promise.all(
    tiles.map(async (tile) => {
      const tileRow = Math.floor(tile.index / cols) + 1;
      const tileCol = (tile.index % cols) + 1;

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 10,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/jpeg", data: fullGridBase64 },
                },
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/jpeg", data: tile.imageBase64 },
                },
                {
                  type: "text",
                  text: `Image 1 is a full picture divided into a ${rows}x${cols} grid. Image 2 is the tile at row ${tileRow}, column ${tileCol} of that grid.

Does this tile contain a ${target}? Reply ONLY "yes" or "no".`,
                },
              ],
            },
          ],
        });

        const answer = (response.content[0] as any).text?.toLowerCase().trim() || "";
        const match = answer.startsWith("yes");
        if (match) console.log(`[captcha-solver] tile ${tile.index} (r${tileRow}c${tileCol}): YES`);
        return { index: tile.index, match };
      } catch (err: any) {
        console.error(`[captcha-solver] tile ${tile.index} classification failed: ${err.message}`);
        return { index: tile.index, match: false };
      }
    })
  );

  return results.filter((r) => r.match).map((r) => r.index);
}

async function submitForm(page: Page): Promise<boolean> {
  const selectors = [
    'form:has([data-sitekey]) [type="submit"]',
    'form:has(.g-recaptcha) [type="submit"]',
    'form:has(iframe[src*="recaptcha"]) [type="submit"]',
    'form [type="submit"]',
    'form button:not([type="button"]):not([type="reset"])',
    'input[type="submit"]',
    'button[type="submit"]',
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const visible = await el.isVisible();
        if (visible) {
          console.log(`[captcha-solver] Submitting form via: ${selector}`);
          await new Promise((r) => setTimeout(r, 500));
          await humanClick(page, selector);
          await new Promise((r) => setTimeout(r, 2000));
          return true;
        }
      }
    } catch {}
  }

  console.log("[captcha-solver] No submit button found — skipping form submission");
  return false;
}

export async function solveRecaptcha(page: Page, monitor?: StaleStateMonitor): Promise<SolveResult> {
  const startTime = Date.now();
  const client = getClient();
  let rounds = 0;

  const checkboxResult = await clickRecaptchaCheckbox(page);
  if (checkboxResult.solved) {
    const submitted = await submitForm(page);
    return { solved: true, rounds: 0, durationMs: Date.now() - startTime, submitted };
  }

  if (!checkboxResult.challengeInfo) {
    return { solved: false, rounds: 0, durationMs: Date.now() - startTime, reason: "No challenge appeared after clicking checkbox" };
  }

  let challengeInfo: ChallengeInfo | null = checkboxResult.challengeInfo;

  while (rounds < MAX_ROUNDS) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Timeout exceeded" };
    }

    rounds++;
    monitor?.reportActivity();
    const target = extractTarget(challengeInfo!.prompt);
    console.log(`[captcha-solver] Round ${rounds}: looking for "${target}" in ${challengeInfo!.rows}x${challengeInfo!.cols} grid`);

    const [fullGridImage, tileImages] = await Promise.all([
      screenshotFullGrid(page, challengeInfo!),
      screenshotTiles(page, challengeInfo!),
    ]);

    if (!fullGridImage || tileImages.length === 0) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Failed to screenshot challenge" };
    }

    monitor?.reportActivity();
    const matchingIndices = await classifyTiles(
      client, fullGridImage, tileImages, target,
      challengeInfo!.rows, challengeInfo!.cols
    );

    console.log(`[captcha-solver] Round ${rounds}: matched tiles [${matchingIndices.join(", ")}]`);
    monitor?.reportActivity();

    if (matchingIndices.length > 0) {
      await clickChallengeTiles(page, matchingIndices);

      const isDynamic = challengeInfo!.prompt.toLowerCase().includes("none left");
      if (isDynamic) {
        await new Promise((r) => setTimeout(r, TILE_SETTLE_MS));

        const newInfo = await getChallengeInfo(page);
        if (newInfo) {
          const [newFullGrid, newTiles] = await Promise.all([
            screenshotFullGrid(page, newInfo),
            screenshotTiles(page, newInfo),
          ]);

          if (newFullGrid && newTiles.length > 0) {
            const replacedTiles = newTiles.filter((t) => matchingIndices.includes(t.index));
            if (replacedTiles.length > 0) {
              monitor?.reportActivity();
              const newMatches = await classifyTiles(
                client, newFullGrid, replacedTiles, target,
                newInfo.rows, newInfo.cols
              );
              if (newMatches.length > 0) {
                console.log(`[captcha-solver] Round ${rounds}: dynamic tiles matched [${newMatches.join(", ")}]`);
                await clickChallengeTiles(page, newMatches);
                await new Promise((r) => setTimeout(r, TILE_SETTLE_MS));
              }
            }
          }
        }
      }
    }

    const verifyResult = await clickChallengeVerify(page);
    monitor?.reportActivity();
    if (verifyResult.solved) {
      console.log(`[captcha-solver] Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
      const submitted = await submitForm(page);
      return { solved: true, rounds, durationMs: Date.now() - startTime, submitted };
    }

    challengeInfo = verifyResult.challengeInfo || null;
    if (!challengeInfo) {
      return { solved: false, rounds, durationMs: Date.now() - startTime, reason: "Challenge disappeared after verify" };
    }

    console.log(`[captcha-solver] Round ${rounds}: not solved, new challenge appeared`);
  }

  return { solved: false, rounds, durationMs: Date.now() - startTime, reason: `Max rounds (${MAX_ROUNDS}) exceeded` };
}
