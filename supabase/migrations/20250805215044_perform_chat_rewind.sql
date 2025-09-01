CREATE OR REPLACE FUNCTION perform_chat_rewind(
    p_chat_id UUID,
    p_rewind_from_message_id UUID,
    p_user_id UUID,
    p_new_user_message_id UUID, -- The pre-generated ID for the new user message
    p_new_user_message_content TEXT,
    p_new_user_message_ai_provider_id UUID,
    p_new_user_message_system_prompt_id UUID,
    p_new_assistant_message_id UUID, -- The pre-generated ID for the new assistant message
    p_new_assistant_message_content TEXT,
    p_new_assistant_message_token_usage JSONB,
    p_new_assistant_message_ai_provider_id UUID,
    p_new_assistant_message_system_prompt_id UUID
)
RETURNS TABLE (
    id UUID,
    chat_id UUID,
    user_id UUID,
    role TEXT,
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
BEGIN
    -- 1. Get the created_at of the message to rewind from
    SELECT cm.created_at INTO v_rewind_point_created_at
    FROM public.chat_messages cm
    WHERE cm.id = p_rewind_from_message_id AND cm.chat_id = p_chat_id;

    -- 2. Check if the rewind point message was found
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- 3. Deactivate messages created strictly after the rewind point
    UPDATE public.chat_messages cm
    SET is_active_in_thread = false
    WHERE cm.chat_id = p_chat_id AND cm.created_at > v_rewind_point_created_at;

    -- 4. Insert the new user message with the provided ID
    INSERT INTO public.chat_messages (
        id,
        chat_id,
        user_id,
        role,
        content,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_new_user_message_id,
        p_chat_id,
        p_user_id,
        'user',
        p_new_user_message_content,
        p_new_user_message_ai_provider_id,
        p_new_user_message_system_prompt_id,
        true
    );

    -- 5. Insert the new assistant message with the provided ID
    INSERT INTO public.chat_messages (
        id,
        chat_id,
        user_id,
        role,
        content,
        token_usage,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread,
        response_to_message_id
    )
    VALUES (
        p_new_assistant_message_id,
        p_chat_id,
        NULL, -- Assistant messages have NULL user_id
        'assistant',
        p_new_assistant_message_content,
        p_new_assistant_message_token_usage,
        p_new_assistant_message_ai_provider_id,
        p_new_assistant_message_system_prompt_id,
        true,
        p_new_user_message_id
    );

    -- 6. Return the newly created assistant message row
    RETURN QUERY
    SELECT
        cm.id,
        cm.chat_id,
        cm.user_id,
        cm.role,
        cm.content,
        cm.created_at,
        cm.updated_at,
        cm.is_active_in_thread,
        cm.token_usage,
        cm.ai_provider_id,
        cm.system_prompt_id
    FROM public.chat_messages cm
    WHERE cm.id = p_new_assistant_message_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depends on logging setup)
        RAISE; -- Re-raise the exception to ensure transaction rollback
END;
$$;

