-- This migration fixes a number of performance and security warnings from the Supabase linter.

-- 1. Fix RLS performance issues (auth_rls_initplan)
-- Wrap auth function calls in (SELECT ...) to ensure they are evaluated only once per query.

-- Policies for chat_messages
DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
CREATE POLICY "Users can update their own messages"
ON public.chat_messages FOR UPDATE TO authenticated USING (((SELECT auth.uid()) = user_id))
WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update message status" ON public.chat_messages;
CREATE POLICY "Users can update message status"
ON public.chat_messages FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = (SELECT auth.uid())
)) WITH CHECK (EXISTS (
    SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = (SELECT auth.uid())
));

-- Policies for invites
DROP POLICY IF EXISTS "Invited user select access for pending invites" ON public.invites;
CREATE POLICY "Invited user select access for pending invites"
ON public.invites FOR SELECT TO authenticated USING (
    (SELECT auth.jwt() ->> 'email') = invited_email AND status = 'pending'
);

DROP POLICY IF EXISTS "Invited user update access for pending invites" ON public.invites;
CREATE POLICY "Invited user update access for pending invites"
ON public.invites FOR UPDATE TO authenticated USING (
    (SELECT auth.jwt() ->> 'email') = invited_email AND status = 'pending'
) WITH CHECK (
    (SELECT auth.jwt() ->> 'email') = invited_email
);

-- Policies for user_profiles
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow profile read based on privacy, shared org, or ownership" ON public.user_profiles;
DROP POLICY IF EXISTS "Consolidated read policy for user profiles" ON public.user_profiles;
CREATE POLICY "Consolidated read policy for user profiles" ON public.user_profiles FOR SELECT
TO authenticated
USING (
    ((SELECT auth.uid()) = user_profiles.id) OR
    (profile_privacy_setting = 'public') OR
    (profile_privacy_setting = 'private' AND (SELECT auth.uid()) = user_profiles.id) OR
    (EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = (SELECT auth.uid()) AND om2.user_id = user_profiles.id AND om1.status = 'active' AND om2.status = 'active'
    ))
);

DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;
CREATE POLICY "Allow individual update access"
ON public.user_profiles FOR UPDATE TO authenticated USING (((SELECT auth.uid()) = id))
WITH CHECK (((SELECT auth.uid()) = id));

DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_profiles;
CREATE POLICY "Allow individual insert access"
ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (((SELECT auth.uid()) = id));

-- Policies for notifications
DROP POLICY IF EXISTS "Allow user SELECT access to their own notifications" ON public.notifications;
CREATE POLICY "Allow user SELECT access to their own notifications"
ON public.notifications FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Allow user UPDATE access for their own notifications" ON public.notifications;
CREATE POLICY "Allow user UPDATE access for their own notifications"
ON public.notifications FOR UPDATE TO authenticated USING (((SELECT auth.uid()) = user_id))
WITH CHECK (((SELECT auth.uid()) = user_id));

-- Policies for organizations
DROP POLICY IF EXISTS "Allow authenticated users to create organizations" ON public.organizations;
CREATE POLICY "Allow authenticated users to create organizations"
ON public.organizations FOR INSERT TO authenticated WITH CHECK (((SELECT auth.role()) = 'authenticated'));

-- Policies for payment_transactions
DROP POLICY IF EXISTS "Allow authenticated users to select their own payment transacti" ON public.payment_transactions;
CREATE POLICY "Allow authenticated users to select their own payment transacti"
ON public.payment_transactions FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));

-- Policies for dialectic_project_resources
DROP POLICY IF EXISTS "Users can manage their own project resources" ON public.dialectic_project_resources;
CREATE POLICY "Users can manage their own project resources"
ON public.dialectic_project_resources FOR ALL TO authenticated USING (((SELECT auth.uid()) = user_id))
WITH CHECK (((SELECT auth.uid()) = user_id));

-- Policies for dialectic_sessions
DROP POLICY IF EXISTS "Users can manage sessions for projects they own" ON public.dialectic_sessions;
CREATE POLICY "Users can manage sessions for projects they own"
ON public.dialectic_sessions FOR ALL TO authenticated USING ((
    EXISTS (SELECT 1 FROM public.dialectic_projects dp WHERE dp.id = dialectic_sessions.project_id AND dp.user_id = (SELECT auth.uid()))
));

-- Policies for dialectic_contributions
DROP POLICY IF EXISTS "Users can manage contributions for projects they own" ON public.dialectic_contributions;
CREATE POLICY "Users can manage contributions for projects they own"
ON public.dialectic_contributions FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROM public.dialectic_sessions ds
        JOIN public.dialectic_projects dp ON ds.project_id = dp.id
        WHERE ds.id = dialectic_contributions.session_id
        AND dp.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.dialectic_sessions ds
        JOIN public.dialectic_projects dp ON ds.project_id = dp.id
        WHERE ds.id = dialectic_contributions.session_id
        AND dp.user_id = (SELECT auth.uid())
    )
);

-- Policies for dialectic_projects
DROP POLICY IF EXISTS "auth_users_manage_own_dialectic_projects" ON public.dialectic_projects;
CREATE POLICY "auth_users_manage_own_dialectic_projects"
ON public.dialectic_projects FOR ALL TO authenticated USING (((SELECT auth.uid()) = user_id))
WITH CHECK (((SELECT auth.uid()) = user_id));

-- Policies for dialectic_feedback
DROP POLICY IF EXISTS "Users can manage their own feedback" ON public.dialectic_feedback;
CREATE POLICY "Users can manage their own feedback"
ON public.dialectic_feedback FOR ALL TO authenticated USING (((SELECT auth.uid()) = user_id))
WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Project owners can view all feedback in their projects" ON public.dialectic_feedback;
CREATE POLICY "Project owners can view all feedback in their projects"
ON public.dialectic_feedback FOR SELECT TO authenticated USING ((
    EXISTS (SELECT 1 FROM public.dialectic_projects dp WHERE dp.id = dialectic_feedback.project_id AND dp.user_id = (SELECT auth.uid()))
));

-- 2. Fix multiple permissive policies
-- Consolidate multiple policies into a single policy for each table and action.

-- Policies for ai_providers
DROP POLICY IF EXISTS "Allow public read access to active providers" ON public.ai_providers;
DROP POLICY IF EXISTS "Allow authenticated read access to active providers" ON public.ai_providers;
DROP POLICY IF EXISTS "Allow read access to active providers" ON public.ai_providers;
CREATE POLICY "Allow read access to active providers" ON public.ai_providers FOR SELECT
TO authenticated
USING (is_active = true);

-- Policies for chat_messages
DROP POLICY IF EXISTS "Allow users to update messages in accessible chats" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update message status" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Consolidated update policy for chat messages" ON public.chat_messages;
CREATE POLICY "Consolidated update policy for chat messages" ON public.chat_messages FOR UPDATE
TO authenticated
USING (
    public.can_select_chat(chat_id) OR
    (EXISTS (SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = (SELECT auth.uid()))) OR
    ((SELECT auth.uid()) = user_id)
)
WITH CHECK (
    public.can_select_chat(chat_id) OR
    (EXISTS (SELECT 1 FROM chats WHERE chats.id = chat_messages.chat_id AND chats.user_id = (SELECT auth.uid()))) OR
    ((SELECT auth.uid()) = user_id)
);

-- Policies for chats
DROP POLICY IF EXISTS "Allow permitted users to insert organizational chats" ON public.chats;
DROP POLICY IF EXISTS "Allow users to insert personal chats" ON public.chats;
DROP POLICY IF EXISTS "Consolidated insert policy for chats" ON public.chats;
CREATE POLICY "Consolidated insert policy for chats" ON public.chats FOR INSERT
TO authenticated
WITH CHECK (
    (organization_id IS NULL AND user_id = (SELECT auth.uid())) OR
    (organization_id IS NOT NULL AND public.check_org_chat_creation_permission(organization_id, (SELECT auth.uid())))
);

-- Policies for dialectic_feedback
DROP POLICY IF EXISTS "Project owners can view all feedback in their projects" ON public.dialectic_feedback;
DROP POLICY IF EXISTS "Users can manage their own feedback" ON public.dialectic_feedback;
DROP POLICY IF EXISTS "Consolidated select policy for dialectic_feedback" ON public.dialectic_feedback;
CREATE POLICY "Consolidated select policy for dialectic_feedback" ON public.dialectic_feedback FOR SELECT
TO authenticated
USING (
    ((SELECT auth.uid()) = user_id) OR
    (EXISTS (SELECT 1 FROM public.dialectic_projects dp WHERE dp.id = dialectic_feedback.project_id AND dp.user_id = (SELECT auth.uid())))
);

-- Policies for invites
DROP POLICY IF EXISTS "Admin SELECT access for organization invites" ON public.invites;
DROP POLICY IF EXISTS "Invited user select access for pending invites" ON public.invites;
DROP POLICY IF EXISTS "Consolidated select policy for invites" ON public.invites;
CREATE POLICY "Consolidated select policy for invites" ON public.invites FOR SELECT
TO authenticated
USING (
    (public.is_org_admin(organization_id)) OR
    ((SELECT auth.jwt() ->> 'email') = invited_email AND status = 'pending')
);

DROP POLICY IF EXISTS "Admin UPDATE access for organization invites" ON public.invites;
DROP POLICY IF EXISTS "Invited user update access for pending invites" ON public.invites;
DROP POLICY IF EXISTS "Consolidated update policy for invites" ON public.invites;
CREATE POLICY "Consolidated update policy for invites" ON public.invites FOR UPDATE
TO authenticated
USING (
    (public.is_org_admin(organization_id)) OR
    ((SELECT auth.jwt() ->> 'email') = invited_email AND status = 'pending')
)
WITH CHECK (
    (public.is_org_admin(organization_id)) OR
    ((SELECT auth.jwt() ->> 'email') = invited_email)
);

-- Policies for payment_transactions
DROP POLICY IF EXISTS "Allow organization admins to select their organization's paymen" ON public.payment_transactions;
DROP POLICY IF EXISTS "Allow authenticated users to select their own payment transacti" ON public.payment_transactions;
DROP POLICY IF EXISTS "Allow authenticated users to select their own payment transactions" ON public.payment_transactions;
CREATE POLICY "Allow authenticated users to select their own payment transactions"
ON public.payment_transactions FOR SELECT TO authenticated USING (
    ((SELECT auth.uid()) = user_id) OR
    (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
);

-- Policies for subscription_transactions
DROP POLICY IF EXISTS "Allow service_role access" ON public.subscription_transactions;
DROP POLICY IF EXISTS "Deny access to non-service roles" ON public.subscription_transactions;
DROP POLICY IF EXISTS "Allow service_role and deny others" ON public.subscription_transactions;
CREATE POLICY "Allow service_role and deny others" ON public.subscription_transactions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policies for system_prompts
DROP POLICY IF EXISTS "Allow public read access to active prompts" ON public.system_prompts;
DROP POLICY IF EXISTS "Allow authenticated users to read active system_prompts" ON public.system_prompts;
DROP POLICY IF EXISTS "Allow read access to active system prompts" ON public.system_prompts;
CREATE POLICY "Allow read access to active system prompts" ON public.system_prompts FOR SELECT
TO authenticated
USING (is_active = true);

-- Policies for token_wallet_transactions
DROP POLICY IF EXISTS "Allow organization admins to select their organization's wallet" ON public.token_wallet_transactions;
DROP POLICY IF EXISTS "Allow authenticated users to select their own wallet transactio" ON public.token_wallet_transactions;
DROP POLICY IF EXISTS "Allow authenticated users to select their own wallet transactions" ON public.token_wallet_transactions;
CREATE POLICY "Allow authenticated users to select their own wallet transactions"
ON public.token_wallet_transactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.token_wallets w
    WHERE w.wallet_id = token_wallet_transactions.wallet_id
      AND (
        w.user_id = (SELECT auth.uid()) OR
        (w.organization_id IS NOT NULL AND public.is_org_admin(w.organization_id))
      )
  )
);

-- Policies for token_wallets
DROP POLICY IF EXISTS "Disallow direct updates on wallets by users" ON public.token_wallets;
DROP POLICY IF EXISTS "Disallow direct updates to wallets by authenticated users" ON public.token_wallets;
DROP POLICY IF EXISTS "Disallow updates to token wallets" ON public.token_wallets;
CREATE POLICY "Disallow updates to token wallets" ON public.token_wallets FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow organization admins to select their organization wallets" ON public.token_wallets;
DROP POLICY IF EXISTS "Allow users to select their own user-specific wallets" ON public.token_wallets;
DROP POLICY IF EXISTS "Consolidated select policy for token wallets" ON public.token_wallets;
CREATE POLICY "Consolidated select policy for token wallets" ON public.token_wallets FOR SELECT
TO authenticated
USING (
    (user_id = (SELECT auth.uid()) AND organization_id IS NULL) OR
    (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
);

-- Policies for user_profiles
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile details" ON public.user_profiles;
DROP POLICY IF EXISTS "Consolidated update policy for user profiles" ON public.user_profiles;
CREATE POLICY "Consolidated update policy for user profiles" ON public.user_profiles FOR UPDATE
TO authenticated
USING (((SELECT auth.uid()) = user_profiles.id))
WITH CHECK (((SELECT auth.uid()) = user_profiles.id));

DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Consolidated insert policy for user profiles" ON public.user_profiles;
CREATE POLICY "Consolidated insert policy for user profiles" ON public.user_profiles FOR INSERT
TO authenticated
WITH CHECK (((SELECT auth.uid()) = id));


-- 3. Fix duplicate index
-- Drop the redundant index.
ALTER TABLE public.dialectic_project_resources DROP CONSTRAINT IF EXISTS unique_storage_path;


-- 4. Fix unindexed foreign keys
-- Add indexes to foreign key columns to improve query performance.

CREATE INDEX IF NOT EXISTS idx_chat_messages_ai_provider_id ON public.chat_messages(ai_provider_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_system_prompt_id ON public.chat_messages(system_prompt_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_system_prompt_id ON public.chats(system_prompt_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_contributions_prompt_template_id_used ON public.dialectic_contributions(prompt_template_id_used);
CREATE INDEX IF NOT EXISTS idx_dialectic_feedback_project_id ON public.dialectic_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_process_templates_starting_stage_id ON public.dialectic_process_templates(starting_stage_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_projects_process_template_id ON public.dialectic_projects(process_template_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_projects_selected_domain_id ON public.dialectic_projects(selected_domain_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_projects_user_id ON public.dialectic_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_projects_selected_domain_overlay_id ON public.dialectic_projects(selected_domain_overlay_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_projects_initial_prompt_resource_id ON public.dialectic_projects(initial_prompt_resource_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_sessions_current_stage_id ON public.dialectic_sessions(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_sessions_project_id ON public.dialectic_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_stage_transitions_source_stage_id ON public.dialectic_stage_transitions(source_stage_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_stage_transitions_target_stage_id ON public.dialectic_stage_transitions(target_stage_id);
CREATE INDEX IF NOT EXISTS idx_dialectic_stages_default_system_prompt_id ON public.dialectic_stages(default_system_prompt_id);
CREATE INDEX IF NOT EXISTS idx_domain_process_associations_process_template_id ON public.domain_process_associations(process_template_id);
CREATE INDEX IF NOT EXISTS idx_domain_specific_prompt_overlays_domain_id ON public.domain_specific_prompt_overlays(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_specific_prompt_overlays_system_prompt_id ON public.domain_specific_prompt_overlays(system_prompt_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_organization_id ON public.payment_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_target_wallet_id ON public.payment_transactions(target_wallet_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_wallet_transactions_payment_transaction_id ON public.token_wallet_transactions(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON public.user_subscriptions(plan_id);