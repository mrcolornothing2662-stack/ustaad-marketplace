import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";

export const paymentRouter = Router({ mergeParams: true });
paymentRouter.use(authenticate);

function getBookingId(req: any): string {
  return String(req.params.bookingId);
}

async function getBookingParticipants(bookingId: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { include: { user: true } },
      provider: { include: { user: true } },
      paymentRecord: true,
    },
  });
  if (!b) throw new AppError(404, "Booking not found");
  return b;
}

/**
 * Get payment record for a booking.
 */
paymentRouter.get("/", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await getBookingParticipants(getBookingId(req));

    const isParticipant =
      booking.customer.userId === user.id ||
      booking.provider.userId === user.id ||
      user.role === "ADMIN";
    if (!isParticipant) throw new AppError(403, "Not authorized to view payment record");

    let payment = booking.paymentRecord;
    if (!payment) {
      // Return unrecorded pending state
      const agreed = booking.finalAmount ? Number(booking.finalAmount) : booking.estimatedPrice ? Number(booking.estimatedPrice) : 0;
      return res.json({
        bookingId: booking.id,
        agreedAmount: agreed,
        paymentStatus: "PENDING",
        paymentMethod: "CASH",
        directSettlementNotice: "Payment is settled directly between customer and worker. Ustaad charges no platform fee.",
      });
    }

    res.json(payment);
  } catch (e) {
    next(e);
  }
});

/**
 * Customer reports direct payment (Cash or UPI).
 */
paymentRouter.post("/report", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await getBookingParticipants(getBookingId(req));

    if (booking.customer.userId !== user.id) {
      throw new AppError(403, "Only the customer can report payment");
    }

    const d = z
      .object({
        paymentMethod: z.enum(["CASH", "UPI", "OTHER"]),
        transactionReference: z.string().max(100).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const agreed = booking.finalAmount ?? booking.estimatedPrice ?? 0;

    const record = await prisma.$transaction(async (tx) => {
      const p = await tx.paymentRecord.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          agreedAmount: agreed,
          paymentMethod: d.paymentMethod,
          paymentStatus: "REPORTED_BY_CUSTOMER",
          transactionReference: d.transactionReference ?? null,
          notes: d.notes ?? null,
          reportedByCustomerId: user.id,
          reportedAt: new Date(),
        },
        update: {
          paymentMethod: d.paymentMethod,
          paymentStatus: "REPORTED_BY_CUSTOMER",
          transactionReference: d.transactionReference ?? null,
          notes: d.notes ?? null,
          reportedByCustomerId: user.id,
          reportedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: booking.provider.userId,
          title: "Payment reported by customer",
          body: `Customer reported direct payment of ₹${agreed} via ${d.paymentMethod}. Please confirm upon receipt.`,
          type: "PAYMENT_REPORTED",
          metadata: { bookingId: booking.id, method: d.paymentMethod },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PAYMENT_REPORTED",
          targetType: "PaymentRecord",
          targetId: p.id,
          metadata: { method: d.paymentMethod, ref: d.transactionReference },
        },
      });

      return p;
    });

    res.status(200).json(record);
  } catch (e) {
    next(e);
  }
});

/**
 * Worker confirms direct payment receipt.
 */
paymentRouter.post("/confirm", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await getBookingParticipants(getBookingId(req));

    if (booking.provider.userId !== user.id) {
      throw new AppError(403, "Only the assigned worker can confirm payment receipt");
    }

    const agreed = booking.finalAmount ?? booking.estimatedPrice ?? 0;

    const record = await prisma.$transaction(async (tx) => {
      const p = await tx.paymentRecord.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          agreedAmount: agreed,
          paymentStatus: "SETTLED",
          confirmedByWorkerId: user.id,
          confirmedAt: new Date(),
          settledAt: new Date(),
        },
        update: {
          paymentStatus: "SETTLED",
          confirmedByWorkerId: user.id,
          confirmedAt: new Date(),
          settledAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: booking.customer.userId,
          title: "Payment confirmed by worker",
          body: `Worker confirmed receipt of ₹${agreed}. Payment is settled.`,
          type: "PAYMENT_SETTLED",
          metadata: { bookingId: booking.id },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PAYMENT_SETTLED",
          targetType: "PaymentRecord",
          targetId: p.id,
          metadata: { confirmedAt: new Date() },
        },
      });

      return p;
    });

    res.json(record);
  } catch (e) {
    next(e);
  }
});

/**
 * Customer or Worker disputes payment amount or settlement.
 */
paymentRouter.post("/dispute", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const booking = await getBookingParticipants(getBookingId(req));

    const isCustomer = booking.customer.userId === user.id;
    const isWorker = booking.provider.userId === user.id;
    if (!isCustomer && !isWorker) {
      throw new AppError(403, "Only booking participants can dispute payment");
    }

    const { reason } = z
      .object({ reason: z.string().trim().min(5).max(1000) })
      .parse(req.body);

    const agreed = booking.finalAmount ?? booking.estimatedPrice ?? 0;

    const record = await prisma.$transaction(async (tx) => {
      const p = await tx.paymentRecord.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          agreedAmount: agreed,
          paymentStatus: "DISPUTED",
          notes: `Dispute reported by ${user.role}: ${reason}`,
        },
        update: {
          paymentStatus: "DISPUTED",
          notes: `Dispute reported by ${user.role}: ${reason}`,
        },
      });

      const otherUserId = isCustomer ? booking.provider.userId : booking.customer.userId;

      await tx.notification.create({
        data: {
          userId: otherUserId,
          title: "Payment dispute reported",
          body: `Payment status has been disputed: ${reason}`,
          type: "PAYMENT_DISPUTED",
          metadata: { bookingId: booking.id, reason },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PAYMENT_DISPUTED",
          targetType: "PaymentRecord",
          targetId: p.id,
          metadata: { reason, reporterRole: user.role },
        },
      });

      return p;
    });

    res.json(record);
  } catch (e) {
    next(e);
  }
});
