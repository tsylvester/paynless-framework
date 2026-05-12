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

* `[ ]` `[BE]` supabase/functions/dialectic-service/startSession **Guard selected_model_ids against user tier before session INSERT**

  * `[ ]` `objective`
    * `[ ]` `startSession.ts` line 303 writes `selected_model_ids` to `dialectic_sessions` without tier validation. A frontend bypass or direct API call can create a session with models the user's subscription does not permit, or with more models than `max_models_per_project` allows for the user's tier.
    * `[ ]` Fix: call `validate_model_tier_access` RPC after resolving `selectedModels` and before the session INSERT. If `valid = false`: return a structured error identifying whether the failure is a tier mismatch (`disallowed_model_ids`) or a count violation (`over_model_limit`). Do not write the session on failure.

  * `[ ]` `role`
    * `[ ]` Domain service — session creation entrypoint
    * `[ ]` Guard is a pre-write validation step; it delegates the judgment to the SQL function

  * `[ ]` `module`
    * `[ ]` dialectic-service bounded context

  * `[ ]` `deps`
    * `[ ]` `validate_model_tier_access` RPC (prior migration node)
    * `[ ]` `supabaseClient` — already in scope at the INSERT call site
    * `[ ]` `userId` — the authenticated user's ID; confirm it is available before the guard call site (present via JWT context)

  * `[ ]` `context_slice`
    * `[ ]` Insert guard AFTER `selectedModels` is resolved and BEFORE the `dialectic_sessions` INSERT at lines 295–309
    * `[ ]` Guard call: `supabaseClient.rpc('validate_model_tier_access', { p_user_id: userId, p_model_ids: selectedModels.map(m => m.id) })`
    * `[ ]` Return shape conforms to the existing handler contract `Promise<{ data?: T; error?: ServiceError }>`. Structured payload is packaged into `ServiceError.details` as a single-element `Record<string, unknown>[]` per the `string | Record<string, unknown>[]` union at `_shared/types.ts:524`.
    * `[ ]` On RPC error: return `{ error: { message: 'Failed to validate model tier access', status: 500, code: 'TIER_VALIDATION_FAILED' } }`
    * `[ ]` On `valid = false` + `over_model_limit = true`: return `{ error: { message: 'Model selection exceeds the limit for your plan', status: 403, code: 'MODEL_LIMIT_EXCEEDED', details: [{ over_model_limit: true, max_models_per_project: result.max_models_per_project, user_tier_level: result.user_tier_level }] } }`
    * `[ ]` On `valid = false` + disallowed models: return `{ error: { message: 'Selected models are not available on your plan', status: 403, code: 'MODEL_TIER_DISALLOWED', details: [{ disallowed_model_ids: result.disallowed_model_ids, user_tier_level: result.user_tier_level }] } }`
    * `[ ]` On `valid = true`: existing INSERT logic unchanged

  * `[ ]` `startSession.test.ts` does not exist; tests are split by behavior across `startSession.happy.test.ts` and `startSession.errors.test.ts` per the file-organization convention. The new tests must be placed accordingly.

  * `[ ]` supabase/functions/dialectic-service/`startSession.happy.test.ts`
    * `[ ]` Add test: all selected models within user's tier and under model count limit → session INSERT proceeds, session returned
    * `[ ]` Add test: empty `selected_model_ids` array → `validate_model_tier_access` returns `valid = true, over_model_limit = false, disallowed_model_ids = '{}'`, INSERT proceeds — this also exercises the migration's empty-array guard

  * `[ ]` supabase/functions/dialectic-service/`startSession.errors.test.ts`
    * `[ ]` Add test: one selected model has `min_plan_tier_level` above user's `tier_level` → RPC returns `valid = false`, `disallowed_model_ids` populated → session NOT inserted; assertion reads `error.details[0].disallowed_model_ids` and `error.details[0].user_tier_level`
    * `[ ]` Add test: `selected_model_ids` count exceeds `max_models_per_project` for user's tier → RPC returns `valid = false`, `over_model_limit = true` → session NOT inserted; assertion reads `error.details[0].over_model_limit`, `error.details[0].max_models_per_project`, `error.details[0].user_tier_level`
    * `[ ]` Add test: `validate_model_tier_access` RPC returns DB error → session NOT inserted, generic `ServiceError` returned with no `details`

  * `[ ]` supabase/functions/dialectic-service/`startSession.ts`
    * `[ ]` After resolving `selectedModels` (before the INSERT at line 295): call `validate_model_tier_access` RPC with `userId` and model ID array
    * `[ ]` Handle RPC error, `over_model_limit`, and disallowed model cases as described in `context_slice`
    * `[ ]` On `valid = true`: existing INSERT at lines 295–309 is unchanged

* `[ ]` `[BE]` supabase/functions/dialectic-service/updateSessionModels **Guard selected_model_ids against user tier before session UPDATE**

  * `[ ]` `objective`
    * `[ ]` `updateSessionModels.ts` line 56 updates `selected_model_ids` on an existing session without tier validation. The frontend calls this endpoint dynamically whenever the user changes their model selection mid-project, but a bypass can write inaccessible models or exceed the model count limit without detection.
    * `[ ]` Fix: same guard pattern as `startSession.ts` — call `validate_model_tier_access` RPC before the UPDATE. Return a structured error if invalid; do not execute the UPDATE.

  * `[ ]` `role`
    * `[ ]` Domain service — dynamic model selection update for an existing session

  * `[ ]` `module`
    * `[ ]` dialectic-service bounded context

  * `[ ]` `deps`
    * `[ ]` `validate_model_tier_access` RPC (prior migration node)
    * `[ ]` `userId` — confirm it is available in `handleUpdateSessionModels` context before the guard call site

  * `[ ]` `context_slice`
    * `[ ]` Guard call pattern: identical to `startSession.ts` — insert before the `.update()` at line 54
    * `[ ]` Use `selectedModels.map(model => model.id)` as `p_model_ids` — `selectedModels` is already resolved before the UPDATE
    * `[ ]` Same error return shapes and passthrough logic as `startSession.ts` — `{ error: ServiceError }` with structured payload in `error.details` as `Record<string, unknown>[]`

  * `[ ]` supabase/functions/dialectic-service/`updateSessionModels.test.ts`
    * `[ ]` Add test: valid selection within tier and count limit → UPDATE proceeds, updated session returned
    * `[ ]` Add test: model above user's tier → `valid = false`, UPDATE NOT executed; assertion reads `error.details[0].disallowed_model_ids` and `error.details[0].user_tier_level`
    * `[ ]` Add test: count exceeds `max_models_per_project` → `valid = false`, `over_model_limit = true`, UPDATE NOT executed; assertion reads `error.details[0].over_model_limit`, `error.details[0].max_models_per_project`, `error.details[0].user_tier_level`
    * `[ ]` Add test: RPC returns DB error → UPDATE NOT executed, generic `ServiceError` propagated with no `details`

  * `[ ]` supabase/functions/dialectic-service/`updateSessionModels.ts`
    * `[ ]` Before the `.update({ selected_model_ids: ... })` call at line 54: call `validate_model_tier_access` RPC
    * `[ ]` Handle results identically to `startSession.ts` — same error shapes, same passthrough on `valid = true`

* `[ ]` `[BE]` supabase/functions/dialectic-service/cloneProject **Filter tier-inaccessible models from cloned sessions**

  * `[ ]` `objective`
    * `[ ]` `cloneProject.ts` line 216 copies `selected_model_ids` from original sessions verbatim into cloned sessions. The cloning user's tier is not validated. If the user's tier has downgraded since the original project was created, or if they are cloning from a higher-tier project, the cloned sessions will carry inaccessible model IDs.
    * `[ ]` Fix: before each session INSERT in the clone loop, validate the original `selected_model_ids` against the cloning user's tier. Exclude disallowed models from the cloned session — do not abort the clone. Add a TODO comment at the exclusion point identifying this as a known gap for future UX resolution.

  * `[ ]` `role`
    * `[ ]` Domain service — project clone operation; guard here filters rather than rejects because a partial clone is better than no clone

  * `[ ]` `module`
    * `[ ]` dialectic-service bounded context

  * `[ ]` `deps`
    * `[ ]` `validate_model_tier_access` RPC (prior migration node)
    * `[ ]` Cloning user's `userId` — confirm it is available in `cloneProject` function context before editing

  * `[ ]` `context_slice`
    * `[ ]` For each session in the clone loop (around lines 211–222): if `originalSession.selected_model_ids` is non-null and non-empty, call `validate_model_tier_access` with the cloning user's ID and the original model IDs
    * `[ ]` Compute `allowedModelIds`: filter original model IDs to those NOT in `result.disallowed_model_ids`
    * `[ ]` If models were excluded: `logger.warn('[cloneProject] Excluded ${excluded.length} model(s) from cloned session ${newSessionId} — models above user tier ${result.user_tier_level}: ${excluded.join(", ")}')`
    * `[ ]` Add TODO comment at the filter step: `// TODO: Models excluded here because they exceed the cloning user's tier may leave the cloned project unable to continue without a valid model. The write-path guards on startSession and updateSessionModels will catch invalid usage at runtime, but the clone itself silently carries the gap. This is a deliberate filter-not-reject decision: a partial clone is preferable to no clone. Future work: before proceeding with the clone, notify the user of excluded models and offer resolution — either select an accessible replacement model or upgrade the plan. See Stream 3 / Gate models scope.`
    * `[ ]` If the RPC itself errors: log warning, use the original unfiltered list (best-effort — write-path guards on start/update catch invalid usage at runtime), continue the clone
    * `[ ]` If `originalSession.selected_model_ids` is null or empty: skip the guard call, clone null/empty as-is

  * `[ ]` supabase/functions/dialectic-service/`cloneProject.test.ts`
    * `[ ]` Add test: all original models within user's tier → cloned session has identical `selected_model_ids`
    * `[ ]` Add test: one model above user's tier → that model excluded from clone, others preserved, clone succeeds
    * `[ ]` Add test: all models above user's tier → `selected_model_ids` is empty in cloned session, clone succeeds
    * `[ ]` Add test: `validate_model_tier_access` RPC errors → original model IDs used unfiltered, warning logged, clone succeeds
    * `[ ]` Add test: original session has null `selected_model_ids` → guard skipped, null cloned as-is

  * `[ ]` supabase/functions/dialectic-service/`cloneProject.ts`
    * `[ ]` In the session clone loop around lines 211–222: before constructing `newSessionInsert`, call `validate_model_tier_access` on `originalSession.selected_model_ids` (if non-null/non-empty); filter to `allowedModelIds`; add TODO comment; set `selected_model_ids: allowedModelIds` on `newSessionInsert`

  * `[ ]` Create supabase/functions/dialectic-service/`cloneProject.integration.test.ts` — file does not currently exist; only `cloneProject.test.ts` is present.
    * `[ ]` Full guard chain integration test spanning all three write points:
      * Attempt to start a session with a premium-tier model as a free-tier user → rejected with disallowed model error, session not created
      * Attempt to update an existing session's models to that same premium model as a free-tier user → rejected with disallowed model error, session not updated
      * Clone a project whose sessions include that premium model as a free-tier user → clone succeeds, premium model excluded from cloned session's `selected_model_ids`

  * `[ ]` **Commit** `feat(model-tier-guards): validate model tier access and max-models-per-project on all selected_model_ids write points`
    * `[ ]` Migration: `validate_model_tier_access` SQL RPC — reads user tier, checks model access and count, returns structured result; granted to service_role and authenticated
    * `[ ]` `startSession.ts`, `updateSessionModels.ts`: reject writes when selected models exceed user tier or count limit; structured error identifies whether it's a tier mismatch or count violation
    * `[ ]` `cloneProject.ts`: filter tier-inaccessible models from cloned sessions; partial clone with TODO comment for future conflict resolution UX

* `[ ]` `[BE]` supabase/functions/_shared/utils/affordability_utils **Add tier output cap parameter to getMaxOutputTokens**

  * `[ ]` `objective`
    * `[ ]` `getMaxOutputTokens()` caps output by `hard_cap_output_tokens`, `provider_max_output_tokens`, and the user's wallet budget. The user's tier-based output cap (`tier_definitions.output_cap_tokens`) is not applied. A free-tier user with sufficient wallet balance could request 128k tokens — 16× their permitted 8k tier cap.
    * `[ ]` Fix: add `tierOutputCapTokens` as a new parameter. When non-null, apply it as an explicit conditional cap. When null (ultra tier — no limit from tier), skip the conditional entirely. This is a pure function; it does not fetch from DB.

  * `[ ]` `role`
    * `[ ]` Domain utility — pure output cap calculation, no I/O
    * `[ ]` Must NOT fetch tier data — receives the cap value as a parameter from the caller

  * `[ ]` `module`
    * `[ ]` `_shared/utils`, consumed by `calculateAffordability`

  * `[ ]` `deps`
    * `[ ]` `types_db.ts` — `Tables<'tier_definitions'>['output_cap_tokens']` — use this type accessor for the parameter type; the `number | null` union is declared in the row type definition (the authoritative source), not inline at the call site

  * `[ ]` `context_slice`
    * `[ ]` New parameter: `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens']` — appended **after** the existing optional `deficit_tokens_allowed = 0` parameter, also optional with default `null`: `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens'] = null`. This preserves backward compatibility with `chat/` callers that omit the parameter entirely — the chat subsystem does not apply tier output caps and its call sites must not be modified. The dialectic enforcement is at the `CalculateAffordabilityParams.tierOutputCapTokens` required-field boundary, which forces dialectic callers to provide the value explicitly.
    * `[ ]` After computing the existing minimum of all non-tier caps: `if (tierOutputCapTokens !== null && result > tierOutputCapTokens) { result = tierOutputCapTokens }`
    * `[ ]` No nullish coalescing against `Infinity` — the conditional is the complete logic. When null, the block is skipped; no default is substituted.

  * `[ ]` supabase/functions/_shared/utils/`affordability_utils.test.ts`
    * `[ ]` Add test: `tierOutputCapTokens` omitted entirely → result unchanged from existing logic (confirms optional default null behavior; validates `chat/` call sites remain compatible)
    * `[ ]` Add test: `tierOutputCapTokens = null` (explicit) → result unchanged from existing logic (tier conditional not applied)
    * `[ ]` Add test: `tierOutputCapTokens = 32768`, wallet budget allows 100000, model hard cap = 131072 → result = 32768 (tier is binding)
    * `[ ]` Add test: `tierOutputCapTokens = 131072`, model hard cap = 64000 → result = 64000 (model cap is binding)
    * `[ ]` Add test: `tierOutputCapTokens = 131072`, wallet budget = 10000 → result = 10000 (wallet is binding)
    * `[ ]` All existing tests: do NOT add the parameter — must still pass to prove backward compatibility

  * `[ ]` supabase/functions/_shared/utils/`affordability_utils.ts`
    * `[ ]` Add `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens'] = null` as the last parameter to `getMaxOutputTokens()` (after `deficit_tokens_allowed = 0`)
    * `[ ]` Add explicit conditional after existing cap logic: `if (tierOutputCapTokens !== null && result > tierOutputCapTokens) { result = tierOutputCapTokens }`
    * `[ ]` Import `Tables` from `types_db.ts` if not already imported
    * `[ ]` Add a comment above the new parameter documenting why the default exists: two chat-source call sites (`supabase/functions/chat/streamChat/StreamChat.ts:203`, `supabase/functions/chat/streamRewind/streamRewind.ts:214`) intentionally remain unmodified — chat is out of scope for tier capping. The parameter default preserves those call sites without modification. The default is a deliberate part of the contract, not an oversight.

* `[ ]` `[BE]` supabase/functions/dialectic-worker/calculateAffordability **Thread tierOutputCapTokens through to getMaxOutputTokens**

  * `[ ]` `objective`
    * `[ ]` `calculateAffordability()` calls `getMaxOutputTokens()` but cannot pass the new `tierOutputCapTokens` parameter because it does not receive it. The tier cap must be threaded from `prepareModelJob` through this function to the utility.

  * `[ ]` `role`
    * `[ ]` Domain service — affordability computation, orchestrates cap inputs and wallet math

  * `[ ]` `module`
    * `[ ]` dialectic-worker bounded context

  * `[ ]` `deps`
    * `[ ]` `affordability_utils.ts` (prior node — `getMaxOutputTokens` with new parameter)
    * `[ ]` `types_db.ts` — `Tables<'tier_definitions'>['output_cap_tokens']`

  * `[ ]` `context_slice`
    * `[ ]` `CalculateAffordabilityParams` (the params type for this function): add `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens']`
    * `[ ]` In the function body: pass `params.tierOutputCapTokens` to `getMaxOutputTokens()` as the new parameter
    * `[ ]` No other logic changes

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.test.ts`
    * `[ ]` Add test: `tierOutputCapTokens` is forwarded to `getMaxOutputTokens` — mock `getMaxOutputTokens` and assert it receives the value passed in params
    * `[ ]` Add test: `tierOutputCapTokens = null` → null forwarded as-is
    * `[ ]` Existing tests: add `tierOutputCapTokens: null` to test params — must still pass

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.interface.test.ts`
    * `[ ]` Add test: `CalculateAffordabilityParams` shape includes `tierOutputCapTokens` typed as `Tables<'tier_definitions'>['output_cap_tokens']` (number | null)
    * `[ ]` Add test: valid params with `tierOutputCapTokens: null` satisfies the interface
    * `[ ]` Add test: valid params with `tierOutputCapTokens: 32768` (number) satisfies the interface
    * `[ ]` Existing contract tests for `CalculateAffordabilityParams` must still pass with the added field

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.interface.ts`
    * `[ ]` Add `Tables` to the existing `types_db.ts` import (currently only `Database` is imported; add `Tables` to the same import statement)
    * `[ ]` Add `tierOutputCapTokens: Tables<'tier_definitions'>['output_cap_tokens']` to `CalculateAffordabilityParams` — required field; callers must always provide it explicitly (number for a capped tier, null for ultra / no cap)

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.guard.test.ts`
    * `[ ]` Add test: `isCalculateAffordabilityParams()` accepts params with `tierOutputCapTokens: null`
    * `[ ]` Add test: `isCalculateAffordabilityParams()` accepts params with `tierOutputCapTokens: 32768` (number)
    * `[ ]` Add test: `isCalculateAffordabilityParams()` rejects params missing `tierOutputCapTokens` field entirely
    * `[ ]` Existing `isCalculateAffordabilityParams` tests must still pass

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.guard.ts`
    * `[ ]` Add check in `isCalculateAffordabilityParams()` after existing field checks: `if (!('tierOutputCapTokens' in v)) { return false }` then validate `typeof v.tierOutputCapTokens === 'number' || v.tierOutputCapTokens === null`

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.ts`
    * `[ ]` `calculateAffordability.ts` calls `getMaxOutputTokens` in three distinct locations; all three must be updated explicitly — relying on the optional default is not sufficient here; intent must be visible at each call site:
      * Non-compressed path (~line 80): `getMaxOutputTokens(walletBalance, initialTokenCount, extendedModelConfig, deps.logger, 0, params.tierOutputCapTokens)` — this is the binding enforcement point; pass the actual tier cap
      * Compression path `getAllowedInputFor` lambda (~line 236): `getMaxOutputTokens(balanceTokens, tokenCount, extendedModelConfig, deps.logger, 0, null)` — compression budget estimation does not enforce the tier cap; pass null explicitly
      * Compression path `plannedMaxOutPostPrecheck` (~line 278): `getMaxOutputTokens(balanceAfterCompression, finalTargetThreshold, extendedModelConfig, deps.logger, 0, null)` — same rationale; pass null explicitly

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.mock.ts`
    * `[ ]` Add `tierOutputCapTokens` to the `CalculateAffordabilityParamsOverrides` type as an optional override (`number | null`) so callers can vary the value
    * `[ ]` Add `tierOutputCapTokens` to the `base` literal returned by `buildCalculateAffordabilityParams`, sourced from `overrides?.tierOutputCapTokens` with a default of `null`
    * `[ ]` Any additional `CalculateAffordabilityParams` literals constructed directly in this file (outside the factory): add `tierOutputCapTokens: null`

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.test.ts`
    * `[ ]` Direct `getMaxOutputTokens(...)` call sites used to compute `expectedMax` fixtures must pass the new parameter explicitly — visible-intent rule applies to test fixtures the same as to source. Pass the tier cap value being exercised by the surrounding test (or `null` when the test asserts behavior with no tier cap applied).
    * `[ ]` All `CalculateAffordabilityParams` constructions in this file are produced via `buildCalculateAffordabilityParams`; the factory update above carries `tierOutputCapTokens` through. No literal updates required in this file.

  * `[ ]` supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.integration.test.ts`
    * `[ ]` Direct `getMaxOutputTokens(...)` call site used to compute `expectedMax` fixture must pass the new parameter explicitly — same rule as above
    * `[ ]` All `CalculateAffordabilityParams` constructions are produced via `buildCalculateAffordabilityParams`; the factory update carries the field through
    * `[ ]` Add test: `tierOutputCapTokens = 32768` → `getMaxOutputTokens` receives the cap and returns 32768 when it is binding; confirms end-to-end threading within the module

  * `[ ]` supabase/functions/dialectic-worker/`processSimpleJob.integration.test.ts`
    * `[ ]` Update all `CalculateAffordabilityParams` constructions to supply `tierOutputCapTokens: null` — required after the params type gains the new field; null passes the tier conditional unchanged (ultra behavior)
    * `[ ]` Update all `EnqueueModelCallParams` payload constructions in this file (the `enqueueParamsUnknown` payloads that are subsequently narrowed via `isEnqueueModelCallParams`) to include `tier_output_cap_tokens: null` — required so the guard narrowing succeeds after `EnqueueModelCallParams` and `isEnqueueModelCallParams` gain the required field in the `enqueueModelCall` node

  * `[ ]` supabase/functions/dialectic-worker/createJobContext/`JobContext.mock.ts`
    * `[ ]` Add `tierOutputCapTokens: null` to all `CalculateAffordabilityParams` constructions — `JobContext.mock.ts` types mock affordability handler params with `CalculateAffordabilityParams`; the new required field must be present


  * `[ ]` supabase/functions/dialectic-worker/createJobContext/`createJobContext.test.ts`
    * `[ ]` Add `tierOutputCapTokens: null` to all `CalculateAffordabilityParams` constructions in the test — must still pass

* `[ ]` `[BE]` supabase/functions/dialectic-worker/compressPrompt **Explicit null for tierOutputCapTokens at all getMaxOutputTokens call sites**

  * `[ ]` `objective`
    * `[ ]` `compressPrompt.ts` calls `getMaxOutputTokens` at two points (~lines 255, ~304). Once `getMaxOutputTokens` gains the optional `tierOutputCapTokens` parameter, these call sites must pass `null` explicitly. The compression subsystem does not enforce tier output caps — caps apply only to the final committed output token count, not to the iterative budget estimation during compression. Explicit null makes this intent visible and prevents future ambiguity.

  * `[ ]` `role`
    * `[ ]` Domain service — prompt compression; consumer of `affordability_utils.ts`
    * `[ ]` Must NOT apply tier output caps during compression budget estimation — pass null explicitly at all `getMaxOutputTokens` call sites

  * `[ ]` `module`
    * `[ ]` dialectic-worker bounded context

  * `[ ]` `deps`
    * `[ ]` `affordability_utils.ts` (prior node — `getMaxOutputTokens` with new optional parameter)

  * `[ ]` supabase/functions/dialectic-worker/compressPrompt/`compressPrompt.test.ts`
    * `[ ]` Locate all direct calls to `getMaxOutputTokens` in the test file (~lines 306, 312, 791, 966) — update each to pass `null` as the `tierOutputCapTokens` argument explicitly
    * `[ ]` All existing assertions must still pass

  * `[ ]` supabase/functions/dialectic-worker/compressPrompt/`compressPrompt.ts`
    * `[ ]` At ~line 255 (`plannedMaxOutputForCheck`): add `null` as the `tierOutputCapTokens` argument to `getMaxOutputTokens` — explicit intent: compression budget estimation does not apply tier cap
    * `[ ]` At ~line 304 (`plannedMaxOutputTokensPost`): add `null` as the `tierOutputCapTokens` argument to `getMaxOutputTokens` — same rationale

* `[ ]` `[BE]` supabase/functions/dialectic-worker/prepareModelJob **Fetch tier output cap and pass through call chain**

  * `[ ]` `objective`
    * `[ ]` `prepareModelJob.ts` assembles `AiStreamEventData` and calls `calculateAffordability()` but does not fetch the project owner's tier output cap. The cap is neither applied in the affordability calculation nor sent to the Netlify adapter for belt-and-suspenders enforcement. A user's worst-case output scenario is currently the model's hard cap, not their tier cap — potentially 8–16× more tokens than their tier permits.
    * `[ ]` Fix: after resolving `projectOwnerUserId`, fetch `tier_definitions.output_cap_tokens` for the user's current tier. Pass it to `calculateAffordability()`. Also pass it in `EnqueueModelCallParams` so `enqueueModelCall.ts` can include it in `AiStreamEventData` for the Netlify adapter to enforce independently.

  * `[ ]` `role`
    * `[ ]` Domain orchestrator — prepares the AI call payload from job data

  * `[ ]` `module`
    * `[ ]` dialectic-worker bounded context

  * `[ ]` `deps`
    * `[ ]` `calculateAffordability.ts` (prior node — now accepts `tierOutputCapTokens` via updated `CalculateAffordabilityParams`)
    * `[ ]` `supabaseClient` (service role) — already available in `prepareModelJob`
    * `[ ]` `enqueueModelCall.ts` (next node) — `EnqueueModelCallParams` gains `tier_output_cap_tokens`; pass the fetched value when calling `enqueueModelCall`

  * `[ ]` `context_slice`
    * `[ ]` After `projectOwnerUserId` is resolved: `SELECT td.output_cap_tokens FROM user_subscriptions us JOIN tier_definitions td ON td.level = us.tier_level WHERE us.user_id = $projectOwnerUserId`
    * `[ ]` On DB error: log warning, set `tierOutputCapTokens = null`, continue — affordability still applies model and wallet caps; adapter enforcement catches regressions
    * `[ ]` Pass `tierOutputCapTokens` to `calculateAffordability()` as the new parameter
    * `[ ]` Pass `tier_output_cap_tokens: tierOutputCapTokens` in the `EnqueueModelCallParams` object when calling `enqueueModelCall` — the field is added to that type in the `enqueueModelCall.ts` node

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.test.ts`
    * `[ ]` Add test: tier cap fetched for correct `projectOwnerUserId` → passed to `calculateAffordability` as `tierOutputCapTokens` and passed in `EnqueueModelCallParams` to `enqueueModelCall`
    * `[ ]` Add test: user is ultra tier → `output_cap_tokens = null` → null passed through to both `calculateAffordability` and `EnqueueModelCallParams`
    * `[ ]` Add test: tier cap DB query fails → warning logged, `tierOutputCapTokens = null`, `calculateAffordability` still called, `enqueueModelCall` called with `tier_output_cap_tokens: null`

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.ts`
    * `[ ]` After `projectOwnerUserId` resolution: add SELECT for `tier_definitions.output_cap_tokens` via JOIN (see `context_slice`)
    * `[ ]` Pass `tierOutputCapTokens` to `calculateAffordability()`
    * `[ ]` Pass `tier_output_cap_tokens: tierOutputCapTokens` in the `EnqueueModelCallParams` object when calling `enqueueModelCall`

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.interface.ts`
    * `[ ]` Confirm `EnqueueModelCallParams` and `CalculateAffordabilityParams` imports resolve correctly after both types gain required fields in prior nodes; update any interface types or factory types in this file that construct or wrap those params to include `tier_output_cap_tokens` / `tierOutputCapTokens` respectively

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `EnqueueModelCallParams` constructions and `tierOutputCapTokens: null` to all `CalculateAffordabilityParams` constructions — required after both types gain the new field

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.inputsRequired.test.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `EnqueueModelCallParams` constructions and `tierOutputCapTokens: null` to all `CalculateAffordabilityParams` constructions — must still pass

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.test.ts`
    * `[ ]` Update all `EnqueueModelCallParams` payload constructions in this file (the runtime values captured from spies and subsequently narrowed via `isEnqueueModelCallParams` at the assertion sites — including the narrowing at line 948) to include `tier_output_cap_tokens: null` — required so the guard narrowing succeeds after `EnqueueModelCallParams` and `isEnqueueModelCallParams` gain the required field in the `enqueueModelCall` node; without this the assertion at line 949 (`throw new Error("expected EnqueueModelCallParams")`) fires
    * `[ ]` Update all `CalculateAffordabilityParams` payload constructions in this file (runtime values captured for affordability assertions) to include `tierOutputCapTokens: null` — required after `CalculateAffordabilityParams` and `isCalculateAffordabilityParams` gain the required field in the `calculateAffordability` node
    * `[ ]` All existing assertions must still pass

  * `[ ]` supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.integration.test.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `EnqueueModelCallParams` constructions and `tierOutputCapTokens: null` to all `CalculateAffordabilityParams` constructions — must still pass
    * `[ ]` Add test: full prepareModelJob execution with mocked DB returning `output_cap_tokens = 32768` → `calculateAffordability` called with `tierOutputCapTokens = 32768`, `enqueueModelCall` called with `tier_output_cap_tokens = 32768`

* `[ ]` `[BE]` supabase/functions/dialectic-worker/enqueueModelCall **Thread tier_output_cap_tokens from EnqueueModelCallParams into AiStreamEventData**

  * `[ ]` `objective`
    * `[ ]` `prepareModelJob.ts` fetches `tier_output_cap_tokens` and passes it in `EnqueueModelCallParams`. `enqueueModelCall.ts` is the sole constructor of `AiStreamEventData` — it must include the field in the event it builds so `ai-stream-background.ts` can merge it into the adapter's `NodeModelConfig` at the Netlify boundary.

  * `[ ]` `role`
    * `[ ]` Domain service — enqueues the model call event; passes the tier cap through to the event payload without interpretation

  * `[ ]` `module`
    * `[ ]` dialectic-worker bounded context

  * `[ ]` `deps`
    * `[ ]` `prepareModelJob.ts` (prior node) — provides `tier_output_cap_tokens` via `EnqueueModelCallParams`
    * `[ ]` `types_db.ts` — `Tables<'tier_definitions'>['output_cap_tokens']`

  * `[ ]` `context_slice`
    * `[ ]` `EnqueueModelCallParams` gains `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`
    * `[ ]` `AiStreamEventData` gains `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']`
    * `[ ]` In the `eventData` constructor (line 79 of `enqueueModelCall.ts`): add `tier_output_cap_tokens: params.tier_output_cap_tokens`

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.interface.test.ts`
    * `[ ]` Add test: `EnqueueModelCallParams` shape includes `tier_output_cap_tokens` as `Tables<'tier_definitions'>['output_cap_tokens']` (number | null)
    * `[ ]` Add test: `AiStreamEventData` shape includes `tier_output_cap_tokens` as `Tables<'tier_definitions'>['output_cap_tokens']` (number | null)
    * `[ ]` Add test: valid params with `tier_output_cap_tokens: null` satisfies both interfaces
    * `[ ]` Existing contract tests for `EnqueueModelCallParams` and `AiStreamEventData` must still pass with the added field

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.interface.ts`
    * `[ ]` Add `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']` to `EnqueueModelCallParams`
    * `[ ]` Add `tier_output_cap_tokens: Tables<'tier_definitions'>['output_cap_tokens']` to `AiStreamEventData`

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.guard.test.ts`
    * `[ ]` Add test: `isAiStreamEventData()` accepts object with `tier_output_cap_tokens: null`
    * `[ ]` Add test: `isAiStreamEventData()` accepts object with `tier_output_cap_tokens: 32768` (number)
    * `[ ]` Add test: `isAiStreamEventData()` rejects object missing `tier_output_cap_tokens` field entirely
    * `[ ]` Existing `isAiStreamEventData` tests must still pass

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.guard.ts`
    * `[ ]` Add check in `isAiStreamEventData()` after existing field checks: `if (!('tier_output_cap_tokens' in v)) { return false }` then validate `typeof v.tier_output_cap_tokens === 'number' || v.tier_output_cap_tokens === null`

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.test.ts`
    * `[ ]` Add test: `tier_output_cap_tokens` present in `EnqueueModelCallParams` is included in the enqueued `AiStreamEventData`
    * `[ ]` Add test: `tier_output_cap_tokens = null` is included in the enqueued `AiStreamEventData` as null (not omitted)
    * `[ ]` Existing tests: add `tier_output_cap_tokens: null` to all `EnqueueModelCallParams` constructions — must still pass

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.ts`
    * `[ ]` Add `tier_output_cap_tokens: params.tier_output_cap_tokens` to the `eventData` object constructed at line 79

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `AiStreamEventData` and `EnqueueModelCallParams` constructions in the mock — required after both types gain the field

  * `[ ]` supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.integration.test.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `EnqueueModelCallParams` constructions — must still pass
    * `[ ]` Add test: params with `tier_output_cap_tokens = 32768` → enqueued `AiStreamEventData` carries `tier_output_cap_tokens: 32768`

* `[ ]` `[BE]` netlify/functions/ai-stream-background **Merge tier_output_cap_tokens from event into NodeModelConfig at the Netlify boundary**

  * `[ ]` `objective`
    * `[ ]` `AiStreamEvent` carries `tier_output_cap_tokens` as a top-level field alongside `model_config: NodeModelConfig`. The adapters enforce the tier cap from `this.modelConfig.tier_output_cap_tokens`. To keep `AiModelExtendedConfig` (a provider-capability type) free of user-level restrictions, `ai-stream-background.ts` merges the two at the Netlify boundary — one explicit merge point that keeps provider config and user restrictions separate upstream and unified for adapter consumption downstream.

  * `[ ]` `role`
    * `[ ]` Infrastructure adapter — receives queue events; assembles adapter config from provider data and user restrictions at the execution boundary
    * `[ ]` Must NOT propagate user-level concerns upstream into provider-facing types

  * `[ ]` `module`
    * `[ ]` ai-stream-background, Netlify execution boundary

  * `[ ]` `deps`
    * `[ ]` `enqueueModelCall.ts` (prior node) — `AiStreamEventData.tier_output_cap_tokens` flows through the queue as a top-level event field
    * `[ ]` `ai-adapter.interface.ts` — `NodeModelConfig` type update co-located here as the first consumer of the merged field
    * `[ ]` Netlify-side types declare `tier_output_cap_tokens: number | null` directly — definitions cannot cross the Deno/Vite workspace boundary, so the Supabase-side `Tables<'tier_definitions'>['output_cap_tokens']` accessor is not used here

  * `[ ]` `context_slice`
    * `[ ]` `AiStreamEvent` in `ai-stream-background.interface.ts`: add `tier_output_cap_tokens: number | null`
    * `[ ]` `NodeModelConfig` in `ai-adapter.interface.ts`: add `tier_output_cap_tokens: number | null`
    * `[ ]` In `ai-stream-background.ts` at the `getNodeAiAdapter` call: replace `modelConfig: event.model_config` with `modelConfig: { ...event.model_config, tier_output_cap_tokens: event.tier_output_cap_tokens }` — one merge point at the execution boundary

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.interface.test.ts`
    * `[ ]` Add contract test: `AiStreamEvent` shape includes `tier_output_cap_tokens` as `number | null` — validates the interface update

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.interface.ts`
    * `[ ]` Add `tier_output_cap_tokens: number | null` to `AiStreamEvent` — declared inline; no cross-workspace import of `Tables<'tier_definitions'>`

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.guard.test.ts`
    * `[ ]` Add test: guard accepts `AiStreamEvent` with `tier_output_cap_tokens` as a number
    * `[ ]` Add test: guard accepts `AiStreamEvent` with `tier_output_cap_tokens = null`
    * `[ ]` Add test: guard rejects `AiStreamEvent` with `tier_output_cap_tokens` missing entirely

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.guard.ts`
    * `[ ]` Update guard to check `tier_output_cap_tokens` is present and is `number | null`

  * `[ ]` netlify/functions/ai-stream-background/adapters/`ai-adapter.interface.test.ts`
    * `[ ]` Add contract test: `NodeModelConfig` shape includes `tier_output_cap_tokens` as `number | null`
    * `[ ]` Add test: valid `NodeModelConfig` with `tier_output_cap_tokens: null` satisfies the interface
    * `[ ]` Add test: valid `NodeModelConfig` with `tier_output_cap_tokens: 32768` (number) satisfies the interface
    * `[ ]` Existing contract tests for `NodeModelConfig` must still pass with the added field

  * `[ ]` netlify/functions/ai-stream-background/adapters/`ai-adapter.interface.ts`
    * `[ ]` Add `tier_output_cap_tokens: number | null` to `NodeModelConfig` — declared inline; no cross-workspace import of `Tables<'tier_definitions'>`

  * `[ ]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.guard.test.ts`
    * `[ ]` Add test: `isNodeModelConfig()` accepts object with `tier_output_cap_tokens: null`
    * `[ ]` Add test: `isNodeModelConfig()` accepts object with `tier_output_cap_tokens: 32768` (number)
    * `[ ]` Add test: `isNodeModelConfig()` rejects object missing `tier_output_cap_tokens` field entirely
    * `[ ]` Existing `isNodeModelConfig` tests must still pass

  * `[ ]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.guard.ts`
    * `[ ]` Add check in `isNodeModelConfig()` after existing field checks: `if (!('tier_output_cap_tokens' in v)) { return false }` then validate `typeof v['tier_output_cap_tokens'] === 'number' || v['tier_output_cap_tokens'] === null`

  * `[ ]` netlify/functions/ai-stream-background/adapters/`getNodeAiAdapter.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `NodeModelConfig` constructions in the mock — required after the interface gains the field

  * `[ ]` netlify/functions/ai-stream-background/adapters/`adapter-conformance.test-utils.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to `conformanceModelConfig` construction (line 16) — the `NodeModelConfig` literal will fail to compile without the new required field; null is the correct default (ultra behavior — no tier cap applied)

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.test.ts`
    * `[ ]` Add test: given `event.tier_output_cap_tokens = 32768`, the `NodeModelConfig` passed to `getNodeAiAdapter` contains `tier_output_cap_tokens: 32768`
    * `[ ]` Add test: given `event.tier_output_cap_tokens = null`, the `NodeModelConfig` passed to `getNodeAiAdapter` contains `tier_output_cap_tokens: null`

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.ts`
    * `[ ]` Replace `modelConfig: event.model_config` with `modelConfig: { ...event.model_config, tier_output_cap_tokens: event.tier_output_cap_tokens }` in the `getNodeAiAdapter` call

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `AiStreamEvent` constructions in the mock — required after `AiStreamEvent` gains the field in `ai-stream-background.interface.ts`

* `[ ]` `[BE]` netlify/functions/ai-stream-background/adapters/resolveOutputCap **Single binding-cap resolver shared by all node adapters**

  * `[ ]` `objective`
    * `[ ]` Three adapters (OpenAI, Anthropic, Google) currently each compute the binding output cap with their own ternary chain or if/else bifurcation. Each is a rules violation (forbidden default/fallback patterns) and each duplicates the same logic, inviting drift.
    * `[ ]` Fix: one pure function that always considers every input and returns the single binding value via one path. No ternaries, no fallbacks, no defaults. Adapters call this function once and consume the result.

  * `[ ]` `role`
    * `[ ]` Domain utility — pure cap calculation, no I/O, no provider knowledge
    * `[ ]` Must NOT contain provider-specific logic — adapters provide all inputs explicitly

  * `[ ]` `module`
    * `[ ]` netlify/functions/ai-stream-background/adapters, cross-adapter

  * `[ ]` `deps`
    * `[ ]` None (pure function)

  * `[ ]` `context_slice`
    * `[ ]` Inputs: `requestMax: number | undefined`, `hardCap: number | undefined`, `providerMax: number | undefined`, `tierCap: number | null`
    * `[ ]` Output: `number | undefined` — the minimum of all positive-number inputs; `undefined` only when no input is a positive number
    * `[ ]` One uniform operation: collect every input that is a positive number into a single list, take the minimum; the absence of positive numbers is the only case that yields `undefined`. No conditional defaults, no ternary fallback chains, no nullish coalescing — every input is always considered

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.interface.test.ts`
    * `[ ]` Contract test: `ResolveOutputCapInputs` shape includes `requestMax: number | undefined`, `hardCap: number | undefined`, `providerMax: number | undefined`, `tierCap: number | null`
    * `[ ]` Contract test: `resolveOutputCap` return type is `number | undefined`

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.interface.ts`
    * `[ ]` Declare `ResolveOutputCapInputs` with the four required fields above
    * `[ ]` Declare `ResolveOutputCapFn` as `(inputs: ResolveOutputCapInputs) => number | undefined`

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.guard.test.ts`
    * `[ ]` Add test: `isResolveOutputCapInputs` accepts a fully populated object with positive numbers
    * `[ ]` Add test: accepts `requestMax`/`hardCap`/`providerMax` as `undefined`
    * `[ ]` Add test: accepts `tierCap: null`
    * `[ ]` Add test: rejects an object missing any of the four required fields
    * `[ ]` Add test: rejects when any field is the wrong type (e.g. `tierCap: undefined`, `requestMax: null`)

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.guard.ts`
    * `[ ]` Implement `isResolveOutputCapInputs` — every field must be present and exactly conform to its declared type

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.test.ts`
    * `[ ]` Add test: all four inputs positive numbers → returns the minimum
    * `[ ]` Add test: `tierCap = 32768`, `requestMax = 50000`, `hardCap = 131072`, `providerMax = undefined` → returns 32768 (tier is binding)
    * `[ ]` Add test: `tierCap = 131072`, `hardCap = 64000`, `requestMax = undefined`, `providerMax = undefined` → returns 64000 (hard cap is binding)
    * `[ ]` Add test: `tierCap = null`, `requestMax = 50000`, `hardCap = 131072`, `providerMax = 100000` → returns 50000 (request is binding; tier disabled by null)
    * `[ ]` Add test: `tierCap = null`, all numeric inputs `undefined` → returns `undefined`
    * `[ ]` Add test: zero or negative numeric input is excluded from the minimum (treated as not-a-positive-number)
    * `[ ]` Add test: providerMax binds when smallest

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.ts`
    * `[ ]` Implement the function exactly as described in `context_slice` — one collection step, one minimum step, one return. No ternaries, no fallbacks, no nullish coalescing. The only branch permitted is "list empty → return `undefined`; list non-empty → return min".

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.mock.ts`
    * `[ ]` Provide `buildResolveOutputCapInputs(overrides?)` factory returning a fully typed `ResolveOutputCapInputs` with documented domain-approved defaults (positive numbers for all numeric fields, `tierCap: null`)

  * `[ ]` netlify/functions/ai-stream-background/adapters/`resolveOutputCap.provides.ts`
    * `[ ]` Export `resolveOutputCap`, `ResolveOutputCapInputs`, `ResolveOutputCapFn`, `isResolveOutputCapInputs`, `buildResolveOutputCapInputs`

* `[ ]` `[BE]` netlify/functions/ai-stream-background/adapters/openai **Apply binding output cap via resolveOutputCap**

  * `[ ]` `objective`
    * `[ ]` The OpenAI adapter currently bifurcates cap selection: if `request.max_tokens_to_generate` is a number it is used directly (no consideration of `hard_cap_output_tokens`, `provider_max_output_tokens`, or the tier cap); otherwise the minimum of `hard_cap` and `provider_max` is used. Two paths, conditional default — both rules-violating, and the tier cap is never considered.
    * `[ ]` Fix: delete the bifurcation. Compute the binding cap once via `resolveOutputCap` with all four inputs (`requestMax`, `hardCap`, `providerMax`, `tierCap`). Pass the result to `applyCap` once. The tier cap is one input to one calculation, applied unconditionally.

  * `[ ]` `role`
    * `[ ]` Infrastructure adapter — calls OpenAI API; enforces the binding output cap at the provider boundary

  * `[ ]` `module`
    * `[ ]` ai-stream-background, OpenAI adapter

  * `[ ]` `deps`
    * `[ ]` `resolveOutputCap.provides.ts` (prior node) — provides the resolver function
    * `[ ]` `ai-stream-background.ts` (prior node) — `NodeModelConfig.tier_output_cap_tokens` is defined in `ai-adapter.interface.ts` and populated by the merge in `ai-stream-background.ts`; the adapter reads it from the `modelConfig` parameter

  * `[ ]` `context_slice`
    * `[ ]` Replace the entire if/else cap-selection block (currently the request-vs-fallback bifurcation surrounding `applyCap`) with a single call: `const cap = resolveOutputCap({ requestMax: request.max_tokens_to_generate, hardCap: modelConfig.hard_cap_output_tokens, providerMax: modelConfig.provider_max_output_tokens, tierCap: modelConfig.tier_output_cap_tokens })`
    * `[ ]` Then: `if (cap !== undefined) { applyCap(cap) }` — one call site, one path. `applyCap`'s internal write logic (legacy vs current OpenAI fields) is unchanged.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.interface.test.ts`
    * `[ ]` Audit: confirm the OpenAI adapter's own interface types do not redeclare `tier_output_cap_tokens` — the field travels via `NodeModelConfig` (covered by the `ai-adapter.interface.ts` node). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.interface.ts`
    * `[ ]` Audit: same confirmation as the interface test. The adapter's own intermediate types consume the cap through `modelConfig: NodeModelConfig`; no field is owned here. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.guard.test.ts`
    * `[ ]` Audit: confirm the adapter's guards delegate `modelConfig` shape validation to `isNodeModelConfig` (covered upstream). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.guard.ts`
    * `[ ]` Audit: same delegation confirmation. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.test.ts`
    * `[ ]` Tests construct `NodeModelConfig` with `tier_output_cap_tokens` explicitly set — confirms the field is consumed via `resolveOutputCap`, not silently ignored
    * `[ ]` Add test: `tier_output_cap_tokens = 32768`, `max_tokens_to_generate = 50000`, hard cap = 131072 → outbound payload max field = 32768 (tier is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, `max_tokens_to_generate = 50000`, hard cap = 131072 → outbound payload max field = 50000 (request is binding when tier disabled)
    * `[ ]` Add test: `tier_output_cap_tokens = 131072`, hard cap = 64000, no request value → outbound payload max field = 64000 (hard cap is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, no request value, hard cap = `undefined`, provider max = `undefined` → no max field set on payload (`resolveOutputCap` returned `undefined`)
    * `[ ]` Update existing tests: every existing test that constructs a `NodeModelConfig` literal must include `tier_output_cap_tokens` (typically `null` for unrelated assertions); existing assertions must still pass

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.ts`
    * `[ ]` Replace the if/else cap-selection block with a single `resolveOutputCap` call followed by a single `applyCap` invocation guarded only by `cap !== undefined`
    * `[ ]` Import `resolveOutputCap` from `../resolveOutputCap.provides.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to every `NodeModelConfig` literal constructed in the mock (factory base values and any standalone literals) — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.provides.ts`
    * `[ ]` Audit the public surface — no new exports required; the adapter consumes `resolveOutputCap` internally and does not re-export it. Confirm and leave unchanged if so.

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.integration.test.ts`
    * `[ ]` Update every `NodeModelConfig` literal constructed in this file to include `tier_output_cap_tokens` (typically `null` for tests where the tier is not the variable under test) — required so the file compiles after the field becomes required
    * `[ ]` Add integration test: bounded subsystem run with `tier_output_cap_tokens = 32768` and a request value of 50000 produces an outbound OpenAI payload whose max field equals 32768 — proves the resolver-driven path binds end-to-end within the adapter

  * `[ ]` netlify/functions/ai-stream-background/adapters/openai/`openai.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `NodeModelConfig` constructions in the mock — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

* `[ ]` `[BE]` netlify/functions/ai-stream-background/adapters/anthropic **Apply binding output cap via resolveOutputCap**

  * `[ ]` `objective`
    * `[ ]` The Anthropic adapter currently selects `maxTokensForPayload` via a nested `const` ternary chain — a forbidden default/fallback pattern — and never considers the tier cap.
    * `[ ]` Fix: delete the ternary chain. Compute `maxTokensForPayload` once via `resolveOutputCap` with all four inputs (`requestMax`, `hardCap`, `providerMax: undefined`, `tierCap`). The result feeds the existing `prepared` return shape unchanged downstream.

  * `[ ]` `role`
    * `[ ]` Infrastructure adapter — calls Anthropic API; enforces the binding output cap at the provider boundary

  * `[ ]` `module`
    * `[ ]` ai-stream-background, Anthropic adapter

  * `[ ]` `deps`
    * `[ ]` `resolveOutputCap.provides.ts` (prior node) — provides the resolver function
    * `[ ]` `ai-stream-background.ts` (prior node) — `NodeModelConfig.tier_output_cap_tokens` is defined in `ai-adapter.interface.ts` and populated by the merge in `ai-stream-background.ts`; the adapter reads it from the `modelConfig` parameter

  * `[ ]` `context_slice`
    * `[ ]` Replace the entire `const maxTokensForPayload: number | undefined = ... ternary ...` block with: `const maxTokensForPayload: number | undefined = resolveOutputCap({ requestMax: typeof request.max_tokens_to_generate === 'number' ? request.max_tokens_to_generate : undefined, hardCap: typeof modelConfig.hard_cap_output_tokens === 'number' ? modelConfig.hard_cap_output_tokens : undefined, providerMax: undefined, tierCap: modelConfig.tier_output_cap_tokens })`
    * `[ ]` The `typeof X === 'number' ? X : undefined` shape is normalization at the boundary, not a default — it converts non-number values into the `undefined` slot the resolver requires. The resolver itself remains the single binding-cap path.
    * `[ ]` Downstream return shape (`{ modelApiName, systemPrompt, anthropicMessages, maxTokensForPayload }`) is unchanged

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.interface.test.ts`
    * `[ ]` Audit: confirm the Anthropic adapter's own interface types do not redeclare `tier_output_cap_tokens` — the field travels via `NodeModelConfig` (covered by the `ai-adapter.interface.ts` node). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.interface.ts`
    * `[ ]` Audit: same confirmation as the interface test. The adapter's own intermediate types (e.g. `prepared` return shape) consume the cap through `modelConfig: NodeModelConfig`; no field is owned here. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.guard.test.ts`
    * `[ ]` Audit: confirm the adapter's guards delegate `modelConfig` shape validation to `isNodeModelConfig` (covered upstream). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.guard.ts`
    * `[ ]` Audit: same delegation confirmation. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.test.ts`
    * `[ ]` Tests construct `NodeModelConfig` with `tier_output_cap_tokens` explicitly set — confirms the field is consumed via `resolveOutputCap`, not silently ignored
    * `[ ]` Add test: `tier_output_cap_tokens = 32768`, request value = 50000, hard cap = 131072 → `maxTokensForPayload = 32768` (tier is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, request value = 50000, hard cap = 131072 → `maxTokensForPayload = 50000` (request is binding when tier disabled)
    * `[ ]` Add test: `tier_output_cap_tokens = 131072`, hard cap = 64000, no request value → `maxTokensForPayload = 64000` (hard cap is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, no request value, no hard cap → `maxTokensForPayload = undefined`
    * `[ ]` Update existing tests: every existing test that constructs a `NodeModelConfig` literal must include `tier_output_cap_tokens` (typically `null` for unrelated assertions); existing assertions must still pass

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.ts`
    * `[ ]` Replace the ternary `const maxTokensForPayload` declaration with a single `resolveOutputCap` call as described in `context_slice`
    * `[ ]` Import `resolveOutputCap` from `../resolveOutputCap.provides.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to every `NodeModelConfig` literal constructed in the mock (factory base values and any standalone literals) — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.provides.ts`
    * `[ ]` Audit the public surface — no new exports required; the adapter consumes `resolveOutputCap` internally and does not re-export it. Confirm and leave unchanged if so.

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.integration.test.ts`
    * `[ ]` Update every `NodeModelConfig` literal constructed in this file to include `tier_output_cap_tokens` (typically `null` for tests where the tier is not the variable under test) — required so the file compiles after the field becomes required
    * `[ ]` Add integration test: bounded subsystem run with `tier_output_cap_tokens = 32768` and a request value of 50000 produces an outbound Anthropic payload whose `max_tokens` equals 32768 — proves the resolver-driven path binds end-to-end within the adapter

  * `[ ]` netlify/functions/ai-stream-background/adapters/anthropic/`anthropic.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `NodeModelConfig` constructions in the mock — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

* `[ ]` `[BE]` netlify/functions/ai-stream-background/adapters/google **Apply binding output cap via resolveOutputCap**

  * `[ ]` `objective`
    * `[ ]` The Google adapter currently selects the cap via three nested `const` ternaries (`clientCap`, `cap`, then `generationConfig`) — multiple forbidden default/fallback patterns — and never considers the tier cap.
    * `[ ]` Fix: delete all three ternaries. Compute the binding cap once via `resolveOutputCap` with all four inputs (`requestMax`, `hardCap`, `providerMax: undefined`, `tierCap`). Construct `generationConfig` once from the result.

  * `[ ]` `role`
    * `[ ]` Infrastructure adapter — calls Google Gemini API; enforces the binding output cap at the provider boundary

  * `[ ]` `module`
    * `[ ]` ai-stream-background, Google adapter

  * `[ ]` `deps`
    * `[ ]` `resolveOutputCap.provides.ts` (prior node) — provides the resolver function
    * `[ ]` `ai-stream-background.ts` (prior node) — `NodeModelConfig.tier_output_cap_tokens` is defined in `ai-adapter.interface.ts` and populated by the merge in `ai-stream-background.ts`; the adapter reads it from the `modelConfig` parameter

  * `[ ]` `context_slice`
    * `[ ]` Replace the `const clientCap` / `const modelHardCap` / `const cap` / `const generationConfig` ternary chain with: `const cap: number | undefined = resolveOutputCap({ requestMax: typeof request.max_tokens_to_generate === 'number' ? request.max_tokens_to_generate : undefined, hardCap: typeof modelConfig.hard_cap_output_tokens === 'number' ? modelConfig.hard_cap_output_tokens : undefined, providerMax: undefined, tierCap: modelConfig.tier_output_cap_tokens })` followed by `const generationConfig: { maxOutputTokens: number } | undefined = cap === undefined ? undefined : { maxOutputTokens: cap }`
    * `[ ]` The `typeof X === 'number' ? X : undefined` shape is normalization at the boundary, not a default — it converts non-number values into the `undefined` slot the resolver requires. The resolver itself remains the single binding-cap path.
    * `[ ]` The `cap === undefined ? undefined : { maxOutputTokens: cap }` is structural construction of the optional Google config object from the resolved cap — the cap value is not defaulted; the object is either constructed once or omitted once based on whether the resolver returned a value.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.interface.test.ts`
    * `[ ]` Audit: confirm the Google adapter's own interface types do not redeclare `tier_output_cap_tokens` — the field travels via `NodeModelConfig` (covered by the `ai-adapter.interface.ts` node). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.interface.ts`
    * `[ ]` Audit: same confirmation as the interface test. The adapter's own intermediate types consume the cap through `modelConfig: NodeModelConfig`; no field is owned here. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.guard.test.ts`
    * `[ ]` Audit: confirm the adapter's guards delegate `modelConfig` shape validation to `isNodeModelConfig` (covered upstream). No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.guard.ts`
    * `[ ]` Audit: same delegation confirmation. No change required if the audit confirms this.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.test.ts`
    * `[ ]` Tests construct `NodeModelConfig` with `tier_output_cap_tokens` explicitly set — confirms the field is consumed via `resolveOutputCap`, not silently ignored
    * `[ ]` Add test: `tier_output_cap_tokens = 32768`, request value = 50000, hard cap = 131072 → `generationConfig.maxOutputTokens = 32768` (tier is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, request value = 50000, hard cap = 131072 → `generationConfig.maxOutputTokens = 50000` (request is binding when tier disabled)
    * `[ ]` Add test: `tier_output_cap_tokens = 131072`, hard cap = 64000, no request value → `generationConfig.maxOutputTokens = 64000` (hard cap is binding)
    * `[ ]` Add test: `tier_output_cap_tokens = null`, no request value, no hard cap → `generationConfig = undefined`
    * `[ ]` Update existing tests: every existing test that constructs a `NodeModelConfig` literal must include `tier_output_cap_tokens` (typically `null` for unrelated assertions); existing assertions must still pass

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.ts`
    * `[ ]` Replace the `clientCap`/`modelHardCap`/`cap`/`generationConfig` ternary chain with the `resolveOutputCap` call and single `generationConfig` construction described in `context_slice`
    * `[ ]` Import `resolveOutputCap` from `../resolveOutputCap.provides.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to every `NodeModelConfig` literal constructed in the mock (factory base values and any standalone literals) — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.provides.ts`
    * `[ ]` Audit the public surface — no new exports required; the adapter consumes `resolveOutputCap` internally and does not re-export it. Confirm and leave unchanged if so.

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.integration.test.ts`
    * `[ ]` Update every `NodeModelConfig` literal constructed in this file to include `tier_output_cap_tokens` (typically `null` for tests where the tier is not the variable under test) — required so the file compiles after the field becomes required
    * `[ ]` Add integration test: bounded subsystem run with `tier_output_cap_tokens = 32768` and a request value of 50000 produces an outbound Google payload whose `generationConfig.maxOutputTokens` equals 32768 — proves the resolver-driven path binds end-to-end within the adapter

  * `[ ]` netlify/functions/ai-stream-background/adapters/google/`google.mock.ts`
    * `[ ]` Add `tier_output_cap_tokens: null` to all `NodeModelConfig` constructions in the mock — required after `NodeModelConfig` gains the field in `ai-adapter.interface.ts`

  * `[ ]` netlify/functions/ai-stream-background/`ai-stream-background.integration.test.ts` (add to existing or create)
    * `[ ]` Integration test: user with `output_cap_tokens = 32768`, model `hard_cap_output_tokens = 131072`, wallet budget sufficient for 200000 tokens
      * Affordability calc output: `maxOutputTokens = 32768` (tier is binding — confirms upstream enforcement)
      * All three adapter instances: given `max_tokens_to_generate = 50000` (simulating slider malfunction) and `tier_output_cap_tokens = 32768`, each adapter caps the outbound provider request at 32768

  * `[ ]` **Commit** `feat(output-cap-tiers): thread tier output cap from user subscription through affordability calc and into provider adapters`
    * `[ ]` `affordability_utils.ts`: `getMaxOutputTokens()` enforces tier cap as explicit conditional; null = no limit from tier (ultra)
    * `[ ]` `calculateAffordability.interface.ts`: `CalculateAffordabilityParams` gains `tierOutputCapTokens`; `calculateAffordability.ts` threads it to `getMaxOutputTokens()`; `calculateAffordability.interface.test.ts`, `calculateAffordability.mock.ts`, `calculateAffordability.integration.test.ts` updated; `processSimpleJob.integration.test.ts`, `createJobContext/JobContext.mock.ts`, `createJobContext/createJobContext.ts`, `createJobContext/createJobContext.test.ts` updated as consumers
    * `[ ]` `prepareModelJob.ts`: fetches `tier_definitions.output_cap_tokens` from DB after resolving project owner; passes to `calculateAffordability`; passes `tier_output_cap_tokens` in `EnqueueModelCallParams` to `enqueueModelCall`; `prepareModelJob.interface.ts`, `prepareModelJob.mock.ts`, `prepareModelJob.inputsRequired.test.ts`, `prepareModelJob.integration.test.ts` updated
    * `[ ]` `enqueueModelCall.interface.ts`: `EnqueueModelCallParams` and `AiStreamEventData` gain `tier_output_cap_tokens` (typed from row type); `enqueueModelCall.ts` includes the field in the enqueued event; `enqueueModelCall.interface.test.ts`, `enqueueModelCall.guard.ts`, `enqueueModelCall.guard.test.ts`, `enqueueModelCall.mock.ts`, `enqueueModelCall.integration.test.ts` updated
    * `[ ]` `ai-stream-background.interface.ts`: `AiStreamEvent` gains `tier_output_cap_tokens: number | null` (declared inline; no cross-workspace import); guard updated; `ai-stream-background.ts` merges it into `NodeModelConfig` at the Netlify boundary; `ai-stream-background.mock.ts` updated
    * `[ ]` `ai-adapter.interface.ts`: `NodeModelConfig` gains `tier_output_cap_tokens: number | null` (declared inline; no cross-workspace import); `ai-adapter.interface.test.ts`, `getNodeAiAdapter.guard.ts`, `getNodeAiAdapter.guard.test.ts`, `getNodeAiAdapter.mock.ts`, `adapter-conformance.test-utils.ts` updated
    * `[ ]` OpenAI, Anthropic, Google adapters: explicit conditional tier cap enforcement at provider boundary (belt-and-suspenders); null = tier cap not applied; `openai.mock.ts`, `anthropic.mock.ts`, `google.mock.ts` updated

* `[ ]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionUpdated **Derive p_set_ratchet from subscription transition instead of hardcoded false**

  * `[ ]` `objective`
    * `[ ]` Prior completion of this handler hardcodes `p_set_ratchet: false` at the `update_subscription_with_tier` RPC call site. Hardcoded values defeat the purpose of the parameter — variables must depend on real inputs.
    * `[ ]` Fix: derive `p_set_ratchet` at the call site from real Stripe-event inputs. For `customer.subscription.updated`, the correct derivation is: `p_set_ratchet = (subscription.status IN ('active', 'trialing') AND resolvedPlanTierLevel > 0)`. Active or trialing transitions onto a paid plan set the ratchet; status changes to `past_due`, transitions to free plans, and other movements do not.
    * `[ ]` This is a code-hygiene fix — the value is functionally `false` in current Stripe flows because upgrades require checkout (which routes through `complete_checkout_payment` and sets the ratchet there). The change makes the call site self-documenting and robust to future Stripe flow changes (e.g. customer-portal upgrades).

  * `[ ]` `role`
    * `[ ]` Adapter handler — Stripe-specific webhook processing

  * `[ ]` `module`
    * `[ ]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * `[ ]` `deps`
    * `[ ]` `update_subscription_with_tier` RPC (already deployed)
    * `[ ]` Internal plan resolution (already in handler) — provides `tier_level` for the resolved plan

  * `[ ]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.test.ts`
    * `[ ]` Add test: subscription transitions to `active` on a plan with `tier_level > 0` → RPC called with `p_set_ratchet = true`
    * `[ ]` Add test: subscription transitions to `past_due` on a paid plan → RPC called with `p_set_ratchet = false`
    * `[ ]` Add test: subscription transitions to free plan (`tier_level = 0`) → RPC called with `p_set_ratchet = false`
    * `[ ]` Update existing tests that asserted `p_set_ratchet: false` to use the derived expression

  * `[ ]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.ts`
    * `[ ]` Replace the literal `p_set_ratchet: false` at the RPC call with a derived value computed from `subscription.status` and the resolved plan's `tier_level`. Compute into a local typed variable above the RPC call for readability, then pass that variable.

  * `[ ]` Create supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionUpdated.integration.test.ts` — exercises the derived ratchet against the real `update_subscription_with_tier` RPC:
    * `[ ]` Test: subscription transitions to `active` on a paid plan for a user with `has_ever_paid = false` → derived `p_set_ratchet = true` → after RPC, `user_subscriptions.has_ever_paid = true` and `tier_level` reflects the new plan
    * `[ ]` Test: subscription transitions to `past_due` on a paid plan → derived `p_set_ratchet = false` → `has_ever_paid` preserved, `tier_level` recomputed via `current_plan_tier`
    * `[ ]` Test: subscription transitions to free plan → derived `p_set_ratchet = false` → `has_ever_paid` preserved, `tier_level` recomputes (basic for paid-before users, free otherwise)

* `[ ]` `[BE]` supabase/functions/_shared/adapters/stripe/handlers/stripe.subscriptionDeleted **Derive p_set_ratchet from subscription transition instead of hardcoded false**

  * `[ ]` `objective`
    * `[ ]` `stripe.subscriptionDeleted.ts` hardcodes `p_set_ratchet: false` at the `update_subscription_with_tier` RPC call site. Same code-hygiene rule as the `subscriptionUpdated` node: variables must depend on real inputs; hardcoded literals at parameterized call sites defeat the parameter.
    * `[ ]` Fix: replace the literal with a derivation from real Stripe-event inputs. The semantic rule is: ratchet always runs (`refresh_user_tier` recomputes the tier on every transition); `p_set_ratchet` controls whether `has_ever_paid` is set on THIS event. Cancellation is never a payment event, so the derivation evaluates to `false` — but expressing it as a derivation from the event type (rather than as an unexplained literal) makes the call site self-documenting and robust to future Stripe flow changes.

  * `[ ]` `role`
    * `[ ]` Adapter handler — Stripe-specific webhook processing

  * `[ ]` `module`
    * `[ ]` Stripe adapter, within `_shared/adapters/stripe/handlers/`

  * `[ ]` `deps`
    * `[ ]` `update_subscription_with_tier` RPC (already deployed)

  * `[ ]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.test.ts`
    * `[ ]` Update existing tests that asserted `p_set_ratchet: false` to assert the derived expression resolves to `false` for the deletion path
    * `[ ]` Add test: derived value is computed from the event type and is not a literal at the RPC call site

  * `[ ]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.ts`
    * `[ ]` Replace the literal `p_set_ratchet: false` with a derived value computed from the event semantics (cancellation event ⇒ `false`). Compute into a local typed variable above the RPC call for readability, then pass that variable. The value's provenance must be visible at the call site rather than appearing as an unexplained literal.

  * `[ ]` supabase/functions/_shared/adapters/stripe/handlers/`stripe.subscriptionDeleted.integration.test.ts` (exists — update)
    * `[ ]` Add test: paid user with active subscription deleted → derived `p_set_ratchet = false` → after RPC, `has_ever_paid = true` preserved, `tier_level = 10` (basic, via `current_plan_tier` ratchet behavior), `status = 'canceled'`
    * `[ ]` Add test: user who never paid with subscription deleted (edge case) → derived `p_set_ratchet = false` → `has_ever_paid = false` preserved, `tier_level = 0` (free)

* `[ ]` `[CONFIG]` supabase/scripts/update-seed **Re-run after tier-infrastructure migration to keep seed.sql in sync**

  * `[ ]` `objective`
    * `[ ]` Tier-infrastructure migration adds `tier_definitions` table, `subscription_plans.tier_level`, `user_subscriptions.has_ever_paid` + `tier_level`, `ai_providers.min_plan_tier_level`, and backfills all of them. Current `seed.sql` does not reflect these columns or values. Local devs / CI bring-ups will see schema drift between the migrated DB and `seed.sql`.
    * `[ ]` Fix: after the tier-infrastructure migration is applied locally, re-run `update-seed.ts` to regenerate `seed.sql` with the new columns and backfill values populated. This is a generation step, not a code change.

  * `[ ]` `role`
    * `[ ]` Operations — seed regeneration

  * `[ ]` `module`
    * `[ ]` supabase/scripts (no code change to update-seed.ts itself)

  * `[ ]` `deps`
    * `[ ]` Tier infrastructure migration (completed earlier in this checklist)
    * `[ ]` Stream 1 seed regeneration (completed) — that pass did not include tier columns because the migration had not yet been applied
    * `[ ]` `supabase/scripts/update-seed.ts` (no changes needed)

  * `[ ]` Apply tier-infrastructure migration to local DB; run `update-seed.ts`; inspect regenerated `seed.sql`
    * `[ ]` Verify `tier_definitions` rows are present (level 0/10/20/30 with seeded names and caps)
    * `[ ]` Verify `subscription_plans` rows include `tier_level` populated by backfill (free → 0, others → 10 unless manually upgraded)
    * `[ ]` Verify `user_subscriptions` rows include `has_ever_paid` and `tier_level` populated by backfill
    * `[ ]` Verify `ai_providers` rows include `min_plan_tier_level` populated by cost-band backfill (0/10/20)

  * `[ ]` **Commit** `chore(seed): regenerate seed.sql with tier-infrastructure columns and backfill values`

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