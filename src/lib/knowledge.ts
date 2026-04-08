import fs from "fs";
import path from "path";
import os from "os";
import { createLogger } from "./logger";

const log = createLogger("knowledge");

/**
 * Per-domain knowledge cache. Plain markdown files at ~/.iframer/knowledge/<domain>.md
 * so users can grep, inspect, and manually edit them. Cross-platform via os.homedir()
 * and path.join().
 *
 * The markdown stores *structure* (which cookies/localStorage keys matter, which
 * endpoints exist, how the auth replays) — never the actual secret values.
 * Real credentials stay encrypted in the SQLite store.
 */

export interface KnowledgeAuth {
  /** Short label: "cookies", "bearer token", "cookies+localStorage", etc. */
  type: string;
  /** Cookie names that are load-bearing for auth (names only, not values). */
  cookieNames?: string[];
  /** localStorage keys that hold auth material (names only, not values). */
  localStorageKeys?: string[];
  /** sessionStorage keys that hold auth material (names only, not values). */
  sessionStorageKeys?: string[];
  /** HTTP headers the site expects on authenticated API calls. */
  headers?: string[];
}

export interface KnowledgeEndpoint {
  method: string;
  /** Parameterized path, e.g. "/api/v9/channels/{channelId}/messages" */
  path: string;
  /** Freeform one-line description of what this endpoint does. */
  description?: string;
  /** Example request (curl or fetch) to help the agent replay it. */
  example?: string;
  /** First observed at (ISO timestamp). */
  firstSeen?: string;
}

export interface KnowledgeData {
  domain: string;
  lastVerified: string;
  lastMode: string;
  browserRequired: boolean;
  auth: KnowledgeAuth;
  endpoints: KnowledgeEndpoint[];
  notes: string[];
}

// ─── Paths ──────────────────────────────────────────────────────────

export function getKnowledgeDir(): string {
  return path.join(os.homedir(), ".iframer", "knowledge");
}

export function getKnowledgePath(domain: string): string {
  const safe = sanitizeDomain(domain);
  return path.join(getKnowledgeDir(), `${safe}.md`);
}

/** Strip protocol, paths, and unsafe filename chars from a domain. */
export function sanitizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  try {
    // Accept full URLs
    if (d.includes("://")) d = new URL(d).hostname;
  } catch {
    // Not a URL, use as-is
  }
  // Strip leading www. for consistency
  d = d.replace(/^www\./, "");
  // Replace anything that isn't safe for a filename
  return d.replace(/[^a-z0-9.-]/g, "_");
}

function ensureDir(): void {
  fs.mkdirSync(getKnowledgeDir(), { recursive: true });
}

// ─── Read / List / Clear ────────────────────────────────────────────

export function readKnowledge(domain: string): string | null {
  const p = getKnowledgePath(domain);
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function parseKnowledge(domain: string): KnowledgeData | null {
  const raw = readKnowledge(domain);
  if (!raw) return null;
  return parseMarkdown(raw);
}

export function listKnowledge(): Array<{ domain: string; lastVerified: string; lastMode: string; sizeBytes: number }> {
  const dir = getKnowledgeDir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const results: Array<{ domain: string; lastVerified: string; lastMode: string; sizeBytes: number }> = [];
  for (const file of entries) {
    if (!file.endsWith(".md")) continue;
    const full = path.join(dir, file);
    try {
      const stat = fs.statSync(full);
      const raw = fs.readFileSync(full, "utf8");
      const parsed = parseMarkdown(raw);
      results.push({
        domain: parsed?.domain ?? file.replace(/\.md$/, ""),
        lastVerified: parsed?.lastVerified ?? new Date(stat.mtimeMs).toISOString(),
        lastMode: parsed?.lastMode ?? "unknown",
        sizeBytes: stat.size,
      });
    } catch {
      // skip unreadable files
    }
  }
  // Sort by most-recently-verified first
  results.sort((a, b) => (a.lastVerified < b.lastVerified ? 1 : -1));
  return results;
}

/** Delete knowledge for a specific domain, or all knowledge if domain is omitted. */
export function clearKnowledge(domain?: string): { removed: number } {
  const dir = getKnowledgeDir();
  if (domain) {
    const p = getKnowledgePath(domain);
    try {
      fs.unlinkSync(p);
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }
  // Nuke the whole knowledge directory
  let removed = 0;
  try {
    const entries = fs.readdirSync(dir);
    for (const f of entries) {
      if (f.endsWith(".md")) {
        try {
          fs.unlinkSync(path.join(dir, f));
          removed++;
        } catch {}
      }
    }
  } catch {
    // Dir doesn't exist — nothing to remove
  }
  return { removed };
}

// ─── Write / Merge ──────────────────────────────────────────────────

/**
 * Merge new data into the existing knowledge file for a domain. Endpoints are
 * deduplicated by (method, path). Auth fields are replaced (most recent wins).
 * Notes are appended (also deduplicated).
 */
export function mergeKnowledge(domain: string, updates: Partial<KnowledgeData>): void {
  ensureDir();
  const existing = parseKnowledge(domain);

  const merged: KnowledgeData = {
    domain: sanitizeDomain(domain),
    lastVerified: updates.lastVerified ?? new Date().toISOString(),
    lastMode: updates.lastMode ?? existing?.lastMode ?? "unknown",
    browserRequired: updates.browserRequired ?? existing?.browserRequired ?? true,
    auth: updates.auth ?? existing?.auth ?? { type: "unknown" },
    endpoints: dedupeEndpoints([...(existing?.endpoints ?? []), ...(updates.endpoints ?? [])]),
    notes: dedupeNotes([...(existing?.notes ?? []), ...(updates.notes ?? [])]),
  };

  const md = renderMarkdown(merged);
  fs.writeFileSync(getKnowledgePath(domain), md, "utf8");
  log.info(`knowledge updated: ${merged.domain} (${merged.endpoints.length} endpoints)`);
}

function dedupeEndpoints(endpoints: KnowledgeEndpoint[]): KnowledgeEndpoint[] {
  const seen = new Map<string, KnowledgeEndpoint>();
  for (const ep of endpoints) {
    const key = `${ep.method.toUpperCase()} ${ep.path}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ep);
    } else {
      // Merge — prefer non-empty description/example from either
      seen.set(key, {
        ...existing,
        description: ep.description || existing.description,
        example: ep.example || existing.example,
        firstSeen: existing.firstSeen || ep.firstSeen,
      });
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
}

function dedupeNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const n = note.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// ─── Markdown render / parse ────────────────────────────────────────

function renderMarkdown(data: KnowledgeData): string {
  const lines: string[] = [];

  // YAML frontmatter for machine-readable metadata
  lines.push("---");
  lines.push(`domain: ${data.domain}`);
  lines.push(`lastVerified: ${data.lastVerified}`);
  lines.push(`lastMode: ${data.lastMode}`);
  lines.push(`browserRequired: ${data.browserRequired}`);
  lines.push(`authType: ${data.auth.type}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${data.domain}`);
  lines.push("");
  lines.push(`Last verified: **${data.lastVerified}** via \`${data.lastMode}\` mode.`);
  lines.push("");

  // Auth section
  lines.push("## Auth material");
  lines.push("");
  lines.push(`**Type:** ${data.auth.type}`);
  if (data.auth.cookieNames?.length) {
    lines.push(`**Required cookies:** ${data.auth.cookieNames.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.localStorageKeys?.length) {
    lines.push(`**localStorage keys:** ${data.auth.localStorageKeys.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.sessionStorageKeys?.length) {
    lines.push(`**sessionStorage keys:** ${data.auth.sessionStorageKeys.map((n) => `\`${n}\``).join(", ")}`);
  }
  if (data.auth.headers?.length) {
    lines.push(`**Request headers:** ${data.auth.headers.map((n) => `\`${n}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("> _Structure only — actual values are stored encrypted in the session store._");
  lines.push("");

  // Endpoints
  if (data.endpoints.length > 0) {
    lines.push("## Known endpoints");
    lines.push("");
    lines.push("The agent can call these directly (with the auth material above) instead of launching a browser.");
    lines.push("");
    for (const ep of data.endpoints) {
      lines.push(`### ${ep.method.toUpperCase()} ${ep.path}`);
      if (ep.description) lines.push("");
      if (ep.description) lines.push(ep.description);
      if (ep.example) {
        lines.push("");
        lines.push("```");
        lines.push(ep.example);
        lines.push("```");
      }
      lines.push("");
    }
  } else {
    lines.push("## Known endpoints");
    lines.push("");
    lines.push("_None captured yet. Enable `captureApi: true` on the next `execute` run to populate this section._");
    lines.push("");
  }

  // Notes
  if (data.notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    for (const n of data.notes) lines.push(`- ${n}`);
    lines.push("");
  }

  return lines.join("\n");
}

function parseMarkdown(raw: string): KnowledgeData | null {
  // Parse YAML frontmatter — we only need our known fields, so no real YAML parser
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) return null;

  const fm: Record<string, string> = {};
  for (const line of frontmatterMatch[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }

  const body = raw.slice(frontmatterMatch[0].length);

  // Extract auth material from the "Auth material" section
  const auth: KnowledgeAuth = { type: fm.authType ?? "unknown" };
  const authSection = extractSection(body, "Auth material");
  if (authSection) {
    auth.cookieNames = extractBackticks(/\*\*Required cookies:\*\*\s+(.+)/, authSection);
    auth.localStorageKeys = extractBackticks(/\*\*localStorage keys:\*\*\s+(.+)/, authSection);
    auth.sessionStorageKeys = extractBackticks(/\*\*sessionStorage keys:\*\*\s+(.+)/, authSection);
    auth.headers = extractBackticks(/\*\*Request headers:\*\*\s+(.+)/, authSection);
  }

  // Extract endpoints from the "Known endpoints" section
  const endpoints: KnowledgeEndpoint[] = [];
  const endpointSection = extractSection(body, "Known endpoints");
  if (endpointSection) {
    const endpointRegex = /^### (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s*$/gim;
    let m: RegExpExecArray | null;
    while ((m = endpointRegex.exec(endpointSection)) !== null) {
      endpoints.push({ method: m[1], path: m[2] });
    }
  }

  // Notes
  const notes: string[] = [];
  const notesSection = extractSection(body, "Notes");
  if (notesSection) {
    for (const line of notesSection.split("\n")) {
      const m = line.match(/^-\s+(.+)$/);
      if (m) notes.push(m[1].trim());
    }
  }

  return {
    domain: fm.domain ?? "",
    lastVerified: fm.lastVerified ?? "",
    lastMode: fm.lastMode ?? "unknown",
    browserRequired: fm.browserRequired !== "false",
    auth,
    endpoints,
    notes,
  };
}

function extractSection(body: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const match = body.match(re);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const nextSection = body.slice(start).match(/^##\s+/m);
  const end = nextSection?.index != null ? start + nextSection.index : body.length;
  return body.slice(start, end);
}

function extractBackticks(re: RegExp, text: string): string[] | undefined {
  const m = text.match(re);
  if (!m) return undefined;
  const items = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  return items.length > 0 ? items : undefined;
}
