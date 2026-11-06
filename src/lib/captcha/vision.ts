import Anthropic from "@anthropic-ai/sdk";

export const CAPTCHA_MODEL = process.env.IFRAMER_CAPTCHA_MODEL || "claude-haiku-4-5-20251001";

/** A model call failed. Retrying can't help (the SDK already retried 429s and
 *  5xx), so solvers stop at once and report this message rather than clicking
 *  through rounds with no answers. */
export class CaptchaApiError extends Error {}

export function getCaptchaClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — required for captcha auto-solve");
  return new Anthropic({ apiKey });
}

export function toCaptchaApiError(err: unknown): CaptchaApiError {
  if (err instanceof Anthropic.APIConnectionError) {
    const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
    return new CaptchaApiError(`Claude API call failed (no response): ${err.message}${cause}`);
  }
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    return new CaptchaApiError(`Claude API call failed (${err.status ?? "no response"}): ${body?.error?.message ?? err.message}`);
  }
  return new CaptchaApiError(`Claude API call failed: ${err instanceof Error ? err.message : String(err)}`);
}

export async function askVision(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
): Promise<string> {
  try {
    const response = await client.messages.create({ ...params, model: CAPTCHA_MODEL });
    return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  } catch (err: unknown) {
    throw toCaptchaApiError(err);
  }
}

export interface Point { x: number; y: number }
export type ChallengeAnswer = { clicks: Point[] } | { drag: { from: Point; to: Point } };

const MAX_CLICKS = 12;

/**
 * Reads the answer from the LAST JSON object in a model reply. Models often
 * explain first, so anything looser than this picks up stray numbers from the
 * prose ("3×3" once meant "click tile 3"). Returns null when there's no usable
 * answer, or when any point falls outside the image, and then nothing is clicked.
 */
export function parseChallengeAnswer(text: string, width: number, height: number): ChallengeAnswer | null {
  const candidates = text.match(/\{[^{}]*\}/g);
  if (!candidates) return null;
  const toPoint = (p: unknown): Point | null => {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (typeof x !== "number" || typeof y !== "number") return null;
    return x >= 0 && y >= 0 && x <= width && y <= height ? { x, y } : null;
  };

  for (const raw of candidates.reverse()) {
    let parsed: { clicks?: unknown; drag?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (Array.isArray(parsed.drag)) {
      if (parsed.drag.length !== 2) return null;
      const from = toPoint(parsed.drag[0]);
      const to = toPoint(parsed.drag[1]);
      return from && to ? { drag: { from, to } } : null;
    }
    if (Array.isArray(parsed.clicks)) {
      if (parsed.clicks.length > MAX_CLICKS) return null;
      const clicks = parsed.clicks.map(toPoint);
      return clicks.every((c): c is Point => c !== null) ? { clicks } : null;
    }
  }
  return null;
}
