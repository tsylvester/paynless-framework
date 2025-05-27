DROP FUNCTION IF EXISTS public.perform_chat_rewind;

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
    -- Explicitly match chat_messages table structure IN ORDER
    id uuid,
    chat_id uuid,
    user_id uuid,
    role text,
    content text,
    created_at timestamptz,
    is_active_in_thread boolean,
    token_usage jsonb,
    ai_provider_id uuid,
    system_prompt_id uuid
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rewind_point_created_at TIMESTAMPTZ;
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
BEGIN
    -- Get the created_at of the message to rewind from (QUALIFIED)
    SELECT cm.created_at INTO v_rewind_point_created_at
    FROM public.chat_messages cm
    WHERE cm.id = p_rewind_from_message_id AND cm.chat_id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- Deactivate messages after the rewind point (QUALIFIED)
    UPDATE public.chat_messages
    SET is_active_in_thread = false
    WHERE chat_messages.chat_id = p_chat_id AND chat_messages.created_at > v_rewind_point_created_at;

    -- Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id, user_id, role, content, ai_provider_id, system_prompt_id, is_active_in_thread
    )
    VALUES (
        p_chat_id, p_user_id, 'user', p_new_user_message_content, p_new_user_message_ai_provider_id, p_new_user_message_system_prompt_id, true
    )
    RETURNING public.chat_messages.id INTO v_new_user_message_id;

    -- Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id, user_id, role, content, token_usage, ai_provider_id, system_prompt_id, is_active_in_thread
    )
    VALUES (
        p_chat_id, NULL, 'assistant', p_new_assistant_message_content, p_new_assistant_message_token_usage, p_new_assistant_message_ai_provider_id, p_new_assistant_message_system_prompt_id, true
    )
    RETURNING public.chat_messages.id INTO v_new_assistant_message_id;

    -- Return the newly created assistant message with EXPLICIT column order
    RETURN QUERY
    SELECT
        cm.id,
        cm.chat_id,
        cm.user_id,
        cm.role,
        cm.content,
        cm.created_at,
        cm.is_active_in_thread,
        cm.token_usage,
        cm.ai_provider_id,
        cm.system_prompt_id
    FROM public.chat_messages cm
    WHERE cm.id = v_new_assistant_message_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depending on PostgreSQL logging setup)
        RAISE; -- Re-raise the exception to ensure transaction rollback
END;
$function$;

COMMENT ON FUNCTION public.perform_chat_rewind IS 'Performs a chat rewind operation atomically: deactivates messages after a specified point and inserts new user and assistant messages.';
