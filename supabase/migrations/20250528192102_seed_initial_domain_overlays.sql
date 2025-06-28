-- Seed initial domain-specific prompt overlays
-- This script assumes that the base prompts 'dialectic_thesis_base_v1' and 'dialectic_antithesis_base_v1'
-- have already been seeded into the system_prompts table and their IDs are known or can be queried.

-- For Software Development overlay on Thesis Base V1
INSERT INTO public.domain_specific_prompt_overlays (
    system_prompt_id,
    domain_tag,
    overlay_values,
    description,
    is_active,
    version
)
SELECT 
    sp.id, -- Fetches the ID of the 'dialectic_thesis_base_v1' prompt
    'software_development',
    '{
        "domain_standards": "SOLID, DRY, KISS principles, secure coding practices, comprehensive testing",
        "deployment_context": "Cloud-native serverless architecture, CI/CD pipeline integration"
    }'::jsonb,
    'Software development domain overlay for the base thesis prompt, focusing on common dev standards.',
    true,
    1
FROM public.system_prompts sp
WHERE sp.name = 'dialectic_thesis_base_v1';

-- For Software Development overlay on Antithesis Base V1
INSERT INTO public.domain_specific_prompt_overlays (
    system_prompt_id,
    domain_tag,
    overlay_values,
    description,
    is_active,
    version
)
SELECT 
    sp.id, -- Fetches the ID of the 'dialectic_antithesis_base_v1' prompt
    'software_development',
    '{
        "critique_focus_areas": [
            "Scalability under load", 
            "Maintainability and code complexity", 
            "Security vulnerabilities (OWASP Top 10)", 
            "Cost efficiency of proposed solution",
            "Adherence to {domain_standards}"
        ]
    }'::jsonb,
    'Software development domain overlay for the base antithesis prompt, focusing on dev critique points.',
    true,
    1
FROM public.system_prompts sp
WHERE sp.name = 'dialectic_antithesis_base_v1'; 