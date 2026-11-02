import { prisma } from "../../config/database";
export const providerRepository = {
  findByUser: (userId: string) =>
    prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        services: { include: { service: true } },
        availability: true,
        badges: true,
        trustScore: true,
      },
    }),
  complete: (
    userId: string,
    data: {
      title: string;
      description: string;
      experienceYears: number;
      languages: string[];
      city: string;
      latitude: number;
      longitude: number;
      serviceRadiusKm: number;
    },
  ) =>
    prisma.$transaction(async (tx) => {
      const profile = await tx.providerProfile.update({
        where: { userId },
        data,
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: profile.approvedAt ? "ACTIVE" : "VERIFICATION_REQUIRED",
        },
      });
      return profile;
    }),
};
