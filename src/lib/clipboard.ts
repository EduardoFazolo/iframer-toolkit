import { spawn } from "child_process";

/**
 * OS clipboard read/write. iframer runs on the same machine as the user's
 * Chrome, so this IS the clipboard Chrome pastes from. Used by the `clipboard`
 * MCP tool and the `paste` pipeline step.
 */

function platformTools(mode: "read" | "write"): string[][] {
  if (process.platform === "darwin") return [[mode === "read" ? "pbpaste" : "pbcopy"]];
  if (mode === "read") return [["wl-paste", "-n"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "-b", "-o"]];
  return [["wl-copy"], ["xclip", "-selection", "clipboard", "-i"], ["xsel", "-b", "-i"]];
}

function run(cmd: string[], input?: string): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd[0], cmd.slice(1));
    } catch {
      resolve({ ok: false, out: "", err: `spawn ${cmd[0]} failed` });
      return;
    }
    let out = "";
    let errOut = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (errOut += d));
    child.on("error", (e) => resolve({ ok: false, out: "", err: e.message }));
    child.on("close", (code) => resolve({ ok: code === 0, out, err: errOut }));
    if (input !== undefined) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}

export async function clipboardWrite(text: string): Promise<void> {
  const tools = platformTools("write");
  for (const cmd of tools) {
    if ((await run(cmd, text)).ok) return;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t) => t[0]).join(", ")}).`);
}

export async function clipboardRead(): Promise<string> {
  const tools = platformTools("read");
  let lastErr = "";
  for (const cmd of tools) {
    const r = await run(cmd);
    if (r.ok) return r.out;
    lastErr = r.err;
  }
  throw new Error(`No working clipboard tool found (${tools.map((t) => t[0]).join(", ")}). ${lastErr}`);
}
