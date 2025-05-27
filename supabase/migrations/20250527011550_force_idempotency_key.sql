-- Migration to make idempotency_key mandatory and update the RPC function

-- Step 1: Update existing NULL idempotency_key values.
-- This uses gen_random_uuid() to ensure uniqueness for backfilled keys.
-- Review if a different strategy is needed for your historical data.
UPDATE public.token_wallet_transactions
SET idempotency_key = gen_random_uuid()::TEXT
WHERE idempotency_key IS NULL;

-- Step 2: Alter the token_wallet_transactions table to make idempotency_key NOT NULL.
-- This should now succeed as NULLs have been populated.
ALTER TABLE public.token_wallet_transactions
ALTER COLUMN idempotency_key SET NOT NULL;

-- Step 3: Drop the existing function to change its signature (remove default for p_idempotency_key).
DROP FUNCTION IF EXISTS public.record_token_transaction(UUID, VARCHAR, TEXT, UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID);

-- Step 4: Recreate the record_token_transaction function
CREATE OR REPLACE FUNCTION public.record_token_transaction(
    p_wallet_id UUID,
    p_transaction_type VARCHAR,
    p_input_amount_text TEXT,
    p_recorded_by_user_id UUID,
    p_idempotency_key TEXT, -- Removed DEFAULT NULL
    p_related_entity_id VARCHAR DEFAULT NULL,
    p_related_entity_type VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_payment_transaction_id UUID DEFAULT NULL
)
RETURNS TABLE (
    transaction_id UUID,
    wallet_id UUID,
    transaction_type VARCHAR,
    amount NUMERIC,
    balance_after_txn NUMERIC,
    recorded_by_user_id UUID,
    idempotency_key TEXT,
    related_entity_id VARCHAR,
    related_entity_type VARCHAR,
    notes TEXT,
    "timestamp" TIMESTAMPTZ,
    payment_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_transaction_amount NUMERIC;
    v_new_balance NUMERIC;
    v_is_credit BOOLEAN;
    v_existing_transaction public.token_wallet_transactions%ROWTYPE;
BEGIN
    -- Input Validation (idempotency_key is now implicitly required by its usage)
    IF p_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Wallet ID cannot be null';
    END IF;
    IF p_transaction_type IS NULL OR p_transaction_type = '' THEN
        RAISE EXCEPTION 'Transaction type cannot be empty';
    END IF;
    IF p_input_amount_text IS NULL OR p_input_amount_text = '' THEN
        RAISE EXCEPTION 'Transaction amount cannot be empty';
    END IF;
    IF p_recorded_by_user_id IS NULL THEN
        RAISE EXCEPTION 'Recorded by User ID cannot be null';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'Idempotency key cannot be empty'; -- Added explicit check
    END IF;

    BEGIN
        v_transaction_amount := p_input_amount_text::NUMERIC;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid numeric value for transaction amount: %', p_input_amount_text;
        WHEN others THEN
            RAISE EXCEPTION 'Error parsing transaction amount: %', SQLERRM;
    END;

    IF v_transaction_amount <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be positive. Input was: %', p_input_amount_text;
    END IF;

    -- Idempotency Check (p_idempotency_key is now guaranteed to be NOT NULL by earlier check)
    SELECT * INTO v_existing_transaction
    FROM public.token_wallet_transactions twt
    WHERE twt.wallet_id = p_wallet_id AND twt.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing_transaction.transaction_type = p_transaction_type AND
           v_existing_transaction.amount = v_transaction_amount AND
           v_existing_transaction.recorded_by_user_id = p_recorded_by_user_id AND
           (v_existing_transaction.related_entity_id IS NOT DISTINCT FROM p_related_entity_id) AND
           (v_existing_transaction.related_entity_type IS NOT DISTINCT FROM p_related_entity_type) AND
           (v_existing_transaction.payment_transaction_id IS NOT DISTINCT FROM p_payment_transaction_id)
        THEN
            RETURN QUERY SELECT
                twt.transaction_id, twt.wallet_id, twt.transaction_type::VARCHAR, twt.amount,
                twt.balance_after_txn, twt.recorded_by_user_id, twt.idempotency_key,
                twt.related_entity_id::VARCHAR, twt.related_entity_type::VARCHAR, twt.notes,
                twt.timestamp, twt.payment_transaction_id
            FROM public.token_wallet_transactions twt
            WHERE twt.transaction_id = v_existing_transaction.transaction_id;
            RETURN;
        ELSE
            RAISE EXCEPTION 'Idempotency key % collision for wallet %. Recorded params: type=%, amt=%, user=%. New params: type=%, amt=%, user=%',
                            p_idempotency_key, p_wallet_id,
                            v_existing_transaction.transaction_type, v_existing_transaction.amount, v_existing_transaction.recorded_by_user_id,
                            p_transaction_type, v_transaction_amount, p_recorded_by_user_id;
        END IF;
    END IF;

    IF upper(p_transaction_type) LIKE 'CREDIT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'DEBIT%' THEN
        v_is_credit := FALSE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_GRANT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_REVOKE%' THEN
        v_is_credit := FALSE;
    ELSE
        RAISE EXCEPTION 'Unknown transaction type prefix for credit/debit determination: %', p_transaction_type;
    END IF;

    SELECT balance INTO v_current_balance FROM public.token_wallets
    WHERE public.token_wallets.wallet_id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    IF v_is_credit THEN
        v_new_balance := v_current_balance + v_transaction_amount;
    ELSE
        v_new_balance := v_current_balance - v_transaction_amount;
        IF v_new_balance < 0 THEN
            RAISE EXCEPTION 'Insufficient funds in wallet % for debit of %. Current balance: %',
                            p_wallet_id, v_transaction_amount, v_current_balance;
        END IF;
    END IF;

    UPDATE public.token_wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE public.token_wallets.wallet_id = p_wallet_id;

    INSERT INTO public.token_wallet_transactions (
        wallet_id, idempotency_key, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, related_entity_id, related_entity_type, notes, payment_transaction_id, timestamp
    )
    VALUES (
        p_wallet_id, p_idempotency_key, p_transaction_type, v_transaction_amount, v_new_balance,
        p_recorded_by_user_id, p_related_entity_id, p_related_entity_type, p_notes, p_payment_transaction_id, now()
    )
    RETURNING
        public.token_wallet_transactions.transaction_id,
        public.token_wallet_transactions.wallet_id,
        public.token_wallet_transactions.transaction_type,
        public.token_wallet_transactions.amount,
        public.token_wallet_transactions.balance_after_txn,
        public.token_wallet_transactions.recorded_by_user_id,
        public.token_wallet_transactions.idempotency_key,
        public.token_wallet_transactions.related_entity_id,
        public.token_wallet_transactions.related_entity_type,
        public.token_wallet_transactions.notes,
        public.token_wallet_transactions.timestamp,
        public.token_wallet_transactions.payment_transaction_id
    INTO
        transaction_id, wallet_id, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, idempotency_key, related_entity_id, related_entity_type,
        notes, "timestamp", payment_transaction_id;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.record_token_transaction(
    p_wallet_id UUID,
    p_transaction_type VARCHAR,
    p_input_amount_text TEXT,
    p_recorded_by_user_id UUID,
    p_idempotency_key TEXT, -- Note: DEFAULT NULL removed
    p_related_entity_id VARCHAR,
    p_related_entity_type VARCHAR,
    p_notes TEXT,
    p_payment_transaction_id UUID
) IS 'Records a token transaction, updates wallet balance, and ensures idempotency. Idempotency key is now mandatory. Returns the recorded transaction.';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.record_token_transaction(
    UUID, VARCHAR, TEXT, UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_token_transaction(
    UUID, VARCHAR, TEXT, UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID
) TO service_role;
