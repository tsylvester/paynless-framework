CREATE OR REPLACE FUNCTION perform_chat_rewind(
    p_chat_id UUID,
    p_rewind_from_message_id UUID,
    p_user_id UUID, -- The user initiating the rewind and sending the new message
    p_new_user_message_content TEXT,
    p_new_user_message_ai_provider_id UUID, -- Provider used for this interaction
    p_new_user_message_system_prompt_id UUID, -- System prompt used, if any
    p_new_assistant_message_content TEXT,
    p_new_assistant_message_token_usage JSONB,
    p_new_assistant_message_ai_provider_id UUID, -- Provider used for this interaction
    p_new_assistant_message_system_prompt_id UUID -- System prompt used, if any
)
RETURNS TABLE (
    id UUID,
    chat_id UUID,
    user_id UUID,
    role TEXT, -- Assuming 'user' or 'assistant'
    content TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    is_active_in_thread BOOLEAN,
    token_usage JSONB,
    ai_provider_id UUID,
    system_prompt_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rewind_point_created_at TIMESTAMPTZ;
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
BEGIN
    -- Get the created_at of the message to rewind from
    SELECT created_at INTO v_rewind_point_created_at
    FROM public.chat_messages
    WHERE chat_messages.id = p_rewind_from_message_id AND chat_messages.chat_id = p_chat_id; -- Corrected: qualified id

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- Deactivate messages after the rewind point
    UPDATE public.chat_messages
    SET is_active_in_thread = false
    WHERE chat_messages.chat_id = p_chat_id AND created_at > v_rewind_point_created_at;

    -- Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id,
        user_id,
        role,
        content,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        p_user_id,
        'user',
        p_new_user_message_content,
        p_new_user_message_ai_provider_id,
        p_new_user_message_system_prompt_id, -- Can be NULL
        true
    )
    RETURNING chat_messages.id INTO v_new_user_message_id;

    -- Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, -- Will be NULL for assistant
        role,
        content,
        token_usage,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        NULL, -- Assistant messages have NULL user_id
        'assistant',
        p_new_assistant_message_content,
        p_new_assistant_message_token_usage,
        p_new_assistant_message_ai_provider_id,
        p_new_assistant_message_system_prompt_id, -- Can be NULL
        true
    )
    RETURNING chat_messages.id INTO v_new_assistant_message_id;

    -- Return the newly created assistant message
    RETURN QUERY
    SELECT *
    FROM public.chat_messages
    WHERE chat_messages.id = v_new_assistant_message_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depending on PostgreSQL logging setup)
        RAISE; -- Re-raise the exception to ensure transaction rollback
        -- The transaction will automatically roll back on any unhandled exception.
END;
$$;
