-- Create canonical recipe catalog tables
CREATE TABLE IF NOT EXISTS public.dialectic_recipe_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_name TEXT NOT NULL,
    recipe_version INTEGER NOT NULL DEFAULT 1,
    display_name TEXT,
    domain_key TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recipe_name, recipe_version)
);

-- Partial unique index to ensure only one active recipe has a given name.
CREATE UNIQUE INDEX IF NOT EXISTS dialectic_recipe_templates_unique_active_name
ON public.dialectic_recipe_templates(recipe_name)
WHERE is_active;

CREATE TABLE IF NOT EXISTS public.dialectic_document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES public.dialectic_domains (id),
    name TEXT NOT NULL,
    description TEXT,
    storage_bucket TEXT,
    storage_path TEXT,
    file_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, domain_id)
);

ALTER TABLE public.dialectic_document_templates
    ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'dialectic_document_templates_name_domain_id_key' AND conrelid = 'public.dialectic_document_templates'::regclass
    ) THEN
        ALTER TABLE public.dialectic_document_templates
            ADD CONSTRAINT dialectic_document_templates_name_domain_id_key UNIQUE (name, domain_id);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.dialectic_recipe_template_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.dialectic_recipe_templates (id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    parallel_group INTEGER,
    branch_key TEXT,
    step_key TEXT NOT NULL,
    step_slug TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_description TEXT,
    job_type TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    prompt_template_id UUID REFERENCES public.system_prompts (id),
    output_type TEXT NOT NULL,
    granularity_strategy TEXT NOT NULL,
    inputs_required JSONB NOT NULL DEFAULT '[]'::jsonb,
    inputs_relevance JSONB NOT NULL DEFAULT '[]'::jsonb,
    outputs_required JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (step_number > 0),
    CHECK (jsonb_typeof(inputs_required) = 'array'),
    CHECK (jsonb_typeof(inputs_relevance) = 'array'),
    CHECK (jsonb_typeof(outputs_required) = 'object'),
    UNIQUE (template_id, step_key),
    UNIQUE (template_id, step_number, step_key)
);

CREATE TABLE IF NOT EXISTS public.dialectic_recipe_template_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.dialectic_recipe_templates (id) ON DELETE CASCADE,
    from_step_id UUID NOT NULL REFERENCES public.dialectic_recipe_template_steps (id) ON DELETE CASCADE,
    to_step_id UUID NOT NULL REFERENCES public.dialectic_recipe_template_steps (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_step_id <> to_step_id),
    UNIQUE (template_id, from_step_id, to_step_id)
);

-- Create stage-scoped recipe instance tables
CREATE TABLE IF NOT EXISTS public.dialectic_stage_recipe_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES public.dialectic_stages (id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.dialectic_recipe_templates (id) ON DELETE RESTRICT,
    is_cloned BOOLEAN NOT NULL DEFAULT FALSE,
    cloned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stage_id)
);

CREATE TABLE IF NOT EXISTS public.dialectic_stage_recipe_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES public.dialectic_stage_recipe_instances (id) ON DELETE CASCADE,
    template_step_id UUID REFERENCES public.dialectic_recipe_template_steps (id) ON DELETE SET NULL,
    step_key TEXT NOT NULL,
    step_slug TEXT NOT NULL,
    step_name TEXT NOT NULL,
    job_type TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    prompt_template_id UUID REFERENCES public.system_prompts (id),
    output_type TEXT NOT NULL,
    granularity_strategy TEXT NOT NULL,
    inputs_required JSONB NOT NULL DEFAULT '[]'::jsonb,
    inputs_relevance JSONB NOT NULL DEFAULT '[]'::jsonb,
    outputs_required JSONB NOT NULL DEFAULT '[]'::jsonb,
    config_override JSONB NOT NULL DEFAULT '{}'::jsonb,
    object_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
    execution_order INTEGER,
    parallel_group INTEGER,
    branch_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(inputs_required) = 'array'),
    CHECK (jsonb_typeof(inputs_relevance) = 'array'),
    CHECK (jsonb_typeof(outputs_required) = 'object'),
    UNIQUE (instance_id, step_key)
);

CREATE TABLE IF NOT EXISTS public.dialectic_stage_recipe_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES public.dialectic_stage_recipe_instances (id) ON DELETE CASCADE,
    from_step_id UUID NOT NULL REFERENCES public.dialectic_stage_recipe_steps (id) ON DELETE CASCADE,
    to_step_id UUID NOT NULL REFERENCES public.dialectic_stage_recipe_steps (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_step_id <> to_step_id),
    UNIQUE (instance_id, from_step_id, to_step_id)
);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_recipe_template_steps_template_step_number
    ON public.dialectic_recipe_template_steps (template_id, step_number);

CREATE INDEX IF NOT EXISTS idx_recipe_template_edges_template_from
    ON public.dialectic_recipe_template_edges (template_id, from_step_id);

CREATE INDEX IF NOT EXISTS idx_stage_recipe_instances_stage
    ON public.dialectic_stage_recipe_instances (stage_id, is_cloned);

CREATE INDEX IF NOT EXISTS idx_stage_recipe_steps_instance_execution
    ON public.dialectic_stage_recipe_steps (instance_id, execution_order)
    WHERE is_skipped = FALSE;

CREATE INDEX IF NOT EXISTS idx_stage_recipe_edges_instance_from
    ON public.dialectic_stage_recipe_edges (instance_id, from_step_id);

-- Update dialectic_stages to reference recipes and instances
ALTER TABLE public.dialectic_stages
    ADD COLUMN IF NOT EXISTS recipe_template_id UUID REFERENCES public.dialectic_recipe_templates (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active_recipe_instance_id UUID,
    ADD COLUMN IF NOT EXISTS expected_output_template_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

-- Ensure active instance references the same stage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_stage_recipe_instance_stage_id' AND conrelid = 'public.dialectic_stage_recipe_instances'::regclass
    ) THEN
        ALTER TABLE public.dialectic_stage_recipe_instances
            ADD CONSTRAINT uq_stage_recipe_instance_stage_id UNIQUE (stage_id, id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_active_recipe_instance' AND conrelid = 'public.dialectic_stages'::regclass
    ) THEN
        ALTER TABLE public.dialectic_stages
            ADD CONSTRAINT fk_active_recipe_instance
                FOREIGN KEY (id, active_recipe_instance_id)
                REFERENCES public.dialectic_stage_recipe_instances (stage_id, id)
                ON DELETE SET NULL;
    END IF;
END;
$$;

-- Column documentation
COMMENT ON COLUMN public.dialectic_recipe_template_steps.job_type IS 'One of PLAN | EXECUTE | RENDER';
COMMENT ON COLUMN public.dialectic_recipe_template_steps.prompt_type IS 'One of Seed | Planner | Turn | Continuation';
COMMENT ON COLUMN public.dialectic_recipe_template_steps.granularity_strategy IS 'Granularity strategy such as PerDocument, PerObject, Aggregate, SinglePass';
COMMENT ON COLUMN public.dialectic_stage_recipe_steps.job_type IS 'One of PLAN | EXECUTE | RENDER';
COMMENT ON COLUMN public.dialectic_stage_recipe_steps.prompt_type IS 'One of Seed | Planner | Turn | Continuation';
COMMENT ON COLUMN public.dialectic_stage_recipe_steps.granularity_strategy IS 'Granularity strategy such as PerDocument, PerObject, Aggregate, SinglePass';

-- Remove deprecated columns now represented by template metadata
ALTER TABLE public.dialectic_stages
    DROP COLUMN IF EXISTS input_artifact_rules,
    DROP COLUMN IF EXISTS expected_output_artifacts;

COMMENT ON COLUMN public.dialectic_stages.expected_output_template_ids IS 'UUID list of rendered document templates expected for the stage.';
