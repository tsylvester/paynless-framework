-- Drop any potentially conflicting default SELECT policies if they exist.
-- Adjust the name if your existing policy is different.
-- Example: DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_profiles;
-- Example: DROP POLICY IF EXISTS "Allow individual read access" ON public.user_profiles;

-- Create a new policy granting SELECT access to authenticated users.
CREATE POLICY "Allow authenticated read access"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (true);
