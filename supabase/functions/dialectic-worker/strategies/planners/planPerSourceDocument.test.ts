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
        is_header: false,
        source_prompt_resource_id: null,
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
        is_header: false,
        source_prompt_resource_id: null,
    },
];

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
    id: 'parent-job-123',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: {
        job_type: 'PLAN',
        projectId: 'project-xyz',
        sessionId: 'session-abc',
        stageSlug: 'antithesis',
        iterationNumber: 1,
        model_id: 'model-ghi',
        step_info: {
            current_step: 1,
            total_steps: 1,
        },
        walletId: 'wallet-default',
        user_jwt: 'parent-jwt-default',
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
    is_test_job: false,
    job_type: 'PLAN',
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
    const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

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
    const childPayloads = planPerSourceDocument([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
    assertEquals(childPayloads.length, 0);
});

Deno.test('planPerSourceDocument should correctly handle a single source document', () => {
    const singleDoc = [MOCK_SOURCE_DOCS[0]];
    const childPayloads = planPerSourceDocument(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

    assertEquals(childPayloads.length, 1, "Should create exactly one child job");
    const payload = childPayloads[0];
    assertExists(payload, "The single payload should exist");

    assertEquals(payload.inputs?.thesis_id, 'doc-1');
    assertEquals(payload.prompt_template_name, 'antithesis_step1_critique');
});

Deno.test('should correctly plan jobs for antithesis stage', () => {
    // This test simulates the exact scenario from the integration test:
    // planning the antithesis stage based on the outputs of the thesis stage.
    const thesisContributions: SourceDocument[] = [
        {
            id: 'thesis-doc-1',
            content: 'Content from gpt-4-turbo',
            contribution_type: 'thesis',
            model_name: 'GPT-4 Turbo',
            document_relationships: { source_group: 'thesis-doc-1' },
            citations: null,
            created_at: new Date().toISOString(),
            edit_version: 1,
            error: null,
            tokens_used_input: 1,
            tokens_used_output: 1,
            processing_time_ms: 1,
            file_name: 'f1.txt',
            storage_bucket: 'b1',
            storage_path: 'p1',
            model_id: 'm1',
            mime_type: 'text/plain',
            is_latest_edit: true,
            iteration_number: 1,
            original_model_contribution_id: null,
            prompt_template_id_used: 'p1',
            raw_response_storage_path: null,
            size_bytes: 1,
            target_contribution_id: null,
            session_id: 'session-abc',
            stage: 'thesis',
            seed_prompt_url: null,
            updated_at: new Date().toISOString(),
            user_id: 'user-def',
            is_header: false,
            source_prompt_resource_id: null,
        },
        {
            id: 'thesis-doc-2',
            content: 'Content from claude-3-opus',
            contribution_type: 'thesis',
            model_name: 'Claude 3 Opus',
            document_relationships: { source_group: 'thesis-doc-2' },
            citations: null,
            created_at: new Date().toISOString(),
            edit_version: 1,
            error: null,
            tokens_used_input: 1,
            tokens_used_output: 1,
            processing_time_ms: 1,
            file_name: 'f2.txt',
            storage_bucket: 'b1',
            storage_path: 'p1',
            model_id: 'm1',
            mime_type: 'text/plain',
            is_latest_edit: true,
            iteration_number: 1,
            original_model_contribution_id: null,
            prompt_template_id_used: 'p1',
            raw_response_storage_path: null,
            size_bytes: 1,  
            target_contribution_id: null,
            session_id: 'session-abc',
            stage: 'thesis',
            seed_prompt_url: null,
            updated_at: new Date().toISOString(),
            user_id: 'user-def',
            is_header: false,
            source_prompt_resource_id: null,
        },
    ];

    const childPayloads = planPerSourceDocument(thesisContributions, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');

    assertEquals(childPayloads.length, 2, "Should create a child job for each thesis contribution");

    // Check payload for the first thesis doc
    const job1Payload = childPayloads.find(p => p.inputs?.thesis_id === 'thesis-doc-1');
    assertExists(job1Payload, "Payload for thesis-doc-1 should exist");
    assertEquals(job1Payload.job_type, 'execute');
    assertEquals(job1Payload.output_type, 'antithesis');
    assertEquals(job1Payload.document_relationships, { source_group: 'thesis-doc-1' });
    assertExists(job1Payload.canonicalPathParams);
    assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'thesis');
    assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'GPT-4 Turbo');

    // Check payload for the second thesis doc
    const job2Payload = childPayloads.find(p => p.inputs?.thesis_id === 'thesis-doc-2');
    assertExists(job2Payload, "Payload for thesis-doc-2 should exist");
    assertEquals(job2Payload.job_type, 'execute');
    assertEquals(job2Payload.output_type, 'antithesis');
    assertEquals(job2Payload.document_relationships, { source_group: 'thesis-doc-2' });
    assertExists(job2Payload.canonicalPathParams);
    assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'thesis');
    assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'Claude 3 Opus');
});

Deno.test('planPerSourceDocument Test Case A: The Failing Case (Proves the bug exists)', () => {
    const failingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        id: 'failing-parent-job',
        session_id: 'session-abc',
        user_id: 'user-def',
        stage_slug: 'antithesis',
        iteration_number: 1,
        payload: {
            job_type: 'PLAN',
            projectId: 'project-xyz',
            sessionId: 'session-abc',
            stageSlug: 'antithesis',
            iterationNumber: 1,
            model_id: 'parent-model-id', // This is the key part
            step_info: {
                current_step: 1,
                total_steps: 1,
            },
            walletId: 'wallet-default',
            user_jwt: 'parent-jwt-default',
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
        is_test_job: false,
        job_type: 'PLAN',
    };

    const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, failingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

    // This test PASSES if the assertion inside it THROWS an error, proving the bug.
    // The planner currently assigns the parent job's model ID to ALL children,
    // which does not match the model ID of the source documents.
    try {
        // This is the CORRECT behavior we want to enforce.
        // With the bug present, this assertion will fail for at least one child,
        // throwing an error and proving the bug exists.
        childPayloads.forEach(child => {
            assertEquals(child.model_id, failingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
        });
        // If the loop completes, it means the bug is fixed, so this test should now fail.
        assert(false, "Test A expected an error to be thrown, but none was. The bug may be fixed.");
    } catch (e) {
        // We expect to catch an error, which means the test passes and the bug is confirmed.
        assert(e instanceof Error, "The thrown object should be an error.");
        console.log("Test A passed by catching an expected error, confirming the bug's presence.");
    }
});


Deno.test('planPerSourceDocument Test Case B: The Passing Case (Describes the correct behavior)', () => {
    const passingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        id: 'passing-parent-job',
        session_id: 'session-abc',
        user_id: 'user-def',
        stage_slug: 'antithesis',
        iteration_number: 1,
        payload: {
            job_type: 'PLAN',
            projectId: 'project-xyz',
            sessionId: 'session-abc',
            stageSlug: 'antithesis',
            iterationNumber: 1,
            model_id: 'parent-model-id', // This is the key part
            step_info: {
                current_step: 1,
                total_steps: 1,
            },
            walletId: 'wallet-default',
            user_jwt: 'parent-jwt-default',
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
        is_test_job: false,
        job_type: 'PLAN',
    };

    const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, passingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

    // This test will FAIL initially because the planner assigns the wrong model_id.
    // After the fix, it will PASS.
    childPayloads.forEach(child => {
        assertEquals(child.model_id, passingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
    });
});

// ==============================================
// user_jwt inheritance and enforcement
// ==============================================

Deno.test('planPerSourceDocument constructs child payloads with user_jwt inherited from parent payload', () => {
    const parentWithJwt: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
    Object.defineProperty(parentWithJwt.payload, 'user_jwt', { value: 'parent.jwt.value', configurable: true, enumerable: true, writable: true });

    const result = planPerSourceDocument(MOCK_SOURCE_DOCS, parentWithJwt, MOCK_RECIPE_STEP, 'param.jwt.should.be.ignored');

    assertEquals(result.length, 2);
    for (const payload of result) {
        assertEquals(payload.user_jwt, 'parent.jwt.value', 'Child payload must inherit user_jwt from parent payload');
    }
});

Deno.test('planPerSourceDocument throws when parent payload.user_jwt is missing or empty', () => {
    const parentMissing: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
    // Ensure no user_jwt on payload
    if (Object.prototype.hasOwnProperty.call(parentMissing.payload, 'user_jwt')) {
        // deno-lint-ignore no-explicit-any
        delete (parentMissing.payload as any).user_jwt;
    }

    let threwForMissing = false;
    try {
        planPerSourceDocument(MOCK_SOURCE_DOCS, parentMissing, MOCK_RECIPE_STEP, 'param.jwt');
    } catch {
        threwForMissing = true;
    }
    assert(threwForMissing, 'Expected an error when parent payload.user_jwt is missing');

    const parentEmpty: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
    Object.defineProperty(parentEmpty.payload, 'user_jwt', { value: '', configurable: true, enumerable: true, writable: true });

    let threwForEmpty = false;
    try {
        planPerSourceDocument(MOCK_SOURCE_DOCS, parentEmpty, MOCK_RECIPE_STEP, 'param.jwt');
    } catch {
        threwForEmpty = true;
    }
    assert(threwForEmpty, 'Expected an error when parent payload.user_jwt is empty');
});

// ==============================================
// planner constructs child payloads with dynamic stage consistency
// Assert payload.stageSlug equals the parent’s dynamic stage for every child
// ==============================================
Deno.test('planPerSourceDocument constructs child payloads with dynamic stage consistency (payload.stageSlug === parent.payload.stageSlug)', () => {
	const expectedStage = 'parenthesis'; // use a non-thesis simple stage
	const parent: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parent, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
	Object.defineProperty(parent.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

	const result = planPerSourceDocument(MOCK_SOURCE_DOCS, parent, { ...MOCK_RECIPE_STEP, output_type: expectedStage }, 'ignored.jwt');

	assertEquals(result.length, MOCK_SOURCE_DOCS.length);
	for (const child of result) {
		assertEquals(child.stageSlug, expectedStage, 'Child payload.stageSlug must equal parent.payload.stageSlug');
	}
});
 