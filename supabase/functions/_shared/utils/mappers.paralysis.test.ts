import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';

describe('mapToStageWithRecipeSteps for paralysis stage', () => {

    it('should correctly map the "build-implementation-header" step from paralysis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Paralysis',
            expected_output_template_ids: [],
            id: 'stage-paralysis',
            recipe_template_id: 'template-paralysis',
            slug: 'paralysis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-paralysis',
                template_id: 'template-paralysis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-paralysis-planner',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-paralysis-planner',
                    step_key: 'build-implementation-header',
                    step_slug: 'build-implementation-header',
                    step_name: 'Build Implementation Header',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-paralysis-planner',
                    output_type: 'HeaderContext',
                    granularity_strategy: 'all_to_one',
                    inputs_required: '[{"type":"seed_prompt","slug":"paralysis","document_key":"seed_prompt","required":true},{"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},{"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},{"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false},{"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},{"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},{"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},{"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false}]',
                    inputs_relevance: '[{"document_key":"seed_prompt","slug":"paralysis","relevance":0.6},{"document_key":"technical_requirements","slug":"parenthesis","relevance":1.0},{"document_key":"master_plan","slug":"parenthesis","relevance":0.98},{"document_key":"milestone_schema","slug":"parenthesis","relevance":0.95},{"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.7},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.7},{"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.65},{"document_key":"actionable_checklist","slug":"paralysis","relevance":0.85},{"document_key":"updated_master_plan","slug":"paralysis","relevance":0.9},{"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.6},{"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.6}]',
                    outputs_required: '{"system_materials":{"agent_notes_to_self":"summary of which milestones are detailed in this iteration and why","input_artifacts_summary":"TRD sections used, Master Plan phase/milestone references","stage_rationale":"explain ordering, TDD emphasis, and how checklist conforms to style guide","progress_update":"summarize completed vs remaining milestones; denote updated statuses in Master Plan","generation_limits":{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"},"document_order":["actionable_checklist","updated_master_plan","advisor_recommendations"],"current_document":"actionable_checklist","exhaustiveness_requirement":"extreme detail; no summaries; each step includes inputs, outputs, validation; follow the style guide exactly","validation_checkpoint":["checklist uses style guide (status, numbering, labels)","steps are atomic and testable","dependency ordering enforced","coverage aligns to milestone acceptance criteria"],"quality_standards":["TDD sequence present","no missing dependencies","no speculative steps beyond selected milestones","clear file-by-file prompts"],"iteration_metadata":{"iteration_number":"<populate_at_runtime>","previous_checklist_present":"<derived_from_storage>","previous_master_plan_present":"<derived_from_storage>"},"milestones_to_detail":[],"status_rules":{"completed":"[✅]","in_progress":"[🚧]","unstarted":"[ ]"}},"header_context_artifact":{"type":"header_context","document_key":"header_context","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"actionable_checklist","content_to_include":{"milestone_ids":["<list the next milestone(s) to detail from the master_plan and milestone_schema>"]}},{"document_key":"updated_master_plan","content_to_include":{"preserve_completed":true,"set_in_progress":"[🚧]","future_status":"[ ]","capture_iteration_delta":true}},{"document_key":"advisor_recommendations","content_to_include":{"require_comparison_matrix":true,"summarize_tradeoffs":true,"capture_final_recommendation":true,"tie_breaker_guidance":true}}]}',
                    parallel_group: null,
                    branch_key: null,
                    execution_order: 1,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Emit header_context.json describing the milestones to detail, checklist sizing rules, status preservation policy, and continuation metadata.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-actionable-checklist" step from paralysis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Paralysis',
            expected_output_template_ids: [],
            id: 'stage-paralysis',
            recipe_template_id: 'template-paralysis',
            slug: 'paralysis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-paralysis',
                template_id: 'template-paralysis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-paralysis-checklist',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-paralysis-checklist',
                    step_key: 'generate-actionable-checklist',
                    step_slug: 'generate-actionable-checklist',
                    step_name: 'Generate Actionable Checklist',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-paralysis-checklist',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},{"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},{"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},{"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":false},{"type":"feedback","slug":"paralysis","document_key":"actionable_checklist","required":false},{"type":"feedback","slug":"parenthesis","document_key":"technical_requirements","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false},{"type":"feedback","slug":"parenthesis","document_key":"milestone_schema","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","slug":"paralysis","relevance":1.0},{"document_key":"technical_requirements","slug":"parenthesis","relevance":0.95},{"document_key":"master_plan","slug":"parenthesis","relevance":0.93},{"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},{"document_key":"actionable_checklist","slug":"paralysis","relevance":0.8},{"document_key":"actionable_checklist","slug":"paralysis","type":"feedback","relevance":0.65},{"document_key":"technical_requirements","slug":"parenthesis","type":"feedback","relevance":0.6},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6},{"document_key":"milestone_schema","slug":"parenthesis","type":"feedback","relevance":0.55}]',
                    outputs_required: '{"documents":[{"document_key":"actionable_checklist","template_filename":"paralysis_actionable_checklist.md","artifact_class":"rendered_document","file_type":"markdown"}],"assembled_json":[{"document_key":"actionable_checklist","artifact_class":"assembled_document_json","fields":["steps[].id","steps[].status","steps[].component_label","steps[].inputs","steps[].outputs","steps[].validation","steps[].tdd_sequence","steps[].dependencies"]}],"files_to_generate":[{"template_filename":"paralysis_actionable_checklist.md","from_document_key":"actionable_checklist"}]}',
                    parallel_group: 2,
                    branch_key: null,
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the detailed implementation checklist for the next milestone slice.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-updated-master-plan" step from paralysis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Paralysis',
            expected_output_template_ids: [],
            id: 'stage-paralysis',
            recipe_template_id: 'template-paralysis',
            slug: 'paralysis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-paralysis',
                template_id: 'template-paralysis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-paralysis-master-plan',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-paralysis-master-plan',
                    step_key: 'generate-updated-master-plan',
                    step_slug: 'generate-updated-master-plan',
                    step_name: 'Generate Updated Master Plan',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-paralysis-master-plan',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"paralysis","document_key":"header_context","required":true},{"type":"document","slug":"parenthesis","document_key":"master_plan","required":true},{"type":"document","slug":"parenthesis","document_key":"milestone_schema","required":true},{"type":"document","slug":"paralysis","document_key":"actionable_checklist","required":true},{"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":false},{"type":"feedback","slug":"paralysis","document_key":"updated_master_plan","required":false},{"type":"feedback","slug":"parenthesis","document_key":"master_plan","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","slug":"paralysis","relevance":1.0},{"document_key":"master_plan","slug":"parenthesis","relevance":0.95},{"document_key":"milestone_schema","slug":"parenthesis","relevance":0.9},{"document_key":"actionable_checklist","slug":"paralysis","relevance":0.92},{"document_key":"updated_master_plan","slug":"paralysis","relevance":0.85},{"document_key":"updated_master_plan","slug":"paralysis","type":"feedback","relevance":0.65},{"document_key":"master_plan","slug":"parenthesis","type":"feedback","relevance":0.6}]',
                    outputs_required: '{"documents":[{"document_key":"updated_master_plan","template_filename":"paralysis_updated_master_plan.md","artifact_class":"rendered_document","file_type":"markdown"}],"assembled_json":[{"document_key":"updated_master_plan","artifact_class":"assembled_document_json","fields":["phases[].name","phases[].milestones[].id","phases[].milestones[].status","phases[].milestones[].objective","phases[].milestones[].dependencies","phases[].milestones[].acceptance_criteria","iteration_delta"]}],"files_to_generate":[{"template_filename":"paralysis_updated_master_plan.md","from_document_key":"updated_master_plan"}]}',
                    parallel_group: 3,
                    branch_key: null,
                    execution_order: 3,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Update the persistent master plan, marking newly detailed milestones.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "generate-advisor-recommendations" step from paralysis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Paralysis',
            expected_output_template_ids: [],
            id: 'stage-paralysis',
            recipe_template_id: 'template-paralysis',
            slug: 'paralysis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-paralysis',
                template_id: 'template-paralysis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-paralysis-advisor',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-paralysis-advisor',
                    step_key: 'generate-advisor-recommendations',
                    step_slug: 'generate-advisor-recommendations',
                    step_name: 'Generate Advisor Recommendations',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-paralysis-advisor',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"document","slug":"thesis","document_key":"initial_user_prompt","required":true},{"type":"document","slug":"synthesis","document_key":"product_requirements","required":true,"multiple":true},{"type":"document","slug":"paralysis","document_key":"updated_master_plan","required":true,"multiple":true},{"type":"header_context","slug":"paralysis","document_key":"header_context","required":false},{"type":"document","slug":"paralysis","document_key":"advisor_recommendations","required":false},{"type":"feedback","slug":"paralysis","document_key":"advisor_recommendations","required":false}]',
                    inputs_relevance: '[{"document_key":"initial_user_prompt","slug":"thesis","relevance":1.0},{"document_key":"product_requirements","slug":"synthesis","relevance":0.95},{"document_key":"updated_master_plan","slug":"paralysis","relevance":0.95},{"document_key":"header_context","slug":"paralysis","relevance":0.7},{"document_key":"advisor_recommendations","slug":"paralysis","relevance":0.5},{"document_key":"advisor_recommendations","slug":"paralysis","type":"feedback","relevance":0.4}]',
                    outputs_required: '{"documents":[{"document_key":"advisor_recommendations","template_filename":"paralysis_advisor_recommendations.md","artifact_class":"rendered_document","file_type":"markdown"}],"assembled_json":[{"document_key":"advisor_recommendations","artifact_class":"assembled_document_json","fields":["options[].id","options[].scores[].dimension","options[].scores[].weight","options[].scores[].value","options[].scores[].rationale","options[].preferred","analysis.summary","analysis.tradeoffs","analysis.consensus","recommendation.rankings[]","recommendation.tie_breakers[]"]}],"files_to_generate":[{"template_filename":"paralysis_advisor_recommendations.md","from_document_key":"advisor_recommendations"}]}',
                    parallel_group: 4,
                    branch_key: null,
                    execution_order: 4,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Evaluate the updated master plans produced in this iteration against the original user request.',
                }, ],
            }, ],
        };
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });
});
