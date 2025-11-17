-- Upsert Thesis planner prompt and recipe step for thesis_v1
DO $$
DECLARE
    v_plan_prompt_id UUID;
    v_business_prompt_id UUID;
    v_feature_prompt_id UUID;
    v_technical_prompt_id UUID;
    v_success_prompt_id UUID;
    v_stage_id UUID;
    v_template_id UUID;
    v_instance_id UUID;
    v_planner_step_id UUID;
    v_business_doc_template_id UUID;
    v_business_step_id UUID;
    v_feature_doc_template_id UUID;
    v_feature_step_id UUID;
    v_technical_doc_template_id UUID;
    v_technical_step_id UUID;
    v_success_doc_template_id UUID;
    v_success_step_id UUID;
    v_instance_planner_step_id UUID;
    v_instance_business_step_id UUID;
    v_instance_feature_step_id UUID;
    v_instance_technical_step_id UUID;
    v_instance_success_step_id UUID;
    v_doc_template_id UUID;
    v_domain_id UUID;
BEGIN
    -- Get the domain_id for 'Software Development'
    SELECT id INTO v_domain_id FROM public.dialectic_domains WHERE name = 'Software Development' LIMIT 1;
    
    -- Upsert the document template for the planner prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('thesis_planner_header_v1 prompt', v_domain_id, 'Source document for thesis_planner_header_v1 prompt', 'prompt-templates', 'docs/prompts/thesis/', 'thesis_planner_header_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Planner prompt template
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        document_template_id
    ) VALUES (
        gen_random_uuid(),
        'thesis_planner_header_v1',
        $PROMPT$\path=docs/prompts/thesis/thesis_planner_header_v1.md$PROMPT$,
        true,
        1,
        'Planner template that assembles the Thesis HeaderContext artifact',
        false,
        v_doc_template_id
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            document_template_id = EXCLUDED.document_template_id,
            updated_at = now()
    RETURNING id INTO v_plan_prompt_id;

    -- Upsert the document template for the business case prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('thesis_business_case_turn_v1 prompt', v_domain_id, 'Source document for thesis_business_case_turn_v1 prompt', 'prompt-templates', 'docs/prompts/thesis/', 'thesis_business_case_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Business case prompt template
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        document_template_id
    ) VALUES (
        gen_random_uuid(),
        'thesis_business_case_turn_v1',
        $PROMPT$\path=docs/prompts/thesis/thesis_business_case_turn_v1.md$PROMPT$,
        true,
        1,
        'Thesis stage business case turn template',
        false,
        v_doc_template_id
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            document_template_id = EXCLUDED.document_template_id,
            updated_at = now()
    RETURNING id INTO v_business_prompt_id;

    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE slug = 'thesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Thesis stage not found; ensure base seeds are applied before running this migration.';
    END IF;

    INSERT INTO public.dialectic_recipe_templates (
        id,
        recipe_name,
        recipe_version,
        display_name,
        domain_key,
        description
    ) VALUES (
        gen_random_uuid(),
        'thesis_v1',
        1,
        'Thesis Proposal Generation',
        'software_development',
        'Stage recipe that produces the thesis header context and proposal documents.'
    )
    ON CONFLICT (recipe_name, recipe_version) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            domain_key = EXCLUDED.domain_key,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = now()
    RETURNING id INTO v_template_id;

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
        'thesis_build_stage_header',
        'build-stage-header',
        'Build Stage Header',
        'Generate HeaderContext JSON that orchestrates downstream Thesis documents.',
        'PLAN',
        'Planner',
        v_plan_prompt_id,
        'header_context',
        'all_to_one',
        '[{"type":"seed_prompt","slug":"thesis","document_key":"seed_prompt","required":true}]'::jsonb,
        '[{"document_key":"seed_prompt","relevance":1.0}]'::jsonb,
        '{
           "system_materials": {
             "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
             "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
             "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
             "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
             "validation_checkpoint": [
               "requirements addressed",
               "best practices applied",
               "feasible & compliant",
               "references integrated"
             ],
             "quality_standards": [
               "security-first",
               "maintainable",
               "scalable",
               "performance-aware"
             ],
             "diversity_rubric": {
               "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
               "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
               "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
             }
           },
           "header_context_artifact": {
             "type": "header_context",
             "document_key": "header_context",
             "artifact_class": "header_context",
             "file_type": "json"
           },
           "context_for_documents": [
              {
                "document_key": "business_case",
                "content_to_include": {
                  "market_opportunity": "",
                  "user_problem_validation": "",
                  "competitive_analysis": "",
                  "differentiation_&_value_proposition": "",
                  "risks_&_mitigation": "",
                  "strengths": "",
                  "weaknesses": "",
                  "opportunities": "",
                  "threats": "",
                  "next_steps": ""
                }
              },
             {
               "document_key": "feature_spec",
               "content_to_include": [
                 {
                   "feature_name": "",
                   "user_stories": []
                 }
               ]
             },
             {
               "document_key": "technical_approach",
              "content_to_include": {
                "architecture": "",
                "components": "",
                "data": "",
                "deployment": "",
                "sequencing": ""
              }
             },
             {
               "document_key": "success_metrics",
              "content_to_include": {
                "outcome_alignment": "",
                "north_star_metric": "",
                "primary_kpis": "",
                "leading_indicators": "",
                "lagging_indicators": "",
                "guardrails": "",
                "measurement_plan": "",
                "risk_signals": "",
                "next_steps": ""
              }
             }
           ]
        }'::jsonb
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

    INSERT INTO public.dialectic_document_templates (
        id,
        domain_id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'),
        'thesis_business_case',
        'Markdown template for the Thesis business case document.',
        'prompt-templates',
        'docs/templates/thesis/',
        'thesis_business_case.md'
    )
    ON CONFLICT (name, domain_id) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_business_doc_template_id;

    UPDATE public.system_prompts
    SET document_template_id = v_business_doc_template_id
    WHERE id = v_business_prompt_id;

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
        'business_case',
        'thesis_generate_business_case',
        'generate-business-case',
        'Generate Business Case',
        'Create the business case document using the shared HeaderContext.',
        'EXECUTE',
        'Turn',
        v_business_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.7}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "business_case",
               "template_filename": "thesis_business_case.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "executive_summary": "",
                 "market_opportunity": "",
                 "user_problem_validation": "",
                 "competitive_analysis": "",
                 "differentiation_&_value_proposition": "",
                 "risks_&_mitigation": "",
                 "strengths": "",
                 "weaknesses": "",
                 "opportunities": "",
                 "threats": "",
                 "next_steps": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_business_case.md",
               "from_document_key": "business_case"
             }
           ]
        }'::jsonb
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
    RETURNING id INTO v_business_step_id;
    
    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        v_planner_step_id,
        v_business_step_id
    )
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;


    -- Upsert the document template for the feature spec prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('thesis_feature_spec_turn_v1 prompt', v_domain_id, 'Source document for thesis_feature_spec_turn_v1 prompt', 'prompt-templates', 'docs/prompts/thesis/', 'thesis_feature_spec_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Feature spec prompt template
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        document_template_id
    ) VALUES (
        gen_random_uuid(),
        'thesis_feature_spec_turn_v1',
        $PROMPT$\path=docs/prompts/thesis/thesis_feature_spec_turn_v1.md$PROMPT$,
        true,
        1,
        'Thesis stage feature spec turn template',
        false,
        v_doc_template_id
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            document_template_id = EXCLUDED.document_template_id,
            updated_at = now()
    RETURNING id INTO v_feature_prompt_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        domain_id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'),
        'thesis_feature_spec',
        'Markdown template for the Thesis feature specification document.',
        'prompt-templates',
        'docs/templates/thesis/',
        'thesis_feature_spec.md'
    )
    ON CONFLICT (name, domain_id) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_feature_doc_template_id;

    UPDATE public.system_prompts
    SET document_template_id = v_feature_doc_template_id
    WHERE id = v_feature_prompt_id;

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
        'feature_spec',
        'thesis_generate_feature_spec',
        'generate-feature-spec',
        'Generate Feature Spec',
        'Produce the feature specification document using the shared HeaderContext.',
        'EXECUTE',
        'Turn',
        v_feature_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.65}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "feature_spec",
               "template_filename": "thesis_feature_spec.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": [
                 {
                   "feature_name": "",
                   "feature_objective": "",
                   "user_stories": [],
                   "acceptance_criteria": [],
                   "dependencies": [],
                   "success_metrics": []
                 }
               ]
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_product_requirements_document.md",
               "from_document_key": "feature_spec"
             }
           ]
        }'::jsonb
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
    RETURNING id INTO v_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        v_planner_step_id,
        v_feature_step_id
    )
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;

    -- Upsert the document template for the technical approach prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('thesis_technical_approach_turn_v1 prompt', v_domain_id, 'Source document for thesis_technical_approach_turn_v1 prompt', 'prompt-templates', 'docs/prompts/thesis/', 'thesis_technical_approach_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Technical approach prompt template
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        document_template_id
    ) VALUES (
        gen_random_uuid(),
        'thesis_technical_approach_turn_v1',
        $PROMPT$\path=docs/prompts/thesis/thesis_technical_approach_turn_v1.md$PROMPT$,
        true,
        1,
        'Thesis stage technical approach turn template',
        false,
        v_doc_template_id
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            document_template_id = EXCLUDED.document_template_id,
            updated_at = now()
    RETURNING id INTO v_technical_prompt_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        domain_id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'),
        'thesis_technical_approach',
        'Markdown template for the Thesis technical approach document.',
        'prompt-templates',
        'docs/templates/thesis/',
        'thesis_technical_approach.md'
    )
    ON CONFLICT (name, domain_id) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_technical_doc_template_id;

    UPDATE public.system_prompts
    SET document_template_id = v_technical_doc_template_id
    WHERE id = v_technical_prompt_id;

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
        'technical_approach',
        'thesis_generate_technical_approach',
        'generate-technical-approach',
        'Generate Technical Approach',
        'Produce the technical approach overview using the shared HeaderContext.',
        'EXECUTE',
        'Turn',
        v_technical_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.6}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "technical_approach",
               "template_filename": "thesis_technical_approach.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "architecture": "",
                 "components": "",
                 "data": "",
                 "deployment": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_implementation_plan_proposal.md",
               "from_document_key": "technical_approach"
             }
           ]
        }'::jsonb
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
    RETURNING id INTO v_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        v_planner_step_id,
        v_technical_step_id
    )
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;

    -- Upsert the document template for the success metrics prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('thesis_success_metrics_turn_v1 prompt', v_domain_id, 'Source document for thesis_success_metrics_turn_v1 prompt', 'prompt-templates', 'docs/prompts/thesis/', 'thesis_success_metrics_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Success metrics prompt template
    INSERT INTO public.system_prompts (
        id,
        name,
        prompt_text,
        is_active,
        version,
        description,
        user_selectable,
        document_template_id
    ) VALUES (
        gen_random_uuid(),
        'thesis_success_metrics_turn_v1',
        $PROMPT$\path=docs/prompts/thesis/thesis_success_metrics_turn_v1.md$PROMPT$,
        true,
        1,
        'Thesis stage success metrics turn template',
        false,
        v_doc_template_id
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            document_template_id = EXCLUDED.document_template_id,
            updated_at = now()
    RETURNING id INTO v_success_prompt_id;

    INSERT INTO public.dialectic_document_templates (
        id,
        domain_id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'),
        'thesis_success_metrics',
        'Markdown template for the Thesis success metrics document.',
        'prompt-templates',
        'docs/templates/thesis/',
        'thesis_success_metrics.md'
    )
    ON CONFLICT (name, domain_id) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now()
    RETURNING id INTO v_success_doc_template_id;

    UPDATE public.system_prompts
    SET document_template_id = v_success_doc_template_id
    WHERE id = v_success_prompt_id;

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
        'success_metrics',
        'thesis_generate_success_metrics',
        'generate-success-metrics',
        'Generate Success Metrics',
        'Produce the success metrics document using the shared HeaderContext.',
        'EXECUTE',
        'Turn',
        v_success_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.8}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "success_metrics",
               "template_filename": "thesis_success_metrics.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "outcome_alignment": "",
                 "north_star_metric": "",
                 "primary_kpis": "",
                 "leading_indicators": "",
                 "lagging_indicators": "",
                 "guardrails": "",
                 "measurement_plan": "",
                 "risk_signals": "",
                 "next_steps": "",
                 "data_sources": [],
                 "reporting_cadence": "",
                 "ownership": "",
                 "escalation_plan": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_success_metrics.md",
               "from_document_key": "success_metrics"
             }
           ]
        }'::jsonb
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
    RETURNING id INTO v_success_step_id;

    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES (
        gen_random_uuid(),
        v_template_id,
        v_planner_step_id,
        v_success_step_id
    )
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;

    -- Populate expected_output_template_ids for Thesis stage
    UPDATE public.dialectic_stages
    SET expected_output_template_ids = ARRAY[
        v_business_doc_template_id,
        v_feature_doc_template_id,
        v_technical_doc_template_id,
        v_success_doc_template_id
    ]
    WHERE id = v_stage_id;

    -- Remove legacy expected_output_artifacts_json payload from Thesis overlay
    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'expected_output_artifacts_json',
        updated_at = now()
    WHERE system_prompt_id = (
            SELECT id FROM public.system_prompts WHERE name = 'dialectic_thesis_base_v1'
        )
      AND overlay_values ? 'expected_output_artifacts_json';

    -- Ensure stage recipe instance exists
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

    UPDATE public.dialectic_stages
    SET recipe_template_id = v_template_id, active_recipe_instance_id = v_instance_id
    WHERE id = v_stage_id;

    -- Upsert instance steps referencing template steps
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
        'thesis_build_stage_header',
        'build-stage-header',
        'Build Stage Header',
        'PLAN',
        'Planner',
        v_plan_prompt_id,
        'header_context',
        'all_to_one',
        '[{"type":"seed_prompt","slug":"thesis","document_key":"seed_prompt","required":true}]'::jsonb,
        '[{"document_key":"seed_prompt","relevance":1.0}]'::jsonb,
        '{
           "system_materials": {
             "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
             "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
             "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
             "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
             "validation_checkpoint": [
               "requirements addressed",
               "best practices applied",
               "feasible & compliant",
               "references integrated"
             ],
             "quality_standards": [
               "security-first",
               "maintainable",
               "scalable",
               "performance-aware"
             ],
             "diversity_rubric": {
               "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
               "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
               "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
             }
           },
           "header_context_artifact": {
             "type": "header_context",
             "document_key": "header_context",
             "artifact_class": "header_context",
             "file_type": "json"
           },
           "context_for_documents": [
              {
                "document_key": "business_case",
                "content_to_include": {
                  "market_opportunity": "",
                  "user_problem_validation": "",
                  "competitive_analysis": "",
                  "differentiation_&_value_proposition": "",
                  "risks_&_mitigation": "",
                  "strengths": "",
                  "weaknesses": "",
                  "opportunities": "",
                  "threats": "",
                  "next_steps": ""
                }
              },
             {
               "document_key": "feature_spec",
               "content_to_include": [
                 {
                   "feature_name": "",
                   "user_stories": []
                 }
               ]
             },
             {
               "document_key": "technical_approach",
              "content_to_include": {
                "architecture": "",
                "components": "",
                "data": "",
                "deployment": "",
                "sequencing": ""
              }
             },
             {
               "document_key": "success_metrics",
              "content_to_include": {
                "outcome_alignment": "",
                "north_star_metric": "",
                "primary_kpis": "",
                "leading_indicators": "",
                "lagging_indicators": "",
                "guardrails": "",
                "measurement_plan": "",
                "risk_signals": "",
                "next_steps": "",
                "data_sources": [],
                "reporting_cadence": ""
              }
             }
           ]
        }'::jsonb,
        NULL,
        NULL,
        1
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now()
    RETURNING id INTO v_instance_planner_step_id;

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
        v_business_step_id,
        'thesis_generate_business_case',
        'generate-business-case',
        'Generate Business Case',
        'EXECUTE',
        'Turn',
        v_business_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.7}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "business_case",
               "template_filename": "thesis_business_case.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "executive_summary": "",
                 "market_opportunity": "",
                 "user_problem_validation": "",
                 "competitive_analysis": "",
                 "differentiation_&_value_proposition": "",
                 "risks_&_mitigation": "",
                 "strengths": "",
                 "weaknesses": "",
                 "opportunities": "",
                 "threats": "",
                 "next_steps": "",
                 "proposal_references": []
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_business_case.md",
               "from_document_key": "business_case"
             }
           ]
        }'::jsonb,
        2,
        'business_case',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now()
    RETURNING id INTO v_instance_business_step_id;

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
        v_feature_step_id,
        'thesis_generate_feature_spec',
        'generate-feature-spec',
        'Generate Feature Spec',
        'EXECUTE',
        'Turn',
        v_feature_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.65}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "feature_spec",
               "template_filename": "thesis_feature_spec.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": [
                 {
                   "feature_name": "",
                   "feature_objective": "",
                   "user_stories": [],
                   "acceptance_criteria": [],
                   "dependencies": [],
                   "success_metrics": []
                 }
               ]
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_product_requirements_document.md",
               "from_document_key": "feature_spec"
             }
           ]
        }'::jsonb,
        2,
        'feature_spec',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now()
    RETURNING id INTO v_instance_feature_step_id;

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
        v_technical_step_id,
        'thesis_generate_technical_approach',
        'generate-technical-approach',
        'Generate Technical Approach',
        'EXECUTE',
        'Turn',
        v_technical_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.6}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "technical_approach",
               "template_filename": "thesis_technical_approach.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "architecture": "",
                 "components": "",
                 "data": "",
                 "deployment": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_implementation_plan_proposal.md",
               "from_document_key": "technical_approach"
             }
           ]
        }'::jsonb,
        2,
        'technical_approach',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now()
    RETURNING id INTO v_instance_technical_step_id;

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
        v_success_step_id,
        'thesis_generate_success_metrics',
        'generate-success-metrics',
        'Generate Success Metrics',
        'EXECUTE',
        'Turn',
        v_success_prompt_id,
        'rendered_document',
        'per_source_document',
        '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.8}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "success_metrics",
               "template_filename": "thesis_success_metrics.md",
               "artifact_class": "rendered_document",
               "file_type": "markdown",
               "content_to_include": {
                 "outcome_alignment": "",
                 "north_star_metric": "",
                 "primary_kpis": "",
                 "leading_indicators": "",
                 "lagging_indicators": "",
                 "guardrails": "",
                 "measurement_plan": "",
                 "risk_signals": "",
                 "next_steps": "",
                 "data_sources": [],
                 "reporting_cadence": "",
                 "ownership": "",
                 "escalation_plan": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "thesis_success_metrics.md",
               "from_document_key": "success_metrics"
             }
           ]
        }'::jsonb,
        2,
        'success_metrics',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            updated_at = now()
    RETURNING id INTO v_instance_success_step_id;

    -- Wire instance edges (planner -> each branch)
    INSERT INTO public.dialectic_stage_recipe_edges (
        id,
        instance_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_business_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_feature_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_technical_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_success_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
END $$;
