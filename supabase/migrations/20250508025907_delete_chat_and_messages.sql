-- SQL Function for Atomic Chat Deletion with Permission Check
CREATE OR REPLACE FUNCTION delete_chat_and_messages(p_chat_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Important: Allows function to bypass RLS temporarily IF NEEDED for cascading delete, use with caution. Review permissions carefully.
AS $$
DECLARE
  v_chat_owner_id uuid;
  v_chat_org_id uuid;
  v_user_role text;
BEGIN
  -- 1. Check if the chat exists and get owner/org info
  SELECT user_id, organization_id INTO v_chat_owner_id, v_chat_org_id
  FROM public.chats
  WHERE id = p_chat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found: %', p_chat_id;
  END IF;

  -- 2. Permission Check (Updated Logic)
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active'; -- Check status too

    -- Check if deletion is allowed:
    -- Allowed if: User is admin OR User is the owner of this specific chat
    IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      -- If NOT allowed (neither admin nor owner), raise exception
      RAISE EXCEPTION 'Permission denied to delete organization chat: %. User ID: %, Role: %, Owner ID: %',
                       p_chat_id, p_user_id, COALESCE(v_user_role, 'not member'), v_chat_owner_id;
    END IF;
  ELSE
    -- Personal chat: Only allow owner to delete
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       RAISE EXCEPTION 'Permission denied to delete personal chat: %. User ID: %', p_chat_id, p_user_id;
    END IF;
  END IF;

  -- 3. Perform Deletions (Atomic within function)
  -- Delete messages first due to potential FK constraints
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;

  -- Then delete the chat itself
  DELETE FROM public.chats WHERE id = p_chat_id;

  RAISE LOG 'Successfully deleted chat % and its messages for user %', p_chat_id, p_user_id;

END;
$$;

-- Grant execute permission (adjust role as needed, e.g., 'authenticated')
GRANT EXECUTE ON FUNCTION public.delete_chat_and_messages(uuid, uuid) TO authenticated;
-- Alternatively, if using SECURITY DEFINER isn't desired, you might need RLS policies
-- on chat_messages and chats that allow deletion based on the same permission logic.