-- Ensures the ai_providers table can store extended model configurations.
-- The `config` column should be of type JSONB and allow NULL values.
-- Actual population and updates to this column are handled by the `sync-ai-models` Supabase function.

-- Example of adding the column if it didn't exist (run only if necessary):
-- ALTER TABLE public.ai_providers
-- ADD COLUMN IF NOT EXISTS config JSONB NULL;

-- Add a comment to the column if it exists
COMMENT ON COLUMN public.ai_providers.config IS 'Stores extended AI model configuration data, including token costs, context windows, tokenization strategies, and provider-specific limits. Populated by the sync-ai-models function.';
