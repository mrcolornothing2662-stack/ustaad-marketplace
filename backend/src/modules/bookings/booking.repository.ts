import { prisma } from "../../config/database";
import type { BookingStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import { haversineKm } from "../search/location";
import { availableAt, occupied } from "./booking.validation";

export const bookingRepository = {
  create: async (
    userId: string,
    d: {
      providerId: string;
      serviceId: string;
      problemDescription: string;
      addressText: string;
      latitude: number;
      longitude: number;
      preferredAt: string;
      estimatedDurationMinutes?: number | undefined;
      bufferMinutes?: number | undefined;
      additionalInstructions?: string | undefined;
    },
  ) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { customerProfile: true },
      });
      if (!user.phoneVerifiedAt) {
        throw new AppError(403, "Verify your phone before booking");
      }
      const p = await tx.providerProfile.findUnique({
        where: { id: d.providerId },
        include: {
          user: true,
          services: { include: { service: { include: { category: true } } } },
          availability: true,
        },
      });
      const when = new Date(d.preferredAt);
      if (!p || !p.approvedAt || p.listingPaused || p.user.status !== "ACTIVE") {
        throw new AppError(409, "Provider is unavailable");
      }

      const matchingService = p.services.find(
        (s) =>
          s.serviceId === d.serviceId &&
          s.active &&
          s.service.category.active,
      );

      if (!matchingService) {
        throw new AppError(400, "Provider does not offer this service");
      }

      if (when <= new Date() || !availableAt(p.availability, when)) {
        throw new AppError(
          409,
          "Choose a future time within provider availability",
        );
      }

      if (
        p.latitude === null ||
        p.longitude === null ||
        haversineKm(
          { latitude: d.latitude, longitude: d.longitude },
          { latitude: p.latitude, longitude: p.longitude },
        ) > p.serviceRadiusKm
      ) {
        throw new AppError(409, "Address is outside provider service radius");
      }

      // Duration-aware scheduling: calculate slot interval including buffer
      const duration = d.estimatedDurationMinutes ?? 60;
      const buffer = d.bufferMinutes ?? 30;
      const slotStart = when.getTime();
      const slotEnd = slotStart + (duration + buffer) * 60000;

      // Serialize concurrent booking requests for this provider
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.id}))`;

      // Find any overlapping occupied bookings
      const existing = await tx.booking.findMany({
        where: {
          providerId: p.id,
          status: { in: [...occupied] },
          preferredAt: {
            gte: new Date(slotStart - 24 * 3600000),
            lte: new Date(slotEnd + 24 * 3600000),
          },
        },
        select: {
          preferredAt: true,
          estimatedDurationMinutes: true,
          bufferMinutes: true,
        },
      });

      const hasConflict = existing.some((b) => {
        const bStart = b.preferredAt.getTime();
        const bDuration = b.estimatedDurationMinutes ?? 60;
        const bBuffer = b.bufferMinutes ?? 30;
        const bEnd = bStart + (bDuration + bBuffer) * 60000;
        return slotStart < bEnd && slotEnd > bStart;
      });

      if (hasConflict) {
        throw new AppError(
          409,
          "Provider already has a booking in this time slot",
        );
      }

      const created = await tx.booking.create({
        data: {
          customerId: user.customerProfile!.id,
          providerId: d.providerId,
          serviceId: d.serviceId,
          problemDescription: d.problemDescription,
          addressText: d.addressText,
          latitude: d.latitude,
          longitude: d.longitude,
          preferredAt: when,
          estimatedDurationMinutes: duration,
          bufferMinutes: buffer,
          estimatedPrice: matchingService.startingPrice,
          additionalInstructions: d.additionalInstructions ?? null,
          statusHistory: { create: { toStatus: "PENDING", actorId: userId } },
        },
      });

      await tx.notification.create({
        data: {
          userId: p.userId,
          title: "New booking request",
          body: d.problemDescription,
          type: "BOOKING_REQUEST",
          metadata: { bookingId: created.id },
        },
      });

      return created;
    }),

  find: (id: string) =>
    prisma.booking.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { id: true, name: true, phone: true } } } },
        provider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        service: true,
        statusHistory: true,
        startOtp: true,
        files: true,
      },
    }),

  transition: (
    id: string,
    from: BookingStatus,
    to: BookingStatus,
    actorId: string,
    extra: {
      finalAmount?: number;
      customerSignatureData?: string;
      completionNote?: string;
    },
  ) =>
    prisma.booking.update({
      where: { id, status: from },
      data: {
        status: to,
        ...(extra.finalAmount !== undefined
          ? { finalAmount: extra.finalAmount }
          : {}),
        ...(extra.customerSignatureData !== undefined
          ? {
              customerSignatureData: extra.customerSignatureData,
              customerSignatureAt: new Date(),
            }
          : {}),
        ...(extra.completionNote !== undefined
          ? { completionNote: extra.completionNote }
          : {}),
        ...(to === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
        ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
        statusHistory: { create: { fromStatus: from, toStatus: to, actorId } },
      },
    }),
};
