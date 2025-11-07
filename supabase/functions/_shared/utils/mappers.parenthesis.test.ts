import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';

describe('mapToStageWithRecipeSteps for parenthesis stage', () => {

    it('should correctly map the "build-planning-header" step from parenthesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Parenthesis',
            expected_output_template_ids: [],
            id: 'stage-parenthesis',
            recipe_template_id: 'template-parenthesis',
            slug: 'parenthesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-parenthesis',
                template_id: 'template-parenthesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-parenthesis-planner',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-parenthesis-planner',
                    step_key: 'build-planning-header',
                    step_slug: 'build-planning-header',
                    step_name: 'Build Planning Header',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-parenthesis-planner',
                    output_type: 'HeaderContext',
                    granularity_strategy: 'all_to_one',
                    inputs_required: '[{"type":"seed_prompt","slug":"parenthesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"synthesis","document_key":"prd","required":true},{"type":"document","slug":"synthesis","document_key":"system_architecture_overview","required":true},{"type":"document","slug":"synthesis","document_key":"tech_stack_recommendations","required":true},{"type":"feedback","slug":"synthesis","document_key":"prd","required":false},{"type":"feedback","slug":"synthesis","document_key":"system_architecture_overview","required":false},{"type":"feedback","slug":"synthesis","document_key":"tech_stack_recommendations","required":false},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false}]',
                    inputs_relevance: '[{"document_key":"seed_prompt","slug":"parenthesis","relevance":0.6},{"document_key":"prd","slug":"synthesis","relevance":1.0},{"document_key":"system_architecture_overview","slug":"synthesis","relevance":0.95},{"document_key":"tech_stack_recommendations","slug":"synthesis","relevance":0.90},{"document_key":"prd","slug":"synthesis","type":"feedback","relevance":0.75},{"document_key":"system_architecture_overview","slug":"synthesis","type":"feedback","relevance":0.70},{"document_key":"tech_stack_recommendations","slug":"synthesis","type":"feedback","relevance":0.65},{"document_key":"master_plan","slug":"parenthesis","relevance":0.99},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.85}]',
                    outputs_required: '{"system_materials":{"milestones":[],"dependency_rules":[],"status_preservation_rules":{"completed_status":"[✅]","in_progress_status":"[🚧]","unstarted_status":"[ ]"},"trd_outline_inputs":{"subsystems":[],"apis":[],"schemas":[],"proposed_file_tree":"","architecture_overview":""}},"header_context_artifact":{"type":"header_context","document_key":"header_context","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"trd","content_to_include":{"subsystems":[],"apis":[],"schemas":[],"proposed_file_tree":"","architecture_overview":"","feature_scope":[],"feasibility_insights":[],"non_functional_alignment":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"guardrails":[],"measurement_plan":"","architecture_summary":"","architecture":"","services":[],"components":[],"data_flows":[],"interfaces":[],"integration_points":[],"dependency_resolution":[],"security_measures":[],"observability_strategy":[],"scalability_plan":[],"resilience_strategy":[],"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[]}},{"document_key":"master_plan","content_to_include":{"phases":[],"status_markers":{"unstarted":"[ ]","in_progress":"[🚧]","completed":"[✅]"},"dependency_rules":[],"generation_limits":{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"},"feature_scope":[],"features":[],"executive_summary":"","mvp_description":"","market_opportunity":"","competitive_analysis":"","architecture_summary":"","architecture":"","services":[],"components":[],"integration_points":[],"dependency_resolution":[],"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[]}},{"document_key":"milestone_schema","content_to_include":{"fields":["id","title","objective","dependencies","acceptance_criteria","status"],"style_guide_notes":"Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps will be generated in the next stage.","features":[],"feasibility_insights":[],"non_functional_alignment":[],"architecture_summary":"","services":[],"components":[],"dependency_resolution":[],"component_details":[],"integration_requirements":[],"migration_context":[]}}]}',
                    parallel_group: null,
                    branch_key: null,
                    execution_order: 1,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Generate HeaderContext JSON that orchestrates downstream Parenthesis documents.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-trd" step from parenthesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Parenthesis',
            expected_output_template_ids: [],
            id: 'stage-parenthesis',
            recipe_template_id: 'template-parenthesis',
            slug: 'parenthesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-parenthesis',
                template_id: 'template-parenthesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-parenthesis-trd',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-parenthesis-trd',
                    step_key: 'generate-trd',
                    step_slug: 'generate-trd',
                    step_name: 'Generate Technical Requirements Document',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-parenthesis-trd',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"parenthesis","document_key":"header_context","required":true},{"type":"document","slug":"synthesis","document_key":"system_architecture_overview","required":true},{"type":"document","slug":"synthesis","document_key":"tech_stack_recommendations","required":true},{"type":"document","slug":"synthesis","document_key":"prd","required":true},{"type":"document","slug":"parenthesis","document_key":"trd","required":false},{"type":"feedback","slug":"synthesis","document_key":"system_architecture_overview","required":false},{"type":"feedback","slug":"synthesis","document_key":"tech_stack_recommendations","required":false},{"type":"feedback","slug":"synthesis","document_key":"prd","required":false},{"type":"feedback","slug":"parenthesis","document_key":"trd","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","slug":"parenthesis","relevance":1.0},{"document_key":"system_architecture_overview","slug":"synthesis","relevance":0.95},{"document_key":"tech_stack_recommendations","slug":"synthesis","relevance":0.9},{"document_key":"prd","slug":"synthesis","relevance":0.85},{"document_key":"trd","slug":"parenthesis","relevance":0.99},{"document_key":"system_architecture_overview","slug":"synthesis","type":"feedback","relevance":0.80},{"document_key":"tech_stack_recommendations","slug":"synthesis","type":"feedback","relevance":0.75},{"document_key":"prd","slug":"synthesis","type":"feedback","relevance":0.50},{"document_key":"trd","slug":"parenthesis","type":"feedback","relevance":0.83}]',
                    outputs_required: '{"documents":[{"document_key":"trd","template_filename":"parenthesis_trd.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"index":[],"executive_summary":"","subsystems":[{"name":"","objective":"","implementation_notes":""}],"apis":[{"name":"","description":"","contracts":[]}],"schemas":[{"name":"","columns":[],"indexes":[],"rls":[]}],"proposed_file_tree":"","architecture_overview":"","delta_summary":"","iteration_notes":""}}],"files_to_generate":[{"template_filename":"parenthesis_trd.md","from_document_key":"trd"}],"assembled_json":[{"document_key":"trd","artifact_class":"assembled_document_json","fields":["subsystems[].name","subsystems[].objective","subsystems[].implementation_notes","apis[].name","apis[].description","apis[].contracts[]","schemas[].name","schemas[].columns[]","schemas[].indexes[]","schemas[].rls[]","proposed_file_tree","architecture_overview","delta_summary","iteration_notes","feature_scope[]","feasibility_insights[]","non_functional_alignment[]","outcome_alignment","north_star_metric","primary_kpis[]","guardrails[]","measurement_plan","architecture_summary","architecture","services[]","components[]","data_flows[]","interfaces[]","integration_points[]","dependency_resolution[]","security_measures[]","observability_strategy[]","scalability_plan[]","resilience_strategy[]","frontend_stack","backend_stack","data_platform","devops_tooling","security_tooling","shared_libraries[]","third_party_services[]"]}]}',
                    parallel_group: 2,
                    branch_key: 'trd',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the updated TRD that aligns synthesized architecture with the planner’s milestone breakdown.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-master-plan" step from parenthesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Parenthesis',
            expected_output_template_ids: [],
            id: 'stage-parenthesis',
            recipe_template_id: 'template-parenthesis',
            slug: 'parenthesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-parenthesis',
                template_id: 'template-parenthesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-parenthesis-master-plan',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-parenthesis-master-plan',
                    step_key: 'generate-master-plan',
                    step_slug: 'generate-master-plan',
                    step_name: 'Generate Master Plan',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-parenthesis-master-plan',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"parenthesis","document_key":"header_context","required":true},{"type":"document","slug":"parenthesis","document_key":"trd","required":true},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"document","slug":"synthesis","document_key":"prd","required":true},{"type":"feedback","slug":"parenthesis","document_key":"trd","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"feedback","slug":"synthesis","document_key":"prd","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","slug":"parenthesis","relevance":1.0},{"document_key":"trd","slug":"parenthesis","relevance":0.95},{"document_key":"master_plan","slug":"parenthesis","relevance":0.99},{"document_key":"prd","slug":"synthesis","relevance":0.75},{"document_key":"trd","slug":"parenthesis","type":"feedback","relevance":0.85},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.90},{"document_key":"prd","slug":"synthesis","type":"feedback","relevance":0.70}]',
                    outputs_required: '{"documents":[{"document_key":"master_plan","template_filename":"parenthesis_master_plan.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"index":[],"executive_summary":"","phases":[{"name":"","objective":"","milestones":[{"id":"","title":"","objective":"","inputs":[],"outputs":[],"dependencies":[],"acceptance_criteria":[],"status":"[ ]","coverage_notes":"","iteration_delta":""}]}],"status_summary":{"completed":[],"in_progress":[],"up_next":[]}}}],"files_to_generate":[{"template_filename":"parenthesis_master_plan.md","from_document_key":"master_plan"}],"assembled_json":[{"document_key":"master_plan","artifact_class":"assembled_document_json","fields":["phases[].name","phases[].objective","phases[].milestones[].id","phases[].milestones[].title","phases[].milestones[].objective","phases[].milestones[].inputs[]","phases[].milestones[].outputs[]","phases[].milestones[].dependencies[]","phases[].milestones[].acceptance_criteria[]","phases[].milestones[].status","phases[].milestones[].coverage_notes","phases[].milestones[].iteration_delta","status_summary.completed[]","status_summary.in_progress[]","status_summary.up_next[]","feature_scope[]","features[]","executive_summary","mvp_description","market_opportunity","competitive_analysis","architecture_summary","architecture","services[]","components[]","integration_points[]","dependency_resolution[]","frontend_stack","backend_stack","data_platform","devops_tooling","security_tooling","shared_libraries[]","third_party_services[]"]}]}',
                    parallel_group: 3,
                    branch_key: 'master_plan',
                    execution_order: 3,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Output the dependency-ordered Master Plan marking just-detailed milestones.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-milestone-schema" step from parenthesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Parenthesis',
            expected_output_template_ids: [],
            id: 'stage-parenthesis',
            recipe_template_id: 'template-parenthesis',
            slug: 'parenthesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-parenthesis',
                template_id: 'template-parenthesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-parenthesis-milestone-schema',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-parenthesis-milestone-schema',
                    step_key: 'generate-milestone-schema',
                    step_slug: 'generate-milestone-schema',
                    step_name: 'Generate Milestone Schema',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-parenthesis-milestone-schema',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"parenthesis","document_key":"header_context","required":true},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},{"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","slug":"parenthesis","relevance":1.0},{"document_key":"master_plan","slug":"parenthesis","relevance":0.90},{"document_key":"milestone_schema","slug":"parenthesis","relevance":0.95},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.80},{"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.85}]',
                    outputs_required: '{"documents":[{"document_key":"milestone_schema","template_filename":"parenthesis_milestone_schema.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"index":[],"executive_summary":"","fields":[{"name":"id","type":"string","description":"Stable milestone identifier (e.g., M1, M1.a)"},{"name":"title","type":"string","description":"Short milestone name"},{"name":"objective","type":"string","description":"Narrative summary of milestone goal"},{"name":"dependencies","type":"string[]","description":"List of prerequisite milestone IDs"},{"name":"acceptance_criteria","type":"string[]","description":"Checklist of validation outcomes"},{"name":"inputs","type":"string[]","description":"Artifacts required before work begins"},{"name":"outputs","type":"string[]","description":"Artifacts produced when milestone completes"},{"name":"status","type":"enum","values":["[ ]","[🚧]","[✅]"],"description":"Current completion status"}],"style_guide_notes":"Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps belong to next stage.","validation_rules":["Status must be one of [ ], [🚧], [✅]","Dependencies must reference existing milestone IDs","Acceptance criteria must be non-empty for every milestone"],"iteration_guidance":{"reuse_policy":"Carry forward schema; append new fields under migration log if expanded","versioning":"Increment schema_version when fields change"}}}],"files_to_generate":[{"template_filename":"parenthesis_milestone_schema.md","from_document_key":"milestone_schema"}],"assembled_json":[{"document_key":"milestone_schema","artifact_class":"assembled_document_json","fields":["fields[].name","fields[].type","fields[].description","fields[].values[]","style_guide_notes","validation_rules[]","iteration_guidance.reuse_policy","iteration_guidance.versioning","features[]","feasibility_insights[]","non_functional_alignment[]","architecture_summary","services[]","components[]","dependency_resolution[]","component_details[]","integration_requirements[]","migration_context[]"]}]}',
                    parallel_group: 4,
                    branch_key: 'milestone_schema',
                    execution_order: 4,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Define reusable milestone field schema and style-guide notes.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });
});
