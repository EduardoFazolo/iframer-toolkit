import type { BrowserContext, Page } from "patchright";

export interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage: Record<string, Record<string, string>>;
  sessionStorage: Record<string, Record<string, string>>;
  extractedAt: string;
}

export async function extractSession(context: BrowserContext, page: Page): Promise<SessionData> {
  const cookies = await context.cookies();

  const { localStorage, sessionStorage } = await page.evaluate(() => {
    const ls: Record<string, string> = {};
    const ss: Record<string, string> = {};

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)!;
      ls[key] = window.localStorage.getItem(key)!;
    }

    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)!;
      ss[key] = window.sessionStorage.getItem(key)!;
    }

    return { localStorage: ls, sessionStorage: ss };
  });

  const origin = new URL(page.url()).origin;

  return {
    cookies,
    localStorage: { [origin]: localStorage },
    sessionStorage: { [origin]: sessionStorage },
    extractedAt: new Date().toISOString(),
  };
}

export async function injectCookies(context: BrowserContext, sessionData: SessionData): Promise<void> {
  if (sessionData?.cookies?.length > 0) {
    await context.addCookies(sessionData.cookies);
  }
}

export async function injectStorage(page: Page, sessionData: SessionData): Promise<void> {
  if (!sessionData) return;

  const origin = new URL(page.url()).origin;
  const ls = sessionData.localStorage?.[origin];
  const ss = sessionData.sessionStorage?.[origin];

  if (ls && Object.keys(ls).length > 0) {
    await page.evaluate((data: Record<string, string>) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, ls);
  }

  if (ss && Object.keys(ss).length > 0) {
    await page.evaluate((data: Record<string, string>) => {
      for (const [key, value] of Object.entries(data)) {
        window.sessionStorage.setItem(key, value);
      }
    }, ss);
  }
}
