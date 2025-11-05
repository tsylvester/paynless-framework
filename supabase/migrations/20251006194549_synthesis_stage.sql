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
    VALUES ('synthesis_pairwise_header_planner_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_header_planner_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_pairwise_header_planner_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_header_planner_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md$PROMPT$, true, 1, 'Planner template that assembles the pairwise HeaderContext for Synthesis stage fan-out.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_planner_prompt_id;

    -- 2.2: Pairwise Business Case Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_business_case_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_business_case_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_pairwise_business_case_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_business_case_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_business_case_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise business case synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_business_prompt_id;

    -- 2.3: Pairwise Feature Spec Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_feature_spec_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_feature_spec_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_pairwise_feature_spec_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_feature_spec_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_feature_spec_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise feature spec synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_feature_prompt_id;

    -- 2.4: Pairwise Technical Approach Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_technical_approach_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_technical_approach_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_pairwise_technical_approach_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_technical_approach_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_technical_approach_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise technical approach synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_technical_prompt_id;

    -- 2.5: Pairwise Success Metrics Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_pairwise_success_metrics_turn_v1 prompt', v_domain_id, 'Source document for synthesis_pairwise_success_metrics_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_pairwise_success_metrics_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_pairwise_success_metrics_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_pairwise_success_metrics_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage pairwise success metrics synthesis turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_pairwise_metrics_prompt_id;

    -- 2.6: Document Business Case Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_business_case_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_business_case_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_document_business_case_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_business_case_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_business_case_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level business case consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_business_prompt_id;

    -- 2.7: Document Feature Spec Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_feature_spec_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_feature_spec_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_document_feature_spec_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_feature_spec_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_feature_spec_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level feature spec consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_feature_prompt_id;

    -- 2.8: Document Technical Approach Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_technical_approach_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_technical_approach_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_document_technical_approach_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_technical_approach_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_technical_approach_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level technical approach consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_technical_prompt_id;

    -- 2.9: Document Success Metrics Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_document_success_metrics_turn_v1 prompt', v_domain_id, 'Source document for synthesis_document_success_metrics_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_document_success_metrics_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_document_success_metrics_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_document_success_metrics_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage document-level success metrics consolidation turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_doc_metrics_prompt_id;

    -- 2.10: Final Header Planner Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_final_header_planner_v1 prompt', v_domain_id, 'Source document for synthesis_final_header_planner_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_final_header_planner_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_final_header_planner_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_final_header_planner_v1.md$PROMPT$, true, 1, 'Planner template that prepares the final Synthesis HeaderContext before deliverable turns.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_final_header_prompt_id;

    -- 2.11: PRD Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_prd_turn_v1 prompt', v_domain_id, 'Source document for synthesis_prd_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_prd_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_prd_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_prd_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage final Product Requirements Document turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_prd_prompt_id;

    -- 2.12: System Architecture Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_system_architecture_turn_v1 prompt', v_domain_id, 'Source document for synthesis_system_architecture_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_system_architecture_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now() RETURNING id INTO v_doc_template_id;

    INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable, document_template_id)
    VALUES ('synthesis_system_architecture_turn_v1', $PROMPT$\path=docs/prompts/synthesis/synthesis_system_architecture_turn_v1.md$PROMPT$, true, 1, 'Synthesis stage final system architecture overview turn template.', false, v_doc_template_id)
    ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id, updated_at = now()
    RETURNING id INTO v_system_architecture_prompt_id;

    -- 2.13: Tech Stack Prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('synthesis_tech_stack_turn_v1 prompt', v_domain_id, 'Source document for synthesis_tech_stack_turn_v1 prompt', 'prompt-templates', 'docs/prompts/synthesis/', 'synthesis_tech_stack_turn_v1.md')
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
        '[
            { "type": "seed_prompt", "slug": "synthesis", "document_key": "seed_prompt", "required": true },
            { "type": "document", "slug": "thesis", "document_key": "business_case", "required": true, "multiple": true },
            { "type": "document", "slug": "thesis", "document_key": "feature_spec", "required": true, "multiple": true },
            { "type": "document", "slug": "thesis", "document_key": "technical_approach", "required": true, "multiple": true },
            { "type": "document", "slug": "thesis", "document_key": "success_metrics", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "business_case_critique", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "non_functional_requirements", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "risk_register", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "dependency_map", "required": true, "multiple": true },
            { "type": "document", "slug": "antithesis", "document_key": "comparison_vector", "required": true, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "business_case_critique", "required": false, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": false, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "non_functional_requirements", "required": false, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "risk_register", "required": false, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "dependency_map", "required": false, "multiple": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "comparison_vector", "required": false, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "seed_prompt", "slug": "synthesis", "relevance": 0.6 },
            { "document_key": "business_case", "slug": "thesis", "relevance": 1.0 },
            { "document_key": "feature_spec", "slug": "thesis", "relevance": 0.95 },
            { "document_key": "technical_approach", "slug": "thesis", "relevance": 0.95 },
            { "document_key": "success_metrics", "slug": "thesis", "relevance": 0.9 },
            { "document_key": "business_case_critique", "slug": "antithesis", "relevance": 0.95 },
            { "document_key": "technical_feasibility_assessment", "slug": "antithesis", "relevance": 0.9 },
            { "document_key": "non_functional_requirements", "slug": "antithesis", "relevance": 0.85 },
            { "document_key": "risk_register", "slug": "antithesis", "relevance": 0.85 },
            { "document_key": "dependency_map", "slug": "antithesis", "relevance": 0.8 },
            { "document_key": "comparison_vector", "slug": "antithesis", "relevance": 0.85 },
            { "document_key": "business_case_critique", "slug": "antithesis", "type": "feedback", "relevance": 0.80 },
            { "document_key": "technical_feasibility_assessment", "slug": "antithesis", "type": "feedback", "relevance": 0.75 },
            { "document_key": "non_functional_requirements", "slug": "antithesis", "type": "feedback", "relevance": 0.70 },
            { "document_key": "risk_register", "slug": "antithesis", "type": "feedback", "relevance": 0.65 },
            { "document_key": "dependency_map", "slug": "antithesis", "type": "feedback", "relevance": 0.6 },
            { "document_key": "comparison_vector", "slug": "antithesis", "type": "feedback", "relevance": 0.55 }
        ]'::jsonb, 
        '{
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
                ]
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
                        "comparison_signal": "comparison_vector",
                        "executive_summary": "",
                        "user_problem_validation": "",
                        "market_opportunity": "",
                        "competitive_analysis": "",
                        "differentiation_&_value_proposition": "",
                        "risks_&_mitigation": "",
                        "strengths": [],
                        "weaknesses": [],
                        "opportunities": [],
                        "threats": [],
                        "next_steps": "",
                        "proposal_references": [],
                        "resolved_positions": [],
                        "open_questions": []
                    }
                },
                {
                    "document_key": "synthesis_pairwise_feature_spec",
                    "content_to_include": {
                        "thesis_document": "feature_spec",
                        "feasibility_document": "technical_feasibility_assessment",
                        "nfr_document": "non_functional_requirements",
                        "comparison_signal": "comparison_vector",
                        "features": [
                            {
                                "feature_name": "",
                                "feature_objective": "",
                                "user_stories": [],
                                "acceptance_criteria": [],
                                "dependencies": [],
                                "success_metrics": [],
                                "feasibility_insights": [],
                                "non_functional_alignment": [],
                                "score_adjustments": []
                            }
                        ],
                        "feature_scope": [],
                        "tradeoffs": []
                    }
                },
                {
                    "document_key": "synthesis_pairwise_technical_approach",
                    "content_to_include": {
                        "thesis_document": "technical_approach",
                        "risk_document": "risk_register",
                        "dependency_document": "dependency_map",
                        "architecture": "",
                        "components": [],
                        "data": "",
                        "deployment": "",
                        "sequencing": "",
                        "risk_mitigations": [],
                        "dependency_resolution": [],
                        "open_questions": []
                    }
                },
                {
                    "document_key": "synthesis_pairwise_success_metrics",
                    "content_to_include": {
                        "thesis_document": "success_metrics",
                        "critique_document": "business_case_critique",
                        "comparison_signal": "comparison_vector",
                        "outcome_alignment": "",
                        "north_star_metric": "",
                        "primary_kpis": [],
                        "leading_indicators": [],
                        "lagging_indicators": [],
                        "guardrails": [],
                        "measurement_plan": "",
                        "risk_signals": "",
                        "next_steps": "",
                        "metric_alignment": [],
                        "tradeoffs": [],
                        "validation_checks": []
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_pairwise_business_case.json",
                    "from_document_key": "synthesis_pairwise_business_case"
                },
                {
                    "template_filename": "synthesis_pairwise_feature_spec.json",
                    "from_document_key": "synthesis_pairwise_feature_spec"
                },
                {
                    "template_filename": "synthesis_pairwise_technical_approach.json",
                    "from_document_key": "synthesis_pairwise_technical_approach"
                },
                {
                    "template_filename": "synthesis_pairwise_success_metrics.json",
                    "from_document_key": "synthesis_pairwise_success_metrics"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_planner_step_id;

    -- Step 4.2 (Parallel Group 2): Pairwise Synthesis
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_business_case', 'synthesis_pairwise_business_case', 'pairwise-synthesis-business-case', 'Pairwise Synthesis – Business Case', 'Combine the thesis business case with critiques and comparison vector signals into a resolved narrative.',
        'EXECUTE', 'Turn', v_pairwise_business_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
            { "type": "document", "slug": "thesis", "document_key": "business_case", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "business_case_critique", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "comparison_vector", "required": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "business_case_critique", "required": false }
        ]'::jsonb, 
        '[
            { "document_key": "header_context_pairwise", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "business_case", "slug": "thesis", "relevance": 1.0 },
            { "document_key": "business_case_critique", "slug": "antithesis", "relevance": 0.95 },
            { "document_key": "comparison_vector", "slug": "antithesis", "relevance": 0.9 },
            { "document_key": "business_case_critique", "slug": "antithesis", "type": "feedback", "relevance": 0.8 }
        ]'::jsonb, 
        '{
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
                        "executive_summary": "",
                        "user_problem_validation": "",
                        "market_opportunity": "",
                        "competitive_analysis": "",
                        "differentiation_&_value_proposition": "",
                        "risks_&_mitigation": "",
                        "strengths": [],
                        "weaknesses": [],
                        "opportunities": [],
                        "threats": [],
                        "resolved_positions": [],
                        "open_questions": [],
                        "next_steps": "",
                        "proposal_references": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_business_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_feature_spec', 'synthesis_pairwise_feature_spec', 'pairwise-synthesis-feature-spec', 'Pairwise Synthesis – Feature Spec', 'Merge feature scope with feasibility, non-functional insights, and comparison signals.',
        'EXECUTE', 'Turn', v_pairwise_feature_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
            { "type": "document", "slug": "thesis", "document_key": "feature_spec", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "non_functional_requirements", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "comparison_vector", "required": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": false },
            { "type": "feedback", "slug": "antithesis", "document_key": "non_functional_requirements", "required": false },
            { "type": "feedback", "slug": "antithesis", "document_key": "comparison_vector", "required": false }
        ]'::jsonb, 
        '[
            { "document_key": "header_context_pairwise", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "feature_spec", "slug": "thesis", "relevance": 1.0 },
            { "document_key": "technical_feasibility_assessment", "slug": "antithesis", "relevance": 0.95 },
            { "document_key": "non_functional_requirements", "slug": "antithesis", "relevance": 0.9 },
            { "document_key": "comparison_vector", "slug": "antithesis", "relevance": 0.85 },
            { "document_key": "technical_feasibility_assessment", "slug": "antithesis", "type": "feedback", "relevance": 0.8 },
            { "document_key": "non_functional_requirements", "slug": "antithesis", "type": "feedback", "relevance": 0.75 },
            { "document_key": "comparison_vector", "slug": "antithesis", "type": "feedback", "relevance": 0.7 }
        ]'::jsonb, 
        '{
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
                        "score_adjustments": [],
                        "features": [
                            {
                                "feature_name": "",
                                "feature_objective": "",
                                "user_stories": [],
                                "acceptance_criteria": [],
                                "dependencies": [],
                                "success_metrics": [],
                                "risk_mitigation": "",
                                "open_questions": ""
                            }
                        ],
                        "tradeoffs": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_technical_approach', 'synthesis_pairwise_technical_approach', 'pairwise-synthesis-technical-approach', 'Pairwise Synthesis – Technical Approach', 'Combine thesis technical approach with antithesis risk and dependency findings.',
        'EXECUTE', 'Turn', v_pairwise_technical_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
            { "type": "document", "slug": "thesis", "document_key": "technical_approach", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "risk_register", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "dependency_map", "required": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "risk_register", "required": false },
            { "type": "feedback", "slug": "antithesis", "document_key": "dependency_map", "required": false }
        ]'::jsonb, 
        '[
            { "document_key": "header_context_pairwise", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "technical_approach", "slug": "thesis", "relevance": 1.0 },
            { "document_key": "risk_register", "slug": "antithesis", "relevance": 0.95 },
            { "document_key": "dependency_map", "slug": "antithesis", "relevance": 0.9 },
            { "document_key": "risk_register", "slug": "antithesis", "type": "feedback", "relevance": 0.78 },
            { "document_key": "dependency_map", "slug": "antithesis", "type": "feedback", "relevance": 0.74 }
        ]'::jsonb, 
        '{
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
                        "dependency_resolution": [],
                        "architecture": "",
                        "components": [],
                        "data": "",
                        "deployment": "",
                        "sequencing": "",
                        "open_questions": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 2, 2, 'synthesis_pairwise_success_metrics', 'synthesis_pairwise_success_metrics', 'pairwise-synthesis-success-metrics', 'Pairwise Synthesis – Success Metrics', 'Combine thesis success metrics with antithesis critique signals into a resolved set of measurable outcomes.',
        'EXECUTE', 'Turn', v_pairwise_metrics_prompt_id, 'AssembledDocumentJson', 'one_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
            { "type": "document", "slug": "thesis", "document_key": "success_metrics", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "business_case_critique", "required": true },
            { "type": "document", "slug": "antithesis", "document_key": "comparison_vector", "required": true },
            { "type": "feedback", "slug": "antithesis", "document_key": "business_case_critique", "required": false },
            { "type": "feedback", "slug": "antithesis", "document_key": "comparison_vector", "required": false }
        ]'::jsonb, 
        '[
            { "document_key": "header_context_pairwise", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "success_metrics", "slug": "thesis", "relevance": 1.0 },
            { "document_key": "business_case_critique", "slug": "antithesis", "relevance": 0.9 },
            { "document_key": "comparison_vector", "slug": "antithesis", "relevance": 0.85 },
            { "document_key": "business_case_critique", "slug": "antithesis", "relevance": 0.8, "type": "feedback" },
            { "document_key": "comparison_vector", "slug": "antithesis", "relevance": 0.75, "type": "feedback"  }
        ]'::jsonb, 
        '{
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
                        "thesis_document": "success_metrics",
                        "critique_document": "business_case_critique",
                        "comparison_signal": "comparison_vector",
                        "outcome_alignment": "",
                        "north_star_metric": "",
                        "primary_kpis": [],
                        "leading_indicators": [],
                        "lagging_indicators": [],
                        "guardrails": [],
                        "measurement_plan": "",
                        "risk_signals": [],
                        "next_steps": "",
                        "metric_alignment": [],
                        "tradeoffs": [],
                        "validation_checks": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_pairwise_metrics_step_id;

    -- Step 4.3 (Parallel Group 3): Document-level Consolidation
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_business_case', 'synthesize_document_business_case', 'synthesize-document-business-case', 'Synthesize Business Case Across Models', 'Synthesize the final business case from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_business_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_pairwise_business_case", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "synthesis_pairwise_business_case", "slug": "synthesis", "relevance": 1.0 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "synthesis_document_business_case",
                    "template_filename": "synthesis_document_business_case.json",
                    "artifact_class": "assembled_json",
                    "file_type": "json",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "executive_summary": "",
                        "user_problem_validation": "",
                        "market_opportunity": "",
                        "competitive_analysis": "",
                        "differentiation_&_value_proposition": "",
                        "risks_&_mitigation": "",
                        "strengths": [],
                        "weaknesses": [],
                        "opportunities": [],
                        "threats": [],
                        "resolved_positions": [],
                        "open_questions": [],
                        "next_steps": "",
                        "proposal_references": []
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_document_business_case.json",
                    "from_document_key": "synthesis_document_business_case"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_business_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_feature_spec', 'synthesize_document_feature_spec', 'synthesis-document-feature-spec', 'Synthesize Feature Spec Across Models', 'Synthesize the final feature spec from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_feature_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_pairwise_feature_spec", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "synthesis_pairwise_feature_spec", "slug": "synthesis", "relevance": 1.0 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "synthesis_document_feature_spec",
                    "template_filename": "synthesis_document_feature_spec.json",
                    "artifact_class": "assembled_json",
                    "file_type": "json",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "feature_scope": [],
                        "feasibility_insights": [],
                        "non_functional_alignment": [],
                        "score_adjustments": [],
                        "features": [
                            {
                                "feature_name": "",
                                "feature_objective": "",
                                "user_stories": [],
                                "acceptance_criteria": [],
                                "dependencies": [],
                                "success_metrics": [],
                                "risk_mitigation": "",
                                "open_questions": ""
                            }
                        ],
                        "tradeoffs": []
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_document_feature_spec.json",
                    "from_document_key": "synthesis_document_feature_spec"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_feature_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_technical_approach', 'synthesize_document_technical_approach', 'synthesis-document-technical-approach', 'Synthesize Technical Approach Across Models', 'Synthesize the final technical approach from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_technical_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_pairwise_technical_approach", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "synthesis_pairwise_technical_approach", "slug": "synthesis", "relevance": 1.0 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "synthesis_document_technical_approach",
                    "template_filename": "synthesis_document_technical_approach.json",
                    "artifact_class": "assembled_json",
                    "file_type": "json",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "architecture_alignment": [],
                        "risk_mitigations": [],
                        "dependency_resolution": []
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_document_technical_approach.json",
                    "from_document_key": "synthesis_document_technical_approach"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_technical_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 3, 3, 'synthesize_document_success_metrics', 'synthesize_document_success_metrics', 'synthesis-document-success-metrics', 'Synthesize Success Metrics Across Models', 'Synthesize the final success metrics from pairwise outputs.',
        'EXECUTE', 'Turn', v_doc_metrics_prompt_id, 'AssembledDocumentJson', 'all_to_one',
        '[
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_pairwise_success_metrics", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "synthesis_pairwise_success_metrics", "slug": "synthesis", "relevance": 1.0 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "synthesis_document_success_metrics",
                    "template_filename": "synthesis_document_success_metrics.json",
                    "artifact_class": "assembled_json",
                    "file_type": "json",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "metric_alignment": [],
                        "tradeoffs": [],
                        "validation_checks": [],
                        "outcome_alignment": "",
                        "north_star_metric": "",
                        "primary_kpis": [],
                        "leading_indicators": [],
                        "lagging_indicators": [],
                        "guardrails": [],
                        "measurement_plan": "",
                        "risk_signals": [],
                        "next_steps": ""
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_document_success_metrics.json",
                    "from_document_key": "synthesis_document_success_metrics"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_doc_metrics_step_id;

    -- Step 4.4: Final Header Planner
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 4, 'generate_final_synthesis_header', 'generate-final-synthesis-header', 'Generate Final Synthesis Header', 'Generate the final HeaderContext for Synthesis stage deliverables.',
        'PLAN', 'Planner', v_final_header_prompt_id, 'HeaderContext', 'all_to_one',
        '[
            { "type": "seed_prompt", "slug": "synthesis", "document_key": "seed_prompt", "required": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "seed_prompt", "slug": "synthesis", "relevance": 0.6 },
            { "document_key": "synthesis_document_business_case", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_feature_spec", "slug": "synthesis", "relevance": 0.95 },
            { "document_key": "synthesis_document_technical_approach", "slug": "synthesis", "relevance": 0.95 },
            { "document_key": "synthesis_document_success_metrics", "slug": "synthesis", "relevance": 0.9 }
        ]'::jsonb, 
        '{
            "system_materials": {
                "executive_summary": "Outline/index of all outputs in this response and how they connect to the objective",
                "input_artifacts_summary": "Succinct summary of prior proposals, critiques, and user feedback included in this synthesis",
                "stage_rationale": "Decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints",
                "progress_update": "For continuation turns, summarize what is complete vs remaining; omit on first turn",
                "signal_sources": [
                    "synthesis_document_business_case",
                    "synthesis_document_feature_spec",
                    "synthesis_document_technical_approach",
                    "synthesis_document_success_metrics"
                ],
                "decision_criteria": [
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
                ],
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
                ]
            },
            "header_context_artifact": {
                "type": "header_context",
                "document_key": "header_context",
                "artifact_class": "header_context",
                "file_type": "json"
            },
            "context_for_documents": [
                {
                    "document_key": "prd",
                    "content_to_include": {
                        "executive_summary": "",
                        "mvp_description": "",
                        "user_problem_validation": "",
                        "market_opportunity": "",
                        "competitive_analysis": "",
                        "differentiation_&_value_proposition": "",
                        "risks_&_mitigation": "",
                        "strengths": [],
                        "weaknesses": [],
                        "opportunities": [],
                        "threats": [],
                        "feature_scope": [],
                        "features": [
                            {
                                "feature_name": "",
                                "feature_objective": "",
                                "user_stories": [],
                                "acceptance_criteria": [],
                                "dependencies": [],
                                "success_metrics": [],
                                "risk_mitigation": "",
                                "open_questions": "",
                                "tradeoffs": []
                            }
                        ],
                        "feasibility_insights": [],
                        "non_functional_alignment": [],
                        "score_adjustments": [],
                        "outcome_alignment": "",
                        "north_star_metric": "",
                        "primary_kpis": [],
                        "leading_indicators": [],
                        "lagging_indicators": [],
                        "guardrails": [],
                        "measurement_plan": "",
                        "risk_signals": [],
                        "resolved_positions": [],
                        "open_questions": [],
                        "next_steps": "",
                        "proposal_references": [],
                        "release_plan": [],
                        "assumptions": [],
                        "open_decisions": [],
                        "implementation_risks": [],
                        "stakeholder_communications": []
                    }
                },
                {
                    "document_key": "system_architecture_overview",
                    "content_to_include": {
                        "architecture_summary": "",
                        "architecture": "",
                        "services": [],
                        "components": [],
                        "data_flows": [],
                        "interfaces": [],
                        "integration_points": [],
                        "dependency_resolution": [],
                        "conflict_flags": [],
                        "sequencing": "",
                        "risk_mitigations": [],
                        "risk_signals": [],
                        "security_measures": [],
                        "observability_strategy": [],
                        "scalability_plan": [],
                        "resilience_strategy": [],
                        "compliance_controls": [],
                        "open_questions": []
                    }
                },
                {
                    "document_key": "tech_stack_recommendations",
                    "content_to_include": {
                        "frontend_stack": {},
                        "backend_stack": {},
                        "data_platform": {},
                        "devops_tooling": {},
                        "security_tooling": {},
                        "shared_libraries": [],
                        "third_party_services": [],
                        "components": [
                            {
                                "component_name": "",
                                "recommended_option": "",
                                "rationale": "",
                                "alternatives": [],
                                "tradeoffs": [],
                                "risk_signals": [],
                                "integration_requirements": [],
                                "operational_owners": [],
                                "migration_plan": []
                            }
                        ],
                        "open_questions": [],
                        "next_steps": []
                    }
                }
            ],
            "files_to_generate": [
                {
                    "template_filename": "synthesis_product_requirements_document.md",
                    "from_document_key": "prd"
                },
                {
                    "template_filename": "synthesis_system_architecture_overview.md",
                    "from_document_key": "system_architecture_overview"
                },
                {
                    "template_filename": "synthesis_tech_stack_recommendations.md",
                    "from_document_key": "tech_stack_recommendations"
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_final_header_step_id;

    -- Step 4.5 (Parallel Group 5): Final Deliverables
    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'prd', 'prd', 'render-prd', 'Render Final PRD', 'Renders the final Product Requirements Document from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_prd_prompt_id, 'RenderedDocument', 'all_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context", "required": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "header_context", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_business_case", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_feature_spec", "slug": "synthesis", "relevance": 0.9 },
            { "document_key": "synthesis_document_technical_approach", "slug": "synthesis", "relevance": 0.85 },
            { "document_key": "synthesis_document_success_metrics", "slug": "synthesis", "relevance": 0.8 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "prd",
                    "template_filename": "synthesis_product_requirements_document.md",
                    "artifact_class": "rendered_document",
                    "file_type": "markdown",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "executive_summary": "",
                        "mvp_description": "",
                        "user_problem_validation": "",
                        "market_opportunity": "",
                        "competitive_analysis": "",
                        "differentiation_&_value_proposition": "",
                        "risks_&_mitigation": "",
                        "strengths": [],
                        "weaknesses": [],
                        "opportunities": [],
                        "threats": [],
                        "feature_scope": [],
                        "features": [
                            {
                                "feature_name": "",
                                "feature_objective": "",
                                "user_stories": [],
                                "acceptance_criteria": [],
                                "dependencies": [],
                                "success_metrics": [],
                                "risk_mitigation": "",
                                "open_questions": "",
                                "tradeoffs": []
                            }
                        ],
                        "feasibility_insights": [],
                        "non_functional_alignment": [],
                        "score_adjustments": [],
                        "outcome_alignment": "",
                        "north_star_metric": "",
                        "primary_kpis": [],
                        "leading_indicators": [],
                        "lagging_indicators": [],
                        "guardrails": [],
                        "measurement_plan": "",
                        "risk_signals": [],
                        "resolved_positions": [],
                        "open_questions": [],
                        "next_steps": "",
                        "proposal_references": [],
                        "release_plan": [],
                        "assumptions": [],
                        "open_decisions": [],
                        "implementation_risks": [],
                        "stakeholder_communications": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_prd_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'system_architecture_overview', 'system_architecture_overview', 'render-system-architecture-overview', 'Render Final System Architecture Overview', 'Renders the final System Architecture Overview from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_system_architecture_prompt_id, 'RenderedDocument', 'all_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context", "required": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "header_context", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_technical_approach", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_feature_spec", "slug": "synthesis", "relevance": 0.9 },
            { "document_key": "synthesis_document_business_case", "slug": "synthesis", "relevance": 0.82 },
            { "document_key": "synthesis_document_success_metrics", "slug": "synthesis", "relevance": 0.78 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "system_architecture_overview",
                    "template_filename": "synthesis_system_architecture_overview.md",
                    "artifact_class": "rendered_document",
                    "file_type": "markdown",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": {
                        "architecture_summary": "",
                        "architecture": "",
                        "services": [],
                        "components": [],
                        "data_flows": [],
                        "interfaces": [],
                        "integration_points": [],
                        "dependency_resolution": [],
                        "conflict_flags": [],
                        "sequencing": "",
                        "risk_mitigations": [],
                        "risk_signals": [],
                        "security_measures": [],
                        "observability_strategy": [],
                        "scalability_plan": [],
                        "resilience_strategy": [],
                        "compliance_controls": [],
                        "open_questions": []
                    }
                }
            ]
        }'::jsonb
    ) ON CONFLICT (template_id, step_key) DO UPDATE SET updated_at = now() RETURNING id INTO v_system_architecture_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (template_id, step_number, parallel_group, branch_key, step_key, step_slug, step_name, step_description, job_type, prompt_type, prompt_template_id, output_type, granularity_strategy, inputs_required, inputs_relevance, outputs_required)
    VALUES (
        v_template_id, 5, 5, 'tech_stack_recommendations', 'tech_stack_recommendations', 'render-tech-stack-recommendations', 'Render Final Tech Stack Recommendations', 'Renders the final Tech Stack Recommendations from the consolidated synthesis artifacts.',
        'EXECUTE', 'Turn', v_tech_stack_prompt_id, 'RenderedDocument', 'all_to_one',
        '[
            { "type": "header_context", "slug": "synthesis", "document_key": "header_context", "required": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true },
            { "type": "document", "slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true }
        ]'::jsonb, 
        '[
            { "document_key": "header_context", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_technical_approach", "slug": "synthesis", "relevance": 1.0 },
            { "document_key": "synthesis_document_feature_spec", "slug": "synthesis", "relevance": 0.88 },
            { "document_key": "synthesis_document_success_metrics", "slug": "synthesis", "relevance": 0.85 },
            { "document_key": "synthesis_document_business_case", "slug": "synthesis", "relevance": 0.8 }
        ]'::jsonb, 
        '{
            "documents": [
                {
                    "document_key": "tech_stack_recommendations",
                    "template_filename": "synthesis_tech_stack_recommendations.md",
                    "artifact_class": "rendered_document",
                    "file_type": "markdown",
                    "lineage_key": "<>",
                    "source_model_slug": "<>",
                    "content_to_include": [
                        {
                            "component_name": "",
                            "recommended_option": "",
                            "rationale": "",
                            "alternatives": [],
                            "tradeoffs": [],
                            "risk_signals": [],
                            "integration_requirements": [],
                            "operational_owners": [],
                            "migration_plan": []
                        }
                    ],
                    "frontend_stack": {},
                    "backend_stack": {},
                    "data_platform": {},
                    "devops_tooling": {},
                    "security_tooling": {},
                    "shared_libraries": [],
                    "third_party_services": [],
                    "open_questions": [],
                    "next_steps": []
                }
            ]
        }'::jsonb
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

    -- Update Synthesis domain overlay to remove obsolete keys
    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'expected_output_artifacts_json',
        updated_at = now()
    WHERE system_prompt_id = (
        SELECT id FROM public.system_prompts WHERE name = 'dialectic_synthesis_base_v1'
    ) AND domain_id = v_domain_id;

    -- Seed document templates for outputs
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('synthesis_prd', v_domain_id, 'Synthesis stage output for PRD.', 'prompt-templates', 'docs/templates/synthesis/', 'synthesis_prd.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_prd_prompt_id;

    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('synthesis_system_architecture_overview', v_domain_id, 'Synthesis stage output for system architecture overview.', 'prompt-templates', 'docs/templates/synthesis/', 'synthesis_system_architecture_overview.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_system_architecture_prompt_id;

    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('synthesis_tech_stack_recommendations', v_domain_id, 'Synthesis stage output for tech stack recommendations.', 'prompt-templates', 'docs/templates/synthesis/', 'synthesis_tech_stack_recommendations.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_tech_stack_prompt_id;

    -- Update Synthesis stage with recipe template, active instance, and expected outputs
    UPDATE public.dialectic_stages
    SET
        recipe_template_id = v_template_id,
        active_recipe_instance_id = v_instance_id,
        expected_output_template_ids = ARRAY[
            v_prd_prompt_id,
            v_system_architecture_prompt_id,
            v_tech_stack_prompt_id
        ]
    WHERE slug = 'synthesis';
END $$;