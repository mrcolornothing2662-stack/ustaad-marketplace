import { Router } from "express";
import { z } from "zod";
import { readFile, unlink } from "node:fs/promises";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
export const adminRouter = Router();
adminRouter.use(authenticate, authorize("ADMIN"));
adminRouter.get("/verifications", async (_req, res, next) => {
  try {
    res.json(
      await prisma.verificationRequest.findMany({
        where: {
          status: { in: ["PENDING", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"] },
        },
        include: {
          metadata: true,
          evidence: true,
          provider: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      }),
    );
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/verifications/:id/evidence", async (req, res, next) => {
  try {
    const f = await prisma.uploadedFile.findUnique({
      where: { verificationRequestId: String(req.params.id) },
    });
    if (!f || !f.expiresAt || f.expiresAt < new Date())
      throw new AppError(404, "Evidence unavailable or expired");
    res
      .type(f.mimeType)
      .send(await readFile(`private-uploads/${f.storageKey}`));
  } catch (e) {
    next(e);
  }
});
adminRouter.post("/verifications/:id/decision", async (req, res, next) => {
  try {
    const d = z
        .object({
          status: z.enum(["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"]),
          reason: z.string().max(2000).default(""),
        })
        .parse(req.body),
      actor = (req as AuthenticatedRequest).user!;
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.verificationRequest.update({
        where: { id: String(req.params.id) },
        data: {
          status: d.status,
          reviewedBy: actor.id,
          verifiedAt: d.status === "APPROVED" ? new Date() : null,
          rejectionReason: d.reason,
        },
      });
      const badge =
        request.verificationType === "IDENTITY"
          ? "IDENTITY_VERIFIED"
          : request.verificationType === "SKILL"
            ? "SKILL_VERIFIED"
            : "BACKGROUND_VERIFIED";
      if (d.status === "APPROVED")
        await tx.providerBadge.upsert({
          where: {
            providerId_type: { providerId: request.providerId, type: badge },
          },
          create: { providerId: request.providerId, type: badge },
          update: {},
        });
      else {
        const other = await tx.verificationRequest.count({
          where: {
            providerId: request.providerId,
            verificationType: request.verificationType,
            status: "APPROVED",
          },
        });
        if (!other)
          await tx.providerBadge.deleteMany({
            where: { providerId: request.providerId, type: badge },
          });
      }
      const count = await tx.providerBadge.count({
          where: {
            providerId: request.providerId,
            type: { in: ["IDENTITY_VERIFIED", "SKILL_VERIFIED"] },
          },
        }),
        p = await tx.providerProfile.findUniqueOrThrow({
          where: { id: request.providerId },
          include: { user: true, services: true, availability: true },
        });
      const approvedProfile = await tx.providerProfile.update({
        where: { id: p.id },
        data: {
          approvedAt:
            count === 2 &&
            p.user.phoneVerifiedAt &&
            p.title &&
            p.description &&
            p.latitude !== null &&
            p.longitude !== null &&
            p.services.some((s) => s.active) &&
            p.availability.some((a) => a.enabled)
              ? new Date()
              : null,
        },
      });
      if (p.user.status !== "SUSPENDED")
        await tx.user.update({
          where: { id: p.userId },
          data: {
            status: approvedProfile.approvedAt
              ? "ACTIVE"
              : "VERIFICATION_REQUIRED",
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "VERIFICATION_DECISION",
          targetType: "VerificationRequest",
          targetId: request.id,
          metadata: d,
        },
      });
      await tx.notification.create({
        data: {
          userId: p.userId,
          title: "Verification update",
          body: `${request.verificationType}: ${d.status}. ${d.reason}`,
        },
      });
      return request;
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});
adminRouter.post("/providers/:id/suspend", async (req, res, next) => {
  try {
    const actor = (req as AuthenticatedRequest).user!,
      p = await prisma.providerProfile.update({
        where: { id: String(req.params.id) },
        data: {
          user: { update: { status: "SUSPENDED" } },
          listingPaused: true,
        },
      });
    await prisma.refreshToken.updateMany({
      where: { userId: p.userId },
      data: { revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PROVIDER_SUSPENDED",
        targetType: "ProviderProfile",
        targetId: p.id,
      },
    });
    res.json({ id: p.id, suspended: true });
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/complaints", async (_req, res, next) => {
  try {
    res.json(
      await prisma.complaint.findMany({ orderBy: { createdAt: "desc" } }),
    );
  } catch (e) {
    next(e);
  }
});
adminRouter.post("/complaints/:id/resolve", async (req, res, next) => {
  try {
    const actor = (req as AuthenticatedRequest).user!,
      d = z
        .object({
          status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED"]),
          resolution: z.string().min(3).max(4000),
        })
        .parse(req.body);
    res.json(
      await prisma.$transaction(async (tx) => {
        const c = await tx.complaint.update({
          where: { id: String(req.params.id) },
          data: d,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "COMPLAINT_DECISION",
            targetType: "Complaint",
            targetId: c.id,
            metadata: d,
          },
        });
        return c;
      }),
    );
  } catch (e) {
    next(e);
  }
});
adminRouter.post("/evidence/cleanup", async (_req, res, next) => {
  try {
    const rows = await prisma.uploadedFile.findMany({
      where: { expiresAt: { lt: new Date() } },
    });
    for (const f of rows) {
      await unlink(`private-uploads/${f.storageKey}`).catch(() => {});
      await prisma.uploadedFile.delete({ where: { id: f.id } });
    }
    res.json({ deleted: rows.length });
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/audit-logs", async (_r, res, next) => {
  try {
    res.json(
      await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/metrics", async (_req, res, next) => {
  try {
    const [
      totalUsers,
      activeProviders,
      pendingVerifications,
      completedBookings,
      cancelledBookings,
      openComplaints,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.providerProfile.count({
        where: { approvedAt: { not: null }, listingPaused: false },
      }),
      prisma.verificationRequest.count({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.booking.count({
        where: { status: { in: ["COMPLETED", "REVIEWED"] } },
      }),
      prisma.booking.count({
        where: {
          status: {
            in: ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_PROVIDER", "NO_SHOW"],
          },
        },
      }),
      prisma.complaint.count({ where: { status: "OPEN" } }),
    ]);

    res.json({
      totalUsers,
      activeProviders,
      pendingVerifications,
      completedBookings,
      cancelledBookings,
      openComplaints,
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/bookings/:id/resolve-dispute", async (req, res, next) => {
  try {
    const actor = (req as AuthenticatedRequest).user!;
    const { status, note } = z
      .object({
        status: z.enum(["COMPLETED", "CANCELLED_BY_PROVIDER"]),
        note: z.string().min(5).max(2000),
      })
      .parse(req.body);

    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!booking) throw new AppError(404, "Booking not found");
    if (booking.status !== "DISPUTED") {
      throw new AppError(409, "Booking is not in DISPUTED status");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id: booking.id, status: "DISPUTED" },
        data: {
          status,
          statusHistory: {
            create: {
              fromStatus: "DISPUTED",
              toStatus: status,
              actorId: actor.id,
              note: `Admin dispute resolution: ${note}`,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "DISPUTE_RESOLVED",
          targetType: "Booking",
          targetId: booking.id,
          metadata: { resolvedTo: status, note },
        },
      });

      return b;
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});
