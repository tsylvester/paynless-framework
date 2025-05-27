-- Add the response_to_message_id column to public.chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN response_to_message_id UUID NULL;

-- Add a foreign key constraint for response_to_message_id
-- This creates a self-referential link, allowing an assistant message
-- to point to the user message it is responding to.
ALTER TABLE public.chat_messages
ADD CONSTRAINT fk_chat_messages_response_to_message_id
FOREIGN KEY (response_to_message_id)
REFERENCES public.chat_messages(id)
ON DELETE SET NULL; -- Or ON DELETE CASCADE, depending on desired behavior if a parent message is deleted

-- Optional: Add an index for faster lookups if you query by this column frequently
CREATE INDEX IF NOT EXISTS idx_chat_messages_response_to_message_id
ON public.chat_messages(response_to_message_id);
