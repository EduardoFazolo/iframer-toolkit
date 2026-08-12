import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { tokenAuth, type AuthRequest } from "../../src/api/middleware";
import type { Request, Response, NextFunction } from "express";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: "/execute",
    headers: {},
    ...overrides,
  } as Request;
}

function mockRes() {
  const res: Partial<Response> = {
    status: mock(() => res) as any,
    json: mock(() => res) as any,
  };
  return res as Response;
}

describe("tokenAuth", () => {
  const originalSecret = process.env.IFRAMER_SECRET;

  afterEach(() => {
    if (originalSecret) {
      process.env.IFRAMER_SECRET = originalSecret;
    } else {
      delete process.env.IFRAMER_SECRET;
    }
  });

  it("sets userId and token when no secret configured", () => {
    delete process.env.IFRAMER_SECRET;
    const req = mockReq();
    const next = mock(() => {});
    tokenAuth(req, mockRes(), next as unknown as NextFunction);
    expect((req as AuthRequest).userId).toBe("iframer-local");
    expect(next).toHaveBeenCalled();
  });

  it("allows /health without auth even with secret", () => {
    process.env.IFRAMER_SECRET = "my-secret";
    const req = mockReq({ path: "/health" });
    const next = mock(() => {});
    tokenAuth(req, mockRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it("rejects requests with wrong secret", () => {
    process.env.IFRAMER_SECRET = "correct-secret";
    const req = mockReq({ headers: { "x-api-key": "wrong" } as any });
    const res = mockRes();
    const next = mock(() => {});
    tokenAuth(req, res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts requests with correct x-api-key", () => {
    process.env.IFRAMER_SECRET = "correct-secret";
    const req = mockReq({ headers: { "x-api-key": "correct-secret" } as any });
    const next = mock(() => {});
    tokenAuth(req, mockRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
    expect((req as AuthRequest).token).toBe("correct-secret");
  });

  it("accepts requests with correct Bearer token", () => {
    process.env.IFRAMER_SECRET = "correct-secret";
    const req = mockReq({ headers: { authorization: "Bearer correct-secret" } as any });
    const next = mock(() => {});
    tokenAuth(req, mockRes(), next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
  });
});
