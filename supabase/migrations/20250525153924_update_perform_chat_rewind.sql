DROP FUNCTION IF EXISTS public.perform_chat_rewind(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.perform_chat_rewind(
    -- Parameters without defaults first
    p_chat_id uuid,
    p_rewind_from_message_id uuid,
    p_user_id uuid,
    p_new_user_message_content text,
    p_new_user_message_ai_provider_id uuid,
    p_new_assistant_message_content text,
    p_new_assistant_message_ai_provider_id uuid,
    -- Parameters with defaults last
    p_new_user_message_system_prompt_id uuid DEFAULT NULL,
    p_new_assistant_message_token_usage jsonb DEFAULT NULL,
    p_new_assistant_message_system_prompt_id uuid DEFAULT NULL,
    p_new_assistant_message_error_type text DEFAULT NULL
)
RETURNS SETOF public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_user_message_id uuid;
    v_new_assistant_message_id uuid;
BEGIN
    -- Validate user owns the chat (implicit via RLS or explicit check if needed)
    -- Consider adding explicit ownership check if RLS is not sufficient here.

    -- 1. Mark existing messages from the rewind point onwards as inactive
    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE
    WHERE chat_id = p_chat_id
      AND created_at >= (
          SELECT created_at FROM public.chat_messages
          WHERE id = p_rewind_from_message_id AND chat_id = p_chat_id
      );

    -- 2. Insert the new user message
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
        p_new_user_message_system_prompt_id,
        TRUE
    )
    RETURNING id INTO v_new_user_message_id;

    -- 3. Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, -- Assistant messages still get the user_id for ownership context
        role,
        content,
        ai_provider_id,
        system_prompt_id,
        token_usage,
        error_type, -- Use the new parameter
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        p_user_id,
        'assistant',
        p_new_assistant_message_content,
        p_new_assistant_message_ai_provider_id,
        p_new_assistant_message_system_prompt_id,
        p_new_assistant_message_token_usage,
        p_new_assistant_message_error_type, -- Populate the new column
        TRUE
    )
    RETURNING id INTO v_new_assistant_message_id;

    -- 4. Return the two newly created messages
    RETURN QUERY
    SELECT * FROM public.chat_messages
    WHERE id IN (v_new_user_message_id, v_new_assistant_message_id)
    ORDER BY created_at ASC;

END;
$$;
