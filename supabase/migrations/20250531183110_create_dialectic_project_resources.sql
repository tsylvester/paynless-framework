CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.dialectic_project_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.dialectic_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'dialectic-contributions',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    resource_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_storage_path UNIQUE (storage_bucket, storage_path)
);

COMMENT ON COLUMN public.dialectic_project_resources.storage_bucket IS 'The Supabase Storage bucket ID where the resource file is stored.';
COMMENT ON COLUMN public.dialectic_project_resources.storage_path IS 'Path to the resource file within the bucket (e.g., projects/{project_id}/resources/{resource_id_or_filename}).';
COMMENT ON COLUMN public.dialectic_project_resources.resource_description IS 'User-provided description of the resource, e.g., "Initial prompt attachment".';

-- Enable RLS for the table
ALTER TABLE public.dialectic_project_resources ENABLE ROW LEVEL SECURITY;

-- Trigger to update "updated_at" timestamp
-- Assuming the function public.update_updated_at_column() already exists from previous migrations.
-- If not, it should be created as:
-- CREATE OR REPLACE FUNCTION public.update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = now();
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

CREATE TRIGGER update_dialectic_project_resources_updated_at
BEFORE UPDATE ON public.dialectic_project_resources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_dialectic_project_resources_project_id ON public.dialectic_project_resources(project_id);
CREATE INDEX idx_dialectic_project_resources_user_id ON public.dialectic_project_resources(user_id); 