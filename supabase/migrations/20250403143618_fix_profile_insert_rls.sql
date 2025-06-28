-- Add missing INSERT policy for user_profiles table

-- Allow users to insert their own profile
-- Use DROP IF EXISTS for idempotency, in case this policy was manually added or run partially before.
DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_profiles;

CREATE POLICY "Allow individual insert access" ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);