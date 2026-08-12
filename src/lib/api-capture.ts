import type { Page, Request, Response } from "patchright";
import type { CapturedRequest, CapturedApi, CapturedAuth, CapturedEndpoint, ApiProtocol, ApiVerb } from "./types";

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
  /^x-super-properties$/i,
  /^x-debug-options$/i,
  /^x-fingerprint$/i,
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

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
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

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Replace lone UTF-16 surrogates that make JSON.stringify throw or produce invalid JSON. */
function sanitizeString(s: string): string {
  return s.replace(/[\uD800-\uDFFF]/g, "�");
}

function sanitizeDeep(val: unknown): unknown {
  if (typeof val === "string") return sanitizeString(val);
  if (Array.isArray(val)) return val.map(sanitizeDeep);
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[sanitizeString(k)] = sanitizeDeep(v);
    }
    return out;
  }
  return val;
}

// ─── Protocol classification ───────────────────────────────────────

function hasGraphQLShape(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.query === "string" && /^\s*(query|mutation|subscription|fragment|\{)/.test(b.query)) return true;
  if (typeof b.operationName === "string" && ("variables" in b || "query" in b || "doc_id" in b)) return true;
  if ("doc_id" in b && "variables" in b) return true;
  return false;
}

function gqlActionFromBody(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.operationName === "string" && b.operationName) return b.operationName;
    if (typeof b.fb_api_req_friendly_name === "string") return b.fb_api_req_friendly_name;
    if (b.doc_id != null) return `doc_${String(b.doc_id)}`;
    if (typeof b.queryId === "string") return b.queryId;
    if (typeof b.query === "string") {
      const m = b.query.match(/\b(?:query|mutation|subscription)\s+(\w+)/);
      if (m) return m[1];
    }
  }
  if (typeof body === "string") {
    const friendly = body.match(/fb_api_req_friendly_name=([^&]+)/);
    if (friendly) return decodeURIComponent(friendly[1]);
    const op = body.match(/(?:^|&)operationName=([^&]+)/);
    if (op) return decodeURIComponent(op[1]);
    const doc = body.match(/(?:^|&)doc_id=(\d+)/);
    if (doc) return `doc_${doc[1]}`;
  }
  return undefined;
}

interface Classification {
  protocol: ApiProtocol;
  action: string;
}

function classifyRequest(req: CapturedRequest): Classification {
  const path = req.path;
  const lowerPath = path.toLowerCase();
  const ct = (req.requestHeaders["content-type"] || req.requestHeaders["Content-Type"] || "").toLowerCase();
  const body = req.requestBody;

  if (ct.includes("application/grpc")) {
    return { protocol: "grpc-web", action: path.replace(/^\//, "") };
  }

  const soapAction = req.requestHeaders["soapaction"] || req.requestHeaders["SOAPAction"];
  if (soapAction || ct.includes("text/xml") || ct.includes("application/soap+xml")) {
    return { protocol: "soap", action: (soapAction || path).replace(/^["/]|["/]$/g, "") };
  }

  if (/\/graphql\b/.test(lowerPath) || hasGraphQLShape(body)) {
    return { protocol: "graphql", action: gqlActionFromBody(body) ?? "anonymous" };
  }

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.jsonrpc === "string" && typeof b.method === "string") {
      return { protocol: "json-rpc", action: b.method };
    }
  }

  if (typeof body === "string" && /fb_api_req_friendly_name=|^[^=&]+=.+&/.test(body)) {
    const friendly = gqlActionFromBody(body);
    if (friendly) return { protocol: "form-rpc", action: friendly };
  }

  return { protocol: "rest", action: `${req.method} ${parameterizePath(path)}` };
}

function inferVerb(protocol: ApiProtocol, action: string, method: string, responseBody: unknown): ApiVerb {
  const lower = action.toLowerCase();

  if (protocol === "rest") {
    const m = method.toUpperCase();
    if (m === "DELETE") return "delete";
    if (m === "POST") return "create";
    if (m === "PUT" || m === "PATCH") return "update";
    if (m === "GET") return Array.isArray(responseBody) || (isRecord(responseBody) && Array.isArray(responseBody.data)) ? "list" : "read";
    return "action";
  }

  if (/\b(delete|remove|destroy|unfollow|unlike|dislike)\b/.test(lower)) return "delete";
  if (/\b(create|add|insert|post|send|submit|publish|upload|register|signup|like|follow|react)\b/.test(lower)) return "create";
  if (/\b(update|edit|patch|set|change|rename|modify|mark|move)\b/.test(lower)) return "update";
  if (/\b(list|search|feed|timeline|paginated|browse|index|all|many)\b/.test(lower)) return "list";
  if (/\b(get|fetch|load|read|query|view|show|profile|info|detail|me)\b/.test(lower)) return "read";

  if (protocol === "graphql") {
    const q = isRecord(responseBody) ? responseBody.query : undefined;
    if (typeof q === "string" && /^\s*mutation\b/.test(q)) return "action";
    return "read";
  }

  return "action";
}

function pascalCase(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function camelCase(s: string): string {
  const p = pascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function buildFunctionName(protocol: ApiProtocol, action: string, method: string, verb: ApiVerb): string {
  if (protocol === "rest") {
    const parts = action.split(" ");
    const httpMethod = parts[0];
    const path = parts.slice(1).join(" ");
    const segs = path.split("/").filter(s => s && !s.startsWith("{"));
    const verbPrefix = httpMethod === "GET" ? (verb === "list" ? "list" : "get")
      : httpMethod === "POST" ? "create"
      : httpMethod === "PUT" ? "update"
      : httpMethod === "PATCH" ? "patch"
      : httpMethod === "DELETE" ? "delete"
      : httpMethod.toLowerCase();
    return camelCase(`${verbPrefix} ${segs.join(" ")}`) || camelCase(action);
  }
  if (protocol === "graphql" || protocol === "form-rpc") {
    const base = action.replace(/^(Use|FB|IG)/, "").replace(/(Query|Mutation|Subscription|RootQuery)$/, "");
    return camelCase(base) || camelCase(action);
  }
  if (protocol === "json-rpc") return camelCase(action.replace(/[._]/g, " "));
  if (protocol === "grpc-web") {
    const last = action.split("/").pop() || action;
    return camelCase(last);
  }
  return camelCase(action);
}

/** Build a curl command that fully replays the request */
function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  auth: CapturedAuth,
  body?: unknown,
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
    const safeBody = bodyStr.length > 10_000 ? bodyStr.slice(0, 10_000) + "...[truncated]" : bodyStr;
    parts.push(`  -d '${safeBody.replace(/'/g, "'\\''")}'`);
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

        let requestBody: unknown = undefined;
        try {
          const ct = (allHeaders["content-type"] || allHeaders["Content-Type"] || "").toLowerCase();
          const postData = req.postData();
          if (postData) {
            if (ct.includes("multipart/form-data")) {
              // Binary upload — extract field names from boundary, skip actual bytes
              const fields = [...postData.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
              requestBody = { _type: "multipart/form-data", fields: [...new Set(fields)] };
            } else if (
              ct.includes("application/octet-stream") ||
              ct.startsWith("video/") ||
              ct.startsWith("image/") ||
              ct.startsWith("audio/")
            ) {
              requestBody = { _type: ct, _size: postData.length };
            } else if (postData.length < 500_000) {
              requestBody = sanitizeDeep(tryParseJson(postData) ?? postData);
            } else {
              requestBody = `[body truncated — ${postData.length} bytes, content-type: ${ct}]`;
            }
          }
        } catch {}

        let responseBody: unknown = undefined;
        try {
          const resText = await res.text();
          if (resText && resText.length < 500_000) {
            responseBody = sanitizeDeep(tryParseJson(resText) ?? resText);
          } else if (resText) {
            responseBody = `[response truncated — ${resText.length} bytes]`;
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

  /** Keep listening for `ms` additional milliseconds, then wait up to `pendingTimeoutMs`
   *  for any in-flight requests (fired but not yet responded) to complete before stopping.
   *  Catches async post-step requests like auth re-challenges + delayed mutations. */
  async drain(ms = 3000, pendingTimeoutMs = 5000): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
    // Wait for pending requests to resolve
    const deadline = Date.now() + pendingTimeoutMs;
    while (this.pendingRequests.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
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
        byDomain.get(host)?.push(req);
      } catch {}
    }

    const apis: CapturedApi[] = [];

    for (const [baseUrl, requests] of byDomain) {
      const auth = this.extractAuth(requests);
      const endpointMap = new Map<string, CapturedEndpoint>();

      for (const req of requests) {
        const paramPath = parameterizePath(req.path);
        const { protocol, action } = classifyRequest(req);
        const key = `${protocol}:${action}`;
        const endpointHeaders = this.splitHeaders(req.requestHeaders);

        if (!endpointMap.has(key)) {
          const verb = inferVerb(protocol, action, req.method, req.responseBody);
          const functionName = buildFunctionName(protocol, action, req.method, verb);
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
            protocol,
            action,
            verb,
            functionName,
          });
        } else {
          const existing = endpointMap.get(key);
          if (!existing) continue;
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
