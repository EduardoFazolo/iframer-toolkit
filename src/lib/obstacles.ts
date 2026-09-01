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
    // Same three gates as CookieConsentDetector (detector.ts — keep in sync):
    // buttons only, keyword ≈ whole label, visible inside an overlay/dialog.
    // The qualified button is tagged page-side and clicked via that attribute —
    // no fragile className-derived selectors, no risk of clicking a link.
    try {
      const tagged = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).find((el) => {
          const label = (((el as HTMLElement).innerText || (el as HTMLInputElement).value || "") + "").trim().toLowerCase();
          if (!label || label.length > 32) return false;
          const kws = ["accept cookies", "accept all", "allow cookies", "i accept", "i agree", "agree"];
          if (!kws.some((kw) => label === kw || (label.includes(kw) && kw.length / label.length >= 0.5))) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 10) return false;
          const s = getComputedStyle(el);
          if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
          let n = el.parentElement;
          let depth = 0;
          while (n && depth < 8) {
            const cs = getComputedStyle(n);
            if (cs.position === "fixed" || cs.position === "sticky" || n.getAttribute("role") === "dialog" || n.getAttribute("aria-modal") === "true") return true;
            n = n.parentElement;
            depth++;
          }
          return false;
        });
        if (!el) return false;
        el.setAttribute("data-iframer-consent", "1");
        return true;
      });
      if (tagged) {
        await humanClick(page, '[data-iframer-consent="1"]');
        await page.evaluate(() => {
          document.querySelector('[data-iframer-consent="1"]')?.removeAttribute("data-iframer-consent");
        }).catch(() => {});
        await page.waitForTimeout(500);
        return { resolved: true, resolution: "dismissed-cookie-consent" };
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
