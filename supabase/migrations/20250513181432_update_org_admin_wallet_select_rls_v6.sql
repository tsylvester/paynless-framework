-- Migration: Update RLS SELECT policy on token_wallets for organization admins (v6)
-- Simplifies the outer conditions, relying more on the EXISTS clause.

BEGIN;

-- Drop the existing policy for organization admins selecting organization wallets.
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- Recreate the policy for organization admins
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  -- We ensure it's an org wallet implicitly by checking token_wallets.organization_id inside EXISTS
  -- and that token_wallets.user_id IS NULL can also be part of the subquery or as an outer condition.
  -- For now, let's test if the EXISTS clause alone works when the outer conditions are minimal.
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = token_wallets.organization_id -- Link to the wallet being checked
      AND token_wallets.user_id IS NULL                     -- Ensure it is an org wallet (user_id on wallet is null)
      AND om.user_id = auth.uid()                             -- Check against the current authenticated user
      AND om.role::text = 'admin'                           -- Explicitly cast role to text for comparison
      AND om.status::text = 'active'                        -- Explicitly cast status to text for comparison
  )
);

COMMIT; 