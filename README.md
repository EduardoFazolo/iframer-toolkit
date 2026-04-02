# iframer

A self-hosted browser automation server for AI agents. Run it with Docker and connect it to Claude (or any MCP-compatible agent) to give your AI a real browser — with session persistence, stealth fingerprinting, credential storage, live noVNC viewing, and automatic captcha solving.

## How it works

```
Claude (MCP) ──→ iframer MCP server ──→ HTTP API (localhost:3021)
                                               └─ Docker container
                                                    ├─ Chromium (headful + stealth)
                                                    ├─ Redis (encrypted sessions)
                                                    └─ noVNC (watch the browser live)
```

The browser runs inside Docker using your machine's real IP — no proxies, no residential proxy fees. Sessions (cookies, localStorage) are encrypted and persisted in Redis so Claude stays logged in across restarts.

## Quick start

**1. Clone and configure**

```bash
git clone https://github.com/yourusername/iframer.git
cd iframer
cp .env.example .env
# Edit .env — set ANTHROPIC_IFRAMER_SECRET (required for captcha solving)
# Optionally set IFRAMER_SECRET to require auth
```

**2. Start**

```bash
bun run start:docker
```

Other Docker helpers:

```bash
bun run stop:docker   # stop containers
bun run logs:docker   # tail container logs
```

**3. Install the MCP into Claude Code**

```bash
bun run mcp:install
```

This auto-reads `IFRAMER_SECRET` from your `.env` and writes the MCP config to `~/.claude.json`. Restart Claude Code and the `iframer` tools will appear automatically.

To remove the MCP:

```bash
bun run mcp:remove
```

For development, use `--dev` to install as `iframer-dev`:

```bash
node bin/cli.js install-mcp --dev
```

## Environment variables

| Variable            | Required | Description |
|---------------------|----------|-------------|
| `REDIS_URL`         | Yes      | Redis connection string (default: `redis://localhost:6379`, handled by docker compose) |
| `ANTHROPIC_IFRAMER_SECRET` | Yes      | Used for vision-based captcha solving |
| `IFRAMER_SECRET`           | No       | When set, all API requests must include `x-api-key: <value>`. Set with `openssl rand -hex 32` |
| `PORT`              | No       | API port (default: `3021`) |

## MCP tools

Once installed, Claude has access to these tools:

### `status`
Check API health, active session, and stored credentials. Call this first.

### `execute`
Run a pipeline of browser steps. Handles captchas and cookie banners automatically.

```
Steps: navigate, click, fill, human-click, human-type, scroll, wait, wait-for,
       evaluate, extract, keyboard, login, solve-captcha, screenshot
```

Each step has a 20-second stale-state timeout. On failure, returns the exact step, error type, and a screenshot of what the browser was looking at.

### `browse`
Headless fetch with session persistence. Fast, for pages that don't need interaction.

### `session`
- `stop` — save cookies/localStorage to Redis for next time
- `clear` — wipe stored session data

### `credentials`
Store encrypted login credentials server-side. Claude never sees them.

- `store` — prompts you for username/password via a secure form
- `login` — fills a login form using stored credentials
- `list` — show domains with stored credentials

## Watching the browser live

When a session is active, open noVNC in your browser:

```
http://localhost:6080
```

Use `iframer watch` from the CLI to auto-open noVNC when a session starts.

## CLI

```bash
# Check API health
node bin/cli.js status

# Store credentials for a site
node bin/cli.js credentials add github.com

# List stored credentials
node bin/cli.js credentials list

# Open a live browser session
node bin/cli.js interactive https://discord.com

# Watch for agent sessions (opens noVNC automatically)
node bin/cli.js watch

# Take a screenshot of the active session
node bin/cli.js screenshot /tmp/shot.png
```

## Session persistence

Session data (cookies + localStorage) is extracted when you call `session stop` and encrypted with `IFRAMER_SECRET` before being written to Redis. Stored credentials (username/password/TOTP) are also encrypted with the same key. On the next `execute` or `interactive` call, the data is decrypted and injected back into the browser automatically.

If `IFRAMER_SECRET` is not set, encryption falls back to the hardcoded string `"iframer-local"` — meaning anyone with Redis access can read your sessions and credentials. Set it.

Redis data is persisted via Docker volume (`redis-data`) so sessions survive container restarts.

## Captcha solving

iframer auto-detects and solves reCAPTCHA and hCaptcha using Claude's vision API. Use the `solve-captcha` step in a pipeline:

```json
{ "type": "solve-captcha" }
```

Requires `ANTHROPIC_IFRAMER_SECRET` in `.env`.

## Architecture

| Component | Technology |
|-----------|------------|
| Browser engine | Patchright (patched Playwright + Chromium) |
| Stealth | Custom fingerprint injection, WebRTC leak prevention, worker patching |
| Session storage | Redis with AES-256 encryption |
| Live viewing | Xvfb + x11vnc + noVNC + websockify |
| MCP server | `@modelcontextprotocol/sdk` |
| Runtime | Bun |

## Building from source

```bash
bun install
bun run index.ts          # start API server
bun run src/mcp/server.ts # start MCP server (dev)

# Rebuild MCP bundle (after editing src/mcp/server.ts)
bun build src/mcp/server.ts --target node --format cjs --outfile bin/mcp-server.cjs
```

## License

MIT
