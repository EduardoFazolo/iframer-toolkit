import type { Page } from "patchright";
import type { DetectedObstacle, ObstacleDetector } from "../types";

// NOTE: functions passed to page.evaluate are serialized and run in the page,
// so they must NOT reference outer helpers — and must avoid a *named* nested
// function, which the bundler wraps with a `__name(...)` call that doesn't exist
// in the page (ReferenceError). Hence the inline anonymous `.some` callback below.

export class RecaptchaDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      // A passive/invisible captcha (reCAPTCHA v3 badge, invisible widget) does
      // NOT block the page, so only a VISIBLE, interactive-sized challenge counts
      // as an obstacle — otherwise navigate falsely aborts on a Lever-style badge.
      const active = await page.evaluate(() =>
        [
          'iframe[src*="recaptcha/api2/anchor"], iframe[title*="reCAPTCHA"]',
          'iframe[src*="recaptcha/api2/bframe"]',
          '.g-recaptcha:not([data-size="invisible"]), [data-sitekey]:not([data-size="invisible"])',
        ].some((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 20) return false;
          const s = getComputedStyle(el);
          return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
        }),
      );
      if (active) return { type: "captcha", confidence: 0.95 };
    } catch {}
    return null;
  }
}

export class HCaptchaDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const active = await page.evaluate(() =>
        [
          'iframe[src*="hcaptcha.com"]',
          'iframe[title*="hCaptcha"]',
          "[data-hcaptcha-widget-id]",
        ].some((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 20) return false;
          const s = getComputedStyle(el);
          return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
        }),
      );
      if (active) return { type: "hcaptcha", confidence: 0.95 };
    } catch {}
    return null;
  }
}

export class CookieConsentDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const found = await page.evaluate(() => {
        const keywords = ["accept cookies", "accept all", "allow cookies", "i accept", "agree"];
        const buttons = Array.from(document.querySelectorAll("button, a"));
        return buttons.some((el) => {
          const text = (el as HTMLElement).innerText?.toLowerCase() || "";
          return keywords.some((kw) => text.includes(kw));
        });
      });

      if (found) {
        return { type: "cookie-consent", confidence: 0.8 };
      }
    } catch {}
    return null;
  }
}

export class LoginWallDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const found = await page.evaluate(() => {
        const hasLoginForm =
          !!document.querySelector('input[type="password"]') &&
          !!document.querySelector('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]');
        return hasLoginForm;
      });

      if (found) {
        return { type: "login-wall", confidence: 0.85, details: "Login form detected" };
      }
    } catch {}
    return null;
  }
}

export const defaultDetectors: ObstacleDetector[] = [
  new RecaptchaDetector(),
  new HCaptchaDetector(),
  new CookieConsentDetector(),
  new LoginWallDetector(),
];
