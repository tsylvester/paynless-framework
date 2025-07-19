-- Phase 1, Step 1: Add boolean columns to the user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN is_subscribed_to_newsletter BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN has_seen_welcome_modal BOOLEAN NOT NULL DEFAULT FALSE;

-- Phase 1, Step 2: Update RLS policy to allow users to update the new columns.
-- We drop the existing policy and recreate it to include the new fields in the update permission.
DROP POLICY IF EXISTS "Allow individual update access" ON public.user_profiles;

CREATE POLICY "Allow individual update access"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
);
