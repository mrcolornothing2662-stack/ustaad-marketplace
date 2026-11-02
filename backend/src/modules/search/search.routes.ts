import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { searchRepository } from "./search.repository";
import { haversineKm, geocodeAddress } from "./location";
import { rankProvider } from "./ranking";
import { availableAt } from "../bookings/booking.validation";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { verifyAccessToken } from "../../common/security/tokens";

export const searchRouter = Router();

async function getOptionalUser(rawHeader?: string) {
  if (!rawHeader?.startsWith("Bearer ")) return null;
  try {
    const identity = verifyAccessToken(rawHeader.slice(7));
    return await prisma.user.findUnique({
      where: { id: identity.id },
      select: { id: true, status: true, deletedAt: true },
    });
  } catch {
    return null;
  }
}

searchRouter.get("/geocode", async (req, res, next) => {
  try {
    const { address } = z.object({ address: z.string().min(2) }).parse(req.query);
    const coords = await geocodeAddress(address);
    res.json(coords);
  } catch (e) {
    next(e);
  }
});

/**
 * Get customer's recent search queries.
 */
searchRouter.get("/recent", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const history = await prisma.searchHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    res.json(history);
  } catch (e) {
    next(e);
  }
});

/**
 * Clear customer's search history.
 */
searchRouter.delete("/recent", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    await prisma.searchHistory.deleteMany({
      where: { userId: user.id },
    });
    res.json({ success: true, message: "Search history cleared" });
  } catch (e) {
    next(e);
  }
});

/**
 * Get workers recently viewed by the customer.
 */
searchRouter.get("/recently-viewed", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const views = await prisma.recentlyViewedWorker.findMany({
      where: { userId: user.id },
      orderBy: { viewedAt: "desc" },
      take: 10,
      include: {
        provider: {
          select: {
            id: true,
            title: true,
            experienceYears: true,
            city: true,
            isOnline: true,
            user: { select: { name: true, profilePhotoUrl: true } },
            services: { where: { active: true }, include: { service: true } },
            trustScore: true,
          },
        },
      },
    });
    res.json(
      views.map((v) => ({
        ...v.provider,
        viewedAt: v.viewedAt,
      })),
    );
  } catch (e) {
    next(e);
  }
});

/**
 * Record a worker view by the customer.
 */
searchRouter.post("/:id/view", authenticate, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const providerId = String(req.params.id);
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw new AppError(404, "Provider not found");

    await prisma.recentlyViewedWorker.upsert({
      where: {
        userId_providerId: {
          userId: user.id,
          providerId,
        },
      },
      create: {
        userId: user.id,
        providerId,
        viewedAt: new Date(),
      },
      update: {
        viewedAt: new Date(),
      },
    });

    res.json({ success: true, message: "Provider view recorded" });
  } catch (e) {
    next(e);
  }
});

/**
 * Search providers with distance, availability, leave checks, and sorting.
 */
searchRouter.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        distanceKm: z.coerce.number().positive().max(200).default(50),
        serviceId: z.string().uuid().optional(),
        query: z.string().optional(),
        preferredAt: z.string().datetime().optional(),
        onlyOnline: z
          .preprocess((v) => (v === "true" || v === true ? true : false), z.boolean())
          .default(false),
        sortBy: z
          .enum(["recommended", "nearest", "rating", "trust", "price_asc", "price_desc"])
          .default("recommended"),
      })
      .parse(req.query);

    // Record search history asynchronously if user is logged in
    const optionalUser = await getOptionalUser(req.header("authorization"));
    if (optionalUser && !optionalUser.deletedAt && q.query?.trim()) {
      prisma.searchHistory
        .create({
          data: {
            userId: optionalUser.id,
            query: q.query.trim(),
            ...(q.serviceId ? { serviceId: q.serviceId } : {}),
            latitude: q.latitude,
            longitude: q.longitude,
          },
        })
        .catch(() => {});
    }

    const providers = await searchRepository.approved(q.serviceId);
    const normalizedQuery = q.query?.toLowerCase().trim();
    const preferredDate = q.preferredAt ? new Date(q.preferredAt) : null;

    const result = providers
      .filter(
        (p) =>
          p.latitude !== null &&
          p.longitude !== null &&
          p.user.status === "ACTIVE",
      )
      .filter((p) => {
        if (q.onlyOnline && !p.isOnline) return false;
        return true;
      })
      .filter((p) => {
        // Leave check: if preferredAt falls within any approved worker leave, filter worker out
        if (preferredDate && p.leaves && p.leaves.length > 0) {
          const onLeave = p.leaves.some(
            (l) => l.startDate <= preferredDate && l.endDate >= preferredDate,
          );
          if (onLeave) return false;
        }
        return true;
      })
      .filter((p) => {
        if (!normalizedQuery) return true;
        const inTitle = p.title?.toLowerCase().includes(normalizedQuery);
        const inDesc = p.description?.toLowerCase().includes(normalizedQuery);
        const inName = p.user.name?.toLowerCase().includes(normalizedQuery);
        const inServices = p.services.some((s) =>
          s.service.name.toLowerCase().includes(normalizedQuery),
        );
        return inTitle || inDesc || inName || inServices;
      })
      .map((p) => {
        const distance = haversineKm(q, {
          latitude: p.latitude!,
          longitude: p.longitude!,
        });
        const avg = p.reviews.length
          ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length
          : 2.5;

        const bookings = p.bookings;
        const finished = bookings.filter((b) =>
          ["COMPLETED", "REVIEWED"].includes(b.status),
        ).length;
        const terminal = bookings.filter((b) =>
          [
            "COMPLETED",
            "REVIEWED",
            "CANCELLED_BY_PROVIDER",
            "NO_SHOW",
          ].includes(b.status),
        ).length;

        const response = bookings.length
          ? (100 * bookings.filter((b) => b.status !== "PENDING").length) / bookings.length
          : 50;
        const completion = terminal ? (100 * finished) / terminal : 50;

        const activeServices = p.services.filter((s) => s.active);
        const prices = activeServices
          .map((s) => (s.startingPrice !== null ? Number(s.startingPrice) : null))
          .filter((v): v is number => v !== null);
        const minPrice = prices.length ? Math.min(...prices) : 0;

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          experienceYears: p.experienceYears,
          languages: p.languages,
          city: p.city,
          isOnline: p.isOnline,
          user: { name: p.user.name },
          services: activeServices,
          minStartingPrice: minPrice,
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
            availabilityScore: preferredDate
              ? availableAt(p.availability, preferredDate)
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
      .filter((p) => p.distanceKm <= Math.min(q.distanceKm, p.serviceRadiusKm));

    // Sort result
    switch (q.sortBy) {
      case "nearest":
        result.sort((a, b) => a.distanceKm - b.distanceKm);
        break;
      case "rating":
        result.sort((a, b) => b.averageRating - a.averageRating);
        break;
      case "trust":
        result.sort((a, b) => (b.trustScore?.score ?? 50) - (a.trustScore?.score ?? 50));
        break;
      case "price_asc":
        result.sort((a, b) => a.minStartingPrice - b.minStartingPrice);
        break;
      case "price_desc":
        result.sort((a, b) => b.minStartingPrice - a.minStartingPrice);
        break;
      case "recommended":
      default:
        result.sort((a, b) => b.rankingScore - a.rankingScore);
        break;
    }

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
        isOnline: true,
        user: { select: { name: true, profilePhotoUrl: true } },
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
