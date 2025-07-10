DROP POLICY "Allow users to insert messages in accessible chats with role ch" ON "public"."chat_messages";

CREATE POLICY "Allow users to insert messages in accessible chats with role ch" ON "public"."chat_messages"
FOR INSERT TO "authenticated"
WITH CHECK (
  public.can_select_chat(chat_id) AND
  (
    (role <> 'user'::text) OR (user_id = auth.uid())
  )
);
