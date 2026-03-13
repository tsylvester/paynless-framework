-- Add viewing_stage_id to dialectic_sessions. Nullable: backend may set initial viewing stage on session creation.
-- Existing RLS policy "Users can manage sessions for projects they own" (FOR ALL) already allows session owner to read/write this column; no RLS change.
ALTER TABLE public.dialectic_sessions
ADD COLUMN viewing_stage_id uuid REFERENCES public.dialectic_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dialectic_sessions.viewing_stage_id IS 'Stage the user is currently viewing; null means use current_stage_id on first load.';
