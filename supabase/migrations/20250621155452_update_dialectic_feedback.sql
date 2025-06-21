ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS feedback_value_text;
ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS feedback_value_structured;
ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS contribution_id;

ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.dialectic_projects(id) ON DELETE CASCADE NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS stage_slug TEXT NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS iteration_number INTEGER NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL;
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'text/markdown';
ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS size_bytes INTEGER NOT NULL;

ALTER TABLE public.dialectic_feedback ALTER COLUMN feedback_type SET NOT NULL;

ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS resource_description JSONB NULL;

ALTER TABLE public.dialectic_feedback ADD CONSTRAINT unique_session_stage_iteration_feedback UNIQUE (session_id, project_id, stage_slug, iteration_number);
