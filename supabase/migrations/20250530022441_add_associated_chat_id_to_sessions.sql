ALTER TABLE public.dialectic_sessions
ADD COLUMN IF NOT EXISTS associated_chat_id UUID NULL;

COMMENT ON COLUMN public.dialectic_sessions.associated_chat_id IS 'Tracks the chat.id used for interactions with the /chat Edge Function for this dialectic session. This allows dialectics to potentially originate from or integrate with existing chat sessions.';

-- Also, let's add an index for potentially frequent lookups on this new column
CREATE INDEX IF NOT EXISTS idx_dialectic_sessions_associated_chat_id ON public.dialectic_sessions(associated_chat_id); 