import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { WebSocket } from "ws";
import { getPairingTokens } from "../../src/lib/auth/crypto";
import { extensionBridge } from "../../src/lib/extension/bridge";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const setup = require("../../src/lib/extension/native-host-setup.cjs");

const HOST_SRC = path.join(import.meta.dir, "..", "..", "extension", "native-host.cjs");

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "iframer-pairing-"));
}

/** Install the host into a temp data dir the way the CLI does, and return the wrapper. */
function installHost(dataDir: string): string {
  const hostScript = path.join(dataDir, "extension-token-host.cjs");
  fs.copyFileSync(HOST_SRC, hostScript);
  const wrapper = path.join(dataDir, "extension-token-host.sh");
  fs.writeFileSync(wrapper, setup.posixWrapper({ execPath: process.execPath, hostScript, dataDir }), { mode: 0o755 });
  return wrapper;
}

function healthServer(port = 0): Promise<http.Server> {
  return new Promise((resolve) => {
    const srv = http.createServer((_req, res) => res.end(JSON.stringify({ ok: true })));
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

function portOf(srv: http.Server | net.Server): number {
  return (srv.address() as net.AddressInfo).port;
}

function deadPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = portOf(srv);
      srv.close(() => resolve(port));
    });
  });
}

describe("Windows host wrapper", () => {
  const home = "C:\\Users\\João Silva";
  const wrapper = (execPath: string, dataDir?: string) => setup.windowsWrapper({ execPath, homeDir: home, dataDir });

  test("uses CRLF line endings, which cmd.exe needs", () => {
    expect(wrapper("C:\\Program Files\\nodejs\\node.exe").split("\r\n").length).toBeGreaterThan(3);
    expect(wrapper("C:\\Program Files\\nodejs\\node.exe").replace(/\r\n/g, "")).not.toContain("\n");
  });

  test("keeps a non-ASCII home folder out of the file", () => {
    const bat = wrapper(`${home}\\.vite-plus\\node.exe`);
    expect(bat).not.toContain("João");
    expect(bat).toContain('set "NODE_BIN=%USERPROFILE%\\.vite-plus\\node.exe"');
  });

  test("finds the host script next to itself", () => {
    expect(wrapper("C:\\node\\node.exe")).toContain('"%NODE_BIN%" "%~dp0extension-token-host.cjs"');
  });

  test("falls back to node on PATH if the pinned runtime moved", () => {
    expect(wrapper("C:\\node\\node.exe")).toContain('if not exist "%NODE_BIN%" set "NODE_BIN=node"');
  });

  test("escapes a literal % in a path", () => {
    expect(wrapper("C:\\100%\\node.exe")).toContain('set "NODE_BIN=C:\\100%%\\node.exe"');
  });

  test("pins a custom data dir, and only when there is one", () => {
    expect(wrapper("C:\\node\\node.exe")).not.toContain("IFRAMER_DATA_DIR");
    expect(wrapper("C:\\node\\node.exe", `${home}\\custom`)).toContain('set "IFRAMER_DATA_DIR=%USERPROFILE%\\custom"');
  });

  test("registers under each browser's own HKCU key", () => {
    const keys = setup.WINDOWS_BROWSERS.map((b: { root: string }) => setup.windowsRegistryKey(b.root));
    expect(keys).toContain("HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.iframer.token");
    expect(keys).toContain("HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.iframer.token");
  });

  test("host manifest escapes Windows paths and locks to the extension", () => {
    const parsed = JSON.parse(setup.hostManifest("C:\\Users\\a b\\.iframer\\host.bat", "abc"));
    expect(parsed.path).toBe("C:\\Users\\a b\\.iframer\\host.bat");
    expect(parsed.allowed_origins).toEqual(["chrome-extension://abc/"]);
  });
});

describe("native host get-info", () => {
  const dirs: string[] = [];
  const servers: http.Server[] = [];
  const dir = () => {
    const d = tempDir();
    dirs.push(d);
    fs.writeFileSync(path.join(d, "secret"), "file-secret\n");
    return d;
  };
  // The host reads IFRAMER_SECRET first, and bun also loads one from a local
  // .env. Blank it explicitly so a real secret can never reach these tests.
  const env = { ...process.env, IFRAMER_SECRET: "" };
  afterAll(() => {
    for (const s of servers) s.close();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  test("returns the token and finds a server at the registered port", async () => {
    const d = dir();
    const srv = await healthServer();
    servers.push(srv);
    fs.writeFileSync(path.join(d, "server.json"), JSON.stringify({ pid: 999999, port: portOf(srv) }));
    const res = await setup.testHost(installHost(d), { env });
    expect(res.ok).toBe(true);
    // The pid is dead, but the server answers, so it counts as running.
    expect(res.info).toEqual({ ok: true, token: "file-secret", port: portOf(srv), alive: true });
  });

  test("finds a server inside the port window with no server.json at all", async () => {
    const d = dir();
    let srv: http.Server | null = null;
    for (let p = 3042; p >= 3022 && !srv; p--) {
      srv = await new Promise<http.Server | null>((resolve) => {
        const s = http.createServer((_q, r) => r.end(JSON.stringify({ ok: true })));
        s.once("error", () => resolve(null));
        s.listen(p, "127.0.0.1", () => resolve(s));
      });
    }
    if (!srv) throw new Error("no free port in the extension's window");
    servers.push(srv);
    const res = await setup.testHost(installHost(d), { env });
    expect(res.info.alive).toBe(true);
    expect(res.info.port).toBeGreaterThanOrEqual(3022);
    expect(res.info.port).toBeLessThanOrEqual(3042);
  });

  test("a live pid with nothing listening doesn't send the extension to a dead port", async () => {
    const d = dir();
    const port = await deadPort();
    // process.pid is alive, the way a reused pid looks on Windows.
    fs.writeFileSync(path.join(d, "server.json"), JSON.stringify({ pid: process.pid, port }));
    const res = await setup.testHost(installHost(d), { env });
    expect(res.ok).toBe(true);
    expect(res.info.alive && res.info.port === port).toBe(false);
  });

  test("still answers get-token and rejects unknown commands", async () => {
    const d = dir();
    const child = Bun.spawn([process.execPath, HOST_SRC], {
      env: { ...env, IFRAMER_DATA_DIR: d },
      stdin: "pipe",
      stdout: "pipe",
    });
    const frame = (o: unknown) => {
      const body = Buffer.from(JSON.stringify(o));
      const head = Buffer.alloc(4);
      head.writeUInt32LE(body.length, 0);
      return Buffer.concat([head, body]);
    };
    child.stdin.write(frame({ cmd: "get-token" }));
    child.stdin.write(frame({ cmd: "nope" }));
    child.stdin.end();
    const out = Buffer.from(await new Response(child.stdout).arrayBuffer());
    const first = out.readUInt32LE(0);
    const replies = [
      JSON.parse(out.subarray(4, 4 + first).toString()),
      JSON.parse(out.subarray(8 + first).toString()),
    ];
    expect(replies).toContainEqual({ ok: true, token: "file-secret" });
    expect(replies).toContainEqual({ ok: false, error: "unknown command" });
  });

  test("testHost reports a broken host instead of hanging", async () => {
    const d = dir();
    const wrapper = path.join(d, "broken.sh");
    fs.writeFileSync(wrapper, "#!/bin/sh\necho nope >&2\nexit 3\n", { mode: 0o755 });
    const res = await setup.testHost(wrapper, { timeoutMs: 5000, env });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("nope");
  });
});

describe("bridge pairing", () => {
  const savedEnv = { secret: process.env.IFRAMER_SECRET, dir: process.env.IFRAMER_DATA_DIR };
  let dataDir: string;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    dataDir = tempDir();
    fs.writeFileSync(path.join(dataDir, "secret"), "file-secret\n");
    // The mismatch that used to lock the extension out forever: the server holds
    // one secret in its env while the file (all the host can read) has another.
    process.env.IFRAMER_SECRET = "env-secret";
    process.env.IFRAMER_DATA_DIR = dataDir;
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = portOf(server);
    extensionBridge.attach(server);
  });
  afterAll(() => {
    if (savedEnv.secret === undefined) delete process.env.IFRAMER_SECRET;
    else process.env.IFRAMER_SECRET = savedEnv.secret;
    if (savedEnv.dir === undefined) delete process.env.IFRAMER_DATA_DIR;
    else process.env.IFRAMER_DATA_DIR = savedEnv.dir;
    server.closeAllConnections();
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /** Dial the way the extension does; resolve with the first message or close code. */
  function dial(token: string, onRequest?: (m: { id: number }, s: WebSocket) => void) {
    const sock = new WebSocket(`ws://127.0.0.1:${port}/extension/ws`);
    const outcome = new Promise<{ type?: string; code?: number }>((resolve) => {
      sock.on("open", () => sock.send(JSON.stringify({ type: "auth", token })));
      sock.on("message", (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === "server_info") resolve(m);
        else if (typeof m.id === "number") onRequest?.(m, sock);
      });
      sock.on("close", (code) => resolve({ code }));
    });
    return { sock, outcome };
  }

  test("accepts both the env token and the file token", () => {
    expect(getPairingTokens().sort()).toEqual(["env-secret", "file-secret"]);
  });

  test("a wrong token is closed with 4001", async () => {
    const { outcome } = dial("wrong");
    expect((await outcome).code).toBe(4001);
  });

  test("the first call on a fresh server waits for the extension instead of failing", async () => {
    // Nobody is connected yet: this used to throw "No iframer extension is connected".
    const pendingTabs = extensionBridge.listTabs();
    await new Promise((r) => setTimeout(r, 150));
    const { sock, outcome } = dial("file-secret", (m, s) => {
      s.send(JSON.stringify({ id: m.id, ok: true, result: { tabs: [{ id: 7, title: "t", url: "u" }] } }));
    });
    expect((await outcome).type).toBe("server_info");
    const { tabs } = await pendingTabs;
    expect(tabs.map((t) => t.id)).toEqual([7]);
    sock.close();
  });
});
