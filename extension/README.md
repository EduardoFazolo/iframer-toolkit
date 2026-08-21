# iframer browser extension (extension mode)

Let iframer drive **a tab you already have open in your real Chrome** — banner-free,
on your real logged-in session. No relaunch, no debug port, no yellow "being
debugged" bar.

## How it works

```
Claude (agent) ──MCP──▶ iframer server ──connectOverCDP──▶ CDP relay ──WS──▶ this extension ──chrome.debugger──▶ your tab
```

- The extension **dials out** to iframer's local server (extensions can't listen
  on a port).
- For discovery (`tabs`), the extension uses `chrome.tabs`.
- To **drive** a tab, the extension attaches `chrome.debugger` to it and **relays
  the CDP protocol** to iframer's server, which connects with patchright's
  `connectOverCDP` and runs the **exact same pipeline** (find/click/snapshot/
  navigate/obstacle-handling/API-capture) it uses in every other mode. Nothing is
  reimplemented — your live tab is driven by the real, proven engine.

**Trade-off:** driving a tab uses `chrome.debugger`, so Chrome shows a yellow
"iframer started debugging this browser" banner while a run is in progress. This
is the cost of using real, trusted input and the full engine; it detaches when the
run finishes.

Once paired, iframer can see and drive **any** of your open tabs — the agent lists
them (`tabs` tool), finds the one you meant, and drives it. Multiple Chrome
profiles can be connected at once; each identifies itself and calls route to the
profile that owns the target tab.

## Multiple profiles / browsers

You can run the extension in as many Chrome profiles (or browsers) as you want at
once. Each connection identifies itself with a stable **profile id** and a
**profile name** (set it in the popup — "Work", "Personal", …). The server keeps
every connection separate, aggregates tabs across all of them (each tab tagged
with its profile), and routes every `execute`/`reverse-engineer` to the profile
that owns the target tab. A service-worker restart replaces that profile's own
connection instead of piling up. The server stays alive while any profile is
connected and idle-exits once none are.

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

## Supported steps

`navigate`, `click`, `right-click`, `fill`, `type` / `human-type` / `type-code`,
`keyboard` (with `meta`/`ctrl`/`shift`/`alt` modifiers), `scroll`, `wait`,
`wait-for`, `snapshot`, `find`, `read`, `screenshot` (capture only),
`extract`/`evaluate` (best-effort — see below).

- **`read`** returns an element's visible text (or the whole page) with **no eval**,
  so it works on strict-CSP apps like Slack. Use it to read content.
- **`extract`/`evaluate`** run arbitrary JS in the page's main world; strict page
  CSP (Slack, GitHub, …) blocks `eval`, so prefer `read`/`snapshot`/`find` there.
- **`find`** picks the tightest clickable match and scrolls it into view; it sees
  SPA rows (`role=option`/`row`/`listitem`, focusable divs), not just links/buttons.

Selectors accept CSS or iframer `@e` refs from `snapshot` / `find`.

## Reverse-engineering (banner-free)

Extension mode captures the API too. Run `reverse-engineer` (or `execute` with
`options.captureApi: true`) with `mode: "extension"` + `tabId`, and the extension
records the tab's XHR/fetch via `chrome.webRequest`. iframer runs those through the
**same** pipeline the normal capture uses — parameterized paths, protocol/verb
classification, `functionName`, ready-to-run `curl`, and extracted auth
(Authorization / cookies / token headers). Captured endpoints also feed the
knowledge cache automatically.

The one gap vs. patchright capture: **response bodies are not available** to MV3
`webRequest`. You get the full request (method, URL, headers, body, auth) and
response status/headers, but not the response payload. Capturing response bodies
would require the opt-in `chrome.debugger` mode (with the yellow banner).

## Limitations (by design, v1)

- **Synthetic input.** Clicks/typing are dispatched DOM events (`isTrusted: false`).
  ~All sites accept them; a few hardened ones (some payment fields, aggressive
  anti-bot) reject them. Those cases are where a future opt-in `chrome.debugger`
  mode (with the banner) would be added.
- **`extract`/`evaluate`** run `eval` in the page's MAIN world; strict page CSP can
  block it.
- **Screenshots** aren't persisted to a file in extension mode — prefer `snapshot`.
- **One browser at a time.** The newest connected extension wins.
