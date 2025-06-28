-- Alter payment_transactions table to change amount_requested_fiat to INTEGER (cents)
BEGIN;

-- Modify the amount_requested_fiat column type to INTEGER.
-- The USING clause converts existing NUMERIC values (assumed to be in cents, e.g., 1999.00 for 1999 cents)
-- directly to INTEGER.
ALTER TABLE public.payment_transactions
  ALTER COLUMN amount_requested_fiat TYPE INTEGER USING amount_requested_fiat::INTEGER;

-- Update the comment on the column to reflect the change.
COMMENT ON COLUMN public.payment_transactions.amount_requested_fiat IS 'Amount in fiat currency (e.g., USD, EUR), stored as an integer in cents, exactly as received from Stripe.';

COMMIT;
