import type { Page } from "patchright";
import { TIMING, CAPTCHA_GRID, TIMEOUTS } from "../constants";

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randRange(range: readonly [number, number]): number {
  return rand(range[0], range[1]);
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function generatePath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
  const steps = Math.floor(rand(25, 55));
  const points: { x: number; y: number }[] = [];

  const cx1 = fromX + (toX - fromX) * rand(0.1, 0.4) + rand(-50, 50);
  const cy1 = fromY + (toY - fromY) * rand(-0.2, 0.5) + rand(-50, 50);
  const cx2 = fromX + (toX - fromX) * rand(0.6, 0.9) + rand(-30, 30);
  const cy2 = fromY + (toY - fromY) * rand(0.5, 1.2) + rand(-30, 30);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    let x = bezierPoint(eased, fromX, cx1, cx2, toX);
    let y = bezierPoint(eased, fromY, cy1, cy2, toY);

    const jitterScale = Math.sin(t * Math.PI) * 2;
    x += rand(-jitterScale, jitterScale);
    y += rand(-jitterScale, jitterScale);

    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  points[points.length - 1] = { x: Math.round(toX), y: Math.round(toY) };
  return points;
}

// Track last mouse position per page using a WeakMap to avoid `as any` on page internals
const mousePositions = new WeakMap<Page, { x: number; y: number }>();

export async function humanMove(page: Page, toX: number, toY: number): Promise<void> {
  const mouse = page.mouse;
  const lastPos = mousePositions.get(page);
  const fromX = lastPos?.x ?? randRange(TIMING.IDLE_MOUSE_X);
  const fromY = lastPos?.y ?? randRange(TIMING.IDLE_MOUSE_Y);

  const path = generatePath(fromX, fromY, toX, toY);

  for (const point of path) {
    await mouse.move(point.x, point.y);
    await sleep(rand(2, 12));
  }

  mousePositions.set(page, { x: toX, y: toY });
}

export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = await page.waitForSelector(selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
  if (!element) throw new Error(`Element not found: ${selector}`);
  const box = await element.boundingBox();
  if (!box) throw new Error(`Element not visible: ${selector}`);

  const targetX = box.x + box.width * rand(0.3, 0.7);
  const targetY = box.y + box.height * rand(0.3, 0.7);

  await humanMove(page, targetX, targetY);
  await sleep(randRange(TIMING.MOUSE_MOVE));

  await page.mouse.down();
  await sleep(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep(randRange(TIMING.POST_CLICK));
}

export async function humanClickXY(page: Page, x: number, y: number): Promise<void> {
  await humanMove(page, x, y);
  await sleep(randRange(TIMING.MOUSE_MOVE));
  await page.mouse.down();
  await sleep(randRange(TIMING.CLICK_HOLD));
  await page.mouse.up();
  await sleep(randRange(TIMING.POST_CLICK));
}

export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await humanClick(page, selector);
  await sleep(randRange(TIMING.POST_CLICK));

  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(randRange(TIMING.CHAR_DELAY));
    if (Math.random() < 0.05) {
      await sleep(randRange(TIMING.WORD_PAUSE));
    }
  }
}

export interface TileInfo {
  row: number;
  col: number;
  index: number;
  centerX: number;
  centerY: number;
}

export interface ChallengeInfo {
  prompt: string;
  rows: number;
  cols: number;
  tiles: TileInfo[];
  verifyButton: { x: number; y: number };
  bframeBox: { x: number; y: number; width: number; height: number };
}

export async function clickRecaptchaCheckbox(page: Page): Promise<{ solved: boolean; challenge: boolean; challengeInfo?: ChallengeInfo | null }> {
  const recaptchaFrame = await page.waitForSelector(
    'iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]',
    { timeout: TIMEOUTS.SELECTOR_WAIT }
  );
  if (!recaptchaFrame) throw new Error("reCAPTCHA iframe not found");

  const frame = await recaptchaFrame.contentFrame();
  if (!frame) throw new Error("Could not access reCAPTCHA iframe");

  await frame.waitForSelector(".recaptcha-checkbox-border, #recaptcha-anchor", { timeout: TIMEOUTS.SELECTOR_WAIT });

  const recaptchaBox = await recaptchaFrame.boundingBox();
  if (!recaptchaBox) throw new Error("reCAPTCHA iframe not visible");

  const checkboxX = recaptchaBox.x + rand(20, 35);
  const checkboxY = recaptchaBox.y + recaptchaBox.height * rand(0.35, 0.65);

  await humanMove(page, randRange(TIMING.PRE_CHECKBOX_X), randRange(TIMING.PRE_CHECKBOX_Y));
  await sleep(randRange(TIMING.PRE_CHECKBOX_WAIT));

  await humanClickXY(page, checkboxX, checkboxY);
  await sleep(TIMING.POST_CHECKBOX_WAIT);

  try {
    const checked = await frame.evaluate(() => {
      const anchor = document.querySelector("#recaptcha-anchor");
      return anchor && anchor.getAttribute("aria-checked") === "true";
    });
    if (checked) return { solved: true, challenge: false };
  } catch {}

  const challengeInfo = await getChallengeInfo(page);
  return { solved: false, challenge: true, challengeInfo };
}

export async function getChallengeInfo(page: Page): Promise<ChallengeInfo | null> {
  const bframe = await page
    .waitForSelector(
      'iframe[title*="desafio reCAPTCHA"], iframe[title*="recaptcha challenge"], iframe[src*="recaptcha/api2/bframe"]',
      { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT }
    )
    .catch(() => null);

  if (!bframe) return null;

  const bframeBox = await bframe.boundingBox();
  if (!bframeBox) return null;

  const frame = await bframe.contentFrame();
  if (!frame) return null;

  const info = await frame
    .evaluate(() => {
      const promptEl = document.querySelector(".rc-imageselect-desc-wrapper, .rc-imageselect-instructions");
      const prompt = promptEl ? (promptEl as HTMLElement).innerText.trim() : "";

      const table = document.querySelector(
        "table.rc-imageselect-table, table.rc-imageselect-table-33, table.rc-imageselect-table-44"
      );
      let rows = 0, cols = 0;
      if (table) {
        const trs = table.querySelectorAll("tr");
        rows = trs.length;
        cols = trs[0] ? trs[0].querySelectorAll("td").length : 0;
      }

      const verifyBtn = document.querySelector("#recaptcha-verify-button");
      const verifyText = verifyBtn ? (verifyBtn as HTMLElement).innerText.trim() : "";

      return { prompt, rows, cols, verifyText };
    })
    .catch(() => ({ prompt: "", rows: 0, cols: 0, verifyText: "" }));

  const gridStartX = bframeBox.x + CAPTCHA_GRID.GRID_MARGIN;
  const gridStartY = bframeBox.y + CAPTCHA_GRID.HCAPTCHA_HEADER_HEIGHT;
  const gridWidth = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;
  const gridHeight = bframeBox.width - CAPTCHA_GRID.GRID_PADDING;

  const tileWidth = info.cols > 0 ? gridWidth / info.cols : 0;
  const tileHeight = info.rows > 0 ? gridHeight / info.rows : 0;

  const tiles: TileInfo[] = [];
  for (let r = 0; r < info.rows; r++) {
    for (let c = 0; c < info.cols; c++) {
      tiles.push({
        row: r,
        col: c,
        index: r * info.cols + c,
        centerX: Math.round(gridStartX + c * tileWidth + tileWidth / 2),
        centerY: Math.round(gridStartY + r * tileHeight + tileHeight / 2),
      });
    }
  }

  const verifyBtnY = bframeBox.y + bframeBox.height - CAPTCHA_GRID.VERIFY_BTN_BOTTOM_OFFSET;
  const verifyBtnX = bframeBox.x + bframeBox.width - CAPTCHA_GRID.VERIFY_BTN_RIGHT_OFFSET;

  return {
    prompt: info.prompt,
    rows: info.rows,
    cols: info.cols,
    tiles,
    verifyButton: { x: Math.round(verifyBtnX), y: Math.round(verifyBtnY) },
    bframeBox,
  };
}

export async function clickChallengeTiles(
  page: Page,
  tileIndices: number[]
): Promise<{ clicked: number[]; challengeInfo: ChallengeInfo | null }> {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo || !challengeInfo.tiles.length) {
    throw new Error("No active reCAPTCHA challenge found");
  }

  const clicked: number[] = [];
  for (const idx of tileIndices) {
    const tile = challengeInfo.tiles.find((t) => t.index === idx);
    if (!tile) continue;

    await humanClickXY(page, tile.centerX, tile.centerY);
    await sleep(randRange(TIMING.TILE_CLICK_DELAY));
    clicked.push(idx);
  }

  return { clicked, challengeInfo };
}

export async function clickChallengeVerify(
  page: Page
): Promise<{ solved: boolean; challengeInfo?: ChallengeInfo | null }> {
  const challengeInfo = await getChallengeInfo(page);
  if (!challengeInfo) throw new Error("No active reCAPTCHA challenge found");

  await humanClickXY(page, challengeInfo.verifyButton.x, challengeInfo.verifyButton.y);
  await sleep(TIMING.POST_VERIFY_WAIT);

  const anchorFrame = await page
    .waitForSelector('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"]', { timeout: TIMEOUTS.CHALLENGE_FRAME_WAIT })
    .catch(() => null);

  if (anchorFrame) {
    const frame = await anchorFrame.contentFrame();
    if (frame) {
      try {
        const checked = await frame.evaluate(() => {
          const anchor = document.querySelector("#recaptcha-anchor");
          return anchor && anchor.getAttribute("aria-checked") === "true";
        });
        if (checked) return { solved: true };
      } catch {}
    }
  }

  const newInfo = await getChallengeInfo(page);
  return { solved: false, challengeInfo: newInfo };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
