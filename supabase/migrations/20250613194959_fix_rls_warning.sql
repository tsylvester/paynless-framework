-- Fixes the rls_enabled_no_policy warning on the dialectic_feedback table.

-- Policy 1: Users can manage their own feedback records.
-- This allows any authenticated user to insert feedback for themselves,
-- and to select, update, or delete feedback they have created.
CREATE POLICY "Users can manage their own feedback"
ON public.dialectic_feedback
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 2: Project owners can view all feedback within their projects.
-- This allows the user who owns the parent project to see all feedback
-- submitted for any session within that project, which is useful for overall analysis.
CREATE POLICY "Project owners can view all feedback in their projects"
ON public.dialectic_feedback
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions s
    JOIN public.dialectic_projects p ON s.project_id = p.id
    WHERE s.id = dialectic_feedback.session_id AND p.user_id = auth.uid()
  )
);

-- Fix the function_search_path_mutable warning for save_contribution_edit_atomic
-- Recreating the function with the explicit search path set.
CREATE OR REPLACE FUNCTION public.save_contribution_edit_atomic(
    p_original_contribution_id UUID,
    p_session_id UUID,
    p_user_id UUID,
    p_stage TEXT,
    p_iteration_number INT,
    p_content_storage_bucket TEXT,
    p_content_storage_path TEXT,
    p_content_mime_type TEXT,
    p_content_size_bytes BIGINT,
    p_raw_response_storage_path TEXT,
    p_tokens_used_input INT,
    p_tokens_used_output INT,
    p_processing_time_ms INT,
    p_citations JSONB,
    p_target_contribution_id UUID, -- Parent of the new edit
    p_edit_version INT,
    p_is_latest_edit BOOLEAN,
    p_original_model_contribution_id UUID,
    p_error_details TEXT, 
    p_model_id UUID,
    p_contribution_type TEXT
)
RETURNS UUID -- Returns the ID of the new contribution
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path to an empty string
AS $$
DECLARE
    new_contribution_id UUID;
BEGIN
    -- Update the old contribution to no longer be the latest
    UPDATE dialectic_contributions
    SET is_latest_edit = FALSE,
        updated_at = now()
    WHERE id = p_original_contribution_id;

    -- Insert the new edited contribution
    INSERT INTO dialectic_contributions (
        session_id,
        user_id,
        stage,
        iteration_number,
        content_storage_bucket,
        content_storage_path,
        content_mime_type,
        content_size_bytes,
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
        p_content_storage_bucket,
        p_content_storage_path,
        p_content_mime_type,
        p_content_size_bytes,
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
        -- Log the error
        RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
        RETURN NULL; -- Or re-raise the exception: RAISE;
END;
$$;
