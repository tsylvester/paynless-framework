-- Enable RLS for domain_specific_prompt_overlays and dialectic_sessions
-- (dialectic_contributions should already have RLS enabled from its creation script)
ALTER TABLE public.domain_specific_prompt_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialectic_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for domain_specific_prompt_overlays
CREATE POLICY "Allow authenticated users to read domain_specific_prompt_overlays"
ON public.domain_specific_prompt_overlays
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow service_role to manage domain_specific_prompt_overlays"
ON public.domain_specific_prompt_overlays
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policies for dialectic_sessions
CREATE POLICY "Users can manage sessions for projects they own"
ON public.dialectic_sessions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.dialectic_projects dp
        WHERE dp.id = dialectic_sessions.project_id
        AND dp.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.dialectic_projects dp
        WHERE dp.id = dialectic_sessions.project_id
        AND dp.user_id = auth.uid()
    )
);

-- Policies for dialectic_contributions
CREATE POLICY "Users can manage contributions for projects they own"
ON public.dialectic_contributions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.dialectic_sessions ds
        JOIN public.dialectic_projects dp ON ds.project_id = dp.id
        WHERE ds.id = dialectic_contributions.session_id
        AND dp.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.dialectic_sessions ds
        JOIN public.dialectic_projects dp ON ds.project_id = dp.id
        WHERE ds.id = dialectic_contributions.session_id
        AND dp.user_id = auth.uid()
    )
);
