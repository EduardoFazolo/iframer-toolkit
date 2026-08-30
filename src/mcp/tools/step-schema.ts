import { z } from "zod";

// NOTE ON TOKEN BUDGET: this schema is serialized into EVERY conversation for
// BOTH `execute` and (loosely) `reverse-engineer`. Descriptions here are paid
// for by every user on every chat — keep them one-line unless the step is
// genuinely error-prone without the teaching (fill, human-type). Situational
// manuals (captcha workflow, code-gen layout) are injected into tool RESULTS
// at the moment they're needed instead — see src/lib/format-result.ts.

export const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string(), waitUntil: z.string().optional() }),
  z.object({ type: z.literal("click"), selector: z.string() }),
  z.object({ type: z.literal("fill"), selector: z.string(), value: z.string().describe("Sets an input/textarea's value. Framework-aware: fires the React-safe native setter + input/change/blur, so controlled forms (React, react-hook-form, Formik, Vue) register the value AND mark the field touched. This is the fix for 'I filled the field but submit says it's still empty' — always use fill for form fields, not evaluate.") }),
  z.object({ type: z.literal("human-click"), selector: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  z.object({ type: z.literal("right-click"), selector: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  z.object({ type: z.literal("human-type"), selector: z.string(), value: z.string(), skipClick: z.boolean().optional().describe("Skip the click-to-focus and type into the already-focused element. Use for editors that blur on a synthetic click (e.g. Draft.js). Either way, typing aborts safely if the target isn't actually focused."), speed: z.enum(["slow", "normal", "fast"]).optional().describe("Typing speed. 'normal' (~130ms/char, realistic, default), 'fast' (~45ms/char) for long non-sensitive text, 'slow' for extra realism.") }),
  z.object({ type: z.literal("evaluate"), expression: z.string() }),
  z.object({ type: z.literal("extract"), expression: z.string() }),
  z.object({ type: z.literal("wait"), ms: z.number() }),
  z.object({ type: z.literal("wait-for"), selector: z.string(), timeout: z.number().optional() }),
  z.object({ type: z.literal("scroll"), deltaY: z.number().optional(), selector: z.string().optional().describe("Scroll within this element instead of the window"), human: z.boolean().optional().describe("Real eased wheel events instead of an instant jump (slower, less bot-obvious)") }),
  z.object({ type: z.literal("keyboard"), key: z.string(), meta: z.boolean().optional(), ctrl: z.boolean().optional(), shift: z.boolean().optional(), alt: z.boolean().optional() }),
  z.object({ type: z.literal("read"), selector: z.string().optional().describe("Element to read text from (CSS or @e ref); omit for the whole body"), maxChars: z.number().optional().describe("Cap returned text length (default 6000)") }),
  z.object({ type: z.literal("upload"), selector: z.string().describe("The <input type=file> (CSS, @e ref, or @a anchor)"), files: z.array(z.string()).describe("Absolute local file path(s) on this machine") }),
  z.object({ type: z.literal("paste"), selector: z.string().optional().describe("Field to paste the OS clipboard into; omit for the focused element. Reliable via CDP insertText where a ⌘V keyboard step isn't.") }),
  z.object({ type: z.literal("download"), url: z.string().describe("File URL — fetched with the browser's cookies (auth'd downloads work), written to disk server-side, no Save-As dialog"), path: z.string().optional().describe("Absolute save path (default: ~/.iframer/downloads/<name>)") }),
  z.object({ type: z.literal("type-code"), value: z.string(), selector: z.string().optional() }),
  z.object({ type: z.literal("login"), domain: z.string(), usernameSelector: z.string().optional(), passwordSelector: z.string().optional(), submitSelector: z.string().optional(), totpSelector: z.string().optional() }),
  z.object({ type: z.literal("solve-captcha") }),
  z.object({ type: z.literal("screenshot"), annotate: z.boolean().optional().describe("Overlay numbered badges on interactive elements; returns @e refs") }),
  z.object({ type: z.literal("snapshot"), interactiveOnly: z.boolean().optional().describe("Only interactive elements (default: true)"), maxElements: z.number().optional().describe("Max elements (default: 80)") }),
  z.object({ type: z.literal("find"), role: z.string().optional().describe("ARIA role: button, link, textbox…"), name: z.string().optional().describe("Accessible name / aria-label"), text: z.string().optional().describe("Visible text content"), placeholder: z.string().optional(), label: z.string().optional(), exact: z.boolean().optional().describe("Exact match vs substring (default: substring)") }),
  // Captcha interaction, collapsed to one step. The full workflow manual is
  // injected into the execute RESULT whenever a captcha blocks a run.
  z.object({ type: z.literal("recaptcha"), action: z.enum(["info", "click", "select", "verify", "solve", "answer"]).describe("Captcha interaction (manual arrives in the result when a captcha blocks a run): info=state+grid screenshot, click=checkbox, answer=select tiles+verify+recheck, select/verify=manual control, solve=auto vision solve"), tiles: z.array(z.number()).optional().describe("Tile numbers for select/answer") }),
]);

/** Wire-format translation: the MCP schema exposes ONE `recaptcha` step, but
 *  the server/CLI pipeline API keeps the original `recaptcha-*` step types
 *  (stable for existing pipelines and CLI users). Translate before POSTing.
 *  Returns PipelineStep[] — after translation every step is wire-format. */
export function normalizeSteps(steps: ReadonlyArray<Record<string, unknown>>): import("../../lib/types").PipelineStep[] {
  return (steps || []).map((s) => {
    if (s && s.type === "recaptcha") {
      const { action, ...rest } = s as { action?: string; [k: string]: unknown };
      return { ...rest, type: `recaptcha-${action || "info"}` };
    }
    return s;
  }) as unknown as import("../../lib/types").PipelineStep[];
}
