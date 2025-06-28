-- Add new columns to public.system_prompts table
ALTER TABLE public.system_prompts
ADD COLUMN IF NOT EXISTS stage_association TEXT NULL,
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS description TEXT NULL,
ADD COLUMN IF NOT EXISTS variables_required JSONB NULL,
ADD COLUMN IF NOT EXISTS is_stage_default BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS context TEXT NULL;

-- Add a unique constraint to the name column
-- First, check if the constraint already exists to make the script idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace nsp ON nsp.oid = con.connamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'system_prompts'
      AND con.conname = 'system_prompts_name_unique' -- Or your chosen constraint name
      AND con.contype = 'u'
  ) THEN
    ALTER TABLE public.system_prompts
    ADD CONSTRAINT system_prompts_name_unique UNIQUE (name);
  END IF;
END;
$$;

-- Ensure existing columns have NOT NULL where specified, if not already set
-- For example, if 'name' or 'prompt_text' could have been NULL before
-- and should now be NOT NULL (as per our plan).
-- The types_db.ts implies they are already NOT NULL, so this might be redundant
-- but good practice to verify during migration creation.

-- Example: (Only if they were not already NOT NULL)
-- ALTER TABLE public.system_prompts
-- ALTER COLUMN name SET NOT NULL,
-- ALTER COLUMN prompt_text SET NOT NULL;

COMMENT ON COLUMN public.system_prompts.stage_association IS 'Indicates the dialectic stage this prompt is associated with (e.g., thesis, antithesis).';
COMMENT ON COLUMN public.system_prompts.version IS 'Version number for the prompt template.';
COMMENT ON COLUMN public.system_prompts.description IS 'A brief description of the prompt template.';
COMMENT ON COLUMN public.system_prompts.variables_required IS 'JSONB array listing expected placeholder variables in prompt_text (e.g., ["initial_prompt"]).';
COMMENT ON COLUMN public.system_prompts.is_stage_default IS 'Flags if this prompt is the default for its associated stage and context.';
COMMENT ON COLUMN public.system_prompts.context IS 'The domain or context this prompt is intended for (e.g., software_development, legal).'; 