// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, RecipeStep, SourceDocument, DialecticCombinationJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceGroup } from './planPerSourceGroup.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    // Group 1: Related to original thesis 'thesis-1'
    { id: 'chunk-1a', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-1' },
    { id: 'chunk-1b', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-1' },
    { id: 'chunk-1c', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-1' },
    // Group 2: Related to original thesis 'thesis-2'
    { id: 'chunk-2a', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-2' },
    { id: 'chunk-2b', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-2' },
    // A document with a null target_contribution_id, which should be ignored by this planner
    { id: 'chunk-null', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: null },
].map(d => ({ ...d, session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p' })) as unknown as SourceDocument[];


const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticCombinationJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'synthesis',
    iteration_number: 1,
    payload: {
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
    },
    attempt_count: 0, completed_at: null, created_at: '', error_details: null, max_retries: 3, parent_job_id: null, prerequisite_job_id: null, results: null, started_at: null, status: 'pending', target_contribution_id: null
};

const MOCK_RECIPE_STEP: RecipeStep = {
    step_name: 'Consolidate Per-Thesis Syntheses',
    prompt_template_name: 'synthesis_step2_combine',
    description: '', granularity_strategy: '', inputs_required: [], output_type: '', job_type_to_create: 'execute',
};

Deno.test('planPerSourceGroup should create one child job for each group of related documents', () => {
    const childJobs = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 2, "Should create 2 child jobs, one for each source group");

    // Check Group 1 job
    const job1 = childJobs.find(j => j.payload.inputs?.source_group_id === 'thesis-1');
    assertExists(job1, "Job for group 'thesis-1' should exist");
    assertEquals(job1.parent_job_id, 'parent-job-123');
    assertEquals(job1.payload.job_type, 'execute');
    assertEquals(job1.payload.prompt_template_name, 'synthesis_step2_combine');
    const job1Inputs = job1.payload.inputs?.document_ids;
    assertEquals(job1Inputs?.length, 3);
    assertExists(job1Inputs?.find(id => id === 'chunk-1a'));
    assertExists(job1Inputs?.find(id => id === 'chunk-1b'));
    assertExists(job1Inputs?.find(id => id === 'chunk-1c'));

    // Check Group 2 job
    const job2 = childJobs.find(j => j.payload.inputs?.source_group_id === 'thesis-2');
    assertExists(job2, "Job for group 'thesis-2' should exist");
    const job2Inputs = job2.payload.inputs?.document_ids;
    assertEquals(job2Inputs?.length, 2);
    assertExists(job2Inputs?.find(id => id === 'chunk-2a'));
    assertExists(job2Inputs?.find(id => id === 'chunk-2b'));
});

Deno.test('planPerSourceGroup should return an empty array if no documents have a source id', () => {
    const noSourceIds = MOCK_SOURCE_DOCS.map(d => ({ ...d, target_contribution_id: null }));
    const childJobs = planPerSourceGroup(noSourceIds, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPerSourceGroup should return an empty array for empty source documents', () => {
    const childJobs = planPerSourceGroup([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPerSourceGroup should create a single job when all documents belong to one group', () => {
    const singleGroupDocs = [
        { id: 'chunk-1a', target_contribution_id: 'thesis-1' },
        { id: 'chunk-1b', target_contribution_id: 'thesis-1' },
    ].map(d => ({ ...d, content: '', contribution_type: 'pairwise_synthesis_chunk', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p' })) as unknown as SourceDocument[];

    const childJobs = planPerSourceGroup(singleGroupDocs, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 1, "Should create exactly one child job");
    const job = childJobs[0];
    assertEquals(job.payload.inputs?.source_group_id, 'thesis-1');
    const jobInputs = job.payload.inputs?.document_ids;
    assertEquals(jobInputs?.length, 2);
    assertExists(jobInputs?.find(id => id === 'chunk-1a'));
    assertExists(jobInputs?.find(id => id === 'chunk-1b'));
});

Deno.test('planPerSourceGroup should create one job per document when each is in a unique group', () => {
    const uniqueGroupDocs = [
        { id: 'chunk-1', target_contribution_id: 'thesis-1' },
        { id: 'chunk-2', target_contribution_id: 'thesis-2' },
    ].map(d => ({ ...d, content: '', contribution_type: 'pairwise_synthesis_chunk', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p' })) as unknown as SourceDocument[];

    const childJobs = planPerSourceGroup(uniqueGroupDocs, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 2, "Should create a job for each unique group");

    const job1 = childJobs.find(j => j.payload.inputs?.source_group_id === 'thesis-1');
    assertExists(job1);
    assertEquals(job1.payload.inputs?.document_ids?.length, 1);
    assertEquals(job1.payload.inputs?.document_ids?.[0], 'chunk-1');

    const job2 = childJobs.find(j => j.payload.inputs?.source_group_id === 'thesis-2');
    assertExists(job2);
    assertEquals(job2.payload.inputs?.document_ids?.length, 1);
    assertEquals(job2.payload.inputs?.document_ids?.[0], 'chunk-2');
}); 