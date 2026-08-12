/** Selectors and text patterns for login form auto-detection.
 *  Centralized so the flows share one source of truth. */

/** Username/email field candidates, most-specific first. Used for both
 *  password-present and email-only (multi-step) flows. */
export const EMAIL_CANDIDATES = [
  'input[type="email"]:not([disabled]):not([readonly])',
  'input[autocomplete="username"]:not([disabled]):not([readonly])',
  'input[autocomplete="email"]:not([disabled]):not([readonly])',
  'input[name*="email" i]:not([disabled]):not([readonly])',
  'input[name*="user" i]:not([disabled]):not([readonly])',
  'input[name*="login" i]:not([disabled]):not([readonly])',
  'input[id*="email" i]:not([disabled]):not([readonly])',
  'input[id*="user" i]:not([disabled]):not([readonly])',
  'input[type="text"]:not([disabled]):not([readonly])',
  'input:not([type]):not([disabled]):not([readonly])',
];

export const PASSWORD_SELECTOR = 'input[type="password"]:not([disabled]):not([readonly])';

export const OTP_SELECTOR =
  'input[autocomplete="one-time-code"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[name*="otp" i]:not([disabled]), input[name*="code" i]:not([disabled]), input[aria-label*="code" i]:not([disabled])';

/** URL heuristic for "are we still on a login page". */
export const LOGIN_URL_RE = /\b(login|signin|sign-in|auth|oauth)\b/i;

// Submit-button text patterns. These are DELIBERATELY DIFFERENT: the email-first
// flow additionally matches "send code"/"email me" (magic-link / code-request
// buttons), which must NOT match on a password page. Keep them distinct — do not
// unify. Anchors below feed findSubmitButton (which searches the closest form).
export const EMAIL_FIRST_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next|send.*code|email.*me)\b/i;
export const PASSWORD_SUBMIT_RE = /\b(log\s*in|sign\s*in|continue|submit|enter|next)\b/i;

export const EMAIL_FORM_ANCHOR = 'input[type="email"], input[name*="email" i], input[type="text"]';
export const PASSWORD_FORM_ANCHOR = PASSWORD_SELECTOR;
