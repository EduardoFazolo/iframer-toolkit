import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "patchright";
import { looksLikeBaitField, isHoneypotReason, probeField, honeypotRefusalMessage } from "../../src/lib/reachability";
import { serverErrorsFrom } from "../../src/lib/api-capture";
import { formatExecuteResult } from "../../src/lib/format-result";
import { takeSnapshot } from "../../src/lib/snapshot";
import { fill, upload } from "../../src/lib/actions/handlers/navigation";
import { PipelineRunner } from "../../src/lib/pipeline";
import type { ExecutionContext, CapturedRequest, PipelineResult } from "../../src/lib/types";

// ─── Pure ───────────────────────────────────────────────────────────

describe("looksLikeBaitField", () => {
  it("flags classic bait names and ids", () => {
    expect(looksLikeBaitField({ name: "website" })).toBe(true);
    expect(looksLikeBaitField({ name: "URL" })).toBe(true);
    expect(looksLikeBaitField({ id: "hp_field" })).toBe(true);
    expect(looksLikeBaitField({ name: "_gotcha" })).toBe(true);
  });
  it("flags a text field pulled out of the tab order", () => {
    expect(looksLikeBaitField({ name: "middle", tabindex: "-1" })).toBe(true);
    expect(looksLikeBaitField({ name: "middle", tabindex: "-1", type: "email" })).toBe(true);
  });
  it("leaves ordinary fields alone", () => {
    expect(looksLikeBaitField({ name: "email" })).toBe(false);
    expect(looksLikeBaitField({ name: "company" })).toBe(false);
    expect(looksLikeBaitField({ name: "confirm_email" })).toBe(false); // real signup field
    expect(looksLikeBaitField({ name: "first_name", tabindex: "0" })).toBe(false);
    // tabindex=-1 on a non-text control is normal (custom checkbox/radio wrappers)
    expect(looksLikeBaitField({ name: "agree", tabindex: "-1", type: "checkbox" })).toBe(false);
  });
});

describe("isHoneypotReason", () => {
  it("treats only permanent unreachability as a trap", () => {
    for (const r of ["zero-size", "hidden", "transparent", "offscreen", "clipped"]) expect(isHoneypotReason(r)).toBe(true);
    expect(isHoneypotReason("covered")).toBe(false);
    expect(isHoneypotReason(null)).toBe(false);
  });
  it("refusal message names the field, the reason and the escape hatch", () => {
    const m = honeypotRefusalMessage("input[name=website]", "offscreen", "website");
    expect(m).toContain("website");
    expect(m).toContain("offscreen");
    expect(m).toContain("force: true");
  });
});

describe("serverErrorsFrom", () => {
  const base: CapturedRequest = {
    method: "POST", url: "https://x.test/api/apply", path: "/api/apply", requestHeaders: {},
    responseStatus: 200, responseHeaders: {}, resourceType: "fetch", triggeredAtStep: 2, timestamp: 0,
  };
  it("keeps only >= 400 and compacts the body", () => {
    const out = serverErrorsFrom([
      base,
      { ...base, responseStatus: 422, responseBody: { error: "spam", fields: ["website"] } },
      { ...base, responseStatus: 500, responseBody: "<!doctype html><html><head><title>Server Error</title></head></html>" },
      { ...base, responseStatus: 403, responseBody: "x".repeat(2000) },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ stepIndex: 2, method: "POST", status: 422 });
    expect(out[0].body).toBe('{"error":"spam","fields":["website"]}');
    expect(out[1].body).toBe("[html] Server Error");
    expect(out[2].body?.length).toBeLessThan(700);
    expect(out[2].body?.endsWith("…")).toBe(true);
  });
});

describe("formatExecuteResult server errors", () => {
  it("prints them per step and again under the failure", () => {
    const data: PipelineResult = {
      ok: false, completedSteps: 1, totalSteps: 2, obstacles: [], durationMs: 10,
      finalState: { url: "https://x.test/form", title: "Form" },
      results: [
        { stepIndex: 0, step: { type: "fill", selector: "#a", value: "b" }, ok: true, durationMs: 1 },
        { stepIndex: 1, step: { type: "click", selector: "#submit" }, ok: false, durationMs: 1, error: "nope",
          serverErrors: [{ stepIndex: 1, method: "POST", url: "https://x.test/api/apply", status: 422, body: '{"error":"spam"}' }] },
      ],
      error: { failedAtStep: 1, failedStep: { type: "click", selector: "#submit" }, errorType: "action-failed", message: "nope", pageState: { url: "", title: "" }, retryable: false },
    };
    const text = formatExecuteResult(data).join("\n");
    expect(text).toContain("--- Server errors (HTTP >= 400) ---");
    expect(text).toContain("[step 1] POST https://x.test/api/apply → 422: {\"error\":\"spam\"}");
    expect(text).toContain("Server responded: POST https://x.test/api/apply → 422");
  });
  it("prints nothing extra when there are none", () => {
    const data: PipelineResult = { ok: true, completedSteps: 1, totalSteps: 1, obstacles: [], durationMs: 1, finalState: { url: "", title: "" }, results: [] };
    expect(formatExecuteResult(data).join("\n")).not.toContain("Server errors");
  });
});

// ─── Browser-backed ─────────────────────────────────────────────────
// Uses the system Chrome (patchright's channel), skipped where none exists.

const CHROME = process.env.CHROME_EXECUTABLE
  || (process.platform === "darwin" && fs.existsSync("/Applications/Google Chrome.app") ? "channel:chrome" : undefined)
  || (fs.existsSync("/usr/bin/google-chrome-stable") ? "/usr/bin/google-chrome-stable" : undefined);
const hasChrome = !!CHROME;

const FORM_HTML = `
<style>body{margin:0}.trap{position:absolute;left:-9999px;height:1px;overflow:hidden}
.clip{height:1px;overflow:hidden}.ghost{opacity:0}.tall{height:3000px}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.4)}</style>
<form id="f">
  <label for="name">Name</label><input id="name" name="name">
  <label for="site">Site</label><input id="site" name="website">
  <div class="trap"><label for="hp1">Website</label><input id="hp1" name="hp_website" tabindex="-1" autocomplete="off"></div>
  <div class="clip"><input id="hp2" name="hp_clip"></div>
  <div class="ghost"><input id="hp3" name="hp_ghost"></div>
  <input type="file" id="cv" name="cv" style="width:1px;height:1px;display:block">
  <button id="go" type="button">Go</button>
  <div class="tall"></div>
  <label for="deep">Deep</label><input id="deep" name="deep_field">
</form>`;

function ctxFor(dir: string): ExecutionContext {
  return {
    userId: "t", token: "t", screenshotDir: dir, publicUrl: "http://localhost", staleTimeoutMs: 20_000,
    refMap: new Map(), nextRefId: 1, store: undefined as unknown as ExecutionContext["store"],
  };
}

describe.skipIf(!hasChrome)("honeypot guard (browser)", () => {
  let browser: Browser;
  let page: Page;
  let dir: string;

  beforeAll(async () => {
    browser = await chromium.launch(CHROME === "channel:chrome" ? { channel: "chrome" } : { executablePath: CHROME });
    page = await browser.newPage();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "iframer-hp-"));
  });
  afterAll(async () => {
    await browser?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("probeField reports why a human can't reach each trap", async () => {
    await page.setContent(FORM_HTML);
    expect((await probeField(page, "#name")).hiddenReason).toBeNull();
    expect((await probeField(page, "#deep")).hiddenReason).toBeNull(); // below fold, scrolled into view by the probe
    expect((await probeField(page, "#hp1")).hiddenReason).toBe("offscreen");
    expect((await probeField(page, "#hp2")).hiddenReason).toBe("clipped");
    expect((await probeField(page, "#hp3")).hiddenReason).toBe("transparent");
    expect((await probeField(page, "#nope")).found).toBe(false);
    const p = await probeField(page, "#hp1");
    expect(p.suspiciousName).toBe(true);
    expect(p.name).toBe("hp_website");
  });

  it("a container mid fade-in is not a trap", async () => {
    await page.setContent(`<style>@keyframes in{from{opacity:0}to{opacity:1}}.fade{opacity:0;animation:in 30s forwards}</style>
      <div class="fade"><label for="x">X</label><input id="x" name="x"></div>`);
    expect((await probeField(page, "#x")).hiddenReason).toBeNull();
    expect((await takeSnapshot(page, ctxFor(dir))).text).toContain('input "X"');
    await fill(page, { type: "fill", selector: "#x", value: "ok" }, ctxFor(dir));
    expect(await page.$eval("#x", (e) => (e as HTMLInputElement).value)).toBe("ok");
  });

  it("an overlay is 'covered', not a trap", async () => {
    await page.setContent(FORM_HTML + `<div class="overlay"></div>`);
    const p = await probeField(page, "#name");
    expect(p.hiddenReason).toBe("covered");
    expect(isHoneypotReason(p.hiddenReason)).toBe(false);
  });

  it("snapshot drops unreachable fields, flags bait names, keeps the rest", async () => {
    await page.setContent(FORM_HTML);
    const ctx = ctxFor(dir);
    const { text } = await takeSnapshot(page, ctx);
    expect(text).toContain('input "Name"');
    expect(text).toContain('input "Site" [honeypot?]');   // visible, but named website → flagged, still listed
    expect(text).not.toContain("Website");                // offscreen ancestor → gone
    expect(text).not.toContain("hp_clip");
    expect(text).not.toContain("hp_ghost");
    expect(text).toContain('button "Go"');
    // The in-viewport check never touches buttons/links, and a covered field stays listed.
    await page.setContent(FORM_HTML + `<div class="overlay"></div>`);
    const covered = await takeSnapshot(page, ctxFor(dir));
    expect(covered.text).toContain('input "Name"');
  });

  it("snapshot still lists a normal field below the fold", async () => {
    await page.setContent(FORM_HTML);
    // Scroll so #deep is inside the +200px lookahead window the snapshot uses.
    await page.evaluate(() => window.scrollTo(0, 2700));
    const { text } = await takeSnapshot(page, ctxFor(dir));
    expect(text).toContain('input "Deep"');
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  it("fill refuses a honeypot, fills a real field, and force bypasses", async () => {
    await page.setContent(FORM_HTML);
    const ctx = ctxFor(dir);
    await expect(fill(page, { type: "fill", selector: "#hp1", value: "x" }, ctx)).rejects.toThrow(/honeypot/);
    await expect(fill(page, { type: "fill", selector: "input[name=hp_clip]", value: "x" }, ctx)).rejects.toThrow(/clipped/);
    expect(await page.$eval("#hp1", (e) => (e as HTMLInputElement).value)).toBe("");

    await fill(page, { type: "fill", selector: "#name", value: "Ada" }, ctx);
    expect(await page.$eval("#name", (e) => (e as HTMLInputElement).value)).toBe("Ada");
    await fill(page, { type: "fill", selector: "#deep", value: "far" }, ctx);
    expect(await page.$eval("#deep", (e) => (e as HTMLInputElement).value)).toBe("far");

    await fill(page, { type: "fill", selector: "#hp1", value: "forced", force: true }, ctx);
    expect(await page.$eval("#hp1", (e) => (e as HTMLInputElement).value)).toBe("forced");
  });

  it("fill on a missing selector still fails the Playwright way (guard never masks it)", async () => {
    await page.setContent(FORM_HTML);
    page.setDefaultTimeout(500);
    try {
      await expect(fill(page, { type: "fill", selector: "#missing", value: "x" }, ctxFor(dir))).rejects.toThrow(/Timeout|waiting/i);
    } finally {
      page.setDefaultTimeout(30_000);
    }
  });

  it("upload works on a 1x1 file input without any style hack", async () => {
    await page.setContent(FORM_HTML);
    const f = path.join(dir, "cv.txt");
    fs.writeFileSync(f, "hi");
    const r = await upload(page, { type: "upload", selector: "input[name=cv]", files: [f] }, ctxFor(dir));
    expect(r.uploaded).toBe(1);
    expect(await page.$eval("#cv", (e) => (e as HTMLInputElement).files?.length)).toBe(1);
  });

  it("runner reclassifies a stale wait on a missing selector as element-not-found", async () => {
    await page.setContent(FORM_HTML);
    const runner = new PipelineRunner(ctxFor(dir));
    const res = await runner.run(page, {
      steps: [{ type: "upload", selector: 'input[name="cv-upload"]', files: [path.join(dir, "cv.txt")] }],
      options: { staleTimeoutMs: 1000 },
    });
    expect(res.ok).toBe(false);
    expect(res.error?.errorType).toBe("element-not-found");
    expect(res.error?.message).toContain('No element matches "input[name="cv-upload"]"');
    expect(res.error?.message).toContain("No state change");
    expect(res.error?.suggestion).toContain("re-rendered");
  }, 20_000);

  it("runner leaves a genuine stall as stale-state", async () => {
    await page.setContent(FORM_HTML);
    const runner = new PipelineRunner(ctxFor(dir));
    const res = await runner.run(page, {
      steps: [{ type: "evaluate", expression: "new Promise(() => {})" }],
      options: { staleTimeoutMs: 1000 },
    });
    expect(res.ok).toBe(false);
    expect(res.error?.errorType).toBe("stale-state");
  }, 20_000);

  it("runner surfaces the server's 422 on a submit click when captureApi is on", async () => {
    await page.route("https://form.test/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/api/apply")) {
        return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "honeypot triggered" }) });
      }
      return route.fulfill({
        status: 200, contentType: "text/html",
        body: `<button id="s" onclick="fetch('/api/apply',{method:'POST',body:'{}'}).then(r=>r.text()).then(t=>{document.body.append(' Unable to process your request.')})">Submit</button>`,
      });
    });
    await page.goto("https://form.test/form");
    const runner = new PipelineRunner(ctxFor(dir));
    const res = await runner.run(page, {
      steps: [{ type: "click", selector: "#s" }],
      options: { captureApi: true },
    });
    await page.unroute("https://form.test/**");
    expect(res.ok).toBe(true);
    expect(res.results[0].serverErrors).toHaveLength(1);
    expect(res.results[0].serverErrors?.[0]).toMatchObject({ stepIndex: 0, method: "POST", status: 422, body: '{"error":"honeypot triggered"}' });
    expect(formatExecuteResult(res).join("\n")).toContain("→ 422");
  }, 20_000);
});
