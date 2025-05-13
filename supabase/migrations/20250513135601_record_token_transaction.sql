-- Migration to create tokenomics tables and record_token_transaction function

-- Drop dependent function first if it exists from a previous partial migration attempt
DROP FUNCTION IF EXISTS public.record_token_transaction(UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_token_transaction(UUID, VARCHAR, TEXT, UUID, TEXT, TEXT, TEXT, TEXT); -- different signature from previous attempts
DROP FUNCTION IF EXISTS public.record_token_transaction(UUID,VARCHAR,TEXT,UUID,VARCHAR,VARCHAR,TEXT); -- another different signature

-- 1. Create token_wallets table
CREATE TABLE IF NOT EXISTS public.token_wallets (
    wallet_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    balance NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'APP_TOKENS', -- e.g., "APP_TOKENS"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_or_org_wallet CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL),
    CONSTRAINT unique_user_wallet UNIQUE (user_id, currency), -- A user can have one wallet per currency
    CONSTRAINT unique_org_wallet UNIQUE (organization_id, currency) -- An org can have one wallet per currency
);

COMMENT ON TABLE public.token_wallets IS 'Stores token balances for users and organizations.';
COMMENT ON COLUMN public.token_wallets.balance IS 'Current token balance. Use NUMERIC for precision.';
COMMENT ON COLUMN public.token_wallets.currency IS 'Type of token, e.g., APP_TOKENS.';

-- 2. Create payment_transactions table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- User initiating or benefiting from the payment
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL, -- Org initiating or benefiting
    target_wallet_id UUID NOT NULL REFERENCES public.token_wallets(wallet_id) ON DELETE RESTRICT,
    payment_gateway_id TEXT NOT NULL, -- e.g., "STRIPE", "COINBASE", "INTERNAL_GRANT"
    gateway_transaction_id TEXT, -- ID from the payment gateway, if applicable
    amount_requested_fiat NUMERIC,
    currency_requested_fiat TEXT, -- e.g., "USD", "EUR"
    amount_requested_crypto NUMERIC,
    currency_requested_crypto TEXT, -- e.g., "ETH", "USDC"
    tokens_to_award NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- e.g., "pending", "processing", "completed", "failed", "refunded"
    metadata JSONB, -- Store additional info, like Stripe charge object, error messages etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_gateway_transaction_id UNIQUE (payment_gateway_id, gateway_transaction_id)
);

COMMENT ON TABLE public.payment_transactions IS 'Records attempts to purchase tokens or other monetary transactions related to tokens.';
COMMENT ON COLUMN public.payment_transactions.target_wallet_id IS 'The token_wallet that will be credited upon successful payment.';
COMMENT ON COLUMN public.payment_transactions.tokens_to_award IS 'Number of app tokens to be awarded upon successful completion.';
COMMENT ON COLUMN public.payment_transactions.status IS 'Status of the payment transaction.';

-- 3. Create token_wallet_transactions table (if it doesn't exist)
-- The definition includes recorded_by_user_id for cases where the table is brand new.
CREATE TABLE IF NOT EXISTS public.token_wallet_transactions (
    transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES public.token_wallets(wallet_id) ON DELETE RESTRICT,
    payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL, -- Link to payment if this was a purchase
    idempotency_key TEXT, -- Ensures a specific operation is not processed multiple times
    transaction_type TEXT NOT NULL, -- e.g., 'CREDIT_PURCHASE', 'DEBIT_USAGE', 'CREDIT_REFUND', 'ADJUSTMENT_STAFF_GRANT', 'ADJUSTMENT_STAFF_REVOKE'
    amount NUMERIC NOT NULL, -- Absolute value of tokens transacted. Type (credit/debit) is in transaction_type
    balance_after_txn NUMERIC NOT NULL, -- Wallet balance after this transaction was applied
    recorded_by_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT, -- User who initiated, or system user ID. Will be set to NOT NULL below.
    related_entity_id TEXT,      -- e.g., chat_message_id, feature_id, user_id (for referral bonus)
    related_entity_type TEXT,  -- e.g., 'CHAT_MESSAGE', 'FEATURE_USAGE', 'USER_REFERRAL'
    notes TEXT,                          -- Any additional notes about the transaction
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT abs_amount CHECK (amount >= 0), -- Amount should always be positive; direction is via type
    CONSTRAINT unique_idempotency_key_per_wallet UNIQUE (wallet_id, idempotency_key)
);

-- Ensure recorded_by_user_id column exists and is NOT NULL, even if table was created by a previous migration without it.
ALTER TABLE public.token_wallet_transactions
ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Important: This next command will fail if the table existed with NULLs in recorded_by_user_id
-- and no default was set for the column. For a fresh db reset or if the column was just added, it's fine.
-- If this migration needs to run on a DB with existing token_wallet_transactions table that has NULLs in this column,
-- those NULLs would need to be handled (e.g. backfilled) before this ALTER COLUMN can succeed.
ALTER TABLE public.token_wallet_transactions
ALTER COLUMN recorded_by_user_id SET NOT NULL;

COMMENT ON TABLE public.token_wallet_transactions IS 'Ledger of all token transactions for all wallets. Append-only.';
COMMENT ON COLUMN public.token_wallet_transactions.amount IS 'Absolute (non-negative) number of tokens in the transaction.';
COMMENT ON COLUMN public.token_wallet_transactions.balance_after_txn IS 'Snapshot of the wallet balance after this transaction.';
COMMENT ON COLUMN public.token_wallet_transactions.recorded_by_user_id IS 'ID of the user or system entity that recorded/initiated this transaction. Mandatory for auditability.';
COMMENT ON COLUMN public.token_wallet_transactions.idempotency_key IS 'Client-provided key to prevent duplicate processing. Should be unique per wallet.';

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_token_wallets_user_id ON public.token_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_token_wallets_organization_id ON public.token_wallets(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_target_wallet_id ON public.payment_transactions(target_wallet_id);
CREATE INDEX IF NOT EXISTS idx_token_wallet_transactions_wallet_id ON public.token_wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_token_wallet_transactions_type ON public.token_wallet_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_token_wallet_transactions_recorded_by ON public.token_wallet_transactions(recorded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_token_wallet_transactions_related_entity ON public.token_wallet_transactions(related_entity_id, related_entity_type);


-- 4. Create or replace the record_token_transaction function
CREATE OR REPLACE FUNCTION public.record_token_transaction(
    p_wallet_id UUID,
    p_transaction_type VARCHAR,
    p_input_amount_text TEXT, -- Use TEXT for input to preserve precision, convert to NUMERIC internally
    p_recorded_by_user_id UUID,
    p_idempotency_key TEXT DEFAULT NULL,
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
    -- Input Validation
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

    -- Attempt to parse p_input_amount_text to NUMERIC
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

    -- Idempotency Check: If p_idempotency_key is provided, check if this transaction already exists.
    IF p_idempotency_key IS NOT NULL THEN
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
    p_idempotency_key TEXT,
    p_related_entity_id VARCHAR,
    p_related_entity_type VARCHAR,
    p_notes TEXT,
    p_payment_transaction_id UUID
) IS 'Records a token transaction, updates wallet balance, and ensures idempotency. Returns the recorded transaction.';

GRANT EXECUTE ON FUNCTION public.record_token_transaction(
    UUID, VARCHAR, TEXT, UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_token_transaction(
    UUID, VARCHAR, TEXT, UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID
) TO service_role;
