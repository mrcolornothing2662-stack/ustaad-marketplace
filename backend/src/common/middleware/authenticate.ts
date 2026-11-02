import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";
import { verifyAccessToken } from "../security/tokens";
import { prisma } from "../../config/database";
import type { AuthenticatedRequest } from "../types/authenticated-request";
export const authenticate: RequestHandler = async (
  request,
  _response,
  next,
) => {
  try {
    const raw = request.header("authorization");
    if (!raw?.startsWith("Bearer "))
      throw new AppError(401, "Authentication required");
    const identity = verifyAccessToken(raw.slice(7));
    const user = await prisma.user.findUnique({ where: { id: identity.id } });
    if (
      !user ||
      user.deletedAt ||
      ["SUSPENDED", "DELETED"].includes(user.status)
    )
      throw new AppError(403, "Account unavailable");
    (request as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (e) {
    next(
      e instanceof AppError
        ? e
        : new AppError(401, "Invalid or expired access token"),
    );
  }
};
