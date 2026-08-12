import type { BrowserContext } from "patchright";
import type { BrowserMode, CapturedApi } from "../types";
import { BrowserDaemon, DEFAULT_INSTANCE } from "../browser/daemon";
import { ApiCapture } from "../api-capture";

type Cookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];
type OriginStore = Record<string, Record<string, string>>;

/** Persistent XHR/fetch capture + CDP cookie/storage extraction, keyed by
 *  `mode::instanceId`. Extracted from Iframer. */
export class CaptureManager {
  private captures = new Map<string, ApiCapture>();

  constructor(private daemon: BrowserDaemon) {}

  async startCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; message: string }> {
    const key = `${mode}::${instanceId}`;
    if (this.captures.has(key)) {
      return { ok: true, message: `Capture already running on ${key}. Call capture-stop to flush.` };
    }
    const { page } = await this.daemon.ensure(mode, instanceId);
    const capture = new ApiCapture(page);
    capture.start();
    this.captures.set(key, capture);
    return { ok: true, message: `Capture started on ${key}. Use 'session capture-stop' when ready to collect results.` };
  }

  async stopCapture(mode: BrowserMode = "binary-headful", instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; capturedApi: CapturedApi[] | undefined; message: string }> {
    const key = `${mode}::${instanceId}`;
    const capture = this.captures.get(key);
    if (!capture) {
      return { ok: false, capturedApi: undefined, message: `No active capture on ${key}. Start one with 'session capture-start'.` };
    }
    capture.stop();
    this.captures.delete(key);
    const capturedApi = capture.getResults();
    const total = capturedApi.reduce((n, a) => n + a.endpoints.length, 0);
    return { ok: true, capturedApi, message: `Capture stopped. ${total} endpoints across ${capturedApi.length} domain(s).` };
  }

  /** Extract all cookies from the browser context via CDP — includes HttpOnly/Secure.
   *  No JS sandbox restrictions. Pass urls to scope (e.g. ['https://youtube.com']). */
  async getCookies(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; cookies: Cookie[]; message: string }> {
    const { context } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();
    return { ok: true, cookies, message: `${cookies.length} cookies extracted via CDP.` };
  }

  /** Extract cookies + localStorage + sessionStorage in one shot. */
  async getFullAuth(mode: BrowserMode = "binary-headful", urls?: string[], instanceId: string = DEFAULT_INSTANCE): Promise<{ ok: boolean; cookies: Cookie[]; localStorage: OriginStore; sessionStorage: OriginStore; message: string }> {
    const { context, page } = await this.daemon.ensure(mode, instanceId);
    const cookies = urls && urls.length > 0 ? await context.cookies(urls) : await context.cookies();

    const localStorage: OriginStore = {};
    const sessionStorage: OriginStore = {};
    try {
      const stores = await page.evaluate(() => {
        const ls: Record<string, string> = {};
        const ss: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)!;
          ls[k] = window.localStorage.getItem(k) ?? "";
        }
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i)!;
          ss[k] = window.sessionStorage.getItem(k) ?? "";
        }
        return { origin: window.location.origin, ls, ss };
      });
      localStorage[stores.origin] = stores.ls;
      sessionStorage[stores.origin] = stores.ss;
    } catch {}

    return {
      ok: true,
      cookies,
      localStorage,
      sessionStorage,
      message: `${cookies.length} cookies, ${Object.values(localStorage).reduce((n, s) => n + Object.keys(s).length, 0)} localStorage keys, ${Object.values(sessionStorage).reduce((n, s) => n + Object.keys(s).length, 0)} sessionStorage keys.`,
    };
  }
}
