import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { hashToken } from "../../common/security/tokens";
import { AppError } from "../../common/errors/app-error";
export const passwordRouter = Router();
passwordRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.email() }).parse(req.body);
    if (env.NODE_ENV === "production")
      throw new AppError(503, "Email delivery adapter is not configured");
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    let developmentToken: string | undefined;
    if (user) {
      developmentToken = randomBytes(32).toString("hex");
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(developmentToken),
          expiresAt: new Date(Date.now() + 900000),
        },
      });
    }
    res.json({
      message: "If the account exists, recovery instructions are available.",
      ...(developmentToken ? { developmentToken } : {}),
    });
  } catch (e) {
    next(e);
  }
});
passwordRouter.post("/reset-password", async (req, res, next) => {
  try {
    const d = z
        .object({
          token: z.string().length(64),
          password: z.string().min(8).max(128),
        })
        .parse(req.body),
      hash = await bcrypt.hash(d.password, 12);
    await prisma.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: hashToken(d.token) },
      });
      if (!reset || reset.usedAt || reset.expiresAt < new Date())
        throw new AppError(400, "Invalid or expired recovery token");
      const used = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw new AppError(400, "Recovery token already used");
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: hash },
      });
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId },
        data: { revokedAt: new Date() },
      });
    });
    res.json({ reset: true });
  } catch (e) {
    next(e);
  }
});
