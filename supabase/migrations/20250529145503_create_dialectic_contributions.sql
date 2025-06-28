CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.dialectic_contributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.dialectic_sessions(id) ON DELETE CASCADE,
    session_model_id UUID NOT NULL REFERENCES public.dialectic_session_models(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    content_storage_bucket TEXT NOT NULL DEFAULT 'dialectic_contributions',
    content_storage_path TEXT NOT NULL,
    content_mime_type TEXT NOT NULL DEFAULT 'text/markdown',
    content_size_bytes BIGINT,
    target_contribution_id UUID REFERENCES public.dialectic_contributions(id) ON DELETE SET NULL,
    prompt_template_id_used UUID REFERENCES public.system_prompts(id) ON DELETE SET NULL,
    actual_prompt_sent TEXT,
    tokens_used_input INTEGER,
    tokens_used_output INTEGER,
    cost_usd NUMERIC(10, 6),
    raw_response_storage_path TEXT,
    processing_time_ms INTEGER,
    model_version_details TEXT,
    citations JSONB,
    iteration_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: Add comments to columns for better schema understanding
COMMENT ON COLUMN public.dialectic_contributions.stage IS 'The dialectic stage this contribution belongs to (e.g., thesis, antithesis, synthesis, parenthesis, paralysis)';
COMMENT ON COLUMN public.dialectic_contributions.content_storage_bucket IS 'The Supabase Storage bucket ID where the content is stored.';
COMMENT ON COLUMN public.dialectic_contributions.content_storage_path IS 'Path to the content file within the bucket (e.g., project_id/session_id/contribution_id.md).';
COMMENT ON COLUMN public.dialectic_contributions.content_mime_type IS 'MIME type of the stored content.';
COMMENT ON COLUMN public.dialectic_contributions.content_size_bytes IS 'Size of the content file in bytes.';
COMMENT ON COLUMN public.dialectic_contributions.target_contribution_id IS 'For linking critiques to theses, or refined versions to originals.';
COMMENT ON COLUMN public.dialectic_contributions.prompt_template_id_used IS 'ID of the system_prompt template used for this contribution.';
COMMENT ON COLUMN public.dialectic_contributions.actual_prompt_sent IS 'The actual prompt text sent to the AI model.';
COMMENT ON COLUMN public.dialectic_contributions.raw_response_storage_path IS 'Path in storage for the raw JSON response from the AI provider.';
COMMENT ON COLUMN public.dialectic_contributions.citations IS 'For Parenthesis stage: structured citation data.';
COMMENT ON COLUMN public.dialectic_contributions.iteration_number IS 'The iteration number within the session this contribution belongs to.';

-- Enable RLS for the table
ALTER TABLE public.dialectic_contributions ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to see their own contributions (adjust as needed for your specific RLS)
-- This is a basic example, you might need more granular policies based on project/session ownership.
-- For now, we will rely on the service role for inserts and specific RLS for reads later if needed.
-- The more complex RLS (1.1.7.10 - 1.1.7.12) will handle granular access.
-- For initial creation and backend operations, service role key will bypass RLS.

-- Example of a simple select policy (can be refined later):
-- CREATE POLICY "Allow authenticated users to read contributions"
-- ON public.dialectic_contributions
-- FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.dialectic_sessions ds
--     JOIN public.dialectic_projects dp ON ds.project_id = dp.id
--     WHERE ds.id = dialectic_contributions.session_id AND dp.user_id = auth.uid()
--   )
-- );

-- Indexes
CREATE INDEX idx_dialectic_contributions_session_id ON public.dialectic_contributions(session_id);
CREATE INDEX idx_dialectic_contributions_session_model_id ON public.dialectic_contributions(session_model_id);
CREATE INDEX idx_dialectic_contributions_stage ON public.dialectic_contributions(stage);
CREATE INDEX idx_dialectic_contributions_target_contribution_id ON public.dialectic_contributions(target_contribution_id);

-- Trigger to update "updated_at" timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_dialectic_contributions_updated_at
BEFORE UPDATE ON public.dialectic_contributions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
