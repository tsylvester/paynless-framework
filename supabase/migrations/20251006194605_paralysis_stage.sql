-- Step 3.b: Seed system_prompts for Paralysis planner and turn templates
DO $$
DECLARE
    v_planner_prompt_id UUID;
    v_actionable_checklist_prompt_id UUID;
    v_updated_master_plan_prompt_id UUID;
    v_advisor_recommendations_prompt_id UUID;
BEGIN
    -- Paralysis planner header template
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
        'paralysis_planner_header_v1',
        $PROMPT$\path=docs/prompts/paralysis/paralysis_planner_header_v1.md$PROMPT$,
        true,
        1,
        'Planner template that assembles the Paralysis implementation HeaderContext artifact',
        false,
        'docs/prompts/paralysis/paralysis_planner_header_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_planner_prompt_id;

    -- Actionable checklist turn template
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
        'paralysis_actionable_checklist_turn_v1',
        $PROMPT$\path=docs/prompts/paralysis/paralysis_actionable_checklist_turn_v1.md$PROMPT$,
        true,
        1,
        'Paralysis stage actionable checklist generation turn template',
        false,
        'docs/prompts/paralysis/paralysis_actionable_checklist_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_actionable_checklist_prompt_id;

    -- Updated master plan turn template
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
        'paralysis_updated_master_plan_turn_v1',
        $PROMPT$\path=docs/prompts/paralysis/paralysis_updated_master_plan_turn_v1.md$PROMPT$,
        true,
        1,
        'Paralysis stage updated master plan generation turn template',
        false,
        'docs/prompts/paralysis/paralysis_updated_master_plan_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_updated_master_plan_prompt_id;

    -- Advisor recommendations turn template
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
        'paralysis_advisor_recommendations_turn_v1',
        $PROMPT$\path=docs/prompts/paralysis/paralysis_advisor_recommendations_turn_v1.md$PROMPT$,
        true,
        1,
        'Paralysis stage advisor recommendations generation turn template',
        false,
        'docs/prompts/paralysis/paralysis_advisor_recommendations_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_advisor_recommendations_prompt_id;

    -- Step 3.b completed: Paralysis prompt templates inserted into system_prompts

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
        'Build Implementation Header',
        'Emit header_context.json describing the milestones to detail, checklist sizing rules, status preservation policy, and continuation metadata.',
        'PLAN',
        'Planner',
        v_planner_prompt_id,
        'HeaderContext',
        'all_to_one',
        '[
          {"type":"seed_prompt","stage_slug":"paralysis","document_key":"seed_prompt","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"milestone_schema","required":false},
          {"type":"document","stage_slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"document","stage_slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","stage_slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","stage_slug":"paralysis","document_key":"updated_master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"seed_prompt","stage_slug":"paralysis","relevance":0.6},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.98},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.7},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","type":"feedback","relevance":0.65},
          {"document_key":"actionable_checklist","stage_slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","stage_slug":"paralysis","relevance":0.9},
          {"document_key":"actionable_checklist","stage_slug":"paralysis","type":"feedback","relevance":0.6},
          {"document_key":"updated_master_plan","stage_slug":"paralysis","type":"feedback","relevance":0.6}
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

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        'Generate Actionable Checklist',
        'Produce the detailed implementation checklist for the next milestone slice.',
        'EXECUTE',
        'Turn',
        v_actionable_checklist_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","stage_slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","stage_slug":"paralysis","document_key":"actionable_checklist","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"milestone_schema","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"paralysis","relevance":1.0},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.93},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","stage_slug":"paralysis","relevance":0.8},
          {"document_key":"actionable_checklist","stage_slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.6},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","type":"feedback","relevance":0.55}
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

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        'Generate Updated Master Plan',
        'Update the persistent master plan, marking newly detailed milestones.',
        'EXECUTE',
        'Turn',
        v_updated_master_plan_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"paralysis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"milestone_schema","required":true},
          {"type":"document","stage_slug":"paralysis","document_key":"actionable_checklist","required":true},
          {"type":"document","stage_slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","stage_slug":"paralysis","document_key":"updated_master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"paralysis","relevance":1.0},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","relevance":0.9},
          {"document_key":"actionable_checklist","stage_slug":"paralysis","relevance":0.92},
          {"document_key":"updated_master_plan","stage_slug":"paralysis","relevance":0.85},
          {"document_key":"updated_master_plan","stage_slug":"paralysis","type":"feedback","relevance":0.65},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.6}
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

    INSERT INTO public.dialectic_recipe_template_steps (
        id,
        template_id,
        step_number,
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
        'Generate Advisor Recommendations',
        'Evaluate the updated master plans produced in this iteration against the original user request.',
        'EXECUTE',
        'Turn',
        v_advisor_recommendations_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"project_resource","stage_slug":"project","document_key":"initial_user_prompt","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true,"multiple":true},
          {"type":"document","stage_slug":"paralysis","document_key":"updated_master_plan","required":true,"multiple":true},
          {"type":"header_context","stage_slug":"paralysis","document_key":"header_context","required":false},
          {"type":"document","stage_slug":"paralysis","document_key":"advisor_recommendations","required":false},
          {"type":"feedback","stage_slug":"paralysis","document_key":"advisor_recommendations","required":false}
        ]'::jsonb,
        '[
          {"document_key":"initial_user_prompt","stage_slug":"project","relevance":1.0},
          {"document_key":"prd","stage_slug":"synthesis","relevance":0.95},
          {"document_key":"updated_master_plan","stage_slug":"paralysis","relevance":0.95},
          {"document_key":"header_context","stage_slug":"paralysis","relevance":0.7},
          {"document_key":"advisor_recommendations","stage_slug":"paralysis","relevance":0.5},
          {"document_key":"advisor_recommendations","stage_slug":"paralysis","type":"feedback","relevance":0.4}
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

    -- Step 1.c: Update dialectic_stages to set recipe_template_id
    UPDATE public.dialectic_stages
    SET recipe_template_id = v_template_id,
        updated_at = now()
    WHERE stage_slug = 'paralysis';

    -- Step 1 completed: Paralysis stage migrated to recipe contract
    -- Step 3.c completed: Paralysis overlay updated to remove obsolete keys and rely on recipe outputs_required
END $$;
