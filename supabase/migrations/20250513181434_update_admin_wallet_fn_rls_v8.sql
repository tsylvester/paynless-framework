-- Migration: Update RLS for org admin wallet select (v8) - separate wallet type check from admin check

BEGIN;

-- 1. Modify the helper function to ONLY check admin status, assuming wallet type is pre-checked
-- Remove `p_wallet_row.user_id IS NULL` from here.
CREATE OR REPLACE FUNCTION public.is_admin_of_org_for_wallet(p_wallet_row public.token_wallets)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_wallet_row.organization_id
      -- p_wallet_row.user_id IS NULL -- This check is moved to the RLS policy's USING clause
      AND om.user_id = auth.uid()
      AND om.role::text = 'admin'
      AND om.status::text = 'active'
  );
$$;

-- Grant execute on the function to authenticated users (though it might have inherited from previous version)
GRANT EXECUTE ON FUNCTION public.is_admin_of_org_for_wallet(public.token_wallets) TO authenticated;

-- 2. Drop the existing policy for organization admins selecting organization wallets
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- 3. Recreate the policy to use the helper function, with wallet type checks in the policy itself
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  token_wallets.user_id IS NULL AND                               -- Ensure it's an org wallet
  token_wallets.organization_id IS NOT NULL AND                 -- Ensure it has an org ID
  public.is_admin_of_org_for_wallet(token_wallets)              -- Check admin status for this org wallet
);

COMMIT; 