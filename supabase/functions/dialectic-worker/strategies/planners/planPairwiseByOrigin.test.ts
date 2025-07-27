// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, RecipeStep, SourceDocument, DialecticCombinationJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planPairwiseByOrigin } from './planPairwiseByOrigin.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { id: 'thesis-1', target_contribution_id: null, content: 'Thesis 1 content', session_id: 'session-abc', user_id: 'user-def', stage: 'thesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: '', updated_at: '', file_name: '', storage_bucket: '', storage_path: '', model_id: 'model-abc', model_name: 'Model ABC', prompt_template_id_used: 'template-123', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 100, tokens_used_output: 200, processing_time_ms: 1000, error: null, citations: null, contribution_type: 'thesis', size_bytes: 1000, mime_type: 'text/plain' },
    { id: 'thesis-2', target_contribution_id: null, content: 'Thesis 2 content', session_id: 'session-abc', user_id: 'user-def', stage: 'thesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: '', updated_at: '', file_name: '', storage_bucket: '', storage_path: '', model_id: 'model-def', model_name: 'Model DEF', prompt_template_id_used: 'template-456', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 150, tokens_used_output: 250, processing_time_ms: 1500, error: null, citations: null, contribution_type: 'thesis', size_bytes: 1500, mime_type: 'text/plain' },
    { id: 'antithesis-1a', target_contribution_id: 'thesis-1', content: 'Antithesis 1a content', session_id: 'session-abc', user_id: 'user-def', stage: 'antithesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: '', updated_at: '', file_name: '', storage_bucket: '', storage_path: '', model_id: 'model-ghi', model_name: 'Model GHI', prompt_template_id_used: 'template-789', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 200, tokens_used_output: 300, processing_time_ms: 2000, error: null, citations: null, contribution_type: 'antithesis', size_bytes: 2000, mime_type: 'text/plain' },
    { id: 'antithesis-1b', target_contribution_id: 'thesis-1', content: 'Antithesis 1b content', session_id: 'session-abc', user_id: 'user-def', stage: 'antithesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: '', updated_at: '', file_name: '', storage_bucket: '', storage_path: '', model_id: 'model-jkl', model_name: 'Model JKL', prompt_template_id_used: 'template-101', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 250, tokens_used_output: 350, processing_time_ms: 2500, error: null, citations: null, contribution_type: 'antithesis', size_bytes: 2500, mime_type: 'text/plain' },
    { id: 'antithesis-2a', target_contribution_id: 'thesis-2', content: 'Antithesis 2a content', session_id: 'session-abc', user_id: 'user-def', stage: 'antithesis', iteration_number: 1, edit_version: 1, is_latest_edit: true, created_at: '', updated_at: '', file_name: '', storage_bucket: '', storage_path: '', model_id: 'model-mno', model_name: 'Model MNO', prompt_template_id_used: 'template-112', seed_prompt_url: null, original_model_contribution_id: null, raw_response_storage_path: null, tokens_used_input: 300, tokens_used_output: 400, processing_time_ms: 3000, error: null, citations: null, contribution_type: 'antithesis', size_bytes: 3000, mime_type: 'text/plain' },
];

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
    step_name: 'Generate Pairwise Syntheses',
    prompt_template_name: 'synthesis_step1_pairwise',
    description: 'Generate Pairwise Syntheses',
    granularity_strategy: 'pairwise_by_origin',
    inputs_required: [{ type: 'thesis' }, { type: 'antithesis' }],
    output_type: 'synthesis',
    job_type_to_create: 'execute',
};

Deno.test('planPairwiseByOrigin should create one child job for each thesis-antithesis pair', () => {
    const childJobs = planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childJobs.length, 3, "Should create 3 child jobs for the 3 pairs");
    
    // Check Job 1 (thesis-1 vs antithesis-1a)
    const job1 = childJobs.find(j => j.payload.inputs?.antithesis_id === 'antithesis-1a');
    assertExists(job1, "Job for antithesis-1a should exist");
    assertEquals(job1.parent_job_id, 'parent-job-123');
    assertEquals(job1.session_id, 'session-abc');
    assertEquals(job1.user_id, 'user-def');
    const job1Payload = job1.payload;
    assertEquals(job1Payload.job_type, 'execute');
    assertEquals(job1Payload.prompt_template_name, 'synthesis_step1_pairwise');
    assertEquals(job1Payload.inputs?.thesis_id, 'thesis-1');
    
    // Check Job 2 (thesis-1 vs antithesis-1b)
    const job2 = childJobs.find(j => j.payload?.inputs?.antithesis_id === 'antithesis-1b');
    assertExists(job2, "Job for antithesis-1b should exist");
    assertEquals(job2.payload?.inputs?.thesis_id, 'thesis-1');
    
    // Check Job 3 (thesis-2 vs antithesis-2a)
    const job3 = childJobs.find(j => j.payload?.inputs?.antithesis_id === 'antithesis-2a');
    assertExists(job3, "Job for antithesis-2a should exist");
    assertEquals(job3.payload?.inputs?.thesis_id, 'thesis-2');
});

Deno.test('planPairwiseByOrigin should return an empty array if there are no theses', () => {
    const noTheses = MOCK_SOURCE_DOCS.filter(d => d.contribution_type !== 'thesis');
    const childJobs = planPairwiseByOrigin(noTheses, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPairwiseByOrigin should return an empty array if there are no antitheses', () => {
    const noAntitheses = MOCK_SOURCE_DOCS.filter(d => d.contribution_type !== 'antithesis');
    const childJobs = planPairwiseByOrigin(noAntitheses, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('planPairwiseByOrigin should return an empty array for empty source documents', () => {
    const childJobs = planPairwiseByOrigin([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0);
});

Deno.test('should return an empty array if theses exist but no antitheses are related', () => {
    const unrelatedAntitheses = [
        { id: 'antithesis-unrelated', target_contribution_id: 'some-other-thesis' }
    ] as SourceDocument[];
    const thesesOnly = MOCK_SOURCE_DOCS.filter(d => d.contribution_type === 'thesis');

    const childJobs = planPairwiseByOrigin([...thesesOnly, ...unrelatedAntitheses], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0, "Should create no jobs if no antitheses match the theses");
});

Deno.test('should return an empty array if antitheses exist but no matching theses are found', () => {
    const antithesesOnly = MOCK_SOURCE_DOCS.filter(d => d.contribution_type === 'antithesis');
    const childJobs = planPairwiseByOrigin(antithesesOnly, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childJobs.length, 0, "Should create no jobs if no theses are present to match against");
}); 