// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts
import { assertEquals, assertExists, assert, assertThrows, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticRecipeStep, SourceDocument, DialecticPlanJobPayload, DialecticExecuteJobPayload, DocumentRelationships, RenderedDocumentArtifact, ContextForDocument } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceGroup } from './planPerSourceGroup.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    // The original thesis documents, which act as anchors
    { id: 'thesis-1', content: '', contribution_type: 'thesis', document_relationships: null, is_header: false, source_prompt_resource_id: null },
    { id: 'thesis-2', content: '', contribution_type: 'thesis', document_relationships: null, is_header: false, source_prompt_resource_id: null },
    // Group 1: Related to original thesis 'thesis-1'
    { id: 'chunk-1a', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' }, is_header: false, source_prompt_resource_id: null },
    { id: 'chunk-1b', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' }, is_header: false, source_prompt_resource_id: null },
    { id: 'chunk-1c', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' }, is_header: false, source_prompt_resource_id: null },
    // Group 2: Related to original thesis 'thesis-2'
    { id: 'chunk-2a', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-2' }, is_header: false, source_prompt_resource_id: null },
    { id: 'chunk-2b', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-2' }, is_header: false, source_prompt_resource_id: null },
    // A document with a null source_group, which should be ignored
    { id: 'chunk-null', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: null }, is_header: false, source_prompt_resource_id: null },
    // A document with no relationships object, which should be ignored
    { id: 'chunk-no-rel', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: null, is_header: false, source_prompt_resource_id: null },
].map(d => ({
    ...d,
    citations: [],
    error: null,
    mime_type: 'text/plain',
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    tokens_used_input: 0,
    tokens_used_output: 0,
    processing_time_ms: 0,
    size_bytes: 0,
    seed_prompt_url: null,
    session_id: 's1',
    user_id: 'u1',
    stage: 'synthesis',
    iteration_number: 1,
    edit_version: 1,
    is_latest_edit: true,
    created_at: 't',
    updated_at: 't',
    file_name: 'f',
    storage_bucket: 'b',
    storage_path: 'p',
    model_id: 'm',
    model_name: 'M',
    prompt_template_id_used: 'p',
    target_contribution_id: null,
    attempt_count: 0
}));


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
        is_test_job: false,
        user_jwt: 'user-jwt-123',
    },
    attempt_count: 0, 
    completed_at: null, 
    created_at: '', 
    error_details: null, 
    max_retries: 3, 
    parent_job_id: null, 
    prerequisite_job_id: null, 
    results: null, 
    started_at: null, 
    status: 'pending', target_contribution_id: null, is_test_job: false, job_type: 'PLAN'
};

const MOCK_RECIPE_STEP: DialecticRecipeStep = {
    id: 'recipe-step-id-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    template_id: 'template-id-abc',
    step_key: 'test-step-key-1',
    step_slug: 'test-step-slug-1',
    step_description: 'Mock description 1',
    step_number: 2,
    step_name: 'Consolidate Per-Thesis Syntheses',
    prompt_template_id: 'synthesis_step2_combine',
    granularity_strategy: 'per_source_group',
    inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
    output_type: FileType.ReducedSynthesis,
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    branch_key: null,
    parallel_group: null,
    inputs_relevance: [],
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.Synthesis,
            template_filename: 'synthesis.md',
        }],
        assembled_json: [],
        files_to_generate: [{
            from_document_key: FileType.Synthesis,
            template_filename: 'synthesis.md',
        }],
    },
};

Deno.test('planPerSourceGroup should create one child job for each group of related documents', () => {
    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

    assertEquals(childJobs.length, 2, "Should create 2 child jobs, one for each source group");

    // Check Group 1 job
    const job1 = childJobs.find(j => {
        if (isDialecticExecuteJobPayload(j)) {
            return j.document_relationships?.source_group === 'thesis-1';
        }
        return false;
    });
    assertExists(job1, "Job for group 'thesis-1' should exist");
    assertEquals(isDialecticExecuteJobPayload(job1), true);
    if (isDialecticExecuteJobPayload(job1)) {
        const executeJob1: DialecticExecuteJobPayload = job1;
        assertEquals(executeJob1.sourceContributionId, 'thesis-1');
        
        // UPDATED Assertions for modern contract
        assertExists(executeJob1.prompt_template_id, "prompt_template_id should exist on the new payload.");
        assertEquals(executeJob1.prompt_template_id, 'synthesis_step2_combine');
        assertEquals(executeJob1.output_type, FileType.ReducedSynthesis);

        const job1Inputs = executeJob1.inputs?.document_ids;
        assert(Array.isArray(job1Inputs), "job1Inputs should be an array");
        assertEquals(job1Inputs?.length, 3);
        assert(job1Inputs?.includes('chunk-1a'));
        assert(job1Inputs?.includes('chunk-1b'));
        assert(job1Inputs?.includes('chunk-1c'));
    }

    // Check Group 2 job
    const job2 = childJobs.find(j => {
        if (isDialecticExecuteJobPayload(j)) {
            return j.document_relationships?.source_group === 'thesis-2';
        }
        return false;
    });
    assertExists(job2, "Job for group 'thesis-2' should exist");
    if (isDialecticExecuteJobPayload(job2)) {
        const executeJob2: DialecticExecuteJobPayload = job2;
        const job2Inputs = executeJob2.inputs?.document_ids;
        assert(Array.isArray(job2Inputs), "job2Inputs should be an array");
        assertEquals(job2Inputs?.length, 2);
        assert(job2Inputs?.includes('chunk-2a'));
        assert(job2Inputs?.includes('chunk-2b'));
        assertEquals(executeJob2.sourceContributionId, 'thesis-2');
    }
});

Deno.test('planPerSourceGroup should return an empty array if no documents have a source group', () => {
    const noSourceIds = MOCK_SOURCE_DOCS.map(d => ({ ...d, document_relationships: null as (DocumentRelationships | null) }));
    const childJobs = planPerSourceGroup(noSourceIds, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 0);
});

Deno.test('planPerSourceGroup should return an empty array for empty source documents', () => {
    const childJobs = planPerSourceGroup([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 0);
});

// ==============================================
// Assert all children have payload.stageSlug equal to the parent’s dynamic stage
// ==============================================
Deno.test('planPerSourceGroup constructs child payloads with dynamic stage consistency (payload.stageSlug === parent.payload.stageSlug)', () => {
	const expectedStage = 'parenthesis'; // choose a non-thesis simple stage
	const parent: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parent, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
	Object.defineProperty(parent.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

	const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, parent, { ...MOCK_RECIPE_STEP }, 'ignored.jwt');

	assertEquals(childJobs.length > 0, true, 'Planner should produce one job per group');
	for (const child of childJobs) {
		assertEquals(child.stageSlug, expectedStage, 'Child payload.stageSlug must equal parent.payload.stageSlug');
        if (isDialecticExecuteJobPayload(child)) {
            const executeChild: DialecticExecuteJobPayload = child;
            assertEquals(
                executeChild.sourceContributionId,
                executeChild.document_relationships?.source_group,
                'Child payload must expose the canonical source contribution id'
            );
        }
	}
});

Deno.test('planPerSourceGroup throws when a source group lacks its canonical anchor', () => {
    const docsMissingAnchor = MOCK_SOURCE_DOCS.filter(doc => doc.id !== 'thesis-2');

    assertThrows(
        () => planPerSourceGroup(docsMissingAnchor, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123'),
        Error,
        'planPerSourceGroup missing anchor SourceDocument for group thesis-2',
    );
});

Deno.test('planPerSourceGroup should include planner_metadata.recipe_step_id in all child payloads', () => {
    const mockRecipeStep: DialecticRecipeStep = {
        ...MOCK_RECIPE_STEP,
        id: 'recipe-step-group-123',
    };

    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, mockRecipeStep, 'user-jwt-123');

    assertEquals(childJobs.length > 0, true, 'Planner should produce at least one job');
    for (const job of childJobs) {
        if (isDialecticExecuteJobPayload(job)) {
            const executeJob: DialecticExecuteJobPayload = job;
            assertExists(executeJob.planner_metadata, 'planner_metadata should exist on child job payload');
            assertEquals(executeJob.planner_metadata?.recipe_step_id, 'recipe-step-group-123', 'planner_metadata.recipe_step_id should match recipe step id');
        }
    }
});

Deno.test('planPerSourceGroup should inherit all fields from parent job payload including model_slug and user_jwt', () => {
    const parent: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
            is_test_job: false,
            model_slug: 'parent-model-slug',
            user_jwt: 'parent-jwt-token',
        },
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
        job_type: 'PLAN',
    };

    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, parent, MOCK_RECIPE_STEP, 'ignored.jwt');

    assertEquals(childJobs.length > 0, true, 'Planner should produce at least one job');
    for (const job of childJobs) {
        assertEquals(job.model_slug, 'parent-model-slug', 'Child payload must inherit model_slug from parent job payload');
        assertEquals(job.user_jwt, 'parent-jwt-token', 'Child payload must inherit user_jwt from parent job payload');
    }
});

// ==============================================
// document_key extraction and validation tests
// ==============================================

Deno.test('planPerSourceGroup sets document_key in payload when recipeStep.outputs_required.documents[0].document_key is present', () => {
    const document: RenderedDocumentArtifact = {
        artifact_class: 'rendered_document',
        file_type: 'markdown',
        document_key: FileType.Synthesis,
        template_filename: 'synthesis.md',
    };
    const recipeStepWithDocumentKey: DialecticRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [document],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    };

    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithDocumentKey, 'user-jwt-123');
    
    assertEquals(childJobs.length > 0, true, 'Should create at least one child job');
    for (const job of childJobs) {
        assertExists(job, 'Child job should exist');
        if (isDialecticExecuteJobPayload(job)) {
            const executeJob: DialecticExecuteJobPayload = job;
            assertEquals(
                executeJob.document_key,
                FileType.Synthesis,
                'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
            );
        }
    }
});

Deno.test('planPerSourceGroup throws error when outputs_required.documents array is empty for EXECUTE jobs', () => {
    const recipeStepWithEmptyDocuments: DialecticRecipeStep = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    };

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocuments, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs',
        'Should throw error when documents array is empty for EXECUTE jobs',
    );
});

Deno.test('planPerSourceGroup throws error when outputs_required.documents[0] is missing document_key property', () => {
    const recipeStepWithoutDocumentKey = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                template_filename: 'synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    } as unknown as DialecticRecipeStep;

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.documents[0].document_key but it is missing',
        'Should throw error when documents[0] is missing document_key property',
    );
});

Deno.test('planPerSourceGroup throws error when outputs_required.documents[0].document_key is null', () => {
    const recipeStepWithNullDocumentKey = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: null as unknown as FileType,
                template_filename: 'synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    } as unknown as DialecticRecipeStep;

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithNullDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string',
        'Should throw error when document_key is null',
    );
});

Deno.test('planPerSourceGroup throws error when outputs_required.documents[0].document_key is empty string', () => {
    const recipeStepWithEmptyDocumentKey = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: '' as unknown as FileType,
                template_filename: 'synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    } as unknown as DialecticRecipeStep;

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string',
        'Should throw error when document_key is empty string',
    );
});

Deno.test('planPerSourceGroup throws error when outputs_required is missing documents property for EXECUTE jobs', () => {
    const recipeStepWithoutDocumentsProperty = {
        ...MOCK_RECIPE_STEP,
        outputs_required: {
            assembled_json: [],
            files_to_generate: [{
                from_document_key: FileType.Synthesis,
                template_filename: 'synthesis.md',
            }],
        },
    } as unknown as DialecticRecipeStep;

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentsProperty, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing',
        'Should throw error when documents property is missing for EXECUTE jobs',
    );
});

Deno.test('planPerSourceGroup throws error when outputs_required is missing or undefined for EXECUTE jobs', () => {
    const recipeStepWithoutOutputsRequired = {
        ...MOCK_RECIPE_STEP,
        outputs_required: undefined as unknown as DialecticRecipeStep['outputs_required'],
    } as unknown as DialecticRecipeStep;

    assertThrows(
        () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutOutputsRequired, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing',
        'Should throw error when outputs_required is missing or undefined for EXECUTE jobs',
    );
});

// ==============================================
// Step 32.b: Tests for PLAN and EXECUTE job validation
// ==============================================

Deno.test('planPerSourceGroup includes context_for_documents in payload for PLAN jobs with valid context_for_documents', () => {
    const planRecipeStep: DialecticRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        outputs_required: {
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        field1: '',
                        field2: [],
                    },
                },
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    };

    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticPlanJobPayload(job)) {
        const planPayload = job;
        assertExists(planPayload.context_for_documents, 'PLAN job payload should include context_for_documents');
        assertEquals(planPayload.context_for_documents.length, 1, 'context_for_documents should have one entry');
        assertEquals(planPayload.context_for_documents[0].document_key, FileType.business_case, 'document_key should match');
    } else {
        throw new Error('Expected PLAN job');
    }
});

Deno.test('planPerSourceGroup throws error for PLAN job when context_for_documents is missing', async () => {
    const planRecipeStepWithoutContext: DialecticRecipeStep = {
        ...MOCK_RECIPE_STEP,
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContext, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when context_for_documents is missing for PLAN job',
    );
});

Deno.test('planPerSourceGroup throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
    const planRecipeStepWithoutDocumentKey: DialecticRecipeStep = {
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
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when context_for_documents entry is missing document_key',
    );
});

Deno.test('planPerSourceGroup throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
    const planRecipeStepWithoutContentToInclude: DialecticRecipeStep = {
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
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContentToInclude, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when context_for_documents entry is missing content_to_include',
    );
});

Deno.test('planPerSourceGroup successfully creates payload for EXECUTE job with valid files_to_generate', () => {
    const executeRecipeStep: DialecticRecipeStep = {
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

    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length > 0, true, 'Should create at least one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'Job type should be execute');
});

Deno.test('planPerSourceGroup throws error for EXECUTE job when files_to_generate is missing', async () => {
    const executeRecipeStepWithoutFiles: DialecticRecipeStep = {
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
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFiles, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when files_to_generate is missing for EXECUTE job',
    );
});

Deno.test('planPerSourceGroup throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
    const executeRecipeStepWithoutFromDocumentKey: DialecticRecipeStep = {
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
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFromDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when files_to_generate entry is missing from_document_key',
    );
});

Deno.test('planPerSourceGroup throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
    const executeRecipeStepWithoutTemplateFilename: DialecticRecipeStep = {
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
    } as unknown as DialecticRecipeStep;

    await assertRejects(
        async () => {
            planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutTemplateFilename, 'user-jwt-123');
        },
        Error,
        'planPerSourceGroup requires',
        'Should throw error when files_to_generate entry is missing template_filename',
    );
});