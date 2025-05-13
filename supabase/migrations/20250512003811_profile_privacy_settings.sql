-- Add the profile_privacy_setting column to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN profile_privacy_setting TEXT NOT NULL DEFAULT 'private';

-- Add a CHECK constraint for allowed privacy values
-- We include 'members_only' for potential future use, though the UI will initially only offer 'public' and 'private'.
ALTER TABLE public.user_profiles
ADD CONSTRAINT check_profile_privacy_setting
CHECK (profile_privacy_setting IN ('private', 'public', 'members_only'));

-- Ensure Row Level Security is enabled on the table
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles table

-- Drop the existing general permissive SELECT policy if it exists
-- The name "Allow authenticated read access" was mentioned in prior discussions.
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.user_profiles;

-- Drop any potentially conflicting specific SELECT policies for user profiles (e.g., only own profile)
DROP POLICY IF EXISTS "Users can read their own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Allow individuals to read their own public profile." ON public.user_profiles; -- common default

-- Create the new comprehensive RLS policy for SELECT operations
CREATE POLICY "Allow profile read based on privacy, shared org, or ownership"
ON public.user_profiles
FOR SELECT
USING (
    -- 1. Profile is set to 'public'
    (profile_privacy_setting = 'public') OR
    -- 2. Requesting user and target profile user share an active membership in at least one organization
    (EXISTS (
        SELECT 1
        FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om2.user_id = user_profiles.id AND om1.status = 'active' AND om2.status = 'active'
    )) OR
    -- 3. Users can always read their own profile
    (auth.uid() = user_profiles.id)
);

-- RLS policy for UPDATE operations
-- Drop common existing policies for updating own profile to replace with a single, clear one.
DROP POLICY IF EXISTS "Users can update their own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Allow individuals to update their own profile." ON public.user_profiles; -- common default

CREATE POLICY "Allow users to update their own profile details"
ON public.user_profiles
FOR UPDATE
USING (auth.uid() = id) -- Users can only update rows where their auth.uid matches the profile's id
WITH CHECK (auth.uid() = id); -- Enforces the same condition on the data being written

-- RLS policy for INSERT operations (standard policy, ensure it's in place)
DROP POLICY IF EXISTS "Users can create their own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Allow individuals to create their own profile." ON public.user_profiles; -- common default

CREATE POLICY "Allow users to insert their own profile"
ON public.user_profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Add an index for faster lookups on profile_privacy_setting
CREATE INDEX IF NOT EXISTS idx_user_profiles_privacy_setting ON public.user_profiles(profile_privacy_setting);
