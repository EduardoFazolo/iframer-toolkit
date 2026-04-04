import fs from "fs";
import path from "path";
import os from "os";
import type { BrowserMode, DomainModeEntry, DomainAttempt } from "./types";
import { createLogger } from "./logger";

const log = createLogger("domain-modes");
const DEFAULT_FILE = path.join(os.homedir(), ".iframer", "domain-modes.json");
const TTL_DAYS = 14;
const ESCALATION_LADDER: BrowserMode[] = ["headless", "docker-headful", "binary-headful"];

export class DomainModeStore {
  private data: Record<string, DomainModeEntry> = {};
  private filePath: string;

  constructor(filePath: string = DEFAULT_FILE) {
    this.filePath = filePath;
    this.load();
  }

  /** Get the recommended mode for a domain, or null if unknown/expired */
  getMode(domain: string): BrowserMode | null {
    const entry = this.data[domain];
    if (!entry) return null;
    if (this.isExpired(entry)) return null;
    return entry.mode;
  }

  /** Record a successful access */
  recordSuccess(domain: string, mode: BrowserMode): void {
    const now = new Date().toISOString();
    const existing = this.data[domain];

    this.data[domain] = {
      mode,
      lastSuccess: now,
      attempts: {
        ...(existing?.attempts || {}),
        [mode]: { result: "success", lastTried: now },
      },
    };

    this.save();
  }

  /** Record a blocked attempt */
  recordFailure(domain: string, mode: BrowserMode, reason: string): void {
    const now = new Date().toISOString();
    const existing = this.data[domain];

    this.data[domain] = {
      mode: existing?.mode || mode,
      lastSuccess: existing?.lastSuccess || "",
      attempts: {
        ...(existing?.attempts || {}),
        [mode]: { result: "blocked", reason, lastTried: now },
      },
    };

    this.save();
  }

  /** Get the next mode to try after a failure, or null if exhausted */
  getNextMode(failedMode: BrowserMode, availableModes: BrowserMode[]): BrowserMode | null {
    const idx = ESCALATION_LADDER.indexOf(failedMode);
    for (let i = idx + 1; i < ESCALATION_LADDER.length; i++) {
      if (availableModes.includes(ESCALATION_LADDER[i])) {
        return ESCALATION_LADDER[i];
      }
    }
    return null;
  }

  /** Get the best starting mode: domain memory > first available in ladder */
  getBestMode(domain: string, availableModes: BrowserMode[]): BrowserMode {
    const remembered = this.getMode(domain);
    if (remembered && availableModes.includes(remembered)) {
      return remembered;
    }
    // Default: start with the lightest available mode
    for (const mode of ESCALATION_LADDER) {
      if (availableModes.includes(mode)) return mode;
    }
    return "headless"; // fallback
  }

  /** Get summary stats for the status tool */
  getSummary(): { totalDomains: number; recentDomains: string[] } {
    const entries = Object.entries(this.data)
      .filter(([, e]) => !this.isExpired(e))
      .sort(([, a], [, b]) => b.lastSuccess.localeCompare(a.lastSuccess));

    return {
      totalDomains: entries.length,
      recentDomains: entries.slice(0, 5).map(([d, e]) => `${d} (${e.mode})`),
    };
  }

  private isExpired(entry: DomainModeEntry): boolean {
    if (!entry.lastSuccess) return true;
    const age = Date.now() - new Date(entry.lastSuccess).getTime();
    return age > TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log.error("Failed to save:", err);
    }
  }
}
