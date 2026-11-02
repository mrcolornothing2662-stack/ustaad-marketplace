import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getStorageProvider } from "../../integrations/storage/storage.provider";
import { prisma } from "../../config/database";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { getIdentityVerificationProvider } from "../../integrations/digilocker/identity-verification-provider";
import { matchNames } from "../../integrations/digilocker/digilocker.provider";

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
    const d = z
      .object({ documentType: doc, consent: z.literal(true) })
      .parse(req.body);
    const u = (req as AuthenticatedRequest).user!;
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: u.id },
      include: { user: true },
    });

    const provider = getIdentityVerificationProvider();
    const auth = await provider.createAuthorization(p.id, d.documentType);
    const expiresAt = new Date(Date.now() + 600000); // 10 minutes session

    const request = await prisma.verificationRequest.create({
      data: {
        providerId: p.id,
        verificationType: "IDENTITY",
        documentType: d.documentType,
        source: env.DIGILOCKER_ENV === "production" ? "DIGILOCKER_OFFICIAL" : "DIGILOCKER_SANDBOX",
        oauthState: auth.state,
        expiresAt,
        consentRecordedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: u.id,
        action: "IDENTITY_CHALLENGE",
        targetType: "VerificationRequest",
        targetId: request.id,
        metadata: {
          state: auth.state,
          codeVerifier: auth.codeVerifier,
          documentType: d.documentType,
        },
      },
    });

    res.status(201).json({
      requestId: request.id,
      state: auth.state,
      authorizationUrl: auth.authorizationUrl,
      expiresAt,
      development: true,
    });
  } catch (e) {
    next(e);
  }
});

verificationRouter.post("/digilocker/callback", async (req, res, next) => {
  try {
    const d = z
      .object({
        requestId: z.string().uuid(),
        state: z.string().uuid(),
        code: z.string().min(1),
      })
      .parse(req.body);
    const u = (req as AuthenticatedRequest).user!;

    const request = await prisma.verificationRequest.findFirst({
      where: {
        id: d.requestId,
        provider: { userId: u.id },
        status: "PENDING",
      },
      include: { provider: { include: { user: true } } },
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
    ) {
      throw new AppError(400, "Invalid or expired identity challenge");
    }

    const codeVerifier = (audit.metadata as any)?.codeVerifier;
    const provider = getIdentityVerificationProvider();

    // Exchange authorization code for verified identity
    const verified = await provider.exchangeCallback(d.code, d.state, codeVerifier);

    // Verify name match between declared user profile and government identity
    const declaredName = request.provider.user.name;
    const nameMatch = matchNames(declaredName, verified.name);

    const updated = await prisma.verificationRequest.update({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "UNDER_REVIEW",
        verifiedAt: nameMatch && verified.sourceVerified ? new Date() : null,
        metadata: {
          create: {
            issuerName: verified.issuerName,
            maskedReference: verified.maskedReference,
            nameMatch,
            photoMatch: verified.photoAvailable,
            sourceVerified: verified.sourceVerified,
            gender: verified.gender ?? null,
          },
        },
      },
      include: { metadata: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: u.id,
        action: "IDENTITY_VERIFIED",
        targetType: "VerificationRequest",
        targetId: request.id,
        metadata: {
          issuer: verified.issuerName,
          maskedReference: verified.maskedReference,
          nameMatch,
          sourceVerified: verified.sourceVerified,
        },
      },
    });

    res.json(updated);
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
      .parse(req.body);
    const p = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: (req as AuthenticatedRequest).user!.id },
    });

    const bytes = Buffer.from(d.contentBase64, "base64");
    if (bytes.length > 5000000 || !bytes.length) {
      throw new AppError(400, "Upload must be between 1 byte and 5 MB");
    }

    const valid =
      d.mimeType === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : d.mimeType === "image/png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216;

    if (!valid) throw new AppError(400, "File content does not match its type");

    const storageKey = randomUUID();
    await getStorageProvider().upload({ storageKey, buffer: bytes, mimeType: d.mimeType });

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
              category: "QUALIFICATION_DOC",
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
