import { randomUUID } from "node:crypto";
import type { DocumentType } from "@prisma/client";
import type {
  IdentityVerificationProvider,
  VerifiedIdentity,
} from "./identity-verification-provider";

export class MockDigiLockerProvider implements IdentityVerificationProvider {
  async createAuthorization(
    providerId: string,
    documentType: DocumentType,
    _codeChallenge?: string,
  ): Promise<{ authorizationUrl: string; state: string; codeVerifier?: string }> {
    const state = randomUUID();
    return {
      state,
      authorizationUrl: `http://localhost:4000/api/v1/verification/mock-consent?provider=${providerId}&document=${documentType}&state=${state}`,
      codeVerifier: "mock-code-verifier-12345",
    };
  }

  async exchangeCallback(
    _code: string,
    _state: string,
    _codeVerifier?: string,
  ): Promise<VerifiedIdentity> {
    return {
      issuerName: "Government Demo Issuer",
      maskedReference: "XXXX-XXXX-1234",
      name: "Development Provider",
      dateOfBirth: "1990-01-01",
      gender: "M",
      photoAvailable: true,
      sourceVerified: true,
    };
  }
}
