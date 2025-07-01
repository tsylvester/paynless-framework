-- supabase/migrations/20250428220004_update_invites_rls_policy.sql

-- Prerequisites: Ensure RLS is enabled and is_org_admin function exists.

-- Drop existing policies first for idempotency
DROP POLICY IF EXISTS "Admin access for organization invites" ON public.invites;
DROP POLICY IF EXISTS "Admin SELECT access for organization invites" ON public.invites; -- New name
DROP POLICY IF EXISTS "Admin INSERT access for organization invites" ON public.invites; -- New name
DROP POLICY IF EXISTS "Admin UPDATE access for organization invites" ON public.invites; -- New name
DROP POLICY IF EXISTS "Admin DELETE access for organization invites" ON public.invites; -- New name
DROP POLICY IF EXISTS "Invited user select access for pending invites" ON public.invites;
DROP POLICY IF EXISTS "Invited user update access for pending invites" ON public.invites;

-- Policy: Admins can SELECT invites for their organization
CREATE POLICY "Admin SELECT access for organization invites"
ON public.invites
FOR SELECT
USING ( public.is_org_admin(organization_id) );

-- Policy: Admins can INSERT invites for their organization
CREATE POLICY "Admin INSERT access for organization invites"
ON public.invites
FOR INSERT
WITH CHECK ( public.is_org_admin(organization_id) );

-- Policy: Admins can UPDATE invites for their organization (e.g., maybe revoke later?)
CREATE POLICY "Admin UPDATE access for organization invites"
ON public.invites
FOR UPDATE
USING ( public.is_org_admin(organization_id) )
WITH CHECK ( public.is_org_admin(organization_id) );

-- Policy: Admins can DELETE invites for their organization (e.g., cancel)
CREATE POLICY "Admin DELETE access for organization invites"
ON public.invites
FOR DELETE
USING ( public.is_org_admin(organization_id) );

-- Policy: Invited users can see their own pending invites
CREATE POLICY "Invited user select access for pending invites"
ON public.invites
FOR SELECT
USING (
    auth.jwt() ->> 'email' = invited_email -- Match based on JWT email claim
    AND status = 'pending'
    -- Optional: AND (expires_at IS NULL OR expires_at > now())
);

-- Policy: Invited users can update the status of their own pending invites (accept/decline)
-- The trigger 'enforce_invite_update_restrictions' will handle field-level restrictions.
CREATE POLICY "Invited user update access for pending invites"
ON public.invites
FOR UPDATE
USING (
    -- User must be the invited user and the invite must be pending
    auth.jwt() ->> 'email' = invited_email
    AND status = 'pending'
    -- Optional: AND (expires_at IS NULL OR expires_at > now())
)
WITH CHECK (
    -- User must be the invited user (redundant check ok)
    auth.jwt() ->> 'email' = invited_email
);

-- Ensure RLS is enabled (might be redundant if already enabled)
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
-- Force RLS for table owners as well (good practice)
ALTER TABLE public.invites FORCE ROW LEVEL SECURITY;

-- Update comments
COMMENT ON POLICY "Admin SELECT access for organization invites" ON public.invites IS 'Admins can SELECT invites within their organization.';
COMMENT ON POLICY "Admin INSERT access for organization invites" ON public.invites IS 'Admins can INSERT invites within their organization.';
COMMENT ON POLICY "Admin UPDATE access for organization invites" ON public.invites IS 'Admins can UPDATE invites within their organization.';
COMMENT ON POLICY "Admin DELETE access for organization invites" ON public.invites IS 'Admins can DELETE invites within their organization.';
COMMENT ON POLICY "Invited user select access for pending invites" ON public.invites IS 'Allows invited users to view their own pending invitations.';
COMMENT ON POLICY "Invited user update access for pending invites" ON public.invites IS 'Allows invited users to update their pending invites (status to accepted/declined only, enforced by trigger).';