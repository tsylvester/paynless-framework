-- Migration: fix_grant_initial_free_tokens_function
-- Purpose: Corrects the public.grant_initial_free_tokens_to_user function
--          to properly call public.record_token_transaction with matching parameter names and types.

BEGIN;

-- Re-Create helper function public.grant_initial_free_tokens_to_user
-- with the corrected call to public.record_token_transaction.
CREATE OR REPLACE FUNCTION public.grant_initial_free_tokens_to_user(
    p_user_id uuid,
    p_free_plan_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tokens_to_award NUMERIC;
    v_target_wallet_id uuid;
    v_system_user_id uuid;
BEGIN
    -- Get system user ID from _vars temp table (expected to be created by calling script/migration)
    BEGIN
        SELECT system_user_id INTO v_system_user_id FROM _vars LIMIT 1;
        IF v_system_user_id IS NULL THEN
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] System user ID is not set in _vars. This table should be populated by the calling migration.';
        END IF;
    EXCEPTION
        WHEN undefined_table THEN -- _vars table does not exist
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] _vars temp table not found. It must be created and populated with system_user_id by the calling migration.';
    END;

    -- Get tokens_to_award from the free plan
    SELECT tokens_to_award INTO v_tokens_to_award
    FROM public.subscription_plans
    WHERE id = p_free_plan_id AND name = 'Free';

    IF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Free plan ID % (user %) not found or has no tokens to award.', p_free_plan_id, p_user_id;
        RETURN;
    END IF;

    -- Get the user's wallet ID
    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = p_user_id AND organization_id IS NULL;

    IF v_target_wallet_id IS NULL THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Token wallet not found for user ID %.', p_user_id;
        RETURN;
    END IF;

    -- Corrected call to public.record_token_transaction:
    PERFORM public.record_token_transaction(
        p_wallet_id := v_target_wallet_id,
        p_transaction_type := 'CREDIT_INITIAL_FREE_ALLOCATION',
        p_input_amount_text := v_tokens_to_award::TEXT, -- Corrected parameter name and cast to TEXT
        p_recorded_by_user_id := v_system_user_id,
        p_idempotency_key := 'initial_free_' || p_user_id::text || '_' || p_free_plan_id::text,
        p_related_entity_id := p_free_plan_id::VARCHAR, -- Corrected: Cast UUID to VARCHAR
        p_related_entity_type := 'subscription_plans',
        p_notes := 'Initial token allocation for new free plan user.',
        p_payment_transaction_id := NULL -- Explicitly pass NULL as it's not a payment-related direct grant
    );

    RAISE LOG '[grant_initial_free_tokens_to_user] Successfully called record_token_transaction for user % (tokens: %).', p_user_id, v_tokens_to_award;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Error awarding tokens to user %: %', p_user_id, SQLERRM;
        -- Do not re-throw, allow calling script to handle or continue if in a loop.
END;
$$;

COMMENT ON FUNCTION public.grant_initial_free_tokens_to_user(uuid, uuid) IS 'CORRECTED VERSION. Grants initial tokens to a new user for the free plan by calling record_token_transaction, using system_user_id from _vars.';

COMMIT;
