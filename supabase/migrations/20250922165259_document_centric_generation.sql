-- Step 2.a: Create a new ENUM type for job_type and add the column.
CREATE TYPE public.dialectic_job_type_enum AS ENUM (
    'PLAN',
    'EXECUTE',
    'RENDER'
);

ALTER TABLE public.dialectic_generation_jobs
ADD COLUMN job_type public.dialectic_job_type_enum;

-- Step 2.b: Add the is_test_job column.
ALTER TABLE public.dialectic_generation_jobs
ADD COLUMN is_test_job BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2.c: Add new columns to the dialectic_project_resources table.
-- The FK for source_contribution_id will be added later to resolve the circular dependency.
ALTER TABLE public.dialectic_project_resources
ADD COLUMN resource_type TEXT,
ADD COLUMN session_id UUID,
ADD COLUMN stage_slug TEXT,
ADD COLUMN iteration_number INTEGER,
ADD COLUMN source_contribution_id UUID;

-- Step 2.d: Add new columns to the dialectic_contributions table.
-- The FK for source_prompt_resource_id will be added later.
ALTER TABLE public.dialectic_contributions
ADD COLUMN source_prompt_resource_id UUID,
ADD COLUMN is_header BOOLEAN NOT NULL DEFAULT FALSE;

-- Add the foreign key constraints now that the columns exist on both tables.
ALTER TABLE public.dialectic_project_resources
ADD CONSTRAINT fk_session_id FOREIGN KEY (session_id) REFERENCES public.dialectic_sessions(id),
ADD CONSTRAINT fk_source_contribution_id FOREIGN KEY (source_contribution_id) REFERENCES public.dialectic_contributions(id);

ALTER TABLE public.dialectic_contributions
ADD CONSTRAINT fk_source_prompt_resource_id FOREIGN KEY (source_prompt_resource_id) REFERENCES public.dialectic_project_resources(id);

-- Phase 4, Step 4.a.i: Add target_contribution_id to dialectic_feedback
ALTER TABLE public.dialectic_feedback
ADD COLUMN target_contribution_id UUID,
ADD CONSTRAINT fk_target_contribution_id FOREIGN KEY (target_contribution_id) REFERENCES public.dialectic_contributions(id);

-- Implementation Plan, Step 1.a.ii: Create dialectic_document_templates table
CREATE TABLE public.dialectic_document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES public.dialectic_domains(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Implementation Plan, Step 1.a.iii: Update system_prompts table
ALTER TABLE public.system_prompts
ADD COLUMN document_template_id UUID,
ADD CONSTRAINT fk_document_template_id FOREIGN KEY (document_template_id) REFERENCES public.dialectic_document_templates(id);

-- Step 2.e.iii: Update the database trigger to use the new is_test_job column
CREATE OR REPLACE FUNCTION public.invoke_dialectic_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_final_url text;
  v_project_ref text;
  v_user_jwt text;
  v_body jsonb;
BEGIN
  -- Correctly determine the worker URL by querying Vault for the project reference.
  -- Fall back to the internal Docker host if the secret is not found or an error occurs.
  BEGIN
    SELECT ds.decrypted_secret INTO v_project_ref
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'SUPABASE_URL';

    IF v_project_ref IS NOT NULL THEN
      v_final_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/dialectic-worker';
    ELSE
      v_final_url := 'http://host.docker.internal:54321/functions/v1/dialectic-worker';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_final_url := 'http://host.docker.internal:54321/functions/v1/dialectic-worker';
  END;
  
  -- Test jobs should be skipped to avoid unnecessary worker invocations during tests.
  IF NEW.is_test_job THEN
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

  -- Log the exact URL for diagnostics.
  INSERT INTO public.dialectic_trigger_logs (job_id, log_message, error_details)
  VALUES (NEW.id, 'Preparing HTTP call', jsonb_build_object('url', v_final_url, 'jwt_exists', v_user_jwt IS NOT NULL)::text);

  IF v_user_jwt IS NULL THEN
    INSERT INTO public.dialectic_trigger_logs (job_id, log_message)
    VALUES (NEW.id, 'Trigger fired, but user_jwt was not found in the payload.');
  END IF;

  -- Check if pg_net extension is available before attempting HTTP call.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    
    -- Attempt to call the dialectic worker via HTTP.
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
