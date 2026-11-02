export interface RankingInput {
  serviceMatch: number;
  trustScore: number;
  distanceScore: number;
  availabilityScore: number;
  ratingScore: number;
  responseRate: number;
  completionRate: number;
  verified?: boolean;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function rankProvider(i: RankingInput) {
  const score =
    clamp(i.serviceMatch) * 0.3 +
    clamp(i.trustScore) * 0.25 +
    clamp(i.distanceScore) * 0.15 +
    clamp(i.availabilityScore) * 0.1 +
    clamp(i.ratingScore) * 0.1 +
    clamp(i.responseRate) * 0.05 +
    clamp(i.completionRate) * 0.05;
  const reasons: string[] = [];
  if (i.verified) reasons.push("Identity and skill verified");
  if (i.availabilityScore >= 80)
    reasons.push("Available at the requested time");
  if (i.completionRate >= 85) reasons.push("High completion rate");
  if (i.distanceScore >= 75) reasons.push("Located within the requested area");
  return { rankingScore: Number(score.toFixed(1)), reasons };
}
