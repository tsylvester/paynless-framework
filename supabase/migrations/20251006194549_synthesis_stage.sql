DO $$
DECLARE
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
    v_final_header_step_id UUID;
    v_stage_id UUID;
    v_template_id UUID;
    v_planner_step_id UUID;
    v_pairwise_business_step_id UUID;
    v_pairwise_feature_step_id UUID;
    v_pairwise_technical_step_id UUID;
    v_pairwise_metrics_step_id UUID;
    v_doc_business_step_id UUID;
    v_doc_feature_step_id UUID;
    v_doc_technical_step_id UUID;
    v_doc_metrics_step_id UUID;
    v_business_doc_template_id UUID;
    v_feature_doc_template_id UUID;
    v_technical_doc_template_id UUID;
    v_metrics_doc_template_id UUID;
    v_instance_id UUID;
    v_instance_planner_step_id UUID;
    v_instance_pairwise_business_step_id UUID;
    v_instance_pairwise_feature_step_id UUID;
    v_instance_pairwise_technical_step_id UUID;
    v_instance_pairwise_metrics_step_id UUID;
    v_thesis_stage_id UUID;
    v_antithesis_stage_id UUID;
    v_synthesis_stage_id UUID;
    v_prd_prompt_id UUID;
    v_system_architecture_prompt_id UUID;
    v_tech_stack_prompt_id UUID;
    v_prd_step_id UUID;
    v_system_architecture_step_id UUID;
    v_tech_stack_step_id UUID;
BEGIN
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_header_planner_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md$PROMPT$,
        true,
        1,
        'Planner template that assembles the pairwise HeaderContext for Synthesis stage fan-out.',
        false,
        'docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_pairwise_planner_prompt_id;

    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE stage_slug = 'synthesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found; ensure base seeds are applied before running this migration.';
    END IF;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_business_case_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_business_case_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage pairwise business case synthesis turn template.',
        false,
        'docs/prompts/synthesis/synthesis_pairwise_business_case_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_pairwise_business_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_feature_spec_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_feature_spec_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage pairwise feature spec synthesis turn template.',
        false,
        'docs/prompts/synthesis/synthesis_pairwise_feature_spec_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_pairwise_feature_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_technical_approach_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_technical_approach_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage pairwise technical approach synthesis turn template.',
        false,
        'docs/prompts/synthesis/synthesis_pairwise_technical_approach_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_pairwise_technical_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_success_metrics_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_success_metrics_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage pairwise success metrics synthesis turn template.',
        false,
        'docs/prompts/synthesis/synthesis_pairwise_success_metrics_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_pairwise_metrics_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_business_case_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level business case consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_business_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_feature_spec_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level feature spec consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_feature_prompt_id;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        3,
        'Synthesize Feature Spec Across Models',
        'synthesize_document_feature_spec',
        3,
        'synthesize_document_feature_spec',
        'EXECUTE',
        v_doc_feature_prompt_id,
        'Turn',
        'AssembledDocumentJson',
        'all_to_one',
        '[{"type":"document","stage_slug":"synthesis","document_key":"synthesis_pairwise_feature_spec","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"synthesis_pairwise_feature_spec","stage_slug":"synthesis","relevance":1.0}]'::jsonb,
        '{"documents":[{"document_key":"synthesis_document_feature_spec","template_filename":"synthesis_document_feature_spec.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"feature_scope":[],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":[]}],"tradeoffs":[]}}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_doc_feature_step_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_technical_approach_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level technical approach consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_technical_prompt_id;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        3,
        'Synthesize Technical Approach Across Models',
        'synthesize_document_technical_approach',
        3,
        'synthesize_document_technical_approach',
        'EXECUTE',
        v_doc_technical_prompt_id,
        'Turn',
        'AssembledDocumentJson',
        'all_to_one',
        '[{"type":"document","stage_slug":"synthesis","document_key":"synthesis_pairwise_technical_approach","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"synthesis_pairwise_technical_approach","stage_slug":"synthesis","relevance":1.0}]'::jsonb,
        '{"documents":[{"document_key":"synthesis_document_technical_approach","template_filename":"synthesis_document_technical_approach.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"architecture_alignment":[],"risk_mitigations":[],"dependency_resolution":[],"architecture":"","components":[],"data":"","deployment":"","sequencing":"","open_questions":[]}}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_doc_technical_step_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_success_metrics_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level success metrics consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_metrics_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_final_header_planner_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_final_header_planner_v1.md$PROMPT$,
        true,
        1,
        'Planner template that prepares the final Synthesis HeaderContext before deliverable turns.',
        false,
        'docs/prompts/synthesis/synthesis_final_header_planner_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_final_header_prompt_id;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        3,
        'Synthesize Success Metrics Across Models',
        'synthesize_document_success_metrics',
        3,
        'synthesize_document_success_metrics',
        'EXECUTE',
        v_doc_metrics_prompt_id,
        'Turn',
        'AssembledDocumentJson',
        'all_to_one',
        '[{"type":"document","stage_slug":"synthesis","document_key":"synthesis_pairwise_success_metrics","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"synthesis_pairwise_success_metrics","stage_slug":"synthesis","relevance":1.0}]'::jsonb,
        '{"documents":[{"document_key":"synthesis_document_success_metrics","template_filename":"synthesis_document_success_metrics.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"metric_alignment":[],"tradeoffs":[],"validation_checks":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"next_steps":""}}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_doc_metrics_step_id;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        4,
        'Generate Final Synthesis Header',
        'generate_final_synthesis_header',
        4,
        NULL,
        'PLAN',
        v_final_header_prompt_id,
        'Planner',
        'HeaderContext',
        'all_to_one',
        '[{"type":"seed_prompt","stage_slug":"synthesis","document_key":"seed_prompt","required":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"seed_prompt","stage_slug":"synthesis","relevance":0.6},{"document_key":"synthesis_document_business_case","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","stage_slug":"synthesis","relevance":0.95},{"document_key":"synthesis_document_technical_approach","stage_slug":"synthesis","relevance":0.95},{"document_key":"synthesis_document_success_metrics","stage_slug":"synthesis","relevance":0.9}]'::jsonb,
        '{"system_materials":{"executive_summary":"Outline/index of all outputs in this response and how they connect to the objective","input_artifacts_summary":"Succinct summary of prior proposals, critiques, and user feedback included in this synthesis","stage_rationale":"Decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints","progress_update":"For continuation turns, summarize what is complete vs remaining; omit on first turn","signal_sources":["synthesis_document_business_case","synthesis_document_feature_spec","synthesis_document_technical_approach","synthesis_document_success_metrics"],"decision_criteria":["feasibility","complexity","security","performance","maintainability","scalability","cost","time_to_market","compliance_risk","alignment_with_constraints"],"validation_checkpoint":["requirements addressed","best practices applied","feasible & compliant","references integrated"],"quality_standards":["security-first","maintainable","scalable","performance-aware"],"continuation_policy":"If the header context cannot list every deliverable directive in one response, continue with reason 'length' and resume detailing the remaining deliverable instructions."},"header_context_artifact":{"type":"header_context","document_key":"header_context","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"prd","content_to_include":{"mvp_description":"","user_stories":[],"feature_specifications":[]}} ,{"document_key":"system_architecture_overview","content_to_include":{"architecture_summary":"","services":[],"data_flows":[],"security_measures":[],"integration_points":[]}}, {"document_key":"tech_stack_recommendations","content_to_include":{"components":[],"recommended_options":[],"alternatives":[],"tradeoffs":[]}}],"files_to_generate":[{"template_filename":"synthesis_product_requirements_document.md","from_document_key":"prd"},{"template_filename":"synthesis_system_architecture_overview.md","from_document_key":"system_architecture_overview"},{"template_filename":"synthesis_tech_stack_recommendations.md","from_document_key":"tech_stack_recommendations"}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_final_header_step_id;

    INSERT INTO public.dialectic_stage_recipe_edges (
        id,
        instance_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_instance_id, v_pairwise_business_step_id, v_doc_business_step_id),
        (gen_random_uuid(), v_instance_id, v_pairwise_feature_step_id, v_doc_feature_step_id),
        (gen_random_uuid(), v_instance_id, v_pairwise_technical_step_id, v_doc_technical_step_id),
        (gen_random_uuid(), v_instance_id, v_pairwise_metrics_step_id, v_doc_metrics_step_id),
        (gen_random_uuid(), v_instance_id, v_doc_business_step_id, v_final_header_step_id),
        (gen_random_uuid(), v_instance_id, v_doc_feature_step_id, v_final_header_step_id),
        (gen_random_uuid(), v_instance_id, v_doc_technical_step_id, v_final_header_step_id),
        (gen_random_uuid(), v_instance_id, v_doc_metrics_step_id, v_final_header_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        3,
        'Synthesize Feature Spec Across Models',
        'synthesize_document_feature_spec',
        3,
        'synthesize_document_feature_spec',
        'EXECUTE',
        v_doc_feature_prompt_id,
        'Turn',
        'AssembledDocumentJson',
        'all_to_one',
        '[{"type":"document","stage_slug":"synthesis","document_key":"synthesis_pairwise_feature_spec","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"synthesis_pairwise_feature_spec","stage_slug":"synthesis","relevance":1.0}]'::jsonb,
        '{"documents":[{"document_key":"synthesis_document_feature_spec","template_filename":"synthesis_document_feature_spec.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"feature_scope":[],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":[]}],"tradeoffs":[]}}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_doc_feature_step_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_business_case_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level business case consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_business_prompt_id;

    INSERT INTO public.dialectic_stage_recipes (
        id,
        stage_id,
        step_number,
        name,
        step_slug,
        parallel_group,
        branch_key,
        job_type,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        3,
        'Synthesize Business Case Across Models',
        'synthesize_document_business_case',
        3,
        'synthesize_document_business_case',
        'EXECUTE',
        v_doc_business_prompt_id,
        'Turn',
        'AssembledDocumentJson',
        'all_to_one',
        '[{"type":"document","stage_slug":"synthesis","document_key":"synthesis_pairwise_business_case","required":true,"multiple":true}]'::jsonb,
        '[{"document_key":"synthesis_pairwise_business_case","stage_slug":"synthesis","relevance":1.0}]'::jsonb,
        '{"documents":[{"document_key":"synthesis_document_business_case","template_filename":"synthesis_document_business_case.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"executive_summary":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"resolved_positions":[],"open_questions":[],"next_steps":"","proposal_references":[]}}]}'::jsonb
    )
    ON CONFLICT (stage_id, step_slug) DO
        UPDATE SET
            name = EXCLUDED.name,
            parallel_group = EXCLUDED.parallel_group,
            job_type = EXCLUDED.job_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            prompt_type = EXCLUDED.prompt_type,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_doc_business_step_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_feature_spec_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level feature spec consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_feature_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_technical_approach_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level technical approach consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_technical_prompt_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_success_metrics_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage document-level success metrics consolidation turn template.',
        false,
        'docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_doc_metrics_prompt_id;

    INSERT INTO public.dialectic_recipe_templates (
        id,
        recipe_name,
        recipe_version,
        display_name,
        domain_key,
        description
    ) VALUES (
        gen_random_uuid(),
        'synthesis_v1',
        1,
        'Synthesis Refinement',
        'software_development',
        'Stage recipe that orchestrates pairwise synthesis, consolidation, and final deliverables.'
    )
    ON CONFLICT (recipe_name, recipe_version) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            domain_key = EXCLUDED.domain_key,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = now()
    RETURNING id INTO v_template_id;

    INSERT INTO public.dialectic_stage_recipe_instances (
        id,
        stage_id,
        template_id
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        v_template_id
    )
    ON CONFLICT (stage_id) DO UPDATE
        SET template_id = EXCLUDED.template_id,
            updated_at = now()
    RETURNING id INTO v_instance_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        template_key,
        storage_path,
        description,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_business_case',
        'docs/templates/synthesis/synthesis_pairwise_business_case.json',
        'Template for pairwise business case synthesis outputs.',
        now(),
        now()
    )
    ON CONFLICT (template_key) DO UPDATE
        SET storage_path = EXCLUDED.storage_path,
            description = EXCLUDED.description,
            updated_at = now()
    RETURNING id INTO v_business_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        template_key,
        storage_path,
        description,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_feature_spec',
        'docs/templates/synthesis/synthesis_pairwise_feature_spec.json',
        'Template for pairwise feature spec synthesis outputs.',
        now(),
        now()
    )
    ON CONFLICT (template_key) DO UPDATE
        SET storage_path = EXCLUDED.storage_path,
            description = EXCLUDED.description,
            updated_at = now()
    RETURNING id INTO v_feature_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        template_key,
        storage_path,
        description,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_technical_approach',
        'docs/templates/synthesis/synthesis_pairwise_technical_approach.json',
        'Template for pairwise technical approach synthesis outputs.',
        now(),
        now()
    )
    ON CONFLICT (template_key) DO UPDATE
        SET storage_path = EXCLUDED.storage_path,
            description = EXCLUDED.description,
            updated_at = now()
    RETURNING id INTO v_technical_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        template_key,
        storage_path,
        description,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_success_metrics',
        'docs/templates/synthesis/synthesis_pairwise_success_metrics.json',
        'Template for pairwise success metrics synthesis outputs.',
        now(),
        now()
    )
    ON CONFLICT (template_key) DO UPDATE
        SET storage_path = EXCLUDED.storage_path,
            description = EXCLUDED.description,
            updated_at = now()
    RETURNING id INTO v_metrics_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_business_case',
        'JSON template for consolidated synthesis business case outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_document_business_case.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_business_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_feature_spec',
        'JSON template for consolidated synthesis feature spec outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_document_feature_spec.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_feature_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_technical_approach',
        'JSON template for consolidated synthesis technical approach outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_document_technical_approach.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_technical_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_document_success_metrics',
        'JSON template for consolidated synthesis success metrics outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_document_success_metrics.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_metrics_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_business_case',
        'JSON template for pairwise business case synthesis outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_pairwise_business_case.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_business_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_feature_spec',
        'JSON template for pairwise feature spec synthesis outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_pairwise_feature_spec.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_feature_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_technical_approach',
        'JSON template for pairwise technical approach synthesis outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_pairwise_technical_approach.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_technical_doc_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'synthesis_pairwise_success_metrics',
        'JSON template for pairwise success metrics synthesis outputs.',
        'prompt-templates',
        'docs/templates/synthesis',
        'synthesis_pairwise_success_metrics.json',
        now(),
        now()
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_metrics_doc_template_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
        parallel_group,
        branch_key,
        step_key,
        step_slug,
        step_name,
        step_description,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        1,
        NULL,
        NULL,
        'synthesis_prepare_pairwise_header',
        'prepare-pairwise-synthesis-header',
        'Prepare Pairwise Synthesis Header',
        'Generate HeaderContext JSON that guides pairwise synthesis turns across thesis lineages and antithesis critiques.',
        'PLAN',
        'Planner',
        v_pairwise_planner_prompt_id,
        'HeaderContext',
        'all_to_one',
        $$[
          {"type":"seed_prompt","stage_slug":"synthesis","document_key":"seed_prompt","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"business_case","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"feature_spec","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"technical_approach","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"success_metrics","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"non_functional_requirements","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"risk_register","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"dependency_map","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"non_functional_requirements","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"risk_register","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"dependency_map","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false,"multiple":true}
        ]$$::jsonb,
        $$[
          {"document_key":"seed_prompt","stage_slug":"synthesis","relevance":0.6},
          {"document_key":"business_case","stage_slug":"thesis","relevance":1.0},
          {"document_key":"feature_spec","stage_slug":"thesis","relevance":0.95},
          {"document_key":"technical_approach","stage_slug":"thesis","relevance":0.95},
          {"document_key":"success_metrics","stage_slug":"thesis","relevance":0.9},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"risk_register","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"dependency_map","stage_slug":"antithesis","relevance":0.8},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","type":"feedback","relevance":0.75},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","type":"feedback","relevance":0.7},
          {"document_key":"risk_register","stage_slug":"antithesis","type":"feedback","relevance":0.65},
          {"document_key":"dependency_map","stage_slug":"antithesis","type":"feedback","relevance":0.6},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.55}
        ]$$::jsonb,
        $$
        {
          "system_materials": {
            "executive_summary": "Summarize the intent of merging each Thesis document with its corresponding Antithesis critiques.",
            "input_artifacts_summary": "Identify the thesis and antithesis artifacts that will be combined during pairwise synthesis.",
            "stage_rationale": "Explain that this stage ensures consistent pairwise synthesis before consolidating documents across models.",
            "decision_criteria": [
              "feasibility",
              "risk",
              "non_functional_requirements",
              "dependency_alignment",
              "stakeholder_objectives"
            ],
            "continuation_policy": "If a pairwise synthesis turn truncates, resume at the last unresolved section using the continuation prompt pattern."
          },
          "header_context_artifact": {
            "type": "header_context",
            "document_key": "header_context_pairwise",
            "artifact_class": "header_context",
            "file_type": "json"
          },
          "context_for_documents": [
            {
              "document_key": "synthesis_pairwise_business_case",
              "content_to_include": {
                "thesis_document": "business_case",
                "critique_document": "business_case_critique",
                "comparison_signal": "comparison_vector"
              }
            },
            {
              "document_key": "synthesis_pairwise_feature_spec",
              "content_to_include": {
                "thesis_document": "feature_spec",
                "feasibility_document": "technical_feasibility_assessment",
                "nfr_document": "non_functional_requirements",
                "comparison_signal": "comparison_vector"
              }
            },
            {
              "document_key": "synthesis_pairwise_technical_approach",
              "content_to_include": {
                "thesis_document": "technical_approach",
                "risk_document": "risk_register",
                "dependency_document": "dependency_map"
              }
            },
            {
              "document_key": "synthesis_pairwise_success_metrics",
              "content_to_include": {
                "thesis_document": "success_metrics",
                "critique_document": "business_case_critique",
                "comparison_signal": "comparison_vector"
              }
            }
          ]
        }
        $$::jsonb
    )
    ON CONFLICT (template_id, step_key) DO UPDATE
        SET step_number = EXCLUDED.step_number,
            step_slug = EXCLUDED.step_slug,
            step_name = EXCLUDED.step_name,
            step_description = EXCLUDED.step_description,
            job_type = EXCLUDED.job_type,
            prompt_type = EXCLUDED.prompt_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_planner_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        instance_id,
        template_step_id,
        step_key,
        step_slug,
        step_name,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_planner_step_id,
        'synthesis_prepare_pairwise_header',
        'prepare-pairwise-synthesis-header',
        'Prepare Pairwise Synthesis Header',
        'PLAN',
        'Planner',
        v_pairwise_planner_prompt_id,
        'HeaderContext',
        'all_to_one',
        $$[
          {"type":"seed_prompt","stage_slug":"synthesis","document_key":"seed_prompt","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"business_case","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"feature_spec","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"technical_approach","required":true,"multiple":true},
          {"type":"document","stage_slug":"thesis","document_key":"success_metrics","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"non_functional_requirements","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"risk_register","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"dependency_map","required":true,"multiple":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"non_functional_requirements","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"risk_register","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"dependency_map","required":false,"multiple":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false,"multiple":true}
        ]$$::jsonb,
        $$[
          {"document_key":"seed_prompt","stage_slug":"synthesis","relevance":0.6},
          {"document_key":"business_case","stage_slug":"thesis","relevance":1.0},
          {"document_key":"feature_spec","stage_slug":"thesis","relevance":0.95},
          {"document_key":"technical_approach","stage_slug":"thesis","relevance":0.95},
          {"document_key":"success_metrics","stage_slug":"thesis","relevance":0.9},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"risk_register","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"dependency_map","stage_slug":"antithesis","relevance":0.8},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","type":"feedback","relevance":0.75},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","type":"feedback","relevance":0.7},
          {"document_key":"risk_register","stage_slug":"antithesis","type":"feedback","relevance":0.65},
          {"document_key":"dependency_map","stage_slug":"antithesis","type":"feedback","relevance":0.6},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.55}
        ]$$::jsonb,
        '[]'::jsonb,
        NULL,
        NULL,
        1
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_planner_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
        parallel_group,
        branch_key,
        step_key,
        step_slug,
        step_name,
        step_description,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        2,
        2,
        'synthesis_pairwise_business_case',
        'synthesis_pairwise_business_case',
        'pairwise-synthesis-business-case',
        'Pairwise Synthesis – Business Case',
        'Combine the thesis business case with critiques and comparison vector signals into a resolved narrative.',
        'EXECUTE',
        'Turn',
        v_pairwise_business_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"business_case","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"business_case","stage_slug":"thesis","relevance":1.0},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8}
        ]$$::jsonb,
        $$
        {
          "documents": [
            {
              "document_key": "synthesis_pairwise_business_case",
              "template_filename": "synthesis_pairwise_business_case.json",
              "artifact_class": "assembled_json",
              "file_type": "json",
              "lineage_key": "<derived from thesis artifact>",
              "source_model_slug": "<derived from thesis artifact>",
              "match_keys": [
                "<derived from antithesis reviewer or reviewer combination>"
              ],
              "content_to_include": {
                "thesis_summary": "",
                "critique_alignment": "",
                "resolved_positions": [],
                "open_questions": []
              }
            }
          ]
        }
        $$::jsonb
    )
    ON CONFLICT (template_id, step_key) DO UPDATE
        SET step_number = EXCLUDED.step_number,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            step_slug = EXCLUDED.step_slug,
            step_name = EXCLUDED.step_name,
            step_description = EXCLUDED.step_description,
            job_type = EXCLUDED.job_type,
            prompt_type = EXCLUDED.prompt_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_pairwise_business_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        instance_id,
        template_step_id,
        step_key,
        step_slug,
        step_name,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_pairwise_business_step_id,
        'synthesis_pairwise_business_case',
        'pairwise-synthesis-business-case',
        'Pairwise Synthesis – Business Case',
        'EXECUTE',
        'Turn',
        v_pairwise_business_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"business_case","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"business_case","stage_slug":"thesis","relevance":1.0},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8}
        ]$$::jsonb,
        '[]'::jsonb,
        2,
        'synthesis_pairwise_business_case',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_pairwise_business_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
        parallel_group,
        branch_key,
        step_key,
        step_slug,
        step_name,
        step_description,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        2,
        2,
        'synthesis_pairwise_feature_spec',
        'synthesis_pairwise_feature_spec',
        'pairwise-synthesis-feature-spec',
        'Pairwise Synthesis – Feature Spec',
        'Merge feature scope with feasibility, non-functional insights, and comparison signals.',
        'EXECUTE',
        'Turn',
        v_pairwise_feature_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"feature_spec","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"non_functional_requirements","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"non_functional_requirements","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"feature_spec","stage_slug":"thesis","relevance":1.0},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","type":"feedback","relevance":0.75},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.7}
        ]$$::jsonb,
        $$
        {
          "documents": [
            {
              "document_key": "synthesis_pairwise_feature_spec",
              "template_filename": "synthesis_pairwise_feature_spec.json",
              "artifact_class": "assembled_json",
              "file_type": "json",
              "lineage_key": "<derived from thesis artifact>",
              "source_model_slug": "<derived from thesis artifact>",
              "match_keys": [
                "<derived from antithesis reviewer or reviewer combination>"
              ],
              "content_to_include": {
                "feature_scope": [],
                "feasibility_insights": [],
                "non_functional_alignment": [],
                "score_adjustments": []
              }
            }
          ]
        }
        $$::jsonb
    )
    ON CONFLICT (template_id, step_key) DO UPDATE
        SET step_number = EXCLUDED.step_number,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            step_slug = EXCLUDED.step_slug,
            step_name = EXCLUDED.step_name,
            step_description = EXCLUDED.step_description,
            job_type = EXCLUDED.job_type,
            prompt_type = EXCLUDED.prompt_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_pairwise_feature_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        instance_id,
        template_step_id,
        step_key,
        step_slug,
        step_name,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_pairwise_feature_step_id,
        'synthesis_pairwise_feature_spec',
        'pairwise-synthesis-feature-spec',
        'Pairwise Synthesis – Feature Spec',
        'EXECUTE',
        'Turn',
        v_pairwise_feature_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"feature_spec","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"non_functional_requirements","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"technical_feasibility_assessment","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"non_functional_requirements","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"feature_spec","stage_slug":"thesis","relevance":1.0},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"technical_feasibility_assessment","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"non_functional_requirements","stage_slug":"antithesis","type":"feedback","relevance":0.75},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.7}
        ]$$::jsonb,
        '[]'::jsonb,
        2,
        'synthesis_pairwise_feature_spec',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_pairwise_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
        parallel_group,
        branch_key,
        step_key,
        step_slug,
        step_name,
        step_description,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        2,
        2,
        'synthesis_pairwise_technical_approach',
        'synthesis_pairwise_technical_approach',
        'pairwise-synthesis-technical-approach',
        'Pairwise Synthesis – Technical Approach',
        'Combine thesis technical approach with antithesis risk and dependency findings.',
        'EXECUTE',
        'Turn',
        v_pairwise_technical_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"technical_approach","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"risk_register","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"dependency_map","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"risk_register","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"dependency_map","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"technical_approach","stage_slug":"thesis","relevance":1.0},
          {"document_key":"risk_register","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"dependency_map","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"risk_register","stage_slug":"antithesis","type":"feedback","relevance":0.78},
          {"document_key":"dependency_map","stage_slug":"antithesis","type":"feedback","relevance":0.74}
        ]$$::jsonb,
        $$
        {
          "documents": [
            {
              "document_key": "synthesis_pairwise_technical_approach",
              "template_filename": "synthesis_pairwise_technical_approach.json",
              "artifact_class": "assembled_json",
              "file_type": "json",
              "lineage_key": "<derived from thesis artifact>",
              "source_model_slug": "<derived from thesis artifact>",
              "match_keys": [
                "<derived from antithesis reviewer or reviewer combination>"
              ],
              "content_to_include": {
                "architecture_alignment": [],
                "risk_mitigations": [],
                "dependency_resolution": []
              }
            }
          ]
        }
        $$::jsonb
    )
    ON CONFLICT (template_id, step_key) DO UPDATE
        SET step_number = EXCLUDED.step_number,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            step_slug = EXCLUDED.step_slug,
            step_name = EXCLUDED.step_name,
            step_description = EXCLUDED.step_description,
            job_type = EXCLUDED.job_type,
            prompt_type = EXCLUDED.prompt_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_pairwise_technical_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        instance_id,
        template_step_id,
        step_key,
        step_slug,
        step_name,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_pairwise_technical_step_id,
        'synthesis_pairwise_technical_approach',
        'pairwise-synthesis-technical-approach',
        'Pairwise Synthesis – Technical Approach',
        'EXECUTE',
        'Turn',
        v_pairwise_technical_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"technical_approach","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"risk_register","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"dependency_map","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"risk_register","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"dependency_map","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"technical_approach","stage_slug":"thesis","relevance":1.0},
          {"document_key":"risk_register","stage_slug":"antithesis","relevance":0.95},
          {"document_key":"dependency_map","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"risk_register","stage_slug":"antithesis","type":"feedback","relevance":0.78},
          {"document_key":"dependency_map","stage_slug":"antithesis","type":"feedback","relevance":0.74}
        ]$$::jsonb,
        '[]'::jsonb,
        2,
        'synthesis_pairwise_technical_approach',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_pairwise_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
        parallel_group,
        branch_key,
        step_key,
        step_slug,
        step_name,
        step_description,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        2,
        2,
        'synthesis_pairwise_success_metrics',
        'synthesis_pairwise_success_metrics',
        'pairwise-synthesis-success-metrics',
        'Combine thesis success metrics with antithesis critique signals into a resolved set of measurable outcomes.',
        'EXECUTE',
        'Turn',
        v_pairwise_metrics_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"success_metrics","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"success_metrics","stage_slug":"thesis","relevance":1.0},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.75}
        ]$$::jsonb,
        $$
        {
          "documents": [
            {
              "document_key": "synthesis_pairwise_success_metrics",
              "template_filename": "synthesis_pairwise_success_metrics.json",
              "artifact_class": "assembled_json",
              "file_type": "json",
              "lineage_key": "<derived from thesis artifact>",
              "source_model_slug": "<derived from thesis artifact>",
              "match_keys": [
                "<derived from antithesis reviewer or reviewer combination>"
              ],
              "content_to_include": {
                "metric_alignment": [],
                "tradeoffs": [],
                "validation_checks": []
              }
            }
          ]
        }
        $$::jsonb
    )
    ON CONFLICT (template_id, step_key) DO UPDATE
        SET step_number = EXCLUDED.step_number,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            step_slug = EXCLUDED.step_slug,
            step_name = EXCLUDED.step_name,
            step_description = EXCLUDED.step_description,
            job_type = EXCLUDED.job_type,
            prompt_type = EXCLUDED.prompt_type,
            prompt_template_id = EXCLUDED.prompt_template_id,
            output_type = EXCLUDED.output_type,
            granularity_strategy = EXCLUDED.granularity_strategy,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_pairwise_metrics_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        instance_id,
        template_step_id,
        step_key,
        step_slug,
        step_name,
        job_type,
        prompt_type,
        prompt_template_id,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_pairwise_metrics_step_id,
        'synthesis_pairwise_success_metrics',
        'pairwise-synthesis-success-metrics',
        'Pairwise Synthesis – Success Metrics',
        'EXECUTE',
        'Turn',
        v_pairwise_metrics_prompt_id,
        'AssembledDocumentJson',
        'one_to_one',
        $$[
          {"type":"header_context","stage_slug":"synthesis","document_key":"header_context_pairwise","required":true},
          {"type":"document","stage_slug":"thesis","document_key":"success_metrics","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"business_case_critique","required":true},
          {"type":"document","stage_slug":"antithesis","document_key":"comparison_vector","required":true},
          {"type":"feedback","stage_slug":"antithesis","document_key":"business_case_critique","required":false},
          {"type":"feedback","stage_slug":"antithesis","document_key":"comparison_vector","required":false}
        ]$$::jsonb,
        $$[
          {"document_key":"header_context_pairwise","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"success_metrics","stage_slug":"thesis","relevance":1.0},
          {"document_key":"business_case_critique","stage_slug":"antithesis","relevance":0.9},
          {"document_key":"comparison_vector","stage_slug":"antithesis","relevance":0.85},
          {"document_key":"business_case_critique","stage_slug":"antithesis","type":"feedback","relevance":0.8},
          {"document_key":"comparison_vector","stage_slug":"antithesis","type":"feedback","relevance":0.75}
        ]$$::jsonb,
        '[]'::jsonb,
        2,
        'synthesis_pairwise_success_metrics',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_pairwise_metrics_step_id;

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_prd_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_prd_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage final Product Requirements Document turn template.',
        false,
        'docs/prompts/synthesis/synthesis_prd_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now();

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_system_architecture_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_system_architecture_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage final system architecture overview turn template.',
        false,
        'docs/prompts/synthesis/synthesis_system_architecture_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now();

    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        prompt_file_path
    ) VALUES (
        gen_random_uuid(),
        'synthesis_tech_stack_turn_v1',
        $PROMPT$\path=docs/prompts/synthesis/synthesis_tech_stack_turn_v1.md$PROMPT$,
        true,
        1,
        'Synthesis stage final tech stack recommendations turn template.',
        false,
        'docs/prompts/synthesis/synthesis_tech_stack_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now();

    IF v_instance_planner_step_id IS NOT NULL THEN
        IF v_pairwise_business_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (
                id,
                template_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_template_id,
                v_planner_step_id,
                v_pairwise_business_step_id
            )
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_pairwise_feature_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (
                id,
                template_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_template_id,
                v_planner_step_id,
                v_pairwise_feature_step_id
            )
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_pairwise_technical_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (
                id,
                template_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_template_id,
                v_planner_step_id,
                v_pairwise_technical_step_id
            )
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_pairwise_metrics_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (
                id,
                template_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_template_id,
                v_planner_step_id,
                v_pairwise_metrics_step_id
            )
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
    END IF;

    IF v_instance_planner_step_id IS NOT NULL THEN
        IF v_instance_pairwise_business_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_pairwise_business_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_pairwise_feature_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_pairwise_feature_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_pairwise_technical_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_pairwise_technical_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_pairwise_metrics_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_pairwise_metrics_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
    END IF;

    -- Set recipe_template_id for synthesis stage
    UPDATE public.dialectic_stages
    SET recipe_template_id = v_template_id
    WHERE id = v_stage_id;
END $$;



