import type { Request, Response, NextFunction } from "express";
import { getLocalToken } from "../lib/auth/crypto";

export interface AuthRequest extends Request {
  userId: string;
  token: string;
}

// Canonical user identity — MUST match LOCAL_USER in src/mcp/helpers.ts and
// LOCAL_USER_ID in bin/cli.js so the Docker API, CLI, and MCP all read and
// write the same credential / session rows in the shared SQLite file.
const CANONICAL_USER = "iframer-local";

export function tokenAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.IFRAMER_SECRET;
  if (secret && req.path !== "/health") {
    const header = req.headers["x-api-key"] ?? req.headers.authorization?.replace("Bearer ", "");
    if (header !== secret) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
  }
  (req as AuthRequest).userId = CANONICAL_USER;
  (req as AuthRequest).token = getLocalToken();
  next();
}
