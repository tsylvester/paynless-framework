-- Drop the previous version of the function (returning void)
DROP FUNCTION IF EXISTS public.delete_chat_and_messages(uuid, uuid);

-- Create the new debug version returning TEXT status codes
CREATE FUNCTION public.delete_chat_and_messages(p_chat_id uuid, p_user_id uuid)
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
    RETURN 'NOT FOUND'; -- Return status instead of raising exception
  END IF;

  -- 2. Permission Check
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active';

    IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      RETURN 'ORG PERMISSION DENIED'; -- Return status instead of raising exception
    END IF;
  ELSE
    -- Personal chat
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       RETURN 'PERSONAL PERMISSION DENIED'; -- Return status instead of raising exception
    END IF;
  END IF;

  -- 3. Perform Deletions (Only if permission granted and chat found)
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;

  RETURN 'DELETED'; -- Return success status

END;
$$;

-- Grant execute permission to the new function definition
GRANT EXECUTE ON FUNCTION public.delete_chat_and_messages(uuid, uuid) TO authenticated;