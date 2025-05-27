-- Migration: Update RLS for org admin wallet select using a SECURITY DEFINER helper function (v7)

BEGIN;

-- 1. Create the helper function with SECURITY DEFINER
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
      AND p_wallet_row.user_id IS NULL -- Crucial: ensure the wallet being checked IS an organization wallet
      AND om.user_id = auth.uid()
      AND om.role::text = 'admin'
      AND om.status::text = 'active'
  );
$$;

-- Grant execute on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin_of_org_for_wallet(public.token_wallets) TO authenticated;

-- 2. Drop the existing policy for organization admins selecting organization wallets
DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;

-- 3. Recreate the policy to use the helper function
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  public.is_admin_of_org_for_wallet(token_wallets) -- Pass the whole row
);

COMMIT; 