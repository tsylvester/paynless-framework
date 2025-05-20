-- Migration: backfill_tokens_for_existing_users
-- Purpose: Grant initial 100k tokens to existing free users who have not yet received them.
-- This script relies on functions and configurations set up by the
-- '20250520154343_token_allocation_for_new_users.sql' migration, including:
--   - The system user created in auth.users.
--   - The 'Free' plan being configured with tokens_awarded in subscription_plans.
--   - The existence of public.grant_initial_free_tokens_to_user(user_id, free_plan_id) function.

BEGIN;

-- 1. Define _vars and populate system_user_id
-- We need to find the system user that should have been created by the previous migration.
DO $$
DECLARE
  v_system_user_id uuid;
BEGIN
  SELECT id INTO v_system_user_id
  FROM auth.users
  WHERE email LIKE 'system-token-allocator-%%@internal.app' -- Match the pattern used in the previous migration
  ORDER BY created_at DESC -- In case (unlikely) multiple were created, take the latest one
  LIMIT 1;

  IF v_system_user_id IS NULL THEN
    RAISE EXCEPTION '[Token Backfill] System user (email pattern system-token-allocator-...@internal.app) not found. This backfill relies on the system user created by a previous migration. Cannot proceed.';
  END IF;

  -- Create the _vars temp table for the current session, as public.grant_initial_free_tokens_to_user expects it.
  DROP TABLE IF EXISTS _vars;
  CREATE TEMP TABLE _vars (system_user_id uuid PRIMARY KEY);
  INSERT INTO _vars (system_user_id) VALUES (v_system_user_id);
  RAISE LOG '[Token Backfill] Using system_user_id: % for token backfill operations.', v_system_user_id;
END $$;

-- 2. Perform the backfill logic for existing free users
DO $$
DECLARE
    user_rec RECORD;
    v_free_plan_id uuid;
    v_free_plan_tokens_awarded NUMERIC;
    v_allocation_count INTEGER := 0;
    v_processed_count INTEGER := 0;
BEGIN
    RAISE LOG '[Token Backfill] Starting backfill of initial tokens for existing free users...';

    -- Get Free Plan details (ID and tokens_awarded)
    SELECT id, tokens_awarded INTO v_free_plan_id, v_free_plan_tokens_awarded
    FROM public.subscription_plans
    WHERE name = 'Free' AND item_id_internal = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE' -- Match configured free plan
    LIMIT 1;

    IF v_free_plan_id IS NULL THEN
        RAISE WARNING '[Token Backfill] Crucial Error: ''Free'' plan with item_id_internal = ''SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'' not found. Cannot perform token backfill.';
        RETURN; -- Exit this DO block
    END IF;

    IF v_free_plan_tokens_awarded IS NULL OR v_free_plan_tokens_awarded <= 0 THEN
        RAISE WARNING '[Token Backfill] Crucial Error: ''Free'' plan (ID: %) has no tokens_awarded configured or is zero. Cannot perform token backfill.', v_free_plan_id;
        RETURN; -- Exit this DO block
    END IF;

    RAISE LOG '[Token Backfill] Identified Free Plan ID: %. Tokens to Award per user: %', v_free_plan_id, v_free_plan_tokens_awarded;

    -- Loop through users who are on the free plan
    FOR user_rec IN
        SELECT us.user_id, tw.wallet_id
        FROM public.user_subscriptions us
        JOIN public.token_wallets tw ON us.user_id = tw.user_id AND tw.organization_id IS NULL -- Ensure it's a user wallet
        WHERE us.plan_id = v_free_plan_id AND us.status = 'free'
    LOOP
        v_processed_count := v_processed_count + 1;
        -- Check if this user has ever received any free token allocation
        IF NOT EXISTS (
            SELECT 1
            FROM public.token_wallet_transactions twt
            WHERE twt.wallet_id = user_rec.wallet_id
            AND twt.transaction_type IN ('CREDIT_INITIAL_FREE_ALLOCATION', 'CREDIT_MONTHLY_FREE_ALLOCATION')
        ) THEN
            RAISE LOG '[Token Backfill] User ID % (Wallet ID: %) is eligible for initial token backfill. Attempting grant...', user_rec.user_id, user_rec.wallet_id;
            BEGIN
                -- Call the grant function defined in the previous migration.
                -- This function uses _vars.system_user_id internally.
                PERFORM public.grant_initial_free_tokens_to_user(user_rec.user_id, v_free_plan_id);
                v_allocation_count := v_allocation_count + 1;
                RAISE LOG '[Token Backfill] Successfully called grant for user ID %', user_rec.user_id;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING '[Token Backfill] Error during grant_initial_free_tokens_to_user for user ID % (Wallet ID: %): %', user_rec.user_id, user_rec.wallet_id, SQLERRM;
                    -- Continue to the next user if one fails
            END;
        ELSE
            RAISE LOG '[Token Backfill] User ID % (Wallet ID: %) already has previous free token allocations. Skipping backfill.', user_rec.user_id, user_rec.wallet_id;
        END IF;
    END LOOP;

    RAISE LOG '[Token Backfill] Finished processing. Total free users checked: %. Users granted initial tokens in this run: %', v_processed_count, v_allocation_count;
END $$;


DROP TABLE IF EXISTS _vars; -- Clean up temp table

COMMIT;
