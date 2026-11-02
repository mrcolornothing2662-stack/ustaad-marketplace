import { BookingStatus, UserRole } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import type { TransitionContext, TransitionRule } from "./booking.types";
export const transitionMap: Record<BookingStatus, TransitionRule[]> = {
  PENDING: [
    { next: BookingStatus.ACCEPTED, roles: [UserRole.PROVIDER] },
    { next: BookingStatus.REJECTED, roles: [UserRole.PROVIDER] },
    { next: BookingStatus.CANCELLED_BY_CUSTOMER, roles: [UserRole.CUSTOMER] },
  ],
  ACCEPTED: [
    { next: BookingStatus.CONFIRMED, roles: [UserRole.CUSTOMER] },
    { next: BookingStatus.CANCELLED_BY_PROVIDER, roles: [UserRole.PROVIDER] },
  ],
  CONFIRMED: [
    { next: BookingStatus.PROVIDER_ON_THE_WAY, roles: [UserRole.PROVIDER] },
    { next: BookingStatus.CANCELLED_BY_CUSTOMER, roles: [UserRole.CUSTOMER] },
    { next: BookingStatus.CANCELLED_BY_PROVIDER, roles: [UserRole.PROVIDER] },
  ],
  PROVIDER_ON_THE_WAY: [
    {
      next: BookingStatus.IN_PROGRESS,
      roles: [UserRole.PROVIDER],
      requires: "OTP",
    },
    { next: BookingStatus.NO_SHOW, roles: [UserRole.CUSTOMER, UserRole.ADMIN] },
  ],
  IN_PROGRESS: [
    {
      next: BookingStatus.AWAITING_CUSTOMER_CONFIRMATION,
      roles: [UserRole.PROVIDER],
      requires: "FINAL_AMOUNT",
    },
    {
      next: BookingStatus.DISPUTED,
      roles: [UserRole.CUSTOMER, UserRole.PROVIDER],
    },
  ],
  AWAITING_CUSTOMER_CONFIRMATION: [
    { next: BookingStatus.COMPLETED, roles: [UserRole.CUSTOMER] },
    { next: BookingStatus.DISPUTED, roles: [UserRole.CUSTOMER] },
  ],
  COMPLETED: [
    { next: BookingStatus.REVIEWED, roles: [UserRole.CUSTOMER] },
    { next: BookingStatus.DISPUTED, roles: [UserRole.CUSTOMER] },
  ],
  REVIEWED: [],
  REJECTED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_PROVIDER: [],
  NO_SHOW: [],
  DISPUTED: [
    { next: BookingStatus.COMPLETED, roles: [UserRole.ADMIN] },
    { next: BookingStatus.CANCELLED_BY_PROVIDER, roles: [UserRole.ADMIN] },
  ],
};
export function assertTransition(
  current: BookingStatus,
  next: BookingStatus,
  context: TransitionContext,
): void {
  const rule = transitionMap[current]?.find(
    (item) => item.next === next && item.roles.includes(context.role),
  );
  if (!rule)
    throw new AppError(
      409,
      `Transition ${current} → ${next} is not allowed for ${context.role}`,
      "INVALID_BOOKING_TRANSITION",
    );
  if (rule.requires === "OTP" && !context.hasOtp)
    throw new AppError(400, "Valid job-start OTP required", "OTP_REQUIRED");
  if (rule.requires === "FINAL_AMOUNT" && !context.hasFinalAmount)
    throw new AppError(400, "Final amount required", "FINAL_AMOUNT_REQUIRED");
}
