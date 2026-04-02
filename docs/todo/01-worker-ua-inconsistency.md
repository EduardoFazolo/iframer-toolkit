# Worker UA Inconsistency

## What we observed
bot.incolumitas.com reports `inconsistentWebWorkerNavigatorPropery: FAIL` and `inconsistentServiceWorkerNavigatorPropery: FAIL`.

Three different UAs are visible:
- **Main thread**: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ... Chrome/136`
- **Web Worker**: Same UA but `platform = "Linux x86_64"` — stealth init script doesn't run in workers
- **Service Worker**: `Mozilla/5.0 (X11; Linux x86_64) ... Chrome/145` — patchright's real underlying UA leaking through

This is a direct, reliable bot signal. Detectors specifically check for worker/main-thread UA divergence because JS init scripts only run in the main world — workers expose the unpatched truth.

## Root cause
`page.addInitScript()` only runs in the main browsing context. Web Workers and Service Workers get their `navigator` directly from the browser binary — patchright's real Chromium build (Chrome/145, Linux).

## Fix
Set the UA at the **browser context level** via `userAgent` in `newContext()` options, not just via JS patch. This propagates to workers automatically.

We already pass `userAgent: USER_AGENT` in `stealthContextOptions()` — the issue is that `USER_AGENT` says `Macintosh; Intel Mac OS X 10_15_7` but the platform reality is Linux. Workers expose `platform = "Linux x86_64"` because that's the real OS.

**Solution**: Switch to a Linux UA (see `platform-consistency` task) so main thread, workers, and service workers all agree. A Linux UA on a Linux host will be consistent at every layer without needing to patch workers.

## Files to touch
- `src/lib/browser/stealth.ts` — change `USER_AGENT` to Linux (coordinates with platform-consistency task)
