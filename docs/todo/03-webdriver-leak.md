# navigator.webdriver Still Detectable

## What we observed
`fpscanner.WEBDRIVER: FAIL` on bot.incolumitas.com despite our stealth script patching `navigator.webdriver` to `false`.

## Root cause
Our patch uses `Object.defineProperty` on `Navigator.prototype` in an init script. However patchright/Chromium may expose `webdriver` through multiple paths:

1. **`navigator.webdriver` via prototype** — we patch this, but the patch may not apply before the detector runs
2. **`Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')`** — if the descriptor shows `configurable: false` or `writable: false`, it signals the property was defined natively and the JS override didn't work cleanly
3. **`Object.getOwnPropertyDescriptor(navigator, 'webdriver')`** — instance-level descriptor may still return `true`
4. **CDP `--enable-automation` flag** — sets webdriver on the C++ side; our STEALTH_ARGS includes `--disable-blink-features=AutomationControlled` but patchright may re-add automation flags

## Fix
Ensure the patch is airtight:

```js
// Remove instance-level property first, then patch prototype
try { delete navigator.webdriver; } catch {}

Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => undefined,
  set: () => {},
  enumerable: true,
  configurable: true,
});
```

Also verify `--disable-blink-features=AutomationControlled` is in the launch args AND that `--enable-automation` is NOT being added by patchright.

Check: `docker exec <container> grep -r "enable-automation" /app/node_modules/patchright`

## Files to touch
- `src/lib/browser/stealth.ts` — strengthen the webdriver patch
- `src/lib/browser/launcher.ts` — verify launch args
