-- Drop the old overload that returns (new_user_message_id, new_assistant_message_id).
-- It was never removed when the new overload (with pre-generated IDs) was added,
-- causing PostgreSQL to dispatch to the wrong function depending on call shape.
DROP FUNCTION IF EXISTS public.perform_chat_rewind(UUID, UUID, UUID, TEXT, UUID, TEXT, UUID, UUID, JSONB, UUID, TEXT);

-- Drop the current new overload so we can recreate it with system_prompt_id
-- params moved to the end with DEFAULT NULL. PostgreSQL requires all params
-- after one with a DEFAULT to also have defaults.
DROP FUNCTION IF EXISTS public.perform_chat_rewind(UUID, UUID, UUID, UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, UUID, UUID);

-- Single canonical function. system_prompt_id params are last with DEFAULT NULL
-- so callers can omit them when no system prompt is set.
-- PostgREST uses named params, so reordering doesn't affect RPC calls.
CREATE FUNCTION public.perform_chat_rewind(
    p_chat_id UUID,
    p_rewind_from_message_id UUID,
    p_user_id UUID,
    p_new_user_message_id UUID,
    p_new_user_message_content TEXT,
    p_new_user_message_ai_provider_id UUID,
    p_new_assistant_message_id UUID,
    p_new_assistant_message_content TEXT,
    p_new_assistant_message_token_usage JSONB,
    p_new_assistant_message_ai_provider_id UUID,
    p_new_user_message_system_prompt_id UUID DEFAULT NULL,
    p_new_assistant_message_system_prompt_id UUID DEFAULT NULL
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
    SELECT cm.created_at INTO v_rewind_point_created_at
    FROM public.chat_messages cm
    WHERE cm.id = p_rewind_from_message_id AND cm.chat_id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    UPDATE public.chat_messages cm
    SET is_active_in_thread = false
    WHERE cm.chat_id = p_chat_id AND cm.created_at > v_rewind_point_created_at;

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
        NULL,
        'assistant',
        p_new_assistant_message_content,
        p_new_assistant_message_token_usage,
        p_new_assistant_message_ai_provider_id,
        p_new_assistant_message_system_prompt_id,
        true,
        p_new_user_message_id
    );

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
        RAISE;
END;
$$;
