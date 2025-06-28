CREATE TABLE public.dialectic_session_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    model_id TEXT NOT NULL,
    model_role TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_session
        FOREIGN KEY(session_id) 
        REFERENCES public.dialectic_sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_session_model UNIQUE (session_id, model_id)
);

COMMENT ON TABLE public.dialectic_session_models IS 'Associates AI models with a specific dialectic session, indicating which models are participating.';
COMMENT ON COLUMN public.dialectic_session_models.id IS 'Unique identifier for the session-model link.';
COMMENT ON COLUMN public.dialectic_session_models.session_id IS 'Foreign key to the dialectic_sessions table.';
COMMENT ON COLUMN public.dialectic_session_models.model_id IS 'Identifier for the AI model (e.g., "openai/gpt-4"). Will be validated against ai_models_catalog.id in the future.';
COMMENT ON COLUMN public.dialectic_session_models.model_role IS 'Role of the model in this session (e.g., "thesis_generator", "critiquer"). Can be null if role is general.';
COMMENT ON COLUMN public.dialectic_session_models.created_at IS 'Timestamp of when the model was associated with the session.';

-- Enable RLS
ALTER TABLE public.dialectic_session_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust as needed for your security model)
-- For now, assuming if a user can access the session, they can see the models in it.
-- More granular policies might be needed later.

-- Example: Allow users to see models for sessions they own (via project ownership)
CREATE POLICY "Allow authenticated users to read session models for their projects" 
ON public.dialectic_session_models
FOR SELECT
USING (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_models.session_id AND dp.user_id = auth.uid()
  )
);

-- Example: Allow service_role to bypass RLS for admin tasks / backend functions
CREATE POLICY "Allow service_role to manage all session models" 
ON public.dialectic_session_models
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_dialectic_session_models_session_id ON public.dialectic_session_models(session_id);
