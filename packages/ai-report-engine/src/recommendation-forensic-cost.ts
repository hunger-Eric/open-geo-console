export interface RecommendationForensicCostInput {
  searchCostMicros: number;
  retrievalCostMicros: number;
  synthesisCostMicros: number;
  artifactCostMicros: number;
  deliveryCostMicros: number;
  allocatedSharedCostMicros: number;
  avoidedCostMicros: number;
  priceMicros: number;
  refundMicros: number;
}

export interface RecommendationForensicCostAccounting extends RecommendationForensicCostInput {
  actualIncrementalCostMicros: number;
  netRevenueMicros: number;
  contributionMarginMicros: number;
}

export function calculateRecommendationForensicCost(input: RecommendationForensicCostInput): RecommendationForensicCostAccounting {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  if (input.refundMicros > input.priceMicros) throw new TypeError("refundMicros cannot exceed priceMicros.");
  const actualIncrementalCostMicros = input.searchCostMicros + input.retrievalCostMicros + input.synthesisCostMicros +
    input.artifactCostMicros + input.deliveryCostMicros;
  const netRevenueMicros = input.priceMicros - input.refundMicros;
  return { ...input, actualIncrementalCostMicros, netRevenueMicros,
    contributionMarginMicros: netRevenueMicros - actualIncrementalCostMicros - input.allocatedSharedCostMicros };
}
