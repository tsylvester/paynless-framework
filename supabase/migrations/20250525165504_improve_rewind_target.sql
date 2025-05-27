DROP FUNCTION IF EXISTS public.perform_chat_rewind(uuid, uuid, uuid, text, uuid, text, uuid, uuid, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION public.perform_chat_rewind(
    p_chat_id UUID,
    p_rewind_from_message_id UUID,
    p_user_id UUID,
    p_new_user_message_content TEXT,
    p_new_user_message_ai_provider_id UUID,
    p_new_assistant_message_content TEXT,
    p_new_assistant_message_ai_provider_id UUID,
    p_new_user_message_system_prompt_id UUID DEFAULT NULL,
    p_new_assistant_message_token_usage JSONB DEFAULT NULL,
    p_new_assistant_message_system_prompt_id UUID DEFAULT NULL,
    p_new_assistant_message_error_type TEXT DEFAULT NULL 
)
RETURNS TABLE (
    new_user_message_id UUID,
    new_assistant_message_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_organization_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the organization_id from the chat
    SELECT organization_id INTO v_organization_id
    FROM public.chats
    WHERE id = p_chat_id;

    -- Get the timestamp of the message being rewound from, to ensure new messages are later
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    -- Deactivate the old assistant message being rewound from
    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = p_rewind_from_message_id;

    -- Deactivate the user message that led to the old assistant message
    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = (
        SELECT cm_user.id
        FROM public.chat_messages cm_user
        JOIN public.chat_messages cm_assistant ON cm_user.chat_id = cm_assistant.chat_id
        WHERE cm_assistant.id = p_rewind_from_message_id
          AND cm_user.role = 'user'
          AND cm_user.user_id = p_user_id -- Ensure it's the current user's message
          AND cm_user.created_at < cm_assistant.created_at
          AND cm_user.is_active_in_thread = TRUE 
        ORDER BY cm_user.created_at DESC
        LIMIT 1
    );

    -- Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        organization_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id,
        is_active_in_thread,
        created_at, -- Manually set created_at to be after rewind point
        updated_at
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        v_organization_id, 
        'user', 
        p_new_user_message_content, 
        p_new_user_message_ai_provider_id, 
        p_new_user_message_system_prompt_id,
        TRUE, 
        v_rewind_point + INTERVAL '1 millisecond', 
        v_rewind_point + INTERVAL '1 millisecond'
    )
    RETURNING id INTO v_new_user_message_id;

    -- Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        organization_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id, 
        token_usage, 
        error_type,
        is_active_in_thread,
        created_at, -- Manually set created_at to be after the new user message
        updated_at,
        response_to_message_id
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        v_organization_id, 
        'assistant', 
        p_new_assistant_message_content, 
        p_new_assistant_message_ai_provider_id, 
        p_new_assistant_message_system_prompt_id, 
        p_new_assistant_message_token_usage, 
        p_new_assistant_message_error_type,
        TRUE, 
        v_rewind_point + INTERVAL '2 milliseconds',
        v_rewind_point + INTERVAL '2 milliseconds',
        v_new_user_message_id
    )
    RETURNING id INTO v_new_assistant_message_id;

    RETURN QUERY SELECT v_new_user_message_id, v_new_assistant_message_id;
END;
$$;
