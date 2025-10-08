-- Step 6a: Update synthesis stage record
DO $$
DECLARE
    v_stage_id UUID;
BEGIN
    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE stage_slug = 'synthesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found; ensure base seeds are applied before running Step 6.a';
    END IF;

    UPDATE public.dialectic_stages
    SET recipe_name = 'synthesis_v1',
        updated_at = now()
    WHERE id = v_stage_id;
END $$;

-- Step 5c: Insert final deliverable turn steps for the synthesis stage
DO $$
DECLARE
    v_stage_id UUID;
    v_prd_prompt_id UUID;
    v_arch_prompt_id UUID;
    v_stack_prompt_id UUID;
    v_final_header_step_id UUID;
    v_prd_step_id UUID;
    v_arch_step_id UUID;
    v_stack_step_id UUID;
BEGIN
    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE stage_slug = 'synthesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found; ensure prior seeds applied before running this migration.';
    END IF;

    SELECT id INTO v_prd_prompt_id FROM public.system_prompts WHERE name = 'synthesis_prd_turn_v1';
    IF v_prd_prompt_id IS NULL THEN
        RAISE EXCEPTION 'system_prompts entry synthesis_prd_turn_v1 not found. Seed step 5.b before 5.c';
    END IF;

    SELECT id INTO v_arch_prompt_id FROM public.system_prompts WHERE name = 'synthesis_system_architecture_turn_v1';
    IF v_arch_prompt_id IS NULL THEN
        RAISE EXCEPTION 'system_prompts entry synthesis_system_architecture_turn_v1 not found. Seed step 5.b before 5.c';
    END IF;

    SELECT id INTO v_stack_prompt_id FROM public.system_prompts WHERE name = 'synthesis_tech_stack_turn_v1';
    IF v_stack_prompt_id IS NULL THEN
        RAISE EXCEPTION 'system_prompts entry synthesis_tech_stack_turn_v1 not found. Seed step 5.b before 5.c';
    END IF;

    SELECT id INTO v_final_header_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE stage_id = v_stage_id
      AND step_slug = 'generate-final-synthesis-header';
    IF v_final_header_step_id IS NULL THEN
        RAISE EXCEPTION 'Final synthesis header step not found; run Step 4 migration before Step 5.c';
    END IF;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        stage_id,
        step_number,
        step_slug,
        job_type,
        name,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        created_by
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        5,
        'render-prd',
        'EXECUTE',
        'Render Final PRD',
        v_prd_prompt_id,
        'Turn',
        'RenderedDocument',
        'all_to_one',
        '[{"type":"header_context","stage_slug":"synthesis","document_key":"header_context","required":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]',
        '[{"document_key":"header_context","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_business_case","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","stage_slug":"synthesis","relevance":0.9},{"document_key":"synthesis_document_technical_approach","stage_slug":"synthesis","relevance":0.85},{"document_key":"synthesis_document_success_metrics","stage_slug":"synthesis","relevance":0.8}]',
        '{"documents":[{"document_key":"prd","template_filename":"synthesis_product_requirements_document.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"executive_summary":"","mvp_description":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"feature_scope":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","tradeoffs":[]}],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"resolved_positions":[],"open_questions":[],"next_steps":[],"proposal_references":[],"release_plan":[],"assumptions":[],"open_decisions":[],"implementation_risks":[],"stakeholder_communications":[]}}],"files_to_generate":[{"template_filename":"synthesis_product_requirements_document.md","from_document_key":"prd"}]}',
        5,
        'prd',
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (stage_id, step_slug) DO UPDATE
        SET prompt_template_id = EXCLUDED.prompt_template_id,
            outputs_required = EXCLUDED.outputs_required,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            updated_at = now()
    RETURNING id INTO v_prd_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        stage_id,
        step_number,
        step_slug,
        job_type,
        name,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        created_by
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        5,
        'render-system-architecture-overview',
        'EXECUTE',
        'Render Final System Architecture Overview',
        v_arch_prompt_id,
        'Turn',
        'RenderedDocument',
        'all_to_one',
        '[{"type":"header_context","stage_slug":"synthesis","document_key":"header_context","required":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]',
        '[{"document_key":"header_context","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_technical_approach","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","stage_slug":"synthesis","relevance":0.9},{"document_key":"synthesis_document_business_case","stage_slug":"synthesis","relevance":0.82},{"document_key":"synthesis_document_success_metrics","stage_slug":"synthesis","relevance":0.78}]',
        '{"documents":[{"document_key":"system_architecture_overview","template_filename":"synthesis_system_architecture_overview.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"architecture_summary":"","architecture":"","services":[],"components":[],"data_flows":[],"interfaces":[],"integration_points":[],"dependency_resolution":[],"conflict_flags":[],"sequencing":"","risk_mitigations":[],"risk_signals":[],"security_measures":[],"observability_strategy":[],"scalability_plan":[],"resilience_strategy":[],"compliance_controls":[],"open_questions":[]}}],"files_to_generate":[{"template_filename":"synthesis_system_architecture_overview.md","from_document_key":"system_architecture_overview"}]}',
        5,
        'system_architecture_overview',
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (stage_id, step_slug) DO UPDATE
        SET prompt_template_id = EXCLUDED.prompt_template_id,
            outputs_required = EXCLUDED.outputs_required,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            updated_at = now()
    RETURNING id INTO v_arch_step_id;

    INSERT INTO public.dialectic_stage_recipe_steps (
        id,
        stage_id,
        step_number,
        step_slug,
        job_type,
        name,
        prompt_template_id,
        prompt_type,
        output_type,
        granularity_strategy,
        inputs_required,
        inputs_relevance,
        outputs_required,
        parallel_group,
        branch_key,
        created_by
    ) VALUES (
        gen_random_uuid(),
        v_stage_id,
        5,
        'render-tech-stack-recommendations',
        'EXECUTE',
        'Render Final Tech Stack Recommendations',
        v_stack_prompt_id,
        'Turn',
        'RenderedDocument',
        'all_to_one',
        '[{"type":"header_context","stage_slug":"synthesis","document_key":"header_context","required":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true},{"type":"document","stage_slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true}]',
        '[{"document_key":"header_context","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_technical_approach","stage_slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","stage_slug":"synthesis","relevance":0.88},{"document_key":"synthesis_document_success_metrics","stage_slug":"synthesis","relevance":0.85},{"document_key":"synthesis_document_business_case","stage_slug":"synthesis","relevance":0.8}]',
        '{"documents":[{"document_key":"tech_stack_recommendations","template_filename":"synthesis_tech_stack_recommendations.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[],"components":[{"component_name":"","recommended_option":"","rationale":"","alternatives":[],"tradeoffs":[],"risk_signals":[],"integration_requirements":[],"operational_owners":[],"migration_plan":[]}],"open_questions":[],"next_steps":[]}}],"files_to_generate":[{"template_filename":"synthesis_tech_stack_recommendations.md","from_document_key":"tech_stack_recommendations"}]}',
        5,
        'tech_stack_recommendations',
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (stage_id, step_slug) DO UPDATE
        SET prompt_template_id = EXCLUDED.prompt_template_id,
            outputs_required = EXCLUDED.outputs_required,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            updated_at = now()
    RETURNING id INTO v_stack_step_id;

    INSERT INTO public.dialectic_stage_recipe_edges (
        id,
        instance_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_instance_id, v_final_header_step_id, v_prd_step_id),
        (gen_random_uuid(), v_instance_id, v_final_header_step_id, v_arch_step_id),
        (gen_random_uuid(), v_instance_id, v_final_header_step_id, v_stack_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
END $$;

-- Step 5d: Add recipe edges from the final planner to final deliverable steps
DO $$
DECLARE
    v_template_id UUID;
    v_instance_id UUID;
    v_planner_template_step_id UUID;
    v_prd_template_step_id UUID;
    v_arch_template_step_id UUID;
    v_stack_template_step_id UUID;
    v_planner_instance_step_id UUID;
    v_prd_instance_step_id UUID;
    v_arch_instance_step_id UUID;
    v_stack_instance_step_id UUID;
BEGIN
    SELECT id INTO v_template_id FROM public.dialectic_recipe_templates WHERE stage_slug = 'synthesis';
    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis recipe template missing. Execute initial synthesis migration first.';
    END IF;

    SELECT id INTO v_instance_id FROM public.dialectic_stage_recipe_instances WHERE stage_id = (SELECT id FROM public.dialectic_stages WHERE stage_slug = 'synthesis');
    IF v_instance_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage instance missing. Execute initial synthesis migration first.';
    END IF;

    SELECT id INTO v_planner_template_step_id FROM public.dialectic_recipe_template_steps WHERE template_id = v_template_id AND step_slug = 'generate-final-synthesis-header';
    SELECT id INTO v_prd_template_step_id FROM public.dialectic_recipe_template_steps WHERE template_id = v_template_id AND step_slug = 'render-prd';
    SELECT id INTO v_arch_template_step_id FROM public.dialectic_recipe_template_steps WHERE template_id = v_template_id AND step_slug = 'render-system-architecture-overview';
    SELECT id INTO v_stack_template_step_id FROM public.dialectic_recipe_template_steps WHERE template_id = v_template_id AND step_slug = 'render-tech-stack-recommendations';

    SELECT id INTO v_planner_instance_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_slug = 'generate-final-synthesis-header';
    SELECT id INTO v_prd_instance_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_slug = 'render-prd';
    SELECT id INTO v_arch_instance_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_slug = 'render-system-architecture-overview';
    SELECT id INTO v_stack_instance_step_id FROM public.dialectic_stage_recipe_steps WHERE instance_id = v_instance_id AND step_slug = 'render-tech-stack-recommendations';

    IF v_planner_template_step_id IS NOT NULL THEN
        IF v_prd_template_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (id, template_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_template_id, v_planner_template_step_id, v_prd_template_step_id)
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
        IF v_arch_template_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (id, template_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_template_id, v_planner_template_step_id, v_arch_template_step_id)
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
        IF v_stack_template_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_recipe_template_edges (id, template_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_template_id, v_planner_template_step_id, v_stack_template_step_id)
            ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
    END IF;

    IF v_planner_instance_step_id IS NOT NULL THEN
        IF v_prd_instance_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (id, instance_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_instance_id, v_planner_instance_step_id, v_prd_instance_step_id)
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
        IF v_arch_instance_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (id, instance_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_instance_id, v_planner_instance_step_id, v_arch_instance_step_id)
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
        IF v_stack_instance_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (id, instance_id, from_step_id, to_step_id)
            VALUES (gen_random_uuid(), v_instance_id, v_planner_instance_step_id, v_stack_instance_step_id)
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
    END IF;
END $$;

-- Step 5e: Seed final rendered markdown templates
DO $$
DECLARE
    v_prd_template_id UUID;
    v_arch_template_id UUID;
    v_stack_template_id UUID;
BEGIN
    INSERT INTO public.dialectic_document_templates (
        id,
        document_key,
        stage_slug,
        template_filename,
        template_type,
        description,
        template_text,
        created_by
    ) VALUES (
        gen_random_uuid(),
        'prd',
        'synthesis',
        'synthesis_product_requirements_document.md',
        'markdown',
        'Renderer template for Synthesis Product Requirements Document.',
        $DOC$\path=docs/templates/synthesis/synthesis_product_requirements_document.md$DOC$,
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (document_key, stage_slug) DO UPDATE
        SET template_filename = EXCLUDED.template_filename,
            template_type = EXCLUDED.template_type,
            description = EXCLUDED.description,
            template_text = EXCLUDED.template_text,
            updated_at = now()
    RETURNING id INTO v_prd_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        document_key,
        stage_slug,
        template_filename,
        template_type,
        description,
        template_text,
        created_by
    ) VALUES (
        gen_random_uuid(),
        'system_architecture_overview',
        'synthesis',
        'synthesis_system_architecture_overview.md',
        'markdown',
        'Renderer template for Synthesis System Architecture Overview.',
        $DOC$\path=docs/templates/synthesis/synthesis_system_architecture_overview.md$DOC$,
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (document_key, stage_slug) DO UPDATE
        SET template_filename = EXCLUDED.template_filename,
            template_type = EXCLUDED.template_type,
            description = EXCLUDED.description,
            template_text = EXCLUDED.template_text,
            updated_at = now()
    RETURNING id INTO v_arch_template_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        document_key,
        stage_slug,
        template_filename,
        template_type,
        description,
        template_text,
        created_by
    ) VALUES (
        gen_random_uuid(),
        'tech_stack_recommendations',
        'synthesis',
        'synthesis_tech_stack_recommendations.md',
        'markdown',
        'Renderer template for Synthesis Tech Stack Recommendations.',
        $DOC$\path=docs/templates/synthesis/synthesis_tech_stack_recommendations.md$DOC$,
        'migration:20251008175246_synthesis_stage_pt_2.sql'
    )
    ON CONFLICT (document_key, stage_slug) DO UPDATE
        SET template_filename = EXCLUDED.template_filename,
            template_type = EXCLUDED.template_type,
            description = EXCLUDED.description,
            template_text = EXCLUDED.template_text,
            updated_at = now()
    RETURNING id INTO v_stack_template_id;
END $$;

-- Step 6c: Seed universal seed prompt and update synthesis stage default
DO $$
DECLARE
    v_stage_id UUID;
    v_seed_prompt_id UUID;
BEGIN
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        is_stage_default,
        stage_association,
        version,
        description,
        variables_required,
        context
    ) VALUES (
        gen_random_uuid(),
        'dialectic_seed_prompt_v1',
        $PROMPT$\path=docs/prompts/dialectic_seed_prompt_v1.md$PROMPT$,
        true,
        true,
        NULL,
        1,
        'Universal seed prompt template for document-centric stages.',
        '[]'::jsonb,
        null
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            is_stage_default = EXCLUDED.is_stage_default,
            stage_association = EXCLUDED.stage_association,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            updated_at = now()
    RETURNING id INTO v_seed_prompt_id;

    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE stage_slug = 'synthesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found when updating default seed prompt.';
    END IF;

    UPDATE public.dialectic_stages
    SET default_system_prompt_id = v_seed_prompt_id,
        updated_at = now()
    WHERE id = v_stage_id;

    UPDATE public.system_prompts
    SET is_active = false,
        updated_at = now()
    WHERE name = 'dialectic_synthesis_base_v1';

    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'expected_output_artifacts_json' - 'output_format' - 'consolidation_instructions' - 'implementation_plan_expansion',
        updated_at = now()
    WHERE system_prompt_id = (
            SELECT id FROM public.system_prompts WHERE name = 'dialectic_synthesis_base_v1'
        )
      AND (
          overlay_values ? 'expected_output_artifacts_json'
          OR overlay_values ? 'output_format'
          OR overlay_values ? 'consolidation_instructions'
          OR overlay_values ? 'implementation_plan_expansion'
      );
END $$;

-- Step 6d: Populate expected_output_template_ids for synthesis stage
DO $$
DECLARE
    v_stage_id UUID;
    v_prd_template_id UUID;
    v_arch_template_id UUID;
    v_stack_template_id UUID;
BEGIN
    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE stage_slug = 'synthesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Synthesis stage not found when updating expected_output_template_ids.';
    END IF;

    SELECT id INTO v_prd_template_id FROM public.dialectic_document_templates WHERE document_key = 'prd' AND stage_slug = 'synthesis';
    IF v_prd_template_id IS NULL THEN
        RAISE EXCEPTION 'Document template for prd not found; seed templates before step 6.d.';
    END IF;

    SELECT id INTO v_arch_template_id FROM public.dialectic_document_templates WHERE document_key = 'system_architecture_overview' AND stage_slug = 'synthesis';
    IF v_arch_template_id IS NULL THEN
        RAISE EXCEPTION 'Document template for system_architecture_overview not found; seed templates before step 6.d.';
    END IF;

    SELECT id INTO v_stack_template_id FROM public.dialectic_document_templates WHERE document_key = 'tech_stack_recommendations' AND stage_slug = 'synthesis';
    IF v_stack_template_id IS NULL THEN
        RAISE EXCEPTION 'Document template for tech_stack_recommendations not found; seed templates before step 6.d.';
    END IF;

    UPDATE public.dialectic_stages
    SET expected_output_template_ids = ARRAY[v_prd_template_id, v_arch_template_id, v_stack_template_id],
        updated_at = now()
    WHERE id = v_stage_id;
END $$;
