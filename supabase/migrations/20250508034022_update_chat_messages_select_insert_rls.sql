-- Migration to update SELECT and INSERT RLS policies for chat_messages
-- to use the can_select_chat helper function and ensure correct organization access.

-- Ensure RLS is enabled (it should be already, but good practice)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY; -- Recommended

-- --- SELECT POLICY ---

-- Drop the old SELECT policy
DROP POLICY IF EXISTS "Allow users to select messages in their own chats" ON public.chat_messages;

-- Create the new SELECT policy
-- Allows users to select messages if they can select the parent chat (personal or org).
CREATE POLICY "Allow users to select messages in accessible chats"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.can_select_chat(chat_id));

-- --- INSERT POLICY ---

-- Drop the old INSERT policy
DROP POLICY IF EXISTS "Allow users to insert messages in their own chats" ON public.chat_messages;

-- Create the new INSERT policy
-- Allows users to insert messages if they can select the parent chat,
-- AND ensures that if the role is 'user', the message's user_id matches the authenticated user.
CREATE POLICY "Allow users to insert messages in accessible chats with role check"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_select_chat(chat_id) AND
    (chat_messages.role <> 'user' OR chat_messages.user_id = auth.uid())
  );

-- --- DOWN MIGRATION (Illustrative - project pattern omits explicit down migrations) ---
/*
-- Revert SELECT policy
DROP POLICY IF EXISTS "Allow users to select messages in accessible chats" ON public.chat_messages;
CREATE POLICY "Allow users to select messages in their own chats"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
  );

-- Revert INSERT policy
DROP POLICY IF EXISTS "Allow users to insert messages in accessible chats with role check" ON public.chat_messages;
CREATE POLICY "Allow users to insert messages in their own chats"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chats
      WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
    AND (chat_messages.role <> 'user' OR chat_messages.user_id = auth.uid())
  );
*/ 