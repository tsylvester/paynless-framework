UPDATE public.dialectic_stages
SET
  input_artifact_rules = COALESCE(input_artifact_rules, '{}'::jsonb) || '{
    "processing_strategy": {
      "type": "task_isolation",
      "granularity": "per_thesis_contribution",
      "description": "Critiques each thesis individually, resulting in n*m calls.",
      "progress_reporting": {
        "message_template": "Critiquing thesis {current_item} of {total_items} using {model_name}..."
      }
    }
  }'::jsonb
WHERE
  slug = 'antithesis';

UPDATE public.dialectic_stages
SET
  input_artifact_rules = COALESCE(input_artifact_rules, '{}'::jsonb) || '{
    "processing_strategy": {
      "type": "task_isolation",
      "granularity": "per_pairwise_synthesis",
      "description": "Synthesizes each thesis with its critiques, then reduces.",
      "progress_reporting": {
        "message_template": "Processing synthesis part {current_item} of {total_items} using {model_name}..."
      }
    }
  }'::jsonb
WHERE
  slug = 'synthesis';

-- Add the parent_job_id column to track job hierarchy
ALTER TABLE public.dialectic_generation_jobs
ADD COLUMN parent_job_id UUID NULL REFERENCES public.dialectic_generation_jobs(id);

-- Create orchestration function to handle child job completion
CREATE OR REPLACE FUNCTION handle_child_job_completion()
RETURNS TRIGGER AS $$
DECLARE
    parent_id UUID;
    total_siblings INTEGER;
    terminal_siblings INTEGER;
BEGIN
    -- Only run if the job is entering a terminal state.
    IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- For updates, ensure it wasn't already in a terminal state to prevent re-triggering.
    IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed', 'retry_loop_failed') THEN
        RETURN NEW;
    END IF;

    -- Check if this job has a parent
    parent_id := NEW.parent_job_id;
    IF parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count total sibling jobs (including this one)
    SELECT COUNT(*)
    INTO total_siblings
    FROM public.dialectic_generation_jobs
    WHERE parent_job_id = parent_id;

    -- Count terminal sibling jobs (including this one)
    SELECT COUNT(*)
    INTO terminal_siblings
    FROM public.dialectic_generation_jobs
    WHERE parent_job_id = parent_id
    AND status IN ('completed', 'failed', 'retry_loop_failed');

    -- If all siblings are in terminal states, wake up the parent job
    IF total_siblings = terminal_siblings THEN
        UPDATE public.dialectic_generation_jobs
        SET 
            status = 'pending_next_step',
            started_at = NULL  -- Reset to allow re-processing
        WHERE id = parent_id
        AND status = 'waiting_for_children';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for UPDATEs: fires when a job's status changes.
DROP TRIGGER IF EXISTS trigger_handle_child_job_completion ON public.dialectic_generation_jobs; -- Cleanup old trigger
DROP TRIGGER IF EXISTS trigger_handle_child_job_completion_on_update ON public.dialectic_generation_jobs;
CREATE TRIGGER trigger_handle_child_job_completion_on_update
    AFTER UPDATE OF status ON public.dialectic_generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION handle_child_job_completion();

-- Trigger for INSERTs: fires when a job is created, potentially already in a terminal state.
DROP TRIGGER IF EXISTS trigger_handle_child_job_completion_on_insert ON public.dialectic_generation_jobs;
CREATE TRIGGER trigger_handle_child_job_completion_on_insert
    AFTER INSERT ON public.dialectic_generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION handle_child_job_completion();
