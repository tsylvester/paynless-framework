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
    -- 1. Get the created_at of the message to rewind from
    -- Ensure all column references are qualified to avoid ambiguity
    SELECT cm.created_at INTO v_rewind_point_created_at
    FROM public.chat_messages cm -- Added alias 'cm' for clarity
    WHERE cm.id = p_rewind_from_message_id AND cm.chat_id = p_chat_id;

    -- 2. Check if the rewind point message was found
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- 3. Deactivate messages created strictly after the rewind point
    -- Ensure all column references are qualified
    UPDATE public.chat_messages cm -- Added alias 'cm'
    SET is_active_in_thread = false
    WHERE cm.chat_id = p_chat_id AND cm.created_at > v_rewind_point_created_at;

    -- 4. Insert the new user message
    -- Ensure all column references in RETURNING are qualified
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, -- This refers to the column, distinct from p_user_id parameter
        role,
        content,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        p_user_id, -- Using the parameter value
        'user',
        p_new_user_message_content,
        p_new_user_message_ai_provider_id,
        p_new_user_message_system_prompt_id, -- Can be NULL
        true
    )
    RETURNING public.chat_messages.id INTO v_new_user_message_id; -- Explicitly qualify RETURNING column

    -- 5. Insert the new assistant message
    -- Ensure all column references in RETURNING are qualified
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, -- This refers to the column
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
    RETURNING public.chat_messages.id INTO v_new_assistant_message_id; -- Explicitly qualify RETURNING column

    -- 6. Return the newly created assistant message row
    -- Ensure all column references are qualified
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
    FROM public.chat_messages cm -- Added alias 'cm'
    WHERE cm.id = v_new_assistant_message_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depends on logging setup)
        -- Consider logging relevant parameters like p_chat_id, p_rewind_from_message_id
        RAISE; -- Re-raise the exception to ensure transaction rollback
        -- The transaction will automatically roll back on any unhandled exception.
END;
$$;