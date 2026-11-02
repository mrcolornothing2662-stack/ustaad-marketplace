import { prisma } from "../../config/database";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { AccountStatus, type UserRole } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../common/security/tokens";
import { env } from "../../config/env";
import { authRepository } from "./auth.repository";
import { getSmsProvider } from "../../integrations/sms/sms.provider";
const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  phoneVerifiedAt: Date | null;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  phoneVerifiedAt: user.phoneVerifiedAt,
});
async function issue(user: { id: string; email: string; role: UserRole }) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await authRepository.storeRefresh(
    user.id,
    hashToken(refreshToken),
    new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
  );
  return { accessToken, refreshToken };
}
export const authService = {
  async register(
    input: { name: string; email: string; phone: string; password: string },
    role: UserRole,
  ) {
    if (await authRepository.findByEmail(input.email.toLowerCase()))
      throw new AppError(409, "Email already registered", "EMAIL_EXISTS");
    const user = await authRepository.createUser({
      name: input.name,
      phone: input.phone,
      email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 12),
      role,
      status:
        role === "PROVIDER"
          ? AccountStatus.PROFILE_INCOMPLETE
          : AccountStatus.ACTIVE,
    });
    return { user: publicUser(user), tokens: await issue(user) };
  },
  async login(email: string, password: string) {
    const user = await authRepository.findByEmail(email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    if (
      [AccountStatus.SUSPENDED, AccountStatus.DELETED].includes(
        user.status as any,
      ) ||
      user.deletedAt
    )
      throw new AppError(403, "Account unavailable", "ACCOUNT_BLOCKED");
    return { user: publicUser(user), tokens: await issue(user) };
  },
  async refresh(token: string) {
    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError(401, "Invalid refresh token");
    }
    const current = await authRepository.findRefresh(hashToken(token));
    if (!current || current.revokedAt || current.expiresAt < new Date())
      throw new AppError(
        401,
        "Refresh token is no longer valid",
        "INVALID_REFRESH_TOKEN",
      );
    const account = await prisma.user.findUnique({ where: { id: payload.id } });
    if (
      !account ||
      account.deletedAt ||
      ["SUSPENDED", "DELETED"].includes(account.status)
    )
      throw new AppError(403, "Account unavailable");
    const identity = {
      id: account.id,
      email: account.email,
      role: account.role,
    };
    const replacement = signRefreshToken(identity);
    const replacementHash = hashToken(replacement);
    await prisma.$transaction(async (tx) => {
      const rotated = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedBy: replacementHash },
      });
      if (!rotated.count) throw new AppError(401, "Refresh token already used");
      await tx.refreshToken.create({
        data: {
          userId: payload.id,
          tokenHash: replacementHash,
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
        },
      });
    });
    return {
      accessToken: signAccessToken(identity),
      refreshToken: replacement,
    };
  },
  logout: (token: string) => authRepository.revokeRefresh(hashToken(token)),
  async sendOtp(phone: string) {
    if (
      env.NODE_ENV === "production" &&
      env.SMS_PROVIDER === "mock" &&
      !env.SMS_API_KEY
    ) {
      throw new AppError(503, "SMS delivery adapter must be configured");
    }

    // Cooldown check: 30 seconds cooldown between OTP requests for the same phone
    if (env.NODE_ENV !== "test") {
      const recent = await prisma.phoneVerification.findFirst({
        where: { phone, verifiedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (recent && Date.now() - recent.createdAt.getTime() < 30000) {
        const remaining = Math.ceil(
          (30000 - (Date.now() - recent.createdAt.getTime())) / 1000,
        );
        throw new AppError(
          429,
          `Please wait ${remaining} seconds before requesting a new OTP`,
          "OTP_COOLDOWN",
        );
      }
    }

    const otp = String(randomInt(100000, 1000000));
    await prisma.phoneVerification.updateMany({
      where: { phone, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });
    await prisma.phoneVerification.create({
      data: {
        phone,
        otpHash: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + 300000),
        lastSentAt: new Date(),
      },
    });

    const sms = getSmsProvider();
    await sms.sendOtp(phone, otp);

    return {
      phone,
      expiresInSeconds: 300,
      ...(env.NODE_ENV !== "production" || env.SMS_PROVIDER === "mock"
        ? { developmentOtp: otp }
        : {}),
    };
  },
  async verifyOtp(phone: string, otp: string) {
    const challenge = await prisma.phoneVerification.findFirst({
      where: { phone, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (
      !challenge ||
      challenge.expiresAt < new Date() ||
      challenge.attempts >= 5
    )
      throw new AppError(400, "OTP expired or unavailable");
    const attempt = await prisma.phoneVerification.updateMany({
      where: {
        id: challenge.id,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
      data: { attempts: { increment: 1 } },
    });
    if (!attempt.count) throw new AppError(400, "OTP expired or unavailable");
    if (!(await bcrypt.compare(otp, challenge.otpHash)))
      throw new AppError(400, "Invalid OTP");
    await prisma.$transaction(async (tx) => {
      const used = await tx.phoneVerification.updateMany({
        where: {
          id: challenge.id,
          verifiedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { verifiedAt: new Date() },
      });
      if (!used.count) throw new AppError(400, "OTP already used");
      const user = await tx.user.update({
        where: { phone },
        data: { phoneVerifiedAt: new Date() },
        include: { providerProfile: true },
      });
      if (user.providerProfile) {
        await tx.providerBadge.upsert({
          where: {
            providerId_type: {
              providerId: user.providerProfile.id,
              type: "MOBILE_VERIFIED",
            },
          },
          create: {
            providerId: user.providerProfile.id,
            type: "MOBILE_VERIFIED",
          },
          update: {},
        });
      }
    });
    return { verified: true };
  },
};
