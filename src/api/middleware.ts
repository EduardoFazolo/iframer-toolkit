import type { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  userId: string;
  token: string;
}

export function tokenAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Single-user self-hosted: always "default". IFRAMER_SECRET optionally restricts access.
  const secret = process.env.IFRAMER_SECRET;
  if (secret && req.path !== "/health") {
    const header = req.headers["x-api-key"] ?? req.headers.authorization?.replace("Bearer ", "");
    if (header !== secret) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
  }
  req.userId = "default";
  req.token = process.env.IFRAMER_SECRET || "iframer-local";
  next();
}
