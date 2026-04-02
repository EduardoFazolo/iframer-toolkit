/**
 * Smoke tests for iframer.
 *
 * Usage:
 *   node tests/smoke.js                                    # localhost, no auth
 *   IFRAMER_SECRET=your-secret node tests/smoke.js         # localhost, with auth
 *   URL=http://192.168.1.5:3021 node tests/smoke.js        # custom host
 */

const BASE = (process.env.URL || "http://localhost:3021").replace(/\/+$/, "");
const SECRET = process.env.IFRAMER_SECRET || "";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (SECRET) h["x-api-key"] = SECRET;
  return h;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  return { status: res.status, body: await res.json() };
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: headers() });
  return { status: res.status, body: await res.json() };
}

// ─── Tests ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\nSmoke tests against ${BASE}\n`);

  // ── Health ──

  await test("GET /health returns ok (no auth needed)", async () => {
    const res = await fetch(`${BASE}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.ok === true, `Expected ok:true`);
  });

  // ── Auth ──

  if (SECRET) {
    await test("request without secret returns 401", async () => {
      const res = await fetch(`${BASE}/interactive/status`, {
        headers: { "Content-Type": "application/json" },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test("request with wrong secret returns 401", async () => {
      const res = await fetch(`${BASE}/interactive/status`, {
        headers: { "Content-Type": "application/json", "x-api-key": "wrong" },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
  }

  // ── Headless fetch ──

  await test("POST /fetch without url returns 400", async () => {
    const { status, body } = await post("/fetch", {});
    assert(status === 400, `Expected 400, got ${status}`);
    assert(body.ok === false, "Expected ok:false");
  });

  await test("POST /fetch with extract returns result", async () => {
    const { status, body } = await post("/fetch", {
      url: "https://example.com",
      extract: "document.title",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
    assert(body.result === "Example Domain", `Expected 'Example Domain', got '${body.result}'`);
  });

  await test("POST /fetch with returnHtml returns html", async () => {
    const { status, body } = await post("/fetch", {
      url: "https://example.com",
      returnHtml: true,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
    assert(typeof body.html === "string" && body.html.includes("Example Domain"), "Expected html to contain 'Example Domain'");
  });

  await test("POST /fetch sessionless works", async () => {
    const { status, body } = await post("/fetch", {
      url: "https://example.com",
      extract: "document.title",
      sessionless: true,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
  });

  // ── Stop any leftover sessions ──

  await post("/interactive/stop").catch(() => {});

  await test("GET /interactive/status with no active session", async () => {
    const { status, body } = await get("/interactive/status");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.active === false, "Expected no active session");
  });

  // ── Execute pipeline ──

  await test("POST /execute with navigate + extract", async () => {
    const { status, body } = await post("/execute", {
      steps: [
        { type: "navigate", url: "https://example.com" },
        { type: "extract", expression: "document.querySelector('h1').textContent" },
      ],
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, `Expected ok:true, got ${JSON.stringify(body.error || body)}`);
    assert(body.completedSteps === 2, `Expected 2 completed steps, got ${body.completedSteps}`);
    const extractResult = body.results?.find(r => r.step?.type === "extract");
    assert(extractResult?.result === "Example Domain", `Expected 'Example Domain', got '${extractResult?.result}'`);
  });

  await test("POST /execute with screenshot returns screenshotUrl", async () => {
    const { status, body } = await post("/execute", {
      steps: [
        { type: "navigate", url: "https://example.com" },
        { type: "screenshot" },
      ],
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
    const ssResult = body.results?.find(r => r.step?.type === "screenshot");
    assert(ssResult?.result?.screenshotUrl, "Expected a screenshotUrl in screenshot result");
  });

  // ── Stop session (cleanup from execute) ──

  await test("POST /interactive/stop saves session", async () => {
    const { status, body } = await post("/interactive/stop");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
    assert(body.sessionSaved === true, "Expected sessionSaved:true");
  });

  // ── Credentials ──

  await test("POST /credentials stores credential", async () => {
    const { status, body } = await post("/credentials", {
      domain: "test.example.com",
      username: "testuser",
      password: "testpass",
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
  });

  await test("GET /credentials lists stored domains", async () => {
    const { status, body } = await get("/credentials");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
    assert(body.domains.includes("test.example.com"), "Expected test.example.com in domains");
  });

  await test("DELETE /credentials/:domain removes credential", async () => {
    const { status, body } = await del("/credentials/test.example.com");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
  });

  await test("GET /credentials after delete shows empty", async () => {
    const { status, body } = await get("/credentials");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(!body.domains.includes("test.example.com"), "Expected test.example.com to be removed");
  });

  // ── Session cleanup ──

  await test("DELETE /session clears session data", async () => {
    const { status, body } = await del("/session");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.ok === true, "Expected ok:true");
  });

  // ── Summary ──

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
