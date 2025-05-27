CREATE POLICY "Allow organization admins to select their organization's payment transactions"
ON public.payment_transactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.token_wallets tw
    -- Join payment_transactions to token_wallets if target_wallet_id is for an org wallet the user administers
    WHERE tw.wallet_id = payment_transactions.target_wallet_id
      AND tw.user_id IS NULL -- Ensures it's an org wallet
      AND tw.organization_id IS NOT NULL
      AND public.is_admin_of_org_for_wallet(tw.organization_id) -- User is admin of the wallet's org
  )
  OR
  -- Also allow if payment_transactions.organization_id is directly set 
  -- and the user is an admin of that organization.
  (
    payment_transactions.organization_id IS NOT NULL AND
    public.is_admin_of_org_for_wallet(payment_transactions.organization_id) -- User is admin of the payment's org
  )
);
