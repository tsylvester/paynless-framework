-- Enable HTTP extension if not already enabled. This might require superuser privileges.
-- CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Grant usage of the http extension to the postgres user (or the user executing the trigger)
-- GRANT USAGE ON SCHEMA http TO postgres;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA http TO postgres;

CREATE OR REPLACE FUNCTION public.handle_deleted_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Important: Allows the function to run with the privileges of the user who defined it (typically superuser for http calls)
AS $$
DECLARE
  paths_to_delete TEXT[];
  bucket_name TEXT;
  service_url TEXT; -- TODO: Ensure this URL is correctly configured for your Supabase project
  api_key TEXT;     -- TODO: Ensure this is a valid SERVICE_ROLE_KEY or a dedicated secure key for this operation
  payload JSONB;
  response RECORD;
BEGIN
  -- Construct the base URL for your Supabase Edge Functions
  -- Replace <YOUR_PROJECT_REF> with your actual Supabase project reference
  -- service_url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/storage-cleanup-service';
  -- A more robust way if SUPABASE_URL is accessible or can be set:
  service_url := current_setting('app.supabase_url', true) || '/functions/v1/storage-cleanup-service';
  
  -- Retrieve the service role key from environment variables or Vault (recommended)
  -- This is a placeholder; secure key management is crucial.
  api_key := current_setting('app.supabase_service_role_key', true); -- Ensure this custom GUC is set, or use a hardcoded key (not recommended for production)

  bucket_name := OLD.content_storage_bucket;
  paths_to_delete := ARRAY[]::TEXT[];

  IF OLD.content_storage_path IS NOT NULL THEN
    paths_to_delete := array_append(paths_to_delete, OLD.content_storage_path);
  END IF;

  IF OLD.raw_response_storage_path IS NOT NULL THEN
    paths_to_delete := array_append(paths_to_delete, OLD.raw_response_storage_path);
  END IF;

  IF array_length(paths_to_delete, 1) > 0 AND bucket_name IS NOT NULL THEN
    payload := jsonb_build_object(
      'bucket', bucket_name,
      'paths', paths_to_delete
    );

    BEGIN
      -- Ensure the http extension is available and the user has permissions.
      -- The headers must include 'apikey' with the service_role_key for the target Edge Function to authenticate.
      SELECT * INTO response FROM extensions.http_post(
        service_url,
        payload::TEXT,
        'application/json',
        jsonb_build_object(
          'apikey', api_key,
          'Authorization', 'Bearer ' || api_key -- Service role key can often be used as Bearer token for function calls
        )::TEXT -- Cast headers JSONB to TEXT for http_post
      );

      -- Log the response (optional, for debugging)
      -- RAISE LOG 'Storage cleanup response: %', response;
      
      IF response.status_code != 200 THEN
         RAISE WARNING 'Failed to delete files from storage for contribution ID %: HTTP %, Body: %', OLD.id, response.status_code, response.body;
      ELSE 
        RAISE LOG 'Successfully requested deletion of % files from bucket % for contribution ID %.', array_length(paths_to_delete, 1), bucket_name, OLD.id;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Error calling storage-cleanup-service for contribution ID %: %', OLD.id, SQLERRM;
    END;
  END IF;

  RETURN OLD; -- Result of a DELETE trigger is ignored, but it must return something.
END;
$$;

-- Drop trigger if it exists to ensure idempotency during development/testing
DROP TRIGGER IF EXISTS trigger_delete_contribution_storage_cleanup ON public.dialectic_contributions;

-- Create the trigger
CREATE TRIGGER trigger_delete_contribution_storage_cleanup
AFTER DELETE ON public.dialectic_contributions
FOR EACH ROW
EXECUTE FUNCTION public.handle_deleted_contribution();

-- Note on custom GUCs like app.supabase_url and app.supabase_service_role_key:
-- These would need to be set in your Supabase project's PostgreSQL configuration.
-- Example: ALTER DATABASE postgres SET app.supabase_url = 'https://your_project_ref.supabase.co';
-- Example: ALTER DATABASE postgres SET app.supabase_service_role_key = 'your_actual_service_role_key';
-- Storing the service role key directly in GUCs is generally not recommended for production due to security.
-- Consider using Supabase Vault or having the key securely passed if the trigger/function is invoked via a trusted mechanism.
-- For self-hosted Supabase, Deno.env.get() in the Edge Function might access system env vars if the DB function uses pg_net to call it. 