ALTER TABLE public.chat_messages
ADD COLUMN error_type TEXT NULL;

COMMENT ON COLUMN public.chat_messages.error_type IS 'Stores the type of error if one occurred during an AI interaction, e.g., ai_provider_error, insufficient_funds, etc.';
