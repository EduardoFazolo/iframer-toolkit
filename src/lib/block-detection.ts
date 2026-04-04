import type { Page } from "patchright";
import type { BlockDetectionResult } from "./types";
import { THRESHOLDS } from "./constants";
import { createLogger } from "./logger";

const log = createLogger("block-detection");
/**
 * Detect if a page load was blocked by bot protection.
 * Runs after navigation steps to determine if the mode should be escalated.
 */
export async function detectBlock(page: Page): Promise<BlockDetectionResult> {
  try {
    const [title, url, bodyText] = await Promise.all([
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
      page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "").catch(() => ""),
    ]);

    // Cloudflare "Just a moment" challenge
    if (title.includes("Just a moment") || title.includes("Attention Required")) {
      return { blocked: true, reason: "cloudflare-challenge" };
    }

    // Cloudflare Turnstile / "Verify you are human"
    if (bodyText.includes("Verify you are human") || bodyText.includes("cf-turnstile")) {
      return { blocked: true, reason: "cloudflare-turnstile" };
    }

    // Cloudflare "checking your browser"
    if (bodyText.includes("Checking your browser") || bodyText.includes("Please wait while we verify")) {
      return { blocked: true, reason: "cloudflare-checking" };
    }

    // Check for Cloudflare challenge iframe
    const hasCfChallenge = await page.evaluate(() => {
      return !!document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    }).catch((err) => {
      log.warn(`CF challenge check failed, assuming blocked: ${err}`);
      return true;
    });
    if (hasCfChallenge) {
      return { blocked: true, reason: "cloudflare-turnstile" };
    }

    // Akamai bot manager
    if (title.includes("Access Denied") && bodyText.includes("Reference #")) {
      return { blocked: true, reason: "akamai-block" };
    }

    // PerimeterX / HUMAN
    if (bodyText.includes("Press & Hold") && bodyText.includes("human")) {
      return { blocked: true, reason: "perimeterx-block" };
    }

    // DataDome
    if (bodyText.includes("datadome") || bodyText.includes("captcha-delivery.com")) {
      return { blocked: true, reason: "datadome-block" };
    }

    // Generic captcha wall — look for reCAPTCHA or hCaptcha iframes on a mostly-empty page
    if (bodyText.trim().length < THRESHOLDS.MIN_BODY_TEXT) {
      const hasCaptchaIframe = await page.evaluate(() => {
        return !!(
          document.querySelector('iframe[src*="recaptcha"]') ||
          document.querySelector('iframe[src*="hcaptcha"]')
        );
      }).catch((err) => {
        log.warn(`captcha iframe check failed, assuming blocked: ${err}`);
        return true;
      });

      if (hasCaptchaIframe) {
        return { blocked: true, reason: "captcha-wall" };
      }
    }

    // HTTP 403 check — evaluate the response status if available
    // Note: Playwright doesn't directly expose response status on page, but we can check via body
    if (title.includes("403") || title.includes("Forbidden")) {
      return { blocked: true, reason: "http-403" };
    }

    // Very empty page (potential silent block) — but not about:blank
    if (!url.includes("about:blank") && bodyText.trim().length < 20 && title.length < 5) {
      // Could be a legitimate blank page, so low confidence. Don't auto-escalate.
      // Return not blocked — let the agent decide.
    }

    return { blocked: false };
  } catch (err) {
    // If we can't even evaluate the page, assume blocked (safe default)
    log.warn(`page evaluation failed, assuming blocked: ${err}`);
    return { blocked: true, reason: "evaluation-failed" };
  }
}
