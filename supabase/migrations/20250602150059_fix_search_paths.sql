BEGIN;

-- Function: public.create_notification_for_user
-- Original file: supabase/migrations/20250422110000_create_placeholder_notification_trigger.sql
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  target_user_id UUID,
  notification_type TEXT,
  notification_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$$;

-- Function: public.handle_placeholder_event
-- Original file: supabase/migrations/20250422110000_create_placeholder_notification_trigger.sql
CREATE OR REPLACE FUNCTION public.handle_placeholder_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  example_admin_id UUID;
  example_requesting_user_id UUID;
  example_org_id UUID;
BEGIN
  example_admin_id := auth.uid();
  example_requesting_user_id := '00000000-0000-0000-0000-000000000001';
  example_org_id := '00000000-0000-0000-0000-000000000002';

  PERFORM public.create_notification_for_user(
    example_admin_id, 
    'join_request',
    jsonb_build_object(
      'requesting_user_id', example_requesting_user_id,
      'organization_id', example_org_id,
      'target_path', '/dashboard/organizations/' || example_org_id::text || '/members?action=review&user=' || example_requesting_user_id::text
    )
  );
  RETURN NEW;
END;
$$;

-- Function: public.is_org_member
-- Original file: supabase/migrations/20250427000000_add_org_rls.sql
CREATE OR REPLACE FUNCTION public.is_org_member(
    p_org_id UUID,
    p_user_id UUID,
    required_status TEXT,
    required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    is_member BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        JOIN public.organizations o ON om.organization_id = o.id
        WHERE om.organization_id = p_org_id
          AND om.user_id = p_user_id
          AND om.status = required_status
          AND (required_role IS NULL OR om.role = required_role)
          AND o.deleted_at IS NULL
    ) INTO is_member;
    RETURN is_member;
END;
$$;

-- Function: public.handle_updated_at
-- Original file: supabase/migrations/20250408204946_create_ai_chat_tables.sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function: public.handle_new_join_request
-- Original file: supabase/migrations/20250427003000_add_org_notification_triggers.sql
CREATE OR REPLACE FUNCTION public.handle_new_join_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    admin_record RECORD;
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;

    -- Only proceed if the organization exists and is not deleted
    IF NOT FOUND OR is_org_deleted THEN
        RETURN NULL; 
    END IF;

    -- Find all active admins of this organization
    FOR admin_record IN
        SELECT user_id
        FROM public.organization_members
        WHERE organization_id = NEW.organization_id
          AND role = 'admin'
          AND status = 'active'
    LOOP
        -- Create notification for each admin
        PERFORM public.create_notification_for_user(
            admin_record.user_id,
            'org_join_request',
            jsonb_build_object(
                'requesting_user_id', NEW.user_id,
                'organization_id', NEW.organization_id,
                'organization_name', org_name,
                'membership_id', NEW.id,
                'target_path', '/dashboard/organizations/' || NEW.organization_id::text || '/members?action=review&memberId=' || NEW.id::text
            )
        );
    END LOOP;

    RETURN NULL; 
END;
$$;

-- Function: public.handle_member_role_change
-- Original file: supabase/migrations/20250427003000_add_org_notification_triggers.sql
CREATE OR REPLACE FUNCTION public.handle_member_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;

    -- Only proceed if the organization exists and is not deleted
    IF NOT FOUND OR is_org_deleted THEN
        RETURN NULL;
    END IF;

    -- Create notification for the affected user
    PERFORM public.create_notification_for_user(
        NEW.user_id,
        'org_role_changed',
        jsonb_build_object(
            'organization_id', NEW.organization_id,
            'organization_name', org_name,
            'old_role', OLD.role,
            'new_role', NEW.role,
            'target_path', '/dashboard/organizations/' || NEW.organization_id::text || '/settings'
        )
    );

    RETURN NULL;
END;
$$;

-- Function: public.handle_member_removed
-- Original file: supabase/migrations/20250427003000_add_org_notification_triggers.sql
CREATE OR REPLACE FUNCTION public.handle_member_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted (though removal might still happen)
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id; -- Use NEW or OLD, should be same org

    IF NOT FOUND THEN
      -- Org might be hard deleted? Or FK constraint failed?
      -- For now, just exit gracefully if org not found.
      RETURN NULL;
    END IF;

    -- Create notification for the removed user
    PERFORM public.create_notification_for_user(
        NEW.user_id,
        'org_membership_removed',
        jsonb_build_object(
            'organization_id', NEW.organization_id,
            'organization_name', org_name,
            'target_path', '/dashboard/organizations' -- General path after removal
        )
    );

    RETURN NULL;
END;
$$;

-- Function: public.create_org_and_admin_member
-- Original file: supabase/migrations/20250428220006_create_org_and_admin_member_rpc.sql
CREATE OR REPLACE FUNCTION public.create_org_and_admin_member(
    p_user_id uuid,         -- ID of the user creating the organization
    p_org_name text,        -- Name for the new organization
    p_org_visibility text   -- Visibility ('public' or 'private')
)
RETURNS uuid -- Returns the ID of the newly created organization
LANGUAGE plpgsql
SECURITY DEFINER -- Allows the function to perform actions potentially beyond the direct user permissions
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Insert the new organization
  INSERT INTO public.organizations (name, visibility)
  VALUES (p_org_name, p_org_visibility)
  RETURNING id INTO new_org_id;

  -- Insert the creating user as the initial admin member
  INSERT INTO public.organization_members (user_id, organization_id, role, status)
  VALUES (p_user_id, new_org_id, 'admin', 'active');

  -- Return the new organization's ID
  RETURN new_org_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise it to ensure the transaction is rolled back
    RAISE WARNING 'Error in create_org_and_admin_member: SQLSTATE: %, MESSAGE: %', SQLSTATE, SQLERRM;
    RAISE;
END;
$$;

-- Function: public.handle_new_invite_notification
-- Original file: supabase/migrations/20250430040000_update_invite_notification_data.sql
CREATE OR REPLACE FUNCTION public.handle_new_invite_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  invited_user_id uuid;
  organization_name text;
  inviter_name text;
  full_name text;
BEGIN
  -- Find the user_id associated with the invited email
  SELECT id INTO invited_user_id FROM auth.users WHERE email = NEW.invited_email;

  -- Only proceed if the user exists in auth.users
  IF invited_user_id IS NOT NULL THEN
    -- Get organization name
    SELECT name INTO organization_name FROM public.organizations WHERE id = NEW.organization_id;

    -- Get inviter name (optional, use email if profile/name not found)
    SELECT
      TRIM(p.first_name || ' ' || p.last_name), 
      u.email
    INTO
      full_name, 
      inviter_name 
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.id 
    WHERE u.id = NEW.invited_by_user_id;

    IF full_name IS NOT NULL AND full_name <> '' THEN
      inviter_name := full_name;
    END IF;

    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      invited_user_id,
      'organization_invite', 
      jsonb_build_object(
        'subject', 'Organization Invitation',
        'message', COALESCE(inviter_name, 'Someone') || ' has invited you to join ' || COALESCE(organization_name, 'an organization') || ' as a ' || NEW.role_to_assign || '.',
        'target_path', '/accept-invite/' || NEW.invite_token,
        'organization_id', NEW.organization_id,
        'organization_name', organization_name,
        'invite_id', NEW.id,
        'invite_token', NEW.invite_token,
        'inviter_id', NEW.invited_by_user_id,
        'inviter_name', inviter_name,
        'assigned_role', NEW.role_to_assign
      )
    );
  ELSE
    RAISE LOG 'Invited user with email % not found in auth.users, no notification created.', NEW.invited_email;
  END IF;

  RETURN NEW;
END;
$$;

-- Function: public.set_current_timestamp_updated_at
-- Original file: supabase/migrations/20250521170639_fix_user_sign_up.sql
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE 'plpgsql'
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;

-- Function: public.check_existing_member_by_email
-- Original file: supabase/migrations/20250430220006_add_check_existing_member_func.sql
CREATE OR REPLACE FUNCTION public.check_existing_member_by_email(
    target_org_id uuid,
    target_email text
)
RETURNS TABLE(membership_status text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- 1. Find user_id from email
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email LIMIT 1;

    -- 2. If user_id found, check membership status in the target org
    IF target_user_id IS NOT NULL THEN
        RETURN QUERY
        SELECT om.status
        FROM public.organization_members om
        WHERE om.organization_id = target_org_id
          AND om.user_id = target_user_id
          AND om.status IN ('active', 'pending'); -- Check for active or pending join request
    END IF;

    -- If user_id not found or no matching membership, return empty set
    RETURN;
END;
$$;

-- Function: public.check_org_chat_creation_permission
-- Original file: supabase/migrations/20250505234124_create_org_chat_creation_helper_v2.sql
CREATE OR REPLACE FUNCTION public.check_org_chat_creation_permission(
    p_org_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    can_create BOOLEAN;
BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om ON o.id = om.organization_id
      WHERE o.id = p_org_id
        AND om.user_id = p_user_id
        AND om.status = 'active'
        AND (
          om.role = 'admin'
          OR
          o.allow_member_chat_creation = true
        )
    ) INTO can_create;
    RETURN can_create;
END;
$$;

-- Function: public.enforce_chat_update_restrictions
-- Original file: supabase/migrations/20250506000448_add_chat_update_safeguard_trigger.sql
CREATE OR REPLACE FUNCTION public.enforce_chat_update_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Changing the user_id of a chat is not allowed.';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing the organization_id of a chat is not allowed.';
  END IF;

  RETURN NEW;
END;
$$;

-- Function: public.is_org_admin
-- Original file: supabase/migrations/20250506221000_modify_is_org_admin_redundant_check.sql
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  -- Check if the organization exists and is not deleted
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id AND deleted_at IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- Check if the current user is an active admin member of the organization
  RETURN EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.status = 'active'
        AND om.role = 'admin' -- This redundant check was in the source migration
  );
END;
$$;

-- Function: public.can_select_chat
-- Original file: supabase/migrations/20250506221003_add_chat_messages_update_delete_rls.sql
CREATE OR REPLACE FUNCTION public.can_select_chat(check_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
SET JIT = OFF -- Preserve existing option
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = check_chat_id
    AND (
      -- Case 1: Personal chat, user is the owner
      (c.organization_id IS NULL AND c.user_id = auth.uid()) OR
      -- Case 2: Organization chat, user is a member of that organization
      (c.organization_id IS NOT NULL AND public.is_org_member(c.organization_id, auth.uid(), 'active'))
    )
  );
$$;

-- Function: public.delete_chat_and_messages_debug
-- Original file: supabase/migrations/20250508033041_delete_chat_and_messages_fix.sql
CREATE OR REPLACE FUNCTION public.delete_chat_and_messages_debug(p_chat_id uuid, p_user_id uuid)
RETURNS TEXT -- Return TEXT for status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  v_chat_owner_id uuid;
  v_chat_org_id uuid;
  v_user_role text;
BEGIN
  -- 1. Check if the chat exists and get owner/org info
  SELECT user_id, organization_id INTO v_chat_owner_id, v_chat_org_id
  FROM public.chats
  WHERE id = p_chat_id;

  IF NOT FOUND THEN
    RETURN 'NOT FOUND';
  END IF;

  -- 2. Permission Check
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active';

    IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      RETURN 'ORG PERMISSION DENIED';
    END IF;
  ELSE
    -- Personal chat
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       RETURN 'PERSONAL PERMISSION DENIED';
    END IF;
  END IF;

  -- 3. Perform Deletions
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;

  RETURN 'DELETED';

END;
$$;

-- Function: public.delete_chat_and_messages
-- Original file: supabase/migrations/20250508034021_fix_delete_chat_non_member_bug.sql
CREATE OR REPLACE FUNCTION public.delete_chat_and_messages(p_chat_id uuid, p_user_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  v_chat_owner_id uuid;
  v_chat_org_id uuid;
  v_user_role text;
BEGIN
  -- 1. Check if the chat exists and get owner/org info
  SELECT user_id, organization_id INTO v_chat_owner_id, v_chat_org_id
  FROM public.chats
  WHERE id = p_chat_id;

  IF NOT FOUND THEN
    RETURN 'NOT FOUND';
  END IF;

  -- 2. Permission Check
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active';

    IF v_user_role IS NULL OR NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      RETURN 'ORG PERMISSION DENIED';
    END IF;
  ELSE
    -- Personal chat
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       RETURN 'PERSONAL PERMISSION DENIED';
    END IF;
  END IF;

  -- 3. Perform Deletions
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;

  RETURN 'DELETED';

END;
$$;

-- Function: public.trigger_set_timestamp
-- Original file: supabase/migrations/20250512155548_add_updated_at_to_chat_messages.sql
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Function: public.is_admin_of_org_for_wallet
-- Original file: supabase/migrations/20250513181435_update_admin_wallet_fn_params_v9.sql
CREATE OR REPLACE FUNCTION public.is_admin_of_org_for_wallet(p_organization_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.role::text = 'admin'
      AND om.status::text = 'active'
  );
$$;

-- Function: public.check_last_admin
-- Original file: supabase/migrations/20250513191300_fix_last_admin_check_for_service_role.sql
CREATE OR REPLACE FUNCTION public.check_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
    v_organization_id UUID;
    v_is_admin_being_removed BOOLEAN;
    v_other_admin_count INTEGER;
BEGIN
    IF auth.role() = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_organization_id := OLD.organization_id;
    ELSE 
        v_organization_id := NEW.organization_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_organization_id AND deleted_at IS NOT NULL) THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    v_is_admin_being_removed := (
        TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.status = 'active'
    ) OR (
        TG_OP = 'UPDATE' AND
        OLD.role = 'admin' AND OLD.status = 'active' AND
        (NEW.role <> 'admin' OR NEW.status <> 'active')
    );

    IF NOT v_is_admin_being_removed THEN
         IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    SELECT count(*)
    INTO v_other_admin_count
    FROM public.organization_members om
    JOIN public.organizations o ON om.organization_id = o.id
    WHERE om.organization_id = v_organization_id
      AND om.role = 'admin'
      AND om.status = 'active'
      AND o.deleted_at IS NULL
      AND om.id <> OLD.id; 

    IF v_other_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove or demote the last admin of organization %', v_organization_id;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Function: public.handle_new_organization
-- Original file: supabase/migrations/20250514123855_add_wallet_to_users.sql
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
BEGIN
  INSERT INTO public.token_wallets (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) WHERE user_id IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- Function: public.restrict_invite_update_fields
-- Original file: supabase/migrations/20250520143814_fix_restrict_invite_trigger_for_session_user_v2.sql
CREATE OR REPLACE FUNCTION public.restrict_invite_update_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  is_org_admin_check BOOLEAN;
  effective_role TEXT;
  is_effective_role_superuser BOOLEAN;
  current_auth_role TEXT;
  current_auth_uid TEXT;
  current_session_user TEXT;
BEGIN
  SELECT current_setting('role', true) INTO effective_role;
  SELECT rolsuper INTO is_effective_role_superuser FROM pg_roles WHERE rolname = effective_role LIMIT 1;
  is_effective_role_superuser := COALESCE(is_effective_role_superuser, FALSE);

  current_auth_role := auth.role();
  current_auth_uid := auth.uid()::text;
  current_session_user := session_user;

  RAISE LOG '[restrict_invite_update_fields V3] Current User: %, Session User: %, Effective Role: %, Is Superuser: %, Auth Role: %, Auth UID: %',
              current_user, current_session_user, effective_role, is_effective_role_superuser, current_auth_role, current_auth_uid;
  RAISE LOG '[restrict_invite_update_fields V3] OLD.invited_user_id: %, NEW.invited_user_id: %, OLD.status: %, NEW.status: %, OLD.invited_email: %, NEW.invited_email: %',
              OLD.invited_user_id, NEW.invited_user_id, OLD.status, NEW.status, OLD.invited_email, NEW.invited_email;

  IF effective_role IN ('service_role', 'supabase_admin', 'supabase_storage_admin') OR is_effective_role_superuser IS TRUE THEN
    RAISE LOG '[restrict_invite_update_fields V3] Allowing update due to powerful service/superuser role: %', effective_role;
    RETURN NEW;
  END IF;

  IF current_user = 'postgres' AND
     OLD.status = 'pending' AND
     OLD.invited_user_id IS NULL AND
     NEW.invited_user_id IS NOT NULL AND
     NEW.status = 'accepted' AND
     NEW.id IS NOT DISTINCT FROM OLD.id AND
     NEW.invite_token IS NOT DISTINCT FROM OLD.invite_token AND
     NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND
     NEW.invited_email IS NOT DISTINCT FROM OLD.invited_email AND
     NEW.role_to_assign IS NOT DISTINCT FROM OLD.role_to_assign AND
     NEW.invited_by_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id AND
     NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND
     NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
  THEN
    RAISE LOG '[restrict_invite_update_fields V3] Allowing update by current_user "postgres" for automated invite linking. Invite ID: %', OLD.id;
    RETURN NEW;
  END IF;

  SELECT public.is_org_admin(OLD.organization_id) INTO is_org_admin_check;
  IF COALESCE(is_org_admin_check, FALSE) THEN
    RAISE LOG '[restrict_invite_update_fields V3] Allowing update due to org admin status for user % and org %', current_auth_uid, OLD.organization_id;
    RETURN NEW;
  END IF;

  IF current_auth_role != 'authenticated' OR (auth.jwt() ->> 'email') != OLD.invited_email THEN
     RAISE WARNING '[restrict_invite_update_fields V3] Auth check failed for non-admin/non-service/non-postgres-auto. Auth Role: %, Invite Email: %, JWT Email: %', current_auth_role, OLD.invited_email, (auth.jwt() ->> 'email');
     RAISE EXCEPTION 'User is not authorized to modify this invite (not invited user or not authenticated properly).';
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
      IF NEW.status != OLD.status AND 
         (NEW.invited_user_id IS NOT DISTINCT FROM OLD.invited_user_id OR (OLD.invited_user_id IS NULL AND NEW.invited_user_id = auth.uid())) AND
         NEW.id IS NOT DISTINCT FROM OLD.id AND
         NEW.invite_token IS NOT DISTINCT FROM OLD.invite_token AND
         NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND
         NEW.invited_email IS NOT DISTINCT FROM OLD.invited_email AND
         NEW.role_to_assign IS NOT DISTINCT FROM OLD.role_to_assign AND
         NEW.invited_by_user_id IS NOT DISTINCT FROM OLD.invited_by_user_id AND
         NEW.created_at IS NOT DISTINCT FROM OLD.created_at AND
         NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
      THEN
          RAISE LOG '[restrict_invite_update_fields V3] Allowing status update for invited user % via their own action.', OLD.invited_email;
          RETURN NEW;
      ELSE
          RAISE WARNING '[restrict_invite_update_fields V3] Disallowed field modification during status change by invited user. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
          RAISE EXCEPTION 'Invite update rejected: Only the status field can be changed (and user linked) by the invited user when accepting/declining, and no other key fields may be altered.';
      END IF;
  ELSIF OLD.status IS NOT DISTINCT FROM NEW.status THEN
       RAISE WARNING '[restrict_invite_update_fields V3] Disallowed field modification (status not changing) by non-admin/non-service/non-postgres-auto. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
       RAISE EXCEPTION 'Invite update rejected: Non-privileged users cannot modify fields other than status if status is not changing from pending.';
  ELSE
       RAISE WARNING '[restrict_invite_update_fields V3] Invalid status transition by non-admin/non-service/non-postgres-auto. OLD: %, NEW: %', row_to_json(OLD), row_to_json(NEW);
       RAISE EXCEPTION 'Invite update rejected: Invalid status transition attempt by non-privileged user.';
  END IF;

END;
$$;

-- Function: public.handle_new_user
-- Original file: supabase/migrations/20250521170639_fix_user_sign_up.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set search_path
AS $$
DECLARE
  v_user_id UUID := NEW.id;
  v_user_email TEXT := NEW.email;
  v_raw_user_meta_data JSONB := NEW.raw_user_meta_data;
  v_profile_first_name TEXT;
  v_free_plan_id UUID;
  v_tokens_to_award NUMERIC;
  v_target_wallet_id UUID;
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_system_user_id UUID;
  v_system_user_email_pattern TEXT := 'system-token-allocator-%@internal.app';
  v_idempotency_key_grant TEXT;
BEGIN
  RAISE LOG '[handle_new_user] Processing new user ID: %, Email: %', v_user_id, v_user_email;

  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (v_user_id, 'user', v_profile_first_name)
  ON CONFLICT (id) DO NOTHING;
  RAISE LOG '[handle_new_user] Ensured profile for user ID: %.', v_user_id;

  INSERT INTO public.token_wallets (user_id, currency)
  VALUES (v_user_id, 'AI_TOKEN')
  ON CONFLICT (user_id) WHERE organization_id IS NULL
  DO NOTHING
  RETURNING wallet_id INTO v_target_wallet_id;

  IF v_target_wallet_id IS NULL THEN
    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = v_user_id AND organization_id IS NULL;
  END IF;

  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[handle_new_user] Failed to create or find personal wallet for user ID: %. Aborting token grant.', v_user_id;
    RETURN NEW;
  END IF;
  RAISE LOG '[handle_new_user] Ensured wallet ID: % for user ID: %.', v_target_wallet_id, v_user_id;

  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award
  FROM public.subscription_plans
  WHERE name = 'Free'
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE LOG '[handle_new_user] "Free" plan not found. No initial tokens will be granted for user ID: %.', v_user_id;
  ELSIF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
    RAISE LOG '[handle_new_user] "Free" plan (ID: %) found, but tokens_to_award is not positive (Value: %). No initial tokens for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;
  ELSE
    RAISE LOG '[handle_new_user] "Free" plan ID: % found with % tokens to award for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;

    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_user_id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month')
    ON CONFLICT (user_id)
    DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, updated_at = NOW(), current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end
    WHERE public.user_subscriptions.status <> 'free';
    RAISE LOG '[handle_new_user] Ensured user % subscribed to Free plan %.', v_user_id, v_free_plan_id;

    SELECT id INTO v_system_user_id FROM auth.users WHERE email LIKE v_system_user_email_pattern ORDER BY created_at DESC LIMIT 1;

    IF v_system_user_id IS NULL THEN
       RAISE WARNING '[handle_new_user] System user for token allocation (pattern: %) not found. Grant for user % will be recorded by the user themselves.', v_system_user_email_pattern, v_user_id;
    END IF;
    
    v_idempotency_key_grant := 'initial_free_grant_' || v_user_id::text || '_' || v_free_plan_id::text;

    IF EXISTS (SELECT 1 FROM public.token_wallet_transactions WHERE wallet_id = v_target_wallet_id AND idempotency_key = v_idempotency_key_grant) THEN
      RAISE LOG '[handle_new_user] Initial free tokens (Plan ID: %) already granted to user ID: % (Wallet: %) via idempotency key: %.', v_free_plan_id, v_user_id, v_target_wallet_id, v_idempotency_key_grant;
    ELSE
      RAISE LOG '[handle_new_user] Attempting to grant % tokens to wallet % for user % by system user (or self): %.', v_tokens_to_award, v_target_wallet_id, v_user_id, COALESCE(v_system_user_id, v_user_id);
      BEGIN
        SELECT balance INTO v_current_wallet_balance FROM public.token_wallets WHERE wallet_id = v_target_wallet_id FOR UPDATE;
        v_new_wallet_balance := v_current_wallet_balance + v_tokens_to_award;

        UPDATE public.token_wallets SET balance = v_new_wallet_balance, updated_at = now() WHERE public.token_wallets.wallet_id = v_target_wallet_id;

        INSERT INTO public.token_wallet_transactions (
            wallet_id, transaction_type, amount, balance_after_txn,
            recorded_by_user_id, related_entity_id, related_entity_type, notes, idempotency_key
        )
        VALUES (
            v_target_wallet_id, 'CREDIT_INITIAL_FREE_ALLOCATION', v_tokens_to_award, v_new_wallet_balance,
            COALESCE(v_system_user_id, v_user_id), 
            v_free_plan_id::TEXT, 'subscription_plans', 'Initial token allocation for new free plan user.', v_idempotency_key_grant
        );
        RAISE LOG '[handle_new_user] Successfully granted % tokens to wallet % (User ID: %). New balance: %.', v_tokens_to_award, v_target_wallet_id, v_user_id, v_new_wallet_balance;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '[handle_new_user] Error during token grant transaction for user ID %: %.', v_user_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Unexpected error for user ID % (Email: %): %.', COALESCE(v_user_id, 'UNKNOWN_USER_ID'), COALESCE(v_user_email, 'UNKNOWN_EMAIL'), SQLERRM;
    RETURN NEW;
END;
$$;

COMMIT;
