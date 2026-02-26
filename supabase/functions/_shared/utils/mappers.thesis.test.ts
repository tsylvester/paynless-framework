import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps, DialecticStageRecipeStep, StageWithRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import type { Tables } from '../../types_db.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';
import { FileType } from '../types/file_manager.types.ts';
import { InputRule, RelevanceRule } from '../../dialectic-service/dialectic.interface.ts';

describe('mapToStageWithRecipeSteps', () => {

  it('should correctly map the "thesis_build_stage_header" step from thesis_stage.sql', () => {
      const mockDbResponse: DatabaseRecipeSteps = {
          active_recipe_instance_id: 'instance-1',
          created_at: '2025-11-05T11:58:00.000Z',
          default_system_prompt_id: 'default-prompt',
          description: 'A stage.',
          display_name: 'Thesis',
          expected_output_template_ids: [],
          id: 'stage-thesis',
          recipe_template_id: 'template-thesis',
          slug: 'thesis',
          dialectic_stage_recipe_instances: [{
              cloned_at: null,
              created_at: '2025-11-05T11:59:00.000Z',
              id: 'instance-1',
              is_cloned: false,
              stage_id: 'stage-thesis',
              template_id: 'template-thesis',
              updated_at: '2025-11-05T11:59:00.000Z',
              dialectic_stage_recipe_steps: [{
                  id: 'step-thesis-planner',
                  instance_id: 'instance-1',
                  template_step_id: 'template-step-thesis-planner',
                  step_key: 'thesis_build_stage_header',
                  step_slug: 'build-stage-header',
                  step_name: 'Build Stage Header',
                  job_type: 'PLAN',
                  prompt_type: 'Planner',
                  prompt_template_id: 'prompt-thesis-planner',
                  output_type: 'HeaderContext',
                  granularity_strategy: 'all_to_one',
                  inputs_required: '[{"type":"seed_prompt","slug":"thesis","document_key":"seed_prompt","required":true}]',
                  inputs_relevance: '[{"document_key":"seed_prompt","relevance":1.0}]',
                  outputs_required: '{"system_materials":{"agent_notes_to_self":"outline/index of all outputs in this response and how they connect to the objective","input_artifacts_summary":"brief, faithful summary of user prompt and referenced materials","stage_rationale":"why these choices align with constraints, standards, and stakeholder needs","progress_update":"for continuation turns, summarize what is complete vs remaining; omit on first turn","validation_checkpoint":["requirements addressed","best practices applied","feasible & compliant","references integrated"],"quality_standards":["security-first","maintainable","scalable","performance-aware"],"diversity_rubric":{"prefer_standards_when":"meet constraints, well-understood by team, minimize risk/time-to-market","propose_alternates_when":"materially improve performance, security, maintainability, or total cost under constraints","if_comparable":"present 1-2 viable options with concise trade-offs and a clear recommendation"}},"header_context_artifact":{"type":"header_context","document_key":"header_context","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"business_case","content_to_include":{"market_opportunity":"","user_problem_validation":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":"","weaknesses":"","opportunities":"","threats":"","next_steps":"","proposal_references":[],"executive_summary":""}},{"document_key":"feature_spec","content_to_include":{"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[]}]}},{"document_key":"technical_approach","content_to_include":{"architecture":"","components":"","data":"","deployment":"","sequencing":"","risk_mitigation":"","open_questions":""}},{"document_key":"success_metrics","content_to_include":{"outcome_alignment":"","north_star_metric":"","primary_kpis":"","leading_indicators":"","lagging_indicators":"","guardrails":"","measurement_plan":"","risk_signals":"","next_steps":"","data_sources":[],"reporting_cadence":"","ownership":"","escalation_plan":""}}]}',
                  parallel_group: null,
                  branch_key: null,
                  execution_order: 1,
                  created_at: '2025-11-06T00:00:00.000Z',
                  updated_at: '2025-11-06T00:00:00.000Z',
                  is_skipped: false,
                  config_override: {},
                  object_filter: {},
                  output_overrides: {},
                  step_description: 'Generate HeaderContext JSON that orchestrates downstream Thesis documents.',
              }, ],
          }, ],
      };

      const actual = mapToStageWithRecipeSteps(mockDbResponse);

      assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
  });

    it('should correctly map the "thesis_generate_business_case" step from thesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Thesis',
            expected_output_template_ids: [],
            id: 'stage-thesis',
            recipe_template_id: 'template-thesis',
            slug: 'thesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-thesis',
                template_id: 'template-thesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-thesis-business-case',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-thesis-business-case',
                    step_key: 'thesis_generate_business_case',
                    step_slug: 'generate-business-case',
                    step_name: 'Generate Business Case',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-thesis-business-case',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.7}]',
                    outputs_required: '{"documents":[{"document_key":"business_case","template_filename":"thesis_business_case.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"executive_summary":"","market_opportunity":"","user_problem_validation":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":"","weaknesses":"","opportunities":"","threats":"","next_steps":"","proposal_references":[]}}],"files_to_generate":[{"template_filename":"thesis_business_case.md","from_document_key":"business_case"}]}',
                    parallel_group: 2,
                    branch_key: 'business_case',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Create the business case document using the shared HeaderContext.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "thesis_generate_feature_spec" step from thesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Thesis',
            expected_output_template_ids: [],
            id: 'stage-thesis',
            recipe_template_id: 'template-thesis',
            slug: 'thesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-thesis',
                template_id: 'template-thesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-thesis-feature-spec',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-thesis-feature-spec',
                    step_key: 'thesis_generate_feature_spec',
                    step_slug: 'generate-feature-spec',
                    step_name: 'Generate Feature Spec',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-thesis-feature-spec',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.65}]',
                    outputs_required: '{"documents":[{"document_key":"feature_spec","template_filename":"thesis_feature_spec.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[]}]}],"files_to_generate":[{"template_filename":"thesis_product_requirements_document.md","from_document_key":"feature_spec"}]}',
                    parallel_group: 2,
                    branch_key: 'feature_spec',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the feature specification document using the shared HeaderContext.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "thesis_generate_technical_approach" step from thesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Thesis',
            expected_output_template_ids: [],
            id: 'stage-thesis',
            recipe_template_id: 'template-thesis',
            slug: 'thesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-thesis',
                template_id: 'template-thesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-thesis-technical-approach',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-thesis-technical-approach',
                    step_key: 'thesis_generate_technical_approach',
                    step_slug: 'generate-technical-approach',
                    step_name: 'Generate Technical Approach',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-thesis-technical-approach',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.6}]',
                    outputs_required: '{"documents":[{"document_key":"technical_approach","template_filename":"thesis_technical_approach.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"architecture":"","components":"","data":"","deployment":"","sequencing":"","risk_mitigation":"","open_questions":""}}],"files_to_generate":[{"template_filename":"thesis_implementation_plan_proposal.md","from_document_key":"technical_approach"}]}',
                    parallel_group: 2,
                    branch_key: 'technical_approach',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the technical approach overview using the shared HeaderContext.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "thesis_generate_success_metrics" step from thesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Thesis',
            expected_output_template_ids: [],
            id: 'stage-thesis',
            recipe_template_id: 'template-thesis',
            slug: 'thesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-thesis',
                template_id: 'template-thesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-thesis-success-metrics',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-thesis-success-metrics',
                    step_key: 'thesis_generate_success_metrics',
                    step_slug: 'generate-success-metrics',
                    step_name: 'Generate Success Metrics',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-thesis-success-metrics',
                    output_type: 'RenderedDocument',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"seed_prompt","relevance":0.8}]',
                    outputs_required: '{"documents":[{"document_key":"success_metrics","template_filename":"thesis_success_metrics.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"outcome_alignment":"","north_star_metric":"","primary_kpis":"","leading_indicators":"","lagging_indicators":"","guardrails":"","measurement_plan":"","risk_signals":"","next_steps":"","data_sources":[],"reporting_cadence":"","ownership":"","escalation_plan":""}}],"files_to_generate":[{"template_filename":"thesis_success_metrics.md","from_document_key":"success_metrics"}]}',
                    parallel_group: 2,
                    branch_key: 'success_metrics',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the success metrics document using the shared HeaderContext.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });
});
