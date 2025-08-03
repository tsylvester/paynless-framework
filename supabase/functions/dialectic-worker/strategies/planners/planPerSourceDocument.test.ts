// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticPlanJobPayload, DialecticRecipeStep, SourceDocument, DialecticExecuteJobPayload } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceDocument } from './planPerSourceDocument.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    { 
        id: 'doc-1', 
        content: 'Doc 1 content', 
        contribution_type: 'thesis', 
        session_id: 'session-abc', 
        user_id: 'user-def', 
        stage: 'thesis', 
        iteration_number: 1, 
        edit_version: 1, 
        is_latest_edit: true, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(), 
        file_name: 'f1.txt', 
        storage_bucket: 'b1', 
        storage_path: 'p1', 
        model_id: 'm1', 
        model_name: 'M1', 
        prompt_template_id_used: 'p1', 
        seed_prompt_url: null, 
        original_model_contribution_id: null, 
        raw_response_storage_path: null, 
        tokens_used_input: 1, 
        tokens_used_output: 1, 
        processing_time_ms: 1, 
        error: null, citations: 
        null, size_bytes: 1, 
        mime_type: 'text/plain', 
        target_contribution_id: null,
        document_relationships: null,
    },
    { 
        id: 'doc-2', 
        content: 'Doc 2 content', 
        contribution_type: 'thesis', 
        session_id: 'session-abc', 
        user_id: 'user-def', 
        stage: 'thesis', 
        iteration_number: 1, 
        edit_version: 1, 
        is_latest_edit: true, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(), 
        file_name: 'f2.txt', 
        storage_bucket: 'b1', 
        storage_path: 'p1', 
        model_id: 'm1', 
        model_name: 'M1', 
        prompt_template_id_used: 'p1', 
        seed_prompt_url: null, 
        original_model_contribution_id: null, 
        raw_response_storage_path: null, 
        tokens_used_input: 1, 
        tokens_used_output: 1, 
        processing_time_ms: 1, 
        error: null, 
        citations: null, 
        size_bytes: 1, 
        mime_type: 'text/plain', 
        target_contribution_id: null,
        document_relationships: null,
    },
];

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: {
        job_type: 'plan',
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'antithesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
        step_info: {
            current_step: 1,
            total_steps: 1,
        }
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

const MOCK_RECIPE_STEP: DialecticRecipeStep = {
    step: 1,
    name: 'Generate Antithesis',
    prompt_template_name: 'antithesis_step1_critique',
    inputs_required: [{ type: 'thesis' }],
    granularity_strategy: 'per_source_document',
    output_type: 'antithesis',
};

Deno.test('planPerSourceDocument should create one child job for each source document', () => {
    const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childPayloads.length, 2, "Should create 2 child jobs, one for each source doc");

    const job1Payload = childPayloads.find(p => p.inputs?.thesis_id === 'doc-1');
    assertExists(job1Payload, "Payload for doc-1 should exist");
    assertEquals(job1Payload.job_type, 'execute');
    assertEquals(job1Payload.prompt_template_name, 'antithesis_step1_critique');
    assertEquals(job1Payload.output_type, 'antithesis');
    assertEquals(job1Payload.document_relationships, { source_group: 'doc-1' });

    assertExists(job1Payload.canonicalPathParams);
    assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'thesis');
    assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'M1');
    assertEquals(job1Payload.canonicalPathParams.sourceModelSlugs, ['M1']);
    assert(!('originalFileName' in job1Payload));
    
    const job2Payload = childPayloads.find(p => p.inputs?.thesis_id === 'doc-2');
    assertExists(job2Payload, "Payload for doc-2 should exist");
    assertExists(job2Payload.canonicalPathParams);
    assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'thesis');
    assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'M1');
    assertEquals(job2Payload.canonicalPathParams.sourceModelSlugs, ['M1']);
});

Deno.test('planPerSourceDocument should return an empty array for empty source documents', () => {
    const childPayloads = planPerSourceDocument([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childPayloads.length, 0);
});

Deno.test('planPerSourceDocument should correctly handle a single source document', () => {
    const singleDoc = [MOCK_SOURCE_DOCS[0]];
    const childPayloads = planPerSourceDocument(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childPayloads.length, 1, "Should create exactly one child job");
    const payload = childPayloads[0];
    assertExists(payload, "The single payload should exist");

    assertEquals(payload.inputs?.thesis_id, 'doc-1');
    assertEquals(payload.prompt_template_name, 'antithesis_step1_critique');
}); 