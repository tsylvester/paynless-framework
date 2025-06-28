-- Add columns for tracking user edits to AI contributions
ALTER TABLE public.dialectic_contributions
ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN is_latest_edit BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN original_model_contribution_id UUID REFERENCES public.dialectic_contributions(id) ON DELETE SET NULL;

-- Add an index for original_model_contribution_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_dialectic_contributions_original_model_contribution_id
ON public.dialectic_contributions(original_model_contribution_id);

-- Add an index for (original_model_contribution_id, edit_version) for finding latest edits efficiently if needed
CREATE INDEX IF NOT EXISTS idx_dialectic_contributions_original_model_edit_version
ON public.dialectic_contributions(original_model_contribution_id, edit_version DESC);

-- Add an index for (original_model_contribution_id, is_latest_edit) to quickly find the current active version
CREATE INDEX IF NOT EXISTS idx_dialectic_contributions_original_model_is_latest
ON public.dialectic_contributions(original_model_contribution_id, is_latest_edit) WHERE is_latest_edit = TRUE;

COMMENT ON COLUMN public.dialectic_contributions.edit_version IS 'Version number for an edited contribution. Starts at 1 for AI-generated, increments for user edits.';
COMMENT ON COLUMN public.dialectic_contributions.is_latest_edit IS 'Indicates if this row is the latest version of a particular contribution lineage (original AI + edits).';
COMMENT ON COLUMN public.dialectic_contributions.original_model_contribution_id IS 'If this is a user edit, points to the initial AI-generated contribution (which has edit_version = 1). NULL for initial AI contributions.'; 