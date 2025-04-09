-- Enable RLS for the new tables
alter table public.ai_providers enable row level security;
alter table public.system_prompts enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

-- RLS Policies for ai_providers
create policy "Allow authenticated users to read active providers"
  on public.ai_providers for select
  to authenticated
  using (is_active = true);

-- RLS Policies for system_prompts
create policy "Allow authenticated users to read active prompts"
  on public.system_prompts for select
  to authenticated
  using (is_active = true);

-- RLS Policies for chats
create policy "Allow users to select their own chats"
  on public.chats for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Allow users to insert their own chats"
  on public.chats for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Allow users to update title, etc.
create policy "Allow users to update their own chats"
  on public.chats for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Allow users to delete their own chats"
  on public.chats for delete
  to authenticated
  using (auth.uid() = user_id);

-- RLS Policies for chat_messages
create policy "Allow users to select messages in their own chats"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.chats
      where chats.id = chat_messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

create policy "Allow users to insert messages in their own chats"
  on public.chat_messages for insert
  to authenticated
  with check (
    -- Check 1: The chat exists and belongs to the user
    exists (
      select 1
      from public.chats
      where chats.id = chat_messages.chat_id
        and chats.user_id = auth.uid()
    )
    -- Check 2: If the role is 'user', the message's user_id must match the authenticated user
    and (role <> 'user' or user_id = auth.uid())
  );

-- Note: Update and Delete policies for chat_messages are intentionally omitted for now.
-- Updates are generally not needed, and deletes happen via cascade when a chat is deleted. 