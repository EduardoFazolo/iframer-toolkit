import type { Page } from "patchright";
import type {
  DetectedObstacle,
  ObstacleDetector,
  ObstacleResolver,
  ResolutionResult,
  ExecutionContext,
} from "./types";
import { defaultDetectors } from "./captcha/detector";
import { solveRecaptcha } from "./captcha/recaptcha";
import { solveHCaptcha } from "./captcha/hcaptcha";
import { humanClick } from "./browser/humanize";
import type { StaleStateMonitor } from "./stale-monitor";

// ─── Resolvers ──────────────────────────────────────────────────────

class RecaptchaResolver implements ObstacleResolver {
  canResolve(obstacle: DetectedObstacle): boolean {
    return obstacle.type === "captcha";
  }

  async resolve(page: Page, _obstacle: DetectedObstacle, _ctx: ExecutionContext, monitor?: StaleStateMonitor): Promise<ResolutionResult> {
    try {
      const result = await solveRecaptcha(page, monitor);
      if (result.solved) {
        return { resolved: true, resolution: `auto-solved-recaptcha in ${result.rounds} rounds` };
      }
      return { resolved: false, error: result.reason || "reCAPTCHA solve failed" };
    } catch (err: unknown) {
      return { resolved: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

class CookieConsentResolver implements ObstacleResolver {
  canResolve(obstacle: DetectedObstacle): boolean {
    return obstacle.type === "cookie-consent";
  }

  async resolve(page: Page): Promise<ResolutionResult> {
    const keywords = ["accept all", "accept cookies", "allow cookies", "i accept", "agree"];
    try {
      const buttons = await page.$$("button, a");
      for (const btn of buttons) {
        const text = (await btn.innerText().catch(() => "")).toLowerCase();
        if (keywords.some((kw) => text.includes(kw))) {
          const visible = await btn.isVisible().catch(() => false);
          if (visible) {
            await humanClick(page, await btn.evaluate((el) => {
              // Generate a unique selector
              if (el.id) return `#${el.id}`;
              if ((el as HTMLElement).className) return `${el.tagName.toLowerCase()}.${(el as HTMLElement).className.split(" ")[0]}`;
              return el.tagName.toLowerCase();
            }));
            await page.waitForTimeout(500);
            return { resolved: true, resolution: "dismissed-cookie-consent" };
          }
        }
      }
    } catch {}
    return { resolved: false, error: "Could not dismiss cookie consent" };
  }
}

// ─── ObstacleManager ────────────────────────────────────────────────

class HCaptchaResolver implements ObstacleResolver {
  canResolve(obstacle: DetectedObstacle): boolean {
    return obstacle.type === "hcaptcha";
  }

  async resolve(page: Page, _obstacle: DetectedObstacle, _ctx: ExecutionContext, monitor?: StaleStateMonitor): Promise<ResolutionResult> {
    try {
      const result = await solveHCaptcha(page, monitor);
      if (result.solved) {
        return { resolved: true, resolution: `auto-solved-hcaptcha in ${result.rounds} rounds` };
      }
      return { resolved: false, error: result.reason || "hCaptcha solve failed" };
    } catch (err: unknown) {
      return { resolved: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

const resolvers: ObstacleResolver[] = [
  new RecaptchaResolver(),
  new HCaptchaResolver(),
  new CookieConsentResolver(),
];

export async function detectObstacles(page: Page, detectors: ObstacleDetector[] = defaultDetectors): Promise<DetectedObstacle | null> {
  for (const detector of detectors) {
    const obstacle = await detector.detect(page);
    if (obstacle) return obstacle;
  }
  return null;
}

export async function resolveObstacle(
  page: Page,
  obstacle: DetectedObstacle,
  ctx: ExecutionContext,
  monitor?: StaleStateMonitor
): Promise<ResolutionResult> {
  for (const resolver of resolvers) {
    if (resolver.canResolve(obstacle)) {
      return (resolver as ObstacleResolver & { resolve(page: Page, obstacle: DetectedObstacle, ctx: ExecutionContext, monitor?: StaleStateMonitor): Promise<ResolutionResult> }).resolve(page, obstacle, ctx, monitor);
    }
  }
  return { resolved: false, error: `No resolver for obstacle type: ${obstacle.type}` };
}
