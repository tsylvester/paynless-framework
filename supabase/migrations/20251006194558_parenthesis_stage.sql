-- Step 1.c: Seed system_prompts for Parenthesis planner and turn templates
DO $$
DECLARE
    v_planner_prompt_id UUID;
    v_trd_prompt_id UUID;
    v_master_plan_prompt_id UUID;
    v_milestone_schema_prompt_id UUID;
BEGIN
    -- Parenthesis planner header template
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
        'parenthesis_planner_header_v1',
        $PROMPT$\path=docs/prompts/parenthesis/parenthesis_planner_header_v1.md$PROMPT$,
        true,
        1,
        'Planner template that assembles the Parenthesis planning HeaderContext artifact',
        false,
        'docs/prompts/parenthesis/parenthesis_planner_header_v1.md'
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

    -- TRD turn template
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
        'parenthesis_trd_turn_v1',
        $PROMPT$\path=docs/prompts/parenthesis/parenthesis_trd_turn_v1.md$PROMPT$,
        true,
        1,
        'Parenthesis stage TRD generation turn template',
        false,
        'docs/prompts/parenthesis/parenthesis_trd_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_trd_prompt_id;

    -- Master plan turn template
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
        'parenthesis_master_plan_turn_v1',
        $PROMPT$\path=docs/prompts/parenthesis/parenthesis_master_plan_turn_v1.md$PROMPT$,
        true,
        1,
        'Parenthesis stage master plan generation turn template',
        false,
        'docs/prompts/parenthesis/parenthesis_master_plan_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_master_plan_prompt_id;

    -- Milestone schema turn template
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
        'parenthesis_milestone_schema_turn_v1',
        $PROMPT$\path=docs/prompts/parenthesis/parenthesis_milestone_schema_turn_v1.md$PROMPT$,
        true,
        1,
        'Parenthesis stage milestone schema generation turn template',
        false,
        'docs/prompts/parenthesis/parenthesis_milestone_schema_turn_v1.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET prompt_text = EXCLUDED.prompt_text,
            is_active = EXCLUDED.is_active,
            version = EXCLUDED.version,
            description = EXCLUDED.description,
            user_selectable = EXCLUDED.user_selectable,
            prompt_file_path = EXCLUDED.prompt_file_path,
            updated_at = now()
    RETURNING id INTO v_milestone_schema_prompt_id;

    -- Step 2.a: Create Parenthesis recipe template and instance, Step 1 planner step
    INSERT INTO public.dialectic_recipe_templates (
        id,
        recipe_name,
        recipe_version,
        display_name,
        domain_key,
        description
    ) VALUES (
        gen_random_uuid(),
        'parenthesis_v1',
        1,
        'Parenthesis Planning',
        'software_development',
        'Stage recipe that produces Technical Requirements Document, Master Plan, and Milestone Schema.'
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
        'build-planning-header',
        'Build Planning Header',
        'Generate HeaderContext JSON that orchestrates downstream Parenthesis documents.',
        'PLAN',
        'Planner',
        v_planner_prompt_id,
        'HeaderContext',
        'all_to_one',
        '[
          {"type":"seed_prompt","stage_slug":"parenthesis","document_key":"seed_prompt","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"system_architecture_overview","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":true},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"system_architecture_overview","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":false},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"seed_prompt","stage_slug":"parenthesis","relevance":0.6},
          {"document_key":"prd","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","relevance":0.95},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","relevance":0.90},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.75},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","type":"feedback","relevance":0.70},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","type":"feedback","relevance":0.65},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.85}
        ]'::jsonb,
        '{
          "system_materials": {
            "milestones": [],
            "dependency_rules": [],
            "status_preservation_rules": {
              "completed_status": "[✅]",
              "in_progress_status": "[🚧]",
              "unstarted_status": "[ ]"
            },
            "trd_outline_inputs": {
              "subsystems": [],
              "apis": [],
              "schemas": [],
              "proposed_file_tree": "",
              "architecture_overview": ""
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
              "document_key": "trd",
              "content_to_include": {
                "subsystems": [],
                "apis": [],
                "schemas": [],
                "proposed_file_tree": "",
                "architecture_overview": "",
                "feature_scope": [],
                "feasibility_insights": [],
                "non_functional_alignment": [],
                "outcome_alignment": "",
                "north_star_metric": "",
                "primary_kpis": [],
                "guardrails": [],
                "measurement_plan": "",
                "architecture_summary": "",
                "architecture": "",
                "services": [],
                "components": [],
                "data_flows": [],
                "interfaces": [],
                "integration_points": [],
                "dependency_resolution": [],
                "security_measures": [],
                "observability_strategy": [],
                "scalability_plan": [],
                "resilience_strategy": [],
                "frontend_stack": {},
                "backend_stack": {},
                "data_platform": {},
                "devops_tooling": {},
                "security_tooling": {},
                "shared_libraries": [],
                "third_party_services": []
              }
            },
            {
              "document_key": "master_plan",
              "content_to_include": {
                "phases": [],
                "status_markers": {
                  "unstarted": "[ ]",
                  "in_progress": "[🚧]",
                  "completed": "[✅]"
                },
                "dependency_rules": [],
                "generation_limits": {
                  "max_steps": 200,
                  "target_steps": "120-180",
                  "max_output_lines": "600-800"
                },
                "feature_scope": [],
                "features": [],
                "executive_summary": "",
                "mvp_description": "",
                "market_opportunity": "",
                "competitive_analysis": "",
                "architecture_summary": "",
                "architecture": "",
                "services": [],
                "components": [],
                "integration_points": [],
                "dependency_resolution": [],
                "frontend_stack": {},
                "backend_stack": {},
                "data_platform": {},
                "devops_tooling": {},
                "security_tooling": {},
                "shared_libraries": [],
                "third_party_services": []
              }
            },
            {
              "document_key": "milestone_schema",
              "content_to_include": {
                "fields": [
                  "id",
                  "title",
                  "objective",
                  "dependencies",
                  "acceptance_criteria",
                  "status"
                ],
                "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps will be generated in the next stage.",
                "features": [],
                "feasibility_insights": [],
                "non_functional_alignment": [],
                "architecture_summary": "",
                "services": [],
                "components": [],
                "dependency_resolution": [],
                "component_details": [],
                "integration_requirements": [],
                "migration_context": []
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
        execution_order
    ) VALUES (
        gen_random_uuid(),
        v_instance_id,
        v_planner_step_id,
        'build-planning-header',
        'build-planning-header',
        'Build Planning Header',
        'PLAN',
        'Planner',
        v_planner_prompt_id,
        'HeaderContext',
        'all_to_one',
        '[
          {"type":"seed_prompt","stage_slug":"parenthesis","document_key":"seed_prompt","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"system_architecture_overview","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":true},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"system_architecture_overview","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":false},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false}
        ]'::jsonb,
        '[
          {"document_key":"seed_prompt","stage_slug":"parenthesis","relevance":0.6},
          {"document_key":"prd","stage_slug":"synthesis","relevance":1.0},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","relevance":0.95},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","relevance":0.90},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.75},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","type":"feedback","relevance":0.70},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","type":"feedback","relevance":0.65},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.85}
        ]'::jsonb,
        '[]'::jsonb,
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

    -- Step 2.b: Create Step 2, 3, and 4 turn rows
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
        'generate-trd',
        'Generate Technical Requirements Document',
        'Produce the updated TRD that aligns synthesized architecture with the planner’s milestone breakdown.',
        'EXECUTE',
        'Turn',
        v_trd_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"system_architecture_overview","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"system_architecture_overview","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","relevance":0.95},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","relevance":0.9},
          {"document_key":"prd","stage_slug":"synthesis","relevance":0.85},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","type":"feedback","relevance":0.80},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","type":"feedback","relevance":0.75},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.50},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.83}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "trd",
              "template_filename": "parenthesis_trd.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown",
              "content_to_include": {
                "index": [],
                "executive_summary": "",
                "subsystems": [{"name": "", "objective": "", "implementation_notes": ""}],
                "apis": [{"name": "", "description": "", "contracts": []}],
                "schemas": [{"name": "", "columns": [], "indexes": [], "rls": []}],
                "proposed_file_tree": "",
                "architecture_overview": "",
                "delta_summary": "",
                "iteration_notes": ""
              }
            }
          ],
          "files_to_generate": [
            {"template_filename": "parenthesis_trd.md", "from_document_key": "trd"}
          ],
          "assembled_json": [
            {
              "document_key": "trd",
              "artifact_class": "assembled_document_json",
              "fields": [
                "subsystems[].name",
                "subsystems[].objective",
                "subsystems[].implementation_notes",
                "apis[].name",
                "apis[].description",
                "apis[].contracts[]",
                "schemas[].name",
                "schemas[].columns[]",
                "schemas[].indexes[]",
                "schemas[].rls[]",
                "proposed_file_tree",
                "architecture_overview",
                "delta_summary",
                "iteration_notes",
                "feature_scope[]",
                "feasibility_insights[]",
                "non_functional_alignment[]",
                "outcome_alignment",
                "north_star_metric",
                "primary_kpis[]",
                "guardrails[]",
                "measurement_plan",
                "architecture_summary",
                "architecture",
                "services[]",
                "components[]",
                "data_flows[]",
                "interfaces[]",
                "integration_points[]",
                "dependency_resolution[]",
                "security_measures[]",
                "observability_strategy[]",
                "scalability_plan[]",
                "resilience_strategy[]",
                "frontend_stack",
                "backend_stack",
                "data_platform",
                "devops_tooling",
                "security_tooling",
                "shared_libraries[]",
                "third_party_services[]"
              ]
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
    RETURNING id INTO v_trd_step_id;

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
        v_trd_step_id,
        'generate-trd',
        'generate-trd',
        'Generate Technical Requirements Document',
        'EXECUTE',
        'Turn',
        v_trd_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"system_architecture_overview","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":true},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"system_architecture_overview","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"tech_stack_recommendations","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","relevance":0.95},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","relevance":0.9},
          {"document_key":"prd","stage_slug":"synthesis","relevance":0.85},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"system_architecture_overview","stage_slug":"synthesis","type":"feedback","relevance":0.80},
          {"document_key":"tech_stack_recommendations","stage_slug":"synthesis","type":"feedback","relevance":0.75},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.50},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.83}
        ]'::jsonb,
        '[]'::jsonb,
        2,
        'trd',
        2
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_trd_step_id;

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
        'generate-master-plan',
        'Generate Master Plan',
        'Output the dependency-ordered Master Plan marking just-detailed milestones.',
        'EXECUTE',
        'Turn',
        v_master_plan_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"prd","stage_slug":"synthesis","relevance":0.75},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.85},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.90},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.70}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "master_plan",
              "template_filename": "parenthesis_master_plan.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown",
              "content_to_include": {
                "index": [],
                "executive_summary": "",
                "phases": [
                  {
                    "name": "",
                    "objective": "",
                    "milestones": [
                      {
                        "id": "",
                        "title": "",
                        "objective": "",
                        "inputs": [],
                        "outputs": [],
                        "dependencies": [],
                        "acceptance_criteria": [],
                        "status": "[ ]",
                        "coverage_notes": "",
                        "iteration_delta": ""
                      }
                    ]
                  }
                ],
                "status_summary": {
                  "completed": [],
                  "in_progress": [],
                  "up_next": []
                }
              }
            }
          ],
          "files_to_generate": [
            {"template_filename": "parenthesis_master_plan.md", "from_document_key": "master_plan"}
          ],
          "assembled_json": [
            {
              "document_key": "master_plan",
              "artifact_class": "assembled_document_json",
              "fields": [
                "phases[].name",
                "phases[].objective",
                "phases[].milestones[].id",
                "phases[].milestones[].title",
                "phases[].milestones[].objective",
                "phases[].milestones[].inputs[]",
                "phases[].milestones[].outputs[]",
                "phases[].milestones[].dependencies[]",
                "phases[].milestones[].acceptance_criteria[]",
                "phases[].milestones[].status",
                "phases[].milestones[].coverage_notes",
                "phases[].milestones[].iteration_delta",
                "status_summary.completed[]",
                "status_summary.in_progress[]",
                "status_summary.up_next[]",
                "feature_scope[]",
                "features[]",
                "executive_summary",
                "mvp_description",
                "market_opportunity",
                "competitive_analysis",
                "architecture_summary",
                "architecture",
                "services[]",
                "components[]",
                "integration_points[]",
                "dependency_resolution[]",
                "frontend_stack",
                "backend_stack",
                "data_platform",
                "devops_tooling",
                "security_tooling",
                "shared_libraries[]",
                "third_party_services[]"
              ]
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
    RETURNING id INTO v_master_plan_step_id;

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
        v_master_plan_step_id,
        'generate-master-plan',
        'generate-master-plan',
        'Generate Master Plan',
        'EXECUTE',
        'Turn',
        v_master_plan_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"trd","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"document","stage_slug":"synthesis","document_key":"prd","required":true},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"trd","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"synthesis","document_key":"prd","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"trd","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.99},
          {"document_key":"prd","stage_slug":"synthesis","relevance":0.75},
          {"document_key":"trd","stage_slug":"parenthesis","type":"feedback","relevance":0.85},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.90},
          {"document_key":"prd","stage_slug":"synthesis","type":"feedback","relevance":0.70}
        ]'::jsonb,
        '[]'::jsonb,
        3,
        'master_plan',
        3
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_master_plan_step_id;

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
        'generate-milestone-schema',
        'Generate Milestone Schema',
        'Define reusable milestone field schema and style-guide notes.',
        'EXECUTE',
        'Turn',
        v_milestone_schema_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"milestone_schema","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"milestone_schema","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.90},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.80},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","type":"feedback","relevance":0.85}
        ]'::jsonb,
        '{
          "documents": [
            {
              "document_key": "milestone_schema",
              "template_filename": "parenthesis_milestone_schema.md",
              "artifact_class": "rendered_document",
              "file_type": "markdown",
              "content_to_include": {
                "index": [],
                "executive_summary": "",
                "fields": [
                  {
                    "name": "id",
                    "type": "string",
                    "description": "Stable milestone identifier (e.g., M1, M1.a)"
                  },
                  {
                    "name": "title",
                    "type": "string",
                    "description": "Short milestone name"
                  },
                  {
                    "name": "objective",
                    "type": "string",
                    "description": "Narrative summary of milestone goal"
                  },
                  {
                    "name": "dependencies",
                    "type": "string[]",
                    "description": "List of prerequisite milestone IDs"
                  },
                  {
                    "name": "acceptance_criteria",
                    "type": "string[]",
                    "description": "Checklist of validation outcomes"
                  },
                  {
                    "name": "inputs",
                    "type": "string[]",
                    "description": "Artifacts required before work begins"
                  },
                  {
                    "name": "outputs",
                    "type": "string[]",
                    "description": "Artifacts produced when milestone completes"
                  },
                  {
                    "name": "status",
                    "type": "enum",
                    "values": ["[ ]", "[🚧]", "[✅]"],
                    "description": "Current completion status"
                  }
                ],
                "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps belong to next stage.",
                "validation_rules": [
                  "Status must be one of [ ], [🚧], [✅]",
                  "Dependencies must reference existing milestone IDs",
                  "Acceptance criteria must be non-empty for every milestone"
                ],
                "iteration_guidance": {
                  "reuse_policy": "Carry forward schema; append new fields under migration log if expanded",
                  "versioning": "Increment schema_version when fields change"
                }
              }
            }
          ],
          "files_to_generate": [
            {"template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema"}
          ],
          "assembled_json": [
            {
              "document_key": "milestone_schema",
              "artifact_class": "assembled_document_json",
              "fields": [
                "fields[].name",
                "fields[].type",
                "fields[].description",
                "fields[].values[]",
                "style_guide_notes",
                "validation_rules[]",
                "iteration_guidance.reuse_policy",
                "iteration_guidance.versioning",
                "features[]",
                "feasibility_insights[]",
                "non_functional_alignment[]",
                "architecture_summary",
                "services[]",
                "components[]",
                "dependency_resolution[]",
                "component_details[]",
                "integration_requirements[]",
                "migration_context[]"
              ]
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
    RETURNING id INTO v_milestone_schema_step_id;

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
        v_milestone_schema_step_id,
        'generate-milestone-schema',
        'generate-milestone-schema',
        'Generate Milestone Schema',
        'EXECUTE',
        'Turn',
        v_milestone_schema_prompt_id,
        'RenderedDocument',
        'one_to_one',
        '[
          {"type":"header_context","stage_slug":"parenthesis","document_key":"header_context","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"master_plan","required":true},
          {"type":"document","stage_slug":"parenthesis","document_key":"milestone_schema","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"master_plan","required":false},
          {"type":"feedback","stage_slug":"parenthesis","document_key":"milestone_schema","required":false}
        ]'::jsonb,
        '[
          {"document_key":"header_context","stage_slug":"parenthesis","relevance":1.0},
          {"document_key":"master_plan","stage_slug":"parenthesis","relevance":0.90},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","relevance":0.95},
          {"document_key":"master_plan","stage_slug":"parenthesis","type":"feedback","relevance":0.80},
          {"document_key":"milestone_schema","stage_slug":"parenthesis","type":"feedback","relevance":0.85}
        ]'::jsonb,
        '[]'::jsonb,
        4,
        'milestone_schema',
        4
    )
    ON CONFLICT (instance_id, step_key) DO UPDATE
        SET template_step_id = EXCLUDED.template_step_id,
            prompt_template_id = EXCLUDED.prompt_template_id,
            inputs_required = EXCLUDED.inputs_required,
            inputs_relevance = EXCLUDED.inputs_relevance,
            outputs_required = EXCLUDED.outputs_required,
            updated_at = now()
    RETURNING id INTO v_instance_milestone_schema_step_id;

    -- Step 1.d: Update Parenthesis domain overlay to remove obsolete keys
    UPDATE public.domain_specific_prompt_overlays
    SET overlay_values = overlay_values - 'output_format' - 'expected_output_artifacts_json' - 'task_breakdown_hierarchy' - 'topical_areas_for_slicing' - 'detail_level_expectation',
        updated_at = now()
    WHERE system_prompt_id = (
            SELECT id FROM public.system_prompts WHERE name = 'dialectic_parenthesis_base_v1'
        )
      AND domain_id = (
            SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
        )
      AND (
          overlay_values ? 'output_format'
          OR overlay_values ? 'expected_output_artifacts_json'
          OR overlay_values ? 'task_breakdown_hierarchy'
          OR overlay_values ? 'topical_areas_for_slicing'
          OR overlay_values ? 'detail_level_expectation'
      );

    -- Step 2.c: Populate execution graph edges for Parenthesis stage
    INSERT INTO public.dialectic_recipe_template_edges (
        id,
        template_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_template_id, v_planner_step_id, v_trd_step_id),
        (gen_random_uuid(), v_template_id, v_planner_step_id, v_master_plan_step_id),
        (gen_random_uuid(), v_template_id, v_planner_step_id, v_milestone_schema_step_id)
    ON CONFLICT (template_id, from_step_id, to_step_id) DO NOTHING;

    INSERT INTO public.dialectic_stage_recipe_edges (
        id,
        instance_id,
        from_step_id,
        to_step_id
    ) VALUES
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_trd_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_master_plan_step_id),
        (gen_random_uuid(), v_instance_id, v_instance_planner_step_id, v_instance_milestone_schema_step_id)
    ON CONFLICT (instance_id, from_step_id, to_step_id) DO NOTHING;

    -- Step 3.a: Update Parenthesis stage configuration
    UPDATE public.dialectic_stages
    SET recipe_template_id = v_template_id,
        updated_at = now()
    WHERE stage_slug = 'parenthesis';

    -- Step 3.b: Populate expected_output_template_ids for parenthesis stage
    UPDATE public.dialectic_stages
    SET expected_output_template_ids = ARRAY[
        (SELECT id FROM public.dialectic_document_templates WHERE name = 'parenthesis_trd' AND is_active = true),
        (SELECT id FROM public.dialectic_document_templates WHERE name = 'parenthesis_master_plan' AND is_active = true),
        (SELECT id FROM public.dialectic_document_templates WHERE name = 'parenthesis_milestone_schema' AND is_active = true)
    ],
    updated_at = now()
    WHERE stage_slug = 'parenthesis';

    -- Step 4.a: Seed Parenthesis document templates
    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        'parenthesis_trd',
        'Markdown template for the Parenthesis Technical Requirements Document.',
        'prompt-templates',
        'parenthesis/parenthesis_trd.md',
        'parenthesis_trd.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now();

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        'parenthesis_master_plan',
        'Markdown template for the Parenthesis Master Plan.',
        'prompt-templates',
        'parenthesis/parenthesis_master_plan.md',
        'parenthesis_master_plan.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now();

    INSERT INTO public.dialectic_document_templates (
        id,
        name,
        description,
        storage_bucket,
        storage_path,
        file_name
    ) VALUES (
        gen_random_uuid(),
        'parenthesis_milestone_schema',
        'Markdown template for the Parenthesis Milestone Schema.',
        'prompt-templates',
        'parenthesis/parenthesis_milestone_schema.md',
        'parenthesis_milestone_schema.md'
    )
    ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            storage_bucket = EXCLUDED.storage_bucket,
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            updated_at = now();

    -- Step 3.c: Record migration provenance
    -- Note: Migration ID 20251006194558_parenthesis_stage.sql applied to establish parenthesis_v1 recipe
END $$;
