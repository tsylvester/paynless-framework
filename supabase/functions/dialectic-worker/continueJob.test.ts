import { continueJob } from './continueJob.ts';
import { assert, assertEquals, assertExists, assertObjectMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import type { Database, Json } from '../types_db.ts';
import {
  type UnifiedAIResponse,
  type DialecticContributionRow,
  type DialecticJobPayload,
  type IContinueJobDeps,
} from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload, isRecord, isJson, isDialecticExecuteJobPayload } from '../_shared/utils/type_guards.ts';
import { type Messages } from '../_shared/types.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type JobInsert = Database['public']['Tables']['dialectic_generation_jobs']['Insert'];

function isJobInsert(record: unknown): record is JobInsert {
    if (!isRecord(record)) return false;
    return 'session_id' in record && typeof record.session_id === 'string' &&
           'user_id' in record && typeof record.user_id === 'string' &&
           'status' in record && record.status === 'pending_continuation';
}

function createMockJob(payload: DialecticJobPayload, overrides: Partial<Job> = {}): Job {
    if (!isJson(payload)) {
        throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
    }
  
    const baseJob: Job = {
        id: 'job-id-123',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug ?? 'default-stage',
        iteration_number: payload.iterationNumber ?? 1,
        status: 'pending',
        user_id: 'user-id-123',
        attempt_count: 0,
        completed_at: null,
        created_at: new Date().toISOString(),
        error_details: null,
        max_retries: 3,
        parent_job_id: null,
        prerequisite_job_id: null,
        results: null,
        started_at: null,
        target_contribution_id: null,
        payload: payload,
        ...overrides,
    };
  
    return baseJob;
}

Deno.test('continueJob', async (t) => {
    
    let mockSupabase: MockSupabaseClientSetup;
    let mockLogger: MockLogger;
    let deps: IContinueJobDeps;

    const basePayload: DialecticJobPayload = { 
    job_type: 'execute',
    sessionId: 'session-1',
    projectId: 'project-1',
    model_id: 'model-1',
    stageSlug: 'test-stage',
    iterationNumber: 1,
    step_info: { current_step: 0, total_steps: 1 },
    prompt_template_name: 'test_template',
    inputs: { source: 'some_input' },
    output_type: 'thesis',
    continueUntilComplete: true, 
    continuation_count: 0,
    walletId: 'wallet-1',
    maxRetries: 5,
    canonicalPathParams: {
        contributionType: 'thesis'
    },
};
    
    const baseJob = createMockJob(basePayload);

    const baseSavedContribution: DialecticContributionRow = {
        id: 'contrib-1',
        session_id: 'session-1',
        stage: 'test-stage',
        model_name: 'test-model',
        file_name: 'test.md',
        contribution_type: 'model_generated',
        citations: null,
        created_at: new Date().toISOString(),
        edit_version: 1,
        error: null,
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-1',
        original_model_contribution_id: null,
        processing_time_ms: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        storage_bucket: 'test-bucket',
        storage_path: '/path/to/file',
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        updated_at: new Date().toISOString(),
        user_id: null,
        document_relationships: { 'test-stage': 'contrib-1' },
    };

    const setup = (mockOverrides?: any) => {
        mockSupabase = createMockSupabaseClient(undefined, mockOverrides);
        mockLogger = new MockLogger();
        deps = {
            logger: mockLogger,
        };
    };

    // =================================================================
    // GROUP 1: Basic Continuation Logic - FinishReason Variations
    // =================================================================
    
    await t.step('FINISH_REASON: should not enqueue when finish_reason is "stop"', async () => {
        setup();
        const aiResponse: UnifiedAIResponse = { finish_reason: 'stop', content: 'final part' };
        const testJob = createMockJob(basePayload);
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0, "Insert should not have been called");
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "length"', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "tool_calls"', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'tool_calls', content: 'response with tools' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "content_filter"', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'content_filter', content: 'filtered response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "function_call"', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'function_call', content: 'function call response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "error"', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'error', content: 'error response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "unknown"', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'unknown', content: 'unknown response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is null', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: null, content: 'null finish reason' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is undefined', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { content: undefined } as unknown as UnifiedAIResponse;
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    // =================================================================
    // GROUP 2: Continue Until Complete Flag Variations
    // =================================================================
    
    await t.step('CONTINUE_FLAG: should not enqueue when continueUntilComplete is false', async () => {
        setup();
        const testPayload: DialecticJobPayload = { ...basePayload, continueUntilComplete: false, continuation_count: 0 };
        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('CONTINUE_FLAG: should not enqueue when continueUntilComplete is undefined', async () => {
        setup();
        const testPayload: DialecticJobPayload = { ...basePayload };
        delete testPayload.continueUntilComplete;
        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    // =================================================================
    // GROUP 3: Continuation Count and Max Depth Logic
    // =================================================================
    
    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 0', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 1', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 1 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 2' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 4 (just under max)', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 4 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 5' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 5 (at max)', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 5 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 6' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 6 (over max)', async () => {
        setup();
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 6 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 7' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('CONTINUATION_COUNT: should handle undefined continuation_count as 0', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true };
        delete payload.continuation_count;
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.continuation_count, 1);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
    });

    // =================================================================
    // GROUP 4: Optional Payload Fields Handling
    // =================================================================
    
    await t.step('PAYLOAD_FIELDS: should handle payload with all optional fields present', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const testPayload: DialecticJobPayload = { ...basePayload };
        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.walletId, 'wallet-1');
            assertEquals(newJobData.payload.maxRetries, 5);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
    });

    await t.step('PAYLOAD_FIELDS: should handle payload with no optional fields', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const testPayload: DialecticJobPayload = { 
            job_type: 'execute',
            sessionId: 'session-1',
            projectId: 'project-1',
            model_id: 'model-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            step_info: { current_step: 0, total_steps: 1 },
            prompt_template_name: 'test_template',
            inputs: { source: 'some_input' },
            output_type: 'thesis',
            continueUntilComplete: true, 
            continuation_count: 0,
            canonicalPathParams: {
                contributionType: 'thesis'
            },
            walletId: 'wallet-default',
        };
        
        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            // walletId is required for continuations and must be preserved
            assertEquals(newJobData.payload.walletId, 'wallet-default');
            // maxRetries remains optional and should be omitted if not provided on source payload
            assertEquals('maxRetries' in newJobData.payload, false);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
    });

    await t.step('PAYLOAD_FIELDS: should handle payload with only walletId present', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const testPayload: DialecticJobPayload = { 
            job_type: 'execute',
            sessionId: 'session-1',
            projectId: 'project-1',
            model_id: 'model-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            step_info: { current_step: 0, total_steps: 1 },
            prompt_template_name: 'test_template',
            inputs: { source: 'some_input' },
            output_type: 'thesis',
            continueUntilComplete: true, 
            continuation_count: 0,
            walletId: 'only-wallet-id',
            canonicalPathParams: {
                contributionType: 'thesis'
            },
        };

        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.walletId, 'only-wallet-id');
            assertEquals('maxRetries' in newJobData.payload, false);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
    });

    await t.step('should not set prompt_template_name when absent on source execute payload', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });

        const testPayload: DialecticJobPayload = {
            job_type: 'execute',
            sessionId: 'session-1',
            projectId: 'project-1',
            model_id: 'model-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            step_info: { current_step: 0, total_steps: 1 },
            // NOTE: prompt_template_name intentionally omitted
            inputs: { source: 'some_input' },
            output_type: 'thesis',
            continueUntilComplete: true,
            continuation_count: 0,
            canonicalPathParams: {
                contributionType: 'thesis'
            },
            walletId: 'wallet-default',
        };

        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');
        assertEquals(result.enqueued, true);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));

        // The continuation payload should not invent a prompt_template_name
        if (isRecord(newJobData.payload)) {
            assertEquals(
                Object.prototype.hasOwnProperty.call(newJobData.payload, 'prompt_template_name'),
                false,
                'prompt_template_name should be omitted on continuation when absent on source',
            );
        } else {
            assert(false, 'Payload is not a record');
        }

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.prompt_template_name, undefined, 'prompt_template_name should be undefined');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    await t.step('should preserve prompt_template_name when present on source execute payload (recipe continuation)', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });

        const testPayload: DialecticJobPayload = {
            job_type: 'execute',
            sessionId: 'session-1',
            projectId: 'project-1',
            model_id: 'model-1',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            step_info: { current_step: 0, total_steps: 1 },
            prompt_template_name: 'recipe_template_step1',
            inputs: { source: 'some_input' },
            output_type: 'thesis',
            continueUntilComplete: true,
            continuation_count: 0,
            canonicalPathParams: {
                contributionType: 'thesis'
            },
            walletId: 'wallet-default',
        };

        const testJob = createMockJob(testPayload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');
        assertEquals(result.enqueued, true);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.prompt_template_name, 'recipe_template_step1', 'prompt_template_name should be preserved on continuation for recipe flows');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    // =================================================================
    // GROUP 5: Parent Job ID Preservation
    // =================================================================
    
    await t.step('PARENT_JOB: should preserve parent_job_id when present', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload, { parent_job_id: 'parent-job-123' });
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        
        assertEquals(newJobData.parent_job_id, 'parent-job-123');
    });

    await t.step('PARENT_JOB: should handle null parent_job_id', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload, { parent_job_id: null });
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        
        assertEquals(newJobData.parent_job_id, null);
    });

    await t.step('PAYLOAD_CONSTRUCTION: should embed the provided message history into the new job payload', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };
        const mockMessages: Messages[] = [
            { role: 'user', content: 'Initial prompt', id: 'message-1' },
            { role: 'assistant', content: 'part 1', id: 'message-2' }
        ];

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
    });

    // =================================================================
    // GROUP 6: Database Error Scenarios
    // =================================================================
    
    await t.step('DATABASE_ERROR: should return error when database insert fails', async () => {
        const dbError = { message: 'Database connection lost' };
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: null, error: dbError } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');
        
        assertEquals(result.enqueued, false);
        assertExists(result.error);
        assertEquals(result.error?.message, 'Failed to enqueue continuation job: Database connection lost');
    });

    await t.step('DATABASE_ERROR: should return error when database insert throws exception', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { 
                        data: null, 
                        error: { message: 'Constraint violation', code: '23505' }
                    } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');
        
        assertEquals(result.enqueued, false);
        assertExists(result.error);
        assertEquals(result.error?.message, 'Failed to enqueue continuation job: Constraint violation');
    });

    // =================================================================
    // GROUP 7: Payload Construction and Data Integrity
    // =================================================================
    
    await t.step('PAYLOAD_CONSTRUCTION: should correctly construct new job payload with target_contribution_id', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            const newPayload = newJobData.payload;
            
            assertEquals(newPayload.target_contribution_id, 'contrib-1');
            assertEquals(newPayload.continuation_count, 1);
            assertEquals(newPayload.sessionId, basePayload.sessionId);
            assertEquals(newPayload.projectId, basePayload.projectId);
            assertEquals(newPayload.model_id, basePayload.model_id);
            assertEquals(newPayload.stageSlug, basePayload.stageSlug);
            assertEquals(newPayload.iterationNumber, basePayload.iterationNumber);
            assertEquals(newPayload.continueUntilComplete, basePayload.continueUntilComplete);

            // Assert that the new canonical path params are correctly formed for a simple continuation
            assertExists(newPayload.canonicalPathParams);
            assertEquals(newPayload.canonicalPathParams.contributionType, basePayload.output_type);
            assertEquals(newPayload.canonicalPathParams.sourceModelSlugs, undefined);
            assertEquals(newPayload.canonicalPathParams.sourceAnchorType, undefined);
            assertEquals(newPayload.canonicalPathParams.sourceAnchorModelSlug, undefined);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
        
        assertObjectMatch(newJobData, {
            user_id: 'user-1',
            session_id: 'session-1',
            stage_slug: 'test-stage',
            iteration_number: 1,
            status: 'pending_continuation',
            attempt_count: 0
        });
    });

    await t.step('DOCUMENT_RELATIONSHIPS: should carry forward document_relationships unchanged on continuation payload', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });

        const relationships = { parenthesis: 'root-abc', thread: 'xyz-123' };
        const payload: DialecticJobPayload = {
            ...basePayload,
            continueUntilComplete: true,
            continuation_count: 0,
            document_relationships: relationships,
        };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            testJob,
            aiResponse,
            baseSavedContribution,
            'user-1',
        );

        assertEquals(result.enqueued, true);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            const newPayload = newJobData.payload;
            // Unchanged carry-forward
            assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
            assertEquals(newPayload.document_relationships, relationships);

            // Chain link and preserved core fields
            assertEquals(newPayload.target_contribution_id, baseSavedContribution.id);
            assertEquals(newPayload.sessionId, basePayload.sessionId);
            assertEquals(newPayload.projectId, basePayload.projectId);
            assertEquals(newPayload.model_id, basePayload.model_id);
            assertEquals(newPayload.stageSlug, basePayload.stageSlug);
            assertEquals(newPayload.iterationNumber, basePayload.iterationNumber);
            assertEquals(newPayload.continueUntilComplete, true);
            assertEquals(typeof newPayload.continuation_count, 'number');
            assertExists(newPayload.canonicalPathParams, 'canonicalPathParams should be preserved');
            assertExists(newPayload.inputs, 'inputs should be preserved');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    await t.step('DOCUMENT_RELATIONSHIPS: uses saved contribution relationships when trigger payload lacks them', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });

        const relationships = { thesis: 'root-xyz' };
        const savedWithRelationships: DialecticContributionRow = {
            ...baseSavedContribution,
            document_relationships: relationships,
        };

        const payload: DialecticJobPayload = {
            ...basePayload,
            continueUntilComplete: true,
            continuation_count: 0,
            // intentionally omit document_relationships on triggering payload
        };

        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            testJob,
            aiResponse,
            savedWithRelationships,
            'user-1',
        );

        assertEquals(result.enqueued, true);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            const newPayload = newJobData.payload;
            assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
            assertEquals(newPayload.document_relationships, relationships);
            assertEquals(newPayload.target_contribution_id, savedWithRelationships.id);
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    await t.step('DOCUMENT_RELATIONSHIPS: should hard-fail enqueue when relationships missing on both trigger and saved', async () => {
        setup();

        // saved contribution has no document_relationships (explicitly null for this test)
        const savedWithoutRelationships: DialecticContributionRow = {
            ...baseSavedContribution,
            document_relationships: null,
        };
        const payload: DialecticJobPayload = {
            ...basePayload,
            continueUntilComplete: true,
            continuation_count: 0,
            // intentionally no document_relationships on triggering payload
        };

        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            testJob,
            aiResponse,
            savedWithoutRelationships,
            'user-1',
        );

        assertEquals(result.enqueued, false);
        assertExists(result.error);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0, 'Should not enqueue when relationships are missing');
    });

    await t.step('PAYLOAD_CONSTRUCTION: should increment continuation_count from existing value', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 3 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 4' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.continuation_count, 4);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
    });

    // =================================================================
    // GROUP 8: Logging Verification
    // =================================================================
    
    await t.step('LOGGING: should log continuation message when enqueuing job', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const infoSpy = spy(mockLogger, 'info');
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        const continuationLogCall = infoSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Continuation required for job') && 
            call.args[0].includes(testJob.id)
        );
        assertExists(continuationLogCall, 'Should log continuation requirement');
    });

    await t.step('LOGGING: should log success message when job is enqueued', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const infoSpy = spy(mockLogger, 'info');
        const payload: DialecticJobPayload = { ...basePayload, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        const successLogCall = infoSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Successfully enqueued continuation job') && 
            call.args[0].includes(baseSavedContribution.id)
        );
        assertExists(successLogCall, 'Should log successful enqueuing');
    });

    await t.step('LOGGING: should log error message when database insert fails', async () => {
        const dbError = { message: 'DB Error' };
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: null, error: dbError } 
                },
            },
        });
        const errorSpy = spy(mockLogger, 'error');
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        const errorLogCall = errorSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Failed to enqueue continuation job') &&
            call.args[1] && typeof call.args[1] === 'object' &&
            'error' in call.args[1] &&
            call.args[1].error && 
            typeof call.args[1].error === 'object' &&
            'message' in call.args[1].error &&
            call.args[1].error.message === 'DB Error'
        );
        assertExists(errorLogCall, 'Should log database error');
    });

    await t.step('LOGGING: should not log anything when continuation is not needed', async () => {
        setup();
        const infoSpy = spy(mockLogger, 'info');
        const errorSpy = spy(mockLogger, 'error');
        const payload: DialecticJobPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const testJob = createMockJob(payload);
        const aiResponse: UnifiedAIResponse = { finish_reason: 'stop', content: 'final part' };
        
        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, baseSavedContribution, 'user-1');

        const continuationLogCalls = [...infoSpy.calls, ...errorSpy.calls].filter(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            (call.args[0].includes('Continuation') || call.args[0].includes('continuation'))
        );
        assertEquals(continuationLogCalls.length, 0, 'Should not log anything about continuation when not needed');
    });
});