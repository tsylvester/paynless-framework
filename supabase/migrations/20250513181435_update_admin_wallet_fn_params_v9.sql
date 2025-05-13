-- Migration: Update admin wallet helper fn to use primitive params (v9) - CORRECTED ORDER

BEGIN;

-- 1. Drop the RLS policy that depends on the old function signature
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- 2. Drop the old function that took a row type
DROP FUNCTION IF EXISTS public.is_admin_of_org_for_wallet(public.token_wallets);

-- 3. Create the new helper function with explicit primitive parameters
CREATE OR REPLACE FUNCTION public.is_admin_of_org_for_wallet(p_organization_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id -- Use the direct parameter
      AND om.user_id = auth.uid()
      AND om.role::text = 'admin'
      AND om.status::text = 'active'
  );
$$;

-- Grant execute on the new function signature
GRANT EXECUTE ON FUNCTION public.is_admin_of_org_for_wallet(UUID) TO authenticated;

-- 4. Recreate the RLS policy to call the new function signature
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  token_wallets.user_id IS NULL AND
  token_wallets.organization_id IS NOT NULL AND
  public.is_admin_of_org_for_wallet(token_wallets.organization_id) -- Pass only the organization_id
);

COMMIT; 