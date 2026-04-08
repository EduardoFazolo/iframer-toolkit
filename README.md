# iframer-toolkit

Browser access for AI agents when normal fetching fails. Give Claude (or any MCP-compatible agent) a real browser — with session persistence, stealth fingerprinting, encrypted credential storage, and automatic captcha solving.

Ships as:
- **CLI** (`iframer-toolkit` / `iframer`) — browse, screenshot, credentials, sessions, reverse-engineer APIs
- **MCP server** — plugs directly into Claude Code so agents can drive the browser themselves
- **Self-hosted Docker server** (optional) — adds live headful browsing over noVNC for remote/multi-user setups

## Install

```sh
npm install -g iframer-toolkit
```

Then pull in the runtime dependencies (Chrome for Testing + MCP registration):

```sh
iframer-toolkit install deps
```

This is shorthand for:

```sh
iframer-toolkit install chromium   # downloads Chrome for Testing to ~/.iframer
iframer-toolkit install-mcp        # registers the MCP server in ~/.claude.json
```

Restart Claude Code and the `iframer` tools will be available.

> **Note:** If you prefer, your agent can run `iframer-toolkit install deps` for you — it'll figure the rest out.

## Quick start

Once installed, you can either drive the browser via the CLI directly, or ask Claude to do it for you via the MCP.

**CLI:**

```sh
iframer-toolkit status                                      # system + browser modes
iframer-toolkit browse https://example.com --extract 'document.title'
iframer-toolkit screenshot https://news.ycombinator.com -o /tmp/hn.png
iframer-toolkit credentials add github.com                  # secure prompt
iframer-toolkit reverse-engineer https://some-spa.com       # capture the APIs it calls
```

**From Claude Code** (after `install-mcp`):

> "Log into my account on example.com and extract the latest invoice."

Claude will call the MCP `credentials` tool (prompting you securely if needed), then run a pipeline via `execute`, and return the result. No copying cookies, no proxies, no manual login.

## How it works

```
Claude (MCP) ──→ iframer MCP server ──→ Iframer (local)
                                            ├─ patchright (stealth Chromium)
                                            ├─ Chrome for Testing
                                            └─ SQLite (encrypted sessions + creds at ~/.iframer)
```

By default, `install-mcp` runs in **local mode**: no Docker needed. The MCP spawns a stealth-patched Chromium (via [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)) on your machine and auto-escalates between `headless` → `binary-headful` based on what a site requires.

For live remote viewing, multi-user, or Linux server deployments, see [Self-hosting with Docker](#self-hosting-with-docker) below.

## CLI reference

```
iframer-toolkit <command> [args]

Pipeline:
  execute <pipeline.json|json>     Run a pipeline of browser steps

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
  credentials list                 List domains with stored credentials
  credentials remove <domain>      Delete credentials for a domain

Setup:
  install chromium                 Download Chrome for Testing
  install mcp                      Register MCP server in Claude Code
  install deps                     Run both of the above
  install-mcp [--dev]              Same as `install mcp`
  remove-mcp [--dev]               Remove iframer MCP from Claude Code

Browser:
  modes                            Show available browser modes
  status                           Show system status
```

The binary is available as either `iframer-toolkit` (full name) or `iframer` (short alias). `npx iframer-toolkit ...` also works without a global install.

## MCP tools

Once the MCP is registered, Claude has access to:

- **`status`** — system health, session state, stored credentials
- **`execute`** — run a pipeline of browser steps (navigate, click, fill, human-click, human-type, scroll, wait, evaluate, extract, keyboard, login, solve-captcha, screenshot). Each step has a 20s stale-state timeout; failures return the exact step, error type, and a screenshot.
- **`browse`** — fast headless fetch with session persistence
- **`reverse-engineer`** — capture the APIs a site calls so Claude can skip the browser next time
- **`session`** — `stop` (save state) or `clear` (wipe)
- **`credentials`** — `store` (secure prompt), `login`, `list` — agents never see passwords

## Session persistence

Session data (cookies + localStorage) and credentials are stored in SQLite at `~/.iframer/` and encrypted with AES-256. Data is automatically re-injected on the next `execute` or `browse` so Claude stays logged in across restarts.

Set `IFRAMER_SECRET` to your own key (generate with `openssl rand -hex 32`) to control the encryption passphrase. Without it, encryption falls back to a known default — fine for local use on a trusted machine, but set it if you care.

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
| `IFRAMER_SECRET`    | No       | Encryption key for sessions & credentials. Also used as API auth when self-hosting. Generate with `openssl rand -hex 32`. |
| `IFRAMER_MODE`      | No       | `local` (default) or `docker`. Force a mode regardless of what's running. |
| `IFRAMER_URL`       | No       | Docker API URL when self-hosting (default: `http://localhost:3021`). |

## Self-hosting with Docker

The Docker server adds live headful browsing over noVNC (watch the agent drive the browser in real time), and lets multiple users share one browser pool. Recommended for remote Linux hosts or team setups.

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

**3. Point the MCP at it**

On the machine running Claude Code:

```sh
IFRAMER_URL=https://your-host:3021 iframer-toolkit install-mcp --dev
```

**4. Watch the browser live**

When a session is active, open noVNC:

```
http://your-host:6080
```

Or run `iframer-toolkit watch` to auto-open it.

## Architecture

| Component        | Technology |
|------------------|------------|
| Browser engine   | [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) (stealth-patched Playwright fork) |
| Browser binary   | Chrome for Testing (downloaded to `~/.iframer`) |
| Stealth          | Fingerprint injection, WebRTC leak prevention, worker patching |
| Session storage  | SQLite with AES-256 encryption |
| Live viewing     | Xvfb + x11vnc + noVNC + websockify (Docker mode only) |
| MCP server       | `@modelcontextprotocol/sdk` |
| Runtime          | Node.js ≥18 (Bun for development) |

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
