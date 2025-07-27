// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, RecipeStep, SourceDocument, DialecticCombinationJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planAllToOne } from './planAllToOne.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'doc-1', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
    { id: 'doc-2', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
    { id: 'doc-3', content: '', citations: [], error: null, mime_type: 'text/plain', original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 0, tokens_used_output: 0, processing_time_ms: 0, contribution_type: 'reduced_synthesis', size_bytes: 0, target_contribution_id: 't', seed_prompt_url: null },
].map(d => ({ ...d, contribution_type: 'reduced_synthesis', session_id: 's1', user_id: 'u1', stage: 'synthesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: 't', updated_at: 't', file_name: 'f', storage_bucket: 'b', storage_path: 'p', model_id: 'm', model_name: 'M', prompt_template_id_used: 'p', target_contribution_id: 't' }));

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
    step_name: 'Generate Final Synthesis',
    prompt_template_name: 'synthesis_step3_final',
    description: '', granularity_strategy: '', inputs_required: [], output_type: '', job_type_to_create: 'execute',
};

Deno.test('planAllToOne should create exactly one child job', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 1, "Should create exactly one child job");
});

Deno.test('planAllToOne should include all source document IDs in the single child job', () => {
    const childJobs = planAllToOne(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    const job1 = childJobs[0];
    assertExists(job1);

    assertEquals(job1.parent_job_id, 'parent-job-123');
    assertEquals(job1.payload.job_type, 'execute');
    assertEquals(job1.payload.prompt_template_name, 'synthesis_step3_final');
    
    const docIds = job1.payload.inputs?.document_ids;
    assertEquals(docIds?.length, 3);
    assertExists(docIds?.find(id => id === 'doc-1'));
    assertExists(docIds?.find(id => id === 'doc-2'));
    assertExists(docIds?.find(id => id === 'doc-3'));
});

Deno.test('should create one child job when given a single source document', () => {
    const singleDoc = [MOCK_SOURCE_DOCS[0]];
    const childJobs = planAllToOne(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 1, "Should still create one child job");
    const docIds = childJobs[0].payload.inputs?.document_ids;
    assertEquals(docIds?.length, 1, "Inputs should contain one document ID");
    assertEquals(docIds?.[0], 'doc-1');
});

Deno.test('planAllToOne should return an empty array if there are no source documents', () => {
    const childJobs = planAllToOne([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0, "Should create no jobs for empty input");
}); 