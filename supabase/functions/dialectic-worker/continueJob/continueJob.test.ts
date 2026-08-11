import { continueJob } from '../continueJob/continueJob.ts';
import { assert, assertEquals, assertExists, assertObjectMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { type PostgrestError, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from '../../_shared/supabase.mock.ts';
import type { Database, Json } from '../../types_db.ts';
import {
  type UnifiedAIResponse,
  type DialecticContributionRow,
  type DialecticJobPayload,
  type IContinueJobDeps,
  type DialecticExecuteJobPayload,
  type DialecticJobRow,
} from '../../dialectic-service/dialectic.interface.ts';
import { 
    isDialecticJobPayload, 
    isJobInsert,
    isRecord, 
    isJson, 
    isDialecticExecuteJobPayload, 
    isDialecticJobRow 
} from '../../_shared/utils/type_guards.ts';
import { type Messages } from '../../_shared/types.ts';
import { DialecticStageSlug, FileType } from '../../_shared/types/file_manager.types.ts';
import { isDialecticStageSlug } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import {
  buildDialecticContributionRow,
  buildDialecticExecuteJobPayload,
  buildDialecticProjectResourceRow,
  buildDialecticJobRow,
  buildDocumentRelationships,
  buildMessages,
  buildUnifiedAIResponse,
  invalidateDialecticExecuteJobPayload,
} from '../../_shared/dialectic.mock.ts';
import {
  buildDialecticCompressJobPayload,
  isDialecticCompressJobPayload,
} from '../enqueueCompressJobs/enqueueCompressJobs.provides.ts';

Deno.test('continueJob', async (t) => {
    // =================================================================
    // GROUP 1: Basic Continuation Logic - FinishReason Variations
    // =================================================================
    
    await t.step('CALLER_TRUST: should enqueue when finish_reason is "stop" (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1, "Insert should have been called");
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "length"', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'length' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "tool_calls" (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'tool_calls' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "content_filter" (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'content_filter' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "function_call" (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'function_call' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "error" (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'error' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "unknown"', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: 'unknown' });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is null (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse({ finish_reason: null });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is undefined (caller decided continuation)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const { finish_reason: _omit, ...aiResponseRest } = buildUnifiedAIResponse();
        const aiResponse: UnifiedAIResponse = aiResponseRest;
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    // =================================================================
    // GROUP 2: Continue Until Complete Flag Variations
    // =================================================================
    
    await t.step('CONTINUE_FLAG: enqueues when continueUntilComplete is false', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CONTINUE_FLAG: enqueues when continueUntilComplete is absent', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload();
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    // =================================================================
    // GROUP 3: Continuation Count and Max Depth Logic
    // =================================================================
    
    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 0', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 0 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 1', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 1 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 4 (just under max)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 4 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 5 (at max)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 5 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        assertEquals(result.reason, 'continuation_limit_reached');
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 0);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 6 (over max)', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 6 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, false);
        assertEquals(result.reason, 'continuation_limit_reached');
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 0);
    });

    await t.step('CONTINUATION_COUNT: should not include reason when continueUntilComplete is false', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        assert(!('reason' in result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CONTINUATION_COUNT: should handle undefined continuation_count as 0', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, walletId: 'wallet-1', maxRetries: 5 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ walletId: 'wallet-default', continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ walletId: 'only-wallet-id', continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');
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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, prompt_template_id: 'test_template', prompt_template_name: 'thesis_business_case' });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');
        assertEquals(result.enqueued, true);

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            assertEquals(newJobData.payload.prompt_template_id, 'test_template', 'prompt_template_id should be preserved on continuation for recipe flows');
            assertEquals(newJobData.payload.prompt_template_name, 'thesis_business_case', 'prompt_template_name should be preserved on continuation when present on source');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    // =================================================================
    // GROUP 5: Parent Job ID Preservation
    // =================================================================
    
    await t.step('PARENT_JOB: should preserve parent_job_id when present', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, parent_job_id: 'parent-job-123' });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        
        assertEquals(newJobData.parent_job_id, 'parent-job-123');
    });

    await t.step('PARENT_JOB: should handle null parent_job_id', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        
        assertEquals(newJobData.parent_job_id, null);
    });

    await t.step('PREREQ_JOB: should preserve prerequisite_job_id and set job_type to EXECUTE', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, prerequisite_job_id: 'pre-123' });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assertEquals(newJobData.prerequisite_job_id, 'pre-123');
        assertEquals(newJobData.job_type, 'EXECUTE');
    });

    await t.step('PAYLOAD_CONSTRUCTION: should embed the provided message history into the new job payload', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
    });

    // =================================================================
    // GROUP 6: Database Error Scenarios
    // =================================================================
    
    await t.step('DATABASE_ERROR: should return error when database insert fails', async () => {
        const dbError = new Error('Database connection lost');
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: null, error: dbError } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');
        
        assertEquals(result.enqueued, false);
        assertExists(result.error);
        assertEquals(result.error?.message, 'Failed to enqueue continuation job: Database connection lost');
    });

    await t.step('DATABASE_ERROR: should return error when database insert throws exception', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { 
                        data: null, 
                        error: new Error('Constraint violation')
                    } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');
        
        assertEquals(result.enqueued, false);
        assertExists(result.error);
        assertEquals(result.error?.message, 'Failed to enqueue continuation job: Constraint violation');
    });

    // =================================================================
    // GROUP 7: Payload Construction and Data Integrity
    // =================================================================
    
    await t.step('PAYLOAD_CONSTRUCTION: should correctly construct new job payload with target_contribution_id', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, session_id: 'session-1' });
        const savedContribution = buildDialecticContributionRow({ id: 'contrib-1', document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        assertEquals(result.enqueued, true);
        
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));


        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            const newPayload = newJobData.payload;
            
            assertEquals(newPayload.target_contribution_id, 'contrib-1');
            assertEquals(newPayload.continuation_count, 1);
            assertEquals(newPayload.sessionId, executePayload.sessionId);
            assertEquals(newPayload.projectId, executePayload.projectId);
            assertEquals(newPayload.model_id, executePayload.model_id);
            assertEquals(newPayload.stageSlug, executePayload.stageSlug);
            assertEquals(newPayload.iterationNumber, executePayload.iterationNumber);

            // Assert that the new canonical path params are correctly formed for a simple continuation
            assertExists(newPayload.canonicalPathParams);
            assertEquals(newPayload.canonicalPathParams.contributionType, executePayload.stageSlug);
            assertEquals(newPayload.canonicalPathParams.sourceModelSlugs, undefined);
            assertEquals(newPayload.canonicalPathParams.sourceAnchorType, undefined);
            assertEquals(newPayload.canonicalPathParams.sourceAnchorModelSlug, undefined);
        } else {
            assert(false, 'Payload is not a valid DialecticJobPayload');
        }
        
        assertObjectMatch(newJobData, {
            user_id: 'user-1',
            session_id: 'session-1',
            stage_slug: 'thesis',
            iteration_number: 1,
            status: 'pending_continuation',
            attempt_count: 0
        });
        // Router compatibility: DB row must declare EXECUTE job type
        assertEquals(newJobData.job_type, 'EXECUTE');
    });

    await t.step('DOCUMENT_RELATIONSHIPS: should carry forward document_relationships unchanged on continuation payload', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };

        const relationships = buildDocumentRelationships({ parenthesis: 'root-abc', synthesis: 'xyz-123', source_group: 'some-contrib-id' });
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            document_relationships: relationships,
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            testJob,
            aiResponse,
            savedContribution,
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
            assertEquals(newPayload.target_contribution_id, savedContribution.id);
            assertEquals(newPayload.sessionId, executePayload.sessionId);
            assertEquals(newPayload.projectId, executePayload.projectId);
            assertEquals(newPayload.model_id, executePayload.model_id);
            assertEquals(newPayload.stageSlug, executePayload.stageSlug);
            assertEquals(newPayload.iterationNumber, executePayload.iterationNumber);
            assertEquals(newPayload.continueUntilComplete, true);
            assertEquals(typeof newPayload.continuation_count, 'number');
            assertExists(newPayload.canonicalPathParams, 'canonicalPathParams should be preserved');
            assertExists(newPayload.inputs, 'inputs should be preserved');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    await t.step('DOCUMENT_RELATIONSHIPS: uses saved contribution relationships when trigger payload lacks them', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };

        const relationships = buildDocumentRelationships({ thesis: 'root-xyz' });
        const savedWithRelationships = buildDialecticContributionRow({ document_relationships: relationships });

        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            // intentionally omit document_relationships on triggering payload
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });

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
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        const deps: IContinueJobDeps = { logger: new MockLogger() };

        // saved contribution has no document_relationships (builder default is null)
        const savedWithoutRelationships = buildDialecticContributionRow();
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            // intentionally no document_relationships on triggering payload
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });

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

    await t.step('DOCUMENT_RELATIONSHIPS: continuation payload must include document_relationships[stageSlug] from saved when trigger has only source_group', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] },
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };

        const rootContribId = 'root-contrib-antithesis-123';
        const sourceGroupId = 'group-uuid-456';
        const savedWithStageKey = buildDialecticContributionRow({
            id: 'first-chunk-contrib-id',
            document_relationships: buildDocumentRelationships({ antithesis: rootContribId, source_group: sourceGroupId }),
        });

        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({
            stageSlug: 'antithesis',
            continueUntilComplete: true,
            document_relationships: buildDocumentRelationships({ source_group: sourceGroupId }),
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, stage_slug: 'antithesis' });

        const result = await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            testJob,
            aiResponse,
            savedWithStageKey,
            'user-1',
        );

        assertEquals(result.enqueued, true, 'Should enqueue continuation when saved contribution has document_relationships[stageSlug]');

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assert(isDialecticJobPayload(newJobData.payload));

        if (isDialecticExecuteJobPayload(newJobData.payload)) {
            const newPayload = newJobData.payload;
            assertExists(newPayload.document_relationships, 'continuation payload must have document_relationships');
            const rels = newPayload.document_relationships as Record<string, string | null>;
            assertExists(rels.antithesis, 'document_relationships[stageSlug] (antithesis) is required for continuation so saveResponse can persist and validate it');
            assertEquals(rels.antithesis, rootContribId, 'document_relationships.antithesis must be the root contribution id from saved contribution (planner only sets source_group for root jobs)');
        } else {
            assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
        }
    });

    await t.step('PAYLOAD_CONSTRUCTION: should increment continuation_count from existing value', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const deps: IContinueJobDeps = { logger: new MockLogger() };
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 3 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        const result = await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const mockLogger = new MockLogger();
        const deps: IContinueJobDeps = { logger: mockLogger };
        const infoSpy = spy(mockLogger, 'info');
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        const continuationLogCall = infoSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Continuation required for job') && 
            call.args[0].includes(testJob.id)
        );
        assertExists(continuationLogCall, 'Should log continuation requirement');
    });

    await t.step('LOGGING: should log success message when job is enqueued', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const mockLogger = new MockLogger();
        const deps: IContinueJobDeps = { logger: mockLogger };
        const infoSpy = spy(mockLogger, 'info');
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        const successLogCall = infoSpy.calls.find(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Successfully enqueued continuation job') && 
            call.args[0].includes(savedContribution.id)
        );
        assertExists(successLogCall, 'Should log successful enqueuing');
    });

    await t.step('LOGGING: should log error message when database insert fails', async () => {
        const dbError = new Error('DB Error');
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: null, error: dbError } 
                },
            },
        });
        const mockLogger = new MockLogger();
        const deps: IContinueJobDeps = { logger: mockLogger };
        const errorSpy = spy(mockLogger, 'error');
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });

        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

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

    await t.step('LOGGING: should log continuation when continueUntilComplete is false', async () => {
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    insert: { data: [{ id: 'new-job-id' }] } 
                },
            },
        });
        const mockLogger = new MockLogger();
        const deps: IContinueJobDeps = { logger: mockLogger };
        const infoSpy = spy(mockLogger, 'info');
        const errorSpy = spy(mockLogger, 'error');
        const aiResponse = buildUnifiedAIResponse();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        
        await continueJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, testJob, aiResponse, savedContribution, 'user-1');

        const continuationLogCalls = [...infoSpy.calls, ...errorSpy.calls].filter(call => 
            call.args[0] && typeof call.args[0] === 'string' &&
            (call.args[0].includes('Continuation') || call.args[0].includes('continuation'))
        );
        assert(continuationLogCalls.length > 0, 'Should log continuation info when continueUntilComplete is false');
    });
});

Deno.test("continueJob enqueues with full original payload preserved and overlays only required fields", async () => {
    // Arrange: build an original execute payload containing many fields that must be preserved
    const originalPayload = buildDialecticExecuteJobPayload({
      sessionId: "sess-1",
      projectId: "proj-1",
      model_id: "model-1",
      continueUntilComplete: true,
      continuation_count: 2,
      walletId: "wallet-123",
      maxRetries: 3,
      prompt_template_id: "template-A",
      output_type: FileType.HeaderContext,
      inputs: { seed_prompt_resource_id: "res-1" },
      document_relationships: buildDocumentRelationships({ thesis: "contrib-root-1" }),
      user_jwt: "user.jwt.token",
    });

    if (!originalPayload.stageSlug) {
      throw new Error("stageSlug is required");
    }

    if (!isJson(originalPayload)) {
        throw new Error("originalPayload is not valid JSON");
    }

    // Mock job row with the above payload
    const originalJob = buildDialecticJobRow({
      payload: originalPayload,
    });
  
    // Contribution just saved from the prior call
    const savedContribution = buildDialecticContributionRow();
  
    const aiResponse = buildUnifiedAIResponse();
  
    // Capture holder for inserted row to dialectic_generation_jobs
    let insertedRow: unknown = undefined;
  
    // Mock client with insert interceptor on dialectic_generation_jobs
    const { client } = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_generation_jobs: {
          insert: async (state: MockQueryBuilderState) => {
            insertedRow = (state.insertData) || null;
            return { data: [{}], error: null, count: 1, status: 201, statusText: "Created" };
            
          },
        },
        // Minimal selects used by continueJob path are not required here
      },
    });
  
    const dbClient = client as unknown as SupabaseClient<Database>;
  
    // Minimal deps for continueJob
    const testLogger = new MockLogger();
    const deps = { logger: testLogger };
  
    // Act: request a continuation enqueue
    const result = await continueJob(
      deps,
      dbClient,
      originalJob,
      aiResponse,
      savedContribution,
      originalJob.user_id,
    );
  
    // Assert: enqueued result
    assert(result.enqueued === true, "Continuation should be enqueued");
    assertExists(insertedRow, "A row should be inserted into dialectic_generation_jobs");
  
    if (!isDialecticJobRow(insertedRow)) {
        throw new Error("insertedRow is not a valid DialecticJobRow");
    }
    const inserted: DialecticJobRow = insertedRow;
    assertEquals(inserted.session_id, originalJob.session_id);
    assertEquals(inserted.user_id, originalJob.user_id);
    assertEquals(inserted.stage_slug, originalJob.stage_slug);
    assertEquals(inserted.iteration_number, originalJob.iteration_number);
    assertEquals(inserted.status, "pending_continuation");
  
    // Validate payload preservation + overlays

    if (!isDialecticExecuteJobPayload(inserted.payload)) {
        throw new Error("inserted.payload is not a valid DialecticExecuteJobPayload");
    }
    const payload: DialecticExecuteJobPayload = inserted.payload;
  
    // Overlays expected
    assertEquals(payload.target_contribution_id, savedContribution.id);
    assertEquals(payload.continuation_count, (originalPayload.continuation_count ?? 0) + 1);
    assertExists(payload.canonicalPathParams, "canonicalPathParams must exist");
    assertEquals(payload.canonicalPathParams.contributionType, originalPayload.stageSlug);
  
    // Preserved fields (selected critical ones)
    assertEquals(payload.sessionId, originalPayload.sessionId);
    assertEquals(payload.projectId, originalPayload.projectId);
    assertEquals(payload.model_id, originalPayload.model_id);
    assertEquals(payload.stageSlug, originalPayload.stageSlug);
    assertEquals(payload.iterationNumber, originalPayload.iterationNumber);
    assertEquals(payload.walletId, originalPayload.walletId);
    assertEquals(payload.maxRetries, originalPayload.maxRetries);
    assertEquals(payload.prompt_template_id, originalPayload.prompt_template_id);
    assertEquals(payload.output_type, originalPayload.output_type);
    assertEquals(payload.inputs.seed_prompt_resource_id, originalPayload.inputs.seed_prompt_resource_id);
    assertEquals(payload.user_jwt, originalPayload.user_jwt);
  
    // Relationships must be available for continuation
    assert(payload.document_relationships !== undefined && payload.document_relationships !== null, "document_relationships must be present");
  });
  

  // (JWT enforcement tests defined below)

Deno.test('continueJob enforces user_jwt presence: missing user_jwt fails and does not insert', async () => {
    const { user_jwt: _omit, ...payloadWithoutJwt } = buildDialecticExecuteJobPayload();
    if (!isJson(payloadWithoutJwt)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: payloadWithoutJwt });
    const aiResponse = buildUnifiedAIResponse();

    const mock = createMockSupabaseClient(undefined, {});
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow(),
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assertExists(result.error);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

Deno.test('continueJob enforces user_jwt presence: empty user_jwt fails and does not insert', async () => {
    const executePayload = buildDialecticExecuteJobPayload({ user_jwt: '' });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    const mock = createMockSupabaseClient(undefined, {});
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow(),
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assertExists(result.error);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

// Explicit preservation test per checklist: payload with user_jwt should enqueue and keep user_jwt unchanged
Deno.test('JWT_PRESERVATION: when payload.user_jwt is present, continueJob enqueues and preserves it unchanged', async () => {
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    let insertedRow: unknown = undefined;
    const { client } = createMockSupabaseClient('user-1', {
        genericMockResults: {
            dialectic_generation_jobs: {
                insert: async (state: MockQueryBuilderState) => {
                    insertedRow = state.insertData || null;
                    return { data: [{}], error: null, count: 1, status: 201, statusText: 'Created' };
                },
            },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };

    const result = await continueJob(
        depsLocal,
        client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    assertEquals(result.enqueued, true);
    assertExists(insertedRow);
    if (!isDialecticJobRow(insertedRow)) {
        throw new Error('insertedRow is not a valid DialecticJobRow');
    }
    const inserted = insertedRow;
    assert(isDialecticExecuteJobPayload(inserted.payload));
    const newPayload = inserted.payload;
    assertEquals(newPayload.user_jwt, executePayload.user_jwt);
});

Deno.test('is_test_job propagation', async (t) => {
    let mockSupabase: MockSupabaseClientSetup;
    let mockLogger: MockLogger;
    let deps: IContinueJobDeps;
    let insertedRow: unknown = undefined;

    const setup = (mockOverrides?: any) => {
        mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_generation_jobs: {
                    insert: async (state: MockQueryBuilderState) => {
                        insertedRow = state.insertData || null;
                        return { data: [{}], error: null, count: 1, status: 201, statusText: 'Created' };
                    },
                },
            },
            ...mockOverrides,
        });
        mockLogger = new MockLogger();
        deps = { logger: mockLogger };
    };

    await t.step("continueJob should propagate 'is_test_job' flag from parent to new job", async () => {
        setup();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const parentJob = buildDialecticJobRow({ payload: executePayload, is_test_job: true });
        const aiResponse = buildUnifiedAIResponse();

        await continueJob(
            deps,
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            aiResponse,
            buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
            'user-1'
        );

        assertExists(insertedRow, "A row should have been inserted");
        assert(isDialecticJobRow(insertedRow));

        const newPayload = insertedRow.payload;
        assert(isDialecticExecuteJobPayload(newPayload));
        assertEquals(newPayload.is_test_job, true, "The 'is_test_job' flag must be propagated to the continuation job");
    });
});

// =================================================================
// GROUP 9: Step 7.a Compliance - Continuation Context, Identity, and Omissions
// =================================================================

Deno.test('CONTINUATION_CONTEXT: enqueues on continuable finish_reason', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
});

Deno.test('JSON_MALFORMED: malformed JSON content enqueues continuation (overrides stop)', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse({ content: '{ "incomplete": true' });

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
});

Deno.test('NO_STEP_INFO: continuation payload must not contain deprecated "step_info"', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
    if (isRecord(newRow.payload)) {
        assertEquals(Object.prototype.hasOwnProperty.call(newRow.payload, 'step_info'), false, 'step_info must be omitted');
    } else {
        assert(false, 'Payload is not a record');
    }
});

Deno.test('STEP_IDENTITY: preserves planner_metadata.recipe_step_id and core identity fields', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({
        continueUntilComplete: true,
        planner_metadata: { recipe_step_id: 'step-123' },
    });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
    if (isRecord(newRow.payload)) {
        assertEquals(newRow.payload['sessionId'], executePayload.sessionId);
        assertEquals(newRow.payload['projectId'], executePayload.projectId);
        assertEquals(newRow.payload['model_id'], executePayload.model_id);
        assertEquals(newRow.payload['stageSlug'], executePayload.stageSlug);
        assertEquals(newRow.payload['iterationNumber'], executePayload.iterationNumber);
        assertEquals(newRow.payload['walletId'], executePayload.walletId);
        assertEquals(newRow.payload['user_jwt'], executePayload.user_jwt);
        const pm = newRow.payload['planner_metadata'];
        assert(isRecord(pm), 'planner_metadata must be an object');
        assertEquals(pm['recipe_step_id'], 'step-123');
    } else {
        assert(false, 'Payload is not a record');
    }
});

Deno.test('NO_INPUT_RULES: continuation payload omits inputs_required and inputs_relevance (executor re-gathers)', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() }),
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
    if (isRecord(newRow.payload)) {
        assertEquals(Object.prototype.hasOwnProperty.call(newRow.payload, 'inputs_required'), false, 'inputs_required must be omitted');
        assertEquals(Object.prototype.hasOwnProperty.call(newRow.payload, 'inputs_relevance'), false, 'inputs_relevance must be omitted');
    } else {
        assert(false, 'Payload is not a record');
    }
});

// =================================================================
// GROUP 10: Step 74.c - source_group Preservation for Fragment Extraction
// =================================================================

Deno.test('SOURCE_GROUP_PRESERVATION: should preserve document_relationships.source_group from saved contribution in continuation payload (74.c.i)', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    
    const sourceGroupUuid = '550e8400-e29b-41d4-a716-446655440000';
    const rootContributionId = 'root-contrib-123';
    
    const savedContribution = buildDialecticContributionRow({
        id: rootContributionId,
        document_relationships: buildDocumentRelationships({ 
            source_group: sourceGroupUuid,
            thesis: rootContributionId,
        }),
    });
    
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();
    
    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );
    
    assertEquals(result.enqueued, true);
    
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newJobData = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newJobData));
    assert(isDialecticJobPayload(newJobData.payload));
    
    if (isDialecticExecuteJobPayload(newJobData.payload)) {
        const newPayload = newJobData.payload;
        assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
        assertExists(newPayload.document_relationships.source_group, 'source_group should be preserved from saved contribution');
        assertEquals(newPayload.document_relationships.source_group, sourceGroupUuid, 'source_group should equal the saved contribution source_group');
    } else {
        assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
    }
});

Deno.test('SOURCE_GROUP_PRESERVATION: should preserve document_relationships.source_group when copying from job payload (74.c.ii)', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    
    const sourceGroupUuid = 'test-uuid-1234-5678-90ab-cdef12345678';
    const rootId = 'root-id-456';
    
    const executePayload = buildDialecticExecuteJobPayload({
        continueUntilComplete: true,
        document_relationships: buildDocumentRelationships({
            source_group: sourceGroupUuid,
            thesis: rootId,
        }),
    });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();
    
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships({ thesis: 'contrib-1' }),
    });
    
    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );
    
    assertEquals(result.enqueued, true);
    
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newJobData = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newJobData));
    assert(isDialecticJobPayload(newJobData.payload));
    
    if (isDialecticExecuteJobPayload(newJobData.payload)) {
        const newPayload = newJobData.payload;
        assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
        assertExists(newPayload.document_relationships.source_group, 'source_group should be preserved from job payload');
        assertEquals(newPayload.document_relationships.source_group, sourceGroupUuid, 'source_group should equal the job payload source_group');
    } else {
        assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
    }
});

Deno.test('SOURCE_GROUP_PRESERVATION: should handle missing source_group gracefully in continuation payload (74.c.iii)', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    
    const rootContributionId = 'root-contrib-789';
    
    const savedContribution = buildDialecticContributionRow({
        id: rootContributionId,
        document_relationships: buildDocumentRelationships({ thesis: rootContributionId }),
    });
    
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const aiResponse = buildUnifiedAIResponse();
    
    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );
    
    assertEquals(result.enqueued, true);
    
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newJobData = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newJobData));
    assert(isDialecticJobPayload(newJobData.payload));
    
    if (isDialecticExecuteJobPayload(newJobData.payload)) {
        const newPayload = newJobData.payload;
        assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
        // source_group should be undefined/null/absent when not present in saved contribution
        const sourceGroup = newPayload.document_relationships.source_group;
        assertEquals(
            sourceGroup,
            undefined,
            'source_group should be undefined when not present in saved contribution document_relationships'
        );
    } else {
        assert(false, 'Payload is not a valid DialecticExecuteJobPayload');
    }
});

// =================================================================
// Idempotency key: continuation job insert and 23505 handling
// =================================================================

Deno.test('continueJob idempotency: continuation job insert includes idempotency_key derived as job.id_continue_savedContribution.id', async () => {
    const jobId = 'job-continue-idem-1';
    const contribId = 'contrib-continue-idem-1';
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload, id: jobId });
    const savedContribution = buildDialecticContributionRow({
        id: contribId,
        document_relationships: buildDocumentRelationships(),
    });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );

    assertEquals(result.enqueued, true);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(inserted));
    const expectedKey = `${jobId}_continue_${contribId}`;
    assertEquals(inserted.idempotency_key, expectedKey, 'Insert must include idempotency_key derived as job.id_continue_savedContribution.id');
});

Deno.test('continueJob idempotency: on unique constraint violation (23505 on idempotency_key) returns enqueued true', async () => {
    const idempotencyViolationError: PostgrestError = {
        name: 'PostgrestError',
        code: '23505',
        message: 'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key"',
        details: '',
        hint: '',
    };
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                insert: { data: null, error: idempotencyViolationError },
            },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );

    assertEquals(result.enqueued, true, 'On 23505 for idempotency_key must return enqueued true (continuation already created)');
    assertEquals(result.error, undefined, 'Must not return error when treating idempotency conflict as success');
});

// =================================================================
// COMPRESS arm: continuation for compression jobs
// =================================================================

Deno.test('continueJob COMPRESS: inserts a COMPRESS row with correct job_type, parent_job_id, status, and idempotency_key', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-1', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-1' });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, true);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 1);
    const inserted = insertSpy.callsArgs[0][0];
    assert(isJobInsert(inserted));
    assertEquals(inserted.job_type, 'COMPRESS');
    assertEquals(inserted.parent_job_id, job.parent_job_id);
    assertEquals(inserted.status, 'pending_continuation');
    assertEquals(inserted.idempotency_key, `${job.id}_continue_${savedOutput.id}`);
});

Deno.test('continueJob COMPRESS: inserted payload passes isDialecticCompressJobPayload, carries advanced continuation_count, preserves parent members, and contains no user_jwt or target_contribution_id', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload({
        continuation_count: 2,
        mode: 'json',
        sourceId: 'src-1',
        role: 'user',
        chunk_index: 0,
        chunk_total: 3,
    });
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-2', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-2' });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, true);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy.callsArgs[0][0];
    assert(isJobInsert(inserted));
    const insertedPayload = inserted.payload;
    assert(isDialecticCompressJobPayload(insertedPayload));
    assertEquals(insertedPayload.continuation_count, 3);
    assertEquals(insertedPayload.mode, payload.mode);
    assertEquals(insertedPayload.content, payload.content);
    assertEquals(insertedPayload.sourceType, payload.sourceType);
    assertEquals(insertedPayload.targetKey, payload.targetKey);
    assertEquals(insertedPayload.documentKey, payload.documentKey);
    assertEquals(insertedPayload.docType, payload.docType);
    assertEquals(insertedPayload.sourceStageSlug, payload.sourceStageSlug);
    assertEquals(insertedPayload.sourceId, payload.sourceId);
    assertEquals(insertedPayload.role, payload.role);
    assertEquals(insertedPayload.chunk_index, payload.chunk_index);
    assertEquals(insertedPayload.chunk_total, payload.chunk_total);
    assertEquals(insertedPayload.model_id, payload.model_id);
    assertEquals(insertedPayload.walletId, payload.walletId);
    assertEquals(insertedPayload.user_id, payload.user_id);
    assert(!('user_jwt' in insertedPayload));
    assert(!('target_contribution_id' in insertedPayload));
});

Deno.test('continueJob COMPRESS: inserted row target_contribution_id is null', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-3', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-3' });
    const aiResponse = buildUnifiedAIResponse();

    await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy.callsArgs[0][0];
    assert(isJobInsert(inserted));
    assertEquals(inserted.target_contribution_id, null);
});

Deno.test('continueJob COMPRESS: enqueues successfully with no output_type and no document_relationships', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-4', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-4' });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, true);
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 1);
});

Deno.test('continueJob COMPRESS: at continuation_count 5 returns continuation_limit_reached with no insert', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload({ continuation_count: 5 });
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-5', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-5' });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assertEquals(result.reason, 'continuation_limit_reached');
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 0);
});

Deno.test('continueJob COMPRESS: on 23505 idempotency_key violation returns enqueued true', async () => {
    const idempotencyViolationError: PostgrestError = {
        name: 'PostgrestError',
        code: '23505',
        message: 'duplicate key value violates unique constraint "dialectic_generation_jobs_idempotency_key_key"',
        details: '',
        hint: '',
    };
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                insert: { data: null, error: idempotencyViolationError },
            },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'compress-job-6', job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow({ id: 'resource-output-6' });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, true);
    assertEquals(result.error, undefined);
});

Deno.test('continueJob EXECUTE: at limit and missing walletId returns walletId error rather than continuation_limit_reached', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticExecuteJobPayload({
        continuation_count: 5,
        walletId: '',
    });
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'execute-job-limit-no-wallet', job_type: 'EXECUTE' });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assert(!('reason' in result));
    assertExists(result.error);
    assertEquals(result.error.message, 'Job payload is missing a valid walletId');
});
/*
Deno.test('continueJob EXECUTE: saved output without document_relationships fails document_relationships gate', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const payload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(payload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload, id: 'execute-job-no-rels-saved-output', job_type: 'EXECUTE' });
    const savedOutput = buildDialecticProjectResourceRow();
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedOutput,
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assertExists(result.error);
    assertEquals(result.error.message, 'Continuation enqueue requires valid document_relationships');
});*/

Deno.test('continueJob EXECUTE: payload clearing all four gates but failing isDialecticExecuteJobPayload surfaces guard error unchanged', async () => {
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const depsLocal: IContinueJobDeps = { logger: new MockLogger() };
    const baseExecute = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    const { prompt_template_id: _omit, ...payloadWithoutTemplateId } = baseExecute;
    if (!isJson(payloadWithoutTemplateId)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: payloadWithoutTemplateId, id: 'execute-job-no-template-id', job_type: 'EXECUTE' });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const aiResponse = buildUnifiedAIResponse();

    const result = await continueJob(
        depsLocal,
        mock.client as unknown as SupabaseClient<Database>,
        job,
        aiResponse,
        savedContribution,
        'user-1',
    );

    assertEquals(result.enqueued, false);
    assertExists(result.error);
    assertEquals(result.error.message, 'Missing or invalid prompt_template_id.');
});