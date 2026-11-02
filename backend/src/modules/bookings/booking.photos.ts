import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
export const photoRouter = Router();
photoRouter.use(authenticate);
async function own(id: string, userId: string) {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: { customer: true, provider: true },
  });
  if (!b || ![b.customer.userId, b.provider.userId].includes(userId))
    throw new AppError(404, "Booking not found");
  return b;
}
photoRouter.post("/:id/photos", async (req, res, next) => {
  try {
    const u = (req as AuthenticatedRequest).user!,
      b = await own(String(req.params.id), u.id);
    if (
      b.customer.userId !== u.id ||
      !["PENDING", "ACCEPTED", "CONFIRMED"].includes(b.status)
    )
      throw new AppError(
        403,
        "Photos can only be added by the customer before the visit",
      );
    if ((await prisma.uploadedFile.count({ where: { bookingId: b.id } })) >= 5)
      throw new AppError(400, "Maximum five photos per booking");
    const d = z
        .object({
          mimeType: z.enum(["image/png", "image/jpeg"]),
          contentBase64: z.string().min(4).max(7000000),
        })
        .parse(req.body),
      bytes = Buffer.from(d.contentBase64, "base64");
    if (!bytes.length || bytes.length > 5000000)
      throw new AppError(400, "Image must be below 5 MB");
    const valid =
      d.mimeType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes[0] === 255 && bytes[1] === 216;
    if (!valid) throw new AppError(400, "Invalid image content");
    const storageKey = randomUUID();
    await mkdir("private-uploads", { recursive: true, mode: 0o700 });
    await writeFile(`private-uploads/${storageKey}`, bytes, { mode: 0o600 });
    const f = await prisma.uploadedFile.create({
      data: {
        bookingId: b.id,
        storageKey,
        mimeType: d.mimeType,
        sizeBytes: bytes.length,
      },
    });
    res.status(201).json({ id: f.id, mimeType: f.mimeType });
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
        select: { id: true, mimeType: true, sizeBytes: true },
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
    res
      .type(f.mimeType)
      .send(await readFile(`private-uploads/${f.storageKey}`));
  } catch (e) {
    next(e);
  }
});
