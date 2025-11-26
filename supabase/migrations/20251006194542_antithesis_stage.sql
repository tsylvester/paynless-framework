DO $$
DECLARE
    v_plan_prompt_id UUID;
    v_business_prompt_id UUID;
    v_feasibility_prompt_id UUID;
    v_risk_prompt_id UUID;
    v_nfr_prompt_id UUID;
    v_dependency_prompt_id UUID;
    v_comparison_prompt_id UUID;
    v_stage_id UUID;
    v_template_id UUID;
    v_planner_step_id UUID;
    v_business_step_id UUID;
    v_feasibility_step_id UUID;
    v_risk_step_id UUID;
    v_nfr_step_id UUID;
    v_dependency_step_id UUID;
    v_comparison_step_id UUID;
    v_instance_id UUID;
    v_instance_planner_step_id UUID;
    v_instance_business_step_id UUID;
    v_instance_feasibility_step_id UUID;
    v_instance_risk_step_id UUID;
    v_instance_nfr_step_id UUID;
    v_instance_dependency_step_id UUID;
    v_instance_comparison_step_id UUID;
    v_business_doc_template_id UUID;
    v_feasibility_doc_template_id UUID;
    v_risk_doc_template_id UUID;
    v_nfr_doc_template_id UUID;
    v_dependency_doc_template_id UUID;
    v_comparison_doc_template_id UUID;
    v_doc_template_id UUID;
    v_domain_id UUID;
BEGIN
    -- Allow prompt_text to be NULL to support document_template_id fallback
    ALTER TABLE public.system_prompts
    ALTER COLUMN prompt_text DROP NOT NULL;
    
    -- Get the domain_id for 'Software Development'
    SELECT id INTO v_domain_id FROM public.dialectic_domains WHERE name = 'Software Development' LIMIT 1;
    
    -- Upsert the document template for the planner prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_planner_review_v1 prompt', v_domain_id, 'Source document for antithesis_planner_review_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_planner_review_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_planner_review_v1',
        null,
        true,
        1,
        'Planner template that assembles the Antithesis per-proposal HeaderContext artifact',
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

    -- Upsert the document template for the business case critique prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_business_case_critique', v_domain_id, 'Critique of the business case for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_business_case_critique.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_business_doc_template_id;

    -- Upsert the document template for the feasibility assessment
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_feasibility_assessment', v_domain_id, 'Feasibility assessment for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_feasibility_assessment.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_feasibility_doc_template_id;

    -- Upsert the document template for the risk register
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_risk_register', v_domain_id, 'Risk register for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_risk_register.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_risk_doc_template_id;

    -- Upsert the document template for non-functional requirements
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_non_functional_requirements', v_domain_id, 'Non-functional requirements for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_non_functional_requirements.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_nfr_doc_template_id;

    -- Upsert the document template for the dependency map
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_dependency_map', v_domain_id, 'Dependency map for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_dependency_map.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_dependency_doc_template_id;

    -- Upsert the document template for the comparison vector
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('antithesis_comparison_vector', v_domain_id, 'Comparison vector for a given proposal.', 'prompt-templates', 'docs/templates/antithesis/', 'antithesis_comparison_vector.json', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_comparison_doc_template_id;

    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_business_case_critique_turn_v1 prompt', v_domain_id, 'Source document for antithesis_business_case_critique_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_business_case_critique_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_business_case_critique_turn_v1',
        null,
        true,
        1,
        'Antithesis stage per-proposal critique turn template',
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

    -- Upsert the document template for the feasibility assessment prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_feasibility_assessment_turn_v1 prompt', v_domain_id, 'Source document for antithesis_feasibility_assessment_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_feasibility_assessment_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_feasibility_assessment_turn_v1',
        null,
        true,
        1,
        'Antithesis stage technical feasibility assessment turn template',
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
    RETURNING id INTO v_feasibility_prompt_id;

    -- Upsert the document template for the risk register prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_risk_register_turn_v1 prompt', v_domain_id, 'Source document for antithesis_risk_register_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_risk_register_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_risk_register_turn_v1',
        null,
        true,
        1,
        'Antithesis stage risk register turn template',
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
    RETURNING id INTO v_risk_prompt_id;

    -- Upsert the document template for the non-functional requirements prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_non_functional_requirements_turn_v1 prompt', v_domain_id, 'Source document for antithesis_non_functional_requirements_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_non_functional_requirements_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_non_functional_requirements_turn_v1',
        null,
        true,
        1,
        'Antithesis stage non-functional requirements review turn template',
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
    RETURNING id INTO v_nfr_prompt_id;

    -- Upsert the document template for the dependency map prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_dependency_map_turn_v1 prompt', v_domain_id, 'Source document for antithesis_dependency_map_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_dependency_map_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_dependency_map_turn_v1',
        null,
        true,
        1,
        'Antithesis stage dependency map turn template',
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
    RETURNING id INTO v_dependency_prompt_id;

    -- Upsert the document template for the comparison vector prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('antithesis_comparison_vector_turn_v1 prompt', v_domain_id, 'Source document for antithesis_comparison_vector_turn_v1 prompt', 'prompt-templates', 'docs/prompts/antithesis/', 'antithesis_comparison_vector_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

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
        'antithesis_comparison_vector_turn_v1',
        null,
        true,
        1,
        'Antithesis stage comparison vector turn template',
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
    RETURNING id INTO v_comparison_prompt_id;

    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE slug = 'antithesis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Antithesis stage not found; ensure base seeds are applied before running this migration.';
    END IF;

    SELECT id
    INTO v_business_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_business_case_critique' AND is_active;
    IF v_business_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_business_case_critique';
    END IF;

    SELECT id
    INTO v_feasibility_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_feasibility_assessment' AND is_active;
    IF v_feasibility_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_feasibility_assessment';
    END IF;

    SELECT id
    INTO v_risk_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_risk_register' AND is_active;
    IF v_risk_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_risk_register';
    END IF;

    SELECT id
    INTO v_nfr_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_non_functional_requirements' AND is_active;
    IF v_nfr_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_non_functional_requirements';
    END IF;

    SELECT id
    INTO v_dependency_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_dependency_map' AND is_active;
    IF v_dependency_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_dependency_map';
    END IF;

    SELECT id
    INTO v_comparison_doc_template_id
    FROM public.dialectic_document_templates
    WHERE name = 'antithesis_comparison_vector' AND is_active;
    IF v_comparison_doc_template_id IS NULL THEN
        RAISE EXCEPTION 'Missing document template: antithesis_comparison_vector';
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
        'antithesis_v1',
        1,
        'Antithesis Proposal Review',
        'software_development',
        'Stage recipe that produces the per-proposal review bundle (critique, feasibility, risks, NFRs, dependencies, comparison vector).'
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
        'antithesis_prepare_proposal_review_plan',
        'prepare-proposal-review-plan',
        'Prepare Proposal Review Plan',
        'Generate HeaderContext JSON that orchestrates per-proposal Antithesis review documents.',
        'PLAN',
        'Planner',
        v_plan_prompt_id,
        'header_context',
        'per_source_document_by_lineage',
        '[{"type":"seed_prompt","slug":"antithesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"seed_prompt","relevance":1.0},{"document_key":"business_case","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]'::jsonb,
        '{
           "system_materials": {
             "executive_summary": "concise overview of key findings across all proposals",
             "input_artifacts_summary": "summary of proposals and any user feedback included for review",
             "stage_rationale": "explain the review approach and criteria used",
             "progress_update": "for continuation turns, summarize completed vs pending review areas; omit on first turn",
             "validation_checkpoint": [
               "major technical concerns identified",
               "risk mitigation strategies proposed",
               "alternatives considered where applicable",
               "references and standards checked"
             ],
             "quality_standards": [
               "evidence-based",
               "actionable",
               "balanced",
               "complete"
             ]
           },
           "review_metadata": {
             "proposal_identifier": {
               "lineage_key": "<from the file name of the proposal being reviewed>",
               "source_model_slug": "<from the file name of the proposal being reviewed>"
             },
             "proposal_summary": "",
             "review_focus": [
               "feasibility",
               "risk",
               "non_functional_requirements",
               "dependencies",
               "comparison_signals"
             ],
             "user_constraints": [],
             "normalization_guidance": {
               "scoring_scale": "1-5",
               "required_dimensions": [
                 "feasibility",
                 "complexity",
                 "security",
                 "performance",
                 "maintainability",
                 "scalability",
                 "cost",
                 "time_to_market",
                 "compliance_risk",
                 "alignment_with_constraints"
               ]
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
               "document_key": "business_case_critique",
               "content_to_include": {
                 "executive_summary": "",
                 "fit_to_original_user_request": "",
                 "user_problem_validation": "",
                 "market_opportunity": "",
                 "competitive_analysis": "",
                 "differentiation_value_proposition": "",
                 "risks_mitigation": "",
                 "strengths": [],
                 "weaknesses": [],
                 "opportunities": [],
                 "threats": [],
                 "problems": [],
                 "obstacles": [],
                 "errors": [],
                 "omissions": [],
                 "discrepancies": [],
                 "areas_for_improvement": [],
                 "feasibility": "",
                 "next_steps": "",
                 "proposal_references": "",
                 "recommendations": [],
                 "notes": []
               }
             },
             {
               "document_key": "technical_feasibility_assessment",
               "content_to_include": {
                 "summary": "",
                 "constraint_checklist": [
                   "team",
                   "timeline",
                   "cost",
                   "integration",
                   "compliance"
                 ],
                 "findings": [],
                 "architecture": "",
                 "components": "",
                 "data": "",
                 "deployment": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             },
             {
               "document_key": "risk_register",
               "content_to_include": {
                 "overview": "",
                 "required_fields": [
                   "risk",
                   "impact",
                   "likelihood",
                   "mitigation"
                 ],
                 "seed_examples": [],
                 "mitigation_plan": "",
                 "notes": ""
               }
             },
             {
               "document_key": "non_functional_requirements",
               "content_to_include": {
                 "overview": "",
                 "categories": [
                   "security",
                   "performance",
                   "reliability",
                   "scalability",
                   "maintainability",
                   "compliance"
                 ],
                 "outcome_alignment": "",
                 "primary_kpis": "",
                 "leading_indicators": "",
                 "lagging_indicators": "",
                 "measurement_plan": "",
                 "risk_signals": "",
                 "guardrails": "",
                 "next_steps": ""
               }
             },
             {
               "document_key": "dependency_map",
               "content_to_include": {
                 "overview": "",
                 "components": [],
                 "integration_points": [],
                 "conflict_flags": [],
                 "dependencies": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             },
             {
               "document_key": "comparison_vector",
               "content_to_include": {
                 "proposal": {
                   "lineage_key": "",
                   "source_model_slug": ""
                 },
                 "dimensions": {
                   "feasibility": { "score": 0, "rationale": "" },
                   "complexity": { "score": 0, "rationale": "" },
                   "security": { "score": 0, "rationale": "" },
                   "performance": { "score": 0, "rationale": "" },
                   "maintainability": { "score": 0, "rationale": "" },
                   "scalability": { "score": 0, "rationale": "" },
                   "cost": { "score": 0, "rationale": "" },
                   "time_to_market": { "score": 0, "rationale": "" },
                   "compliance_risk": { "score": 0, "rationale": "" },
                   "alignment_with_constraints": { "score": 0, "rationale": "" }
                 }
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
        'antithesis_prepare_proposal_review_plan',
        'prepare-proposal-review-plan',
        'Prepare Proposal Review Plan',
        'PLAN',
        'Planner',
        v_plan_prompt_id,
        'header_context',
        'per_source_document_by_lineage',
        '[{"type":"seed_prompt","slug":"antithesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"seed_prompt","relevance":1.0},{"document_key":"business_case","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]'::jsonb,
        '{
           "system_materials": {
             "executive_summary": "concise overview of key findings across all proposals",
             "input_artifacts_summary": "summary of proposals and any user feedback included for review",
             "stage_rationale": "explain the review approach and criteria used",
             "progress_update": "for continuation turns, summarize completed vs pending review areas; omit on first turn",
             "validation_checkpoint": [
               "major technical concerns identified",
               "risk mitigation strategies proposed",
               "alternatives considered where applicable",
               "references and standards checked"
             ],
             "quality_standards": [
               "evidence-based",
               "actionable",
               "balanced",
               "complete"
             ]
           },
           "review_metadata": {
             "proposal_identifier": {
               "lineage_key": "<from the file name of the proposal being reviewed>",
               "source_model_slug": "<from the file name of the proposal being reviewed>"
             },
             "proposal_summary": "",
             "review_focus": [
               "feasibility",
               "risk",
               "non_functional_requirements",
               "dependencies",
               "comparison_signals"
             ],
             "user_constraints": [],
             "normalization_guidance": {
               "scoring_scale": "1-5",
               "required_dimensions": [
                 "feasibility",
                 "complexity",
                 "security",
                 "performance",
                 "maintainability",
                 "scalability",
                 "cost",
                 "time_to_market",
                 "compliance_risk",
                 "alignment_with_constraints"
               ]
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
               "document_key": "business_case_critique",
               "content_to_include": {
                 "executive_summary": "",
                 "fit_to_original_user_request": "",
                 "user_problem_validation": "",
                 "market_opportunity": "",
                 "competitive_analysis": "",
                 "differentiation_value_proposition": "",
                 "risks_mitigation": "",
                 "strengths": [],
                 "weaknesses": [],
                 "opportunities": [],
                 "threats": [],
                 "problems": [],
                 "obstacles": [],
                 "errors": [],
                 "omissions": [],
                 "discrepancies": [],
                 "areas_for_improvement": [],
                 "feasibility": "",
                 "next_steps": "",
                 "proposal_references": "",
                 "recommendations": [],
                 "notes": []
               }
             },
             {
               "document_key": "technical_feasibility_assessment",
               "content_to_include": {
                 "summary": "",
                 "constraint_checklist": [
                   "team",
                   "timeline",
                   "cost",
                   "integration",
                   "compliance"
                 ],
                 "findings": [],
                 "architecture": "",
                 "components": "",
                 "data": "",
                 "deployment": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             },
             {
               "document_key": "risk_register",
               "content_to_include": {
                 "overview": "",
                 "required_fields": [
                   "risk",
                   "impact",
                   "likelihood",
                   "mitigation"
                 ],
                 "seed_examples": [],
                 "mitigation_plan": "",
                 "notes": ""
               }
             },
             {
               "document_key": "non_functional_requirements",
               "content_to_include": {
                 "overview": "",
                 "categories": [
                   "security",
                   "performance",
                   "reliability",
                   "scalability",
                   "maintainability",
                   "compliance"
                 ],
                 "outcome_alignment": "",
                 "primary_kpis": "",
                 "leading_indicators": "",
                 "lagging_indicators": "",
                 "measurement_plan": "",
                 "risk_signals": "",
                 "guardrails": "",
                 "next_steps": ""
               }
             },
             {
               "document_key": "dependency_map",
               "content_to_include": {
                 "overview": "",
                 "components": [],
                 "integration_points": [],
                 "conflict_flags": [],
                 "dependencies": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             },
             {
               "document_key": "comparison_vector",
               "content_to_include": {
                 "proposal": {
                   "lineage_key": "",
                   "source_model_slug": ""
                 },
                 "dimensions": {
                   "feasibility": { "score": 0, "rationale": "" },
                   "complexity": { "score": 0, "rationale": "" },
                   "security": { "score": 0, "rationale": "" },
                   "performance": { "score": 0, "rationale": "" },
                   "maintainability": { "score": 0, "rationale": "" },
                   "scalability": { "score": 0, "rationale": "" },
                   "cost": { "score": 0, "rationale": "" },
                   "time_to_market": { "score": 0, "rationale": "" },
                   "compliance_risk": { "score": 0, "rationale": "" },
                   "alignment_with_constraints": { "score": 0, "rationale": "" }
                 }
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
        'business_case_critique',
        'antithesis_generate_business_case_critique',
        'generate-business-case-critique',
        'Generate Per-Proposal Critique',
        'Produce the critique document using the shared HeaderContext and Thesis artifacts.',
        'EXECUTE',
        'Turn',
        v_business_prompt_id,
        'business_case_critique',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.85},{"document_key":"technical_approach","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "business_case_critique",
              "template_filename": "antithesis_business_case_critique.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown",
              "content_to_include": {
                "fit_to_original_user_request": "",
                "strengths": [],
                "weaknesses": [],
                "opportunities": [],
                "threats": [],
                "problems": [],
                "obstacles": [],
                "errors": [],
                "omissions": [],
                "discrepancies": [],
                "areas_for_improvement": [],
                "feasibility": "",
                "recommendations": [],
                "notes": [],
                "executive_summary": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_business_case_critique.md",
              "from_document_key": "business_case_critique"
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
        'antithesis_generate_business_case_critique',
        'generate-business-case-critique',
        'Generate Per-Proposal Critique',
        'EXECUTE',
        'Turn',
        v_business_prompt_id,
        'business_case_critique',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.85},{"document_key":"technical_approach","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "business_case_critique",
              "template_filename": "antithesis_business_case_critique.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown",
              "content_to_include": {
                "fit_to_original_user_request": "",
                "strengths": [],
                "weaknesses": [],
                "opportunities": [],
                "threats": [],
                "problems": [],
                "obstacles": [],
                "errors": [],
                "omissions": [],
                "discrepancies": [],
                "areas_for_improvement": [],
                "feasibility": "",
                "recommendations": [],
                "notes": [],
                "executive_summary": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_business_case_critique.md",
              "from_document_key": "business_case_critique"
            }
          ]
        }'::jsonb,
        2,
        'business_case_critique',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_business_step_id;

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
        'technical_feasibility_assessment',
        'antithesis_generate_technical_feasibility_assessment',
        'generate-technical-feasibility-assessment',
        'Generate Technical Feasibility Assessment',
        'Document feasibility findings across constraints for the proposal.',
        'EXECUTE',
        'Turn',
        v_feasibility_prompt_id,
        'technical_feasibility_assessment',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.85},{"document_key":"business_case","relevance":0.7},{"document_key":"success_metrics","relevance":0.6},{"document_key":"business_case","type":"feedback","relevance":0.45},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"technical_approach","type":"feedback","relevance":0.45},{"document_key":"success_metrics","type":"feedback","relevance":0.45}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "technical_feasibility_assessment",
               "template_filename": "antithesis_feasibility_assessment.md",
               "artifact_class": "rendered_document",
               "lineage_key": "<from the filename of the file being critiqued>",
               "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "summary": "",
                "constraint_checklist": [
                  "team",
                  "timeline",
                  "cost",
                  "integration",
                  "compliance"
                ],
                "team": "",
                "timeline": "",
                "cost": "",
                "integration": "",
                "compliance": "",
                "findings": [],
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
              "template_filename": "antithesis_feasibility_assessment.md",
              "from_document_key": "technical_feasibility_assessment"
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
    RETURNING id INTO v_feasibility_step_id;

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
        v_feasibility_step_id,
        'antithesis_generate_technical_feasibility_assessment',
        'generate-technical-feasibility-assessment',
        'Generate Technical Feasibility Assessment',
        'EXECUTE',
        'Turn',
        v_feasibility_prompt_id,
        'technical_feasibility_assessment',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.85},{"document_key":"business_case","relevance":0.7},{"document_key":"success_metrics","relevance":0.6},{"document_key":"business_case","type":"feedback","relevance":0.45},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"technical_approach","type":"feedback","relevance":0.45},{"document_key":"success_metrics","type":"feedback","relevance":0.45}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "technical_feasibility_assessment",
              "template_filename": "antithesis_feasibility_assessment.md",
              "artifact_class": "rendered_document",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "summary": "",
                "constraint_checklist": [
                  "team",
                  "timeline",
                  "cost",
                  "integration",
                  "compliance"
                ],
                "team": "",
                "timeline": "",
                "cost": "",
                "integration": "",
                "compliance": "",
                "findings": [],
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
              "template_filename": "antithesis_feasibility_assessment.md",
              "from_document_key": "technical_feasibility_assessment"
            }
          ]
        }'::jsonb,
        2,
        'technical_feasibility_assessment',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_feasibility_step_id;

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
        'risk_register',
        'antithesis_generate_risk_register',
        'generate-risk-register',
        'Generate Risk Register',
        'Catalog risks, impacts, likelihood, and mitigations for the proposal.',
        'EXECUTE',
        'Turn',
        v_risk_prompt_id,
        'risk_register',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"success_metrics","relevance":0.9},{"document_key":"technical_approach","relevance":0.8},{"document_key":"feature_spec","relevance":0.75},{"document_key":"business_case","relevance":0.65},{"document_key":"success_metrics","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.55},{"document_key":"business_case","type":"feedback","relevance":0.5}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "risk_register",
               "template_filename": "antithesis_risk_register.md",
               "artifact_class": "rendered_document",
               "lineage_key": "<from the filename of the file being critiqued>",
               "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "overview": "",
                "required_fields": [
                  "risk",
                  "impact",
                  "likelihood",
                  "mitigation"
                ],
                "risk": "",
                "impact": "",
                "likelihood": "",
                "mitigation": "",
                "seed_examples": [],
                "mitigation_plan": "",
                "notes": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_risk_register.md",
              "from_document_key": "risk_register"
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
    RETURNING id INTO v_risk_step_id;

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
        v_risk_step_id,
        'antithesis_generate_risk_register',
        'generate-risk-register',
        'Generate Risk Register',
        'EXECUTE',
        'Turn',
        v_risk_prompt_id,
        'risk_register',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"success_metrics","relevance":0.9},{"document_key":"technical_approach","relevance":0.8},{"document_key":"feature_spec","relevance":0.75},{"document_key":"business_case","relevance":0.65},{"document_key":"success_metrics","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.55},{"document_key":"business_case","type":"feedback","relevance":0.5}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "risk_register",
              "template_filename": "antithesis_risk_register.md",
              "artifact_class": "rendered_document",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "overview": "",
                "required_fields": [
                  "risk",
                  "impact",
                  "likelihood",
                  "mitigation"
                ],
                "risk": "",
                "impact": "",
                "likelihood": "",
                "mitigation": "",
                "seed_examples": [],
                "mitigation_plan": "",
                "notes": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_risk_register.md",
              "from_document_key": "risk_register"
            }
          ]
        }'::jsonb,
        2,
        'risk_register',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_risk_step_id;

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
        'non_functional_requirements',
        'antithesis_generate_non_functional_requirements',
        'generate-non-functional-requirements',
        'Generate Non-Functional Requirements Review',
        'Evaluate the proposal against the defined non-functional requirements.',
        'EXECUTE',
        'Turn',
        v_nfr_prompt_id,
        'non_functional_requirements',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"feature_spec","relevance":0.7},{"document_key":"business_case","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.55},{"document_key":"feature_spec","type":"feedback","relevance":0.5},{"document_key":"business_case","type":"feedback","relevance":0.45}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "non_functional_requirements",
               "template_filename": "antithesis_non_functional_requirements.md",
               "artifact_class": "rendered_document",
               "lineage_key": "<from the filename of the file being critiqued>",
               "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "overview": "",
                "categories": [
                  "security",
                  "performance",
                  "reliability",
                  "scalability",
                  "maintainability",
                  "compliance"
                ],
                "security": "",
                "performance": "",
                "reliability": "",
                "scalability": "",
                "maintainability": "",
                "compliance": "",
                "outcome_alignment": "",
                "primary_kpis": "",
                "leading_indicators": "",
                "lagging_indicators": "",
                "measurement_plan": "",
                "risk_signals": "",
                "guardrails": "",
                "next_steps": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_non_functional_requirements.md",
              "from_document_key": "non_functional_requirements"
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
    RETURNING id INTO v_nfr_step_id;

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
        v_nfr_step_id,
        'antithesis_generate_non_functional_requirements',
        'generate-non-functional-requirements',
        'Generate Non-Functional Requirements Review',
        'EXECUTE',
        'Turn',
        v_nfr_prompt_id,
        'non_functional_requirements',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"feature_spec","relevance":0.7},{"document_key":"business_case","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.55},{"document_key":"feature_spec","type":"feedback","relevance":0.5},{"document_key":"business_case","type":"feedback","relevance":0.45}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "non_functional_requirements",
              "template_filename": "antithesis_non_functional_requirements.md",
              "artifact_class": "rendered_document",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "overview": "",
                "categories": [
                  "security",
                  "performance",
                  "reliability",
                  "scalability",
                  "maintainability",
                  "compliance"
                ],
                "security": "",
                "performance": "",
                "reliability": "",
                "scalability": "",
                "maintainability": "",
                "compliance": "",
                "outcome_alignment": "",
                "primary_kpis": "",
                "leading_indicators": "",
                "lagging_indicators": "",
                "measurement_plan": "",
                "risk_signals": "",
                "guardrails": "",
                "next_steps": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_non_functional_requirements.md",
              "from_document_key": "non_functional_requirements"
            }
          ]
        }'::jsonb,
        2,
        'non_functional_requirements',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_nfr_step_id;

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
        'dependency_map',
        'antithesis_generate_dependency_map',
        'generate-dependency-map',
        'Generate Dependency Map',
        'Document components, integrations, and conflicts for the proposal.',
        'EXECUTE',
        'Turn',
        v_dependency_prompt_id,
        'dependency_map',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"feature_spec","relevance":0.85},{"document_key":"business_case","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"technical_approach","type":"feedback","relevance":0.5},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"business_case","type":"feedback","relevance":0.4},{"document_key":"success_metrics","type":"feedback","relevance":0.35}]'::jsonb,
        '{
           "documents": [
             {
               "document_key": "dependency_map",
               "template_filename": "antithesis_dependency_map.md",
               "artifact_class": "rendered_document",
               "lineage_key": "<from the filename of the file being critiqued>",
               "source_model_slug": "<from the filename of the file being critiqued>",
               "file_type": "markdown",
               "content_to_include": {
                 "overview": "",
                 "components": [],
                 "integration_points": [],
                 "conflict_flags": [],
                 "dependencies": "",
                 "sequencing": "",
                 "risk_mitigation": "",
                 "open_questions": ""
               }
             }
           ],
           "files_to_generate": [
             {
               "template_filename": "antithesis_dependency_map.md",
               "from_document_key": "dependency_map"
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
    RETURNING id INTO v_dependency_step_id;

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
        v_dependency_step_id,
        'antithesis_generate_dependency_map',
        'generate-dependency-map',
        'Generate Dependency Map',
        'EXECUTE',
        'Turn',
        v_dependency_prompt_id,
        'dependency_map',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"feature_spec","relevance":0.85},{"document_key":"business_case","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"technical_approach","type":"feedback","relevance":0.5},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"business_case","type":"feedback","relevance":0.4},{"document_key":"success_metrics","type":"feedback","relevance":0.35}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "dependency_map",
              "template_filename": "antithesis_dependency_map.md",
              "artifact_class": "rendered_document",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "markdown",
              "content_to_include": {
                "overview": "",
                "components": [],
                "integration_points": [],
                "conflict_flags": [],
                "dependencies": "",
                "sequencing": "",
                "risk_mitigation": "",
                "open_questions": ""
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_dependency_map.md",
              "from_document_key": "dependency_map"
            }
          ]
        }'::jsonb,
        2,
        'dependency_map',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_dependency_step_id;

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
        'comparison_vector',
        'antithesis_generate_comparison_vector',
        'generate-comparison-vector',
        'Generate Comparison Vector',
        'Produce the normalized comparison vector for the proposal across required dimensions.',
        'EXECUTE',
        'Turn',
        v_comparison_prompt_id,
        'assembled_document_json',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.95},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.85},{"document_key":"business_case","type":"feedback","relevance":0.75},{"document_key":"feature_spec","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.7},{"document_key":"success_metrics","type":"feedback","relevance":0.65}]'::jsonb,
        '{
           "documents": [
             {
              "document_key": "comparison_vector",
              "template_filename": "antithesis_comparison_vector.json",
              "artifact_class": "assembled_document_json",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "json",
              "content_to_include": {
                "proposal": {
                  "lineage_key": "",
                  "source_model_slug": ""
                },
                "dimensions": {
                  "feasibility": { "score": 0, "rationale": "" },
                  "complexity": { "score": 0, "rationale": "" },
                  "security": { "score": 0, "rationale": "" },
                  "performance": { "score": 0, "rationale": "" },
                  "maintainability": { "score": 0, "rationale": "" },
                  "scalability": { "score": 0, "rationale": "" },
                  "cost": { "score": 0, "rationale": "" },
                  "time_to_market": { "score": 0, "rationale": "" },
                  "compliance_risk": { "score": 0, "rationale": "" },
                  "alignment_with_constraints": { "score": 0, "rationale": "" }
                }
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_comparison_vector.json",
              "from_document_key": "comparison_vector"
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
    RETURNING id INTO v_comparison_step_id;

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
        v_comparison_step_id,
        'antithesis_generate_comparison_vector',
        'generate-comparison-vector',
        'Generate Comparison Vector',
        'EXECUTE',
        'Turn',
        v_comparison_prompt_id,
        'assembled_document_json',
        'per_source_document',
        '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]'::jsonb,
        '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.95},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.85},{"document_key":"business_case","type":"feedback","relevance":0.75},{"document_key":"feature_spec","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.7},{"document_key":"success_metrics","type":"feedback","relevance":0.65}]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "comparison_vector",
              "template_filename": "antithesis_comparison_vector.json",
              "artifact_class": "assembled_document_json",
              "lineage_key": "<from the filename of the file being critiqued>",
              "source_model_slug": "<from the filename of the file being critiqued>",
              "file_type": "json",
              "content_to_include": {
                "proposal": {
                  "lineage_key": "",
                  "source_model_slug": ""
                },
                "dimensions": {
                  "feasibility": { "score": 0, "rationale": "" },
                  "complexity": { "score": 0, "rationale": "" },
                  "security": { "score": 0, "rationale": "" },
                  "performance": { "score": 0, "rationale": "" },
                  "maintainability": { "score": 0, "rationale": "" },
                  "scalability": { "score": 0, "rationale": "" },
                  "cost": { "score": 0, "rationale": "" },
                  "time_to_market": { "score": 0, "rationale": "" },
                  "compliance_risk": { "score": 0, "rationale": "" },
                  "alignment_with_constraints": { "score": 0, "rationale": "" }
                }
              }
            }
          ],
          "files_to_generate": [
            {
              "template_filename": "antithesis_comparison_vector.json",
              "from_document_key": "comparison_vector"
            }
          ]
        }'::jsonb,
        2,
        'comparison_vector',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_comparison_step_id;

    SELECT template_step_id INTO v_business_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'business_case_critique';

    SELECT template_step_id INTO v_feasibility_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'technical_feasibility_assessment';

    SELECT template_step_id INTO v_risk_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'risk_register';

    SELECT template_step_id INTO v_nfr_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'non_functional_requirements';

    SELECT template_step_id INTO v_dependency_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'dependency_map';

    SELECT template_step_id INTO v_comparison_step_id
    FROM public.dialectic_stage_recipe_steps
    WHERE instance_id = v_instance_id AND branch_key = 'comparison_vector';

    IF v_business_step_id IS NOT NULL THEN
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
    END IF;

    IF v_feasibility_step_id IS NOT NULL THEN
        INSERT INTO public.dialectic_recipe_template_edges (
            id,
            template_id,
            from_step_id,
            to_step_id
        ) VALUES (
            gen_random_uuid(),
            v_template_id,
            v_planner_step_id,
            v_feasibility_step_id
        )
        ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
    END IF;

    IF v_risk_step_id IS NOT NULL THEN
        INSERT INTO public.dialectic_recipe_template_edges (
            id,
            template_id,
            from_step_id,
            to_step_id
        ) VALUES (
            gen_random_uuid(),
            v_template_id,
            v_planner_step_id,
            v_risk_step_id
        )
        ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
    END IF;

    IF v_nfr_step_id IS NOT NULL THEN
        INSERT INTO public.dialectic_recipe_template_edges (
            id,
            template_id,
            from_step_id,
            to_step_id
        ) VALUES (
            gen_random_uuid(),
            v_template_id,
            v_planner_step_id,
            v_nfr_step_id
        )
        ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
    END IF;

    IF v_dependency_step_id IS NOT NULL THEN
        INSERT INTO public.dialectic_recipe_template_edges (
            id,
            template_id,
            from_step_id,
            to_step_id
        ) VALUES (
            gen_random_uuid(),
            v_template_id,
            v_planner_step_id,
            v_dependency_step_id
        )
        ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
    END IF;

    IF v_comparison_step_id IS NOT NULL THEN
        INSERT INTO public.dialectic_recipe_template_edges (
            id,
            template_id,
            from_step_id,
            to_step_id
        ) VALUES (
            gen_random_uuid(),
            v_template_id,
            v_planner_step_id,
            v_comparison_step_id
        )
        ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;
    END IF;

    IF v_instance_id IS NOT NULL THEN
        SELECT id INTO v_instance_business_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'business_case_critique';

        SELECT id INTO v_instance_feasibility_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'technical_feasibility_assessment';

        SELECT id INTO v_instance_risk_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'risk_register';

        SELECT id INTO v_instance_nfr_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'non_functional_requirements';

        SELECT id INTO v_instance_dependency_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'dependency_map';

        SELECT id INTO v_instance_comparison_step_id
        FROM public.dialectic_stage_recipe_steps
        WHERE instance_id = v_instance_id AND branch_key = 'comparison_vector';

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_business_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_business_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_feasibility_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_feasibility_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_risk_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_risk_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_nfr_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_nfr_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_dependency_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_dependency_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;

        IF v_instance_planner_step_id IS NOT NULL AND v_instance_comparison_step_id IS NOT NULL THEN
            INSERT INTO public.dialectic_stage_recipe_edges (
                id,
                instance_id,
                from_step_id,
                to_step_id
            ) VALUES (
                gen_random_uuid(),
                v_instance_id,
                v_instance_planner_step_id,
                v_instance_comparison_step_id
            )
            ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;
        END IF;
    END IF;

    -- Populate expected_output_template_ids for Antithesis stage
    UPDATE public.dialectic_stages
    SET expected_output_template_ids = ARRAY[
        v_business_doc_template_id,
        v_feasibility_doc_template_id,
        v_risk_doc_template_id,
        v_nfr_doc_template_id,
        v_dependency_doc_template_id,
        v_comparison_doc_template_id
    ]
    WHERE id = v_stage_id;

    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'expected_output_artifacts_json' - 'output_format',
        updated_at = now()
    WHERE system_prompt_id = (
            SELECT id FROM public.system_prompts WHERE name = 'dialectic_antithesis_base_v1'
        )
      AND (overlay_values ? 'expected_output_artifacts_json' OR overlay_values ? 'output_format');

    -- Set recipe_template_id for antithesis stage
    UPDATE public.dialectic_stages
    SET recipe_template_id = v_template_id, active_recipe_instance_id = v_instance_id
    WHERE id = v_stage_id;
END $$;

