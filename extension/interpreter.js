// The in-page step interpreter. This function is serialized and injected into
// the target tab by chrome.scripting.executeScript (so it must be fully
// self-contained — no imports, no closure references). It runs ONE step and
// returns a plain-JSON result. iframer decides WHICH steps to run; this just
// executes them, banner-free, using ordinary DOM APIs.
//
// Exported for the background worker to reference; never bundled as a content
// script on its own.
export function iframerRunStep(step) {
  const REF_ATTR = "data-iframer-ref";

  function visible(el) {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function roleOf(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(t)) return "button";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      return "textbox";
    }
    if (el.isContentEditable) return "textbox";
    return "generic";
  }

  function nameOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    if (el.getAttribute("placeholder")) return el.getAttribute("placeholder").trim();
    if (el.labels && el.labels.length) return el.labels[0].textContent.trim();
    const val = el.value;
    if (typeof val === "string" && val && el.tagName.toLowerCase() === "input") {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (["button", "submit", "reset"].includes(t)) return val.trim();
    }
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.slice(0, 120);
  }

  function interactive() {
    // Broad on purpose: modern SPAs (Slack, Notion, …) render clickable rows as
    // role=option/row/listitem or focusable divs, not <a>/<button>. Visibility
    // filtering keeps the list usable.
    const sel = [
      "a", "button", "input", "textarea", "select", "summary",
      "[role=button]", "[role=link]", "[role=textbox]", "[role=checkbox]",
      "[role=tab]", "[role=menuitem]", "[role=menuitemradio]", "[role=menuitemcheckbox]",
      "[role=option]", "[role=row]", "[role=listitem]", "[role=treeitem]", "[role=gridcell]",
      "[onclick]", "[contenteditable=true]", '[tabindex]:not([tabindex="-1"])',
    ].join(", ");
    const seen = new Set();
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el) || !visible(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function resolve(selector) {
    if (!selector) return null;
    if (selector.startsWith("@e")) {
      return document.querySelector(`[${REF_ATTR}="${selector}"]`);
    }
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function setNativeValue(el, value) {
    const proto = el.tagName.toLowerCase() === "textarea" ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function scrollIntoView(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch {
      /* jsdom/happy-dom or detached — ignore */
    }
  }

  function fireClick(el) {
    scrollIntoView(el);
    // Click the actual visual leaf at the element's center — what a real click
    // hits. SPAs (Slack, Notion) put the onClick on an inner node of a
    // role=treeitem/row container; events only bubble UP, so dispatching on the
    // container misses a handler that lives on a descendant.
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let target = el;
    try {
      const hit = document.elementFromPoint(cx, cy);
      if (hit && (el.contains(hit) || hit === el)) target = hit;
    } catch {
      /* no layout (happy-dom) — use el */
    }
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    ["pointerover", "pointerenter", "pointerdown", "mousedown", "pointerup", "mouseup"].forEach((type) => {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ctor(type, opts));
    });
    // Prefer the native click (fires React onClick once); fall back to a
    // synthetic click event only if unavailable.
    if (typeof target.click === "function") {
      try {
        target.click();
      } catch {
        target.dispatchEvent(new MouseEvent("click", opts));
      }
    } else {
      target.dispatchEvent(new MouseEvent("click", opts));
    }
  }

  // Full keyboard metadata so app handlers that check code/keyCode fire.
  function keyMeta(key) {
    const M = {
      Enter: { code: "Enter", kc: 13 },
      Escape: { code: "Escape", kc: 27 },
      Esc: { code: "Escape", kc: 27 },
      Tab: { code: "Tab", kc: 9 },
      Backspace: { code: "Backspace", kc: 8 },
      Delete: { code: "Delete", kc: 46 },
      ArrowDown: { code: "ArrowDown", kc: 40 },
      ArrowUp: { code: "ArrowUp", kc: 38 },
      ArrowLeft: { code: "ArrowLeft", kc: 37 },
      ArrowRight: { code: "ArrowRight", kc: 39 },
      " ": { code: "Space", kc: 32 },
    };
    if (M[key]) return M[key];
    if (key && key.length === 1) {
      const up = key.toUpperCase();
      const cc = up.charCodeAt(0);
      return { code: /[A-Z]/.test(up) ? "Key" + up : /[0-9]/.test(key) ? "Digit" + key : key, kc: cc };
    }
    return { code: key || "", kc: 0 };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const t = step.type;

  if (t === "snapshot") {
    const els = interactive().slice(0, step.maxElements || 80);
    const lines = [];
    els.forEach((el, i) => {
      const ref = "@e" + (i + 1);
      el.setAttribute(REF_ATTR, ref);
      const name = nameOf(el);
      lines.push(`${ref} ${roleOf(el)}${name ? ` "${name}"` : ""}`);
    });
    return { snapshot: lines.join("\n"), elementCount: els.length };
  }

  if (t === "find") {
    const wantRole = (step.role || "").toLowerCase();
    const wantName = (step.name || step.text || "").toLowerCase();
    const wantPlaceholder = (step.placeholder || "").toLowerCase();
    const exact = !!step.exact;
    let matches = interactive().filter((el) => {
      if (wantRole && roleOf(el).toLowerCase() !== wantRole) return false;
      const nm = nameOf(el).toLowerCase();
      if (wantName) {
        if (exact ? nm !== wantName : !nm.includes(wantName)) return false;
      }
      if (wantPlaceholder) {
        const ph = (el.getAttribute("placeholder") || "").toLowerCase();
        if (exact ? ph !== wantPlaceholder : !ph.includes(wantPlaceholder)) return false;
      }
      return true;
    });
    if (!matches.length) return { ref: null, matchCount: 0 };

    // Prefer the TIGHTEST clickable match: the shortest accessible name that
    // still matches. On nested SPA rows this picks the actual row/link rather
    // than a huge wrapping container.
    if (wantName) {
      matches = matches.slice().sort((a, b) => nameOf(a).length - nameOf(b).length);
    }
    const el = matches[0];
    scrollIntoView(el);
    const ref = "@efind";
    el.setAttribute(REF_ATTR, ref);
    return { ref, role: roleOf(el), name: nameOf(el), matchCount: matches.length };
  }

  if (t === "click" || t === "human-click") {
    const el = resolve(step.selector);
    if (!el) return { __error: `No element for selector: ${step.selector}` };
    fireClick(el);
    return { clicked: true };
  }

  if (t === "right-click") {
    const el = resolve(step.selector);
    if (!el) return { __error: `No element for selector: ${step.selector}` };
    scrollIntoView(el);
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window }));
    return { rightClicked: true };
  }

  if (t === "fill" || t === "human-type" || t === "type" || t === "type-code") {
    const el = resolve(step.selector);
    if (!el) return { __error: `No element for selector: ${step.selector}` };
    el.focus();
    if (el.isContentEditable) {
      // Rich-text editors (Lexical/Draft/ProseMirror) keep their own model and
      // ignore direct textContent writes; execCommand routes through
      // beforeinput/input so the editor state actually updates.
      const sel = window.getSelection && window.getSelection();
      if (sel && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const inserted = document.execCommand && document.execCommand("insertText", false, step.value);
      if (!inserted) {
        el.textContent = step.value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: step.value }));
      }
    } else {
      setNativeValue(el, step.value);
    }
    return { filled: true };
  }

  if (t === "keyboard") {
    const target = document.activeElement || document.body;
    const m = keyMeta(step.key);
    const opts = {
      key: step.key,
      code: m.code,
      keyCode: m.kc,
      which: m.kc,
      bubbles: true,
      cancelable: true,
      metaKey: !!step.meta,
      ctrlKey: !!step.ctrl,
      shiftKey: !!step.shift,
      altKey: !!step.alt,
    };
    target.dispatchEvent(new KeyboardEvent("keydown", opts));
    target.dispatchEvent(new KeyboardEvent("keyup", opts));
    return { pressed: step.key };
  }

  if (t === "scroll") {
    const el = step.selector ? resolve(step.selector) : null;
    const dy = typeof step.deltaY === "number" ? step.deltaY : 500;
    if (el) el.scrollBy ? el.scrollBy(0, dy) : (el.scrollTop += dy);
    else window.scrollBy(0, dy);
    return { scrolled: true };
  }

  if (t === "wait-for") {
    const deadline = Date.now() + (step.timeout || 10000);
    return (async () => {
      while (Date.now() < deadline) {
        if (resolve(step.selector)) return { found: true };
        await sleep(150);
      }
      return { __error: `Timed out waiting for: ${step.selector}` };
    })();
  }

  if (t === "read") {
    // Non-eval DOM read — works even on strict-CSP pages (Slack, etc.) because
    // it only touches the DOM, never evaluates a string. Returns visible text.
    const el = step.selector ? resolve(step.selector) : document.body;
    if (!el) return { __error: `No element for selector: ${step.selector}` };
    const raw = (el.innerText != null ? el.innerText : el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    const max = step.maxChars || 20000;
    return { text: raw.slice(0, max), truncated: raw.length > max };
  }

  if (t === "extract" || t === "evaluate") {
    try {
      // Runs in MAIN world (see background). eval is blocked by strict page CSP
      // (e.g. Slack). For DOM reads, use the `read` step instead — it needs no
      // eval and works everywhere.
      // eslint-disable-next-line no-eval
      const out = (0, eval)(step.expression);
      return { value: out === undefined ? null : out };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const cspHint = /content security policy|unsafe-eval/i.test(msg)
        ? " This page's CSP blocks eval in extension mode — use a `read` step (DOM text, no eval) or `snapshot`/`find` instead."
        : "";
      return { __error: `extract failed: ${msg}${cspHint}` };
    }
  }

  return { __error: `Step type '${t}' is not supported in extension mode yet.` };
}
