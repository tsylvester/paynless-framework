-- Create dialectic_feedback table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.dialectic_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    contribution_id UUID NULL,
    user_id UUID NOT NULL,
    feedback_type TEXT NOT NULL,
    feedback_value_text TEXT NULL,
    feedback_value_structured JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT dialectic_feedback_session_id_fkey FOREIGN KEY (session_id)
        REFERENCES public.dialectic_sessions (id) ON DELETE CASCADE,
    CONSTRAINT dialectic_feedback_contribution_id_fkey FOREIGN KEY (contribution_id)
        REFERENCES public.dialectic_contributions (id) ON DELETE SET NULL,
    CONSTRAINT dialectic_feedback_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users (id) ON DELETE CASCADE -- Or SET NULL if preferred for user deletion handling
);

-- Comments for clarity
COMMENT ON TABLE public.dialectic_feedback IS 'Stores user feedback on dialectic contributions or stages.';
COMMENT ON COLUMN public.dialectic_feedback.session_id IS 'The session this feedback belongs to.';
COMMENT ON COLUMN public.dialectic_feedback.contribution_id IS 'The specific contribution this feedback is for (nullable if feedback is for the stage/session in general).';
COMMENT ON COLUMN public.dialectic_feedback.user_id IS 'The user who provided the feedback.';
COMMENT ON COLUMN public.dialectic_feedback.feedback_type IS 'Type of feedback (e.g., ''text_response'', ''rating_stars'', ''thumb_reaction'').';
COMMENT ON COLUMN public.dialectic_feedback.feedback_value_text IS 'Textual content of the feedback, if applicable.';
COMMENT ON COLUMN public.dialectic_feedback.feedback_value_structured IS 'Structured feedback data (e.g., JSON for ratings, selections).';

-- Enable RLS
ALTER TABLE public.dialectic_feedback ENABLE ROW LEVEL SECURITY;

-- Indexes for foreign keys (PK index is created automatically)
CREATE INDEX idx_dialectic_feedback_session_id ON public.dialectic_feedback(session_id);
CREATE INDEX idx_dialectic_feedback_contribution_id ON public.dialectic_feedback(contribution_id);
CREATE INDEX idx_dialectic_feedback_user_id ON public.dialectic_feedback(user_id);

-- Trigger to update "updated_at" timestamp
-- Assuming the function public.update_updated_at_column() already exists from previous migrations.
-- If not, you would need to include its definition here:
-- CREATE OR REPLACE FUNCTION public.update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
-- NEW.updated_at = now();
-- RETURN NEW;
-- END;
-- $$ language 'plpgsql';

CREATE TRIGGER update_dialectic_feedback_updated_at
BEFORE UPDATE ON public.dialectic_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
