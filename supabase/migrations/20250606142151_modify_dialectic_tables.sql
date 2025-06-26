-- Create ENUM type for dialectic stages
CREATE TYPE public.dialectic_stage_enum AS ENUM ('THESIS', 'ANTITHESIS', 'SYNTHESIS', 'PARENTHESIS', 'PARALYSIS');

-- Modify dialectic_sessions table
ALTER TABLE public.dialectic_sessions
  ADD COLUMN selected_model_ids UUID[],
  ADD COLUMN user_input_reference_url TEXT,
  ADD COLUMN stage public.dialectic_stage_enum NOT NULL;

-- Drop old columns from dialectic_sessions
-- Assuming user_input_reference_url replaces the function of current_stage_seed_prompt
ALTER TABLE public.dialectic_sessions
  DROP COLUMN IF EXISTS current_stage_seed_prompt,
  DROP COLUMN IF EXISTS active_thesis_prompt_template_id,
  DROP COLUMN IF EXISTS active_antithesis_prompt_template_id;

-- Modify dialectic_contributions table
-- First, drop the foreign key constraint that depends on dialectic_session_models.id if it exists
ALTER TABLE public.dialectic_contributions
  DROP CONSTRAINT IF EXISTS dialectic_contributions_session_model_id_fkey;

-- Then, drop the old session_model_id column
ALTER TABLE public.dialectic_contributions
  DROP COLUMN IF EXISTS session_model_id;

-- Add new model_id (FK to ai_providers) and model_name columns
ALTER TABLE public.dialectic_contributions
  ADD COLUMN model_id UUID,
  ADD COLUMN model_name TEXT; -- User shortened from model_name_snapshot

-- Add the foreign key constraint for model_id
-- Using ON DELETE SET NULL as a placeholder. Consider RESTRICT and a more robust ai_providers versioning strategy.
ALTER TABLE public.dialectic_contributions
  ADD CONSTRAINT fk_dialectic_contributions_model_id FOREIGN KEY (model_id) REFERENCES public.ai_providers(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename actual_prompt_sent to seed_prompt_url
ALTER TABLE public.dialectic_contributions
  RENAME COLUMN actual_prompt_sent TO seed_prompt_url;


-- Drop obsolete tables
-- Drop dialectic_session_models (dependent FK from dialectic_contributions on session_model_id was removed)
DROP TABLE IF EXISTS public.dialectic_session_models;

-- Drop dialectic_session_prompts
DROP TABLE IF EXISTS public.dialectic_session_prompts;
