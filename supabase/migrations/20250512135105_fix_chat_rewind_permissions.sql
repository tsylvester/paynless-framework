-- Grant necessary permissions to the function owner for perform_chat_rewind
GRANT SELECT, UPDATE, INSERT ON public.chat_messages TO postgres;
GRANT SELECT ON public.chats TO postgres;
GRANT SELECT ON public.organization_members TO postgres;

-- Ensure the function has the right permissions
ALTER FUNCTION public.perform_chat_rewind(
    uuid, uuid, uuid, text, uuid, uuid, text, jsonb, uuid, uuid
) OWNER TO postgres; 