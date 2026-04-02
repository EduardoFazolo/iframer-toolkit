import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import { launchHeadful } from "./launcher";
import { stealthContextOptions, buildStealthScript } from "./stealth";
import { generateWindowsFingerprint } from "./fingerprint";
import type { Browser, BrowserContext, Page } from "patchright";

// Map from context → per-session stealth script (fingerprint-parameterized)
export const contextStealthScripts = new Map<BrowserContext, string>();

const BASE_DISPLAY = parseInt(process.env.VNC_BASE_DISPLAY || "99", 10);
const MAX_SESSIONS = parseInt(process.env.VNC_MAX_SESSIONS || "20", 10);
const SESSION_TIMEOUT = parseInt(process.env.VNC_SESSION_TIMEOUT_MS || "300000", 10);

export interface Session {
  displayNum: number;
  vncPort: number;
  wsPort: number;
  xvfb: ChildProcess;
  x11vnc: ChildProcess;
  websockify: ChildProcess;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: Date;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Session>();
const usedDisplays = new Set<number>();

function allocateDisplay(): number {
  for (let i = 0; i < MAX_SESSIONS; i++) {
    const num = BASE_DISPLAY + i;
    if (!usedDisplays.has(num)) {
      usedDisplays.add(num);
      return num;
    }
  }
  throw new Error("No available displays. Max concurrent sessions reached.");
}

function freeDisplay(num: number): void {
  usedDisplays.delete(num);
}

function waitForSocket(displayNum: number, timeoutMs: number = 5000): Promise<void> {
  const socketPath = `/tmp/.X11-unix/X${displayNum}`;
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(socketPath)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`Xvfb socket not ready after ${timeoutMs}ms`));
      setTimeout(check, 100);
    };
    check();
  });
}

function killProcess(proc: ChildProcess | null): void {
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
}

export async function startSession(userId: string): Promise<Session> {
  if (sessions.has(userId)) {
    return sessions.get(userId)!;
  }

  const displayNum = allocateDisplay();
  const vncPort = 5900 + displayNum;
  const wsPort = 6080 + (displayNum - BASE_DISPLAY);

  const xvfb = spawn("Xvfb", [`:${displayNum}`, "-screen", "0", "1920x1080x24", "-ac"], {
    stdio: "ignore",
  });

  await waitForSocket(displayNum);

  const x11vnc = spawn(
    "x11vnc",
    ["-display", `:${displayNum}`, "-nopw", "-listen", "localhost", "-rfbport", String(vncPort), "-shared", "-forever"],
    { stdio: "ignore" }
  );

  const noVncPath = fs.existsSync("/usr/share/novnc") ? "/usr/share/novnc" : "/usr/share/noVNC";
  const websockify = spawn("websockify", ["--web", noVncPath, String(wsPort), `localhost:${vncPort}`], {
    stdio: "ignore",
  });

  await new Promise((r) => setTimeout(r, 500));

  const browser = await launchHeadful(displayNum);
  const fingerprint = generateWindowsFingerprint();
  const ctxOpts = stealthContextOptions({}, userId, fingerprint);
  const context = await browser.newContext(ctxOpts);
  const stealthScript = buildStealthScript(fingerprint);
  contextStealthScripts.set(context, stealthScript);
  const page = await context.newPage();
  console.log(`[session] fingerprint: ${fingerprint.userAgent.slice(0, 60)}... DPR=${fingerprint.deviceScaleFactor} screen=${fingerprint.screenWidth}x${fingerprint.screenHeight}`);

  const session: Session = {
    displayNum,
    vncPort,
    wsPort,
    xvfb,
    x11vnc,
    websockify,
    browser,
    context,
    page,
    createdAt: new Date(),
    timeoutTimer: null,
  };

  session.timeoutTimer = setTimeout(() => stopSession(userId), SESSION_TIMEOUT);

  sessions.set(userId, session);
  return session;
}

export function resetTimeout(userId: string): void {
  const session = sessions.get(userId);
  if (session) {
    clearTimeout(session.timeoutTimer!);
    session.timeoutTimer = setTimeout(() => stopSession(userId), SESSION_TIMEOUT);
  }
}

export function getSession(userId: string): Session | null {
  return sessions.get(userId) || null;
}

export async function stopSession(userId: string): Promise<any | null> {
  const session = sessions.get(userId);
  if (!session) return null;

  clearTimeout(session.timeoutTimer!);

  let sessionData = null;
  try {
    const { extractSession } = await import("../session/persistence");
    sessionData = await extractSession(session.context, session.page);
  } catch {}

  contextStealthScripts.delete(session.context);
  try {
    await session.context.close();
  } catch {}
  try {
    await session.browser.close();
  } catch {}

  killProcess(session.websockify);
  killProcess(session.x11vnc);
  killProcess(session.xvfb);

  await new Promise((r) => setTimeout(r, 1000));
  try {
    fs.unlinkSync(`/tmp/.X11-unix/X${session.displayNum}`);
  } catch {}

  freeDisplay(session.displayNum);
  sessions.delete(userId);

  return sessionData;
}

export async function cleanupAllSessions(): Promise<void> {
  const userIds = [...sessions.keys()];
  await Promise.all(userIds.map((id) => stopSession(id)));
}
