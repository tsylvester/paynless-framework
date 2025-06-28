-- SQL Function for Atomic Chat Deletion with Permission Check (DEBUG VERSION)
CREATE OR REPLACE FUNCTION delete_chat_and_messages_debug(p_chat_id uuid, p_user_id uuid)
RETURNS TEXT -- Return TEXT for status
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- RAISE EXCEPTION 'Chat not found: %', p_chat_id;
    RETURN 'NOT FOUND'; -- Return status instead
  END IF;

  -- 2. Permission Check
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active';

    IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      -- RAISE EXCEPTION 'Permission denied...';
      RETURN 'ORG PERMISSION DENIED'; -- Return status instead
    END IF;
  ELSE
    -- Personal chat
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       -- RAISE EXCEPTION 'Permission denied...';
       RETURN 'PERSONAL PERMISSION DENIED'; -- Return status instead
    END IF;
  END IF;

  -- 3. Perform Deletions (Only if permission granted)
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;

  RETURN 'DELETED'; -- Return success status

END;
$$;

ALTER FUNCTION public.delete_chat_and_messages_debug(uuid, uuid) SET search_path = public, pg_catalog;

-- Grant execute (Remember to rename in tests)
GRANT EXECUTE ON FUNCTION public.delete_chat_and_messages_debug(uuid, uuid) TO authenticated;

-- Drop the old function if necessary during debug
-- DROP FUNCTION IF EXISTS public.delete_chat_and_messages(uuid, uuid);