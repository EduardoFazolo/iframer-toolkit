import type { Page } from "patchright";
import type { DetectedObstacle, ObstacleDetector } from "../types";

export class RecaptchaDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const found = await page.evaluate(() => {
        const hasAnchorFrame = !!document.querySelector(
          'iframe[src*="recaptcha/api2/anchor"], iframe[title*="reCAPTCHA"]'
        );
        const hasSitekey = !!document.querySelector("[data-sitekey], .g-recaptcha");
        return hasAnchorFrame || hasSitekey;
      });

      if (found) {
        return { type: "captcha", confidence: 0.95 };
      }
    } catch {}
    return null;
  }
}

export class HCaptchaDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const found = await page.evaluate(() => {
        return !!(
          document.querySelector('iframe[src*="hcaptcha.com"]') ||
          document.querySelector('[data-hcaptcha-widget-id]') ||
          document.querySelector('iframe[title*="hCaptcha"]')
        );
      });
      if (found) return { type: "hcaptcha", confidence: 0.95 };
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
