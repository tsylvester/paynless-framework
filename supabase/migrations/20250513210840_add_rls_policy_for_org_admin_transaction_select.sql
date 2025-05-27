BEGIN;

-- Enable RLS on the token_wallet_transactions table if not already (idempotent)
ALTER TABLE public.token_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Remove the TODO comment from the old migration file as we are addressing it here.
-- The old file supabase/migrations/20250513163633_add_payment_fk_to_token_transactions.sql
-- had: -- TODO: Add policy for organization members to select transactions of org wallets.

-- Drop the policy if it already exists to ensure idempotency
DROP POLICY IF EXISTS "Allow organization admins to select their organization's wallet transactions" ON public.token_wallet_transactions;

-- Policy: Allow organization admins to select transactions for their organization's wallets.
-- This policy is added to the existing RLS policies for token_wallet_transactions.
-- It uses the public.is_admin_of_org_for_wallet(UUID) helper function which should exist from previous migrations.
CREATE POLICY "Allow organization admins to select their organization's wallet transactions"
ON public.token_wallet_transactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.token_wallets tw
    WHERE tw.wallet_id = token_wallet_transactions.wallet_id -- Link transaction to a wallet
      AND tw.user_id IS NULL                                  -- Ensure it's an org wallet
      AND tw.organization_id IS NOT NULL                      -- Ensure org_id is present
      AND public.is_admin_of_org_for_wallet(tw.organization_id) -- Check if current user is admin of that org
  )
);

COMMIT;
