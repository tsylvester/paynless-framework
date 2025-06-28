-- This migration fixes all outstanding Supabase linter warnings as of 2025-06-28
-- It addresses security, performance, and schema health issues.

-- 1. Fix mutable function search path (SECURITY)
-- The get_user_email function had a mutable search path, posing a security risk.
-- This first drops the old version and any dependent objects (CASCADE), then redefines it.
DROP FUNCTION IF EXISTS public.get_user_email(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' -- Explicitly set a secure search path
AS $$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = p_user_id);
END;
$$;
COMMENT ON FUNCTION public.get_user_email(uuid) IS 'Retrieves a user''s email by their UUID. SECURITY DEFINER is used to bypass RLS.';


-- 2. Fix RLS performance issues (auth_rls_initplan) (PERFORMANCE)
-- The following policies were re-evaluating auth functions for each row, causing
-- poor performance. They are updated to wrap auth calls in (SELECT ...).

-- Table: public.user_subscriptions
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_subscriptions;
CREATE POLICY "Allow individual read access" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_subscriptions;
CREATE POLICY "Allow individual insert access" ON public.user_subscriptions
  FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Allow individual update access" ON public.user_subscriptions;
CREATE POLICY "Allow individual update access" ON public.user_subscriptions
  FOR UPDATE TO authenticated USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

-- Table: public.organizations
DROP POLICY IF EXISTS "Allow active members to view their non-deleted organizations" ON public.organizations;
CREATE POLICY "Allow active members to view their non-deleted organizations" ON public.organizations
  FOR SELECT TO authenticated USING (
    deleted_at IS NULL AND public.is_org_admin(id)
  );

DROP POLICY IF EXISTS "Allow admins to update their non-deleted organizations" ON public.organizations;
CREATE POLICY "Allow admins to update their non-deleted organizations" ON public.organizations
  FOR UPDATE TO authenticated USING (
    deleted_at IS NULL AND public.is_org_admin(id)
  ) WITH CHECK (deleted_at IS NULL);

-- Table: public.organization_members
DROP POLICY IF EXISTS "Allow active members to view memberships in their orgs" ON public.organization_members;
CREATE POLICY "Allow active members to view memberships in their orgs" ON public.organization_members
    FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Allow admins to insert new members" ON public.organization_members;
CREATE POLICY "Allow admins to insert new members" ON public.organization_members
    FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Allow admins or self to update memberships" ON public.organization_members;
CREATE POLICY "Allow admins or self to update memberships" ON public.organization_members
    FOR UPDATE TO authenticated USING (
      (public.is_org_admin(organization_id)) OR ((SELECT auth.uid()) = user_id)
    ) WITH CHECK (
      (public.is_org_admin(organization_id)) OR ((SELECT auth.uid()) = user_id)
    );

-- Table: public.chats
DROP POLICY IF EXISTS "Allow org members/admins and chat owners to select chats" ON public.chats;
CREATE POLICY "Allow org members/admins and chat owners to select chats" ON public.chats
    FOR SELECT TO authenticated USING (
        ((SELECT auth.uid()) = user_id) OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id, (SELECT auth.uid()), 'active'))
    );

DROP POLICY IF EXISTS "Allow org admins and chat owners to update chats" ON public.chats;
CREATE POLICY "Allow org admins and chat owners to update chats" ON public.chats
    FOR UPDATE TO authenticated USING (
        ((SELECT auth.uid()) = user_id) OR
        (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    );

DROP POLICY IF EXISTS "Allow org admins and chat owners to delete chats" ON public.chats;
CREATE POLICY "Allow org admins and chat owners to delete chats" ON public.chats
    FOR DELETE TO authenticated USING (
        ((SELECT auth.uid()) = user_id) OR
        (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    );

-- Table: public.chat_messages
DROP POLICY IF EXISTS "Allow users to insert messages in accessible chats with role ch" ON public.chat_messages;
CREATE POLICY "Allow users to insert messages in accessible chats with role ch" ON public.chat_messages
    FOR INSERT TO authenticated WITH CHECK (
        (role = 'user' AND (SELECT auth.uid()) = user_id) AND
        (EXISTS (
            SELECT 1 FROM public.chats c
            WHERE c.id = chat_id AND (
                c.user_id = (SELECT auth.uid()) OR
                (c.organization_id IS NOT NULL AND public.is_org_member(c.organization_id, (SELECT auth.uid()), 'active'))
            )
        ))
    );

-- Table: public.token_wallets
-- The linter flagged policies on this table, but they are for service_role,
-- which doesn't benefit from the (SELECT...) optimization as it bypasses RLS.
-- No changes needed for these specific policies.
-- "Allow service_role to delete wallets"
-- "Allow service_role to insert wallets"

-- Table: public.invites
DROP POLICY IF EXISTS "Consolidated select policy for invites" ON public.invites;
CREATE POLICY "Consolidated select policy for invites" ON public.invites
    FOR SELECT TO authenticated USING (
        ((SELECT auth.uid()) = invited_user_id) OR
        (organization_id IS NOT NULL AND public.is_org_member(organization_id, (SELECT auth.uid()), 'active')) OR
        (invited_email = (SELECT auth.jwt() ->> 'email'))
    );

DROP POLICY IF EXISTS "Consolidated update policy for invites" ON public.invites;
CREATE POLICY "Consolidated update policy for invites" ON public.invites
    FOR UPDATE TO authenticated USING (
        (status = 'pending' AND (SELECT auth.uid()) = invited_user_id) OR
        (status = 'pending' AND organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    );


-- 3. Remove Duplicate Indexes (PERFORMANCE)
ALTER TABLE public.system_prompts DROP CONSTRAINT IF EXISTS system_prompts_name_unique;
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_unique;


-- 4. Add Missing Indexes for Foreign Keys (PERFORMANCE)
CREATE INDEX IF NOT EXISTS idx_dialectic_domains_parent_domain_id ON public.dialectic_domains(parent_domain_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_stage_transitions_process_template_id ON public.dialectic_stage_transitions(process_template_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_user_subscription_id ON public.subscription_transactions(user_subscription_id);
