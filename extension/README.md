# iframer browser extension (extension mode)

Let iframer drive **a tab you already have open in your real Chrome** — no
relaunch, no remote-debugging port, on your real logged-in session. While a run
is in progress Chrome shows its yellow "iframer started debugging this browser"
bar; it disappears when the run finishes.

## How it works

```
Claude (agent) ──MCP──▶ iframer server ──connectOverCDP──▶ CDP relay ──WS──▶ this extension ──chrome.debugger──▶ your tab
```

- The extension **dials out** to iframer's local server (extensions can't listen
  on a port). It authenticates with a first `{type:"auth"}` message — the token
  never appears in a URL.
- For discovery (`tabs`), the extension uses `chrome.tabs`.
- To **drive** a tab, the extension attaches `chrome.debugger` to it and **relays
  the CDP protocol** to iframer's server, which connects with
  `connectOverCDP` and runs the **exact same pipeline** (find/click/snapshot/
  navigate/obstacle-handling/API-capture) it uses in every other mode. Nothing is
  reimplemented — your live tab is driven by the real, proven engine, with real
  trusted input.

Once paired, iframer can see and drive **any** of your open tabs — the agent lists
them (`tabs` tool), finds the one you meant, and drives it. One pipeline drives a
given tab at a time; different tabs can run concurrently.

## Multiple profiles / browsers

You can run the extension in as many Chrome profiles (or browsers) as you want at
once. Each install identifies itself with a stable random **profile id** and a
**profile name** (the signed-in account's email, or set one in the popup —
"Work", "Personal", …). The server keeps every connection separate, aggregates
tabs across all of them (each tab tagged with its profile), and routes every
`execute`/`reverse-engineer` to the profile that owns the target tab. If two
browsers happen to report the same numeric tab id, iframer refuses to guess and
asks for the tab's `clientId`. A service-worker restart replaces that profile's
own connection instead of piling up. The server stays alive while any profile is
connected and idle-exits once none are.

## Install (unpacked, dev)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this `extension/` folder.

## Pair it (one time, zero copying)

```sh
iframer install extension
```

then restart the browser. That installs a Chrome **native-messaging host**
(locked to this extension's pinned ID) that hands the extension the pairing
token straight from `~/.iframer/secret` — every profile and every Chromium-family
browser (Chrome, Brave, Edge, …) pairs itself, and re-pairs automatically after
a reinstall or a rotated secret. No copying, ever.

Manual fallback (host not installed): click the iframer toolbar icon → paste the
token from `cat ~/.iframer/secret` → **Save & connect**.

Either way the dot turns green when it finds the running iframer server (it
scans ports 3022–3042 on `127.0.0.1`; the server allocates its port from the
same window). The token is the same machine-local secret the iframer CLI/MCP
already use. It is only ever sent to `127.0.0.1`.

## Use it

Just tell your agent, e.g. *"use my Gmail tab and archive everything from X."*
The agent calls the `tabs` tool to list your open tabs, finds the one you meant,
then `execute`s with `mode: "extension"` and that tab's id. No per-tab step —
once the extension is connected, every open tab is reachable.

Because runs go through iframer's real engine, **every pipeline step works
exactly as in the other modes** — same selectors, same `@e` refs, same
screenshots, same knowledge cache.

## Reverse-engineering

Extension mode captures the API too. Run `reverse-engineer` (or `execute` with
`options.captureApi: true`) with `mode: "extension"` + `tabId`. Capture happens
in the server's normal network layer over the CDP relay, so you get everything
the other modes get — parameterized paths, protocol/verb classification,
`functionName`, ready-to-run `curl`, extracted auth, **including response
bodies**. Captured endpoints also feed the knowledge cache automatically.

## Limitations

- **The debug bar.** `chrome.debugger` is what makes trusted input and the full
  engine possible; Chrome always shows the yellow bar while it's attached.
- **The tab becomes active in its window while driven.** An inactive tab
  doesn't render, so the extension activates it — but it does NOT steal your OS
  focus: the window stays in the background and the page is driven with CDP
  focus emulation, so you can keep working. A minimized window is auto-restored
  (without focus — it stays behind your other windows), and screenshots fall
  back to renderer capture if the compositor produces no frame. If a site still
  ignores background input, pass `options.focus: true` to restore the old
  raise-the-window behavior.
- **No session inject/extract.** Your real profile owns its cookies; iframer
  doesn't copy sessions in or out of extension mode.
