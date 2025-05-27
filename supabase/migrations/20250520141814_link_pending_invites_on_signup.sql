-- Modify link_pending_invites_on_signup to use service_role for invite updates and org member creation
CREATE OR REPLACE FUNCTION public.link_pending_invites_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
  current_role TEXT;
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
      -- Store current role and set to service_role for privileged operations
      SELECT current_user INTO current_role;
      SET LOCAL ROLE service_role;

      BEGIN
        -- Update the invite: set invited_user_id and status to 'accepted'
        UPDATE public.invites
        SET
          invited_user_id = NEW.id,
          status = 'accepted'
        WHERE id = invite_record.id;

        -- Create a new organization_member record
        INSERT INTO public.organization_members (user_id, organization_id, role, status)
        VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
        ON CONFLICT (user_id, organization_id) DO UPDATE
        SET role = EXCLUDED.role, status = 'active';

        -- Restore the original role
        EXECUTE 'SET LOCAL ROLE ' || quote_ident(current_role);
      EXCEPTION
        WHEN OTHERS THEN
          -- Restore the original role in case of an error
          EXECUTE 'SET LOCAL ROLE ' || quote_ident(current_role);
          RAISE; -- Re-raise the caught exception
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.link_pending_invites_on_signup() IS 'Automatically links pending invites, creates an organization_members record with an active status, and updates the invite status to accepted for a newly signed-up user based on matching email address. Uses service_role for invite and org member table modifications.';

-- The trigger itself (trigger_link_invites_on_signup on auth.users) does not need to be redefined
-- as CREATE OR REPLACE FUNCTION updates the function body.