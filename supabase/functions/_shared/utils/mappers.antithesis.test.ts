import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapToStageWithRecipeSteps } from './mappers.ts';
import type { DatabaseRecipeSteps } from '../../dialectic-service/dialectic.interface.ts';
import { isDialecticStageRecipeStep } from './type-guards/type_guards.dialectic.ts';

describe('mapToStageWithRecipeSteps', () => {
  it('should correctly map the "antithesis_prepare_proposal_review_plan" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-planner',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-planner',
                    step_key: 'antithesis_prepare_proposal_review_plan',
                    step_slug: 'prepare-proposal-review-plan',
                    step_name: 'Prepare Proposal Review Plan',
                    job_type: 'PLAN',
                    prompt_type: 'Planner',
                    prompt_template_id: 'prompt-antithesis-planner',
                    output_type: 'header_context',
                    granularity_strategy: 'per_source_document_by_lineage',
                    inputs_required: '[{"type":"seed_prompt","slug":"thesis","document_key":"seed_prompt","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]',
                    inputs_relevance: '[{"document_key":"seed_prompt","relevance":1.0},{"document_key":"business_case","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]',
                    outputs_required: `{
                        "system_materials": {
                            "agent_internal_summary": "concise overview of key findings across all proposals",
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
                                    "strengths": [],
                                    "weaknesses": [],
                                    "opportunities": [],
                                    "threats": [],
                                    "recommendations": [],
                                    "notes": []
                                }
                            },
                            {
                                "document_key": "technical_feasibility_assessment",
                                "content_to_include": {
                                    "constraint_checklist": [
                                        "team",
                                        "timeline",
                                        "cost",
                                        "integration",
                                        "compliance"
                                    ],
                                    "findings": []
                                }
                            },
                            {
                                "document_key": "risk_register",
                                "content_to_include": {
                                    "required_fields": [
                                        "risk",
                                        "impact",
                                        "likelihood",
                                        "mitigation"
                                    ],
                                    "seed_examples": []
                                }
                            },
                            {
                                "document_key": "non_functional_requirements",
                                "content_to_include": {
                                    "categories": [
                                        "security",
                                        "performance",
                                        "reliability",
                                        "scalability",
                                        "maintainability",
                                        "compliance"
                                    ]
                                }
                            },
                            {
                                "document_key": "dependency_map",
                                "content_to_include": {
                                    "components": [],
                                    "integration_points": [],
                                    "conflict_flags": []
                                }
                            },
                            {
                                "document_key": "comparison_vector",
                                "content_to_include": {
                                    "dimensions": {
                                        "feasibility": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "complexity": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "security": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "performance": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "maintainability": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "scalability": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "cost": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "time_to_market": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "compliance_risk": {
                                            "score": 0,
                                            "rationale": ""
                                        },
                                        "alignment_with_constraints": {
                                            "score": 0,
                                            "rationale": ""
                                        }
                                    }
                                }
                            }
                        ]
                    }`,
                    parallel_group: null,
                    branch_key: null,
                    execution_order: 1,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Generate HeaderContext JSON that orchestrates per-proposal Antithesis review documents.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_business_case_critique" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-business-case-critique',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-business-case-critique',
                    step_key: 'antithesis_generate_business_case_critique',
                    step_slug: 'generate-business-case-critique',
                    step_name: 'Generate Per-Proposal Critique',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-business-case-critique',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.85},{"document_key":"technical_approach","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"business_case","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.6}]',
                    outputs_required: '{"documents":[{"document_key":"business_case_critique","template_filename":"antithesis_business_case_critique.md","artifact_class":"rendered_document","file_type":"markdown","content_to_include":{"executive_summary":"","fit_to_original_user_request":"","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"problems":[],"obstacles":[],"errors":[],"omissions":[],"discrepancies":[],"areas_for_improvement":[],"feasibility":"","recommendations":[],"notes":[]}}],"files_to_generate":[{"template_filename":"antithesis_business_case_critique.md","from_document_key":"business_case_critique"}]}',
                    parallel_group: 2,
                    branch_key: 'business_case_critique',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the critique document using the shared HeaderContext and Thesis artifacts.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_technical_feasibility_assessment" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-feasibility',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-feasibility',
                    step_key: 'antithesis_generate_technical_feasibility_assessment',
                    step_slug: 'generate-technical-feasibility-assessment',
                    step_name: 'Generate Technical Feasibility Assessment',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-feasibility',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"feature_spec","relevance":0.9},{"document_key":"technical_approach","relevance":0.85},{"document_key":"business_case","relevance":0.7},{"document_key":"success_metrics","relevance":0.6},{"document_key":"business_case","type":"feedback","relevance":0.45},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"technical_approach","type":"feedback","relevance":0.45},{"document_key":"success_metrics","type":"feedback","relevance":0.45}]',
                    outputs_required: '{"documents":[{"document_key":"technical_feasibility_assessment","template_filename":"antithesis_feasibility_assessment.md","artifact_class":"rendered_document","lineage_key":"<from the filename of the file being critiqued>","source_model_slug":"<from the filename of the file being critiqued>","file_type":"markdown","content_to_include":{"constraint_checklist":["team","timeline","cost","integration","compliance"],"findings":[]}}],"files_to_generate":[{"template_filename":"antithesis_feasibility_assessment.md","from_document_key":"technical_feasibility_assessment"}]}',
                    parallel_group: 2,
                    branch_key: 'technical_feasibility_assessment',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Document feasibility findings across constraints for the proposal.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_risk_register" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-risk-register',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-risk-register',
                    step_key: 'antithesis_generate_risk_register',
                    step_slug: 'generate-risk-register',
                    step_name: 'Generate Risk Register',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-risk-register',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"success_metrics","relevance":0.9},{"document_key":"technical_approach","relevance":0.8},{"document_key":"feature_spec","relevance":0.75},{"document_key":"business_case","relevance":0.65},{"document_key":"success_metrics","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"feature_spec","type":"feedback","relevance":0.55},{"document_key":"business_case","type":"feedback","relevance":0.5}]',
                    outputs_required: '{"documents":[{"document_key":"risk_register","template_filename":"antithesis_risk_register.md","artifact_class":"rendered_document","lineage_key":"<from the filename of the file being critiqued>","source_model_slug":"<from the filename of the file being critiqued>","file_type":"markdown","content_to_include":[{"risk":"","impact":"","likelihood":"","mitigation":""}]}],"files_to_generate":[{"template_filename":"antithesis_risk_register.md","from_document_key":"risk_register"}]}',
                    parallel_group: 2,
                    branch_key: 'risk_register',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Catalog risks, impacts, likelihood, and mitigations for the proposal.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_non_functional_requirements" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-nfr',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-nfr',
                    step_key: 'antithesis_generate_non_functional_requirements',
                    step_slug: 'generate-non-functional-requirements',
                    step_name: 'Generate Non-Functional Requirements Review',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-nfr',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.8},{"document_key":"feature_spec","relevance":0.7},{"document_key":"business_case","relevance":0.6},{"document_key":"technical_approach","type":"feedback","relevance":0.6},{"document_key":"success_metrics","type":"feedback","relevance":0.55},{"document_key":"feature_spec","type":"feedback","relevance":0.5},{"document_key":"business_case","type":"feedback","relevance":0.45}]',
                    outputs_required: '{"documents":[{"document_key":"non_functional_requirements","template_filename":"antithesis_non_functional_requirements.md","artifact_class":"rendered_document","lineage_key":"<from the filename of the file being critiqued>","source_model_slug":"<from the filename of the file being critiqued>","file_type":"markdown","content_to_include":["security","performance","reliability","scalability","maintainability","compliance"]}],"files_to_generate":[{"template_filename":"antithesis_non_functional_requirements.md","from_document_key":"non_functional_requirements"}]}',
                    parallel_group: 2,
                    branch_key: 'non_functional_requirements',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Evaluate the proposal against the defined non-functional requirements.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_dependency_map" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-dependency-map',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-dependency-map',
                    step_key: 'antithesis_generate_dependency_map',
                    step_slug: 'generate-dependency-map',
                    step_name: 'Generate Dependency Map',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-dependency-map',
                    output_type: 'rendered_document',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"technical_approach","relevance":0.9},{"document_key":"feature_spec","relevance":0.85},{"document_key":"business_case","relevance":0.75},{"document_key":"success_metrics","relevance":0.65},{"document_key":"technical_approach","type":"feedback","relevance":0.5},{"document_key":"feature_spec","type":"feedback","relevance":0.45},{"document_key":"business_case","type":"feedback","relevance":0.4},{"document_key":"success_metrics","type":"feedback","relevance":0.35}]',
                    outputs_required: '{"documents":[{"document_key":"dependency_map","template_filename":"antithesis_dependency_map.md","artifact_class":"rendered_document","lineage_key":"<from the filename of the file being critiqued>","source_model_slug":"<from the filename of the file being critiqued>","file_type":"markdown","content_to_include":{"components":[],"integration_points":[],"conflict_flags":[]}}],"files_to_generate":[{"template_filename":"antithesis_dependency_map.md","from_document_key":"dependency_map"}]}',
                    parallel_group: 2,
                    branch_key: 'dependency_map',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Document components, integrations, and conflicts for the proposal.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });

    it('should correctly map the "antithesis_generate_comparison_vector" step from antithesis_stage.sql', () => {
        const mockDbResponse: DatabaseRecipeSteps = {
            active_recipe_instance_id: 'instance-1',
            created_at: '2025-11-05T11:58:00.000Z',
            default_system_prompt_id: 'default-prompt',
            description: 'A stage.',
            display_name: 'Antithesis',
            expected_output_template_ids: [],
            id: 'stage-antithesis',
            recipe_template_id: 'template-antithesis',
            slug: 'antithesis',
            dialectic_stage_recipe_instances: [{
                cloned_at: null,
                created_at: '2025-11-05T11:59:00.000Z',
                id: 'instance-1',
                is_cloned: false,
                stage_id: 'stage-antithesis',
                template_id: 'template-antithesis',
                updated_at: '2025-11-05T11:59:00.000Z',
                dialectic_stage_recipe_steps: [{
                    id: 'step-antithesis-comparison-vector',
                    instance_id: 'instance-1',
                    template_step_id: 'template-step-antithesis-comparison-vector',
                    step_key: 'antithesis_generate_comparison_vector',
                    step_slug: 'generate-comparison-vector',
                    step_name: 'Generate Comparison Vector',
                    job_type: 'EXECUTE',
                    prompt_type: 'Turn',
                    prompt_template_id: 'prompt-antithesis-comparison-vector',
                    output_type: 'assembled_document_json',
                    granularity_strategy: 'per_source_document',
                    inputs_required: '[{"type":"header_context","slug":"antithesis","document_key":"header_context","required":true},{"type":"document","slug":"thesis","document_key":"business_case","required":true},{"type":"document","slug":"thesis","document_key":"feature_spec","required":true},{"type":"document","slug":"thesis","document_key":"technical_approach","required":true},{"type":"document","slug":"thesis","document_key":"success_metrics","required":true},{"type":"feedback","slug":"thesis","document_key":"business_case","required":false},{"type":"feedback","slug":"thesis","document_key":"feature_spec","required":false},{"type":"feedback","slug":"thesis","document_key":"technical_approach","required":false},{"type":"feedback","slug":"thesis","document_key":"success_metrics","required":false}]',
                    inputs_relevance: '[{"document_key":"header_context","relevance":1.0},{"document_key":"business_case","relevance":0.95},{"document_key":"feature_spec","relevance":0.95},{"document_key":"technical_approach","relevance":0.9},{"document_key":"success_metrics","relevance":0.85},{"document_key":"business_case","type":"feedback","relevance":0.75},{"document_key":"feature_spec","type":"feedback","relevance":0.7},{"document_key":"technical_approach","type":"feedback","relevance":0.7},{"document_key":"success_metrics","type":"feedback","relevance":0.65}]',
                    outputs_required: '{"documents":[{"document_key":"comparison_vector","template_filename":"antithesis_comparison_vector.json","artifact_class":"assembled_document_json","lineage_key":"<from the filename of the file being critiqued>","source_model_slug":"<from the filename of the file being critiqued>","file_type":"json","content_to_include":{"proposal":{"lineage_key":"","source_model_slug":""},"dimensions":{"feasibility":{"score":0,"rationale":""},"complexity":{"score":0,"rationale":""},"security":{"score":0,"rationale":""},"performance":{"score":0,"rationale":""},"maintainability":{"score":0,"rationale":""},"scalability":{"score":0,"rationale":""},"cost":{"score":0,"rationale":""},"time_to_market":{"score":0,"rationale":""},"compliance_risk":{"score":0,"rationale":""},"alignment_with_constraints":{"score":0,"rationale":""}}}}],"files_to_generate":[{"template_filename":"antithesis_comparison_vector.json","from_document_key":"comparison_vector"}]}',
                    parallel_group: 2,
                    branch_key: 'comparison_vector',
                    execution_order: 2,
                    created_at: '2025-11-06T00:00:00.000Z',
                    updated_at: '2025-11-06T00:00:00.000Z',
                    is_skipped: false,
                    config_override: {},
                    object_filter: {},
                    output_overrides: {},
                    step_description: 'Produce the normalized comparison vector for the proposal across required dimensions.',
                }, ],
            }, ],
        };

        const actual = mapToStageWithRecipeSteps(mockDbResponse);

        assert(isDialecticStageRecipeStep(actual.dialectic_stage_recipe_steps[0]));
    });
});
