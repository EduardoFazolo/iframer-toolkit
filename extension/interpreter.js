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
    const sel =
      "a[href], button, input, textarea, select, [role=button], [role=link], " +
      "[role=textbox], [role=checkbox], [role=tab], [role=menuitem], [onclick], [contenteditable=true]";
    return Array.from(document.querySelectorAll(sel)).filter(visible);
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

  function fireClick(el) {
    el.scrollIntoView({ block: "center", inline: "center" });
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
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
    const matches = interactive().filter((el) => {
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
    const el = matches[0];
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
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const inserted = document.execCommand("insertText", false, step.value);
      if (!inserted) {
        el.textContent = step.value;
        el.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: step.value })
        );
      }
    } else {
      setNativeValue(el, step.value);
    }
    return { filled: true };
  }

  if (t === "keyboard") {
    const target = document.activeElement || document.body;
    ["keydown", "keyup"].forEach((type) => {
      target.dispatchEvent(new KeyboardEvent(type, { key: step.key, bubbles: true }));
    });
    return { pressed: step.key };
  }

  if (t === "scroll") {
    window.scrollBy(0, typeof step.deltaY === "number" ? step.deltaY : 500);
    return { scrolled: true };
  }

  if (t === "wait-for") {
    // Poll for the selector within the step timeout (default 10s).
    const deadline = Date.now() + (step.timeout || 10000);
    return (async () => {
      while (Date.now() < deadline) {
        if (resolve(step.selector)) return { found: true };
        await sleep(150);
      }
      return { __error: `Timed out waiting for: ${step.selector}` };
    })();
  }

  if (t === "extract" || t === "evaluate") {
    try {
      // Runs in MAIN world (see background). eval may be blocked by strict page
      // CSP; that's an accepted banner-free limitation.
      // eslint-disable-next-line no-eval
      const out = (0, eval)(step.expression);
      return { value: out === undefined ? null : out };
    } catch (e) {
      return { __error: `extract failed: ${e && e.message ? e.message : String(e)}` };
    }
  }

  return { __error: `Step type '${t}' is not supported in extension mode yet.` };
}
