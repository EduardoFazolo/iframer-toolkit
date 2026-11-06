import type Anthropic from "@anthropic-ai/sdk";
import type { ElementHandle, Frame, Page } from "patchright";
import { humanClickXY, humanMove } from "../browser/humanize";
import type { StaleStateMonitor } from "../stale-monitor";
import type { SolveResult } from "./recaptcha";
import { askVision, CaptchaApiError, getCaptchaClient, parseChallengeAnswer, type ChallengeAnswer } from "./vision";
import { createLogger } from "../logger";

const log = createLogger("hcaptcha-solver");

const MAX_ROUNDS = 8;
const MAX_DURATION_MS = 60_000;
const CHALLENGE_FRAME = 'iframe[title="hCaptcha challenge"], iframe[title*="hcaptcha challenge" i]';

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Token: the only proof of a solve ───────────────────────────────

/** hCaptcha writes the response token into the page once it accepts a solve. A
 *  closed challenge frame proves nothing: it also closes on errors and expiry. */
async function hasToken(page: Page, waitMs = 0): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const found = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('[name="h-captcha-response"]')).some(
          (el) => (el as HTMLTextAreaElement).value.length > 0,
        ),
      )
      .catch(() => false);
    if (found || Date.now() >= deadline) return found;
    await sleep(250);
  }
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

  return hasToken(page);
}

// ─── Challenge ──────────────────────────────────────────────────────

interface HCaptchaChallenge {
  prompt: string;
  /** What the model looks at, and what its coordinates are relative to. */
  target: ElementHandle;
  box: { x: number; y: number; width: number; height: number };
  frame: Frame;
}

/** Current hCaptcha draws the whole task on a single <canvas> with no element
 *  per tile, so a task can only be answered in coordinates. Falls back to the
 *  whole challenge frame if a challenge has no canvas. */
async function getChallenge(page: Page): Promise<HCaptchaChallenge | null> {
  const challengeFrame = await page.waitForSelector(CHALLENGE_FRAME, { timeout: 8_000 }).catch(() => null);
  if (!challengeFrame) return null;

  const frame = await challengeFrame.contentFrame();
  if (!frame) return null;

  const prompt = await frame
    .evaluate(() => {
      const el = document.querySelector(".prompt-text, .task-instructions, [class*='prompt'], [class*='task-description']");
      return el ? (el as HTMLElement).innerText.trim() : "";
    })
    .catch(() => "");
  if (!prompt) return null;

  const target = (await frame.$("canvas").catch(() => null)) ?? challengeFrame;
  const box = await target.boundingBox();
  if (!box) return null;

  log.info(`Round challenge: "${prompt}" (${Math.round(box.width)}x${Math.round(box.height)})`);
  return { prompt, target, box, frame };
}

async function askForAnswer(client: Anthropic, challenge: HCaptchaChallenge): Promise<ChallengeAnswer | null> {
  // scale:"css" keeps image pixels equal to page pixels on high-DPI screens.
  const buf = await challenge.target.screenshot({ type: "jpeg", quality: 85, scale: "css" });
  const width = Math.round(challenge.box.width);
  const height = Math.round(challenge.box.height);

  const text = await askVision(client, {
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(buf).toString("base64") } },
        {
          type: "text",
          text: `This image is ${width}x${height} pixels. The task shown with it: "${challenge.prompt}".
Work out the answer, then end your reply with one line of JSON, using pixel coordinates in this image.
To click: {"clicks":[[x,y],[x,y]]}
To drag: {"drag":[[fromX,fromY],[toX,toY]]}
If you can't tell: {"clicks":[]}`,
        },
      ],
    }],
  });

  const answer = parseChallengeAnswer(text, width, height);
  if (!answer) log.warn(`no usable answer in model reply: "${text.slice(0, 120)}"`);
  return answer;
}

async function perform(page: Page, challenge: HCaptchaChallenge, answer: ChallengeAnswer): Promise<void> {
  const { x, y } = challenge.box;
  if ("drag" in answer) {
    await humanMove(page, x + answer.drag.from.x, y + answer.drag.from.y);
    await sleep(rand(100, 250));
    await page.mouse.down();
    await humanMove(page, x + answer.drag.to.x, y + answer.drag.to.y);
    await sleep(rand(100, 250));
    await page.mouse.up();
    return;
  }
  for (const click of answer.clicks) {
    await humanClickXY(page, x + click.x, y + click.y);
    await sleep(rand(150, 400));
  }
}

/** The one submit button. It reads Verify, Next or Skip depending on the state,
 *  and with nothing answered it asks for a different task. */
async function clickSubmit(page: Page, challenge: HCaptchaChallenge): Promise<void> {
  const button = await challenge.frame.$(".button-submit").catch(() => null);
  const box = button ? await button.boundingBox() : null;
  if (!box) throw new Error("hCaptcha submit button not found");
  await humanClickXY(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(2500);
}

// ─── Main solver ─────────────────────────────────────────────────────

export async function solveHCaptcha(page: Page, monitor?: StaleStateMonitor): Promise<SolveResult> {
  const startTime = Date.now();
  const client = getCaptchaClient();
  const result = (solved: boolean, reason?: string): SolveResult => ({
    solved, rounds, durationMs: Date.now() - startTime, ...(reason ? { reason } : {}),
  });
  let rounds = 0;

  try {
    if (await clickCheckbox(page)) {
      log.info("Solved on checkbox click (no challenge)");
      return result(true);
    }

    while (rounds < MAX_ROUNDS) {
      if (Date.now() - startTime > MAX_DURATION_MS) return result(false, "Timeout exceeded");

      rounds++;
      monitor?.reportActivity();

      const challenge = await getChallenge(page);
      if (!challenge) {
        if (await hasToken(page, 3000)) return result(true);
        return result(false, "The challenge closed without a token");
      }

      await sleep(1000); // the canvas draws after the frame appears
      const answer = await askForAnswer(client, challenge);
      monitor?.reportActivity();
      log.info(`Round ${rounds}: ${answer ? JSON.stringify(answer) : "no answer"}`);

      if (answer) await perform(page, challenge, answer);
      await sleep(rand(500, 1000));
      await clickSubmit(page, challenge);
      monitor?.reportActivity();

      if (await hasToken(page)) {
        log.info(`Solved in ${rounds} rounds, ${Date.now() - startTime}ms`);
        return result(true);
      }
      log.info(`Round ${rounds}: not solved, retrying`);
    }

    return result(false, `Max rounds (${MAX_ROUNDS}) exceeded`);
  } catch (err: unknown) {
    if (err instanceof CaptchaApiError) return result(false, err.message);
    return result(false, err instanceof Error ? err.message : String(err));
  }
}
