-- supabase/migrations/20250520135822_enhance_link_invites_to_create_org_member.sql

-- Function to link pending invites, create organization_members record, and update invite status when a user signs up
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
      UPDATE public.invites
      SET
        invited_user_id = NEW.id,
        status = 'accepted'
      WHERE id = invite_record.id;

      -- Create a new organization_member record
      -- Assumes organization_members table has user_id, organization_id, role, and status fields
      -- Status is set to 'active' assuming invite acceptance means immediate active membership
      INSERT INTO public.organization_members (user_id, organization_id, role, status)
      VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
      ON CONFLICT (user_id, organization_id) DO UPDATE 
      SET role = EXCLUDED.role, status = 'active'; -- Or handle conflict as appropriate

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger (if necessary, though CREATE OR REPLACE FUNCTION should be sufficient for the function body)
-- DROP TRIGGER IF EXISTS trigger_link_invites_on_signup ON auth.users;
-- CREATE TRIGGER trigger_link_invites_on_signup
-- AFTER INSERT ON auth.users
-- FOR EACH ROW
-- EXECUTE FUNCTION public.link_pending_invites_on_signup();

COMMENT ON FUNCTION public.link_pending_invites_on_signup() IS 'Automatically links pending invites, creates an organization_members record with an active status, and updates the invite status to accepted for a newly signed-up user based on matching email address.';
-- The trigger comment remains the same. 