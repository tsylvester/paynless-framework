-- Apply RLS policies for the public.chats table
-- Assumes helper functions (is_org_member, check_org_chat_creation_permission, is_org_admin) exist.

-- UP Migration

-- Ensure RLS is enabled on the table
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats FORCE ROW LEVEL SECURITY; -- Recommended for security

-- Drop original simple policies if they exist (idempotency)
DROP POLICY IF EXISTS "Allow users to select their own chats" ON public.chats;
DROP POLICY IF EXISTS "Allow users to insert their own chats" ON public.chats;
DROP POLICY IF EXISTS "Allow users to update their own chats" ON public.chats;
DROP POLICY IF EXISTS "Allow users to delete their own chats" ON public.chats;

-- Define INSERT policies FIRST

-- INSERT Policy 1: Allow inserting personal chats if user_id matches auth.uid()
DROP POLICY IF EXISTS "Allow users to insert personal chats" ON public.chats;
CREATE POLICY "Allow users to insert personal chats"
  ON public.chats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL AND user_id = auth.uid()
  );

-- INSERT Policy 2: Allow inserting organizational chats if user is permitted
DROP POLICY IF EXISTS "Allow permitted users to insert organizational chats" ON public.chats;
CREATE POLICY "Allow permitted users to insert organizational chats"
  ON public.chats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL AND
    user_id = auth.uid() AND -- Ensure user_id matches auth user
    public.check_org_chat_creation_permission(organization_id, auth.uid())
  );

-- Now define SELECT, UPDATE, DELETE policies

-- SELECT: Admins/Members can select any chat in their org. Users can select their own personal chats.
DROP POLICY IF EXISTS "Allow org members/admins and chat owners to select chats" ON public.chats;
CREATE POLICY "Allow org members/admins and chat owners to select chats"
  ON public.chats
  FOR SELECT
  TO authenticated
  USING (
    ( -- Case 1: Personal chat, user is the owner
      organization_id IS NULL AND auth.uid() = user_id
    )
    OR
    ( -- Case 2: Organizational chat, user is an active member/admin of the organization
      -- Using existing is_org_member function
      organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid(), 'active')
    )
  );

-- UPDATE: Admins can update any chat in their org. Owners can update their own personal chats.
DROP POLICY IF EXISTS "Allow org admins and chat owners to update chats" ON public.chats;
CREATE POLICY "Allow org admins and chat owners to update chats"
  ON public.chats
  FOR UPDATE
  TO authenticated
  USING (
    ( -- Case 1: Personal chat, user is the owner
      organization_id IS NULL AND auth.uid() = user_id
    )
    OR
    ( -- Case 2: Organizational chat, user is an admin
      organization_id IS NOT NULL AND public.is_org_admin(organization_id)
    )
  )
  WITH CHECK (
    ( -- Re-check permission based on USING clause
      ( -- Case 1 Check: Personal chat, user is the owner
        organization_id IS NULL AND user_id = auth.uid()
      )
      OR
      ( -- Case 2 Check: Organizational chat, user is an admin
        organization_id IS NOT NULL AND public.is_org_admin(organization_id)
      )
    )
  );

-- DELETE: Admins can delete any chat in their org. Owners can delete their own personal chats.
DROP POLICY IF EXISTS "Allow org admins and chat owners to delete chats" ON public.chats;
CREATE POLICY "Allow org admins and chat owners to delete chats"
  ON public.chats
  FOR DELETE
  TO authenticated
  USING (
    ( -- Case 1: Personal chat, user is the owner
      organization_id IS NULL AND auth.uid() = user_id
    )
    OR
    ( -- Case 2: Organizational chat, user is an admin
      organization_id IS NOT NULL AND public.is_org_admin(organization_id)
    )
  );

-- DOWN Migration logic removed as per project pattern.