-- This migration file fixes incorrect RLS policies from previous migrations
-- that were causing 401 Unauthorized errors for authenticated users.

--
-- 1. FIXING ORGANIZATION & MEMBERSHIP PERMISSIONS
--

-- Drop the old, overly restrictive policies that only allowed admins to view orgs and members.
DROP POLICY IF EXISTS "Allow active members to view their non-deleted organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow active members to view memberships in their orgs" ON public.organization_members;

-- Create a new, correct policy allowing any active member to view their organization's details.
CREATE POLICY "Allow active members to view their own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Create a new, correct policy allowing any active member to view other members within the same organization.
CREATE POLICY "Allow active members to view memberships of their own organization"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);


--
-- 2. FIXING SUBSCRIPTION TRANSACTION PERMISSIONS
--

-- Drop the old policy that incorrectly blocked all non-service_role users from seeing their transactions.
DROP POLICY IF EXISTS "Allow service_role and deny others" ON public.subscription_transactions;

-- Create a new policy that correctly allows users to see transactions for their own subscriptions.
CREATE POLICY "Allow users to read their own subscription transactions"
ON public.subscription_transactions
FOR SELECT
TO authenticated
USING (
  user_subscription_id IN (
    SELECT id FROM public.user_subscriptions WHERE user_id = auth.uid()
  )
);

-- NOTE: No changes are needed for user_profiles or user_subscriptions.
-- The policies for those tables from previous migrations are already correct
-- and sufficient for the application's needs. Adding more would be redundant. 