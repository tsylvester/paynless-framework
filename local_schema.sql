

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."dialectic_stage_enum" AS ENUM (
    'THESIS',
    'ANTITHESIS',
    'SYNTHESIS',
    'PARENTHESIS',
    'PARALYSIS'
);


ALTER TYPE "public"."dialectic_stage_enum" OWNER TO "postgres";


CREATE TYPE "public"."org_token_usage_policy_enum" AS ENUM (
    'member_tokens',
    'organization_tokens'
);


ALTER TYPE "public"."org_token_usage_policy_enum" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_transaction"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN 'Transaction block conceptually started. Client must manage actual transaction lifecycle.';
END;
$$;


ALTER FUNCTION "public"."begin_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    SET "jit" TO 'off'
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


ALTER FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") IS 'Checks if an email is already associated with an organization as an active member or has a pending join request. Runs with definer privileges to query auth.users.';



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


ALTER FUNCTION "public"."check_last_admin"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Checks if a given active user is permitted to create a chat in a specific organization.';



CREATE OR REPLACE FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$$;


ALTER FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") IS 'Creates a new organization and adds the specified user as the initial admin member within a single transaction. Returns the new organization ID.';



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


ALTER FUNCTION "public"."delete_chat_and_messages"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


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


ALTER FUNCTION "public"."enforce_chat_update_restrictions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_sql"("query" "text") RETURNS SETOF "json"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    constructed_query TEXT;
BEGIN
    constructed_query := 'SELECT row_to_json(t) FROM (' || query || ') t';
    
    RETURN QUERY EXECUTE constructed_query;
END;
$$;


ALTER FUNCTION "public"."execute_sql"("query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_tokens_to_award NUMERIC;
    v_target_wallet_id uuid;
    v_system_user_id uuid;
BEGIN
    BEGIN
        SELECT system_user_id INTO v_system_user_id FROM _vars LIMIT 1;
        IF v_system_user_id IS NULL THEN
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] System user ID is not set in _vars. This table should be populated by the calling migration.';
        END IF;
    EXCEPTION
        WHEN undefined_table THEN 
            RAISE EXCEPTION '[grant_initial_free_tokens_to_user] _vars temp table not found. It must be created and populated with system_user_id by the calling migration.';
    END;

    SELECT tokens_to_award INTO v_tokens_to_award
    FROM public.subscription_plans
    WHERE id = p_free_plan_id AND name = 'Free';

    IF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Free plan ID % (user %) not found or has no tokens to award.', p_free_plan_id, p_user_id;
        RETURN;
    END IF;

    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = p_user_id AND organization_id IS NULL;

    IF v_target_wallet_id IS NULL THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Token wallet not found for user ID %.', p_user_id;
        RETURN;
    END IF;

    PERFORM public.record_token_transaction(
        p_wallet_id := v_target_wallet_id,
        p_transaction_type := 'CREDIT_INITIAL_FREE_ALLOCATION',
        p_input_amount_text := v_tokens_to_award::TEXT,
        p_recorded_by_user_id := v_system_user_id,
        p_idempotency_key := 'initial_free_' || p_user_id::text || '_' || p_free_plan_id::text,
        p_related_entity_id := p_free_plan_id::VARCHAR,
        p_related_entity_type := 'subscription_plans',
        p_notes := 'Initial token allocation for new free plan user.',
        p_payment_transaction_id := NULL
    );

    RAISE LOG '[grant_initial_free_tokens_to_user] Successfully called record_token_transaction for user % (tokens: %).', p_user_id, v_tokens_to_award;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[grant_initial_free_tokens_to_user] Error awarding tokens to user %: %', p_user_id, SQLERRM;
END;
$$;


ALTER FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") IS 'CORRECTED VERSION. Grants initial tokens to a new user for the free plan by calling record_token_transaction, using system_user_id from _vars.';



CREATE OR REPLACE FUNCTION "public"."handle_member_removed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_member_removed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_member_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_member_role_change"() OWNER TO "postgres";


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


ALTER FUNCTION "public"."handle_new_invite_notification"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_invite_notification"() IS 'Handles inserting a notification when a new pending invite is created.';



CREATE OR REPLACE FUNCTION "public"."handle_new_join_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_new_join_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.token_wallets (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) WHERE user_id IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_organization"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Handles new user setup: profile, wallet, Free plan subscription, and initial free tokens. V3 - Consolidated & Idempotent.';



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


ALTER FUNCTION "public"."handle_placeholder_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_of_org_for_wallet"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."is_admin_of_org_for_wallet"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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
        AND om.user_id = (SELECT auth.uid())
        AND om.role = 'admin'
        AND om.status = 'active'
  );
END;
$$;


ALTER FUNCTION "public"."is_org_admin"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_org_admin"("org_id" "uuid") IS 'Checks if the current authenticated user is an active admin of the specified non-deleted organization.';



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


ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") OWNER TO "postgres";


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


ALTER FUNCTION "public"."link_pending_invites_on_signup"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_pending_invites_on_signup"() IS 'Re-applied: Automatically links pending invites, creates an organization_members record with an active status, and updates the invite status to accepted for a newly signed-up user based on matching email address. Ensures no SET LOCAL ROLE is present.';



CREATE OR REPLACE FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid" DEFAULT NULL::"uuid", "p_new_assistant_message_token_usage" "jsonb" DEFAULT NULL::"jsonb", "p_new_assistant_message_system_prompt_id" "uuid" DEFAULT NULL::"uuid", "p_new_assistant_message_error_type" "text" DEFAULT NULL::"text") RETURNS TABLE("new_user_message_id" "uuid", "new_assistant_message_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = p_rewind_from_message_id;

    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE id = (
        SELECT cm_user.id
        FROM public.chat_messages cm_user
        JOIN public.chat_messages cm_assistant ON cm_user.chat_id = cm_assistant.chat_id
        WHERE cm_assistant.id = p_rewind_from_message_id
          AND cm_user.role = 'user'
          AND cm_user.user_id = p_user_id
          AND cm_user.created_at < cm_assistant.created_at
          AND cm_user.is_active_in_thread = TRUE 
        ORDER BY cm_user.created_at DESC
        LIMIT 1
    );

    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id,
        is_active_in_thread,
        created_at,
        updated_at
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'user', 
        p_new_user_message_content, 
        p_new_user_message_ai_provider_id, 
        p_new_user_message_system_prompt_id,
        TRUE, 
        v_rewind_point + INTERVAL '1 millisecond', 
        v_rewind_point + INTERVAL '1 millisecond'
    )
    RETURNING id INTO v_new_user_message_id;

    INSERT INTO public.chat_messages (
        chat_id, 
        user_id, 
        role, 
        content, 
        ai_provider_id, 
        system_prompt_id, 
        token_usage, 
        error_type,
        is_active_in_thread,
        created_at,
        updated_at,
        response_to_message_id
    )
    VALUES (
        p_chat_id, 
        p_user_id, 
        'assistant', 
        p_new_assistant_message_content, 
        p_new_assistant_message_ai_provider_id, 
        p_new_assistant_message_system_prompt_id, 
        p_new_assistant_message_token_usage, 
        p_new_assistant_message_error_type,
        TRUE, 
        v_rewind_point + INTERVAL '2 milliseconds',
        v_rewind_point + INTERVAL '2 milliseconds',
        v_new_user_message_id
    )
    RETURNING id INTO v_new_assistant_message_id;

    RETURN QUERY SELECT v_new_user_message_id, v_new_assistant_message_id;
END;
$$;


ALTER FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_system_prompt_id" "uuid", "p_new_assistant_message_error_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying DEFAULT NULL::character varying, "p_related_entity_type" character varying DEFAULT NULL::character varying, "p_notes" "text" DEFAULT NULL::"text", "p_payment_transaction_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("transaction_id" "uuid", "wallet_id" "uuid", "transaction_type" character varying, "amount" numeric, "balance_after_txn" numeric, "recorded_by_user_id" "uuid", "idempotency_key" "text", "related_entity_id" character varying, "related_entity_type" character varying, "notes" "text", "timestamp" timestamp with time zone, "payment_transaction_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_current_balance NUMERIC;
    v_transaction_amount NUMERIC;
    v_new_balance NUMERIC;
    v_is_credit BOOLEAN;
    v_existing_transaction public.token_wallet_transactions%ROWTYPE;
BEGIN
    IF p_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Wallet ID cannot be null';
    END IF;
    IF p_transaction_type IS NULL OR p_transaction_type = '' THEN
        RAISE EXCEPTION 'Transaction type cannot be empty';
    END IF;
    IF p_input_amount_text IS NULL OR p_input_amount_text = '' THEN
        RAISE EXCEPTION 'Transaction amount cannot be empty';
    END IF;
    IF p_recorded_by_user_id IS NULL THEN
        RAISE EXCEPTION 'Recorded by User ID cannot be null';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'Idempotency key cannot be empty';
    END IF;

    BEGIN
        v_transaction_amount := p_input_amount_text::NUMERIC;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid numeric value for transaction amount: %', p_input_amount_text;
        WHEN others THEN
            RAISE EXCEPTION 'Error parsing transaction amount: %', SQLERRM;
    END;

    IF v_transaction_amount <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be positive. Input was: %', p_input_amount_text;
    END IF;

    SELECT * INTO v_existing_transaction
    FROM public.token_wallet_transactions twt
    WHERE twt.wallet_id = p_wallet_id AND twt.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing_transaction.transaction_type = p_transaction_type AND
           v_existing_transaction.amount = v_transaction_amount AND
           v_existing_transaction.recorded_by_user_id = p_recorded_by_user_id AND
           (v_existing_transaction.related_entity_id IS NOT DISTINCT FROM p_related_entity_id) AND
           (v_existing_transaction.related_entity_type IS NOT DISTINCT FROM p_related_entity_type) AND
           (v_existing_transaction.payment_transaction_id IS NOT DISTINCT FROM p_payment_transaction_id)
        THEN
            RETURN QUERY SELECT
                twt.transaction_id, twt.wallet_id, twt.transaction_type::VARCHAR, twt.amount,
                twt.balance_after_txn, twt.recorded_by_user_id, twt.idempotency_key,
                twt.related_entity_id::VARCHAR, twt.related_entity_type::VARCHAR, twt.notes,
                twt.timestamp, twt.payment_transaction_id
            FROM public.token_wallet_transactions twt
            WHERE twt.transaction_id = v_existing_transaction.transaction_id;
            RETURN;
        ELSE
            RAISE EXCEPTION 'Idempotency key % collision for wallet %. Recorded params: type=%, amt=%, user=%. New params: type=%, amt=%, user=%',
                            p_idempotency_key, p_wallet_id,
                            v_existing_transaction.transaction_type, v_existing_transaction.amount, v_existing_transaction.recorded_by_user_id,
                            p_transaction_type, v_transaction_amount, p_recorded_by_user_id;
        END IF;
    END IF;

    IF upper(p_transaction_type) LIKE 'CREDIT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'DEBIT%' THEN
        v_is_credit := FALSE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_GRANT%' THEN
        v_is_credit := TRUE;
    ELSIF upper(p_transaction_type) LIKE 'ADJUSTMENT_STAFF_REVOKE%' THEN
        v_is_credit := FALSE;
    ELSE
        RAISE EXCEPTION 'Unknown transaction type prefix for credit/debit determination: %', p_transaction_type;
    END IF;

    SELECT balance INTO v_current_balance FROM public.token_wallets
    WHERE public.token_wallets.wallet_id = p_wallet_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
    END IF;

    IF v_is_credit THEN
        v_new_balance := v_current_balance + v_transaction_amount;
    ELSE
        v_new_balance := v_current_balance - v_transaction_amount;
        IF v_new_balance < 0 THEN
            RAISE EXCEPTION 'Insufficient funds in wallet % for debit of %. Current balance: %',
                            p_wallet_id, v_transaction_amount, v_current_balance;
        END IF;
    END IF;

    UPDATE public.token_wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE public.token_wallets.wallet_id = p_wallet_id;

    INSERT INTO public.token_wallet_transactions (
        wallet_id, idempotency_key, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, related_entity_id, related_entity_type, notes, payment_transaction_id, timestamp
    )
    VALUES (
        p_wallet_id, p_idempotency_key, p_transaction_type, v_transaction_amount, v_new_balance,
        p_recorded_by_user_id, p_related_entity_id, p_related_entity_type, p_notes, p_payment_transaction_id, now()
    )
    RETURNING
        public.token_wallet_transactions.transaction_id,
        public.token_wallet_transactions.wallet_id,
        public.token_wallet_transactions.transaction_type,
        public.token_wallet_transactions.amount,
        public.token_wallet_transactions.balance_after_txn,
        public.token_wallet_transactions.recorded_by_user_id,
        public.token_wallet_transactions.idempotency_key,
        public.token_wallet_transactions.related_entity_id,
        public.token_wallet_transactions.related_entity_type,
        public.token_wallet_transactions.notes,
        public.token_wallet_transactions.timestamp,
        public.token_wallet_transactions.payment_transaction_id
    INTO
        transaction_id, wallet_id, transaction_type, amount, balance_after_txn,
        recorded_by_user_id, idempotency_key, related_entity_id, related_entity_type,
        notes, "timestamp", payment_transaction_id;

    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying, "p_related_entity_type" character varying, "p_notes" "text", "p_payment_transaction_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying, "p_related_entity_type" character varying, "p_notes" "text", "p_payment_transaction_id" "uuid") IS 'Records a token transaction, updates wallet balance, and ensures idempotency. Idempotency key is now mandatory. Returns the recorded transaction.';



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


ALTER FUNCTION "public"."restrict_invite_update_fields"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restrict_invite_update_fields"() IS 'V3: Trigger function to ensure specific field update rules for invites. Uses current_user = ''postgres'' for signup link. Allows service roles/superusers more leeway. Restricts non-admin invited users to primarily status changes. Includes extensive logging.';



CREATE OR REPLACE FUNCTION "public"."rollback_transaction"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN 'Transaction block conceptually rolled back. Client must manage actual transaction lifecycle.';
END;
$$;


ALTER FUNCTION "public"."rollback_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_storage_bucket" "text", "p_storage_path" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    new_contribution_id UUID;
BEGIN
    -- Concurrently update the old contribution to no longer be the latest.
    -- This prevents race conditions where two edits could be marked as latest.
    UPDATE public.dialectic_contributions
    SET is_latest_edit = FALSE,
        updated_at = now()
    WHERE id = p_original_contribution_id;

    -- Insert the new edited contribution record.
    -- Note the mapping from `p_content_*` parameters to the `storage_*` table columns.
    INSERT INTO public.dialectic_contributions (
        session_id,
        user_id,
        stage,
        iteration_number,
        storage_bucket, -- Corrected column name
        storage_path,   -- Corrected column name
        mime_type,      -- Corrected column name
        size_bytes,     -- Corrected column name
        raw_response_storage_path,
        tokens_used_input,
        tokens_used_output,
        processing_time_ms,
        citations,
        target_contribution_id, 
        edit_version,
        is_latest_edit,
        original_model_contribution_id,
        error, 
        model_id,
        contribution_type,
        created_at,
        updated_at
    )
    VALUES (
        p_session_id,
        p_user_id,
        p_stage,
        p_iteration_number,
        p_storage_bucket, -- Parameter name
        p_storage_path,   -- Parameter name
        p_mime_type,      -- Parameter name
        p_size_bytes,     -- Parameter name
        p_raw_response_storage_path,
        p_tokens_used_input,
        p_tokens_used_output,
        p_processing_time_ms,
        p_citations,
        p_target_contribution_id,
        p_edit_version,
        p_is_latest_edit,
        p_original_model_contribution_id,
        p_error_details,
        p_model_id,
        p_contribution_type,
        now(),
        now()
    )
    RETURNING id INTO new_contribution_id;

    RETURN new_contribution_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and return NULL if any part of the transaction fails.
        -- The calling service is responsible for handling the NULL response.
        RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
        RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_storage_bucket" "text", "p_storage_path" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_actual_prompt_sent" "text", "p_content_storage_bucket" "text", "p_content_storage_path" "text", "p_content_mime_type" "text", "p_content_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    new_contribution_id UUID;
BEGIN
    -- Update the old contribution to no longer be the latest
    UPDATE public.dialectic_contributions
    SET is_latest_edit = FALSE,
        updated_at = now()
    WHERE id = p_original_contribution_id;

    -- Insert the new edited contribution
    INSERT INTO public.dialectic_contributions (
        session_id,
        user_id,
        stage,
        iteration_number,
        actual_prompt_sent,
        content_storage_bucket,
        content_storage_path,
        content_mime_type,
        content_size_bytes,
        raw_response_storage_path,
        tokens_used_input,
        tokens_used_output,
        processing_time_ms,
        citations,
        target_contribution_id, -- Links to the contribution it is an edit OF
        edit_version,
        is_latest_edit,
        original_model_contribution_id,
        error, -- Storing p_error_details in the 'error' column
        model_id,
        contribution_type,
        created_at,
        updated_at
    )
    VALUES (
        p_session_id,
        p_user_id,
        p_stage,
        p_iteration_number,
        p_actual_prompt_sent,
        p_content_storage_bucket,
        p_content_storage_path,
        p_content_mime_type,
        p_content_size_bytes,
        p_raw_response_storage_path,
        p_tokens_used_input,
        p_tokens_used_output,
        p_processing_time_ms,
        p_citations,
        p_target_contribution_id,
        p_edit_version,
        p_is_latest_edit,
        p_original_model_contribution_id,
        p_error_details,
        p_model_id,
        p_contribution_type,
        now(),
        now()
    )
    RETURNING id INTO new_contribution_id;

    RETURN new_contribution_id;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (optional, depends on your logging setup within Postgres)
        RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
        RETURN NULL; -- Or re-raise the exception: RAISE;
END;
$$;


ALTER FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_actual_prompt_sent" "text", "p_content_storage_bucket" "text", "p_content_storage_path" "text", "p_content_mime_type" "text", "p_content_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;


ALTER FUNCTION "public"."set_current_timestamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_providers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "api_identifier" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text",
    "is_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."ai_providers" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_providers" IS 'Stores information about supported AI models/providers.';



COMMENT ON COLUMN "public"."ai_providers"."config" IS 'Stores extended AI model configuration data, including token costs, context windows, tokenization strategies, and provider-specific limits. Populated by the sync-ai-models function.';



COMMENT ON COLUMN "public"."ai_providers"."is_enabled" IS 'Flag to control if the model is exposed to the frontend, managed manually.';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "ai_provider_id" "uuid",
    "system_prompt_id" "uuid",
    "token_usage" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active_in_thread" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_type" "text",
    "response_to_message_id" "uuid",
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);

ALTER TABLE ONLY "public"."chat_messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS 'Stores individual messages within a chat session.';



COMMENT ON COLUMN "public"."chat_messages"."is_active_in_thread" IS 'Indicates if a message is part of the currently active conversation thread (true) or has been superseded by a rewind/edit (false).';



COMMENT ON COLUMN "public"."chat_messages"."error_type" IS 'Stores the type of error if one occurred during an AI interaction, e.g., ai_provider_error, insufficient_funds, etc.';



CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "system_prompt_id" "uuid"
);

ALTER TABLE ONLY "public"."chats" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" OWNER TO "postgres";


COMMENT ON TABLE "public"."chats" IS 'Represents a single conversation thread.';



COMMENT ON COLUMN "public"."chats"."organization_id" IS 'Identifier for the organization this chat belongs to, NULL for personal chats.';



COMMENT ON COLUMN "public"."chats"."system_prompt_id" IS 'Identifier for the system prompt used to initialize this chat context.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_artifact_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "mime_type" "text" NOT NULL,
    "default_file_extension" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dialectic_artifact_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_artifact_types" IS 'Defines the types of artifacts (e.g., PRD, Implementation Plan) used in processes.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_contributions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'dialectic_contributions'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'text/markdown'::"text" NOT NULL,
    "size_bytes" bigint,
    "target_contribution_id" "uuid",
    "prompt_template_id_used" "uuid",
    "seed_prompt_url" "text",
    "tokens_used_input" integer,
    "tokens_used_output" integer,
    "raw_response_storage_path" "text",
    "processing_time_ms" integer,
    "citations" "jsonb",
    "iteration_number" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error" "text",
    "model_id" "uuid",
    "model_name" "text",
    "edit_version" integer DEFAULT 1 NOT NULL,
    "is_latest_edit" boolean DEFAULT true NOT NULL,
    "original_model_contribution_id" "uuid",
    "user_id" "uuid",
    "contribution_type" "text",
    "file_name" "text"
);


ALTER TABLE "public"."dialectic_contributions" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_contributions" IS 'Stores contributions made during a dialectic session. The cost_usd column has been removed in favor of token-based accounting using tokens_used_input and tokens_used_output.';



COMMENT ON COLUMN "public"."dialectic_contributions"."stage" IS 'The dialectic stage this contribution belongs to (e.g., thesis, antithesis, synthesis, parenthesis, paralysis)';



COMMENT ON COLUMN "public"."dialectic_contributions"."storage_bucket" IS 'The Supabase Storage bucket ID where the content is stored.';



COMMENT ON COLUMN "public"."dialectic_contributions"."storage_path" IS 'Path to the content file within the bucket (e.g., project_id/session_id/contribution_id.md).';



COMMENT ON COLUMN "public"."dialectic_contributions"."mime_type" IS 'MIME type of the stored content.';



COMMENT ON COLUMN "public"."dialectic_contributions"."size_bytes" IS 'Size of the content file in bytes.';



COMMENT ON COLUMN "public"."dialectic_contributions"."target_contribution_id" IS 'For linking critiques to theses, or refined versions to originals.';



COMMENT ON COLUMN "public"."dialectic_contributions"."prompt_template_id_used" IS 'ID of the system_prompt template used for this contribution.';



COMMENT ON COLUMN "public"."dialectic_contributions"."seed_prompt_url" IS 'The actual prompt text sent to the AI model.';



COMMENT ON COLUMN "public"."dialectic_contributions"."raw_response_storage_path" IS 'Path in storage for the raw JSON response from the AI provider.';



COMMENT ON COLUMN "public"."dialectic_contributions"."citations" IS 'For Parenthesis stage: structured citation data.';



COMMENT ON COLUMN "public"."dialectic_contributions"."iteration_number" IS 'The iteration number within the session this contribution belongs to.';



COMMENT ON COLUMN "public"."dialectic_contributions"."edit_version" IS 'Version number for an edited contribution. Starts at 1 for AI-generated, increments for user edits.';



COMMENT ON COLUMN "public"."dialectic_contributions"."is_latest_edit" IS 'Indicates if this row is the latest version of a particular contribution lineage (original AI + edits).';



COMMENT ON COLUMN "public"."dialectic_contributions"."original_model_contribution_id" IS 'If this is a user edit, points to the initial AI-generated contribution (which has edit_version = 1). NULL for initial AI contributions.';



COMMENT ON COLUMN "public"."dialectic_contributions"."user_id" IS 'Identifier of the user who made this contribution (if it\''s a user edit or original prompt)';



COMMENT ON COLUMN "public"."dialectic_contributions"."contribution_type" IS 'Type of contribution, e.g., ''ai_generated'', ''user_edit'', ''system_message''.';



COMMENT ON COLUMN "public"."dialectic_contributions"."file_name" IS 'The name of the file as it should appear to the user, without the full path.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_domain_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."dialectic_domains" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_domains" IS 'Defines hierarchical knowledge domains for dialectic processes (e.g., Software Development -> Backend -> Rust).';



CREATE TABLE IF NOT EXISTS "public"."dialectic_feedback" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feedback_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "stage_slug" "text" NOT NULL,
    "iteration_number" integer NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'text/markdown'::"text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "resource_description" "jsonb"
);


ALTER TABLE "public"."dialectic_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_feedback" IS 'Stores user feedback on dialectic contributions or stages.';



COMMENT ON COLUMN "public"."dialectic_feedback"."session_id" IS 'The session this feedback belongs to.';



COMMENT ON COLUMN "public"."dialectic_feedback"."user_id" IS 'The user who provided the feedback.';



COMMENT ON COLUMN "public"."dialectic_feedback"."feedback_type" IS 'Type of feedback (e.g., ''text_response'', ''rating_stars'', ''thumb_reaction'').';



CREATE TABLE IF NOT EXISTS "public"."dialectic_process_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "starting_stage_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dialectic_process_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_process_templates" IS 'A template for a full dialectic process, linked to a domain.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_project_resources" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'dialectic-contributions'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "resource_description" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."dialectic_project_resources" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_project_resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_project_resources" IS 'Stores metadata about files uploaded by users as resources for their dialectic projects (e.g., initial prompt attachments).';



COMMENT ON COLUMN "public"."dialectic_project_resources"."user_id" IS 'FK to auth.users.id. Cascades on user deletion.';



COMMENT ON COLUMN "public"."dialectic_project_resources"."storage_bucket" IS 'The Supabase Storage bucket ID where the resource file is stored.';



COMMENT ON COLUMN "public"."dialectic_project_resources"."storage_path" IS 'Path to the resource file within the bucket (e.g., projects/{project_id}/resources/{resource_id_or_filename}).';



COMMENT ON COLUMN "public"."dialectic_project_resources"."resource_description" IS 'User-provided description of the resource, e.g., "Initial prompt attachment".';



CREATE TABLE IF NOT EXISTS "public"."dialectic_projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_name" "text" NOT NULL,
    "initial_user_prompt" "text" NOT NULL,
    "repo_url" "jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "user_domain_overlay_values" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_domain_overlay_id" "uuid",
    "initial_prompt_resource_id" "uuid",
    "process_template_id" "uuid",
    "selected_domain_id" "uuid" NOT NULL
);


ALTER TABLE "public"."dialectic_projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_projects" IS 'Stores projects for the AI Dialectic Engine, representing a specific problem or task to be explored.';



COMMENT ON COLUMN "public"."dialectic_projects"."user_id" IS 'Owner of the project.';



COMMENT ON COLUMN "public"."dialectic_projects"."project_name" IS 'User-defined name for the dialectic project.';



COMMENT ON COLUMN "public"."dialectic_projects"."initial_user_prompt" IS 'The initial prompt or problem statement provided by the user.';



COMMENT ON COLUMN "public"."dialectic_projects"."repo_url" IS 'URL of an associated repository (e.g., GitHub) for context or saving outputs.';



COMMENT ON COLUMN "public"."dialectic_projects"."status" IS 'Current status of the project (e.g., active, archived, template).';



COMMENT ON COLUMN "public"."dialectic_projects"."user_domain_overlay_values" IS 'User-specific JSONB object to overlay on system default domain overlays, further customizing prompt variables for a specific project.';



COMMENT ON COLUMN "public"."dialectic_projects"."selected_domain_overlay_id" IS 'FK to domain_specific_prompt_overlays.id, storing the chosen domain-specific overlay for the project.';



COMMENT ON COLUMN "public"."dialectic_projects"."initial_prompt_resource_id" IS 'Foreign key to the dialectic_project_resources table, linking to the resource used as the initial prompt if a file was uploaded.';



COMMENT ON COLUMN "public"."dialectic_projects"."process_template_id" IS 'The specific process template this project is executing.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "session_description" "text",
    "iteration_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending_thesis'::"text" NOT NULL,
    "associated_chat_id" "uuid",
    "selected_model_ids" "uuid"[],
    "user_input_reference_url" "text",
    "current_stage_id" "uuid" NOT NULL
);


ALTER TABLE "public"."dialectic_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_sessions" IS 'Stores information about each dialectic session within a project.';



COMMENT ON COLUMN "public"."dialectic_sessions"."id" IS 'Unique identifier for the dialectic session.';



COMMENT ON COLUMN "public"."dialectic_sessions"."project_id" IS 'Foreign key linking to the parent dialectic_project.';



COMMENT ON COLUMN "public"."dialectic_sessions"."session_description" IS 'User-provided description for the session, e.g., "Initial run with models A, B, C using default thesis prompt"';



COMMENT ON COLUMN "public"."dialectic_sessions"."iteration_count" IS 'Tracks the number of iterations for multi-cycle sessions (relevant in later phases). Default is 1.';



COMMENT ON COLUMN "public"."dialectic_sessions"."created_at" IS 'Timestamp of when the session was created.';



COMMENT ON COLUMN "public"."dialectic_sessions"."updated_at" IS 'Timestamp of when the session was last updated.';



COMMENT ON COLUMN "public"."dialectic_sessions"."status" IS 'Current status of the session, e.g., ''pending_thesis'', ''generating_thesis'', ''thesis_complete'', etc. Default is ''pending_thesis''.';



COMMENT ON COLUMN "public"."dialectic_sessions"."associated_chat_id" IS 'Tracks the chat.id used for interactions with the /chat Edge Function for this dialectic session. This allows dialectics to potentially originate from or integrate with existing chat sessions.';



COMMENT ON COLUMN "public"."dialectic_sessions"."current_stage_id" IS 'The current stage of this session, referencing the dialectic_stages table.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_stage_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "process_template_id" "uuid" NOT NULL,
    "source_stage_id" "uuid" NOT NULL,
    "target_stage_id" "uuid" NOT NULL,
    "condition_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dialectic_stage_transitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_stage_transitions" IS 'Defines the directed graph of a dialectic process, mapping how one stage leads to another.';



CREATE TABLE IF NOT EXISTS "public"."dialectic_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "default_system_prompt_id" "uuid",
    "input_artifact_rules" "jsonb",
    "expected_output_artifacts" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dialectic_stages" OWNER TO "postgres";


COMMENT ON TABLE "public"."dialectic_stages" IS 'Defines a single stage within any dialectic process (e.g., Thesis, Antithesis).';



COMMENT ON COLUMN "public"."dialectic_stages"."input_artifact_rules" IS 'JSONB object defining rules for constructing the seed prompt for this stage, specifying which system prompts, prior artifacts, and current feedback to include.';



CREATE TABLE IF NOT EXISTS "public"."domain_process_associations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "process_template_id" "uuid" NOT NULL,
    "is_default_for_domain" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."domain_process_associations" OWNER TO "postgres";


COMMENT ON TABLE "public"."domain_process_associations" IS 'Links dialectic process templates to relevant knowledge domains and flags one as the default for each domain.';



CREATE TABLE IF NOT EXISTS "public"."domain_specific_prompt_overlays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "system_prompt_id" "uuid" NOT NULL,
    "overlay_values" "jsonb" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "domain_id" "uuid" NOT NULL
);


ALTER TABLE "public"."domain_specific_prompt_overlays" OWNER TO "postgres";


COMMENT ON TABLE "public"."domain_specific_prompt_overlays" IS 'Stores domain-specific default values to overlay onto base system prompts.';



COMMENT ON COLUMN "public"."domain_specific_prompt_overlays"."system_prompt_id" IS 'FK to the base system prompt this overlay applies to.';



COMMENT ON COLUMN "public"."domain_specific_prompt_overlays"."overlay_values" IS 'JSONB object containing key-value pairs that will override or supplement variables in the base prompt.';



COMMENT ON COLUMN "public"."domain_specific_prompt_overlays"."version" IS 'Version of this specific overlay for a given system_prompt_id and domain_tag.';



COMMENT ON COLUMN "public"."domain_specific_prompt_overlays"."domain_id" IS 'Links the overlay to a specific knowledge domain.';



CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invite_token" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role_to_assign" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "expires_at" timestamp with time zone,
    "invited_user_id" "uuid",
    "inviter_email" "text",
    "inviter_first_name" "text",
    "inviter_last_name" "text",
    CONSTRAINT "invites_role_to_assign_check" CHECK (("role_to_assign" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);

ALTER TABLE ONLY "public"."invites" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."invites" IS 'Stores invitations for users to join organizations.';



COMMENT ON COLUMN "public"."invites"."invite_token" IS 'Unique, non-guessable token sent to the user.';



COMMENT ON COLUMN "public"."invites"."organization_id" IS 'The organization the user is invited to join.';



COMMENT ON COLUMN "public"."invites"."invited_email" IS 'Email address of the invited user.';



COMMENT ON COLUMN "public"."invites"."role_to_assign" IS 'The role the user will have upon accepting the invite.';



COMMENT ON COLUMN "public"."invites"."invited_by_user_id" IS 'The user who sent the invitation.';



COMMENT ON COLUMN "public"."invites"."status" IS 'Current status of the invitation.';



COMMENT ON COLUMN "public"."invites"."expires_at" IS 'Optional expiration date for the invite.';



COMMENT ON COLUMN "public"."invites"."invited_user_id" IS 'Reference to the auth.users table if the invited user exists in the system.';



COMMENT ON COLUMN "public"."invites"."inviter_email" IS 'Snapshot of the inviting user''''s email at the time of invitation.';



COMMENT ON COLUMN "public"."invites"."inviter_first_name" IS 'Snapshot of the inviting user''''s first name at the time of invitation.';



COMMENT ON COLUMN "public"."invites"."inviter_last_name" IS 'Snapshot of the inviting user''''s last name at the time of invitation.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "data" "jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'Stores in-app notifications for users.';



COMMENT ON COLUMN "public"."notifications"."user_id" IS 'The user who should receive the notification.';



COMMENT ON COLUMN "public"."notifications"."type" IS 'Categorizes the notification (e.g., ''join_request'', ''invite_sent'').';



COMMENT ON COLUMN "public"."notifications"."data" IS 'JSONB payload containing contextual data for the notification (e.g., target link, related entity IDs).';



COMMENT ON COLUMN "public"."notifications"."read" IS 'Indicates whether the user has read the notification.';



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organization_members"."role" IS 'User role within the organization.';



COMMENT ON COLUMN "public"."organization_members"."status" IS 'Membership status (e.g., pending invite, active, removed).';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "allow_member_chat_creation" boolean DEFAULT false NOT NULL,
    "token_usage_policy" "public"."org_token_usage_policy_enum" DEFAULT 'member_tokens'::"public"."org_token_usage_policy_enum" NOT NULL,
    CONSTRAINT "organizations_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."visibility" IS 'Controls if the organization can be discovered or joined publicly.';



COMMENT ON COLUMN "public"."organizations"."deleted_at" IS 'Timestamp when the organization was soft-deleted.';



COMMENT ON COLUMN "public"."organizations"."allow_member_chat_creation" IS 'Controls whether non-admin members can create new chat sessions within this organization.';



COMMENT ON COLUMN "public"."organizations"."token_usage_policy" IS 'Defines which wallet is used for chats created under this organization\''s context. \''member_tokens\'' means the chatting member\''s personal tokens are used. \''organization_tokens\'' means the organization\''s own wallet/tokens are used.';



CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid",
    "target_wallet_id" "uuid" NOT NULL,
    "payment_gateway_id" character varying(50) NOT NULL,
    "gateway_transaction_id" character varying(255),
    "status" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    "amount_requested_fiat" integer,
    "currency_requested_fiat" character varying(3),
    "amount_requested_crypto" numeric(36,18),
    "currency_requested_crypto" character varying(10),
    "tokens_to_award" numeric(19,0) NOT NULL,
    "metadata_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_transactions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'REFUNDED'::character varying])::"text"[]))),
    CONSTRAINT "payment_transactions_tokens_to_award_check" CHECK (("tokens_to_award" > (0)::numeric))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_transactions" IS 'Records attempts to purchase tokens or other monetary transactions related to tokens.';



COMMENT ON COLUMN "public"."payment_transactions"."user_id" IS 'User initiating the payment. FK to auth.users.id. Sets to NULL on user deletion.';



COMMENT ON COLUMN "public"."payment_transactions"."organization_id" IS 'The organization context, if the payment is intended for an organizational wallet.';



COMMENT ON COLUMN "public"."payment_transactions"."target_wallet_id" IS 'The token_wallet that will be credited upon successful payment.';



COMMENT ON COLUMN "public"."payment_transactions"."gateway_transaction_id" IS 'Unique identifier for the transaction provided by the external payment gateway.';



COMMENT ON COLUMN "public"."payment_transactions"."status" IS 'Status of the payment transaction.';



COMMENT ON COLUMN "public"."payment_transactions"."amount_requested_fiat" IS 'Amount in fiat currency (e.g., USD, EUR), stored as an integer in cents, exactly as received from Stripe.';



COMMENT ON COLUMN "public"."payment_transactions"."tokens_to_award" IS 'Number of app tokens to be awarded upon successful completion.';



COMMENT ON COLUMN "public"."payment_transactions"."metadata_json" IS 'Flexible field to store additional context, like gateway request details or webhook payloads.';



CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "stripe_price_id" "text",
    "name" "text" NOT NULL,
    "amount" integer,
    "currency" "text",
    "interval" "text",
    "interval_count" integer DEFAULT 1,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "description" "jsonb",
    "stripe_product_id" "text",
    "item_id_internal" "text",
    "tokens_to_award" numeric(19,0),
    "plan_type" "text" DEFAULT 'subscription'::"text" NOT NULL,
    CONSTRAINT "subscription_plans_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "subscription_plans_interval_check" CHECK (("interval" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text", 'year'::"text"])))
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscription_plans" IS 'Stores available subscription plans from Stripe.';



COMMENT ON COLUMN "public"."subscription_plans"."amount" IS 'Amount in the smallest currency unit (e.g., cents).';



COMMENT ON COLUMN "public"."subscription_plans"."active" IS 'Whether the plan is currently offered to new subscribers.';



COMMENT ON COLUMN "public"."subscription_plans"."description" IS 'Plan description (subtitle) and features list (JSONB).';



COMMENT ON COLUMN "public"."subscription_plans"."stripe_product_id" IS 'The corresponding Stripe Product ID (prod_...).';



COMMENT ON COLUMN "public"."subscription_plans"."item_id_internal" IS 'Stable internal identifier for the plan/package, used by the application (e.g., in PurchaseRequest.itemId).';



COMMENT ON COLUMN "public"."subscription_plans"."tokens_to_award" IS 'Number of AI tokens awarded upon successful purchase of this plan/package.';



COMMENT ON COLUMN "public"."subscription_plans"."plan_type" IS 'Type of plan, e.g., ''subscription'' for recurring plans, ''one_time_purchase'' for token packages.';



CREATE TABLE IF NOT EXISTS "public"."subscription_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "stripe_checkout_session_id" "text",
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "stripe_invoice_id" "text",
    "stripe_payment_intent_id" "text",
    "amount" integer,
    "currency" "text",
    "user_subscription_id" "uuid"
);

ALTER TABLE ONLY "public"."subscription_transactions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_transactions"."stripe_event_id" IS 'Unique Stripe event ID used for idempotency.';



COMMENT ON COLUMN "public"."subscription_transactions"."status" IS 'Processing status of the webhook event handler.';



CREATE TABLE IF NOT EXISTS "public"."system_prompts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "prompt_text" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."system_prompts" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_prompts" IS 'Stores reusable system prompts for AI interactions.';



COMMENT ON COLUMN "public"."system_prompts"."version" IS 'Version number for the prompt template.';



COMMENT ON COLUMN "public"."system_prompts"."description" IS 'A brief description of the prompt template.';



CREATE TABLE IF NOT EXISTS "public"."token_wallet_transactions" (
    "transaction_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "transaction_type" character varying(50) NOT NULL,
    "amount" numeric(19,0) NOT NULL,
    "balance_after_txn" numeric(19,0) NOT NULL,
    "related_entity_id" character varying(255),
    "related_entity_type" character varying(50),
    "notes" "text",
    "idempotency_key" character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by_user_id" "uuid" NOT NULL,
    "payment_transaction_id" "uuid",
    CONSTRAINT "token_wallet_transactions_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."token_wallet_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."token_wallet_transactions" IS 'Ledger of all token transactions for all wallets. Append-only.';



COMMENT ON COLUMN "public"."token_wallet_transactions"."amount" IS 'Absolute (non-negative) number of tokens in the transaction.';



COMMENT ON COLUMN "public"."token_wallet_transactions"."balance_after_txn" IS 'Snapshot of the wallet balance after this transaction.';



COMMENT ON COLUMN "public"."token_wallet_transactions"."idempotency_key" IS 'Client-provided key to prevent duplicate processing. Should be unique per wallet.';



COMMENT ON COLUMN "public"."token_wallet_transactions"."recorded_by_user_id" IS 'ID of the user or system entity that recorded/initiated this transaction. Mandatory for auditability.';



COMMENT ON COLUMN "public"."token_wallet_transactions"."payment_transaction_id" IS 'Link to the payment_transactions table if this ledger entry was created as a direct result of a payment.';



CREATE TABLE IF NOT EXISTS "public"."token_wallets" (
    "wallet_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid",
    "balance" numeric(19,0) DEFAULT 0 NOT NULL,
    "currency" character varying(10) DEFAULT 'AI_TOKEN'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "token_wallets_balance_check" CHECK (("balance" >= (0)::numeric)),
    CONSTRAINT "token_wallets_currency_check" CHECK ((("currency")::"text" = 'AI_TOKEN'::"text")),
    CONSTRAINT "user_or_org_wallet" CHECK (((("user_id" IS NOT NULL) AND ("organization_id" IS NULL)) OR (("user_id" IS NULL) AND ("organization_id" IS NOT NULL)) OR (("user_id" IS NOT NULL) AND ("organization_id" IS NOT NULL))))
);


ALTER TABLE "public"."token_wallets" OWNER TO "postgres";


COMMENT ON TABLE "public"."token_wallets" IS 'Stores token balances for users and organizations.';



COMMENT ON COLUMN "public"."token_wallets"."balance" IS 'Current token balance. Use NUMERIC for precision.';



COMMENT ON COLUMN "public"."token_wallets"."currency" IS 'Type of token, e.g., APP_TOKENS.';



COMMENT ON CONSTRAINT "user_or_org_wallet" ON "public"."token_wallets" IS 'Ensures wallet is associated with a user, an organization, or potentially both.';



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_selected_org_id" "uuid",
    "profile_privacy_setting" "text" DEFAULT 'private'::"text" NOT NULL,
    "chat_context" "jsonb",
    CONSTRAINT "check_profile_privacy_setting" CHECK (("profile_privacy_setting" = ANY (ARRAY['private'::"text", 'public'::"text", 'members_only'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_profiles" IS 'Stores public profile information for users.';



COMMENT ON COLUMN "public"."user_profiles"."id" IS 'References auth.users.id';



COMMENT ON COLUMN "public"."user_profiles"."last_selected_org_id" IS 'Stores the ID of the last organization selected by the user in the UI.';



COMMENT ON COLUMN "public"."user_profiles"."chat_context" IS 'Stores user-specific chat context preferences, such as default provider, prompt, or other AI settings.';



CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" NOT NULL,
    "plan_id" "uuid",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_subscriptions" IS 'Stores user subscription information linked to Stripe.';



COMMENT ON COLUMN "public"."user_subscriptions"."status" IS 'Matches Stripe subscription statuses, plus potentially ''free''.';



CREATE OR REPLACE VIEW "public"."v_pending_membership_requests" AS
 SELECT "om"."id",
    "om"."user_id",
    "om"."organization_id",
    "om"."status",
    "om"."created_at",
    "om"."role",
    "up"."first_name",
    "up"."last_name",
    "au"."email" AS "user_email"
   FROM (("public"."organization_members" "om"
     LEFT JOIN "public"."user_profiles" "up" ON (("om"."user_id" = "up"."id")))
     LEFT JOIN "auth"."users" "au" ON (("om"."user_id" = "au"."id")))
  WHERE ("om"."status" = 'pending_approval'::"text");


ALTER TABLE "public"."v_pending_membership_requests" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_providers"
    ADD CONSTRAINT "ai_providers_api_identifier_key" UNIQUE ("api_identifier");



ALTER TABLE ONLY "public"."ai_providers"
    ADD CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_artifact_types"
    ADD CONSTRAINT "dialectic_artifact_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."dialectic_artifact_types"
    ADD CONSTRAINT "dialectic_artifact_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_domains"
    ADD CONSTRAINT "dialectic_domains_parent_domain_id_name_key" UNIQUE ("parent_domain_id", "name");



ALTER TABLE ONLY "public"."dialectic_domains"
    ADD CONSTRAINT "dialectic_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_feedback"
    ADD CONSTRAINT "dialectic_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_process_templates"
    ADD CONSTRAINT "dialectic_process_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "dialectic_project_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "dialectic_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_sessions"
    ADD CONSTRAINT "dialectic_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_stage_transitions"
    ADD CONSTRAINT "dialectic_stage_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_stage_transitions"
    ADD CONSTRAINT "dialectic_stage_transitions_process_template_id_source_stag_key" UNIQUE ("process_template_id", "source_stage_id", "target_stage_id");



ALTER TABLE ONLY "public"."dialectic_stages"
    ADD CONSTRAINT "dialectic_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dialectic_stages"
    ADD CONSTRAINT "dialectic_stages_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."domain_process_associations"
    ADD CONSTRAINT "domain_process_associations_domain_id_process_template_id_key" UNIQUE ("domain_id", "process_template_id");



ALTER TABLE ONLY "public"."domain_process_associations"
    ADD CONSTRAINT "domain_process_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domain_specific_prompt_overlays"
    ADD CONSTRAINT "domain_specific_prompt_overlays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_gateway_transaction_id_key" UNIQUE ("gateway_transaction_id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_item_id_internal_key" UNIQUE ("item_id_internal");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_stripe_price_id_key" UNIQUE ("stripe_price_id");



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."token_wallet_transactions"
    ADD CONSTRAINT "token_wallet_transactions_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."token_wallet_transactions"
    ADD CONSTRAINT "token_wallet_transactions_pkey" PRIMARY KEY ("transaction_id");



ALTER TABLE ONLY "public"."token_wallets"
    ADD CONSTRAINT "token_wallets_pkey" PRIMARY KEY ("wallet_id");



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "unique_dialectic_resource_storage_path" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."dialectic_feedback"
    ADD CONSTRAINT "unique_session_stage_iteration_feedback" UNIQUE ("session_id", "project_id", "stage_slug", "iteration_number");



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "unique_storage_path" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "unique_user_organization" UNIQUE ("user_id", "organization_id");



COMMENT ON CONSTRAINT "unique_user_organization" ON "public"."organization_members" IS 'Ensures that a user can only have one membership record per organization.';



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_unique" UNIQUE ("user_id");



CREATE INDEX "idx_ai_providers_provider" ON "public"."ai_providers" USING "btree" ("provider");



CREATE INDEX "idx_chat_messages_active_thread" ON "public"."chat_messages" USING "btree" ("chat_id", "created_at") WHERE ("is_active_in_thread" = true);



CREATE INDEX "idx_chat_messages_chat_id" ON "public"."chat_messages" USING "btree" ("chat_id");



CREATE INDEX "idx_chat_messages_chat_id_created_at" ON "public"."chat_messages" USING "btree" ("chat_id", "created_at");



CREATE INDEX "idx_chat_messages_chat_id_id" ON "public"."chat_messages" USING "btree" ("chat_id", "id");



CREATE INDEX "idx_chat_messages_created_at" ON "public"."chat_messages" USING "btree" ("created_at");



CREATE INDEX "idx_chat_messages_id" ON "public"."chat_messages" USING "btree" ("id");



CREATE INDEX "idx_chat_messages_response_to_message_id" ON "public"."chat_messages" USING "btree" ("response_to_message_id");



CREATE INDEX "idx_chats_organization_id" ON "public"."chats" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_chats_user_id" ON "public"."chats" USING "btree" ("user_id");



CREATE INDEX "idx_dialectic_contributions_model_id" ON "public"."dialectic_contributions" USING "btree" ("model_id");



CREATE INDEX "idx_dialectic_contributions_original_model_contribution_id" ON "public"."dialectic_contributions" USING "btree" ("original_model_contribution_id");



CREATE INDEX "idx_dialectic_contributions_original_model_edit_version" ON "public"."dialectic_contributions" USING "btree" ("original_model_contribution_id", "edit_version" DESC);



CREATE INDEX "idx_dialectic_contributions_original_model_is_latest" ON "public"."dialectic_contributions" USING "btree" ("original_model_contribution_id", "is_latest_edit") WHERE ("is_latest_edit" = true);



CREATE INDEX "idx_dialectic_contributions_session_id" ON "public"."dialectic_contributions" USING "btree" ("session_id");



CREATE INDEX "idx_dialectic_contributions_stage" ON "public"."dialectic_contributions" USING "btree" ("stage");



CREATE INDEX "idx_dialectic_contributions_target_contribution_id" ON "public"."dialectic_contributions" USING "btree" ("target_contribution_id");



CREATE INDEX "idx_dialectic_contributions_user_id" ON "public"."dialectic_contributions" USING "btree" ("user_id");



CREATE INDEX "idx_dialectic_feedback_session_id" ON "public"."dialectic_feedback" USING "btree" ("session_id");



CREATE INDEX "idx_dialectic_feedback_user_id" ON "public"."dialectic_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_dialectic_project_resources_project_id" ON "public"."dialectic_project_resources" USING "btree" ("project_id");



CREATE INDEX "idx_dialectic_project_resources_user_id" ON "public"."dialectic_project_resources" USING "btree" ("user_id");



CREATE INDEX "idx_dialectic_sessions_associated_chat_id" ON "public"."dialectic_sessions" USING "btree" ("associated_chat_id");



CREATE INDEX "idx_invites_invited_by_user_id" ON "public"."invites" USING "btree" ("invited_by_user_id");



CREATE INDEX "idx_invites_invited_email" ON "public"."invites" USING "btree" ("invited_email");



CREATE INDEX "idx_invites_invited_user_id" ON "public"."invites" USING "btree" ("invited_user_id");



CREATE INDEX "idx_invites_org_email" ON "public"."invites" USING "btree" ("organization_id", "invited_email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_invites_org_user_id" ON "public"."invites" USING "btree" ("organization_id", "invited_user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_invites_organization_id" ON "public"."invites" USING "btree" ("organization_id");



CREATE INDEX "idx_invites_status" ON "public"."invites" USING "btree" ("status");



CREATE INDEX "idx_notifications_user_id_created_at" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id_read" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_organization_members_organization_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_payment_transactions_gateway_id" ON "public"."payment_transactions" USING "btree" ("gateway_transaction_id");



CREATE INDEX "idx_payment_transactions_status" ON "public"."payment_transactions" USING "btree" ("status");



CREATE INDEX "idx_payment_transactions_target_wallet_id" ON "public"."payment_transactions" USING "btree" ("target_wallet_id");



CREATE INDEX "idx_subscription_plans_stripe_product_id" ON "public"."subscription_plans" USING "btree" ("stripe_product_id");



CREATE INDEX "idx_subscription_transactions_event_type" ON "public"."subscription_transactions" USING "btree" ("event_type");



CREATE INDEX "idx_subscription_transactions_stripe_event_id" ON "public"."subscription_transactions" USING "btree" ("stripe_event_id");



CREATE INDEX "idx_subscription_transactions_stripe_subscription_id" ON "public"."subscription_transactions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscription_transactions_user_id" ON "public"."subscription_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_token_wallet_transactions_recorded_by" ON "public"."token_wallet_transactions" USING "btree" ("recorded_by_user_id");



CREATE INDEX "idx_token_wallet_transactions_related_entity" ON "public"."token_wallet_transactions" USING "btree" ("related_entity_id", "related_entity_type");



CREATE INDEX "idx_token_wallet_transactions_type" ON "public"."token_wallet_transactions" USING "btree" ("transaction_type");



CREATE INDEX "idx_token_wallet_transactions_wallet_id" ON "public"."token_wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_token_wallet_transactions_wallet_id_timestamp" ON "public"."token_wallet_transactions" USING "btree" ("wallet_id", "timestamp" DESC);



CREATE INDEX "idx_token_wallets_organization_id" ON "public"."token_wallets" USING "btree" ("organization_id");



CREATE INDEX "idx_token_wallets_user_id" ON "public"."token_wallets" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_last_selected_org_id" ON "public"."user_profiles" USING "btree" ("last_selected_org_id");



CREATE INDEX "idx_user_profiles_privacy_setting" ON "public"."user_profiles" USING "btree" ("profile_privacy_setting");



CREATE UNIQUE INDEX "one_default_process_per_domain_idx" ON "public"."domain_process_associations" USING "btree" ("domain_id") WHERE ("is_default_for_domain" = true);



CREATE UNIQUE INDEX "unique_org_dedicated_wallet_idx" ON "public"."token_wallets" USING "btree" ("organization_id") WHERE ("user_id" IS NULL);



COMMENT ON INDEX "public"."unique_org_dedicated_wallet_idx" IS 'Prevents an organization from having multiple wallets not linked to a specific user.';



CREATE UNIQUE INDEX "unique_twt_idempotency_key_per_wallet" ON "public"."token_wallet_transactions" USING "btree" ("wallet_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "unique_user_personal_wallet_idx" ON "public"."token_wallets" USING "btree" ("user_id") WHERE ("organization_id" IS NULL);



COMMENT ON INDEX "public"."unique_user_personal_wallet_idx" IS 'Prevents a user from having multiple wallets not linked to an organization.';



CREATE UNIQUE INDEX "user_subscriptions_user_id_key" ON "public"."user_subscriptions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "before_member_update_delete_check_last_admin" BEFORE DELETE OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_last_admin"();



CREATE OR REPLACE TRIGGER "enforce_chat_update_restrictions" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chat_update_restrictions"();



CREATE OR REPLACE TRIGGER "enforce_invite_update_restrictions" BEFORE UPDATE ON "public"."invites" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_invite_update_fields"();



COMMENT ON TRIGGER "enforce_invite_update_restrictions" ON "public"."invites" IS 'Restricts updates on invites made by non-admins, ensuring only status change is possible.';



CREATE OR REPLACE TRIGGER "notify_user_on_invite" AFTER INSERT ON "public"."invites" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "public"."handle_new_invite_notification"();



CREATE OR REPLACE TRIGGER "on_ai_providers_update" BEFORE UPDATE ON "public"."ai_providers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_chats_update" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_organization_created" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_organization"();



CREATE OR REPLACE TRIGGER "on_system_prompts_update" BEFORE UPDATE ON "public"."system_prompts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_transactions_updated_at" BEFORE UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_token_wallets_updated_at" BEFORE UPDATE ON "public"."token_wallets" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_admins_on_join_request" AFTER INSERT ON "public"."organization_members" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "public"."handle_new_join_request"();



CREATE OR REPLACE TRIGGER "trg_notify_user_on_member_removed" AFTER UPDATE ON "public"."organization_members" FOR EACH ROW WHEN ((("old"."status" = 'active'::"text") AND ("new"."status" = 'removed'::"text"))) EXECUTE FUNCTION "public"."handle_member_removed"();



CREATE OR REPLACE TRIGGER "trg_notify_user_on_role_change" AFTER UPDATE ON "public"."organization_members" FOR EACH ROW WHEN ((("old"."role" IS DISTINCT FROM "new"."role") AND ("old"."status" = 'active'::"text") AND ("new"."status" = 'active'::"text"))) EXECUTE FUNCTION "public"."handle_member_role_change"();



CREATE OR REPLACE TRIGGER "trigger_update_chat_messages_updated_at" BEFORE UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "update_dialectic_contributions_updated_at" BEFORE UPDATE ON "public"."dialectic_contributions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_dialectic_feedback_updated_at" BEFORE UPDATE ON "public"."dialectic_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_dialectic_project_resources_updated_at" BEFORE UPDATE ON "public"."dialectic_project_resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscription_plans_updated_at" BEFORE UPDATE ON "public"."subscription_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_ai_provider_id_fkey" FOREIGN KEY ("ai_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_system_prompt_id_fkey" FOREIGN KEY ("system_prompt_id") REFERENCES "public"."system_prompts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_system_prompt_id_fkey" FOREIGN KEY ("system_prompt_id") REFERENCES "public"."system_prompts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_original_model_contribution_id_fkey" FOREIGN KEY ("original_model_contribution_id") REFERENCES "public"."dialectic_contributions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_prompt_template_id_used_fkey" FOREIGN KEY ("prompt_template_id_used") REFERENCES "public"."system_prompts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."dialectic_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_target_contribution_id_fkey" FOREIGN KEY ("target_contribution_id") REFERENCES "public"."dialectic_contributions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "dialectic_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_domains"
    ADD CONSTRAINT "dialectic_domains_parent_domain_id_fkey" FOREIGN KEY ("parent_domain_id") REFERENCES "public"."dialectic_domains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_feedback"
    ADD CONSTRAINT "dialectic_feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."dialectic_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_feedback"
    ADD CONSTRAINT "dialectic_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."dialectic_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_feedback"
    ADD CONSTRAINT "dialectic_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_process_templates"
    ADD CONSTRAINT "dialectic_process_templates_starting_stage_id_fkey" FOREIGN KEY ("starting_stage_id") REFERENCES "public"."dialectic_stages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "dialectic_project_resources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."dialectic_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "dialectic_project_resources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "dialectic_projects_process_template_id_fkey" FOREIGN KEY ("process_template_id") REFERENCES "public"."dialectic_process_templates"("id");



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "dialectic_projects_selected_domain_id_fkey" FOREIGN KEY ("selected_domain_id") REFERENCES "public"."dialectic_domains"("id");



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "dialectic_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_sessions"
    ADD CONSTRAINT "dialectic_sessions_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "public"."dialectic_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_stage_transitions"
    ADD CONSTRAINT "dialectic_stage_transitions_process_template_id_fkey" FOREIGN KEY ("process_template_id") REFERENCES "public"."dialectic_process_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_stage_transitions"
    ADD CONSTRAINT "dialectic_stage_transitions_source_stage_id_fkey" FOREIGN KEY ("source_stage_id") REFERENCES "public"."dialectic_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_stage_transitions"
    ADD CONSTRAINT "dialectic_stage_transitions_target_stage_id_fkey" FOREIGN KEY ("target_stage_id") REFERENCES "public"."dialectic_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dialectic_stages"
    ADD CONSTRAINT "dialectic_stages_default_system_prompt_id_fkey" FOREIGN KEY ("default_system_prompt_id") REFERENCES "public"."system_prompts"("id");



ALTER TABLE ONLY "public"."domain_process_associations"
    ADD CONSTRAINT "domain_process_associations_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."dialectic_domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."domain_process_associations"
    ADD CONSTRAINT "domain_process_associations_process_template_id_fkey" FOREIGN KEY ("process_template_id") REFERENCES "public"."dialectic_process_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."domain_specific_prompt_overlays"
    ADD CONSTRAINT "domain_specific_prompt_overlays_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."dialectic_domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."domain_specific_prompt_overlays"
    ADD CONSTRAINT "domain_specific_prompt_overlays_system_prompt_id_fkey" FOREIGN KEY ("system_prompt_id") REFERENCES "public"."system_prompts"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "fk_chat_messages_response_to_message_id" FOREIGN KEY ("response_to_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_contributions"
    ADD CONSTRAINT "fk_dialectic_contributions_model_id" FOREIGN KEY ("model_id") REFERENCES "public"."ai_providers"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_project_resources"
    ADD CONSTRAINT "fk_dialectic_project_resources_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "fk_dialectic_projects_selected_domain_overlay" FOREIGN KEY ("selected_domain_overlay_id") REFERENCES "public"."domain_specific_prompt_overlays"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_projects"
    ADD CONSTRAINT "fk_initial_prompt_resource" FOREIGN KEY ("initial_prompt_resource_id") REFERENCES "public"."dialectic_project_resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dialectic_sessions"
    ADD CONSTRAINT "fk_project" FOREIGN KEY ("project_id") REFERENCES "public"."dialectic_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_target_wallet_id_fkey" FOREIGN KEY ("target_wallet_id") REFERENCES "public"."token_wallets"("wallet_id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."token_wallet_transactions"
    ADD CONSTRAINT "token_wallet_transactions_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."token_wallet_transactions"
    ADD CONSTRAINT "token_wallet_transactions_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."token_wallet_transactions"
    ADD CONSTRAINT "token_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."token_wallets"("wallet_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."token_wallets"
    ADD CONSTRAINT "token_wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."token_wallets"
    ADD CONSTRAINT "token_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_last_selected_org_id_fkey" FOREIGN KEY ("last_selected_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin DELETE access for organization invites" ON "public"."invites" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Admin INSERT access for organization invites" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Admin SELECT access for organization invites" ON "public"."invites" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Admin UPDATE access for organization invites" ON "public"."invites" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Allow active members to view memberships in their orgs" ON "public"."organization_members" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text"));



CREATE POLICY "Allow active members to view their non-deleted organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text"));



CREATE POLICY "Allow admins or self to update memberships" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING (("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text") OR (("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."deleted_at" IS NULL))))))) WITH CHECK (("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text") OR (("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."deleted_at" IS NULL)))))));



CREATE POLICY "Allow admins to insert new members" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text"));



CREATE POLICY "Allow admins to update their non-deleted organizations" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text", 'admin'::"text")) WITH CHECK ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text", 'admin'::"text"));



CREATE POLICY "Allow anonymous users to read enabled domains" ON "public"."dialectic_domains" FOR SELECT TO "authenticated", "anon" USING (("is_enabled" = true));



CREATE POLICY "Allow authenticated read access" ON "public"."domain_process_associations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated read access" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated read access to active providers" ON "public"."ai_providers" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Allow authenticated users to create organizations" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to read active system_prompts" ON "public"."system_prompts" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Allow authenticated users to read artifact types" ON "public"."dialectic_artifact_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read domain_specific_prompt_overla" ON "public"."domain_specific_prompt_overlays" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read process templates" ON "public"."dialectic_process_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read stage transitions" ON "public"."dialectic_stage_transitions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read stages" ON "public"."dialectic_stages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to select their own payment transacti" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Allow authenticated users to select their own wallet transactio" ON "public"."token_wallet_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."token_wallets" "tw"
  WHERE (("tw"."wallet_id" = "token_wallet_transactions"."wallet_id") AND ("tw"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow individual insert access" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual insert access" ON "public"."user_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow individual read access" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual read access" ON "public"."user_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow individual update access" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual update access" ON "public"."user_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow org admins and chat owners to delete chats" ON "public"."chats" FOR DELETE TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id"))));



CREATE POLICY "Allow org admins and chat owners to update chats" ON "public"."chats" FOR UPDATE TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id")))) WITH CHECK (((("organization_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id"))));



CREATE POLICY "Allow org members/admins and chat owners to select chats" ON "public"."chats" FOR SELECT TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text"))));



CREATE POLICY "Allow organization admins to select their organization wallets" ON "public"."token_wallets" FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) AND ("organization_id" IS NOT NULL) AND "public"."is_admin_of_org_for_wallet"("organization_id")));



CREATE POLICY "Allow organization admins to select their organization's paymen" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."token_wallets" "tw"
  WHERE (("tw"."wallet_id" = "payment_transactions"."target_wallet_id") AND ("tw"."user_id" IS NULL) AND ("tw"."organization_id" IS NOT NULL) AND "public"."is_admin_of_org_for_wallet"("tw"."organization_id")))) OR (("organization_id" IS NOT NULL) AND "public"."is_admin_of_org_for_wallet"("organization_id"))));



CREATE POLICY "Allow organization admins to select their organization's wallet" ON "public"."token_wallet_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."token_wallets" "tw"
  WHERE (("tw"."wallet_id" = "token_wallet_transactions"."wallet_id") AND ("tw"."user_id" IS NULL) AND ("tw"."organization_id" IS NOT NULL) AND "public"."is_admin_of_org_for_wallet"("tw"."organization_id")))));



CREATE POLICY "Allow permitted users to insert organizational chats" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."check_org_chat_creation_permission"("organization_id", "auth"."uid"())));



CREATE POLICY "Allow profile read based on privacy, shared org, or ownership" ON "public"."user_profiles" FOR SELECT USING ((("profile_privacy_setting" = 'public'::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."organization_members" "om1"
     JOIN "public"."organization_members" "om2" ON (("om1"."organization_id" = "om2"."organization_id")))
  WHERE (("om1"."user_id" = "auth"."uid"()) AND ("om2"."user_id" = "user_profiles"."id") AND ("om1"."status" = 'active'::"text") AND ("om2"."status" = 'active'::"text")))) OR ("auth"."uid"() = "id")));



CREATE POLICY "Allow service_role full access to project resources" ON "public"."dialectic_project_resources" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role to bypass RLS for payment transactions" ON "public"."payment_transactions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role to bypass RLS for wallets" ON "public"."token_wallets" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role to delete wallets" ON "public"."token_wallets" FOR DELETE TO "service_role" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Allow service_role to insert wallets" ON "public"."token_wallets" FOR INSERT TO "service_role" WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Allow service_role to manage artifact types" ON "public"."dialectic_artifact_types" TO "service_role" USING (true);



CREATE POLICY "Allow service_role to manage domain_specific_prompt_overlays" ON "public"."domain_specific_prompt_overlays" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role to manage domains" ON "public"."dialectic_domains" TO "service_role" USING (true);



CREATE POLICY "Allow service_role to manage process templates" ON "public"."dialectic_process_templates" TO "service_role" USING (true);



CREATE POLICY "Allow service_role to manage stage transitions" ON "public"."dialectic_stage_transitions" TO "service_role" USING (true);



CREATE POLICY "Allow service_role to manage stages" ON "public"."dialectic_stages" TO "service_role" USING (true);



CREATE POLICY "Allow user SELECT access to their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user UPDATE access for their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to delete messages in accessible chats" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING ("public"."can_select_chat"("chat_id"));



CREATE POLICY "Allow users to insert messages in accessible chats with role ch" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_select_chat"("chat_id") AND (("role" <> 'user'::"text") OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "Allow users to insert personal chats" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Allow users to insert their own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow users to select messages in accessible chats" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."can_select_chat"("chat_id"));



CREATE POLICY "Allow users to select their own user-specific wallets" ON "public"."token_wallets" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IS NULL)));



CREATE POLICY "Allow users to update messages in accessible chats" ON "public"."chat_messages" FOR UPDATE TO "authenticated" USING ("public"."can_select_chat"("chat_id")) WITH CHECK ("public"."can_select_chat"("chat_id"));



CREATE POLICY "Allow users to update their own profile details" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Deny access to non-service roles" ON "public"."subscription_transactions" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow direct deletes on payment transactions by users" ON "public"."payment_transactions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Disallow direct deletes on wallet transactions (immutable ledge" ON "public"."token_wallet_transactions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Disallow direct deletes on wallet transactions by service_role " ON "public"."token_wallet_transactions" FOR DELETE TO "service_role" USING (false);



CREATE POLICY "Disallow direct deletes on wallets by users" ON "public"."token_wallets" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Disallow direct inserts on payment transactions by users" ON "public"."payment_transactions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Disallow direct inserts on wallet transactions by users" ON "public"."token_wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Disallow direct inserts on wallets by users" ON "public"."token_wallets" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Disallow direct updates on payment transactions by users" ON "public"."payment_transactions" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow direct updates on wallet transactions (immutable ledge" ON "public"."token_wallet_transactions" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow direct updates on wallet transactions by service_role " ON "public"."token_wallet_transactions" FOR UPDATE TO "service_role" USING (false);



CREATE POLICY "Disallow direct updates on wallets by users" ON "public"."token_wallets" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow direct updates to wallets by authenticated users" ON "public"."token_wallets" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Invited user select access for pending invites" ON "public"."invites" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'email'::"text") = "invited_email") AND ("status" = 'pending'::"text")));



CREATE POLICY "Invited user update access for pending invites" ON "public"."invites" FOR UPDATE TO "authenticated" USING (((("auth"."jwt"() ->> 'email'::"text") = "invited_email") AND ("status" = 'pending'::"text"))) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = "invited_email"));



CREATE POLICY "Project owners can view all feedback in their projects" ON "public"."dialectic_feedback" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."dialectic_sessions" "s"
     JOIN "public"."dialectic_projects" "p" ON (("s"."project_id" = "p"."id")))
  WHERE (("s"."id" = "dialectic_feedback"."session_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Service role access for wallet transactions (Immutable)" ON "public"."token_wallet_transactions" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Users can manage contributions for projects they own" ON "public"."dialectic_contributions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."dialectic_sessions" "ds"
     JOIN "public"."dialectic_projects" "dp" ON (("ds"."project_id" = "dp"."id")))
  WHERE (("ds"."id" = "dialectic_contributions"."session_id") AND ("dp"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."dialectic_sessions" "ds"
     JOIN "public"."dialectic_projects" "dp" ON (("ds"."project_id" = "dp"."id")))
  WHERE (("ds"."id" = "dialectic_contributions"."session_id") AND ("dp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage sessions for projects they own" ON "public"."dialectic_sessions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."dialectic_projects" "dp"
  WHERE (("dp"."id" = "dialectic_sessions"."project_id") AND ("dp"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."dialectic_projects" "dp"
  WHERE (("dp"."id" = "dialectic_sessions"."project_id") AND ("dp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own feedback" ON "public"."dialectic_feedback" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own project resources" ON "public"."dialectic_project_resources" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update message status" ON "public"."chat_messages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "chat_messages"."chat_id") AND ("chats"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "chat_messages"."chat_id") AND ("chats"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own messages" ON "public"."chat_messages" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_users_manage_own_dialectic_projects" ON "public"."dialectic_projects" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_artifact_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_contributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_process_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_project_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_stage_transitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dialectic_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."domain_process_associations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."domain_specific_prompt_overlays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."token_wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."token_wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


























































































































































































GRANT ALL ON FUNCTION "public"."begin_transaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."begin_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_transaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_last_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_last_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_last_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_chat_and_messages"("p_chat_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_chat_and_messages"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_and_messages"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_chat_update_restrictions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_chat_update_restrictions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_chat_update_restrictions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_sql"("query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_sql"("query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_sql"("query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_initial_free_tokens_to_user"("p_user_id" "uuid", "p_free_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_member_removed"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_member_removed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_member_removed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_member_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_member_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_member_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_invite_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_invite_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_invite_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_join_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_join_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_join_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_organization"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_of_org_for_wallet"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_of_org_for_wallet"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_of_org_for_wallet"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_system_prompt_id" "uuid", "p_new_assistant_message_error_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_system_prompt_id" "uuid", "p_new_assistant_message_error_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_system_prompt_id" "uuid", "p_new_assistant_message_error_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying, "p_related_entity_type" character varying, "p_notes" "text", "p_payment_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying, "p_related_entity_type" character varying, "p_notes" "text", "p_payment_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_token_transaction"("p_wallet_id" "uuid", "p_transaction_type" character varying, "p_input_amount_text" "text", "p_recorded_by_user_id" "uuid", "p_idempotency_key" "text", "p_related_entity_id" character varying, "p_related_entity_type" character varying, "p_notes" "text", "p_payment_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rollback_transaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."rollback_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollback_transaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_storage_bucket" "text", "p_storage_path" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_storage_bucket" "text", "p_storage_path" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_storage_bucket" "text", "p_storage_path" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_actual_prompt_sent" "text", "p_content_storage_bucket" "text", "p_content_storage_path" "text", "p_content_mime_type" "text", "p_content_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_actual_prompt_sent" "text", "p_content_storage_bucket" "text", "p_content_storage_path" "text", "p_content_mime_type" "text", "p_content_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_contribution_edit_atomic"("p_original_contribution_id" "uuid", "p_session_id" "uuid", "p_user_id" "uuid", "p_stage" "text", "p_iteration_number" integer, "p_actual_prompt_sent" "text", "p_content_storage_bucket" "text", "p_content_storage_path" "text", "p_content_mime_type" "text", "p_content_size_bytes" bigint, "p_raw_response_storage_path" "text", "p_tokens_used_input" integer, "p_tokens_used_output" integer, "p_processing_time_ms" integer, "p_citations" "jsonb", "p_target_contribution_id" "uuid", "p_edit_version" integer, "p_is_latest_edit" boolean, "p_original_model_contribution_id" "uuid", "p_error_details" "text", "p_model_id" "uuid", "p_contribution_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."ai_providers" TO "anon";
GRANT ALL ON TABLE "public"."ai_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_providers" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_artifact_types" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_artifact_types" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_artifact_types" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_contributions" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_contributions" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_contributions" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_domains" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_domains" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_feedback" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_process_templates" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_process_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_process_templates" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_project_resources" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_project_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_project_resources" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_projects" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_projects" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_sessions" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_stage_transitions" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_stage_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_stage_transitions" TO "service_role";



GRANT ALL ON TABLE "public"."dialectic_stages" TO "anon";
GRANT ALL ON TABLE "public"."dialectic_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."dialectic_stages" TO "service_role";



GRANT ALL ON TABLE "public"."domain_process_associations" TO "anon";
GRANT ALL ON TABLE "public"."domain_process_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_process_associations" TO "service_role";



GRANT ALL ON TABLE "public"."domain_specific_prompt_overlays" TO "anon";
GRANT ALL ON TABLE "public"."domain_specific_prompt_overlays" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_specific_prompt_overlays" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_transactions" TO "anon";
GRANT ALL ON TABLE "public"."subscription_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."system_prompts" TO "anon";
GRANT ALL ON TABLE "public"."system_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."token_wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."token_wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."token_wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."token_wallets" TO "anon";
GRANT ALL ON TABLE "public"."token_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."token_wallets" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."v_pending_membership_requests" TO "anon";
GRANT ALL ON TABLE "public"."v_pending_membership_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."v_pending_membership_requests" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
