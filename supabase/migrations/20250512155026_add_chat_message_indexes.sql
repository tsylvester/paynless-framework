-- Index for finding a specific message by ID (already likely covered by PRIMARY KEY, but explicit doesn't hurt)
CREATE INDEX IF NOT EXISTS idx_chat_messages_id ON public.chat_messages (id);

-- Index for finding messages in a chat, ordered by time (crucial for history fetching and the rewind UPDATE)
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at ON public.chat_messages (chat_id, created_at);

-- Index for finding a specific message within a specific chat (used by the initial SELECT in the rewind function)
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_id ON public.chat_messages (chat_id, id);
