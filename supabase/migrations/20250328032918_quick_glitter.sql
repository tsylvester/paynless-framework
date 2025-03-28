/*
  # Fix RLS Policies for Subscriptions
  
  1. Fixes
    - Updates the RLS policies to correctly reference user IDs
    - Removes "authenticated" role reference that causes OID conversion errors
    - Fixes policy conditions to use auth.uid() instead of role names
*/

-- Drop the old policy that's causing the error
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;

-- Create new policies with corrected syntax
CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions
  FOR ALL
  USING (
    -- Use a function that doesn't rely on role OIDs
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- Create a policy for users to update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
  ON subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);