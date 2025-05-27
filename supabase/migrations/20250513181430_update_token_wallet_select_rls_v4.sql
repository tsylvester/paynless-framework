-- Migration: Update RLS SELECT policy on token_wallets for organization admins (v4)
-- This version uses explicit text casts for enum comparisons in the subquery.

BEGIN;

-- Drop the existing policy for organization admins selecting organization wallets.
-- Ensure this matches the name used in previous migrations.
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- Policy: Users who are active admins of an organization can select the organization's wallet
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  token_wallets.organization_id IS NOT NULL AND
  token_wallets.user_id IS NULL AND -- Ensures it's an org wallet
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = token_wallets.organization_id -- Correlated subquery linking to the wallet being checked
      AND om.user_id = auth.uid()                             -- Check against the current authenticated user
      AND om.role::text = 'admin'                           -- Explicitly cast role to text for comparison
      AND om.status::text = 'active'                        -- Explicitly cast status to text for comparison
  )
);

COMMIT;
