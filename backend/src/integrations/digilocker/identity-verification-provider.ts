import type { DocumentType } from "@prisma/client";
export interface VerifiedIdentity {
  issuerName: string;
  maskedReference: string;
  name: string;
  dateOfBirth: string;
  photoAvailable: boolean;
  sourceVerified: boolean;
}
export interface IdentityVerificationProvider {
  createAuthorization(
    providerId: string,
    documentType: DocumentType,
  ): Promise<{ authorizationUrl: string; state: string }>;
  exchangeCallback(code: string, state: string): Promise<VerifiedIdentity>;
}
