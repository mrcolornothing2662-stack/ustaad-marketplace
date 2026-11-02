import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate } from "../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../common/types/authenticated-request";
import { AppError } from "../common/errors/app-error";
export const accountRouter = Router();
accountRouter.use(authenticate);
const who = (r: any) => (r as AuthenticatedRequest).user!;
accountRouter.get("/profile", async (req, res, next) => {
  try {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: who(req).id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        phoneVerifiedAt: true,
        customerProfile: { include: { addresses: true } },
        providerProfile: {
          include: {
            services: true,
            availability: true,
            badges: true,
            verifications: { include: { metadata: true } },
            trustScore: true,
          },
        },
      },
    });
    res.json(u);
  } catch (e) {
    next(e);
  }
});
accountRouter.put("/profile", async (req, res, next) => {
  try {
    const d = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(req.body);
    res.json(
      await prisma.user.update({
        where: { id: who(req).id },
        data: d,
        select: { id: true, name: true },
      }),
    );
  } catch (e) {
    next(e);
  }
});
const address = z.object({
  label: z.string().min(1),
  line1: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(3),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
accountRouter.post("/addresses", async (req, res, next) => {
  try {
    const p = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!p) throw new AppError(403, "Customer account required");
    res.status(201).json(
      await prisma.address.create({
        data: { ...address.parse(req.body), customerProfileId: p.id },
      }),
    );
  } catch (e) {
    next(e);
  }
});
accountRouter.delete("/addresses/:id", async (req, res, next) => {
  try {
    await prisma.address.deleteMany({
      where: {
        id: String(req.params.id),
        customerProfile: { userId: who(req).id },
      },
    });
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});
async function provider(id: string) {
  const p = await prisma.providerProfile.findUnique({ where: { userId: id } });
  if (!p) throw new AppError(403, "Provider account required");
  return p;
}
accountRouter.put("/services/:serviceId", async (req, res, next) => {
  try {
    const p = await provider(who(req).id),
      d = z
        .object({
          startingPrice: z.number().min(0).max(99999999),
          description: z.string().max(2000).default(""),
          active: z.boolean().default(true),
        })
        .parse(req.body);
    res.json(
      await prisma.providerService.upsert({
        where: {
          providerId_serviceId: {
            providerId: p.id,
            serviceId: String(req.params.serviceId),
          },
        },
        create: {
          ...d,
          providerId: p.id,
          serviceId: String(req.params.serviceId),
        },
        update: d,
      }),
    );
  } catch (e) {
    next(e);
  }
});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
accountRouter.put("/availability", async (req, res, next) => {
  try {
    const p = await provider(who(req).id),
      d = z
        .array(
          z
            .object({
              weekday: z.number().int().min(0).max(6),
              startTime: time,
              endTime: time,
              enabled: z.boolean().default(true),
            })
            .refine(
              (x) => x.startTime < x.endTime,
              "End time must follow start time",
            ),
        )
        .max(21)
        .parse(req.body);
    await prisma.$transaction([
      prisma.providerAvailability.deleteMany({ where: { providerId: p.id } }),
      prisma.providerAvailability.createMany({
        data: d.map((x) => ({ ...x, providerId: p.id })),
      }),
    ]);
    res.json(d);
  } catch (e) {
    next(e);
  }
});
accountRouter.put("/listing", async (req, res, next) => {
  try {
    const p = await provider(who(req).id),
      d = z.object({ listingPaused: z.boolean() }).parse(req.body);
    res.json(
      await prisma.providerProfile.update({ where: { id: p.id }, data: d }),
    );
  } catch (e) {
    next(e);
  }
});
accountRouter.get("/reviews", async (req, res, next) => {
  try {
    const p = await provider(who(req).id);
    res.json(
      await prisma.review.findMany({
        where: { providerId: p.id, moderationStatus: "APPROVED" },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (e) {
    next(e);
  }
});
accountRouter.get("/trust-history", async (req, res, next) => {
  try {
    const p = await provider(who(req).id);
    res.json(
      await prisma.trustScoreHistory.findMany({
        where: { providerId: p.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    next(e);
  }
});
accountRouter.get("/notifications", async (req, res, next) => {
  try {
    res.json(
      await prisma.notification.findMany({
        where: { userId: who(req).id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    next(e);
  }
});
accountRouter.post("/notifications/:id/read", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: who(req).id },
      data: { readAt: new Date() },
    });
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});
accountRouter.post("/device-tokens", async (req, res, next) => {
  try {
    const d = z
      .object({
        token: z.string().min(10).max(500),
        platform: z.enum(["android", "ios", "web"]).default("android"),
      })
      .parse(req.body);

    const saved = await prisma.deviceToken.upsert({
      where: { token: d.token },
      create: {
        userId: who(req).id,
        token: d.token,
        platform: d.platform,
      },
      update: {
        userId: who(req).id,
        platform: d.platform,
      },
    });
    res.status(201).json({ id: saved.id, token: saved.token });
  } catch (e) {
    next(e);
  }
});

accountRouter.delete("/device-tokens/:token", async (req, res, next) => {
  try {
    await prisma.deviceToken.deleteMany({
      where: {
        token: String(req.params.token),
        userId: who(req).id,
      },
    });
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

accountRouter.post("/complaints", async (req, res, next) => {
  try {
    const u = who(req),
      d = z
        .object({
          bookingId: z.string().uuid(),
          reason: z.string().trim().min(10).max(4000),
        })
        .parse(req.body),
      b = await prisma.booking.findUnique({
        where: { id: d.bookingId },
        include: { customer: true, provider: true },
      });
    if (!b || ![b.customer.userId, b.provider.userId].includes(u.id))
      throw new AppError(403, "Not your booking");
    res
      .status(201)
      .json(
        await prisma.complaint.create({ data: { ...d, reporterId: u.id } }),
      );
  } catch (e) {
    next(e);
  }
});
accountRouter.get("/complaints", async (req, res, next) => {
  try {
    res.json(
      await prisma.complaint.findMany({
        where: { reporterId: who(req).id },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (e) {
    next(e);
  }
});
