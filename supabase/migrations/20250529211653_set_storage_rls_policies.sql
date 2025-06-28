-- Supabase Storage RLS Policies for bucket: dialectic-contributions
--
-- IMPORTANT:
-- These policies are typically configured via the Supabase Dashboard (Storage -> [bucket] -> Policies)
-- or programmatically using the Supabase Management API.
-- This SQL file serves as documentation for the intended policies.
-- Direct manipulation of storage RLS tables (e.g., storage.policies) via SQL migrations is NOT recommended.

-- ------------------------------------------------------------------------------------
-- Bucket Name: dialectic-contributions
-- ------------------------------------------------------------------------------------

-- Policy 1: Allow full access for service_role
-- Description: Gives the service_role (used by Edge Functions and other backend processes)
--              unrestricted ability to read, write, update, and delete files.
-- Supabase Dashboard Configuration:
--   Policy Name: "Service Role Full Access" (or similar)
--   Allowed operation(s): SELECT, INSERT, UPDATE, DELETE
--   Target role(s): service_role
--   USING expression: true
--   WITH CHECK expression: true

-- Policy 2: Disallow direct file uploads (INSERT) by authenticated users
-- Description: Prevents authenticated users from directly uploading files to the bucket.
--              Uploads should be handled by backend functions (e.g., dialectic-service)
--              which operate with service_role privileges.
-- Supabase Dashboard Configuration:
--   Policy Name: "Disallow Authenticated Direct Uploads" (or similar)
--   Allowed operation(s): INSERT
--   Target role(s): authenticated
--   USING expression: false
--   WITH CHECK expression: false

-- Policy 3: Disallow direct file downloads (SELECT) by authenticated users
-- Description: Prevents authenticated users from directly listing or downloading files.
--              Downloads will be facilitated by backend functions generating time-limited
--              signed URLs for specific files.
-- Supabase Dashboard Configuration:
--   Policy Name: "Disallow Authenticated Direct Downloads" (or similar)
--   Allowed operation(s): SELECT
--   Target role(s): authenticated
--   USING expression: false
--   WITH CHECK expression: (Not applicable for SELECT)

-- Policy 4: Disallow direct file updates (UPDATE) by authenticated users
-- Description: Prevents authenticated users from directly modifying files.
--              Updates, if any, should be managed by backend logic.
-- Supabase Dashboard Configuration:
--   Policy Name: "Disallow Authenticated Direct Updates" (or similar)
--   Allowed operation(s): UPDATE
--   Target role(s): authenticated
--   USING expression: false
--   WITH CHECK expression: false

-- Policy 5: Disallow direct file deletions (DELETE) by authenticated users
-- Description: Prevents authenticated users from directly deleting files.
--              Deletions should be managed by backend logic (e.g., when a contribution record is deleted).
-- Supabase Dashboard Configuration:
--   Policy Name: "Disallow Authenticated Direct Deletes" (or similar)
--   Allowed operation(s): DELETE
--   Target role(s): authenticated
--   USING expression: false
--   WITH CHECK expression: (Not applicable for DELETE without a USING expression for selection)

-- Note on Anonymous Users (anon role):
-- By not creating any permissive policies for the 'anon' role, anonymous users will have
-- no access to the 'dialectic-contributions' bucket, which is the desired behavior.

-- Note on policy evaluation:
-- Supabase Storage RLS policies are checked in order. If a user belongs to multiple roles,
-- policies are combined. A permissive policy (USING true) for a more privileged role
-- (like service_role) will typically override restrictive policies for less privileged roles
-- for users/contexts operating under that privileged role.
