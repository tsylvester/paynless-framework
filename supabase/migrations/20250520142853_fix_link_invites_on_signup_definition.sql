-- supabase/migrations/20250520142525_fix_link_invites_on_signup_definition.sql

-- This migration re-applies the correct definition of public.link_pending_invites_on_signup
-- to ensure the version in the database matches the intended version from previous migrations,
-- specifically removing any unintended 'SET LOCAL ROLE' statements that may have existed
-- in the database due to manual application or out-of-sync states.

CREATE OR REPLACE FUNCTION public.link_pending_invites_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
BEGIN
  -- Check if the new user has an email (should always be true for Supabase auth)
  IF NEW.email IS NOT NULL THEN
    -- Loop through all pending invites matching the new user's email
    FOR invite_record IN
      SELECT id, organization_id, role_to_assign
      FROM public.invites
      WHERE invited_email = NEW.email
        AND invited_user_id IS NULL
        AND status = 'pending'
    LOOP
      -- Update the invite: set invited_user_id and status to 'accepted'
      -- This update is allowed by the 'restrict_invite_update_fields' trigger
      -- because this function (link_pending_invites_on_signup) runs as SECURITY DEFINER (postgres),
      -- and the trigger is designed to permit these specific changes by the postgres role.
      UPDATE public.invites
      SET
        invited_user_id = NEW.id,
        status = 'accepted'
      WHERE id = invite_record.id;

      -- Create a new organization_member record
      -- This insert is allowed because this function runs as SECURITY DEFINER (postgres),
      -- and the postgres role has implicit permissions to insert into tables it owns or has privileges on.
      INSERT INTO public.organization_members (user_id, organization_id, role, status)
      VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
      ON CONFLICT (user_id, organization_id) DO UPDATE 
      SET role = EXCLUDED.role, status = 'active';

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.link_pending_invites_on_signup() SET search_path = public, pg_catalog;

-- The associated trigger 'trigger_link_invites_on_signup' on 'auth.users'
-- does not need to be dropped and recreated as CREATE OR REPLACE FUNCTION
-- updates the function body in place.

COMMENT ON FUNCTION public.link_pending_invites_on_signup() IS 'Re-applied: Automatically links pending invites, creates an organization_members record with an active status, and updates the invite status to accepted for a newly signed-up user based on matching email address. Ensures no SET LOCAL ROLE is present.'; 