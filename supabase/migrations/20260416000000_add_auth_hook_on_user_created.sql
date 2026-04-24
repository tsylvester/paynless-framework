-- Create auth hook for user creation
-- This will trigger the on-user-created edge function when a new user signs up

-- First, ensure we have the necessary extensions
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Create function to call edge function on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  service_role_key text;
  supabase_url text;
BEGIN
  -- Get the service role key and URL from vault
  service_role_key := current_setting('app.settings.jwt_secret', true);
  supabase_url := 'http://supabase_kong_paynless-framework:8000'; -- Internal Kong URL
  
  -- Call the edge function using pg_net
  SELECT extensions.http_post(
    url := supabase_url || '/functions/v1/on-user-created',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'users', 
      'schema', 'auth',
      'record', row_to_json(NEW)
    )::text
  ) INTO request_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to call on-user-created webhook: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
-- Skip GRANT on http_post as it has multiple overloads

COMMENT ON FUNCTION public.handle_new_user() IS 'Triggers the on-user-created edge function when a new user signs up';