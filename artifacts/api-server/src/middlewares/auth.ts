import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { db, usersTable } from "@scout-expense-tracker/db";
import { eq } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
      userRole?: "admin" | "leader";
    }
  }
}

/**
 * Optional auth: if a Bearer token (or `token` cookie) is present and valid,
 * attach user identity to the request. Never blocks the request — routes that
 * require auth use `requireAuth`.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers["authorization"];
    let token: string | null = null;
    if (header?.startsWith("Bearer ")) token = header.slice(7);
    if (!token && req.cookies?.token) token = req.cookies.token;

    if (token) {
      const payload = verifyToken(token);
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.sub))
        .limit(1);
      if (user && user.isActive) {
        req.userId = user.id;
        req.username = user.username;
        req.userRole = user.role;
      }
    }
  } catch {
    // Invalid/expired token -> treat as unauthenticated.
  }
  next();
}

/** Require a valid session; 401 otherwise. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/** Require the admin role; 403 otherwise. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
