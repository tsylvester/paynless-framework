// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DialecticJobRow, DialecticPlanJobPayload, DialecticRecipeStep, SourceDocument } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceGroup } from './planPerSourceGroup.ts';
import { isDialecticCombinationJobPayload } from '../../../_shared/utils/type_guards.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
    // Group 1: Related to original thesis 'thesis-1'
    { 
        id: 'chunk-1a', 
        content: '', 
        contribution_type: 'pairwise_synthesis_chunk', 
        target_contribution_id: 'thesis-1',
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
        document_relationships: { source_group: 'thesis-1' },
    },
    { id: 'chunk-1b', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-1',
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
        document_relationships: { source_group: 'thesis-1' },
    },
    { id: 'chunk-1c', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-1',
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
        document_relationships: { source_group: 'thesis-1' },
    },
    // Group 2: Related to original thesis 'thesis-2'
    { id: 'chunk-2a', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-2',
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
        document_relationships: { source_group: 'thesis-2' },
    },
    { id: 'chunk-2b', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-2',
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
        document_relationships: { source_group: 'thesis-2' },
    },
    // Group 3: Related to original thesis 'thesis-3'
    { id: 'chunk-3a', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: 'thesis-3',
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
        document_relationships: { source_group: 'thesis-3' },
    },
    // A document with a null target_contribution_id, which should be ignored by this planner
    { id: 'chunk-null', content: '', contribution_type: 'pairwise_synthesis_chunk', target_contribution_id: null,
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
        document_relationships: null,
    },
];


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
        step_info: {
            current_step: 1,
            total_steps: 1,
        }
    },
    attempt_count: 0, completed_at: null, created_at: '', error_details: null, max_retries: 3, parent_job_id: null, prerequisite_job_id: null, results: null, started_at: null, status: 'pending', target_contribution_id: null
};

const MOCK_RECIPE_STEP: DialecticRecipeStep = {
    step: 1,
    name: 'Consolidate Per-Thesis Syntheses',
    prompt_template_name: 'synthesis_step2_combine',
    granularity_strategy: 'per_source_group',
    inputs_required: [],
    output_type: 'reduced_synthesis',
};

Deno.test('planPerSourceGroup should create one child job for each group of related documents', () => {
    const childPayloads = planPerSourceGroup(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childPayloads.length, 3, "Should create 3 child jobs, one for each source group");

    // Check Group 1 job
    const job1Payload = childPayloads.find(p => isDialecticCombinationJobPayload(p) && p.inputs?.source_group_id === 'thesis-1');
    assertExists(job1Payload, "Payload for group 'thesis-1' should exist");
    assert(isDialecticCombinationJobPayload(job1Payload));
    assertEquals(job1Payload.job_type, 'combine');
    assertEquals(job1Payload.prompt_template_name, 'synthesis_step2_combine');
    assertEquals(job1Payload.isIntermediate, true, "Job for group 1 should be intermediate");
    const job1Inputs = job1Payload.inputs?.document_ids;
    assertEquals(job1Inputs?.length, 3);
    assertExists(job1Inputs?.find((id: string) => id === 'chunk-1a'));
    assertExists(job1Inputs?.find((id: string) => id === 'chunk-1b'));
    assertExists(job1Inputs?.find((id: string) => id === 'chunk-1c'));

    // Check Group 2 job
    const job2Payload = childPayloads.find(p => isDialecticCombinationJobPayload(p) && p.inputs?.source_group_id === 'thesis-2');
    assertExists(job2Payload, "Payload for group 'thesis-2' should exist");
    assert(isDialecticCombinationJobPayload(job2Payload));
    const job2Inputs = job2Payload.inputs?.document_ids;
    assertEquals(job2Inputs?.length, 2);
    assertEquals(job2Payload.isIntermediate, true, "Job for group 2 should be intermediate");
    assertExists(job2Inputs?.find((id: string) => id === 'chunk-2a'));
    assertExists(job2Inputs?.find((id: string) => id === 'chunk-2b'));

    // Check Group 3 job
    const job3Payload = childPayloads.find(p => isDialecticCombinationJobPayload(p) && p.inputs?.source_group_id === 'thesis-3');
    assertExists(job3Payload, "Payload for group 'thesis-3' should exist");
    assert(isDialecticCombinationJobPayload(job3Payload));
    const job3Inputs = job3Payload.inputs?.document_ids;
    assertEquals(job3Inputs?.length, 1);
    assertEquals(job3Payload.isIntermediate, true, "Job for group 3 should be intermediate");
    assertExists(job3Inputs?.find((id: string) => id === 'chunk-3a'));
});

Deno.test('planPerSourceGroup should return an empty array if no documents have a source id', () => {
    const noSourceIds = MOCK_SOURCE_DOCS.map(d => ({ ...d, document_relationships: null }));
    const childPayloads = planPerSourceGroup(noSourceIds, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childPayloads.length, 0);
});

Deno.test('planPerSourceGroup should return an empty array for empty source documents', () => {
    const childPayloads = planPerSourceGroup([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP);
    assertEquals(childPayloads.length, 0);
});

Deno.test('planPerSourceGroup should create a single job when all documents belong to one group', () => {
    const singleGroupDocs = [
        { id: 'chunk-1a', target_contribution_id: 'thesis-1' },
        { id: 'chunk-1b', target_contribution_id: 'thesis-1' },
    ].map(d => ({ 
        ...d, 
        content: '', 
        contribution_type: 'pairwise_synthesis_chunk', 
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
        document_relationships: { source_group: d.target_contribution_id! },
    }));

    const childPayloads = planPerSourceGroup(singleGroupDocs, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childPayloads.length, 1, "Should create exactly one child job");
    const payload = childPayloads[0];
    assert(isDialecticCombinationJobPayload(payload));
    assertEquals(payload.inputs?.source_group_id, 'thesis-1');
    const jobInputs = payload.inputs?.document_ids;
    assertEquals(jobInputs?.length, 2);
    assertExists(jobInputs?.find((id: string) => id === 'chunk-1a'));
    assertExists(jobInputs?.find((id: string) => id === 'chunk-1b'));
});

Deno.test('planPerSourceGroup should create one job per document when each is in a unique group', () => {
    const uniqueGroupDocs = [
        { id: 'chunk-1', target_contribution_id: 'thesis-1' },
        { id: 'chunk-2', target_contribution_id: 'thesis-2' },
    ].map(d => ({ 
        ...d, 
        content: '', 
        contribution_type: 'pairwise_synthesis_chunk', 
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
        document_relationships: { source_group: d.target_contribution_id! },
    }));

    const childPayloads = planPerSourceGroup(uniqueGroupDocs, MOCK_PARENT_JOB, MOCK_RECIPE_STEP);

    assertEquals(childPayloads.length, 2, "Should create a job for each unique group");

    const job1Payload = childPayloads.find(p => isDialecticCombinationJobPayload(p) && p.inputs?.source_group_id === 'thesis-1');
    assertExists(job1Payload);
    assert(isDialecticCombinationJobPayload(job1Payload));
    assertEquals(job1Payload.inputs?.document_ids?.length, 1);
    assertEquals(job1Payload.inputs?.document_ids?.[0], 'chunk-1');

    const job2Payload = childPayloads.find(p => isDialecticCombinationJobPayload(p) && p.inputs?.source_group_id === 'thesis-2');
    assertExists(job2Payload);
    assert(isDialecticCombinationJobPayload(job2Payload));
    assertEquals(job2Payload.inputs?.document_ids?.length, 1);
    assertEquals(job2Payload.inputs?.document_ids?.[0], 'chunk-2');
}); 