import type { BookingStatus, UserRole } from "@prisma/client";
export interface TransitionContext {
  role: UserRole;
  hasOtp?: boolean;
  hasFinalAmount?: boolean;
}
export interface TransitionRule {
  next: BookingStatus;
  roles: UserRole[];
  requires?: "OTP" | "FINAL_AMOUNT";
}
