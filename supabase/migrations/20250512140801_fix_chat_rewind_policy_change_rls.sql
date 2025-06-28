-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can update their own messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can update message status" ON chat_messages;

-- Create new policies for message updates
CREATE POLICY "Users can update their own messages"
ON chat_messages
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to update message status (active/inactive) for messages in their chats
CREATE POLICY "Users can update message status"
ON chat_messages
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
);

-- Add comment to explain the migration
COMMENT ON POLICY "Users can update message status" ON chat_messages IS 'Allows users to update message status (active/inactive) for messages in their chats';
