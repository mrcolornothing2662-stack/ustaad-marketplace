import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
export const verificationRouter = Router();
verificationRouter.use(authenticate, authorize("PROVIDER"));
const doc = z.enum([
  "AADHAAR",
  "DRIVING_LICENCE",
  "PASSPORT",
  "VOTER_ID",
  "PAN",
  "ITI",
  "APPRENTICESHIP",
  "SKILL_INDIA",
  "TRADE_LICENCE",
  "DIPLOMA",
  "OTHER",
]);
verificationRouter.post("/digilocker/start", async (req, res, next) => {
  try {
    if (env.NODE_ENV === "production")
      throw new AppError(503, "Live DigiLocker adapter is not configured");
    const d = z
        .object({ documentType: doc, consent: z.literal(true) })
        .parse(req.body),
      u = (req as AuthenticatedRequest).user!,
      p = await prisma.providerProfile.findUniqueOrThrow({
        where: { userId: u.id },
      }),
      state = randomUUID();
    const request = await prisma.verificationRequest.create({
      data: {
        providerId: p.id,
        verificationType: "IDENTITY",
        documentType: d.documentType,
        source: "DEVELOPMENT_DIGILOCKER",
        consentRecordedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: u.id,
        action: "IDENTITY_CHALLENGE",
        targetType: "VerificationRequest",
        targetId: request.id,
        metadata: { state },
      },
    });
    res.status(201).json({ requestId: request.id, state, development: true });
  } catch (e) {
    next(e);
  }
});
verificationRouter.post("/digilocker/callback", async (req, res, next) => {
  try {
    if (env.NODE_ENV === "production")
      throw new AppError(503, "Live DigiLocker adapter is not configured");
    const d = z
        .object({
          requestId: z.string().uuid(),
          state: z.string().uuid(),
          code: z.literal("development-consent"),
        })
        .parse(req.body),
      u = (req as AuthenticatedRequest).user!;
    const request = await prisma.verificationRequest.findFirst({
      where: {
        id: d.requestId,
        provider: { userId: u.id },
        status: "PENDING",
        source: "DEVELOPMENT_DIGILOCKER",
      },
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        targetId: d.requestId,
        actorId: u.id,
        action: "IDENTITY_CHALLENGE",
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      !request ||
      !audit ||
      Date.now() - audit.createdAt.getTime() > 600000 ||
      (audit.metadata as any)?.state !== d.state
    )
      throw new AppError(400, "Invalid or expired identity challenge");
    res.json(
      await prisma.verificationRequest.update({
        where: { id: request.id, status: "PENDING" },
        data: {
          status: "UNDER_REVIEW",
          metadata: {
            create: {
              issuerName: "Development identity evidence",
              maskedReference: "XXXX-XXXX-1234",
              sourceVerified: false,
            },
          },
        },
      }),
    );
  } catch (e) {
    next(e);
  }
});
verificationRouter.post("/skill", async (req, res, next) => {
  try {
    const d = z
        .object({
          documentType: doc,
          mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
          contentBase64: z.string().min(4).max(7000000),
        })
        .parse(req.body),
      p = await prisma.providerProfile.findUniqueOrThrow({
        where: { userId: (req as AuthenticatedRequest).user!.id },
      });
    const bytes = Buffer.from(d.contentBase64, "base64");
    if (bytes.length > 5000000 || !bytes.length)
      throw new AppError(400, "Upload must be between 1 byte and 5 MB");
    const valid =
      d.mimeType === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : d.mimeType === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216;
    if (!valid) throw new AppError(400, "File content does not match its type");
    const storageKey = randomUUID();
    await mkdir("private-uploads", { recursive: true, mode: 0o700 });
    await writeFile(`private-uploads/${storageKey}`, bytes, { mode: 0o600 });
    res.status(201).json(
      await prisma.verificationRequest.create({
        data: {
          providerId: p.id,
          verificationType: "SKILL",
          documentType: d.documentType,
          source: "USER_UPLOAD",
          evidence: {
            create: {
              storageKey,
              mimeType: d.mimeType,
              sizeBytes: bytes.length,
              expiresAt: new Date(Date.now() + 7 * 86400000),
            },
          },
        },
      }),
    );
  } catch (e) {
    next(e);
  }
});
