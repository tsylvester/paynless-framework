-- supabase/migrations/20250520134418_fix_invite_update_restriction_for_service_role.sql

CREATE OR REPLACE FUNCTION public.restrict_invite_update_fields()
RETURNS TRIGGER AS $$
DECLARE
  is_org_admin_check BOOLEAN;
  effective_role TEXT;
  is_superuser BOOLEAN;
BEGIN
  -- Get the role that is effectively running this function and check if it's a superuser
  SELECT current_setting('role', true) INTO effective_role;
  SELECT rolsuper INTO is_superuser FROM pg_roles WHERE rolname = effective_role;

  -- Allow all changes if the effective role is a superuser (e.g., 'postgres') 
  -- or a specifically named service role (adjust 'service_role' if yours is different).
  IF (is_superuser IS TRUE) OR (effective_role = 'service_role') THEN
    RETURN NEW; -- Superusers or designated service roles bypass further restrictions
  END IF;

  -- If not a service/superuser, then check if the user is an admin of the org
  -- Ensure is_org_admin function is SECURITY DEFINER or handles auth context appropriately.
  SELECT public.is_org_admin(OLD.organization_id) INTO is_org_admin_check;
  IF is_org_admin_check THEN
    RETURN NEW; -- Org admins bypass this trigger's field restrictions
  END IF;

  -- For non-admins (and non-service roles/superusers):
  -- Verify they are the invited user (should be guaranteed by RLS, but good to double-check)
  -- This check assumes auth.jwt() is available and relevant for the session.
  -- If this trigger can be fired by unauthenticated paths or different auth schemes, this check might need adjustment.
  IF auth.role() != 'authenticated' OR (auth.jwt() ->> 'email') != OLD.invited_email THEN
     RAISE WARNING 'Attempted invite update by non-invited/unauthenticated user bypassed RLS? User: %, Invite Email: %', auth.uid(), OLD.invited_email;
     RAISE EXCEPTION 'User is not authorized to modify this invite (not invited user or not authenticated).';
  END IF;

  -- Check if the update is specifically changing status from 'pending' to 'accepted' or 'declined'
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
      -- Ensure *only* the status field and potentially invited_user_id (if it was NULL) are different.
      IF NEW.id IS NOT DISTINCT FROM OLD.id AND
         NEW.invite_token IS NOT DISTINCT FROM OLD.invite_token AND
         NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND
         NEW.invited_email IS NOT DISTINCT FROM OLD.invited_email AND
         NEW.role_to_assign IS NOT DISTINCT FROM OLD.role_to_assign AND
         NEW.invited_by_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id AND
         NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND
         NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at AND
         -- Allow invited_user_id to change ONLY IF it was NULL and is now being set.
         -- This specific allowance is for the system process (link_pending_invites_on_signup).
         -- However, the service_role/superuser check at the top should ideally handle this already.
         -- This secondary check provides a safeguard if the top check is too broad or misses a case.
         (OLD.invited_user_id IS NULL AND NEW.invited_user_id IS NOT NULL OR OLD.invited_user_id IS NOT DISTINCT FROM NEW.invited_user_id)
      THEN
          RETURN NEW; -- Allow the update
      ELSE
          RAISE EXCEPTION 'Invite update rejected: Only the status field (and linking invited_user_id if previously null) can be changed by the invited user.';
      END IF;
  ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      -- If status isn't changing, but other fields might be, reject if non-admin/non-superuser.
       RAISE EXCEPTION 'Invite update rejected: Non-admins (and non-superusers) cannot modify fields other than status when status is not changing.';
  ELSE
       -- Catch-all for other invalid status transitions by non-admins/non-superusers
       RAISE EXCEPTION 'Invite update rejected: Invalid status transition attempt by non-admin/non-superuser.';
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger itself (enforce_invite_update_restrictions) does not need to be recreated
-- as it already calls this function. Just replacing the function is enough.

COMMENT ON FUNCTION public.restrict_invite_update_fields() IS 'Trigger function to ensure only the status field of an invite can be changed to accepted/declined by the invited user (non-admins), and allows service roles/superuser to update other fields as needed (e.g. invited_user_id on signup).'; 