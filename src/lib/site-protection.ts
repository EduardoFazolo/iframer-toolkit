import type { StepResult, ObstacleEncounter } from "./types";
import type { Page } from "patchright";

export type SiteProtection = "imperva" | "akamai";
export const PROTECTED_INTERVAL_MS = 3000;
const nextRequest = new Map<string, number>();

/** Pace top-level actions across calls and browser modes in this process. */
export async function paceProtectedDomain(domain: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequest.get(domain) || 0);
  nextRequest.set(domain, slot + PROTECTED_INTERVAL_MS);
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}

export async function detectSiteProtection(page: Page): Promise<SiteProtection | null> {
  const cookies = await page.context().cookies(page.url()).catch(() => []);
  if (cookies.some(c => /^(incap_ses_|visid_incap_|nlbi_)/i.test(c.name))) return "imperva";
  if (cookies.some(c => /^(?:_abck|bm_sz|ak_bmsc|bm_sv)$/.test(c.name))) return "akamai";
  const html = await page.content().catch(() => "");
  if (/\/[_]Incapsula_Resource|incapsula incident id|powered by imperva/i.test(html)) return "imperva";
  if (/errors\.edgesuite\.net|akamai bot manager/i.test(html)) return "akamai";
  return null;
}

export class HeadedRequiredError extends Error {
  stepIndex = 0;
  results: StepResult[] = [];
  obstacles: ObstacleEncounter[] = [];
  constructor(public url: string) { super("This site requires a headed browser."); }
}

/** Run-local policy: detection interrupts headless immediately, before the next action. */
export function protectionHooks(headless: boolean, respectful = false) {
  return {
    before: async (page: Page, step: { type: string; url?: string }) => {
      const protection = await detectSiteProtection(page);
      if (protection) {
        respectful = true;
        if (headless) throw new HeadedRequiredError(page.url());
      }
      if (respectful) await paceProtectedDomain(new URL(step.url || page.url()).hostname);
    },
    after: async (page: Page) => {
      const protection = await detectSiteProtection(page);
      if (!protection) return;
      respectful = true;
      if (headless) throw new HeadedRequiredError(page.url());
    },
  };
}
