[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* `[✅]` `[DB]` supabase/migrations **Tier definitions table, tier columns, computed tier functions, hand-set backfill**

  * `[✅]` `objective`
    * `[✅]` No tier system exists. `subscription_plans` has no tier indicator, `user_subscriptions` has no tier cache or payment ratchet, `ai_providers` has no model access control column, and no SQL function computes a user's tier on demand.
    * `[✅]` **The existing `user_subscriptions.status` column is NOT modified.** It continues to hold Stripe lifecycle status (`active`, `canceled`, `past_due`, `trialing`, `free`). The new `tier_level` column is a SEPARATE concern — it holds the computed plan tier (0/10/20/30). These are orthogonal: a user can be `status = 'past_due'` AND `tier_level = 20` (premium) simultaneously. Handlers write `status` for lifecycle events and call `refresh_user_tier` for tier recomputation — the two never conflate.
    * `[✅]` Tiers are ordered by integer level with gaps for future insertion: `0` (free), `10` (basic), `20` (premium), `30` (ultra). All comparisons use `<=` on integers. Display names and business rules (output caps, max models per project) are stored in a `tier_definitions` reference table, making them configurable without code changes.
    * `[✅]` The `has_ever_paid` boolean on `user_subscriptions` is a permanent ratchet: once `true`, never reverts to `false`. Any completed payment (subscription or OTP) sets it. This prevents a user who has ever paid from degrading below `basic` tier.

  * `[✅]` `role`
    * `[✅]` Infrastructure — database schema, reference data, and SQL functions
    * `[✅]` Must NOT contain application logic beyond tier computation and tier refresh

  * `[✅]` `module`
    * `[✅]` Database schema, cross-cutting — touched by subscription, payment, model-access, and sync bounded contexts

  * `[✅]` supabase/migrations/`<timestamp>_tier_infrastructure.sql`

    * `[✅]` Create `tier_definitions` table:
      * `[✅]` `level INTEGER PRIMARY KEY` — the ordinal tier level (0, 10, 20, 30). Gapped to allow future insertions without renumbering.
      * `[✅]` `name TEXT NOT NULL UNIQUE` — human-readable tier name (free, basic, premium, ultra)
      * `[✅]` `output_cap_tokens INTEGER` — maximum output tokens per request for this tier. `NULL` means no limit.
      * `[✅]` `max_models_per_project INTEGER` — maximum models selectable per project for this tier. `NULL` means no limit.
      * `[✅]` Seed: `(0, 'free', 8192, 1), (10, 'basic', 32768, 2), (20, 'premium', 131072, 3), (30, 'ultra', NULL, NULL)`
      * `[✅]` Enable RLS on `tier_definitions`: `ALTER TABLE public.tier_definitions ENABLE ROW LEVEL SECURITY;`
      * `[✅]` Add SELECT policy for authenticated users only (reference data, read-only): `CREATE POLICY "tier_definitions_select" ON public.tier_definitions FOR SELECT TO authenticated USING (true);` — anon users cannot reach inside the app and should not be granted access. No write policies needed (admin-only via migrations).

    * `[✅]` `ALTER TABLE public.subscription_plans ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 0;`
      * `[✅]` `ADD CONSTRAINT subscription_plans_tier_level_fk FOREIGN KEY (tier_level) REFERENCES tier_definitions(level)`

    * `[✅]` `ALTER TABLE public.user_subscriptions ADD COLUMN has_ever_paid BOOLEAN NOT NULL DEFAULT false;`

    * `[✅]` `ALTER TABLE public.user_subscriptions ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 0;`
      * `[✅]` `ADD CONSTRAINT user_subscriptions_tier_level_fk FOREIGN KEY (tier_level) REFERENCES tier_definitions(level)`

    * `[✅]` `ALTER TABLE public.ai_providers ADD COLUMN min_plan_tier_level INTEGER NOT NULL DEFAULT 0;`
      * `[✅]` `ADD CONSTRAINT ai_providers_min_plan_tier_level_fk FOREIGN KEY (min_plan_tier_level) REFERENCES tier_definitions(level)`

    * `[✅]` `CREATE OR REPLACE FUNCTION public.current_plan_tier(p_user_id UUID) RETURNS INTEGER`
      * `[✅]` `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`
      * `[✅]` Read `has_ever_paid` from `user_subscriptions` for `p_user_id`
      * `[✅]` If `has_ever_paid = false` → return `0` (free)
      * `[✅]` Read `plan_id` from `user_subscriptions` where `status IN ('active', 'trialing')` for `p_user_id`. Note: `status = 'free'` is deliberately excluded — free-tier users are already handled by the `has_ever_paid = false` check above. The `status` column holds Stripe lifecycle state, not tier state.
      * `[✅]` If active subscription found → join to `subscription_plans.tier_level` → return that tier level
      * `[✅]` Else (paid before but no active subscription) → return `10` (basic — ratchet prevents dropping below basic)

    * `[✅]` `CREATE OR REPLACE FUNCTION public.refresh_user_tier(p_user_id UUID, p_set_ratchet BOOLEAN) RETURNS INTEGER`
      * `[✅]` `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`
      * `[✅]` This function is triggered by subscription state transitions — entering, upgrading, downgrading, or canceling a subscription. Upgrade transitions apply on every state change (ratchet only goes up). Downgrade transitions (ultra→premium, premium→basic) apply when moving down, but `has_ever_paid` ensures no user drops below basic.
      * `[✅]` If `p_set_ratchet = true`: `UPDATE user_subscriptions SET has_ever_paid = true WHERE user_id = p_user_id`
      * `[✅]` Compute tier: `SELECT current_plan_tier(p_user_id) INTO v_tier_level`
      * `[✅]` Cache tier: `UPDATE user_subscriptions SET tier_level = v_tier_level, updated_at = now() WHERE user_id = p_user_id`
      * `[✅]` After the cache UPDATE: `GET DIAGNOSTICS v_rows_affected = ROW_COUNT`. If `v_rows_affected = 0`: `RAISE WARNING '[refresh_user_tier] No user_subscriptions row found for user_id %. This function is triggered by subscription state transitions and should not be reached without a subscription record.', p_user_id` and return `-1` to signal the error condition to the caller.
      * `[✅]` `RETURN v_tier_level`

    * `[✅]` `CREATE OR REPLACE FUNCTION public.handle_new_user()` — restore and consolidate the complete new-user setup function:
      * `[✅]` The April 2026 migration (`20260416000000_add_auth_hook_on_user_created.sql`) replaced the full `handle_new_user()` with a webhook-only stub that posts to `/functions/v1/on-user-created`. That stub handles ONLY newsletter subscription (Kit.com) via the edge function. The original consolidated function from `20250630190924_align_remote_to_local.sql` (line 245) — which creates the user profile, token wallet, free plan subscription, and initial token grant — was entirely lost.
      * `[✅]` Read BOTH migration files. The restored function must include ALL of:
        1. User profile creation (`INSERT INTO user_profiles`) from align_remote
        2. Token wallet creation (`INSERT INTO token_wallets`) from align_remote
        3. Free plan subscription (`INSERT INTO user_subscriptions`) from align_remote — with new columns: `has_ever_paid = false, tier_level = 0`
        4. Initial free token grant (idempotent, via `record_token_transaction` or direct insert) from align_remote
        5. Newsletter webhook call (`extensions.http_post` to `/functions/v1/on-user-created`) from the April 2026 migration — appended after the core logic so newsletter functionality is preserved
      * `[✅]` The function must be `SECURITY DEFINER`, idempotent (ON CONFLICT handling), and include the same error handling and RAISE LOG statements as the align_remote version
      * `[✅]` This single `CREATE OR REPLACE` supersedes both prior versions and is the authoritative new-user setup path

    * `[✅]` `GRANT EXECUTE` for all SECURITY DEFINER functions defined in this migration:
      * `[✅]` `GRANT EXECUTE ON FUNCTION public.current_plan_tier(UUID) TO service_role, authenticated;`
      * `[✅]` `GRANT EXECUTE ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) TO service_role;`
      * `[✅]` `REVOKE ALL ON FUNCTION public.refresh_user_tier(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;` — only service_role (edge functions) should call this
      * `[✅]` `GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;` — trigger function, called by Postgres internals
      * `[✅]` Note: the transactional RPCs (`complete_checkout_payment`, `complete_invoice_payment`, `update_subscription_with_tier`) defined in the later migration node must also include their own `GRANT EXECUTE ON FUNCTION ... TO service_role;` and `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` — they are called from edge functions with service role, never from client-side

    * `[✅]` Backfill `subscription_plans.tier_level`:
      * `[✅]` Plans with `item_id_internal = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'` or `name = 'Free'` → `0` (free)
      * `[✅]` All other existing plans → `10` (basic). Upgrade specific plans to `20`/`30` per Stripe spreadsheet when available.

    * `[✅]` Backfill `user_subscriptions.has_ever_paid`:
      * `[✅]` `UPDATE user_subscriptions SET has_ever_paid = true WHERE user_id IN (SELECT DISTINCT user_id FROM payment_transactions WHERE status = 'COMPLETED')`

    * `[✅]` Backfill `user_subscriptions.tier_level`:
      * `[✅]` `UPDATE user_subscriptions SET tier_level = public.current_plan_tier(user_id)`

    * `[✅]` Backfill `ai_providers.min_plan_tier_level` from `output_token_cost_rate` in config JSONB — models tier on PRICE, not name. Uses the same cost bands as `diffAndPrepareDbOps` auto-tier for new inserts:
      * `[✅]` `dummy-%` test models: `UPDATE ai_providers SET min_plan_tier_level = 0 WHERE api_identifier LIKE 'dummy-%'`
      * `[✅]` Cost band — free (output CPM < 10): `UPDATE ai_providers SET min_plan_tier_level = 0 WHERE (config->>'output_token_cost_rate')::NUMERIC < 10 AND api_identifier NOT LIKE 'dummy-%'`
      * `[✅]` Cost band — basic (10 ≤ output CPM < 20): `UPDATE ai_providers SET min_plan_tier_level = 10 WHERE (config->>'output_token_cost_rate')::NUMERIC >= 10 AND (config->>'output_token_cost_rate')::NUMERIC < 20`
      * `[✅]` Cost band — premium (output CPM ≥ 20): `UPDATE ai_providers SET min_plan_tier_level = 20 WHERE (config->>'output_token_cost_rate')::NUMERIC >= 20`
      * `[✅]` No ultra (30) assignment — ultra has no model access distinction from premium. Ultra incentives are non-model-related (output caps, models-per-project, etc. from `tier_definitions`). `min_plan_tier_level = 30` is never auto-assigned from cost bands.
      * `[✅]` Null cost (no rate data in config): `UPDATE ai_providers SET min_plan_tier_level = 10 WHERE config->>'output_token_cost_rate' IS NULL AND api_identifier NOT LIKE 'dummy-%'` — basic as safe default for unknown cost
      * `[✅]` Comment in migration: "Tier assignment uses output cost bands (< 10 → free, 10–20 → basic, ≥ 20 → premium). No model gets tier 30 (ultra) from cost — ultra's value is non-model incentives. The sync pipeline uses the same bands for new inserts. Maintainer adjusts individual models after review."

* `[✅]` `[BE]` supabase/functions/sync-ai-models/config_assembler **Prefix-match lookup and safe defaults**

  * `[✅]` `objective`
    * `[✅]` Tier-3 internal map lookup uses exact-match (`Map.get`) but map keys are partial (e.g. `google-gemini-3-flash`) while API identifiers include dated/variant suffixes (e.g. `google-gemini-3-flash-preview`). Result: Tier-3 misses for most models, falling through to Tier-4 defaults of 15/75.
    * `[✅]` Tier-4 `calculateDynamicDefaults` uses `Math.max` over the cohort to set cost defaults. Once one model receives 15/75, all subsequent misses inherit 15/75 via the high-water-mark. The loop is monotonic — costs only go up, never correct downward. Replacing the high-water-mark with a low floor shifts the error direction (undercharge vs overcharge) but does not fix the error — both are knowingly wrong.
    * `[✅]` Fix: prefix-match for Tier-3. For Tier-4, refuse to write cost data when no trusted tier provides it — cost fields are `null`, model is inserted as disabled (`is_enabled = false`), and an alarm is logged. No guessing in either direction. Emit ephemeral per-field cost provenance for downstream consumption by `diffAndPrepareDbOps`.

  * `[✅]` `role`
    * `[✅]` Domain logic — assembles model configuration from tiered data sources
    * `[✅]` Must NOT persist provenance to DB — provenance is ephemeral, consumed only by diffAndPrepareDbOps

  * `[✅]` `module`
    * `[✅]` sync-ai-models bounded context
    * `[✅]` Provenance is internal to the assembly→diff pipeline; not visible to consumers of the final model config

  * `[✅]` `deps`
    * `[✅]` `supabase/functions/_shared/types.ts` — `AiModelExtendedConfig`, `FinalAppModelConfig`, `ProviderModelInfo`, `ILogger` (no changes needed)
    * `[✅]` `supabase/functions/chat/zodSchema.ts` — `AiModelExtendedConfigSchema`, `TokenizationStrategySchema` (no changes needed)

  * `[✅]` `context_slice`
    * `[✅]` `ConfigDataSource.internalModelMap` — existing Map interface, no change to shape
    * `[✅]` New: assembled output carries ephemeral `costProvenance` per model (not on `FinalAppModelConfig` — separate return structure or parallel map)

  * `[✅]` supabase/functions/sync-ai-models/`config_assembler.test.ts`
    * `[✅]` Test: model with `api_identifier` = `google-gemini-3-flash-preview` resolves to map entry keyed `google-gemini-3-flash` via prefix match
    * `[✅]` Test: model with `api_identifier` = `openai-gpt-5-2025-08-07` resolves to map entry keyed `openai-gpt-5`
    * `[✅]` Test: longest prefix wins — `google-gemini-2.5-flash-lite` matches `google-gemini-2.5-flash-lite` over `google-gemini-2.5-flash`
    * `[✅]` Test: model with no map match receives `null` cost rates, provenance `none`, and is flagged for manual configuration — NOT a guessed floor or high-water-mark
    * `[✅]` Test: cost provenance is `static_map` when resolved from internal map, `api` when API provides cost, `none` when no trusted tier provides cost data
    * `[✅]` Test: cohort containing a 15/75 model does NOT cause a new unmapped model to inherit 15/75 — unmapped model gets `null` costs, not cohort-derived costs

  * `[✅]` supabase/functions/sync-ai-models/`config_assembler.ts`
    * `[✅]` Replace `this.sources.internalModelMap?.get(apiModel.api_identifier)` with a longest-prefix-match helper: among all keys where `apiModel.api_identifier.startsWith(key)`, pick the longest key
    * `[✅]` In `calculateDynamicDefaults`: remove cost rate computation entirely — remove `DEFAULTS.input_token_cost_rate`, `DEFAULTS.output_token_cost_rate`, and the `Math.max` high-water-mark over cohort costs. Cost fields are `null` when no trusted tier (API, external, or static map) provides them. Non-cost defaults (context window, output cap, tokenization strategy) still computed from cohort — those are not billing-sensitive
    * `[✅]` Emit ephemeral cost provenance alongside assembled configs — either a parallel `Map<string, CostProvenance>` or a wrapper return type. Provenance per model: `{ input_source: 'api' | 'static_map' | 'none', output_source: 'api' | 'static_map' | 'none' }`

* `[✅]` `[BE]` supabase/functions/sync-ai-models/diffAndPrepareDbOps **Field-masked cost updates using provenance**

  * `[✅]` `objective`
    * `[✅]` Currently replaces the entire `config` JSONB when any field differs. A correct DB cost (0.50/3.00) is overwritten by a bad assembled cost (15/75) every sync run.
    * `[✅]` Fix: when assembled cost provenance is `none`, preserve existing DB cost fields. When inserting a new model with `null` costs (provenance `none`), set `is_enabled = false` and log an alarm for manual configuration.

  * `[✅]` `role`
    * `[✅]` Domain logic — computes the diff between assembled models and DB models, produces DB operations
    * `[✅]` Must NOT overwrite trusted DB cost data with defaulted assembled cost data

  * `[✅]` `module`
    * `[✅]` sync-ai-models bounded context
    * `[✅]` Consumes ephemeral provenance from config_assembler; provenance does not reach DB

  * `[✅]` `deps`
    * `[✅]` `supabase/functions/sync-ai-models/config_assembler.ts` — provides assembled configs + provenance (modified in prior node)
    * `[✅]` `supabase/functions/_shared/types.ts` — `FinalAppModelConfig`, `AiModelExtendedConfig`, `ILogger`
    * `[✅]` `supabase/functions/chat/zodSchema.ts` — `AiModelExtendedConfigSchema`
    * `[✅]` **Cross-stream dependency**: Tier infrastructure migration (creates `ai_providers.min_plan_tier_level` column). The auto-tier code writes to this column on new inserts. The migration must be applied to the local DB before running sync locally. Tests mock the DB client so they pass without the column, but live sync requires it.

  * `[✅]` `context_slice`
    * `[✅]` Function signature gains a provenance map parameter (or the assembled config wrapper carries it)
    * `[✅]` Config comparison logic becomes field-aware for cost fields when provenance is `none`
    * `[✅]` Insert path sets `is_enabled = false` when cost provenance is `none`

  * `[✅]` supabase/functions/sync-ai-models/`diffAndPrepareDbOps.test.ts`
    * `[✅]` Test: assembled model with cost provenance `none` and DB model with existing non-null costs → cost fields in DB are preserved, other changed fields still updated
    * `[✅]` Test: assembled model with cost provenance `static_map` and DB model with different costs → cost fields are updated
    * `[✅]` Test: assembled model with cost provenance `api` and DB model with different costs → cost fields are updated
    * `[✅]` Test: new model (insert path) with cost provenance `none` → inserted with `null` costs and `is_enabled = false`, alarm logged
    * `[✅]` Test: new model (insert path) with cost provenance `static_map` → inserted with costs and `is_enabled = true`
    * `[✅]` Test: new model (insert path) with output_token_cost_rate = 3.00 → `min_plan_tier_level` auto-assigned to `0` (free band: output CPM < 10)
    * `[✅]` Test: new model (insert path) with output_token_cost_rate = 15.00 → `min_plan_tier_level` auto-assigned to `10` (basic band: 10 ≤ output CPM < 20)
    * `[✅]` Test: new model (insert path) with output_token_cost_rate = 25.00 → `min_plan_tier_level` auto-assigned to `20` (premium band: output CPM ≥ 20)
    * `[✅]` Test: new model (insert path) with output_token_cost_rate = 75.00 → `min_plan_tier_level` auto-assigned to `20` (premium band: output CPM ≥ 20 — ultra has no model access distinction from premium)
    * `[✅]` Test: new model (insert path) with `null` output_token_cost_rate (provenance `none`) → `min_plan_tier_level` defaults to `10` (basic, safe default for unknown cost)
    * `[✅]` Test: existing model (update path) → `min_plan_tier_level` is NOT overwritten — it is maintainer-controlled once set

  * `[✅]` supabase/functions/sync-ai-models/`diffAndPrepareDbOps.ts`
    * `[✅]` Accept provenance data alongside assembled configs (parameter or wrapper)
    * `[✅]` In the "both configs valid" comparison branch: when computing `changes.config`, if cost provenance is `none`, merge the assembled config but preserve DB's `input_token_cost_rate` and `output_token_cost_rate` when they already have non-null values
    * `[✅]` In the insert path: when cost provenance is `none`, set `is_enabled = false` on the inserted model and log alarm: `[Diff] ALARM: New model {api_identifier} has no trusted cost data. Inserted as disabled.`
    * `[✅]` In the insert path: auto-assign `min_plan_tier_level` from `output_token_cost_rate` cost bands. Bands: output CPM < 10 → `0` (free), 10–20 → `10` (basic), ≥ 20 → `20` (premium). No ultra (30) assignment from cost bands — ultra has no model access distinction from premium; ultra incentives are non-model-related. When output cost is `null` (provenance `none`), default to `10` (basic). This is an initial suggestion; maintainer adjusts when enabling the model. Log the assigned tier level: `[Diff] Auto-assigned min_plan_tier_level={level} for new model {api_identifier} based on output_token_cost_rate={rate}`
    * `[✅]` In the update path: do NOT overwrite existing `min_plan_tier_level` — it is maintainer-controlled once set. Only auto-assignment applies to new inserts.
    * `[✅]` Log when a cost overwrite is suppressed due to provenance

* `[✅]` `[BE]` supabase/functions/sync-ai-models/google_sync **Audit and update Google internal model map**

  * `[✅]` `objective`
    * `[✅]` `INTERNAL_MODEL_MAP` is missing entries for model families that exist in prod: Gemini 3.1 series, Gemini 2.0 series, Gemini 2.5 dated variants, specialty models (TTS, computer-use, image-gen)
    * `[✅]` Audit map against https://ai.google.dev/gemini-api/docs/pricing and add/correct entries so prefix-matching covers all known API identifiers

  * `[✅]` `role`
    * `[✅]` Provider adapter — supplies Tier-3 cost and config data for Google models

  * `[✅]` `module`
    * `[✅]` sync-ai-models bounded context, Google provider

  * `[✅]` `deps`
    * `[✅]` `supabase/functions/sync-ai-models/config_assembler.ts` — consumes the map via `ConfigDataSource.internalModelMap` (interface unchanged)
    * `[✅]` `supabase/functions/_shared/types.ts` — `AiModelExtendedConfig` (unchanged)

  * `[✅]` supabase/functions/sync-ai-models/`google_sync.test.ts`
    * `[✅]` Test: every `api_identifier` observed in current seed.sql for provider `google` resolves to a Tier-3 map entry via prefix match (not Tier-4 default)
    * `[✅]` Test: cost values for key models match official pricing (Gemini 3 Flash: 0.50/3.00, Gemini 3 Pro: 2.00/12.00, Gemini 2.5 Pro: 2.50/15.00, Gemini 2.5 Flash: 0.30/2.50)

  * `[✅]` supabase/functions/sync-ai-models/`google_sync.ts`
    * `[✅]` Add missing map entries for Gemini 3.1, 2.0, and dated/variant models
    * `[✅]` Correct any inaccurate cost values against official pricing page
    * `[✅]` Ensure key prefixes are structured so longest-prefix-match resolves correctly (e.g. `google-gemini-2.5-flash-lite` before `google-gemini-2.5-flash`)
    * `[✅]` Add maintenance comment to `INTERNAL_MODEL_MAP`: "This map must be updated when new models are observed from the provider API. Models without map entries will be inserted as disabled with null costs until configured."
    * `[✅]` Add canonical pricing link into comment above model map so maintainer knows where to locate current pricing. 

* `[✅]` `[BE]` supabase/functions/sync-ai-models/openai_sync **Audit and update OpenAI internal model map**

  * `[✅]` `objective`
    * `[✅]` `INTERNAL_MODEL_MAP` is missing entries for GPT-5.1 codex/chat variants, GPT-5.2 dated variants, GPT-5.3, GPT-5.4 family, GPT-4o family
    * `[✅]` Audit map against https://developers.openai.com/api/docs/pricing and add/correct entries

  * `[✅]` `role`
    * `[✅]` Provider adapter — supplies Tier-3 cost and config data for OpenAI models

  * `[✅]` `module`
    * `[✅]` sync-ai-models bounded context, OpenAI provider

  * `[✅]` `deps`
    * `[✅]` `supabase/functions/sync-ai-models/config_assembler.ts` — consumes the map (interface unchanged)
    * `[✅]` `supabase/functions/_shared/types.ts` — `AiModelExtendedConfig` (unchanged)

  * `[✅]` supabase/functions/sync-ai-models/`openai_sync.test.ts`
    * `[✅]` Test: every `api_identifier` observed in current seed.sql for provider `openai` resolves to a Tier-3 map entry via prefix match
    * `[✅]` Test: cost values for key models match official pricing (GPT-5: 1.25/10.00, GPT-5.2: 1.75/14.00, GPT-5-mini: 1.00/5.00, GPT-5-nano: 0.50/2.00)

  * `[✅]` supabase/functions/sync-ai-models/`openai_sync.ts`
    * `[✅]` Add missing map entries for GPT-5.3, 5.4, codex/chat/dated variants, GPT-4o family
    * `[✅]` Correct any inaccurate cost values against official pricing page
    * `[✅]` Ensure key prefixes are structured for correct longest-prefix-match resolution
    * `[✅]` Add maintenance comment to `INTERNAL_MODEL_MAP`: "This map must be updated when new models are observed from the provider API. Models without map entries will be inserted as disabled with null costs until configured."
    * `[✅]` Add canonical pricing link into comment above model map so maintainer knows where to locate current pricing. 


* `[✅]` `[BE]` supabase/functions/sync-ai-models/anthropic_sync **Audit and update Anthropic internal model map**

  * ` [✅]` `objective`
    * ` [✅]` `INTERNAL_MODEL_MAP` is missing entries for dated variants: `claude-haiku-4-5-20251001`, `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`, and others returned by the API
    * ` [✅]` Audit map against https://platform.claude.com/docs/en/about-claude/pricing and add/correct entries

  * ` [✅]` `role`
    * ` [✅]` Provider adapter — supplies Tier-3 cost and config data for Anthropic models

  * ` [✅]` `module`
    * ` [✅]` sync-ai-models bounded context, Anthropic provider

  * ` [✅]` `deps`
    * ` [✅]` `supabase/functions/sync-ai-models/config_assembler.ts` — consumes the map (interface unchanged)
    * ` [✅]` `supabase/functions/_shared/types.ts` — `AiModelExtendedConfig` (unchanged)

  * ` [✅]` supabase/functions/sync-ai-models/`anthropic_sync.test.ts`
    * ` [✅]` Test: every `api_identifier` observed in current seed.sql for provider `anthropic` resolves to a Tier-3 map entry via prefix match
    * ` [✅]` Test: cost values match official pricing (Opus 4.6: 5.00/25.00, Sonnet 4.6: 3.00/15.00, Haiku 4.5: 1.00/5.00, Opus 4/4.1: 15.00/75.00)

  * ` [✅]` supabase/functions/sync-ai-models/`anthropic_sync.ts`
    * ` [✅]` Add missing map entries for dated variants
    * ` [✅]` Correct any inaccurate cost values against official pricing page
    * ` [✅]` Ensure key prefixes are structured for correct longest-prefix-match resolution
    * ` [✅]` Add maintenance comment to `INTERNAL_MODEL_MAP`: "This map must be updated when new models are observed from the provider API. Models without map entries will be inserted as disabled with null costs until configured."
    * ` [✅]` Add canonical pricing link into comment above model map so maintainer knows where to locate current pricing. 


* `[✅]` `[BE]` supabase/functions/sync-ai-models **Provider sync integration — re-sync, re-seed, verify**

  * ` [✅]` `objective`
    * ` [✅]` After assembler fix + map updates, run sync locally to correct local DB values, then run update-seed.ts to regenerate seed.sql with correct values
    * ` [✅]` Verify no model in seed.sql carries 15/75 cost rates unless that is its actual provider price (only Claude 3 Opus legacy and Claude Opus 4/4.1 at 15/75)
    * ` [✅]` Verify any model with `null` costs has `is_enabled = false`

  * ` [✅]` `role`
    * ` [✅]` Integration verification — proves the full sync→seed pipeline produces correct output

  * ` [✅]` `module`
    * ` [✅]` sync-ai-models bounded context, cross-provider

  * ` [✅]` `deps`
    * ` [✅]` All prior Stream 1 nodes (config_assembler, diffAndPrepareDbOps, google_sync, openai_sync, anthropic_sync)
    * ` [✅]` **Tier infrastructure migration** (creates `ai_providers.min_plan_tier_level` column + backfill). Must be applied to local DB BEFORE running sync locally — the sync pipeline now writes `min_plan_tier_level` on new model inserts. Apply migration first, then run sync.
    * ` [✅]` `supabase/scripts/update-seed.ts` (no changes needed to this file)

  * ` [✅]` supabase/functions/sync-ai-models/`index.test.ts`
    * ` [✅]` Integration-level test: given a representative set of API models with dated/variant identifiers, assert assembled configs carry correct costs from map, not defaults
    * ` [✅]` No model in output carries input_token_cost_rate=15 / output_token_cost_rate=75 unless it is a model where 15/75 is the real price
    * ` [✅]` Any model with `null` costs is `is_enabled = false`
    * ` [✅]` Every newly inserted model has a `min_plan_tier_level` assigned from output cost bands (requires tier migration to have been applied to local DB first)

  * ` [✅]` Run sync locally, run update-seed.ts, inspect regenerated seed.sql

  * ` [✅]` **Commit** `fix(sync-ai-models): prefix-match lookup, refuse-to-guess costs, field-masked diff, auto-tier, map audit`
    * ` [✅]` config_assembler: longest-prefix-match for Tier-3, null costs when no trusted tier provides data (refuse to guess), ephemeral provenance
    * ` [✅]` diffAndPrepareDbOps: field-masked cost update using provenance; auto-assign `min_plan_tier_level` from output cost bands on new model inserts (cross-stream dep: tier migration must be applied first)
    * ` [✅]` google_sync, openai_sync, anthropic_sync: audited and updated internal model maps
    * ` [✅]` seed.sql: regenerated with correct cost values
    * ` [✅]` All tests green


* `[✅]` `[DB]` supabase/migrations **Transactional payment RPCs — atomic subscription + payment + token + tier writes**

  * ` [✅]` `objective`
    * ` [✅]` Current Stripe handlers make 3–5 independent Supabase client calls per webhook event. Each is a separate HTTP request → separate Postgres transaction. If any intermediate call fails, prior writes are already committed and cannot roll back. This has caused real user issues (e.g. subscription created but tokens not awarded).
    * ` [✅]` Fix: create PL/pgSQL functions that bundle all handler writes into a single atomic transaction. The handler gathers all data (including Stripe API calls) in TypeScript, then calls ONE RPC that performs ALL DB writes. If any write fails, everything rolls back. Notifications are fired after the RPC returns (outside the transaction, best-effort).
    * ` [✅]` These RPCs also integrate `refresh_user_tier` — the tier update is just another step in the atomic block, adding no extra risk.

  * ` [✅]` `role`
    * ` [✅]` Infrastructure — transactional DB functions called by payment handlers
    * ` [✅]` Must NOT contain Stripe-specific logic — parameters are adapter-agnostic

  * ` [✅]` `module`
    * ` [✅]` Database functions, cross-cutting — consumed by `_shared/adapters/stripe/handlers/`

  * ` [✅]` `deps`
    * ` [✅]` Prior migration node — `tier_level` columns, `refresh_user_tier()`, `current_plan_tier()` must exist
    * ` [✅]` Existing `record_token_transaction()` function from migration `20250513135601` — called internally by these RPCs within the same transaction
    * ` [✅]` Read `record_token_transaction` parameters carefully (in migration `20250513135601_record_token_transaction.sql`) — the RPCs must pass identical parameter shapes

  * ` [✅]` supabase/migrations/`<timestamp>_transactional_payment_rpcs.sql`

    * ` [✅]` `CREATE OR REPLACE FUNCTION public.complete_checkout_payment(...)`:
      * ` [✅]` Used by: `handleCheckoutSessionCompleted` handler
      * ` [✅]` Parameters — all adapter-agnostic, no Stripe types:
        * Required first (PostgreSQL function rule: no required parameter after a defaulted one):
          * `p_user_id UUID` — the user who made the purchase
          * `p_is_subscription_mode BOOLEAN` — true for subscription checkout, false for OTP
          * `p_payment_transaction_id UUID` — existing payment_transactions row to update
          * `p_gateway_transaction_id TEXT` — gateway session/payment ID to store
        * Optional/defaulted fields after required fields:
          * Subscription fields (used only when `p_is_subscription_mode = true`): `p_plan_id UUID`, `p_subscription_status TEXT`, `p_stripe_customer_id TEXT`, `p_stripe_subscription_id TEXT`, `p_period_start TIMESTAMPTZ`, `p_period_end TIMESTAMPTZ`, `p_cancel_at_period_end BOOLEAN`
          * Token award fields: `p_target_wallet_id UUID`, `p_tokens_to_award NUMERIC`, `p_token_idempotency_key TEXT`, `p_token_notes TEXT`
      * ` [✅]` Operations (in order, all within one transaction):
        1. If `p_is_subscription_mode`: UPSERT `user_subscriptions` with subscription fields (ON CONFLICT user_id)
        2. UPDATE `payment_transactions` SET `status = 'COMPLETED'`, `gateway_transaction_id = p_gateway_transaction_id` WHERE `id = p_payment_transaction_id`
        3. If `p_tokens_to_award > 0`: CALL `record_token_transaction(p_target_wallet_id, 'CREDIT_PURCHASE', p_tokens_to_award::TEXT, p_user_id, p_token_idempotency_key, p_payment_transaction_id, 'payment_transactions', p_payment_transaction_id, p_token_notes)` — this is the SAME RPC that `adminTokenWalletService.recordTransaction()` calls, but invoked within the parent transaction
        4. CALL `refresh_user_tier(p_user_id, true)` — always set ratchet on checkout (any checkout = payment)
      * ` [✅]` Returns: `TABLE(status TEXT, tier_level INTEGER, token_transaction_id UUID)`
      * ` [✅]` On error: entire function rolls back, RAISE the error for the handler to catch

    * ` [✅]` `CREATE OR REPLACE FUNCTION public.complete_invoice_payment(...)`:
      * ` [✅]` Used by: `handleInvoicePaymentSucceeded` handler
      * ` [✅]` Parameters:
        * `p_user_id UUID`
        * Payment transaction insert fields:
          * `p_target_wallet_id UUID`, `p_gateway_transaction_id TEXT` (invoice.id), `p_tokens_to_award NUMERIC`, `p_amount_fiat INTEGER`, `p_currency TEXT`, `p_metadata JSONB`
        * Token award fields:
          * `p_token_idempotency_key TEXT`, `p_token_notes TEXT`
        * Subscription period update fields (nullable — not all invoices have subscription line items):
          * `p_stripe_subscription_id TEXT`, `p_period_start TIMESTAMPTZ`, `p_period_end TIMESTAMPTZ`
      * ` [✅]` Operations (in order, all within one transaction):
        1. INSERT into `payment_transactions` with status `'PROCESSING_RENEWAL'`, RETURNING `id` into `v_payment_id`
        2. If `p_tokens_to_award > 0`: CALL `record_token_transaction(p_target_wallet_id, 'CREDIT_PURCHASE', p_tokens_to_award::TEXT, p_user_id, p_token_idempotency_key, v_payment_id, 'payment_transactions', v_payment_id, p_token_notes)`
        3. UPDATE `payment_transactions` SET `status = 'COMPLETED'` WHERE `id = v_payment_id`
        4. If `p_stripe_subscription_id IS NOT NULL`: UPDATE `user_subscriptions` SET `status = 'active'`, `current_period_start`, `current_period_end` WHERE `stripe_subscription_id = p_stripe_subscription_id`
        5. CALL `refresh_user_tier(p_user_id, true)` — always set ratchet on invoice payment
      * ` [✅]` Returns: `TABLE(payment_transaction_id UUID, tier_level INTEGER, token_transaction_id UUID)`

    * ` [✅]` `CREATE OR REPLACE FUNCTION public.update_subscription_with_tier(...)`:
      * ` [✅]` Used by: `handleCustomerSubscriptionUpdated` and `handleCustomerSubscriptionDeleted` handlers
      * ` [✅]` Parameters:
        * `p_stripe_subscription_id TEXT` — match field to find the user_subscriptions row
        * `p_status TEXT` — new subscription status (e.g. 'active', 'canceled', 'past_due')
        * `p_plan_id UUID` — nullable, new plan_id (set on plan change or cancellation to free plan)
        * `p_period_start TIMESTAMPTZ`, `p_period_end TIMESTAMPTZ` — nullable period fields
        * `p_cancel_at_period_end BOOLEAN` — nullable
        * `p_stripe_customer_id TEXT` — nullable, stored if provided
        * `p_set_ratchet BOOLEAN` — false for subscription lifecycle events (not a payment), but provided for flexibility
      * ` [✅]` Operations (in order, all within one transaction):
        1. UPDATE `user_subscriptions` matching `stripe_subscription_id = p_stripe_subscription_id` with provided fields (only set non-null parameters)
        2. GET `user_id` from the matched row (SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = p_stripe_subscription_id)
        3. CALL `refresh_user_tier(v_user_id, p_set_ratchet)`
      * ` [✅]` Returns: `TABLE(user_id UUID, tier_level INTEGER, rows_updated INTEGER)`

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.checkoutSessionCompleted **Restructure to atomic gather-then-RPC pattern**

  * ` [✅]` `objective`
    * ` [✅]` Currently, `handleCheckoutSessionCompleted` (at `supabase/functions/_shared/adapters/stripe/handlers/stripe.checkoutSessionCompleted.ts`) makes 3+ independent DB writes: (1) upsert user_subscriptions, (2) update payment_transactions to COMPLETED, (3) record_token_transaction via RPC. If step 3 fails after steps 1+2 succeed, the user has a subscription and completed payment record but no tokens. The handler marks this as `TOKEN_AWARD_FAILED` but cannot roll back steps 1+2.
    * ` [✅]` Restructure: the handler gathers ALL data (Stripe API calls, plan lookups, validation) in TypeScript first, then calls the `complete_checkout_payment` transactional RPC with all gathered data. The RPC performs ALL DB writes atomically. If any write fails, everything rolls back.
    * ` [✅]` After the RPC returns successfully, fire the wallet-balance-changed notification (best-effort, outside the transaction) by reading the notification logic from `adminTokenWalletService.ts` lines 206-230.

  * ` [✅]` `role`
    * ` [✅]` Adapter handler — Stripe-specific webhook processing
    * ` [✅]` Must NOT contain DB writes other than the single RPC call — all writes are inside the RPC

  * ` [✅]` `module`
    * ` [✅]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * ` [✅]` `deps`
    * ` [✅]` `complete_checkout_payment` RPC from prior migration node
    * ` [✅]` `HandlerContext` from `_shared/stripe.mock.ts` (existing — provides `supabaseClient`, `logger`, `stripe`, `tokenWalletService`)
    * ` [✅]` Note: `tokenWalletService.recordTransaction()` is NO LONGER called from the handler — the RPC calls `record_token_transaction` internally. The handler still uses `tokenWalletService` only if it needs to fire post-transaction notifications.

  * ` [✅]` `context_slice`
    * ` [✅]` Handler still receives `HandlerContext` unchanged
    * ` [✅]` Handler no longer calls `context.supabaseClient.from('user_subscriptions').upsert(...)` or `context.updatePaymentTransaction(...)` or `context.tokenWalletService.recordTransaction(...)` directly
    * ` [✅]` Handler calls `context.supabaseClient.rpc('complete_checkout_payment', { ... })` once with all gathered data

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.checkoutSessionCompleted.test.ts`
    * ` [✅]` Test: successful subscription-mode checkout → RPC `complete_checkout_payment` called with correct subscription data + payment data + token data + ratchet=true
    * ` [✅]` Test: successful payment-mode (OTP) checkout → RPC called with `p_is_subscription_mode = false`, subscription fields null
    * ` [✅]` Test: failed checkout (early validation failure) → RPC NOT called, early return
    * ` [✅]` Test: RPC returns error → handler returns `{ success: false }` with error message from RPC
    * ` [✅]` Test: RPC succeeds → handler fires wallet notification (best-effort) and returns success with tier_level and tokens_awarded
    * ` [✅]` Test: zero tokens_to_award → RPC still called (payment completion + tier update), but token award is skipped inside RPC
    * ` [✅]` Update existing tests to expect the single RPC call pattern instead of multiple independent DB calls

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.checkoutSessionCompleted.ts`
    * ` [✅]` Read the current file carefully — it is ~280 lines with complex branching for subscription vs payment mode
    * ` [✅]` Restructure into two phases:
      * Phase 1 (Gather): All Stripe API calls, payment_transaction lookup, plan lookup, validation. NO DB writes. This is lines 1-200 of the current handler, refactored to not write to DB.
      * Phase 2 (Execute): Single `context.supabaseClient.rpc('complete_checkout_payment', { p_user_id, p_is_subscription_mode, p_plan_id, ... })` call. Handle success/failure.
    * ` [✅]` After successful RPC: fire wallet notification if tokens were awarded. Read the notification pattern from `adminTokenWalletService.ts` lines 206-230 — call `context.supabaseClient.rpc('create_notification_for_user', ...)` in a try/catch (best-effort).
    * ` [✅]` Remove all direct `.upsert()`, `.update()`, and `tokenWalletService.recordTransaction()` calls from the handler — these are now inside the RPC.
    * ` [✅]` Preserve all existing validation logic, error messages, and logging — only the write path changes.

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.invoicePaymentSucceeded **Restructure to atomic gather-then-RPC pattern**

  * ` [✅]` `objective`
    * ` [✅]` Currently, `handleInvoicePaymentSucceeded` (at `supabase/functions/_shared/adapters/stripe/handlers/stripe.invoicePaymentSucceeded.ts`) makes 4-5 independent DB writes: (1) insert payment_transaction, (2) record_token_transaction via RPC, (3) update payment_transaction to COMPLETED, (4) update user_subscriptions period, (5) tier refresh (new). Partial failure between any of these leaves inconsistent state.
    * ` [✅]` Restructure to gather-then-RPC: the handler gathers all data first (idempotency check, user/wallet lookup, token amount resolution from invoice/subscription/session metadata), then calls `complete_invoice_payment` RPC with all gathered data.

  * ` [✅]` `role`
    * ` [✅]` Adapter handler — Stripe-specific webhook processing
    * ` [✅]` Must NOT contain DB writes other than the single RPC call

  * ` [✅]` `module`
    * ` [✅]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * ` [✅]` `deps`
    * ` [✅]` `complete_invoice_payment` RPC from migration node
    * ` [✅]` `HandlerContext` from `_shared/stripe.mock.ts` (existing)

  * ` [✅]` `context_slice`
    * ` [✅]` Same as checkoutSessionCompleted — handler calls one RPC instead of multiple DB operations
    * ` [✅]` The idempotency check (SELECT for existing COMPLETED transaction) remains as a pre-RPC read — it's a guard, not a write

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.invoice.successful.test.ts`
    * ` [✅]` Rename this file — it tests `StripePaymentAdapter.initiatePayment`, not `handleInvoicePaymentSucceeded`. Rename to `stripePaymentAdapter.initiatePayment.test.ts` and relocate alongside the adapter source. No content changes required.

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.invoice.dbErrors.test.ts`
    * ` [✅]` Delete this file entirely. All five tests (payment_transactions insert fails, tokenWalletService.recordTransaction fails, user_subscriptions update fails, final COMPLETED update fails, sub update fails after token award) cover DB write failure paths that move inside the `complete_invoice_payment` RPC after the refactor. These failure modes are tested at the RPC/migration level, not the handler level.

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.invoice.initial.test.ts`
    * ` [✅]` Rewrite mock setup for the three existing handler tests (renewal happy path, idempotency-COMPLETED, idempotency-FAILED): remove `payment_transactions.insert`, `payment_transactions.update`, `user_subscriptions.update`, and `tokenWalletService.recordTransaction` mocks — these writes no longer exist in the handler. Replace with a single `supabaseClient.rpc('complete_invoice_payment', ...)` mock returning `{ data: [{ payment_transaction_id, tier_level, token_transaction_id }], error: null }`.
    * ` [✅]` Preserve the `subscription_create` early-return test unchanged — it fires before the RPC call and remains valid.
    * ` [✅]` Add test: zero `tokens_to_award` resolved in Phase 1 → RPC still called with `p_tokens_to_award = 0`, handler returns `{ success: true, tokensAwarded: 0 }`.
    * ` [✅]` Add test: no subscription line item (OTP invoice) → Phase 1 extracts null period fields, RPC called with `p_stripe_subscription_id = null`, `p_period_start = null`, `p_period_end = null`.

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.invoice.failure.test.ts`
    * ` [✅]` All five existing tests (subscriptions.retrieve fails, idempotency DB error, user not found, wallet not found, plan not found) remain valid — all are Phase 1 (Gather) failures that fire before the RPC call. Update mock setup only: remove `payment_transactions.insert`, `payment_transactions.update`, and `user_subscriptions.update` mock entries that were included unnecessarily in the setup.
    * ` [✅]` Add test: RPC call returns error → handler returns `{ success: false, error: <RPC error message> }` without firing wallet notification.

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.invoicePaymentSucceeded.ts`
    * ` [✅]` Read the current file — it is 333 lines. Phase 1 and Phase 2 logic is currently interleaved with DB writes; the restructure separates them cleanly.
    * ` [✅]` Phase 1 (Gather) — the following existing logic is unchanged and produces no DB writes:
      * `billing_reason === 'subscription_create'` early return (line 59–67)
      * Idempotency SELECT on `payment_transactions` matching `gateway_transaction_id` and `status = 'COMPLETED'` (line 77–97) — read-only guard, not a write
      * User lookup via `user_subscriptions.select` on `stripe_customer_id` (line 101–113)
      * Wallet lookup via `token_wallets.select` on `user_id` (line 117–127)
      * Token amount resolution chain: invoice metadata → line item metadata → `retrieveSubscriptionPlanDetails` → checkout session metadata (line 129–196)
      * Subscription period extraction from `invoice.lines.data` (line 298–325) — move this block before the RPC call. Locate the subscription line item in `invoice.lines.data` where `type === 'subscription'`. If found: read `subscriptionIdForUpdate`, `periodStartIso`, and `periodEndIso` from the line item, converting epoch timestamps to ISO strings via `new Date(ts * 1000).toISOString()` during extraction. If not found (one-time invoice): assign `subscriptionIdForUpdate`, `periodStartIso`, and `periodEndIso` to `null` explicitly. All variables must be typed from existing source types — do not introduce new types at the call site or rely on coercion.
    * ` [✅]` Phase 2 (Execute) — remove all four DB writes and add one RPC call:
      * Remove: `payment_transactions.insert` (line 221–230)
      * Remove: `tokenWalletService.recordTransaction` (line 245–255)
      * Remove: `payment_transactions.update` to COMPLETED (line 278–291)
      * Remove: `user_subscriptions.update` (line 307–315)
      * Add: `context.supabaseClient.rpc('complete_invoice_payment', { p_user_id: userId, p_target_wallet_id: targetWalletId, p_gateway_transaction_id: invoice.id, p_tokens_to_award: tokensToAward, p_amount_fiat: invoice.total, p_currency: invoice.currency, p_metadata: { stripe_event_id: stripeEventId, stripe_customer_id: stripeCustomerId, stripe_subscription_id: subscriptionId, checkout_session_id: checkoutSessionId, billing_reason: invoice.billing_reason, payment_intent_id: paymentIntentId }, p_token_idempotency_key: event.id, p_token_notes: JSON.stringify({ reason: 'Subscription Renewal', invoice_id: invoice.id, stripe_event_id: stripeEventId, item_id_internal: planItemIdInternal }), p_stripe_subscription_id: subscriptionIdForUpdate, p_period_start: periodStartIso, p_period_end: periodEndIso })` — all three nullable fields are pre-computed in Phase 1 and passed directly; no coercion or fallbacks at the call site
    * ` [✅]` After successful RPC: if `tokensToAward > 0`, fire wallet notification best-effort — call `context.supabaseClient.rpc('create_notification_for_user', ...)` in a try/catch. Read the notification pattern from `adminTokenWalletService.ts` lines 206–230.
    * ` [✅]` Preserve `retrieveSubscriptionPlanDetails` helper — called during Phase 1, unchanged.
    * ` [✅]` Preserve all existing logging.

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionUpdated **Atomic subscription update with tier recomputation**

  * ` [✅]` `objective`
    * ` [✅]` `handleCustomerSubscriptionUpdated` makes one DB write (update user_subscriptions). Adding tier recomputation would add a second independent write. Use `update_subscription_with_tier` RPC to make both atomic.
    * ` [✅]` The current handler (at `stripe.subscriptionUpdated.ts`) builds a `subscriptionUpdateData` partial, then calls `.update()` matching on `stripe_subscription_id`. Replace this with the RPC call.

  * ` [✅]` `role`
    * ` [✅]` Adapter handler — Stripe-specific webhook processing

  * ` [✅]` `module`
    * ` [✅]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * ` [✅]` `deps`
    * ` [✅]` `update_subscription_with_tier` RPC from migration node
    * ` [✅]` `HandlerContext` from `_shared/stripe.mock.ts` (existing)

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.test.ts`
    * ` [✅]` Test: subscription status changes to `active` → RPC `update_subscription_with_tier` called with `p_set_ratchet = false`
    * ` [✅]` Test: subscription status changes to `canceled` → RPC called, free plan resolved internally, `p_set_ratchet = false`
    * ` [✅]` Test: subscription status changes to `past_due` → RPC called with `p_set_ratchet = false`
    * ` [✅]` Test: RPC returns error → handler returns `{ success: false }`
    * ` [✅]` Test: RPC returns tier_level and rows_updated → handler logs and returns success
    * ` [✅]` Update existing tests to expect RPC call instead of direct `.update()`

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.ts`
    * ` [✅]` Read the current file (~100 lines). It builds `subscriptionUpdateData` and calls `.update().eq('stripe_subscription_id', ...)`
    * ` [✅]` Replace the `.update()` call with: `context.supabaseClient.rpc('update_subscription_with_tier', { p_stripe_subscription_id: subscription.id, p_status: subscription.status, p_plan_id: internalPlanId, p_period_start, p_period_end, p_cancel_at_period_end: subscription.cancel_at_period_end, p_stripe_customer_id: stripeCustomerId, p_set_ratchet: false })`
    * ` [✅]` The existing plan resolution logic (lookup internal plan by stripe_price_id, or set to free plan on cancellation) stays in TypeScript — pass the resolved `plan_id` to the RPC.
    * ` [✅]` Log the returned `tier_level` from the RPC result.

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionDeleted **Atomic subscription cancellation with tier recomputation**

  * ` [✅]` `objective`
    * ` [✅]` `handleCustomerSubscriptionDeleted` marks subscription as `canceled` and sets plan to free. Adding tier recomputation via `update_subscription_with_tier` makes both atomic and ensures the user's cached tier drops to `basic` (not `free`) when the ratchet is set.

  * ` [✅]` `role`
    * ` [✅]` Adapter handler — Stripe-specific webhook processing

  * ` [✅]` `module`
    * ` [✅]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * ` [✅]` `deps`
    * ` [✅]` `update_subscription_with_tier` RPC from migration node
    * ` [✅]` `HandlerContext` from `_shared/stripe.mock.ts` (existing)

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.test.ts`
    * ` [✅]` Test: subscription deleted → RPC `update_subscription_with_tier` called with `p_status = 'canceled'`, `p_plan_id` = free plan ID, `p_set_ratchet = false`
    * ` [✅]` Test: RPC returns `tier_level = 10` (basic) for user with `has_ever_paid = true` — confirms ratchet prevents drop to free
    * ` [✅]` Test: RPC returns error → handler returns `{ success: false }`
    * ` [✅]` Update existing tests to expect RPC call instead of direct `.update()`

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.ts`
    * ` [✅]` Read the current file (~70 lines). It looks up the free plan, builds update data, and calls `.update().eq('stripe_subscription_id', ...)`
    * ` [✅]` Keep the free plan lookup in TypeScript (needed to resolve `internalPlanId`)
    * ` [✅]` Replace the `.update()` call with: `context.supabaseClient.rpc('update_subscription_with_tier', { p_stripe_subscription_id: subscription.id, p_status: 'canceled', p_plan_id: internalPlanId, p_cancel_at_period_end: false, p_set_ratchet: false })`
    * ` [✅]` Log the returned `tier_level`.

  * ` [✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.integration.test.ts`
    * ` [✅]` Integration test: full payment lifecycle — checkout creates subscription → invoice payment succeeds → subscription deleted → verify: `has_ever_paid = true`, `tier_level = 10` (basic, not free), `status = 'canceled'`, payment_transactions all COMPLETED, token balance reflects all awards
    * ` [✅]` Integration test: new user with no payments → subscription deleted (edge case, should not happen but must not crash) → verify: `has_ever_paid = false`, `tier_level = 0` (free)

  * ` [✅]` **Commit** `feat(tiers+atomicity): tier infrastructure, transactional payment RPCs, handler restructure`
    * ` [✅]` Migration: `tier_definitions` table, `tier_level` columns on `subscription_plans`/`user_subscriptions`/`ai_providers`, `has_ever_paid` ratchet, `current_plan_tier()` + `refresh_user_tier()` SQL functions, consolidated `handle_new_user()`, GRANT EXECUTE, cost-band backfills
    * ` [✅]` Migration: `complete_checkout_payment`, `complete_invoice_payment`, `update_subscription_with_tier` transactional RPCs — each bundles all handler writes into a single atomic transaction including token award and tier refresh
    * ` [✅]` `checkoutSessionCompleted` + `invoicePaymentSucceeded`: restructured from multiple independent writes to gather-then-RPC atomic pattern
    * ` [✅]` `subscriptionUpdated` + `subscriptionDeleted`: replaced direct `.update()` with `update_subscription_with_tier` RPC for atomic subscription + tier update
    * ` [✅]` All tests green

* Update model costs to match documentation — **COVERED by Stream 1 nodes** (config_assembler prefix match, provider map audits, re-sync + re-seed)
- Gemini 3 Flash, 3 Pro, https://ai.google.dev/gemini-api/docs/pricing
- ChatGPT 5, 5.4, 5.5, https://developers.openai.com/api/docs/pricing
- Claude Opus/Sonnet 4.6, 4.5, 4,  https://platform.claude.com/docs/en/about-claude/pricing

* Add "Basic", "Premium", "Ultra" tiers to existing "Free" — **COVERED by tier infrastructure migration + handler restructure nodes above**
- Plan tiers are configurable, not hard coded → `tier_definitions` table with gapped integer levels + configurable `output_cap_tokens` and `max_models_per_project`
- Any user who makes any purchase ever moves from "Free" to "Basic" and does not degrade → `has_ever_paid` ratchet + `current_plan_tier()` SQL function
- For recurring plans, "Premium" or "Ultra" status as long as plan is maintained, then drops to "Basic" → `current_plan_tier()` reads active subscription tier_level, falls back to basic when ratchet is set

* Gate models and output caps by plan tiers — **PARTIALLY COVERED**: `min_plan_tier_level` column + `tier_definitions` (output_cap_tokens, max_models_per_project) exist after migration. **REMAINING (Stream 3, not yet detailed)**:
- Backend guard on `selected_model_ids` — reject model selection if `model.min_plan_tier_level > user.tier_level`. This is a guard, not a filter: the frontend shows all models but disables selection for unavailable ones. The backend must validate on write to prevent UI bypass. Exception: `cloneProject` intentionally filters (excludes disallowed models, proceeds with clone) rather than rejecting — a partial clone is preferable to no clone. Future work: notify the user of excluded models and offer resolution before the clone proceeds.
- Output cap enforcement in the provider adapters — read `tier_definitions.output_cap_tokens` for the user's tier, apply `min(tier_cap, model.hard_cap_output_tokens)` to `max_tokens` before calling the provider API. The adapters are the most resilient enforcement point because every call path goes through them.
- Model catalog endpoint must return `min_plan_tier_level` per model so the frontend can render availability indicators — read `listModelCatalog.ts` and `ai-providers/index.ts`
- `max_models_per_project` enforcement — guard on project model selection, not on model list
- Clamp values are configurable, not hard coded → `tier_definitions` table
- Initial tiers are free, basic, premium, ultra
- Free, 8k output limit, "free" tagged models, max one model per project
- Basic, 32k output limit, "basic" or lower tagged models, max two models per project 
- Premium, 128k output limit, "premium" or lower tagged models, max three models per project 
- Ultra, no output limit, no model limit

* `[✅]` `[DB]` supabase/migrations **validate_model_tier_access RPC — atomic model tier and count validation**

  * `[✅]` `objective`
    * `[✅]` No SQL function exists to validate whether a user's tier permits a given set of model IDs, or whether the count of selected models exceeds the user's `max_models_per_project`. All three write paths that set `selected_model_ids` on `dialectic_sessions` need a single authoritative guard to prevent tier bypass from the frontend or direct API calls, without exposing another user's subscription-derived tier data to authenticated callers.
    * `[✅]` Functional goals: implement one private helper that accepts a user ID plus model IDs for trusted backend/service-role callers, and one public authenticated wrapper that derives the caller from `auth.uid()` for self-service prevalidation. Both surfaces return whether the selection is valid, which model IDs are above the user's tier, whether the count exceeds the per-tier model limit, the user's current tier level, and the tier's max models value. Callers decide how to handle invalid selections; the public authenticated surface must not accept arbitrary user IDs.

  * `[✅]` `role`
    * `[✅]` Infrastructure — SQL RPC layer providing atomic model tier access validation
    * `[✅]` Must NOT modify any rows — read-only validation (`STABLE`)
    * `[✅]` Must NOT expose another user's tier metadata to authenticated callers — self-service access is derived from auth context, not caller-supplied user IDs

  * `[✅]` `module`
    * `[✅]` Database, cross-cutting — private helper consumed by `startSession`, `updateSessionModels`, and `cloneProject` in dialectic-service; public wrapper consumed only by authenticated self-validation callers

  * `[✅]` `deps`
    * `[✅]` `ai_providers.min_plan_tier_level` — exists after tier infrastructure migration
    * `[✅]` `user_subscriptions.tier_level` — exists after tier infrastructure migration
    * `[✅]` `tier_definitions.max_models_per_project` — exists after tier infrastructure migration
    * `[✅]` Supabase auth context via `auth.uid()`

  * `[✅]` supabase/migrations/`<timestamp>_validate_model_tier_access.sql`
    * `[✅]` Migration test coverage is provided by consumer write-path tests, not a `.test.sql` file. The empty-array guard is exercised by the `startSession.happy.test.ts` empty-`selected_model_ids` test added in the startSession node — the helper returns `valid = true, over_model_limit = false, disallowed_model_ids = '{}'` and the INSERT proceeds.

    * `[✅]` `CREATE SCHEMA IF NOT EXISTS private`

    * `[✅]` `CREATE OR REPLACE FUNCTION private.validate_model_tier_access_for_user(p_user_id UUID, p_model_ids UUID[])`
      * `[✅]` `RETURNS TABLE(valid BOOLEAN, user_tier_level INTEGER, max_models_per_project INTEGER, over_model_limit BOOLEAN, disallowed_model_ids UUID[])`
      * `[✅]` `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''`
      * `[✅]` Fully qualify all relation references: `public.user_subscriptions`, `public.tier_definitions`, `public.ai_providers`
      * `[✅]` Fetch user tier: `SELECT us.tier_level INTO v_user_tier FROM public.user_subscriptions us WHERE us.user_id = p_user_id`
      * `[✅]` NULL guard: `IF v_user_tier IS NULL THEN RAISE WARNING '[validate_model_tier_access_for_user] No user_subscriptions row found for user_id %. Defaulting to tier 0 (free, most restrictive). This should not occur in normal operation — all users receive a subscription row on sign-up.', p_user_id; v_user_tier := 0; END IF;`
      * `[✅]` Fetch max models: `SELECT td.max_models_per_project INTO v_max_models FROM public.tier_definitions td WHERE td.level = v_user_tier`
      * `[✅]` Empty/null input guard: `IF p_model_ids IS NULL OR array_length(p_model_ids, 1) IS NULL THEN RETURN QUERY SELECT true, v_user_tier, v_max_models, false, '{}'::UUID[]; RETURN; END IF;` — empty selection is always valid; zero models cannot violate tier access or count limit. Without this guard, `array_length('{}'::UUID[], 1)` returns NULL and propagates through `v_over_limit` and `v_valid`, breaking the boolean contract.
      * `[✅]` Find disallowed models: `SELECT array_agg(ap.id) INTO v_disallowed FROM public.ai_providers ap WHERE ap.id = ANY(p_model_ids) AND ap.min_plan_tier_level > v_user_tier`
      * `[✅]` Compute `v_over_limit`: `v_max_models IS NOT NULL AND array_length(p_model_ids, 1) > v_max_models`
      * `[✅]` Compute `v_valid`: `v_disallowed IS NULL AND NOT v_over_limit`
      * `[✅]` `RETURN QUERY SELECT v_valid, v_user_tier, v_max_models, v_over_limit, COALESCE(v_disallowed, '{}'::UUID[])`

    * `[✅]` `REVOKE EXECUTE ON FUNCTION private.validate_model_tier_access_for_user(UUID, UUID[]) FROM PUBLIC, anon, authenticated`
    * `[✅]` `GRANT EXECUTE ON FUNCTION private.validate_model_tier_access_for_user(UUID, UUID[]) TO service_role`

    * `[✅]` `CREATE OR REPLACE FUNCTION public.validate_model_tier_access(p_model_ids UUID[])`
      * `[✅]` `RETURNS TABLE(valid BOOLEAN, user_tier_level INTEGER, max_models_per_project INTEGER, over_model_limit BOOLEAN, disallowed_model_ids UUID[])`
      * `[✅]` `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public`
      * `[✅]` `SELECT * FROM private.validate_model_tier_access_for_user(auth.uid(), p_model_ids)` — authenticated callers may only pre-validate their own selections; the public wrapper must not accept `p_user_id`

    * `[✅]` `GRANT EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) TO authenticated`
    * `[✅]` `REVOKE EXECUTE ON FUNCTION public.validate_model_tier_access(UUID[]) FROM PUBLIC, anon`

* `[✅]` `[BE]` supabase/functions/dialectic-service/listModelCatalog **Expose min_plan_tier_level in model catalog**

  * `[✅]` `objective`
    * `[✅]` `listModelCatalog.ts` maps `ai_providers` rows to `AIModelCatalogEntry` via `rowToCatalogEntry()` (lines 9–43). This mapping does not include `min_plan_tier_level`, so callers cannot determine which models are accessible at each tier.
    * `[✅]` Fix: add `min_plan_tier_level` to the SELECT query and to the `rowToCatalogEntry()` mapping. Add the field to `AIModelCatalogEntry` in `dialectic.interface.ts` (the BE-resident definition). The FE duplicate in `packages/types/src/dialectic.types.ts` is out of scope and deferred to FE work. Return type and function structure are unchanged.

  * `[✅]` `role`
    * `[✅]` Domain query — reads model catalog from DB and returns it to dialectic-service callers
    * `[✅]` Must NOT contain tier enforcement logic — that belongs in write-path guards

  * `[✅]` `module`
    * `[✅]` dialectic-service bounded context; cross-consumed by the frontend project model store

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — `Tables<'ai_providers'>` row type (already includes `min_plan_tier_level`)
    * `[✅]` Tier infrastructure migration must be applied (provides the column)

  * `[✅]` `context_slice`
    * `[✅]` `rowToCatalogEntry()`: add `min_plan_tier_level: row.min_plan_tier_level` to the returned object — the mapping function is preserved, not removed
    * `[✅]` SELECT query: add `min_plan_tier_level` to the column list (currently absent)
    * `[✅]` Return type: unchanged — stays `AIModelCatalogEntry[]`
    * `[✅]` `AIModelCatalogEntry` in `supabase/functions/dialectic-service/dialectic.interface.ts` gains `min_plan_tier_level: number` — BE-resident definition only; the FE duplicate in `packages/types/src/dialectic.types.ts` is out of scope and deferred to FE work

  * `[✅]` supabase/functions/dialectic-service/`listModelCatalog.test.ts`
    * `[✅]` Add test: returned entries include `min_plan_tier_level` as a `number`
    * `[✅]` Add test: returned entry shape matches `AIModelCatalogEntry` including the new `min_plan_tier_level` field
    * `[✅]` Existing tests must still pass with the updated return shape

  * `[✅]` supabase/functions/dialectic-service/`dialectic.interface.ts`
    * `[✅]` Add `min_plan_tier_level: number` to `AIModelCatalogEntry` (line 284)
    * `[✅]` Update consumer test [getProjectDetails.test.ts](supabase/functions/dialectic-service/getProjectDetails.test.ts) — file imports `AIModelCatalogEntry` (line 12) and constructs literal objects of this shape elsewhere in the file. After the field becomes required, every literal that types as `AIModelCatalogEntry` must include `min_plan_tier_level: <appropriate value>`. Locate and update all such literals so the file compiles. No source change to `getProjectDetails.ts`
    * `[✅]` Update consumer mock [_shared/dialectic.mock.ts](supabase/functions/_shared/dialectic.mock.ts) — file imports `AIModelCatalogEntry` (line 9), types `ListModelCatalogFn` return as `Promise<AIModelCatalogEntry[]>` (line 34), and implements `listModelCatalog()` (line 75). Any literal `AIModelCatalogEntry` constructed in this file must include `min_plan_tier_level: <appropriate value>`. Locate and update all such literals so the file compiles.

  * `[✅]` supabase/functions/dialectic-service/`listModelCatalog.ts`
    * `[✅]` The SELECT uses `select("*")` — do not change this; all columns including `min_plan_tier_level` are already returned by the wildcard query
    * `[✅]` In `rowToCatalogEntry()`: add `min_plan_tier_level: row.min_plan_tier_level` to the `entireRow` construction (lines 10–24) — `AiProvidersRow` now requires this field after the migration and `types_db.ts` update; the explicit object construction will fail to compile without it
    * `[✅]` In `rowToCatalogEntry()`: add `min_plan_tier_level: row.min_plan_tier_level` to the `modelCatalogEntry` returned object

* `[✅]` `[BE]` supabase/functions/ai-providers/index **Include min_plan_tier_level in model selector response**

  * `[✅]` `objective`
    * `[✅]` The `/ai-providers` endpoint SELECT fetches `id, name, description, api_identifier, provider, config`. The `min_plan_tier_level` column is absent. The frontend model selector, which consumes this endpoint, cannot gate model availability by the user's tier.
    * `[✅]` Fix: add `min_plan_tier_level` to the SELECT. No changes to filtering logic (API key checks, dummy provider handling).

  * `[✅]` `role`
    * `[✅]` API adapter — HTTP endpoint serving the model catalog to the frontend model selector
    * `[✅]` Must NOT add tier enforcement — lists available models; the write-path guard is the enforcement point

  * `[✅]` `module`
    * `[✅]` ai-providers edge function

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — `Tables<'ai_providers'>` (already has `min_plan_tier_level`)

  * `[✅]` `context_slice`
    * `[✅]` The SELECT that fetches provider columns: add `min_plan_tier_level` to the column list
    * `[✅]` No explicit response type exists in this file — the handler returns `{ providers: configuredProviders }` where `configuredProviders` is the raw filtered SELECT result. Adding the column to the SELECT propagates the field through the raw row data; no response-type edit required.
    * `[✅]` Provider filtering logic (API key check, dummy handling): unchanged

  * `[✅]` supabase/functions/ai-providers/`index.test.ts`
    * `[✅]` File exists at this path — modify in place
    * `[✅]` Add test: response items include `min_plan_tier_level` as a `number`
    * `[✅]` Existing provider filtering tests must still pass

  * `[✅]` supabase/functions/ai-providers/`index.ts`
    * `[✅]` Add `min_plan_tier_level` to the SELECT column list
    * `[✅]` Confirm response type reflects the field (update if explicitly typed; the DB row type already carries it)

  * `[✅]` **Commit** `feat(model-catalog): expose min_plan_tier_level in model catalog endpoints`
    * `[✅]` `dialectic.interface.ts`: add `min_plan_tier_level: number` to `AIModelCatalogEntry` (BE definition; FE duplicate in `packages/types` deferred to FE work)
    * `[✅]` `listModelCatalog.ts`: add `min_plan_tier_level` to SELECT and `rowToCatalogEntry()` mapping; return type and function structure unchanged
    * `[✅]` `ai-providers/index.ts`: add `min_plan_tier_level` to SELECT and response

* `[✅]` `[BE]` supabase/functions/dialectic-service/startSession **Guard selected_model_ids against user tier before session INSERT**

  * `[✅]` `objective`
    * `[✅]` `startSession.ts` line 303 writes `selected_model_ids` to `dialectic_sessions` without tier validation. A frontend bypass or direct API call can create a session with models the user's subscription does not permit, or with more models than `max_models_per_project` allows for the user's tier.
    * `[✅]` Fix: call `validate_model_tier_access` RPC after resolving `selectedModels` and before the session INSERT. If `valid = false`: return a distinct error code/message identifying whether the failure is a tier mismatch (`disallowed_model_ids`) or a count violation (`over_model_limit`). Do not write the session on failure.

  * `[✅]` `role`
    * `[✅]` Domain service — session creation entrypoint
    * `[✅]` Guard is a pre-write validation step; it delegates the judgment to the SQL function

  * `[✅]` `module`
    * `[✅]` dialectic-service bounded context

  * `[✅]` `deps`
    * `[✅]` `validate_model_tier_access` RPC (prior migration node)
    * `[✅]` `userClient: SupabaseClient<Database>` — a Supabase client authenticated with the caller's JWT; required because `validate_model_tier_access` calls `auth.uid()` internally, which returns NULL when the client is service_role (`adminClient`). The public function is granted to `authenticated` only — calling it via `adminClient` produces a permission error or silent null-user degradation. `index.ts` already constructs `userClient` via `getSupabaseClient(authToken)` at line 775 and must pass it to `startSession` alongside `adminClient`.
    * `[✅]` `adminClient` — retained for all non-tier-validation DB operations inside `startSession` (project fetch, stage lookup, session INSERT, etc.)
    * `[✅]` Do NOT call `validate_model_tier_access` via `adminClient` — `auth.uid()` is NULL for service_role, rendering the guard incorrect or causing a permission error

  * `[✅]` `context_slice`
    * `[✅]` Insert guard AFTER `selectedModels` is resolved and BEFORE the `dialectic_sessions` INSERT at lines 295–309
    * `[✅]` Guard call: `userClient.rpc('validate_model_tier_access', { p_model_ids: selectedModels.map(m => m.id) })` — use `userClient`, not `dbClient`
    * `[✅]` `startSession` signature gains `userClient: SupabaseClient<Database>` as a new parameter (after `dbClient`, before `payload`); all existing DB operations remain on `dbClient`
    * `[✅]` On RPC error: return `{ error: { message: 'Failed to validate model tier access', status: 500, code: 'TIER_VALIDATION_FAILED' } }`
    * `[✅]` On `valid = false` + `over_model_limit = true`: return `{ error: { message: 'Model selection exceeds the limit for your plan', status: 403, code: 'MODEL_LIMIT_EXCEEDED' } }`
    * `[✅]` On `valid = false` + disallowed models: return `{ error: { message: 'Selected models are not available on your plan', status: 403, code: 'MODEL_TIER_DISALLOWED' } }`
    * `[✅]` On `valid = true`: existing INSERT logic unchanged

  * `[✅]` `startSession.test.ts` does not exist; tests are split by behavior across `startSession.happy.test.ts` and `startSession.errors.test.ts` per the file-organization convention. The new tests must be placed accordingly.

  * `[✅]` supabase/functions/dialectic-service/`startSession.happy.test.ts`
    * `[✅]` All existing tier-guard tests must be updated: supply a separate `userClient` mock with `validate_model_tier_access` configured on it; the main `dbClient` mock must NOT carry `validate_model_tier_access` — this verifies the guard is called via the correct client
    * `[✅]` Add test: all selected models within user's tier and under model count limit → session INSERT proceeds, session returned
    * `[✅]` Add test: empty `selected_model_ids` array → `validate_model_tier_access` returns `valid = true, over_model_limit = false, disallowed_model_ids = []`, INSERT proceeds — this also exercises the migration's empty-array guard

  * `[✅]` supabase/functions/dialectic-service/`startSession.errors.test.ts`
    * `[✅]` All existing tier-guard tests must be updated: supply a separate `userClient` mock with `validate_model_tier_access` configured on it; the main `dbClient` mock must NOT carry `validate_model_tier_access`
    * `[✅]` Add test: one selected model has `min_plan_tier_level` above user's `tier_level` → RPC on `userClient` returns `valid = false`, `disallowed_model_ids` populated → session NOT inserted; assertion reads `error.code === 'MODEL_TIER_DISALLOWED'` and `error.status === 403`
    * `[✅]` Add test: `selected_model_ids` count exceeds `max_models_per_project` for user's tier → RPC returns `valid = false`, `over_model_limit = true` → session NOT inserted; assertion reads `error.code === 'MODEL_LIMIT_EXCEEDED'` and `error.status === 403`
    * `[✅]` Add test: `validate_model_tier_access` RPC returns DB error → session NOT inserted; assertion reads `error.code === 'TIER_VALIDATION_FAILED'` and `error.status === 500`

  * `[✅]` supabase/functions/dialectic-service/`startSession.ts`
    * `[✅]` Add `userClient: SupabaseClient<Database>` parameter after `dbClient` and before `payload`; use `userClient` at the `validate_model_tier_access` RPC call site — all other DB operations remain on `dbClient`
    * `[✅]` Handle RPC error, `over_model_limit`, and disallowed model cases as described in `context_slice`
    * `[✅]` On `valid = true`: existing INSERT at lines 295–309 is unchanged

* `[✅]` `[BE]` supabase/functions/dialectic-service/updateSessionModels **Guard selected_model_ids against user tier before session UPDATE**

  * `[✅]` `objective`
    * `[✅]` `updateSessionModels.ts` line 56 updates `selected_model_ids` on an existing session without tier validation. The frontend calls this endpoint dynamically whenever the user changes their model selection mid-project, but a bypass can write inaccessible models or exceed the model count limit without detection.
    * `[✅]` Fix: same guard pattern as `startSession.ts` — call `validate_model_tier_access` RPC before the UPDATE. Return a structured error if invalid; do not execute the UPDATE.

  * `[✅]` `role`
    * `[✅]` Domain service — dynamic model selection update for an existing session

  * `[✅]` `module`
    * `[✅]` dialectic-service bounded context

  * `[✅]` `deps`
    * `[✅]` `validate_model_tier_access` RPC (prior migration node)
    * `[✅]` `userClient: SupabaseClient<Database>` — a Supabase client authenticated with the caller's JWT; required because `validate_model_tier_access` calls `auth.uid()` internally, which returns NULL when the client is service_role (`adminClient`). The public function is granted to `authenticated` only — calling it via `adminClient` produces a permission error or silent null-user degradation. `index.ts` already constructs `userClient` via `getSupabaseClient(authToken)` at line 775 and must pass it to `handleUpdateSessionModels` alongside `adminClient`.
    * `[✅]` `adminClient` — retained for all non-tier-validation DB operations (session UPDATE, model lookup, etc.)
    * `[✅]` Do NOT call `validate_model_tier_access` via `adminClient` — `auth.uid()` is NULL for service_role, rendering the guard incorrect or causing a permission error

  * `[✅]` `context_slice`
    * `[✅]` Guard call pattern: identical to `startSession.ts` — insert before the `.update()` at line 54
    * `[✅]` Guard call: `userClient.rpc('validate_model_tier_access', { p_model_ids: selectedModels.map(model => model.id) })` — use `userClient`, not `dbClient`
    * `[✅]` `handleUpdateSessionModels` signature gains `userClient: SupabaseClient<Database>` as a new parameter; all existing DB operations remain on `dbClient`
    * `[✅]` Same error return shapes and passthrough logic as `startSession.ts` — `{ error: ServiceError }` with structured payload in `error.details` as `Record<string, unknown>[]`

  * `[✅]` supabase/functions/dialectic-service/`updateSessionModels.test.ts`
    * `[✅]` All existing tier-guard tests must be updated: supply a separate `userClient` mock with `validate_model_tier_access` configured on it; the main `dbClient` mock must NOT carry `validate_model_tier_access` — this verifies the guard is called via the correct client
    * `[✅]` Add test: valid selection within tier and count limit → UPDATE proceeds, updated session returned
    * `[✅]` Add test: model above user's tier → `valid = false`, UPDATE NOT executed; assertion reads `error.details[0].disallowed_model_ids` and `error.details[0].user_tier_level`
    * `[✅]` Add test: count exceeds `max_models_per_project` → `valid = false`, `over_model_limit = true`, UPDATE NOT executed; assertion reads `error.details[0].over_model_limit`, `error.details[0].max_models_per_project`, `error.details[0].user_tier_level`
    * `[✅]` Add test: RPC returns DB error → UPDATE NOT executed, generic `ServiceError` propagated with no `details`

  * `[✅]` supabase/functions/dialectic-service/`updateSessionModels.ts`
    * `[✅]` Add `userClient: SupabaseClient<Database>` parameter; use `userClient` at the `validate_model_tier_access` RPC call site — all other DB operations remain on `dbClient`
    * `[✅]` Handle results identically to `startSession.ts` — same error shapes, same passthrough on `valid = true`

* `[✅]` `[BE]` supabase/functions/dialectic-service/cloneProject **Filter tier-inaccessible models from cloned sessions**

  * `[✅]` `objective`
    * `[✅]` `cloneProject.ts` line 216 copies `selected_model_ids` from original sessions verbatim into cloned sessions. The cloning user's tier is not validated. If the user's tier has downgraded since the original project was created, or if they are cloning from a higher-tier project, the cloned sessions will carry inaccessible model IDs.
    * `[✅]` Fix: before each session INSERT in the clone loop, validate the original `selected_model_ids` against the cloning user's tier. Exclude disallowed models from the cloned session — do not abort the clone. Add a TODO comment at the exclusion point identifying this as a known gap for future UX resolution.

  * `[✅]` `role`
    * `[✅]` Domain service — project clone operation; guard here filters rather than rejects because a partial clone is better than no clone

  * `[✅]` `module`
    * `[✅]` dialectic-service bounded context

  * `[✅]` `deps`
    * `[✅]` `validate_model_tier_access` RPC (prior migration node)
    * `[✅]` `userClient: SupabaseClient<Database>` — a Supabase client authenticated with the cloning user's JWT; required because `validate_model_tier_access` calls `auth.uid()` internally, which returns NULL when the client is service_role (`supabaseClient`). The public function is granted to `authenticated` only. `index.ts` already constructs `userClient` via `getSupabaseClient(authToken)` at line 775 and must pass it to `cloneProject` alongside `supabaseClient`.
    * `[✅]` `supabaseClient` — retained for all non-tier-validation DB and storage operations
    * `[✅]` Do NOT call `validate_model_tier_access` via `supabaseClient` — `auth.uid()` is NULL for service_role, rendering the guard incorrect or causing a permission error

  * `[✅]` `context_slice`
    * `[✅]` For each session in the clone loop (around lines 211–222): if `originalSession.selected_model_ids` is non-null and non-empty, call `validate_model_tier_access` with the original model IDs
    * `[✅]` Guard call: `userClient.rpc('validate_model_tier_access', { p_model_ids: originalSession.selected_model_ids })` — use `userClient`, not `supabaseClient`
    * `[✅]` `cloneProject` signature gains `userClient: SupabaseClient<Database>` as a new parameter; all existing DB and storage operations remain on `supabaseClient`
    * `[✅]` Compute `allowedModelIds`: filter original model IDs to those NOT in `result.disallowed_model_ids`
    * `[✅]` If models were excluded: `logger.warn('[cloneProject] Excluded ${excluded.length} model(s) from cloned session ${newSessionId} — models above user tier ${result.user_tier_level}: ${excluded.join(", ")}')`
    * `[✅]` Add TODO comment at the filter step: `// TODO: Models excluded here because they exceed the cloning user's tier may leave the cloned project unable to continue without a valid model. The write-path guards on startSession and updateSessionModels will catch invalid usage at runtime, but the clone itself silently carries the gap. This is a deliberate filter-not-reject decision: a partial clone is preferable to no clone. Future work: before proceeding with the clone, notify the user of excluded models and offer resolution — either select an accessible replacement model or upgrade the plan. See Stream 3 / Gate models scope.`
    * `[✅]` If the RPC itself errors: log warning, use the original unfiltered list (best-effort — write-path guards on start/update catch invalid usage at runtime), continue the clone
    * `[✅]` If `originalSession.selected_model_ids` is null or empty: skip the guard call, clone null/empty as-is

  * `[✅]` supabase/functions/dialectic-service/`cloneProject.test.ts`
    * `[✅]` All existing tier-guard tests must be updated: supply a separate `userClient` mock with `validate_model_tier_access` configured on it; the main `supabaseClient` mock must NOT carry `validate_model_tier_access` — this verifies the guard is called via the correct client
    * `[✅]` Add test: all original models within user's tier → cloned session has identical `selected_model_ids`
    * `[✅]` Add test: one model above user's tier → that model excluded from clone, others preserved, clone succeeds
    * `[✅]` Add test: all models above user's tier → `selected_model_ids` is empty in cloned session, clone succeeds
    * `[✅]` Add test: `validate_model_tier_access` RPC errors → original model IDs used unfiltered, warning logged, clone succeeds
    * `[✅]` Add test: original session has null `selected_model_ids` → guard skipped, null cloned as-is

  * `[✅]` supabase/functions/dialectic-service/`cloneProject.ts`
    * `[✅]` Add `userClient: SupabaseClient<Database>` parameter; use `userClient` at the `validate_model_tier_access` RPC call site in the session clone loop — all other DB and storage operations remain on `supabaseClient`
    * `[✅]` Filter to `allowedModelIds`; add TODO comment; set `selected_model_ids: allowedModelIds` on `newSessionInsert`

* `[✅]` `[BE]` supabase/functions/dialectic-service/index **Update ActionHandlers interface and call sites to thread userClient to tier-guard handlers**

  * `[✅]` `objective`
    * `[✅]` Three handler functions (`startSession`, `handleUpdateSessionModels`, `cloneProject`) gained a `userClient: SupabaseClient<Database>` parameter so tier validation RPC calls run under the authenticated caller's JWT. The `ActionHandlers` interface in `index.ts` declares each function's type signature, and the request handler case blocks pass arguments to each. Both the interface entries and the call sites must be updated to thread `userClient` through. `userClient` is already constructed at line 775 via `getSupabaseClient(authToken)` and is in scope at all three call sites.
    * `[✅]` Fix: update the three `ActionHandlers` interface entries; update the three call sites to pass `userClient` alongside `adminClient`.

  * `[✅]` `role`
    * `[✅]` Edge function entrypoint — routes HTTP requests to domain handler functions
    * `[✅]` Does not implement guard logic; only threads the correct clients to the handlers that do

  * `[✅]` `module`
    * `[✅]` dialectic-service bounded context

  * `[✅]` `deps`
    * `[✅]` `userClient: SupabaseClient` — already constructed at line 775 via `getSupabaseClient(authToken)`; must be forwarded to `startSession` (line 422 case block), `cloneProject` (line 505 case block), and `handleUpdateSessionModels` (line 592 case block)
    * `[✅]` `startSession`, `handleUpdateSessionModels`, `cloneProject` — all gained `userClient` parameter in their respective prior nodes in this checklist

  * `[✅]` `context_slice`
    * `[✅]` `ActionHandlers` interface line 183: `startSession` entry gains `userClient: SupabaseClient` parameter after `dbClient` and before `payload`
    * `[✅]` `ActionHandlers` interface line 203: `cloneProject` entry gains `userClient: SupabaseClient` parameter after `dbClient` and before `fileManager`
    * `[✅]` `ActionHandlers` interface line 211: `updateSessionModels` entry gains `userClient: SupabaseClient` parameter after `dbClient` and before `payload`
    * `[✅]` Call site line 422: `handlers.startSession(userForJson!, adminClient, userClient, payload, { logger })`
    * `[✅]` Call site line 505: `handlers.cloneProject(adminClient, userClient, fileManager, payload.projectId, payload.newProjectName, userForJson!.id)`
    * `[✅]` Call site line 592: `handlers.updateSessionModels(adminClient, userClient, payload, userForJson.id)`

  * `[✅]` supabase/functions/dialectic-service/`index.test.ts`
    * `[✅]` Update all existing tests that invoke mock `ActionHandlers` entries for `startSession`, `cloneProject`, or `updateSessionModels`: add `userClient` to the mock function signature at the correct position
    * `[✅]` Assert that each mock handler receives a `userClient` argument that is distinct from `adminClient` — confirms the routing layer threads the correct client

  * `[✅]` supabase/functions/dialectic-service/`index.ts`
    * `[✅]` `ActionHandlers` interface: update `startSession`, `cloneProject`, and `updateSessionModels` entries as described in `context_slice`
    * `[✅]` Case block line 422: pass `userClient` to `handlers.startSession`
    * `[✅]` Case block line 505: pass `userClient` to `handlers.cloneProject`
    * `[✅]` Case block line 592: pass `userClient` to `handlers.updateSessionModels`

  * `[✅]` supabase/functions/dialectic-service/`modelTiers.integration.test.ts` — proves the updated full call stack (index.ts routing → handler functions → `validate_model_tier_access` via `userClient`) works end-to-end against a real database
    * `[✅]` Requires both `adminClient` (service_role, for DB setup and teardown) and `userClient` (authenticated with caller JWT, for guard RPC calls routed through the handler functions)
    * `[✅]` Test: start a session with a premium-tier model as a free-tier user → rejected with disallowed model error, session not created
    * `[✅]` Test: update an existing session's models to that same premium model as a free-tier user → rejected with disallowed model error, session not updated
    * `[✅]` Test: clone a project whose sessions include that premium model as a free-tier user → clone succeeds, premium model excluded from cloned session's `selected_model_ids`

  * `[✅]` **Commit** `feat(model-tier-guards): validate model tier access and max-models-per-project on all selected_model_ids write points`
    * `[✅]` Migration: `validate_model_tier_access` SQL RPC — reads user tier, checks model access and count, returns structured result; granted to `authenticated`
    * `[✅]` `startSession.ts`, `updateSessionModels.ts`, `cloneProject.ts`: add `userClient` parameter; call `validate_model_tier_access` via `userClient` (not `adminClient`/`supabaseClient`) so `auth.uid()` resolves correctly inside the RPC
    * `[✅]` `startSession.ts`, `updateSessionModels.ts`: reject writes when selected models exceed user tier or count limit; structured error identifies tier mismatch vs. count violation
    * `[✅]` `cloneProject.ts`: filter tier-inaccessible models from cloned sessions; partial clone with TODO comment for future conflict resolution UX
    * `[✅]` `index.ts`: update `ActionHandlers` interface entries and pass `userClient` at all three call sites

* `[✅]` `[BE]` supabase/functions/_shared/utils/affordability_utils **Add tier output cap parameter to getMaxOutputTokens**

  * `[✅]` `objective`
    * `[✅]` `getMaxOutputTokens()` caps output by `hard_cap_output_tokens`, `provider_max_output_tokens`, and the user's wallet budget. The user's tier-based output cap (`tier_definitions.output_cap_tokens`) is not applied. A free-tier user with sufficient wallet balance could request 128k tokens — 16× their permitted 8k tier cap.
    * `[✅]` Fix: add `tierOutputCapTokens` as a new parameter. When non-null, apply it as an explicit conditional cap. When null (ultra tier — no limit from tier), skip the conditional entirely. This is a pure function; it does not fetch from DB.

  * `[✅]` `role`
    * `[✅]` Domain utility — pure output cap calculation, no I/O
    * `[✅]` Must NOT fetch tier data — receives the cap value as a parameter from the caller

  * `[✅]` `module`
    * `[✅]` `_shared/utils`, consumed by `calculateAffordability`

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — `Tables<'tier_definitions'>['output_cap_tokens']` — use this type accessor for the parameter type; the `number | null` union is declared in the row type definition (the authoritative source), not inline at the call site

  * `[✅]` `context_slice`
    * `[✅]` New parameter: `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens']` — appended **after** the existing optional `deficit_tokens_allowed = 0` parameter, also optional with default `null`: `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens'] = null`. This preserves backward compatibility with `chat/` callers that omit the parameter entirely — the chat subsystem does not apply tier output caps and its call sites must not be modified. The dialectic enforcement is at the `CalculateAffordabilityParams.tierOutputCapTokens` required-field boundary, which forces dialectic callers to provide the value explicitly.
    * `[✅]` After computing the existing minimum of all non-tier caps: `if (tierOutputCapTokens !== null && result > tierOutputCapTokens) { result = tierOutputCapTokens }`
    * `[✅]` No nullish coalescing against `Infinity` — the conditional is the complete logic. When null, the block is skipped; no default is substituted.

  * `[✅]` supabase/functions/_shared/utils/`affordability_utils.test.ts`
    * `[✅]` Add test: `tierOutputCapTokens` omitted entirely → result unchanged from existing logic (confirms optional default null behavior; validates `chat/` call sites remain compatible)
    * `[✅]` Add test: `tierOutputCapTokens = null` (explicit) → result unchanged from existing logic (tier conditional not applied)
    * `[✅]` Add test: `tierOutputCapTokens = 32768`, wallet budget allows 100000, model hard cap = 131072 → result = 32768 (tier is binding)
    * `[✅]` Add test: `tierOutputCapTokens = 131072`, model hard cap = 64000 → result = 64000 (model cap is binding)
    * `[✅]` Add test: `tierOutputCapTokens = 131072`, wallet budget = 10000 → result = 10000 (wallet is binding)
    * `[✅]` All existing tests: do NOT add the parameter — must still pass to prove backward compatibility

  * `[✅]` supabase/functions/_shared/utils/`affordability_utils.ts`
    * `[✅]` Add `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens'] = null` as the last parameter to `getMaxOutputTokens()` (after `deficit_tokens_allowed = 0`)
    * `[✅]` Add explicit conditional after existing cap logic: `if (tierOutputCapTokens !== null && result > tierOutputCapTokens) { result = tierOutputCapTokens }`
    * `[✅]` Import `Tables` from `types_db.ts` if not already imported
    * `[✅]` Add a comment above the new parameter documenting why the default exists: two chat-source call sites (`supabase/functions/chat/streamChat/StreamChat.ts:203`, `supabase/functions/chat/streamRewind/streamRewind.ts:214`) intentionally remain unmodified — chat is out of scope for tier capping. The parameter default preserves those call sites without modification. The default is a deliberate part of the contract, not an oversight.

* `[✅]` `[BE]` supabase/functions/dialectic-worker/calculateAffordability **Introduce UserConfig; replace tierOutputCapTokens scalar with userConfig object**

  * `[✅]` `objective`
    * `[✅]` `CalculateAffordabilityParams` carries `tierOutputCapTokens: TierOutputCapTokens` as a bare scalar. User-facing configuration must travel as a typed object so future user config fields can be added to the type without surgery on every consumer's signature.
    * `[✅]` Separate:
      * Functional goals: (1) add `export interface UserConfig { readonly tier_output_cap_tokens: TierOutputCapTokens; }` to `calculateAffordability.interface.ts` after the `TierOutputCapTokens` type alias; (2) replace `tierOutputCapTokens: TierOutputCapTokens` with `userConfig: UserConfig` on `CalculateAffordabilityParams`; (3) replace the two-line `tierOutputCapTokens` scalar check in `isCalculateAffordabilityParams` with a `userConfig` record check; (4) update `CalculateAffordabilityParamsOverrides` and `buildCalculateAffordabilityParams` in the mock to use `userConfig`; (5) update `calculateAffordability.ts` line 83: `params.tierOutputCapTokens` → `params.userConfig.tier_output_cap_tokens`; (6) update all `tierOutputCapTokens` occurrences in tests to `userConfig: { tier_output_cap_tokens: ... }`; (7) add `UserConfig` to exports in `calculateAffordability.provides.ts`
      * Non-functional constraints: no behavioral change — the scalar value flows identically to `getMaxOutputTokens`; only its container changes
    * `[✅]` Each goal is atomic and testable

  * `[✅]` `role`
    * `[✅]` Domain service — affordability computation; owner and export origin of the `UserConfig` type
    * `[✅]` Appropriate because `calculateAffordability` is the lowest-level consumer of the user's tier cap in the dialectic-worker chain; defining `UserConfig` here makes it the authoritative source imported by all upstream modules
    * `[✅]` Must NOT: fetch tier data from DB; must NOT contain event queue serialization or provider adapter logic

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context
    * `[✅]` Inside: `UserConfig`, `TierOutputCapTokens`, affordability computation and compression orchestration types and implementation
    * `[✅]` Outside: DB tier lookup (owned by `prepareModelJob`), event queue serialization (owned by `enqueueModelCall`), provider adapter selection (owned by `getNodeAiAdapter`)
    * `[✅]` Boundary rule: `UserConfig` is exported from this module and imported inward by upstream modules; import direction is always upstream → this module, never the reverse

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — database/infra layer — inward — provides `Tables<'tier_definitions'>['output_cap_tokens']` for the `TierOutputCapTokens` type alias used inside `UserConfig`
    * `[✅]` `_shared/utils/affordability_utils.ts` — utility layer — inward — provides `getMaxOutputTokens` threaded as a dep via `CalculateAffordabilityDeps.getMaxOutputTokens`
    * `[✅]` Confirm: no reverse dependencies; no lateral layer violations

  * `[✅]` `context_slice`
    * `[✅]` `CalculateAffordabilityParams` exposes `userConfig: UserConfig`; callers provide the full object; no consumer accesses `tier_output_cap_tokens` directly at this params boundary
    * `[✅]` `isCalculateAffordabilityParams` checks `'userConfig' in v && isRecord(v.userConfig)`, then `typeof v.userConfig.tier_output_cap_tokens === 'number' || v.userConfig.tier_output_cap_tokens === null`
    * `[✅]` Confirm: no over-fetching — `UserConfig` has exactly one field matching what `getMaxOutputTokens` needs; no hidden coupling — `UserConfig` is a pure interface with no runtime behavior

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.interface.test.ts`
    * `[✅]` Add import: `UserConfig` from `calculateAffordability.interface.ts`
    * `[✅]` Add test: `UserConfig` shape has exactly `tier_output_cap_tokens: number | null` — `const uc: UserConfig = { tier_output_cap_tokens: null }` and `const uc2: UserConfig = { tier_output_cap_tokens: 32768 }` both satisfy the type; assert both equal their respective values
    * `[✅]` Replace test at line 166 (`CalculateAffordabilityParams contract: tierOutputCapTokens is number | null per interface`): rename to `CalculateAffordabilityParams contract: userConfig is UserConfig per interface`; test `const uc: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null }` and `{ tier_output_cap_tokens: 32768 }`; assert both equal their respective values
    * `[✅]` Replace test at line 176 (`tierOutputCapTokens null is valid`): rename to `userConfig with tier_output_cap_tokens null is valid`; `const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: null }`; assert `userConfig.tier_output_cap_tokens === null`
    * `[✅]` Replace test at line 181 (`tierOutputCapTokens 32768 is valid`): rename to `userConfig with tier_output_cap_tokens 32768 is valid`; `const userConfig: CalculateAffordabilityParams["userConfig"] = { tier_output_cap_tokens: 32768 }`; assert `userConfig.tier_output_cap_tokens === 32768`
    * `[✅]` All other tests (lines 19–165, 186–189) unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.interface.ts`
    * `[✅]` After line 17 (`TierOutputCapTokens` type alias): add `export interface UserConfig { readonly tier_output_cap_tokens: TierOutputCapTokens; }`
    * `[✅]` Line 47: replace `tierOutputCapTokens: TierOutputCapTokens;` with `userConfig: UserConfig;` in `CalculateAffordabilityParams`
    * `[✅]` All other types and exports unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.interaction.spec`
    * `[✅]` Caller: `prepareModelJob` constructs `userConfig: UserConfig = { tier_output_cap_tokens: fetchedScalar }` and passes it in `CalculateAffordabilityParams`
    * `[✅]` `calculateAffordability` reads `params.userConfig.tier_output_cap_tokens` at line 83 and forwards it as the 6th argument to `deps.getMaxOutputTokens(walletBalance, initialTokenCount, extendedModelConfig, deps.logger, 0, params.userConfig.tier_output_cap_tokens)`
    * `[✅]` No side effects on `userConfig`: the field is declared `readonly`; `calculateAffordability` does not mutate it
    * `[✅]` Failure modes: params missing `userConfig` → `isCalculateAffordabilityParams` returns false before function executes; `userConfig.tier_output_cap_tokens` is not a number or null → guard returns false
    * `[✅]` No ordering or temporal constraints beyond the existing compression flow

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.guard.test.ts`
    * `[✅]` Replace test at line 238 (`isCalculateAffordabilityParams accepts params with tierOutputCapTokens null`): rename to `isCalculateAffordabilityParams accepts params with userConfig: { tier_output_cap_tokens: null }`; build params with `buildCalculateAffordabilityParams(DbClient(client), { userConfig: { tier_output_cap_tokens: null } })`; assert guard returns true
    * `[✅]` Replace test at line 246 (`isCalculateAffordabilityParams accepts params with tierOutputCapTokens 32768`): rename to `isCalculateAffordabilityParams accepts params with userConfig: { tier_output_cap_tokens: 32768 }`; use `{ userConfig: { tier_output_cap_tokens: 32768 } }` override; assert true
    * `[✅]` Replace test at line 254 (`isCalculateAffordabilityParams rejects params missing tierOutputCapTokens`): rename to `isCalculateAffordabilityParams rejects params missing userConfig`; destructure `const { userConfig: _userConfig, ...missingUserConfig } = valid`; assert `isCalculateAffordabilityParams(missingUserConfig)` is false
    * `[✅]` Add test: `isCalculateAffordabilityParams rejects params where userConfig is not a record`; spread valid params with `userConfig: 'not-a-record'`; assert false
    * `[✅]` All other tests (lines 34–237, 261–278) unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.guard.ts`
    * `[✅]` Lines 75–80: replace the `tierOutputCapTokens` scalar check — remove `if (!('tierOutputCapTokens' in value)) { return false; }` and `if (typeof value.tierOutputCapTokens !== 'number' && value.tierOutputCapTokens !== null) { return false; }` — add `if (!('userConfig' in value) || !isRecord(value.userConfig)) { return false; }` then `if (typeof value.userConfig.tier_output_cap_tokens !== 'number' && value.userConfig.tier_output_cap_tokens !== null) { return false; }`
    * `[✅]` All other guard functions unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.test.ts`
    * `[✅]` Line 24: add `UserConfig` to the import list from `calculateAffordability.interface.ts`
    * `[✅]` All `buildCalculateAffordabilityParams` overrides with `tierOutputCapTokens: null` (lines 56, 96, 127, 171, 212, 247, 284, 321, 358, 396, 443, 494, 539, 593, 648, 702, 764, 882, 940): replace `tierOutputCapTokens: null` with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` Lines 70, 466, 725: replace `params.tierOutputCapTokens` with `params.userConfig.tier_output_cap_tokens`
    * `[✅]` Line 829: replace `tierOutputCapTokens: tierCap` with `userConfig: { tier_output_cap_tokens: tierCap }`
    * `[✅]` Line 791 test name: `non-oversized: deps.getMaxOutputTokens receives params.tierOutputCapTokens value` → `non-oversized: deps.getMaxOutputTokens receives params.userConfig.tier_output_cap_tokens value`
    * `[✅]` Line 845 test name: `non-oversized: deps.getMaxOutputTokens receives null tierOutputCapTokens when params null` → `non-oversized: deps.getMaxOutputTokens receives null tier_output_cap_tokens via params.userConfig`
    * `[✅]` Lines 915 and 924: `tierOutputCapTokens` in the `getMaxOutputTokens` spy mock parameter name and body — these are the utility function's own signature, not `CalculateAffordabilityParams`; they remain unchanged

  * `[✅]` `construction`
    * `[✅]` `buildCalculateAffordabilityParams(dbClient, overrides?)` is the sole factory for `CalculateAffordabilityParams`; `dbClient: SupabaseClient<Database>` is required at construction time
    * `[✅]` After this node: `overrides.userConfig` replaces `overrides.tierOutputCapTokens`; the base object always sets `userConfig: overrides?.userConfig ?? { tier_output_cap_tokens: null }`
    * `[✅]` No partially constructed instances: `userConfig` always resolves to a full `UserConfig` object with `tier_output_cap_tokens` set
    * `[✅]` Invalid construction context: `tierOutputCapTokens` is removed from `CalculateAffordabilityParamsOverrides` entirely; callers must use `userConfig`
    * `[✅]` No initialization ordering constraints

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.ts`
    * `[✅]` Line 83: replace `params.tierOutputCapTokens` with `params.userConfig.tier_output_cap_tokens`
    * `[✅]` All other code unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.mock.ts`
    * `[✅]` Line 37: add `UserConfig` to the import list from `calculateAffordability.interface.ts`
    * `[✅]` `CalculateAffordabilityParamsOverrides` type (line 63): replace `tierOutputCapTokens?: TierOutputCapTokens;` with `userConfig?: UserConfig;`
    * `[✅]` `buildCalculateAffordabilityParams` base object (line 126): replace `tierOutputCapTokens: overrides?.tierOutputCapTokens !== undefined ? overrides.tierOutputCapTokens : null` with `userConfig: overrides?.userConfig !== undefined ? overrides.userConfig : { tier_output_cap_tokens: null }`

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.provides.ts`
    * `[✅]` Add `UserConfig` to the `export type { ... }` block from `calculateAffordability.interface.ts` (after `TierOutputCapTokens`); all other exports unchanged

  * `[✅]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.integration.test.ts`
    * `[✅]` Line 176: replace `params.tierOutputCapTokens` with `params.userConfig.tier_output_cap_tokens`
    * `[✅]` Line 480 test name: update from `tierOutputCapTokens=32768` to `userConfig.tier_output_cap_tokens=32768`
    * `[✅]` Line 516: replace `tierOutputCapTokens: 32768` with `userConfig: { tier_output_cap_tokens: 32768 }`
    * `[✅]` Line 553: replace `params.tierOutputCapTokens` with `params.userConfig.tier_output_cap_tokens`
    * `[✅]` All other integration tests unchanged

  * `[✅]` `directionality`
    * `[✅]` Node layer: domain service
    * `[✅]` `calculateAffordability.interface.ts` exports `UserConfig` outward — consumed by `enqueueModelCall.interface.ts` and `prepareModelJob.ts`; import direction is always upstream → this module, never the reverse
    * `[✅]` `calculateAffordability.provides.ts` is the single outward-facing export surface; no external consumer bypasses it
    * `[✅]` No cycles: `calculateAffordability` does not import from `prepareModelJob`, `enqueueModelCall`, or `getNodeAiAdapter`

  * `[✅]` `requirements`
    * `[✅]` `CalculateAffordabilityParams["userConfig"]` is type `UserConfig` with `tier_output_cap_tokens: number | null` — observable: TypeScript compiler enforces at all construction sites; maps to interface tests
    * `[✅]` `isCalculateAffordabilityParams` accepts `{ userConfig: { tier_output_cap_tokens: null } }` and `{ userConfig: { tier_output_cap_tokens: 32768 } }`; rejects params missing `userConfig` and rejects non-record `userConfig` — observable: guard tests GREEN
    * `[✅]` `calculateAffordability.ts` reads `params.userConfig.tier_output_cap_tokens` at line 83 and passes it to `deps.getMaxOutputTokens` as the 6th argument — observable: spy assertion in `calculateAffordability.test.ts` GREEN
    * `[✅]` All pre-existing tests pass without modification except those lines explicitly listed above — observable: test runner GREEN for entire package

* `[✅]` `[BE]` supabase/functions/dialectic-worker/compressPrompt **Explicit null for tierOutputCapTokens at all getMaxOutputTokens call sites**

  * `[✅]` `objective`
    * `[✅]` `compressPrompt.ts` calls `getMaxOutputTokens` at two points (~lines 255, ~304). Once `getMaxOutputTokens` gains the optional `tierOutputCapTokens` parameter, these call sites must pass `null` explicitly. The compression subsystem does not enforce tier output caps — caps apply only to the final committed output token count, not to the iterative budget estimation during compression. Explicit null makes this intent visible and prevents future ambiguity.

  * `[✅]` `role`
    * `[✅]` Domain service — prompt compression; consumer of `affordability_utils.ts`
    * `[✅]` Must NOT apply tier output caps during compression budget estimation — pass null explicitly at all `getMaxOutputTokens` call sites

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context

  * `[✅]` `deps`
    * `[✅]` `affordability_utils.ts` (prior node — `getMaxOutputTokens` with new optional parameter)

  * `[✅]` supabase/functions/dialectic-worker/compressPrompt/`compressPrompt.test.ts`
    * `[✅]` Locate all direct calls to `getMaxOutputTokens` in the test file (~lines 306, 312, 791, 966) — update each to pass `null` as the `tierOutputCapTokens` argument explicitly
    * `[✅]` All existing assertions must still pass

  * `[✅]` supabase/functions/dialectic-worker/compressPrompt/`compressPrompt.ts`
    * `[✅]` At ~line 255 (`plannedMaxOutputForCheck`): add `null` as the `tierOutputCapTokens` argument to `getMaxOutputTokens` — explicit intent: compression budget estimation does not apply tier cap
    * `[✅]` At ~line 304 (`plannedMaxOutputTokensPost`): add `null` as the `tierOutputCapTokens` argument to `getMaxOutputTokens` — same rationale

* `[✅]` `[BE]` supabase/functions/dialectic-worker/createJobContext **Thread getMaxOutputTokens through JobContextParams → IJobContext → createPrepareModelJobContext deps binding**

  * `[✅]` `objective`
    * `[✅]` `createPrepareModelJobContext` in `createJobContext.ts` constructs `CalculateAffordabilityDeps` inline with only `logger`, `countTokens`, and `compressPrompt`. `CalculateAffordabilityDeps` requires a fourth field: `getMaxOutputTokens: GetMaxOutputTokensFn`. This is a compile error. Fix: add `getMaxOutputTokens` to `JobContextParams` and `IJobContext` — matching the established pattern for pure utility functions (`validateWalletBalance`, `validateModelCostRates`, `pickLatest`) — thread it from `params` through `createJobContext` onto `root`, and bind it into the inline deps object in `createPrepareModelJobContext`. Update all files in the node accordingly.

  * `[✅]` `role`
    * `[✅]` Application service — constructs and wires the `JobContext` for a worker job execution

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context

  * `[✅]` `deps`
    * `[✅]` `calculateAffordability.interface.ts` (prior node) — provides `GetMaxOutputTokensFn` type and `CalculateAffordabilityDeps` with required `getMaxOutputTokens`
    * `[✅]` `_shared/utils/affordability_utils.ts` — provides the concrete `getMaxOutputTokens` implementation used in `JobContext.mock.ts` and `createJobContext.interface.test.ts`

  * `[✅]` `context_slice`
    * `[✅]` Add `readonly getMaxOutputTokens: GetMaxOutputTokensFn` to `IJobContext` and `JobContextParams`
    * `[✅]` In `createJobContext`: pass `getMaxOutputTokens: params.getMaxOutputTokens` in the return object
    * `[✅]` In `createPrepareModelJobContext`: add `getMaxOutputTokens: root.getMaxOutputTokens` to the inline `CalculateAffordabilityDeps` object

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`createJobContext.interface.test.ts`
    * `[✅]` Add `import { getMaxOutputTokens } from '../../_shared/utils/affordability_utils.ts'`
    * `[✅]` Add `getMaxOutputTokens: getMaxOutputTokens` to the `params: JobContextParams` literal
    * `[✅]` Add `getMaxOutputTokens: params.getMaxOutputTokens` to the `job: IJobContext` literal
    * `[✅]` Add `assertEquals(typeof params.getMaxOutputTokens, 'function')` and `assertEquals(typeof job.getMaxOutputTokens, 'function')` assertions

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`JobContext.interface.ts`
    * `[✅]` Add `import type { GetMaxOutputTokensFn } from '../calculateAffordability/calculateAffordability.interface.ts'`
    * `[✅]` Add `readonly getMaxOutputTokens: GetMaxOutputTokensFn` to `IJobContext`
    * `[✅]` Add `readonly getMaxOutputTokens: GetMaxOutputTokensFn` to `JobContextParams`

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`JobContext.guard.test.ts`
    * `[✅]` Inside the `isIJobContext` describe block: add `it('returns false when getMaxOutputTokens is missing', ...)` — destructure `getMaxOutputTokens` from `buildIJobContext()`, assert `isIJobContext` returns `false`
    * `[✅]` Inside the `isIJobContext` describe block: add `it('returns false when getMaxOutputTokens is not a function', ...)` — spread `buildIJobContext()` with `getMaxOutputTokens: 'not-a-function'`, assert `isIJobContext` returns `false`

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`JobContext.guard.ts`
    * `[✅]` Add `'getMaxOutputTokens' in value && typeof value.getMaxOutputTokens === 'function'` to the `isIJobContext` return expression

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`createJobContext.test.ts`
    * `[✅]` In the `'calculateAffordability delegates to calculateAffordabilityFn...'` test: add `assertEquals(recordedAffordabilityDeps[0].getMaxOutputTokens, root.getMaxOutputTokens)` after the existing deps assertions

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`createJobContext.ts`
    * `[✅]` In `createJobContext`: add `getMaxOutputTokens: params.getMaxOutputTokens` to the return object
    * `[✅]` In `createPrepareModelJobContext`: add `getMaxOutputTokens: root.getMaxOutputTokens` to the inline `CalculateAffordabilityDeps` object

  * `[✅]` supabase/functions/dialectic-worker/createJobContext/`JobContext.mock.ts`
    * `[✅]` Add `import { getMaxOutputTokens } from '../../_shared/utils/affordability_utils.ts'`
    * `[✅]` Add `getMaxOutputTokens: getMaxOutputTokens` to `baseParams` in `createMockJobContextParams`
    * `[✅]` Add `getMaxOutputTokens: params.getMaxOutputTokens` to the return object of `buildIJobContext`

* `[✅]` `[BE]` supabase/functions/dialectic-worker/enqueueModelCall **Replace tier_output_cap_tokens scalar with UserConfig on EnqueueModelCallParams; user_config on AiStreamEventData**

  * `[✅]` `objective`
    * `[✅]` `EnqueueModelCallParams` currently carries `tier_output_cap_tokens` as a loose scalar and `AiStreamEventData` carries the same scalar. Per the `UserConfig` architecture introduced in the `calculateAffordability` node, user-facing configuration must travel as a typed object — not a bare scalar — so future user config fields can be added to the type without surgery on every consumer. Replace the loose scalar with `userConfig: UserConfig` on `EnqueueModelCallParams` and `user_config: UserConfig` on `AiStreamEventData` (snake_case for JSON transport). Update all guards, the source constructor, the mock, and all test constructions throughout this module.

  * `[✅]` `role`
    * `[✅]` Domain service — enqueues the model call event; passes the complete user config object through to the event payload without interpretation

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context

  * `[✅]` `deps`
    * `[✅]` `calculateAffordability.interface.ts` (prior node) — provides `UserConfig` type; import it here
    * `[✅]` `types_db.ts` — `Tables<'tier_definitions'>['output_cap_tokens']` still used inside `UserConfig.tier_output_cap_tokens`; no direct import change needed here since `UserConfig` encapsulates it

  * `[✅]` `context_slice`
    * `[✅]` `EnqueueModelCallParams`: remove `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`; add `userConfig: UserConfig`; add `import type { UserConfig } from '../calculateAffordability/calculateAffordability.interface.ts'`
    * `[✅]` `AiStreamEventData`: remove `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`; add `user_config: UserConfig`
    * `[✅]` `isEnqueueModelCallParams` guard: add `'userConfig'` to the required keys array; add `if (!isRecord(v.userConfig)) return false` after the string checks
    * `[✅]` `isAiStreamEventData` guard: replace `tier_output_cap_tokens` scalar check with `user_config` record check: `if (!('user_config' in v) || !isRecord(v.user_config)) return false`; then validate `typeof v.user_config.tier_output_cap_tokens === 'number' || v.user_config.tier_output_cap_tokens === null`
    * `[✅]` In the `eventData` constructor in `enqueueModelCall.ts`: `tier_output_cap_tokens: params.tier_output_cap_tokens` → `user_config: params.userConfig`

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.interface.test.ts`
    * `[✅]` `EnqueueModelCallParams` surface test (~line 31): replace `tier_output_cap_tokens: true` with `userConfig: true`; field count remains 6
    * `[✅]` `AiStreamEventData` surface tests (~lines 82, 150): replace `tier_output_cap_tokens: true` with `user_config: true`; field count remains 6
    * `[✅]` Replace `EnqueueModelCallParams["tier_output_cap_tokens"]` type test (~line 163) with `UserConfig` object shape test: `const uc: EnqueueModelCallParams["userConfig"] = { tier_output_cap_tokens: null }` and `{ tier_output_cap_tokens: 32768 }`
    * `[✅]` Replace `AiStreamEventData["tier_output_cap_tokens"]` type test (~line 183) with `user_config` object shape test: `const uc: AiStreamEventData["user_config"] = { tier_output_cap_tokens: null }` and `{ tier_output_cap_tokens: 32768 }`
    * `[✅]` Replace scalar null-valid test (~line 202): `EnqueueModelCallParams["userConfig"]` and `AiStreamEventData["user_config"]` both accept `{ tier_output_cap_tokens: null }`

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.interface.ts`
    * `[✅]` Add `import type { UserConfig } from '../calculateAffordability/calculateAffordability.interface.ts'`
    * `[✅]` `EnqueueModelCallParams`: remove `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`; add `userConfig: UserConfig`
    * `[✅]` `AiStreamEventData`: remove `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`; add `user_config: UserConfig`

  * `[✅]` `enqueueModelCall.interaction.spec`
    * `[✅]` Called by `prepareModelJob` after resolving affordability; receives fully-constructed `EnqueueModelCallDeps`, `EnqueueModelCallParams` (including `userConfig: UserConfig`), and `EnqueueModelCallPayload`
    * `[✅]` Required dependency interactions in execution order:
      1. `isModelContributionFileType(params.output_type)` — validates output type; `false` → `{ error, retriable: false }`
      2. `isAiModelExtendedConfig(params.providerRow.config)` — validates provider config shape; `false` → `{ error, retriable: false }`
      3. `deps.apiKeyForProvider(params.providerRow.api_identifier)` — returns `string | null`; `null` → `{ error, retriable: false }`
      4. `params.job.user_id` presence check — must be a non-empty string; failure → `{ error, retriable: false }`
      5. `await deps.computeJobSig(params.job.id, params.job.user_id, params.job.created_at)` — produces HMAC signature string; thrown error → `{ error, retriable: false }`
      6. `params.dbClient.from('dialectic_generation_jobs').update({ status: 'queued' }).eq('id', params.job.id)` — marks job queued; `dbError` truthy → `{ error, retriable: true }`
      7. Constructs `AiStreamEventData` with `user_config: params.userConfig`; wraps in `AiStreamEventBody`; serializes to JSON string
      8. Size check: serialized body > 500 KB → `{ error, retriable: false }`
      9. `fetch(deps.netlifyQueueUrl, { method: 'POST', headers: { Authorization: 'Bearer <netlifyApiKey>', 'Content-Type': 'application/json' }, body })` — non-2xx → `{ error, retriable: true }`; network throw → `{ error, retriable: true }`
    * `[✅]` Success path: all validations pass, Netlify returns 2xx → `{ queued: true }`
    * `[✅]` `params.userConfig` is forwarded verbatim as `eventData.user_config` — no transformation, no field extraction

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.guard.test.ts`
    * `[✅]` All inline `EnqueueModelCallParams`-shaped objects that include `tier_output_cap_tokens: null` (lines ~116, 133, 149, 167, 184): replace with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` `isAiStreamEventData` valid test (~line 329): replace `tier_output_cap_tokens: null` with `user_config: { tier_output_cap_tokens: null }` in the inline object
    * `[✅]` `isAiStreamEventData` missing-field tests (~lines 346-424): replace `tier_output_cap_tokens: null` in each inline object with `user_config: { tier_output_cap_tokens: null }`; update the sig-missing test to omit `sig` and include `user_config`
    * `[✅]` Update existing `isAiStreamEventData` accepts-with-null test to use `user_config: { tier_output_cap_tokens: null }`
    * `[✅]` Update existing `isAiStreamEventData` accepts-with-number test to use `user_config: { tier_output_cap_tokens: 32768 }`
    * `[✅]` Update existing `isAiStreamEventData` rejects-missing-field test to omit `user_config` field entirely

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.guard.ts`
    * `[✅]` `isEnqueueModelCallParams`: add `'userConfig'` to the required keys array; after the `output_type` string check add `if (!isRecord(v.userConfig)) { return false; }`
    * `[✅]` `isAiStreamEventData`: remove the two `tier_output_cap_tokens` checks (lines 153-161); add `if (!('user_config' in v) || !isRecord(v.user_config)) { return false; }` then `if (typeof v.user_config.tier_output_cap_tokens !== 'number' && v.user_config.tier_output_cap_tokens !== null) { return false; }`

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.test.ts`
    * `[✅]` All `createMockEnqueueModelCallParams({ tier_output_cap_tokens: null }, ...)` calls (~lines 96, 177, 223, 251, 295, 423, 453, 499, 536, 564, 609, 651, 683, 720): replace override key `tier_output_cap_tokens: null` with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` Inline `EnqueueModelCallParams`-shaped literals that include `tier_output_cap_tokens: null` (~lines 36, 45): replace with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` Inline `AiStreamEventData`-shaped literals that include `tier_output_cap_tokens: null` (~lines 148, 188, 323, 620): replace with `user_config: { tier_output_cap_tokens: null }`
    * `[✅]` `data.tier_output_cap_tokens` assertions (~lines 78-79, 367-368): replace with `data.user_config.tier_output_cap_tokens`
    * `[✅]` Test ~line 735 (tier_output_cap_tokens threading): update params override to `userConfig: { tier_output_cap_tokens: tierCap }`; update event data assertion to `parsed.data.user_config.tier_output_cap_tokens` (~line 767)
    * `[✅]` Test ~line 775 (null threading): update params override to `userConfig: { tier_output_cap_tokens: null }`; update assertions (~lines 804, 808-809) to check `data.user_config.tier_output_cap_tokens`

  * `[✅]` `construction`
    * `[✅]` `EnqueueModelCallDeps` is constructed by callers (`prepareModelJob` supplies it from its own deps); in tests use `createMockEnqueueModelCallDeps(overrides?)` which requires all five fields: `logger`, `netlifyQueueUrl` (string), `netlifyApiKey` (string), `apiKeyForProvider` (function returning `string | null`), `computeJobSig` (async function returning string)
    * `[✅]` `EnqueueModelCallParams` is constructed by `prepareModelJob`; in tests use `createMockEnqueueModelCallParams(overrides?, options?)` which requires `dbClient`, `job` (`DialecticJobRow`), `providerRow` (`Tables<'ai_providers'>`), `userAuthToken` (string), `output_type` (string), and `userConfig: UserConfig` (`{ tier_output_cap_tokens: number | null }`)
    * `[✅]` No partially constructed instances — `isEnqueueModelCallDeps` and `isEnqueueModelCallParams` reject any object missing a required field
    * `[✅]` Invalid construction contexts: any dep field absent; `apiKeyForProvider` or `computeJobSig` not a function; `userConfig` not a record; `userConfig.tier_output_cap_tokens` neither number nor null

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.ts`
    * `[✅]` In the `eventData` object constructor: replace `tier_output_cap_tokens: params.tier_output_cap_tokens` with `user_config: params.userConfig`

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.mock.ts`
    * `[✅]` `createMockEnqueueModelCallParams` base (~line 167): replace `tier_output_cap_tokens: null` with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` `createMockEnqueueModelCallParams` override section (~line 200): replace `tier_output_cap_tokens: overrides.tier_output_cap_tokens !== undefined ? overrides.tier_output_cap_tokens : base.tier_output_cap_tokens` with `userConfig: overrides.userConfig !== undefined ? overrides.userConfig : base.userConfig`
    * `[✅]` `createMockAiStreamEventData` base (~line 297): replace `tier_output_cap_tokens: null` with `user_config: { tier_output_cap_tokens: null }`
    * `[✅]` `createMockAiStreamEventData` override section (~line 330): replace `tier_output_cap_tokens: overrides.tier_output_cap_tokens !== undefined ? overrides.tier_output_cap_tokens : base.tier_output_cap_tokens` with `user_config: overrides.user_config !== undefined ? overrides.user_config : base.user_config`

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.provides.ts`
    * `[✅]` Add `export type { UserConfig } from '../calculateAffordability/calculateAffordability.interface.ts'` — callers constructing `EnqueueModelCallParams.userConfig` or reading `AiStreamEventData.user_config` need this type; re-exporting through the module boundary keeps the import surface at one location

  * `[✅]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.integration.test.ts`
    * `[✅]` Params override `tier_output_cap_tokens: null` (~lines 85, 183): replace with `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` Integration test for threading (~lines 225-291): update params override to `userConfig: { tier_output_cap_tokens: tierCap }`; update assertion (~line 291) to `parsed.data.user_config.tier_output_cap_tokens`

  * `[✅]` `directionality`
    * `[✅]` Node layer: domain service (application layer)
    * `[✅]` Deps are inward-facing: `calculateAffordability.interface.ts` (application layer, prior node in dep chain) provides `UserConfig`; `types_db.ts` (infrastructure layer) provides `Tables<'ai_providers'>` and `Tables<'tier_definitions'>`
    * `[✅]` Provides are outward-facing: `prepareModelJob` is the sole direct consumer of `EnqueueModelCallParams`; `ai-stream-background/adapters` is the downstream consumer of the serialized `AiStreamEventData` after Netlify queue deserialization
    * `[✅]` No cycles

  * `[✅]` `requirements`
    * `[✅]` `isEnqueueModelCallParams` accepts any object with `userConfig` as a record and rejects any object missing `userConfig` or where `userConfig` is not a record — GREEN when guard.test.ts missing-field and type-mismatch tests pass
    * `[✅]` `isAiStreamEventData` accepts any object with `user_config` as a record carrying `tier_output_cap_tokens: number | null` and rejects objects where `user_config` is absent, non-record, or `tier_output_cap_tokens` is neither number nor null — GREEN when guard.test.ts acceptance and rejection tests pass
    * `[✅]` `enqueueModelCall` places `params.userConfig` verbatim on `eventData.user_config`; the value of `eventData.user_config.tier_output_cap_tokens` equals the value supplied in `params.userConfig.tier_output_cap_tokens` — GREEN when test.ts threading tests pass
    * `[✅]` `createMockEnqueueModelCallParams()` (no overrides) returns `{ ..., userConfig: { tier_output_cap_tokens: null } }` — GREEN when mock baseline is updated
    * `[✅]` `createMockAiStreamEventData()` (no overrides) returns `{ ..., user_config: { tier_output_cap_tokens: null } }` — GREEN when mock baseline is updated
    * `[✅]` `enqueueModelCall.provides.ts` re-exports `UserConfig` so consumers import it from the enqueueModelCall module boundary — GREEN when provides.ts export is verified compilable by a consumer

* `[✅]` `[BE]` supabase/functions/dialectic-worker/processSimpleJob **Consumer update: add min_plan_tier_level to ai_providers mock and getMaxOutputTokens to CalculateAffordabilityDeps in integration tests**

  * `[✅]` `objective`
    * `[✅]` Two compile errors exist in this module after the tier migration and prior calculateAffordability/createJobContext nodes:
      1. `processSimpleJob.mock.ts` — `mockProviderData: Tables<'ai_providers'>` is missing `min_plan_tier_level: number`, which is now a required column added by the tier infrastructure migration and reflected in `types_db.ts`.
      2. `processSimpleJob.integration.test.ts` — both Test 1 (~line 277) and Test 2 (~line 1023) construct `CalculateAffordabilityDeps` inline as `{ logger, countTokens, compressPrompt: boundCompressPrompt }`, missing the required `getMaxOutputTokens: GetMaxOutputTokensFn` field added in the prior `calculateAffordability` node.
    * `[✅]` `processSimpleJob.ts` and `processSimpleJob.test.ts` contain no constructions of the changed types and need no changes.
    * `[✅]` Note: `CalculateAffordabilityParams` is never constructed directly in this module — it is passed through from `prepareModelJob` via `BoundCalculateAffordabilityFn`. `EnqueueModelCallParams` is never constructed directly in this module either — it is captured from a spy. `isEnqueueModelCallParams` now checks `userConfig` (an object), but since the spy captures the complete `EnqueueModelCallParams` object actually built by `prepareModelJob` (which will include `userConfig` after the `prepareModelJob` node correction), the existing narrowing assertions remain unaffected.

  * `[✅]` `role`
    * `[✅]` Application service — orchestrates the simple job execution path

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — `Tables<'ai_providers'>['Row']` gains required column `min_plan_tier_level: number` (from tier infrastructure migration)
    * `[✅]` `calculateAffordability.interface.ts` (prior node) — `CalculateAffordabilityDeps` gains required field `getMaxOutputTokens: GetMaxOutputTokensFn`
    * `[✅]` `_shared/utils/affordability_utils.ts` — provides the concrete `getMaxOutputTokens` implementation to supply to the inline deps construction in the integration test

  * `[✅]` `context_slice`
    * `[✅]` `processSimpleJob.mock.ts` line 257: `mockProviderData: Tables<'ai_providers'>` — add `min_plan_tier_level: 0`
    * `[✅]` `processSimpleJob.integration.test.ts` Test 1 (~line 277): `CalculateAffordabilityDeps` inline construction `{ logger, countTokens, compressPrompt: boundCompressPrompt }` — add `getMaxOutputTokens`; add import `import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts"` at top of file
    * `[✅]` `processSimpleJob.integration.test.ts` Test 2 (~line 1023): same `CalculateAffordabilityDeps` inline construction — add `getMaxOutputTokens` (import already added above)

  * `[✅]` supabase/functions/dialectic-worker/`processSimpleJob.mock.ts`
    * `[✅]` `mockProviderData` (line 257): add `min_plan_tier_level: 0` — `Tables<'ai_providers'>` now requires this field; must still compile

  * `[✅]` supabase/functions/dialectic-worker/`processSimpleJob.integration.test.ts`
    * `[✅]` Add import: `import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts"`
    * `[✅]` Test 1 (~line 277): add `getMaxOutputTokens` to the `CalculateAffordabilityDeps` inline construction — `calculateAffordability({ logger, countTokens, compressPrompt: boundCompressPrompt, getMaxOutputTokens }, caParams, caPayload)`
    * `[✅]` Test 2 (~line 1023): add `getMaxOutputTokens` to the `CalculateAffordabilityDeps` inline construction — same pattern
    * `[✅]` All existing tests must still pass

* `[✅]` `[BE]` supabase/functions/dialectic-worker/prepareModelJob **Fetch tier output cap from DB, build UserConfig once, pass to calculateAffordability and enqueueModelCall**

  * `[✅]` `objective`
    * `[✅]` Four compile errors existed in this module after the tier migration and prior calculateAffordability/enqueueModelCall nodes; the DB query and mock fixes are already implemented. The remaining work is to correct the field names used on `CalculateAffordabilityParams` and `EnqueueModelCallParams` to match the `UserConfig` architecture: `prepareModelJob.ts` currently passes `tierOutputCapTokens` (loose scalar) to `affordParams` and `tier_output_cap_tokens: tierOutputCapTokens` to `enqueueModelCallParams`. Both must be replaced by a single `userConfig: UserConfig` object built once from the fetched scalar and passed to both.
    * `[✅]` `prepareModelJob.guard.test.ts` and `prepareModelJob.inputsRequired.test.ts` contain no `EnqueueModelCallParams` or `CalculateAffordabilityParams` constructions — no changes needed.
    * `[✅]` `prepareModelJob.mock.ts` `min_plan_tier_level: 0` is already present on both `mockAiProvidersRow()` and `mockAiProvidersRowFromConfig()` — no changes needed.
    * `[✅]` `prepareModelJob.integration.test.ts` existing constructions use `buildCalculateAffordabilityDeps` (already includes `getMaxOutputTokens`) and `buildMockBoundCalculateAffordabilityFn` (uses `buildCalculateAffordabilityParams` which now defaults `userConfig: { tier_output_cap_tokens: null }`) — no existing construction sites need updating; only the spy-capture assertions at lines 544 and 549 need updating.

  * `[✅]` `role`
    * `[✅]` Domain orchestrator — prepares the AI call payload from job data; sole construction point for `UserConfig` in the Deno worker chain

  * `[✅]` `module`
    * `[✅]` dialectic-worker bounded context

  * `[✅]` `deps`
    * `[✅]` `types_db.ts` — `Tables<"ai_providers">['Row']` requires `min_plan_tier_level: number` (already in mock)
    * `[✅]` `calculateAffordability.interface.ts` (prior node) — provides `UserConfig` type and `CalculateAffordabilityParams.userConfig: UserConfig`; `TierOutputCapTokens` still needed as the DB result scalar type
    * `[✅]` `enqueueModelCall.interface.ts` (prior node) — `EnqueueModelCallParams.userConfig: UserConfig` required
    * `[✅]` `_shared/utils/affordability_utils.ts` — provides concrete `getMaxOutputTokens` for the inline `CalculateAffordabilityDeps` construction in `prepareModelJob.test.ts` (already imported)
    * `[✅]` `calculateAffordability.mock.ts` — `buildCalculateAffordabilityDeps` already includes `getMaxOutputTokens`; `buildCalculateAffordabilityParams` now defaults `userConfig: { tier_output_cap_tokens: null }` — no changes needed to these builders

  * `[✅]` `context_slice`
    * `[✅]` `prepareModelJob.ts`: add `UserConfig` to existing import from `calculateAffordability.interface.ts`; after the DB query resolves `tierOutputCapTokens`, construct `const userConfig: UserConfig = { tier_output_cap_tokens: tierOutputCapTokens }`; replace `tierOutputCapTokens` field on `affordParams` with `userConfig: userConfig`; replace `tier_output_cap_tokens: tierOutputCapTokens` field on `enqueueModelCallParams` with `userConfig: userConfig`
    * `[✅]` `prepareModelJob.test.ts` line 108: update spy-capture line from `EnqueueModelCallParams["tier_output_cap_tokens"]` / `paramArg.tier_output_cap_tokens` to `paramArg.userConfig.tier_output_cap_tokens`
    * `[✅]` `prepareModelJob.test.ts` tests at lines 2074, 2156: update test descriptions and assertions to use `userConfig.tier_output_cap_tokens` instead of `tierOutputCapTokens` / `tier_output_cap_tokens`
    * `[✅]` `prepareModelJob.integration.test.ts` lines 544, 549: update assertions from `affordParams.tierOutputCapTokens` / `enqueueParams.tier_output_cap_tokens` to `affordParams.userConfig.tier_output_cap_tokens` / `enqueueParams.userConfig.tier_output_cap_tokens`

  * `[✅]` `prepareModelJob.interaction.spec`
    * `[✅]` Called by `processSimpleJob` through a `BoundPrepareModelJobFn` wrapper (deps already bound); receives `PrepareModelJobParams` and `PrepareModelJobPayload`
    * `[✅]` Required dependency interactions in execution order:
      1. `dbClient.from('user_subscriptions').select('tier_definitions(output_cap_tokens)').eq('user_id', projectOwnerUserId).maybeSingle()` → error truthy → `{ error, retriable: true }`
      2. Extract `tierOutputCapTokens: TierOutputCapTokens` from query result; defaults to `null` if data is null or field absent
      3. Construct `const userConfig: UserConfig = { tier_output_cap_tokens: tierOutputCapTokens }` — sole construction point for `UserConfig` in this chain
      4. Extract and validate `user_jwt` from `job.payload`; absent → throw (caught → `{ error, retriable: false }`)
      5. Validate job payload via `isDialecticExecuteJobPayload`; invalid → throw
      6. Apply inputs-required scope via `deps.applyInputsRequiredScope`
      7. Query token wallet; validate balance via `deps.validateWalletBalance`; insufficient → `{ error, retriable: false }`
      8. Query AI provider config; validate model cost rates via `deps.validateModelCostRates`; invalid → `{ error, retriable: false }`
      9. Build `CalculateAffordabilityParams` with `userConfig: userConfig`; call `deps.calculateAffordability(affordParams, affordPayload)` → error return → `{ error, retriable }`
      10. Build `EnqueueModelCallParams` with `userConfig: userConfig`; call `deps.enqueueModelCall(enqueueParams, payload)` → error return → `{ error, retriable }`
    * `[✅]` Success path: all steps succeed → `{ queued: true }`
    * `[✅]` `userConfig` is constructed exactly once; both `affordParams.userConfig` and `enqueueModelCallParams.userConfig` receive the same object — no field re-extraction between construction points

  * `[✅]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.test.ts`
    * `[✅]` Line 108: replace `const tierCap: EnqueueModelCallParams["tier_output_cap_tokens"] = paramArg.tier_output_cap_tokens` with `const tierCap: UserConfig["tier_output_cap_tokens"] = paramArg.userConfig.tier_output_cap_tokens`
    * `[✅]` Test ~line 2074: update title from `passes tierOutputCapTokens...tier_output_cap_tokens` to `passes userConfig.tier_output_cap_tokens to calculateAffordability and enqueueModelCall`; update assertions at ~lines 2145, 2151: `affordParams.tierOutputCapTokens === 32768` → `affordParams.userConfig.tier_output_cap_tokens === 32768`; `enqueueParams.tier_output_cap_tokens === 32768` → `enqueueParams.userConfig.tier_output_cap_tokens === 32768`
    * `[✅]` Test ~line 2156: update title from `passes tierOutputCapTokens null and tier_output_cap_tokens null when DB returns output_cap_tokens null` to `passes userConfig.tier_output_cap_tokens null to calculateAffordability and enqueueModelCall when DB returns output_cap_tokens null`; update assertions at ~lines 2226, 2232: `affordParams.tierOutputCapTokens === null` → `affordParams.userConfig.tier_output_cap_tokens === null`; `enqueueParams.tier_output_cap_tokens === null` → `enqueueParams.userConfig.tier_output_cap_tokens === null`

  * `[✅]` `construction`
    * `[✅]` `PrepareModelJobDeps` is constructed by callers (`processSimpleJob` binds concrete implementations from `IJobContext`); in tests use `mockPrepareModelJobDeps(overrides?)` which requires all seven fields: `logger`, `applyInputsRequiredScope`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `calculateAffordability`, `enqueueModelCall`
    * `[✅]` `PrepareModelJobParams` is constructed by callers from job data; in tests use `mockPrepareModelJobParams(overrides?)` which requires `dbClient`, `authToken`, `job`, `projectOwnerUserId`, `providerRow`, `sessionData`
    * `[✅]` `userConfig: UserConfig` is constructed INSIDE `prepareModelJob.ts` from the DB-resolved `tierOutputCapTokens` scalar — it is not a caller-supplied construction-time input
    * `[✅]` No partially constructed instances — `isPrepareModelJobDeps` and `isPrepareModelJobParams` reject any object missing a required field

  * `[✅]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.ts`
    * `[✅]` Add `UserConfig` to the existing import from `'../calculateAffordability/calculateAffordability.interface.ts'` (keep `TierOutputCapTokens` — still used for the DB scalar type)
    * `[✅]` After the DB query resolves `tierOutputCapTokens` (after line 70): add `const userConfig: UserConfig = { tier_output_cap_tokens: tierOutputCapTokens };`
    * `[✅]` `affordParams: CalculateAffordabilityParams` (~line 260): replace `tierOutputCapTokens` field with `userConfig: userConfig`
    * `[✅]` `enqueueModelCallParams: EnqueueModelCallParams` (~line 327): replace `tier_output_cap_tokens: tierOutputCapTokens` with `userConfig: userConfig`

  * `[✅]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.integration.test.ts`
    * `[✅]` Line 544: `affordParams.tierOutputCapTokens` → `affordParams.userConfig.tier_output_cap_tokens`
    * `[✅]` Line 549: `enqueueParams.tier_output_cap_tokens` → `enqueueParams.userConfig.tier_output_cap_tokens`

  * `[✅]` `directionality`
    * `[✅]` Node layer: domain orchestrator (application layer)
    * `[✅]` Deps are inward-facing: `calculateAffordability.interface.ts` (application layer, prior node) provides `UserConfig`, `TierOutputCapTokens`, `CalculateAffordabilityParams`; `enqueueModelCall.interface.ts` (application layer, prior node) provides `EnqueueModelCallParams`; `types_db.ts` (infra) provides `Tables<'ai_providers'>`, `Tables<'user_subscriptions'>`
    * `[✅]` Provides are outward-facing: `processSimpleJob` is the sole direct consumer via the bound `BoundPrepareModelJobFn` wrapper
    * `[✅]` No cycles

  * `[✅]` `requirements`
    * `[✅]` `prepareModelJob.ts` imports `UserConfig` and constructs `const userConfig: UserConfig = { tier_output_cap_tokens: tierOutputCapTokens }` after the DB query resolves — GREEN when ts is updated and compiles
    * `[✅]` `affordParams.userConfig.tier_output_cap_tokens` equals the DB-resolved `tierOutputCapTokens` at the point of the `deps.calculateAffordability` call — GREEN when test.ts assertions at ~lines 2145 pass
    * `[✅]` `enqueueModelCallParams.userConfig.tier_output_cap_tokens` equals the DB-resolved `tierOutputCapTokens` at the point of the `deps.enqueueModelCall` call — GREEN when test.ts assertions at ~lines 2151 pass
    * `[✅]` `assertEnqueueModelCallFirstCallShape` (test.ts line ~108) captures `paramArg.userConfig.tier_output_cap_tokens` typed as `UserConfig["tier_output_cap_tokens"]` — GREEN when test.ts line 108 is updated
    * `[✅]` Integration test line 544 asserts `affordParams.userConfig.tier_output_cap_tokens === 32768` and line 549 asserts `enqueueParams.userConfig.tier_output_cap_tokens === 32768` — GREEN when integration.test.ts assertions are updated

* `[✅]` `[BE]` netlify/functions/ai-stream-background/adapters/getNodeAiAdapter **Remove tier_output_cap_tokens from NodeModelConfig; introduce NodeUserConfig; add userConfig to NodeAdapterConstructorParams and GetNodeAiAdapterParams**

  * `[✅]` `objective`
    * `[✅]` The completed node incorrectly added `tier_output_cap_tokens` to `NodeModelConfig` and to `isNodeModelConfig`. This is wrong: `NodeModelConfig` is the PROVIDER config; user/application config is a separate concern. Adding a required field to `isNodeModelConfig` causes it to reject every incoming event from the Deno worker (which serializes `AiModelExtendedConfig` as `model_config` — a type that does not have `tier_output_cap_tokens`). Fix: REMOVE `tier_output_cap_tokens` from `NodeModelConfig` and from `isNodeModelConfig`. Introduce `NodeUserConfig` as a new interface on the Netlify side (`{ readonly tier_output_cap_tokens: number | null }`). Add `userConfig: NodeUserConfig` to `NodeAdapterConstructorParams` and `GetNodeAiAdapterParams` so the adapter receives both concerns separately. Update all construction sites, guards, and tests throughout this module.

  * `[✅]` `role`
    * `[✅]` Infrastructure adapter factory — routes to the correct provider adapter; owns `NodeModelConfig` (provider config) and `NodeUserConfig` (user/application config) as distinct types

  * `[✅]` `module`
    * `[✅]` ai-stream-background, adapter layer

  * `[✅]` `deps`
    * `[✅]` None — both `NodeModelConfig` and `NodeUserConfig` are declared inline in `ai-adapter.interface.ts`; no cross-workspace import needed

  * `[✅]` `context_slice`
    * `[✅]` `ai-adapter.interface.ts`: REMOVE `tier_output_cap_tokens: number | null` from `NodeModelConfig`; ADD `export interface NodeUserConfig { readonly tier_output_cap_tokens: number | null; }`; ADD `userConfig: NodeUserConfig` to `NodeAdapterConstructorParams`
    * `[✅]` `getNodeAiAdapter.interface.ts`: ADD `import type { NodeUserConfig }` from `ai-adapter.interface.ts`; ADD `userConfig: NodeUserConfig` to `GetNodeAiAdapterParams`
    * `[✅]` `getNodeAiAdapter.guard.ts`: REMOVE `tier_output_cap_tokens` required check from `isNodeModelConfig`; ADD `isNodeUserConfig` guard; update `isGetNodeAiAdapterParams` to check `userConfig: isNodeUserConfig(...)`
    * `[✅]` `getNodeAiAdapter.ts`: add `userConfig: params.userConfig` to the `factory({...})` call
    * `[✅]` All `NodeModelConfig` construction sites: REMOVE `tier_output_cap_tokens` field
    * `[✅]` All `NodeAdapterConstructorParams` and `GetNodeAiAdapterParams` construction sites: ADD `userConfig: { tier_output_cap_tokens: null }` (or appropriate value)

  * `[✅]` netlify/functions/ai-stream-background/adapters/`ai-adapter.interface.test.ts`
    * `[✅]` All `NodeModelConfig` literals (~lines 99-116, 119-129): REMOVE `tier_output_cap_tokens` field
    * `[✅]` REMOVE the three `tier_output_cap_tokens` tests on `NodeModelConfig` (lines 192-233 — "NodeModelConfig contract includes tier_output_cap_tokens", "accepts NodeModelConfig with tier_output_cap_tokens: null", "accepts NodeModelConfig with tier_output_cap_tokens: 32768")
    * `[✅]` ADD `NodeUserConfig` contract tests: shape has `tier_output_cap_tokens: number | null`; accepts `{ tier_output_cap_tokens: null }`; accepts `{ tier_output_cap_tokens: 32768 }`
    * `[✅]` ADD test: `NodeAdapterConstructorParams` shape includes `userConfig: NodeUserConfig`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`ai-adapter.interface.ts`
    * `[✅]` REMOVE `tier_output_cap_tokens: number | null` from `NodeModelConfig`
    * `[✅]` ADD `export interface NodeUserConfig { readonly tier_output_cap_tokens: number | null; }` after `NodeModelConfig`
    * `[✅]` ADD `userConfig: NodeUserConfig` to `NodeAdapterConstructorParams`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.interface.test.ts`
    * `[✅]` REMOVE `tier_output_cap_tokens: null` from the `modelConfig` literal inside the `GetNodeAiAdapterParams` construction (~line 39)
    * `[✅]` ADD `userConfig: { tier_output_cap_tokens: null }` to the `GetNodeAiAdapterParams` construction

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.interface.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './ai-adapter.interface.ts'` (alongside existing `NodeModelConfig` import)
    * `[✅]` ADD `userConfig: NodeUserConfig` to `GetNodeAiAdapterParams`

  * `[✅]` `getNodeAiAdapter.interaction.spec`
    * `[✅]` Called by the ai-stream-background handler after deserializing the Netlify queue event body; receives `GetNodeAiAdapterDeps` (providerMap) and `GetNodeAiAdapterParams` (apiIdentifier, apiKey, modelConfig, userConfig)
    * `[✅]` Required dependency interactions in execution order:
      1. Lowercase `params.apiIdentifier`; if empty string → return `null`
      2. Find first matching key in `deps.providerMap` where `lowerApiIdentifier.startsWith(key)` — if none found → return `null`
      3. Retrieve `factory: NodeAdapterFactory = deps.providerMap[prefix]`
      4. Call `factory({ modelConfig: params.modelConfig, apiKey: params.apiKey, userConfig: params.userConfig })` — returns `AiAdapter`
    * `[✅]` Success path: matching prefix found, factory returns `AiAdapter` → return the adapter
    * `[✅]` `params.userConfig` is passed verbatim to the factory as `NodeAdapterConstructorParams.userConfig` — not inspected or transformed by `getNodeAiAdapter`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.guard.test.ts`
    * `[✅]` `isNodeModelConfig` describe block: REMOVE the three `tier_output_cap_tokens` tests (lines 118-148); update valid `NodeModelConfig` literals in remaining tests to NOT include `tier_output_cap_tokens` field
    * `[✅]` ADD `isNodeUserConfig` describe block: accepts `{ tier_output_cap_tokens: null }`; accepts `{ tier_output_cap_tokens: 32768 }`; rejects missing `tier_output_cap_tokens` field; rejects `tier_output_cap_tokens: undefined`; rejects non-record
    * `[✅]` `isGetNodeAiAdapterParams` describe block: ADD test rejecting params with missing `userConfig` (e.g., spread `createMockGetNodeAiAdapterParams()` omitting `userConfig`); existing tests using `createMockGetNodeAiAdapterParams()` will pass once mock is updated to include `userConfig` by default

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.guard.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './ai-adapter.interface.ts'` alongside existing imports
    * `[✅]` `isNodeModelConfig` (lines 111-174): REMOVE the two lines checking `tier_output_cap_tokens` — the `if (!('tier_output_cap_tokens' in v)) { return false; }` check (line 166) and the `typeof tierCap` validation (lines 169-172)
    * `[✅]` ADD `export function isNodeUserConfig(v: unknown): v is NodeUserConfig` after `isNodeModelConfig`: check `isPlainRecord(v)`, `'tier_output_cap_tokens' in v`, `typeof v['tier_output_cap_tokens'] === 'number' || v['tier_output_cap_tokens'] === null`
    * `[✅]` `isGetNodeAiAdapterParams` (lines 255-271): ADD `const userConfigValue: unknown = v['userConfig']; if (!isNodeUserConfig(userConfigValue)) { return false; }` before the final `return isNodeModelConfig(modelConfigValue)`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.test.ts`
    * `[✅]` Tests at ~lines 22-25 and 39-42: update `factorySpy` assertion from `{ modelConfig: params.modelConfig, apiKey: params.apiKey }` to `{ modelConfig: params.modelConfig, apiKey: params.apiKey, userConfig: params.userConfig }`

  * `[✅]` `construction`
    * `[✅]` `GetNodeAiAdapterDeps` is constructed by the handler with a `providerMap: NodeProviderMap`; in tests use `createMockGetNodeAiAdapterDeps(overrides?)`
    * `[✅]` `GetNodeAiAdapterParams` is constructed by the handler from the deserialized Netlify queue event; in tests use `createMockGetNodeAiAdapterParams(overrides?)` which now defaults `userConfig: { tier_output_cap_tokens: null }`
    * `[✅]` `NodeAdapterConstructorParams` is constructed INSIDE `getNodeAiAdapter` and passed to the factory — callers do not construct it directly; it must now include `userConfig: NodeUserConfig`
    * `[✅]` Invalid construction: any of `apiIdentifier`, `apiKey`, `modelConfig` absent or not satisfying type; `userConfig` absent, non-record, or `userConfig.tier_output_cap_tokens` neither number nor null

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.ts`
    * `[✅]` `factory({...})` call (~line 28): add `userConfig: params.userConfig` to the object literal alongside `modelConfig` and `apiKey`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.mock.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './ai-adapter.interface.ts'`
    * `[✅]` `defaultNodeModelConfig` (~line 21): REMOVE `tier_output_cap_tokens: null` field
    * `[✅]` ADD `const defaultNodeUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }` after `defaultNodeModelConfig`
    * `[✅]` `createMockGetNodeAiAdapterParams` (~line 93): ADD `userConfig` field with default `defaultNodeUserConfig`; include `userConfig` in the return object

  * `[✅]` netlify/functions/ai-stream-background/adapters/`adapter-conformance.test-utils.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './ai-adapter.interface.ts'`
    * `[✅]` `conformanceModelConfig` (~line 16): REMOVE `tier_output_cap_tokens: null` field
    * `[✅]` ADD `const conformanceUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }` after `conformanceModelConfig`
    * `[✅]` `conformanceParams: NodeAdapterConstructorParams` (~line 23): ADD `userConfig: conformanceUserConfig`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.provides.ts`
    * `[✅]` ADD `export type { NodeUserConfig } from './ai-adapter.interface.ts'` — callers (including individual provider adapters) that receive `NodeAdapterConstructorParams.userConfig` need this type from the module boundary
    * `[✅]` ADD `export { isNodeUserConfig } from './getNodeAiAdapter.guard.ts'` — guards are part of the public API surface

  * `[✅]` `directionality`
    * `[✅]` Node layer: infrastructure adapter factory (infrastructure layer)
    * `[✅]` Deps are inward-facing: all shared types (`NodeModelConfig`, `NodeUserConfig`, `NodeAdapterConstructorParams`, `NodeProviderMap`) declared in `ai-adapter.interface.ts` — no cross-workspace imports
    * `[✅]` Provides are outward-facing: the ai-stream-background handler constructs `GetNodeAiAdapterParams` to call `getNodeAiAdapter`; individual provider adapters (openai, anthropic, google) receive `NodeAdapterConstructorParams` which now includes `userConfig: NodeUserConfig`
    * `[✅]` No cycles

  * `[✅]` `requirements`
    * `[✅]` `NodeModelConfig` does NOT include `tier_output_cap_tokens`; `isNodeModelConfig` accepts objects without `tier_output_cap_tokens` — GREEN when ai-adapter.interface.ts is updated and guard.test.ts removed-field tests are deleted
    * `[✅]` `NodeUserConfig = { readonly tier_output_cap_tokens: number | null }` exists in `ai-adapter.interface.ts`; all three contract tests in ai-adapter.interface.test.ts pass — GREEN when interface is updated and tests are added
    * `[✅]` `NodeAdapterConstructorParams` includes `userConfig: NodeUserConfig` — GREEN when ai-adapter.interface.ts is updated and interface.test.ts shape test passes
    * `[✅]` `GetNodeAiAdapterParams` includes `userConfig: NodeUserConfig` — GREEN when getNodeAiAdapter.interface.ts is updated and interface.test.ts passes
    * `[✅]` `isNodeUserConfig` validates `{ tier_output_cap_tokens: number | null }` and rejects invalid shapes — GREEN when guard.test.ts `isNodeUserConfig` describe block passes
    * `[✅]` `isGetNodeAiAdapterParams` rejects objects missing `userConfig` or where `userConfig` fails `isNodeUserConfig` — GREEN when guard.test.ts missing-userConfig test passes
    * `[✅]` `getNodeAiAdapter` passes `{ modelConfig, apiKey, userConfig }` to the adapter factory — GREEN when test.ts spy assertion tests pass
    * `[✅]` `createMockGetNodeAiAdapterParams()` (no overrides) returns `{ ..., userConfig: { tier_output_cap_tokens: null } }` — GREEN when mock baseline is updated
    * `[✅]` `conformanceParams` in `adapter-conformance.test-utils.ts` includes `userConfig: { tier_output_cap_tokens: null }` — GREEN when conformance utils are updated

* `[✅]` `[BE]` netlify/functions/ai-stream-background/adapters/resolveOutputCap **Single binding-cap resolver shared by all adapters**

  * `[✅]` `objective`
    * `[✅]` Each of the three adapters (OpenAI, Anthropic, Google) computes the binding output cap with its own ternary chain or if/else bifurcation — forbidden default/fallback patterns that also duplicate logic. Fix: one pure function that collects all positive-number inputs, takes the minimum, and returns it. `undefined` only when no input is a positive number. No ternaries, no fallbacks, no nullish coalescing.

  * `[✅]` `role`
    * `[✅]` Domain utility — pure cap calculation; no I/O; no provider knowledge

  * `[✅]` `module`
    * `[✅]` ai-stream-background, adapter layer; cross-adapter

  * `[✅]` `deps`
    * `[✅]` None (pure function)

  * `[✅]` `context_slice`
    * `[✅]` Inputs: `requestMax: number | undefined`, `hardCap: number | undefined`, `providerMax: number | undefined`, `tierCap: number | null`
    * `[✅]` Output: `number | undefined` — minimum of all positive-number inputs; `undefined` only when no input is a positive number
    * `[✅]` Implementation: collect every input that is a positive number into a single list; return `Math.min(...list)` if list is non-empty, `undefined` if empty. One collection step, one minimum step, one return

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.interface.test.ts`
    * `[✅]` Contract test: `ResolveOutputCapInputs` shape includes `requestMax: number | undefined`, `hardCap: number | undefined`, `providerMax: number | undefined`, `tierCap: number | null`
    * `[✅]` Contract test: `ResolveOutputCapFn` return type is `number | undefined`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.interface.ts`
    * `[✅]` Declare `ResolveOutputCapInputs` with the four fields above
    * `[✅]` Declare `ResolveOutputCapFn` as `(inputs: ResolveOutputCapInputs) => number | undefined`

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.guard.test.ts`
    * `[✅]` Add test: `isResolveOutputCapInputs` accepts a fully populated object
    * `[✅]` Add test: accepts `requestMax`/`hardCap`/`providerMax` as `undefined`
    * `[✅]` Add test: accepts `tierCap: null`
    * `[✅]` Add test: rejects object missing any of the four required fields
    * `[✅]` Add test: rejects when any field is the wrong type (e.g. `tierCap: undefined`, `requestMax: null`)

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.guard.ts`
    * `[✅]` Implement `isResolveOutputCapInputs` — every field must be present and exactly conform to its declared type

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.test.ts`
    * `[✅]` Add test: all four inputs positive numbers → returns the minimum
    * `[✅]` Add test: `tierCap: 32768`, `requestMax: 50000`, `hardCap: 131072`, `providerMax: undefined` → returns 32768
    * `[✅]` Add test: `tierCap: 131072`, `hardCap: 64000`, `requestMax: undefined`, `providerMax: undefined` → returns 64000
    * `[✅]` Add test: `tierCap: null`, `requestMax: 50000`, `hardCap: 131072`, `providerMax: 100000` → returns 50000
    * `[✅]` Add test: `tierCap: null`, all numeric inputs `undefined` → returns `undefined`
    * `[✅]` Add test: zero or negative numeric input excluded from minimum
    * `[✅]` Add test: `providerMax` binds when smallest

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.ts`
    * `[✅]` Implement: collect each input into a list if it is a positive number; return `Math.min(...list)` if list non-empty, `undefined` otherwise. The only branch: list empty → `undefined`, list non-empty → min.

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.mock.ts`
    * `[✅]` Provide `buildResolveOutputCapInputs(overrides?)` factory returning a fully typed `ResolveOutputCapInputs` with documented domain-approved defaults

  * `[✅]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.provides.ts`
    * `[✅]` Export `resolveOutputCap`, `ResolveOutputCapInputs`, `ResolveOutputCapFn`, `isResolveOutputCapInputs`, `buildResolveOutputCapInputs`

* `[✅]` `[BE]` netlify/functions/ai-stream-background **Add user_config: NodeUserConfig to AiStreamEvent; pass userConfig to getNodeAiAdapter at execution boundary**

  * `[✅]` `objective`
    * `[✅]` `AiStreamEvent` has no `user_config` field. The `enqueueModelCall.ts` node (prior) now sends `user_config: UserConfig` in `AiStreamEventData` as JSON (`user_config` snake_case). The Netlify side must declare `user_config: NodeUserConfig` on `AiStreamEvent` to receive this field. `isAiStreamEvent` must validate it via `isNodeUserConfig`. `collectAiStreamPayload` must pass `userConfig: event.user_config` to `getNodeAiAdapter` as a separate parameter — `NodeModelConfig` and `NodeUserConfig` remain permanently separate concerns; no spread merge.
    * `[✅]` `ai-stream-background.interface.test.ts` currently has the WRONG approach: `tier_output_cap_tokens: null` as a standalone scalar on `AiStreamEvent` AND `tier_output_cap_tokens: null` inside `NodeModelConfig` literals. Both are wrong. The scalar tests (lines 38-83) must be removed and replaced with `user_config: NodeUserConfig` contract tests. All `NodeModelConfig` literals must have `tier_output_cap_tokens` removed (that field no longer exists on `NodeModelConfig`). All `AiStreamEvent` constructions must add `user_config: { tier_output_cap_tokens: null }`.

  * `[✅]` `role`
    * `[✅]` Infrastructure adapter — receives queue events; delivers `NodeModelConfig` (provider config) and `NodeUserConfig` (user/application config) as separate arguments to `getNodeAiAdapter` at the execution boundary

  * `[✅]` `module`
    * `[✅]` ai-stream-background, Netlify execution boundary

  * `[✅]` `deps`
    * `[✅]` `enqueueModelCall.ts` (prior node) — `AiStreamEventData.user_config: UserConfig` flows through the queue as JSON; `user_config` snake_case maps to `user_config: NodeUserConfig` on the Netlify side
    * `[✅]` `getNodeAiAdapter.ts` (prior node) — `GetNodeAiAdapterParams.userConfig: NodeUserConfig` is required; `isNodeUserConfig` guard is exported from `getNodeAiAdapter.guard.ts`

  * `[✅]` `context_slice`
    * `[✅]` `ai-stream-background.interface.ts`: ADD `import type { NodeUserConfig } from './adapters/ai-adapter.interface.ts'`; ADD `user_config: NodeUserConfig` to `AiStreamEvent`
    * `[✅]` `ai-stream-background.guard.ts`: ADD `isNodeUserConfig` to imports from `./adapters/getNodeAiAdapter.guard.ts`; ADD after the `chat_api_request` validation block: `if (!('user_config' in v) || !isNodeUserConfig(v['user_config'])) { return false; }` in `isAiStreamEvent`
    * `[✅]` `ai-stream-background.ts` `collectAiStreamPayload`: ADD `userConfig: event.user_config` to the `getNodeAiAdapter` params object alongside `apiIdentifier`, `apiKey`, and `modelConfig`

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.interface.test.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './adapters/ai-adapter.interface.ts'` to the import block
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the `AiStreamEvent` construction in the "accepts AiStreamEvent with all required fields including sig" test (lines 10-24)
    * `[✅]` ADD new contract test at end of file: `AiStreamEvent` contract includes `user_config: NodeUserConfig` — construct `const withNull: AiStreamEvent = { job_id: 'j', api_identifier: 'a', model_config: { api_identifier: 'a', input_token_cost_rate: null, output_token_cost_rate: null }, chat_api_request: { message: 'hi', providerId: 'p', promptId: 'q' }, sig: 's', user_config: { tier_output_cap_tokens: null } }` and `const withNumber: AiStreamEvent = { ...withNull, user_config: { tier_output_cap_tokens: 32768 } }`; assert `withNull.user_config.tier_output_cap_tokens === null` and `withNumber.user_config.tier_output_cap_tokens === 32768`

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.interface.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './adapters/ai-adapter.interface.ts'`
    * `[✅]` ADD `user_config: NodeUserConfig` to `AiStreamEvent`

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.interaction.spec`
    * `[✅]` Caller: `handleAiStreamWorkload` reads `event.eventData`, validates via `isAiStreamEvent` (which enforces `user_config: NodeUserConfig`); if valid, calls `collectAiStreamPayload(deps, validated)`
    * `[✅]` `collectAiStreamPayload` calls `deps.getApiKey(event.api_identifier)`, then calls `getNodeAiAdapter({ providerMap: deps.providerMap }, { apiIdentifier: event.api_identifier, apiKey, modelConfig: event.model_config, userConfig: event.user_config })`; iterates the adapter stream; returns assembled `AiStreamPayload`
    * `[✅]` `NodeModelConfig` and `NodeUserConfig` are passed as separate fields to `getNodeAiAdapter` — no spread merge; the adapter layer keeps provider config and user config permanently distinct
    * `[✅]` Failure modes: `user_config` missing from event → `isAiStreamEvent` returns false → `handleAiStreamWorkload` throws `ErrorDoNotRetry`; `user_config` not a valid `NodeUserConfig` record → `isNodeUserConfig` returns false → `isAiStreamEvent` returns false → `ErrorDoNotRetry`
    * `[✅]` No ordering or temporal constraints beyond the existing stream iteration flow

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.guard.test.ts`
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the valid `AiStreamEvent` object in the "accepts valid event" test (~lines 11-26) — required for `isAiStreamEvent` to return `true`
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the `AiStreamEvent` in the "rejects missing sig" test (~lines 73-84) — so the event is valid in all other respects and fails only on missing `sig`
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the `AiStreamEvent` in the "rejects user_jwt" test (~lines 88-104) — same rationale
    * `[✅]` ADD test: `isAiStreamEvent` accepts valid event with `user_config: { tier_output_cap_tokens: null }`
    * `[✅]` ADD test: `isAiStreamEvent` accepts valid event with `user_config: { tier_output_cap_tokens: 32768 }`
    * `[✅]` ADD test: `isAiStreamEvent` rejects event missing `user_config` field entirely (all other fields valid)

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.guard.ts`
    * `[✅]` ADD `isNodeUserConfig` to the imports from `./adapters/getNodeAiAdapter.guard.ts`
    * `[✅]` ADD after the `chatApiValue.message.length === 0` check in `isAiStreamEvent`: `if (!('user_config' in v) || !isNodeUserConfig(v['user_config'])) { return false; }`

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.test.ts`
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the `createMockAiStreamEvent` override object in the "dispatches anthropic prefix" test (lines 151-163)
    * `[✅]` ADD `user_config: { tier_output_cap_tokens: null }` to the `createMockAiStreamEvent` override object in the "dispatches google prefix" test (lines 186-198)
    * `[✅]` ADD test: `event.user_config.tier_output_cap_tokens: 32768` → `userConfig.tier_output_cap_tokens` passed to adapter factory params — spy the factory to capture `NodeAdapterConstructorParams` and assert `params.userConfig.tier_output_cap_tokens === 32768`
    * `[✅]` ADD test: `event.user_config.tier_output_cap_tokens: null` → `userConfig.tier_output_cap_tokens` is null in adapter factory params (same spy pattern)

  * `[✅]` `construction`
    * `[✅]` `createMockAiStreamEvent(overrides?: Partial<AiStreamEvent>): AiStreamEvent` is the sole factory for `AiStreamEvent` in tests
    * `[✅]` After this node: `user_config` is handled with `const user_config: NodeUserConfig = overrides?.user_config === undefined ? defaultUserConfig : overrides.user_config`; `defaultUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }` is declared as a module-level const
    * `[✅]` No partially constructed instances: `user_config` always resolves to a full `NodeUserConfig` object with `tier_output_cap_tokens` set
    * `[✅]` Invalid construction context: any inline `AiStreamEvent` literal without `user_config` will fail TypeScript compilation once `user_config` is required on the interface; raw inline literals in `guard.test.ts` and `integration.test.ts` must add `user_config: { tier_output_cap_tokens: null }` explicitly

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.ts`
    * `[✅]` In `collectAiStreamPayload` at the `getNodeAiAdapter` call (~lines 87-94): ADD `userConfig: event.user_config` to the params object alongside `apiIdentifier: event.api_identifier`, `apiKey`, and `modelConfig: event.model_config`

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.mock.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from './adapters/ai-adapter.interface.ts'`
    * `[✅]` ADD `const defaultUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }`
    * `[✅]` In `createMockAiStreamEvent`: ADD `const user_config: NodeUserConfig = overrides?.user_config === undefined ? defaultUserConfig : overrides.user_config`; ADD `user_config` to the return object

  * `[✅]` netlify/functions/ai-stream-background/`ai-stream-background.integration.test.ts`
    * `[✅]` All five `AiStreamEvent` literals (~lines 312-326, 353-368, 403-418, 447-460, 475-490): ADD `user_config: { tier_output_cap_tokens: null }` to each
    * `[✅]` ADD integration test: event with `user_config: { tier_output_cap_tokens: 32768 }` and OpenAI prefix → `isAiStreamEvent` validates successfully and handler completes (POSTs `AiStreamPayload`) — proves `user_config` is accepted by the guard and threaded through the handler without error

  * `[✅]` `directionality`
    * `[✅]` Node layer: infrastructure — Netlify execution boundary
    * `[✅]` `ai-stream-background.interface.ts` imports `NodeUserConfig` from `./adapters/ai-adapter.interface.ts` — inward dependency on the adapter layer; no reverse
    * `[✅]` `ai-stream-background.guard.ts` imports `isNodeUserConfig` from `./adapters/getNodeAiAdapter.guard.ts` — inward dependency on adapter guard; no reverse
    * `[✅]` `ai-stream-background.ts` passes `userConfig: event.user_config` to `getNodeAiAdapter` — data flows from the event into the adapter; adapter layer is downstream
    * `[✅]` No cycles: `ai-stream-background` does not import from `enqueueModelCall`, `prepareModelJob`, or `calculateAffordability`

  * `[✅]` `requirements`
    * `[✅]` `AiStreamEvent` has `user_config: NodeUserConfig` — observable: TypeScript compiler enforces at all construction sites; maps to interface test GREEN
    * `[✅]` `isAiStreamEvent` returns `true` for `user_config: { tier_output_cap_tokens: null }` and `{ tier_output_cap_tokens: 32768 }`; returns `false` when `user_config` is missing — observable: guard tests GREEN
    * `[✅]` `collectAiStreamPayload` passes `userConfig: event.user_config` to `getNodeAiAdapter` alongside `apiIdentifier`, `apiKey`, and `modelConfig` — observable: spy assertions in `ai-stream-background.test.ts` GREEN
    * `[✅]` All pre-existing tests pass without modification except those lines explicitly listed above — observable: test runner GREEN for entire package

* `[✅]` `[BE]` netlify/functions/ai-stream-background/adapters/openai **Apply binding output cap via resolveOutputCap**

  * `[✅]` `objective`
    * `[✅]` The OpenAI adapter bifurcates cap selection: if `request.max_tokens_to_generate` is a number it is used directly (ignoring `hard_cap_output_tokens`, `provider_max_output_tokens`, and tier cap); otherwise the minimum of hard cap and provider max is used. Two paths, conditional default — both rules-violating. Fix: delete the bifurcation. Compute the binding cap once via `resolveOutputCap` with all four inputs. Pass the result to `applyCap` once, guarded by `cap !== undefined`.

  * `[✅]` `role`
    * `[✅]` Infrastructure adapter — calls OpenAI API; enforces the binding output cap at the provider boundary

  * `[✅]` `module`
    * `[✅]` ai-stream-background, OpenAI adapter

  * `[✅]` `deps`
    * `[✅]` `resolveOutputCap.provides.ts` (prior node)
    * `[✅]` `getNodeAiAdapter.ts` (prior node) — `NodeAdapterConstructorParams.userConfig: NodeUserConfig` carries `tier_output_cap_tokens`; the adapter receives `userConfig` as a separate field alongside `modelConfig` — `NodeModelConfig` does not have `tier_output_cap_tokens`

  * `[✅]` `context_slice`
    * `[✅]` In `createOpenAINodeAdapter`: ADD `const userConfig: NodeUserConfig = params.userConfig` alongside the existing `const modelConfig: NodeModelConfig = params.modelConfig`
    * `[✅]` ADD `userConfig: NodeUserConfig` as a fourth parameter to `prepareOpenAiStreamingRequest` so it can supply `tierCap`
    * `[✅]` Replace the if/else cap-selection block with: `const cap: number | undefined = resolveOutputCap({ requestMax: request.max_tokens_to_generate, hardCap: modelConfig.hard_cap_output_tokens, providerMax: modelConfig.provider_max_output_tokens, tierCap: userConfig.tier_output_cap_tokens })`
    * `[✅]` Then: `if (cap !== undefined) { applyCap(cap) }` — one call site, one path; `applyCap`'s internal write logic is unchanged
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/openai/`openai.test.ts`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 32768 }`, `max_tokens_to_generate: 50000`, hard cap `131072` → outbound max field = 32768 (tier is binding); use `createMockNodeAdapterConstructorParams({ userConfig: { tier_output_cap_tokens: 32768 }, modelConfig: createMockNodeModelConfig({ hard_cap_output_tokens: 131072 }) })` and `createMockNodeChatApiRequest({ max_tokens_to_generate: 50000 })`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, `max_tokens_to_generate: 50000`, hard cap `131072` → outbound max field = 50000 (request is binding when tier disabled)
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 131072 }`, hard cap `64000`, no request value → outbound max field = 64000 (hard cap is binding)
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, no request value, no hard cap, no provider max → no max field set on payload (`max_completion_tokens` and `max_tokens` both absent from the call args)

  * `[✅]` netlify/functions/ai-stream-background/adapters/openai/`openai.ts`
    * `[✅]` ADD `const userConfig: NodeUserConfig = params.userConfig` in `createOpenAINodeAdapter`
    * `[✅]` ADD `userConfig: NodeUserConfig` as fourth parameter to `prepareOpenAiStreamingRequest`; update the call site in `sendMessageStream` to pass `userConfig`
    * `[✅]` Replace the if/else cap-selection block with a single `resolveOutputCap` call (`tierCap: userConfig.tier_output_cap_tokens`) followed by a single `applyCap` invocation guarded by `cap !== undefined`
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/openai/`openai.mock.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from '../ai-adapter.interface.ts'`
    * `[✅]` ADD `export const mockNodeUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }`
    * `[✅]` ADD `userConfig: mockNodeUserConfig` to `mockNodeAdapterConstructorParams`
    * `[✅]` In `createMockNodeAdapterConstructorParams`: ADD `userConfig` field handling (default `{ ...mockNodeUserConfig }`, override via `overrides.userConfig`); include `userConfig` in the return object

  * `[✅]` netlify/functions/ai-stream-background/adapters/openai/`openai.integration.test.ts`
    * `[✅]` ADD `userConfig: { tier_output_cap_tokens: null }` to the inline `NodeAdapterConstructorParams` at the "constructs an adapter" test (~lines 72-79)
    * `[✅]` Add integration test: `NodeAdapterConstructorParams` with `userConfig: { tier_output_cap_tokens: 32768 }`, `modelConfig.hard_cap_output_tokens: 131072`, and `max_tokens_to_generate: 50000` in the request → `chatCompletionsCreate` called with `max_completion_tokens: 32768`

  * `[✅]` `directionality`
    * `[✅]` Node layer: infrastructure adapter — `netlify/functions/ai-stream-background/adapters/openai/`
    * `[✅]` Deps are inward-facing: `resolveOutputCap.provides.ts` (cap resolver, prior node); `ai-adapter.interface.ts` (`NodeUserConfig` type); both are producers the adapter consumes
    * `[✅]` `createOpenAINodeAdapter` is outward-facing: exported symbol consumed by `getNodeAiAdapter.ts` to construct the adapter instance — `getNodeAiAdapter` is the only consumer
    * `[✅]` No cycles: openai adapter does not import from `getNodeAiAdapter.ts`, `ai-stream-background.ts`, or any dialectic-worker module

  * `[✅]` `requirements`
    * `[✅]` `resolveOutputCap` is called in `prepareOpenAiStreamingRequest` with `requestMax`, `hardCap`, `providerMax`, and `tierCap: userConfig.tier_output_cap_tokens` — observable: four new unit tests GREEN
    * `[✅]` When `tier_output_cap_tokens: 32768` and `max_tokens_to_generate: 50000` and hard cap `131072`, `chatCompletionsCreate` receives `max_completion_tokens: 32768` (tier is binding minimum) — observable: tier-binding unit test GREEN
    * `[✅]` When `tier_output_cap_tokens: null`, tier cap is excluded from candidates; binding cap is min of remaining inputs — observable: null-tier unit tests GREEN
    * `[✅]` When no cap inputs are provided (all undefined/null), `resolveOutputCap` returns `undefined`; `applyCap` is not called; `max_completion_tokens` and `max_tokens` are absent from the payload — observable: no-cap unit test GREEN
    * `[✅]` `prepareOpenAiStreamingRequest` accepts `userConfig: NodeUserConfig` as its fourth parameter; all pre-existing tests pass without modification because `createMockNodeAdapterConstructorParams()` supplies a default null tier cap — observable: test runner GREEN for entire openai package

* `[✅]` `[BE]` netlify/functions/ai-stream-background/adapters/anthropic **Apply binding output cap via resolveOutputCap**

  * `[✅]` `objective`
    * `[✅]` The Anthropic adapter selects `maxTokensForPayload` via a nested ternary chain — a forbidden default/fallback pattern — and never considers the tier cap. Fix: delete the ternary chain. Compute `maxTokensForPayload` once via `resolveOutputCap` with all four inputs (`providerMax: undefined` for Anthropic). The result feeds the existing `prepared` return shape unchanged.

  * `[✅]` `role`
    * `[✅]` Infrastructure adapter — calls Anthropic API; enforces the binding output cap at the provider boundary

  * `[✅]` `module`
    * `[✅]` ai-stream-background, Anthropic adapter

  * `[✅]` `deps`
    * `[✅]` `resolveOutputCap.provides.ts` (prior node)
    * `[✅]` `getNodeAiAdapter.ts` (prior node) — `NodeAdapterConstructorParams.userConfig: NodeUserConfig` carries `tier_output_cap_tokens`; the adapter receives `userConfig` as a separate field alongside `modelConfig` — `NodeModelConfig` does not have `tier_output_cap_tokens`

  * `[✅]` `context_slice`
    * `[✅]` In `createAnthropicNodeAdapter`: ADD `const userConfig: NodeUserConfig = params.userConfig` alongside the existing `const modelConfig: NodeModelConfig = params.modelConfig`
    * `[✅]` ADD `userConfig: NodeUserConfig` as a fourth parameter to `prepareAnthropicRequest`; update the call site in `sendMessageStream` to pass `userConfig`
    * `[✅]` Replace the nested ternary `const maxTokensForPayload` with: `const maxTokensForPayload: number | undefined = resolveOutputCap({ requestMax: request.max_tokens_to_generate, hardCap: modelConfig.hard_cap_output_tokens, providerMax: undefined, tierCap: userConfig.tier_output_cap_tokens })` — `request.max_tokens_to_generate` and `modelConfig.hard_cap_output_tokens` are already `number | undefined`; no ternary wrappers needed
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.test.ts`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 32768 }`, request `max_tokens_to_generate: 50000`, hard cap `131072` → `messagesStream` called with `max_tokens: 32768`; use `createMockAnthropicNodeAdapterConstructorParams({ userConfig: { tier_output_cap_tokens: 32768 }, modelConfig: createMockAnthropicNodeModelConfig({ hard_cap_output_tokens: 131072 }) })` and `createMockAnthropicNodeChatApiRequest({ max_tokens_to_generate: 50000 })`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, request `max_tokens_to_generate: 50000`, hard cap `131072` → `messagesStream` called with `max_tokens: 50000`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 131072 }`, hard cap `64000`, no request value → `messagesStream` called with `max_tokens: 64000`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, no request value, no hard cap → throws `'AnthropicAdapter: No max tokens for payload'` (existing guard on `maxTokensForPayload === undefined` unchanged)

  * `[✅]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.ts`
    * `[✅]` ADD `const userConfig: NodeUserConfig = params.userConfig` in `createAnthropicNodeAdapter`
    * `[✅]` ADD `userConfig: NodeUserConfig` as fourth parameter to `prepareAnthropicRequest`; update the call site in `sendMessageStream` to pass `userConfig`
    * `[✅]` Replace the nested ternary `const maxTokensForPayload` with a single `resolveOutputCap` call (`tierCap: userConfig.tier_output_cap_tokens`, `providerMax: undefined`)
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.mock.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from '../ai-adapter.interface.ts'`
    * `[✅]` ADD `export const mockAnthropicNodeUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }`
    * `[✅]` ADD `userConfig: mockAnthropicNodeUserConfig` to `mockAnthropicNodeAdapterConstructorParams`
    * `[✅]` In `createMockAnthropicNodeAdapterConstructorParams`: ADD `userConfig` field handling (default `{ ...mockAnthropicNodeUserConfig }`, override via `overrides.userConfig`); include `userConfig` in the return object

  * `[✅]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.integration.test.ts`
    * `[✅]` ADD `userConfig: { tier_output_cap_tokens: null }` to the inline `NodeAdapterConstructorParams` at the "constructs an adapter" test (~lines 84-92)
    * `[✅]` Add integration test: `NodeAdapterConstructorParams` with `userConfig: { tier_output_cap_tokens: 32768 }`, `modelConfig.hard_cap_output_tokens: 131072`, and `max_tokens_to_generate: 50000` in the request → `messagesStream` called with `max_tokens: 32768`

  * `[✅]` `directionality`
    * `[✅]` Node layer: infrastructure adapter — `netlify/functions/ai-stream-background/adapters/anthropic/`
    * `[✅]` Deps are inward-facing: `resolveOutputCap.provides.ts` (cap resolver, prior node); `ai-adapter.interface.ts` (`NodeUserConfig` type); both are producers the adapter consumes
    * `[✅]` `createAnthropicNodeAdapter` is outward-facing: exported symbol consumed by `getNodeAiAdapter.ts` to construct the adapter instance — `getNodeAiAdapter` is the only consumer
    * `[✅]` No cycles: anthropic adapter does not import from `getNodeAiAdapter.ts`, `ai-stream-background.ts`, or any dialectic-worker module

  * `[✅]` `requirements`
    * `[✅]` `resolveOutputCap` is called in `prepareAnthropicRequest` with `requestMax`, `hardCap`, `providerMax: undefined`, and `tierCap: userConfig.tier_output_cap_tokens` — observable: four new unit tests GREEN
    * `[✅]` When `tier_output_cap_tokens: 32768` and `max_tokens_to_generate: 50000` and hard cap `131072`, `messagesStream` receives `max_tokens: 32768` (tier is binding minimum) — observable: tier-binding unit test GREEN
    * `[✅]` When `tier_output_cap_tokens: null`, tier cap is excluded from candidates; binding cap is min of remaining inputs — observable: null-tier unit tests GREEN
    * `[✅]` When no cap inputs are provided (all undefined/null), `resolveOutputCap` returns `undefined`; existing guard throws `'AnthropicAdapter: No max tokens for payload'` — observable: no-cap unit test GREEN
    * `[✅]` `prepareAnthropicRequest` accepts `userConfig: NodeUserConfig` as its fourth parameter; all pre-existing tests pass without modification because `createMockAnthropicNodeAdapterConstructorParams()` supplies a default null tier cap — observable: test runner GREEN for entire anthropic package

* `[✅]` `[BE]` netlify/functions/ai-stream-background/adapters/google **Apply binding output cap via resolveOutputCap**

  * `[✅]` `objective`
    * `[✅]` The Google adapter selects the cap via three nested ternaries (`clientCap`, `cap`, `generationConfig`) — multiple forbidden default/fallback patterns — and never considers the tier cap. Fix: delete all three ternaries. Compute the binding cap once via `resolveOutputCap`. Construct `generationConfig` once from the result.

  * `[✅]` `role`
    * `[✅]` Infrastructure adapter — calls Google Gemini API; enforces the binding output cap at the provider boundary

  * `[✅]` `module`
    * `[✅]` ai-stream-background, Google adapter

  * `[✅]` `deps`
    * `[✅]` `resolveOutputCap.provides.ts` (prior node)
    * `[✅]` `getNodeAiAdapter.ts` (prior node) — `NodeAdapterConstructorParams.userConfig: NodeUserConfig` carries `tier_output_cap_tokens`; the adapter receives `userConfig` as a separate field alongside `modelConfig` — `NodeModelConfig` does not have `tier_output_cap_tokens`

  * `[✅]` `context_slice`
    * `[✅]` In `createGoogleNodeAdapter`: ADD `const userConfig: NodeUserConfig = params.userConfig` alongside the existing `const modelConfig: NodeModelConfig = params.modelConfig`
    * `[✅]` ADD `userConfig: NodeUserConfig` as a fourth parameter to `prepareGoogleChatAndParts`; update the call site in `sendMessageStream` to pass `userConfig`
    * `[✅]` Replace the `clientCap`/`modelHardCap`/`cap`/`generationConfig` ternary chain with: `const cap: number | undefined = resolveOutputCap({ requestMax: request.max_tokens_to_generate, hardCap: modelConfig.hard_cap_output_tokens, providerMax: undefined, tierCap: userConfig.tier_output_cap_tokens })` — `request.max_tokens_to_generate` and `modelConfig.hard_cap_output_tokens` are already `number | undefined`; no ternary wrappers needed
    * `[✅]` Then: `const generationConfig: { maxOutputTokens: number } | undefined = cap === undefined ? undefined : { maxOutputTokens: cap }` — structural construction of the optional Google config object; the cap is not defaulted, the object is constructed once or omitted once based on whether the resolver returned a value
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/google/`google.test.ts`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 32768 }`, request `max_tokens_to_generate: 50000`, hard cap `131072` → `startChat` called with `generationConfig: { maxOutputTokens: 32768 }`; use `createMockGoogleNodeAdapterConstructorParams({ userConfig: { tier_output_cap_tokens: 32768 }, modelConfig: createMockGoogleNodeModelConfig({ hard_cap_output_tokens: 131072 }) })` and `createMockGoogleNodeChatApiRequest({ max_tokens_to_generate: 50000 })`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, request `max_tokens_to_generate: 50000`, hard cap `131072` → `startChat` called with `generationConfig: { maxOutputTokens: 50000 }`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: 131072 }`, hard cap `64000`, no request value → `startChat` called with `generationConfig: { maxOutputTokens: 64000 }`
    * `[✅]` Add test: `userConfig: { tier_output_cap_tokens: null }`, no request value, no hard cap → `startChat` called with `generationConfig: undefined`

  * `[✅]` netlify/functions/ai-stream-background/adapters/google/`google.ts`
    * `[✅]` ADD `const userConfig: NodeUserConfig = params.userConfig` in `createGoogleNodeAdapter`
    * `[✅]` ADD `userConfig: NodeUserConfig` as fourth parameter to `prepareGoogleChatAndParts`; update the call site in `sendMessageStream` to pass `userConfig`
    * `[✅]` Replace the `clientCap`/`modelHardCap`/`cap`/`generationConfig` ternary chain with a single `resolveOutputCap` call (`tierCap: userConfig.tier_output_cap_tokens`, `providerMax: undefined`) and single `generationConfig` construction
    * `[✅]` Import `resolveOutputCap` from `../../resolveOutputCap/resolveOutputCap.provides.ts`
    * `[✅]` Import `NodeUserConfig` from `../ai-adapter.interface.ts`

  * `[✅]` netlify/functions/ai-stream-background/adapters/google/`google.mock.ts`
    * `[✅]` ADD `import type { NodeUserConfig } from '../ai-adapter.interface.ts'`
    * `[✅]` ADD `export const mockGoogleNodeUserConfig: NodeUserConfig = { tier_output_cap_tokens: null }`
    * `[✅]` ADD `userConfig: mockGoogleNodeUserConfig` to `mockGoogleNodeAdapterConstructorParams`
    * `[✅]` In `createMockGoogleNodeAdapterConstructorParams`: ADD `userConfig` field handling (default `{ ...mockGoogleNodeUserConfig }`, override via `overrides.userConfig`); include `userConfig` in the return object

  * `[✅]` netlify/functions/ai-stream-background/adapters/google/`google.integration.test.ts`
    * `[✅]` ADD `userConfig: { tier_output_cap_tokens: null }` to the inline `NodeAdapterConstructorParams` at the "constructs an adapter" test (~lines 76-84)
    * `[✅]` Add integration test: `NodeAdapterConstructorParams` with `userConfig: { tier_output_cap_tokens: 32768 }`, `modelConfig.hard_cap_output_tokens: 131072`, and `max_tokens_to_generate: 50000` in the request → `startChat` called with `generationConfig: { maxOutputTokens: 32768 }`

  * `[✅]` `directionality`
    * `[✅]` Node layer: infrastructure adapter — `netlify/functions/ai-stream-background/adapters/google/`
    * `[✅]` Deps are inward-facing: `resolveOutputCap.provides.ts` (cap resolver, prior node); `ai-adapter.interface.ts` (`NodeUserConfig` type); both are producers the adapter consumes
    * `[✅]` `createGoogleNodeAdapter` is outward-facing: exported symbol consumed by `getNodeAiAdapter.ts` to construct the adapter instance — `getNodeAiAdapter` is the only consumer
    * `[✅]` No cycles: google adapter does not import from `getNodeAiAdapter.ts`, `ai-stream-background.ts`, or any dialectic-worker module

  * `[✅]` `requirements`
    * `[✅]` `resolveOutputCap` is called in `prepareGoogleChatAndParts` with `requestMax`, `hardCap`, `providerMax: undefined`, and `tierCap: userConfig.tier_output_cap_tokens` — observable: four new unit tests GREEN
    * `[✅]` When `tier_output_cap_tokens: 32768` and `max_tokens_to_generate: 50000` and hard cap `131072`, `startChat` receives `generationConfig: { maxOutputTokens: 32768 }` (tier is binding minimum) — observable: tier-binding unit test GREEN
    * `[✅]` When `tier_output_cap_tokens: null`, tier cap is excluded from candidates; binding cap is min of remaining inputs — observable: null-tier unit tests GREEN
    * `[✅]` When no cap inputs are provided (all undefined/null), `resolveOutputCap` returns `undefined`; `generationConfig` is `undefined`; `startChat` receives no `generationConfig` constraint — observable: no-cap unit test GREEN
    * `[✅]` `prepareGoogleChatAndParts` accepts `userConfig: NodeUserConfig` as its fourth parameter; all pre-existing tests pass without modification because `createMockGoogleNodeAdapterConstructorParams()` supplies a default null tier cap — observable: test runner GREEN for entire google package

  * `[✅]` **Commit** `feat(output-cap-tiers): thread tier output cap from user subscription through affordability calc and into provider adapters`
    * `[✅]` `calculateAffordability`: `CalculateAffordabilityParams` gains `tierOutputCapTokens`; `getMaxOutputTokens()` enforces tier cap; null = ultra (no limit from tier)
    * `[✅]` `createJobContext`: consumer update — `CalculateAffordabilityParams` constructions include `tierOutputCapTokens: null`
    * `[✅]` `enqueueModelCall`: `EnqueueModelCallParams` and `AiStreamEventData` gain `user_config: UserConfig`; guard updated; source threads field into event payload
    * `[✅]` `processSimpleJob`: consumer update — both params types' new required fields added to all construction sites
    * `[✅]` `prepareModelJob`: fetches `tier_definitions.output_cap_tokens` from DB; passes to `calculateAffordability` and `enqueueModelCall`
    * `[✅]` `getNodeAiAdapter`: `NodeUserConfig` introduced as a separate type with `tier_output_cap_tokens: number | null`; `NodeAdapterConstructorParams` gains `userConfig: NodeUserConfig`; `isNodeUserConfig` guard added; `NodeModelConfig` does NOT gain `tier_output_cap_tokens`; all construction sites updated
    * `[✅]` `ai-stream-background`: `AiStreamEvent` gains `user_config: NodeUserConfig`; `isAiStreamEvent` guard validates it via `isNodeUserConfig`; `collectAiStreamPayload` passes `userConfig: event.user_config` to `getNodeAiAdapter` — no merge into `NodeModelConfig`
    * `[✅]` `resolveOutputCap`: new pure cap resolver — collects positive-number inputs, returns minimum; no ternaries, no fallbacks
    * `[✅]` OpenAI, Anthropic, Google adapters: replace ternary/bifurcation cap logic with single `resolveOutputCap` call sourcing `tierCap` from `params.userConfig.tier_output_cap_tokens`; tier cap applied unconditionally at provider boundary

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionUpdated **Derive p_set_ratchet from subscription transition instead of hardcoded false**

  * `[✅]` `objective`
    * `[✅]` `stripe.subscriptionUpdated.ts` hardcodes `p_set_ratchet: false` at the `update_subscription_with_tier` RPC call. Variables must depend on real inputs; hardcoded literals at parameterized call sites defeat the parameter. Fix: derive `p_set_ratchet` from the event — `const setRatchet: boolean = subscription.status === 'active'`. Active = paying = set the ratchet. No other transition sets it from this handler.
    * `[✅]` The test file also contains out-of-spec statuses `past_due` and `trialing` that do not exist in this system. All must be removed and replaced with valid scenarios.

  * `[✅]` `role`
    * `[✅]` Adapter handler — Stripe-specific webhook processing

  * `[✅]` `module`
    * `[✅]` Stripe adapter, `_shared/adapters/stripe/handlers/`

  * `[✅]` `deps`
    * `[✅]` `update_subscription_with_tier` RPC (already deployed)

  * `[✅]` `context_slice`
    * `[✅]` Above the RPC call at line 99: `const setRatchet: boolean = subscription.status === 'active'`
    * `[✅]` Replace `p_set_ratchet: false` with `p_set_ratchet: setRatchet` at the RPC call site (line 99)

  * `[✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.test.ts`
    * `[✅]` First test (line 116): replace out-of-spec `newStatus = "past_due"` with `newStatus = "canceled"`; `p_set_ratchet: false` assertion remains correct
    * `[✅]` Replace all 6 out-of-spec `{ status: "trialing" }` previous_attributes (lines 207, 315, 372, 426, 682, 832) with `{ status: "active" }` — trialing does not exist in this system
    * `[✅]` Replace out-of-spec `{ status: "past_due" }` previous_attributes at line 883 with `{ status: "canceled" }`
    * `[✅]` "Plan not linked" test (~line 242): update `p_set_ratchet: false` → `p_set_ratchet: true` — status is `"active"`
    * `[✅]` "Plan change" test (~line 517): update `p_set_ratchet: false` → `p_set_ratchet: true` — status is `"active"`
    * `[✅]` "cancel_at_period_end true" test (~line 581): update `p_set_ratchet: false` → `p_set_ratchet: true` — status is `'active'`
    * `[✅]` "subscription status changes to active" test (~line 690): update `p_set_ratchet: false` → `p_set_ratchet: true`; fix test step title to read `p_set_ratchet true`
    * `[✅]` Remove the entire out-of-spec `past_due` test at lines 752-798 — `past_due` does not exist in this system
    * `[✅]` Add test: `status: 'active'` → RPC called with `p_set_ratchet: true` — proves the derivation
    * `[✅]` Add test: `status: 'canceled'` → RPC called with `p_set_ratchet: false` — proves the derivation

  * `[✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.ts`
    * `[✅]` Above the RPC call at line 99: `const setRatchet: boolean = subscription.status === 'active'`
    * `[✅]` Replace `p_set_ratchet: false` with `p_set_ratchet: setRatchet` at line 99

  * `[✅]` `directionality`
    * `[✅]` Node layer: adapter handler — `supabase/functions/_shared/adapters/stripe/handlers/`
    * `[✅]` Deps are inward-facing: `update_subscription_with_tier` RPC (deployed DB function, invoked via `context.supabaseClient`)
    * `[✅]` `handleCustomerSubscriptionUpdated` is outward-facing: exported function consumed by the Stripe webhook dispatcher
    * `[✅]` No cycles: handler does not import from the dispatcher or any consumer

  * `[✅]` `requirements`
    * `[✅]` `p_set_ratchet` is derived from `subscription.status === 'active'` — observable: new test GREEN
    * `[✅]` `status: 'active'` → `p_set_ratchet: true`; active = paying = set the ratchet — observable: new test GREEN
    * `[✅]` `status: 'canceled'` → `p_set_ratchet: false`; cancellation is not a payment event — observable: new test GREEN
    * `[✅]` All existing tests with `status: 'active'` update their `p_set_ratchet` assertions from `false` to `true` — observable: test runner GREEN
    * `[✅]` All out-of-spec statuses (`past_due`, `trialing`) removed from test file — no impossible-state assertions remain — observable: test runner GREEN for entire subscriptionUpdated test file

* `[✅]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionDeleted **Derive p_set_ratchet from subscription transition instead of hardcoded false**

  * `[✅]` `objective`
    * `[✅]` `stripe.subscriptionDeleted.ts` hardcodes `p_set_ratchet: false` at the RPC call. Variables must depend on real inputs. The derivation is `const setRatchet: boolean = false` — deletion events are never payment events — but expressing it as a named variable makes the call site self-documenting and removes the unexplained literal.

  * `[✅]` `role`
    * `[✅]` Adapter handler — Stripe-specific webhook processing

  * `[✅]` `module`
    * `[✅]` Stripe adapter, `_shared/adapters/stripe/handlers/`

  * `[✅]` `deps`
    * `[✅]` `update_subscription_with_tier` RPC (already deployed)

  * `[✅]` `context_slice`
    * `[✅]` Above the RPC call at line 51: `const setRatchet: boolean = false` — deletion is never a payment event
    * `[✅]` Replace `p_set_ratchet: false` with `p_set_ratchet: setRatchet` at line 51

  * `[✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.test.ts`
    * `[✅]` Existing tests assert `p_set_ratchet: false`; `setRatchet = false` so those assertions remain correct — no changes to existing tests
    * `[✅]` Add test: RPC is called with `p_set_ratchet: false` on a standard deletion event — confirms the named derivation produces the correct value

  * `[✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.ts`
    * `[✅]` Above the RPC call at line 51: declare `const setRatchet: boolean = false`
    * `[✅]` Replace `p_set_ratchet: false` with `p_set_ratchet: setRatchet` at line 51

  * `[✅]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.integration.test.ts`
    * `[✅]` Integration tests already exist covering both scenarios: full lifecycle (checkout → invoice → deletion, `has_ever_paid: true` → `tier_level: 10`) and never-paid deletion (`tier_level: 0`); both assert `p_set_ratchet: false` at the RPC call — no new integration tests needed

  * `[✅]` `directionality`
    * `[✅]` Node layer: adapter handler — `supabase/functions/_shared/adapters/stripe/handlers/`
    * `[✅]` Deps are inward-facing: `update_subscription_with_tier` RPC (deployed DB function, invoked via `context.supabaseClient`)
    * `[✅]` `handleCustomerSubscriptionDeleted` is outward-facing: exported function consumed by the Stripe webhook dispatcher
    * `[✅]` No cycles: handler does not import from the dispatcher or any consumer

  * `[✅]` `requirements`
    * `[✅]` `p_set_ratchet` is derived from `const setRatchet: boolean = false` — deletion is never a payment event — observable: new unit test GREEN
    * `[✅]` RPC receives `p_set_ratchet: false` on every deletion event — observable: new unit test GREEN
    * `[✅]` All pre-existing unit tests pass without modification — `setRatchet = false` matches existing `p_set_ratchet: false` assertions — observable: test runner GREEN for entire subscriptionDeleted test file
    * `[✅]` Integration tests pass without modification — both lifecycle scenarios assert `p_set_ratchet: false` and remain correct — observable: integration test runner GREEN

  * `[✅]` **Commit** `fix(p-set-ratchet): derive p_set_ratchet from subscription event semantics instead of hardcoded false`
    * `[✅]` `stripe.subscriptionUpdated.ts`: `p_set_ratchet` derived from `subscription.status === 'active'`; active = paying = set the ratchet; out-of-spec statuses removed from tests
    * `[✅]` `stripe.subscriptionDeleted.ts`: `p_set_ratchet` derived as named constant `false`; deletion is never a payment event; self-documenting, no unexplained literal

* `[✅]` `[CONFIG]` supabase/scripts/update-seed **Re-run after tier-infrastructure migration to keep seed.sql in sync**

  * `[✅]` `objective`
    * `[✅]` Tier-infrastructure migration adds `tier_definitions` table, `subscription_plans.tier_level`, `user_subscriptions.has_ever_paid` + `tier_level`, `ai_providers.min_plan_tier_level`, and backfills all of them. Current `seed.sql` does not reflect these columns. Local dev / CI bring-up will see schema drift.
    * `[✅]` Fix: apply the tier-infrastructure migration locally; re-run `update-seed.ts` to regenerate `seed.sql` with the new columns and backfill values.

  * `[✅]` `role`
    * `[✅]` Operations — seed regeneration

  * `[✅]` `module`
    * `[✅]` supabase/scripts (no code change to `update-seed.ts` itself)

  * `[✅]` `deps`
    * `[✅]` Tier infrastructure migration (completed earlier in this checklist)
    * `[✅]` Stream 1 seed regeneration (completed) — that pass did not include tier columns because the migration had not yet been applied
    * `[✅]` `supabase/scripts/update-seed.ts` (no changes needed to the script)

  * `[✅]` Apply tier-infrastructure migration to local DB; run `update-seed.ts`; inspect regenerated `seed.sql`
    * `[✅]` Verify `tier_definitions` rows present (level 0/10/20/30 with seeded names and caps)
    * `[✅]` Verify `subscription_plans` rows include `tier_level` populated by backfill
    * `[✅]` Verify `user_subscriptions` rows include `has_ever_paid` and `tier_level` populated by backfill
    * `[✅]` Verify `ai_providers` rows include `min_plan_tier_level` populated by cost-band backfill

  * `[✅]` **Commit** `chore(seed): regenerate seed.sql with tier-infrastructure columns and backfill values`

* `[✅]` `[DB]` supabase/migrations **Fix current_plan_tier — remove non-existent 'trialing' status from active subscription check**

  * `[✅]` `objective`
    * `[✅]` Line 87 of `20260501204427_tier_infrastructure.sql` reads `AND us.status IN ('active', 'trialing')`. The status `trialing` does not exist in this system — no handler ever writes `status = 'trialing'`. The only valid active-subscription status is `active`. The `trialing` branch is dead code that misrepresents the system's status vocabulary and was never reachable.
    * `[✅]` **Full-chain audit result (covers the deferred audit item below):** The complete `update_subscription_with_tier → refresh_user_tier → current_plan_tier` RPC chain has been audited against the stated business rules:
      * `[✅]` never-paid → 0: `current_plan_tier` returns 0 immediately when `has_ever_paid IS NOT TRUE`. ✓ Correct.
      * `[✅]` has-ever-paid + active → plan tier_level: after this migration, `current_plan_tier` queries `WHERE us.status = 'active'` and JOINs to `subscription_plans.tier_level`. ✓ Correct after fix.
      * `[✅]` has-ever-paid + not active → 10 (basic floor): `current_plan_tier` returns 10 when no active subscription row is found and `has_ever_paid = true`. ✓ Correct.
      * `[✅]` `refresh_user_tier`: sets ratchet when instructed, calls `current_plan_tier`, caches result in `user_subscriptions.tier_level`, returns -1 on missing row with WARNING. ✓ Correct.
      * `[✅]` `update_subscription_with_tier`: UPDATE sets all fields including nullable parameters unconditionally. Both callers (`subscriptionUpdated`, `subscriptionDeleted`) always supply non-null `p_plan_id` (resolved from Stripe price or free plan), so `plan_id` is never silently overwritten with NULL in practice. ✓ Correct for all defined callers.
      * `[✅]` No additional defects found in `update_subscription_with_tier` or `refresh_user_tier`. No additional corrective migration required.
    * `[✅]` Functional goal: create a corrective migration that replaces `current_plan_tier` with the identical function body except `AND us.status = 'active'` in place of `AND us.status IN ('active', 'trialing')`. No other changes to any function.
    * `[✅]` Non-functional constraint: no behavioral change for any currently reachable code path — `trialing` was never a valid status so no existing row matched it.

  * `[✅]` `role`
    * `[✅]` Infrastructure — corrective database migration
    * `[✅]` Must NOT change any behavior other than removing the dead `trialing` branch

  * `[✅]` `module`
    * `[✅]` Database, cross-cutting — `current_plan_tier` is consumed by `refresh_user_tier`, `complete_checkout_payment` (idempotency path), and `complete_invoice_payment` (idempotency path)

  * `[✅]` `deps`
    * `[✅]` `20260501204427_tier_infrastructure.sql` — defines the original `current_plan_tier`; this migration replaces it with a corrected version
    * `[✅]` No other dependencies; this migration only re-declares one function

  * `[✅]` supabase/migrations/`<timestamp>_fix_current_plan_tier_remove_trialing.sql`
    * `[✅]` `CREATE OR REPLACE FUNCTION public.current_plan_tier(p_user_id UUID)` with `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`
    * `[✅]` Function body is identical to `20260501204427_tier_infrastructure.sql` lines 64–96 except: the active-subscription query changes from `AND us.status IN ('active', 'trialing')` to `AND us.status = 'active'`
    * `[✅]` Include migration comment: `-- Fix: removes 'trialing' from the active status check. 'trialing' is not a valid status in this system and was never written by any handler. The only valid active-subscription status is 'active'.`
    * `[✅]` `GRANT EXECUTE ON FUNCTION public.current_plan_tier(UUID) TO service_role, authenticated;` — re-affirm grants; REPLACE preserves existing grants in PostgreSQL but explicit re-grant ensures correctness after migration replay

  * `[✅]` **Commit** `fix(db): remove non-existent trialing status from current_plan_tier active subscription query`
    * `[✅]` `current_plan_tier`: `AND us.status IN ('active', 'trialing')` → `AND us.status = 'active'`; `trialing` is not a valid status in this system and was never written by any handler
    * `[✅]` Full-chain audit complete: `update_subscription_with_tier → refresh_user_tier → current_plan_tier` correctly implements all three business rules (never-paid → 0, has-ever-paid + active → plan tier_level, has-ever-paid + not active → 10); no additional corrective migrations required

* Remove recurring token allocation — **RESOLUTION: disable the cron job, leave code as inert dead code.** The `allocate-periodic-tokens` function and its `token_wallets` column are not called by anything other than the cron schedule. Disabling the cron job kills the feature immediately with zero code changes and is trivially reversible if business conditions change. No nodes needed.

* Add output clamp slider so that users can adjust the clamp up to their plan max — **UI/UX (deferred). Backend prereq**: model catalog response must include user's tier_level and the tier_definitions row (output_cap_tokens) so the frontend knows the slider's max value. Investigate whether the existing model catalog endpoint or a separate user-tier endpoint is cleaner.
    - show actual clamp values 
    - show meaning indicators (free/basic/premium/ultra) for clamp values — frontend reads `tier_definitions.name` for labels
    - show upgrade teases so users know how to access higher limits — frontend compares user.tier_level against tier_definitions to show what's available at higher tiers

* Update NSF UI — **UI/UX (deferred). Backend prereq**: a cost estimation endpoint or utility that computes estimated token cost for a given model set + output cap + stage/project scope. Investigate whether `dialectic-service/listModelCatalog` or a new endpoint is appropriate. The front end needs: model cost rates (already in catalog), estimated tokens per stage (may require a new estimation function), and user wallet balance.
    - to be dynamic against chosen model(s) — reads model cost rates from catalog
    - to be dynamic output slider setting — reads user's output cap from tier
    - to scope against next stage — needs stage token estimate (new backend function or heuristic)
    - to scope against entire remaining project — needs total remaining token estimate
    - to tease the minimum OTP to complete the next stage — computes shortfall = estimated_cost - wallet_balance
    - to tease the minimum OTP full project — same, scoped to full project

* Show estimated cost to complete the project based on user configuration before they ever click "Create Project" — **UI/UX (deferred). Backend prereq**: same cost estimation function as NSF UI above. Needs: model cost rates, estimated tokens per stage (heuristic from template/archetype), number of stages, output cap setting. May share the same backend endpoint as the NSF cost estimation.

* Update subscription page to let users select multiple choices (one recurring + any number of OTP) — **UI/UX (deferred). Backend prereq**: investigate whether Stripe supports adding OTP line items to an existing subscription checkout, or if OTPs must remain separate payment flows. Current implementation uses separate checkout sessions for subscription vs OTP. Multi-item checkout may require Stripe Checkout `line_items` array changes in `stripePaymentAdapter.createCheckoutSession()`.
    - Suggest bundles, e.g. Basic + 6 MT OTP, Premium + 18 MT OTP, Ultra + 50 MT OTP — frontend reads `subscription_plans` to get tier+token combinations, presents as bundles

* Marketing / sales incentives — **UI/UX (deferred). Backend prereq COVERED**: `min_plan_tier_level` on model catalog response (from tier infrastructure migration) + `tier_definitions` table (tells frontend what each tier provides). No additional backend work needed — frontend reads existing data.
    - Update model selector to be plan-level aware and suggest what plan to upgrade to when users try to select a model they don't have access to — frontend compares `model.min_plan_tier_level` against `user.tier_level`, shows upgrade prompt linking to subscription page with the required tier pre-selected

* Update Stripe plans per spreadsheet — **Ops task (deferred). Prereq**: after tier infrastructure migration, update `subscription_plans.tier_level` for each Stripe plan to match the correct tier. This is a data-only change via direct DB update or a follow-up migration, not a code change.

* Fix session bug: 
    Unexpected Application Error!
    [selectUnifiedProjectProgress] Session is required when stages exist
    Error: [selectUnifiedProjectProgress] Session is required when stages exist
        at vo (https://paynless.app/assets/vendor-store-B-XaJYVV.js:1885:17)
        at https://paynless.app/assets/DialecticSessionDetailsPage-BPXjc1k_.js:488:77
        at r (https://paynless.app/assets/vendor-store-B-XaJYVV.js:85:34)
        at https://paynless.app/assets/vendor-store-B-XaJYVV.js:97:14
        at Object.Tf [as useSyncExternalStore] (https://paynless.app/assets/router-DYLlmPMm.js:2872:29)
        at K.useSyncExternalStore (https://paynless.app/assets/router-DYLlmPMm.js:247:21)
        at Lt.useSyncExternalStoreWithSelector (https://paynless.app/assets/vendor-store-B-XaJYVV.js:102:11)
        at Kr (https://paynless.app/assets/vendor-store-B-XaJYVV.js:114:13)
        at t (https://paynless.app/assets/vendor-store-B-XaJYVV.js:119:63)
        at qs (https://paynless.app/assets/DialecticSessionDetailsPage-BPXjc1k_.js:487:229)


## Netlify-Worker-Stream Phase 2 and Phase 3 — deferred detail

### Phase 2 (backend notification and status adaptation):

* getAllStageProgress.ts and its consumers need to understand queued as a distinct in-flight status (currently it would fall through to an unclassified state)
* The notification service needs updated event types for the new async lifecycle (stream_queued, stream_started, stream_complete) to give the frontend accurate real-time signals
* deriveStepStatuses and related step-progress logic need to account for jobs in queued state without treating them as failed or not-started

### Phase 3 (frontend):

* Status display components consuming UnifiedStageStatus need a new streaming or queued visual state
* Real-time subscription handlers need to act on the new job status transitions
* The user-facing progress indicators need to reflect the two-phase async lifecycle rather than a single blocking operation


## StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
- Update StageDAGProgressDialog to use notifications to change color too 

## Highlight the chosen Chat or Project in the left sidebar 
- Currently the sidebar gives no indication of which Chat or Project the user has focused
- Outline and/or highlight the chosen Chat or Project in the left sidebar

## New user sign in banner doesn't display, throws console error  
- Chase, diagnose, fix 

## Refactor EMCAS to break apart the functions, segment out the tests
- Move gatherArtifacts call to processSimpleJob
- Decide where to measure & RAG

## Switch to stream-to-buffer instead of chunking
- This lets us render the buffer in real time to show document progress 

## Build test fixtures for major function groups 
- Provide standard mock factories and objects 
- dialectic-worker, dialectic-service, document_renderer, anything else that has huge test files  

## Support user-provided API keys for their preferred providers 

## Regenerate existing document from user feedback & edits 

## Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
## Let the user pick/rate their preferred version and drop the others 

## Use a gentle color schema to differentiate model outputs visually / at a glance 

## When doc loads for the first time, position at top 

## Search across documents for key terms 

## Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

## Add optional outputs for selected stages
- A "landing page" output for the proposal stage
-- Landing page
-- Hero banner
-- Call to action
-- Email sign up 
- A "financial analysis" output for the "refinement" stage
-- 1/3/5 year 
-- Conservative / base / aggressive
-- IS, BS, CF 
- A "generate next set of work" for the implementation stage 

## Ensure front end components use friendly names 
- SessionInfoCard uses formal names instead of friendly names 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 

## Swap default model to Gemini Flash

## Let users pick model on "Start Project" page 

## Fix continuation naming to use continuation naming instead of iterations 

## 