-- Add the is_enabled column to ai_providers table
ALTER TABLE public.ai_providers
ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add a comment explaining the purpose
COMMENT ON COLUMN public.ai_providers.is_enabled IS 'Flag to control if the model is exposed to the frontend, managed manually.';

-- Optional: Consider adding an index if you anticipate querying often on this flag
-- CREATE INDEX IF NOT EXISTS idx_ai_providers_is_enabled ON public.ai_providers (is_enabled) WHERE is_active = true AND is_enabled = true; 