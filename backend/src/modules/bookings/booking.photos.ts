import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { getStorageProvider } from "../../integrations/storage/storage.provider";

export const photoRouter = Router();
photoRouter.use(authenticate);

async function own(id: string, userId: string) {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { customer: true, provider: true },
  });
  if (!b || ![b.customer.userId, b.provider.userId].includes(userId)) {
    throw new AppError(404, "Booking not found");
  }
  return b;
}

function validateImage(mimeType: string, bytes: Buffer): boolean {
  if (!bytes.length || bytes.length > 5000000) return false;
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 255 && bytes[1] === 216;
  }
  return false;
}

/**
 * Customer problem photos uploaded before provider visit (preserved).
 */
photoRouter.post("/:id/photos", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    const b = await own(String(req.params.id), u.id);
    if (
      b.customer.userId !== u.id ||
      !["PENDING", "ACCEPTED", "CONFIRMED"].includes(b.status)
    ) {
      throw new AppError(
        403,
        "Photos can only be added by the customer before the visit",
      );
    }
    if ((await prisma.uploadedFile.count({ where: { bookingId: b.id } })) >= 15) {
      throw new AppError(400, "Maximum photo upload limit reached for this booking");
    }
    const d = z
      .object({
        mimeType: z.enum(["image/png", "image/jpeg"]),
        contentBase64: z.string().min(4).max(7000000),
      })
      .parse(req.body);
    const bytes = Buffer.from(d.contentBase64, "base64");
    if (!validateImage(d.mimeType, bytes)) {
      throw new AppError(400, "Invalid image content or size exceeds 5 MB");
    }
    const storageKey = randomUUID();
    await getStorageProvider().upload({ storageKey, buffer: bytes, mimeType: d.mimeType });
    const f = await prisma.uploadedFile.create({
      data: {
        bookingId: b.id,
        storageKey,
        mimeType: d.mimeType,
        sizeBytes: bytes.length,
        category: "GENERAL",
      },
    });
    res.status(201).json({ id: f.id, mimeType: f.mimeType, category: f.category });
  } catch (e) {
    next(e);
  }
});

/**
 * Worker uploads before-work and after-work completion evidence photos.
 */
photoRouter.post("/:id/evidence", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!;
    const b = await own(String(req.params.id), u.id);
    if (b.provider.userId !== u.id) {
      throw new AppError(403, "Only the assigned provider can upload work evidence");
    }
    if (!["IN_PROGRESS", "AWAITING_CUSTOMER_CONFIRMATION"].includes(b.status)) {
      throw new AppError(
        409,
        "Work evidence can only be uploaded while work is in progress or awaiting confirmation",
      );
    }
    const d = z
      .object({
        category: z.enum(["BEFORE_WORK", "AFTER_WORK"]),
        mimeType: z.enum(["image/png", "image/jpeg"]),
        contentBase64: z.string().min(4).max(7000000),
      })
      .parse(req.body);
    const bytes = Buffer.from(d.contentBase64, "base64");
    if (!validateImage(d.mimeType, bytes)) {
      throw new AppError(400, "Invalid image content or size exceeds 5 MB");
    }
    const storageKey = randomUUID();
    await getStorageProvider().upload({ storageKey, buffer: bytes, mimeType: d.mimeType });
    const f = await prisma.uploadedFile.create({
      data: {
        bookingId: b.id,
        storageKey,
        mimeType: d.mimeType,
        sizeBytes: bytes.length,
        category: d.category,
      },
    });
    res.status(201).json({ id: f.id, mimeType: f.mimeType, category: f.category });
  } catch (e) {
    next(e);
  }
});

photoRouter.get("/:id/photos", async (req, res, next) => {
  try {
    await own(String(req.params.id), (req as AuthenticatedRequest).user!.id);
    res.json(
      await prisma.uploadedFile.findMany({
        where: { bookingId: String(req.params.id) },
        select: { id: true, mimeType: true, sizeBytes: true, category: true, createdAt: true },
      }),
    );
  } catch (e) {
    next(e);
  }
});

photoRouter.get("/:id/photos/:photoId", async (req, res, next) => {
  try {
    await own(String(req.params.id), (req as AuthenticatedRequest).user!.id);
    const f = await prisma.uploadedFile.findFirst({
      where: {
        id: String(req.params.photoId),
        bookingId: String(req.params.id),
      },
    });
    if (!f) throw new AppError(404, "Photo not found");
    const bytes = await getStorageProvider().download(f.storageKey);
    res.type(f.mimeType).send(bytes);
  } catch (e) {
    next(e);
  }
});
