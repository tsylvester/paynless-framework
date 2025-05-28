CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- Ensure uuid_generate_v4() is available

CREATE TABLE public.dialectic_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    initial_user_prompt TEXT NOT NULL,
    repo_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    user_domain_overlay_values JSONB NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dialectic_projects IS 'Stores projects for the AI Dialectic Engine, representing a specific problem or task to be explored.';
COMMENT ON COLUMN public.dialectic_projects.user_id IS 'Owner of the project.';
COMMENT ON COLUMN public.dialectic_projects.project_name IS 'User-defined name for the dialectic project.';
COMMENT ON COLUMN public.dialectic_projects.initial_user_prompt IS 'The initial prompt or problem statement provided by the user.';
COMMENT ON COLUMN public.dialectic_projects.repo_url IS 'URL of an associated repository (e.g., GitHub) for context or saving outputs.';
COMMENT ON COLUMN public.dialectic_projects.status IS 'Current status of the project (e.g., active, archived, template).';
COMMENT ON COLUMN public.dialectic_projects.user_domain_overlay_values IS 'User-specific JSONB object to overlay on system default domain overlays, further customizing prompt variables for a specific project.';

-- Enable RLS
ALTER TABLE public.dialectic_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own dialectic projects" 
ON public.dialectic_projects
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own dialectic projects (alternative for select)" 
ON public.dialectic_projects
FOR SELECT
USING (auth.uid() = user_id); 