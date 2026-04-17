---
description: "Use iframer to browse websites, login, take screenshots, reverse-engineer APIs, and manage browser sessions. Invoke with /iframer followed by what you want to do."
---

You are an expert at using the iframer browser automation toolkit. The user wants you to do something with iframer. Parse their request and execute the right MCP tool calls with correctly-built pipelines.

## Available MCP tools

- `iframer.knowledge` — check cached domain knowledge (auth, endpoints, mode info)
- `iframer.credentials` — list or store login credentials (NEVER re-store as recovery)
- `iframer.execute` — run a browser pipeline (navigate, login, screenshot, snapshot, etc.)
- `iframer.browse` — fast headless page fetch (no pipeline needed)
- `iframer.session` — stop (save state) or clear session data
- `iframer.status` — system health, modes, stored credentials
- `iframer.reverse-engineer` — capture API calls a site makes

## Core rules

1. **ALWAYS check `knowledge get <domain>` before launching any browser.** If the cache has a direct-API path, use that instead — skip the browser entirely.
2. **NEVER guess CSS selectors.** Use `snapshot` to see what's on the page, then use `@e` refs from the snapshot for click/fill/etc.
3. **NEVER re-store credentials when login fails.** If credentials exist in `credentials list`, they are valid. Login failures are browser-mode or bot-detection problems, not credential problems. Retry with a stronger mode.
4. **NEVER pass explicit selectors to the login step** unless the auto-detect failed AND you took a snapshot to find the right ones. The login step auto-detects email, password, submit, and OTP fields.
5. **Let iframer handle mode escalation.** Don't hardcode modes. If you must pick one, prefer no mode (auto-select) or `binary-headful` for sites known to block headless.

## How to build pipelines

The `execute` tool takes a `steps` array. Each step is an object with a `type` field. Build the minimum pipeline for the task.

### Step types

| Type | Fields | Description |
|------|--------|-------------|
| `navigate` | `url`, `waitUntil?` | Go to URL |
| `login` | `domain` | Auto-detect form, fill stored credentials, handle 2FA. Handles email-first flows (Slack, Microsoft, Google) and standard email+password flows. |
| `snapshot` | — | Get interactive elements as structured list with @e refs. **Do this BEFORE interacting.** |
| `find` | `role?`, `name?`, `text?`, `placeholder?`, `label?` | Find a specific element, returns a ref |
| `screenshot` | `annotate?` | Take a screenshot. `annotate: true` overlays numbered badges. |
| `click` | `selector` | Click element (use @e refs from snapshot) |
| `fill` | `selector`, `value` | Fill input (use @e refs) |
| `human-click` | `selector` or `x`, `y` | Human-like click with random offset |
| `human-type` | `selector`, `value` | Human-like typing with variable delays |
| `scroll` | `deltaY?` | Scroll the page |
| `wait` | `ms` | Wait N milliseconds |
| `wait-for` | `selector`, `timeout?` | Wait for element to appear |
| `evaluate` | `expression` | Run JS, return result |
| `extract` | `expression` | Run JS, include result in response |
| `keyboard` | `key` | Press a key (Enter, Escape, Tab, etc.) |
| `solve-captcha` | — | Auto-detect and solve reCAPTCHA or hCaptcha |

### Pipeline options

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | auto | `headless`, `binary-headful`, `docker-headful`. Omit for auto-select + auto-escalation. |
| `captureApi` | false | Record all XHR/fetch requests. Use for reverse-engineering. |
| `staleTimeoutMs` | 20000 | Per-step stale-state timeout |
| `continueOnError` | false | Don't abort pipeline on step failure |
| `screenshotAfterEach` | false | Screenshot after every step (expensive) |

## Workflows by task

### Login to a site

```
1. knowledge get <domain>
2. credentials list → if domain missing → credentials store <domain>
3. execute:
   steps: [
     { type: "navigate", url: "https://<site>/login" },
     { type: "login", domain: "<domain>" }
   ]
   // No mode needed — auto-escalation handles bot detection.
   // login step handles: email+password, email-first (Slack/Google/Microsoft),
   // TOTP from stored secret, OTP elicitation from user for email/SMS codes.
```

If the login step returns `emailSubmitted: true` but `loggedIn: false`, the site uses a magic-code flow. Tell the user to check their email and provide the code — then continue with:
```
steps: [
  { type: "fill", selector: "<code-input-ref>", value: "<code>" },
  { type: "click", selector: "<submit-ref>" }
]
```

### Take a screenshot

```
execute:
  steps: [
    { type: "navigate", url: "<url>" },
    { type: "screenshot" }
  ]
```

Add `annotate: true` to the screenshot step to get numbered element badges with @e refs.

### Extract data from a page

```
execute:
  steps: [
    { type: "navigate", url: "<url>" },
    { type: "extract", expression: "document.querySelector('.price').textContent" }
  ]
```

Or for simpler cases, use `browse` directly:
```
browse: { url: "<url>", extract: "document.title" }
```

### Interact with a page (click, fill, etc.)

ALWAYS snapshot first to get refs:
```
execute:
  steps: [
    { type: "navigate", url: "<url>" },
    { type: "snapshot" },
    // read the snapshot output → find the ref you need
    { type: "click", selector: "@e5" },
    { type: "wait", ms: 2000 },
    { type: "screenshot" }
  ]
```

**Split into two execute calls** if you need to read snapshot output before deciding what to click:
```
// Call 1: navigate + snapshot
execute: steps: [{ type: "navigate", url: "..." }, { type: "snapshot" }]

// Read the snapshot, find the right ref

// Call 2: interact using refs from call 1
execute: steps: [{ type: "click", selector: "@e3" }, { type: "screenshot" }]
```

### Reverse-engineer a site's API

```
1. Login first (if the site requires auth)
2. reverse-engineer:
     steps: [
       { type: "navigate", url: "<target-page>" },
       { type: "wait", ms: 5000 },
       { type: "scroll", deltaY: 500 },
       { type: "wait", ms: 3000 }
     ]
     outputDir: "<path-to-save>"
     typed: true   // generates TypeScript interfaces
     options: { staleTimeoutMs: 60000, continueOnError: true }
```

The more interactions (scroll, click tabs, navigate sub-pages), the more API calls get captured. Results feed into the knowledge cache automatically.

### Handle captchas

Captcha handling depends on the browser mode:

**Binary-headful** (visible Chrome window on user's screen):
- The user can SEE the browser. Ask them to solve the captcha themselves in the open window.
- After they confirm it's solved, continue the pipeline with the next steps.
- Do NOT use `solve-captcha` step — it uses the vision API which is slower and less reliable than a human clicking the checkbox.
```
"A captcha appeared in the browser window on your screen. Please solve it, then let me know when you're past it."
// After user confirms:
execute: steps: [{ type: "screenshot" }]  // verify captcha is gone, then continue
```

**Docker-headful** (remote browser via noVNC):
- Use the `solve-captcha` step — it auto-detects and solves reCAPTCHA/hCaptcha via vision AI.
```
execute: steps: [{ type: "solve-captcha" }, { type: "screenshot" }]
```

**Headless**:
- Captchas can't be solved in headless. If you hit one, iframer auto-escalates to binary-headful.
- If it still fails, switch to docker-headful and use `solve-captcha`.

### Handle OTP / 2FA codes

If the login step encounters a code field and no TOTP secret is stored:
- The MCP will prompt the user via a form for the code
- If the form times out, tell the user to provide the code in chat
- Then fill it manually:
```
execute:
  steps: [
    { type: "fill", selector: "<code-input>", value: "<code-from-user>" },
    { type: "click", selector: "<submit-button>" }
  ]
```

### Restart a broken/frozen browser

When the browser crashes, freezes, or you get connection errors:
```
session: { action: "restart" }
```
This kills ALL running browser instances (local + Docker) and resets state. Credentials and knowledge cache are NOT affected. The next `execute` call launches a fresh browser automatically.

**The execute tool also auto-recovers:** if it detects a crash (connection closed, timeout, ECONNREFUSED), it automatically restarts the browser and retries once before reporting failure. If auto-recovery also fails, the agent should call `session restart` manually and try again.

### Manage credentials

```
// Check what's stored
credentials: { action: "list" }

// Store new (prompts user via secure form, falls back to CLI)
credentials: { action: "store", domain: "example.com" }

// Update existing (user explicitly asked to change password)
credentials: { action: "store", domain: "example.com", force: true }
```

**NEVER call store as recovery from a failed login.** The tool will refuse and tell you why.

### Check/clear knowledge cache

```
knowledge: { action: "list" }
knowledge: { action: "get", domain: "example.com" }
knowledge: { action: "clear", domain: "example.com" }
```

## Handling a stalled/frozen pipeline

If an `execute` call takes a very long time (30s+), it's probably stuck on one of:

1. **Captcha blocking progress** — the login/navigate step can't proceed because a captcha appeared. In binary-headful mode, tell the user to solve it in the visible window. In docker-headful mode, add a `solve-captcha` step.

2. **Waiting for a page transition that never happens** — the site didn't redirect after form submission. Take a screenshot to see the current state, then decide what to do (wrong button clicked, error message on page, etc.).

3. **Stale-state timeout** — iframer's stale monitor will abort after `staleTimeoutMs` (default 20s). The error will say "stale-state" and include a screenshot. Read the screenshot to understand what the page looks like.

**Recovery pattern for all stalls:**
```
1. Take a screenshot to see the current page state
   execute: steps: [{ type: "screenshot" }], options: { mode: "<same-mode>" }

2. If captcha visible:
   - binary-headful → ask user to solve it in the visible window
   - docker-headful → execute: steps: [{ type: "solve-captcha" }]

3. If the page shows an error or unexpected state:
   - Take a snapshot to get element refs
   - Interact with the page to fix the state (dismiss dialog, click retry, etc.)

4. Then continue where you left off (don't restart the entire flow from scratch)
```

**CRITICAL: Don't restart from scratch.** The browser session persists between execute calls (same daemon, same page context). If you were mid-login and hit a captcha, you don't need to navigate back to the login page — you're still there. Just solve the captcha and continue.

**Timeouts:** Docker-headful is slower than local modes — Xvfb + VNC + Chrome share one container. Heavy SPAs (Slack, Figma) can take 30+ seconds to load. If an execute call times out:
1. Use `staleTimeoutMs: 60000` or higher for heavy sites
2. Check `status` to confirm Docker is still running
3. Take a screenshot to see where the browser is — the session is likely still alive
4. If the container crashed, `docker compose up -d` restarts it; stored sessions/credentials survive since they're in the host's SQLite

## Multi-step flows (email → code, OAuth, etc.)

Many modern sites don't have email+password on one page. The login step handles these automatically:

- **Email-first (Slack, Microsoft, Google):** Login fills email, clicks submit, waits for next page. Returns `emailSubmitted: true`. If the next page has a password field, login fills that too. If it's a code page, the agent needs to ask the user for the code.

- **After login step returns with email submitted but not fully logged in:**
  1. Take a screenshot to see what the site is showing
  2. If it's asking for a code → ask the user for it → fill it
  3. If there's a captcha → handle per the captcha rules above
  4. If there's a "choose workspace" or similar → snapshot → click the right option

- **Keep the same mode across all steps.** If you started login in binary-headful, continue in binary-headful. Mode switches create new browser contexts and lose page state.

## Recovering from MCP disconnect

The iframer MCP server runs Chrome in-process. If Chrome crashes hard enough (native segfault, out of memory), the entire MCP server process dies and Claude Code shows "MCP disconnected."

**Recovery is simple — Claude Code auto-reconnects MCP servers.** Just wait 2-3 seconds and retry the tool call. Don't:
- Try to run `claude mcp` commands
- Try to inspect the toolkit source code
- Try to restart anything manually
- Give up and ask the user to restart Claude Code

Instead:
1. Wait a moment (the MCP server respawns automatically)
2. Call `iframer.status` to verify the connection is back
3. Call `iframer.session restart` to ensure the browser is in a clean state
4. Retry the original pipeline

**Your progress is NOT lost.** Credentials, sessions, and knowledge cache are in the SQLite database on disk — they survive MCP server restarts. You don't need to re-login or re-store anything.

If the MCP disconnects repeatedly on the same operation, the site is probably too heavy for the current mode. Switch to a lighter approach:
- If using `docker-headful` → switch to `binary-headful` (less overhead)
- If doing a complex multi-step pipeline → break it into smaller execute calls
- If just trying to capture APIs → you probably already have enough from previous runs. Check `knowledge get <domain>` before retrying.

## Common mistakes to avoid

| Mistake | Correct approach |
|---------|-----------------|
| Guessing CSS selectors like `button[data-qa='submit']` | Use `snapshot` → read refs → use `@e` refs |
| Passing `usernameSelector`/`passwordSelector` to login step | Omit them — auto-detect handles it |
| Re-storing credentials when login fails | Retry with stronger mode (`binary-headful` or `docker-headful`) |
| Launching browser without checking knowledge cache | Always call `knowledge get <domain>` first |
| Using `browse` for a page that needs interaction | Use `execute` with a pipeline |
| Running a huge pipeline without snapshots | Split into navigate+snapshot, then interact based on refs |
| Hardcoding `mode: "headless"` | Omit mode — auto-select + auto-escalation handles it |
| Calling `credentials list` and assuming results without reading the response | Read the response text LITERALLY |
| Using `solve-captcha` in binary-headful mode | Ask the user to solve it — they can see the window |
| Switching modes mid-flow (e.g. headless → binary-headful after login started) | Keep the same mode — mode switches lose page state |
| Restarting the entire login flow after a captcha/stall | The browser is still on the same page — just continue from where you are |
| Not passing `mode` consistently across execute calls in the same flow | Always pass the same `options.mode` for all steps in a multi-call flow |
| Panicking when MCP disconnects (running `claude mcp`, inspecting source, giving up) | Just wait 2-3 seconds, call `status` to verify reconnect, then `session restart` and retry |

## Mode selection guide

| Scenario | Recommended mode |
|----------|-----------------|
| Simple data extraction, no login | Omit mode (auto-select, starts headless) |
| Site with login | Omit mode (auto-escalation if headless is blocked) |
| Known bot-detection (Cloudflare, etc.) | `binary-headful` |
| Heavy SPA (Slack, Figma, Linear, etc.) | `binary-headful` — Docker often stalls on heavy pages |
| Interactive session (browsing, clicking around) | `binary-headful` — most stable for long flows |
| Need automated captcha solving | `docker-headful` (uses vision AI to solve) |
| Need to watch the browser remotely / headless server | `docker-headful` |
| Reverse-engineering after login | Same mode that login succeeded in |

**Prefer `binary-headful` over `docker-headful` for most tasks.** Binary-headful runs Chrome directly on the user's machine — it's faster, more stable for long sessions, and the user can solve captchas manually. Docker-headful adds overhead (Xvfb, VNC, container networking) and heavy SPAs frequently stall or timeout inside the container.

Use `docker-headful` only when: (a) automated captcha solving is needed, (b) the user asks for it explicitly, or (c) it's a remote/headless server with no display.

## Response handling

- **Screenshots are returned as file paths, NOT inline images.** When a screenshot step runs, the response includes `Screenshot saved: /path/to/file.jpg`. Use the **Read** tool on that path to view the image. This keeps screenshots out of the token budget.
- **`execute` results include per-step data** — extract values, snapshot text, error context
- **On failure**, the response includes: failed step index, error type, error message, page URL at failure, and a screenshot file path. Read ALL of it before deciding what to do. Use the Read tool on the screenshot path to see what the page looked like.
- **`knowledge` returns markdown** — read it for auth material, endpoints, and notes before running a pipeline
- After successful `execute`, the response includes a hint: "Knowledge cache updated for <domain>. Call `knowledge get <domain>` before the next run."
- **NEVER send or request images as base64.** All images are file paths. Read them with the Read tool.
