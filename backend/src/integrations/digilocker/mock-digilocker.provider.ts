import { randomUUID } from "node:crypto";
import type { DocumentType } from "@prisma/client";
import type {
  IdentityVerificationProvider,
  VerifiedIdentity,
} from "./identity-verification-provider";
export class MockDigiLockerProvider implements IdentityVerificationProvider {
  async createAuthorization(providerId: string, documentType: DocumentType) {
    const state = randomUUID();
    return {
      state,
      authorizationUrl: `http://localhost:4000/api/v1/verification/mock-consent?provider=${providerId}&document=${documentType}&state=${state}`,
    };
  }
  async exchangeCallback(
    _code: string,
    _state: string,
  ): Promise<VerifiedIdentity> {
    return {
      issuerName: "Government Demo Issuer",
      maskedReference: "XXXX-XXXX-1234",
      name: "Development Provider",
      dateOfBirth: "1990-01-01",
      photoAvailable: true,
      sourceVerified: true,
    };
  }
}
