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
