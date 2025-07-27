// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, RecipeStep, SourceDocument, DialecticCombinationJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceDocument } from './planPerSourceDocument.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'doc-1', content: 'Doc 1 content', contribution_type: 'thesis', session_id: 'session-abc', user_id: 'user-def', stage: 'thesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), file_name: 'f1.txt', storage_bucket: 'b1', storage_path: 'p1', model_id: 'm1', model_name: 'M1', prompt_template_id_used: 'p1', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 1, tokens_used_output: 1, processing_time_ms: 1, error: null, citations: null, size_bytes: 1, mime_type: 'text/plain', target_contribution_id: null },
    { id: 'doc-2', content: 'Doc 2 content', contribution_type: 'thesis', session_id: 'session-abc', user_id: 'user-def', stage: 'thesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), file_name: 'f2.txt', storage_bucket: 'b1', storage_path: 'p1', model_id: 'm1', model_name: 'M1', prompt_template_id_used: 'p1', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 1, tokens_used_output: 1, processing_time_ms: 1, error: null, citations: null, size_bytes: 1, mime_type: 'text/plain', target_contribution_id: null },
];

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticCombinationJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: {
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'antithesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
    },
    attempt_count: 0,
    completed_at: null,
    created_at: new Date().toISOString(),
    error_details: null,
    max_retries: 3,
    parent_job_id: null,
    prerequisite_job_id: null,
    results: null,
    started_at: null,
    status: 'pending',
    target_contribution_id: null,
};

const MOCK_RECIPE_STEP: RecipeStep = {
    step_name: 'Generate Antithesis',
    prompt_template_name: 'antithesis_step1_critique',
    description: 'Generate a critique for each thesis document.',
    granularity_strategy: 'per_source_document',
    inputs_required: [{ type: 'thesis' }],
    output_type: 'antithesis',
    job_type_to_create: 'execute',
};

Deno.test('planPerSourceDocument should create one child job for each source document', () => {
    const childJobs = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 2, "Should create 2 child jobs, one for each source doc");

    const job1 = childJobs.find(j => j.payload.inputs?.source_id === 'doc-1');
    assertExists(job1, "Job for doc-1 should exist");
    assertEquals(job1.parent_job_id, 'parent-job-123');
    assertEquals(job1.payload.job_type, 'execute');
    assertEquals(job1.payload.prompt_template_name, 'antithesis_step1_critique');
    
    const job2 = childJobs.find(j => j.payload.inputs?.source_id === 'doc-2');
    assertExists(job2, "Job for doc-2 should exist");
    assertEquals(job2.parent_job_id, 'parent-job-123');
});

Deno.test('planPerSourceDocument should return an empty array for empty source documents', () => {
    const childJobs = planPerSourceDocument([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPerSourceDocument should correctly handle a single source document', () => {
    const singleDoc = [MOCK_SOURCE_DOCS[0]];
    const childJobs = planPerSourceDocument(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 1, "Should create exactly one child job");
    const job = childJobs[0];
    assertExists(job, "The single job should exist");
    assertEquals(job.payload.inputs?.source_id, 'doc-1');
    assertEquals(job.parent_job_id, 'parent-job-123');
    assertEquals(job.payload.prompt_template_name, 'antithesis_step1_critique');
}); 