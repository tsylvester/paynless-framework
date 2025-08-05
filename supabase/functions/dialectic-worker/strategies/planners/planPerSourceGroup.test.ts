// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticRecipeStep, SourceDocument, DialecticPlanJobPayload, DocumentRelationships } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceGroup } from './planPerSourceGroup.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    // The original thesis documents, which act as anchors
    { id: 'thesis-1', content: '', contribution_type: 'thesis', document_relationships: null },
    { id: 'thesis-2', content: '', contribution_type: 'thesis', document_relationships: null },
    // Group 1: Related to original thesis 'thesis-1'
    { id: 'chunk-1a', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' } },
    { id: 'chunk-1b', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' } },
    { id: 'chunk-1c', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-1' } },
    // Group 2: Related to original thesis 'thesis-2'
    { id: 'chunk-2a', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-2' } },
    { id: 'chunk-2b', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: 'thesis-2' } },
    // A document with a null source_group, which should be ignored
    { id: 'chunk-null', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: { source_group: null } },
    // A document with no relationships object, which should be ignored
    { id: 'chunk-no-rel', content: '', contribution_type: 'pairwise_synthesis_chunk', document_relationships: null },
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
        job_type: 'plan',
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
        step_info: { current_step: 2, total_steps: 3 },
    },
    attempt_count: 0, completed_at: null, created_at: '', error_details: null, max_retries: 3, parent_job_id: null, prerequisite_job_id: null, results: null, started_at: null, status: 'pending', target_contribution_id: null
};

const MOCK_RECIPE_STEP: DialecticRecipeStep = {
    step: 2,
    name: 'Consolidate Per-Thesis Syntheses',
    prompt_template_name: 'synthesis_step2_combine',
    granularity_strategy: 'per_source_group',
    inputs_required: [{ type: 'pairwise_synthesis_chunk' }],
    output_type: 'reduced_synthesis',
};

Deno.test('planPerSourceGroup should create one child job for each group of related documents', () => {
    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 2, "Should create 2 child jobs, one for each source group");

    // Check Group 1 job
    const job1 = childJobs.find(j => j.document_relationships?.source_group === 'thesis-1');
    assertExists(job1, "Job for group 'thesis-1' should exist");
    assertEquals(job1.job_type, 'execute');
    assertEquals(job1.prompt_template_name, 'synthesis_step2_combine');
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
});

Deno.test('planPerSourceGroup should return an empty array if no documents have a source group', () => {
    const noSourceIds = MOCK_SOURCE_DOCS.map(d => ({ ...d, document_relationships: null as (DocumentRelationships | null) }));
    const childJobs = planPerSourceGroup(noSourceIds, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPerSourceGroup should return an empty array for empty source documents', () => {
    const childJobs = planPerSourceGroup([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});
