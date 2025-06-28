-- Update existing records where content_storage_bucket is NULL
-- Assuming 'dialectic-contributions' is the correct default bucket name.
UPDATE public.dialectic_contributions
SET content_storage_bucket = 'dialectic-contributions'
WHERE content_storage_bucket IS NULL;

-- Add the NOT NULL constraint to the content_storage_bucket column
ALTER TABLE public.dialectic_contributions
ALTER COLUMN content_storage_bucket SET NOT NULL;
