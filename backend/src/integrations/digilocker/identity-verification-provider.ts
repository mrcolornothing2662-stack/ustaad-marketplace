import type { DocumentType } from "@prisma/client";
import { env } from "../../config/env";
import { MockDigiLockerProvider } from "./mock-digilocker.provider";
import { DigiLockerProvider } from "./digilocker.provider";

export interface VerifiedIdentity {
  issuerName: string;
  maskedReference: string;
  name: string;
  dateOfBirth: string;
  gender?: string | undefined;
  photoAvailable: boolean;
  sourceVerified: boolean;
  documentDetails?: Record<string, unknown> | undefined;
}

export interface IdentityVerificationProvider {
  createAuthorization(
    providerId: string,
    documentType: DocumentType,
    codeChallenge?: string | undefined,
  ): Promise<{ authorizationUrl: string; state: string; codeVerifier?: string | undefined }>;
  exchangeCallback(
    code: string,
    state: string,
    codeVerifier?: string | undefined,
  ): Promise<VerifiedIdentity>;
}

export function getIdentityVerificationProvider(): IdentityVerificationProvider {
  if (
    env.DIGILOCKER_ENV === "production" ||
    (env.DIGILOCKER_ENV === "sandbox" && env.DIGILOCKER_CLIENT_ID)
  ) {
    return new DigiLockerProvider();
  }
  return new MockDigiLockerProvider();
}
