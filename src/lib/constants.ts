// ─── Human Simulation Timing (ms) ──────────────────────────────────

export const TIMING = {
  /** Mouse move settle delay */
  MOUSE_MOVE: [50, 200] as const,
  /** Click down→up delay */
  CLICK_HOLD: [30, 90] as const,
  /** Post-click settle */
  POST_CLICK: [100, 300] as const,
  /** Per-character typing delay */
  CHAR_DELAY: [30, 150] as const,
  /** Occasional word-boundary pause */
  WORD_PAUSE: [200, 500] as const,
  /** Pre-action move range */
  IDLE_MOUSE_X: [100, 400] as const,
  IDLE_MOUSE_Y: [100, 300] as const,
  /** Pre-checkbox random move */
  PRE_CHECKBOX_X: [200, 600] as const,
  PRE_CHECKBOX_Y: [150, 400] as const,
  /** Pause after moving to checkbox area */
  PRE_CHECKBOX_WAIT: [300, 800] as const,
  /** Wait after clicking reCAPTCHA checkbox */
  POST_CHECKBOX_WAIT: 2500,
  /** Wait after clicking verify button */
  POST_VERIFY_WAIT: 2000,
  /** Wait between clicking captcha tiles */
  TILE_CLICK_DELAY: [200, 500] as const,
  /** Time to wait for reCAPTCHA tile images to settle */
  TILE_SETTLE: 800,
  /** Delay before captcha auto-detection */
  CAPTCHA_DETECT_WAIT: 1500,
  /** Post-login navigation settle */
  POST_LOGIN_WAIT: 1500,
  /** Post-submit form delay */
  POST_SUBMIT_WAIT: 500,
  /** Post-submit form extended wait */
  POST_SUBMIT_EXTENDED: 2000,
  /** Delay before navigating (human hesitation) */
  PRE_NAVIGATE: [300, 700] as const,
  /** Per-digit input delay base */
  DIGIT_DELAY_BASE: 80,
  DIGIT_DELAY_RANGE: 120,
  /** Post-click in forms */
  POST_FORM_CLICK: 200,
  /** Post-TOTP entry wait */
  POST_TOTP_WAIT: 300,
  /** Post-cookies inject wait */
  POST_COOKIES_WAIT: 300,
  /** Scroll step delay */
  SCROLL_DELAY: 150,
  /** Stale state check interval */
  STALE_CHECK_INTERVAL: 2000,
} as const;

// ─── reCAPTCHA / hCaptcha Grid Layout ──────────────────────────────

export const CAPTCHA_GRID = {
  /** Pixels from bframe top to grid start (reCAPTCHA) */
  RECAPTCHA_HEADER_HEIGHT: 112,
  /** Pixels from bframe top to grid start (hCaptcha) — slightly different */
  HCAPTCHA_HEADER_HEIGHT: 110,
  /** Default tile size when bframeBox is unavailable */
  DEFAULT_TILE_SIZE: 125,
  /** Grid padding (left+right total) */
  GRID_PADDING: 24,
  /** Grid left margin */
  GRID_MARGIN: 12,
  /** Verify button offset from bframe bottom */
  VERIFY_BTN_BOTTOM_OFFSET: 35,
  /** Verify button offset from bframe right */
  VERIFY_BTN_RIGHT_OFFSET: 60,
} as const;

// ─── Screen Defaults ───────────────────────────────────────────────

export const SCREEN_DEFAULTS = {
  WIDTH: 1920,
  HEIGHT: 1080,
  AVAIL_HEIGHT: 1040,
  DPR: 1.25,
} as const;

// ─── Detection Thresholds ──────────────────────────────────────────

export const THRESHOLDS = {
  /** Minimum character change to consider page "changed" */
  STALE_CHAR_CHANGE: 100,
  /** Minimum percentage change to consider page "changed" */
  STALE_PERCENT_CHANGE: 0.05,
  /** Minimum body text length to not be considered "empty" */
  MIN_BODY_TEXT: 200,
  /** Maximum response text length to capture */
  MAX_RESPONSE_TEXT: 100_000,
} as const;

// ─── VNC / Session ─────────────────────────────────────────────────

export const VNC = {
  BASE_PORT: 5900,
  WS_BASE_PORT: 6080,
  SOCKET_TIMEOUT: 5000,
  SOCKET_CHECK_INTERVAL: 100,
  POST_START_DELAY: 500,
  POST_STOP_DELAY: 1000,
} as const;

// ─── Timeouts ──────────────────────────────────────────────────────

export const TIMEOUTS = {
  DEFAULT_STALE: 20_000,
  NAVIGATION: 60_000,
  SELECTOR_WAIT: 10_000,
  TOTP_INPUT: 5_000,
  API_REQUEST: 180_000,
  HEALTH_CHECK: 3000,
  CHALLENGE_FRAME_WAIT: 5_000,
} as const;

// ─── Chrome Version ────────────────────────────────────────────────

export const CHROME_MIN_VERSION = 130;

// ─── AI Model ──────────────────────────────────────────────────────

export const CAPTCHA_SOLVER_MODEL = "claude-haiku-4-5-20251001";
