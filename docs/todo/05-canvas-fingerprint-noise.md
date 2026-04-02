# Canvas Fingerprint Noise

## Problem
All sessions running on the same Docker+Xvfb produce the **exact same** canvas hash. Anti-bot systems (hCaptcha, Cloudflare, DataDome) cluster all identical canvas hashes as a single bot identity — it's one of the strongest signals they have.

The canvas hash is computed by the site doing:
```js
const ctx = canvas.getContext('2d');
ctx.fillText('some text', 10, 10);
canvas.toDataURL(); // → same hash for every one of our sessions
```

## Solution
Inject **per-session deterministic pixel noise** into canvas output via `addInitScript`. The noise must be:
- **Deterministic per session**: same session = same hash (to not look unstable)
- **Different across sessions**: different session IDs = different hashes
- **Subtle enough not to break visual rendering** for the actual page

Patch these methods on every new page:
- `CanvasRenderingContext2D.prototype.getImageData`
- `HTMLCanvasElement.prototype.toDataURL`
- `HTMLCanvasElement.prototype.toBlob`
- `OffscreenCanvas.prototype.convertToBlob` (if present)

## Implementation

### 1. Generate a session noise seed
In `session-manager.ts`, generate a stable seed per userId (can just use first 8 chars of userId hash).

### 2. Pass the seed to the page init script
Either embed it directly in the injected script string, or pass via `page.addInitScript({ content: script })` where the script string is templated with the seed.

### 3. Patch canvas APIs in the init script (in `stealth.ts`)

```typescript
// Called with a seed string like "a3f9b2c1"
export function canvasNoiseScript(seed: string): string {
  return `
    (function() {
      const seed = "${seed}";
      // Simple seeded PRNG (mulberry32)
      function makeRng(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
          h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        }
        return function() {
          h |= 0; h = h + 0x6D2B79F5 | 0;
          let t = Math.imul(h ^ h >>> 15, 1 | h);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }

      function noisifyImageData(imageData, rng) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          // Flip 1 bit per ~100 pixels, imperceptible but changes the hash
          if (rng() < 0.01) {
            data[i] = data[i] ^ 1;
          }
        }
        return imageData;
      }

      const rng = makeRng(seed);

      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = origGetImageData.apply(this, args);
        return noisifyImageData(imageData, makeRng(seed + this.canvas.width + this.canvas.height));
      };

      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          noisifyImageData(imageData, makeRng(seed + this.width + this.height));
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.apply(this, args);
      };

      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          noisifyImageData(imageData, makeRng(seed + this.width + this.height));
          ctx.putImageData(imageData, 0, 0);
        }
        return origToBlob.call(this, callback, ...args);
      };
    })();
  `;
}
```

### 4. Apply it in `applyStealthToPage`
```typescript
export async function applyStealthToPage(page: Page, sessionId?: string): Promise<void> {
  await page.addInitScript(STEALTH_SCRIPT);
  if (sessionId) {
    const seed = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    await page.addInitScript({ content: canvasNoiseScript(seed) });
  }
}
```

### 5. Thread sessionId through callers
`session-manager.ts` and `iframer.ts` both call `applyStealthToPage` — pass `userId` as the seed.

## Testing
Use https://browserleaks.com/canvas or https://bot.incolumitas.com/ — run two sessions and confirm the canvas hash differs between them.

## Files to touch
- `src/lib/browser/stealth.ts` — add `canvasNoiseScript()`, update `applyStealthToPage` signature
- `src/lib/browser/session-manager.ts` — pass `userId` to `applyStealthToPage`
- `src/lib/iframer.ts` — pass `userId` to `applyStealthToPage`
