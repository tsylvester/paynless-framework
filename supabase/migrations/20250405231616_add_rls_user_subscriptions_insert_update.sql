-- NOTE: Assumes RLS is already enabled on user_subscriptions and a SELECT policy exists
-- from the initial schema migration (e.g., 20250403143617_initial_schema_setup.sql).

-- -- Removed: RLS is enabled in the initial migration --
-- ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- -- Removed: SELECT policy created in initial migration -- 
-- CREATE POLICY "Allow individual read access" 
-- ON public.user_subscriptions
-- FOR SELECT 
-- TO authenticated 
-- USING (auth.uid() = user_id);

-- Allow users to insert their own subscription record
-- Use CREATE OR REPLACE to be safer if this migration runs multiple times locally by mistake,
-- although db reset makes this less critical.
-- DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_subscriptions;
CREATE POLICY "Allow individual insert access" 
ON public.user_subscriptions
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own subscription record
-- DROP POLICY IF EXISTS "Allow individual update access" ON public.user_subscriptions;
CREATE POLICY "Allow individual update access" 
ON public.user_subscriptions
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
