-- Add invited_user_id column to invites table
ALTER TABLE public.invites
ADD COLUMN invited_user_id UUID NULL;

-- Add foreign key constraint to auth.users
-- Note: Ensure the user running migrations has reference permissions to auth.users
ALTER TABLE public.invites
ADD CONSTRAINT invites_invited_user_id_fkey
FOREIGN KEY (invited_user_id)
REFERENCES auth.users(id)
ON DELETE SET NULL; -- Set to NULL if the invited user is deleted

-- Ensure invited_email is NOT NULL (may be redundant if already set)
ALTER TABLE public.invites
ALTER COLUMN invited_email SET NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_invites_invited_user_id ON public.invites(invited_user_id);
-- Index on invited_email might already exist, add if not
CREATE INDEX IF NOT EXISTS idx_invites_invited_email ON public.invites(invited_email);
-- Optional: Composite index for checking existing invites per org
CREATE INDEX IF NOT EXISTS idx_invites_org_email ON public.invites(organization_id, invited_email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invites_org_user_id ON public.invites(organization_id, invited_user_id) WHERE status = 'pending';

COMMENT ON COLUMN public.invites.invited_user_id IS 'Reference to the auth.users table if the invited user exists in the system.';
