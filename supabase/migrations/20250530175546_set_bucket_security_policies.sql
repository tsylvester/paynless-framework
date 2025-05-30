-- Enable RLS on the storage.objects table if not already enabled
-- (This is generally enabled by default by Supabase, but good to be explicit)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- It's usually better to assume RLS is enabled by default for storage.objects by Supabase
-- and let Supabase manage that global setting. Forcing it here might be redundant or
-- conflict if Supabase's internal setup changes.

-- Bucket Name: dialectic-contributions

-- Policy 1: Allow full access for service_role
CREATE POLICY "Service Role Full Access on dialectic-contributions"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'dialectic-contributions')
WITH CHECK (bucket_id = 'dialectic-contributions');

-- Policy 2: Disallow direct file uploads (INSERT) by authenticated users
CREATE POLICY "Disallow Authenticated Direct Uploads to dialectic-contributions"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dialectic-contributions' AND false);

-- Policy 3: Disallow direct file downloads/list (SELECT) by authenticated users
CREATE POLICY "Disallow Authenticated Direct Select from dialectic-contributions"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'dialectic-contributions' AND false);

-- Policy 4: Disallow direct file updates (UPDATE) by authenticated users
CREATE POLICY "Disallow Authenticated Direct Updates on dialectic-contributions"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'dialectic-contributions' AND false)
WITH CHECK (bucket_id = 'dialectic-contributions' AND false);

-- Policy 5: Disallow direct file deletions (DELETE) by authenticated users
CREATE POLICY "Disallow Authenticated Direct Deletes from dialectic-contributions"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'dialectic-contributions' AND false);
