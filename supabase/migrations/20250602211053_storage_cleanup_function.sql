-- Ensure the plpgsql language is enabled
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

-- Ensure the supabase_functions extension is available for supabase.functions.invoke
-- This is usually available in Supabase projects.
-- CREATE EXTENSION IF NOT EXISTS supabase_functions WITH SCHEMA extensions; 
-- The above is commented out as it's usually present. If not, it would need to be enabled.

-- Function to handle deletion of associated storage files when a contribution is deleted
CREATE OR REPLACE FUNCTION public.handle_deleted_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Allows the function to run with the permissions of the user who defined it (usually admin/postgres)
                 -- and enables supabase.functions.invoke to use the service_role key.
SET search_path = public, extensions -- Moved here
AS $$
DECLARE
  payload JSONB;
  raw_path TEXT;
  structured_path TEXT;
  paths_to_delete TEXT[];
  response_payload JSONB; -- To capture response from the Edge Function if needed
BEGIN
  -- Get the storage paths from the deleted record
  raw_path := OLD.raw_content_storage_path;
  structured_path := OLD.structured_content_storage_path;

  -- Collect valid paths into an array
  IF raw_path IS NOT NULL AND raw_path <> '' THEN
    paths_to_delete := array_append(paths_to_delete, raw_path);
  END IF;

  IF structured_path IS NOT NULL AND structured_path <> '' THEN
    paths_to_delete := array_append(paths_to_delete, structured_path);
  END IF;

  -- If there are paths to delete, invoke the Edge Function
  IF array_length(paths_to_delete, 1) > 0 THEN
    payload := jsonb_build_object(
      'bucket', 'dialectic_contributions', -- The bucket name used by the Edge Function
      'paths', paths_to_delete
    );

    BEGIN
      -- Invoke the 'storage-cleanup-service' Edge Function
      -- supabase.functions.invoke handles auth (service_role) and URL construction.
      SELECT supabase.functions.invoke(
          function_name := 'storage-cleanup-service',
          invoke_options := jsonb_build_object('body', payload)
      ) INTO response_payload;

      -- Optional: Check response_payload if needed.
      -- If the Edge Function returns an error status (e.g., 4xx, 5xx),
      -- supabase.functions.invoke will typically raise a PostgreSQL exception.
      -- The EXCEPTION block below will catch this.

    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '[TRIGGER_CLEANUP_ERROR] Error calling storage-cleanup-service for contribution ID: %. Error: %', OLD.id, SQLERRM;
            -- Log the warning but allow the original delete operation to proceed.
            -- If strict error handling is required (e.g., rollback), this block could re-raise the error.
    END;
  END IF;

  -- For an AFTER DELETE trigger, the return value is usually ignored.
  -- Returning OLD is a common convention.
  RETURN OLD;
END;
$$;

-- Trigger to call the function after a row is deleted from dialectic_contributions
DROP TRIGGER IF EXISTS trigger_delete_contribution_storage_cleanup ON public.dialectic_contributions;
CREATE TRIGGER trigger_delete_contribution_storage_cleanup
AFTER DELETE ON public.dialectic_contributions
FOR EACH ROW
EXECUTE FUNCTION public.handle_deleted_contribution();
