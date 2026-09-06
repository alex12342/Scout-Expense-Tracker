import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: "admin" | "leader";
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("JWT_SECRET is not set. Set it in the environment.");
  }
  return s;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret()) as JwtPayload;
}
