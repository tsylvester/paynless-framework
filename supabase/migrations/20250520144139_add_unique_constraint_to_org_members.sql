BEGIN;

-- Drop the existing non-unique index, as the unique constraint will create its own index.
DROP INDEX IF EXISTS public.idx_organization_members_user_org;

-- Add a unique constraint on user_id and organization_id to the organization_members table.
-- This ensures that a user can only be a member of an organization once.
ALTER TABLE public.organization_members
ADD CONSTRAINT unique_user_organization UNIQUE (user_id, organization_id);

COMMENT ON CONSTRAINT unique_user_organization ON public.organization_members IS 'Ensures that a user can only have one membership record per organization.';

COMMIT;
