-- Migration: fix_backfill_conditions_v2 (Definitive Token Backfill)
-- Purpose: Grant initial 100k tokens to existing free users who have not yet received them.
-- This script calls the corrected public.grant_initial_free_tokens_to_user function.
-- It relies on:
--   - The system user created in auth.users (by migration 20250520154343).
--   - The 'Free' plan being configured in subscription_plans (by migration 20250520154343).
--   - The public.grant_initial_free_tokens_to_user(uuid, uuid) function being corrected 
--     (by migration 20250520160954_fix_backfill_conditions.sql).

BEGIN;

-- 1. Define _vars and populate system_user_id
-- This step is crucial as public.grant_initial_free_tokens_to_user expects _vars to exist.
DO $$
DECLARE
  v_system_user_id uuid;
BEGIN
  SELECT id INTO v_system_user_id
  FROM auth.users
  WHERE email LIKE 'system-token-allocator-%%@internal.app' -- Match the pattern from system user creation
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_system_user_id IS NULL THEN
    RAISE EXCEPTION '[Token Backfill v2] System user (email pattern system-token-allocator-...@internal.app) not found. Cannot proceed.';
  END IF;

  DROP TABLE IF EXISTS _vars;
  CREATE TEMP TABLE _vars (system_user_id uuid PRIMARY KEY);
  INSERT INTO _vars (system_user_id) VALUES (v_system_user_id);
  RAISE LOG '[Token Backfill v2] Using system_user_id: % for token backfill.', v_system_user_id;
END $$;

-- 2. Perform the backfill logic for existing free users who haven't received tokens
DO $$
DECLARE
    user_rec RECORD;
    v_free_plan_id uuid;
    v_free_plan_tokens_to_award NUMERIC;
    v_allocation_count INTEGER := 0;
    v_processed_count INTEGER := 0;
BEGIN
    RAISE LOG '[Token Backfill v2] Starting definitive backfill of initial tokens for existing free users...';

    SELECT id, tokens_to_award INTO v_free_plan_id, v_free_plan_tokens_to_award
    FROM public.subscription_plans
    WHERE name = 'Free' AND item_id_internal = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'
    LIMIT 1;

    IF v_free_plan_id IS NULL THEN
        RAISE WARNING '[Token Backfill v2] Crucial Error: ''Free'' plan not found. Cannot perform token backfill.';
        RETURN;
    END IF;

    IF v_free_plan_tokens_to_award IS NULL OR v_free_plan_tokens_to_award <= 0 THEN
        RAISE WARNING '[Token Backfill v2] Crucial Error: ''Free'' plan (ID: %) has no tokens_to_award. Cannot perform token backfill.', v_free_plan_id;
        RETURN;
    END IF;

    RAISE LOG '[Token Backfill v2] Identified Free Plan ID: %. Tokens to Award: %', v_free_plan_id, v_free_plan_tokens_to_award;

    FOR user_rec IN
        SELECT us.user_id, tw.wallet_id
        FROM public.user_subscriptions us
        JOIN public.token_wallets tw ON us.user_id = tw.user_id AND tw.organization_id IS NULL
        WHERE us.plan_id = v_free_plan_id AND us.status = 'free'
    LOOP
        v_processed_count := v_processed_count + 1;
        IF NOT EXISTS (
            SELECT 1
            FROM public.token_wallet_transactions twt
            WHERE twt.wallet_id = user_rec.wallet_id
            AND twt.transaction_type IN ('CREDIT_INITIAL_FREE_ALLOCATION', 'CREDIT_MONTHLY_FREE_ALLOCATION')
        ) THEN
            RAISE LOG '[Token Backfill v2] User ID % (Wallet ID: %) is eligible. Attempting grant...', user_rec.user_id, user_rec.wallet_id;
            BEGIN
                PERFORM public.grant_initial_free_tokens_to_user(user_rec.user_id, v_free_plan_id);
                v_allocation_count := v_allocation_count + 1;
                RAISE LOG '[Token Backfill v2] Successfully called grant for user ID %', user_rec.user_id;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING '[Token Backfill v2] Error during grant for user ID % (Wallet ID: %): %', user_rec.user_id, user_rec.wallet_id, SQLERRM;
            END;
        ELSE
            RAISE LOG '[Token Backfill v2] User ID % (Wallet ID: %) already has free token allocations. Skipping.', user_rec.user_id, user_rec.wallet_id;
        END IF;
    END LOOP;

    RAISE LOG '[Token Backfill v2] Finished. Users checked: %. Users granted tokens this run: %', v_processed_count, v_allocation_count;
END $$;

DROP TABLE IF EXISTS _vars; -- Clean up temp table

COMMIT;
