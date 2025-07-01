-- supabase/migrations/TIMESTAMP_create_invites_table.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.invites (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_token text NOT NULL UNIQUE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invited_email text NOT NULL,
    role_to_assign text NOT NULL DEFAULT 'member' CHECK (role_to_assign IN ('admin', 'member')),
    invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Assuming standard Supabase auth.users table
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at timestamp with time zone
);

-- Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_invites_organization_id ON public.invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_invites_invited_email ON public.invites(invited_email);
CREATE INDEX IF NOT EXISTS idx_invites_status ON public.invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_invited_by_user_id ON public.invites(invited_by_user_id);

COMMENT ON TABLE public.invites IS 'Stores invitations for users to join organizations.';
COMMENT ON COLUMN public.invites.invite_token IS 'Unique, non-guessable token sent to the user.';
COMMENT ON COLUMN public.invites.organization_id IS 'The organization the user is invited to join.';
COMMENT ON COLUMN public.invites.invited_email IS 'Email address of the invited user.';
COMMENT ON COLUMN public.invites.role_to_assign IS 'The role the user will have upon accepting the invite.';
COMMENT ON COLUMN public.invites.invited_by_user_id IS 'The user who sent the invitation.';
COMMENT ON COLUMN public.invites.status IS 'Current status of the invitation.';
COMMENT ON COLUMN public.invites.expires_at IS 'Optional expiration date for the invite.';

-- Optional: Enable RLS
-- ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
-- Note: RLS policies will be defined in a separate migration as per step 2.2 