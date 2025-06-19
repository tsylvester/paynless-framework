CREATE OR REPLACE FUNCTION public.save_contribution_edit_atomic(
    p_original_contribution_id UUID,
    p_session_id UUID,
    p_user_id UUID,
    p_stage TEXT,
    p_iteration_number INT,
    p_storage_bucket TEXT,
    p_storage_path TEXT,
    p_mime_type TEXT,
    p_size_bytes BIGINT,
    p_raw_response_storage_path TEXT,
    p_tokens_used_input INT,
    p_tokens_used_output INT,
    p_processing_time_ms INT,
    p_citations JSONB,
    p_target_contribution_id UUID,
    p_edit_version INT,
    p_is_latest_edit BOOLEAN,
    p_original_model_contribution_id UUID,
    p_error_details TEXT, 
    p_model_id UUID,
    p_contribution_type TEXT
)
RETURNS UUID -- Returns the ID of the new contribution
LANGUAGE plpgsql
-- Explicitly set search_path to an empty string to address Supabase's function_search_path_mutable warning.
-- This ensures the function does not rely on a mutable search path, making it more secure and predictable.
SET search_path = '' 
AS $$
DECLARE
    new_contribution_id UUID;
BEGIN
    -- Concurrently update the old contribution to no longer be the latest.
    -- This prevents race conditions where two edits could be marked as latest.
    UPDATE public.dialectic_contributions
    SET is_latest_edit = FALSE,
        updated_at = now()
    WHERE id = p_original_contribution_id;

    -- Insert the new edited contribution record.
    -- Note the mapping from `p_content_*` parameters to the `storage_*` table columns.
    INSERT INTO public.dialectic_contributions (
        session_id,
        user_id,
        stage,
        iteration_number,
        storage_bucket, -- Corrected column name
        storage_path,   -- Corrected column name
        mime_type,      -- Corrected column name
        size_bytes,     -- Corrected column name
        raw_response_storage_path,
        tokens_used_input,
        tokens_used_output,
        processing_time_ms,
        citations,
        target_contribution_id, 
        edit_version,
        is_latest_edit,
        original_model_contribution_id,
        error, 
        model_id,
        contribution_type,
        created_at,
        updated_at
    )
    VALUES (
        p_session_id,
        p_user_id,
        p_stage,
        p_iteration_number,
        p_storage_bucket, -- Parameter name
        p_storage_path,   -- Parameter name
        p_mime_type,      -- Parameter name
        p_size_bytes,     -- Parameter name
        p_raw_response_storage_path,
        p_tokens_used_input,
        p_tokens_used_output,
        p_processing_time_ms,
        p_citations,
        p_target_contribution_id,
        p_edit_version,
        p_is_latest_edit,
        p_original_model_contribution_id,
        p_error_details,
        p_model_id,
        p_contribution_type,
        now(),
        now()
    )
    RETURNING id INTO new_contribution_id;

    RETURN new_contribution_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and return NULL if any part of the transaction fails.
        -- The calling service is responsible for handling the NULL response.
        RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
        RETURN NULL;
END;
$$;
