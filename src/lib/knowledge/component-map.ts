import fs from "fs";
import path from "path";
import { getKnowledgeDir, sanitizeDomain, normalizeDomain } from "../knowledge";
import type { Anchor } from "../types";

/**
 * Per-domain component map — the DURABLE half of the ref system.
 *
 * `snapshot`/`find` tag live elements with ephemeral @e refs that reset on every
 * snapshot. This store promotes the ones that matter into named, persisted
 * ANCHORS keyed by domain, so the agent recalls "on slack.com the composer is
 * <this>, the send button is <this>, and clicking send pops an @here modal"
 * instead of re-exploring the DOM every run.
 *
 * Anchors are referenced in any selector field as `@a:<name>` (resolved by
 * resolveSelector). They are self-healing by design: every use records a
 * success or failure, so a stale anchor surfaces as a high fail count, and the
 * agent is instructed to re-discover (snapshot/find) and overwrite it rather
 * than insisting on a locator that no longer works.
 *
 * Stored as JSON alongside the markdown knowledge cache: <domain>.anchors.json.
 */

export interface ComponentMap {
  domain: string;
  anchors: Record<string, Anchor>;
  /** Site-wide quirks not tied to one element (e.g. "synthetic clicks are
   *  ignored — use trusted/coordinate clicks"). */
  quirks: string[];
}

function anchorsPath(domain: string): string {
  return path.join(getKnowledgeDir(), `${sanitizeDomain(domain)}.anchors.json`);
}

export function loadComponentMap(domain: string): ComponentMap {
  const norm = normalizeDomain(domain);
  try {
    const raw = fs.readFileSync(anchorsPath(norm), "utf8");
    const parsed = JSON.parse(raw) as ComponentMap;
    return {
      domain: parsed.domain || norm,
      anchors: parsed.anchors || {},
      quirks: Array.isArray(parsed.quirks) ? parsed.quirks : [],
    };
  } catch {
    return { domain: norm, anchors: {}, quirks: [] };
  }
}

/** Anchors as a Map for O(1) resolution in resolveSelector. */
export function loadAnchors(domain: string): Map<string, Anchor> {
  const map = new Map<string, Anchor>();
  const cm = loadComponentMap(domain);
  for (const [name, a] of Object.entries(cm.anchors)) map.set(name, a);
  return map;
}

function write(cm: ComponentMap): void {
  fs.mkdirSync(getKnowledgeDir(), { recursive: true });
  fs.writeFileSync(anchorsPath(cm.domain), JSON.stringify(cm, null, 2), "utf8");
}

/** Create or overwrite an anchor. Overwriting resets the health counters —
 *  the caller just re-verified it, so the old fail history is stale. */
export function saveAnchor(
  domain: string,
  input: { name: string; selector: string; role?: string; description?: string; quirks?: string[] },
  now: string,
): void {
  const cm = loadComponentMap(domain);
  cm.anchors[input.name] = {
    name: input.name,
    selector: input.selector,
    role: input.role,
    description: input.description,
    quirks: input.quirks && input.quirks.length ? input.quirks : undefined,
    uses: 0,
    fails: 0,
    lastVerified: now,
  };
  write(cm);
}

export function removeAnchor(domain: string, name: string): boolean {
  const cm = loadComponentMap(domain);
  if (!(name in cm.anchors)) return false;
  delete cm.anchors[name];
  write(cm);
  return true;
}

export function setDomainQuirks(domain: string, quirks: string[]): void {
  const cm = loadComponentMap(domain);
  cm.quirks = Array.from(new Set([...cm.quirks, ...quirks]));
  write(cm);
}

/** Record the outcome of using an anchor. Best-effort — never throws, so it
 *  can't break a pipeline. Feeds the self-heal signal (fails vs uses). */
export function recordAnchorResult(domain: string, name: string, ok: boolean, now: string): void {
  try {
    const cm = loadComponentMap(domain);
    const a = cm.anchors[name];
    if (!a) return;
    if (ok) {
      a.uses += 1;
      a.lastVerified = now;
    } else {
      a.fails += 1;
    }
    write(cm);
  } catch {
    /* telemetry-grade; ignore */
  }
}

export function listAnchorDomains(): string[] {
  try {
    return fs
      .readdirSync(getKnowledgeDir())
      .filter((f) => f.endsWith(".anchors.json"))
      .map((f) => f.replace(/\.anchors\.json$/, ""));
  } catch {
    return [];
  }
}
