-- paused_nsf job status, trigger exclusions, and resume_paused_nsf_jobs RPC
--
-- Introduces the paused_nsf status semantics: jobs paused for "Insufficient funds" are
-- non-terminal and excluded from worker-invoking triggers. Adds RPC to resume by
-- restoring original_status from error_details.

-- handle_job_completion() verification (20260109165706_state_machine_fix.sql):
-- The terminal check (line 204: NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed'))
-- and the sibling count (lines 240-241: FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed')))
-- already exclude paused_nsf by omission. paused_nsf is intentionally non-terminal so parent
-- PLAN jobs remain in waiting_for_children until paused jobs resume.

-- on_job_status_change trigger verification (20260109165706_state_machine_fix.sql line 168):
-- WHEN clause fires only for ('pending', 'pending_next_step', 'pending_continuation', 'retrying', 'processing').
-- paused_nsf is intentionally excluded so the dialectic-worker is not invoked for paused jobs.

-- on_new_job_created trigger verification (20260220213950_conditional_on_new_job_created.sql line 17):
-- WHEN clause fires only for ('pending', 'pending_continuation'). paused_nsf is intentionally excluded.

-- status column: dialectic_generation_jobs.status is unconstrained TEXT (20250711142317).
-- paused_nsf is a valid value; no schema change required.

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
  -- strip original_status and nsf_paused from error_details.
  -- Assumption: Node 2 (pauseJobsForNsf) never sets paused_nsf for jobs whose original_status
  -- is waiting_for_children or waiting_for_prerequisite; resume need not handle those.
  UPDATE public.dialectic_generation_jobs
  SET
    status = CASE
      WHEN (error_details->>'original_status') = 'processing' THEN 'pending'
      ELSE COALESCE(error_details->>'original_status', 'pending')
    END,
    error_details = error_details - 'original_status' - 'nsf_paused'
  WHERE session_id = p_session_id
    AND stage_slug = p_stage_slug
    AND iteration_number = p_iteration_number
    AND status = 'paused_nsf';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.resume_paused_nsf_jobs(UUID, TEXT, INTEGER) IS
'Resumes all jobs in paused_nsf for the given session/stage/iteration. Restores status from error_details.original_status (processing is mapped to pending so the worker can re-claim). Only the project owner may call this. Passive wait statuses (waiting_for_children, waiting_for_prerequisite) are never stored as original_status by the backend.';

GRANT EXECUTE ON FUNCTION public.resume_paused_nsf_jobs(UUID, TEXT, INTEGER) TO authenticated;
