-- Add chat_context column to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN chat_context JSONB NULL;

-- Add a comment to the new column for clarity
COMMENT ON COLUMN public.user_profiles.chat_context IS 'Stores user-specific chat context preferences, such as default provider, prompt, or other AI settings.';
