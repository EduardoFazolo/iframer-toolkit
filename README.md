# iframer-toolkit

Browser access for AI agents when normal fetching fails. Give Claude, Codex, or any MCP-compatible agent a real browser — with session persistence, stealth fingerprinting, encrypted credential storage, and automatic captcha solving, and most af all, API Reverse Engineering.

## Example:
<img width="2962" height="1116" alt="image" src="https://github.com/user-attachments/assets/c937b39c-5dba-4d6a-892d-71243ecf8146" />
Resulting rev API example:
<img width="2141" height="1173" alt="image" src="https://github.com/user-attachments/assets/19a27904-ebe0-4e65-8a44-a8cfb3756ed8" />

Ships as:
- **CLI** (`iframer-toolkit` / `iframer`) — browse, screenshot, credentials, sessions, reverse-engineer APIs
- **MCP server** — plugs directly into Claude Code or Codex so agents can drive the browser themselves
- **Browser extension** (optional) — lets the agent drive tabs in **your real Chrome**, on your real logged-in session
- **Self-hosted Docker server** (optional) — adds live headful browsing over noVNC for remote/multi-user setups

## Install

```sh
npm install -g iframer-toolkit
```

Then pull in the runtime dependencies (Chrome for Testing + MCP registration):

```sh
iframer-toolkit install
```

This is shorthand for:

```sh
iframer-toolkit install chromium   # downloads Chrome for Testing to ~/.iframer
iframer-toolkit install mcp        # registers the MCP server in ~/.claude.json and ~/.codex/config.toml
```

Restart Claude Code or Codex and the `iframer` tools will be available.

To update later:

```sh
iframer-toolkit update             # update via npm (also refreshes the extension if installed)
iframer-toolkit update --check     # just report whether a newer version exists
```

> **Note:** If you prefer, your agent can run `iframer-toolkit install` for you — it'll figure the rest out.

## Quick start

Once installed, you can either drive the browser via the CLI directly, or ask your agent (Claude Code / Codex) to do it for you via the MCP.

**CLI:**

```sh
iframer-toolkit status                                      # system + browser modes
iframer-toolkit browse https://example.com --extract 'document.title'
iframer-toolkit screenshot https://news.ycombinator.com -o /tmp/hn.png
iframer-toolkit credentials add github.com                  # interactive masked prompt
iframer-toolkit reverse-engineer https://some-spa.com       # capture the APIs it calls
iframer-toolkit --cache                                     # list cached domains
```

**From Claude Code or Codex** (after `install mcp`):

> "Log into my account on example.com and extract the latest invoice."

The agent will call `knowledge` first (to see if a direct-API path is cached), fall back to `credentials` + `execute` if not, auto-escalate browser modes if a site blocks headless, and return the result. No copying cookies, no proxies, no manual login.

## How it works

```
Claude / Codex (MCP) ──→ iframer MCP server ──→ shared local server (127.0.0.1)
                                                    ├─ patchright (stealth Chromium)
                                                    ├─ Chrome for Testing
                                                    ├─ your real Chrome (optional, via extension)
                                                    └─ SQLite at ~/.iframer — one file for
                                                       encrypted credentials, session state,
                                                       and per-domain knowledge cache
```

By default, `install mcp` runs in **local mode**: no Docker needed. All MCP clients on the machine talk to **one shared local server** (discovered via `~/.iframer/server.json`, loopback-only) that keeps a stealth-patched Chromium (via [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)) warm between calls, tracks every browser it spawns in an on-disk PID registry so nothing leaks, and idle-exits when no one needs it. `install mcp` registers the server in both Claude Code (`~/.claude.json`) and Codex (`~/.codex/config.toml`).

**One credential store for every browser mode.** Stored credentials, session cookies/localStorage, and the knowledge cache all live in a single SQLite file at `~/.iframer/iframer.db`. Store a password once (via CLI or MCP) and every mode — `headless`, `binary-headful`, `docker-headful` — uses the same row. No split-brain between modes.

**Auto-escalation.** When a pipeline is blocked in `headless` (bot detection, captcha), iframer transparently retries in `binary-headful` and then `docker-headful` without a round-trip to the agent. The mode that worked is recorded in `~/.iframer/domain-modes.json` so the next run on that domain starts at the right mode.

**Knowledge cache.** After every successful run, iframer writes a per-domain markdown file at `~/.iframer/knowledge/<domain>.md` recording which cookies / localStorage keys / headers the site uses for auth, plus any API endpoints observed along the way. Next time the agent needs data from that domain, it reads the cache first — if there's a direct-API path, it skips the browser entirely. See [Knowledge cache](#knowledge-cache) below.

For live remote viewing, multi-user, or Linux server deployments, see [Self-hosting with Docker](#self-hosting-with-docker) below.

## Extension mode — drive your real Chrome

The optional browser extension lets the agent drive **a tab you already have open in your real Chrome** — no relaunch, no remote-debugging port, on your real logged-in session. The extension dials out to iframer's local server and relays the CDP protocol via `chrome.debugger`, so your live tab is driven by the exact same pipeline engine (find / click / snapshot / obstacle handling / API capture) as every other mode, with real trusted input. While a run is active, Chrome shows its yellow "started debugging" bar.

```sh
iframer install extension chrome   # installs the pairing host, prints the folder to load
iframer extension path             # prints it again
```

Then load it once: `chrome://extensions` → Developer mode → **Load unpacked** → the printed folder. Once paired, the agent lists your open tabs with the `tabs` tool and drives the one you mean. Multiple Chrome profiles/browsers can be paired at once — each identifies itself with a profile name, and iframer routes work to the profile that owns the target tab. See [`extension/README.md`](extension/README.md) for details.

## CLI reference

```
iframer-toolkit <command> [args]

Pipeline:
  execute <pipeline.json|json>     Run a pipeline of browser steps
    --mode <mode>                  Force browser mode (headless|binary-headful|docker-headful)
    --capture-api                  Record XHR/fetch requests during execution
    --continue-on-error            Don't stop on step failure
    --timeout <ms>                 Stale-state timeout (default: 20000)
    --json                         Print raw PipelineResult JSON (default: compact agent-readable text)

Quick actions:
  browse <url>                     Headless fetch with JS rendering
    --extract <js>                 Evaluate JS and return result
    --html                         Return full page HTML
    --wait-for <selector>          Wait for element before extracting
    --sessionless                  Skip session persistence
  screenshot <url>                 Take a screenshot of a URL
    --annotate                     Overlay element badges with refs
    -o, --output <path>            Output file path
  reverse-engineer <url|file>      Capture API calls a site makes
    --output <dir>                 Save directory
    --typed                        Generate TypeScript

Session:
  session stop                     Stop and save cookies/localStorage
  session clear                    Wipe stored session data
  session status                   Check session state

Credentials:
  credentials add <domain>         Store login credentials (encrypted)
    --username <user>              Username or email
    --password <pass>              Password (interactive masked prompt if omitted)
    --totp-secret <secret>         TOTP secret for 2FA
  credentials list                 List domains with stored credentials
  credentials remove <domain>      Delete credentials for a domain

Knowledge cache:
  --cache                          List all cached domains
  --cache <domain>                 Print the cached knowledge for one domain
  --clear-cache                    Wipe all cached knowledge
  --clear-cache <domain>           Wipe one domain's cache
  knowledge list                   Same as --cache
  knowledge get <domain>           Same as --cache <domain>
  knowledge clear [domain]         Same as --clear-cache [domain]

Telemetry:
  telemetry                        Report estimated session tokens consumed by MCP tool calls
  telemetry --clear                Wipe the telemetry log

Setup:
  install                          Install everything (Chromium + MCP)
  install chromium                 Download Chrome for Testing
  install mcp [--dev]              Register MCP server in Claude Code and Codex
  install extension chrome         Install the optional browser extension pairing host
  extension path                   Print the extension folder to load in chrome://extensions
  update [--check]                 Update iframer via npm (--check: report only)
  remove [chromium|mcp|extension]  Remove everything, or one piece

Browser:
  modes                            Show available browser modes
  status                           Show system status
```

The binary is available as either `iframer-toolkit` (full name) or `iframer` (short alias). `npx iframer-toolkit ...` also works without a global install.

## MCP tools

Once the MCP is registered, the agent has access to:

- **`status`** — system health, session state, stored credentials, available browser modes
- **`knowledge`** — read / list / clear the per-domain knowledge cache. Agents are told to check this **before** every `execute` or `browse` — if the cache has a direct-API path for the data, the browser doesn't launch at all.
- **`execute`** — run a pipeline of browser steps (navigate, click, right-click, fill, select, human-click, human-type, type-code, read, evaluate, extract, wait, wait-for, scroll, keyboard, upload, paste, download, login, solve-captcha, recaptcha, screenshot, snapshot, find). Each step has a 20s stale-state timeout. On failure, returns the exact step, error type, and a screenshot of the page at the point of failure. Auto-escalates browser modes transparently on bot-block.
- **`browse`** — fast headless fetch with session persistence for pages that don't need a full pipeline
- **`reverse-engineer`** — capture the APIs a site calls (feeds into the knowledge cache so future runs can skip the browser)
- **`remember`** — per-domain **element anchors**: save a selector once under a name, then target it as `@a:<name>` in any later pipeline — no re-finding the element on every visit. Anchors self-heal (a failed anchor triggers re-discovery, not blind retries) and the tool also records per-site quirks.
- **`tabs`** — list and target tabs in your real Chrome (requires the [extension](#extension-mode--drive-your-real-chrome))
- **`clipboard`** — read/write the machine's clipboard (the same one your Chrome uses): read a code a site just copied, or stage text to paste into a field via the `paste` step
- **`session`** — `stop` (save state) or `clear` (wipe)
- **`credentials`** — `store` (secure form via MCP elicitation), `list`. The `store` action will **refuse to overwrite** existing credentials unless explicitly told to (`force: true`) — this blocks the common "login failed, re-ask for password" anti-pattern when the real problem is browser mode / bot detection.

## Session persistence

Session data (cookies + localStorage) and credentials are stored in SQLite at `~/.iframer/iframer.db` and encrypted with AES-256-GCM. Data is automatically re-injected on the next `execute` or `browse` so agents stay logged in across restarts — and across browser modes: a session captured in `binary-headful` will transparently load into `headless` on the next run.

The encryption key lives at `~/.iframer/secret` (0600 permissions), generated on first `install mcp`. Set `IFRAMER_SECRET` in your environment to override it — useful if you want to synchronize the key across multiple machines.

## Knowledge cache

Every successful `execute` run updates a plain markdown file at `~/.iframer/knowledge/<domain>.md` — human-readable, grep-able, and editable. Each file captures:

- Which cookies, localStorage keys, and headers are load-bearing for authentication (names only — values stay encrypted in the session store)
- Which API endpoints the site called during the run (with method, path, example curl, and status code)
- Which browser mode last worked for the domain
- Notes about captcha/bot-detection behavior

The MCP `knowledge` tool exposes this to the agent with `get`, `list`, and `clear` actions. Agents are instructed to call it **before** every browser-touching tool — if the cache already knows a direct-API path for the data the user is asking about, the agent hits the API directly and never launches a browser. First request takes seconds; repeat requests on the same domain take milliseconds.

Inspect the cache yourself:

```sh
iframer-toolkit --cache                     # list all cached domains
iframer-toolkit --cache figma.com           # print the markdown for one domain
iframer-toolkit --clear-cache               # wipe all cached knowledge
iframer-toolkit --clear-cache figma.com     # wipe one domain
```

## Captcha solving

iframer auto-detects and solves reCAPTCHA and hCaptcha using Claude's vision API. Use the `solve-captcha` step in a pipeline:

```json
{ "type": "solve-captcha" }
```

Requires `ANTHROPIC_API_KEY` in your environment.

## Environment variables

| Variable            | Required | Description |
|---------------------|----------|-------------|
| `ANTHROPIC_API_KEY` | For captcha | Used for vision-based captcha solving |
| `IFRAMER_SECRET`    | No       | Encryption key for sessions & credentials. Defaults to the value at `~/.iframer/secret` (auto-generated on first `install mcp`). Override in the shell or in `.env` to pin a specific key. |
| `IFRAMER_TELEMETRY` | No       | Set to `0` in the MCP env to disable the local token-telemetry log (`iframer telemetry` reads it). |
| `IFRAMER_LOCAL_PORT`| No       | Base port for the shared local server (default: `3022`, loopback only). |
| `IFRAMER_DATA_DIR`  | No       | Override the data directory. Default: `~/.iframer`. The Docker container sets this to `/iframer-data` so a bind mount makes host and container share one database. |
| `IFRAMER_MODE`      | No       | `local` (default) or `docker`. Force a mode regardless of what's running. |
| `IFRAMER_URL`       | No       | Docker API URL when self-hosting (default: `http://localhost:3021`). |

## Self-hosting with Docker

The Docker server adds a live headful browsing mode over noVNC (watch the agent drive the browser in real time) and lets multiple clients share one browser pool. The Docker path is only used when the pipeline explicitly requests `mode: "docker-headful"` — `headless` and `binary-headful` always run directly on the host even when Docker is up, so host-stored credentials are always visible.

The `docker-compose.yml` bind-mounts `~/.iframer` from the host into the container as `/iframer-data` and sets `IFRAMER_DATA_DIR=/iframer-data`, so **container and host share the same SQLite file**. Credentials stored via the CLI or MCP on the host are immediately visible to `docker-headful` without any copy step.

**1. Clone and configure**

```sh
git clone https://github.com/EduardoFazolo/iframer-toolkit.git
cd iframer-toolkit
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (for captcha) and IFRAMER_SECRET (for auth)
```

**2. Start**

```sh
bun run start:docker   # docker compose up --build -d
bun run logs:docker    # tail container logs
bun run stop:docker    # stop containers
```

**3. Point the MCP at it (remote host only)**

If you're running Docker on a remote machine and the MCP on a different machine, install the MCP with the remote URL:

```sh
IFRAMER_URL=https://your-host:3021 iframer-toolkit install mcp --dev
```

When Docker is on the same host as the MCP, no extra setup is needed — the local MCP server will auto-detect the Docker API on `localhost:3021` and route only `docker-headful` requests through it.

**4. Watch the browser live**

When a `docker-headful` session is active, open noVNC:

```
http://your-host:6080
```

Or run `iframer-toolkit watch` to auto-open it.

## Architecture

| Component          | Technology |
|--------------------|------------|
| Browser engine     | [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) (stealth-patched Playwright fork) |
| Browser binary     | Chrome for Testing (downloaded to `~/.iframer/chrome/`) |
| Local server       | One shared warm server per machine (loopback-only, discovered via `~/.iframer/server.json`), on-disk browser PID registry, idle auto-exit |
| Extension mode     | Chrome extension relaying CDP over WebSocket (`chrome.debugger` → `connectOverCDP`) — drives tabs in your real Chrome |
| Stealth            | Fingerprint injection, WebRTC leak prevention, worker patching |
| Credential store   | SQLite at `~/.iframer/iframer.db`, AES-256-GCM encrypted, shared by every browser mode |
| Session persistence| Same SQLite file — cookies + localStorage re-injected across runs and modes |
| Knowledge cache    | Plain markdown at `~/.iframer/knowledge/<domain>.md` |
| Captcha solving    | Anthropic vision API (`@anthropic-ai/sdk`) |
| Live viewing       | Xvfb + x11vnc + noVNC + websockify (Docker mode only) |
| MCP server         | `@modelcontextprotocol/sdk` |
| Runtime            | Node.js ≥18 (Bun for development) |

## Development

```sh
git clone https://github.com/EduardoFazolo/iframer-toolkit.git
cd iframer-toolkit
bun install

# Run the CLI from source (no build needed — bun runs .ts directly)
bun run bin/cli.js status

# Run the MCP server from source
bun run src/mcp/server.ts

# Run the Docker API server from source (no Docker)
bun run start   # bun run index.ts

# Rebuild the distributable bundles (dist/cli.cjs + dist/mcp-server.cjs)
bun run build

# Install the locally-built package globally for testing
npm pack
npm install -g ./iframer-toolkit-*.tgz
```

`prepublishOnly` runs `bun run build` automatically, so `npm publish` always ships a fresh bundle.

## License

MIT
