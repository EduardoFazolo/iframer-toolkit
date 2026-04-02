# Fingerprint Consistency Validation

## Problem
After implementing fixes 01–06, individual signals may be fixed in isolation but still create cross-signal inconsistencies. Anti-bot systems cross-validate everything:

- IP timezone vs `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `navigator.languages` vs IP geolocation country
- Claimed OS (macOS/Linux/Windows) vs font set vs screen resolution vs WebGL GPU
- `screen.width/height` vs `window.outerWidth/outerHeight` vs `window.innerWidth/innerHeight`
- `navigator.hardwareConcurrency` vs `navigator.deviceMemory` (must be a plausible device combo)
- `navigator.userAgent` vs `navigator.userAgentData` brands/platform/version (must match exactly)
- Canvas GPU string vs `sec-ch-ua-platform` header

## Solution: Automated consistency test

Before shipping each stealth fix, run the browser through a set of check sites and verify no contradictions exist. Also build an internal consistency validator.

### External test sites (run in order)
1. **https://bot.incolumitas.com/** — comprehensive bot detection test, shows overall score and per-signal breakdown
2. **https://browserleaks.com/javascript** — full JS property dump
3. **https://browserleaks.com/canvas** — canvas fingerprint + uniqueness
4. **https://browserleaks.com/webgl** — WebGL vendor, renderer, extensions
5. **https://browserleaks.com/webrtc** — WebRTC IP leak check
6. **https://browserleaks.com/audio** — AudioContext fingerprint
7. **https://browserleaks.com/fonts** — font enumeration count
8. **https://abrahamjuliot.github.io/creepjs/** — CreepJS comprehensive fingerprint trust score
9. **https://pixelscan.net/** — Pixel-level fingerprint consistency check
10. **https://www.deviceinfo.me/** — full device info dump

### Internal consistency checks to add to test suite
Write a test pipeline that navigates to each and extracts results, then asserts:

```js
// Timezone consistency
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ipTz = // from ip-api.com lookup
assert(browserTz === ipTz || both are US zones if using US proxy);

// Screen geometry sanity
assert(screen.width > window.innerWidth);
assert(screen.height > window.innerHeight);
assert(window.outerWidth > 0);
assert(window.outerHeight > 0);

// Hardware plausibility
assert([2,4,6,8,12,16].includes(navigator.hardwareConcurrency));
assert([0.25, 0.5, 1, 2, 4, 8].includes(navigator.deviceMemory));

// UA vs userAgentData consistency
assert(navigator.userAgent.includes(navigator.userAgentData.brands[0].brand) || ...);

// webdriver clean
assert(navigator.webdriver === undefined || navigator.webdriver === false);
```

## Suggestion: Add a `fingerprint-check` pipeline step

Add a step type `{ type: "fingerprint-check" }` that runs all the above checks and returns a structured report. This lets the agent (or a test) quickly validate stealth quality after any change.

## Files to touch
- `tests/fingerprint.test.js` — new test file that runs full consistency check
- `src/lib/actions.ts` — optionally add `fingerprint-check` step type
- `src/lib/types.ts` — add step type if above is implemented
