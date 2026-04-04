import { describe, it, expect } from "bun:test";
import { detectBlock } from "../../src/lib/block-detection";

function mockPage(opts: { title?: string; url?: string; bodyText?: string; evaluateResult?: boolean; evaluateThrows?: boolean } = {}) {
  const {
    title = "My Page",
    url = "https://example.com",
    bodyText = "Hello world. This is a normal page with enough content to pass the threshold.",
    evaluateResult = false,
    evaluateThrows = false,
  } = opts;

  return {
    title: () => Promise.resolve(title),
    url: () => url,
    evaluate: (fn: any) => {
      if (evaluateThrows) return Promise.reject(new Error("page crashed"));
      // If fn checks for innerText, return bodyText; if it checks for querySelector, return evaluateResult
      const fnStr = fn.toString();
      if (fnStr.includes("innerText")) return Promise.resolve(bodyText);
      return Promise.resolve(evaluateResult);
    },
  } as any;
}

describe("detectBlock", () => {
  it("returns not blocked for normal page", async () => {
    const result = await detectBlock(mockPage());
    expect(result.blocked).toBe(false);
  });

  it("detects Cloudflare challenge by title", async () => {
    const result = await detectBlock(mockPage({ title: "Just a moment..." }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare-challenge");
  });

  it("detects Attention Required page", async () => {
    const result = await detectBlock(mockPage({ title: "Attention Required! | Cloudflare" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare-challenge");
  });

  it("detects Cloudflare Turnstile by body text", async () => {
    const result = await detectBlock(mockPage({ bodyText: "Verify you are human by completing the action below." }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare-turnstile");
  });

  it("detects Cloudflare checking page", async () => {
    const result = await detectBlock(mockPage({ bodyText: "Checking your browser before accessing the site." }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("cloudflare-checking");
  });

  it("detects Akamai block", async () => {
    const result = await detectBlock(mockPage({ title: "Access Denied", bodyText: "You don't have permission. Reference #abc123" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("akamai-block");
  });

  it("detects PerimeterX block", async () => {
    const result = await detectBlock(mockPage({ bodyText: "Press & Hold to confirm you are human" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("perimeterx-block");
  });

  it("detects DataDome block", async () => {
    const result = await detectBlock(mockPage({ bodyText: "Protected by datadome" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("datadome-block");
  });

  it("detects HTTP 403 by title", async () => {
    const result = await detectBlock(mockPage({ title: "403 Forbidden" }));
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("http-403");
  });

  it("assumes blocked when page evaluation fails", async () => {
    const result = await detectBlock(mockPage({ evaluateThrows: true }));
    expect(result.blocked).toBe(true);
    // When evaluate throws, the CF challenge .catch() returns true → "cloudflare-turnstile"
    // This is safe behavior: evaluation failure defaults to blocked
    expect(result.reason).toBe("cloudflare-turnstile");
  });
});
