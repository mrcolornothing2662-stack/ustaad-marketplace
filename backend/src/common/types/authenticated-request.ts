import type { Request } from "express";
import type { UserRole } from "@prisma/client";
export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
