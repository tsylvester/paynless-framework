ALTER TABLE public.ai_providers
ADD COLUMN is_default_generation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_providers.is_default_generation IS 'Flags this model for auto-selection during automated project creation. Unlike is_default_embedding, multiple models may be flagged (no unique constraint).';
