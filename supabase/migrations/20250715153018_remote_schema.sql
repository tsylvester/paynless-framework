drop policy "Allow authenticated read access to active providers" on "public"."ai_providers";

drop policy "Allow users to update messages in accessible chats" on "public"."chat_messages";

drop policy "Users can update message status" on "public"."chat_messages";

drop policy "Users can update their own messages" on "public"."chat_messages";

drop policy "Allow permitted users to insert organizational chats" on "public"."chats";

drop policy "Allow users to insert personal chats" on "public"."chats";

drop policy "Project owners can view all feedback in their projects" on "public"."dialectic_feedback";

drop policy "Users can manage their own feedback" on "public"."dialectic_feedback";

drop policy "Admin SELECT access for organization invites" on "public"."invites";

drop policy "Admin UPDATE access for organization invites" on "public"."invites";

drop policy "Invited user select access for pending invites" on "public"."invites";

drop policy "Invited user update access for pending invites" on "public"."invites";

drop policy "Allow organization admins to select their organization's paymen" on "public"."payment_transactions";

drop policy "Deny access to non-service roles" on "public"."subscription_transactions";

drop policy "Allow authenticated users to read active system_prompts" on "public"."system_prompts";

drop policy "Allow organization admins to select their organization's wallet" on "public"."token_wallet_transactions";

drop policy "Disallow direct updates on wallets by users" on "public"."token_wallets";

drop policy "Disallow direct updates to wallets by authenticated users" on "public"."token_wallets";

drop policy "Allow org admins and chat owners to delete chats" on "public"."chats";

drop policy "Allow org admins and chat owners to update chats" on "public"."chats";

drop policy "Allow org members/admins and chat owners to select chats" on "public"."chats";

drop policy "Users can manage contributions for projects they own" on "public"."dialectic_contributions";

drop policy "Users can manage their own project resources" on "public"."dialectic_project_resources";

drop policy "auth_users_manage_own_dialectic_projects" on "public"."dialectic_projects";

drop policy "Users can manage sessions for projects they own" on "public"."dialectic_sessions";

drop policy "Allow user SELECT access to their own notifications" on "public"."notifications";

drop policy "Allow user UPDATE access for their own notifications" on "public"."notifications";

drop policy "Allow authenticated users to select their own payment transacti" on "public"."payment_transactions";

drop policy "Allow authenticated users to select their own wallet transactio" on "public"."token_wallet_transactions";

drop policy "Allow individual insert access" on "public"."user_subscriptions";

drop policy "Allow individual read access" on "public"."user_subscriptions";

drop policy "Allow individual update access" on "public"."user_subscriptions";

alter table "public"."dialectic_project_resources" drop constraint "unique_storage_path";

alter table "public"."system_prompts" drop constraint "system_prompts_name_unique";

alter table "public"."token_wallet_transactions" drop constraint "token_wallet_transactions_recorded_by_user_id_fkey";

alter table "public"."user_subscriptions" drop constraint "user_subscriptions_user_id_unique";

drop index if exists "public"."idx_token_wallet_transactions_wallet_id_timestamp";

drop index if exists "public"."system_prompts_name_unique";

drop index if exists "public"."unique_storage_path";

drop index if exists "public"."user_subscriptions_user_id_unique";

alter table "public"."subscription_plans" alter column "interval_count" drop default;

CREATE INDEX idx_chat_messages_ai_provider_id ON public.chat_messages USING btree (ai_provider_id);

CREATE INDEX idx_chat_messages_system_prompt_id ON public.chat_messages USING btree (system_prompt_id);

CREATE INDEX idx_chat_messages_user_id ON public.chat_messages USING btree (user_id);

CREATE INDEX idx_chats_system_prompt_id ON public.chats USING btree (system_prompt_id);

CREATE INDEX idx_dialectic_contributions_prompt_template_id_used ON public.dialectic_contributions USING btree (prompt_template_id_used);

CREATE INDEX idx_dialectic_domains_parent_domain_id ON public.dialectic_domains USING btree (parent_domain_id);

CREATE INDEX idx_dialectic_feedback_project_id ON public.dialectic_feedback USING btree (project_id);

CREATE INDEX idx_dialectic_process_templates_starting_stage_id ON public.dialectic_process_templates USING btree (starting_stage_id);

CREATE INDEX idx_dialectic_projects_initial_prompt_resource_id ON public.dialectic_projects USING btree (initial_prompt_resource_id);

CREATE INDEX idx_dialectic_projects_process_template_id ON public.dialectic_projects USING btree (process_template_id);

CREATE INDEX idx_dialectic_projects_selected_domain_id ON public.dialectic_projects USING btree (selected_domain_id);

CREATE INDEX idx_dialectic_projects_selected_domain_overlay_id ON public.dialectic_projects USING btree (selected_domain_overlay_id);

CREATE INDEX idx_dialectic_projects_user_id ON public.dialectic_projects USING btree (user_id);

CREATE INDEX idx_dialectic_sessions_current_stage_id ON public.dialectic_sessions USING btree (current_stage_id);

CREATE INDEX idx_dialectic_sessions_project_id ON public.dialectic_sessions USING btree (project_id);

CREATE INDEX idx_dialectic_stage_transitions_process_template_id ON public.dialectic_stage_transitions USING btree (process_template_id);

CREATE INDEX idx_dialectic_stage_transitions_source_stage_id ON public.dialectic_stage_transitions USING btree (source_stage_id);

CREATE INDEX idx_dialectic_stage_transitions_target_stage_id ON public.dialectic_stage_transitions USING btree (target_stage_id);

CREATE INDEX idx_dialectic_stages_default_system_prompt_id ON public.dialectic_stages USING btree (default_system_prompt_id);

CREATE INDEX idx_domain_process_associations_process_template_id ON public.domain_process_associations USING btree (process_template_id);

CREATE INDEX idx_domain_specific_prompt_overlays_domain_id ON public.domain_specific_prompt_overlays USING btree (domain_id);

CREATE INDEX idx_domain_specific_prompt_overlays_system_prompt_id ON public.domain_specific_prompt_overlays USING btree (system_prompt_id);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_payment_transactions_organization_id ON public.payment_transactions USING btree (organization_id);

CREATE INDEX idx_payment_transactions_user_id ON public.payment_transactions USING btree (user_id);

CREATE INDEX idx_subscription_transactions_user_subscription_id ON public.subscription_transactions USING btree (user_subscription_id);

CREATE INDEX idx_token_wallet_transactions_payment_transaction_id ON public.token_wallet_transactions USING btree (payment_transaction_id);

CREATE INDEX idx_user_subscriptions_plan_id ON public.user_subscriptions USING btree (plan_id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = p_user_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.begin_transaction()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN 'Transaction block conceptually started. Client must manage actual transaction lifecycle.';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_select_chat(check_chat_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
 SET jit TO 'off'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_existing_member_by_email(target_org_id uuid, target_email text)
 RETURNS TABLE(membership_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_last_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_org_chat_creation_permission(p_org_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_user_membership(target_org_id uuid, target_email text)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification_for_user(target_user_id uuid, notification_type text, notification_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_org_and_admin_member(p_user_id uuid, p_org_name text, p_org_visibility text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_chat_and_messages(p_chat_id uuid, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_chat_and_messages_debug(p_chat_id uuid, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_chat_update_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Changing the user_id of a chat is not allowed.';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing the organization_id of a chat is not allowed.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_sql(query text)
 RETURNS SETOF json
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    constructed_query TEXT;
BEGIN
    constructed_query := 'SELECT row_to_json(t) FROM (' || query || ') t';
    
    RETURN QUERY EXECUTE constructed_query;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_initial_free_tokens_to_user(p_user_id uuid, p_free_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_member_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_member_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_invite_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  invited_user_id uuid;
  inviter_name text;
  organization_name text;
BEGIN
  -- Find the user_id for the invited email
  SELECT id INTO invited_user_id FROM auth.users WHERE email = NEW.invited_email;

  -- If the user exists, create a notification
  IF invited_user_id IS NOT NULL THEN
    -- Get organization name
    SELECT name INTO organization_name FROM public.organizations WHERE id = NEW.organization_id;
    -- Get inviter name (optional, use email if profile/name not found)
    SELECT p.first_name || ' ' || p.last_name INTO inviter_name
    FROM public.user_profiles p
    JOIN auth.users u ON p.id = u.id
    WHERE u.id = NEW.invited_by_user_id;

    -- Fallback to a generic inviter name if profile not found
    inviter_name := COALESCE(inviter_name, 'Someone');

    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      invited_user_id,
      'organization_invite',
      jsonb_build_object(
        'message', inviter_name || ' has invited you to join ' || organization_name,
        'invite_id', NEW.id,
        'invite_token', NEW.invite_token,
        'inviter_id', NEW.invited_by_user_id
      )
    );
  ELSE
    -- Log that the invited user was not found, no notification created
    RAISE LOG 'Invited user with email % not found in auth.users, no notification created.', NEW.invited_email;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_join_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.token_wallets (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) WHERE user_id IS NULL DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := NEW.id; -- ID of the new user from auth.users trigger
  v_user_email TEXT := NEW.email;
  v_raw_user_meta_data JSONB := NEW.raw_user_meta_data;

  v_profile_first_name TEXT;

  v_free_plan_id UUID;
  v_tokens_to_award NUMERIC;
  v_target_wallet_id UUID;
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;

  v_system_user_id UUID;
  v_system_user_email_pattern TEXT := 'system-token-allocator-%@internal.app'; -- From previous migration 20250520154343
  v_idempotency_key_grant TEXT;
BEGIN
  RAISE LOG '[handle_new_user] Processing new user ID: %, Email: %', v_user_id, v_user_email;

  -- 1. Create User Profile
  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name)
  VALUES (v_user_id, 'user', v_profile_first_name)
  ON CONFLICT (id) DO NOTHING;
  RAISE LOG '[handle_new_user] Ensured profile for user ID: %.', v_user_id;

  -- 2. Create Token Wallet (defaults to 0 balance as per table DDL)
  INSERT INTO public.token_wallets (user_id, currency)
  VALUES (v_user_id, 'AI_TOKEN')
  ON CONFLICT (user_id) WHERE organization_id IS NULL -- Based on unique_user_personal_wallet_idx
  DO NOTHING
  RETURNING wallet_id INTO v_target_wallet_id;

  IF v_target_wallet_id IS NULL THEN -- Wallet already existed
    SELECT wallet_id INTO v_target_wallet_id
    FROM public.token_wallets
    WHERE user_id = v_user_id AND organization_id IS NULL;
  END IF;

  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[handle_new_user] Failed to create or find personal wallet for user ID: %. Aborting token grant.', v_user_id;
    RETURN NEW;
  END IF;
  RAISE LOG '[handle_new_user] Ensured wallet ID: % for user ID: %.', v_target_wallet_id, v_user_id;

  -- 3. Attempt to Grant Initial Free Tokens
  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award
  FROM public.subscription_plans
  WHERE name = 'Free' -- IMPORTANT: Ensure this name is exact and matches your 'Free' plan name.
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE LOG '[handle_new_user] ''Free'' plan not found. No initial tokens will be granted for user ID: %.', v_user_id;
  ELSIF v_tokens_to_award IS NULL OR v_tokens_to_award <= 0 THEN
    RAISE LOG '[handle_new_user] ''Free'' plan (ID: %) found, but tokens_to_award is not positive (Value: %). No initial tokens for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;
  ELSE
    RAISE LOG '[handle_new_user] ''Free'' plan ID: % found with % tokens to award for user ID: %.', v_free_plan_id, v_tokens_to_award, v_user_id;

    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (v_user_id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month')
    ON CONFLICT (user_id) -- Assumes one subscription per user. If (user_id, plan_id) is unique, adjust.
    DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, updated_at = NOW(), current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end
    WHERE public.user_subscriptions.status <> 'free'; -- Only update if not already actively 'free'
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
            COALESCE(v_system_user_id, v_user_id), -- If system user not found, new user is recorder
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_placeholder_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_of_org_for_wallet(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.role::text = 'admin'
      AND om.status::text = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid, p_user_id uuid, required_status text, required_role text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.link_pending_invites_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invite_record RECORD;
BEGIN
  -- Find pending invites for the new user's email
  FOR invite_record IN
    SELECT id, organization_id, role_to_assign
    FROM public.invites
    WHERE invited_email = NEW.email
    AND invited_user_id IS NULL
    AND status = 'pending'
  LOOP
    -- Update the invite to link the new user ID and set status to accepted
    UPDATE public.invites
    SET
      invited_user_id = NEW.id,
      status = 'accepted',
      updated_at = now()
    WHERE id = invite_record.id;

    -- Create the organization membership record
    INSERT INTO public.organization_members (user_id, organization_id, role, status)
    VALUES (NEW.id, invite_record.organization_id, invite_record.role_to_assign, 'active')
    ON CONFLICT (user_id, organization_id) DO NOTHING;

  END LOOP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.perform_chat_rewind(p_chat_id uuid, p_rewind_from_message_id uuid, p_user_id uuid, p_new_user_message_content text, p_new_user_message_ai_provider_id uuid, p_new_assistant_message_content text, p_new_assistant_message_ai_provider_id uuid, p_new_user_message_system_prompt_id uuid DEFAULT NULL::uuid, p_new_assistant_message_token_usage jsonb DEFAULT NULL::jsonb, p_new_assistant_message_system_prompt_id uuid DEFAULT NULL::uuid, p_new_assistant_message_error_type text DEFAULT NULL::text)
 RETURNS TABLE(new_user_message_id uuid, new_assistant_message_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_new_user_message_id UUID;
    v_new_assistant_message_id UUID;
    v_rewind_point TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the timestamp of the rewind point message
    SELECT created_at INTO v_rewind_point
    FROM public.chat_messages
    WHERE id = p_rewind_from_message_id;

    IF v_rewind_point IS NULL THEN
        RAISE EXCEPTION 'Rewind message with ID % not found.', p_rewind_from_message_id;
    END IF;

    -- FIX: Deactivate ALL messages that come after the rewind point (including the rewind point itself)
    UPDATE public.chat_messages
    SET is_active_in_thread = FALSE, updated_at = NOW()
    WHERE chat_id = p_chat_id
      AND created_at >= v_rewind_point
      AND is_active_in_thread = TRUE;

    -- Insert the new user message
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

    -- Insert the new assistant message (with user_id = NULL)
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
        NULL,  -- Assistant messages should have user_id = NULL
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_token_transaction(p_wallet_id uuid, p_transaction_type character varying, p_input_amount_text text, p_recorded_by_user_id uuid, p_idempotency_key text, p_related_entity_id character varying DEFAULT NULL::character varying, p_related_entity_type character varying DEFAULT NULL::character varying, p_notes text DEFAULT NULL::text, p_payment_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(transaction_id uuid, wallet_id uuid, transaction_type character varying, amount numeric, balance_after_txn numeric, recorded_by_user_id uuid, idempotency_key text, related_entity_id character varying, related_entity_type character varying, notes text, "timestamp" timestamp with time zone, payment_transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.restrict_invite_update_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rollback_transaction()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN 'Transaction block conceptually rolled back. Client must manage actual transaction lifecycle.';
END;
$function$
;

-- CREATE OR REPLACE FUNCTION public.save_contribution_edit_atomic(p_original_contribution_id uuid, p_session_id uuid, p_user_id uuid, p_stage text, p_iteration_number integer, p_actual_prompt_sent text, p_content_storage_bucket text, p_content_storage_path text, p_content_mime_type text, p_content_size_bytes bigint, p_raw_response_storage_path text, p_tokens_used_input integer, p_tokens_used_output integer, p_processing_time_ms integer, p_citations jsonb, p_target_contribution_id uuid, p_edit_version integer, p_is_latest_edit boolean, p_original_model_contribution_id uuid, p_error_details text, p_model_id uuid, p_contribution_type text)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SET search_path TO ''
-- AS $function$
-- DECLARE
--     new_contribution_id UUID;
-- BEGIN
--     -- Update the old contribution to no longer be the latest
--     UPDATE public.dialectic_contributions
--     SET is_latest_edit = FALSE,
--         updated_at = now()
--     WHERE id = p_original_contribution_id;

--     -- Insert the new edited contribution
--     INSERT INTO public.dialectic_contributions (
--         session_id,
--         user_id,
--         stage,
--         iteration_number,
--         actual_prompt_sent,
--         content_storage_bucket,
--         content_storage_path,
--         content_mime_type,
--         content_size_bytes,
--         raw_response_storage_path,
--         tokens_used_input,
--         tokens_used_output,
--         processing_time_ms,
--         citations,
--         target_contribution_id, -- Links to the contribution it is an edit OF
--         edit_version,
--         is_latest_edit,
--         original_model_contribution_id,
--         error, -- Storing p_error_details in the 'error' column
--         model_id,
--         contribution_type,
--         created_at,
--         updated_at
--     )
--     VALUES (
--         p_session_id,
--         p_user_id,
--         p_stage,
--         p_iteration_number,
--         p_actual_prompt_sent,
--         p_content_storage_bucket,
--         p_content_storage_path,
--         p_content_mime_type,
--         p_content_size_bytes,
--         p_raw_response_storage_path,
--         p_tokens_used_input,
--         p_tokens_used_output,
--         p_processing_time_ms,
--         p_citations,
--         p_target_contribution_id,
--         p_edit_version,
--         p_is_latest_edit,
--         p_original_model_contribution_id,
--         p_error_details,
--         p_model_id,
--         p_contribution_type,
--         now(),
--         now()
--     )
--     RETURNING id INTO new_contribution_id;

--     RETURN new_contribution_id;
-- EXCEPTION
--     WHEN OTHERS THEN
--         -- Log the error (optional, depends on your logging setup within Postgres)
--         RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
--         RETURN NULL; -- Or re-raise the exception: RAISE;
-- END;
-- $function$
-- ;

-- CREATE OR REPLACE FUNCTION public.save_contribution_edit_atomic(p_original_contribution_id uuid, p_session_id uuid, p_user_id uuid, p_stage text, p_iteration_number integer, p_storage_bucket text, p_storage_path text, p_mime_type text, p_size_bytes bigint, p_raw_response_storage_path text, p_tokens_used_input integer, p_tokens_used_output integer, p_processing_time_ms integer, p_citations jsonb, p_target_contribution_id uuid, p_edit_version integer, p_is_latest_edit boolean, p_original_model_contribution_id uuid, p_error_details text, p_model_id uuid, p_contribution_type text)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SET search_path TO ''
-- AS $function$
-- DECLARE
--     new_contribution_id UUID;
-- BEGIN
--     -- Concurrently update the old contribution to no longer be the latest.
--     -- This prevents race conditions where two edits could be marked as latest.
--     UPDATE public.dialectic_contributions
--     SET is_latest_edit = FALSE,
--         updated_at = now()
--     WHERE id = p_original_contribution_id;

--     -- Insert the new edited contribution record.
--     -- Note the mapping from `p_content_*` parameters to the `storage_*` table columns.
--     INSERT INTO public.dialectic_contributions (
--         session_id,
--         user_id,
--         stage,
--         iteration_number,
--         storage_bucket, -- Corrected column name
--         storage_path,   -- Corrected column name
--         mime_type,      -- Corrected column name
--         size_bytes,     -- Corrected column name
--         raw_response_storage_path,
--         tokens_used_input,
--         tokens_used_output,
--         processing_time_ms,
--         citations,
--         target_contribution_id, 
--         edit_version,
--         is_latest_edit,
--         original_model_contribution_id,
--         error, 
--         model_id,
--         contribution_type,
--         created_at,
--         updated_at
--     )
--     VALUES (
--         p_session_id,
--         p_user_id,
--         p_stage,
--         p_iteration_number,
--         p_storage_bucket, -- Parameter name
--         p_storage_path,   -- Parameter name
--         p_mime_type,      -- Parameter name
--         p_size_bytes,     -- Parameter name
--         p_raw_response_storage_path,
--         p_tokens_used_input,
--         p_tokens_used_output,
--         p_processing_time_ms,
--         p_citations,
--         p_target_contribution_id,
--         p_edit_version,
--         p_is_latest_edit,
--         p_original_model_contribution_id,
--         p_error_details,
--         p_model_id,
--         p_contribution_type,
--         now(),
--         now()
--     )
--     RETURNING id INTO new_contribution_id;

--     RETURN new_contribution_id;
-- EXCEPTION
--     WHEN OTHERS THEN
--         -- Log the error and return NULL if any part of the transaction fails.
--         -- The calling service is responsible for handling the NULL response.
--         RAISE WARNING 'Error in save_contribution_edit_atomic: %', SQLERRM;
--         RETURN NULL;
-- END;
-- $function$
-- ;

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.true_up_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_email text;
  v_raw_user_meta_data jsonb;
  v_profile_first_name text;
  v_target_wallet_id uuid;
  v_free_plan_id uuid;
  v_tokens_to_award numeric;
  v_idempotency_key_grant text;
  v_newly_created_subscription_id uuid;
  -- Variables for the manual token grant
  v_current_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_system_user_id UUID;
BEGIN
  -- 1. Get user metadata
  SELECT raw_user_meta_data, email INTO v_raw_user_meta_data, v_user_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE WARNING '[true_up_user] User not found: %', p_user_id;
    RETURN;
  END IF;

  -- 2. Ensure profile exists
  v_profile_first_name := v_raw_user_meta_data ->> 'first_name';
  INSERT INTO public.user_profiles (id, role, first_name) VALUES (p_user_id, 'user', v_profile_first_name) ON CONFLICT (id) DO NOTHING;

  -- 3. Ensure wallet exists
  INSERT INTO public.token_wallets (user_id, currency) VALUES (p_user_id, 'AI_TOKEN') ON CONFLICT (user_id) WHERE organization_id IS NULL DO NOTHING RETURNING wallet_id INTO v_target_wallet_id;
  IF v_target_wallet_id IS NULL THEN
    SELECT wallet_id INTO v_target_wallet_id FROM public.token_wallets WHERE user_id = p_user_id AND organization_id IS NULL;
  END IF;
  IF v_target_wallet_id IS NULL THEN
    RAISE WARNING '[true_up_user] Failed to find/create wallet for user: %', p_user_id;
    RETURN;
  END IF;

  -- 4. Find the 'Free' plan
  SELECT id, tokens_to_award INTO v_free_plan_id, v_tokens_to_award FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;
  IF v_free_plan_id IS NULL THEN
    RAISE WARNING '[true_up_user] "Free" plan not found.';
    RETURN;
  END IF;

  -- 5. Ensure a default subscription exists if the user has none
  IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (p_user_id, v_free_plan_id, 'free', NOW(), NOW() + interval '1 month');
  END IF;

  -- 6. Grant initial tokens if the user has never received them, regardless of subscription.
  IF (v_tokens_to_award IS NOT NULL AND v_tokens_to_award > 0) THEN
    BEGIN
      -- Use transaction_type for idempotency check, which is more robust than a specific key format.
      IF NOT EXISTS (SELECT 1 FROM public.token_wallet_transactions WHERE wallet_id = v_target_wallet_id AND transaction_type = 'CREDIT_INITIAL_FREE_ALLOCATION') THEN
        RAISE LOG '[true_up_user] Granting initial tokens to user: %', p_user_id;
        
        v_idempotency_key_grant := 'initial_free_grant_' || p_user_id::text;
        SELECT id INTO v_system_user_id FROM auth.users WHERE email LIKE 'system-token-allocator-%@internal.app' LIMIT 1;
        
        SELECT balance INTO v_current_wallet_balance FROM public.token_wallets WHERE wallet_id = v_target_wallet_id FOR UPDATE;
        v_new_wallet_balance := v_current_wallet_balance + v_tokens_to_award;
        UPDATE public.token_wallets SET balance = v_new_wallet_balance, updated_at = now() WHERE token_wallets.wallet_id = v_target_wallet_id;

        INSERT INTO public.token_wallet_transactions (wallet_id, transaction_type, amount, balance_after_txn, recorded_by_user_id, related_entity_id, related_entity_type, notes, idempotency_key)
        VALUES (v_target_wallet_id, 'CREDIT_INITIAL_FREE_ALLOCATION', v_tokens_to_award, v_new_wallet_balance, COALESCE(v_system_user_id, p_user_id), v_free_plan_id::TEXT, 'subscription_plans', 'Initial token allocation for new user.', v_idempotency_key_grant);
      ELSE
        RAISE LOG '[true_up_user] User % has already received an initial token grant of type CREDIT_INITIAL_FREE_ALLOCATION. Skipping.', p_user_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING '[true_up_user] Error during token grant for user %: %', p_user_id, SQLERRM;
    END;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

create policy "Allow read access to active providers"
on "public"."ai_providers"
as permissive
for select
to authenticated
using ((is_active = true));


create policy "Consolidated update policy for chat messages"
on "public"."chat_messages"
as permissive
for update
to authenticated
using ((can_select_chat(chat_id) OR (EXISTS ( SELECT 1
   FROM chats
  WHERE ((chats.id = chat_messages.chat_id) AND (chats.user_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT auth.uid() AS uid) = user_id)))
with check ((can_select_chat(chat_id) OR (EXISTS ( SELECT 1
   FROM chats
  WHERE ((chats.id = chat_messages.chat_id) AND (chats.user_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT auth.uid() AS uid) = user_id)));


create policy "Consolidated insert policy for chats"
on "public"."chats"
as permissive
for insert
to authenticated
with check ((((organization_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((organization_id IS NOT NULL) AND check_org_chat_creation_permission(organization_id, ( SELECT auth.uid() AS uid)))));


create policy "Consolidated select policy for dialectic_feedback"
on "public"."dialectic_feedback"
as permissive
for select
to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM dialectic_projects dp
  WHERE ((dp.id = dialectic_feedback.project_id) AND (dp.user_id = ( SELECT auth.uid() AS uid)))))));


create policy "Consolidated select policy for invites"
on "public"."invites"
as permissive
for select
to authenticated
using (((( SELECT auth.uid() AS uid) = invited_user_id) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id, ( SELECT auth.uid() AS uid), 'active'::text)) OR (invited_email = ( SELECT (auth.jwt() ->> 'email'::text)))));


create policy "Consolidated update policy for invites"
on "public"."invites"
as permissive
for update
to authenticated
using ((((status = 'pending'::text) AND (( SELECT auth.uid() AS uid) = invited_user_id)) OR ((status = 'pending'::text) AND (organization_id IS NOT NULL) AND is_org_admin(organization_id))));


create policy "Allow users to read their own subscription transactions"
on "public"."subscription_transactions"
as permissive
for select
to authenticated
using ((user_subscription_id IN ( SELECT user_subscriptions.id
   FROM user_subscriptions
  WHERE (user_subscriptions.user_id = auth.uid()))));


create policy "Allow read access to active system prompts"
on "public"."system_prompts"
as permissive
for select
to authenticated
using ((is_active = true));


create policy "Disallow updates to token wallets"
on "public"."token_wallets"
as permissive
for update
to authenticated
using (false)
with check (false);


create policy "Allow org admins and chat owners to delete chats"
on "public"."chats"
as permissive
for delete
to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR ((organization_id IS NOT NULL) AND is_org_admin(organization_id))));


create policy "Allow org admins and chat owners to update chats"
on "public"."chats"
as permissive
for update
to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR ((organization_id IS NOT NULL) AND is_org_admin(organization_id))));


create policy "Allow org members/admins and chat owners to select chats"
on "public"."chats"
as permissive
for select
to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id, ( SELECT auth.uid() AS uid), 'active'::text))));


create policy "Users can manage contributions for projects they own"
on "public"."dialectic_contributions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM (dialectic_sessions ds
     JOIN dialectic_projects dp ON ((ds.project_id = dp.id)))
  WHERE ((ds.id = dialectic_contributions.session_id) AND (dp.user_id = ( SELECT auth.uid() AS uid))))))
with check ((EXISTS ( SELECT 1
   FROM (dialectic_sessions ds
     JOIN dialectic_projects dp ON ((ds.project_id = dp.id)))
  WHERE ((ds.id = dialectic_contributions.session_id) AND (dp.user_id = ( SELECT auth.uid() AS uid))))));


create policy "Users can manage their own project resources"
on "public"."dialectic_project_resources"
as permissive
for all
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "auth_users_manage_own_dialectic_projects"
on "public"."dialectic_projects"
as permissive
for all
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can manage sessions for projects they own"
on "public"."dialectic_sessions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM dialectic_projects dp
  WHERE ((dp.id = dialectic_sessions.project_id) AND (dp.user_id = ( SELECT auth.uid() AS uid))))));


create policy "Allow user SELECT access to their own notifications"
on "public"."notifications"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Allow user UPDATE access for their own notifications"
on "public"."notifications"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Allow authenticated users to select their own payment transacti"
on "public"."payment_transactions"
as permissive
for select
to authenticated
using (((( SELECT auth.uid() AS uid) = user_id) OR ((organization_id IS NOT NULL) AND is_org_admin(organization_id))));


create policy "Allow authenticated users to select their own wallet transactio"
on "public"."token_wallet_transactions"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM token_wallets w
  WHERE ((w.wallet_id = token_wallet_transactions.wallet_id) AND ((w.user_id = ( SELECT auth.uid() AS uid)) OR ((w.organization_id IS NOT NULL) AND is_org_admin(w.organization_id)))))));


create policy "Allow individual insert access"
on "public"."user_subscriptions"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Allow individual read access"
on "public"."user_subscriptions"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Allow individual update access"
on "public"."user_subscriptions"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



revoke delete on table "supabase_functions"."hooks" from "anon";

revoke insert on table "supabase_functions"."hooks" from "anon";

revoke references on table "supabase_functions"."hooks" from "anon";

revoke select on table "supabase_functions"."hooks" from "anon";

revoke trigger on table "supabase_functions"."hooks" from "anon";

revoke truncate on table "supabase_functions"."hooks" from "anon";

revoke update on table "supabase_functions"."hooks" from "anon";

revoke delete on table "supabase_functions"."hooks" from "authenticated";

revoke insert on table "supabase_functions"."hooks" from "authenticated";

revoke references on table "supabase_functions"."hooks" from "authenticated";

revoke select on table "supabase_functions"."hooks" from "authenticated";

revoke trigger on table "supabase_functions"."hooks" from "authenticated";

revoke truncate on table "supabase_functions"."hooks" from "authenticated";

revoke update on table "supabase_functions"."hooks" from "authenticated";

revoke delete on table "supabase_functions"."hooks" from "postgres";

revoke insert on table "supabase_functions"."hooks" from "postgres";

revoke references on table "supabase_functions"."hooks" from "postgres";

revoke select on table "supabase_functions"."hooks" from "postgres";

revoke trigger on table "supabase_functions"."hooks" from "postgres";

revoke truncate on table "supabase_functions"."hooks" from "postgres";

revoke update on table "supabase_functions"."hooks" from "postgres";

revoke delete on table "supabase_functions"."hooks" from "service_role";

revoke insert on table "supabase_functions"."hooks" from "service_role";

revoke references on table "supabase_functions"."hooks" from "service_role";

revoke select on table "supabase_functions"."hooks" from "service_role";

revoke trigger on table "supabase_functions"."hooks" from "service_role";

revoke truncate on table "supabase_functions"."hooks" from "service_role";

revoke update on table "supabase_functions"."hooks" from "service_role";

revoke delete on table "supabase_functions"."migrations" from "anon";

revoke insert on table "supabase_functions"."migrations" from "anon";

revoke references on table "supabase_functions"."migrations" from "anon";

revoke select on table "supabase_functions"."migrations" from "anon";

revoke trigger on table "supabase_functions"."migrations" from "anon";

revoke truncate on table "supabase_functions"."migrations" from "anon";

revoke update on table "supabase_functions"."migrations" from "anon";

revoke delete on table "supabase_functions"."migrations" from "authenticated";

revoke insert on table "supabase_functions"."migrations" from "authenticated";

revoke references on table "supabase_functions"."migrations" from "authenticated";

revoke select on table "supabase_functions"."migrations" from "authenticated";

revoke trigger on table "supabase_functions"."migrations" from "authenticated";

revoke truncate on table "supabase_functions"."migrations" from "authenticated";

revoke update on table "supabase_functions"."migrations" from "authenticated";

revoke delete on table "supabase_functions"."migrations" from "postgres";

revoke insert on table "supabase_functions"."migrations" from "postgres";

revoke references on table "supabase_functions"."migrations" from "postgres";

revoke select on table "supabase_functions"."migrations" from "postgres";

revoke trigger on table "supabase_functions"."migrations" from "postgres";

revoke truncate on table "supabase_functions"."migrations" from "postgres";

revoke update on table "supabase_functions"."migrations" from "postgres";

revoke delete on table "supabase_functions"."migrations" from "service_role";

revoke insert on table "supabase_functions"."migrations" from "service_role";

revoke references on table "supabase_functions"."migrations" from "service_role";

revoke select on table "supabase_functions"."migrations" from "service_role";

revoke trigger on table "supabase_functions"."migrations" from "service_role";

revoke truncate on table "supabase_functions"."migrations" from "service_role";

revoke update on table "supabase_functions"."migrations" from "service_role";

drop function if exists "supabase_functions"."http_request"();

alter table "supabase_functions"."hooks" drop constraint "hooks_pkey";

alter table "supabase_functions"."migrations" drop constraint "migrations_pkey";

drop index if exists "supabase_functions"."hooks_pkey";

drop index if exists "supabase_functions"."migrations_pkey";

drop index if exists "supabase_functions"."supabase_functions_hooks_h_table_id_h_name_idx";

drop index if exists "supabase_functions"."supabase_functions_hooks_request_id_idx";

drop table "supabase_functions"."hooks";

drop table "supabase_functions"."migrations";

drop sequence if exists "supabase_functions"."hooks_id_seq";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION supabase_functions.http_request(url text, method text, headers jsonb, timeout integer, body jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    response jsonb;
BEGIN
    -- Logic to perform the HTTP request
    -- This is a placeholder; you will need to implement the actual HTTP request logic
    RAISE NOTICE 'HTTP Request to % with method %', url, method;
    -- You can use an extension like `http` to perform the request if available
    -- response := http.request(method, url, headers, body);
END;
$function$
;


