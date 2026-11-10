// End-to-end test of the in-page capture kit in real Chrome, driven through
// the same primitives T3 Code's preview tools use:
//   preview_evaluate         -> CDP Runtime.evaluate {awaitPromise, returnByValue}
//   preview_act upload       -> locator.setInputFiles(paths)
//   preview_status.downloads -> page "download" event + saveAs
// Local fixture only. Run: bun tests/integration/kit-bridge.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { startFixture, SECRETS } from "../fixtures/kit-fixture.mjs";
import * as kit from "../../src/lib/kit/index.ts";
import { findChrome } from "../../src/lib/browser/chrome-downloader.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-test-"));
// KIT_CLI=dist/cli.js tests the kit as the published bundle serializes it.
function makeKit(file, extra = []) {
  if (!process.env.KIT_CLI) return kit.writeKit(extra.includes("passive") ? { mode: "passive" } : {}, file);
  fs.writeFileSync(file, execFileSync("node", [path.resolve(ROOT, process.env.KIT_CLI), "kit", "--print", ...(extra.length ? ["--mode", ...extra] : [])], { encoding: "utf8" }));
  return file;
}
const KIT = makeKit(path.join(tmp, "iframer-kit.js"));
const PASSIVE_KIT = makeKit(path.join(tmp, "iframer-kit-passive.js"), ["passive"]);

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}

const { server, log, port } = await startFixture();
const executablePath = findChrome() || undefined;
const browser = await chromium.launch({ headless: true, executablePath });
const base = `http://127.0.0.1:${port}`;

async function openTab() {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const downloads = [];
  page.on("download", (d) => {
    const p = path.join(tmp, `${downloads.length}-${d.suggestedFilename()}`);
    downloads.push({ p, ready: d.saveAs(p) });
  });
  const evaluate = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split("\n")[0]);
    return r.result.value ?? null;
  };
  return { context, page, downloads, evaluate };
}

// The exact expressions the T3 instructions print.
const steps = kit.kitInstructions("t3", KIT).split("\n");
const expr = (n) => steps.find((l) => l.startsWith(`${n}. preview_evaluate: `)).replace(`${n}. preview_evaluate: `, "").replace(/\s+->.*$/, "");
const MAKE_INPUT = expr(1), STASH = expr(3), INSTALL = expr(4);

async function bridgeInstall(tab, file = KIT) {
  await tab.evaluate(MAKE_INPUT);
  await tab.page.locator("#__ifk_in").setInputFiles([file]);
  await tab.evaluate(STASH);
  return tab.evaluate(INSTALL);
}

try {
  // ── Install under strict CSP and Trusted Types, survive reload ────────
  for (const csp of ["strict", "trustedTypes"]) {
    const tab = await openTab();
    await tab.page.goto(`${base}/page1?csp=${csp}`, { waitUntil: "load" });
    const r = await bridgeInstall(tab);
    check(`installs under ${csp} CSP`, r?.installed === true && r.again === false, r);
    const again = await tab.evaluate(INSTALL);
    check(`second install on the same page is a no-op (${csp})`, again?.again === true, again);
    await tab.page.reload({ waitUntil: "load" });
    const gone = await tab.evaluate(`window.__ifk?window.__ifk.summary():'NOT_INSTALLED'`);
    check(`status says NOT_INSTALLED after reload (${csp})`, gone === "NOT_INSTALLED", gone);
    const re = await tab.evaluate(INSTALL);
    check(`reinstalls from sessionStorage after reload (${csp})`, re?.installed === true, re);
    await tab.context.close();
  }

  // ── Full flow: capture, navigate, export, compare with the server ─────
  log.length = 0;
  const tab = await openTab();
  await tab.page.goto(`${base}/page1?csp=strict`, { waitUntil: "load" });
  await tab.page.waitForLoadState("networkidle");
  await bridgeInstall(tab);
  await tab.page.click("#flow");
  await tab.page.waitForFunction(() => window.flowOk === true);
  await tab.page.waitForTimeout(400);
  await tab.page.click("#nav");
  await tab.page.waitForURL(/page2/);
  await tab.page.waitForLoadState("networkidle");
  const afterNav = await tab.evaluate(INSTALL);
  check("restores the capture after navigating", afterNav?.restored > 0, afterNav);
  await tab.page.click("#go");
  await tab.page.waitForURL(/page2/);
  await tab.page.waitForLoadState("networkidle");
  await tab.evaluate(INSTALL);
  await tab.evaluate(`Promise.resolve(window.runMany()).then(()=>1)`);
  await tab.page.waitForTimeout(400);

  const dump = await tab.evaluate(`window.__ifk.dump()`);
  await tab.page.waitForTimeout(400);
  await Promise.all(tab.downloads.map((d) => d.ready));
  check("dump() produces a download", tab.downloads.length === 1 && fs.existsSync(tab.downloads[0].p), dump);
  const file = tab.downloads[0].p;
  const raw = fs.readFileSync(file, "utf8");

  const leaked = Object.entries(SECRETS).filter(([, v]) => raw.includes(v) || raw.includes(encodeURIComponent(v)) || raw.includes(v.replace(/^Bearer /, "")));
  check("no seeded secret appears in the export", leaked.length === 0, leaked.map(([k]) => k).join(", "));
  check("export has no other emails", !/other\.person@example\.com/.test(raw));

  const report = kit.parseCapture(raw);
  check("capture parses", report.kind === "iframer-capture");
  const findings = kit.scanCapture(report);
  check("privacy scan is clean", findings.length === 0, findings);

  const seenByServer = [...new Set(log.filter((l) => l.path.startsWith("/api")).map((l) => `${l.method} ${l.path}`))];
  const keys = Object.keys(report.endpoints).map((k) => k.replace(base, ""));
  const tplPath = (p) => p.split("/").map((s) => (/^\d+$/.test(s) ? "{id}" : s)).join("/");
  const missed = seenByServer.filter((s) => {
    const [m, p] = s.split(" ");
    return !keys.includes(`${m} ${tplPath(p)}`) && !keys.includes(`${m} ${p}`) && !keys.some((k) => k.startsWith(`${m} /api/people/`) && p.startsWith("/api/people/"));
  });
  // Known blind spots: the worker's fetch and the redirect target.
  // Calls made before install show up as path only (no method, no payload).
  const pathOnly = report.pathOnly.map((p) => p.replace(base, ""));
  const unexpected = missed.filter((s) => !/worker-ping|redirect-target/.test(s) && !pathOnly.includes(tplPath(s.split(" ")[1])));
  check("captures every page-made API call except known blind spots", unexpected.length === 0, { missed, pathOnly });
  check("pre-install call reported as path only", pathOnly.includes("/api/boot"), pathOnly);
  check("coverage never claims completeness", report.coverage.complete === false && report.coverage.blindSpots.length > 0);
  check("POST body recorded as a shape", report.endpoints[`POST ${base}/api/orders`]?.req?.json?.contact?.email === "string", report.endpoints[`POST ${base}/api/orders`]);
  check("learns where the auth token lives (names only)", JSON.stringify(report.auth?.headers?.authorization) === JSON.stringify({ from: "localStorage", key: "session", path: ["user", "token"], prefix: "Bearer " }), report.auth);
  check("auth headers kept as names only", report.endpoints[`GET ${base}/api/items/{id}`]?.auth?.includes("authorization"));
  check("form submit recorded", Object.keys(report.endpoints).some((k) => k.startsWith(`POST ${base}/submit`)));
  check("email + code in path become {id}", keys.includes("GET /api/people/{id}/{id}"), keys.filter((k) => k.includes("people")));
  check("map keyed by emails collapses to {key}", JSON.stringify(report.endpoints[`GET ${base}/api/users-by-email`]?.res) === JSON.stringify({ "{key}": { id: "number", role: "string" } }), report.endpoints[`GET ${base}/api/users-by-email`]);

  // ── Ingest through the real CLI ───────────────────────────────────────
  const outDir = path.join(tmp, "out");
  const dataDir = path.join(tmp, "data");
  const cliOut = execFileSync("bun", [path.join(ROOT, "bin/cli.js"), "ingest", file, "--out", outDir, "--json", "--no-session"], {
    env: { ...process.env, IFRAMER_DATA_DIR: dataDir }, encoding: "utf8",
  });
  const summary = JSON.parse(cliOut.trim().split("\n").pop());
  check("ingest succeeds", summary.ok === true && summary.endpoints > 30, summary);
  check("ingest deletes the capture file", !fs.existsSync(file));
  const knowledge = fs.readFileSync(path.join(dataDir, "knowledge", "127.0.0.1.md"), "utf8");
  check("knowledge file written without values", knowledge.includes("/api/orders") && !Object.values(SECRETS).some((v) => knowledge.includes(v)));
  for (const f of ["api.json", "index.txt"]) {
    const body = fs.readFileSync(path.join(outDir, f), "utf8");
    check(`${f} has no seeded secret`, !Object.values(SECRETS).some((v) => body.includes(v)));
  }
  // ── Replays in the page with the cookie ───────────────────────────────
  const priv = await tab.evaluate(`window.__ifk.call('GET','/api/private')`);
  check("in-page replay carries the HttpOnly cookie", priv?.status === 200, priv);
  // Fresh page after navigations: the token comes back from where the page keeps it.
  const me = await tab.evaluate(`window.__ifk.call('GET','/api/me')`);
  check("replay attaches the page's auth header on its own", me?.status === 200 && me.auth?.includes("authorization"), me);
  const noAuth = await tab.evaluate(`window.__ifk.call('GET','/api/me',{auth:false})`);
  check("{auth:false} skips it, and a 401 explains why", noAuth?.status === 401 && typeof noAuth.hint === "string", noAuth);
  const item = await tab.evaluate(`window.__ifk.call('GET','/api/items/5')`);
  check("GET replay works", item?.status === 200 && Array.isArray(item.data?.data), item?.status);
  // Small answers: big results become an overview, pick keeps only what's asked, full has a hard cap.
  const big = await tab.evaluate(`window.__ifk.call('GET','/api/big')`);
  check("big result returns an overview, not the data", big?.data === undefined && big?.bytes > 100000 && big.overview?.data?.startsWith("array(300)") && JSON.stringify(big).length < 1000, { size: JSON.stringify(big).length, big });
  const fullBig = await tab.evaluate(`window.__ifk.call('GET','/api/big',{full:true})`);
  check("{full:true} can't pass the hard cap", fullBig?.data === undefined && fullBig.hint?.includes("hard cap"), fullBig?.hint);
  const picked = await tab.evaluate(`window.__ifk.call('GET','/api/big',{pick:'data.{id,status}',full:true})`);
  check("pick keeps only the asked fields, mapping over arrays", picked?.data?.length === 300 && JSON.stringify(picked.data[0]) === '{"id":1,"status":"active"}', picked?.data?.[0] ?? picked);
  const counted = await tab.evaluate(`window.__ifk.call('GET','/api/big',{pick:['data.length','page.total']})`);
  check("pick with several paths and length", counted?.data?.["data.length"] === 300 && counted.data["page.total"] === 300, counted);
  const write = await tab.evaluate(`window.__ifk.call('POST','/api/orders',{json:{sku:'x'}})`);
  check("writes refused without approval", write?.error === "write needs approval", write);
  const cross = await tab.evaluate(`window.__ifk.call('GET','https://example.com/x')`);
  check("cross-origin replay refused", cross?.error === "cross-origin", cross);
  const limited = await tab.evaluate(`window.__ifk.call('GET','/api/rate-limited')`);
  const afterLimit = await tab.evaluate(`window.__ifk.call('GET','/api/private')`);
  check("stops for good after a 429", limited?.stopped === "HTTP 429" && afterLimit?.error === "stopped", { limited, afterLimit });
  const stopped = await tab.evaluate(`(window.__ifk.stop(), [typeof window.__ifk, fetch.toString().includes('native code'), sessionStorage.getItem('__ifk_state')])`);
  check("stop() removes hooks and state", stopped[0] === "undefined" && stopped[1] === true && stopped[2] === null, stopped);
  await tab.context.close();

  // ── Next.js: route params, RSC data, Server Actions across a deploy ──
  {
    const t = await openTab();
    await t.page.goto(`${base}/acme/dashboard`, { waitUntil: "load" });
    // An older kit is already in the tab: installing must replace it, not no-op.
    await t.evaluate(fs.readFileSync(KIT, "utf8").replace(/"build":"[^"]+"/, '"build":"oldbuild1"'));
    const r = await bridgeInstall(t);
    check("replaces an older kit already in the tab", r?.installed === true && r.replaced === "oldbuild1" && r.again === false, r);
    check("detects Next.js", r?.nextjs === true, r);
    await t.evaluate(`window.runNext().then(()=>1)`);
    await t.page.waitForTimeout(600);
    const rep = JSON.parse(await t.evaluate(`window.__ifk.drain(0, 1e8).chunk`));
    const keys = Object.keys(rep.endpoints).map((k) => k.replace(base, ""));
    check("route segment named from Next.js's own route data", keys.includes("GET /{communitySlug}/dashboard/campaigns"), keys);
    const camp = rep.endpoints[`GET ${base}/{communitySlug}/dashboard/campaigns`];
    check("RSC response becomes component data shapes", camp?.res?.rsc?.components?.CampaignsTable?.campaigns?.[0]?.title === "string" && camp.res.rsc.components.CampaignsTable.campaigns[0].note === "string", camp?.res);
    const act = rep.endpoints[`POST ${base}/{communitySlug}/dashboard#getRestaurants`];
    check("Server Action recorded under its export name, with its return shape", act?.next?.name === "getRestaurants" && act?.res?.rsc?.action?.[0]?.city === "string", keys);
    check("no route values or data values in the export", !/acme|Bistro|Spring|Wichita/.test(JSON.stringify(rep)));

    const cap = path.join(tmp, "next-capture");
    fs.writeFileSync(cap, JSON.stringify(rep));
    const outN = path.join(tmp, "next-out");
    execFileSync("bun", [path.join(ROOT, "bin/cli.js"), "ingest", cap, "--out", outN, "--no-knowledge", "--json", "--no-session"], { encoding: "utf8" });
    const idx = fs.readFileSync(path.join(outN, "index.txt"), "utf8");
    check("index names the route param and the Server Action", idx.includes("GET /{communitySlug}/dashboard/campaigns [rsc]") && idx.includes("action getRestaurants"), idx);
    const P = "'/acme/dashboard/campaigns'";
    const c = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true})`);
    check("RSC replay returns page data, not HTML", c?.data?.components?.CampaignsTable?.campaigns?.[0]?.title === "Spring" && c.data.components.CampaignsTable.campaigns[0].note === "Café night ✓", c);
    const one = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true, component:'CampaignsTable', pick:'campaigns.{id,title}'})`);
    check("RSC: one component, picked fields", JSON.stringify(one?.data) === '[{"id":11,"title":"Spring"}]', one);
    const nope = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true, component:'Nope'})`);
    check("RSC: unknown component lists the real ones", nope?.error?.includes("Nope") && nope.components?.includes("CampaignsTable"), nope);
    const found = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true, find:'campaigns.title', pick:'campaigns.{id,title}'})`);
    check("find by shape, not by component name", JSON.stringify(found?.data) === '[{"id":11,"title":"Spring"}]', found);
    const ov = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true, maxBytes:50})`);
    check("too big: components listed biggest first with their keys", ov?.data === undefined && ov.overview?.CampaignsTable?.keys?.includes("campaigns") && ov.hint?.includes("find"), ov);
    const walk = await t.evaluate(`window.__ifk.walk(['/acme/dashboard/campaigns','/acme/dashboard/campaigns'],{waitMs:100})`);
    await t.page.waitForTimeout(600);
    const ws = await t.evaluate(`window.__ifk.walkStatus()`);
    check("walk runs in the background through the router, walkStatus reports", walk?.started && walk.via === "next.router.push" && ws?.done === true && ws.i === 2, { walk, ws });
    const sum = await t.evaluate(`window.__ifk.summary()`);
    check("summary has counts and the 500-call budget", sum?.seen > 0 && sum.maxCalls === 500, sum);
    const sch = await t.evaluate(`window.__ifk.call('GET',${P},{rsc:true, schema:true})`);
    check("schema lists the records list with its keys", sch?.schema?.includes("CampaignsTable.campaigns[1]") && sch.schema.includes("title"), sch);
    const html = await t.evaluate(`window.__ifk.call('GET','/acme/dashboard/campaigns')`);
    check("plain GET on a Next page explains the RSC header", html?.hint?.includes("rsc:true"), html);
    const noOk = await t.evaluate(`window.__ifk.action('getRestaurants',[{communitySlug:'acme'}])`);
    check("Server Action needs approval", noOk?.error === "write needs approval", noOk);
    const a1 = await t.evaluate(`window.__ifk.action('getRestaurants',[{communitySlug:'acme'}],{approved:true})`);
    check("Server Action replay returns its value", a1?.status === 200 && a1.data?.[0]?.name === "Bistro ü" && a1.data[0].community === "acme", a1);

    await fetch(`${base}/__deploy`);
    await t.page.reload({ waitUntil: "load" });
    await t.evaluate(INSTALL);
    const a2 = await t.evaluate(`window.__ifk.action('getRestaurants',[{communitySlug:'acme'}],{approved:true})`);
    check("Server Action still works after a deploy changes its id", a2?.status === 200 && a2.data?.[0]?.name === "Bistro ü" && a2.actionId !== a1.actionId, { a1: a1?.actionId, a2 });
    // ── In-page recipes (fallback for sites that block Node): one short line, in a tab without the kit ──
    const rdata = path.join(tmp, "rdata");
    const host = `127.0.0.1:${port}`;
    const cli = (...a) => execFileSync("bun", [path.join(ROOT, "bin/cli.js"), "recipe", host, ...a], { env: { ...process.env, IFRAMER_DATA_DIR: rdata }, encoding: "utf8" });
    cli("campaignTitles", "--path", "/{communitySlug}/dashboard/campaigns", "--rsc", "--find", "campaigns.title", "--format", "d => d.campaigns.map(c => c.title).join(', ')", "--describe", "campaign titles");
    let refused = 0;
    try { cli("restaurants", "--action", "getRestaurants", "--args", '[{"communitySlug":"{communitySlug}"}]'); } catch (e) { refused = e.status; }
    check("action recipe needs --approved", refused === 1);
    cli("restaurants", "--action", "getRestaurants", "--args", '[{"communitySlug":"{communitySlug}"}]', "--approved", "--read-only", "--in-page", "--format", "d => d.length + ' restaurants: ' + d.map(r => r.name).join(', ')");
    const listed = cli();
    check("recipe list is one line each", /campaignTitles: campaign titles/.test(listed) && /restaurants\n/.test(listed + "\n"), listed);
    const bundleSrc = fs.readFileSync(path.join(rdata, "apis", host, "recipes.js"), "utf8");
    check("bundle doesn't use the kit", !bundleSrc.includes("__ifk."));
    const r2 = await openTab();
    await r2.page.goto(`${base}/acme/dashboard`, { waitUntil: "load" });
    const names = await r2.evaluate(bundleSrc);
    const line = await r2.evaluate(`window.__ifkRecipes.campaignTitles({communitySlug:'acme'})`);
    const line2 = await r2.evaluate(`window.__ifkRecipes.restaurants({communitySlug:'acme'})`);
    const miss = await r2.evaluate(`window.__ifkRecipes.campaignTitles({})`);
    check("RSC recipe returns one line, no kit in the tab", line === "Spring" && (await r2.evaluate("typeof window.__ifk")) === "undefined", { names, line });
    check("Server Action recipe returns one line", line2 === "1 restaurants: Bistro ü", line2);
    check("missing arg is a short error", miss === "error: missing arg communitySlug", miss);
    await r2.context.close();

    await fetch(`${base}/__deploy`); // back to the first id for any later run
    await t.context.close();
  }

  // ── Bot wall stops replays ────────────────────────────────────────────
  {
    const t = await openTab();
    await t.page.goto(`${base}/page1?csp=strict`, { waitUntil: "load" });
    await bridgeInstall(t);
    const wall = await t.evaluate(`window.__ifk.call('GET','/api/wall')`);
    check("bot wall stops replays", wall?.stopped === "bot wall", wall);
    await t.context.close();
  }

  // ── Site that deletes window.sessionStorage (Discord) ─────────────────
  {
    const t = await openTab();
    await t.page.goto(`${base}/no-storage`, { waitUntil: "load" });
    const gone = await t.evaluate(`typeof window.sessionStorage`);
    const r = await bridgeInstall(t);
    await t.evaluate(`window.go().then(r=>r.status)`);
    await t.page.waitForTimeout(400);
    await t.page.click("#nav");
    await t.page.waitForLoadState("load");
    const re = await t.evaluate(INSTALL);
    check("works when the page deletes sessionStorage, and restores after navigating", gone === "undefined" && r?.installed === true && re?.restored >= 1, { gone, r, re });
    await t.context.close();
  }

  // ── Same-origin iframe ────────────────────────────────────────────────
  {
    const t = await openTab();
    await t.page.goto(`${base}/frame-host`, { waitUntil: "load" });
    await bridgeInstall(t);
    await t.page.frameLocator("#fr").locator("#inner").click();
    await t.page.waitForTimeout(400);
    const ep = await t.evaluate(`JSON.parse(window.__ifk.drain(0).chunk).endpoints[${JSON.stringify(`PUT ${base}/api/from-frame/{id}`)}]`);
    check("same-origin iframe calls captured with payload", ep?.req?.json?.note === "string", ep);
    await t.context.close();
  }

  // ── Passive mode: no patching, path-only coverage ─────────────────────
  {
    const t = await openTab();
    await t.page.goto(`${base}/page1?csp=strict`, { waitUntil: "load" });
    const r = await bridgeInstall(t, PASSIVE_KIT);
    await t.page.click("#flow");
    await t.page.waitForFunction(() => window.flowOk === true);
    await t.page.waitForTimeout(400);
    const s = await t.evaluate(`[window.__ifk.summary(), fetch.toString().includes('native code')]`);
    check("passive mode leaves fetch untouched and still sees paths", r?.mode === "passive" && s[1] === true && s[0].pathOnly > 3 && s[0].withPayload === 0, s);
    await t.context.close();
  }

  // ── Drain fallback reassembles to the same report ─────────────────────
  {
    const t = await openTab();
    await t.page.goto(`${base}/page1?csp=strict`, { waitUntil: "load" });
    await bridgeInstall(t);
    await t.evaluate(`Promise.resolve(window.runMany()).then(()=>1)`);
    await t.page.waitForTimeout(300);
    let cursor = 0, joined = "";
    while (cursor !== null) {
      const r = await t.evaluate(`window.__ifk.drain(${cursor}, 4000)`);
      joined += r.chunk;
      cursor = r.next;
    }
    const rep = kit.parseCapture(joined);
    check("drain chunks join into a valid capture", Object.keys(rep.endpoints).length >= 30);
    await t.context.close();
  }

  // ── Private values are separated out, the API is kept ──────────────────
  {
    const leaky = () => JSON.stringify({ kind: "iframer-capture", v: 1, origin: base, coverage: { seen: 2, withPayload: 1, pathOnly: 0, blindSpots: [] }, endpoints: {
      [`GET ${base}/api/u/${SECRETS.email}`]: { kind: "fetch", n: 1, status: [200], query: [], headers: [], auth: [] },
      [`GET https://od-a1b2c3d4e5f6a7b8c9d0e1f2.cdn.test/v1/${SECRETS.lsToken}/feed`]: { kind: "fetch", n: 1, status: [200], query: [], headers: [], auth: [], res: { [SECRETS.email]: "string" } },
    }, pathOnly: [] });
    const bad = path.join(tmp, "bad");
    fs.writeFileSync(bad, leaky());
    const out = execFileSync("bun", [path.join(ROOT, "bin/cli.js"), "ingest", bad, "--out", path.join(tmp, "bad-out"), "--no-knowledge", "--json", "--all", "--no-session"], { encoding: "utf8" });
    const sum = JSON.parse(out.trim().split("\n").pop());
    const api = fs.readFileSync(path.join(tmp, "bad-out", "api.json"), "utf8");
    check("ingest keeps the API and swaps private values for placeholders", sum.ok === true && sum.redacted.length >= 3 && api.includes("/api/u/{id}") && api.includes("/v1/{id}/feed") && !Object.values(SECRETS).some((v) => api.includes(v)) && !api.includes("od-a1b2"), { sum, api: api.slice(0, 400) });
    fs.writeFileSync(bad, leaky());
    let code = 0;
    try { execFileSync("bun", [path.join(ROOT, "bin/cli.js"), "ingest", bad, "--out", path.join(tmp, "strict-out"), "--no-knowledge", "--strict", "--no-session"], { stdio: "pipe" }); }
    catch (e) { code = e.status; }
    check("--strict still refuses", code === 2 && !fs.existsSync(path.join(tmp, "strict-out")), { code });
  }

  // ── --latest finds the newest capture in a T3-style downloads folder ──
  {
    const t3 = path.join(tmp, "t3", "userdata", "server-browser", "downloads", "abc123");
    fs.mkdirSync(t3, { recursive: true });
    const f = path.join(t3, "9390849a-5559-4c12-a76a-cfc97c238f21");
    fs.writeFileSync(f, JSON.stringify({ kind: "iframer-capture", v: 1, origin: base, coverage: { seen: 0, withPayload: 0, pathOnly: 0, blindSpots: [] }, endpoints: {}, pathOnly: [] }));
    fs.writeFileSync(path.join(t3, "other-file"), "not a capture");
    process.env.T3_HOME = path.join(tmp, "t3");
    check("--latest finds an extensionless T3 download", kit.findLatestCapture() === f);
  }
} catch (e) {
  failed++;
  console.log(`  ✗ crashed: ${e.stack || e.message}`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
