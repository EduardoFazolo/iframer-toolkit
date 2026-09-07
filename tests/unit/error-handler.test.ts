import { describe, it, expect, mock } from "bun:test";
import { AppError, asyncHandler, errorHandler } from "../../src/api/error-handler";
import type { Request, Response, NextFunction } from "express";

function mockRes() {
  const res: Partial<Response> = {
    status: mock(() => res) as any,
    json: mock(() => res) as any,
  };
  return res as Response;
}

describe("errorHandler", () => {
  it("returns statusCode from AppError", () => {
    const res = mockRes();
    const error = new AppError(404, "not found");
    expect(error).toBeInstanceOf(Error);
    errorHandler(error, {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "not found" });
  });

  it("returns 500 for generic Error", () => {
    const res = mockRes();
    errorHandler(new Error("oops"), {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "oops" });
  });

  it("returns 500 for non-Error values", () => {
    const res = mockRes();
    errorHandler("string error", {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Internal server error" });
  });
});

describe("asyncHandler", () => {
  it("calls next with error when handler throws", async () => {
    const next = mock(() => {});
    const handler = asyncHandler(async () => {
      throw new Error("boom");
    });
    handler({} as Request, mockRes(), next as unknown as NextFunction);
    // Give the microtask a chance to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(next).toHaveBeenCalled();
    expect((next.mock.calls[0][0] as Error).message).toBe("boom");
  });

  it("does not call next on success", async () => {
    const next = mock(() => {});
    const res = mockRes();
    const handler = asyncHandler(async (_req, r) => {
      (r.json as any)({ ok: true });
    });
    handler({} as Request, res, next as unknown as NextFunction);
    await new Promise((r) => setTimeout(r, 10));
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
