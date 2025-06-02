-- Enable RLS for dialectic_session_prompts if not already (though your listing says it is)
-- ALTER TABLE public.dialectic_session_prompts ENABLE ROW LEVEL SECURITY;

-- POLICY: Users can SELECT prompts for sessions in their projects
CREATE POLICY "Users can select prompts for sessions in their projects"
ON public.dialectic_session_prompts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_prompts.session_id
    AND dp.user_id = auth.uid()
  )
);

-- POLICY: Users can INSERT prompts into sessions in their projects
CREATE POLICY "Users can insert prompts into sessions in their projects"
ON public.dialectic_session_prompts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_prompts.session_id
    AND dp.user_id = auth.uid()
  )
);

-- POLICY: Users can UPDATE prompts in sessions in their projects
CREATE POLICY "Users can update prompts in sessions in their projects"
ON public.dialectic_session_prompts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_prompts.session_id
    AND dp.user_id = auth.uid()
  )
)
WITH CHECK ( -- Also ensure they can't change the session_id to a session in a project they don't own
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_prompts.session_id
    AND dp.user_id = auth.uid()
  )
);

-- POLICY: Users can DELETE prompts in sessions in their projects
CREATE POLICY "Users can delete prompts in sessions in their projects"
ON public.dialectic_session_prompts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.dialectic_sessions ds
    JOIN public.dialectic_projects dp ON ds.project_id = dp.id
    WHERE ds.id = dialectic_session_prompts.session_id
    AND dp.user_id = auth.uid()
  )
);

-- Policies for ai_providers
-- Drop the existing public read policy
DROP POLICY IF EXISTS "Allow public read access to active providers" ON public.ai_providers;

-- Create new policy for authenticated users to read active providers
CREATE POLICY "Allow authenticated read access to active providers"
ON public.ai_providers
FOR SELECT
TO authenticated
USING (is_active = true);

-- Policies for chat_messages - Ensure explicit 'TO authenticated'

-- Policy: Allow users to update messages in accessible chats
DROP POLICY IF EXISTS "Allow users to update messages in accessible chats" ON public.chat_messages;
CREATE POLICY "Allow users to update messages in accessible chats"
ON public.chat_messages
FOR UPDATE
TO authenticated -- Explicitly added
USING (public.can_select_chat(chat_id))
WITH CHECK (public.can_select_chat(chat_id));

-- Policy: Allow users to delete messages in accessible chats
DROP POLICY IF EXISTS "Allow users to delete messages in accessible chats" ON public.chat_messages;
CREATE POLICY "Allow users to delete messages in accessible chats"
ON public.chat_messages
FOR DELETE
TO authenticated -- Explicitly added
USING (public.can_select_chat(chat_id));

-- Policy: Users can update their own messages
DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
CREATE POLICY "Users can update their own messages"
ON public.chat_messages
FOR UPDATE
TO authenticated -- Explicitly added
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update message status
DROP POLICY IF EXISTS "Users can update message status" ON public.chat_messages;
CREATE POLICY "Users can update message status"
ON public.chat_messages
FOR UPDATE
TO authenticated -- Explicitly added
USING (
    EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = chat_messages.chat_id
        AND chats.user_id = auth.uid()
    )
);

-- Policies for invites - Ensure explicit 'TO authenticated'

-- Policy: Admins can SELECT invites for their organization
DROP POLICY IF EXISTS "Admin SELECT access for organization invites" ON public.invites;
CREATE POLICY "Admin SELECT access for organization invites"
ON public.invites
FOR SELECT
TO authenticated -- Explicitly added
USING ( public.is_org_admin(organization_id) );

-- Policy: Admins can INSERT invites for their organization
DROP POLICY IF EXISTS "Admin INSERT access for organization invites" ON public.invites;
CREATE POLICY "Admin INSERT access for organization invites"
ON public.invites
FOR INSERT
TO authenticated -- Explicitly added
WITH CHECK ( public.is_org_admin(organization_id) );

-- Policy: Admins can UPDATE invites for their organization
DROP POLICY IF EXISTS "Admin UPDATE access for organization invites" ON public.invites;
CREATE POLICY "Admin UPDATE access for organization invites"
ON public.invites
FOR UPDATE
TO authenticated -- Explicitly added
USING ( public.is_org_admin(organization_id) )
WITH CHECK ( public.is_org_admin(organization_id) );

-- Policy: Admins can DELETE invites for their organization
DROP POLICY IF EXISTS "Admin DELETE access for organization invites" ON public.invites;
CREATE POLICY "Admin DELETE access for organization invites"
ON public.invites
FOR DELETE
TO authenticated -- Explicitly added
USING ( public.is_org_admin(organization_id) );

-- Policy: Invited users can see their own pending invites
DROP POLICY IF EXISTS "Invited user select access for pending invites" ON public.invites;
CREATE POLICY "Invited user select access for pending invites"
ON public.invites
FOR SELECT
TO authenticated -- Explicitly added
USING (
    auth.jwt() ->> 'email' = invited_email
    AND status = 'pending'
);

-- Policy: Invited users can update the status of their own pending invites
DROP POLICY IF EXISTS "Invited user update access for pending invites" ON public.invites;
CREATE POLICY "Invited user update access for pending invites"
ON public.invites
FOR UPDATE
TO authenticated -- Explicitly added
USING (
    auth.jwt() ->> 'email' = invited_email
    AND status = 'pending'
)
WITH CHECK (
    auth.jwt() ->> 'email' = invited_email
);

-- Policies for user_profiles - Ensure explicit 'TO authenticated'

-- Policy: Allow individual read access
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_profiles;
CREATE POLICY "Allow individual read access"
ON public.user_profiles
FOR SELECT
TO authenticated -- Explicitly added
USING (auth.uid() = id);

-- Policy: Allow individual update access
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;
CREATE POLICY "Allow individual update access"
ON public.user_profiles
FOR UPDATE
TO authenticated -- Explicitly added
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy: Allow individual insert access
DROP POLICY IF EXISTS "Allow individual insert access" ON public.user_profiles;
CREATE POLICY "Allow individual insert access"
ON public.user_profiles
FOR INSERT
TO authenticated -- Explicitly added
WITH CHECK (auth.uid() = id);

-- Policies for notifications - Ensure explicit 'TO authenticated'

-- Policy: Allow user SELECT access to their own notifications
DROP POLICY IF EXISTS "Allow user SELECT access to their own notifications" ON public.notifications;
CREATE POLICY "Allow user SELECT access to their own notifications"
ON public.notifications
FOR SELECT
TO authenticated -- Explicitly added
USING (auth.uid() = user_id);

-- Policy: Allow user UPDATE access for their own notifications
DROP POLICY IF EXISTS "Allow user UPDATE access for their own notifications" ON public.notifications;
CREATE POLICY "Allow user UPDATE access for their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated -- Explicitly added
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for subscription_transactions

-- Ensure RLS is enabled
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_transactions FORCE ROW LEVEL SECURITY; -- Good practice

-- Drop the potentially confusing existing policy
DROP POLICY IF EXISTS "Allow service_role access" ON public.subscription_transactions;

-- Create a clear "default deny" policy for all operations for any role subject to RLS.
-- service_role will bypass this.
CREATE POLICY "Deny access to non-service roles"
ON public.subscription_transactions
FOR ALL
TO public -- This applies to anon and authenticated
USING (false)
WITH CHECK (false);

-- Policies for token_wallets - Correct service_role INSERT/DELETE policies

-- Policy: Allow service_role to insert wallets
DROP POLICY IF EXISTS "Allow service_role to insert wallets" ON public.token_wallets;
CREATE POLICY "Allow service_role to insert wallets"
ON public.token_wallets
FOR INSERT
TO service_role -- Explicitly added
WITH CHECK (auth.role() = 'service_role'); -- Condition ensures it is the service_role

-- Policy: Allow service_role to delete wallets
DROP POLICY IF EXISTS "Allow service_role to delete wallets" ON public.token_wallets;
CREATE POLICY "Allow service_role to delete wallets"
ON public.token_wallets
FOR DELETE
TO service_role -- Explicitly added
USING (auth.role() = 'service_role'); -- Condition ensures it is the service_role

-- Policies for user_subscriptions - Ensure explicit 'TO authenticated' for SELECT

-- Policy: Allow individual read access to their own subscriptions
DROP POLICY IF EXISTS "Allow individual read access" ON public.user_subscriptions;
CREATE POLICY "Allow individual read access"
ON public.user_subscriptions
FOR SELECT
TO authenticated -- Explicitly added
USING (auth.uid() = user_id);
