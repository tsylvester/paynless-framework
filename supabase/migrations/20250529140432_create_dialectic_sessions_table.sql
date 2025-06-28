CREATE TABLE public.dialectic_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL,
    session_description TEXT NULL,
    current_stage_seed_prompt TEXT NULL,
    iteration_count INTEGER NOT NULL DEFAULT 1,
    active_thesis_prompt_template_id UUID NULL,
    active_antithesis_prompt_template_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending_thesis',

    CONSTRAINT fk_project
        FOREIGN KEY(project_id) 
        REFERENCES public.dialectic_projects(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_thesis_prompt_template
        FOREIGN KEY(active_thesis_prompt_template_id) 
        REFERENCES public.system_prompts(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_antithesis_prompt_template
        FOREIGN KEY(active_antithesis_prompt_template_id) 
        REFERENCES public.system_prompts(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE public.dialectic_sessions IS 'Stores information about each dialectic session within a project.';
COMMENT ON COLUMN public.dialectic_sessions.id IS 'Unique identifier for the dialectic session.';
COMMENT ON COLUMN public.dialectic_sessions.project_id IS 'Foreign key linking to the parent dialectic_project.';
COMMENT ON COLUMN public.dialectic_sessions.session_description IS 'User-provided description for the session, e.g., "Initial run with models A, B, C using default thesis prompt"';
COMMENT ON COLUMN public.dialectic_sessions.current_stage_seed_prompt IS 'The actual prompt that was used to initiate the current stage, can be a combination of user input and template.';
COMMENT ON COLUMN public.dialectic_sessions.iteration_count IS 'Tracks the number of iterations for multi-cycle sessions (relevant in later phases). Default is 1.';
COMMENT ON COLUMN public.dialectic_sessions.active_thesis_prompt_template_id IS 'Foreign key to system_prompts table for the thesis stage prompt template used in this session. SET NULL if prompt is deleted.';
COMMENT ON COLUMN public.dialectic_sessions.active_antithesis_prompt_template_id IS 'Foreign key to system_prompts table for the antithesis stage prompt template used in this session. SET NULL if prompt is deleted.';
COMMENT ON COLUMN public.dialectic_sessions.created_at IS 'Timestamp of when the session was created.';
COMMENT ON COLUMN public.dialectic_sessions.updated_at IS 'Timestamp of when the session was last updated.';
COMMENT ON COLUMN public.dialectic_sessions.status IS 'Current status of the session, e.g., ''pending_thesis'', ''generating_thesis'', ''thesis_complete'', etc. Default is ''pending_thesis''.';

-- Row Level Security will be enabled and policies added in a subsequent migration
-- as per checklist item 1.1.7.x
-- Example: ALTER TABLE public.dialectic_sessions ENABLE ROW LEVEL SECURITY;
