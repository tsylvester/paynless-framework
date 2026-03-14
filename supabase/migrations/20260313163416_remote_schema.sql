drop policy "Allow authenticated read access to active providers" on "public"."ai_providers";

drop policy "Allow users to update messages in accessible chats" on "public"."chat_messages";

drop policy "Users can update message status" on "public"."chat_messages";

drop policy "Users can update their own messages" on "public"."chat_messages";

drop policy "Allow permitted users to insert organizational chats" on "public"."chats";

drop policy "Allow users to insert personal chats" on "public"."chats";

drop policy "Project owners can view all feedback in their projects" on "public"."dialectic_feedback";

drop policy "Users can manage their own feedback" on "public"."dialectic_feedback";

drop policy "github_connections_delete_own" on "public"."github_connections";

drop policy "github_connections_select_own" on "public"."github_connections";

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

revoke delete on table "public"."github_connections" from "anon";

revoke insert on table "public"."github_connections" from "anon";

revoke references on table "public"."github_connections" from "anon";

revoke select on table "public"."github_connections" from "anon";

revoke trigger on table "public"."github_connections" from "anon";

revoke truncate on table "public"."github_connections" from "anon";

revoke update on table "public"."github_connections" from "anon";

revoke delete on table "public"."github_connections" from "authenticated";

revoke insert on table "public"."github_connections" from "authenticated";

revoke references on table "public"."github_connections" from "authenticated";

revoke select on table "public"."github_connections" from "authenticated";

revoke trigger on table "public"."github_connections" from "authenticated";

revoke truncate on table "public"."github_connections" from "authenticated";

revoke update on table "public"."github_connections" from "authenticated";

revoke delete on table "public"."github_connections" from "service_role";

revoke insert on table "public"."github_connections" from "service_role";

revoke references on table "public"."github_connections" from "service_role";

revoke select on table "public"."github_connections" from "service_role";

revoke trigger on table "public"."github_connections" from "service_role";

revoke truncate on table "public"."github_connections" from "service_role";

revoke update on table "public"."github_connections" from "service_role";

alter table "public"."github_connections" drop constraint "github_connections_installation_id_key";

alter table "public"."github_connections" drop constraint "github_connections_installation_target_type_check";

alter table "public"."github_connections" drop constraint "github_connections_user_id_fkey";

alter table "public"."github_connections" drop constraint "github_connections_user_id_key";

alter table "public"."system_prompts" drop constraint "system_prompts_name_unique";

alter table "public"."token_wallet_transactions" drop constraint "token_wallet_transactions_recorded_by_user_id_fkey";

alter table "public"."user_subscriptions" drop constraint "user_subscriptions_user_id_unique";

alter table "public"."github_connections" drop constraint "github_connections_pkey";

drop index if exists "public"."github_connections_installation_id_key";

drop index if exists "public"."github_connections_pkey";

drop index if exists "public"."github_connections_user_id_key";

drop index if exists "public"."idx_token_wallet_transactions_wallet_id_timestamp";

drop index if exists "public"."system_prompts_name_unique";

drop index if exists "public"."user_subscriptions_user_id_unique";

drop table "public"."github_connections";

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


