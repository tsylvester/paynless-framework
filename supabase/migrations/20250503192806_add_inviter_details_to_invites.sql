ALTER TABLE public.invites
ADD COLUMN IF NOT EXISTS inviter_email text,
ADD COLUMN IF NOT EXISTS inviter_first_name text,
ADD COLUMN IF NOT EXISTS inviter_last_name text;

COMMENT ON COLUMN public.invites.inviter_email IS 'Snapshot of the inviting user''''s email at the time of invitation.';
COMMENT ON COLUMN public.invites.inviter_first_name IS 'Snapshot of the inviting user''''s first name at the time of invitation.';
COMMENT ON COLUMN public.invites.inviter_last_name IS 'Snapshot of the inviting user''''s last name at the time of invitation.';

-- Optional: Backfill existing invites if desired (might be complex to get inviter details)
-- UPDATE public.invites i SET inviter_email = (SELECT email FROM auth.users u WHERE u.id = i.invited_by_user_id) WHERE inviter_email IS NULL;
-- UPDATE public.invites i SET inviter_first_name = (SELECT raw_user_meta_data->>''first_name'' FROM auth.users u WHERE u.id = i.invited_by_user_id) WHERE inviter_first_name IS NULL; -- Example if name is in metadata
-- UPDATE public.invites i SET inviter_last_name = (SELECT raw_user_meta_data->>''last_name'' FROM auth.users u WHERE u.id = i.invited_by_user_id) WHERE inviter_last_name IS NULL; -- Example if name is in metadata 