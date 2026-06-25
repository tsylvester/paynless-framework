/**
 * Tier-3 coverage set: non-deprecated `api_identifier` rows from `supabase/seed.sql` (`anthropic`),
 * plus Claude API IDs published under **Latest models** and **still available** on Anthropic’s models
 * overview (snapshot identifiers and aliases such as `claude-haiku-4-5`). Omits Claude 2.x, rows
 * marked `[SANITIZED/OBSOLETE]`, and `anthropic-claude-test`.
 *
 * Source of truth for API IDs: https://docs.anthropic.com/en/docs/about-claude/models
 */

export const anthropicIdentifiers: readonly string[] = [
  "anthropic-claude-3-5-haiku-20241022",
  "anthropic-claude-3-5-sonnet-20240620",
  "anthropic-claude-3-5-sonnet-20241022",
  "anthropic-claude-3-7-sonnet-20250219",
  "anthropic-claude-3-haiku-20240307",
  "anthropic-claude-3-opus-20240229",
  "anthropic-claude-haiku-4-5",
  "anthropic-claude-haiku-4-5-20251001",
  "anthropic-claude-opus-4-1-20250805",
  "anthropic-claude-opus-4-20250514",
  "anthropic-claude-opus-4-5",
  "anthropic-claude-opus-4-5-20251101",
  "anthropic-claude-opus-4-6",
  "anthropic-claude-opus-4-7",
  "anthropic-claude-sonnet-4-20250514",
  "anthropic-claude-sonnet-4-5",
  "anthropic-claude-sonnet-4-5-20250929",
  "anthropic-claude-sonnet-4-6",
];

/**
 * Checklist `Fix Model Costs and Pricing` — official headline USD per 1M tokens (input, output)
 * for Tier-3 `INTERNAL_MODEL_MAP` resolution via longest-prefix match on `api_identifier`.
 */
export const anthropicRates: ReadonlyArray<readonly [string, number, number]> = [
  ["anthropic-claude-opus-4-7", 5.0, 25.0],
  ["anthropic-claude-opus-4-6", 5.0, 25.0],
  ["anthropic-claude-opus-4-5", 5.0, 25.0],
  ["anthropic-claude-sonnet-4-6", 3.0, 15.0],
  ["anthropic-claude-sonnet-4-5", 3.0, 15.0],
  ["anthropic-claude-haiku-4-5", 1.0, 5.0],
  ["anthropic-claude-haiku-4-5-20251001", 1.0, 5.0],
  ["anthropic-claude-opus-4-20250514", 15.0, 75.0],
  ["anthropic-claude-opus-4-1-20250805", 15.0, 75.0],
];
