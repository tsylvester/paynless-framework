-- Migration: Clean up temporary and potentially duplicate RLS policies on token_wallets

BEGIN;

-- Drop the overly permissive temporary policy for organization wallets
DROP POLICY IF EXISTS "TEMP - Allow auth users to select any org wallets" ON public.token_wallets;

-- To be safe, let's ensure we only have one definitive policy for users selecting their own wallets.
-- We assume the first one listed ("Allow authenticated user to select their own wallets") is the correct one.
-- If there's another policy with the name "Allow users to select their own wallets" that might be redundant or conflicting,
-- we should drop it. However, since policy names for SELECT on the same table for the same role SHOULD be unique if their
-- definitions are intended to be distinct and combined via OR, we need to be careful.
-- The safest approach is to drop BOTH policies with similar names and recreate the one we absolutely need.

-- Drop potentially duplicated/older policies for user's own wallet selection
DROP POLICY IF EXISTS "Allow authenticated user to select their own wallets" ON public.token_wallets;
DROP POLICY IF EXISTS "Allow users to select their own wallets" ON public.token_wallets; -- Catches the one with the duplicate name

-- Recreate the definitive policy for users to select their OWN user-specific wallets
CREATE POLICY "Allow users to select their own user-specific wallets" 
ON public.token_wallets FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND organization_id IS NULL);

-- The policy "Allow organization admins to select their organization wallets" (from ...v4.sql) 
-- should remain as is, as its logic is specific for org wallets and admin checks.
-- No changes to "Allow organization admins to select their organization wallets" here.

COMMIT; 