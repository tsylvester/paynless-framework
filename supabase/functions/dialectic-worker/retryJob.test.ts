import { retryJob, type IRetryJobDeps } from './retryJob.ts';
import { assert, assertEquals, assertExists, assertObjectMatch, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import type { Database } from '../types_db.ts';
import type { FailedAttemptError } from '../dialectic-service/dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

type UpdateJobRecord = Database['public']['Tables']['dialectic_generation_jobs']['Update'];

function isUpdateJobRecord(record: unknown): record is UpdateJobRecord {
    if (!isRecord(record)) return false;
    if ('status' in record && typeof record.status !== 'string') return false;
    if ('attempt_count' in record && typeof record.attempt_count !== 'number') return false;
    return true;
}

Deno.test('retryJob', async (t) => {
    
    let mockSupabase: MockSupabaseClientSetup;
    let mockLogger: MockLogger;
    let deps: IRetryJobDeps;

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

    const failedAttempts: FailedAttemptError[] = [
        { modelId: 'model-1', error: 'AI Error', api_identifier: 'api-1' }
    ];

    const setup = (mockOverrides?: any) => {
        mockSupabase = createMockSupabaseClient(undefined, mockOverrides);
        mockLogger = new MockLogger();
        deps = {
            logger: mockLogger,
        };
    };

    await t.step('should update job status and send notification on retry', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: [{ id: 'job-1' }] } 
                },
                rpc: { data: null } // Mock for notification
            },
        });

        const currentAttempt = 1;
        await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, failedAttempts, 'user-1');

        // Verify job update
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        
        const updateArgs = updateSpy.callsArgs[0][0];
        
        assert(isUpdateJobRecord(updateArgs), "updateArgs is not a valid UpdateJobRecord");

        assertObjectMatch(updateArgs, {
            status: 'retrying',
            attempt_count: currentAttempt,
        });
        
        // Use assertObjectMatch for structural comparison to avoid type errors.
        if (updateArgs.error_details && typeof updateArgs.error_details === 'object') {
            assertObjectMatch(updateArgs.error_details, { failedAttempts: failedAttempts });
        } else {
            throw new Error('error_details not in expected format');
        }

        // Verify notification
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertExists(rpcSpy);
        assertEquals(rpcSpy.calls.length, 1);
        assert(rpcSpy.calls[0].args[0] === 'create_notification_for_user');
        assertObjectMatch(rpcSpy.calls[0].args[1], {
            target_user_id: 'user-1',
            notification_type: 'contribution_generation_retrying',
            notification_data: { 
                sessionId: 'session-1', 
                stageSlug: 'test-stage',
                attempt: currentAttempt + 1,
                max_attempts: 4, // Fixed: 1 initial + 3 retries = 4 total attempts
            },
        });
    });

    await t.step('should return an error if job update fails', async () => {
        const dbError = new Error('DB connection lost');
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: null, error: dbError } 
                },
            },
        });

        const currentAttempt = 1;
        const result = await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, failedAttempts, 'user-1');

        assertExists(result.error);
        assertStringIncludes(result.error.message, 'Failed to update job status to \'retrying\'');
        assertStringIncludes(result.error.message, 'DB connection lost');

        // Verify notification was NOT sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 0);
    });

    await t.step('should not send notification if user ID is null', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: [{ id: 'job-1' }] } 
                },
            },
        });

        const currentAttempt = 1;
        // Call with a null user ID
        await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, failedAttempts, null as any);

        // Verify job was still updated
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        
        // Verify notification was NOT sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 0);
    });

    await t.step('should not send notification if user ID is empty string', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: [{ id: 'job-1' }] } 
                },
            },
        });

        const currentAttempt = 1;
        // Call with an empty string user ID
        await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, failedAttempts, '');

        // Verify job was still updated
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        
        // Verify notification was NOT sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 0);
    });

    await t.step('should handle empty failed attempts array', async () => {
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: [{ id: 'job-1' }] } 
                },
                rpc: { data: null }
            },
        });

        const currentAttempt = 2;
        const emptyFailedAttempts: FailedAttemptError[] = [];
        
        await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, emptyFailedAttempts, 'user-1');

        // Verify job update with empty failed attempts
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isUpdateJobRecord(updateArgs), "updateArgs is not a valid UpdateJobRecord");
        
        assertObjectMatch(updateArgs, {
            status: 'retrying',
            attempt_count: currentAttempt,
        });
        
        // Verify empty failedAttempts array is preserved
        if (updateArgs.error_details && typeof updateArgs.error_details === 'object') {
            assertObjectMatch(updateArgs.error_details, { failedAttempts: [] });
        } else {
            throw new Error('error_details not in expected format');
        }

        // Verify notification was sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 1);
    });

    await t.step('should succeed even if notification fails', async () => {
        const notificationError = new Error('Notification service down');
        setup({
            genericMockResults: {
                'dialectic_generation_jobs': { 
                    update: { data: [{ id: 'job-1' }] } 
                },
                rpc: { data: null, error: notificationError }
            },
        });

        const currentAttempt = 1;
        const result = await retryJob(deps, mockSupabase.client as unknown as SupabaseClient<Database>, baseJob, currentAttempt, failedAttempts, 'user-1');

        // Should not return an error even if notification fails
        assertEquals(result.error, undefined);

        // Verify job was still updated successfully
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        
        // Verify notification was attempted
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 1);
    });
});
