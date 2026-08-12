import type { Browser } from "patchright";
import type { FetchRequest, FetchResult } from "../types";
import type { StorageBackend } from "../storage";
import type { SessionData } from "../session/persistence";
import { getBrowserWithFallback } from "../browser/launcher";
import { stealthContextOptions, applyStealthToPage } from "../browser/stealth";
import { humanClick, humanType, clickRecaptchaCheckbox, clickChallengeTiles, clickChallengeVerify } from "../browser/humanize";
import { deriveKey, encrypt, decrypt } from "../auth/crypto";
import { extractSession, injectCookies, injectStorage } from "../session/persistence";
import { TIMEOUTS } from "../constants";
import { getErrorMessage } from "../errors";

/** One-shot headless fetch on an ephemeral context (no daemon, no persistence
 *  beyond the optional session blob). Extracted verbatim from Iframer.fetch. */
export class FetchService {
  constructor(private store: StorageBackend) {}

  async fetch(userId: string | null, token: string | null, request: FetchRequest): Promise<FetchResult> {
    const { url, browser: preferredBrowser, waitUntil = "domcontentloaded", waitForSelector, extract, actions = [], returnHtml = false, headers = {}, locale = "pt-BR", sessionless = false } = request;

    const useSession = !sessionless && !!userId && !!token;
    const startedAt = Date.now();
    let context: Awaited<ReturnType<Browser["newContext"]>> | null = null;

    try {
      let sessionData: SessionData | null = null;
      let encryptionKey: Buffer | null = null;

      if (useSession) {
        encryptionKey = await deriveKey(token!);
        const blob = await this.store.getSession(userId!);
        if (blob && blob.length > 0) {
          sessionData = JSON.parse(decrypt(blob, encryptionKey));
        }
      }

      const { browser, name: browserName } = await getBrowserWithFallback(preferredBrowser);
      context = await browser.newContext(stealthContextOptions({ locale, extraHTTPHeaders: { ...headers } }, userId ?? undefined));

      if (sessionData) await injectCookies(context, sessionData);

      const page = await context.newPage();
      await applyStealthToPage(page);
      await page.goto(url, { waitUntil: (waitUntil || "domcontentloaded") as "load" | "domcontentloaded" | "networkidle" | "commit", timeout: TIMEOUTS.NAVIGATION });

      if (sessionData) await injectStorage(page, sessionData);
      if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });

      for (const action of actions) {
        switch (action.type) {
          case "click": await page.click(action.selector!); break;
          case "fill": await page.fill(action.selector!, action.value!); break;
          case "wait": await page.waitForTimeout(action.ms!); break;
          case "scroll": await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); break;
          case "human-click": await humanClick(page, action.selector!); break;
          case "human-type": await humanType(page, action.selector!, action.value!); break;
          case "recaptcha-click": await clickRecaptchaCheckbox(page); break;
          case "recaptcha-select": await clickChallengeTiles(page, (action as { tiles: number[] }).tiles); break;
          case "recaptcha-verify": await clickChallengeVerify(page); break;
        }
      }

      const finalUrl = page.url();
      const html = returnHtml ? await page.content() : undefined;
      const result = extract ? await page.evaluate(extract) : undefined;

      if (useSession) {
        const updatedSession = await extractSession(context, page);
        const encrypted = encrypt(JSON.stringify(updatedSession), encryptionKey!);
        await this.store.setSession(userId!, encrypted);
      }

      return { ok: true, browser: browserName, url: finalUrl, html, result, durationMs: Date.now() - startedAt };
    } catch (err: unknown) {
      return { ok: false, browser: "unknown", url, error: getErrorMessage(err), durationMs: Date.now() - startedAt };
    } finally {
      if (context) await context.close();
    }
  }
}
