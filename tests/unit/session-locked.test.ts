import { describe, expect, test } from "bun:test";
import { storeLocked } from "../../src/lib/kit/session-env";

/**
 * On Windows a login done in a T3 Code tab lands in a cookie store the running
 * browser holds open with an exclusive lock, so it can't be exported. The CLI
 * uses storeLocked() on the "where we looked" strings to decide whether to
 * switch to in-page replay instead of dead-ending with "log in again".
 */
describe("storeLocked", () => {
  test("flags the Windows EBUSY / 'resource busy or locked' markers", () => {
    expect(storeLocked("T3 Code (t3code-v2) [unreadable: EBUSY: resource busy or locked, open 'C:\\...']")).toBe(true);
    expect(storeLocked("Chrome (Default) [unreadable: EBUSY: resource busy or locked, copyfile 'C:\\...']")).toBe(true);
    expect(storeLocked("Edge (Default) [unreadable: EPERM: operation not permitted]")).toBe(true);
    expect(storeLocked("Brave [unreadable: EACCES: permission denied]")).toBe(true);
  });

  test("does not flag readable stores or unrelated unreadable reasons", () => {
    expect(storeLocked("T3 Code tab (t3code-preview-abc)")).toBe(false);
    expect(storeLocked("Chrome (Profile 11) [unreadable: cookies are encrypted and the Local State key could not be unwrapped]")).toBe(false);
    expect(storeLocked("Chrome (Guest Profile)")).toBe(false);
  });
});
