-- Widen payment_transactions.status and allow PROCESSING_RENEWAL and TOKEN_AWARD_FAILED.
BEGIN;

ALTER TABLE public.payment_transactions
  ALTER COLUMN status TYPE VARCHAR(30);

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (
    status IN (
      'PENDING',
      'PROCESSING',
      'PROCESSING_RENEWAL',
      'COMPLETED',
      'FAILED',
      'REFUNDED',
      'TOKEN_AWARD_FAILED'
    )
  );

COMMIT;
