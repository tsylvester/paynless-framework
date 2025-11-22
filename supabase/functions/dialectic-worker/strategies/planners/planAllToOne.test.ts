// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts
import { assertEquals, assertExists, assert, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticExecuteJobPayload,
    DialecticStageRecipeStep,
    DialecticRecipeTemplateStep,
    SourceDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planAllToOne } from './planAllToOne.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'doc-1', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
    { id: 'doc-2', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
    { id: 'doc-3', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null, is_header: false, source_prompt_resource_id: null },
].map(d => ({ ...d, document_relationships: null, attempt_count: 0, contribution_type: 'reduced_synthesis', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p', target_contribution_id: 't', is_header: false, source_prompt_resource_id: null }));

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'synthesis',
    iteration_number: 1,
    payload: {
        job_type: 'PLAN',
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
        walletId: 'wallet-default',
        user_jwt: 'user-jwt-123',
    },
    attempt_count: 0, completed_at: null, created_at: '', error_details: null, max_retries: 3, parent_job_id: null, prerequisite_job_id: null, results: null, started_at: null, status: 'pending', target_contribution_id: null, is_test_job: false, job_type: 'PLAN'
};

const MOCK_RECIPE_STEP: DialecticStageRecipeStep = {
    id: 'step-id-123',
    instance_id: 'instance-id-456',
    template_step_id: 'template-step-id-789',
    step_key: 'synthesis',
    step_slug: 'final-synthesis',
    step_name: 'Generate Final Synthesis',
    prompt_template_id: 'synthesis_step3_final_template_id',
    prompt_type: 'Turn',
    job_type: 'EXECUTE',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.Synthesis,
            template_filename: 'synthesis.md',
        }],
        assembled_json: [],
        files_to_generate: [],
    },
    granularity_strategy: 'all_to_one',
    output_type: FileType.Synthesis,
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
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 1, "Should create exactly one child job");
});

Deno.test('planAllToOne returns a payload with prompt_template_id and correct output_type, and omits prompt_template_name', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    const job1 = childJobs[0] as DialecticExecuteJobPayload & { prompt_template_name?: string }; // Cast for testing absence

    assertExists(job1);
    assertEquals(job1.job_type, 'execute');
    assertEquals(job1.output_type, FileType.Synthesis, 'Output type should be correctly assigned from the recipe step');
    
    // Assert that the new id property is used and the old name property is absent
    assertEquals(job1.prompt_template_id, 'synthesis_step3_final_template_id', 'The prompt_template_id from the recipe should be used.');
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
    const docIds = childJobs[0].inputs.document_ids;
    assertEquals(docIds?.length, 1, "Inputs should contain one document ID");
    assertEquals(docIds?.[0], 'doc-1');
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
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'json',
                document_key: FileType.HeaderContext,
                template_filename: 'header_context.json',
            }],
            assembled_json: [],
            files_to_generate: [],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_TEMPLATE_RECIPE_STEP, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job for template step');
    const job1 = childJobs[0];
    assertExists(job1);
    assertEquals(job1.job_type, 'execute');
    assertEquals(job1.output_type, FileType.HeaderContext, 'Output type should be correctly assigned from the template recipe step');
    assertEquals(job1.prompt_template_id, 'template-planner-prompt-id', 'The prompt_template_id from the template recipe step should be used.');
    assertExists(job1.inputs?.document_ids, 'Inputs should contain document_ids');
    assertEquals(job1.inputs?.document_ids?.length, 3, 'Should include all source document IDs');
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
    assertExists(job.planner_metadata, 'Child job should include planner_metadata');
    assertEquals(
        job.planner_metadata?.recipe_step_id,
        'recipe-step-123',
        'planner_metadata.recipe_step_id should match the recipe step id',
    );
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
                template_filename: 'business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [],
        },
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithDocumentKey, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(
        job.document_key,
        FileType.business_case,
        'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
    );
});

Deno.test('planAllToOne does NOT set document_key when outputs_required.documents array is empty', () => {
    const recipeStepWithEmptyDocuments: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocuments, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assert(
        !('document_key' in job) || job.document_key === undefined || job.document_key === null,
        'document_key should NOT be set when documents array is empty (step does not output documents)',
    );
});

Deno.test('planAllToOne does NOT set document_key when outputs_required is missing documents property', () => {
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
            files_to_generate: [],
        } as unknown as DialecticStageRecipeStep['outputs_required'],
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentsProperty, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assert(
        !('document_key' in job) || job.document_key === undefined || job.document_key === null,
        'document_key should NOT be set when outputs_required is missing documents property (step does not output documents)',
    );
});

Deno.test('planAllToOne throws error when outputs_required.documents[0] is missing document_key property', async () => {
    const recipeStepWithoutDocumentKey = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                template_filename: 'business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [],
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
                template_filename: 'business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [],
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
                template_filename: 'business_case.md',
            }],
            assembled_json: [],
            files_to_generate: [],
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

Deno.test('planAllToOne does NOT set document_key when outputs_required is missing or undefined', () => {
    const recipeStepWithoutOutputsRequired: DialecticStageRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: undefined as unknown as DialecticStageRecipeStep['outputs_required'],
    };

    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutOutputsRequired, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assert(
        !('document_key' in job) || job.document_key === undefined || job.document_key === null,
        'document_key should NOT be set when outputs_required is missing or undefined (step does not output documents)',
    );
});



