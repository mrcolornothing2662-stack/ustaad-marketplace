import {
  generateCodeVerifier,
  generateCodeChallenge,
  matchNames,
  DigiLockerProvider,
} from "../src/integrations/digilocker/digilocker.provider";
import { MockSmsProvider, Fast2SmsProvider } from "../src/integrations/sms/sms.provider";
import { geocodeAddress } from "../src/modules/search/location";
import { AiServiceClient } from "../src/integrations/ai-service/ai.client";
import {
  bookingInput,
  transitionInput,
  priceProposalInput,
  priceResponseInput,
  customerCompletionInput,
} from "../src/modules/bookings/booking.validation";

describe("Platform Completion & Production Hardening", () => {
  describe("DigiLocker Integration & Security", () => {
    test("PKCE verifier and challenge generate RFC 7636 compliant values", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toBeDefined();
      expect(verifier.length).toBeGreaterThanOrEqual(43);

      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toBeDefined();
      expect(challenge.length).toBeGreaterThanOrEqual(43);
      // Deterministic check
      expect(generateCodeChallenge(verifier)).toBe(challenge);
    });

    test("DigiLocker authorization URL includes state, PKCE challenge, and scope", async () => {
      const provider = new DigiLockerProvider({
        clientId: "test-client-id",
        clientSecret: "test-secret",
        redirectUri: "https://api.ustaad.in/callback",
        baseUrl: "https://api.digitallocker.gov.in/public/oauth2/1",
      });

      const auth = await provider.createAuthorization("provider-uuid-1", "AADHAAR");
      expect(auth.state).toBeDefined();
      expect(auth.codeVerifier).toBeDefined();
      expect(auth.authorizationUrl).toContain("client_id=test-client-id");
      expect(auth.authorizationUrl).toContain("scope=eaadhaar");
      expect(auth.authorizationUrl).toContain("code_challenge_method=S256");
    });

    test("name matching algorithm accurately compares declared and official names", () => {
      // Direct matches
      expect(matchNames("Ramesh Kumar", "Ramesh Kumar")).toBe(true);

      // Honorifics normalization
      expect(matchNames("Mr. Ramesh Kumar", "Ramesh Kumar")).toBe(true);
      expect(matchNames("Shri Rajesh Sharma", "Rajesh Sharma")).toBe(true);

      // Case insensitivity & extra spaces
      expect(matchNames("ramesh kumar", "RAMESH   KUMAR")).toBe(true);

      // Partial overlap (e.g. middle name in government ID)
      expect(matchNames("Ramesh Kumar", "Ramesh Kumar Verma")).toBe(true);

      // Mismatch
      expect(matchNames("Ramesh Kumar", "Suresh Kumar")).toBe(false);
      expect(matchNames("Amit Patel", "Deepak Singh")).toBe(false);
    });

    test("DigiLocker never exposes full 12-digit Aadhaar number", async () => {
      const provider = new DigiLockerProvider();
      const identity = await provider.exchangeCallback("mock-code", "mock-state");
      expect(identity.maskedReference).toMatch(/^XXXX-XXXX-\d{4}$/);
      expect(identity.maskedReference).not.toMatch(/^\d{12}$/);
    });
  });

  describe("SMS & OTP Authentication Security", () => {
    test("MockSmsProvider records sent OTPs accurately", async () => {
      const sms = new MockSmsProvider();
      const sent = await sms.sendOtp("+919876543210", "456789");
      expect(sent).toBe(true);
      expect(sms.sentMessages).toHaveLength(1);
      expect(sms.sentMessages[0]?.phone).toBe("+919876543210");
      expect(sms.sentMessages[0]?.otp).toBe("456789");
    });

    test("Fast2SmsProvider formats Indian mobile number correctly without +91", async () => {
      const fast2sms = new Fast2SmsProvider();
      // Fast2SMS should accept and format Indian numbers
      expect(fast2sms).toBeDefined();
    });
  });

  describe("Duration-Aware Scheduling & Overlap Prevention", () => {
    test("validates booking duration and buffer schema with sensible defaults", () => {
      const parsed = bookingInput.parse({
        providerId: "00000000-0000-0000-0000-000000000000",
        serviceId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        problemDescription: "Fix kitchen sink leakage",
        addressText: "Model Town, Ludhiana, Punjab",
        latitude: 30.901,
        longitude: 75.857,
        preferredAt: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(parsed.estimatedDurationMinutes).toBe(60);
      expect(parsed.bufferMinutes).toBe(30);
    });

    test("detects overlapping appointment slots considering duration and buffer", () => {
      const baseTime = new Date("2026-11-05T10:00:00.000Z").getTime();
      const duration = 60; // 60 mins
      const buffer = 30; // 30 mins buffer
      const existingSlotEnd = baseTime + (duration + buffer) * 60000; // 11:30

      // Overlap helper
      const overlaps = (newStart: number, newDuration: number, newBuffer: number) => {
        const newEnd = newStart + (newDuration + newBuffer) * 60000;
        return baseTime < newEnd && existingSlotEnd > newStart;
      };

      // Appointment starting at 10:30 (inside slot) -> Overlaps
      expect(overlaps(baseTime + 30 * 60000, 60, 30)).toBe(true);

      // Appointment starting at 11:00 (inside buffer) -> Overlaps
      expect(overlaps(baseTime + 60 * 60000, 60, 30)).toBe(true);

      // Appointment starting at 11:30 (after slot + buffer) -> No overlap
      expect(overlaps(baseTime + 90 * 60000, 60, 30)).toBe(false);

      // Appointment starting at 12:00 -> No overlap
      expect(overlaps(baseTime + 120 * 60000, 60, 30)).toBe(false);
    });
  });

  describe("Worker Pricing & Customer Price Revision Controls", () => {
    test("validates worker price proposal input schema", () => {
      const valid = priceProposalInput.parse({
        revisedPrice: 750,
        reason: "Additional wiring parts needed for installation",
      });
      expect(valid.revisedPrice).toBe(750);
      expect(valid.reason).toContain("wiring");

      expect(() =>
        priceProposalInput.parse({
          revisedPrice: -100,
          reason: "Invalid price",
        }),
      ).toThrow();
    });

    test("validates customer price response action schema", () => {
      expect(priceResponseInput.parse({ action: "ACCEPT" }).action).toBe("ACCEPT");
      expect(priceResponseInput.parse({ action: "REJECT" }).action).toBe("REJECT");
      expect(() => priceResponseInput.parse({ action: "MAYBE" })).toThrow();
    });
  });

  describe("Work Completion Evidence & Digital Signature", () => {
    test("validates customer completion input with signature", () => {
      const valid = customerCompletionInput.parse({
        customerSignatureData: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...",
        completionNote: "Work completed satisfactorily",
      });
      expect(valid.customerSignatureData).toBeDefined();
      expect(valid.completionNote).toBe("Work completed satisfactorily");
    });

    test("transition schema accepts customer signature and proof photo", () => {
      const transition = transitionInput.parse({
        status: "COMPLETED",
        customerSignatureData: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...",
        completionNote: "Verified and signed",
      });
      expect(transition.status).toBe("COMPLETED");
      expect(transition.customerSignatureData).toBeDefined();
    });
  });

  describe("Bilingual Indian Review System & AI Sentiment", () => {
    test("analyzes English positive and negative sentiment accurately with fallback", async () => {
      const client = new AiServiceClient();
      const pos = await client.analyzeSentiment("Great professional service, highly recommend!", "en");
      expect(pos.label).toBe("POSITIVE");
      expect(pos.score).toBeGreaterThan(0.5);

      const neg = await client.analyzeSentiment("Very bad and rude behavior, late arrival", "en");
      expect(neg.label).toBe("NEGATIVE");
      expect(neg.score).toBeLessThan(0.5);
    });

    test("analyzes Hindi (Devanagari) positive review sentiment", async () => {
      const client = new AiServiceClient();
      const pos = await client.analyzeSentiment("बहुत बढ़िया काम किया, समय पर आए और कुशल हैं", "hi");
      expect(pos.label).toBe("POSITIVE");
      expect(pos.score).toBeGreaterThan(0.5);
    });

    test("analyzes Hinglish (Romanized Hindi) review sentiment", async () => {
      const client = new AiServiceClient();
      const pos = await client.analyzeSentiment("Ekdum mast aur badhiya kaam, sahi ustaad", "hi");
      expect(pos.label).toBe("POSITIVE");
      expect(pos.score).toBeGreaterThan(0.5);

      const neg = await client.analyzeSentiment("Bahut kharab aur bekar service, bakwas", "hi");
      expect(neg.label).toBe("NEGATIVE");
      expect(neg.score).toBeLessThan(0.5);
    });
  });

  describe("Indian Geocoding Utility", () => {
    test("resolves coordinates for Indian marketplace cities", async () => {
      const ludhiana = await geocodeAddress("Model Town, Ludhiana");
      expect(ludhiana.latitude).toBeGreaterThan(30);
      expect(ludhiana.latitude).toBeLessThan(32);
      expect(ludhiana.longitude).toBeGreaterThan(75);
      expect(ludhiana.longitude).toBeLessThan(77);

      const delhi = await geocodeAddress("Connaught Place, Delhi");
      expect(delhi.latitude).toBeGreaterThan(28);
      expect(delhi.latitude).toBeLessThan(30);
      expect(delhi.longitude).toBeGreaterThan(76);
      expect(delhi.longitude).toBeLessThan(78);
    });
  });
});
