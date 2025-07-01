/**
 Phase 1: AI Chat Integration - Create Tables
*/

-- Enable UUID generation if not already enabled
create extension if not exists "uuid-ossp" with schema extensions;

-- Table: ai_providers
create table if not exists public.ai_providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  api_identifier text not null unique,
  description text null,
  is_active boolean not null default true,
  config jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_providers is 'Stores information about supported AI models/providers.';

-- Table: system_prompts
create table if not exists public.system_prompts (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  prompt_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.system_prompts is 'Stores reusable system prompts for AI interactions.';

-- Table: chats
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chats is 'Represents a single conversation thread.';
create index if not exists idx_chats_user_id on public.chats (user_id);

-- Table: chat_messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null, -- Can be null if assistant message or system message context?
  role text not null check (role in ('user', 'assistant', 'system')), -- Consider enum type?
  content text not null,
  ai_provider_id uuid null references public.ai_providers(id) on delete set null,
  system_prompt_id uuid null references public.system_prompts(id) on delete set null,
  token_usage jsonb null, -- Store request/response tokens if provided by the API
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Stores individual messages within a chat session.';
create index if not exists idx_chat_messages_chat_id on public.chat_messages (chat_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages (created_at); -- For ordering messages

-- Trigger function to update `updated_at` timestamp on modification
create or replace function public.handle_updated_at() 
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
SET search_path = public, pg_catalog;

-- Apply the trigger to tables with `updated_at`
drop trigger if exists on_ai_providers_update on public.ai_providers;
create trigger on_ai_providers_update
  before update on public.ai_providers
  for each row execute procedure public.handle_updated_at();

drop trigger if exists on_system_prompts_update on public.system_prompts;
create trigger on_system_prompts_update
  before update on public.system_prompts
  for each row execute procedure public.handle_updated_at();

drop trigger if exists on_chats_update on public.chats;
create trigger on_chats_update
  before update on public.chats
  for each row execute procedure public.handle_updated_at();
