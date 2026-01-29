-- Step 65.c: Fix invoke_worker_on_status_change() to Set running_{stage} Session Status
-- This migration adds session status transition logic when root PLAN jobs start processing.
-- The function now updates dialectic_sessions.status from pending_{stage_slug} to running_{stage_slug}
-- when a root PLAN job transitions from pending to processing.

CREATE OR REPLACE FUNCTION public.invoke_worker_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_final_url text;
  v_local_dev_url text := 'http://host.docker.internal:54321';
  v_project_ref text;
  v_user_jwt text;
  v_body jsonb;
  v_attempt_count integer;
  v_max_retries integer;
  v_statuses_requiring_worker text[] := ARRAY['pending', 'pending_next_step', 'pending_continuation', 'retrying'];
  -- Variables for session status update
  v_session_id UUID;
  v_stage_slug TEXT;
BEGIN
  -- Part 1: Update session status for root PLAN jobs starting processing
  -- This runs for ALL status changes, not just worker-invoking statuses
  -- Check if this is a root PLAN job transitioning from pending to processing
  IF NEW.parent_job_id IS NULL 
     AND NEW.job_type = 'PLAN' 
     AND OLD.status = 'pending' 
     AND NEW.status = 'processing' THEN
    
    -- Extract identifiers from job table columns (NOT payload)
    v_session_id := NEW.session_id;
    v_stage_slug := NEW.stage_slug;
    
    -- Update session status to running_{stage_slug} only if current status is pending_{stage_slug}
    -- This prevents double-transition and ensures idempotency
    UPDATE public.dialectic_sessions
    SET status = 'running_' || v_stage_slug,
        updated_at = now()
    WHERE id = v_session_id
      AND status = 'pending_' || v_stage_slug;
  END IF;

  -- Part 2: Existing HTTP worker invocation logic (unchanged)
  -- Only process when status transitions to one that requires worker invocation
  -- AND the status actually changed (not on every update)
  IF (NEW.status = ANY(v_statuses_requiring_worker)) AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    -- Extract retry limits from the job row (only needed for retrying status)
    v_attempt_count := NEW.attempt_count;
    v_max_retries := NEW.max_retries;
    
    -- Handle special retry limit checking for retrying status
    IF NEW.status = 'retrying' THEN
      -- Check if retries are exhausted
      -- attempt_count represents the number of attempts completed (0 = original attempt, 1+ = retries)
      -- max_retries is the maximum number of retries allowed (default 3)
      -- Total attempts allowed = max_retries + 1 (1 original + max_retries retries)
      -- When retryJob sets status to 'retrying', it has already incremented attempt_count
      -- So if attempt_count >= max_retries + 1, we've exceeded the limit
      -- Example: max_retries=3, attempt_count=4 means we've done 1 original + 3 retries + trying a 4th retry
      IF v_attempt_count >= (v_max_retries + 1) THEN
        -- Mark job as failed - retries exhausted
        UPDATE public.dialectic_generation_jobs
        SET 
          status = 'retry_loop_failed',
          completed_at = now(),
          error_details = jsonb_build_object(
            'finalError', 'Retry limit exceeded',
            'attempt_count', v_attempt_count,
            'max_retries', v_max_retries,
            'message', format('Job exceeded maximum retry limit. Attempt count: %s, Max retries: %s', v_attempt_count, v_max_retries)
          )
        WHERE id = NEW.id;
        
        RETURN NEW;
      END IF;
    END IF;
    
    -- Skip test jobs
    IF COALESCE(NEW.is_test_job, false) THEN
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
      VALUES (NEW.id, format('Test job detected. Skipping HTTP worker invocation for status: %s.', NEW.status));
      RETURN NEW;
    END IF;
    
    -- Determine the worker URL (reusing logic from invoke_dialectic_worker)
    BEGIN
      SELECT ds.decrypted_secret INTO v_project_ref
      FROM vault.decrypted_secrets ds
      WHERE ds.name = 'SUPABASE_URL';
      
      IF v_project_ref IS NOT NULL THEN
        v_final_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/dialectic-worker';
      ELSE
        v_final_url := v_local_dev_url || '/functions/v1/dialectic-worker';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_final_url := v_local_dev_url || '/functions/v1/dialectic-worker';
    END;
    
    -- Extract user JWT from the job payload
    v_user_jwt := NEW.payload ->> 'user_jwt';
    
    -- Prepare the body for the worker
    v_body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'type', TG_OP,
      'record', row_to_json(NEW)
    );
    
    -- Log the invocation attempt
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
    VALUES (NEW.id, format('Preparing HTTP call for status: %s', NEW.status), 
            jsonb_build_object('url', v_final_url, 'jwt_exists', v_user_jwt IS NOT NULL, 
                              'status', NEW.status, 'old_status', OLD.status,
                              'attempt_count', v_attempt_count, 'max_retries', v_max_retries)::text);
    
    IF v_user_jwt IS NULL THEN
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
      VALUES (NEW.id, format('Trigger fired for status %s, but user_jwt was not found in the payload.', NEW.status));
    END IF;
    
    -- Check if pg_net extension is available before attempting HTTP call
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      
      -- Attempt to call the dialectic worker via HTTP
      BEGIN
        PERFORM net.http_post(
          url:= v_final_url,
          headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_user_jwt
          ),
          body:=v_body
        );
        
        INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
        VALUES (NEW.id, 'invoke_worker_on_status_change: after_post',
                jsonb_build_object('url', v_final_url, 'status', NEW.status, 
                                 'old_status', OLD.status, 'attempt_count', v_attempt_count)::text);
        
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
        VALUES (NEW.id, 'invoke_worker_on_status_change: post_failed',
                jsonb_build_object('url', v_final_url, 'error', SQLERRM, 
                                 'status', NEW.status, 'old_status', OLD.status, 'attempt_count', v_attempt_count)::text);
        RAISE WARNING 'Failed to invoke dialectic worker via HTTP for status %: %', NEW.status, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Dialectic worker status change trigger fired for job % with status %, but pg_net extension is not available in this environment', NEW.id, NEW.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the trigger to also fire on 'processing' status
-- This allows the function to handle session status updates when jobs transition to processing
DROP TRIGGER IF EXISTS on_job_status_change ON public.dialectic_generation_jobs;

CREATE TRIGGER on_job_status_change
  AFTER UPDATE OF status ON public.dialectic_generation_jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('pending', 'pending_next_step', 'pending_continuation', 'retrying', 'processing') AND (OLD.status IS NULL OR OLD.status != NEW.status))
  EXECUTE FUNCTION public.invoke_worker_on_status_change();

COMMENT ON TRIGGER on_job_status_change ON public.dialectic_generation_jobs
IS 'Generic trigger that invokes the dialectic-worker Edge Function when job status changes to any status requiring processing: pending (via UPDATE), pending_next_step (PLAN jobs after children complete), pending_continuation (continuation jobs), retrying (with retry limit checking), or processing (for session status updates). Replaces the specialized on_job_retrying trigger.';

COMMENT ON FUNCTION public.invoke_worker_on_status_change() IS 'Generic trigger function that invokes the dialectic-worker Edge Function for status changes requiring processing. Also updates session status to running_{stage_slug} when root PLAN jobs transition from pending to processing. Handles retry limit checking for retrying status, skips test jobs, and logs all invocation attempts.';

-- Step 66.c: Fix handle_job_completion() to Add Session Completion Check (Part 3)
-- This migration adds Part 3 to handle_job_completion() function to check for stage completion
-- and update session status when all root PLAN jobs for a stage are completed.

CREATE OR REPLACE FUNCTION public.handle_job_completion()
RETURNS TRIGGER AS $$
DECLARE
    parent_id_val UUID;
    prereq_for_job_id UUID;
    total_siblings INTEGER;
    terminal_siblings INTEGER;
    failed_siblings INTEGER;
    parent_payload JSONB;
    current_step INTEGER;
    total_steps INTEGER;
    -- Part 3 variables for session status update
    v_session_id UUID;
    v_stage_slug TEXT;
    v_iteration_number INTEGER;
    v_completed_plans INTEGER;
    v_total_plans INTEGER;
    v_incomplete_jobs INTEGER;
    v_current_stage_id UUID;
    v_process_template_id UUID;
    v_next_stage_id UUID;
    v_next_stage_slug TEXT;
BEGIN
    -- Only act on jobs entering a terminal state.
    IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- For updates, ensure it wasn't already in a terminal state to prevent re-triggering.
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- --- Part 1: Handle Prerequisite Dependencies ---
    -- Check if any job was waiting on this one to complete.
    SELECT id INTO prereq_for_job_id
    FROM public.dialectic_generation_jobs
    WHERE prerequisite_job_id = NEW.id
    AND status = 'waiting_for_prerequisite'
    LIMIT 1;

    IF prereq_for_job_id IS NOT NULL AND NEW.status = 'completed' THEN
        -- The prerequisite was met, so set the waiting job to pending.
        UPDATE public.dialectic_generation_jobs
        SET status = 'pending'
        WHERE id = prereq_for_job_id;
    ELSIF prereq_for_job_id IS NOT NULL AND NEW.status != 'completed' THEN
        -- The prerequisite failed, so fail the waiting job.
        UPDATE public.dialectic_generation_jobs
        SET status = 'failed',
            error_details = jsonb_build_object('reason', 'Prerequisite job failed.', 'prerequisite_id', NEW.id)
        WHERE id = prereq_for_job_id;
    END IF;

    -- --- Part 2: Handle Parent/Child Dependencies ---
    parent_id_val := NEW.parent_job_id;
    IF parent_id_val IS NULL THEN
        -- Not a child job, but might be a root PLAN job that completes a stage
        -- Continue to Part 3 to check for stage completion
    ELSE
        -- Count total and terminal siblings (ALWAYS exclude RENDER jobs - they never block recipe continuation)
        SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed'))
        INTO total_siblings, terminal_siblings
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id = parent_id_val AND job_type != 'RENDER';

        -- If all siblings are now in a terminal state, we can act on the parent.
        IF total_siblings = terminal_siblings THEN
            -- Check if any sibling failed (ALWAYS exclude RENDER jobs - their failures never affect parent jobs)
            SELECT COUNT(*)
            INTO failed_siblings
            FROM public.dialectic_generation_jobs
            WHERE parent_job_id = parent_id_val AND status IN ('failed', 'retry_loop_failed') AND job_type != 'RENDER';

            IF failed_siblings > 0 THEN
                -- If any child failed, the entire parent plan fails.
                UPDATE public.dialectic_generation_jobs
                SET status = 'failed',
                    error_details = jsonb_build_object('reason', 'One or more child jobs failed.')
                WHERE id = parent_id_val AND status = 'waiting_for_children';
            ELSE
                -- All children completed successfully. Check if it's the final step of a multi-step job.
                SELECT payload INTO parent_payload
                FROM public.dialectic_generation_jobs
                WHERE id = parent_id_val;

                IF parent_payload IS NOT NULL AND jsonb_path_exists(parent_payload, '$.step_info.current_step') AND jsonb_path_exists(parent_payload, '$.step_info.total_steps') THEN
                    current_step := (parent_payload->'step_info'->>'current_step')::INTEGER;
                    total_steps := (parent_payload->'step_info'->>'total_steps')::INTEGER;

                    IF current_step >= total_steps THEN
                        -- This was the final step, so the parent job is now complete.
                        UPDATE public.dialectic_generation_jobs
                        SET status = 'completed'
                        WHERE id = parent_id_val AND status = 'waiting_for_children';
                    ELSE
                        -- There are more steps, wake up the parent for the next one.
                        UPDATE public.dialectic_generation_jobs
                        SET status = 'pending_next_step'
                        WHERE id = parent_id_val AND status = 'waiting_for_children';
                    END IF;
                ELSE
                    -- Not a multi-step job, or payload is missing info. Default to waking parent.
                    UPDATE public.dialectic_generation_jobs
                    SET status = 'pending_next_step'
                    WHERE id = parent_id_val AND status = 'waiting_for_children';
                END IF;
            END IF;
        END IF;
        
        -- After handling parent/child, return (child jobs don't trigger stage completion)
        RETURN NEW;
    END IF;

    -- --- Part 3: Session status update on stage completion ---
    -- Check if this is a root PLAN job completion
    IF NEW.parent_job_id IS NULL AND NEW.job_type = 'PLAN' AND NEW.status = 'completed' THEN
        -- Extract identifiers from job table columns (NOT payload)
        v_session_id := NEW.session_id;
        v_stage_slug := NEW.stage_slug;
        v_iteration_number := COALESCE(NEW.iteration_number, 1);

        -- Query root jobs for stage completion
        -- Note: We don't use FOR UPDATE here because we're using aggregate functions
        -- The transaction isolation level provides sufficient protection against race conditions
        -- Count PLAN jobs (all PLAN jobs, regardless of status, to get total)
        -- Count incomplete jobs (non-RENDER, non-waiting jobs that aren't in terminal states)
        SELECT 
            COUNT(*) FILTER (WHERE job_type = 'PLAN' AND status = 'completed') as completed_plans,
            COUNT(*) FILTER (WHERE job_type = 'PLAN') as total_plans,
            COUNT(*) FILTER (
                WHERE job_type != 'RENDER' 
                  AND status != 'waiting_for_prerequisite'
                  AND status NOT IN ('completed', 'failed', 'retry_loop_failed')
            ) as incomplete_jobs
        INTO v_completed_plans, v_total_plans, v_incomplete_jobs
        FROM public.dialectic_generation_jobs
        WHERE parent_job_id IS NULL
          AND session_id = v_session_id
          AND stage_slug = v_stage_slug
          AND COALESCE(iteration_number, 1) = v_iteration_number;

        -- Check completion condition: all PLAN jobs completed and no incomplete jobs
        IF v_completed_plans = v_total_plans AND v_total_plans > 0 AND v_incomplete_jobs = 0 THEN
            -- Get current stage ID
            SELECT id INTO v_current_stage_id
            FROM public.dialectic_stages
            WHERE slug = v_stage_slug;

            -- Only proceed if stage ID was found
            IF v_current_stage_id IS NOT NULL THEN
                -- Get process template ID via session → project join
                SELECT p.process_template_id INTO v_process_template_id
                FROM public.dialectic_sessions s
                JOIN public.dialectic_projects p ON s.project_id = p.id
                WHERE s.id = v_session_id;

                -- Only proceed if process template ID was found
                IF v_process_template_id IS NOT NULL THEN
                    -- Query stage transitions to find next stage (get both ID and slug)
                    SELECT ds.id, ds.slug INTO v_next_stage_id, v_next_stage_slug
                    FROM public.dialectic_stage_transitions dst
                    JOIN public.dialectic_stages ds ON dst.target_stage_id = ds.id
                    WHERE dst.source_stage_id = v_current_stage_id
                      AND dst.process_template_id = v_process_template_id
                    LIMIT 1;

                    -- Update session status and current_stage_id synchronously (in same transaction)
                    UPDATE public.dialectic_sessions
                    SET status = CASE 
                        WHEN v_next_stage_slug IS NOT NULL THEN 'pending_' || v_next_stage_slug
                        ELSE 'iteration_complete_pending_review'
                    END,
                    current_stage_id = CASE 
                        WHEN v_next_stage_id IS NOT NULL THEN v_next_stage_id
                        ELSE current_stage_id  -- Keep current stage if terminal
                    END,
                    updated_at = now()
                    WHERE id = v_session_id;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_job_completion() IS 'Trigger function that handles job completion logic in three parts: (1) Prerequisite dependencies - unblocks jobs waiting for prerequisites, (2) Parent/child dependencies - updates parent job status when all children complete, (3) Session status update - advances session to next stage when all root PLAN jobs for a stage complete. Excludes RENDER jobs and waiting_for_prerequisite jobs from completion checks.';

-- Fix seed_prompt slug references in recipe definitions
-- The seed_prompt is only created for the initial stage (thesis), but recipes in later stages
-- incorrectly reference it with their own stage slug. This fixes all seed_prompt references
-- to use "thesis" as the slug, allowing findSourceDocuments to correctly locate the seed_prompt.

-- Fix dialectic_recipe_template_steps
UPDATE public.dialectic_recipe_template_steps
SET inputs_required = (
    SELECT jsonb_agg(
        CASE 
            WHEN rule->>'type' = 'seed_prompt' AND rule->>'slug' != 'thesis' THEN
                jsonb_set(rule, '{slug}', '"thesis"')
            ELSE
                rule
        END
    )
    FROM jsonb_array_elements(inputs_required) AS rule
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(inputs_required) AS rule
    WHERE rule->>'type' = 'seed_prompt'
      AND rule->>'slug' != 'thesis'
      AND rule->>'slug' IN ('antithesis', 'synthesis', 'parenthesis', 'paralysis')
);

-- Fix dialectic_stage_recipe_steps
UPDATE public.dialectic_stage_recipe_steps
SET inputs_required = (
    SELECT jsonb_agg(
        CASE 
            WHEN rule->>'type' = 'seed_prompt' AND rule->>'slug' != 'thesis' THEN
                jsonb_set(rule, '{slug}', '"thesis"')
            ELSE
                rule
        END
    )
    FROM jsonb_array_elements(inputs_required) AS rule
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(inputs_required) AS rule
    WHERE rule->>'type' = 'seed_prompt'
      AND rule->>'slug' != 'thesis'
      AND rule->>'slug' IN ('antithesis', 'synthesis', 'parenthesis', 'paralysis')
);
