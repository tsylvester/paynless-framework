
ALTER TABLE public.ai_providers
ADD COLUMN is_default_embedding BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_providers.is_default_embedding IS 'Indicates if this model is the default for embedding tasks across the application.';

-- Add a constraint to ensure that only one provider can be the default embedding model.
-- This creates a unique index on a constant value (true) for rows where is_default_embedding is true.
CREATE UNIQUE INDEX one_default_embedding_model_idx ON public.ai_providers ((is_default_embedding)) WHERE is_default_embedding;

-- Make chat_id nullable to accommodate 'headless' dialectic messages
ALTER TABLE public.chat_messages ALTER COLUMN chat_id DROP NOT NULL;


