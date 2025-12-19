import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';
import type { Tables } from '../../types_db.ts';

/**
 * Shared mock containing all 13 synthesis recipe steps from the actual
 * synthesis_stage.sql migration (lines 205-1154).
 *
 * This mock uses exact data from the production database migration to ensure
 * tests validate real-world scenarios rather than fabricated data.
 */

const SYNTHESIS_STAGE_MOCK: DatabaseRecipeSteps = {
    active_recipe_instance_id: 'mock-instance-synthesis',
    created_at: '2025-11-05T11:58:00.000Z',
    default_system_prompt_id: 'mock-default-prompt',
    description: 'Stage recipe that orchestrates pairwise synthesis, consolidation, and final deliverables.',
    display_name: 'Synthesis Refinement',
    expected_output_template_ids: [],
    id: 'mock-stage-synthesis',
    recipe_template_id: 'mock-template-synthesis-v1',
    slug: 'synthesis',
    dialectic_stage_recipe_instances: [{
        cloned_at: null,
        created_at: '2025-11-05T11:59:00.000Z',
        id: 'mock-instance-synthesis',
        is_cloned: false,
        stage_id: 'mock-stage-synthesis',
        template_id: 'mock-template-synthesis-v1',
        updated_at: '2025-11-05T11:59:00.000Z',
        dialectic_stage_recipe_steps: [
            // Step 1: Pairwise Header Planner (lines 207-355)
            {
                id: 'mock-step-synthesis-prepare-pairwise-header',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-prepare-pairwise-header',
                step_key: 'synthesis_prepare_pairwise_header',
                step_slug: 'prepare-pairwise-synthesis-header',
                step_name: 'Prepare Pairwise Synthesis Header',
                step_description: 'Generate HeaderContext JSON that guides pairwise synthesis turns across thesis lineages and antithesis critiques.',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'mock-prompt-synthesis-planner-pairwise',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"seed_prompt","slug":"synthesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true,"multiple":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true,"multiple":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true,"multiple":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"business_case_critique","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"technical_feasibility_assessment","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"non_functional_requirements","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"risk_register","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"dependency_map","required":true,"multiple":true},{"type":"document","slug":"antithesis","document_key":"comparison_vector","required":true,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"business_case_critique","required":false,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"technical_feasibility_assessment","required":false,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"non_functional_requirements","required":false,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"risk_register","required":false,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"dependency_map","required":false,"multiple":true},{"type":"feedback","slug":"antithesis","document_key":"comparison_vector","required":false,"multiple":true}]',
                inputs_relevance: '[{"document_key":"seed_prompt","slug":"synthesis","relevance":0.6},{"document_key":"business_case","slug":"thesis","relevance":1.0},{"document_key":"feature_spec","slug":"thesis","relevance":0.95},{"document_key":"technical_approach","slug":"thesis","relevance":0.95},{"document_key":"success_metrics","slug":"thesis","relevance":0.9},{"document_key":"business_case_critique","slug":"antithesis","relevance":0.95},{"document_key":"technical_feasibility_assessment","slug":"antithesis","relevance":0.9},{"document_key":"non_functional_requirements","slug":"antithesis","relevance":0.85},{"document_key":"risk_register","slug":"antithesis","relevance":0.85},{"document_key":"dependency_map","slug":"antithesis","relevance":0.8},{"document_key":"comparison_vector","slug":"antithesis","relevance":0.85},{"document_key":"business_case_critique","slug":"antithesis","type":"feedback","relevance":0.80},{"document_key":"technical_feasibility_assessment","slug":"antithesis","type":"feedback","relevance":0.75},{"document_key":"non_functional_requirements","slug":"antithesis","type":"feedback","relevance":0.70},{"document_key":"risk_register","slug":"antithesis","type":"feedback","relevance":0.65},{"document_key":"dependency_map","slug":"antithesis","type":"feedback","relevance":0.6},{"document_key":"comparison_vector","slug":"antithesis","type":"feedback","relevance":0.55}]',
                outputs_required: '{"system_materials":{"executive_summary":"Summarize the intent of merging each Thesis document with its corresponding Antithesis critiques.","input_artifacts_summary":"Identify the thesis and antithesis artifacts that will be combined during pairwise synthesis.","stage_rationale":"Explain that this stage ensures consistent pairwise synthesis before consolidating documents across models.","decision_criteria":["feasibility","risk","non_functional_requirements","dependency_alignment","stakeholder_objectives"]},"header_context_artifact":{"type":"header_context","document_key":"header_context_pairwise","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"synthesis_pairwise_business_case","content_to_include":{"thesis_document":"business_case","critique_document":"business_case_critique","comparison_signal":"comparison_vector","executive_summary":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"critique_alignment":"","next_steps":"","proposal_references":[],"resolved_positions":[],"open_questions":[]}},{"document_key":"synthesis_pairwise_feature_spec","content_to_include":{"thesis_document":"feature_spec","feasibility_document":"technical_feasibility_assessment","nfr_document":"non_functional_requirements","comparison_signal":"comparison_vector","features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[]}],"feature_scope":[],"tradeoffs":[]}},{"document_key":"synthesis_pairwise_technical_approach","content_to_include":{"thesis_document":"technical_approach","risk_document":"risk_register","dependency_document":"dependency_map","architecture":"","components":[],"data":"","deployment":"","sequencing":"","architecture_alignment":[],"risk_mitigations":[],"dependency_resolution":[],"open_questions":[]}},{"document_key":"synthesis_pairwise_success_metrics","content_to_include":{"thesis_document":"success_metrics","critique_document":"business_case_critique","comparison_signal":"comparison_vector","outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"next_steps":"","metric_alignment":[],"tradeoffs":[],"validation_checks":[]}}]}',
                parallel_group: null,
                branch_key: null,
                execution_order: 1,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 2: Pairwise Business Case (lines 360-417)
            {
                id: 'mock-step-synthesis-pairwise-business-case',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-pairwise-business-case',
                step_key: 'synthesis_pairwise_business_case',
                step_slug: 'pairwise-synthesis-business-case',
                step_name: 'Pairwise Synthesis – Business Case',
                step_description: 'Combine the thesis business case with critiques and comparison vector signals into a resolved narrative.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-pairwise-business-case',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context_pairwise","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"antithesis","document_key":"business_case_critique","required":true},{"type":"document","slug":"antithesis","document_key":"comparison_vector","required":true},{"type":"feedback","slug":"antithesis","document_key":"business_case_critique","required":false}]',
                inputs_relevance: '[{"document_key":"header_context_pairwise","slug":"synthesis","relevance":1.0},{"document_key":"business_case","slug":"thesis","relevance":1.0},{"document_key":"business_case_critique","slug":"antithesis","relevance":0.95},{"document_key":"comparison_vector","slug":"antithesis","relevance":0.9},{"document_key":"business_case_critique","slug":"antithesis","type":"feedback","relevance":0.8}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_pairwise_business_case","template_filename":"synthesis_pairwise_business_case.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<derived from thesis artifact>","source_model_slug":"<derived from thesis artifact>","match_keys":["<derived from antithesis reviewer or reviewer combination>"],"content_to_include":{"thesis_document":"business_case","critique_document":"business_case_critique","comparison_signal":"comparison_vector","executive_summary":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"critique_alignment":"","resolved_positions":[],"open_questions":[],"next_steps":"","proposal_references":[]}}],"files_to_generate":[{"template_filename":"synthesis_pairwise_business_case.json","from_document_key":"synthesis_pairwise_business_case"}]}',
                parallel_group: 2,
                branch_key: 'synthesis_pairwise_business_case',
                execution_order: 2,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 3: Pairwise Feature Spec (lines 421-487)
            {
                id: 'mock-step-synthesis-pairwise-feature-spec',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-pairwise-feature-spec',
                step_key: 'synthesis_pairwise_feature_spec',
                step_slug: 'pairwise-synthesis-feature-spec',
                step_name: 'Pairwise Synthesis – Feature Spec',
                step_description: 'Merge feature scope with feasibility, non-functional insights, and comparison signals.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-pairwise-feature-spec',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context_pairwise","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"antithesis","document_key":"technical_feasibility_assessment","required":true},{"type":"document","slug":"antithesis","document_key":"non_functional_requirements","required":true},{"type":"document","slug":"antithesis","document_key":"comparison_vector","required":true},{"type":"feedback","slug":"antithesis","document_key":"technical_feasibility_assessment","required":false},{"type":"feedback","slug":"antithesis","document_key":"non_functional_requirements","required":false},{"type":"feedback","slug":"antithesis","document_key":"comparison_vector","required":false}]',
                inputs_relevance: '[{"document_key":"header_context_pairwise","slug":"synthesis","relevance":1.0},{"document_key":"feature_spec","slug":"thesis","relevance":1.0},{"document_key":"technical_feasibility_assessment","slug":"antithesis","relevance":0.95},{"document_key":"non_functional_requirements","slug":"antithesis","relevance":0.9},{"document_key":"comparison_vector","slug":"antithesis","relevance":0.85},{"document_key":"technical_feasibility_assessment","slug":"antithesis","type":"feedback","relevance":0.8},{"document_key":"non_functional_requirements","slug":"antithesis","type":"feedback","relevance":0.75},{"document_key":"comparison_vector","slug":"antithesis","type":"feedback","relevance":0.7}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_pairwise_feature_spec","template_filename":"synthesis_pairwise_feature_spec.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<derived from thesis artifact>","source_model_slug":"<derived from thesis artifact>","match_keys":["<derived from antithesis reviewer or reviewer combination>"],"content_to_include":{"thesis_document":"feature_spec","feasibility_document":"technical_feasibility_assessment","nfr_document":"non_functional_requirements","comparison_signal":"comparison_vector","features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[]}],"feature_scope":[],"tradeoffs":[]}}],"files_to_generate":[{"template_filename":"synthesis_pairwise_feature_spec.json","from_document_key":"synthesis_pairwise_feature_spec"}]}',
                parallel_group: 2,
                branch_key: 'synthesis_pairwise_feature_spec',
                execution_order: 2,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 4: Pairwise Technical Approach (lines 491-544)
            {
                id: 'mock-step-synthesis-pairwise-technical-approach',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-pairwise-technical-approach',
                step_key: 'synthesis_pairwise_technical_approach',
                step_slug: 'pairwise-synthesis-technical-approach',
                step_name: 'Pairwise Synthesis – Technical Approach',
                step_description: 'Combine thesis technical approach with antithesis risk and dependency findings.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-pairwise-technical-approach',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context_pairwise","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"antithesis","document_key":"risk_register","required":true},{"type":"document","slug":"antithesis","document_key":"dependency_map","required":true},{"type":"feedback","slug":"antithesis","document_key":"risk_register","required":false},{"type":"feedback","slug":"antithesis","document_key":"dependency_map","required":false}]',
                inputs_relevance: '[{"document_key":"header_context_pairwise","slug":"synthesis","relevance":1.0},{"document_key":"technical_approach","slug":"thesis","relevance":1.0},{"document_key":"risk_register","slug":"antithesis","relevance":0.95},{"document_key":"dependency_map","slug":"antithesis","relevance":0.9},{"document_key":"risk_register","slug":"antithesis","type":"feedback","relevance":0.78},{"document_key":"dependency_map","slug":"antithesis","type":"feedback","relevance":0.74}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_pairwise_technical_approach","template_filename":"synthesis_pairwise_technical_approach.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<derived from thesis artifact>","source_model_slug":"<derived from thesis artifact>","match_keys":["<derived from antithesis reviewer or reviewer combination>"],"content_to_include":{"thesis_document":"technical_approach","risk_document":"risk_register","dependency_document":"dependency_map","architecture":"","components":[],"data":"","deployment":"","sequencing":"","architecture_alignment":[],"risk_mitigations":[],"dependency_resolution":[],"open_questions":[]}}],"files_to_generate":[{"template_filename":"synthesis_pairwise_technical_approach.json","from_document_key":"synthesis_pairwise_technical_approach"}]}',
                parallel_group: 2,
                branch_key: 'synthesis_pairwise_technical_approach',
                execution_order: 2,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 5: Pairwise Success Metrics (lines 548-604)
            {
                id: 'mock-step-synthesis-pairwise-success-metrics',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-pairwise-success-metrics',
                step_key: 'synthesis_pairwise_success_metrics',
                step_slug: 'pairwise-synthesis-success-metrics',
                step_name: 'Pairwise Synthesis – Success Metrics',
                step_description: 'Combine thesis success metrics with antithesis critique signals into a resolved set of measurable outcomes.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-pairwise-success-metrics',
                output_type: 'assembled_document_json',
                granularity_strategy: 'per_source_document',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context_pairwise","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"antithesis","document_key":"business_case_critique","required":true},{"type":"document","slug":"antithesis","document_key":"comparison_vector","required":true},{"type":"feedback","slug":"antithesis","document_key":"business_case_critique","required":false},{"type":"feedback","slug":"antithesis","document_key":"comparison_vector","required":false}]',
                inputs_relevance: '[{"document_key":"header_context_pairwise","slug":"synthesis","relevance":1.0},{"document_key":"success_metrics","slug":"thesis","relevance":1.0},{"document_key":"business_case_critique","slug":"antithesis","relevance":0.9},{"document_key":"comparison_vector","slug":"antithesis","relevance":0.85},{"document_key":"business_case_critique","slug":"antithesis","relevance":0.8,"type":"feedback"},{"document_key":"comparison_vector","slug":"antithesis","relevance":0.75,"type":"feedback"}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_pairwise_success_metrics","template_filename":"synthesis_pairwise_success_metrics.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<derived from thesis artifact>","source_model_slug":"<derived from thesis artifact>","match_keys":["<derived from antithesis reviewer or reviewer combination>"],"content_to_include":{"thesis_document":"success_metrics","critique_document":"business_case_critique","comparison_signal":"comparison_vector","outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"next_steps":"","metric_alignment":[],"tradeoffs":[],"validation_checks":[]}}],"files_to_generate":[{"template_filename":"synthesis_pairwise_success_metrics.json","from_document_key":"synthesis_pairwise_success_metrics"}]}',
                parallel_group: 2,
                branch_key: 'synthesis_pairwise_success_metrics',
                execution_order: 2,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 6: Document Business Case (lines 609-651)
            {
                id: 'mock-step-synthesis-document-business-case',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-document-business-case',
                step_key: 'synthesis_document_business_case',
                step_slug: 'synthesis-document-business-case',
                step_name: 'Synthesize Business Case Across Models',
                step_description: 'Synthesize the final business case from pairwise outputs.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-document-business-case',
                output_type: 'assembled_document_json',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"document","slug":"synthesis","document_key":"synthesis_pairwise_business_case","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"synthesis_pairwise_business_case","slug":"synthesis","relevance":1.0}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_document_business_case","template_filename":"synthesis_document_business_case.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"executive_summary":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"resolved_positions":[],"open_questions":[],"next_steps":"","proposal_references":[]}}],"files_to_generate":[{"template_filename":"synthesis_document_business_case.json","from_document_key":"synthesis_document_business_case"}]}',
                parallel_group: 3,
                branch_key: 'synthesis_document_business_case',
                execution_order: 3,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 7: Document Feature Spec (lines 655-700)
            {
                id: 'mock-step-synthesis-document-feature-spec',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-document-feature-spec',
                step_key: 'synthesis_document_feature_spec',
                step_slug: 'synthesis-document-feature-spec',
                step_name: 'Synthesize Feature Spec Across Models',
                step_description: 'Synthesize the final feature spec from pairwise outputs.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-document-feature-spec',
                output_type: 'assembled_document_json',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"document","slug":"synthesis","document_key":"synthesis_pairwise_feature_spec","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"synthesis_pairwise_feature_spec","slug":"synthesis","relevance":1.0}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_document_feature_spec","template_filename":"synthesis_document_feature_spec.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"feature_scope":[],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","tradeoffs":[]}],"tradeoffs":[]}}],"files_to_generate":[{"template_filename":"synthesis_document_feature_spec.json","from_document_key":"synthesis_document_feature_spec"}]}',
                parallel_group: 3,
                branch_key: 'synthesis_document_feature_spec',
                execution_order: 3,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 8: Document Technical Approach (lines 704-735)
            {
                id: 'mock-step-synthesis-document-technical-approach',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-document-technical-approach',
                step_key: 'synthesis_document_technical_approach',
                step_slug: 'synthesis-document-technical-approach',
                step_name: 'Synthesize Technical Approach Across Models',
                step_description: 'Synthesize the final technical approach from pairwise outputs.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-document-technical-approach',
                output_type: 'assembled_document_json',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"document","slug":"synthesis","document_key":"synthesis_pairwise_technical_approach","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"synthesis_pairwise_technical_approach","slug":"synthesis","relevance":1.0}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_document_technical_approach","template_filename":"synthesis_document_technical_approach.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"architecture_alignment":[],"risk_mitigations":[],"dependency_resolution":[]}}],"files_to_generate":[{"template_filename":"synthesis_document_technical_approach.json","from_document_key":"synthesis_document_technical_approach"}]}',
                parallel_group: 3,
                branch_key: 'synthesis_document_technical_approach',
                execution_order: 3,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 9: Document Success Metrics (lines 739-779)
            {
                id: 'mock-step-synthesis-document-success-metrics',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-document-success-metrics',
                step_key: 'synthesis_document_success_metrics',
                step_slug: 'synthesis-document-success-metrics',
                step_name: 'Synthesize Success Metrics Across Models',
                step_description: 'Synthesize the final success metrics from pairwise outputs.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-document-success-metrics',
                output_type: 'assembled_document_json',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"document","slug":"synthesis","document_key":"synthesis_pairwise_success_metrics","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"synthesis_pairwise_success_metrics","slug":"synthesis","relevance":1.0}]',
                outputs_required: '{"documents":[{"document_key":"synthesis_document_success_metrics","template_filename":"synthesis_document_success_metrics.json","artifact_class":"assembled_json","file_type":"json","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"metric_alignment":[],"tradeoffs":[],"validation_checks":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"next_steps":""}}],"files_to_generate":[{"template_filename":"synthesis_document_success_metrics.json","from_document_key":"synthesis_document_success_metrics"}]}',
                parallel_group: 3,
                branch_key: 'synthesis_document_success_metrics',
                execution_order: 3,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 10: Final Header Planner (lines 784-947)
            {
                id: 'mock-step-synthesis-final-header',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-final-header',
                step_key: 'generate_final_synthesis_header',
                step_slug: 'generate-final-synthesis-header',
                step_name: 'Generate Final Synthesis Header',
                step_description: 'Generate the final HeaderContext for Synthesis stage deliverables.',
                job_type: 'PLAN',
                prompt_type: 'Planner',
                prompt_template_id: 'mock-prompt-synthesis-final-header',
                output_type: 'header_context',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"seed_prompt","slug":"synthesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"seed_prompt","slug":"synthesis","relevance":0.6},{"document_key":"synthesis_document_business_case","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","slug":"synthesis","relevance":0.95},{"document_key":"synthesis_document_technical_approach","slug":"synthesis","relevance":0.95},{"document_key":"synthesis_document_success_metrics","slug":"synthesis","relevance":0.9}]',
                outputs_required: '{"system_materials":{"executive_summary":"Outline/index of all outputs in this response and how they connect to the objective","input_artifacts_summary":"Succinct summary of prior proposals, critiques, and user feedback included in this synthesis","stage_rationale":"Decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints","progress_update":"For continuation turns, summarize what is complete vs remaining; omit on first turn","signal_sources":["synthesis_document_business_case","synthesis_document_feature_spec","synthesis_document_technical_approach","synthesis_document_success_metrics"],"decision_criteria":["feasibility","complexity","security","performance","maintainability","scalability","cost","time_to_market","compliance_risk","alignment_with_constraints"],"validation_checkpoint":["requirements addressed","best practices applied","feasible & compliant","references integrated"],"quality_standards":["security-first","maintainable","scalable","performance-aware"]},"header_context_artifact":{"type":"header_context","document_key":"header_context","artifact_class":"header_context","file_type":"json"},"context_for_documents":[{"document_key":"product_requirements","content_to_include":{"executive_summary":"","mvp_description":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"feature_scope":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","tradeoffs":[]}],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"resolved_positions":[],"open_questions":[],"next_steps":"","proposal_references":[],"release_plan":[],"assumptions":[],"open_decisions":[],"implementation_risks":[],"stakeholder_communications":[]}},{"document_key":"system_architecture","content_to_include":{"architecture_summary":"","architecture":"","services":[],"components":[],"data_flows":[],"interfaces":[],"integration_points":[],"dependency_resolution":[],"conflict_flags":[],"sequencing":"","risk_mitigations":[],"risk_signals":[],"security_measures":[],"observability_strategy":[],"scalability_plan":[],"resilience_strategy":[],"compliance_controls":[],"open_questions":[],"rationale":""}},{"document_key":"tech_stack","content_to_include":{"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[],"components":[{"component_name":"","recommended_option":"","rationale":"","alternatives":[],"tradeoffs":[],"risk_signals":[],"integration_requirements":[],"operational_owners":[],"migration_plan":[]}],"open_questions":[],"next_steps":[]}}]}',
                parallel_group: null,
                branch_key: null,
                execution_order: 4,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 11: Product Requirements (lines 952-1033)
            {
                id: 'mock-step-synthesis-product-requirements',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-product-requirements',
                step_key: 'product_requirements',
                step_slug: 'render-product_requirements',
                step_name: 'Render Final PRD',
                step_description: 'Renders the final Product Requirements Document from the consolidated synthesis artifacts.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-product-requirements',
                output_type: 'product_requirements',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context","required":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"header_context","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_business_case","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","slug":"synthesis","relevance":0.9},{"document_key":"synthesis_document_technical_approach","slug":"synthesis","relevance":0.85},{"document_key":"synthesis_document_success_metrics","slug":"synthesis","relevance":0.8}]',
                outputs_required: '{"documents":[{"document_key":"product_requirements","template_filename":"synthesis_product_requirements_document.md","artifact_class":"rendered_document","file_type":"markdown","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"executive_summary":"","mvp_description":"","user_problem_validation":"","market_opportunity":"","competitive_analysis":"","differentiation_&_value_proposition":"","risks_&_mitigation":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"feature_scope":[],"features":[{"feature_name":"","feature_objective":"","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"","open_questions":"","tradeoffs":[]}],"feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[],"outcome_alignment":"","north_star_metric":"","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"","risk_signals":[],"resolved_positions":[],"open_questions":[],"next_steps":"","proposal_references":[],"release_plan":[],"assumptions":[],"open_decisions":[],"implementation_risks":[],"stakeholder_communications":[]}}],"files_to_generate":[{"template_filename":"synthesis_product_requirements_document.md","from_document_key":"product_requirements"}]}',
                parallel_group: 5,
                branch_key: 'product_requirements',
                execution_order: 5,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 12: System Architecture (lines 1037-1092)
            {
                id: 'mock-step-synthesis-system-architecture',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-system-architecture',
                step_key: 'system_architecture',
                step_slug: 'render-system-architecture-overview',
                step_name: 'Render Final System Architecture Overview',
                step_description: 'Renders the final System Architecture Overview from the consolidated synthesis artifacts.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-system-architecture',
                output_type: 'system_architecture',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context","required":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"header_context","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_technical_approach","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","slug":"synthesis","relevance":0.9},{"document_key":"synthesis_document_business_case","slug":"synthesis","relevance":0.82},{"document_key":"synthesis_document_success_metrics","slug":"synthesis","relevance":0.78}]',
                outputs_required: '{"documents":[{"document_key":"system_architecture","template_filename":"synthesis_system_architecture.md","artifact_class":"rendered_document","file_type":"markdown","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"architecture_summary":"","architecture":"","services":[],"components":[],"data_flows":[],"interfaces":[],"integration_points":[],"dependency_resolution":[],"conflict_flags":[],"sequencing":"","risk_mitigations":[],"risk_signals":[],"security_measures":[],"observability_strategy":[],"scalability_plan":[],"resilience_strategy":[],"compliance_controls":[],"open_questions":[],"rationale":""}}],"files_to_generate":[{"template_filename":"synthesis_system_architecture.md","from_document_key":"system_architecture"}]}',
                parallel_group: 5,
                branch_key: 'system_architecture',
                execution_order: 5,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
            // Step 13: Tech Stack (lines 1096-1154)
            {
                id: 'mock-step-synthesis-tech-stack',
                instance_id: 'mock-instance-synthesis',
                template_step_id: 'mock-template-step-synthesis-tech-stack',
                step_key: 'tech_stack',
                step_slug: 'render-tech-stack-recommendations',
                step_name: 'Render Final Tech Stack Recommendations',
                step_description: 'Renders the final Tech Stack Recommendations from the consolidated synthesis artifacts.',
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                prompt_template_id: 'mock-prompt-synthesis-tech-stack',
                output_type: 'tech_stack',
                granularity_strategy: 'all_to_one',
                inputs_required: '[{"type":"header_context","slug":"synthesis","document_key":"header_context","required":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_technical_approach","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_feature_spec","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_success_metrics","required":true,"multiple":true},{"type":"document","slug":"synthesis","document_key":"synthesis_document_business_case","required":true,"multiple":true}]',
                inputs_relevance: '[{"document_key":"header_context","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_technical_approach","slug":"synthesis","relevance":1.0},{"document_key":"synthesis_document_feature_spec","slug":"synthesis","relevance":0.88},{"document_key":"synthesis_document_success_metrics","slug":"synthesis","relevance":0.85},{"document_key":"synthesis_document_business_case","slug":"synthesis","relevance":0.8}]',
                outputs_required: '{"documents":[{"document_key":"tech_stack","template_filename":"synthesis_tech_stack.md","artifact_class":"rendered_document","file_type":"markdown","lineage_key":"<>","source_model_slug":"<>","content_to_include":{"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[],"components":[{"component_name":"","recommended_option":"","rationale":"","alternatives":[],"tradeoffs":[],"risk_signals":[],"integration_requirements":[],"operational_owners":[],"migration_plan":[]}],"open_questions":[],"next_steps":[]}}],"files_to_generate":[{"template_filename":"synthesis_tech_stack.md","from_document_key":"tech_stack"}]}',
                parallel_group: 5,
                branch_key: 'tech_stack',
                execution_order: 5,
                created_at: '2025-11-06T00:00:00.000Z',
                updated_at: '2025-11-06T00:00:00.000Z',
                is_skipped: false,
                config_override: {},
                object_filter: {},
                output_overrides: {},
            },
        ],
    }],
};

describe('mapToStageWithRecipeSteps for synthesis stage', () => {

    function getMockForStep(stepKey: string): DatabaseRecipeSteps {
        const step = SYNTHESIS_STAGE_MOCK.dialectic_stage_recipe_instances![0].dialectic_stage_recipe_steps!.find(
            s => s.step_key === stepKey
        );
        if (!step) {
            throw new Error(`Step '${stepKey}' not found in SYNTHESIS_STAGE_MOCK. Available keys: ${
                SYNTHESIS_STAGE_MOCK.dialectic_stage_recipe_instances![0].dialectic_stage_recipe_steps!.map(s => s.step_key).join(', ')
            }`);
        }
        
        return {
            ...SYNTHESIS_STAGE_MOCK,
            dialectic_stage_recipe_instances: [{
                ...SYNTHESIS_STAGE_MOCK.dialectic_stage_recipe_instances![0],
                dialectic_stage_recipe_steps: [step]
            }]
        };
    }

    it('should correctly map the "synthesis_prepare_pairwise_header" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_prepare_pairwise_header');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_prepare_pairwise_header');
    });

    it('should correctly map the "synthesis_pairwise_business_case" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_pairwise_business_case');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_pairwise_business_case');
    });

    it('should correctly map the "synthesis_pairwise_feature_spec" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_pairwise_feature_spec');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_pairwise_feature_spec');
    });

    it('should correctly map the "synthesis_pairwise_technical_approach" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_pairwise_technical_approach');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_pairwise_technical_approach');
    });

    it('should correctly map the "synthesis_pairwise_success_metrics" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_pairwise_success_metrics');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_pairwise_success_metrics');
    });

    it('should correctly map the "synthesis_document_business_case" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_document_business_case');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_document_business_case');
    });

    it('should correctly map the "synthesis_document_feature_spec" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_document_feature_spec');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_document_feature_spec');
    });

    it('should correctly map the "synthesis_document_technical_approach" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_document_technical_approach');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_document_technical_approach');
    });

    it('should correctly map the "synthesis_document_success_metrics" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('synthesis_document_success_metrics');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'synthesis_document_success_metrics');
    });

    it('should correctly map the "generate_final_synthesis_header" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('generate_final_synthesis_header');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'generate_final_synthesis_header');
    });

    it('should correctly map the "product_requirements" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('product_requirements');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'product_requirements');
    });

    it('should correctly map the "system_architecture" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('system_architecture');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'system_architecture');
    });

    it('should correctly map the "tech_stack" step from synthesis_stage.sql', () => {
        const mockDbResponse = getMockForStep('tech_stack');
        const actual = mapToStageWithRecipeSteps(mockDbResponse);
        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
        assert(actual.dialectic_stage_recipe_steps[0].step_key === 'tech_stack');
    });

    it('should correctly map a synthesis recipe step without failing type guard validation', () => {
        // This test uses the ACTUAL data from the synthesis_stage.sql migration (lines 205-355)
        // to ensure the mapper works correctly with real production data
        const mockDbResponse = getMockForStep('synthesis_prepare_pairwise_header');

        // Assert that the function does NOT throw an error (desired GREEN state)
        // This will fail initially because the current logic throws a type guard validation error
        const result = mapToStageWithRecipeSteps(mockDbResponse);

        // Assert the output_type is correctly preserved as the FileType enum value
        assert(result.dialectic_stage_recipe_steps[0].output_type === 'header_context',
            `Expected output_type to be 'header_context' but got '${result.dialectic_stage_recipe_steps[0].output_type}'`);

        // Assert the step passes type guard validation
        assert(isDialecticStageRecipeStep(result.dialectic_stage_recipe_steps[0]),
            'Step should pass type guard validation');
    });
});
