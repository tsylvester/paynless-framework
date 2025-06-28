-- supabase/migrations/YYYYMMDDHHMMSS_create_dialectic_session_prompts.sql

CREATE TABLE public.dialectic_session_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.dialectic_sessions(id) ON DELETE CASCADE,
    system_prompt_id UUID REFERENCES public.system_prompts(id) ON DELETE SET NULL, -- The specific template used, if any
    stage_association TEXT NOT NULL, -- e.g., 'thesis', 'antithesis', 'synthesis', 'parenthesis', 'paralysis'
    rendered_prompt_text TEXT NOT NULL, -- The full text of the prompt as it was set for this stage and iteration
    iteration_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT dialectic_session_prompts_session_id_stage_association_iter_key 
        UNIQUE (session_id, stage_association, iteration_number)
);

-- Enable Row Level Security
ALTER TABLE public.dialectic_session_prompts ENABLE ROW LEVEL SECURITY;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_dialectic_session_prompts_session_id ON public.dialectic_session_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_session_prompts_system_prompt_id ON public.dialectic_session_prompts(system_prompt_id);
-- The unique constraint will automatically create an index, but explicit index on (session_id, stage_association, iteration_number) if needed for other queries can also be added.
-- For now, the unique constraint's index should suffice.

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at_dialectic_session_prompts
BEFORE UPDATE ON public.dialectic_session_prompts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.dialectic_session_prompts IS 'Stores the specific rendered prompt text used for each stage of a dialectic session iteration.';
COMMENT ON COLUMN public.dialectic_session_prompts.id IS 'Unique identifier for the session prompt record.';
COMMENT ON COLUMN public.dialectic_session_prompts.session_id IS 'Foreign key to the dialectic_sessions table.';
COMMENT ON COLUMN public.dialectic_session_prompts.system_prompt_id IS 'Foreign key to the system_prompts table, indicating the base template used (if any).';
COMMENT ON COLUMN public.dialectic_session_prompts.stage_association IS 'The dialectic stage this prompt was for (e.g., thesis, antithesis).';
COMMENT ON COLUMN public.dialectic_session_prompts.rendered_prompt_text IS 'The actual, fully rendered prompt text that was set for this stage and iteration.';
COMMENT ON COLUMN public.dialectic_session_prompts.iteration_number IS 'The iteration number within the session this prompt belongs to.';
COMMENT ON COLUMN public.dialectic_session_prompts.created_at IS 'Timestamp of when the record was created.';
COMMENT ON COLUMN public.dialectic_session_prompts.updated_at IS 'Timestamp of when the record was last updated.';
COMMENT ON CONSTRAINT dialectic_session_prompts_session_id_stage_association_iter_key ON public.dialectic_session_prompts IS 'Ensures that for a given session, stage, and iteration, there is only one active prompt recorded.'; 