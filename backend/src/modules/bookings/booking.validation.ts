import { z } from "zod";
export const bookingInput = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  problemDescription: z.string().trim().min(3).max(4000),
  addressText: z.string().trim().min(3).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  preferredAt: z.iso.datetime(),
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
  const local = new Date(date.getTime() + 330 * 60000),
    day = local.getUTCDay(),
    time = local.toISOString().slice(11, 16);
  return rows.some(
    (a) =>
      a.enabled && a.weekday === day && a.startTime <= time && a.endTime > time,
  );
}
