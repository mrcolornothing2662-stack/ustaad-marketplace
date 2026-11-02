import { prisma } from "../../config/database";
import type { AccountStatus, UserRole } from "@prisma/client";
export const authRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
  createUser: (data: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    role: UserRole;
    status: AccountStatus;
  }) =>
    prisma.user.create({
      data: {
        ...data,
        ...(data.role === "CUSTOMER"
          ? { customerProfile: { create: {} } }
          : { providerProfile: { create: {} } }),
      },
    }),
  storeRefresh: (userId: string, tokenHash: string, expiresAt: Date) =>
    prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } }),
  findRefresh: (tokenHash: string) =>
    prisma.refreshToken.findUnique({ where: { tokenHash } }),
  rotateRefresh: (id: string, replacementHash: string) =>
    prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedBy: replacementHash },
    }),
  revokeRefresh: (tokenHash: string) =>
    prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  verifyPhone: (phone: string) =>
    prisma.user.update({
      where: { phone },
      data: { phoneVerifiedAt: new Date() },
    }),
};
