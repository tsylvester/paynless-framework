import { continueJob, type IContinueJobDeps } from './continueJob.ts';
import { assert, assertEquals, assertExists, assertObjectMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import type { Database } from '../types_db.ts';
import {
  type GenerateContributionsPayload,
  type UnifiedAIResponse,
  type DialecticContributionRow,
} from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload, isRecord } from '../_shared/utils/type_guards.ts';

type JobInsert = Database['public']['Tables']['dialectic_generation_jobs']['Insert'];

function isJobInsert(record: unknown): record is JobInsert {
    if (!isRecord(record)) return false;
    return 'session_id' in record && typeof record.session_id === 'string' &&
           'user_id' in record && typeof record.user_id === 'string' &&
           'status' in record && record.status === 'pending';
}

Deno.test('continueJob', async (t) => {
    
    let mockSupabase: MockSupabaseClientSetup;
    let mockLogger: MockLogger;
    let deps: IContinueJobDeps;

    const baseJob: Database['public']['Tables']['dialectic_generation_jobs']['Row'] = { 
        id: 'job-1',
        max_retries: 3,
        session_id: 'session-1',
        user_id: 'user-1',
        stage_slug: 'test-stage',
        iteration_number: 1,
        payload: {},
        status: 'processing',
        attempt_count: 0,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
    };

    const basePayload: GenerateContributionsPayload = { 
        sessionId: 'session-1',
        projectId: 'project-1',
        selectedModelIds: ['model-1'],
        stageSlug: 'test-stage',
        iterationNumber: 1,
        continueUntilComplete: true, 
        continuation_count: 0,
        chatId: 'chat-1',
        walletId: 'wallet-1',
        maxRetries: 5,
    };

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'stop', content: 'final part' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "tool_calls"', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'tool_calls', content: 'response with tools' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "content_filter"', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'content_filter', content: 'filtered response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "function_call"', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'function_call', content: 'function call response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "error"', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'error', content: 'error response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is "unknown"', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'unknown', content: 'unknown response' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is null', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: null, content: 'null finish reason' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('FINISH_REASON: should not enqueue when finish_reason is undefined', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { content: undefined } as unknown as UnifiedAIResponse;
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    // =================================================================
    // GROUP 2: Continue Until Complete Flag Variations
    // =================================================================
    
    await t.step('CONTINUE_FLAG: should not enqueue when continueUntilComplete is false', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: false, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('CONTINUE_FLAG: should not enqueue when continueUntilComplete is undefined', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 0 };
        delete payload.continueUntilComplete;
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 1 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 2' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 4 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 5' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 5 (at max)', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 5 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 6' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 6 (over max)', async () => {
        setup();
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 6 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 7' };
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true };
        delete payload.continuation_count;
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        assertEquals(newJobData.payload.continuation_count, 1);
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
        const payload: GenerateContributionsPayload = { 
            ...basePayload, 
            continueUntilComplete: true, 
            continuation_count: 0,
            chatId: 'chat-123',
            walletId: 'wallet-456',
            maxRetries: 7
        };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        assertEquals(newJobData.payload.chatId, 'chat-123');
        assertEquals(newJobData.payload.walletId, 'wallet-456');
        assertEquals(newJobData.payload.maxRetries, 7);
    });

    await t.step('PAYLOAD_FIELDS: should handle payload with no optional fields', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: GenerateContributionsPayload = { 
            sessionId: 'session-1',
            projectId: 'project-1',
            selectedModelIds: ['model-1'],
            stageSlug: 'test-stage',
            iterationNumber: 1,
            continueUntilComplete: true, 
            continuation_count: 0
        };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        assertEquals('chatId' in newJobData.payload, false);
        assertEquals('walletId' in newJobData.payload, false);
        assertEquals('maxRetries' in newJobData.payload, false);
    });

    await t.step('PAYLOAD_FIELDS: should handle payload with only chatId present', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: GenerateContributionsPayload = { 
            sessionId: 'session-1',
            projectId: 'project-1',
            selectedModelIds: ['model-1'],
            stageSlug: 'test-stage',
            iterationNumber: 1,
            continueUntilComplete: true, 
            continuation_count: 0,
            chatId: 'only-chat-id'
        };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        assertEquals(newJobData.payload.chatId, 'only-chat-id');
        assertEquals('walletId' in newJobData.payload, false);
        assertEquals('maxRetries' in newJobData.payload, false);
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
        const jobWithParent = { ...baseJob, parent_job_id: 'parent-job-123' };
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, jobWithParent, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        
        assertEquals(newJobData.parent_job_id, null);
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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');
        
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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');
        
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
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        const newPayload = newJobData.payload;
        
        assertEquals(newPayload.target_contribution_id, 'contrib-1');
        assertEquals(newPayload.continuation_count, 1);
        assertEquals(newPayload.sessionId, payload.sessionId);
        assertEquals(newPayload.projectId, payload.projectId);
        assertEquals(newPayload.selectedModelIds, payload.selectedModelIds);
        assertEquals(newPayload.stageSlug, payload.stageSlug);
        assertEquals(newPayload.iterationNumber, payload.iterationNumber);
        assertEquals(newPayload.continueUntilComplete, payload.continueUntilComplete);
        
        assertObjectMatch(newJobData, {
            max_retries: 3,
            user_id: 'user-1',
            session_id: 'session-1',
            stage_slug: 'test-stage',
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0
        });
    });

    await t.step('PAYLOAD_CONSTRUCTION: should increment continuation_count from existing value', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 3 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 4' };

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));
        
        assertEquals(newJobData.payload.continuation_count, 4);
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
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        const continuationLogCall = infoSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Continuation required for job') && 
            call.args[0].includes(baseJob.id)
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
        const payload: GenerateContributionsPayload = { ...basePayload, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'length', content: 'part 1' };

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

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
        const payload: GenerateContributionsPayload = { ...basePayload, continueUntilComplete: true, continuation_count: 0 };
        const aiResponse: UnifiedAIResponse = { finish_reason: 'stop', content: 'final part' };
        
        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, payload, aiResponse, baseSavedContribution, 'user-1');

        const continuationLogCalls = [...infoSpy.calls, ...errorSpy.calls].filter(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            (call.args[0].includes('Continuation') || call.args[0].includes('continuation'))
        );
        assertEquals(continuationLogCalls.length, 0, 'Should not log anything about continuation when not needed');
    });
});
