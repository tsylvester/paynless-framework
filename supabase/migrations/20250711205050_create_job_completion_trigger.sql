CREATE OR REPLACE FUNCTION public.handle_job_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_session_id uuid;
    v_stage_slug text;
    v_iteration_number int;
    v_is_stage_complete boolean;
    v_has_failures boolean;
    v_final_session_status text;
    v_project_owner_id uuid;
    v_notification_type text;
    v_notification_data jsonb;
BEGIN
    -- This function only acts when a job enters a terminal state.
    -- The trigger's WHEN clause already filters for this, but this is a safety check.
    IF NEW.status IN ('completed', 'retry_loop_failed', 'failed') THEN
        
        -- Extract key identifiers from the job's payload.
        -- We use COALESCE for iterationNumber to safely handle cases where it might be omitted, defaulting to 1.
        v_session_id := (NEW.payload ->> 'sessionId')::uuid;
        v_stage_slug := NEW.payload ->> 'stageSlug';
        v_iteration_number := COALESCE((NEW.payload ->> 'iterationNumber')::int, 1);

        -- Check if there are any other jobs for this specific stage and iteration that are NOT yet finished.
        -- If this query returns true (i.e., no pending/processing jobs exist), the stage is complete.
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.dialectic_generation_jobs
            WHERE (payload ->> 'sessionId')::uuid = v_session_id
              AND (payload ->> 'stageSlug') = v_stage_slug
              AND COALESCE(((payload ->> 'iterationNumber')::int), 1) = v_iteration_number
              AND status IN ('pending', 'processing', 'retrying')
        ) INTO v_is_stage_complete;

        -- If all jobs for this stage are now finished, we can determine and set the final session status.
        IF v_is_stage_complete THEN
            -- Check if any of the jobs in this completed set have failed.
            SELECT EXISTS (
                SELECT 1
                FROM public.dialectic_generation_jobs
                WHERE (payload ->> 'sessionId')::uuid = v_session_id
                  AND (payload ->> 'stageSlug') = v_stage_slug
                  AND COALESCE(((payload ->> 'iterationNumber')::int), 1) = v_iteration_number
                  AND status IN ('retry_loop_failed', 'failed')
            ) INTO v_has_failures;

            -- Get the project owner's ID for sending notifications.
            SELECT p.owner_id INTO v_project_owner_id
            FROM public.dialectic_sessions s
            JOIN public.dialectic_projects p ON s.project_id = p.id
            WHERE s.id = v_session_id;

            -- Determine the final status and notification details.
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
                    'iteration_number', v_iteration_number
                );
            END IF;

            -- Update the main dialectic_sessions table with the final status.
            UPDATE public.dialectic_sessions
            SET status = v_final_session_status
            WHERE id = v_session_id;

            -- Send a notification to the project owner if their ID was found.
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
$function$

create or replace function public.invoke_dialectic_worker()
returns trigger
language plpgsql
as $$
begin
  perform net.http_post(
    url:=concat(
      'https://',
      substring(
        current_setting('secret.SUPABASE_URL'),
        'https://(.*?)\.supabase\.co'
      ),
      '.functions.run/dialectic-worker'
    ),
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer " || current_setting("secret.SUPABASE_SERVICE_ROLE_KEY")}',
    body:=json_build_object(
      'table', TG_TABLE_NAME,
      'type', TG_OP,
      'record', new
    )::text
  );
  return new;
end;
$$;

drop trigger if exists on_new_job_created on public.dialectic_generation_jobs;

create trigger on_new_job_created
  after insert
  on public.dialectic_generation_jobs
  for each row
  execute procedure public.invoke_dialectic_worker(); 

  -- Drop the trigger if it exists to ensure idempotency
DROP TRIGGER IF EXISTS on_job_terminal_state ON public.dialectic_generation_jobs;

-- Create the trigger to execute on updates to the job status
CREATE TRIGGER on_job_terminal_state
  AFTER UPDATE OF status ON public.dialectic_generation_jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'retry_loop_failed', 'failed'))
  EXECUTE PROCEDURE public.handle_job_completion();

COMMENT ON TRIGGER on_job_terminal_state ON public.dialectic_generation_jobs
IS 'When a job enters a terminal state, this trigger invokes a function to check if the entire stage is complete and updates the parent session status accordingly.'; 