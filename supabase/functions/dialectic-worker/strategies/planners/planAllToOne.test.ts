// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticRecipeStep, SourceDocument, DialecticPlanJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planAllToOne } from './planAllToOne.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'doc-1', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
    { id: 'doc-2', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
    { id: 'doc-3', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
].map(d => ({ ...d, document_relationships: null, attempt_count: 0, contribution_type: 'reduced_synthesis', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p', target_contribution_id: 't' }));

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
        step_info: { current_step: 1, total_steps: 3 },
        walletId: 'wallet-default',
    },
    attempt_count: 0, completed_at: null, created_at: '', error_details: null, max_retries: 3, parent_job_id: null, prerequisite_job_id: null, results: null, started_at: null, status: 'pending', target_contribution_id: null
};

const MOCK_RECIPE_STEP: DialecticRecipeStep = {
    step: 3,
    name: 'Generate Final Synthesis',
    prompt_template_name: 'synthesis_step3_final',
    inputs_required: [],
    granularity_strategy: 'all_to_one',
    output_type: 'synthesis',
};

Deno.test('planAllToOne should create exactly one child job', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 1, "Should create exactly one child job");
});

Deno.test('planAllToOne should include all source document IDs in the single child job', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    const job1 = childJobs[0];
    assertExists(job1);

    assertEquals(job1.job_type, 'execute');
    assertEquals(job1.prompt_template_name, 'synthesis_step3_final');
    
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
    const docIds = childJobs[0].inputs?.document_ids as string[];
    assertEquals(docIds?.length, 1, "Inputs should contain one document ID");
    assertEquals(docIds?.[0], 'doc-1');
});

Deno.test('planAllToOne should return an empty array if there are no source documents', () => {
    const childJobs = planAllToOne([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childJobs.length, 0, "Should create no jobs for empty input");
});
