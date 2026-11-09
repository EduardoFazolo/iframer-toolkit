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

const APP_JS = `
fetch('/api/boot').catch(()=>{});
const w = new Worker('/worker.js');
window.runFlow = async function () {
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
      if (p === "/api/users-by-email") return json(200, { [SECRETS.email]: { id: 1, role: "admin" }, ["other.person@example.com"]: { id: 2, role: "user" } });
      if (p === "/api/wall") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<div class='cf-chl'>Are you a robot?</div>"); }
      if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
      if (p === "/submit" && req.method === "POST") { res.writeHead(303, { location: "/page2?csp=" + (url.searchParams.get("csp") || "strict") }); return res.end(); }
      if (p === "/api/redirect-me") { res.writeHead(302, { location: "/api/redirect-target" }); return res.end(); }
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

