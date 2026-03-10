-- Fix: Prevent on_new_job_created trigger from firing for non-actionable statuses
--
-- Root cause: The INSERT trigger fires for ALL inserted rows, including skeleton PLAN jobs
-- with status 'waiting_for_prerequisite'. The worker correctly rejects these via its atomic
-- claim (.neq('status', 'waiting_for_prerequisite')), but the catch block unconditionally
-- marks them as 'failed', destroying the prerequisite chain.
--
-- Solution: Add a WHEN clause so the trigger only fires for statuses that the worker
-- should actually process. Jobs in 'waiting_for_prerequisite' or 'waiting_for_children'
-- are woken by handle_job_completion() which sets them to 'pending', then the existing
-- on_job_status_change trigger picks them up.

DROP TRIGGER IF EXISTS on_new_job_created ON public.dialectic_generation_jobs;

CREATE TRIGGER on_new_job_created
  AFTER INSERT
  ON public.dialectic_generation_jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('pending', 'pending_continuation'))
  EXECUTE FUNCTION public.invoke_dialectic_worker();

COMMENT ON TRIGGER on_new_job_created ON public.dialectic_generation_jobs
IS 'When a new job is created with an actionable status (pending or pending_continuation), this trigger invokes the dialectic-worker Edge Function. Jobs inserted with waiting_for_prerequisite or waiting_for_children are excluded — they are woken by handle_job_completion and picked up by on_job_status_change.';
