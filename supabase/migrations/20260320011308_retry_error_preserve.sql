-- Retry exhaustion: merge trigger metadata into existing error_details instead of replacing.
-- Preserves failedAttempts (and other keys) written by retryJob when status becomes retry_loop_failed.

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
          error_details = COALESCE(NEW.error_details, '{}'::jsonb) || jsonb_build_object(
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
