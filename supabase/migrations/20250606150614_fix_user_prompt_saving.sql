ALTER TABLE public.dialectic_projects
ADD COLUMN initial_prompt_resource_id UUID NULL,
ADD CONSTRAINT fk_initial_prompt_resource
  FOREIGN KEY (initial_prompt_resource_id)
  REFERENCES public.dialectic_project_resources (id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.dialectic_projects.initial_prompt_resource_id IS 'Foreign key to the dialectic_project_resources table, linking to the resource used as the initial prompt if a file was uploaded.';
