// Local fixture for tests/integration/kit-bridge.mjs. The server's request log is the
// ground truth for coverage. Every SECRETS value must stay out of the kit's export.
import http from "node:http";

export const SECRETS = {
  token: "SEEDEDQUERYTOKEN_abc123",
  bearer: "Bearer SEEDEDBEARER.eyJhbGciOi.xyz",
  email: "seeded.person@example.com",
  phone: "+1-415-555-0199",
  confirmation: "CONF-99X7-SEEDED",
  cookie: "SEEDEDSESSIONCOOKIE42",
  lsToken: "SEEDEDLSTOKEN_9f8e7d6c5b4a",
};

export const POLICIES = {
  strict:
    "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; worker-src 'self'",
  trustedTypes:
    "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; worker-src 'self'; require-trusted-types-for 'script'",
};

// Thirty read endpoints so sizes aren't flattered by a tiny API.
const RESOURCES = ["orders","customers","invoices","products","carts","reviews","tickets","shipments","refunds","coupons","teams","projects","tasks","comments","labels","files","folders","webhooks","audits","sessions","plans","payments","addresses","alerts","reports","segments","campaigns","contacts","notes","tags"];

function record(name, i) {
  return {
    id: i, uuid: "3f2b8c1e-7a44-4e0d-9a10-" + String(100000000000 + i), name: name + " " + i,
    status: "active", createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-05T10:00:00Z",
    owner: { id: 7, name: "Seeded Person", email: SECRETS.email, phone: SECRETS.phone, team: { id: 3, slug: "core", role: "admin" } },
    totals: { amount: 1299, currency: "USD", tax: 104, discount: 0 },
    items: [{ sku: "A-1", qty: 2, price: 500, meta: { color: "red", size: "m" } }],
    flags: { archived: false, starred: true, priority: 2 }, confirmation: SECRETS.confirmation,
  };
}

// ── Fake Next.js App Router app: /[communitySlug]/dashboard/... ──────────
// Server Action ids change on every "deploy" (GET /__deploy); export names don't.
const ACTION_IDS = ["7f3a9c1e2b4d6f8a0c1e3b5d7f9a1c3e5b7d9f1a", "40d2e8b6a4c2e0f8d6b4a2c0e8f6d4b2a0c8e6f4"];
let deploy = 0;
const actionId = () => ACTION_IDS[deploy % 2];
const NEXT_TREE = '0:{"b":"build1","f":[["",{"children":[["communitySlug","acme","d"],{"children":["dashboard",{"children":["__PAGE__",{}]}]}]}]]}\n';
const nextAppJs = () => `
self.__next_f = self.__next_f || [];
self.__next_f.push([1, ${JSON.stringify(NEXT_TREE)}]);
// Client navigation like Next's router: fetches the page's RSC data, no reload.
window.next = { router: { push: function (p) { return fetch(p, { headers: { RSC: '1' } }); } } };
window.runNext = async function () {
  await fetch('/acme/dashboard/campaigns?_rsc=x1', { headers: { RSC: '1' } });
  await fetch(location.pathname, { method: 'POST', headers: { 'next-action': ${JSON.stringify(actionId())}, accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify([{ communitySlug: 'acme' }]) });
};`;
const nextActionsJs = () =>
  `var s={createServerReference:function(){return function(){}},callServer:0,findSourceMapURL:0};` +
  `window.getRestaurantsRef=(0,s.createServerReference)(${JSON.stringify(actionId())},s.callServer,void 0,s.findSourceMapURL,"getRestaurants");`;
// RSC flight rows: an import (I), a text row with a byte length (T, multibyte on purpose), and the element tree.
const campaignsFlight = () => {
  const note = "Café night ✓";
  return [
    `1:I["123",["static/chunks/c.js"],"CampaignsTable"]`,
    `2:T${Buffer.byteLength(note).toString(16)},${note}`,
    `0:["$","div",null,{"children":[["$","$L1",null,{"campaigns":[{"id":11,"title":"Spring","active":true,"note":"$2"}],"community":"acme"}]]}]`,
    ``,
  ].join("\n");
};

const APP_JS = `
fetch('/api/boot').catch(()=>{});
const w = new Worker('/worker.js');
// Like most SPAs: the session token lives in localStorage, nested in JSON.
localStorage.setItem('session', JSON.stringify({ user: { token: ${JSON.stringify(SECRETS.lsToken)} } }));
window.runFlow = async function () {
  await fetch('/api/me', { headers: { Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('session')).user.token } });
  const auth = { Authorization: ${JSON.stringify(SECRETS.bearer)}, 'x-app-version': '4.2.0' };
  await fetch('/api/items/123?limit=5&token=${SECRETS.token}', { headers: auth, credentials: 'include' });
  await fetch('/api/orders', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ sku: 'A-1', qty: 2, contact: { email: ${JSON.stringify(SECRETS.email)}, phone: ${JSON.stringify(SECRETS.phone)} } }) });
  await new Promise((ok) => { const x = new XMLHttpRequest(); x.open('POST', '/api/messages'); x.setRequestHeader('content-type','application/json'); x.setRequestHeader('x-csrf-token','SEEDEDCSRF'); x.onloadend = ok; x.send(JSON.stringify({ text: 'hello', to: ${JSON.stringify(SECRETS.email)} })); });
  await fetch('/api/redirect-me');
  navigator.sendBeacon('/api/beacon', 'a=1');
  await fetch('/api/people/' + encodeURIComponent(${JSON.stringify(SECRETS.email)}) + '/CONF-99X7-SEEDED');
  await fetch('/api/users-by-email');
  w.postMessage('ping');
  await new Promise((r) => setTimeout(r, 150));
};
window.runMany = async function () {
  for (const r of ${JSON.stringify(RESOURCES)}) await fetch('/api/' + r + '/' + (1000 + r.length), { credentials: 'include' });
};
document.getElementById('flow')?.addEventListener('click', () => { window.flowDone = window.runFlow().then(() => (window.flowOk = true)); });
`;
const WORKER_JS = `self.onmessage = () => fetch('/api/worker-ping');`;

export function startFixture() {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const cookieOk = (req.headers.cookie || "").includes(SECRETS.cookie);
      if (p.startsWith("/api") || req.method === "POST") log.push({ method: req.method, path: p, cookieOk });
      const json = (code, body, extra = {}) => {
        res.writeHead(code, { "content-type": "application/json", ...extra });
        res.end(JSON.stringify(body));
      };
      if (p === "/__deploy") { deploy++; return json(200, { deploy }); }
      if (p === "/_next/static/chunks/app.js") { res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); return res.end(nextAppJs()); }
      if (p === "/_next/static/chunks/actions.js") { res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); return res.end(nextActionsJs()); }
      if (p === "/acme/dashboard" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/html", "content-security-policy": POLICIES.strict, "set-cookie": `sid=${SECRETS.cookie}; HttpOnly; Path=/; SameSite=Lax` });
        return res.end(`<!doctype html><title>dashboard</title><script src="/_next/static/chunks/app.js"></script><script src="/_next/static/chunks/actions.js"></script>`);
      }
      if (p === "/acme/dashboard/campaigns") {
        if (req.headers.rsc !== "1") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><div>campaigns page</div>"); }
        res.writeHead(200, { "content-type": "text/x-component" });
        return res.end(campaignsFlight());
      }
      if (p === "/acme/dashboard" && req.method === "POST" && req.headers["next-action"]) {
        if (req.headers["next-action"] !== actionId()) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Server action not found."); }
        const [arg] = JSON.parse(raw || "[]");
        res.writeHead(200, { "content-type": "text/x-component" });
        return res.end(`0:{"a":"$@1","f":"","b":"build1"}\n1:[{"id":1,"name":"Bistro ü","city":"Wichita","community":${JSON.stringify(arg?.communitySlug ?? null)}}]\n`);
      }
      if (p === "/app.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(APP_JS); }
      if (p === "/worker.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(WORKER_JS); }
      if (p === "/no-storage") {
        // Like Discord: the page removes window.sessionStorage before anything else runs.
        res.writeHead(200, { "content-type": "text/html", "content-security-policy": POLICIES.strict });
        return res.end(`<!doctype html><title>no storage</title><a id="nav" href="/no-storage">again</a><script src="/no-storage.js"></script>`);
      }
      if (p === "/no-storage.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(`Object.defineProperty(window,'sessionStorage',{value:undefined,configurable:true});window.go=()=>fetch('/api/no-storage/5');`); }
      if (p === "/frame-host") {
        res.writeHead(200, { "content-type": "text/html", "content-security-policy": POLICIES.strict.replace("frame-src 'none'", "frame-src 'self'") });
        return res.end(`<!doctype html><title>frame host</title><iframe id="fr" src="/frame-inner"></iframe>`);
      }
      if (p === "/frame-inner") {
        res.writeHead(200, { "content-type": "text/html", "content-security-policy": POLICIES.strict });
        return res.end(`<!doctype html><title>inner</title><button id="inner">inner</button><script src="/inner.js"></script>`);
      }
      if (p === "/inner.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(`document.getElementById('inner').onclick=()=>fetch('/api/from-frame/77',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({note:'x'})});`); }
      if (p === "/api/me") return req.headers.authorization === "Bearer " + SECRETS.lsToken ? json(200, { id: 7, name: "Seeded Person" }) : json(401, { error: "no token" });
      if (p === "/api/users-by-email") return json(200, { [SECRETS.email]: { id: 1, role: "admin" }, ["other.person@example.com"]: { id: 2, role: "user" } });
      if (p === "/api/wall") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<div class='cf-chl'>Are you a robot?</div>"); }
      if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
      if (p === "/submit" && req.method === "POST") { res.writeHead(303, { location: "/page2?csp=" + (url.searchParams.get("csp") || "strict") }); return res.end(); }
      if (p === "/api/redirect-me") { res.writeHead(302, { location: "/api/redirect-target" }); return res.end(); }
      if (p === "/api/big") return json(200, { data: Array.from({ length: 300 }, (_, i) => record("big", i + 1)), page: { total: 300 } });
      if (p === "/api/rate-limited") return json(429, { error: "slow down" });
      if (p === "/api/private") return cookieOk ? json(200, { ok: true, secretData: "only-with-cookie" }) : json(401, { error: "no session" });
      if (p.startsWith("/api/")) {
        const r = p.split("/")[2];
        return json(200, { data: [record(r, 1), record(r, 2)], page: { next: "c2", total: 2 } });
      }
      const csp = POLICIES[url.searchParams.get("csp") || "strict"];
      res.writeHead(200, {
        "content-type": "text/html",
        "content-security-policy": csp,
        "set-cookie": `sid=${SECRETS.cookie}; HttpOnly; Path=/; SameSite=Lax`,
      });
      res.end(`<!doctype html><title>${p}</title><h1>${p}</h1>
        <button id="flow">Run flow</button>
        <form id="f" method="post" action="/submit?csp=${url.searchParams.get("csp") || "strict"}"><input name="email" value="${SECRETS.email}"><button id="go">Submit</button></form>
        <a id="nav" href="/page2?csp=${url.searchParams.get("csp") || "strict"}">next</a>
        <script src="/app.js"></script>`);
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, log, port: server.address().port })));
}

