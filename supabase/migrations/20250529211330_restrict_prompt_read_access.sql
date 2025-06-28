-- Revoke any explicit SELECT grants from the public role on system_prompts, if they exist.
-- This is a precautionary step, as RLS policies are the primary control.
REVOKE SELECT ON TABLE public.system_prompts FROM public;

-- Drop the existing RLS policy that allows public read access.
-- Replace 'Allow public read access to active prompts' with the actual policy name if different.
DROP POLICY IF EXISTS "Allow public read access to active prompts" ON public.system_prompts;

-- Create a new RLS policy to allow authenticated users to read active prompts.
CREATE POLICY "Allow authenticated users to read active system_prompts"
ON public.system_prompts
FOR SELECT
TO authenticated
USING (is_active = true);

-- Ensure that the service_role (and by extension, admins through direct DB access or service_role functions)
-- still has full access. This is often managed by a default permissive policy for service_role
-- when RLS is enabled, or by not having specific restrictive policies for service_role.
-- If you don't have a general permissive policy for service_role, you might need to add one:
-- CREATE POLICY "Allow full access to service_role"
-- ON public.system_prompts
-- FOR ALL
-- TO service_role
-- USING (true)
-- WITH CHECK (true);
-- However, typically, service_role bypasses RLS or has implicit full access unless specific
-- policies for service_role are defined to restrict it.

-- Re-grant SELECT to authenticated if you prefer explicit grants alongside RLS (optional, RLS is primary)
-- GRANT SELECT ON TABLE public.system_prompts TO authenticated;
