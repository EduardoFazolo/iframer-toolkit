/** Browser-mode availability detection.
 *  (Direct-CDP launching was removed as dead code — the daemon owns launching.) */

function hasDisplay(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return !!process.env.DISPLAY;
}

export function checkModeAvailability(): { headless: boolean; binaryHeadful: boolean } {
  return {
    headless: true, // Always available — we can auto-download Chrome
    binaryHeadful: hasDisplay(),
  };
}
