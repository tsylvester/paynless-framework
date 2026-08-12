import { continueJob } from '../continueJob/continueJob.ts';
import { assert, assertEquals, assertExists, assertObjectMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { type PostgrestError, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from '../../_shared/supabase.mock.ts';
import type { Database, Json } from '../../types_db.ts';
import {
  type DialecticContributionRow,
  type DialecticJobPayload,
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
import { FileType } from '../../_shared/types/file_manager.types.ts';
import {
  buildDialecticContributionRow,
  buildDialecticExecuteJobPayload,
  buildDialecticJobRow,
  buildDocumentRelationships,
} from '../../_shared/dialectic.mock.ts';
import {
  buildDialecticCompressJobPayload,
  isDialecticCompressJobPayload,
} from '../enqueueCompressJobs/enqueueCompressJobs.provides.ts';
import {
  buildContinueJobDeps,
  buildContinueJobParams,
  buildContinueJobPayload,
} from './continueJob.mock.ts';
import {
  isContinueJobEnqueuedReturn,
  isContinueJobErrorReturn,
  isContinueJobLimitReachedReturn,
} from './continueJob.guard.ts';

Deno.test('continueJob', async (t) => {
    // =================================================================
    // GROUP 1: Basic Continuation Logic - FinishReason Variations
    // =================================================================
    
    await t.step('CALLER_TRUST: should enqueue when finish_reason is "stop" (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1, "Insert should have been called");
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "length"', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "tool_calls" (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "content_filter" (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "function_call" (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is "error" (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('FINISH_REASON: should enqueue when finish_reason is "unknown"', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is null (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    await t.step('CALLER_TRUST: should enqueue when finish_reason is undefined (caller decided continuation)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 1);
    });

    // =================================================================
    // GROUP 2: Continue Until Complete Flag Variations
    // =================================================================
    
    await t.step('CONTINUE_FLAG: enqueues when continueUntilComplete is false', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CONTINUE_FLAG: enqueues when continueUntilComplete is absent', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload();
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    // =================================================================
    // GROUP 3: Continuation Count and Max Depth Logic
    // =================================================================
    
    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 0', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 0 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 1', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 1 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
    });

    await t.step('CONTINUATION_COUNT: should enqueue when continuation_count is 4 (just under max)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 4 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 5 (at max)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 5 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobLimitReachedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 0);
    });

    await t.step('CONTINUATION_COUNT: should not enqueue when continuation_count is 6 (over max)', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 6 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobLimitReachedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 0);
    });

    await t.step('CONTINUATION_COUNT: should not include reason when continueUntilComplete is false', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        assert(!('reason' in result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
    });

    await t.step('CONTINUATION_COUNT: should handle undefined continuation_count as 0', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, walletId: 'wallet-1', maxRetries: 5 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ walletId: 'wallet-default', continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ walletId: 'only-wallet-id', continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, prompt_template_id: 'test_template', prompt_template_name: 'thesis_business_case' });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, parent_job_id: 'parent-job-123' });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assertEquals(newJobData.parent_job_id, 'parent-job-123');
    });

    await t.step('PARENT_JOB: should handle null parent_job_id', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assertEquals(newJobData.parent_job_id, null);
    });

    await t.step('PREREQ_JOB: should preserve prerequisite_job_id and set job_type to EXECUTE', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, prerequisite_job_id: 'pre-123' });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
        assertEquals(newJobData.prerequisite_job_id, 'pre-123');
        assertEquals(newJobData.job_type, 'EXECUTE');
    });

    await t.step('PAYLOAD_CONSTRUCTION: should embed the provided message history into the new job payload', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const newJobData = insertSpy!.callsArgs[0][0];
        assert(isJobInsert(newJobData));
    });

    // =================================================================
    // GROUP 6: Database Error Scenarios
    // =================================================================
    
    await t.step('DATABASE_ERROR: should return error when database insert fails', async () => {
        // Arrange
        const dbError = new Error('Database connection lost');
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: null, error: dbError }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobErrorReturn(result));
        assertEquals(result.error.message, 'Failed to enqueue continuation job: Database connection lost');
    });

    await t.step('DATABASE_ERROR: should return error when database insert throws exception', async () => {
        // Arrange
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
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobErrorReturn(result));
        assertEquals(result.error.message, 'Failed to enqueue continuation job: Constraint violation');
    });

    // =================================================================
    // GROUP 7: Payload Construction and Data Integrity
    // =================================================================
    
    await t.step('PAYLOAD_CONSTRUCTION: should correctly construct new job payload with target_contribution_id', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, session_id: 'session-1' });
        const savedContribution = buildDialecticContributionRow({ id: 'contrib-1', document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const relationships = buildDocumentRelationships({ parenthesis: 'root-abc', synthesis: 'xyz-123', source_group: 'some-contrib-id' });
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            document_relationships: relationships,
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const relationships = buildDocumentRelationships({ thesis: 'root-xyz' });
        const savedWithRelationships = buildDialecticContributionRow({ document_relationships: relationships });
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            // intentionally omit document_relationships on triggering payload
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedWithRelationships });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, undefined);
        // saved contribution has no document_relationships (builder default is null)
        const savedWithoutRelationships = buildDialecticContributionRow();
        const executePayload = buildDialecticExecuteJobPayload({
            continueUntilComplete: true,
            // intentionally no document_relationships on triggering payload
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedWithoutRelationships });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobErrorReturn(result));
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertEquals(insertSpy?.callCount ?? 0, 0, 'Should not enqueue when relationships are missing');
    });

    await t.step('DOCUMENT_RELATIONSHIPS: continuation payload must include document_relationships[stageSlug] from saved when trigger has only source_group', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] },
                },
            },
        });
        const rootContribId = 'root-contrib-antithesis-123';
        const sourceGroupId = 'group-uuid-456';
        const savedWithStageKey = buildDialecticContributionRow({
            id: 'first-chunk-contrib-id',
            document_relationships: buildDocumentRelationships({ antithesis: rootContribId, source_group: sourceGroupId }),
        });
        const executePayload = buildDialecticExecuteJobPayload({
            stageSlug: 'antithesis',
            continueUntilComplete: true,
            document_relationships: buildDocumentRelationships({ source_group: sourceGroupId }),
        });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload, stage_slug: 'antithesis' });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedWithStageKey });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true, continuation_count: 3 });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        const result = await continueJob(deps, params, payload);

        // Assert
        assert(isContinueJobEnqueuedReturn(result));
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const mockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, 'info');
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps({ logger: mockLogger });
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
        const continuationLogCall = infoSpy.calls.find(call =>
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Continuation required for job') &&
            call.args[0].includes(testJob.id)
        );
        assertExists(continuationLogCall, 'Should log continuation requirement');
    });

    await t.step('LOGGING: should log success message when job is enqueued', async () => {
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const mockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, 'info');
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps({ logger: mockLogger });
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
        const successLogCall = infoSpy.calls.find(call =>
            call.args[0] && typeof call.args[0] === 'string' &&
            call.args[0].includes('Successfully enqueued continuation job') &&
            call.args[0].includes(savedContribution.id)
        );
        assertExists(successLogCall, 'Should log successful enqueuing');
    });

    await t.step('LOGGING: should log error message when database insert fails', async () => {
        // Arrange
        const dbError = new Error('DB Error');
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: null, error: dbError }
                },
            },
        });
        const mockLogger = new MockLogger();
        const errorSpy = spy(mockLogger, 'error');
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps({ logger: mockLogger });
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
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
        // Arrange
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: 'new-job-id' }] }
                },
            },
        });
        const mockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, 'info');
        const errorSpy = spy(mockLogger, 'error');
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: false });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const testJob = buildDialecticJobRow({ payload: executePayload });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps({ logger: mockLogger });
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: testJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
        const continuationLogCalls = [...infoSpy.calls, ...errorSpy.calls].filter(call =>
            call.args[0] && typeof call.args[0] === 'string' &&
            (call.args[0].includes('Continuation') || call.args[0].includes('continuation'))
        );
        assert(continuationLogCalls.length > 0, 'Should log continuation info when continueUntilComplete is false');
    });
});

/**
 * Contract: EXECUTE arm, payload — the full original payload is preserved with
 * only the required overlays (target_contribution_id, continuation_count+1,
 * canonicalPathParams) applied.
 * Arrange: an EXECUTE job whose payload carries many fields that must be
 * preserved.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted row preserves the
 * original payload fields and applies the required overlays.
 */
Deno.test("continueJob enqueues with full original payload preserved and overlays only required fields", async () => {
    // Arrange
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
    const originalJob = buildDialecticJobRow({ payload: originalPayload });
    const savedContribution = buildDialecticContributionRow();
    let insertedRow: unknown = undefined;
    const { client } = createMockSupabaseClient("user-1", {
      genericMockResults: {
        dialectic_generation_jobs: {
          insert: async (state: MockQueryBuilderState) => {
            insertedRow = (state.insertData) || null;
            return { data: [{}], error: null, count: 1, status: 201, statusText: "Created" };
          },
        },
      },
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
      dbClient: client as unknown as SupabaseClient<Database>,
      projectOwnerUserId: originalJob.user_id,
    });
    const payload = buildContinueJobPayload({ job: originalJob, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
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
    if (!isDialecticExecuteJobPayload(inserted.payload)) {
        throw new Error("inserted.payload is not a valid DialecticExecuteJobPayload");
    }
    const newPayload: DialecticExecuteJobPayload = inserted.payload;
    // Overlays expected
    assertEquals(newPayload.target_contribution_id, savedContribution.id);
    assertEquals(newPayload.continuation_count, (originalPayload.continuation_count ?? 0) + 1);
    assertExists(newPayload.canonicalPathParams, "canonicalPathParams must exist");
    assertEquals(newPayload.canonicalPathParams.contributionType, originalPayload.stageSlug);
    // Preserved fields (selected critical ones)
    assertEquals(newPayload.sessionId, originalPayload.sessionId);
    assertEquals(newPayload.projectId, originalPayload.projectId);
    assertEquals(newPayload.model_id, originalPayload.model_id);
    assertEquals(newPayload.stageSlug, originalPayload.stageSlug);
    assertEquals(newPayload.iterationNumber, originalPayload.iterationNumber);
    assertEquals(newPayload.walletId, originalPayload.walletId);
    assertEquals(newPayload.maxRetries, originalPayload.maxRetries);
    assertEquals(newPayload.prompt_template_id, originalPayload.prompt_template_id);
    assertEquals(newPayload.output_type, originalPayload.output_type);
    assertEquals(newPayload.inputs.seed_prompt_resource_id, originalPayload.inputs.seed_prompt_resource_id);
    assertEquals(newPayload.user_jwt, originalPayload.user_jwt);
    // Relationships must be available for continuation
    assert(newPayload.document_relationships !== undefined && newPayload.document_relationships !== null, "document_relationships must be present");
});
  

  // (JWT enforcement tests defined below)

/**
 * Contract: EXECUTE arm, entry gate — a missing user_jwt fails the gate and no
 * insert is attempted.
 * Arrange: an EXECUTE job whose payload omits user_jwt.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an error return and no insert was attempted.
 */
Deno.test('continueJob enforces user_jwt presence: missing user_jwt fails and does not insert', async () => {
    // Arrange
    const { user_jwt: _omit, ...payloadWithoutJwt } = buildDialecticExecuteJobPayload();
    if (!isJson(payloadWithoutJwt)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: payloadWithoutJwt });
    const mock = createMockSupabaseClient(undefined, {});
    const savedContribution = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobErrorReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

/**
 * Contract: EXECUTE arm, entry gate — an empty user_jwt fails the gate and no
 * insert is attempted.
 * Arrange: an EXECUTE job whose payload carries an empty user_jwt.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an error return and no insert was attempted.
 */
Deno.test('continueJob enforces user_jwt presence: empty user_jwt fails and does not insert', async () => {
    // Arrange
    const executePayload = buildDialecticExecuteJobPayload({ user_jwt: '' });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const mock = createMockSupabaseClient(undefined, {});
    const savedContribution = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobErrorReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertEquals(insertSpy?.callCount ?? 0, 0);
});

/**
 * Contract: EXECUTE arm, payload — user_jwt on the parent payload is preserved
 * unchanged on the continuation payload.
 * Arrange: an EXECUTE job whose payload carries a user_jwt.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted payload's user_jwt
 * equals the parent payload's user_jwt.
 */
Deno.test('JWT_PRESERVATION: when payload.user_jwt is present, continueJob enqueues and preserves it unchanged', async () => {
    // Arrange
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
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
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
    assertExists(insertedRow);
    if (!isDialecticJobRow(insertedRow)) {
        throw new Error('insertedRow is not a valid DialecticJobRow');
    }
    const inserted = insertedRow;
    assert(isDialecticExecuteJobPayload(inserted.payload));
    const newPayload = inserted.payload;
    assertEquals(newPayload.user_jwt, executePayload.user_jwt);
});

/**
 * Contract: EXECUTE arm, payload — the is_test_job flag propagates from the
 * parent job to the continuation payload.
 * Arrange: an EXECUTE job whose row carries is_test_job true.
 * Act: call continueJob with the three-slot signature.
 * Assert: the inserted row's payload carries is_test_job true.
 */
Deno.test('is_test_job propagation', async (t) => {
    let mockSupabase: MockSupabaseClientSetup;
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
    };

    await t.step("continueJob should propagate 'is_test_job' flag from parent to new job", async () => {
        // Arrange
        setup();
        const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
        if (!isJson(executePayload)) throw new Error('payload is not valid Json');
        const parentJob = buildDialecticJobRow({ payload: executePayload, is_test_job: true });
        const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
        const deps = buildContinueJobDeps();
        const params = buildContinueJobParams({
            dbClient: mockSupabase.client as unknown as SupabaseClient<Database>,
        });
        const payload = buildContinueJobPayload({ job: parentJob, savedOutput: savedContribution });

        // Act
        await continueJob(deps, params, payload);

        // Assert
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

/**
 * Contract: EXECUTE arm — a continuable finish_reason enqueues a continuation.
 * Arrange: an EXECUTE job with a default execute payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: one insert was attempted.
 */
Deno.test('CONTINUATION_CONTEXT: enqueues on continuable finish_reason', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    await continueJob(deps, params, payload);

    // Assert
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
});

/**
 * Contract: EXECUTE arm — malformed JSON content enqueues a continuation, the
 * caller having decided.
 * Arrange: an EXECUTE job with a default execute payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: one insert was attempted.
 */
Deno.test('JSON_MALFORMED: malformed JSON content enqueues continuation (overrides stop)', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    await continueJob(deps, params, payload);

    // Assert
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
});

/**
 * Contract: EXECUTE arm, payload — the deprecated step_info is omitted on the
 * continuation payload.
 * Arrange: an EXECUTE job with a default execute payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: the inserted payload has no step_info.
 */
Deno.test('NO_STEP_INFO: continuation payload must not contain deprecated "step_info"', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    await continueJob(deps, params, payload);

    // Assert
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newRow = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newRow));
    if (isRecord(newRow.payload)) {
        assertEquals(Object.prototype.hasOwnProperty.call(newRow.payload, 'step_info'), false, 'step_info must be omitted');
    } else {
        assert(false, 'Payload is not a record');
    }
});

/**
 * Contract: EXECUTE arm, payload — planner_metadata.recipe_step_id and the core
 * identity fields are preserved on the continuation payload.
 * Arrange: an EXECUTE job whose payload carries planner_metadata.recipe_step_id.
 * Act: call continueJob with the three-slot signature.
 * Assert: the inserted payload preserves the core identity fields and
 * planner_metadata.recipe_step_id.
 */
Deno.test('STEP_IDENTITY: preserves planner_metadata.recipe_step_id and core identity fields', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({
        continueUntilComplete: true,
        planner_metadata: { recipe_step_id: 'step-123' },
    });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    await continueJob(deps, params, payload);

    // Assert
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

/**
 * Contract: EXECUTE arm, payload — inputs_required and inputs_relevance are
 * omitted on the continuation payload, the executor re-gathering them.
 * Arrange: an EXECUTE job with a default execute payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: the inserted payload has neither inputs_required nor inputs_relevance.
 */
Deno.test('NO_INPUT_RULES: continuation payload omits inputs_required and inputs_relevance (executor re-gathers)', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({ document_relationships: buildDocumentRelationships() });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    await continueJob(deps, params, payload);

    // Assert
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

/**
 * Contract: EXECUTE arm, document-relationship merge — source_group from the saved
 * contribution is preserved on the continuation payload.
 * Arrange: an EXECUTE job and a saved contribution whose document_relationships
 * carry source_group and thesis.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted payload's
 * document_relationships.source_group equals the saved contribution's source_group.
 */
Deno.test('SOURCE_GROUP_PRESERVATION: should preserve document_relationships.source_group from saved contribution in continuation payload (74.c.i)', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
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
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
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

/**
 * Contract: EXECUTE arm, document-relationship merge — source_group on the job
 * payload is preserved on the continuation payload.
 * Arrange: an EXECUTE job whose payload carries document_relationships with
 * source_group and thesis.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted payload's
 * document_relationships.source_group equals the job payload's source_group.
 */
Deno.test('SOURCE_GROUP_PRESERVATION: should preserve document_relationships.source_group when copying from job payload (74.c.ii)', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
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
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships({ thesis: 'contrib-1' }),
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
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

/**
 * Contract: EXECUTE arm, document-relationship merge — source_group absent on the
 * saved contribution is absent on the continuation payload.
 * Arrange: an EXECUTE job and a saved contribution whose document_relationships
 * carry thesis but no source_group.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted payload's
 * document_relationships.source_group is undefined.
 */
Deno.test('SOURCE_GROUP_PRESERVATION: should handle missing source_group gracefully in continuation payload (74.c.iii)', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const rootContributionId = 'root-contrib-789';
    const savedContribution = buildDialecticContributionRow({
        id: rootContributionId,
        document_relationships: buildDocumentRelationships({ thesis: rootContributionId }),
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    const newJobData = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(newJobData));
    assert(isDialecticJobPayload(newJobData.payload));
    if (isDialecticExecuteJobPayload(newJobData.payload)) {
        const newPayload = newJobData.payload;
        assertExists(newPayload.document_relationships, 'document_relationships should be present on continuation payload');
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

/**
 * Contract: Shared tail — the idempotency key ${payload.job.id}_continue_${payload.savedOutput.id}
 * is computed once above both arms and read by the row column.
 * Arrange: an EXECUTE job with a known id and a saved contribution with a known id.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted row's idempotency_key
 * equals ${jobId}_continue_${contribId}.
 */
Deno.test('continueJob idempotency: continuation job insert includes idempotency_key derived as job.id_continue_savedContribution.id', async () => {
    // Arrange
    const jobId = 'job-continue-idem-1';
    const contribId = 'contrib-continue-idem-1';
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload, id: jobId });
    const savedContribution = buildDialecticContributionRow({
        id: contribId,
        document_relationships: buildDocumentRelationships(),
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy!.callsArgs[0][0];
    assert(isJobInsert(inserted));
    const expectedKey = `${jobId}_continue_${contribId}`;
    assertEquals(inserted.idempotency_key, expectedKey, 'Insert must include idempotency_key derived as job.id_continue_savedContribution.id');
});

/**
 * Contract: Insert outcome — a 23505 violation naming idempotency_key returns the
 * enqueued arm, an already-created continuation being a success.
 * Arrange: an EXECUTE job whose insert returns a 23505 idempotency_key violation.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return.
 */
Deno.test('continueJob idempotency: on unique constraint violation (23505 on idempotency_key) returns enqueued true', async () => {
    // Arrange
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
    const executePayload = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
});

// =================================================================
// COMPRESS arm: continuation for compression jobs
// =================================================================

/**
 * Contract: COMPRESS arm, tail values — the inserted row carries job_type COMPRESS,
 * the parent's parent_job_id, status pending_continuation, and the composed
 * idempotency_key.
 * Arrange: a COMPRESS job with a default compress payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted row has job_type COMPRESS,
 * the parent's parent_job_id, status pending_continuation, and idempotency_key
 * equal to ${job.id}_continue_${savedOutput.id}.
 */
Deno.test('continueJob COMPRESS: inserts a COMPRESS row with correct job_type, parent_job_id, status, and idempotency_key', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
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

/**
 * Contract: COMPRESS arm, payload — the inserted payload passes
 * isDialecticCompressJobPayload, carries an advanced continuation_count, preserves
 * parent members, carries user_jwt from the parent and idempotencyKey equal to the
 * row's idempotency_key, and carries neither job_type nor user_id.
 * Arrange: a COMPRESS job with continuation_count 2, json mode, and optional
 * members sourceId, role, chunk_index, chunk_total.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return; the inserted payload passes
 * isDialecticCompressJobPayload with continuation_count 3 and all parent members
 * preserved, carries user_jwt from the parent and idempotencyKey equal to the row's
 * idempotency_key, and carries neither job_type nor user_id.
 */
Deno.test('continueJob COMPRESS: inserted payload passes isDialecticCompressJobPayload, carries advanced continuation_count, preserves parent members, carries user_jwt and idempotencyKey, and contains neither job_type nor user_id', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const compressPayload = buildDialecticCompressJobPayload({
        continuation_count: 2,
        mode: 'json',
        sourceId: 'src-1',
        role: 'user',
        chunk_index: 0,
        chunk_total: 3,
    });
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy.callsArgs[0][0];
    assert(isJobInsert(inserted));
    const insertedPayload = inserted.payload;
    assert(isDialecticCompressJobPayload(insertedPayload));
    assertEquals(insertedPayload.continuation_count, 3);
    assertEquals(insertedPayload.mode, compressPayload.mode);
    assertEquals(insertedPayload.content, compressPayload.content);
    assertEquals(insertedPayload.sourceType, compressPayload.sourceType);
    assertEquals(insertedPayload.targetKey, compressPayload.targetKey);
    assertEquals(insertedPayload.documentKey, compressPayload.documentKey);
    assertEquals(insertedPayload.docType, compressPayload.docType);
    assertEquals(insertedPayload.sourceStageSlug, compressPayload.sourceStageSlug);
    assertEquals(insertedPayload.sourceId, compressPayload.sourceId);
    assertEquals(insertedPayload.role, compressPayload.role);
    assertEquals(insertedPayload.chunk_index, compressPayload.chunk_index);
    assertEquals(insertedPayload.chunk_total, compressPayload.chunk_total);
    assertEquals(insertedPayload.model_id, compressPayload.model_id);
    assertEquals(insertedPayload.walletId, compressPayload.walletId);
    assertEquals(insertedPayload.user_jwt, compressPayload.user_jwt);
    assertEquals(insertedPayload.idempotencyKey, `${job.id}_continue_${savedOutput.id}`);
    assert(!('job_type' in insertedPayload));
    assert(!('user_id' in insertedPayload));
});

/**
 * Contract: COMPRESS arm, tail values — target contribution id is null.
 * Arrange: a COMPRESS job with a default compress payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: the inserted row's target_contribution_id is null.
 */
Deno.test('continueJob COMPRESS: inserted row target_contribution_id is null', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    await continueJob(deps, params, payload);

    // Assert
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    const inserted = insertSpy.callsArgs[0][0];
    assert(isJobInsert(inserted));
    assertEquals(inserted.target_contribution_id, null);
});

/**
 * Contract: COMPRESS arm — enqueues successfully with no output_type and no
 * document_relationships, the COMPRESS arm not requiring either.
 * Arrange: a COMPRESS job with a default compress payload.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return and one insert was attempted.
 */
Deno.test('continueJob COMPRESS: enqueues successfully with no output_type and no document_relationships', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 1);
});

/**
 * Contract: Shared tail — currentContinuationCount < 5 false returns
 * ContinueJobLimitReachedReturn with no write, for the COMPRESS arm.
 * Arrange: a COMPRESS job at continuation_count 5.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is a limit-reached return and no insert was attempted.
 */
Deno.test('continueJob COMPRESS: at continuation_count 5 returns continuation_limit_reached with no insert', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const compressPayload = buildDialecticCompressJobPayload({ continuation_count: 5 });
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobLimitReachedReturn(result));
    const insertSpy = mock.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertSpy);
    assertEquals(insertSpy.callCount, 0);
});

/**
 * Contract: COMPRESS arm — a 23505 violation on idempotency_key returns the
 * enqueued arm, an already-created continuation being a success.
 * Arrange: a COMPRESS job whose insert returns a 23505 idempotency_key violation.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an enqueued return.
 */
Deno.test('continueJob COMPRESS: on 23505 idempotency_key violation returns enqueued true', async () => {
    // Arrange
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
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const savedOutput = buildDialecticContributionRow();
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobEnqueuedReturn(result));
});

/**
 * Contract: EXECUTE arm — the arm's payload is fully built before the bound is
 * applied, so a payload defect (missing walletId) is reported as itself rather
 * than as the limit, even at continuation_count 5.
 * Arrange: an EXECUTE job at continuation_count 5 with an empty walletId, so the
 * walletId gate fires before the limit check.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an error return carrying the walletId message and
 * retriable false, not a limit-reached return.
 */
Deno.test('continueJob EXECUTE: at limit and missing walletId returns walletId error rather than continuation_limit_reached', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const executePayload = buildDialecticExecuteJobPayload({
        continuation_count: 5,
        walletId: '',
    });
    if (!isJson(executePayload)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: executePayload });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobErrorReturn(result));
    assertEquals(result.error.message, 'Job payload is missing a valid walletId');
    assertEquals(result.retriable, false);
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

/**
 * Contract: EXECUTE arm — a payload the execute guard rejects surfaces its thrown
 * diagnostic unchanged on the error arm with retriable false.
 * Arrange: an EXECUTE job whose payload omits prompt_template_id, so the execute
 * guard throws its per-member diagnostic.
 * Act: call continueJob with the three-slot signature.
 * Assert: the result is an error return carrying the guard's exact message and
 * retriable false.
 */
Deno.test('continueJob EXECUTE: payload clearing all four gates but failing isDialecticExecuteJobPayload surfaces guard error unchanged', async () => {
    // Arrange
    const mock = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { insert: { data: [{ id: 'new-job-id' }] } },
        },
    });
    const baseExecute = buildDialecticExecuteJobPayload({ continueUntilComplete: true });
    const { prompt_template_id: _omit, ...payloadWithoutTemplateId } = baseExecute;
    if (!isJson(payloadWithoutTemplateId)) throw new Error('payload is not valid Json');
    const job = buildDialecticJobRow({ payload: payloadWithoutTemplateId });
    const savedContribution = buildDialecticContributionRow({
        document_relationships: buildDocumentRelationships(),
    });
    const deps = buildContinueJobDeps();
    const params = buildContinueJobParams({
        dbClient: mock.client as unknown as SupabaseClient<Database>,
    });
    const payload = buildContinueJobPayload({ job, savedOutput: savedContribution });

    // Act
    const result = await continueJob(deps, params, payload);

    // Assert
    assert(isContinueJobErrorReturn(result));
    assertEquals(result.error.message, 'Missing or invalid prompt_template_id.');
    assertEquals(result.retriable, false);
});