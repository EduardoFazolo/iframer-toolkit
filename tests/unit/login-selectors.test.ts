import { describe, test, expect } from "bun:test";
import { EMAIL_FIRST_SUBMIT_RE, PASSWORD_SUBMIT_RE } from "../../src/lib/actions/handlers/login/selectors";

// These two regexes are DELIBERATELY different — the email-first flow also
// matches magic-link / code-request buttons ("send code", "email me"), which
// must NOT match on a password page. This test locks that divergence so the
// dedup into findSubmitButton can never silently unify them.

describe("submit-button text patterns", () => {
  test("both match the common login verbs", () => {
    for (const label of ["Log in", "Sign in", "Continue", "Submit", "Next"]) {
      expect(EMAIL_FIRST_SUBMIT_RE.test(label)).toBe(true);
      expect(PASSWORD_SUBMIT_RE.test(label)).toBe(true);
    }
  });

  test("email-first ALSO matches code-request buttons", () => {
    expect(EMAIL_FIRST_SUBMIT_RE.test("Send code")).toBe(true);
    expect(EMAIL_FIRST_SUBMIT_RE.test("Email me a link")).toBe(true);
  });

  test("password pattern does NOT match code-request buttons", () => {
    expect(PASSWORD_SUBMIT_RE.test("Send code")).toBe(false);
    expect(PASSWORD_SUBMIT_RE.test("Email me a link")).toBe(false);
  });
});
