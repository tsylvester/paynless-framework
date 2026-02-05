-- Migration: Reset existing users with less than 1M tokens to 1M tokens
-- This is a one-time data fix to ensure all existing users benefit from the updated token allocation

DO $$
DECLARE
    v_system_user_id UUID;
    v_wallet RECORD;
    v_tokens_to_add NUMERIC;
    v_new_balance NUMERIC;
    v_target_balance NUMERIC := 1000000;
    v_idempotency_key TEXT;
    v_count INTEGER := 0;
BEGIN
    -- Find the system user for recording transactions
    SELECT id INTO v_system_user_id
    FROM auth.users
    WHERE email LIKE 'system-token-allocator-%@internal.app'
    LIMIT 1;

    IF v_system_user_id IS NULL THEN
        RAISE WARNING '[reset_tokens_migration] System user not found. Using NULL for recorded_by_user_id.';
    END IF;

    -- Loop through all user wallets with balance < 1M
    FOR v_wallet IN
        SELECT wallet_id, user_id, balance
        FROM public.token_wallets
        WHERE user_id IS NOT NULL
          AND balance < v_target_balance
        FOR UPDATE
    LOOP
        v_tokens_to_add := v_target_balance - v_wallet.balance;
        v_new_balance := v_target_balance;
        v_idempotency_key := 'reset_to_1m_feb_2026_' || v_wallet.user_id::text;

        -- Check if this reset has already been applied (idempotency)
        IF NOT EXISTS (
            SELECT 1 FROM public.token_wallet_transactions
            WHERE wallet_id = v_wallet.wallet_id
              AND idempotency_key = v_idempotency_key
        ) THEN
            -- Update the wallet balance
            UPDATE public.token_wallets
            SET balance = v_new_balance, updated_at = now()
            WHERE wallet_id = v_wallet.wallet_id;

            -- Record the transaction for audit trail
            INSERT INTO public.token_wallet_transactions (
                wallet_id,
                transaction_type,
                amount,
                balance_after_txn,
                recorded_by_user_id,
                related_entity_id,
                related_entity_type,
                notes,
                idempotency_key
            ) VALUES (
                v_wallet.wallet_id,
                'CREDIT_MIGRATION_RESET_FEB_2026',
                v_tokens_to_add,
                v_new_balance,
                COALESCE(v_system_user_id, v_wallet.user_id),
                NULL,
                'migration',
                'One-time reset to 1M tokens for existing users (Feb 2026 migration)',
                v_idempotency_key
            );

            v_count := v_count + 1;
            RAISE LOG '[reset_tokens_migration] Reset user % from % to % tokens (added %)',
                v_wallet.user_id, v_wallet.balance, v_new_balance, v_tokens_to_add;
        ELSE
            RAISE LOG '[reset_tokens_migration] User % already processed (idempotency key exists), skipping.', v_wallet.user_id;
        END IF;
    END LOOP;

    RAISE LOG '[reset_tokens_migration] Completed. Reset % user wallets to 1M tokens.', v_count;
END;
$$;
