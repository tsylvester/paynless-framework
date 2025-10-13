DO $$
DECLARE
    -- Domain and Stage IDs
    v_domain_id UUID;
    v_synthesis_stage_id UUID;

    -- Template and Instance IDs
    v_template_id UUID;
    v_instance_id UUID;
    v_doc_template_id UUID;

    -- Prompt IDs
    v_pairwise_planner_prompt_id UUID;
    v_pairwise_business_prompt_id UUID;
    v_pairwise_feature_prompt_id UUID;
    v_pairwise_technical_prompt_id UUID;
    v_pairwise_metrics_prompt_id UUID;
    v_doc_business_prompt_id UUID;
    v_doc_feature_prompt_id UUID;
    v_doc_technical_prompt_id UUID;
    v_doc_metrics_prompt_id UUID;
    v_final_header_prompt_id UUID;
    v_prd_prompt_id UUID;
    v_system_architecture_prompt_id UUID;
    v_tech_stack_prompt_id UUID;

    -- Template Step IDs
    v_planner_step_id UUID;
    v_pairwise_business_step_id UUID;
    v_pairwise_feature_step_id UUID;
    v_pairwise_technical_step_id UUID;
    v_pairwise_metrics_step_id UUID;
    v_doc_business_step_id UUID;
    v_doc_feature_step_id UUID;
    v_doc_technical_step_id UUID;
    v_doc_metrics_step_id UUID;
    v_final_header_step_id UUID;
    v_prd_step_id UUID;
    v_system_architecture_step_id UUID;
    v_tech_stack_step_id UUID;

    -- Instance Step IDs
    v_instance_planner_step_id UUID;
    v_instance_pairwise_business_step_id UUID;
    v_instance_pairwise_feature_step_id UUID;
    v_instance_pairwise_technical_step_id UUID;
    v_instance_pairwise_metrics_step_id UUID;
    v_instance_doc_business_step_id UUID;
    v_instance_doc_feature_step_id UUID;
    v_instance_doc_technical_step_id UUID;
    v_instance_doc_metrics_step_id UUID;
    v_instance_final_header_step_id UUID;
    v_instance_prd_step_id UUID;
    v_instance_arch_step_id UUID;
    v_instance_stack_step_id UUID;

BEGIN
    -- Step 1: Get the domain_id for 'Software Development'
    SELECT id INTO v_domain_id FROM public.dialectic_domains WHERE name = 'Software Development' LIMIT 1;

    -- Step 2: Upsert all System Prompts and their backing Document Templates for the entire recipe
    -- 2.1: Pairwise Planner Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_header_planner_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_header_planner_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_pairwise_header_planner_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_header_planner_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md$PROMPT$, true, 1, 'Planner template that assembles the pairwise HeaderContext for Synthesis stage fan-out.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_planner_prompt_id;

    -- 2.2: Pairwise Business Case Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_business_case_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_business_case_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_pairwise_business_case_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_business_case_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_business_case_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise business case synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_business_prompt_id;

    -- 2.3: Pairwise Feature Spec Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_feature_spec_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_feature_spec_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_pairwise_feature_spec_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_feature_spec_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_feature_spec_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise feature spec synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_feature_prompt_id;

    -- 2.4: Pairwise Technical Approach Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_technical_approach_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_technical_approach_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_pairwise_technical_approach_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_technical_approach_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_technical_approach_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise technical approach synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_technical_prompt_id;

    -- 2.5: Pairwise Success Metrics Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_success_metrics_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_success_metrics_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_pairwise_success_metrics_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_success_metrics_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_success_metrics_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise success metrics synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_metrics_prompt_id;

    -- 2.6: Document Business Case Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_business_case_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_business_case_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_document_business_case_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_business_case_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level business case consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_business_prompt_id;

    -- 2.7: Document Feature Spec Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_feature_spec_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_feature_spec_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_document_feature_spec_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_feature_spec_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level feature spec consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_feature_prompt_id;

    -- 2.8: Document Technical Approach Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_technical_approach_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_technical_approach_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_document_technical_approach_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_technical_approach_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level technical approach consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_technical_prompt_id;

    -- 2.9: Document Success Metrics Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_success_metrics_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_success_metrics_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_document_success_metrics_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_success_metrics_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level success metrics consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_metrics_prompt_id;

    -- 2.10: Final Header Planner Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_final_header_planner_v1 prompt', v_domain_id, 'Source document for synthesis_final_header_planner_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_final_header_planner_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_final_header_planner_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_final_header_planner_v1.md$PROMPT$, true, 1, 'Planner template that prepares the final Synthesis HeaderContext before deliverable turns.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_final_header_prompt_id;

    -- 2.11: PRD Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_prd_turn_v1 prompt', v_domain_id, 'Source document for synthesis_prd_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_prd_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_prd_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_prd_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage final Product Requirements Document turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_prd_prompt_id;

    -- 2.12: System Architecture Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_system_architecture_turn_v1 prompt', v_domain_id, 'Source document for synthesis_system_architecture_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_system_architecture_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_system_architecture_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_system_architecture_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage final system architecture overview turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_system_architecture_prompt_id;

    -- 2.13: Tech Stack Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_tech_stack_turn_v1 prompt', v_domain_id, 'Source document for synthesis_tech_stack_turn_v1 prompt', 'prompts', 'docs/prompts/synthesis/', 'synthesis_tech_stack_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_tech_stack_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_tech_stack_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage final tech stack recommendations turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_tech_stack_prompt_id;


    -- Step 3: Upsert the Synthesis Recipe Template
    INSERT INTO public.dialectic_recipe_templates (recipe_name, recipe_version, display_name, domain_key, description, is_active)
    VALUES ('synthesis_v1', 1, 'Synthesis Refinement', 'software_development', 'Stage recipe that orchestrates pairwise synthesis, consolidation, and final deliverables.', true)
    ON CONFLICT (recipe_name, recipe_version) DO UPDATE SET display_name = EXCLUDED.display_name, domain_key = EXCLUDED.domain_key, description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_template_id;

    -- Step 4: Upsert ALL Recipe Template Steps
    -- Step 4.1: Pairwise Planner
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 1, 'synthesis_prepare_pairwise_header', 'prepare-pairwise-synthesis-header', 'Prepare Pairwise Synthesis Header', 'Generate HeaderContext JSON that guides pairwise synthesis turns across thesis lineages and antithesis critiques.',
        'PLAN', 'Planner', v_pairwise_planner_prompt_id, 'HeaderContext', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_planner_step_id;

    -- Step 4.2 (Parallel Group 2): Pairwise Synthesis
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_business_case', 'synthesis_pairwise_business_case', 'pairwise-synthesis-business-case', 'Pairwise Synthesis – Business Case', 'Combine the thesis business case with critiques and comparison vector signals into a resolved narrative.',
        'EXECUTE', 'Turn', v_pairwise_business_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_business_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_feature_spec', 'synthesis_pairwise_feature_spec', 'pairwise-synthesis-feature-spec', 'Pairwise Synthesis – Feature Spec', 'Merge feature scope with feasibility, non-functional insights, and comparison signals.',
        'EXECUTE', 'Turn', v_pairwise_feature_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_technical_approach', 'synthesis_pairwise_technical_approach', 'pairwise-synthesis-technical-approach', 'Pairwise Synthesis – Technical Approach', 'Combine thesis technical approach with antithesis risk and dependency findings.',
        'EXECUTE', 'Turn', v_pairwise_technical_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_success_metrics', 'synthesis_pairwise_success_metrics', 'pairwise-synthesis-success-metrics', 'Pairwise Synthesis – Success Metrics', 'Combine thesis success metrics with antithesis critique signals into a resolved set of measurable outcomes.',
        'EXECUTE', 'Turn', v_pairwise_metrics_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_metrics_step_id;

    -- Step 4.3 (Parallel Group 3): Document-level Consolidation
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_business_case', 'synthesize_document_business_case', 'synthesize-document-business-case', 'Synthesize Business Case Across Models', 'Synthesize the final business case from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_business_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_business_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_feature_spec', 'synthesize_document_feature_spec', 'synthesis-document-feature-spec', 'Synthesize Feature Spec Across Models', 'Synthesize the final feature spec from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_feature_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_technical_approach', 'synthesize_document_technical_approach', 'synthesis-document-technical-approach', 'Synthesize Technical Approach Across Models', 'Synthesize the final technical approach from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_technical_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_success_metrics', 'synthesize_document_success_metrics', 'synthesis-document-success-metrics', 'Synthesize Success Metrics Across Models', 'Synthesize the final success metrics from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_metrics_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_metrics_step_id;

    -- Step 4.4: Final Header Planner
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 4, 'generate_final_synthesis_header', 'generate-final-synthesis-header', 'Generate Final Synthesis Header', 'Generate the final HeaderContext for Synthesis stage deliverables.',
        'PLAN', 'Planner', v_final_header_prompt_id, 'HeaderContext', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_final_header_step_id;

    -- Step 4.5 (Parallel Group 5): Final Deliverables
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'prd', 'prd', 'render-prd', 'Render Final PRD', 'Renders the final Product Requirements Document from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_prd_prompt_id, 'RenderedDocument', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_prd_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'system_architecture_overview', 'system_architecture_overview', 'render-system-architecture-overview', 'Render Final System Architecture Overview', 'Renders the final System Architecture Overview from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_system_architecture_prompt_id, 'RenderedDocument', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_system_architecture_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'tech_stack_recommendations', 'tech_stack_recommendations', 'render-tech-stack-recommendations', 'Render Final Tech Stack Recommendations', 'Renders the final Tech Stack Recommendations from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_tech_stack_prompt_id, 'RenderedDocument', 'all_to_one',
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_tech_stack_step_id;
    
    -- Step 5: Find Stage ID and Create Stage Recipe Instance
    SELECT id INTO v_synthesis_stage_id FROM public.dialectic_stages WHERE slug = 'synthesis';
    IF v_synthesis_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found; ensure base seeds are applied before running this migration.';
    END IF;

    INSERT INTO public.dialectic_stage_recipe_instances (stage_id, template_id)
    VALUES (v_synthesis_stage_id, v_template_id)
    ON CONFLICT (stage_id) DO UPDATE SET template_id = EXCLUDED.template_id, updated_at = now()
    RETURNING id INTO v_instance_id;

    -- Step 6: Clone Template Steps to create mutable Instance Steps
    INSERT INTO public.dialectic_stage_recipe_steps (instance_id, template_step_id, step_key, step_slug, step_name, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required, parallel_group, branch_key, execution_order)
    SELECT
        v_instance_id,
        s.id,
        s.step_key,
        s.step_slug,
        s.step_name,
        s.job_type,
        s.prompt_type,
        s.prompt_template_id,
        s.output_type,
        s.granularity_strategy,
        s.inputs_required,
        s.inputs_relevance,
        s.outputs_required,
        s.parallel_group,
        s.branch_key,
        s.step_number
    FROM public.dialectic_recipe_template_steps s
    WHERE s.template_id = v_template_id
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now();

    -- Step 7: Retrieve all Instance Step IDs for edge creation
    SELECT id INTO v_instance_planner_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesis_prepare_pairwise_header';
    SELECT id INTO v_instance_pairwise_business_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesis_pairwise_business_case';
    SELECT id INTO v_instance_pairwise_feature_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesis_pairwise_feature_spec';
    SELECT id INTO v_instance_pairwise_technical_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesis_pairwise_technical_approach';
    SELECT id INTO v_instance_pairwise_metrics_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesis_pairwise_success_metrics';
    SELECT id INTO v_instance_doc_business_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesize_document_business_case';
    SELECT id INTO v_instance_doc_feature_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesize_document_feature_spec';
    SELECT id INTO v_instance_doc_technical_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesize_document_technical_approach';
    SELECT id INTO v_instance_doc_metrics_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'synthesize_document_success_metrics';
    SELECT id INTO v_instance_final_header_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'generate_final_synthesis_header';
    SELECT id INTO v_instance_prd_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'prd';
    SELECT id INTO v_instance_arch_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'system_architecture_overview';
    SELECT id INTO v_instance_stack_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_key = 'tech_stack_recommendations';

    -- Step 8: Create the full DAG for both the template and the instance
    -- 8.1: Template Edges
    INSERT INTO public.dialectic_recipe_template_edges (template_id, from_step_id, to_step_id) VALUES
        (v_template_id, v_planner_step_id, v_pairwise_business_step_id),
        (v_template_id, v_planner_step_id, v_pairwise_feature_step_id),
        (v_template_id, v_planner_step_id, v_pairwise_technical_step_id),
        (v_template_id, v_planner_step_id, v_pairwise_metrics_step_id),
        (v_template_id, v_pairwise_business_step_id, v_doc_business_step_id),
        (v_template_id, v_pairwise_feature_step_id, v_doc_feature_step_id),
        (v_template_id, v_pairwise_technical_step_id, v_doc_technical_step_id),
        (v_template_id, v_pairwise_metrics_step_id, v_doc_metrics_step_id),
        (v_template_id, v_doc_business_step_id, v_final_header_step_id),
        (v_template_id, v_doc_feature_step_id, v_final_header_step_id),
        (v_template_id, v_doc_technical_step_id, v_final_header_step_id),
        (v_template_id, v_doc_metrics_step_id, v_final_header_step_id),
        (v_template_id, v_final_header_step_id, v_prd_step_id),
        (v_template_id, v_final_header_step_id, v_system_architecture_step_id),
        (v_template_id, v_final_header_step_id, v_tech_stack_step_id)
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;

    -- 8.2: Instance Edges
    INSERT INTO public.dialectic_stage_recipe_edges (instance_id, from_step_id, to_step_id) VALUES
        (v_instance_id, v_instance_planner_step_id, v_instance_pairwise_business_step_id),
        (v_instance_id, v_instance_planner_step_id, v_instance_pairwise_feature_step_id),
        (v_instance_id, v_instance_planner_step_id, v_instance_pairwise_technical_step_id),
        (v_instance_id, v_instance_planner_step_id, v_instance_pairwise_metrics_step_id),
        (v_instance_id, v_instance_pairwise_business_step_id, v_instance_doc_business_step_id),
        (v_instance_id, v_instance_pairwise_feature_step_id, v_instance_doc_feature_step_id),
        (v_instance_id, v_instance_pairwise_technical_step_id, v_instance_doc_technical_step_id),
        (v_instance_id, v_instance_pairwise_metrics_step_id, v_instance_doc_metrics_step_id),
        (v_instance_id, v_instance_doc_business_step_id, v_instance_final_header_step_id),
        (v_instance_id, v_instance_doc_feature_step_id, v_instance_final_header_step_id),
        (v_instance_id, v_instance_doc_technical_step_id, v_instance_final_header_step_id),
        (v_instance_id, v_instance_doc_metrics_step_id, v_instance_final_header_step_id),
        (v_instance_id, v_instance_final_header_step_id, v_instance_prd_step_id),
        (v_instance_id, v_instance_final_header_step_id, v_instance_arch_step_id),
        (v_instance_id, v_instance_final_header_step_id, v_instance_stack_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;

END $$;