ALTER TABLE public.dialectic_projects
ALTER COLUMN repo_url TYPE JSONB
USING repo_url::jsonb;
