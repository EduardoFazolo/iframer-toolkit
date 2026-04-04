import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

describe("createLogger", () => {
  const originalLogLevel = process.env.LOG_LEVEL;
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  it("logs info messages by default", async () => {
    delete process.env.LOG_LEVEL;
    // Re-import to pick up env change
    const { createLogger } = await import("../../src/lib/logger");
    const log = createLogger("test");
    const logMock = mock(() => {});
    console.log = logMock;
    log.info("hello");
    expect(logMock).toHaveBeenCalledWith("[test]", "hello");
  });

  it("logs error messages by default", async () => {
    delete process.env.LOG_LEVEL;
    const { createLogger } = await import("../../src/lib/logger");
    const log = createLogger("test");
    const errorMock = mock(() => {});
    console.error = errorMock;
    log.error("bad");
    expect(errorMock).toHaveBeenCalledWith("[test]", "bad");
  });

  it("uses tag as prefix", async () => {
    delete process.env.LOG_LEVEL;
    const { createLogger } = await import("../../src/lib/logger");
    const log = createLogger("my-module");
    const logMock = mock(() => {});
    console.log = logMock;
    log.info("msg");
    expect(logMock).toHaveBeenCalledWith("[my-module]", "msg");
  });
});
