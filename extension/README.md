# iframer browser extension (extension mode)

Let iframer drive **a tab you already have open in your real Chrome** — banner-free,
on your real logged-in session. No relaunch, no debug port, no yellow "being
debugged" bar.

## How it works

```
Claude (agent) ──MCP──▶ iframer local server ──WebSocket──▶ this extension ──▶ your tab
```

- The extension **dials out** to iframer's local server (extensions can't listen
  on a port, so the server is the WebSocket server and the extension is the client).
- iframer holds the step pipeline; the extension is a thin executor that runs each
  step in the tab the agent picked, using ordinary DOM APIs (`chrome.scripting`),
  so there is no debugger banner.

Once paired, iframer can see and drive **any** of your open tabs — the agent lists
them (`tabs` tool), finds the one you meant, and drives it.

## Install (unpacked, dev)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this `extension/` folder.

## Pair it (one time)

1. Get your pairing token:
   ```sh
   cat ~/.iframer/secret        # or: echo "$IFRAMER_SECRET"
   ```
2. Click the iframer toolbar icon → paste the token → **Save & connect**.
   The dot turns green when it finds the running iframer server (it scans ports
   3022–3042 on `127.0.0.1`).

The token is the same machine-local secret the iframer CLI/MCP already use. It is
only ever sent to `127.0.0.1`.

## Use it

Just tell your agent, e.g. *"use my Gmail tab and archive everything from X."*
The agent calls the `tabs` tool to list your open tabs, finds the one you meant,
then `execute`s with `mode: "extension"` and that tab's id. No per-tab step —
once the extension is connected, every open tab is reachable.

## Supported steps (v1)

`navigate`, `click`, `right-click`, `fill`, `type` / `human-type` / `type-code`,
`keyboard`, `scroll`, `wait`, `wait-for`, `snapshot`, `find`, `extract` (best-effort),
`screenshot` (capture only — use `snapshot` for perception).

Selectors accept CSS or iframer `@e` refs from `snapshot` / `find`.

## Limitations (by design, v1)

- **Synthetic input.** Clicks/typing are dispatched DOM events (`isTrusted: false`).
  ~All sites accept them; a few hardened ones (some payment fields, aggressive
  anti-bot) reject them. Those cases are where a future opt-in `chrome.debugger`
  mode (with the banner) would be added.
- **`extract`/`evaluate`** run `eval` in the page's MAIN world; strict page CSP can
  block it.
- **Screenshots** aren't persisted to a file in extension mode — prefer `snapshot`.
- **One browser at a time.** The newest connected extension wins.
