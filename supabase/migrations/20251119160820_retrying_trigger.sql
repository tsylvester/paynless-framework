-- Create trigger to re-invoke worker when job status changes to 'retrying'
-- The trigger checks retry limits: if attempt_count > max_retries, marks job as failed
-- Otherwise, invokes the worker to process the retry

CREATE OR REPLACE FUNCTION public.handle_job_retrying()
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
BEGIN
  -- Only process when status transitions to 'retrying'
  IF NEW.status = 'retrying' AND (OLD.status IS NULL OR OLD.status != 'retrying') THEN
    
    -- Extract retry limits from the job row
    v_attempt_count := NEW.attempt_count;
    v_max_retries := NEW.max_retries;
    
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
    
    -- Skip test jobs
    IF COALESCE(NEW.is_test_job, false) THEN
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
      VALUES (NEW.id, 'Test job detected. Skipping HTTP worker invocation for retry.');
      RETURN NEW;
    END IF;
    
    -- Determine the worker URL
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
    
    -- Log the retry attempt
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
    VALUES (NEW.id, 'Preparing HTTP call for retry', 
            jsonb_build_object('url', v_final_url, 'jwt_exists', v_user_jwt IS NOT NULL, 
                              'attempt_count', v_attempt_count, 'max_retries', v_max_retries)::text);
    
    IF v_user_jwt IS NULL THEN
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
      VALUES (NEW.id, 'Trigger fired for retry, but user_jwt was not found in the payload.');
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
        VALUES (NEW.id, 'handle_job_retrying: after_post',
                jsonb_build_object('url', v_final_url, 'status', NEW.status, 
                                 'attempt_count', v_attempt_count)::text);
        
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
        VALUES (NEW.id, 'handle_job_retrying: post_failed',
                jsonb_build_object('url', v_final_url, 'error', SQLERRM, 
                                 'status', NEW.status, 'attempt_count', v_attempt_count)::text);
        RAISE WARNING 'Failed to invoke dialectic worker via HTTP for retry: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Dialectic worker retry trigger fired for job %, but pg_net extension is not available in this environment', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists to ensure idempotency
DROP TRIGGER IF EXISTS on_job_retrying ON public.dialectic_generation_jobs;

-- Create the trigger to execute on updates to the job status
CREATE TRIGGER on_job_retrying
  AFTER UPDATE OF status ON public.dialectic_generation_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'retrying' AND (OLD.status IS NULL OR OLD.status != 'retrying'))
  EXECUTE FUNCTION public.handle_job_retrying();

COMMENT ON TRIGGER on_job_retrying ON public.dialectic_generation_jobs
IS 'When a job status is updated to retrying, this trigger checks retry limits and either marks the job as failed (if limits exceeded) or re-invokes the dialectic-worker Edge Function to process the retry.';

COMMENT ON FUNCTION public.handle_job_retrying() IS 'Handles job retry logic: checks if attempt_count exceeds max_retries, and either marks job as failed or invokes the worker for retry processing.';

-- Fix Recipe Stall: Exclude RENDER Jobs from Sibling Counts
-- RENDER jobs are ALWAYS side-effects and NEVER block recipe continuation.
-- They should be completely ignored when determining if siblings are complete or if parent jobs should proceed.
-- This applies to ALL sibling counting logic, not just specific cases.
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
        RETURN NEW; -- Not a child job, nothing more to do.
    END IF;

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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

