ALTER TABLE public.dialectic_contributions
ADD COLUMN contribution_type TEXT;

COMMENT ON COLUMN public.dialectic_contributions.contribution_type IS 'Type of contribution, e.g., ''ai_generated'', ''user_edit'', ''system_message''.';
