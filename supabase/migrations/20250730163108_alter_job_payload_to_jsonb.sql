ALTER TABLE public.dialectic_generation_jobs
ALTER COLUMN payload TYPE jsonb USING payload::jsonb;
