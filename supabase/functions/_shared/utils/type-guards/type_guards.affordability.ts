// supabase/functions/_shared/utils/type-guards/type_guards.affordability.ts
// Semantics align with getMaxOutputTokens rate validation in affordability_utils.ts.

export function isValidInputTokenCostRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isValidOutputTokenCostRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
