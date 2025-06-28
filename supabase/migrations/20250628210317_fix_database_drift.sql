-- 1. Drop pg_cron extension, which is not in local schema
DROP EXTENSION IF EXISTS "pg_cron";

-- 2. Update functions to match local schema (adding SET search_path = '' and other logic changes)
CREATE OR REPLACE FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    SET "jit" TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = check_chat_id AND (
      -- Case 1: Personal chat, user is the owner
      (c.organization_id IS NULL AND c.user_id = auth.uid()) OR
      -- Case 2: Organization chat, user is a member of that organization
      (c.organization_id IS NOT NULL AND public.is_org_member(c.organization_id, auth.uid(), 'active'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") RETURNS TABLE("membership_status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- 1. Find user_id from email
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email LIMIT 1;
    -- 2. If user_id found, check membership status in the target org
    IF target_user_id IS NOT NULL THEN
        RETURN QUERY
        SELECT om.status::text FROM public.organization_members om
        WHERE om.organization_id = target_org_id AND om.user_id = target_user_id;
    END IF;
    -- 3. If no user or membership found, return nothing
END;
$$;

CREATE OR REPLACE FUNCTION "public"."check_last_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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
        OLD.role = 'admin' AND
        OLD.status = 'active' AND
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


CREATE OR REPLACE FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$$;


CREATE OR REPLACE FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Create the organization
  INSERT INTO public.organizations (name, created_by, visibility)
  VALUES (p_org_name, p_user_id, p_org_visibility)
  RETURNING id INTO new_org_id;
  -- Create the organization member
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (new_org_id, p_user_id, 'admin', 'active');
  RETURN new_org_id;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."delete_chat_and_messages"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."enforce_chat_update_restrictions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."handle_member_removed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_name TEXT;
BEGIN
    -- Only trigger when status changes from 'active' to 'removed'
    IF OLD.status <> 'active' OR NEW.status <> 'removed' THEN
        RETURN NULL;
    END IF;
    -- Get organization name
    SELECT name INTO org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;
    IF NOT FOUND THEN
      -- Org might be hard deleted? Or FK constraint failed?
      -- For now, just exit gracefully if org not found.
      RETURN NULL;
    END IF;
    -- Insert notification for the removed user
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
        NEW.user_id,
        'org_membership_terminated',
        jsonb_build_object(
            'reason', 'removed_by_admin',
            'organization_id', NEW.organization_id,
            'organization_name', org_name
        )
    );
    RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."handle_member_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_name TEXT;
BEGIN
    -- Only trigger if the role has actually changed
    IF OLD.role = NEW.role THEN
        RETURN NULL;
    END IF;
    -- Get organization name
    SELECT name INTO org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;
    -- Insert a notification for the affected user
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
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


CREATE OR REPLACE FUNCTION "public"."handle_new_invite_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  invited_user_id uuid;
  organization_name text;
  inviter_name text;
  full_name text;
BEGIN
  -- Find the user_id for the invited email
  SELECT id INTO invited_user_id FROM auth.users WHERE email = NEW.invited_email;
  -- If the user exists, create a notification for them
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


CREATE OR REPLACE FUNCTION "public"."handle_new_join_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    admin_record RECORD;
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Get organization name and check if it's deleted
    SELECT name, (deleted_at IS NOT NULL)
    INTO org_name, is_org_deleted
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
        -- Create a notification for each admin
        PERFORM public.create_notification_for_user(
            admin_record.user_id,
            'join_request',
            jsonb_build_object(
                'requesting_user_id', NEW.user_id,
                'organization_id', NEW.organization_id,
                'organization_name', org_name
            )
        );
    END LOOP;
    RETURN NULL; 
END;
$$;


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


CREATE OR REPLACE FUNCTION "public"."handle_placeholder_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the organization exists and is not deleted
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id AND deleted_at IS NULL) THEN
    RETURN FALSE;
  END IF;
  -- Check if the current user is an admin
  RETURN EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = org_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role = 'admin'
        AND om.status = 'active'
  );
END;
$$;


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."link_pending_invites_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  invite_record RECORD;
BEGIN
  IF NEW.email IS NOT NULL THEN
    FOR invite_record IN
      SELECT id, organization_id, role_to_assign
      FROM public.invites
      WHERE invited_email = NEW.email
        AND invited_user_id IS NULL
        AND status = 'pending'
    LOOP
      UPDATE public.invites
      SET
        invited_user_id = NEW.id,
        status = 'accepted'
      WHERE id = invite_record.id;
      INSERT INTO public.organization_members (user_id, organization_id, role, status)
      VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
      ON CONFLICT (user_id, organization_id) DO UPDATE 
      SET role = EXCLUDED.role, status = 'active';
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."restrict_invite_update_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 3. Drop functions that exist in deployed but not in local
DROP FUNCTION IF EXISTS "public"."perform_chat_rewind"(p_chat_id uuid, p_rewind_from_message_id uuid, p_user_id uuid, p_new_user_message_content text, p_new_user_message_ai_provider_id uuid, p_new_user_message_system_prompt_id uuid, p_new_assistant_message_content text, p_new_assistant_message_token_usage jsonb, p_new_assistant_message_ai_provider_id uuid, p_new_assistant_message_system_prompt_id uuid);

-- 4. Update table schemas
-- public.subscription_plans
ALTER TABLE public.subscription_plans ALTER COLUMN stripe_price_id DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN interval DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN interval_count DROP DEFAULT;
ALTER TABLE public.subscription_plans ALTER COLUMN interval_count DROP NOT NULL;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS item_id_internal text;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS tokens_to_award numeric(19,0);
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'subscription'::text;

-- public.token_wallet_transactions
ALTER TABLE public.token_wallet_transactions ADD COLUMN IF NOT EXISTS recorded_by_user_id uuid NOT NULL;

-- public.user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS chat_context jsonb;

-- 5. Add constraints and indexes from local schema
ALTER TABLE "public"."subscription_plans" DROP CONSTRAINT IF EXISTS "subscription_plans_item_id_internal_key";
ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_item_id_internal_key" UNIQUE ("item_id_internal");

ALTER TABLE "public"."system_prompts" DROP CONSTRAINT IF EXISTS "system_prompts_name_key";
ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_name_key" UNIQUE ("name");

-- Clean up orphaned token_wallets before adding foreign key
DELETE FROM public.token_wallets WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.user_profiles);

ALTER TABLE "public"."token_wallets" DROP CONSTRAINT IF EXISTS "token_wallets_user_id_fkey";
ALTER TABLE ONLY "public"."token_wallets"
    ADD CONSTRAINT "token_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_user_id_key" ON "public"."user_subscriptions" USING "btree" ("user_id");

-- 6. Recreate triggers
CREATE OR REPLACE TRIGGER "set_user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();

-- 7. Add foreign key constraints
-- Clean up orphaned subscription_transactions before adding foreign key
DELETE FROM public.subscription_transactions WHERE user_subscription_id IS NOT NULL AND user_subscription_id NOT IN (SELECT id FROM public.user_subscriptions);

ALTER TABLE "public"."subscription_transactions" DROP CONSTRAINT IF EXISTS "subscription_transactions_user_subscription_id_fkey";
ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;

-- 8. Update RLS policies
-- invites
DROP POLICY "Admin DELETE access for organization invites" ON "public"."invites";
CREATE POLICY "Admin DELETE access for organization invites" ON "public"."invites" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("organization_id"));

DROP POLICY "Admin INSERT access for organization invites" ON "public"."invites";
CREATE POLICY "Admin INSERT access for organization invites" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("organization_id"));

-- chat_messages
DROP POLICY "Allow users to delete messages in accessible chats" ON "public"."chat_messages";
CREATE POLICY "Allow users to delete messages in accessible chats" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING ("public"."can_select_chat"("chat_id"));

-- 9. Update comments
COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Handles new user setup: profile, wallet, Free plan subscription, and initial free tokens. V3 - Consolidated & Idempotent.';
COMMENT ON FUNCTION "public"."link_pending_invites_on_signup"() IS 'Re-applied: Automatically links pending invites, creates an organization_members record with an active status, and updates the invite status to accepted for a newly signed-up user based on matching email address. Ensures no SET LOCAL ROLE is present.';
COMMENT ON FUNCTION "public"."restrict_invite_update_fields"() IS 'V3: Trigger function to ensure specific field update rules for invites. Uses current_user = ''postgres'' for signup link. Allows service roles/superusers more leeway. Restricts non-admin invited users to primarily status changes. Includes extensive logging.';

COMMENT ON TABLE "public"."payment_transactions" IS 'Records attempts to purchase tokens or other monetary transactions related to tokens.';
COMMENT ON COLUMN "public"."payment_transactions"."target_wallet_id" IS 'The token_wallet that will be credited upon successful payment.';
COMMENT ON COLUMN "public"."payment_transactions"."status" IS 'Status of the payment transaction.';
COMMENT ON COLUMN "public"."payment_transactions"."amount_requested_fiat" IS 'Amount of fiat currency user intended to pay.';
COMMENT ON COLUMN "public"."payment_transactions"."tokens_to_award" IS 'Number of app tokens to be awarded upon successful completion.';

COMMENT ON COLUMN "public"."subscription_plans"."item_id_internal" IS 'Stable internal identifier for the plan/package, used by the application (e.g., in PurchaseRequest.itemId).';
COMMENT ON COLUMN "public"."subscription_plans"."tokens_to_award" IS 'Number of AI tokens awarded upon successful purchase of this plan/package.';
COMMENT ON COLUMN "public"."subscription_plans"."plan_type" IS 'Type of plan, e.g., ''subscription'' for recurring plans, ''one_time_purchase'' for token packages.';

COMMENT ON TABLE "public"."token_wallet_transactions" IS 'Ledger of all token transactions for all wallets. Append-only.';
COMMENT ON COLUMN "public"."token_wallet_transactions"."amount" IS 'Absolute (non-negative) number of tokens in the transaction.';
COMMENT ON COLUMN "public"."token_wallet_transactions"."balance_after_txn" IS 'Snapshot of the wallet balance after this transaction.';
COMMENT ON COLUMN "public"."token_wallet_transactions"."idempotency_key" IS 'Client-provided key to prevent duplicate processing. Should be unique per wallet.';
COMMENT ON COLUMN "public"."token_wallet_transactions"."recorded_by_user_id" IS 'ID of the user or system entity that recorded/initiated this transaction. Mandatory for auditability.';

COMMENT ON TABLE "public"."token_wallets" IS 'Stores token balances for users and organizations.';
COMMENT ON COLUMN "public"."token_wallets"."balance" IS 'Current token balance. Use NUMERIC for precision.';
COMMENT ON COLUMN "public"."token_wallets"."currency" IS 'Type of token, e.g., APP_TOKENS.';
COMMENT ON COLUMN "public"."user_profiles"."chat_context" IS 'Stores user-specific chat context preferences, such as default provider, prompt, or other AI settings.';

-- 10. Drop indexes that are not in local
DROP INDEX IF EXISTS "public"."idx_organization_members_user_org";
DROP INDEX IF EXISTS "public"."idx_payment_transactions_status";
DROP INDEX IF EXISTS "public"."idx_token_wallet_transactions_wallet_id_timestamp";

-- 11. Create indexes that are in local but not deployed
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_status" ON "public"."payment_transactions" USING "btree" ("status");
CREATE INDEX IF NOT EXISTS "idx_token_wallet_transactions_recorded_by" ON "public"."token_wallet_transactions" USING "btree" ("recorded_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_token_wallet_transactions_related_entity" ON "public"."token_wallet_transactions" USING "btree" ("related_entity_id", "related_entity_type");
CREATE INDEX IF NOT EXISTS "idx_token_wallet_transactions_type" ON "public"."token_wallet_transactions" USING "btree" ("transaction_type");
CREATE INDEX IF NOT EXISTS "idx_token_wallet_transactions_wallet_id" ON "public"."token_wallet_transactions" USING "btree" ("wallet_id");
CREATE INDEX IF NOT EXISTS "idx_token_wallets_organization_id" ON "public"."token_wallets" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_token_wallets_user_id" ON "public"."token_wallets" USING "btree" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_profiles_last_selected_org_id" ON "public"."user_profiles" USING "btree" ("last_selected_org_id");

-- 12. Drop realtime publication additions that are not in local
-- ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.notifications; -- This might fail if other things depend on it. Be careful.
-- Let's check what is in local vs deployed. Deployed has this, local does not. So we drop it.
-- But ALTER PUBLICATION cannot be in a transaction block.
-- Let's comment this out for now.
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
-- We don't need to do anything about GRANTs as they are handled by function/table creation/deletion.

