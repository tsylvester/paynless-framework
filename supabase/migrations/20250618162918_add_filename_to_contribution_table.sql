ALTER TABLE public.dialectic_contributions
ADD COLUMN file_name TEXT;

COMMENT ON COLUMN public.dialectic_contributions.file_name IS 'The name of the file as it should appear to the user, without the full path.'; 

ALTER TABLE public.dialectic_contributions
RENAME COLUMN content_mime_type TO mime_type;

ALTER TABLE public.dialectic_contributions
RENAME COLUMN content_size_bytes TO size_bytes;

ALTER TABLE public.dialectic_contributions
RENAME COLUMN content_storage_bucket TO storage_bucket;

ALTER TABLE public.dialectic_contributions
RENAME COLUMN content_storage_path TO storage_path; 