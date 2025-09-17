-- Idempotent fix for Authorization header in invoke_dialectic_worker
-- Ensures pg_net http_post receives headers as JSONB with a proper Bearer token

CREATE OR REPLACE FUNCTION public.invoke_dialectic_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_local_dev_url text := 'http://host.docker.internal:54321';
  v_final_url text;
  v_user_jwt text;
  v_body jsonb;
  v_is_test_job boolean;
BEGIN
  v_is_test_job := COALESCE((NEW.payload ->> 'is_test_job')::boolean, false);

  IF v_is_test_job THEN
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
    VALUES (NEW.id, 'Test job detected. Skipping HTTP worker invocation.');
    RETURN NEW;
  END IF;

  v_url := current_setting('app.supabase.url', true);
  v_url := COALESCE(v_url, v_local_dev_url);
  v_final_url := v_url || '/functions/v1/dialectic-worker';
  
  -- Extract user JWT from the job payload
  v_user_jwt := NEW.payload ->> 'user_jwt';

  -- Prepare the body for the worker, excluding the user_jwt
  v_body := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'type', TG_OP,
    'record', row_to_json(NEW)
  );


  -- Log the exact URL for diagnostics
  INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
  VALUES (NEW.id, 'Preparing HTTP call', jsonb_build_object('url', v_final_url, 'jwt_exists', v_user_jwt IS NOT NULL)::text);

  IF v_user_jwt IS NULL THEN
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
    VALUES (NEW.id, 'Trigger fired, but user_jwt was not found in the payload.');
    -- Depending on requirements, you might want to `RETURN NEW;` here or fail.
    -- For now, we'll let it proceed and likely fail at the worker, which will log more clearly.
  END IF;

  -- Check if pg_net extension is available before attempting HTTP call.
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
      VALUES (NEW.id, 'invoke_dialectic_worker: after_post',
              jsonb_build_object('url', v_final_url, 'status', NEW.status));

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
      VALUES (NEW.id, 'invoke_dialectic_worker: post_failed',
              jsonb_build_object('url', v_final_url, 'error', SQLERRM, 'status', NEW.status));
      RAISE WARNING 'Failed to invoke dialectic worker via HTTP: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Dialectic worker trigger fired for job %, but pg_net extension is not available in this environment', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Predicate-based completion check for stage/iteration completeness
CREATE OR REPLACE FUNCTION public.handle_job_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_session_id uuid;
    v_stage_slug text;
    v_iteration_number int;
    v_job_id uuid;
    v_is_stage_complete boolean;
    v_has_failures boolean;
    v_final_session_status text;
    v_project_owner_id uuid;
    v_notification_type text;
    v_notification_data jsonb;
BEGIN
    -- Act only when a job enters a terminal state; WHEN clause enforces this too
    IF NEW.status IN ('completed', 'retry_loop_failed', 'failed') THEN
        v_job_id := NEW.id;

        -- Extract identifiers from job payload
        v_session_id := (NEW.payload ->> 'sessionId')::uuid;
        v_stage_slug := NEW.payload ->> 'stageSlug';
        v_iteration_number := COALESCE((NEW.payload ->> 'iterationNumber')::int, 1);

        -- Stage is complete when no jobs remain in any pending/processing/retrying predicate family
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.dialectic_generation_jobs
            WHERE (payload ->> 'sessionId')::uuid = v_session_id
              AND (payload ->> 'stageSlug') = v_stage_slug
              AND COALESCE(((payload ->> 'iterationNumber')::int), 1) = v_iteration_number
              AND (
                    status LIKE 'pending%'
                 OR status LIKE 'processing%'
                 OR status LIKE 'retrying%'
              )
        ) INTO v_is_stage_complete;

        IF v_is_stage_complete THEN
            -- Any failures across the set?
            SELECT EXISTS (
                SELECT 1
                FROM public.dialectic_generation_jobs
                WHERE (payload ->> 'sessionId')::uuid = v_session_id
                  AND (payload ->> 'stageSlug') = v_stage_slug
                  AND COALESCE(((payload ->> 'iterationNumber')::int), 1) = v_iteration_number
                  AND status IN ('retry_loop_failed', 'failed')
            ) INTO v_has_failures;

            -- Project owner for notification
            SELECT p.user_id INTO v_project_owner_id
            FROM public.dialectic_sessions s
            JOIN public.dialectic_projects p ON s.project_id = p.id
            WHERE s.id = v_session_id;

            IF v_has_failures THEN
                v_final_session_status := v_stage_slug || '_generation_failed';
                v_notification_type := 'contribution_stage_generation_failed';
                v_notification_data := jsonb_build_object(
                    'session_id', v_session_id,
                    'stage_slug', v_stage_slug,
                    'iteration_number', v_iteration_number,
                    'reason', 'One or more model contributions failed to generate.'
                );
            ELSE
                v_final_session_status := v_stage_slug || '_generation_complete';
                v_notification_type := 'contribution_generation_complete';
                v_notification_data := jsonb_build_object(
                    'session_id', v_session_id,
                    'stage_slug', v_stage_slug,
                    'iteration_number', v_iteration_number,
                    'job_id', v_job_id
                );
            END IF;

            UPDATE public.dialectic_sessions
            SET status = v_final_session_status
            WHERE id = v_session_id;

            IF v_project_owner_id IS NOT NULL THEN
                PERFORM public.create_notification_for_user(
                    v_project_owner_id,
                    v_notification_type,
                    v_notification_data
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

