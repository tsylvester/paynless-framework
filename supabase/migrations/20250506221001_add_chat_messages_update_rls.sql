-- Migration to add RLS UPDATE policy for chat_messages

-- Function to check if a user can select (and thus update/delete) a chat
-- This function is a prerequisite for the RLS policies below.
CREATE OR REPLACE FUNCTION public.can_select_chat(check_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
-- Set a cost estimate for the planner to prefer inline execution.
SET JIT = OFF
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = check_chat_id
    AND (
      -- Case 1: Personal chat, user is the owner
      (c.organization_id IS NULL AND c.user_id = auth.uid()) OR
      -- Case 2: Organization chat, user is a member of that organization
      (c.organization_id IS NOT NULL AND public.is_org_member(c.organization_id, auth.uid(), 'active'))
      -- Add more conditions if direct chat access is granted via other tables e.g. chat_participants
    )
  );
$$;

-- Grant execute permission on the function to the authenticated role
GRANT EXECUTE ON FUNCTION public.can_select_chat(uuid) TO authenticated;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY; -- Ensure RLS is enabled

-- Drop the policy if it already exists to make the script idempotent
DROP POLICY IF EXISTS "Allow users to update messages in accessible chats" ON public.chat_messages;

-- Policy to allow users to update messages in chats they have SELECT access to.
-- This is crucial for the rewind functionality where the function, acting as the user,
-- needs to set is_active_in_thread = false for older messages.
CREATE POLICY "Allow users to update messages in accessible chats"
ON public.chat_messages
FOR UPDATE
USING (public.can_select_chat(chat_id)) -- The user must have SELECT access to the chat
WITH CHECK (public.can_select_chat(chat_id)); -- The row must still be selectable after update (relevant if chat_id changes, not here) 