-- Migration: Update RLS SELECT policy on token_wallets for organization admins with inlined check

BEGIN;

-- Drop the existing policy that uses the is_org_member function
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- Recreate the policy with an inlined existence check
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL AND
  user_id IS NULL AND -- Ensures it's an org wallet, not a user wallet that also has an org_id by mistake
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON om.organization_id = o.id
    WHERE om.organization_id = token_wallets.organization_id -- Correlate with the token_wallets row being checked
      AND om.user_id = auth.uid() -- Use auth.uid() from the RLS policy context directly in the subquery
      AND om.status = 'active'
      AND om.role = 'admin'
      AND o.deleted_at IS NULL -- Ensure the organization is not soft-deleted
  )
);

COMMIT;
