// The local output of a reverse-engineered site: client.mjs runs from Node with
// the session in .env, no browser. Run: bun tests/integration/kit-node-client.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startFixture, SECRETS } from "../fixtures/kit-fixture.mjs";

const data = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-node-"));
process.env.IFRAMER_DATA_DIR = data;
const kit = await import("../../src/lib/kit/index.ts");

const { server, port } = await startFixture();
const origin = `http://127.0.0.1:${port}`;
const host = kit.normalizeHost(origin);
let failed = 0, passed = 0;
const check = (name, ok, got) => { if (ok) passed++; else { failed++; console.log(`FAIL ${name}: ${String(got).slice(0, 300)}`); } };

// What ingest leaves: the map (an old action id, as after a deploy) and where the Bearer token comes from.
const dir = kit.apisDir(host);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "api.json"), JSON.stringify({
  origin,
  endpoints: [
    { method: "GET", origin, path: "/api/private", functionName: "getPrivate" },
    { method: "GET", origin, path: "/{community}/dashboard/campaigns", rsc: true, functionName: "campaigns" },
    { method: "POST", origin, path: "/acme/dashboard", functionName: "getRestaurants", action: { name: "getRestaurants", id: "f".repeat(40) } },
  ],
}));
fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ authorization: { from: "localStorage", key: "session", json: true, path: ["user", "token"], prefix: "Bearer " } }));
const out = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-out-"));
kit.addOutputDir(host, out);
kit.writeOutputs(host);

const client = path.join(out, "client.mjs");
// Async: the fixture server lives in this process, so a sync spawn would deadlock.
// IFRAMER_NO_AUTO_AUTH: the real iframer would look for a session in this machine's browsers.
const exec = (file, args, env = { IFRAMER_NO_AUTO_AUTH: "1" }) => new Promise((ok) => {
  const c = spawn("node", [file, ...args], { env: { PATH: process.env.PATH, ...env } });
  let o = "";
  c.stdout.on("data", (d) => (o += d)); c.stderr.on("data", (d) => (o += d));
  c.on("close", () => ok(o.trim()));
});
const node = (args) => exec(client, args);

check("client in the --out folder", fs.existsSync(client), out);
check("client in the host folder", fs.existsSync(path.join(dir, "client.mjs")), dir);
check(".gitignore keeps .env out", fs.readFileSync(path.join(out, ".gitignore"), "utf8").includes(".env"), "");
check(".env.example names the vars", /COOKIE=\n[\s\S]*AUTHORIZATION=/.test(fs.readFileSync(path.join(out, ".env.example"), "utf8")), "");

let r = await node([]);
check("lists missing auth", /COOKIE missing/.test(r) && /getRestaurants/.test(r), r);

r = await node(["get", "/api/private"]);
check("no cookie -> 401 says how to refresh", /401/.test(r) && /iframer auth/.test(r), r);

// Session from .env next to the client (what `iframer auth` writes).
fs.writeFileSync(path.join(out, ".env"), `COOKIE=sid=${SECRETS.cookie}\nAUTHORIZATION=${SECRETS.lsToken}\n`);
r = await node(["get", "/api/private"]);
check("cookie from .env", r.includes("only-with-cookie"), r);
r = await node(["get", "/api/me"]);
check("auth header from .env, prefix added", r.includes("Seeded Person"), r);

r = await node(["get", "/acme/dashboard/campaigns", "--rsc", "--schema"]);
check("schema of an RSC page", /campaigns/.test(r) && /title/.test(r), r);
r = await node(["get", "/acme/dashboard/campaigns", "--rsc", "--find", "campaigns", "--pick", "campaigns.{title}"]);
check("find + pick", r.includes("Spring") && !r.includes("active"), r);

r = await node(["action", "getRestaurants", JSON.stringify([{ communitySlug: "acme" }])]);
check("actions need --approved", /--approved/.test(r), r);
r = await node(["action", "getRestaurants", JSON.stringify([{ communitySlug: "acme" }]), "--approved"]);
check("stale action id re-found from the page's JS", r.includes("Bistro") && r.includes("acme"), r);

// Recipes become functions of the same client.
kit.saveRecipe({ name: "activeCampaigns", host, path: "/{community}/dashboard/campaigns", rsc: true, find: "campaigns", pick: "campaigns.{title}", where: "active=true", count: true });
r = await node(["activeCampaigns", '{"community":"acme"}']);
check("recipe from Node", r === "1", r);
r = await node(["activeCampaigns", "community=acme"]);
check("recipe k=v args", r === "1", r);
r = await node(["activeCampaigns", "{}"]);
check("missing arg is an error", /^error: missing arg community/.test(r), r);

// Importable from a script.
const lib = path.join(out, "use.mjs");
fs.writeFileSync(lib, `import { activeCampaigns, page } from "./client.mjs";\nconst d = await page("/acme/dashboard/campaigns");\nconsole.log(await activeCampaigns({ community: "acme" }), Object.keys(d.components).length > 0);\n`);
const lr = await exec(lib, []);
check("import from a script", lr === "1 true", lr);

// After a deploy the client still works (id looked up again).
await fetch(origin + "/__deploy");
r = await node(["action", "getRestaurants", "[{\"communitySlug\":\"x\"}]", "--approved"]);
check("action after deploy", r.includes("Bistro"), r);

// Expired or missing session: the client asks `iframer auth --auto` once, then retries.
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ifk-bin-"));
fs.writeFileSync(path.join(bin, "iframer"), `#!/bin/sh\n[ "$1" = auth ] && [ "$5" = --auto ] || exit 2\necho "COOKIE=sid=${SECRETS.cookie}" > "$4/.env"\necho "auth: session from test"\n`, { mode: 0o755 });
fs.writeFileSync(path.join(out, ".env"), "COOKIE=sid=stale\n");
r = await exec(client, ["get", "/api/private"], { IFRAMER_BIN: path.join(bin, "iframer") });
check("stale session refreshed from the browser, then retried", r.includes("only-with-cookie"), r);
fs.rmSync(path.join(out, ".env"));
r = await exec(client, ["get", "/api/private"], { IFRAMER_BIN: path.join(bin, "iframer") });
check("no session: taken before the first call", r.includes("only-with-cookie"), r);
fs.writeFileSync(path.join(out, ".env"), "COOKIE=sid=stale\n");
r = await exec(client, ["get", "/api/private"], { IFRAMER_BIN: path.join(bin, "iframer"), IFRAMER_NO_AUTO_AUTH: "1" });
check("auto refresh can be turned off", /401/.test(r), r);
fs.rmSync(bin, { recursive: true, force: true });

// No in-page bundle unless asked.
check("no in-page bundle by default", !fs.existsSync(path.join(dir, "recipes.js")), "");

server.close();
fs.rmSync(data, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
