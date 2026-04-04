import { describe, it, expect } from "bun:test";
import { TIMING, CAPTCHA_GRID, SCREEN_DEFAULTS, THRESHOLDS, TIMEOUTS } from "../../src/lib/constants";

describe("constants", () => {
  describe("TIMING ranges", () => {
    const ranges: [string, readonly [number, number]][] = [
      ["MOUSE_MOVE", TIMING.MOUSE_MOVE],
      ["CLICK_HOLD", TIMING.CLICK_HOLD],
      ["POST_CLICK", TIMING.POST_CLICK],
      ["CHAR_DELAY", TIMING.CHAR_DELAY],
      ["WORD_PAUSE", TIMING.WORD_PAUSE],
      ["TILE_CLICK_DELAY", TIMING.TILE_CLICK_DELAY],
      ["PRE_CHECKBOX_WAIT", TIMING.PRE_CHECKBOX_WAIT],
      ["PRE_NAVIGATE", TIMING.PRE_NAVIGATE],
    ];

    for (const [name, [min, max]] of ranges) {
      it(`${name}: min < max and both positive`, () => {
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThan(min);
      });
    }
  });

  describe("CAPTCHA_GRID", () => {
    it("grid padding is reasonable", () => {
      expect(CAPTCHA_GRID.GRID_PADDING).toBeGreaterThan(0);
      expect(CAPTCHA_GRID.DEFAULT_TILE_SIZE).toBeGreaterThan(50);
    });

    it("header heights are positive", () => {
      expect(CAPTCHA_GRID.RECAPTCHA_HEADER_HEIGHT).toBeGreaterThan(0);
      expect(CAPTCHA_GRID.HCAPTCHA_HEADER_HEIGHT).toBeGreaterThan(0);
    });
  });

  describe("SCREEN_DEFAULTS", () => {
    it("has valid dimensions", () => {
      expect(SCREEN_DEFAULTS.WIDTH).toBeGreaterThan(0);
      expect(SCREEN_DEFAULTS.HEIGHT).toBeGreaterThan(0);
      expect(SCREEN_DEFAULTS.AVAIL_HEIGHT).toBeLessThan(SCREEN_DEFAULTS.HEIGHT);
    });
  });

  describe("THRESHOLDS", () => {
    it("stale percent is between 0 and 1", () => {
      expect(THRESHOLDS.STALE_PERCENT_CHANGE).toBeGreaterThan(0);
      expect(THRESHOLDS.STALE_PERCENT_CHANGE).toBeLessThan(1);
    });
  });

  describe("TIMEOUTS", () => {
    it("navigation > stale > selector", () => {
      expect(TIMEOUTS.NAVIGATION).toBeGreaterThan(TIMEOUTS.DEFAULT_STALE);
      expect(TIMEOUTS.DEFAULT_STALE).toBeGreaterThan(TIMEOUTS.SELECTOR_WAIT);
    });
  });
});
