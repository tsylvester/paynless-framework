-- Create the dialectic_generation_jobs table
CREATE TABLE public.dialectic_generation_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.dialectic_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stage_slug text NOT NULL,
    iteration_number integer NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 3,
    target_contribution_id uuid REFERENCES public.dialectic_contributions(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    results jsonb,
    error_details jsonb
);

-- Add comments to the columns
COMMENT ON TABLE public.dialectic_generation_jobs IS 'Stores asynchronous jobs for the Dialectic service.';
COMMENT ON COLUMN public.dialectic_generation_jobs.id IS 'Unique identifier for the generation job.';
COMMENT ON COLUMN public.dialectic_generation_jobs.session_id IS 'The dialectic session this job belongs to.';
COMMENT ON COLUMN public.dialectic_generation_jobs.user_id IS 'The user who initiated the job.';
COMMENT ON COLUMN public.dialectic_generation_jobs.stage_slug IS 'The specific stage of the dialectic process (e.g., ''thesis'', ''antithesis'').';
COMMENT ON COLUMN public.dialectic_generation_jobs.iteration_number IS 'The iteration number within the dialectic session.';
COMMENT ON COLUMN public.dialectic_generation_jobs.payload IS 'The input parameters for the job, including model selections, etc.';
COMMENT ON COLUMN public.dialectic_generation_jobs.status IS 'The current status of the job (e.g., pending, processing, completed, failed).';
COMMENT ON COLUMN public.dialectic_generation_jobs.attempt_count IS 'The number of times this job has been attempted.';
COMMENT ON COLUMN public.dialectic_generation_jobs.max_retries IS 'The maximum number of retries allowed for this job.';
COMMENT ON COLUMN public.dialectic_generation_jobs.target_contribution_id IS 'For continuation jobs, this links to the specific dialectic_contributions record being appended to.';
COMMENT ON COLUMN public.dialectic_generation_jobs.created_at IS 'Timestamp when the job was created.';
COMMENT ON COLUMN public.dialectic_generation_jobs.started_at IS 'Timestamp when the job processing started.';
COMMENT ON COLUMN public.dialectic_generation_jobs.completed_at IS 'Timestamp when the job processing completed.';
COMMENT ON COLUMN public.dialectic_generation_jobs.results IS 'The results of the completed job.';
COMMENT ON COLUMN public.dialectic_generation_jobs.error_details IS 'Details of any error that occurred during processing.';

-- Add indexes
CREATE INDEX idx_dialectic_generation_jobs_session_id ON public.dialectic_generation_jobs(session_id);
CREATE INDEX idx_dialectic_generation_jobs_status ON public.dialectic_generation_jobs(status);
CREATE INDEX idx_dialectic_generation_jobs_user_id ON public.dialectic_generation_jobs(user_id);
CREATE INDEX idx_dialectic_generation_jobs_target_contribution_id ON public.dialectic_generation_jobs(target_contribution_id);


-- Enable Row-Level Security
ALTER TABLE public.dialectic_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Grant permissions to roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dialectic_generation_jobs TO authenticated;
GRANT ALL ON public.dialectic_generation_jobs TO service_role;

-- RLS Policies
CREATE POLICY "Allow individual read access"
ON public.dialectic_generation_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow individual insert access"
ON public.dialectic_generation_jobs
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1
        FROM public.dialectic_sessions ds
        JOIN public.dialectic_projects dp ON ds.project_id = dp.id
        LEFT JOIN public.chats c ON ds.associated_chat_id = c.id
        LEFT JOIN public.organization_members om ON c.organization_id = om.organization_id AND om.user_id = auth.uid()
        WHERE ds.id = session_id
        AND (dp.user_id = auth.uid() OR om.user_id IS NOT NULL)
    )
);

CREATE POLICY "Allow service_role to bypass RLS"
ON public.dialectic_generation_jobs
FOR ALL
TO service_role
USING (true);
