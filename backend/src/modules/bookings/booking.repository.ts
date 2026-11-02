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
      additionalInstructions?: string;
    },
  ) =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { customerProfile: true },
      });
      if (!user.phoneVerifiedAt)
        throw new AppError(403, "Verify your phone before booking");
      const p = await tx.providerProfile.findUnique({
        where: { id: d.providerId },
        include: {
          user: true,
          services: { include: { service: { include: { category: true } } } },
          availability: true,
        },
      });
      const when = new Date(d.preferredAt);
      if (!p || !p.approvedAt || p.listingPaused || p.user.status !== "ACTIVE")
        throw new AppError(409, "Provider is unavailable");
      if (
        !p.services.some(
          (s) =>
            s.serviceId === d.serviceId &&
            s.active &&
            s.service.category.active,
        )
      )
        throw new AppError(400, "Provider does not offer this service");
      if (when <= new Date() || !availableAt(p.availability, when))
        throw new AppError(
          409,
          "Choose a future time within provider availability",
        );
      if (
        p.latitude === null ||
        p.longitude === null ||
        haversineKm(
          { latitude: d.latitude, longitude: d.longitude },
          { latitude: p.latitude, longitude: p.longitude },
        ) > p.serviceRadiusKm
      )
        throw new AppError(409, "Address is outside provider service radius");
      // One-hour booking slots; an advisory lock serializes requests for this provider.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.id}))`;
      const conflict = await tx.booking.count({
        where: {
          providerId: p.id,
          status: { in: [...occupied] },
          preferredAt: {
            gt: new Date(when.getTime() - 3600000),
            lt: new Date(when.getTime() + 3600000),
          },
        },
      });
      if (conflict)
        throw new AppError(
          409,
          "Provider already has a booking in this time slot",
        );
      const created = await tx.booking.create({
        data: {
          ...d,
          customerId: user.customerProfile!.id,
          preferredAt: when,
          statusHistory: { create: { toStatus: "PENDING", actorId: userId } },
        },
      });
      await tx.notification.create({
        data: {
          userId: p.userId,
          title: "New booking request",
          body: d.problemDescription,
        },
      });
      return created;
    }),
  find: (id: string) =>
    prisma.booking.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { id: true, name: true } } } },
        provider: { include: { user: { select: { id: true, name: true } } } },
        statusHistory: true,
        startOtp: true,
      },
    }),
  transition: (
    id: string,
    from: BookingStatus,
    to: BookingStatus,
    actorId: string,
    extra: { finalAmount?: number },
  ) =>
    prisma.booking.update({
      where: { id, status: from },
      data: {
        status: to,
        ...(extra.finalAmount !== undefined
          ? { finalAmount: extra.finalAmount }
          : {}),
        statusHistory: { create: { fromStatus: from, toStatus: to, actorId } },
      },
    }),
};
