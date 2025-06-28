-- Add allow_member_chat_creation column to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS allow_member_chat_creation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.allow_member_chat_creation IS 'Controls whether non-admin members can create new chat sessions within this organization.';

-- Down Migration
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS allow_member_chat_creation;
