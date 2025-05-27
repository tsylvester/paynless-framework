-- Add organization_id column to chats table
ALTER TABLE public.chats
ADD COLUMN organization_id UUID NULL REFERENCES public.organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.chats.organization_id IS 'Identifier for the organization this chat belongs to, NULL for personal chats.';

-- Add index for efficient lookup of organization chats
CREATE INDEX idx_chats_organization_id ON public.chats (organization_id) WHERE organization_id IS NOT NULL;

-- Optional: Add composite index if frequently filtering by user AND org
-- CREATE INDEX idx_chats_user_organization ON public.chats (user_id, organization_id);

-- Down Migration (optional but good practice)
-- To reverse, drop the column and the index
-- Note: Supabase doesn't automatically run down migrations, this is for manual rollback.
-- DROP INDEX IF EXISTS idx_chats_organization_id;
-- ALTER TABLE public.chats DROP COLUMN IF EXISTS organization_id;
