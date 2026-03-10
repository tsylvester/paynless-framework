CREATE OR REPLACE FUNCTION public.invoke_dialectic_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_final_url text;
  v_user_jwt text;
  v_body jsonb;
  v_is_test_job boolean;
BEGIN
  -- First, try to construct the production URL from the standard Supabase environment variable.
  -- If this fails (e.g., in a local dev environment), fall back to the internal docker host.
  BEGIN
    v_final_url := concat(
      'https://',
      substring(
        current_setting('secret.SUPABASE_URL'),
        'https://(.*?)\.supabase\.co'
      ),
      '.functions.run/dialectic-worker'
    );
  EXCEPTION WHEN OTHERS THEN
    -- If the secret is not available or has an unexpected format, assume local development.
    v_final_url := 'http://host.docker.internal:54321/functions/v1/dialectic-worker';
  END;

  -- A null result from substring would also cause issues, so double-check and fallback.
  IF v_final_url IS NULL THEN
      v_final_url := 'http://host.docker.internal:54321/functions/v1/dialectic-worker';
  END IF;
  
  -- Test jobs should be skipped to avoid unnecessary worker invocations during tests.
  v_is_test_job := COALESCE((NEW.payload ->> 'is_test_job')::boolean, false);

  IF v_is_test_job THEN
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
    VALUES (NEW.id, 'Test job detected. Skipping HTTP worker invocation.');
    RETURN NEW;
  END IF;

  -- Extract user JWT from the job payload for secure, scoped authentication.
  v_user_jwt := NEW.payload ->> 'user_jwt';

  -- Prepare the body for the worker, passing the full job record.
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