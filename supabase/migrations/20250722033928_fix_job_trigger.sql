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
BEGIN
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
  v_body := v_body - 'record.payload.user_jwt';

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
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
      VALUES (NEW.id, 'Successfully invoked dialectic worker.');
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
      VALUES (NEW.id, 'Failed to invoke dialectic worker via HTTP.', SQLERRM);
    END;
    
  ELSE
    -- In local development or environments without pg_net, just log
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
    VALUES (NEW.id, 'Trigger fired, but pg_net extension not available in this environment.');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop the existing trigger to ensure a clean re-application
DROP TRIGGER IF EXISTS on_new_job_created ON public.dialectic_generation_jobs;

-- Recreate the trigger to use the updated function
CREATE TRIGGER on_new_job_created
  AFTER INSERT
  ON public.dialectic_generation_jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.invoke_dialectic_worker();

COMMENT ON TRIGGER on_new_job_created ON public.dialectic_generation_jobs
IS 'When a new job is created, this trigger invokes the dialectic-worker Edge Function.';