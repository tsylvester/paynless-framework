-- Update Parenthesis Recipe Step 3, Step 4 and Step 1 to use Milestone Work Nodes

DO $$
DECLARE
    v_template_id UUID;
    v_instance_id UUID;
    v_step_1_outputs_required JSONB;
    v_step_3_outputs_required JSONB;
    v_paralysis_template_id UUID;
    v_paralysis_instance_id UUID;
    v_paralysis_step_1_outputs_required JSONB;
    v_paralysis_step_2_outputs_required JSONB;
    v_paralysis_step_3_outputs_required JSONB;
BEGIN
    -- 1. Get the Parenthesis v1 Template ID
    SELECT id INTO v_template_id FROM public.dialectic_recipe_templates WHERE recipe_name = 'parenthesis_v1';
    
    -- 2. Get the Parenthesis Stage Instance ID
    SELECT active_recipe_instance_id INTO v_instance_id FROM public.dialectic_stages WHERE slug = 'parenthesis';

    -- 3. Define the new Step 1 outputs_required (Header Context)
    -- This matches the 'Target State' -> 'Step 1: Build Planning Header' -> 'Step Outputs Schema' in parenthesis-planning-recipe.md
    v_step_1_outputs_required := '{
      "system_materials": {
        "milestones": [],
        "dependency_rules": [],
        "status_preservation_rules": {
          "completed_status": "[✅]",
          "in_progress_status": "[🚧]",
          "unstarted_status": "[ ]"
        },
        "technical_requirements_outline_inputs": {
          "subsystems": [],
          "apis": [],
          "schemas": [],
          "proposed_file_tree": "",
          "architecture_overview": ""
        }
      },
      "header_context_artifact": {
        "document_key": "header_context",
        "artifact_class": "header_context",
        "file_type": "json"
      },
      "context_for_documents": [
        {
          "document_key": "technical_requirements",
          "template_filename": "parenthesis_technical_requirements.md",
          "content_to_include": {
            "subsystems": [],
            "apis": [],
            "schemas": [],
            "proposed_file_tree": "",
            "architecture_overview": "",
            "feature_scope": [],
            "features": [],
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
          "template_filename": "parenthesis_master_plan.md",
          "content_to_include": {
            "phases": [
              {
                "name": "",
                "objective": "",
                "milestones": [
                  {
                    "id": "",
                    "title": "",
                    "status": "",
                    "objective": "",
                    "deps": [],
                    "provides": [],
                    "directionality": "",
                    "requirements": [],
                    "iteration_delta": ""
                  }
                ]
              }
            ],
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
          "template_filename": "parenthesis_milestone_schema.md",
          "content_to_include": {
            "pipeline_context": "framing paragraph explaining middle-zoom role",
            "selection_criteria": "dependency frontier: only milestones whose deps are [✅] or in current batch",
            "shared_infrastructure": [],
            "milestones": [
              {
                "id": "",
                "title": "",
                "status": "",
                "objective": "",
                "nodes": [
                  {
                    "path": "",
                    "title": "",
                    "objective": "",
                    "role": "",
                    "module": "",
                    "deps": [],
                    "provides": [],
                    "directionality": "",
                    "requirements": []
                  }
                ]
              }
            ],
            "iteration_semantics": "replace, don''t extend; reference prior schema for continuity",
            "executive_summary": "",
            "index": []
          }
        }
      ]
    }'::jsonb;

    -- 4. Define Step 3 outputs_required (Generate Master Plan)
    -- Matches 'Target State' -> 'Step 3: Generate Master Plan' -> 'Step Outputs Schema'
    v_step_3_outputs_required := '{
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
                  "name": "<extract_from_synthesis_documents>",
                  "objective": "<derive_from_technical_requirements>",
                  "technical_context": "<extract_from_architecture_overview>",
                  "implementation_strategy": "<derive_from_tech_stack>",
                  "milestones": [
                    {
                      "id": "<derive_from_header_context>",
                      "title": "<extract_from_master_plan>",
                      "status": "[<derive_from_iteration_state>]",
                      "objective": "<extract_from_technical_requirements>",
                      "deps": ["<extract_from_dependencies>"],
                      "provides": ["<derive_from_deliverables>"],
                      "directionality": "<derive_from_architecture>",
                      "requirements": ["<extract_from_acceptance_criteria>"],
                      "iteration_delta": "<derive_from_change_tracking>"
                    }
                  ]
                }
              ],
              "status_summary": {
                "completed": [],
                "in_progress": [],
                "up_next": []
              },
              "technical_context": "<extract_from_synthesis_architecture>",
              "implementation_context": "<derive_from_tech_stack_analysis>",
              "test_framework": "<derive_from_validation_requirements>",
              "component_mapping": "<derive_from_architecture_components>"
            }
          }
        ],
        "files_to_generate": [
          { "template_filename": "parenthesis_master_plan.md", "from_document_key": "master_plan" }
        ],
        "assembled_json": [
          {
            "document_key": "master_plan",
            "artifact_class": "assembled_document_json",
            "fields": [
              "index[]",
              "executive_summary",
              "phases[].name",
              "phases[].objective",
              "phases[].technical_context",
              "phases[].implementation_strategy",
              "phases[].milestones[].id",
              "phases[].milestones[].title",
              "phases[].milestones[].status",
              "phases[].milestones[].objective",
              "phases[].milestones[].deps[]",
              "phases[].milestones[].provides[]",
              "phases[].milestones[].directionality",
              "phases[].milestones[].requirements[]",
              "phases[].milestones[].iteration_delta",
              "status_summary.completed[]",
              "status_summary.in_progress[]",
              "status_summary.up_next[]",
              "dependency_rules[]",
              "feature_scope[]",
              "features[]",
              "mvp_description",
              "market_opportunity",
              "competitive_analysis",
              "technical_context",
              "implementation_context",
              "test_framework",
              "component_mapping",
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
    }'::jsonb;

    -- 5. Update Step 3 (Generate Master Plan) in Template Steps
    UPDATE public.dialectic_recipe_template_steps
    SET outputs_required = v_step_3_outputs_required,
        updated_at = now()
    WHERE template_id = v_template_id 
      AND step_key = 'generate-master-plan';

    -- 6. Update Step 3 (Generate Master Plan) in Instance Steps (if instance exists)
    IF v_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET outputs_required = v_step_3_outputs_required,
            updated_at = now()
        WHERE instance_id = v_instance_id
          AND step_key = 'generate-master-plan';
    END IF;

    -- 7. Update Step 4 (Generate Milestone Schema) in Template Steps
    -- Matches 'Target State' -> 'Step 4: Generate Milestone Schema' in parenthesis-planning-recipe.md
    UPDATE public.dialectic_recipe_template_steps
    SET step_description = 'Decompose dependency-frontier milestones into architectural work nodes for downstream checklist expansion.',
        inputs_required = '[
            { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
            { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
            { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }
        ]'::jsonb,
        inputs_relevance = '[
            { "document_key": "header_context", "stage_slug": "parenthesis", "relevance": 1.0 },
            { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.90 },
            { "document_key": "system_architecture", "stage_slug": "synthesis", "relevance": 0.92 },
            { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 0.88 },
            { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.95 },
            { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.80 },
            { "document_key": "system_architecture", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 },
            { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.70 },
            { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 }
        ]'::jsonb,
        outputs_required = '{
            "documents": [
              {
                "document_key": "milestone_schema",
                "template_filename": "parenthesis_milestone_schema.md",
                "artifact_class": "rendered_document",
                "file_type": "markdown",
                "content_to_include": {
                  "index": [],
                  "executive_summary": "", 
                  "pipeline_context": "framing paragraph explaining middle-zoom role",
                  "selection_criteria": "dependency frontier: only milestones whose deps are [✅] or in current batch",
                  "shared_infrastructure": [],
                  "milestones": [
                    {
                      "id": "",
                      "title": "",
                      "status": "",
                      "objective": "",
                      "nodes": [
                        {
                          "path": "",
                          "title": "",
                          "objective": "",
                          "role": "",
                          "module": "",
                          "deps": [],
                          "provides": [],
                          "directionality": "",
                          "requirements": []
                        }
                      ]
                    }
                  ],
                  "iteration_semantics": "replace, don''t extend; reference prior schema for continuity"
                }
              }
            ],
            "files_to_generate": [
              { "template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema" }
            ],
            "assembled_json": [
              {
                "document_key": "milestone_schema",
                "artifact_class": "assembled_document_json",
                "fields": [
                  "milestones[].id",
                  "milestones[].title",
                  "milestones[].status",
                  "milestones[].nodes[].path",
                  "milestones[].nodes[].title",
                  "milestones[].nodes[].objective",
                  "milestones[].nodes[].role",
                  "milestones[].nodes[].module",
                  "milestones[].nodes[].deps[]",
                  "milestones[].nodes[].provides[]",
                  "milestones[].nodes[].directionality",
                  "milestones[].nodes[].requirements[]",
                  "shared_infrastructure[]",
                  "selection_criteria",
                  "pipeline_context"
                ]
              }
            ]
        }'::jsonb,
        updated_at = now()
    WHERE template_id = v_template_id 
      AND step_key = 'generate-milestone-schema';

    -- 8. Update Step 4 (Generate Milestone Schema) in Instance Steps (if instance exists)
    IF v_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET inputs_required = '[
            { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
            { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": true },
            { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
            { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
            { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }
        ]'::jsonb,
        inputs_relevance = '[
            { "document_key": "header_context", "stage_slug": "parenthesis", "relevance": 1.0 },
            { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.90 },
            { "document_key": "system_architecture", "stage_slug": "synthesis", "relevance": 0.92 },
            { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 0.88 },
            { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.95 },
            { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.80 },
            { "document_key": "system_architecture", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 },
            { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.70 },
            { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 }
        ]'::jsonb,
        outputs_required = '{
            "documents": [
              {
                "document_key": "milestone_schema",
                "template_filename": "parenthesis_milestone_schema.md",
                "artifact_class": "rendered_document",
                "file_type": "markdown",
                "content_to_include": {
                  "index": [],
                  "executive_summary": "", 
                  "pipeline_context": "framing paragraph explaining middle-zoom role",
                  "selection_criteria": "dependency frontier: only milestones whose deps are [✅] or in current batch",
                  "shared_infrastructure": [],
                  "milestones": [
                    {
                      "id": "",
                      "title": "",
                      "status": "",
                      "objective": "",
                      "nodes": [
                        {
                          "path": "",
                          "title": "",
                          "objective": "",
                          "role": "",
                          "module": "",
                          "deps": [],
                          "provides": [],
                          "directionality": "",
                          "requirements": []
                        }
                      ]
                    }
                  ],
                  "iteration_semantics": "replace, don''t extend; reference prior schema for continuity"
                }
              }
            ],
            "files_to_generate": [
              { "template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema" }
            ],
            "assembled_json": [
              {
                "document_key": "milestone_schema",
                "artifact_class": "assembled_document_json",
                "fields": [
                  "milestones[].id",
                  "milestones[].title",
                  "milestones[].status",
                  "milestones[].nodes[].path",
                  "milestones[].nodes[].title",
                  "milestones[].nodes[].objective",
                  "milestones[].nodes[].role",
                  "milestones[].nodes[].module",
                  "milestones[].nodes[].deps[]",
                  "milestones[].nodes[].provides[]",
                  "milestones[].nodes[].directionality",
                  "milestones[].nodes[].requirements[]",
                  "shared_infrastructure[]",
                  "selection_criteria",
                  "pipeline_context"
                ]
              }
            ]
        }'::jsonb,
        updated_at = now()
        WHERE instance_id = v_instance_id
          AND step_key = 'generate-milestone-schema';
    END IF;

    -- 9. Update Step 1 (Build Planning Header) in Template Steps
    -- Replaces the milestone_schema entry in context_for_documents with work-node placeholders
    UPDATE public.dialectic_recipe_template_steps
    SET outputs_required = v_step_1_outputs_required,
        updated_at = now()
    WHERE template_id = v_template_id
      AND step_key = 'build-planning-header';

    -- 10. Update Step 1 (Build Planning Header) in Instance Steps (if instance exists)
    IF v_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET outputs_required = v_step_1_outputs_required,
            updated_at = now()
        WHERE instance_id = v_instance_id
          AND step_key = 'build-planning-header';
    END IF;

    -- 11. Get Paralysis v1 Template ID
    SELECT id INTO v_paralysis_template_id FROM public.dialectic_recipe_templates WHERE recipe_name = 'paralysis_v1';

    -- 12. Get Paralysis Stage Instance ID
    SELECT active_recipe_instance_id INTO v_paralysis_instance_id FROM public.dialectic_stages WHERE slug = 'paralysis';

    -- 13. Define Paralysis Step 1 outputs_required (Build Implementation Header)
    -- Matches 'Target State' -> 'Step 1: Build Implementation Header' -> 'Step Outputs Schema' in paralysis-planning-recipe.md
    v_paralysis_step_1_outputs_required := '{
      "system_materials": {
        "agent_notes_to_self": "summary of which milestones are detailed in this iteration and why, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
        "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
        "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
        "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
        "generation_limits": { "max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800" },
        "document_order": [
          "actionable_checklist",
          "updated_master_plan",
          "advisor_recommendations"
        ],
        "current_document": "actionable_checklist",
        "exhaustiveness_requirement": "extreme detail; no summaries; each node includes objective, role, module, deps, context, interface, tests, implementation, provides, requirements; follow the style guide and provided structure exactly",
        "validation_checkpoint": [
          "checklist uses provided style and structure (status, labels, nesting)",
          "nodes are atomic and testable",
          "dependency ordering enforced",
          "coverage aligns to milestone acceptance criteria"
        ],
        "quality_standards": [
          "TDD sequence present",
          "no missing dependencies",
          "no speculative nodes beyond selected milestones",
          "clear file-by-file prompts"
        ],
        "iteration_metadata": {
          "iteration_number": "<populate_at_runtime>",
          "previous_checklist_present": "<derived_from_storage>",
          "previous_master_plan_present": "<derived_from_storage>"
        },
        "milestones_to_detail": [],
        "status_rules": {
          "completed": "[✅]",
          "in_progress": "[🚧]",
          "unstarted": "[ ]"
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
          "document_key": "actionable_checklist",
          "content_to_include": {
            "elaboration_instruction": "For each milestone from the milestone_schema, expand into a fully described work node with all the elements provided. Elaborate in dependency order. If generation limits are reached before exhausting the batch, use continuation flags.",
            "node_skeleton": {
              "path": "",
              "title": "",
              "objective": [],
              "role": [],
              "module": [],
              "deps": [],
              "context_slice": [],
              "interface": [],
              "interface_tests": [],
              "interface_guards": [],
              "unit_tests": [],
              "construction": [],
              "source": [],
              "provides": [],
              "mocks": [],
              "integration_tests": [],
              "directionality": [],
              "requirements": [],
              "commit": []
            }
          }
        },
        {
          "document_key": "updated_master_plan",
          "content_to_include": {
            "phases": [
              {
                "milestones": [
                  {
                    "id": "",
                    "title": "",
                    "status": "",
                    "objective": "",
                    "deps": [],
                    "provides": [],
                    "directionality": "",
                    "requirements": [],
                    "iteration_delta": ""
                  }
                ]
              }
            ],
            "preserve_completed": true,
            "set_in_progress": "[🚧]",
            "future_status": "[ ]",
            "capture_iteration_delta": true
          }
        },
        {
          "document_key": "advisor_recommendations",
          "content_to_include": {
            "require_comparison_matrix": true,
            "summarize_tradeoffs": true,
            "capture_final_recommendation": true,
            "tie_breaker_guidance": true
          }
        }
      ]
    }'::jsonb;

    -- 14. Define Paralysis Step 2 outputs_required (Generate Actionable Checklist)
    -- Matches 'Target State' -> 'Step 2: Generate Actionable Checklist' -> 'Step Outputs Schema' in paralysis-planning-recipe.md
    v_paralysis_step_2_outputs_required := '{
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
            "nodes[].path",
            "nodes[].title",
            "nodes[].objective[]",
            "nodes[].role[]",
            "nodes[].module[]",
            "nodes[].deps[]",
            "nodes[].context_slice[]",
            "nodes[].interface[]",
            "nodes[].interface_tests[]",
            "nodes[].interface_guards[]",
            "nodes[].unit_tests[]",
            "nodes[].construction[]",
            "nodes[].source[]",
            "nodes[].provides[]",
            "nodes[].mocks[]",
            "nodes[].integration_tests[]",
            "nodes[].directionality[]",
            "nodes[].requirements[]",
            "nodes[].commit[]"
          ]
        }
      ],
      "files_to_generate": [
        { "template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist" }
      ]
    }'::jsonb;

    -- 15. Update Paralysis Step 1 (Build Implementation Header) in Template Steps
    UPDATE public.dialectic_recipe_template_steps
    SET outputs_required = v_paralysis_step_1_outputs_required,
        updated_at = now()
    WHERE template_id = v_paralysis_template_id
      AND step_key = 'build-implementation-header';

    -- 16. Update Paralysis Step 1 (Build Implementation Header) in Instance Steps
    IF v_paralysis_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET outputs_required = v_paralysis_step_1_outputs_required,
            updated_at = now()
        WHERE instance_id = v_paralysis_instance_id
          AND step_key = 'build-implementation-header';
    END IF;

    -- 17. Update Paralysis Step 2 (Generate Actionable Checklist) in Template Steps
    UPDATE public.dialectic_recipe_template_steps
    SET outputs_required = v_paralysis_step_2_outputs_required,
        updated_at = now()
    WHERE template_id = v_paralysis_template_id
      AND step_key = 'generate-actionable-checklist';

    -- 18. Update Paralysis Step 2 (Generate Actionable Checklist) in Instance Steps
    IF v_paralysis_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET outputs_required = v_paralysis_step_2_outputs_required,
            updated_at = now()
        WHERE instance_id = v_paralysis_instance_id
          AND step_key = 'generate-actionable-checklist';
    END IF;

    -- 19. Define Paralysis Step 3 outputs_required (Generate Updated Master Plan)
    -- Matches 'Target State' -> 'Step 3: Generate Updated Master Plan' -> 'Step Outputs Schema' in paralysis-planning-recipe.md
    v_paralysis_step_3_outputs_required := '{
        "documents": [
          {
            "document_key": "updated_master_plan",
            "template_filename": "paralysis_updated_master_plan.md",
            "artifact_class": "rendered_document",
            "file_type": "markdown",
            "content_to_include": {
              "index": [],
              "executive_summary": "",
              "phases": [
                {
                  "name": "",
                  "objective": "",
                  "technical_context": "",
                  "implementation_strategy": "",
                  "milestones": [
                    {
                      "id": "",
                      "title": "",
                      "status": "",
                      "objective": "",
                      "deps": [],
                      "provides": [],
                      "directionality": "",
                      "requirements": [],
                      "iteration_delta": ""
                    }
                  ]
                }
              ],
              "status_summary": {
                "completed": [],
                "in_progress": [],
                "up_next": []
              },
              "technical_context": "",
              "implementation_context": "",
              "test_framework": "",
              "component_mapping": "",
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
          }
        ],
        "files_to_generate": [
          { "template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan" }
        ],
        "assembled_json": [
          {
            "document_key": "updated_master_plan",
            "artifact_class": "assembled_document_json",
            "fields": [
              "index[]",
              "executive_summary",
              "phases[].name",
              "phases[].objective",
              "phases[].technical_context",
              "phases[].implementation_strategy",
              "phases[].milestones[].id",
              "phases[].milestones[].title",
              "phases[].milestones[].status",
              "phases[].milestones[].objective",
              "phases[].milestones[].deps[]",
              "phases[].milestones[].provides[]",
              "phases[].milestones[].directionality",
              "phases[].milestones[].requirements[]",
              "phases[].milestones[].iteration_delta",
              "status_summary.completed[]",
              "status_summary.in_progress[]",
              "status_summary.up_next[]",
              "technical_context",
              "implementation_context",
              "test_framework",
              "component_mapping",
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
    }'::jsonb;

    -- 20. Update Paralysis Step 3 (Generate Updated Master Plan) in Template Steps
    UPDATE public.dialectic_recipe_template_steps
    SET outputs_required = v_paralysis_step_3_outputs_required,
        updated_at = now()
    WHERE template_id = v_paralysis_template_id
      AND step_key = 'generate-updated-master-plan';

    -- 21. Update Paralysis Step 3 (Generate Updated Master Plan) in Instance Steps
    IF v_paralysis_instance_id IS NOT NULL THEN
        UPDATE public.dialectic_stage_recipe_steps
        SET outputs_required = v_paralysis_step_3_outputs_required,
            updated_at = now()
        WHERE instance_id = v_paralysis_instance_id
          AND step_key = 'generate-updated-master-plan';
    END IF;

END $$;