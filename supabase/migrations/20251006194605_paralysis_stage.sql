-- Step 3.b: Seed system_prompts for Paralysis planner and turn templates
DO $$
DECLARE
    v_planner_prompt_id UUID;
    v_actionable_checklist_prompt_id UUID;
    v_updated_master_plan_prompt_id UUID;
    v_advisor_recommendations_prompt_id UUID;
    v_doc_template_id UUID;
    v_domain_id UUID;
    v_template_id UUID;
    v_stage_id UUID;
    v_instance_id UUID;
    v_planner_step_id UUID;
    v_actionable_checklist_step_id UUID;
    v_updated_master_plan_step_id UUID;
    v_advisor_recommendations_step_id UUID;
    v_instance_planner_step_id UUID;
    v_instance_actionable_checklist_step_id UUID;
    v_instance_updated_master_plan_step_id UUID;
    v_instance_advisor_recommendations_step_id UUID;
    v_actionable_checklist_doc_template_id UUID;
    v_updated_master_plan_doc_template_id UUID;
    v_advisor_recommendations_doc_template_id UUID;
    BEGIN
    -- Allow prompt_text to be NULL to support document_template_id fallback
    ALTER TABLE public.system_prompts
    ALTER COLUMN prompt_text DROP NOT NULL;
    
    -- Get the domain_id for 'Software Development'
    SELECT id INTO v_domain_id FROM public.dialectic_domains WHERE name = 'Software Development' LIMIT 1;

    -- Upsert the document template for the planner prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('paralysis_planner_header_v1 prompt', v_domain_id, 'Source document for paralysis_planner_header_v1 prompt', 'prompt-templates', 'docs/prompts/paralysis/', 'paralysis_planner_header_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Paralysis planner header template
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
        'paralysis_planner_header_v1',
        null,
        true,
        1,
        'Planner template that assembles the Paralysis implementation HeaderContext artifact',
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
    RETURNING id INTO v_planner_prompt_id;

    -- Upsert the document template for the actionable checklist prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('paralysis_actionable_checklist_turn_v1 prompt', v_domain_id, 'Source document for paralysis_actionable_checklist_turn_v1 prompt', 'prompt-templates', 'docs/prompts/paralysis/', 'paralysis_actionable_checklist_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Actionable checklist turn template
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
        'paralysis_actionable_checklist_turn_v1',
        null,
        true,
        1,
        'Paralysis stage actionable checklist generation turn template',
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
    RETURNING id INTO v_actionable_checklist_prompt_id;

    -- Upsert the document template for the updated master plan prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('paralysis_updated_master_plan_turn_v1 prompt', v_domain_id, 'Source document for paralysis_updated_master_plan_turn_v1 prompt', 'prompt-templates', 'docs/prompts/paralysis/', 'paralysis_updated_master_plan_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Updated master plan turn template
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
        'paralysis_updated_master_plan_turn_v1',
        null,
        true,
        1,
        'Paralysis stage updated master plan generation turn template',
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
    RETURNING id INTO v_updated_master_plan_prompt_id;

    -- Upsert the document template for the advisor recommendations prompt
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name)
    VALUES ('paralysis_advisor_recommendations_turn_v1 prompt', v_domain_id, 'Source document for paralysis_advisor_recommendations_turn_v1 prompt', 'prompt-templates', 'docs/prompts/paralysis/', 'paralysis_advisor_recommendations_turn_v1.md')
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_doc_template_id;

    -- Advisor recommendations turn template
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
        'paralysis_advisor_recommendations_turn_v1',
        null,
        true,
        1,
        'Paralysis stage advisor recommendations generation turn template',
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
    RETURNING id INTO v_advisor_recommendations_prompt_id;

    -- Step 3.b completed: Paralysis prompt templates inserted into system_prompts

    -- Get the Paralysis stage ID
    SELECT id INTO v_stage_id FROM public.dialectic_stages WHERE slug = 'paralysis';
    IF v_stage_id IS NULL THEN
        RAISE EXCEPTION 'Paralysis stage not found; ensure base seeds are applied before running this migration.';
    END IF;

    -- Create Paralysis recipe template and instance
    INSERT INTO public.dialectic_recipe_templates (
        recipe_name,
        recipe_version,
        display_name,
        domain_key,
        description
    ) VALUES (
        'paralysis_v1',
        1,
        'Paralysis Implementation',
        'software_development',
        'Stage recipe that produces an actionable checklist, updates the master plan, and provides advisor recommendations.'
    )
    ON CONFLICT (recipe_name, recipe_version) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            domain_key = EXCLUDED.domain_key,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = now()
    RETURNING id INTO v_template_id;

    INSERT INTO public.dialectic_stage_recipe_instances (
        stage_id,
        template_id
    ) VALUES (
        v_stage_id,
        v_template_id
    )
    ON CONFLICT (stage_id) DO UPDATE
        SET template_id = EXCLUDED.template_id,
            updated_at = now()
    RETURNING id INTO v_instance_id;

    -- Step 3.c: Update Paralysis domain overlay to remove obsolete keys
    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'expected_output_artifacts_json' - 'output_format' - 'current_document' - 'final_plan_format' - 'checklist_item_structure' - 'document_order',
        updated_at = now()
    WHERE system_prompt_id = (
        SELECT id FROM public.system_prompts WHERE name = 'dialectic_paralysis_base_v1'
    )
    AND domain_id = (
        SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
    )
    AND (
        overlay_values ? 'expected_output_artifacts_json'
        OR overlay_values ? 'output_format'
        OR overlay_values ? 'current_document'
        OR overlay_values ? 'final_plan_format'
        OR overlay_values ? 'checklist_item_structure'
        OR overlay_values ? 'document_order'
    );

    -- Step 1.a: Insert the Step 1–4 rows for paralysis_v1 into dialectic_recipe_template_steps
    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        'build-implementation-header',
        'build-implementation-header',
        'Build Implementation Header',
        'Emit header_context.json describing the milestones to detail, checklist sizing rules, status preservation policy, and continuation metadata.',
        'PLAN',
        'Planner',
        v_planner_prompt_id,
        'header_context',
        'all_to_one',
        '[
          {"type":"seed_prompt","slug":"paralysis","document_key":"seed_prompt","required":true},
          {"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"seed_prompt","slug":"paralysis","relevance":0.6},
          {"document_key":"technical_requirements","slug":"parenthesis","relevance":1.0},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.98},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.95},
          {"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.65},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.6},
          {"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.6}
        ]'::jsonb,
        '{
          "system_materials": {
            "executive_summary": "summary of which milestones are detailed in this iteration and why",
            "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
            "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
            "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
            "generation_limits": {"max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800"},
            "document_order": ["actionable_checklist", "updated_master_plan", "advisor_recommendations"],
            "current_document": "actionable_checklist",
            "exhaustiveness_requirement": "extreme detail; no summaries; each step includes inputs, outputs, validation; follow the style guide exactly",
            "validation_checkpoint": ["checklist uses style guide (status, numbering, labels)", "steps are atomic and testable", "dependency ordering enforced", "coverage aligns to milestone acceptance criteria"],
            "quality_standards": ["TDD sequence present", "no missing dependencies", "no speculative steps beyond selected milestones", "clear file-by-file prompts"],
            "iteration_metadata": {"iteration_number": "<populate_at_runtime>", "previous_checklist_present": "<derived_from_storage>", "previous_master_plan_present": "<derived_from_storage>"},
            "milestones_to_detail": [],
            "status_rules": {"completed": "[✅]", "in_progress": "[🚧]", "unstarted": "[ ]"}
          },
          "header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"},
          "context_for_documents": [
            {"document_key": "actionable_checklist", "content_to_include": {"milestone_ids": ["<list the next milestone(s) to detail from the master_plan and milestone_schema>"]}},
            {"document_key": "updated_master_plan", "content_to_include": {"preserve_completed": true, "set_in_progress": "[🚧]", "future_status": "[ ]", "capture_iteration_delta": true}},
            {"document_key": "advisor_recommendations", "content_to_include": {"require_comparison_matrix": true, "summarize_tradeoffs": true, "capture_final_recommendation": true, "tie_breaker_guidance": true}}
          ]
        }'::jsonb
    )
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
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_planner_step_id,
        'build-implementation-header',
        'build-implementation-header',
        'Build Implementation Header',
        'PLAN',
        'Planner',
        v_planner_prompt_id,
        'header_context',
        'all_to_one',
        '[
          {"type":"seed_prompt","slug":"paralysis","document_key":"seed_prompt","required":true},
          {"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"seed_prompt","slug":"paralysis","relevance":0.6},
          {"document_key":"technical_requirements","slug":"parenthesis","relevance":1.0},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.98},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.95},
          {"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.65},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.6},
          {"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.6}
        ]'::jsonb,
        '{
          "system_materials": {
            "executive_summary": "summary of which milestones are detailed in this iteration and why",
            "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
            "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
            "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
            "generation_limits": {"max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800"},
            "document_order": ["actionable_checklist", "updated_master_plan", "advisor_recommendations"],
            "current_document": "actionable_checklist",
            "exhaustiveness_requirement": "extreme detail; no summaries; each step includes inputs, outputs, validation; follow the style guide exactly",
            "validation_checkpoint": ["checklist uses style guide (status, numbering, labels)", "steps are atomic and testable", "dependency ordering enforced", "coverage aligns to milestone acceptance criteria"],
            "quality_standards": ["TDD sequence present", "no missing dependencies", "no speculative steps beyond selected milestones", "clear file-by-file prompts"],
            "iteration_metadata": {"iteration_number": "<populate_at_runtime>", "previous_checklist_present": "<derived_from_storage>", "previous_master_plan_present": "<derived_from_storage>"},
            "milestones_to_detail": [],
            "status_rules": {"completed": "[✅]", "in_progress": "[🚧]", "unstarted": "[ ]"}
          },
          "header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"},
          "context_for_documents": [
            {"document_key": "actionable_checklist", "content_to_include": {"milestone_ids": ["<list the next milestone(s) to detail from the master_plan and milestone_schema>"]}},
            {"document_key": "updated_master_plan", "content_to_include": {"preserve_completed": true, "set_in_progress": "[🚧]", "future_status": "[ ]", "capture_iteration_delta": true}},
            {"document_key": "advisor_recommendations", "content_to_include": {"require_comparison_matrix": true, "summarize_tradeoffs": true, "capture_final_recommendation": true, "tie_breaker_guidance": true}}
          ]
        }'::jsonb,
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
        'generate-actionable-checklist',
        'generate-actionable-checklist',
        'Generate Actionable Checklist',
        'Produce the detailed implementation checklist for the next milestone slice.',
        'EXECUTE',
        'Turn',
        v_actionable_checklist_prompt_id,
        'actionable_checklist',
        'per_source_document',
        '[
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","slug":"paralysis","relevance":1.0},
          {"document_key":"technical_requirements","slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.93},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.8},
          {"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.55}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "actionable_checklist",
              "template_filename": "paralysis_actionable_checklist.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "actionable_checklist",
              "artifact_class": "assembled_document_json",
              "fields": [
                "steps[].id",
                "steps[].status",
                "steps[].component_label",
                "steps[].inputs",
                "steps[].outputs",
                "steps[].validation",
                "steps[].tdd_sequence",
                "steps[].dependencies"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist"}
          ]
        }'::jsonb
    )
    RETURNING id INTO v_actionable_checklist_step_id;

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
        v_actionable_checklist_step_id,
        'generate-actionable-checklist',
        'generate-actionable-checklist',
        'Generate Actionable Checklist',
        'EXECUTE',
        'Turn',
        v_actionable_checklist_prompt_id,
        'actionable_checklist',
        'per_source_document',
        '[
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","slug":"paralysis","relevance":1.0},
          {"document_key":"technical_requirements","slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.93},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.8},
          {"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.55}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "actionable_checklist",
              "template_filename": "paralysis_actionable_checklist.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "actionable_checklist",
              "artifact_class": "assembled_document_json",
              "fields": [
                "steps[].id",
                "steps[].status",
                "steps[].component_label",
                "steps[].inputs",
                "steps[].outputs",
                "steps[].validation",
                "steps[].tdd_sequence",
                "steps[].dependencies"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist"}
          ]
        }'::jsonb,
        2,
        'actionable_checklist',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            updated_at = now()
    RETURNING id INTO v_instance_actionable_checklist_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        3,
        'generate-updated-master-plan',
        'generate-updated-master-plan',
        'Generate Updated Master Plan',
        'Update the persistent master plan, marking newly detailed milestones.',
        'EXECUTE',
        'Turn',
        v_updated_master_plan_prompt_id,
        'updated_master_plan',
        'per_source_document',
        '[
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":true},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","slug":"paralysis","relevance":1.0},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.95},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.92},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "updated_master_plan",
              "template_filename": "paralysis_updated_master_plan.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "updated_master_plan",
              "artifact_class": "assembled_document_json",
              "fields": [
                "phases[].name",
                "phases[].milestones[].id",
                "phases[].milestones[].status",
                "phases[].milestones[].objective",
                "phases[].milestones[].dependencies",
                "phases[].milestones[].acceptance_criteria",
                "iteration_delta"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan"}
          ]
        }'::jsonb
    )
    RETURNING id INTO v_updated_master_plan_step_id;

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
        v_updated_master_plan_step_id,
        'generate-updated-master-plan',
        'generate-updated-master-plan',
        'Generate Updated Master Plan',
        'EXECUTE',
        'Turn',
        v_updated_master_plan_prompt_id,
        'updated_master_plan',
        'per_source_document',
        '[
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":true},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","slug":"paralysis","relevance":1.0},
          {"document_key":"master_plan","slug":"parenthesis","relevance":0.95},
          {"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","slug":"paralysis","relevance":0.92},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "updated_master_plan",
              "template_filename": "paralysis_updated_master_plan.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "updated_master_plan",
              "artifact_class": "assembled_document_json",
              "fields": [
                "phases[].name",
                "phases[].milestones[].id",
                "phases[].milestones[].status",
                "phases[].milestones[].objective",
                "phases[].milestones[].dependencies",
                "phases[].milestones[].acceptance_criteria",
                "iteration_delta"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan"}
          ]
        }'::jsonb,
        3,
        'updated_master_plan',
        3
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            updated_at = now()
    RETURNING id INTO v_instance_updated_master_plan_step_id;

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        4,
        'generate-advisor-recommendations',
        'generate-advisor-recommendations',
        'Generate Advisor Recommendations',
        'Evaluate the updated master plans produced in this iteration against the original user request.',
        'EXECUTE',
        'Turn',
        v_advisor_recommendations_prompt_id,
        'advisor_recommendations',
        'per_source_document',
        '[
          {"type":"project_resource","slug":"project","document_key":"initial_user_prompt","required":true},
          {"type":"document","slug":"synthesis","document_key":"product_requirements","required":true,"multiple":true},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":true,"multiple":true},
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":false},
          {"type":"document","slug":"paralysis","document_key":"advisor_recommendations","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"advisor_recommendations","required":false}
        ]'::jsonb,
        '[
          {"document_key":"initial_user_prompt","slug":"project","relevance":1.0},
          {"document_key":"product_requirements","slug":"synthesis","relevance":0.95},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.95},
          {"document_key":"header_context","slug":"paralysis","relevance":0.7},
          {"document_key":"advisor_recommendations","slug":"paralysis","relevance":0.5},
          {"document_key":"advisor_recommendations","slug":"paralysis","type":"feedback","relevance":0.4}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "advisor_recommendations",
              "template_filename": "paralysis_advisor_recommendations.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "advisor_recommendations",
              "artifact_class": "assembled_document_json",
              "fields": [
                "options[].id",
                "options[].scores[].dimension",
                "options[].scores[].weight",
                "options[].scores[].value",
                "options[].scores[].rationale",
                "options[].preferred",
                "analysis.summary",
                "analysis.tradeoffs",
                "analysis.consensus",
                "recommendation.rankings[]",
                "recommendation.tie_breakers[]"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_advisor_recommendations.md", "from_document_key": "advisor_recommendations"}
          ]
        }'::jsonb
    )
    RETURNING id INTO v_advisor_recommendations_step_id;

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
        v_advisor_recommendations_step_id,
        'generate-advisor-recommendations',
        'generate-advisor-recommendations',
        'Generate Advisor Recommendations',
        'EXECUTE',
        'Turn',
        v_advisor_recommendations_prompt_id,
        'advisor_recommendations',
        'per_source_document',
        '[
          {"type":"document","slug":"synthesis","document_key":"product_requirements","required":true,"multiple":true},
          {"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":true,"multiple":true},
          {"type":"header_context","slug":"paralysis","document_key":"header_context","required":false},
          {"type":"document","slug":"paralysis","document_key":"advisor_recommendations","required":false},
          {"type":"feedback","slug":"paralysis","document_key":"advisor_recommendations","required":false}
        ]'::jsonb,
        '[
          {"document_key":"product_requirements","slug":"synthesis","relevance":0.95},
          {"document_key":"updated_master_plan","slug":"paralysis","relevance":0.95},
          {"document_key":"header_context","slug":"paralysis","relevance":0.7},
          {"document_key":"advisor_recommendations","slug":"paralysis","relevance":0.5},
          {"document_key":"advisor_recommendations","slug":"paralysis","type":"feedback","relevance":0.4}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "advisor_recommendations",
              "template_filename": "paralysis_advisor_recommendations.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown"
            }
          ],
          "assembled_json": [
            {
              "document_key": "advisor_recommendations",
              "artifact_class": "assembled_document_json",
              "fields": [
                "options[].id",
                "options[].scores[].dimension",
                "options[].scores[].weight",
                "options[].scores[].value",
                "options[].scores[].rationale",
                "options[].preferred",
                "analysis.summary",
                "analysis.tradeoffs",
                "analysis.consensus",
                "recommendation.rankings[]",
                "recommendation.tie_breakers[]"
              ]
            }
          ],
          "files_to_generate": [
            {"template_filename": "paralysis_advisor_recommendations.md", "from_document_key": "advisor_recommendations"}
          ]
        }'::jsonb,
        4,
        'advisor_recommendations',
        4
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            parallel_group = EXCLUDED.parallel_group,
            branch_key = EXCLUDED.branch_key,
            updated_at = now()
    RETURNING id INTO v_instance_advisor_recommendations_step_id;

    -- Step 1.b: Populate dialectic_stage_recipe_edges
    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_template_id, v_planner_step_id, v_actionable_checklist_step_id),
        (gen_random_uuid(), v_template_id, v_planner_step_id, v_updated_master_plan_step_id),
        (gen_random_uuid(), v_template_id, v_actionable_checklist_step_id, v_advisor_recommendations_step_id),
        (gen_random_uuid(), v_template_id, v_updated_master_plan_step_id, v_advisor_recommendations_step_id);

    INSERT INTO public.dialectic_stage_recipe_edges (
        id,
        instance_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_actionable_checklist_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_updated_master_plan_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_actionable_checklist_step_id, v_instance_advisor_recommendations_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_updated_master_plan_step_id, v_instance_advisor_recommendations_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;

    -- Seed document templates for outputs
    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('paralysis_actionable_checklist', v_domain_id, 'Paralysis stage output for actionable checklist.', 'prompt-templates', 'docs/templates/paralysis/', 'paralysis_actionable_checklist.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_actionable_checklist_doc_template_id;

    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('paralysis_updated_master_plan', v_domain_id, 'Paralysis stage output for updated master plan.', 'prompt-templates', 'docs/templates/paralysis/', 'paralysis_updated_master_plan.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_updated_master_plan_doc_template_id;

    INSERT INTO public.dialectic_document_templates (name, domain_id, description, storage_bucket, storage_path, file_name, is_active)
    VALUES ('paralysis_advisor_recommendations', v_domain_id, 'Paralysis stage output for advisor recommendations.', 'prompt-templates', 'docs/templates/paralysis/', 'paralysis_advisor_recommendations.md', TRUE)
    ON CONFLICT (name, domain_id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
    RETURNING id INTO v_advisor_recommendations_doc_template_id;

    -- Update Paralysis stage with recipe template, active instance, and expected outputs
    UPDATE public.dialectic_stages
    SET
        recipe_template_id = v_template_id,
        active_recipe_instance_id = v_instance_id,
        expected_output_template_ids = ARRAY[
            v_actionable_checklist_doc_template_id,
            v_updated_master_plan_doc_template_id,
            v_advisor_recommendations_doc_template_id
        ]
    WHERE slug = 'paralysis';
END $$;
