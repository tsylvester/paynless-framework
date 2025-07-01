-- Add is_active_in_thread column and index to chat_messages for rewind support

ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS is_active_in_thread BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.chat_messages.is_active_in_thread IS 'Indicates if a message is part of the currently active conversation thread (true) or has been superseded by a rewind/edit (false).';

-- Add partial index for efficient querying of active messages within a chat
CREATE INDEX IF NOT EXISTS idx_chat_messages_active_thread
ON public.chat_messages (chat_id, created_at)
WHERE is_active_in_thread = true;

-- Note: DOWN migration logic omitted as per project pattern.
-- To reverse manually:
-- DROP INDEX IF EXISTS idx_chat_messages_active_thread;
-- ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS is_active_in_thread;
