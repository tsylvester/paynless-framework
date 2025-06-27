-- Seed domain-specific prompt overlays for the remaining stages of the Software Development dialectic process.
-- This script assumes that the base prompts for antithesis, synthesis, parenthesis, and paralysis
-- have already been seeded into the system_prompts table and the 'Software Development' domain exists.

-- For Software Development overlay on Antithesis Base V1
INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, is_active, version)
SELECT 
    sp.id,
    dom.id,
    '{
        "critique_focus_areas": [
            "Scalability under load", 
            "Maintainability and code complexity", 
            "Security vulnerabilities (OWASP Top 10)", 
            "Cost efficiency of proposed solution",
            "Adherence to {domain_standards}",
            "Completeness and clarity of user stories",
            "Realism of the implementation plan",
            "Potential edge cases and failure modes not considered"
        ],
        "output_format": "For each hypothesis document, produce a structured critique with sections for each focus area. For each point of criticism, suggest a specific, actionable improvement."
    }'::jsonb,
    'Software development domain overlay for the base antithesis prompt, focusing on critical analysis and refinement.',
    true,
    1
FROM public.system_prompts sp, public.dialectic_domains dom
WHERE sp.name = 'dialectic_antithesis_base_v1' AND dom.name = 'Software Development';

-- For Software Development overlay on Synthesis Base V1
INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, is_active, version)
SELECT 
    sp.id,
    dom.id,
    '{
        "consolidation_instructions": "Combine the original hypothesis, all antithesis critiques, and all user feedback into a single, coherent, and updated set of documents (PRD, business case, user stories). Resolve all conflicts and address all criticisms. The final output should be a clean, final version, not a summary of the inputs.",
        "implementation_plan_expansion": "Expand the initial, brief implementation plan into a more comprehensive one. It should cover all major components of the proposed system, including frontend, backend, database, and infrastructure. For each component, outline the key technical decisions to be made and the recommended technology stack.",
        "output_format": "Produce two main artifacts: 1. A complete, updated set of planning documents. 2. A detailed, high-level implementation plan."
    }'::jsonb,
    'Software development domain overlay for the base synthesis prompt, focusing on consolidation and comprehensive planning.',
    true,
    1
FROM public.system_prompts sp, public.dialectic_domains dom
WHERE sp.name = 'dialectic_synthesis_base_v1' AND dom.name = 'Software Development';

-- For Software Development overlay on Parenthesis Base V1
INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, is_active, version)
SELECT 
    sp.id,
    dom.id,
    '{
        "task_breakdown_hierarchy": [
            "Initiative",
            "Epic",
            "User Story/Task"
        ],
        "topical_areas_for_slicing": [
            "Database (tables, columns, RLS policies, triggers)",
            "Backend (API endpoints, service logic, middleware)",
            "Frontend (UI components, pages, state management)",
            "Authentication and Authorization",
            "Testing (unit, integration, end-to-end)",
            "Deployment and Infrastructure"
        ],
        "detail_level_expectation": "For each task, provide a clear description, acceptance criteria, and estimate of effort (e.g., in story points or hours). Tasks should be small enough to be completed by a single developer in a few days.",
        "output_format": "A set of markdown files, one for each topical area, containing a detailed, hierarchical breakdown of the work to be done."
    }'::jsonb,
    'Software development domain overlay for the base parenthesis prompt, focusing on detailed work breakdown and task planning.',
    true,
    1
FROM public.system_prompts sp, public.dialectic_domains dom
WHERE sp.name = 'dialectic_parenthesis_base_v1' AND dom.name = 'Software Development';

-- For Software Development overlay on Paralysis Base V1
INSERT INTO public.domain_specific_prompt_overlays (system_prompt_id, domain_id, overlay_values, description, is_active, version)
SELECT 
    sp.id,
    dom.id,
    '{
        "final_plan_format": "checklist",
        "checklist_item_structure": {
            "step_number": "Sequential integer",
            "description": "A clear, concise description of the task.",
            "dependencies": "A list of step_numbers that must be completed before this step can begin.",
            "test_red": "Instructions for writing a failing test for this step.",
            "implement": "A detailed prompt for a developer/AI to implement the feature.",
            "test_green": "Instructions for making the failing test pass.",
            "commit_message": "A suggested commit message for this step."
        },
        "dependency_ordering_requirement": "The checklist must be strictly ordered by dependency. A developer following the checklist from step 1 to N should never encounter a blocker that requires skipping ahead.",
        "output_format": "A single markdown file containing the fully ordered, detailed checklist."
    }'::jsonb,
    'Software development domain overlay for the base paralysis prompt, focusing on creating a final, step-by-step implementation plan.',
    true,
    1
FROM public.system_prompts sp, public.dialectic_domains dom
WHERE sp.name = 'dialectic_paralysis_base_v1' AND dom.name = 'Software Development';
