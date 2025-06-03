-- Enable pg_net extension if not already enabled.
-- This is required for database functions to invoke Supabase Edge Functions via supabase.functions.invoke().
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to the postgres role (or the role your functions run as if different)
-- and the authenticated role if necessary for your security model.
-- For supabase.functions.invoke, the SECURITY DEFINER function will run as the definer (often superuser/postgres),
-- so granting to postgres should cover it.
GRANT USAGE ON SCHEMA net TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres;

-- Additionally, grant usage to the supabase_functions_admin role as it's often involved in function execution contexts.
-- This might be redundant if 'postgres' role already has sufficient privileges but is a safe measure.
GRANT USAGE ON SCHEMA net TO supabase_functions_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO supabase_functions_admin;

-- Grant usage to the authenticated role if your RLS policies or other triggers might indirectly cause pg_net usage
-- by non-privileged users (though less common for direct supabase.functions.invoke from SECURITY DEFINER triggers).
-- Consider your specific security needs before uncommenting and applying widely.
-- GRANT USAGE ON SCHEMA net TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO authenticated;

-- Note: In local development (Supabase CLI), you might need to restart your Docker containers
-- for Supabase (supabase stop && supabase start) after applying this migration for the pg_net
-- background worker to be properly initialized and available. 