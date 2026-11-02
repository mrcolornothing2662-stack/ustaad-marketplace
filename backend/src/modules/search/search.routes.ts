import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { searchRepository } from "./search.repository";
import { haversineKm } from "./location";
import { rankProvider } from "./ranking";
import { availableAt } from "../bookings/booking.validation";
export const searchRouter = Router();
searchRouter.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        distanceKm: z.coerce.number().positive().max(200).default(50),
        serviceId: z.string().uuid().optional(),
        preferredAt: z.iso.datetime().optional(),
      })
      .parse(req.query);
    const providers = await searchRepository.approved(q.serviceId);
    const result = providers
      .filter(
        (p) =>
          p.latitude !== null &&
          p.longitude !== null &&
          p.user.status === "ACTIVE",
      )
      .map((p) => {
        const distance = haversineKm(q, {
            latitude: p.latitude!,
            longitude: p.longitude!,
          }),
          avg = p.reviews.length
            ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length
            : 2.5;
        const bookings = p.bookings,
          finished = bookings.filter((b) =>
            ["COMPLETED", "REVIEWED"].includes(b.status),
          ).length,
          terminal = bookings.filter((b) =>
            [
              "COMPLETED",
              "REVIEWED",
              "CANCELLED_BY_PROVIDER",
              "NO_SHOW",
            ].includes(b.status),
          ).length;
        const response = bookings.length
            ? (100 * bookings.filter((b) => b.status !== "PENDING").length) /
              bookings.length
            : 50,
          completion = terminal ? (100 * finished) / terminal : 50;
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          experienceYears: p.experienceYears,
          languages: p.languages,
          city: p.city,
          user: { name: p.user.name },
          services: p.services.filter((s) => s.active),
          availability: p.availability,
          badges: p.badges,
          trustScore: p.trustScore,
          averageRating: avg,
          reviewCount: p.reviews.length,
          distanceKm: Number(distance.toFixed(1)),
          serviceRadiusKm: p.serviceRadiusKm,
          ...rankProvider({
            serviceMatch: 100,
            trustScore: p.trustScore?.score ?? 50,
            distanceScore: Math.max(0, 100 - distance * 4),
            availabilityScore: q.preferredAt
              ? availableAt(p.availability, new Date(q.preferredAt))
                ? 100
                : 0
              : 50,
            ratingScore: avg * 20,
            responseRate: response,
            completionRate: completion,
            verified:
              p.badges.some((b) => b.type === "IDENTITY_VERIFIED") &&
              p.badges.some((b) => b.type === "SKILL_VERIFIED"),
          }),
        };
      })
      .filter((p) => p.distanceKm <= Math.min(q.distanceKm, p.serviceRadiusKm))
      .sort((a, b) => b.rankingScore - a.rankingScore);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
searchRouter.get("/:id", async (req, res, next) => {
  try {
    const p = await prisma.providerProfile.findFirst({
      where: {
        id: String(req.params.id),
        approvedAt: { not: null },
        listingPaused: false,
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        title: true,
        description: true,
        experienceYears: true,
        languages: true,
        city: true,
        user: { select: { name: true } },
        services: { where: { active: true }, include: { service: true } },
        availability: true,
        badges: true,
        trustScore: true,
        reviews: {
          where: { moderationStatus: "APPROVED" },
          select: { rating: true, text: true, createdAt: true },
        },
      },
    });
    if (!p) return res.status(404).json({ message: "Provider not found" });
    res.json(p);
  } catch (e) {
    next(e);
  }
});
