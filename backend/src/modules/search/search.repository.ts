import { prisma } from "../../config/database";
export const searchRepository = {
  approved: (serviceId?: string) =>
    prisma.providerProfile.findMany({
      where: {
        approvedAt: { not: null },
        listingPaused: false,
        ...(serviceId
          ? { services: { some: { serviceId, active: true } } }
          : {}),
      },
      include: {
        user: { select: { name: true, status: true } },
        services: { include: { service: true } },
        bookings: { select: { status: true } },
        availability: true,
        badges: true,
        trustScore: true,
        reviews: {
          where: { moderationStatus: "APPROVED" },
          select: { rating: true },
        },
      },
    }),
};
