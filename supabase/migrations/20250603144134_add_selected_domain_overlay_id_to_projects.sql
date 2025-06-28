-- Add the new selected_domain_overlay_id column
ALTER TABLE public.dialectic_projects
ADD COLUMN selected_domain_overlay_id UUID;

-- Add a foreign key constraint to domain_specific_prompt_overlays
-- This ensures integrity and allows for cascading actions if desired (e.g., ON DELETE SET NULL)
ALTER TABLE public.dialectic_projects
ADD CONSTRAINT fk_dialectic_projects_selected_domain_overlay
FOREIGN KEY (selected_domain_overlay_id)
REFERENCES public.domain_specific_prompt_overlays(id)
ON DELETE SET NULL; -- Sets selected_domain_overlay_id to NULL if the referenced overlay is deleted.
                     -- Consider ON DELETE RESTRICT if an overlay should not be deletable while in use.

COMMENT ON COLUMN public.dialectic_projects.selected_domain_overlay_id IS 'FK to domain_specific_prompt_overlays.id, storing the chosen domain-specific overlay for the project.';

-- Optional: Drop the old column if it's confirmed to be fully replaced and data migration (if any) is handled.
-- Before dropping, ensure any data from selected_domain_tag is migrated to selected_domain_overlay_id if necessary,
-- though this might be complex if selected_domain_tag was not unique.
-- For now, we keep it. You can create a separate migration to drop it later.
-- ALTER TABLE public.dialectic_projects
-- DROP COLUMN IF EXISTS selected_domain_tag; 