-- Migration to add RLS UPDATE and DELETE policies for chat_messages

-- Ensure RLS is enabled (it should be already from previous migration, but good practice)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist to make the script idempotent
DROP POLICY IF EXISTS "Allow users to update messages in accessible chats" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow users to delete messages in accessible chats" ON public.chat_messages;

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

ALTER FUNCTION public.can_select_chat(uuid) SET search_path = public, pg_catalog;

-- Grant execute permission on the function to the authenticated role
GRANT EXECUTE ON FUNCTION public.can_select_chat(uuid) TO authenticated;

-- Policy to allow users to update messages in chats they have SELECT access to.
-- This is crucial for the rewind functionality where the function, acting as the user,
-- needs to set is_active_in_thread = false for older messages.
CREATE POLICY "Allow users to update messages in accessible chats"
ON public.chat_messages
FOR UPDATE
USING (public.can_select_chat(chat_id))
WITH CHECK (public.can_select_chat(chat_id)); -- Ensure they still have access if chat_id changes (though unlikely here)

-- Policy to allow users to delete messages in chats they have SELECT access to.
-- For now, this is symmetric with the UPDATE policy. 
-- It could be further restricted later (e.g., only own messages, or by org admins).
CREATE POLICY "Allow users to delete messages in accessible chats"
ON public.chat_messages
FOR DELETE
USING (public.can_select_chat(chat_id));

-- Down migration (optional, but good practice to include as comments or actual commands)
-- ALTER TABLE public.chat_messages DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Allow users to update messages in accessible chats" ON public.chat_messages;
-- DROP POLICY IF EXISTS "Allow users to delete messages in accessible chats" ON public.chat_messages;
