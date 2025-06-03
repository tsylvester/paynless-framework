-- New migration file to correct column names in handle_deleted_contribution function

-- Ensure the plpgsql language is enabled (usually already done, but safe to include)
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

-- Function to handle deletion of associated storage files when a contribution is deleted
CREATE OR REPLACE FUNCTION public.handle_deleted_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload JSONB;
  v_content_storage_path TEXT;         -- Renamed and corrected
  v_raw_response_storage_path TEXT;    -- Renamed and corrected
  paths_to_delete TEXT[];
  response_payload JSONB;
BEGIN
  -- Get the storage paths from the deleted record
  v_content_storage_path := OLD.content_storage_path;             -- CORRECTED
  v_raw_response_storage_path := OLD.raw_response_storage_path; -- CORRECTED

  -- Collect valid paths into an array
  IF v_content_storage_path IS NOT NULL AND v_content_storage_path <> '' THEN
    paths_to_delete := array_append(paths_to_delete, v_content_storage_path);
  END IF;

  IF v_raw_response_storage_path IS NOT NULL AND v_raw_response_storage_path <> '' THEN
    paths_to_delete := array_append(paths_to_delete, v_raw_response_storage_path);
  END IF;

  -- If there are paths to delete, invoke the Edge Function
  IF array_length(paths_to_delete, 1) > 0 THEN
    payload := jsonb_build_object(
      'bucket', 'dialectic-contributions', -- Correct hyphenated bucket name
      'paths', paths_to_delete
    );

    BEGIN
      SELECT supabase.functions.invoke(
          function_name := 'storage-cleanup-service',
          invoke_options := jsonb_build_object('body', payload)
      ) INTO response_payload;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '[TRIGGER_CLEANUP_ERROR] Error calling storage-cleanup-service for contribution ID: %. Error: %\', OLD.id, SQLERRM;
    END;
  END IF;

  RETURN OLD;
END;
$$;

-- Re-apply the trigger to ensure it uses the updated function definition.
DROP TRIGGER IF EXISTS trigger_delete_contribution_storage_cleanup ON public.dialectic_contributions;
CREATE TRIGGER trigger_delete_contribution_storage_cleanup
AFTER DELETE ON public.dialectic_contributions
FOR EACH ROW
EXECUTE FUNCTION public.handle_deleted_contribution();
