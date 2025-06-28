CREATE TABLE public.domain_specific_prompt_overlays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_prompt_id UUID NOT NULL REFERENCES public.system_prompts(id),
    domain_tag TEXT NOT NULL,
    overlay_values JSONB NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT domain_specific_prompt_overlays_unique_system_prompt_domain_version UNIQUE (system_prompt_id, domain_tag, version)
);

COMMENT ON TABLE public.domain_specific_prompt_overlays IS 'Stores domain-specific default values to overlay onto base system prompts.';
COMMENT ON COLUMN public.domain_specific_prompt_overlays.system_prompt_id IS 'FK to the base system prompt this overlay applies to.';
COMMENT ON COLUMN public.domain_specific_prompt_overlays.domain_tag IS 'The specific domain this overlay is for (e.g., software_development, finance).';
COMMENT ON COLUMN public.domain_specific_prompt_overlays.overlay_values IS 'JSONB object containing key-value pairs that will override or supplement variables in the base prompt.';
COMMENT ON COLUMN public.domain_specific_prompt_overlays.version IS 'Version of this specific overlay for a given system_prompt_id and domain_tag.'; 