-- Ensure uuid-ossp extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Fix user_id column: type, NOT NULL, FK to auth.users
-- Drop existing FK if it was to profiles.id instead of auth.users.id
-- (Based on types_db.ts, user_id is currently string and has no FK to auth.users)
-- WARNING: This assumes existing user_id values are valid UUIDs if the table has data.
ALTER TABLE public.dialectic_project_resources
    ALTER COLUMN user_id TYPE UUID USING user_id::uuid,
    ALTER COLUMN user_id SET NOT NULL;

-- Add Foreign Key constraint to auth.users(id)
-- Adding IF NOT EXISTS for the constraint name, though the ALTER TABLE ADD CONSTRAINT itself is not idempotent if constraint exists.
-- A more robust way is to check information_schema, but for a new "fix" migration this is usually okay.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_dialectic_project_resources_user_id'
        AND conrelid = 'public.dialectic_project_resources'::regclass
    ) THEN
        ALTER TABLE public.dialectic_project_resources
            ADD CONSTRAINT fk_dialectic_project_resources_user_id
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;


-- 2. Fix storage_bucket column: NOT NULL, DEFAULT
ALTER TABLE public.dialectic_project_resources
    ALTER COLUMN storage_bucket SET DEFAULT 'dialectic-contributions',
    ALTER COLUMN storage_bucket SET NOT NULL;

-- 3. Add UNIQUE constraint for (storage_bucket, storage_path)
-- Adding IF NOT EXISTS for the constraint name.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_dialectic_resource_storage_path'
        AND conrelid = 'public.dialectic_project_resources'::regclass
    ) THEN
        ALTER TABLE public.dialectic_project_resources
            ADD CONSTRAINT unique_dialectic_resource_storage_path UNIQUE (storage_bucket, storage_path);
    END IF;
END $$;

-- 4. Ensure updated_at trigger function and trigger are in place
-- Create the function if it doesn\'t exist (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;

-- Create the trigger if it doesn\'t exist for this table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_dialectic_project_resources_updated_at'
        AND tgrelid = 'public.dialectic_project_resources'::regclass
    ) THEN
        CREATE TRIGGER update_dialectic_project_resources_updated_at
        BEFORE UPDATE ON public.dialectic_project_resources
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.dialectic_project_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialectic_project_resources FORCE ROW LEVEL SECURITY; -- Ensures RLS applies to table owners too

-- 6. Create RLS policies

-- Allow service_role full access
DROP POLICY IF EXISTS "Allow service_role full access to project resources" ON public.dialectic_project_resources;
CREATE POLICY "Allow service_role full access to project resources"
    ON public.dialectic_project_resources
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to manage their own resources
DROP POLICY IF EXISTS "Users can manage their own project resources" ON public.dialectic_project_resources;
CREATE POLICY "Users can manage their own project resources"
    ON public.dialectic_project_resources
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- (Optional: If you need users to read resources of projects they are part of, but not necessarily own the resource itself)
-- This depends on how project membership/ownership is structured beyond the direct user_id on the resource.
-- For now, the above policy is based on direct resource ownership via user_id.

-- Grant usage on schema and select on dependent tables if RLS needs to check them
-- (e.g. if RLS had to join to dialectic_projects, but it doesn\'t with auth.uid() = user_id)
-- GRANT USAGE ON SCHEMA public TO supabase_auth_admin; -- Example
-- GRANT SELECT ON public.dialectic_projects TO supabase_auth_admin; -- Example

-- Ensure the postgres (superuser) role can bypass RLS for administrative tasks.
-- This is generally the default behavior but can be made explicit if needed.
-- Supabase handles this; `FORCE ROW LEVEL SECURITY` is more about table owners.

COMMENT ON TABLE public.dialectic_project_resources IS 'Stores metadata about files uploaded by users as resources for their dialectic projects (e.g., initial prompt attachments).';
