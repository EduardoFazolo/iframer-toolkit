import type { Page, Request, Response } from "patchright";
import type { CapturedRequest, CapturedApi, CapturedAuth, CapturedEndpoint } from "./types";

const SKIP_RESOURCE_TYPES = new Set([
  "stylesheet", "image", "media", "font", "manifest", "other",
]);

const SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)(\?|$)/i;

// Headers that are pure browser noise — not needed to replay the request
const BROWSER_NOISE_HEADERS = new Set([
  "accept-encoding", "accept-language", "cache-control", "connection",
  "host", "pragma", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "upgrade-insecure-requests",
  "dnt", "te", "if-none-match", "if-modified-since",
]);

// Headers that carry auth — extracted into shared auth config
const AUTH_HEADER_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^x-csrf/i,
  /^x-xsrf/i,
  /^x-api-key$/i,
  /^x-auth/i,
  /^x-token/i,
  /^x-session/i,
  /^x-access/i,
  /^x-client-token/i,
  /^x-request-token/i,
  /^x-super-properties$/i,  // Discord
  /^x-debug-options$/i,     // Discord
  /^x-discord/i,            // Discord
  /^x-fingerprint$/i,       // Discord
];

function isAuthHeader(name: string): boolean {
  return AUTH_HEADER_PATTERNS.some(p => p.test(name));
}

// Heuristic: looks like an API path segment that's an ID
const ID_PATTERNS = [
  /^[0-9]+$/,
  /^[0-9a-f]{8,}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
  /^\w{20,}$/,
];

function isLikelyId(segment: string): boolean {
  return ID_PATTERNS.some(p => p.test(segment));
}

function parameterizePath(path: string): string {
  const parts = path.split("/");
  let idCount = 0;
  const parameterized = parts.map(part => {
    if (part && isLikelyId(part)) {
      idCount++;
      return idCount === 1 ? "{id}" : `{id${idCount}}`;
    }
    return part;
  });
  return parameterized.join("/");
}

function parseQueryParams(url: string): Record<string, string> | undefined {
  try {
    const u = new URL(url);
    if (u.searchParams.toString() === "") return undefined;
    const params: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { params[k] = v; });
    return params;
  } catch {
    return undefined;
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      cookies[name] = value;
    }
  }
  return cookies;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Build a curl command that fully replays the request */
function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  auth: CapturedAuth,
  body?: any,
): string {
  const parts = [`curl -X ${method}`];

  // Add auth headers
  if (auth.authorization) {
    parts.push(`  -H 'Authorization: ${auth.authorization}'`);
  }
  if (Object.keys(auth.cookies).length > 0) {
    const cookieStr = Object.entries(auth.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    parts.push(`  -H 'Cookie: ${cookieStr}'`);
  }
  for (const [k, v] of Object.entries(auth.tokens)) {
    parts.push(`  -H '${k}: ${v}'`);
  }

  // Add endpoint-specific headers
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`  -H '${k}: ${v}'`);
  }

  // Add body
  if (body !== undefined) {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    parts.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
  }

  parts.push(`  '${url}'`);
  return parts.join(" \\\n");
}

export class ApiCapture {
  private requests: CapturedRequest[] = [];
  private pendingRequests = new Map<Request, { stepIndex: number; timestamp: number }>();
  private currentStep = 0;
  private requestHandler: (req: Request) => void;
  private responseHandler: (res: Response) => void;

  constructor(private page: Page) {
    this.requestHandler = (req: Request) => {
      const resourceType = req.resourceType();
      if (SKIP_RESOURCE_TYPES.has(resourceType)) return;
      if (SKIP_EXTENSIONS.test(req.url())) return;
      if (resourceType !== "xhr" && resourceType !== "fetch") return;

      this.pendingRequests.set(req, {
        stepIndex: this.currentStep,
        timestamp: Date.now(),
      });
    };

    this.responseHandler = async (res: Response) => {
      const req = res.request();
      const meta = this.pendingRequests.get(req);
      if (!meta) return;
      this.pendingRequests.delete(req);

      try {
        const url = req.url();
        const parsed = new URL(url);
        const allHeaders = req.headers();

        let requestBody: any = undefined;
        try {
          const postData = req.postData();
          if (postData) {
            requestBody = tryParseJson(postData) ?? postData;
          }
        } catch {}

        let responseBody: any = undefined;
        try {
          const resText = await res.text();
          if (resText && resText.length < 100_000) {
            responseBody = tryParseJson(resText) ?? resText;
          }
        } catch {}

        this.requests.push({
          method: req.method(),
          url,
          path: parsed.pathname,
          queryParams: parseQueryParams(url),
          requestHeaders: allHeaders,
          requestBody,
          responseStatus: res.status(),
          responseHeaders: res.headers(),
          responseBody,
          resourceType: req.resourceType(),
          triggeredAtStep: meta.stepIndex,
          timestamp: meta.timestamp,
        });
      } catch {}
    };
  }

  start() {
    this.page.on("request", this.requestHandler);
    this.page.on("response", this.responseHandler);
  }

  setStep(index: number) {
    this.currentStep = index;
  }

  stop() {
    this.page.off("request", this.requestHandler);
    this.page.off("response", this.responseHandler);
  }

  /** Extract shared auth from all requests for a domain */
  private extractAuth(requests: CapturedRequest[]): CapturedAuth {
    const auth: CapturedAuth = { cookies: {}, tokens: {} };

    // Find the most common auth headers across requests
    for (const req of requests) {
      for (const [key, value] of Object.entries(req.requestHeaders)) {
        const lower = key.toLowerCase();
        if (lower === "authorization" && !auth.authorization) {
          auth.authorization = value;
        } else if (lower === "cookie") {
          // Merge all cookies seen
          const cookies = parseCookies(value);
          Object.assign(auth.cookies, cookies);
        } else if (isAuthHeader(key) && lower !== "authorization" && lower !== "cookie") {
          auth.tokens[key] = value;
        }
      }
    }

    return auth;
  }

  /** Split headers into auth (shared) vs endpoint-specific */
  private splitHeaders(headers: Record<string, string>): Record<string, string> {
    const endpointHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      // Skip browser noise and auth headers (auth is in shared config)
      if (BROWSER_NOISE_HEADERS.has(lower)) continue;
      if (isAuthHeader(key)) continue;
      if (lower === "user-agent") continue;
      // Keep everything else — content-type, accept, custom headers, referer, origin
      endpointHeaders[key] = value;
    }
    return endpointHeaders;
  }

  getResults(): CapturedApi[] {
    const byDomain = new Map<string, CapturedRequest[]>();
    for (const req of this.requests) {
      try {
        const host = new URL(req.url).origin;
        if (!byDomain.has(host)) byDomain.set(host, []);
        byDomain.get(host)!.push(req);
      } catch {}
    }

    const apis: CapturedApi[] = [];

    for (const [baseUrl, requests] of byDomain) {
      const auth = this.extractAuth(requests);
      const endpointMap = new Map<string, CapturedEndpoint>();

      for (const req of requests) {
        const paramPath = parameterizePath(req.path);
        const key = `${req.method} ${paramPath}`;
        const endpointHeaders = this.splitHeaders(req.requestHeaders);

        if (!endpointMap.has(key)) {
          endpointMap.set(key, {
            method: req.method,
            path: paramPath,
            rawPaths: [req.path],
            queryParams: req.queryParams,
            headers: endpointHeaders,
            requestBody: req.requestBody,
            responseStatus: req.responseStatus,
            responseBody: req.responseBody,
            triggeredAtStep: req.triggeredAtStep,
            curl: buildCurl(req.method, req.url, endpointHeaders, auth, req.requestBody),
          });
        } else {
          const existing = endpointMap.get(key)!;
          if (!existing.rawPaths.includes(req.path)) {
            existing.rawPaths.push(req.path);
          }
        }
      }

      const domain = new URL(baseUrl).hostname.replace(/\./g, "_");
      apis.push({
        domain,
        baseUrl,
        auth,
        endpoints: Array.from(endpointMap.values()).sort((a, b) => a.triggeredAtStep - b.triggeredAtStep),
        capturedAt: new Date().toISOString(),
      });
    }

    return apis.sort((a, b) => b.endpoints.length - a.endpoints.length);
  }
}
