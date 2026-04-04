/**
 * Quick test for the three-mode browser system.
 *
 * Usage:
 *   bun tests/test-modes.ts                    # test headless on a simple site
 *   bun tests/test-modes.ts headful            # test binary-headful
 *   bun tests/test-modes.ts escalate           # test auto-escalation on Cloudflare site
 */

import { Iframer } from "../src/lib/iframer";
import type { BrowserMode } from "../src/lib/types";

const TEST_USER = "test-user";
const TEST_TOKEN = "test-token-12345";

async function main() {
  const arg = process.argv[2] || "headless";

  const iframer = new Iframer({
    screenshotDir: "/tmp/iframer-test",
    publicUrl: "file:///tmp/iframer-test",
  });

  console.log("Available modes:", iframer.getAvailableModes());
  console.log("Mode availability:", await iframer.getModeAvailability());
  console.log("");

  if (arg === "headless") {
    // Test 1: headless on a simple site (should work)
    console.log("=== Test: headless on example.com ===");
    const result = await iframer.execute(TEST_USER, TEST_TOKEN, {
      steps: [
        { type: "navigate", url: "https://example.com" },
        { type: "extract", expression: "document.title" },
      ],
      options: { mode: "headless", autoEscalate: false },
    });
    console.log(`ok: ${result.ok}, mode: ${result.modeUsed}`);
    console.log(`title: ${result.results.find(r => r.step.type === "extract")?.result}`);
    console.log(`duration: ${result.durationMs}ms`);
    if (result.error) console.log(`error: ${result.error.message}`);

  } else if (arg === "headful") {
    // Test 2: binary-headful (real Chrome window)
    console.log("=== Test: binary-headful on example.com ===");
    const result = await iframer.execute(TEST_USER, TEST_TOKEN, {
      steps: [
        { type: "navigate", url: "https://example.com" },
        { type: "extract", expression: "document.title" },
      ],
      options: { mode: "binary-headful", autoEscalate: false },
    });
    console.log(`ok: ${result.ok}, mode: ${result.modeUsed}`);
    console.log(`title: ${result.results.find(r => r.step.type === "extract")?.result}`);
    console.log(`duration: ${result.durationMs}ms`);
    if (result.error) console.log(`error: ${result.error.message}`);

  } else if (arg === "escalate") {
    // Test 3: auto-escalation on Cloudflare-protected site
    console.log("=== Test: auto-escalation on cepea.org.br ===");
    const result = await iframer.execute(TEST_USER, TEST_TOKEN, {
      steps: [
        { type: "navigate", url: "https://www.cepea.org.br/br/indicador/etanol-diario-paulinia.aspx" },
        { type: "extract", expression: "document.title" },
      ],
      options: { autoEscalate: true },
    });
    console.log(`ok: ${result.ok}, mode: ${result.modeUsed}, escalated: ${result.modeEscalated}`);
    console.log(`title: ${result.results.find(r => r.step.type === "extract")?.result}`);
    console.log(`duration: ${result.durationMs}ms`);
    if (result.error) console.log(`error: ${result.error.message}`);

  } else {
    console.log("Usage: bun tests/test-modes.ts [headless|headful|escalate]");
  }

  // Shutdown
  await iframer.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
