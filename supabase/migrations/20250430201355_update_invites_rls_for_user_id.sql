-- Drop existing policies for invited users
DROP POLICY IF EXISTS "Invited user select access for pending invites" ON public.invites;
DROP POLICY IF EXISTS "Invited user update access for pending invites" ON public.invites;
-- Also drop the ID-based ones if they were created in a previous attempt
DROP POLICY IF EXISTS "Invited user select access by ID" ON public.invites;
DROP POLICY IF EXISTS "Invited user update access by ID" ON public.invites;

-- Policy: Invited users can SELECT their own pending invites (ID or Email fallback)
CREATE POLICY "Invited user select access for pending invites"
ON public.invites
FOR SELECT
USING (
  status = 'pending' AND (
    -- Priority 1: Match the linked user ID if it exists
    (invited_user_id IS NOT NULL AND auth.uid() = invited_user_id)
    OR
    -- Priority 2: Match email if no user ID is linked (for invites sent before signup)
    (invited_user_id IS NULL AND auth.jwt() ->> 'email' = invited_email)
  )
  -- Optional: AND (expires_at IS NULL OR expires_at > now())
);

-- Policy: Invited users can UPDATE status of their own pending invites (ID or Email fallback)
-- Trigger 'enforce_invite_update_restrictions' handles field-level locks.
CREATE POLICY "Invited user update access for pending invites"
ON public.invites
FOR UPDATE
USING (
  status = 'pending' AND (
    (invited_user_id IS NOT NULL AND auth.uid() = invited_user_id)
    OR
    (invited_user_id IS NULL AND auth.jwt() ->> 'email' = invited_email)
  )
  -- Optional: AND (expires_at IS NULL OR expires_at > now())
)
WITH CHECK (
  -- Check condition ensures they don't change who the invite is for
  (invited_user_id IS NOT NULL AND auth.uid() = invited_user_id)
  OR
  (invited_user_id IS NULL AND auth.jwt() ->> 'email' = invited_email)
);


-- Update comments
COMMENT ON POLICY "Invited user select access for pending invites" ON public.invites IS 'Allows invited users to view their own pending invitations, matching by user ID if linked, otherwise by email.';
COMMENT ON POLICY "Invited user update access for pending invites" ON public.invites IS 'Allows invited users to update their pending invites (status only), matching by user ID if linked, otherwise by email. Trigger enforces field restrictions.';
