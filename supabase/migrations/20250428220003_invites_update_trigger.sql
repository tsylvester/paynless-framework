-- supabase/migrations/20250428220003_invites_update_trigger.sql

CREATE OR REPLACE FUNCTION public.restrict_invite_update_fields()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Allow all changes if the user is an admin of the org (checked using the helper function)
  -- RLS policies should still prevent admins from modifying invites in other orgs.
  SELECT public.is_org_admin(OLD.organization_id) INTO is_admin;
  IF is_admin THEN
    RETURN NEW; -- Admins bypass this trigger's restrictions
  END IF;

  -- For non-admins, verify they are the invited user (should be guaranteed by RLS, but good to double-check)
  IF auth.jwt() ->> 'email' != OLD.invited_email THEN
     RAISE WARNING 'Attempted invite update by non-invited user bypassed RLS? User: %, Invite Email: %', auth.uid(), OLD.invited_email;
     RAISE EXCEPTION 'User is not authorized to modify this invite';
  END IF;

  -- Check if the update is specifically changing status from 'pending' to 'accepted' or 'declined'
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
      -- Ensure *only* the status field is different. Compare other fields.
      IF NEW.id = OLD.id AND
         NEW.invite_token = OLD.invite_token AND
         NEW.organization_id = OLD.organization_id AND
         NEW.invited_email = OLD.invited_email AND
         NEW.role_to_assign = OLD.role_to_assign AND
         NEW.invited_by_user_id = OLD.invited_by_user_id AND
         NEW.created_at = OLD.created_at AND
         NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at -- Handles NULL correctly
      THEN
          RETURN NEW; -- Allow the update
      ELSE
          RAISE EXCEPTION 'Invite update rejected: Only the status field can be changed by the invited user.';
      END IF;
  ELSIF OLD.status = NEW.status THEN
      -- If status isn't changing, but other fields might be, reject if non-admin
       RAISE EXCEPTION 'Invite update rejected: Non-admins cannot modify fields other than status.';
  ELSE
       -- Catch-all for other invalid status transitions (e.g., accepted -> declined) by non-admins
       RAISE EXCEPTION 'Invite update rejected: Invalid status transition attempt.';
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists to ensure idempotency
DROP TRIGGER IF EXISTS enforce_invite_update_restrictions ON public.invites;

-- Create the trigger to run before update operations
CREATE TRIGGER enforce_invite_update_restrictions
BEFORE UPDATE ON public.invites
FOR EACH ROW
EXECUTE FUNCTION public.restrict_invite_update_fields();

COMMENT ON FUNCTION public.restrict_invite_update_fields() IS 'Trigger function to ensure only the status field of an invite can be changed to accepted/declined by the invited user (non-admins).';
COMMENT ON TRIGGER enforce_invite_update_restrictions ON public.invites IS 'Restricts updates on invites made by non-admins, ensuring only status change is possible.'; 