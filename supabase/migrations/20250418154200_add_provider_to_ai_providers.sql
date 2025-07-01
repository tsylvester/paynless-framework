-- Add the provider column to the ai_providers table
ALTER TABLE public.ai_providers
ADD COLUMN IF NOT EXISTS provider TEXT;

-- Add an index on the new provider column
CREATE INDEX IF NOT EXISTS idx_ai_providers_provider ON public.ai_providers(provider);

-- Backfill the provider column for existing OpenAI models 
-- Assuming existing OpenAI models have api_identifier starting with 'openai-'
UPDATE public.ai_providers
SET provider = 'openai'
WHERE api_identifier LIKE 'openai-%';

-- Optionally, make the column NOT NULL after backfilling if desired
-- ALTER TABLE public.ai_providers
-- ALTER COLUMN provider SET NOT NULL; 