# AudioContext Fingerprint Noise

## Problem
AudioContext fingerprinting works by processing a signal through `OscillatorNode` → `AnalyserNode` → `DynamicsCompressorNode` and reading the output samples. Subtle floating-point differences in audio processing (per CPU/OS/audio driver) produce a unique hash.

In a Docker container, audio processing is done in software (no hardware audio). All containers on the same host produce an identical AudioContext hash — another strong clustering signal.

## Solution
Inject per-session deterministic noise into `AnalyserNode.getFloatFrequencyData()` and `AnalyserNode.getByteFrequencyData()`. Same approach as canvas noise: seed the noise with the session ID so the same session always produces the same hash.

## Implementation

Add to `canvasNoiseScript` (or create a separate `audioNoiseScript`) in `stealth.ts`:

```js
(function() {
  const seed = "${seed}";

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

  const rng = makeRng(seed + 'audio');

  const _getFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
  AnalyserNode.prototype.getFloatFrequencyData = function(array) {
    _getFloatFrequencyData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      if (array[i] !== -Infinity) {
        array[i] += rng() * 0.0001; // imperceptible noise
      }
    }
  };

  const _getByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
  AnalyserNode.prototype.getByteFrequencyData = function(array) {
    _getByteFrequencyData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.max(0, Math.min(255, array[i] + (rng() < 0.01 ? 1 : 0)));
    }
  };

  // Also patch getFloatTimeDomainData
  const _getFloatTimeDomainData = AnalyserNode.prototype.getFloatTimeDomainData;
  AnalyserNode.prototype.getFloatTimeDomainData = function(array) {
    _getFloatTimeDomainData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      array[i] += rng() * 0.00001;
    }
  };
})();
```

## Notes
- The noise magnitude (0.0001 for float data) is imperceptible to human ears but changes the fingerprint hash
- Must be seeded per session (not random) so the same session returns the same hash across multiple probes
- Should be combined with canvas noise in the same seeded init script

## Testing
Use https://browserleaks.com/audio — run two separate sessions and confirm different hashes.

## Files to touch
- `src/lib/browser/stealth.ts` — add audio noise to the session-specific init script (alongside canvas noise)
