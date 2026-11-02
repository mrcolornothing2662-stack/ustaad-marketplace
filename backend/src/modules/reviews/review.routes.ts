import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { AiServiceClient } from "../../integrations/ai-service/ai.client";
import { calculateTrustScore } from "../trust-score/trust-score.service";
const ai = new AiServiceClient();
export const reviewRouter = Router();
reviewRouter.use(authenticate, authorize("CUSTOMER"));
reviewRouter.post("/", async (req, res, next) => {
  try {
    const input = z
        .object({
          bookingId: z.string().uuid(),
          rating: z.number().int().min(1).max(5),
          text: z.string().trim().min(3).max(4000),
        })
        .parse(req.body),
      u = (req as AuthenticatedRequest).user!;
    const booking = await prisma.booking.findFirst({
      where: { id: input.bookingId, customer: { userId: u.id } },
      include: { review: true },
    });
    if (!booking) throw new AppError(403, "Not your booking");
    if (booking.status !== "COMPLETED" || booking.review)
      throw new AppError(
        409,
        "Only an unreviewed completed booking can be reviewed",
      );
    let sentiment: { label: string; score: number; modelVersion: string };
    try {
      sentiment = await ai.analyzeSentiment(input.text);
    } catch {
      sentiment = {
        label: "PENDING",
        score: 0.5,
        modelVersion: "pending-retry",
      };
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.providerId}))`;
      const review = await tx.review.create({
        data: {
          ...input,
          providerId: booking.providerId,
          sentiment: {
            create: { ...sentiment, pending: sentiment.label === "PENDING" },
          },
        },
      });
      const p = await tx.providerProfile.findUniqueOrThrow({
        where: { id: booking.providerId },
        include: {
          user: true,
          badges: true,
          reviews: {
            where: { moderationStatus: "APPROVED" },
            include: { sentiment: true },
          },
          bookings: true,
          trustScore: true,
        },
      });
      const avg =
          p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length,
        sent =
          p.reviews.reduce((s, r) => s + (r.sentiment?.score ?? 0.5) * 100, 0) /
          p.reviews.length;
      const terminal = p.bookings.filter((b) =>
          [
            "COMPLETED",
            "REVIEWED",
            "NO_SHOW",
            "CANCELLED_BY_PROVIDER",
          ].includes(b.status),
        ),
        done = terminal.filter((b) =>
          ["COMPLETED", "REVIEWED"].includes(b.status),
        ).length;
      const trust = calculateTrustScore({
        identityVerification: p.badges.some(
          (b) => b.type === "IDENTITY_VERIFIED",
        )
          ? 100
          : 0,
        skillVerification: p.badges.some((b) => b.type === "SKILL_VERIFIED")
          ? 100
          : 0,
        normalizedRating: avg * 20,
        reviewSentiment: sent,
        completionRate: terminal.length ? (done / terminal.length) * 100 : 50,
        responseRate: p.bookings.length
          ? (p.bookings.filter((b) => b.status !== "PENDING").length /
              p.bookings.length) *
            100
          : 50,
        accountStanding: p.user.status === "ACTIVE" ? 100 : 0,
        providerCancellations: p.bookings.filter(
          (b) => b.status === "CANCELLED_BY_PROVIDER",
        ).length,
        noShows: p.bookings.filter((b) => b.status === "NO_SHOW").length,
      });
      const scoreData = {
        score: trust.score,
        components: trust.components,
        formulaVersion: trust.formulaVersion,
      };
      await tx.trustScore.upsert({
        where: { providerId: p.id },
        create: { providerId: p.id, ...scoreData },
        update: scoreData,
      });
      await tx.trustScoreHistory.create({
        data: {
          providerId: p.id,
          previousScore: p.trustScore?.score ?? 50,
          newScore: trust.score,
          components: trust.components,
          reason: "REVIEW_SUBMITTED",
          formulaVersion: trust.formulaVersion,
        },
      });
      await tx.booking.update({
        where: { id: booking.id, status: "COMPLETED" },
        data: {
          status: "REVIEWED",
          statusHistory: {
            create: {
              fromStatus: "COMPLETED",
              toStatus: "REVIEWED",
              actorId: u.id,
            },
          },
        },
      });
      return { ...review, trustScore: trust.score };
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});
