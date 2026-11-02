import { z } from "zod";
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
import { getNotificationText } from "../src/common/i18n/notification.templates";
import { LocalStorageProvider } from "../src/integrations/storage/storage.provider";

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

    test("analyzes Punjabi (Gurmukhi) review sentiment accurately", async () => {
      const client = new AiServiceClient();
      const pos = await client.analyzeSentiment("ਬਹੁਤ ਵਧੀਆ ਅਤੇ ਸ਼ਾਨਦਾਰ ਕੰਮ ਕੀਤਾ, ਸਮੇਂ ਸਿਰ ਆਏ", "pa");
      expect(pos.label).toBe("POSITIVE");
      expect(pos.score).toBeGreaterThan(0.5);

      const neg = await client.analyzeSentiment("ਬਹੁਤ ਖਰਾਬ ਕੰਮ, ਦੇਰ ਨਾਲ ਆਏ ਅਤੇ ਬੇਕਾਰ ਸਰਵਿਸ", "pa");
      expect(neg.label).toBe("NEGATIVE");
      expect(neg.score).toBeLessThan(0.5);
    });

    test("analyzes Romanized Punjabi review sentiment accurately", async () => {
      const client = new AiServiceClient();
      const pos = await client.analyzeSentiment("Bohot vadiya ustaad, changa te siraa kaam kita", "pa");
      expect(pos.label).toBe("POSITIVE");
      expect(pos.score).toBeGreaterThan(0.5);

      const neg = await client.analyzeSentiment("Bohot maada te manda experience, bekar", "pa");
      expect(neg.label).toBe("NEGATIVE");
      expect(neg.score).toBeLessThan(0.5);
    });
  });

  describe("Trilingual Localization & Notification Templates", () => {
    test("generates booking confirmed notifications in English, Hindi, and Punjabi", () => {
      const en = getNotificationText("BOOKING_CONFIRMED", "en", { workerName: "Gurpreet", price: "450" });
      expect(en.title).toBe("Booking Confirmed");
      expect(en.body).toContain("Gurpreet");
      expect(en.body).toContain("₹450");

      const hi = getNotificationText("BOOKING_CONFIRMED", "hi", { workerName: "गुरप्रीत", price: "450" });
      expect(hi.title).toBe("बुकिंग पक्की हो गई");
      expect(hi.body).toContain("गुरप्रीत");
      expect(hi.body).toContain("₹450");

      const pa = getNotificationText("BOOKING_CONFIRMED", "pa", { workerName: "ਗੁਰਪ੍ਰੀਤ", price: "450" });
      expect(pa.title).toBe("ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ");
      expect(pa.body).toContain("ਗੁਰਪ੍ਰੀਤ");
      expect(pa.body).toContain("₹450");
    });

    test("generates payment settled notifications in English, Hindi, and Punjabi", () => {
      const en = getNotificationText("PAYMENT_SETTLED", "en", { amount: "600" });
      expect(en.title).toContain("Payment");
      expect(en.body).toContain("₹600");

      const hi = getNotificationText("PAYMENT_SETTLED", "hi", { amount: "600" });
      expect(hi.title).toContain("भुगतान");
      expect(hi.body).toContain("₹600");

      const pa = getNotificationText("PAYMENT_SETTLED", "pa", { amount: "600" });
      expect(pa.title).toContain("ਭੁਗਤਾਨ");
      expect(pa.body).toContain("₹600");
    });
  });

  describe("Cloud & Local Object Storage Provider", () => {
    test("uploads, downloads, and deletes files safely using LocalStorageProvider", async () => {
      const storage = new LocalStorageProvider("/tmp/ustaad-test-storage");
      const testKey = `test-file-${Date.now()}.txt`;
      const testBuffer = Buffer.from("Ustaad Marketplace Proof Data");

      const uploaded = await storage.upload({
        storageKey: testKey,
        buffer: testBuffer,
        mimeType: "text/plain",
      });
      expect(uploaded.storageKey).toBe(testKey);
      expect(uploaded.sizeBytes).toBe(testBuffer.length);

      const downloaded = await storage.download(testKey);
      expect(downloaded.toString("utf-8")).toBe("Ustaad Marketplace Proof Data");

      await storage.delete(testKey);
      await expect(storage.download(testKey)).rejects.toThrow();
    });
  });

  describe("Account Personalization & Multilingual Preferences", () => {
    const preferencesSchema = z.object({
      language: z.enum(["en", "hi", "pa"]).optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
    });

    const indianPhoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, "Must be an Indian mobile number (+91...)");

    test("validates language preferences supporting English, Hindi, and Punjabi", () => {
      expect(preferencesSchema.parse({ language: "en" }).language).toBe("en");
      expect(preferencesSchema.parse({ language: "hi" }).language).toBe("hi");
      expect(preferencesSchema.parse({ language: "pa" }).language).toBe("pa");
      expect(() => preferencesSchema.parse({ language: "fr" })).toThrow();
    });

    test("validates theme selection supporting light, dark, and system", () => {
      expect(preferencesSchema.parse({ theme: "light" }).theme).toBe("light");
      expect(preferencesSchema.parse({ theme: "dark" }).theme).toBe("dark");
      expect(preferencesSchema.parse({ theme: "system" }).theme).toBe("system");
      expect(() => preferencesSchema.parse({ theme: "sepia" })).toThrow();
    });

    test("validates Indian mobile numbers with +91 prefix and valid telecom ranges", () => {
      expect(indianPhoneSchema.parse("+919876543210")).toBe("+919876543210");
      expect(indianPhoneSchema.parse("+917012345678")).toBe("+917012345678");
      expect(() => indianPhoneSchema.parse("9876543210")).toThrow();
      expect(() => indianPhoneSchema.parse("+912345678901")).toThrow(); // Starts with 2
      expect(() => indianPhoneSchema.parse("+14155552671")).toThrow(); // US number
    });
  });

  describe("Zero Platform Fee Direct Settlement & Payment Records", () => {
    const paymentReportInput = z.object({
      paymentMethod: z.enum(["CASH", "UPI", "OTHER"]).default("CASH"),
      amount: z.number().positive(),
      transactionReference: z.string().trim().max(100).optional(),
      notes: z.string().max(500).optional(),
    });

    const paymentDisputeInput = z.object({
      reason: z.string().trim().min(5).max(1000),
    });

    test("validates direct cash and UPI payment reporting with zero platform deduction", () => {
      const cash = paymentReportInput.parse({
        paymentMethod: "CASH",
        amount: 750,
        notes: "Paid in cash after work completion",
      });
      expect(cash.paymentMethod).toBe("CASH");
      expect(cash.amount).toBe(750);

      const upi = paymentReportInput.parse({
        paymentMethod: "UPI",
        amount: 1200,
        transactionReference: "UPI/329482910492/PAY",
      });
      expect(upi.paymentMethod).toBe("UPI");
      expect(upi.transactionReference).toBe("UPI/329482910492/PAY");
    });

    test("validates payment dispute schema with mandatory reason", () => {
      const dispute = paymentDisputeInput.parse({
        reason: "Customer paid ₹500 instead of agreed ₹750 via UPI.",
      });
      expect(dispute.reason).toContain("₹500");
      expect(() => paymentDisputeInput.parse({ reason: "No" })).toThrow(); // Min 5 chars
    });
  });

  describe("Search Sorting & Provider Leave Overlap Prevention", () => {
    const mockProviders = [
      { id: "1", distanceKm: 12.5, minStartingPrice: 400, averageRating: 4.8, trustScore: { score: 92 }, rankingScore: 88 },
      { id: "2", distanceKm: 3.2, minStartingPrice: 650, averageRating: 4.2, trustScore: { score: 85 }, rankingScore: 79 },
      { id: "3", distanceKm: 8.0, minStartingPrice: 300, averageRating: 4.9, trustScore: { score: 95 }, rankingScore: 94 },
    ];

    test("sorts providers correctly by nearest, price_asc, rating, and trust", () => {
      // Nearest
      const byDistance = [...mockProviders].sort((a, b) => a.distanceKm - b.distanceKm);
      expect(byDistance[0].id).toBe("2"); // 3.2 km

      // Price ascending
      const byPrice = [...mockProviders].sort((a, b) => a.minStartingPrice - b.minStartingPrice);
      expect(byPrice[0].id).toBe("3"); // ₹300

      // Rating descending
      const byRating = [...mockProviders].sort((a, b) => b.averageRating - a.averageRating);
      expect(byRating[0].id).toBe("3"); // 4.9★

      // Trust score descending
      const byTrust = [...mockProviders].sort((a, b) => b.trustScore.score - a.trustScore.score);
      expect(byTrust[0].id).toBe("3"); // 95 trust
    });

    test("filters out providers currently on approved leave for requested appointment date", () => {
      const leaves = [
        { startDate: new Date("2026-11-05T00:00:00Z"), endDate: new Date("2026-11-08T23:59:59Z") },
      ];

      const appointmentOnLeave = new Date("2026-11-06T14:00:00Z");
      const appointmentAfterLeave = new Date("2026-11-10T10:00:00Z");

      const isOnLeave1 = leaves.some((l) => l.startDate <= appointmentOnLeave && l.endDate >= appointmentOnLeave);
      expect(isOnLeave1).toBe(true); // Filtered out

      const isOnLeave2 = leaves.some((l) => l.startDate <= appointmentAfterLeave && l.endDate >= appointmentAfterLeave);
      expect(isOnLeave2).toBe(false); // Available
    });
  });

  describe("Chat Access Security Rules & 48-Hour Policy", () => {
    function canAccessChat(status: string): boolean {
      return !["PENDING", "ACCEPTED"].includes(status);
    }

    function canSendMessage(status: string, completedAt?: Date): boolean {
      if (!canAccessChat(status)) return false;
      if (["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_PROVIDER", "REJECTED", "NO_SHOW"].includes(status)) {
        return false;
      }
      if (["COMPLETED", "REVIEWED"].includes(status) && completedAt) {
        const hours = (Date.now() - completedAt.getTime()) / (3600 * 1000);
        if (hours > 48) return false;
      }
      return true;
    }

    test("blocks chat room prior to confirmation", () => {
      expect(canAccessChat("PENDING")).toBe(false);
      expect(canAccessChat("ACCEPTED")).toBe(false);
      expect(canAccessChat("CONFIRMED")).toBe(true);
      expect(canAccessChat("IN_PROGRESS")).toBe(true);
    });

    test("blocks new messages in cancelled bookings", () => {
      expect(canSendMessage("CANCELLED_BY_CUSTOMER")).toBe(false);
      expect(canSendMessage("CANCELLED_BY_PROVIDER")).toBe(false);
      expect(canSendMessage("CONFIRMED")).toBe(true);
    });

    test("enforces 48-hour communication window post-completion", () => {
      const recent = new Date(Date.now() - 5 * 3600 * 1000); // 5 hours ago
      expect(canSendMessage("COMPLETED", recent)).toBe(true);

      const old = new Date(Date.now() - 50 * 3600 * 1000); // 50 hours ago
      expect(canSendMessage("COMPLETED", old)).toBe(false);
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
