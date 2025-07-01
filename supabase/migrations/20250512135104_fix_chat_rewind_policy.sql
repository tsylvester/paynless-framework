-- First drop the existing function
DROP FUNCTION IF EXISTS public.perform_chat_rewind(
    uuid, uuid, uuid, text, uuid, uuid, text, jsonb, uuid, uuid
);

-- Then create the new function
CREATE OR REPLACE FUNCTION public.perform_chat_rewind(
    p_chat_id uuid,
    p_rewind_from_message_id uuid,
    p_user_id uuid,
    p_new_user_message_content text,
    p_new_user_message_ai_provider_id uuid,
    p_new_user_message_system_prompt_id uuid,
    p_new_assistant_message_content text,
    p_new_assistant_message_token_usage jsonb,
    p_new_assistant_message_ai_provider_id uuid,
    p_new_assistant_message_system_prompt_id uuid
)
RETURNS TABLE (
    -- Column definitions matching chat_messages table
    id uuid,
    chat_id uuid,
    user_id uuid,
    role text,
    content text,
    created_at timestamptz,
    updated_at timestamptz,
    is_active_in_thread boolean,
    token_usage jsonb,
    ai_provider_id uuid,
    system_prompt_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER -- Add SECURITY DEFINER to bypass RLS
AS $function$
DECLARE
    v_rewind_point_created_at TIMESTAMPTZ;
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_chat_owner_id uuid;
    v_chat_org_id uuid;
    v_user_role text;
BEGIN
    -- 1. Permission Check
    -- Get chat ownership and org info
    SELECT user_id, organization_id INTO v_chat_owner_id, v_chat_org_id
    FROM public.chats
    WHERE id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chat not found: %', p_chat_id;
    END IF;

    -- Check permissions
    IF v_chat_org_id IS NOT NULL THEN
        -- Organization chat
        SELECT role INTO v_user_role
        FROM public.organization_members
        WHERE organization_id = v_chat_org_id 
        AND user_id = p_user_id 
        AND status = 'active';

        -- Allow if: User is admin OR User is the owner of this specific chat
        IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
            RAISE EXCEPTION 'Permission denied to rewind organization chat: %. User ID: %, Role: %, Owner ID: %',
                           p_chat_id, p_user_id, COALESCE(v_user_role, 'not member'), v_chat_owner_id;
        END IF;
    ELSE
        -- Personal chat: Only allow owner to rewind
        IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
            RAISE EXCEPTION 'Permission denied to rewind personal chat: %. User ID: %', p_chat_id, p_user_id;
        END IF;
    END IF;

    -- 2. Get the rewind point timestamp
    SELECT created_at INTO v_rewind_point_created_at
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id AND chat_id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- 3. Deactivate messages after the rewind point
    -- This will now work because we're SECURITY DEFINER
    UPDATE public.chat_messages
    SET is_active_in_thread = false
    WHERE chat_id = p_chat_id AND created_at > v_rewind_point_created_at;

    -- 4. Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id, user_id, role, content, ai_provider_id, system_prompt_id, is_active_in_thread
    )
    VALUES (
        p_chat_id, p_user_id, 'user', p_new_user_message_content, p_new_user_message_ai_provider_id, p_new_user_message_system_prompt_id, true
    )
    RETURNING id INTO v_new_user_message_id;

    -- 5. Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id, user_id, role, content, token_usage, ai_provider_id, system_prompt_id, is_active_in_thread
    )
    VALUES (
        p_chat_id, NULL, 'assistant', p_new_assistant_message_content, p_new_assistant_message_token_usage, p_new_assistant_message_ai_provider_id, p_new_assistant_message_system_prompt_id, true
    )
    RETURNING id INTO v_new_assistant_message_id;

    -- 6. Return the newly created assistant message
    RETURN QUERY
    SELECT cm.*
    FROM public.chat_messages cm
    WHERE cm.id = v_new_assistant_message_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depending on PostgreSQL logging setup)
        RAISE; -- Re-raise the exception to ensure transaction rollback
END;
$function$;

COMMENT ON FUNCTION public.perform_chat_rewind(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, uuid, uuid) IS 'Performs a chat rewind operation atomically: deactivates messages after a specified point and inserts new user and assistant messages.';
