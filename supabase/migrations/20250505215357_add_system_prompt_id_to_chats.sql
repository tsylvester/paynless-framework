-- Add system_prompt_id column to chats table
ALTER TABLE public.chats
ADD COLUMN system_prompt_id UUID NULL REFERENCES public.system_prompts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chats.system_prompt_id IS 'Identifier for the system prompt used to initialize this chat context.';

-- Down Migration
-- ALTER TABLE public.chats DROP COLUMN IF EXISTS system_prompt_id;
