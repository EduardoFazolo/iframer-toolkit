import { test, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
// The in-page interpreter the extension injects. Pure DOM logic — we exercise it
// against a real (happy-dom) DOM so its behavior is verified without a browser.
import { iframerRunStep } from "../../extension/interpreter.js";

// ─── DOM harness ────────────────────────────────────────────────────
function setup(html: string) {
  const window = new Window();
  const document = window.document;
  const g = globalThis as Record<string, unknown>;
  g.window = window;
  g.document = document;
  g.Element = window.Element;
  g.HTMLInputElement = window.HTMLInputElement;
  g.HTMLTextAreaElement = window.HTMLTextAreaElement;
  g.MouseEvent = window.MouseEvent;
  g.KeyboardEvent = window.KeyboardEvent;
  g.Event = window.Event;
  g.InputEvent = window.InputEvent || window.Event;
  // happy-dom does no layout: force elements to be "visible".
  (window.Element.prototype as unknown as { getBoundingClientRect: () => object }).getBoundingClientRect =
    () => ({ width: 120, height: 20, top: 0, left: 0, right: 120, bottom: 20 });
  (window.Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  g.getComputedStyle = () => ({ visibility: "visible", display: "block", opacity: "1" });
  document.body.innerHTML = html;
  return { window, document };
}

const SLACK = `
  <input id="filter" role="searchbox" aria-label="Channel or user name" />
  <div id="results" role="listbox">
    <div id="row" role="row">unread messages from people including Berni and others in this workspace</div>
    <div id="berni" role="option">Berni Sanders</div>
    <div id="ana" role="option">Ana Costa</div>
  </div>
  <button id="dms">DMs</button>
  <div id="convo">Berni: hey! are we still on for friday dinner?</div>
`;

beforeEach(() => setup(SLACK));

test("snapshot captures SPA option rows, not just buttons", async () => {
  const r = (await iframerRunStep({ type: "snapshot", maxElements: 50 })) as {
    snapshot: string;
    elementCount: number;
  };
  expect(r.elementCount).toBeGreaterThanOrEqual(4); // filter, row, 2 options, button
  expect(r.snapshot).toContain("Berni Sanders");
  expect(r.snapshot).toContain("option");
});

test("find name matches the tightest clickable row", async () => {
  // Both #row and #berni contain "Berni"; the tightest (shortest name) wins.
  const r = (await iframerRunStep({ type: "find", name: "Berni" })) as {
    ref: string;
    name: string;
    matchCount: number;
  };
  expect(r.ref).toBe("@efind");
  expect(r.matchCount).toBe(2);
  expect(r.name).toBe("Berni Sanders");
  expect(document.querySelector("#berni")!.getAttribute("data-iframer-ref")).toBe("@efind");
});

test("find with role filter narrows results", async () => {
  const r = (await iframerRunStep({ type: "find", name: "Berni", role: "option" })) as { matchCount: number; name: string };
  expect(r.matchCount).toBe(1);
  expect(r.name).toBe("Berni Sanders");
});

test("click resolves an @efind ref and fires a real click", async () => {
  await iframerRunStep({ type: "find", name: "Berni", role: "option" });
  let clicked = false;
  document.querySelector("#berni")!.addEventListener("click", () => (clicked = true));
  const r = (await iframerRunStep({ type: "click", selector: "@efind" })) as { clicked: boolean };
  expect(r.clicked).toBe(true);
  expect(clicked).toBe(true);
});

test("click by name finds + clicks in ONE call (no ref needed)", async () => {
  // This is the live-SPA case: no prior find/ref, click resolves criteria itself.
  let clicked = false;
  document.querySelector("#berni")!.addEventListener("click", () => (clicked = true));
  const r = (await iframerRunStep({ type: "click", name: "Berni", role: "option", exact: false })) as {
    clicked?: boolean;
    __error?: string;
  };
  expect(r.clicked).toBe(true);
  expect(clicked).toBe(true);
});

test("fill by placeholder/name finds the field atomically", async () => {
  const input = document.querySelector("#filter")! as HTMLInputElement;
  const r = (await iframerRunStep({ type: "fill", name: "Channel or user name", value: "berni" })) as {
    filled?: boolean;
  };
  expect(r.filled).toBe(true);
  expect(input.value).toBe("berni");
});

test("fill sets input value and dispatches input event", async () => {
  let inputFired = false;
  const input = document.querySelector("#filter")! as HTMLInputElement;
  input.addEventListener("input", () => (inputFired = true));
  const r = (await iframerRunStep({ type: "fill", selector: "#filter", value: "Berni" })) as { filled: boolean };
  expect(r.filled).toBe(true);
  expect(input.value).toBe("Berni");
  expect(inputFired).toBe(true);
});

test("read returns visible text with no eval (works under strict CSP)", async () => {
  const r = (await iframerRunStep({ type: "read", selector: "#convo" })) as { text: string };
  expect(r.text).toContain("friday dinner");
});

test("read defaults to the whole body", async () => {
  const r = (await iframerRunStep({ type: "read" })) as { text: string };
  expect(r.text).toContain("Berni Sanders");
});

test("keyboard sends key + code + modifiers", async () => {
  const input = document.querySelector("#filter")! as HTMLInputElement;
  input.focus();
  let got: { key?: string; code?: string; meta?: boolean } = {};
  input.addEventListener("keydown", (e) => {
    const ke = e as KeyboardEvent;
    got = { key: ke.key, code: ke.code, meta: ke.metaKey };
  });
  await iframerRunStep({ type: "keyboard", key: "Enter", meta: true });
  expect(got.key).toBe("Enter");
  expect(got.code).toBe("Enter");
  expect(got.meta).toBe(true);
});

test("click on a missing selector returns a clear error", async () => {
  const r = (await iframerRunStep({ type: "click", selector: "@e999" })) as { __error: string };
  expect(r.__error).toContain("No element");
});

test("unknown step type reports unsupported", async () => {
  const r = (await iframerRunStep({ type: "teleport" as unknown as string })) as { __error: string };
  expect(r.__error).toContain("not supported");
});
