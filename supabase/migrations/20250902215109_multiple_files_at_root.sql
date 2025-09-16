-- Step 17: Allow multiple files at the same project root path by including file_name in the uniqueness determinant
-- This migration drops the old uniqueness on (storage_bucket, storage_path) and adds a new
-- unique constraint on (storage_bucket, storage_path, file_name) for public.dialectic_project_resources.

-- Safely drop the legacy unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_storage_path'
      AND conrelid = 'public.dialectic_project_resources'::regclass
  ) THEN
    ALTER TABLE public.dialectic_project_resources
      DROP CONSTRAINT "unique_storage_path";
  END IF;
END$$;

-- Also drop the actual constraint name observed in some environments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_dialectic_resource_storage_path'
      AND conrelid = 'public.dialectic_project_resources'::regclass
  ) THEN
    ALTER TABLE public.dialectic_project_resources
      DROP CONSTRAINT "unique_dialectic_resource_storage_path";
  END IF;
END$$;

-- Also drop the default-generated unique key name if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dialectic_project_resources_storage_bucket_storage_path_key'
      AND conrelid = 'public.dialectic_project_resources'::regclass
  ) THEN
    ALTER TABLE public.dialectic_project_resources
      DROP CONSTRAINT dialectic_project_resources_storage_bucket_storage_path_key;
  END IF;
END$$;

-- Safely drop a legacy unique index if it exists (some environments used a separate index)
DROP INDEX IF EXISTS public.unique_storage_path;
DROP INDEX IF EXISTS public.unique_dialectic_resource_storage_path;

-- Add the new uniqueness that includes file_name
ALTER TABLE public.dialectic_project_resources
  ADD CONSTRAINT unique_bucket_path_file_name
  UNIQUE (storage_bucket, storage_path, file_name);


