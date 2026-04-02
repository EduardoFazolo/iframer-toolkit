# Timezone Mismatch

## What we observed
- Proxy exit IP: `96.165.55.81` → `America/Chicago` (UTC-5)
- Browser timezone: `UTC+0` (default Docker/server timezone)
- `getTimezoneOffset`: `0`

This is a classic proxy detection signal. Every bot detection system cross-checks IP geolocation timezone vs `Intl.DateTimeFormat().resolvedOptions().timeZone`. A mismatch = proxy/VPN flag.

## Fix
Set the browser context timezone to match the proxy's geolocated timezone.

### Option A — Static (simple, good enough for US proxy)
Hardcode `America/New_York` or `America/Chicago` in `stealthContextOptions()`:
```typescript
const opts = {
  ...
  timezoneId: "America/New_York",
  locale: "en-US",
  ...
};
```

### Option B — Dynamic (proper)
At session start, look up the proxy exit IP's timezone via a lightweight geo API (e.g., `ip-api.com/json` which is free and fast), then set `timezoneId` accordingly.

```typescript
async function getProxyTimezone(): Promise<string> {
  try {
    const res = await fetch("http://ip-api.com/json?fields=timezone");
    const data = await res.json();
    return data.timezone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
```

Call this once at server startup (or session start) and pass `timezoneId` to `stealthContextOptions()`.

**Recommendation: Option A now, Option B later.** The proxy is US-only right now so hardcoding `America/New_York` is fine.

## Files to touch
- `src/lib/browser/stealth.ts` — add `timezoneId` to `stealthContextOptions()` return value
