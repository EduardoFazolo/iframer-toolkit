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

// A consent match must clear THREE gates, or article text hijacks the run
// (real case: the Everest article cites "Nepal and China agree on Mount
// Everest's height" — the old substring-over-all-links detector matched
// "agree", the resolver clicked the citation, and the pipeline sailed off to
// bbc.co.uk): (1) BUTTONS only, never links; (2) the keyword is essentially
// the whole label, not a phrase inside a sentence; (3) the button sits in an
// overlay/banner (fixed/sticky ancestor or dialog), and is visible.
// Keep this predicate in sync with CookieConsentResolver (obstacles.ts).
export class CookieConsentDetector implements ObstacleDetector {
  async detect(page: Page): Promise<DetectedObstacle | null> {
    try {
      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).some((el) => {
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
        }),
      );

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
