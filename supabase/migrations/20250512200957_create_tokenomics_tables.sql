-- Migration to create tables for the token wallet and payment system

-- Ensure the standard updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at() 
RETURNS TRIGGER LANGUAGE 'plpgsql' AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;

-- Create token_wallets table
CREATE TABLE public.token_wallets (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance NUMERIC(19,0) NOT NULL DEFAULT 0 CHECK (balance >= 0), -- Ensure balance cannot be negative
  currency VARCHAR(10) NOT NULL DEFAULT 'AI_TOKEN' CHECK (currency = 'AI_TOKEN'), -- Enforce specific token type
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure a wallet belongs to either a user OR an org, or potentially both
  CONSTRAINT user_or_org_wallet CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR 
    (user_id IS NULL AND organization_id IS NOT NULL) OR
    (user_id IS NOT NULL AND organization_id IS NOT NULL)
  )
  -- Partial unique constraints will be created below using CREATE UNIQUE INDEX
);

-- Create partial unique indexes separately
-- Ensure a user doesn't have multiple *personal* wallets (org_id IS NULL)
CREATE UNIQUE INDEX unique_user_personal_wallet_idx 
ON public.token_wallets (user_id) 
WHERE (organization_id IS NULL);

-- Ensure an org doesn't have multiple *dedicated* wallets (user_id IS NULL)
CREATE UNIQUE INDEX unique_org_dedicated_wallet_idx 
ON public.token_wallets (organization_id) 
WHERE (user_id IS NULL);

-- Optional: Add constraint for unique user+org wallet if needed
-- CREATE UNIQUE INDEX unique_user_org_wallet_idx ON public.token_wallets (user_id, organization_id) WHERE (user_id IS NOT NULL AND organization_id IS NOT NULL);

-- Apply the updated_at trigger
CREATE TRIGGER set_token_wallets_updated_at
BEFORE UPDATE ON public.token_wallets
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Add comments to clarify columns
COMMENT ON COLUMN public.token_wallets.balance IS 'Token balance, stored as NUMERIC(19,0) for precision, representing whole indivisible tokens.';
COMMENT ON COLUMN public.token_wallets.currency IS 'The type of token held in the wallet, currently fixed to AI_TOKEN.';
COMMENT ON CONSTRAINT user_or_org_wallet ON public.token_wallets IS 'Ensures wallet is associated with a user, an organization, or potentially both.';
-- Adjusted comments for indexes
COMMENT ON INDEX public.unique_user_personal_wallet_idx IS 'Prevents a user from having multiple wallets not linked to an organization.';
COMMENT ON INDEX public.unique_org_dedicated_wallet_idx IS 'Prevents an organization from having multiple wallets not linked to a specific user.';

-- Create token_wallet_transactions table (Ledger)
CREATE TABLE public.token_wallet_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.token_wallets(wallet_id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- e.g., 'CREDIT_PURCHASE', 'DEBIT_USAGE'
  amount NUMERIC(19,0) NOT NULL CHECK (amount > 0), -- Always store the absolute amount transacted
  balance_after_txn NUMERIC(19,0) NOT NULL, -- The resulting balance in the wallet after this transaction occurred
  related_entity_id VARCHAR(255), -- e.g., chat_message_id, payment_transaction_id
  related_entity_type VARCHAR(50), -- e.g., 'chat_message', 'payment_transaction'
  notes TEXT,
  idempotency_key VARCHAR(255) UNIQUE, -- Optional key to prevent duplicate transactions
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient history lookup
CREATE INDEX idx_token_wallet_transactions_wallet_id_timestamp 
ON public.token_wallet_transactions (wallet_id, timestamp DESC);

-- Comments for ledger table
COMMENT ON COLUMN public.token_wallet_transactions.amount IS 'Absolute value of tokens credited or debited in this transaction. Direction is implied by transaction_type.';
COMMENT ON COLUMN public.token_wallet_transactions.balance_after_txn IS 'Snapshot of the wallet balance immediately after this transaction was completed.';
COMMENT ON COLUMN public.token_wallet_transactions.idempotency_key IS 'Optional key provided by the caller to ensure a transaction is processed only once.';

-- Create payment_transactions table
CREATE TABLE public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id), -- User initiating the payment (Corrected schema to auth.users)
  organization_id UUID REFERENCES public.organizations(id), -- Org context if payment is for an org wallet
  target_wallet_id UUID NOT NULL REFERENCES public.token_wallets(wallet_id), -- The wallet receiving tokens
  payment_gateway_id VARCHAR(50) NOT NULL, -- e.g., 'stripe', 'coinbase'
  gateway_transaction_id VARCHAR(255) UNIQUE, -- ID from the payment gateway (e.g., Stripe session ID, Coinbase charge ID)
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED')), -- Payment status life-cycle
  amount_requested_fiat NUMERIC(10,2), -- Amount in fiat currency (e.g., USD, EUR)
  currency_requested_fiat VARCHAR(3),
  amount_requested_crypto NUMERIC(36,18), -- Amount in crypto currency (e.g., ETH, BTC)
  currency_requested_crypto VARCHAR(10),
  tokens_to_award NUMERIC(19,0) NOT NULL CHECK (tokens_to_award > 0), -- Number of AI Tokens to grant on success
  metadata_json JSONB, -- Store gateway-specific request/response data or other context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Apply the updated_at trigger
CREATE TRIGGER set_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Index for looking up transactions by gateway ID
CREATE INDEX idx_payment_transactions_gateway_id ON public.payment_transactions (gateway_transaction_id);

-- Comments for payment table
COMMENT ON COLUMN public.payment_transactions.user_id IS 'The user who initiated or is associated with the payment attempt.';
COMMENT ON COLUMN public.payment_transactions.organization_id IS 'The organization context, if the payment is intended for an organizational wallet.';
COMMENT ON COLUMN public.payment_transactions.target_wallet_id IS 'The specific token wallet that tokens should be credited to upon successful payment.';
COMMENT ON COLUMN public.payment_transactions.gateway_transaction_id IS 'Unique identifier for the transaction provided by the external payment gateway.';
COMMENT ON COLUMN public.payment_transactions.status IS 'Tracks the lifecycle state of the payment attempt.';
COMMENT ON COLUMN public.payment_transactions.tokens_to_award IS 'The number of AI Tokens to be credited to the target wallet upon successful completion.';
COMMENT ON COLUMN public.payment_transactions.metadata_json IS 'Flexible field to store additional context, like gateway request details or webhook payloads.'; 