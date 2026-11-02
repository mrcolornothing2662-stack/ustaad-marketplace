import { BookingStatus, UserRole } from "@prisma/client";
import { assertTransition } from "../src/modules/bookings/booking.state-machine";
import { rankProvider } from "../src/modules/search/ranking";
import { haversineKm } from "../src/modules/search/location";
import { calculateTrustScore } from "../src/modules/trust-score/trust-score.service";
import { MockDigiLockerProvider } from "../src/integrations/digilocker/mock-digilocker.provider";
describe("marketplace domain rules", () => {
  test("provider can accept but customer cannot", () => {
    expect(() =>
      assertTransition(BookingStatus.PENDING, BookingStatus.ACCEPTED, {
        role: UserRole.PROVIDER,
      }),
    ).not.toThrow();
    expect(() =>
      assertTransition(BookingStatus.PENDING, BookingStatus.ACCEPTED, {
        role: UserRole.CUSTOMER,
      }),
    ).toThrow("not allowed");
  });
  test("job cannot start without OTP", () =>
    expect(() =>
      assertTransition(
        BookingStatus.PROVIDER_ON_THE_WAY,
        BookingStatus.IN_PROGRESS,
        { role: UserRole.PROVIDER },
      ),
    ).toThrow("OTP"));
  test("ranking is normalized and explainable", () =>
    expect(
      rankProvider({
        serviceMatch: 100,
        trustScore: 90,
        distanceScore: 80,
        availabilityScore: 100,
        ratingScore: 90,
        responseRate: 80,
        completionRate: 90,
        verified: true,
      }),
    ).toEqual(
      expect.objectContaining({
        rankingScore: 92,
        reasons: expect.arrayContaining(["Identity and skill verified"]),
      }),
    ));
  test("distance utility returns useful kilometres", () =>
    expect(
      haversineKm(
        { latitude: 30.901, longitude: 75.857 },
        { latitude: 31.224, longitude: 75.77 },
      ),
    ).toBeGreaterThan(30));
  test("neutral defaults do not punish a new provider", () =>
    expect(
      calculateTrustScore({
        identityVerification: 50,
        skillVerification: 50,
        normalizedRating: 50,
        reviewSentiment: 50,
        completionRate: 50,
        responseRate: 50,
        accountStanding: 50,
      }).score,
    ).toBe(50));
  test("mock DigiLocker never returns a complete identity number", async () =>
    expect(
      (await new MockDigiLockerProvider().exchangeCallback("demo", "state"))
        .maskedReference,
    ).toBe("XXXX-XXXX-1234"));
});
