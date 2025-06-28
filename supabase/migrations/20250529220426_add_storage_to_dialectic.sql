ALTER TABLE public.dialectic_contributions
ADD COLUMN IF NOT EXISTS content_storage_bucket TEXT NOT NULL DEFAULT 'dialectic-contributions',
ADD COLUMN IF NOT EXISTS content_storage_path TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS content_mime_type TEXT NOT NULL DEFAULT 'text/markdown',
ADD COLUMN IF NOT EXISTS content_size_bytes BIGINT,
ADD COLUMN IF NOT EXISTS raw_response_storage_path TEXT; 