import type { Pipeline, PipelineResult, BrowserMode } from "../types";
import type { SessionData } from "../session/persistence";
import { mergeKnowledge, type KnowledgeAuth, type KnowledgeEndpoint } from "../knowledge";

/**
 * Extract per-domain knowledge from a successful pipeline run and merge it into
 * the knowledge cache. Runs after every successful execute so the cache
 * incrementally learns about every site the agent touches.
 *
 * Pure module-level function (no `this`) so it can be unit-tested directly.
 *
 * KNOWN BUG (preserved as-is; fix belongs in a separate PR): domain matching
 * uses substring/suffix checks without a label boundary, so a cookie or origin
 * for `evil-figma.com` is treated as belonging to `figma.com`. See the
 * `endsWith`/`includes` calls below. Correct check: `d === root || d.endsWith("." + root)`.
 */
export function extractKnowledgeFromRun(
  pipeline: Pipeline,
  result: PipelineResult,
  sessionData: SessionData | null,
  mode: BrowserMode
): void {
  // Determine target domain from the first navigate step
  const firstNav = pipeline.steps.find((s) => s.type === "navigate");
  if (!firstNav || firstNav.type !== "navigate") return;

  let domain: string;
  try {
    domain = new URL(firstNav.url).hostname;
  } catch {
    return;
  }

  const domainRoot = domain.replace(/^www\./, "");
  const hadLogin = pipeline.steps.some((s) => s.type === "login");

  // Build auth structure from the session we just captured
  const auth: KnowledgeAuth = { type: "unknown" };
  const cookieNames: string[] = [];
  const localStorageKeys: string[] = [];
  const sessionStorageKeys: string[] = [];

  if (sessionData) {
    // Cookie names scoped to this domain (strip leading dot for display)
    for (const c of sessionData.cookies ?? []) {
      if (c.domain.endsWith(domainRoot) || domainRoot.endsWith(c.domain.replace(/^\./, ""))) {
        if (!cookieNames.includes(c.name)) cookieNames.push(c.name);
      }
    }

    // localStorage/sessionStorage keys for any origin matching the domain
    for (const [origin, store] of Object.entries(sessionData.localStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!localStorageKeys.includes(k)) localStorageKeys.push(k);
        }
      }
    }
    for (const [origin, store] of Object.entries(sessionData.sessionStorage ?? {})) {
      if (origin.includes(domainRoot)) {
        for (const k of Object.keys(store)) {
          if (!sessionStorageKeys.includes(k)) sessionStorageKeys.push(k);
        }
      }
    }
  }

  if (cookieNames.length > 0 && localStorageKeys.length > 0) {
    auth.type = "cookies+localStorage";
  } else if (localStorageKeys.length > 0) {
    auth.type = "localStorage";
  } else if (cookieNames.length > 0) {
    auth.type = "cookies";
  }
  if (cookieNames.length > 0) auth.cookieNames = cookieNames;
  if (localStorageKeys.length > 0) auth.localStorageKeys = localStorageKeys;
  if (sessionStorageKeys.length > 0) auth.sessionStorageKeys = sessionStorageKeys;

  // If the run captured API calls (captureApi: true), fold them in as endpoints
  const endpoints: KnowledgeEndpoint[] = [];
  const replayHeaders = new Set<string>();

  for (const api of result.capturedApi ?? []) {
    // Only consider same-domain captured APIs
    if (!api.domain.includes(domainRoot) && !domainRoot.includes(api.domain.replace(/^www\./, ""))) continue;

    if (api.auth?.authorization) replayHeaders.add("Authorization");
    for (const name of Object.keys(api.auth?.tokens ?? {})) replayHeaders.add(name);

    for (const ep of api.endpoints ?? []) {
      endpoints.push({
        method: ep.method,
        path: ep.path,
        description: `Status ${ep.responseStatus}. Triggered at step ${ep.triggeredAtStep}.`,
        example: ep.curl,
        firstSeen: new Date().toISOString(),
      });
    }
  }

  if (replayHeaders.size > 0) {
    auth.headers = [...replayHeaders];
    if (!auth.type.includes("header")) auth.type = auth.type === "unknown" ? "headers" : `${auth.type}+headers`;
  }

  const notes: string[] = [];
  if (hadLogin) notes.push(`Last successful login via browser in ${mode} mode.`);
  if (result.obstacles?.some((o) => o.type?.includes("captcha"))) notes.push("Captcha encountered — browser required for fresh logins.");

  mergeKnowledge(domainRoot, {
    lastMode: mode,
    browserRequired: true, // will flip to false only when the agent proves direct API works
    auth,
    endpoints,
    notes,
  });
}
