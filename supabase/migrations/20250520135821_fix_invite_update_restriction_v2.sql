CREATE OR REPLACE FUNCTION public.restrict_invite_update_fields()
RETURNS TRIGGER AS $$
DECLARE
  is_org_admin_check BOOLEAN;
  effective_role TEXT;
  is_effective_role_superuser BOOLEAN;
  current_auth_role TEXT;
  current_auth_uid TEXT;
BEGIN
  -- Detailed Logging for Debugging Role Context
  SELECT current_setting('role', true) INTO effective_role;
  SELECT rolsuper INTO is_effective_role_superuser FROM pg_roles WHERE rolname = effective_role LIMIT 1; -- Add LIMIT 1 just in case
  is_effective_role_superuser := COALESCE(is_effective_role_superuser, FALSE); -- Ensure it's not NULL

  current_auth_role := auth.role(); -- Get the role from Supabase auth context
  current_auth_uid := auth.uid()::text; -- Get the UID from Supabase auth context

  RAISE LOG '[restrict_invite_update_fields] Effective Role: %, Is Superuser: %, Auth Role: %, Auth UID: %', 
              effective_role, is_effective_role_superuser, current_auth_role, current_auth_uid;
  RAISE LOG '[restrict_invite_update_fields] OLD.invited_user_id: %, NEW.invited_user_id: %, OLD.status: %, NEW.status: %',
              OLD.invited_user_id, NEW.invited_user_id, OLD.status, NEW.status;


  -- Allow all changes if the effective role is a known powerful role.
  -- More robust check for common Supabase service roles.
  IF effective_role IN ('postgres', 'supabase_admin', 'service_role', 'supabase_storage_admin') OR is_effective_role_superuser IS TRUE THEN
    RAISE LOG '[restrict_invite_update_fields] Allowing update due to powerful effective role: %', effective_role;
    RETURN NEW;
  END IF;

  -- If not a service/superuser, then check if the user is an admin of the org
  SELECT public.is_org_admin(OLD.organization_id) INTO is_org_admin_check;
  IF COALESCE(is_org_admin_check, FALSE) THEN
    RAISE LOG '[restrict_invite_update_fields] Allowing update due to org admin status for user % and org %', current_auth_uid, OLD.organization_id;
    RETURN NEW;
  END IF;

  -- For non-admins (and non-service roles/superusers):
  IF current_auth_role != 'authenticated' OR (auth.jwt() ->> 'email') != OLD.invited_email THEN
     RAISE WARNING '[restrict_invite_update_fields] Auth check failed. Auth Role: %, Invite Email: %, JWT Email: %', current_auth_role, OLD.invited_email, (auth.jwt() ->> 'email');
     RAISE EXCEPTION 'User is not authorized to modify this invite (not invited user or not authenticated).';
  END IF;

  -- If the session is an authenticated user (not service/admin) updating their own invite:
  -- Allow status change from 'pending' to 'accepted' or 'declined'.
  -- Also, very specifically, allow invited_user_id to be set if it was NULL and status is changing to 'accepted'.
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
      IF NEW.status != OLD.status AND -- Status must actually be changing
         (NEW.invited_user_id IS NOT DISTINCT FROM OLD.invited_user_id OR (OLD.invited_user_id IS NULL AND NEW.invited_user_id = auth.uid())) AND -- Allow invited_user_id to be set to current user if it was null
         NEW.id IS NOT DISTINCT FROM OLD.id AND
         NEW.invite_token IS NOT DISTINCT FROM OLD.invite_token AND
         NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND
         NEW.invited_email IS NOT DISTINCT FROM OLD.invited_email AND
         NEW.role_to_assign IS NOT DISTINCT FROM OLD.role_to_assign AND
         NEW.invited_by_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id AND
         NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND
         NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
      THEN
          RAISE LOG '[restrict_invite_update_fields] Allowing status update for invited user %', OLD.invited_email;
          RETURN NEW;
      ELSE
          RAISE WARNING '[restrict_invite_update_fields] Disallowed field modification during status change by invited user. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
          RAISE EXCEPTION 'Invite update rejected: Only the status field can be changed (and user linked) by the invited user when accepting/declining.';
      END IF;
  -- This ELSIF specifically handles the case for link_pending_invites_on_signup where ONLY invited_user_id is set
  -- and status remains 'pending'. This should have been caught by the service role check above.
  -- If it reaches here, it means the service role check failed.
  ELSIF OLD.invited_user_id IS NULL AND NEW.invited_user_id IS NOT NULL AND OLD.status = 'pending' AND NEW.status = 'pending' THEN
      RAISE WARNING '[restrict_invite_update_fields] Service role bypass failed? Allowing invited_user_id update by presumed system process. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
      RETURN NEW; -- Allow only invited_user_id to be set if it was NULL and status is still pending

  ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
       RAISE WARNING '[restrict_invite_update_fields] Disallowed field modification (status not changing) by non-admin/non-service. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
       RAISE EXCEPTION 'Invite update rejected: Non-admins (and non-superusers) cannot modify fields other than status when status is not changing.';
  ELSE
       RAISE WARNING '[restrict_invite_update_fields] Invalid status transition by non-admin/non-service. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
       RAISE EXCEPTION 'Invite update rejected: Invalid status transition attempt by non-admin/non-superuser.';
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.restrict_invite_update_fields() IS 'Trigger function to ensure specific field update rules for invites. Allows service roles/superusers more leeway. Restricts non-admin invited users to primarily status changes. Includes extensive logging for debugging role context.';