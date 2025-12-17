// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts
import { assertEquals, assertExists, assert, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticExecuteJobPayload,
    DialecticStageRecipeStep,
    DialecticRecipeTemplateStep,
    SourceDocument,
    ContextForDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planAllToOne } from './planAllToOne.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { extractSourceDocumentIdentifier } from '../../../_shared/utils/source_document_identifier.ts';
import { isJson } from '../../../_shared/utils/type-guards/type_guards.common.ts';
import { isDialecticExecuteJobPayload } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'doc-1', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
    { id: 'doc-2', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
    { id: 'doc-3', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
].map(d => ({ ...d, document_relationships: null, attempt_count: 0, contribution_type: 'reduced_synthesis', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p', target_contribution_id: 't', is_header: false, source_prompt_resource_id: null }));

const MOCK_PAYLOAD: DialecticPlanJobPayload = {
    projectId: 'project-xyz',
    sessionId: 'session-abc',
    stageSlug: 'synthesis',
    iterationNumber: 1,
    model_id: 'model-ghi',
    walletId: 'wallet-default',
    user_jwt: 'user-jwt-123',
};

if(!isJson(MOCK_PAYLOAD)) {
    throw new Error('Mock payload is not a valid JSON');
}   

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'synthesis',
    iteration_number: 1,
    payload: MOCK_PAYLOAD,
    attempt_count: 0, 
    completed_at: null, 
    created_at: '', 
    error_details: null, 
    max_retries: 3, 
    parent_job_id: null, 
    prerequisite_job_id: null, 
    results: null, 
    started_at: null, 
    status: 'pending', 
    target_contribution_id: null, 
    is_test_job: false, 
    job_type: 'PLAN'
};

const MOCK_RECIPE_STEP: DialecticStageRecipeStep = {
    id: 'step-id-123',
    instance_id: 'instance-id-456',
    template_step_id: 'template-step-id-789',
    step_key: 'thesis_generate_business_case',
    step_slug: 'generate-business-case',
    step_name: 'Generate Business Case',
    prompt_template_id: 'thesis_business_case_turn_v1_template_id',
    prompt_type: 'Turn',
    job_type: 'EXECUTE',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.business_case,
            template_filename: 'thesis_business_case.md',
        }],
        assembled_json: [],
        files_to_generate: [{
            template_filename: 'thesis_business_case.md',
            from_document_key: FileType.business_case,
        }],
    },
    granularity_strategy: 'per_source_document',
    output_type: FileType.business_case,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config_override: {},
    is_skipped: false,
    object_filter: {},
    output_overrides: {},
    branch_key: null,
    execution_order: 3,
    parallel_group: null,
    step_description: 'Generate Final Synthesis',
};

Deno.test('planAllToOne should create exactly one child job', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);
    assertEquals(childJobs.length, 1, "Should create exactly one child job");
});

Deno.test('planAllToOne returns a payload with prompt_template_id and correct output_type, and omits prompt_template_name', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);
    const job1 = childJobs[0] as DialecticExecuteJobPayload & { prompt_template_name?: string }; // Cast for testing absence

    assertExists(job1);
    if (isDialecticExecuteJobPayload(job1)) {
        assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE');
    } else {
        throw new Error('Expected EXECUTE job');
    }
    assertEquals(job1.output_type, FileType.business_case, 'Output type should be correctly assigned from the recipe step');
    
    // Assert that the new id property is used and the old name property is absent
    assertEquals(job1.prompt_template_id, 'thesis_business_case_turn_v1_template_id', 'The prompt_template_id from the recipe should be used.');
    assert(!('prompt_template_name' in job1), 'The deprecated prompt_template_name property should not be present in the payload.');

    const docIds = job1.inputs?.document_ids;
    assertEquals(docIds?.length, 3);
    assert(docIds?.includes('doc-1'));
    assert(docIds?.includes('doc-2'));
    assert(docIds?.includes('doc-3'));
});

Deno.test('should create one child job when given a single source document', () => {
    const singleDoc = [MOCK_SOURCE_DOCS[0]];
    const childJobs = planAllToOne(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

    assertEquals(childJobs.length, 1, "Should still create one child job");
    const job = childJobs[0];
    assertExists(job);
    if (isDialecticExecuteJobPayload(job)) {
        const docIds = job.inputs.document_ids;
        assertEquals(docIds?.length, 1, "Inputs should contain one document ID");
        assertEquals(docIds?.[0], 'doc-1');
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne should return an empty array if there are no source documents', () => {
    const childJobs = planAllToOne([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 0, "Should create no jobs for empty input");
});

Deno.test('planAllToOne constructs child payload with dynamic stage consistency (payload.stageSlug === parent.payload.stageSlug)', () => {
    const expectedStage = 'parenthesis';
    const parent: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
    Object.defineProperty(parent, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
    Object.defineProperty(parent.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, parent, MOCK_RECIPE_STEP, 'ignored.jwt');

    assertEquals(childJobs.length, 1);
    const child = childJobs[0];
    assertExists(child);
    assertEquals(child.stageSlug, expectedStage);
});

Deno.test('planAllToOne surfaces sourceContributionId for aggregated source documents', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 1);

    const payload = childJobs[0];
    assertExists(payload);
    assertEquals(
        payload.sourceContributionId,
        MOCK_SOURCE_DOCS[0].id,
        'Aggregated planner payload must expose the originating contribution id',
    );
});

Deno.test('planAllToOne accepts DialecticRecipeTemplateStep (not just DialecticStageRecipeStep)', () => {
    const MOCK_TEMPLATE_RECIPE_STEP: DialecticRecipeTemplateStep = {
        id: 'template-step-id-123',
        template_id: 'template-id-456',
        step_number: 1,
        step_key: 'thesis_build_stage_header',
        step_slug: 'build-stage-header',
        step_name: 'Build Stage Header',
        step_description: 'Generate HeaderContext JSON that orchestrates downstream Thesis documents.',
        prompt_template_id: 'template-planner-prompt-id',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'all_to_one',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.SeedPrompt,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [{
                document_key: FileType.business_case,
                content_to_include: {
                    market_opportunity: '',
                    user_problem_validation: '',
                    competitive_analysis: '',
                    'differentiation_&_value_proposition': '',
                    'risks_&_mitigation': '',
                    strengths: '',
                    weaknesses: '',
                    opportunities: '',
                    threats: '',
                    next_steps: '',
                    proposal_references: [],
                    executive_summary: '',
                },
            }],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_TEMPLATE_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job for template step');
    const job1 = childJobs[0];
    assertExists(job1);
    assertEquals(isDialecticExecuteJobPayload(job1), true, 'PLAN recipe steps should create EXECUTE child jobs, not PLAN child jobs');
    if (isDialecticExecuteJobPayload(job1)) {
        const executePayload: DialecticExecuteJobPayload = job1;
        assertEquals(executePayload.output_type, FileType.HeaderContext, 'EXECUTE job should have HeaderContext output_type');
        assertEquals(executePayload.prompt_template_id, 'template-planner-prompt-id', 'EXECUTE job should inherit prompt_template_id from recipe step');
        assertEquals(executePayload.document_key, FileType.HeaderContext, 'EXECUTE job should have document_key from outputs_required.header_context_artifact.document_key');
        assertExists(executePayload.context_for_documents, 'EXECUTE job should include context_for_documents from recipe step');
        assertEquals(executePayload.context_for_documents!.length, 1, 'context_for_documents should have one entry');
        assertEquals(executePayload.context_for_documents![0].document_key, FileType.business_case, 'document_key should match');
        assertExists(executePayload.planner_metadata, 'EXECUTE job should include planner_metadata');
        assertEquals(executePayload.planner_metadata!.recipe_step_id, 'template-step-id-123', 'planner_metadata.recipe_step_id should match recipe step id');
        assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        assertExists(executePayload.inputs, 'EXECUTE job should include inputs');
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne includes planner_metadata with recipe_step_id in child payloads', () => {
    const mockRecipeStepWithId: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        id: 'recipe-step-123',
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, mockRecipeStepWithId, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        assertExists(job.planner_metadata, 'Child job should include planner_metadata');
        assertEquals(
            job.planner_metadata?.recipe_step_id,
            'recipe-step-123',
            'planner_metadata.recipe_step_id should match the recipe step id',
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne inherits all fields from parent job payload including model_slug and user_jwt', () => {
    const parentWithAllFields: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
    Object.defineProperty(parentWithAllFields.payload, 'model_slug', { 
        value: 'parent-model-slug', 
        configurable: true, 
        enumerable: true, 
        writable: true 
    });
    Object.defineProperty(parentWithAllFields.payload, 'user_jwt', { 
        value: 'parent-jwt-token', 
        configurable: true, 
        enumerable: true, 
        writable: true 
    });

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, parentWithAllFields, MOCK_RECIPE_STEP, 'ignored-param-jwt');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(
        job.model_slug,
        'parent-model-slug',
        'Child payload must inherit model_slug from parent payload',
    );
    assertEquals(
        job.user_jwt,
        'parent-jwt-token',
        'Child payload must inherit user_jwt from parent payload',
    );
});

Deno.test('planAllToOne sets document_key in payload when recipeStep.outputs_required.documents[0].document_key is present', () => {
    const recipeStepWithDocumentKey: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
        },
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithDocumentKey, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        assertEquals(
            job.document_key,
            FileType.business_case,
            'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne throws error for EXECUTE job when outputs_required.documents array is empty', async () => {
    const recipeStepWithEmptyDocuments: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'thesis_business_case.md',
                from_document_key: FileType.business_case,
            }],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocuments, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs',
        'Should throw error when documents array is empty for EXECUTE job',
    );
});

Deno.test('planAllToOne throws error for EXECUTE job when documents property is missing', async () => {
    const recipeStepWithoutDocumentsProperty: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: FileType.HeaderContext,
                artifact_class: 'header_context',
                file_type: 'json',
            },
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'thesis_business_case.md',
                from_document_key: FileType.business_case,
            }],
        } as unknown as DialecticStageRecipeStep['outputs_required'],
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentsProperty, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing',
        'Should throw error when documents property is missing for EXECUTE job',
    );
});

Deno.test('planAllToOne throws error when outputs_required.documents[0] is missing document_key property', async () => {
    const recipeStepWithoutDocumentKey = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'thesis_business_case.md',
                from_document_key: FileType.business_case,
            }],
        },
    } as unknown as DialecticStageRecipeStep;

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.documents[0].document_key but it is missing',
        'Should throw error when documents[0] is missing document_key property',
    );
});

Deno.test('planAllToOne throws error when outputs_required.documents[0].document_key is null', async () => {
    const recipeStepWithNullDocumentKey: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: null as unknown as FileType,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'thesis_business_case.md',
                from_document_key: FileType.business_case,
            }],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithNullDocumentKey, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string',
        'Should throw error when document_key is null',
    );
});

Deno.test('planAllToOne throws error when outputs_required.documents[0].document_key is empty string', async () => {
    const recipeStepWithEmptyDocumentKey: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: '' as unknown as FileType,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'thesis_business_case.md',
                from_document_key: FileType.business_case,
            }],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocumentKey, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string',
        'Should throw error when document_key is empty string',
    );
});

Deno.test('planAllToOne throws error for EXECUTE job when outputs_required is missing', async () => {
    const recipeStepWithoutOutputsRequired: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: undefined as unknown as DialecticStageRecipeStep['outputs_required'],
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutOutputsRequired, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing',
        'Should throw error when EXECUTE job has undefined outputs_required',
    );
});

Deno.test('planAllToOne creates EXECUTE child job for PLAN recipe steps with valid context_for_documents', () => {
    const planRecipeStep: DialecticRecipeTemplateStep = {
        id: 'plan-step-id-456',
        template_id: 'template-id-123',
        step_number: 1,
        step_key: 'thesis_build_stage_header',
        step_slug: 'build-stage-header',
        step_name: 'Build Stage Header',
        step_description: 'Generate HeaderContext JSON',
        prompt_template_id: 'template-planner-prompt-id-789',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'all_to_one',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        field1: '',
                        field2: [],
                    },
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        assertEquals(executePayload.output_type, FileType.HeaderContext, 'EXECUTE job should have HeaderContext output_type');
        assertEquals(executePayload.prompt_template_id, 'template-planner-prompt-id-789', 'EXECUTE job should inherit prompt_template_id from recipe step');
        assertEquals(executePayload.document_key, FileType.HeaderContext, 'EXECUTE job should have document_key from outputs_required.header_context_artifact.document_key');
        assertExists(executePayload.context_for_documents, 'EXECUTE job should include context_for_documents from recipe step');
        assertEquals(executePayload.context_for_documents!.length, 1, 'context_for_documents should have one entry');
        assertEquals(executePayload.context_for_documents![0].document_key, FileType.business_case, 'document_key should match');
        assertExists(executePayload.planner_metadata, 'EXECUTE job should include planner_metadata');
        assertEquals(executePayload.planner_metadata!.recipe_step_id, 'plan-step-id-456', 'planner_metadata.recipe_step_id should match recipe step id');
        assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        assertExists(executePayload.inputs, 'EXECUTE job should include inputs');
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne throws error for PLAN job when context_for_documents is missing', async () => {
    const planRecipeStepWithoutContext: DialecticRecipeTemplateStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContext, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when context_for_documents is missing for PLAN job',
    );
});

Deno.test('planAllToOne throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
    const planRecipeStepWithoutDocumentKey: DialecticRecipeTemplateStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        outputs_required: {
            context_for_documents: [
                {
                    content_to_include: {
                        field1: '',
                    },
                } as unknown as ContextForDocument,
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when context_for_documents entry is missing document_key',
    );
});

Deno.test('planAllToOne throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
    const planRecipeStepWithoutContentToInclude: DialecticRecipeTemplateStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        outputs_required: {
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                } as unknown as ContextForDocument,
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContentToInclude, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when context_for_documents entry is missing content_to_include',
    );
});

Deno.test('planAllToOne successfully creates payload for EXECUTE job with valid files_to_generate', () => {
    const executeRecipeStep: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                    template_filename: 'thesis_business_case.md',
                },
            ],
        },
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        assertEquals(executeRecipeStep.job_type, 'EXECUTE', 'Job type should be execute');
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne throws error for EXECUTE job when files_to_generate is missing', async () => {
    const executeRecipeStepWithoutFiles: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFiles, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when files_to_generate is missing for EXECUTE job',
    );
});

Deno.test('planAllToOne throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
    const executeRecipeStepWithoutFromDocumentKey: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    template_filename: 'thesis_business_case.md',
                } as unknown as { from_document_key: FileType; template_filename: string },
            ],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFromDocumentKey, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when files_to_generate entry is missing from_document_key',
    );
});

Deno.test('planAllToOne throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
    const executeRecipeStepWithoutTemplateFilename: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                } as unknown as { from_document_key: FileType; template_filename: string },
            ],
        },
    };

    await assertRejects(
        async () => {
            planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutTemplateFilename, 'user-jwt-123');
        },
        Error,
        'planAllToOne requires',
        'Should throw error when files_to_generate entry is missing template_filename',
    );
});

Deno.test('planAllToOne sets document_relationships.source_group in EXECUTE job payload for PLAN recipe steps', () => {
    const planRecipeStep: DialecticRecipeTemplateStep = {
        id: 'plan-step-id-source-group-test',
        template_id: 'template-id-123',
        step_number: 1,
        step_key: 'thesis_build_stage_header',
        step_slug: 'build-stage-header',
        step_name: 'Build Stage Header',
        step_description: 'Generate HeaderContext JSON',
        prompt_template_id: 'template-planner-prompt-id',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'all_to_one',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        field1: '',
                        field2: [],
                    },
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const anchorDocument = MOCK_SOURCE_DOCS[0];
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'PLAN recipe steps should create EXECUTE child jobs');
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');
        assertExists(executePayload.document_relationships?.source_group, 'document_relationships should include source_group');
        assertEquals(
            executePayload.document_relationships.source_group,
            anchorDocument.id,
            'source_group should be set to anchorDocument.id (first source document)',
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planAllToOne sets document_relationships.source_group in EXECUTE job payload for EXECUTE recipe steps', () => {
    const executeRecipeStep: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                    template_filename: 'thesis_business_case.md',
                },
            ],
        },
    };

    const anchorDocument = MOCK_SOURCE_DOCS[0];
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'Job type should be execute');
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');
        assertExists(executePayload.document_relationships?.source_group, 'document_relationships should include source_group');
        assertEquals(
            executePayload.document_relationships.source_group,
            anchorDocument.id,
            'source_group should be set to anchorDocument.id (first source document)',
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('extractSourceDocumentIdentifier can extract source_group from job payload created by planAllToOne', () => {
    const executeRecipeStep: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'thesis_business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.business_case,
                    template_filename: 'thesis_business_case.md',
                },
            ],
        },
    };

    const anchorDocument = MOCK_SOURCE_DOCS[0];
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        const extractedIdentifier = extractSourceDocumentIdentifier(executePayload);
        assertExists(extractedIdentifier, 'extractSourceDocumentIdentifier should return a non-null identifier');
        assertEquals(
            extractedIdentifier,
            anchorDocument.id,
            'extractSourceDocumentIdentifier should return the source_group value from the job payload',
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});


























