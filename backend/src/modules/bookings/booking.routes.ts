import { randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  bookingInput,
  transitionInput,
  priceProposalInput,
  priceResponseInput,
  customerCompletionInput,
} from "./booking.validation";
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

export const bookingRouter = Router();
bookingRouter.use(authenticate);

bookingRouter.post("/", authorize("CUSTOMER"), async (req, res, next) => {
  try {
    res.status(201).json(
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
      ) {
        throw new AppError(404, "Booking not found");
      }
      if (booking.status !== "PROVIDER_ON_THE_WAY") {
        throw new AppError(
          409,
          "Provider must be on the way before generating start OTP",
        );
      }
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
    const user = (req as AuthenticatedRequest).user!;
    const booking = await bookingRepository.find(String(req.params.id));
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
    ) {
      throw new AppError(
        400,
        "Final amount is only accepted when the provider finishes work",
      );
    }

    let hasOtp = false;
    if (input.otp && booking.startOtp) {
      const o = booking.startOtp;
      if (o.usedAt || o.expiresAt < new Date() || o.attempts >= 5) {
        throw new AppError(400, "OTP expired or unavailable");
      }
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

    // Handle customer proof photo if provided during completion
    let proofPhotoId: string | undefined;
    if (input.completionProofPhotoBase64) {
      const mime = input.completionProofPhotoMimeType || "image/jpeg";
      const bytes = Buffer.from(input.completionProofPhotoBase64, "base64");
      const valid =
        mime === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216;
      if (!valid) throw new AppError(400, "Invalid completion proof photo");

      const storageKey = randomUUID();
      await mkdir("private-uploads", { recursive: true, mode: 0o700 });
      await writeFile(`private-uploads/${storageKey}`, bytes, { mode: 0o600 });

      const uploaded = await prisma.uploadedFile.create({
        data: {
          bookingId: booking.id,
          storageKey,
          mimeType: mime,
          sizeBytes: bytes.length,
          category: "CUSTOMER_PROOF",
        },
      });
      proofPhotoId = uploaded.id;
    }

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
        if (!consumed.count) {
          throw new AppError(400, "OTP changed, expired or was already used");
        }
      }

      const result = await tx.booking.update({
        where: { id: booking.id, status: booking.status },
        data: {
          status: nextStatus,
          ...(input.finalAmount !== undefined
            ? { finalAmount: input.finalAmount }
            : {}),
          ...(input.customerSignatureData
            ? {
                customerSignatureData: input.customerSignatureData,
                customerSignatureAt: new Date(),
              }
            : {}),
          ...(input.completionNote ? { completionNote: input.completionNote } : {}),
          ...(nextStatus === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
          ...(nextStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
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
            type: "BOOKING_UPDATE",
            metadata: { bookingId: booking.id, status: nextStatus },
          },
          {
            userId: booking.provider.userId,
            title: "Booking update",
            body: nextStatus,
            type: "BOOKING_UPDATE",
            metadata: { bookingId: booking.id, status: nextStatus },
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

/**
 * Worker proposes a revised price for the booking.
 */
bookingRouter.post("/:id/propose-price", authorize("PROVIDER"), async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await bookingRepository.find(String(req.params.id));
    if (!booking) throw new AppError(404, "Booking not found");
    if (booking.provider.userId !== user.id) {
      throw new AppError(403, "Only the assigned provider can propose a revised price");
    }
    if (!["ACCEPTED", "CONFIRMED", "PROVIDER_ON_THE_WAY", "IN_PROGRESS"].includes(booking.status)) {
      throw new AppError(
        409,
        "Price revision can only be proposed while booking is active",
      );
    }

    const { revisedPrice, reason } = priceProposalInput.parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id: booking.id },
        data: {
          revisedPrice,
          priceRevisionNote: reason,
          priceRevisionStatus: "PROPOSED",
        },
      });

      await tx.notification.create({
        data: {
          userId: booking.customer.userId,
          title: "Price revision proposed",
          body: `Worker proposed revised price of ₹${revisedPrice}. Reason: ${reason}`,
          type: "PRICE_REVISION_PROPOSED",
          metadata: { bookingId: booking.id, revisedPrice, reason },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PRICE_REVISION_PROPOSED",
          targetType: "Booking",
          targetId: booking.id,
          metadata: { revisedPrice, reason },
        },
      });

      return b;
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/**
 * Customer responds to worker's price revision proposal (ACCEPT or REJECT).
 */
bookingRouter.post("/:id/respond-price", authorize("CUSTOMER"), async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await bookingRepository.find(String(req.params.id));
    if (!booking) throw new AppError(404, "Booking not found");
    if (booking.customer.userId !== user.id) {
      throw new AppError(403, "Only the booking customer can respond to price revisions");
    }
    if (booking.priceRevisionStatus !== "PROPOSED" || !booking.revisedPrice) {
      throw new AppError(409, "No pending price revision proposal to respond to");
    }

    const { action } = priceResponseInput.parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id: booking.id },
        data: {
          priceRevisionStatus: action === "ACCEPT" ? "ACCEPTED" : "REJECTED",
          ...(action === "ACCEPT" ? { estimatedPrice: booking.revisedPrice } : {}),
        },
      });

      await tx.notification.create({
        data: {
          userId: booking.provider.userId,
          title: `Price revision ${action.toLowerCase()}ed`,
          body:
            action === "ACCEPT"
              ? `Customer accepted revised price of ₹${booking.revisedPrice}.`
              : "Customer declined the revised price proposal.",
          type: `PRICE_REVISION_${action}ED`,
          metadata: { bookingId: booking.id, action },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: `PRICE_REVISION_${action}ED`,
          targetType: "Booking",
          targetId: booking.id,
          metadata: { action, agreedPrice: action === "ACCEPT" ? booking.revisedPrice : booking.estimatedPrice },
        },
      });

      return b;
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/**
 * Customer confirms completion with photo evidence and digital signature.
 */
bookingRouter.post("/:id/confirm-completion", authorize("CUSTOMER"), async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await bookingRepository.find(String(req.params.id));
    if (!booking) throw new AppError(404, "Booking not found");
    if (booking.customer.userId !== user.id) {
      throw new AppError(403, "Only the customer can approve work completion");
    }
    if (booking.status !== "AWAITING_CUSTOMER_CONFIRMATION") {
      throw new AppError(
        409,
        "Booking must be awaiting customer confirmation before completion",
      );
    }

    const input = customerCompletionInput.parse(req.body);

    // Save proof photo if provided
    if (input.proofPhotoBase64) {
      const mime = input.proofPhotoMimeType || "image/jpeg";
      const bytes = Buffer.from(input.proofPhotoBase64, "base64");
      const valid =
        mime === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216;
      if (!valid) throw new AppError(400, "Invalid proof photo content");

      const storageKey = randomUUID();
      await mkdir("private-uploads", { recursive: true, mode: 0o700 });
      await writeFile(`private-uploads/${storageKey}`, bytes, { mode: 0o600 });

      await prisma.uploadedFile.create({
        data: {
          bookingId: booking.id,
          storageKey,
          mimeType: mime,
          sizeBytes: bytes.length,
          category: "CUSTOMER_PROOF",
        },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: booking.id, status: "AWAITING_CUSTOMER_CONFIRMATION" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          customerSignatureData: input.customerSignatureData,
          customerSignatureAt: new Date(),
          completionNote: input.completionNote ?? null,
          statusHistory: {
            create: {
              fromStatus: "AWAITING_CUSTOMER_CONFIRMATION",
              toStatus: "COMPLETED",
              actorId: user.id,
              note: "Completed with customer digital signature",
            },
          },
        },
      });

      await tx.notification.createMany({
        data: [
          {
            userId: booking.customer.userId,
            title: "Work completed",
            body: "You confirmed work completion.",
            type: "WORK_COMPLETED",
            metadata: { bookingId: booking.id },
          },
          {
            userId: booking.provider.userId,
            title: "Work completed and signed",
            body: "Customer approved completion and provided signature.",
            type: "WORK_COMPLETED",
            metadata: { bookingId: booking.id },
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "WORK_COMPLETION_SIGNED",
          targetType: "Booking",
          targetId: booking.id,
          metadata: { finalAmount: booking.finalAmount, signedAt: new Date() },
        },
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
          files: {
            select: { id: true, category: true, mimeType: true, sizeBytes: true, createdAt: true },
          },
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
    const u = (req as AuthenticatedRequest).user!;
    const b = await bookingRepository.find(String(req.params.id));
    if (
      !b ||
      !(
        u.role === "ADMIN" ||
        b.customer.userId === u.id ||
        b.provider.userId === u.id
      )
    ) {
      throw new AppError(404, "Booking not found");
    }
    const { startOtp, ...safe } = b;
    res.json(safe);
  } catch (e) {
    next(e);
  }
});
