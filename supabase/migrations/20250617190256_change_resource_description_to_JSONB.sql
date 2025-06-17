ALTER TABLE public.dialectic_project_resources
ALTER COLUMN resource_description TYPE JSONB
USING resource_description::jsonb;
