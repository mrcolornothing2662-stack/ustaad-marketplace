export interface TrustInput {
  identityVerification: number;
  skillVerification: number;
  normalizedRating: number;
  reviewSentiment: number;
  completionRate: number;
  responseRate: number;
  accountStanding: number;
  confirmedComplaints?: number;
  providerCancellations?: number;
  noShows?: number;
  suspended?: boolean;
  suspiciousReviews?: number;
}
const neutral = (v: number | undefined) =>
  v === undefined ? 50 : Math.max(0, Math.min(100, v));
export function calculateTrustScore(i: TrustInput) {
  const components = {
    identityVerification: neutral(i.identityVerification),
    skillVerification: neutral(i.skillVerification),
    normalizedRating: neutral(i.normalizedRating),
    reviewSentiment: neutral(i.reviewSentiment),
    completionRate: neutral(i.completionRate),
    responseRate: neutral(i.responseRate),
    accountStanding: neutral(i.accountStanding),
  };
  const base =
    components.identityVerification * 0.2 +
    components.skillVerification * 0.2 +
    components.normalizedRating * 0.2 +
    components.reviewSentiment * 0.15 +
    components.completionRate * 0.15 +
    components.responseRate * 0.05 +
    components.accountStanding * 0.05;
  const penalty =
    (i.confirmedComplaints ?? 0) * 5 +
    (i.providerCancellations ?? 0) * 2 +
    (i.noShows ?? 0) * 8 +
    (i.suspiciousReviews ?? 0) * 3 +
    (i.suspended ? 30 : 0);
  return {
    score: Number(Math.max(0, base - penalty).toFixed(1)),
    components,
    penalty,
    formulaVersion: "explainable-v1",
  };
}
