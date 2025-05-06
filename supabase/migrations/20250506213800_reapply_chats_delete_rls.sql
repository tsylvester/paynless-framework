-- Re-apply RLS DELETE policy for public.chats table
-- Ensures the policy restricting deletes to owners or org admins is active.

-- Drop the existing policy if it exists
DROP POLICY IF EXISTS "Allow org admins and chat owners to delete chats" ON public.chats;

-- Re-create the DELETE policy
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

-- No DOWN migration needed for this re-application. 