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
- Backend guard on `selected_model_ids` — reject model selection if `model.min_plan_tier_level > user.tier_level`. This is a guard, not a filter: the frontend shows all models but disables selection for unavailable ones. The backend must validate on write to prevent UI bypass.
- Output cap enforcement in the provider adapters — read `tier_definitions.output_cap_tokens` for the user's tier, apply `min(tier_cap, model.hard_cap_output_tokens)` to `max_tokens` before calling the provider API. The adapters are the most resilient enforcement point because every call path goes through them.
- Model catalog endpoint must return `min_plan_tier_level` per model so the frontend can render availability indicators — read `listModelCatalog.ts` and `ai-providers/index.ts`
- `max_models_per_project` enforcement — guard on project model selection, not on model list
- Clamp values are configurable, not hard coded → `tier_definitions` table
- Initial tiers are free, basic, premium, ultra
- Free, 8k output limit, "free" tagged models, max one model per project
- Basic, 32k output limit, "basic" or lower tagged models, max two models per project 
- Premium, 128k output limit, "premium" or lower tagged models, max three models per project 
- Ultra, no output limit, no model limit

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