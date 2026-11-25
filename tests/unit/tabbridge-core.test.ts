// The tab bridge core against fake tabs (no socket, no browser, no site).
import { describe, expect, test } from "bun:test";
import { Bridge, timings, type Job, type Reply, type Tab } from "../../src/lib/tabbridge/core";
import { covers, siteFor, tabKey, validSite } from "../../src/lib/tabbridge/state";

// ack 100 ms, read 500 ms per tab, write 1200 ms, probe 600 ms, line 1200 ms
const T = timings(0.02);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Fake extends Tab {
  frozen: boolean;
  /** Confirms the request, then never answers. */
  silent: boolean;
  delay: number;
  got: number;
  fetched: number;
  inFlight: number;
  peak: number;
  held: Array<{ id: string; notAfter: number }>;
  thaw(): void;
  /** Answer of the next requests: an error string, or nothing for a 200. */
  error?: string;
}

let n = 0;
function fake(b: Bridge, o: Partial<Pick<Fake, "frozen" | "silent" | "delay" | "site" | "name" | "readOnly" | "error">> = {}): Fake {
  const t: Fake = {
    id: `t${++n}`, site: o.site ?? "dnnr.io", name: o.name ?? "default", readOnly: !!o.readOnly, url: "", since: Date.now(), stalled: 0, probed: 0,
    frozen: !!o.frozen, silent: !!o.silent, delay: o.delay ?? 0, got: 0, fetched: 0, inFlight: 0, peak: 0, held: [], error: o.error,
    send(m) {
      const id = m.id as string, notAfter = m.notAfter as number;
      t.got++;
      if (t.frozen) { t.held.push({ id, notAfter }); return; }
      run(id, notAfter);
    },
    thaw() { t.frozen = false; for (const h of t.held.splice(0)) run(h.id, h.notAfter); },
  };
  // What the relay does: drop a request that is past its deadline, else confirm it, fetch, answer.
  const run = (id: string, notAfter: number) => queueMicrotask(async () => {
    if (Date.now() > notAfter) { b.message(t, { id, expired: 1 }); return; }
    b.message(t, { id, ack: 1 });
    if (t.silent) return;
    t.fetched++;
    t.peak = Math.max(t.peak, ++t.inFlight);
    await sleep(t.delay);
    t.inFlight--;
    b.message(t, t.error ? { id, error: t.error } : { id, status: 200, type: "basic", headers: {}, body64: "" });
  });
  b.attach(t);
  return t;
}

const job = (method = "GET", url = "https://www.dnnr.io/x"): Job => ({ url, method, headers: {} });
function ask(b: Bridge, method = "GET", url = "https://www.dnnr.io/x", name = "default"): Promise<(Reply & { ms: number }) | { none: string; ms: number }> {
  const t0 = Date.now();
  const r = b.route(url, name);
  if ("none" in r) return Promise.resolve({ none: r.none, ms: 0 });
  return new Promise((ok) => b.request(r, job(method, url), (reply) => ok({ ...(reply as Reply), ms: Date.now() - t0 })));
}
const make = () => new Bridge(T, covers);

describe("frozen tabs", () => {
  test("a frozen tab costs one short wait, then requests fail at once until the next probe", async () => {
    const b = make(), a = fake(b, { frozen: true });
    const first = (await ask(b)) as Reply & { ms: number };
    expect(first.dead).toBe(true);
    expect(first.ms).toBeGreaterThanOrEqual(90); // the receipt wait, not the 500 ms answer wait
    expect(first.ms).toBeLessThan(400);
    const second = (await ask(b)) as Reply & { ms: number };
    expect(second.dead).toBe(true);
    expect(second.ms).toBeLessThan(50);
    expect(a.got).toBe(1); // the frozen tab was not asked again
    await sleep(650); // past the probe interval: one request tries the tab again
    const probe = (await ask(b)) as Reply & { ms: number };
    expect(probe.dead).toBe(true);
    expect(a.got).toBe(2);
  });

  test("a stalled tab is skipped for a live one, and comes back on any message from it", async () => {
    const b = make(), live = fake(b), frozen = fake(b, { frozen: true }); // the frozen one is the newest: asked first
    const first = (await ask(b)) as Reply & { ms: number };
    expect(first.status).toBe(200);
    expect(first.ms).toBeGreaterThanOrEqual(90);
    const second = (await ask(b)) as Reply & { ms: number };
    expect(second.status).toBe(200);
    expect(second.ms).toBeLessThan(50);
    expect(frozen.got).toBe(1);
    expect(live.fetched).toBe(2);
    frozen.thaw(); // it wakes up after the deadline: drops the old request, and that message shows the page runs again
    await sleep(20);
    expect(frozen.fetched).toBe(0); // the late tab did not send the expired request
    await ask(b);
    expect(frozen.fetched).toBe(1); // the newest tab answers again
  });

  test("a tab that confirms but never answers is marked stalled after the answer wait", async () => {
    const b = make(), live = fake(b), silent = fake(b, { silent: true });
    const first = (await ask(b)) as Reply & { ms: number };
    expect(first.status).toBe(200);
    expect(first.ms).toBeGreaterThanOrEqual(480);
    expect(b.status().tabs.find((x) => x.stalled)).toBeTruthy();
    expect(live.fetched).toBe(1);
    expect(silent.got).toBe(1);
  });
});

describe("writes are never sent twice", () => {
  test("no receipt: reported as not sent, and no other tab is tried", async () => {
    const b = make(), older = fake(b), frozen = fake(b, { frozen: true });
    const r = (await ask(b, "POST")) as Reply & { ms: number };
    expect(r.dead).toBe(true);
    expect(r.maybeSent).toBeUndefined();
    expect(r.error).toContain("was not sent");
    expect(older.got).toBe(0);
    frozen.thaw();
    await sleep(20);
    expect(frozen.fetched).toBe(0); // and the frozen tab drops it when it wakes up
  });

  test("receipt, then silence: may have reached the site, never resent", async () => {
    const b = make(), older = fake(b), silent = fake(b, { silent: true });
    const r = (await ask(b, "POST")) as Reply & { ms: number };
    expect(r.dead).toBe(true);
    expect(r.maybeSent).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(1150);
    expect(older.got).toBe(0);
  });

  test("the tab closes mid-write: may have reached the site; a read moves to the next tab", async () => {
    const b = make(), older = fake(b), newest = fake(b, { silent: true });
    const w = ask(b, "POST");
    await sleep(20);
    b.detach(newest);
    const r = (await w) as Reply;
    expect(r.maybeSent).toBe(true);
    expect(older.got).toBe(0);

    const b2 = make(), older2 = fake(b2), newest2 = fake(b2, { silent: true });
    const g = ask(b2);
    await sleep(20);
    b2.detach(newest2);
    expect(((await g) as Reply).status).toBe(200);
    expect(older2.fetched).toBe(1);
  });

  test("the tab can't reach the site: a read moves on, a write stops", async () => {
    const b = make(), older = fake(b), offline = fake(b, { error: "Failed to fetch" });
    expect(((await ask(b)) as Reply).status).toBe(200);
    const w = (await ask(b, "POST")) as Reply;
    expect(w.maybeSent).toBe(true);
    expect(older.fetched).toBe(1); // only the read
    expect(offline.fetched).toBe(2);
  });

  test("another error from the tab is the answer, not a dead tab", async () => {
    const b = make();
    fake(b, { error: "not this tab's site: evil.example" });
    const r = (await ask(b)) as Reply;
    expect(r.error).toContain("not this tab's site");
    expect(r.dead).toBeUndefined();
  });
});

describe("tabs and sites", () => {
  test("a new tab never kicks an older one out", async () => {
    const b = make(), a = fake(b), c = fake(b);
    expect(b.tabCount()).toBe(2);
    await ask(b);
    expect(c.fetched).toBe(1); // newest answers
    b.detach(c);
    await ask(b);
    expect(a.fetched).toBe(1); // the older one is still there
  });

  test("at most 4 reads of a site are in flight; the rest wait in line and all get answered", async () => {
    const b = make(), t = fake(b, { delay: 40 });
    const all = await Promise.all(Array.from({ length: 12 }, () => ask(b)));
    expect(all.every((r) => (r as Reply).status === 200)).toBe(true);
    expect(t.peak).toBe(4);
  });

  test("a cancelled request gives its slot back", async () => {
    const b = make(), t = fake(b, { delay: 300 });
    const r = b.route("https://dnnr.io/x") as { site: string; pool: string };
    const ids = Array.from({ length: 4 }, () => b.request(r, job(), () => {}));
    const fifth = ask(b);
    await sleep(20);
    expect(t.got).toBe(4);
    b.cancel(ids[0]);
    await sleep(20);
    expect(t.got).toBe(5);
    expect(((await fifth) as Reply).status).toBe(200);
  });

  test("a request waiting in line too long fails as busy", async () => {
    // 4 reads hold every slot for longer than the line wait (150 ms), so the fifth never gets its turn.
    const b2 = new Bridge({ ...T, tryMs: 5000, queueMs: 150 }, covers);
    fake(b2, { silent: true });
    const r2 = b2.route("https://dnnr.io/x") as { site: string; pool: string };
    for (let i = 0; i < 4; i++) b2.request(r2, job(), () => {});
    const fifth = await new Promise<Reply | null>((ok) => b2.request(r2, job(), ok));
    expect(fifth?.busy).toBe(true);
  });

  test("a request goes only to a tab of its own site, the most specific one, with its name", async () => {
    const b = make();
    const dnnr = fake(b, { site: "dnnr.io" }), admin = fake(b, { site: "admin.dnnr.io" }), slack = fake(b, { site: "app.slack.com" }), work = fake(b, { site: "dnnr.io", name: "work" });
    await ask(b, "GET", "https://www.dnnr.io/a");
    expect(dnnr.fetched).toBe(1);
    await ask(b, "GET", "https://admin.dnnr.io/a");
    expect(admin.fetched).toBe(1);
    await ask(b, "GET", "https://www.dnnr.io/a", "work");
    expect(work.fetched).toBe(1);
    expect(slack.fetched).toBe(0);
    expect(await ask(b, "GET", "https://notion.so/a")).toMatchObject({ none: "no tab attached for notion.so" });
    expect(((await ask(b, "GET", "https://slack.com/a")) as { none: string }).none).toContain("no tab attached"); // the tab covers app.slack.com only
    expect(((await ask(b, "GET", "https://app.slack.com/a", "work")) as { none: string }).none).toContain('no tab named "work"');
    expect(await ask(b, "GET", "http://www.dnnr.io/a")).toMatchObject({ none: expect.stringContaining("no tab attached") }); // https only
  });

  test("after its last tab detaches, the site says so", async () => {
    const b = make(), t = fake(b);
    b.detach(t);
    const r = b.route("https://www.dnnr.io/a") as { none: string; detachedMs?: number };
    expect(r.none).toContain("detached");
    expect(r.detachedMs).toBeGreaterThanOrEqual(0);
    fake(b);
    expect("site" in b.route("https://www.dnnr.io/a")).toBe(true);
    expect(b.status().detached.length).toBe(0);
  });

  test("a read-only tab refuses writes and still reads", async () => {
    const b = make(), t = fake(b, { readOnly: true });
    const w = (await ask(b, "POST")) as Reply;
    expect(w.error).toContain("read-only");
    expect(t.got).toBe(0);
    expect(((await ask(b)) as Reply).status).toBe(200);
  });
});

describe("sites and keys", () => {
  test("covers: the host and its subdomains, https only, loopback for tests", () => {
    expect(covers("dnnr.io", "https://www.dnnr.io/x")).toBe(true);
    expect(covers("dnnr.io", "https://dnnr.io")).toBe(true);
    expect(covers("dnnr.io", "https://evil-dnnr.io")).toBe(false);
    expect(covers("dnnr.io", "https://dnnr.io.evil.com")).toBe(false);
    expect(covers("dnnr.io", "http://www.dnnr.io")).toBe(false);
    expect(covers("app.slack.com", "https://slack.com")).toBe(false);
    expect(covers("127.0.0.1:5000", "http://127.0.0.1:5000/a")).toBe(true);
    expect(covers("127.0.0.1:5000", "http://127.0.0.1:5001/a")).toBe(false);
    expect(covers("dnnr.io", "not a url")).toBe(false);
  });

  test("siteFor and validSite", () => {
    expect(siteFor("https://www.dnnr.io/admin")).toBe("dnnr.io");
    expect(siteFor("App.Slack.com")).toBe("app.slack.com");
    expect(validSite("dnnr.io")).toBe(true);
    expect(validSite("com")).toBe(false);
    expect(validSite("dnnr.io:8080")).toBe(false);
    expect(validSite("127.0.0.1:8080")).toBe(true);
    expect(validSite("1.2.3.4")).toBe(false);
    expect(validSite("a b.io")).toBe(false);
  });

  test("a tab key is bound to site, name and read-only", () => {
    const m = "ab".repeat(32);
    const k = tabKey(m, "dnnr.io", "default", false);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(tabKey(m, "slack.com", "default", false)).not.toBe(k);
    expect(tabKey(m, "dnnr.io", "work", false)).not.toBe(k);
    expect(tabKey(m, "dnnr.io", "default", true)).not.toBe(k);
    expect(tabKey("cd".repeat(32), "dnnr.io", "default", false)).not.toBe(k);
  });
});
