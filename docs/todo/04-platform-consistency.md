# Platform Consistency (macOS vs Linux)

## Problem
We claim to be macOS Chrome in the User-Agent and `userAgentData`, but we're running Linux Docker. Anti-bot systems cross-check:

- `navigator.platform` → we return `"MacIntel"` (from UA)
- `navigator.userAgentData.platform` → we return `"macOS"`
- Font fingerprint → Linux container font set (not macOS)
- Screen resolution → Xvfb, not a real Mac display
- WebGL renderer → SwiftShader (Linux Mesa), not Intel Iris (macOS)
- `navigator.oscpu` → Firefox-only, but other signals betray Linux

Claiming macOS while running Linux creates subtle inconsistencies that cluster us with known bots.

## Options

### Option A — Claim Linux/Chrome (honest)
Change UA, `userAgentData`, `navigator.platform` to report a realistic Linux Chrome fingerprint. Everything becomes internally consistent. Downside: Linux Chrome users are a small % of real traffic, slightly more suspicious by default.

### Option B — Fix the macOS signals (fake it properly)
Keep claiming macOS but fix all the inconsistent signals:
1. Install macOS fonts in Docker (see `04-fonts.md`)
2. Fix WebGL to report a real Apple GPU string
3. Fix `navigator.platform` = `"MacIntel"` (already set via UA? check)
4. Set a realistic macOS screen resolution via Xvfb (2560x1600 retina)

### Option C — Claim Windows/Chrome (best coverage)
Windows Chrome is ~65% of web traffic. Best camouflage.
Would require updating UA, all `userAgentData` fields, `navigator.platform` = `"Win32"`, installing Windows fonts, adjusting screen resolution to a typical Windows resolution.

**Recommendation: Option A (Linux) short-term for simplicity, Option C (Windows) long-term.**

## Implementation (Option A — Linux Chrome)

Update `stealth.ts`:

```typescript
export const CHROME_VERSION = "136.0.7103.93";
export const USER_AGENT = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
```

Update `userAgentData` in `STEALTH_SCRIPT`:
```js
// Change platform: "macOS" → "Linux"
// Change architecture: "x86" → "x86" (same)
// Change platformVersion: "15.3.0" → "6.5.0" (Linux kernel version)
```

Update `navigator.platform`:
```js
Object.defineProperty(Navigator.prototype, "platform", { get: () => "Linux x86_64", configurable: true });
```

Update `sec-ch-ua-platform` header in `stealthContextOptions`:
```typescript
"sec-ch-ua-platform": `"Linux"`,
```

## Testing
Check https://browserleaks.com/javascript and verify `navigator.platform`, `navigator.userAgent`, and `navigator.userAgentData` all agree.

## Files to touch
- `src/lib/browser/stealth.ts` — USER_AGENT, STEALTH_SCRIPT userAgentData section, sec-ch-ua-platform header
