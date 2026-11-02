import type { RequestHandler } from "express";
import type { UserRole } from "@prisma/client";
import type { AuthenticatedRequest } from "../types/authenticated-request";
import { AppError } from "../errors/app-error";
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (request, _response, next) => {
    const user = (request as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role))
      return next(new AppError(403, "Insufficient permission", "FORBIDDEN"));
    next();
  };
