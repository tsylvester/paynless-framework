-- Migration: Add RLS policies for token_wallets table

BEGIN;

-- Enable RLS on the token_wallets table
ALTER TABLE public.token_wallets ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies if they exist (safety measure)
DROP POLICY IF EXISTS "Allow public read access" ON public.token_wallets;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.token_wallets;
DROP POLICY IF EXISTS "Allow all access to service_role" ON public.token_wallets; -- If explicit service_role policies were used before

-- Policy: Users can select their own user-specific wallets
CREATE POLICY "Allow users to select their own wallets" 
ON public.token_wallets FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Users who are active admins of an organization can select the organization's wallet
-- Leverages the existing is_org_member function.
CREATE POLICY "Allow organization admins to select their organization wallets"
ON public.token_wallets FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL AND 
  user_id IS NULL AND -- Ensures it's an org wallet, not a user wallet that also has an org_id by mistake
  public.is_org_member(organization_id, auth.uid(), 'active', 'admin')
);

-- Policy: Restrict INSERT operations to service_role only
-- Wallet creation should be handled by the TokenWalletService using an admin client.
CREATE POLICY "Allow service_role to insert wallets"
ON public.token_wallets FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Policy: Restrict UPDATE operations (e.g., to service_role or disallow entirely for now)
-- Balance updates are handled by the record_token_transaction RPC function.
-- For now, disallow direct updates by authenticated users.
CREATE POLICY "Disallow direct updates to wallets by authenticated users"
ON public.token_wallets FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);
-- If service_role needs to update directly (outside of RPCs), a separate policy could be added:
-- CREATE POLICY "Allow service_role to update wallets"
-- ON public.token_wallets FOR UPDATE
-- TO service_role -- Or specify the role if it's not 'service_role'
-- USING (true) 
-- WITH CHECK (true);

-- Policy: Restrict DELETE operations to service_role only
CREATE POLICY "Allow service_role to delete wallets"
ON public.token_wallets FOR DELETE
USING (auth.role() = 'service_role');

COMMIT;
