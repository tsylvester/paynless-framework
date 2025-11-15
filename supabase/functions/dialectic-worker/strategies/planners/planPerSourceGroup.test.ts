// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts
import { assertEquals, assertExists, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticRecipeStep, SourceDocument, DialecticPlanJobPayload, DocumentRelationships } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceGroup } from './planPerSourceGroup.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';

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
    outputs_required: { documents: [], assembled_json: [], files_to_generate: [] },
};

Deno.test('planPerSourceGroup should create one child job for each group of related documents', () => {
    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

    assertEquals(childJobs.length, 2, "Should create 2 child jobs, one for each source group");

    // Check Group 1 job
    const job1 = childJobs.find(j => j.document_relationships?.source_group === 'thesis-1');
    assertExists(job1, "Job for group 'thesis-1' should exist");
    assertEquals(job1.job_type, 'execute');
    assertEquals(job1?.sourceContributionId, 'thesis-1');
    
    // UPDATED Assertions for modern contract
    assertExists(job1.prompt_template_id, "prompt_template_id should exist on the new payload.");
    assertEquals(job1.prompt_template_id, 'synthesis_step2_combine');
    assertEquals((job1 as any).prompt_template_name, undefined, "prompt_template_name should be undefined.");
    assertEquals(job1.output_type, FileType.ReducedSynthesis);

    const job1Inputs = job1.inputs?.document_ids;
    assert(Array.isArray(job1Inputs), "job1Inputs should be an array");
    assertEquals(job1Inputs?.length, 3);
    assert(job1Inputs?.includes('chunk-1a'));
    assert(job1Inputs?.includes('chunk-1b'));
    assert(job1Inputs?.includes('chunk-1c'));

    // Check Group 2 job
    const job2 = childJobs.find(j => j.document_relationships?.source_group === 'thesis-2');
    assertExists(job2, "Job for group 'thesis-2' should exist");
    const job2Inputs = job2.inputs?.document_ids;
    assert(Array.isArray(job2Inputs), "job2Inputs should be an array");
    assertEquals(job2Inputs?.length, 2);
    assert(job2Inputs?.includes('chunk-2a'));
    assert(job2Inputs?.includes('chunk-2b'));
    assertEquals(job2?.sourceContributionId, 'thesis-2');
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
        assertEquals(
            child.sourceContributionId,
            child.document_relationships?.source_group,
            'Child payload must expose the canonical source contribution id'
        );
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