-- Step 1: Add the new current_stage_id column to the dialectic_sessions table.
-- This column will reference the new dialectic_stages table.
ALTER TABLE public.dialectic_sessions
ADD COLUMN current_stage_id UUID REFERENCES public.dialectic_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dialectic_sessions.current_stage_id IS 'The current stage of this session, referencing the dialectic_stages table.';


-- Step 2: Backfill the new current_stage_id based on the old 'stage' enum values.
-- This maps the old enum text values to the slugs in the new stages table,
-- and correctly handles mapping legacy 'hypothesis' values to the new 'thesis' stage.
UPDATE public.dialectic_sessions s
SET current_stage_id = ds.id
FROM public.dialectic_stages ds
WHERE 
    s.stage::text = ds.slug OR 
    (s.stage::text = 'hypothesis' AND ds.slug = 'thesis');


-- Step 3: Add a NOT NULL constraint to the new column now that it's populated.
-- This assumes all sessions had a valid stage that was successfully backfilled.
ALTER TABLE public.dialectic_sessions
ALTER COLUMN current_stage_id SET NOT NULL;


-- Step 4: Drop the old 'stage' column as it has been replaced.
ALTER TABLE public.dialectic_sessions
DROP COLUMN stage;


-- Step 5: Drop the old 'dialectic_stage' enum type if it still exists.
DROP TYPE IF EXISTS public.dialectic_stage;
