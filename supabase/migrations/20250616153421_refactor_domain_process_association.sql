-- Step 1: Decouple process templates from a single domain by removing the direct foreign key.
ALTER TABLE public.dialectic_process_templates
DROP COLUMN IF EXISTS domain_id;

-- Step 2: Create the new linking table to establish a many-to-many relationship.
CREATE TABLE public.domain_process_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES public.dialectic_domains(id) ON DELETE CASCADE,
    process_template_id UUID NOT NULL REFERENCES public.dialectic_process_templates(id) ON DELETE CASCADE,
    is_default_for_domain BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(domain_id, process_template_id)
);

COMMENT ON TABLE public.domain_process_associations IS 'Links dialectic process templates to relevant knowledge domains and flags one as the default for each domain.';

-- Step 3: Add a unique partial index to ensure only one process can be the default for any given domain.
CREATE UNIQUE INDEX one_default_process_per_domain_idx 
ON public.domain_process_associations (domain_id) 
WHERE (is_default_for_domain = true);

-- Step 4: Enable Row-Level Security and define a policy for read access.
ALTER TABLE public.domain_process_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access"
ON public.domain_process_associations
FOR SELECT
TO authenticated
USING (true);

-- Step 5: Seed the new linking table with default process associations for existing domains.
DO $$
DECLARE
    -- Domain IDs
    general_domain_id UUID;
    software_dev_domain_id UUID;
    finance_domain_id UUID;
    engineering_domain_id UUID;
    construction_domain_id UUID;
    legal_domain_id UUID;

    -- Process Template IDs
    general_process_id UUID;
    software_dev_process_id UUID;
BEGIN
    -- Idempotency: Clear any previous data in the associations table to ensure a clean seed.
    DELETE FROM public.domain_process_associations;

    -- Fetch the UUIDs for the domains and process templates we want to link.
    SELECT id INTO general_domain_id FROM public.dialectic_domains WHERE name = 'General';
    SELECT id INTO software_dev_domain_id FROM public.dialectic_domains WHERE name = 'Software Development';
    SELECT id INTO finance_domain_id FROM public.dialectic_domains WHERE name = 'Financial Analysis';
    SELECT id INTO engineering_domain_id FROM public.dialectic_domains WHERE name = 'Engineering';
    SELECT id INTO construction_domain_id FROM public.dialectic_domains WHERE name = 'Construction';
    SELECT id INTO legal_domain_id FROM public.dialectic_domains WHERE name = 'Legal';

    SELECT id INTO general_process_id FROM public.dialectic_process_templates WHERE name = 'Standard Dialectic Process';
    SELECT id INTO software_dev_process_id FROM public.dialectic_process_templates WHERE name = 'Standard Software Development Lifecycle';

    -- Seed the associations
    INSERT INTO public.domain_process_associations (domain_id, process_template_id, is_default_for_domain)
    VALUES
        -- Set the default process for the General domain.
        (general_domain_id, general_process_id, true),

        -- Set the default process for the Software Development domain.
        (software_dev_domain_id, software_dev_process_id, true),
        
        -- Associate the general process with other domains, but not as the default.
        (finance_domain_id, general_process_id, false),
        (engineering_domain_id, general_process_id, false),
        (construction_domain_id, general_process_id, false),
        (legal_domain_id, general_process_id, false);

END $$;
