-- pause_active_jobs RPC and generalize resume to paused_nsf + paused_user
--
-- Adds pause_active_jobs to set active (non-terminal, non-waiting, non-paused) jobs to
-- paused_user with original_status in error_details. Extends resume_paused_nsf_jobs to
-- resume both paused_nsf and paused_user, stripping user_paused from error_details.
-- Existing NSF resume behavior is unchanged; only the WHERE and error_details strip are extended.

-- pause_active_jobs: only project owner can pause; excludes terminal/waiting/paused statuses
CREATE OR REPLACE FUNCTION public.pause_active_jobs(
  p_session_id UUID,
  p_stage_slug TEXT,
  p_iteration_number INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_paused_count INTEGER;
BEGIN
  -- Ownership: only the project owner can pause jobs for their session (same pattern as resume_paused_nsf_jobs)
  IF NOT EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects p ON p.id = ds.project_id
    WHERE ds.id = p_session_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'pause_active_jobs: session not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.dialectic_generation_jobs
  SET
    status = 'paused_user',
    error_details = jsonb_build_object('original_status', status, 'user_paused', true)
  WHERE session_id = p_session_id
    AND stage_slug = p_stage_slug
    AND iteration_number = p_iteration_number
    AND status NOT IN (
      'completed',
      'failed',
      'retry_loop_failed',
      'paused_nsf',
      'paused_user',
      'waiting_for_children',
      'waiting_for_prerequisite',
      'superseded'
    );

  GET DIAGNOSTICS v_paused_count = ROW_COUNT;
  RETURN v_paused_count;
END;
$$;

COMMENT ON FUNCTION public.pause_active_jobs(UUID, TEXT, INTEGER) IS
'Sets all active (non-terminal, non-waiting, non-paused) jobs for the given session/stage/iteration to paused_user. Stores current status in error_details.original_status and sets user_paused. Only the project owner may call this. Returns the number of jobs paused.';

GRANT EXECUTE ON FUNCTION public.pause_active_jobs(UUID, TEXT, INTEGER) TO authenticated;

-- Generalize resume: same logic as 20260302193405_nsf_pause_resume.sql but resume both paused_nsf and paused_user,
-- and strip user_paused from error_details in addition to original_status and nsf_paused.
CREATE OR REPLACE FUNCTION public.resume_paused_nsf_jobs(
  p_session_id UUID,
  p_stage_slug TEXT,
  p_iteration_number INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  -- Ownership: only the project owner can resume jobs for their session
  IF NOT EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects p ON p.id = ds.project_id
    WHERE ds.id = p_session_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'resume_paused_nsf_jobs: session not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Atomic resume: restore original_status (mapping processing -> pending so worker can re-claim),
  -- strip original_status, nsf_paused, and user_paused from error_details.
  -- Assumption: Node 2 (pauseJobsForNsf) never sets paused_nsf for jobs whose original_status
  -- is waiting_for_children or waiting_for_prerequisite; resume need not handle those.
  UPDATE public.dialectic_generation_jobs
  SET
    status = CASE
      WHEN (error_details->>'original_status') = 'processing' THEN 'pending'
      ELSE COALESCE(error_details->>'original_status', 'pending')
    END,
    error_details = error_details - 'original_status' - 'nsf_paused' - 'user_paused'
  WHERE session_id = p_session_id
    AND stage_slug = p_stage_slug
    AND iteration_number = p_iteration_number
    AND status IN ('paused_nsf', 'paused_user');

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.resume_paused_nsf_jobs(UUID, TEXT, INTEGER) IS
'Resumes all jobs in paused_nsf or paused_user for the given session/stage/iteration. Restores status from error_details.original_status (processing is mapped to pending so the worker can re-claim). Only the project owner may call this. Passive wait statuses (waiting_for_children, waiting_for_prerequisite) are never stored as original_status by the backend.';

GRANT EXECUTE ON FUNCTION public.resume_paused_nsf_jobs(UUID, TEXT, INTEGER) TO authenticated;
