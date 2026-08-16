// Loyalty tier + points logic (pure, no I/O).
// Tier is driven by lifetime visit_count; points accrue from money spent.

export type LoyaltyTier = "standard" | "silver" | "gold" | "platinum";

export const TIER_THRESHOLDS: ReadonlyArray<{ tier: LoyaltyTier; minVisits: number }> = [
  { tier: "platinum", minVisits: 20 },
  { tier: "gold", minVisits: 10 },
  { tier: "silver", minVisits: 5 },
  { tier: "standard", minVisits: 0 },
];

// 1 điểm cho mỗi 10.000đ chi tiêu (tiền phòng + dịch vụ).
const VND_PER_POINT = 10_000;

/** Map lifetime visit count → loyalty tier. */
export function computeTier(visitCount: number): LoyaltyTier {
  const visits = Math.max(0, Math.floor(visitCount));
  for (const t of TIER_THRESHOLDS) {
    if (visits >= t.minVisits) return t.tier;
  }
  return "standard";
}

/** Points earned from a single folio amount (VND). */
export function pointsForAmount(amountVnd: number): number {
  if (!Number.isFinite(amountVnd) || amountVnd <= 0) return 0;
  return Math.floor(amountVnd / VND_PER_POINT);
}

/** Visits remaining until the next tier (0 if already top tier). */
export function visitsToNextTier(visitCount: number): number {
  const visits = Math.max(0, Math.floor(visitCount));
  // Thresholds sorted desc by minVisits; find smallest threshold above current.
  const higher = [...TIER_THRESHOLDS]
    .map((t) => t.minVisits)
    .filter((min) => min > visits)
    .sort((a, b) => a - b);
  return higher.length > 0 ? higher[0]! - visits : 0;
}
