

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






CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
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
      -- Add more conditions if direct chat access is granted via other tables e.g. chat_participants
    )
  );
$$;


ALTER FUNCTION "public"."can_select_chat"("check_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_existing_member_by_email"("target_org_id" "uuid", "target_email" "text") RETURNS TABLE("membership_status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- 1. Find user_id from email (can query auth.users due to SECURITY DEFINER)
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
    AS $$
DECLARE
    v_organization_id UUID;
    v_is_admin_being_removed BOOLEAN;
    v_other_admin_count INTEGER;
BEGIN
    -- Determine the organization ID from either OLD or NEW record
    IF TG_OP = 'DELETE' THEN
        v_organization_id := OLD.organization_id;
    ELSE -- TG_OP = 'UPDATE'
        v_organization_id := NEW.organization_id; -- Could also use OLD.organization_id
    END IF;

    -- Check if the organization is already deleted; if so, allow changes
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_organization_id AND deleted_at IS NOT NULL) THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Check if an admin is being demoted or removed (status changing from 'active' or role changing from 'admin')
    v_is_admin_being_removed := (
        TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.status = 'active'
    ) OR (
        TG_OP = 'UPDATE' AND
        OLD.role = 'admin' AND OLD.status = 'active' AND
        (NEW.role <> 'admin' OR NEW.status <> 'active')
    );

    -- If an admin is not being removed/demoted, allow the operation
    IF NOT v_is_admin_being_removed THEN
         IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- If an admin is being removed/demoted, count other active admins in the non-deleted organization
    SELECT count(*)
    INTO v_other_admin_count
    FROM public.organization_members om
    JOIN public.organizations o ON om.organization_id = o.id
    WHERE om.organization_id = v_organization_id
      AND om.role = 'admin'
      AND om.status = 'active'
      AND o.deleted_at IS NULL
      AND om.id <> OLD.id; -- Exclude the member being updated/deleted

    -- If removing/demoting this admin leaves no other admins, raise an error
    IF v_other_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove or demote the last admin of organization %', v_organization_id;
    END IF;

    -- Otherwise, allow the operation
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


ALTER FUNCTION "public"."check_last_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    can_create BOOLEAN;
BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om ON o.id = om.organization_id
      WHERE o.id = p_org_id                   -- Match the organization
        AND om.user_id = p_user_id            -- Match the user
        AND om.status = 'active'              -- User must be active
        AND (
          om.role = 'admin'                   -- Allow if user is admin
          OR
          o.allow_member_chat_creation = true -- OR Allow if org allows member creation
        )
    ) INTO can_create;
    RETURN can_create;
END;
$$;


ALTER FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_org_chat_creation_permission"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Checks if a given active user is permitted to create a chat in a specific organization.';



CREATE OR REPLACE FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$$;


ALTER FUNCTION "public"."create_notification_for_user"("target_user_id" "uuid", "notification_type" "text", "notification_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_org_and_admin_member"("p_user_id" "uuid", "p_org_name" "text", "p_org_visibility" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
    
        -- CORRECTED Condition: Deny if user is NULL (not found) OR if they are not admin and not owner
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
    -- RAISE EXCEPTION 'Chat not found: %', p_chat_id;
    RETURN 'NOT FOUND'; -- Return status instead
  END IF;

  -- 2. Permission Check
  IF v_chat_org_id IS NOT NULL THEN
    -- Organization chat
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_chat_org_id AND user_id = p_user_id AND status = 'active';

    IF NOT (v_user_role = 'admin' OR v_chat_owner_id = p_user_id) THEN
      -- RAISE EXCEPTION 'Permission denied...';
      RETURN 'ORG PERMISSION DENIED'; -- Return status instead
    END IF;
  ELSE
    -- Personal chat
    IF v_chat_owner_id IS DISTINCT FROM p_user_id THEN
       -- RAISE EXCEPTION 'Permission denied...';
       RETURN 'PERSONAL PERMISSION DENIED'; -- Return status instead
    END IF;
  END IF;

  -- 3. Perform Deletions (Only if permission granted)
  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;

  RETURN 'DELETED'; -- Return success status

END;
$$;


ALTER FUNCTION "public"."delete_chat_and_messages_debug"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_chat_update_restrictions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Check if user_id is being changed
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Changing the user_id of a chat is not allowed.';
  END IF;

  -- Check if organization_id is being changed (handles NULLs correctly)
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing the organization_id of a chat is not allowed.';
  END IF;

  -- If checks pass, allow the update
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_chat_update_restrictions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_member_removed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
      -- Org might be hard deleted? Or FK constraint failed? Log/handle error?
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
            'target_path', '/dashboard/organizations/' || NEW.organization_id::text || '/settings' -- User might check their role in settings
        )
    );

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."handle_member_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_invite_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
      TRIM(p.first_name || ' ' || p.last_name), -- Construct full name
      u.email
    INTO
      full_name, -- Store constructed full name
      inviter_name -- Default to email if name is blank
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.id -- Correct join table and condition
    WHERE u.id = NEW.invited_by_user_id;

    -- Use the constructed full name if it's not blank, otherwise keep the email
    IF full_name IS NOT NULL AND full_name <> '' THEN
      inviter_name := full_name;
    END IF;

    -- Insert notification for the invited user using the 'data' column
    INSERT INTO public.notifications (user_id, type, data) -- Corrected columns
    VALUES (
      invited_user_id,
      'organization_invite', -- Notification type
      jsonb_build_object(
        'subject', 'Organization Invitation', -- Add a subject line
        'message', COALESCE(inviter_name, 'Someone') || ' has invited you to join ' || COALESCE(organization_name, 'an organization') || ' as a ' || NEW.role_to_assign || '.', -- Generated message text
        'target_path', '/accept-invite/' || NEW.invite_token, -- Path to accept invite page
        'organization_id', NEW.organization_id,
        'organization_name', organization_name,
        'invite_id', NEW.id,
        'invite_token', NEW.invite_token, -- Keep token for reference if needed
        'inviter_id', NEW.invited_by_user_id,
        'inviter_name', inviter_name,
        'assigned_role', NEW.role_to_assign
      )
    );
  ELSE
    -- Optional: Log if the invited user doesn't exist yet (might be expected)
    RAISE LOG 'Invited user with email % not found in auth.users, no notification created.', NEW.invited_email;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_invite_notification"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_invite_notification"() IS 'Handles inserting a notification when a new pending invite is created.';



CREATE OR REPLACE FUNCTION "public"."handle_new_join_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
        RETURN NULL; -- Or NEW depending on preference for AFTER triggers
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

    RETURN NULL; -- AFTER triggers often return NULL
END;
$$;


ALTER FUNCTION "public"."handle_new_join_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Insert into public.user_profiles
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (
    NEW.id,
    'user', -- Default role
    NEW.raw_user_meta_data ->> 'first_name' -- Example: try to get name from metadata if provided during signup
  );

  -- Optional: Find the 'Free' plan ID (adjust 'Free' name if needed)
  SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;

  -- Optional: If a Free plan exists, create an entry in user_subscriptions
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'free'); -- Set status to 'free' or appropriate default
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_placeholder_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  -- Example data for testing
  example_admin_id UUID;
  example_requesting_user_id UUID;
  example_org_id UUID;
BEGIN
  -- In a real scenario, these would come from NEW row data
  -- For placeholder, try getting the current user's ID if available, otherwise use a dummy
  example_admin_id := auth.uid();
  example_requesting_user_id := '00000000-0000-0000-0000-000000000001'; -- Dummy requesting user
  example_org_id := '00000000-0000-0000-0000-000000000002'; -- Dummy org

  -- Call the helper function to create the notification
  PERFORM public.create_notification_for_user(
    example_admin_id,                               -- User to notify (placeholder)
    'join_request',                                 -- Notification type
    jsonb_build_object(                             -- Contextual data
      'requesting_user_id', example_requesting_user_id,
      'organization_id', example_org_id,
      'target_path', '/dashboard/organizations/' || example_org_id::text || '/members?action=review&user=' || example_requesting_user_id::text
    )
  );

  RETURN NEW; -- Or NULL depending on trigger type (AFTER triggers often return NULL)
END;
$$;


ALTER FUNCTION "public"."handle_placeholder_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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
        AND om.status = 'active' -- Ensure member is active
  );
END;
$$;


ALTER FUNCTION "public"."is_org_admin"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_org_admin"("org_id" "uuid") IS 'Checks if the current authenticated user is an active admin of the specified non-deleted organization.';



CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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
          AND o.deleted_at IS NULL -- Ensure organization is not soft-deleted
    ) INTO is_member;
    RETURN is_member;
END;
$$;


ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_pending_invites_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if the new user has an email (should always be true for Supabase auth)
  IF NEW.email IS NOT NULL THEN
    -- Update any pending invites matching the new user's email
    -- Set invited_user_id to the new user's ID where it was previously NULL
    UPDATE public.invites
    SET invited_user_id = NEW.id
    WHERE
      invites.invited_email = NEW.email AND
      invites.invited_user_id IS NULL AND
      invites.status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."link_pending_invites_on_signup"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_pending_invites_on_signup"() IS 'Automatically links pending invites (where invited_user_id is NULL) to a newly signed-up user based on matching email address.';



CREATE OR REPLACE FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") RETURNS TABLE("id" "uuid", "chat_id" "uuid", "user_id" "uuid", "role" "text", "content" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "is_active_in_thread" boolean, "token_usage" "jsonb", "ai_provider_id" "uuid", "system_prompt_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_rewind_point_created_at TIMESTAMPTZ;
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
BEGIN
    -- 1. Get the created_at of the message to rewind from
    SELECT cm.created_at INTO v_rewind_point_created_at
    FROM public.chat_messages cm 
    WHERE cm.id = p_rewind_from_message_id AND cm.chat_id = p_chat_id;

    -- 2. Check if the rewind point message was found
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rewind point message ID % not found in chat ID %\', p_rewind_from_message_id, p_chat_id;
    END IF;

    -- 3. Deactivate messages created strictly after the rewind point
    UPDATE public.chat_messages cm 
    SET is_active_in_thread = false, updated_at = now() -- Also update updated_at for deactivated messages
    WHERE cm.chat_id = p_chat_id AND cm.created_at > v_rewind_point_created_at;

    -- 4. Insert the new user message
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, 
        role,
        content,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        p_user_id, 
        'user',
        p_new_user_message_content,
        p_new_user_message_ai_provider_id,
        p_new_user_message_system_prompt_id, 
        true
    )
    RETURNING public.chat_messages.id INTO v_new_user_message_id; 

    -- 5. Insert the new assistant message
    INSERT INTO public.chat_messages (
        chat_id,
        user_id, 
        role,
        content,
        token_usage,
        ai_provider_id,
        system_prompt_id,
        is_active_in_thread
    )
    VALUES (
        p_chat_id,
        NULL, 
        'assistant',
        p_new_assistant_message_content,
        p_new_assistant_message_token_usage,
        p_new_assistant_message_ai_provider_id,
        p_new_assistant_message_system_prompt_id, 
        true
    )
    RETURNING public.chat_messages.id INTO v_new_assistant_message_id; 

    -- 6. Return THE NEWLY CREATED USER MESSAGE AND THE NEW ASSISTANT MESSAGE
    RETURN QUERY
    SELECT
        cm.id,
        cm.chat_id,
        cm.user_id,
        cm.role,
        cm.content,
        cm.created_at,
        cm.updated_at,
        cm.is_active_in_thread,
        cm.token_usage,
        cm.ai_provider_id,
        cm.system_prompt_id
    FROM public.chat_messages cm
    WHERE cm.id = v_new_user_message_id  -- Get the new user message
    UNION ALL
    SELECT
        cm.id,
        cm.chat_id,
        cm.user_id,
        cm.role,
        cm.content,
        cm.created_at,
        cm.updated_at,
        cm.is_active_in_thread,
        cm.token_usage,
        cm.ai_provider_id,
        cm.system_prompt_id
    FROM public.chat_messages cm
    WHERE cm.id = v_new_assistant_message_id -- Get the new assistant message
    ORDER BY created_at; -- Ensure consistent order if needed by client

EXCEPTION
    WHEN OTHERS THEN
        RAISE; 
END;
$$;


ALTER FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") IS 'Performs a chat rewind operation atomically: deactivates messages after a specified point and inserts new user and assistant messages.';



CREATE OR REPLACE FUNCTION "public"."restrict_invite_update_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."restrict_invite_update_fields"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restrict_invite_update_fields"() IS 'Trigger function to ensure only the status field of an invite can be changed to accepted/declined by the invited user (non-admins).';



CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);

ALTER TABLE ONLY "public"."chat_messages" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS 'Stores individual messages within a chat session.';



COMMENT ON COLUMN "public"."chat_messages"."is_active_in_thread" IS 'Indicates if a message is part of the currently active conversation thread (true) or has been superseded by a rewind/edit (false).';



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
    CONSTRAINT "organizations_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."visibility" IS 'Controls if the organization can be discovered or joined publicly.';



COMMENT ON COLUMN "public"."organizations"."deleted_at" IS 'Timestamp when the organization was soft-deleted.';



COMMENT ON COLUMN "public"."organizations"."allow_member_chat_creation" IS 'Controls whether non-admin members can create new chat sessions within this organization.';



CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "stripe_price_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" NOT NULL,
    "interval" "text" NOT NULL,
    "interval_count" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "description" "jsonb",
    "stripe_product_id" "text",
    CONSTRAINT "subscription_plans_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "subscription_plans_interval_check" CHECK (("interval" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text", 'year'::"text"])))
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscription_plans" IS 'Stores available subscription plans from Stripe.';



COMMENT ON COLUMN "public"."subscription_plans"."amount" IS 'Amount in the smallest currency unit (e.g., cents).';



COMMENT ON COLUMN "public"."subscription_plans"."active" IS 'Whether the plan is currently offered to new subscribers.';



COMMENT ON COLUMN "public"."subscription_plans"."description" IS 'Plan description (subtitle) and features list (JSONB).';



COMMENT ON COLUMN "public"."subscription_plans"."stripe_product_id" IS 'The corresponding Stripe Product ID (prod_...).';



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


ALTER TABLE "public"."subscription_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_transactions"."stripe_event_id" IS 'Unique Stripe event ID used for idempotency.';



COMMENT ON COLUMN "public"."subscription_transactions"."status" IS 'Processing status of the webhook event handler.';



CREATE TABLE IF NOT EXISTS "public"."system_prompts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "prompt_text" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_prompts" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_prompts" IS 'Stores reusable system prompts for AI interactions.';



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_selected_org_id" "uuid",
    "profile_privacy_setting" "text" DEFAULT 'private'::"text" NOT NULL,
    CONSTRAINT "check_profile_privacy_setting" CHECK (("profile_privacy_setting" = ANY (ARRAY['private'::"text", 'public'::"text", 'members_only'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_profiles" IS 'Stores public profile information for users.';



COMMENT ON COLUMN "public"."user_profiles"."id" IS 'References auth.users.id';



COMMENT ON COLUMN "public"."user_profiles"."last_selected_org_id" IS 'Stores the ID of the last organization selected by the user in the UI.';



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



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_stripe_price_id_key" UNIQUE ("stripe_price_id");



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_chats_organization_id" ON "public"."chats" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_chats_user_id" ON "public"."chats" USING "btree" ("user_id");



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



CREATE INDEX "idx_organization_members_user_org" ON "public"."organization_members" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_subscription_plans_stripe_product_id" ON "public"."subscription_plans" USING "btree" ("stripe_product_id");



CREATE INDEX "idx_subscription_transactions_event_type" ON "public"."subscription_transactions" USING "btree" ("event_type");



CREATE INDEX "idx_subscription_transactions_stripe_event_id" ON "public"."subscription_transactions" USING "btree" ("stripe_event_id");



CREATE INDEX "idx_subscription_transactions_stripe_subscription_id" ON "public"."subscription_transactions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscription_transactions_user_id" ON "public"."subscription_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_last_selected_org_id" ON "public"."user_profiles" USING "btree" ("last_selected_org_id");



CREATE INDEX "idx_user_profiles_privacy_setting" ON "public"."user_profiles" USING "btree" ("profile_privacy_setting");



CREATE OR REPLACE TRIGGER "before_member_update_delete_check_last_admin" BEFORE DELETE OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_last_admin"();



CREATE OR REPLACE TRIGGER "enforce_chat_update_restrictions" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chat_update_restrictions"();



CREATE OR REPLACE TRIGGER "enforce_invite_update_restrictions" BEFORE UPDATE ON "public"."invites" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_invite_update_fields"();



COMMENT ON TRIGGER "enforce_invite_update_restrictions" ON "public"."invites" IS 'Restricts updates on invites made by non-admins, ensuring only status change is possible.';



CREATE OR REPLACE TRIGGER "notify_user_on_invite" AFTER INSERT ON "public"."invites" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "public"."handle_new_invite_notification"();



CREATE OR REPLACE TRIGGER "on_ai_providers_update" BEFORE UPDATE ON "public"."ai_providers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_chats_update" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_system_prompts_update" BEFORE UPDATE ON "public"."system_prompts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_admins_on_join_request" AFTER INSERT ON "public"."organization_members" FOR EACH ROW WHEN (("new"."status" = 'pending'::"text")) EXECUTE FUNCTION "public"."handle_new_join_request"();



CREATE OR REPLACE TRIGGER "trg_notify_user_on_member_removed" AFTER UPDATE ON "public"."organization_members" FOR EACH ROW WHEN ((("old"."status" = 'active'::"text") AND ("new"."status" = 'removed'::"text"))) EXECUTE FUNCTION "public"."handle_member_removed"();



CREATE OR REPLACE TRIGGER "trg_notify_user_on_role_change" AFTER UPDATE ON "public"."organization_members" FOR EACH ROW WHEN ((("old"."role" IS DISTINCT FROM "new"."role") AND ("old"."status" = 'active'::"text") AND ("new"."status" = 'active'::"text"))) EXECUTE FUNCTION "public"."handle_member_role_change"();



CREATE OR REPLACE TRIGGER "trigger_update_chat_messages_updated_at" BEFORE UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



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



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_transactions"
    ADD CONSTRAINT "subscription_transactions_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_last_selected_org_id_fkey" FOREIGN KEY ("last_selected_org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin DELETE access for organization invites" ON "public"."invites" FOR DELETE USING ("public"."is_org_admin"("organization_id"));



COMMENT ON POLICY "Admin DELETE access for organization invites" ON "public"."invites" IS 'Admins can DELETE invites within their organization.';



CREATE POLICY "Admin INSERT access for organization invites" ON "public"."invites" FOR INSERT WITH CHECK ("public"."is_org_admin"("organization_id"));



COMMENT ON POLICY "Admin INSERT access for organization invites" ON "public"."invites" IS 'Admins can INSERT invites within their organization.';



CREATE POLICY "Admin SELECT access for organization invites" ON "public"."invites" FOR SELECT USING ("public"."is_org_admin"("organization_id"));



COMMENT ON POLICY "Admin SELECT access for organization invites" ON "public"."invites" IS 'Admins can SELECT invites within their organization.';



CREATE POLICY "Admin UPDATE access for organization invites" ON "public"."invites" FOR UPDATE USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



COMMENT ON POLICY "Admin UPDATE access for organization invites" ON "public"."invites" IS 'Admins can UPDATE invites within their organization.';



CREATE POLICY "Allow active members to view memberships in their orgs" ON "public"."organization_members" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text"));



CREATE POLICY "Allow active members to view their non-deleted organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text"));



CREATE POLICY "Allow admins or self to update memberships" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING (("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text") OR (("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."deleted_at" IS NULL))))))) WITH CHECK (("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text") OR (("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organizations"
  WHERE (("organizations"."id" = "organization_members"."organization_id") AND ("organizations"."deleted_at" IS NULL)))))));



CREATE POLICY "Allow admins to insert new members" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text", 'admin'::"text"));



CREATE POLICY "Allow admins to update their non-deleted organizations" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text", 'admin'::"text")) WITH CHECK ("public"."is_org_member"("id", "auth"."uid"(), 'active'::"text", 'admin'::"text"));



CREATE POLICY "Allow authenticated read access" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to create organizations" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow individual insert access" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual insert access" ON "public"."user_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow individual read access" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual read access" ON "public"."user_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow individual update access" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual update access" ON "public"."user_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow org admins and chat owners to delete chats" ON "public"."chats" FOR DELETE TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id"))));



CREATE POLICY "Allow org admins and chat owners to update chats" ON "public"."chats" FOR UPDATE TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id")))) WITH CHECK (((("organization_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("organization_id" IS NOT NULL) AND "public"."is_org_admin"("organization_id"))));



CREATE POLICY "Allow org members/admins and chat owners to select chats" ON "public"."chats" FOR SELECT TO "authenticated" USING (((("organization_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (("organization_id" IS NOT NULL) AND "public"."is_org_member"("organization_id", "auth"."uid"(), 'active'::"text"))));



CREATE POLICY "Allow permitted users to insert organizational chats" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NOT NULL) AND ("user_id" = "auth"."uid"()) AND "public"."check_org_chat_creation_permission"("organization_id", "auth"."uid"())));



CREATE POLICY "Allow profile read based on privacy, shared org, or ownership" ON "public"."user_profiles" FOR SELECT USING ((("profile_privacy_setting" = 'public'::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."organization_members" "om1"
     JOIN "public"."organization_members" "om2" ON (("om1"."organization_id" = "om2"."organization_id")))
  WHERE (("om1"."user_id" = "auth"."uid"()) AND ("om2"."user_id" = "user_profiles"."id") AND ("om1"."status" = 'active'::"text") AND ("om2"."status" = 'active'::"text")))) OR ("auth"."uid"() = "id")));



CREATE POLICY "Allow public read access to active prompts" ON "public"."system_prompts" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow public read access to active providers" ON "public"."ai_providers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow service_role access" ON "public"."subscription_transactions" USING (false) WITH CHECK (false);



CREATE POLICY "Allow user SELECT access to their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow user UPDATE access for their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to insert messages in accessible chats with role ch" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_select_chat"("chat_id") AND (("role" <> 'user'::"text") OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "Allow users to insert personal chats" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Allow users to insert their own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow users to select messages in accessible chats" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."can_select_chat"("chat_id"));



CREATE POLICY "Allow users to update their own profile details" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Invited user select access for pending invites" ON "public"."invites" FOR SELECT USING ((("status" = 'pending'::"text") AND ((("invited_user_id" IS NOT NULL) AND ("auth"."uid"() = "invited_user_id")) OR (("invited_user_id" IS NULL) AND (("auth"."jwt"() ->> 'email'::"text") = "invited_email")))));



CREATE POLICY "Invited user update access for pending invites" ON "public"."invites" FOR UPDATE USING ((("status" = 'pending'::"text") AND ((("invited_user_id" IS NOT NULL) AND ("auth"."uid"() = "invited_user_id")) OR (("invited_user_id" IS NULL) AND (("auth"."jwt"() ->> 'email'::"text") = "invited_email"))))) WITH CHECK (((("invited_user_id" IS NOT NULL) AND ("auth"."uid"() = "invited_user_id")) OR (("invited_user_id" IS NULL) AND (("auth"."jwt"() ->> 'email'::"text") = "invited_email"))));



CREATE POLICY "Users can update message status" ON "public"."chat_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "chat_messages"."chat_id") AND ("chats"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chats"
  WHERE (("chats"."id" = "chat_messages"."chat_id") AND ("chats"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Users can update message status" ON "public"."chat_messages" IS 'Allows users to update message status (active/inactive) for messages in their chats';



CREATE POLICY "Users can update their own messages" ON "public"."chat_messages" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


























































































































































































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



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_placeholder_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid", "p_user_id" "uuid", "required_status" "text", "required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_pending_invites_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_chat_rewind"("p_chat_id" "uuid", "p_rewind_from_message_id" "uuid", "p_user_id" "uuid", "p_new_user_message_content" "text", "p_new_user_message_ai_provider_id" "uuid", "p_new_user_message_system_prompt_id" "uuid", "p_new_assistant_message_content" "text", "p_new_assistant_message_token_usage" "jsonb", "p_new_assistant_message_ai_provider_id" "uuid", "p_new_assistant_message_system_prompt_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restrict_invite_update_fields"() TO "service_role";



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



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_transactions" TO "anon";
GRANT ALL ON TABLE "public"."subscription_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."system_prompts" TO "anon";
GRANT ALL ON TABLE "public"."system_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_prompts" TO "service_role";



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

--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE OR REPLACE TRIGGER "trigger_link_invites_on_signup" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."link_pending_invites_on_signup"();



COMMENT ON TRIGGER "trigger_link_invites_on_signup" ON "auth"."users" IS 'Links pending invites to new users upon signup.';



