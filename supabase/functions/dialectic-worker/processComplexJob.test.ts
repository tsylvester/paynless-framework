import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob, type IPlanComplexJobDeps } from './processComplexJob.ts';
import type { DialecticJobRow, DialecticJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload, isRecord } from '../_shared/utils/type_guards.ts';
import { logger } from '../_shared/logger.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';

Deno.test('processComplexJob - plans and enqueues child jobs', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-parent';
    
    const mockChildJob1: DialecticJobRow = {
        id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
        payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
        attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
        completed_at: null, results: null, error_details: null, parent_job_id: mockParentJobId,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };
    const mockChildJob2: DialecticJobRow = {
        id: 'child-2', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
        payload: { message: 'Child 2' }, iteration_number: 1, status: 'pending',
        attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
        completed_at: null, results: null, error_details: null, parent_job_id: mockParentJobId,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.resolve([mockChildJob1, mockChildJob2]);
    });

    const mockSupabase = createMockSupabaseClient();
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-complex',
        projectId: 'project-id-complex',
        stageSlug: 'antithesis',
        model_id: 'model-id-complex',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-complex',
        session_id: 'session-id-complex',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-complex', mockDeps);

        // 3. Assert
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1, 'Should have inserted the child jobs');
        assertEquals(insertSpy.callsArgs[0][0], [mockChildJob1, mockChildJob2]);

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs) {
            assertEquals(updateArgs.status, 'waiting_for_children');
        } else {
            throw new Error('Update call did not have the expected shape.');
        }

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processComplexJob - handles planner failure gracefully', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-planner-fail';

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.reject(new Error('Planner failed!'));
    });

    const mockSupabase = createMockSupabaseClient();
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-fail',
        projectId: 'project-id-fail',
        stageSlug: 'antithesis',
        model_id: 'model-id-fail',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-fail',
        session_id: 'session-id-fail',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-fail', mockDeps);

        // 3. Assert
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status to failed');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs && 'error_details' in updateArgs) {
            assertEquals(updateArgs.status, 'failed');
            assert(JSON.stringify(updateArgs.error_details).includes('Planner failed!'));
        } else {
            throw new Error('Update call did not have the expected shape for a failure.');
        }

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processComplexJob - completes parent job if planner returns no children', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-no-children';

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.resolve([]); // Planner returns an empty array
    });

    const mockSupabase = createMockSupabaseClient();
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-no-children',
        projectId: 'project-id-no-children',
        stageSlug: 'antithesis',
        model_id: 'model-id-no-children',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-no-children',
        session_id: 'session-id-no-children',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-no-children', mockDeps);

        // 3. Assert
        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assert(!insertSpy || insertSpy.callCount === 0, 'Should not attempt to insert any child jobs');
        
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should update the parent job status to completed');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs) {
            assertEquals(updateArgs.status, 'completed');
        } else {
            throw new Error('Update call did not have the expected shape for completion.');
        }

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processComplexJob - fails parent job if child job insert fails', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-insert-fail';

    const mockChildJob: DialecticJobRow = {
        id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
        payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
        attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
        completed_at: null, results: null, error_details: null, parent_job_id: mockParentJobId,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.resolve([mockChildJob]);
    });

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                insert: () => Promise.resolve({ data: null, error: new Error('Insert failed!') })
            }
        }
    });
    
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-insert-fail',
        projectId: 'project-id-insert-fail',
        stageSlug: 'antithesis',
        model_id: 'model-id-insert-fail',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-insert-fail',
        session_id: 'session-id-insert-fail',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-insert-fail', mockDeps);

        // 3. Assert
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should only update the parent job to failed');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs && 'error_details' in updateArgs) {
            assertEquals(updateArgs.status, 'failed');
            assert(JSON.stringify(updateArgs.error_details).includes('Failed to insert child jobs: Insert failed!'));
        } else {
            throw new Error('Update call did not have the expected shape for a failure.');
        }

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processComplexJob - fails parent job if status update fails', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-update-fail';

    const mockChildJob: DialecticJobRow = {
        id: 'child-1', user_id: 'user-1', session_id: 'session-1', stage_slug: 'antithesis',
        payload: { message: 'Child 1' }, iteration_number: 1, status: 'pending',
        attempt_count: 0, max_retries: 3, created_at: new Date().toISOString(), started_at: null,
        completed_at: null, results: null, error_details: null, parent_job_id: mockParentJobId,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.resolve([mockChildJob]);
    });

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                insert: () => Promise.resolve({ data: [mockChildJob], error: null }),
                update: () => Promise.resolve({ data: null, error: new Error('Update failed!') })
            }
        }
    });
    
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-update-fail',
        projectId: 'project-id-update-fail',
        stageSlug: 'antithesis',
        model_id: 'model-id-update-fail',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-update-fail',
        session_id: 'session-id-update-fail',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-update-fail', mockDeps);

        // 3. Assert
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 2, 'Should attempt to update twice (once to wait, once to fail)');
        
        const firstUpdateArgs = updateSpy.callsArgs[0][0];
        if (firstUpdateArgs && typeof firstUpdateArgs === 'object' && 'status' in firstUpdateArgs) {
            assertEquals(firstUpdateArgs.status, 'waiting_for_children');
        } else {
            throw new Error('First update call was not for waiting_for_children.');
        }

        const secondUpdateArgs = updateSpy.callsArgs[1][0];
        if (secondUpdateArgs && typeof secondUpdateArgs === 'object' && 'status' in secondUpdateArgs && 'error_details' in secondUpdateArgs) {
            assertEquals(secondUpdateArgs.status, 'failed');
            assert(JSON.stringify(secondUpdateArgs.error_details).includes('Failed to update parent job status: Update failed!'));
        } else {
            throw new Error('Second update call was not for failure.');
        }

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processComplexJob - handles ContextWindowError gracefully', async () => {
    // 1. Setup
    const mockParentJobId = 'job-id-context-window-fail';

    const planComplexStageSpy = spy(async (): Promise<DialecticJobRow[]> => {
        return await Promise.reject(new ContextWindowError('Planning failed due to context window size.'));
    });

    const mockSupabase = createMockSupabaseClient();
    const promptAssembler = new PromptAssembler(mockSupabase.client as unknown as SupabaseClient<Database>);

    const mockDeps: IPlanComplexJobDeps = {
        logger,
        planComplexStage: planComplexStageSpy,
        promptAssembler,
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ 
            data: await new Blob(['Mock content']).arrayBuffer(), 
            error: null 
        })),
    };

    const mockPayload: Json = {
        sessionId: 'session-id-fail',
        projectId: 'project-id-fail',
        stageSlug: 'antithesis',
        model_id: 'model-id-fail',
    };
    if (!isDialecticJobPayload(mockPayload)) {
        throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload");
    }

    const mockParentJob: DialecticJobRow = {
        id: mockParentJobId,
        user_id: 'user-id-fail',
        session_id: 'session-id-fail',
        stage_slug: 'antithesis',
        payload: mockPayload,
        iteration_number: 1,
        status: 'processing',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
    };

    try {
        // 2. Execute
        await processComplexJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockParentJob, payload: mockPayload }, 'user-id-fail', mockDeps);

        // 3. Assert
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should have updated the parent job status to failed');
        
        const updateArgs = updateSpy.callsArgs[0][0];
        assert(isRecord(updateArgs) && 'status' in updateArgs && 'error_details' in updateArgs, 'Update call did not have the expected shape for a failure.');
        assertEquals(updateArgs.status, 'failed');
        assert(isRecord(updateArgs.error_details) && typeof updateArgs.error_details.message === 'string' && updateArgs.error_details.message.includes('Context window limit exceeded'));

    } finally {
        // 4. Teardown
        mockSupabase.clearAllStubs?.();
    }
});
