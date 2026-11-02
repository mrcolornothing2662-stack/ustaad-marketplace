import { z } from "zod";
import { Router } from "express";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { providerRepository } from "./provider.repository";

export const providerRouter = Router();
providerRouter.use(authenticate, authorize("PROVIDER"));

providerRouter.get("/me", async (req, res, next) => {
  try {
    res.json(
      await providerRepository.findByUser(
        (req as AuthenticatedRequest).user!.id,
      ),
    );
  } catch (e) {
    next(e);
  }
});

providerRouter.put("/me", async (req, res, next) => {
  try {
    const b = z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().min(10).max(4000),
        experienceYears: z.number().int().min(0).max(80),
        languages: z.array(z.string().min(1)).min(1),
        city: z.string().min(2),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        serviceRadiusKm: z.number().positive().max(200),
      })
      .parse(req.body);
    res.json(
      await providerRepository.complete(
        (req as AuthenticatedRequest).user!.id,
        {
          title: b.title,
          description: b.description,
          experienceYears: b.experienceYears,
          languages: b.languages,
          city: b.city,
          latitude: b.latitude,
          longitude: b.longitude,
          serviceRadiusKm: b.serviceRadiusKm,
        },
      ),
    );
  } catch (e) {
    next(e);
  }
});

/**
 * Worker online/offline availability toggle.
 * Directly controls discovery in search and ability to receive incoming jobs.
 */
providerRouter.put("/online-status", async (req, res, next) => {
  try {
    const { isOnline } = z.object({ isOnline: z.boolean() }).parse(req.body);
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.update({
      where: { userId: user.id },
      data: { isOnline },
      select: { id: true, isOnline: true },
    });
    res.json(p);
  } catch (e) {
    next(e);
  }
});

/**
 * Leave / Holiday Management for workers.
 */
providerRouter.post("/leaves", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });

    const d = z
      .object({
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
        reason: z.string().max(500).optional(),
      })
      .refine(
        (x) => new Date(x.startDate) < new Date(x.endDate),
        "End date must follow start date",
      )
      .parse(req.body);

    const leave = await prisma.providerLeave.create({
      data: {
        providerId: p.id,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        reason: d.reason ?? null,
      },
    });

    res.status(201).json(leave);
  } catch (e) {
    next(e);
  }
});

providerRouter.get("/leaves", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });

    const leaves = await prisma.providerLeave.findMany({
      where: { providerId: p.id },
      orderBy: { startDate: "asc" },
    });

    res.json(leaves);
  } catch (e) {
    next(e);
  }
});

providerRouter.delete("/leaves/:id", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });

    await prisma.providerLeave.deleteMany({
      where: { id: String(req.params.id), providerId: p.id },
    });

    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

/**
 * Worker Dashboard & Earnings Analytics.
 */
providerRouter.get("/dashboard", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
      include: {
        services: { where: { active: true }, include: { service: true } },
        availability: { where: { enabled: true } },
        badges: true,
        trustScore: true,
        reviews: { where: { moderationStatus: "APPROVED" } },
        bookings: {
          include: {
            paymentRecord: true,
          },
        },
      },
    });

    // Completed bookings
    const completedBookings = p.bookings.filter((b) =>
      ["COMPLETED", "REVIEWED"].includes(b.status),
    );

    // Earnings calculation: sum of final amounts from completed bookings with settled/confirmed payment
    const totalEarnings = completedBookings.reduce((sum, b) => {
      const amt = b.finalAmount ? Number(b.finalAmount) : b.estimatedPrice ? Number(b.estimatedPrice) : 0;
      return sum + amt;
    }, 0);

    // Profile completion calculation (0-100%)
    let completionScore = 0;
    if (p.title && p.description) completionScore += 20;
    if (p.profilePhotoUrl) completionScore += 15;
    if (p.latitude !== null && p.longitude !== null) completionScore += 15;
    if (p.services.length > 0) completionScore += 15;
    if (p.availability.length > 0) completionScore += 15;
    if (p.badges.some((b) => b.type === "MOBILE_VERIFIED")) completionScore += 10;
    if (p.badges.some((b) => b.type === "IDENTITY_VERIFIED")) completionScore += 10;

    // Ratings
    const avgRating = p.reviews.length
      ? Number((p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length).toFixed(1))
      : 0;

    // Upcoming bookings
    const upcomingCount = p.bookings.filter((b) =>
      ["CONFIRMED", "PROVIDER_ON_THE_WAY"].includes(b.status),
    ).length;

    // Terminal counts for acceptance & cancellation rates
    const terminal = p.bookings.filter((b) =>
      ["COMPLETED", "REVIEWED", "CANCELLED_BY_PROVIDER", "NO_SHOW"].includes(b.status),
    );
    const cancelledCount = p.bookings.filter((b) => b.status === "CANCELLED_BY_PROVIDER").length;
    const completionRate = terminal.length
      ? Math.round((completedBookings.length / terminal.length) * 100)
      : 100;

    res.json({
      providerId: p.id,
      isOnline: p.isOnline,
      approved: Boolean(p.approvedAt),
      profileCompletionPercentage: completionScore,
      totalEarnings,
      completedJobs: completedBookings.length,
      upcomingJobs: upcomingCount,
      averageRating: avgRating,
      reviewCount: p.reviews.length,
      completionRate,
      cancelledJobs: cancelledCount,
      trustScore: p.trustScore?.score ?? 50,
      badges: p.badges.map((b) => b.type),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Worker discovery for incoming booking leads.
 */
providerRouter.get("/leads", async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
      include: { services: true },
    });

    const activeServiceIds = p.services.filter((s) => s.active).map((s) => s.serviceId);

    const leads = await prisma.booking.findMany({
      where: {
        providerId: p.id,
        status: "PENDING",
        serviceId: { in: activeServiceIds },
      },
      include: {
        service: true,
        customer: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: { preferredAt: "asc" },
    });

    res.json(leads);
  } catch (e) {
    next(e);
  }
});
