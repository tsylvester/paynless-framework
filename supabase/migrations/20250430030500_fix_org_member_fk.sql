-- Migration: Correct the foreign key constraint on organization_members.user_id

BEGIN;

-- Drop the existing constraint pointing to auth.users
-- NOTE: If this constraint name is different in your DB, update the name below.
ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_user_id_fkey; -- Assuming default naming

-- Add the new constraint pointing to public.user_profiles
ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_user_id_fkey -- Re-using the standard name
FOREIGN KEY (user_id)
REFERENCES public.user_profiles(id)
ON DELETE CASCADE;

COMMIT; 