-- Fix perform_chat_rewind function to set user_id to NULL for assistant messages
-- Bug: Assistant messages were being created with p_user_id instead of NULL

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
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = p_rewind_from_message_id;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = (
        SELECT cm_user.id
        FROM public.chat_messages cm_user
        JOIN public.chat_messages cm_assistant ON cm_user.chat_id = cm_assistant.chat_id
        WHERE cm_assistant.id = p_rewind_from_message_id
          AND cm_user.role = 'user'
          AND cm_user.user_id = p_user_id
          AND cm_user.created_at < cm_assistant.created_at
          AND cm_user.is_active_in_thread = TRUE 
        ORDER BY cm_user.created_at DESC
        LIMIT 1
    );

    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id,
        is_active_in_thread,
        created_at,
        updated_at
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'user', 
        p_new_user_message_content, 
        p_new_user_message_ai_provider_id, 
        p_new_user_message_system_prompt_id,
        TRUE, 
        v_rewind_point + INTERVAL '1 millisecond', 
        v_rewind_point + INTERVAL '1 millisecond'
    )
    RETURNING id INTO v_new_user_message_id;

    -- FIX: Set user_id to NULL for assistant messages
    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id, 
        token_usage, 
        error_type,
        is_active_in_thread,
        created_at,
        updated_at,
        response_to_message_id
    )
    VALUES (
        p_chat_id, 
        NULL,  -- FIX: Assistant messages should have user_id = NULL
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

-- Fix perform_chat_rewind function to properly deactivate all messages after rewind point
-- Bug: Function was not deactivating all messages that come after the rewind timestamp

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
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the timestamp of the rewind point message
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    -- FIX: Deactivate ALL messages that come after the rewind point (including the rewind point itself)
    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE chat_id = p_chat_id
      AND created_at >= v_rewind_point
      AND is_active_in_thread = TRUE;

    -- Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id,
        is_active_in_thread,
        created_at,
        updated_at
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'user', 
        p_new_user_message_content, 
        p_new_user_message_ai_provider_id, 
        p_new_user_message_system_prompt_id,
        TRUE, 
        v_rewind_point + INTERVAL '1 millisecond', 
        v_rewind_point + INTERVAL '1 millisecond'
    )
    RETURNING id INTO v_new_user_message_id;

    -- Insert the new assistant message (with user_id = NULL)
    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id, 
        token_usage, 
        error_type,
        is_active_in_thread,
        created_at,
        updated_at,
        response_to_message_id
    )
    VALUES (
        p_chat_id, 
        NULL,  -- Assistant messages should have user_id = NULL
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