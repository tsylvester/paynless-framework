ALTER TABLE public.dialectic_projects
ADD COLUMN selected_domain_tag TEXT NULL;

COMMENT ON COLUMN public.dialectic_projects.selected_domain_tag IS 'The domain tag selected by the user for this project, influences prompt rendering.';

-- No RLS changes needed as the existing policy "Users can manage their own dialectic projects"
-- already grants sufficient permissions for users to update this new column on their own projects.
