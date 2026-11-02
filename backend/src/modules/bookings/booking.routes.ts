import { randomInt } from "node:crypto";
import { bookingInput, transitionInput } from "./booking.validation";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { assertTransition } from "./booking.state-machine";
import { bookingRepository } from "./booking.repository";
import type { BookingStatus } from "@prisma/client";
import { env } from "../../config/env";
export const bookingRouter = Router();
bookingRouter.use(authenticate);
bookingRouter.post("/", authorize("CUSTOMER"), async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await bookingRepository.create(
          (req as AuthenticatedRequest).user!.id,
          bookingInput.parse(req.body),
        ),
      );
  } catch (e) {
    next(e);
  }
});
bookingRouter.post(
  "/:id/start-otp",
  authorize("CUSTOMER"),
  async (req, res, next) => {
    try {
      const booking = await bookingRepository.find(String(req.params.id));
      if (
        !booking ||
        booking.customer.userId !== (req as AuthenticatedRequest).user!.id
      )
        throw new AppError(404, "Booking not found");
      if (booking.status !== "PROVIDER_ON_THE_WAY")
        throw new AppError(
          409,
          "Provider must be on the way before generating start OTP",
        );
      const otp = String(randomInt(100000, 1000000));
      await prisma.jobStartOtp.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          otpHash: await bcrypt.hash(otp, 10),
          expiresAt: new Date(Date.now() + 600000),
        },
        update: {
          otpHash: await bcrypt.hash(otp, 10),
          expiresAt: new Date(Date.now() + 600000),
          usedAt: null,
          attempts: 0,
        },
      });
      res.json({ sent: true, otp });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.post("/:id/transition", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!,
      booking = await bookingRepository.find(String(req.params.id));
    if (!booking) throw new AppError(404, "Booking not found");
    const owns =
      user.role === "CUSTOMER"
        ? booking.customer.userId === user.id
        : user.role === "PROVIDER"
          ? booking.provider.userId === user.id
          : user.role === "ADMIN";
    if (!owns) throw new AppError(403, "Not your booking");
    const input = transitionInput.parse(req.body);
    const nextStatus = input.status as BookingStatus;
    if (
      input.finalAmount !== undefined &&
      nextStatus !== "AWAITING_CUSTOMER_CONFIRMATION"
    )
      throw new AppError(
        400,
        "Final amount is only accepted when the provider finishes work",
      );
    let hasOtp = false;
    if (input.otp && booking.startOtp) {
      const o = booking.startOtp;
      if (o.usedAt || o.expiresAt < new Date() || o.attempts >= 5)
        throw new AppError(400, "OTP expired or unavailable");
      await prisma.jobStartOtp.update({
        where: { id: o.id },
        data: { attempts: { increment: 1 } },
      });
      hasOtp = await bcrypt.compare(input.otp, o.otpHash);
    }
    assertTransition(booking.status, nextStatus, {
      role: user.role,
      hasOtp,
      hasFinalAmount: typeof req.body.finalAmount === "number",
    });
    const updated = await prisma.$transaction(async (tx) => {
      if (nextStatus === "IN_PROGRESS") {
        const consumed = await tx.jobStartOtp.updateMany({
          where: {
            bookingId: booking.id,
            otpHash: booking.startOtp!.otpHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lte: 5 },
          },
          data: { usedAt: new Date() },
        });
        if (!consumed.count)
          throw new AppError(400, "OTP changed, expired or was already used");
      }
      const result = await tx.booking.update({
        where: { id: booking.id, status: booking.status },
        data: {
          status: nextStatus,
          ...(input.finalAmount !== undefined
            ? { finalAmount: input.finalAmount }
            : {}),
          statusHistory: {
            create: {
              fromStatus: booking.status,
              toStatus: nextStatus,
              actorId: user.id,
            },
          },
        },
      });
      await tx.notification.createMany({
        data: [
          {
            userId: booking.customer.userId,
            title: "Booking update",
            body: nextStatus,
          },
          {
            userId: booking.provider.userId,
            title: "Booking update",
            body: nextStatus,
          },
        ],
      });
      return result;
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

bookingRouter.get("/", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    res.json(
      await prisma.booking.findMany({
        where:
          u.role === "CUSTOMER"
            ? { customer: { userId: u.id } }
            : u.role === "PROVIDER"
              ? { provider: { userId: u.id } }
              : {},
        include: {
          service: true,
          customer: { include: { user: { select: { name: true } } } },
          provider: { include: { user: { select: { name: true } } } },
          review: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    next(e);
  }
});
bookingRouter.get("/:id", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!,
      b = await bookingRepository.find(String(req.params.id));
    if (
      !b ||
      !(
        u.role === "ADMIN" ||
        b.customer.userId === u.id ||
        b.provider.userId === u.id
      )
    )
      throw new AppError(404, "Booking not found");
    const { startOtp, ...safe } = b;
    res.json(safe);
  } catch (e) {
    next(e);
  }
});
