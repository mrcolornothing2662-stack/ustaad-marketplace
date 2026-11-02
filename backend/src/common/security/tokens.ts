import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../../config/env";
import type { UserRole } from "@prisma/client";
export interface TokenUser {
  id: string;
  email: string;
  role: UserRole;
}
export const hashToken = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export const signAccessToken = (user: TokenUser): string =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: `${env.ACCESS_TOKEN_MINUTES}m` },
  );
export const signRefreshToken = (user: TokenUser): string =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${env.REFRESH_TOKEN_DAYS}d` },
  );
export const verifyAccessToken = (token: string): TokenUser =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenUser;
export const verifyRefreshToken = (token: string): TokenUser =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenUser;
