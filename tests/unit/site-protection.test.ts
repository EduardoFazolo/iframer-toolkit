import { describe, it, expect } from "bun:test";
import { detectSiteProtection, protectionHooks, HeadedRequiredError } from "../../src/lib/site-protection";

const page = (names: string[] = [], html = "") => ({
  url: () => "https://example.com/",
  context: () => ({ cookies: async () => names.map(name => ({ name })) }),
  content: async () => html,
}) as any;

describe("protected site policy", () => {
  it("detects provider cookies on successful pages without matching ordinary mentions", async () => {
    expect(await detectSiteProtection(page(["visid_incap_123"]))).toBe("imperva");
    expect(await detectSiteProtection(page(["_abck"]))).toBe("akamai");
    expect(await detectSiteProtection(page([], "An article about Akamai and Imperva"))).toBeNull();
    expect(await detectSiteProtection(page([], '<iframe src="/_Incapsula_Resource">'))).toBe("imperva");
    expect(await detectSiteProtection(page([], "https://errors.edgesuite.net/123"))).toBe("akamai");
  });

  it("interrupts headless on detection without any prior failure or stored memory", async () => {
    const hooks = protectionHooks(true);
    await expect(hooks.after(page(["_abck"]))).rejects.toBeInstanceOf(HeadedRequiredError);
    await expect(hooks.before(page(["visid_incap_42"]), { type: "click" })).rejects.toBeInstanceOf(HeadedRequiredError);
  });

  it("allows ordinary headless pages and detected headed pages", async () => {
    await protectionHooks(true).after(page());
    await protectionHooks(false).after(page(["_abck"]));
  });
});
