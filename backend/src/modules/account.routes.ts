import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { authenticate } from "../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../common/types/authenticated-request";
import { AppError } from "../common/errors/app-error";
import { authService } from "./auth/auth.service";
import { getStorageProvider } from "../integrations/storage/storage.provider";

export const accountRouter = Router();

accountRouter.get("/photo/:key", async (req, res, next) => {
  try {
    const bytes = await getStorageProvider().download(String(req.params.key));
    res.type("image/jpeg").send(bytes);
  } catch (e) {
    next(e);
  }
});

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
        preferredLanguage: true,
        preferredTheme: true,
        profilePhotoUrl: true,
        customerProfile: { include: { addresses: true } },
        providerProfile: {
          include: {
            services: true,
            availability: true,
            leaves: true,
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
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        profilePhotoUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const updateData: { name?: string; profilePhotoUrl?: string } = {};
    if (d.name !== undefined) updateData.name = d.name;
    if (d.profilePhotoUrl !== undefined) updateData.profilePhotoUrl = d.profilePhotoUrl;

    res.json(
      await prisma.user.update({
        where: { id: who(req).id },
        data: updateData,
        select: { id: true, name: true, profilePhotoUrl: true },
      }),
    );
  } catch (e) {
    next(e);
  }
});

accountRouter.put("/preferences", async (req, res, next) => {
  try {
    const d = z
      .object({
        language: z.enum(["en", "hi", "pa"]).optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
      })
      .parse(req.body);

    const updateData: any = {};
    if (d.language) {
      updateData.preferredLanguage = d.language.toUpperCase();
    }
    if (d.theme) {
      updateData.preferredTheme = d.theme.toUpperCase();
    }

    const updated = await prisma.user.update({
      where: { id: who(req).id },
      data: updateData,
      select: { id: true, preferredLanguage: true, preferredTheme: true },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

accountRouter.post("/profile-photo", async (req, res, next) => {
  try {
    const d = z
      .object({
        mimeType: z.enum(["image/png", "image/jpeg"]),
        contentBase64: z.string().min(4).max(7000000),
      })
      .parse(req.body);

    const bytes = Buffer.from(d.contentBase64, "base64");
    if (bytes.length > 5000000 || !bytes.length) {
      throw new AppError(400, "Image must be between 1 byte and 5 MB");
    }

    const valid =
      d.mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes[0] === 255 && bytes[1] === 216;
    if (!valid) throw new AppError(400, "Invalid image content");

    const storageKey = randomUUID();
    await getStorageProvider().upload({ storageKey, buffer: bytes, mimeType: d.mimeType });

    const photoUrl = `/api/v1/account/photo/${storageKey}`;
    const user = who(req);

    await prisma.user.update({
      where: { id: user.id },
      data: { profilePhotoUrl: photoUrl },
    });

    if (user.role === "PROVIDER") {
      await prisma.providerProfile.updateMany({
        where: { userId: user.id },
        data: { profilePhotoUrl: photoUrl },
      });
    }

    res.json({ profilePhotoUrl: photoUrl });
  } catch (e) {
    next(e);
  }
});

accountRouter.post("/change-phone/request", async (req, res, next) => {
  try {
    const { newPhone } = z
      .object({
        newPhone: z.string().regex(/^\+91[6-9]\d{9}$/, "Must be an Indian mobile number (+91...)"),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing) {
      throw new AppError(409, "Phone number is already associated with another account");
    }

    const result = await authService.sendOtp(newPhone);
    res.json({ message: "Verification OTP dispatched to new phone number", ...result });
  } catch (e) {
    next(e);
  }
});

accountRouter.post("/change-phone/confirm", async (req, res, next) => {
  try {
    const { newPhone, otp } = z
      .object({
        newPhone: z.string().regex(/^\+91[6-9]\d{9}$/),
        otp: z.string().regex(/^\d{6}$/),
      })
      .parse(req.body);

    await authService.verifyOtp(newPhone, otp);

    const updated = await prisma.user.update({
      where: { id: who(req).id },
      data: { phone: newPhone, phoneVerifiedAt: new Date() },
      select: { id: true, phone: true, phoneVerifiedAt: true },
    });

    res.json({ message: "Phone number updated successfully", user: updated });
  } catch (e) {
    next(e);
  }
});

accountRouter.put("/change-password", async (req, res, next) => {
  try {
    const d = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      })
      .parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: who(req).id } });
    const matches = await bcrypt.compare(d.currentPassword, user.passwordHash);
    if (!matches) {
      throw new AppError(401, "Current password does not match");
    }

    const newHash = await bcrypt.hash(d.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      }),
    ]);

    res.json({ success: true, message: "Password updated successfully" });
  } catch (e) {
    next(e);
  }
});

accountRouter.delete("/", async (req, res, next) => {
  try {
    const userId = who(req).id;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          deletedAt: new Date(),
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
      prisma.deviceToken.deleteMany({
        where: { userId },
      }),
    ]);
    res.json({ success: true, message: "Account deactivated and deleted" });
  } catch (e) {
    next(e);
  }
});

accountRouter.post("/favourites/:providerId", async (req, res, next) => {
  try {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!customer) throw new AppError(403, "Customer profile required");

    const fav = await prisma.customerFavourite.upsert({
      where: {
        customerId_providerId: {
          customerId: customer.id,
          providerId: String(req.params.providerId),
        },
      },
      create: {
        customerId: customer.id,
        providerId: String(req.params.providerId),
      },
      update: {},
    });
    res.status(201).json(fav);
  } catch (e) {
    next(e);
  }
});

accountRouter.delete("/favourites/:providerId", async (req, res, next) => {
  try {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!customer) throw new AppError(403, "Customer profile required");

    await prisma.customerFavourite.deleteMany({
      where: {
        customerId: customer.id,
        providerId: String(req.params.providerId),
      },
    });
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});

accountRouter.get("/favourites", async (req, res, next) => {
  try {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!customer) throw new AppError(403, "Customer profile required");

    const favourites = await prisma.customerFavourite.findMany({
      where: { customerId: customer.id },
      include: {
        provider: {
          include: {
            user: { select: { name: true, profilePhotoUrl: true } },
            services: { where: { active: true }, include: { service: true } },
            badges: true,
            trustScore: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(favourites);
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
accountRouter.get("/addresses", async (req, res, next) => {
  try {
    const p = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!p) throw new AppError(403, "Customer account required");
    res.json(
      await prisma.address.findMany({
        where: { customerProfileId: p.id },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (e) {
    next(e);
  }
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

accountRouter.put("/addresses/:id", async (req, res, next) => {
  try {
    const p = await prisma.customerProfile.findUnique({
      where: { userId: who(req).id },
    });
    if (!p) throw new AppError(403, "Customer account required");
    const d = address.partial().parse(req.body);
    const updateData: Record<string, any> = {};
    for (const [k, v] of Object.entries(d)) {
      if (v !== undefined) updateData[k] = v;
    }
    const updated = await prisma.address.updateMany({
      where: {
        id: String(req.params.id),
        customerProfileId: p.id,
      },
      data: updateData,
    });
    if (!updated.count) throw new AppError(404, "Address not found");
    res.json({ success: true, message: "Address updated" });
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

/**
 * Report inappropriate behavior or safety concerns.
 */
accountRouter.post("/reports", async (req, res, next) => {
  try {
    const user = who(req);
    const d = z
      .object({
        targetUserId: z.string().uuid(),
        bookingId: z.string().uuid().optional(),
        reason: z.string().trim().min(5).max(4000),
      })
      .parse(req.body);

    const report = await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "USER_REPORTED",
        targetType: "User",
        targetId: d.targetUserId,
        metadata: {
          reporterId: user.id,
          bookingId: d.bookingId,
          reason: d.reason,
          reportedAt: new Date(),
        },
      },
    });

    res.status(201).json({
      success: true,
      reportId: report.id,
      message: "Report received. Safety and compliance team will review.",
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Block another user from contacting or booking with current user.
 */
accountRouter.post("/blocks", async (req, res, next) => {
  try {
    const user = who(req);
    const { targetUserId } = z.object({ targetUserId: z.string().uuid() }).parse(req.body);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "USER_BLOCKED",
        targetType: "User",
        targetId: targetUserId,
        metadata: { blockedBy: user.id },
      },
    });

    res.status(201).json({ success: true, message: "User blocked successfully" });
  } catch (e) {
    next(e);
  }
});

accountRouter.get("/blocks", async (req, res, next) => {
  try {
    const user = who(req);
    const blocks = await prisma.auditLog.findMany({
      where: {
        actorId: user.id,
        action: "USER_BLOCKED",
      },
      select: { targetId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(blocks);
  } catch (e) {
    next(e);
  }
});

accountRouter.delete("/blocks/:userId", async (req, res, next) => {
  try {
    const user = who(req);
    await prisma.auditLog.deleteMany({
      where: {
        actorId: user.id,
        action: "USER_BLOCKED",
        targetId: String(req.params.userId),
      },
    });
    res.sendStatus(204);
  } catch (e) {
    next(e);
  }
});
