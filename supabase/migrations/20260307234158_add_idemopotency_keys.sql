-- Add idempotency_key to dialectic tables to prevent duplicate creation from retried requests.
-- Nullable for backward compatibility; new inserts from updated code will provide a key.

ALTER TABLE public.dialectic_projects ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.dialectic_sessions ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.dialectic_generation_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

COMMENT ON COLUMN public.dialectic_projects.idempotency_key IS 'Client-provided key to prevent duplicate creation from retried requests';
COMMENT ON COLUMN public.dialectic_sessions.idempotency_key IS 'Client-provided key to prevent duplicate creation from retried requests';
COMMENT ON COLUMN public.dialectic_generation_jobs.idempotency_key IS 'Client-provided key to prevent duplicate creation from retried requests';
