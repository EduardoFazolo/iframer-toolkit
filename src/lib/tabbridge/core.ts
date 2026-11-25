/**
 * Tab bridge core: which attached tab carries a request, and what happens when
 * a tab does not answer. No sockets and no files here, so it runs against fake
 * tabs (tests/unit/tabbridge-core.test.ts).
 *
 * Rules, most of them learned in production by the bridge this one grew from:
 * - Several tabs of one site may be attached. All stay; the newest answers. A
 *   new tab never kicks an older one out (they would reconnect and knock each
 *   other out in a loop).
 * - A read (GET/HEAD) may move to another tab, up to MAX_TABS. A write is never
 *   sent twice: if it may have reached the site, the caller is told so.
 * - A frozen background tab keeps its socket and even answers pings (the
 *   browser does that, not the page). The only sign is a request nobody
 *   confirms. Such a tab is remembered as stalled and skipped; when every tab
 *   is stalled requests fail at once, and one read per PROBE_MS tries the tab
 *   that was tried longest ago. Any message from a tab brings it back.
 * - At most MAX_ACTIVE reads per site are in flight, across every script. The
 *   rest wait in line. Writes never wait.
 *
 * Receipt: the tab confirms each request ({id, ack}). No receipt in ACK_MS means
 * the page is frozen, so a frozen tab costs seconds instead of a full request
 * timeout. Each request also carries `notAfter`; a tab that wakes up later
 * drops it.
 *
 * Writes go in two steps: the tab confirms, then waits for {id, go} before it
 * fetches. Only this side sends the go, and only while it is still waiting. So
 * "no receipt" is certain to mean "not sent" (a late receipt gets no go), and
 * from the go on, any failure is reported as "may have reached the site".
 *
 * A read whose script went away is aborted in the tab ({id, abort}); it keeps
 * its slot until the tab answers, so the site never sees more than MAX_ACTIVE.
 */

export interface Tab {
  /** Unique per connection. */
  id: string;
  site: string;
  name: string;
  readOnly: boolean;
  url: string;
  since: number;
  /** Sends one message to the relay in the tab. May throw when the socket is gone. */
  send(msg: Record<string, unknown>): void;
  /** When the tab last failed to answer in time (0 = answering). */
  stalled: number;
  /** When a request was last sent to it while stalled. */
  probed: number;
}

export interface Job {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  body64?: string | null;
  redirect?: string;
  /** Auth headers the tab fills in from page storage: header name -> where the page keeps it. */
  auth?: Record<string, unknown>;
}

export interface Reply {
  status?: number;
  type?: string;
  redirected?: boolean;
  url?: string;
  headers?: Record<string, string>;
  body64?: string;
  error?: string;
  /** No attached tab could do it. */
  dead?: boolean;
  /** A write that may have reached the site: never send it again blindly. */
  maybeSent?: boolean;
  /** Never got its turn: too many reads of this site at once. */
  busy?: boolean;
}

export interface Timings {
  /** A tab must confirm a request within this long. */
  ackMs: number;
  /** A confirmed read must be answered within this long, per tab. */
  tryMs: number;
  /** A confirmed write's whole wait. */
  writeMs: number;
  /** Stalled tabs get one new try per this long. */
  probeMs: number;
  /** Longest wait in line. */
  queueMs: number;
}

export function timings(scale = 1): Timings {
  return { ackMs: 5_000 * scale, tryMs: 25_000 * scale, writeMs: 60_000 * scale, probeMs: 30_000 * scale, queueMs: 60_000 * scale };
}

/** A read tries at most this many tabs. */
export const MAX_TABS = 3;
/** Reads in flight per site, across every script. */
export const MAX_ACTIVE = 4;

/** The tab's fetch itself failed (the tab can't reach the site), as opposed to an HTTP answer from the site. */
const NETWORK_ERR = /failed to fetch|networkerror|load failed|network connection|aborted|timed out/i;

export const isRead = (method: string): boolean => method === "GET" || method === "HEAD";

type Done = (reply: Reply | null) => void;
interface Wait {
  done: Done;
  site: string;
  pool: string;
  job: Job;
  read: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** The tab that has the request now. */
  tab?: string;
  acked: boolean;
  /** A write the tab was told to send ({go}). Before that it was certainly not sent. */
  released: boolean;
  /** The script went away; the read is only kept until its tab lets go of it. */
  cancelled: boolean;
  tried: Set<string>;
  last: string;
  active: boolean;
}

export type Route = { site: string; pool: string } | { none: string; detachedMs?: number };

const poolKey = (site: string, name: string) => `${site}\n${name}`;
const secs = (ms: number) => { const s = ms / 1000; return s >= 1 ? String(Math.round(s)) : String(s); };

export class Bridge {
  private pools = new Map<string, Tab[]>(); // site + name -> attached tabs, newest last
  private waiting = new Map<string, Wait>();
  private active = new Map<string, number>(); // site -> reads in flight
  private line = new Map<string, string[]>(); // site -> ids of reads waiting for a free slot, oldest first
  private gone = new Map<string, number>(); // site + name -> when its last tab detached
  private seq = 0;
  /** When a tab was last attached or a request last arrived (the daemon's idle exit reads it). */
  lastUse: number;

  constructor(
    private t: Timings = timings(),
    private covers: (site: string, url: string) => boolean = () => false,
    private now: () => number = () => Date.now(),
  ) { this.lastUse = this.now(); }

  // ── Tabs ────────────────────────────────────────────────────────────────

  attach(tab: Tab): void {
    const key = poolKey(tab.site, tab.name);
    const list = this.pools.get(key) ?? [];
    list.push(tab);
    this.pools.set(key, list);
    this.gone.delete(key);
    this.lastUse = this.now();
  }

  detach(tab: Tab): void {
    const key = poolKey(tab.site, tab.name);
    const all = this.pools.get(key) ?? [];
    if (!all.includes(tab)) return;
    const left = all.filter((x) => x !== tab);
    if (left.length) this.pools.set(key, left);
    else { this.pools.delete(key); this.gone.set(key, this.now()); }
    for (const [id, w] of this.waiting) {
      if (w.tab !== tab.id) continue;
      w.last = `the ${w.site} tab closed before answering`;
      if (w.read) this.dispatch(id, w);
      // Released: the page may have sent it before it went away. Not released: it never started.
      else if (w.released) this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
    }
  }

  /** A message from the relay in a tab. Any message means the page's own code runs: the tab is alive. */
  message(tab: Tab, m: Record<string, any>): void {
    tab.stalled = 0;
    if (typeof m.hello === "string") { tab.url = m.hello; return; }
    const id = typeof m.id === "string" ? m.id : "";
    const w = this.waiting.get(id);
    if (!w || w.tab !== tab.id) return; // late answer from a tab we already moved on from
    if (m.ack) {
      if (w.acked) return;
      w.acked = true;
      clearTimeout(w.timer);
      if (!w.read) {
        // The tab holds a write until this go. From here on it may reach the site.
        try { tab.send({ id, go: 1 }); }
        catch { return this.finish(id, w, { error: `the ${w.site} tab closed before the write was released. The write was not sent`, dead: true }); }
        w.released = true;
      }
      const ms = w.read ? this.t.tryMs : this.t.writeMs;
      w.timer = setTimeout(() => {
        tab.stalled = tab.probed = this.now();
        w.last = `the ${w.site} tab did not answer in ${secs(ms)} s`;
        if (w.read) this.dispatch(id, w); else this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      }, ms);
      return;
    }
    if (m.expired) {
      // The tab woke up after the deadline and dropped the request: it was not sent.
      w.last = `the ${w.site} tab was frozen and dropped the request`;
      if (w.read) this.dispatch(id, w); else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      return;
    }
    const err = typeof m.error === "string" ? m.error : "";
    if (err && NETWORK_ERR.test(err)) {
      w.last = `the ${w.site} tab could not reach ${w.site} (${err})`;
      if (w.read) this.dispatch(id, w);
      else if (w.released) this.finish(id, w, { error: w.last, dead: true, maybeSent: true });
      else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      return;
    }
    const { id: _id, ack: _ack, expired: _expired, ...reply } = m;
    this.finish(id, w, reply as Reply);
  }

  // ── Requests ────────────────────────────────────────────────────────────

  /** The attached site that owns this URL (the most specific one), for tabs with this name. */
  route(url: string, name = "default"): Route {
    let best = "";
    for (const key of this.pools.keys()) {
      const [site, n] = key.split("\n");
      if (n === name && this.covers(site, url) && site.length > best.length) best = site;
    }
    if (best) return { site: best, pool: poolKey(best, name) };
    let host = url;
    try { host = new URL(url).hostname; } catch { /* keep */ }
    const others = [...this.pools.keys()].map((k) => k.split("\n")).filter(([site]) => this.covers(site, url)).map(([, n]) => n);
    if (others.length) return { none: `no tab named "${name}" is attached for ${host} (attached: ${[...new Set(others)].join(", ")})` };
    let detached: number | undefined;
    for (const [key, at] of this.gone) {
      const [site, n] = key.split("\n");
      if (n === name && this.covers(site, url)) detached = Math.max(detached ?? 0, at);
    }
    return detached === undefined
      ? { none: `no tab attached for ${host}` }
      : { none: `the ${host} tab detached ${Math.round((this.now() - detached) / 60000)} min ago (page reloaded, navigated or closed)`, detachedMs: this.now() - detached };
  }

  /** Starts a request. `done` gets the reply, or null after cancel(). Returns the id for cancel(). */
  request(route: { site: string; pool: string }, job: Job, done: Done): string {
    const id = `${(++this.seq).toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const w: Wait = { done, site: route.site, pool: route.pool, job, read: isRead(job.method), acked: false, released: false, cancelled: false, tried: new Set(), last: "", active: false };
    this.waiting.set(id, w);
    this.lastUse = this.now();
    this.run(id, w);
    return id;
  }

  /**
   * The script went away (killed, timed out). A read waiting in line just leaves. A read already in a tab is aborted
   * there and keeps its slot until the tab answers (or goes away, or its timer runs out): freeing it at once would put
   * a fifth request on the site while the cancelled one still runs. A write is never cut off: it only stops waiting.
   */
  cancel(id: string): void {
    const w = this.waiting.get(id);
    if (!w) return;
    const tab = w.tab ? (this.pools.get(w.pool) ?? []).find((x) => x.id === w.tab) : undefined;
    if (!w.read || !w.active || !tab) return this.finish(id, w, null);
    w.cancelled = true;
    w.done = () => {};
    try { tab.send({ id, abort: 1 }); } catch { this.finish(id, w, null); }
  }

  private finish(id: string, w: Wait, reply: Reply | null): void {
    clearTimeout(w.timer);
    this.waiting.delete(id);
    w.done(reply);
    const waitingLine = this.line.get(w.site);
    if (!w.active) {
      if (waitingLine?.includes(id)) this.line.set(w.site, waitingLine.filter((x) => x !== id));
      return;
    }
    w.active = false;
    this.active.set(w.site, (this.active.get(w.site) ?? 1) - 1);
    for (let next = waitingLine?.shift(); next; next = waitingLine?.shift()) {
      const n = this.waiting.get(next);
      if (n) { this.run(next, n); break; }
    }
  }

  /** Start a job now, or put a read in line when MAX_ACTIVE of its site are in flight. */
  private run(id: string, w: Wait): void {
    clearTimeout(w.timer);
    if (!w.read) return this.dispatch(id, w);
    if ((this.active.get(w.site) ?? 0) < MAX_ACTIVE) {
      w.active = true;
      this.active.set(w.site, (this.active.get(w.site) ?? 0) + 1);
      return this.dispatch(id, w);
    }
    this.line.set(w.site, [...(this.line.get(w.site) ?? []), id]);
    w.timer = setTimeout(() => this.finish(id, w, { error: `${this.line.get(w.site)?.length ?? 0} requests were waiting for ${w.site} for ${secs(this.t.queueMs)} s`, busy: true }), this.t.queueMs);
  }

  /**
   * Send a job to the newest tab of its site that is answering and that it has
   * not tried yet. No tab to try = `dead`, at once.
   */
  private dispatch(id: string, w: Wait): void {
    clearTimeout(w.timer);
    if (w.cancelled) return this.finish(id, w, null); // nobody is waiting: never try another tab
    const now = this.now();
    const all = this.pools.get(w.pool) ?? [];
    const usable = all.filter((x) => w.read || !x.readOnly);
    if (!w.read && all.length && !usable.length) {
      return this.finish(id, w, { error: `the ${w.site} tab is attached read-only, so it refuses ${w.job.method}. Attach it again without --read-only to allow writes` });
    }
    const open = w.tried.size >= MAX_TABS ? [] : [...usable].reverse().filter((x) => !w.tried.has(x.id));
    const lastProbe = Math.max(0, ...all.map((x) => x.probed));
    const probe = w.read && !w.tried.size && now - lastProbe >= this.t.probeMs
      ? open.filter((x) => x.stalled).sort((a, b) => a.probed - b.probed)[0]
      : undefined;
    const tab = open.find((x) => !x.stalled) ?? probe;
    if (!tab) {
      const why = w.last || (all.length ? `none of the ${all.length} attached ${w.site} tabs is answering` : `no live ${w.site} tab`);
      return this.finish(id, w, { error: why, dead: true });
    }
    if (tab.stalled) tab.probed = now;
    w.tab = tab.id;
    w.acked = false;
    w.released = false;
    w.tried.add(tab.id);
    // The tab drops the request if it only wakes up after this, so "no receipt" below means "not sent".
    const notAfter = Date.now() + Math.round(this.t.ackMs * 0.8);
    w.timer = setTimeout(() => {
      // Let a receipt that is already waiting on the socket be read first.
      setImmediate(() => {
        if (this.waiting.get(id) !== w || w.tab !== tab.id || w.acked) return;
        tab.stalled = tab.probed = this.now();
        w.last = `the ${w.site} tab did not confirm the request in ${secs(this.t.ackMs)} s (frozen in the background?)`;
        if (w.read) this.dispatch(id, w); else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
      });
    }, this.t.ackMs);
    try { tab.send({ id, ...w.job, notAfter }); }
    catch {
      clearTimeout(w.timer);
      w.last = `the ${w.site} tab closed before the request was sent`;
      if (w.read) this.dispatch(id, w); else this.finish(id, w, { error: `${w.last}. The write was not sent`, dead: true });
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────

  tabCount(): number { let n = 0; for (const l of this.pools.values()) n += l.length; return n; }
  pending(): number { return this.waiting.size; }

  status(): { tabs: Array<{ site: string; name: string; url: string; since: number; stalled: boolean; readOnly: boolean }>; detached: Array<{ site: string; name: string; at: number }> } {
    return {
      tabs: [...this.pools.values()].flatMap((l) => l.map((x) => ({ site: x.site, name: x.name, url: x.url, since: x.since, stalled: !!x.stalled, readOnly: x.readOnly }))),
      detached: [...this.gone].map(([key, at]) => { const [site, name] = key.split("\n"); return { site, name, at }; }),
    };
  }
}
