// Trusted input via chrome.debugger (CDP Input domain).
//
// Synthetic DOM events (dispatchEvent) carry isTrusted:false and complex SPAs
// like Slack ignore them for navigation. CDP Input.dispatchMouseEvent /
// dispatchKeyEvent produce REAL, trusted OS-level input the page cannot tell
// from a human — the same mechanism Playwright/Puppeteer use. Cost: Chrome shows
// the "iframer started debugging this browser" banner while attached.
//
// Attach once per pipeline (one banner), run all trusted steps, detach at the end.

function sendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params || {}, (res) => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message));
      else resolve(res);
    });
  });
}

export const cdp = {
  async attach(tabId) {
    const target = { tabId };
    await chrome.debugger.attach(target, "1.3");
    return target;
  },

  async detach(target) {
    try {
      await chrome.debugger.detach(target);
    } catch {
      /* already gone */
    }
  },

  /** Trusted left-click at viewport CSS coords (x,y). */
  async click(target, x, y) {
    await sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
    });
    await sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
    });
  },

  async rightClick(target, x, y) {
    await sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "right", buttons: 2, clickCount: 1,
    });
    await sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "right", buttons: 0, clickCount: 1,
    });
  },

  /** Trusted key press with modifiers. */
  async key(target, key, mods = {}) {
    const META = {
      Enter: { code: "Enter", vk: 13, text: "\r" },
      Escape: { code: "Escape", vk: 27 },
      Tab: { code: "Tab", vk: 9 },
      Backspace: { code: "Backspace", vk: 8 },
      Delete: { code: "Delete", vk: 46 },
      ArrowDown: { code: "ArrowDown", vk: 40 },
      ArrowUp: { code: "ArrowUp", vk: 38 },
      ArrowLeft: { code: "ArrowLeft", vk: 37 },
      ArrowRight: { code: "ArrowRight", vk: 39 },
      " ": { code: "Space", vk: 32, text: " " },
    };
    let m = META[key];
    if (!m && key && key.length === 1) {
      const up = key.toUpperCase();
      m = { code: /[A-Z]/.test(up) ? "Key" + up : /[0-9]/.test(key) ? "Digit" + key : key, vk: up.charCodeAt(0), text: key };
    }
    m = m || { code: key, vk: 0 };
    let modifiers = 0;
    if (mods.alt) modifiers |= 1;
    if (mods.ctrl) modifiers |= 2;
    if (mods.meta) modifiers |= 4;
    if (mods.shift) modifiers |= 8;
    const base = { key, code: m.code, windowsVirtualKeyCode: m.vk, nativeVirtualKeyCode: m.vk, modifiers };
    await sendCommand(target, "Input.dispatchKeyEvent", {
      type: m.text ? "keyDown" : "rawKeyDown",
      ...base,
      ...(m.text ? { text: m.text } : {}),
    });
    await sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
  },

  /** Type a string as trusted input into the focused element. */
  async typeText(target, text) {
    await sendCommand(target, "Input.insertText", { text });
  },
};
