import { z } from "zod";

export const bookingInput = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  problemDescription: z.string().trim().min(3).max(4000),
  addressText: z.string().trim().min(3).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  preferredAt: z.iso.datetime(),
  estimatedDurationMinutes: z.number().int().min(15).max(480).default(60).optional(),
  bufferMinutes: z.number().int().min(0).max(120).default(30).optional(),
  additionalInstructions: z.string().max(2000).default(""),
});

export const transitionInput = z.object({
  status: z.enum([
    "ACCEPTED",
    "REJECTED",
    "CONFIRMED",
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_PROVIDER",
    "PROVIDER_ON_THE_WAY",
    "IN_PROGRESS",
    "NO_SHOW",
    "AWAITING_CUSTOMER_CONFIRMATION",
    "COMPLETED",
    "DISPUTED",
  ]),
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  finalAmount: z.number().min(0).max(99999999).optional(),
  customerSignatureData: z.string().min(10).optional(),
  completionProofPhotoBase64: z.string().min(4).optional(),
  completionProofPhotoMimeType: z.enum(["image/png", "image/jpeg"]).optional(),
  completionNote: z.string().max(2000).optional(),
});

export const priceProposalInput = z.object({
  revisedPrice: z.number().positive().max(99999999),
  reason: z.string().trim().min(3).max(1000),
});

export const priceResponseInput = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
});

export const customerCompletionInput = z.object({
  customerSignatureData: z.string().min(10),
  proofPhotoBase64: z.string().min(4).optional(),
  proofPhotoMimeType: z.enum(["image/png", "image/jpeg"]).optional(),
  completionNote: z.string().max(2000).optional(),
});

export const occupied = [
  "PENDING",
  "ACCEPTED",
  "CONFIRMED",
  "PROVIDER_ON_THE_WAY",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER_CONFIRMATION",
] as const;

export function availableAt(
  rows: {
    weekday: number;
    startTime: string;
    endTime: string;
    enabled: boolean;
  }[],
  date: Date,
) {
  // Availability is interpreted in Asia/Kolkata, the project's initial service region.
  const local = new Date(date.getTime() + 330 * 60000);
  const day = local.getUTCDay();
  const time = local.toISOString().slice(11, 16);
  return rows.some(
    (a) =>
      a.enabled && a.weekday === day && a.startTime <= time && a.endTime > time,
  );
}
