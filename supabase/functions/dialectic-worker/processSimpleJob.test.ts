import {
  assertEquals,
  assertExists,
  assertObjectMatch,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { validatePayload } from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import type { GenerateContributionsDeps, DialecticJobRow, GenerateContributionsPayload } from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload } from '../_shared/utils/type_guards.ts';
import { stub } from 'https://deno.land/std@0.170.0/testing/mock.ts';

// Define a type for our mock job for clarity
type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

Deno.test('processSimpleJob - Happy Path', async () => {
  const localLoggerInfo = spy(logger, 'info');
  const localLoggerError = spy(logger, 'error');

  // 1. Mocks and Test Data
  const mockJobId = 'job-id-happy';
  const mockSessionId = 'session-id-happy';
  const mockProjectId = 'project-id-happy';
  const mockUserId = 'user-id-happy';
  const mockModelProviderId = 'model-id-happy';

  const mockPayload: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    iterationNumber: 1,
    selectedModelIds: [mockModelProviderId],
    continueUntilComplete: false,
  };
  const validatedPayload = validatePayload(mockPayload);

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayload,
    status: 'pending',
    attempt_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    user_id: mockUserId,
    parent_job_id: null,
    target_contribution_id: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}] },
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', display_name: 'Thesis' }] } },
      'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
      'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-happy', name: 'Test Model', provider: 'test' }] } },
      'dialectic_project_resources': {
        select: {
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({
              type: 'seed_prompt',
              session_id: mockSessionId,
              stage_slug: 'thesis',
              iteration: 1,
            }),
            file_name: 'prompt.md',
          }],
        },
      },
    },
  });

  const rpcSpy = mockSupabase.spies.rpcSpy;

  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
    content: 'Happy path AI content',
    error: null,
    finish_reason: 'stop',
    tokenUsage: {
      completion_tokens: 10,
      prompt_tokens: 5,
      total_tokens: 15,
    },
  }));

  const mockFileManager = new MockFileManagerService();
  const mockContributionId = 'contrib-id-happy';
  mockFileManager.setUploadAndRegisterFileResponse({
      id: mockContributionId,
      session_id: mockSessionId,
      user_id: mockUserId,
      model_id: mockModelProviderId,
      model_name: 'Test Model',
      stage: 'thesis',
      iteration_number: 1,
      storage_path: 'path/to/happy.md',
      storage_bucket: 'test-bucket',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_latest_edit: true,
      edit_version: 1,
      citations: null,
      contribution_type: 'model_generated',
      error: null,
      file_name: 'happy.md',
      mime_type: 'text/markdown',
      original_model_contribution_id: null,
      processing_time_ms: 1000,
      prompt_template_id_used: null,
      raw_response_storage_path: 'path/to/raw.json',
      seed_prompt_url: null,
      size_bytes: 123,
      target_contribution_id: null,
      tokens_used_input: 5,
      tokens_used_output: 10,
  }, null);
  
  const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
    const seedContent = new TextEncoder().encode('A seed prompt');
    const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
    new Uint8Array(arrayBuffer).set(seedContent);
    return await Promise.resolve({ data: arrayBuffer, error: null });
  });

  const mockDeps: GenerateContributionsDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: downloadFromStorageSpy,
    fileManager: mockFileManager,
    logger: logger,
    randomUUID: spy(() => 'mock-uuid-happy'),
    getExtensionFromMimeType: spy(() => '.md'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
  };

  try {
    // 2. Execute the worker function
    await processSimpleJob(
      mockSupabase.client as unknown as SupabaseClient<Database>,
      mockJob,
      validatedPayload,
      mockUserId,
      mockDeps,
      'mock-auth-token',
    );

    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);

    // 3. Assertions
    assertEquals(updateSpy.callCount, 1, 'Should update job status once to completed');
    const completedArgs = updateSpy.callsArgs[0][0];
    if (completedArgs && typeof completedArgs === 'object' && 'status' in completedArgs) {
      assertEquals(completedArgs.status, 'completed');
    }

    // Assert AI was called
    assertEquals(mockCallUnifiedAIModel.calls.length, 1, 'AI model should be called once');

    // Assert notification was sent
    assertEquals(rpcSpy.calls.length, 3, 'Notification RPC should be called three times (start, received, complete)');
    assertObjectMatch(rpcSpy.calls[0].args[1], {
      target_user_id: mockUserId,
      notification_type: 'dialectic_contribution_started',
    });
    assertObjectMatch(rpcSpy.calls[1].args[1], {
      target_user_id: mockUserId,
      notification_type: 'dialectic_contribution_received',
    });
    assertObjectMatch(rpcSpy.calls[2].args[1], {
      target_user_id: mockUserId,
      notification_type: 'contribution_generation_complete',
    });
  } finally {
    localLoggerInfo.restore();
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('processSimpleJob - Retry Success', async () => {
    const localLoggerInfo = spy(logger, 'info');
    const localLoggerError = spy(logger, 'error');

    // 1. Mocks and Test Data
    const mockJobId = 'job-id-retry';
    const mockSessionId = 'session-id-retry';
    const mockProjectId = 'project-id-retry';
    const mockUserId = 'user-id-retry';
    const mockModelProviderId = 'model-id-retry';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: false,
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        user_id: mockUserId,
        parent_job_id: null,
        target_contribution_id: null,
        };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [{}, {}] } },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', display_name: 'Thesis' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-retry', name: 'Retry Model', provider: 'test' }] } },
            'dialectic_project_resources': {
                select: {
                    data: [{
                        storage_bucket: 'test-bucket',
                        storage_path: 'prompts/',
                        resource_description: JSON.stringify({
                            type: 'seed_prompt',
                            session_id: mockSessionId,
                            stage_slug: 'thesis',
                            iteration: 1,
                        }),
                        file_name: 'prompt.md',
                    }],
                },
            },
        },
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    // Mock AI to fail once, then succeed
    let callCount = 0;
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => {
        callCount++;
        if (callCount === 1) {
            return {
                content: null,
                error: 'AI Error: First attempt failed',
                finish_reason: 'error',
            };
        }
        return {
            content: 'Successful AI content after retry',
            error: null,
            finish_reason: 'stop',
        };
    });

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'contrib-id-retry',
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: mockModelProviderId,
        model_name: 'Retry Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/retry.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'retry.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 500,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        target_contribution_id: null,
        tokens_used_input: 5,
        tokens_used_output: 10,
    }, null);

    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-retry'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);

        // 3. Assertions
        // It's updated twice: once for the retry attempt, once for completion.
        assertEquals(updateSpy.callCount, 2, 'Should update job status twice');
        const retryUpdateArgs = updateSpy.callsArgs[0][0];
        if (retryUpdateArgs && typeof retryUpdateArgs === 'object' && 'error_details' in retryUpdateArgs && 'attempt_count' in retryUpdateArgs) {
            assertExists(retryUpdateArgs.error_details, 'Error details should be logged on retry');
            assertEquals(retryUpdateArgs.attempt_count, 1);
        }

        const completedArgs = updateSpy.callsArgs[1][0];
        if (completedArgs && typeof completedArgs === 'object' && 'status' in completedArgs) {
            assertEquals(completedArgs.status, 'completed');
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 2, 'AI model should be called twice');

        assertEquals(rpcSpy.calls.length, 5, 'Notification RPC should be called: start, retry, start, received, complete');
        
        assertObjectMatch(rpcSpy.calls[0].args[1], {
            notification_type: 'dialectic_contribution_started',
        });
        assertObjectMatch(rpcSpy.calls[1].args[1], {
            notification_type: 'contribution_generation_retrying',
        });
        assertObjectMatch(rpcSpy.calls[2].args[1], {
            notification_type: 'dialectic_contribution_started',
        });
        assertObjectMatch(rpcSpy.calls[3].args[1], {
            notification_type: 'dialectic_contribution_received',
        });
        assertObjectMatch(rpcSpy.calls[4].args[1], {
            notification_type: 'contribution_generation_complete',
        });

    } finally {
        localLoggerInfo.restore();
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processSimpleJob - Retry Loop Exhausted', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-exhausted';
    const mockUserId = 'user-id-exhausted';
    const mockModelProviderId = 'model-id-exhausted';
    const mockSessionId = 'session-id-exhausted';
    const mockProjectId = 'project-id-exhausted';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelProviderId],
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 2, // Lower retries for a faster test
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [{}, {}, {}] } },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', display_name: 'Thesis' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-exhausted', name: 'Exhausted Model', provider: 'test' }] } },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    // Mock AI to always fail
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: null,
        error: 'AI always fails',
        finish_reason: 'error',
    }));

    const mockFileManager = new MockFileManagerService(); // Won't be called
    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-exhausted'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);

        // 3. Assertions
        assertEquals(updateSpy.callCount, 3, 'Should update job status for each retry attempt plus final failure');
        
        // Final update should be to 'retry_loop_failed'
        const finalUpdateArgs = updateSpy.callsArgs[2][0];
        if (finalUpdateArgs && typeof finalUpdateArgs === 'object' && 'status' in finalUpdateArgs && 'error_details' in finalUpdateArgs) {
            assertEquals(finalUpdateArgs.status, 'retry_loop_failed');
            assertExists(finalUpdateArgs.error_details);
            const errorDetails = finalUpdateArgs.error_details;
            if (errorDetails && typeof errorDetails === 'object') {
                assertObjectMatch(errorDetails, {
                    final_error: 'Job failed for 1 model(s) after exhausting all 2 retries.',
                });
            } else {
                throw new Error('error_details did not have the expected shape.');
            }
        } else {
            throw new Error('Final update call did not have the expected shape for failure.');
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 3, 'AI model should be called 1 initial + max_retries times');

        // start, retry, start, retry, start, failed = 6 notifications
        assertEquals(rpcSpy.calls.length, 6, 'Notification RPC should be called for starts, retries and final failure');
        assertObjectMatch(rpcSpy.calls[0].args[1], { notification_type: 'dialectic_contribution_started' });
        assertObjectMatch(rpcSpy.calls[1].args[1], { notification_type: 'contribution_generation_retrying' });
        assertObjectMatch(rpcSpy.calls[2].args[1], { notification_type: 'dialectic_contribution_started' });
        assertObjectMatch(rpcSpy.calls[3].args[1], { notification_type: 'contribution_generation_retrying' });
        assertObjectMatch(rpcSpy.calls[4].args[1], { notification_type: 'dialectic_contribution_started' });
        assertObjectMatch(rpcSpy.calls[5].args[1], { notification_type: 'contribution_generation_failed' });

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processSimpleJob - Continuation Enqueued', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-continue';
    const mockUserId = 'user-id-continue';
    const mockModelProviderId = 'model-id-continue';
    const mockSessionId = 'session-id-continue';
    const mockProjectId = 'project-id-continue';
    const mockContributionId = 'contrib-id-continue';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: true, // IMPORTANT
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        };
    
    // We expect an insert and an update
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { 
                insert: { data: [{ id: 'new-job-id' }] },
                update: { data: [{ id: mockJobId, status: 'completed' }] },
             },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-continue', name: 'Continue Model' }] } },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    // Mock AI to return a response that needs continuation
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'Partial content...',
        error: null,
        finish_reason: 'length', // IMPORTANT
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: mockContributionId,
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: mockModelProviderId,
        model_name: 'Continue Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/continue.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'continue.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 500,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        target_contribution_id: null,
        tokens_used_input: 5,
        tokens_used_output: 10,
    }, null);

    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-continue'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const insertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);

        // 3. Assertions
        assertEquals(insertSpy.callCount, 1, 'Should insert a new continuation job');
        
        const insertCallArgs = insertSpy.callsArgs[0];
        if (!insertCallArgs || insertCallArgs.length === 0) {
            throw new Error('Insert spy was called without arguments');
        }

        const insertedData = insertCallArgs[0];
        const insertedJobRow = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        const { payload: insertedJobPayload } = insertedJobRow;


        if (!isDialecticJobPayload(insertedJobPayload)) throw new Error('Inserted job payload is not valid');
        
        assertEquals(insertedJobPayload.target_contribution_id, mockContributionId, 'New job payload should target the just-created contribution');
        assertEquals(insertedJobPayload.continueUntilComplete, true);

        assertEquals(updateSpy.callCount, 1, 'Should update the original job to completed');

        const updateArgs = updateSpy.callsArgs[0]?.[0];
        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs) {
            assertEquals(updateArgs.status, 'completed');
        } else {
            throw new Error('Update call did not have the expected shape.');
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 1, 'AI model should be called once');
        
        // start, received
        assertEquals(rpcSpy.calls.length, 2, 'Notification RPC should be called for start and received (with continuation flag)');
        assertObjectMatch(rpcSpy.calls[0].args[1], { notification_type: 'dialectic_contribution_started' });
        assertObjectMatch(rpcSpy.calls[1].args[1], { 
            notification_type: 'dialectic_contribution_received',
            notification_data: { is_continuing: true }
        });

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processSimpleJob - Is a Continuation Job', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-is-continue';
    const mockUserId = 'user-id-is-continue';
    const mockModelProviderId = 'model-id-is-continue';
    const mockSessionId = 'session-id-is-continue';
    const mockProjectId = 'project-id-is-continue';
    const mockTargetContributionId = 'contrib-id-previous';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: true,
        target_contribution_id: mockTargetContributionId, // IMPORTANT
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        };
    
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [{ id: mockJobId, status: 'completed' }] } },
            'dialectic_contributions': { select: { data: [{ id: mockTargetContributionId, storage_bucket: 'b', storage_path: 'p', file_name: 'previous.md' }] } },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-is-continue', name: 'Is Continue Model' }] } },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    const mockCallUnifiedAIModel = spy(async (_model, _prompt, _options): Promise<UnifiedAIResponse> => ({
        content: ' and this is the new content.',
        error: null,
        finish_reason: 'stop',
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ 
        id: 'new-contrib-id',
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: mockModelProviderId,
        model_name: 'Is Continue Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/new.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 2,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'new.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: mockTargetContributionId,
        processing_time_ms: 500,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 200,
        target_contribution_id: mockTargetContributionId,
        tokens_used_input: 10,
        tokens_used_output: 10,
     }, null);

    const downloadFromStorageSpy = spy(async (_client, _bucket, path: string): Promise<DownloadStorageResult> => {
        let content: string;
        if (path.includes('previous.md')) {
            content = 'This is the previous content'; // IMPORTANT
        } else {
            content = 'A seed prompt';
        }
        const encodedContent = new TextEncoder().encode(content);
        const arrayBuffer = new ArrayBuffer(encodedContent.byteLength);
        new Uint8Array(arrayBuffer).set(encodedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-is-continue'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const uploadSpy = mockFileManager.uploadAndRegisterFile;
        assertExists(uploadSpy);

        // 3. Assertions
        assertEquals(downloadFromStorageSpy.calls.length, 2, 'Should download seed prompt AND previous content');
        
        const aiCallArgs = mockCallUnifiedAIModel.calls[0].args;
        if (!aiCallArgs || aiCallArgs.length < 2) {
            throw new Error('AI was not called with expected arguments.');
        }
        assertEquals(aiCallArgs[1], 'This is the previous content', 'AI should be prompted with the previous content');

        const uploadSpyCalls = mockFileManager.uploadAndRegisterFile.calls;
        if (!uploadSpyCalls || uploadSpyCalls.length === 0) {
            throw new Error('Upload spy was not called');
        }
        const fileManagerArgs = uploadSpyCalls[0].args[0];

        assertEquals(fileManagerArgs.fileContent, 'This is the previous content and this is the new content.', 'Final saved content should be concatenated');

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1, 'Should update the job to completed');
        
    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processSimpleJob - Continuation Download Failure', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-continue-fail';
    const mockUserId = 'user-id-continue-fail';
    const mockModelProviderId = 'model-id-continue-fail';
    const mockSessionId = 'session-id-continue-fail';
    const mockProjectId = 'project-id-continue-fail';
    const mockTargetContributionId = 'contrib-id-previous-fail';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelProviderId],
        continueUntilComplete: true,
        target_contribution_id: mockTargetContributionId,
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        };
    
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [{}, {}, {}] } },
            'dialectic_contributions': { select: { data: [{ id: mockTargetContributionId, storage_bucket: 'b', storage_path: 'p', file_name: 'previous-fail.md' }] } },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-continue-fail', name: 'Continue Fail Model' }] } },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'This content should not be used',
        error: null,
        finish_reason: 'stop',
    }));

    const mockFileManager = new MockFileManagerService();

    const downloadFromStorageSpy = spy(async (_client, _bucket, path: string): Promise<DownloadStorageResult> => {
        if (path.includes('previous-fail.md')) {
            return await Promise.resolve({ data: null, error: new Error('Storage download failed!') }); // IMPORTANT FAILURE MOCK
        }
        const encodedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(encodedContent.byteLength);
        new Uint8Array(arrayBuffer).set(encodedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-continue-fail'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        // 3. Assertions
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 4, 'Should update for each retry and the final failure');

        const finalUpdateArgs = updateSpy.callsArgs[3]?.[0];
        if (finalUpdateArgs && typeof finalUpdateArgs === 'object' && 'status' in finalUpdateArgs && 'error_details' in finalUpdateArgs) {
            assertEquals(finalUpdateArgs.status, 'retry_loop_failed');
            const errorDetails = finalUpdateArgs.error_details;
            if (errorDetails && typeof errorDetails === 'object' && 'failedAttempts' in errorDetails && Array.isArray(errorDetails.failedAttempts) && errorDetails.failedAttempts.length > 0) {
                const firstError = errorDetails.failedAttempts[0];
                if (firstError && typeof firstError === 'object' && 'error' in firstError && typeof firstError.error === 'string') {
                    assert(firstError.error.includes('Storage download failed!'), 'Error details should contain the download failure message');
                } else {
                    throw new Error('First failed attempt did not have the expected shape.');
                }
            } else {
                throw new Error('error_details did not have the expected shape.');
            }
        } else {
            throw new Error('Update call did not have the expected shape for failure.');
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 0, 'AI model should not be called on download failure');
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 0, 'File manager should not be called to upload');

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processSimpleJob - Multi-Part Continuation', async (t) => {
    // 1. Mocks and Test Data
    const mockUserId = 'user-id-multi-continue';
    const mockSessionId = 'session-id-multi-continue';
    const mockProjectId = 'project-id-multi-continue';
    const mockModelProviderId = 'model-id-multi-continue';
    const mockAuthToken = 'mock-auth-token';

    // Shared Mocks for deps, but NOT for the Supabase client
    const mockFileManager = new MockFileManagerService();

    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const encodedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(encodedContent.byteLength);
        new Uint8Array(arrayBuffer).set(encodedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    let aiCallCount = 0;
    const aiResponses: UnifiedAIResponse[] = [
        { content: 'Part 1. ', error: null, finish_reason: 'length', tokenUsage: { completion_tokens: 10, prompt_tokens: 5, total_tokens: 15 } },
        { content: 'Part 2. ', error: null, finish_reason: 'length', tokenUsage: { completion_tokens: 10, prompt_tokens: 5, total_tokens: 15 } },
        { content: 'Part 3.', error: null, finish_reason: 'stop', tokenUsage: { completion_tokens: 10, prompt_tokens: 5, total_tokens: 15 } },
    ];
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => {
        const response = aiResponses[aiCallCount];
        aiCallCount++;
        return response;
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy((() => {
            let count = 0;
            return () => `mock-uuid-multi-${count++}`;
        })()),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    const fullContribution = {
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: mockModelProviderId,
        model_name: 'Multi Continue Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/multi.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'multi.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 1000,
        prompt_template_id_used: null,
        raw_response_storage_path: 'path/to/raw.json',
        seed_prompt_url: null,
        size_bytes: 123,
        target_contribution_id: null,
        tokens_used_input: 5,
        tokens_used_output: 10,
    };

    await t.step('Step 1: Initial job creates first part and enqueues continuation', async () => {
        const mockJobId1 = 'job-id-multi-1';
        const mockContributionId1 = 'contrib-id-multi-1';
        const newJobId = 'new-job-id-1';

        const mockPayload1: Json = {
            sessionId: mockSessionId,
            projectId: mockProjectId,
            stageSlug: 'thesis',
            iterationNumber: 1,
            selectedModelIds: [mockModelProviderId],
            continueUntilComplete: true,
        };
        const validatedPayload1 = validatePayload(mockPayload1);
        const mockJob1: MockJob = {
            id: mockJobId1,
            session_id: mockSessionId,
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: mockPayload1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            user_id: mockUserId,
            parent_job_id: null,
            target_contribution_id: null,
        };

        const step1Supabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: newJobId }] },
                    update: { data: [{ id: mockJobId1, status: 'completed' }] }
                },
                'dialectic_stages': { select: { data: [{ id: 'stage-id-1' }] } },
                'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
                'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
                'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-multi-continue', name: 'Multi Continue Model', provider: 'test' }] } },
                'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }) }] } },
            }
        });

        mockFileManager.setUploadAndRegisterFileResponse({ ...fullContribution, id: mockContributionId1, edit_version: 1 }, null);

        await processSimpleJob(step1Supabase.client as unknown as SupabaseClient<Database>, mockJob1, validatedPayload1, mockUserId, mockDeps, mockAuthToken);

        const insertSpy = step1Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
        const insertCallArgs = insertSpy.callsArgs[0];
        if (!insertCallArgs || insertCallArgs.length === 0) {
            throw new Error('Insert spy was called without arguments');
        }
        const insertedData = insertCallArgs[0];
        const insertedJobRow = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        if (insertedJobRow && typeof insertedJobRow === 'object' && 'payload' in insertedJobRow) {
            if (!isDialecticJobPayload(insertedJobRow.payload)) throw new Error("Invalid payload");
            assertEquals(insertedJobRow.payload.target_contribution_id, mockContributionId1);
        } else {
            throw new Error('Inserted job row did not have the expected shape.');
        }

        const updateSpy = step1Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);

        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1);
    });

    await t.step('Step 2: Second job appends content and enqueues another continuation', async () => {
        const mockJobId2 = 'job-id-multi-2';
        const mockContributionId1 = 'contrib-id-multi-1';
        const mockContributionId2 = 'contrib-id-multi-2';
        const newJobId = 'new-job-id-2';

        const mockPayload2: Json = {
            sessionId: mockSessionId,
            projectId: mockProjectId,
            stageSlug: 'thesis',
            iterationNumber: 1,
            selectedModelIds: [mockModelProviderId],
            continueUntilComplete: true,
            target_contribution_id: mockContributionId1,
        };
        const validatedPayload2 = validatePayload(mockPayload2);
        const mockJob2: MockJob = {
            id: mockJobId2,
            session_id: mockSessionId,
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: mockPayload2,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            user_id: mockUserId,
            parent_job_id: null,
            target_contribution_id: null,
        };

        const step2Supabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    insert: { data: [{ id: newJobId }] },
                    update: { data: [{ id: mockJobId2, status: 'completed' }] }
                },
                'dialectic_contributions': { select: { data: [{ id: mockContributionId1, storage_bucket: 'b', storage_path: 'p', file_name: 'f.md' }] } },
                'dialectic_stages': { select: { data: [{ id: 'stage-id-1' }] } },
                'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
                'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
                'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-multi-continue', name: 'Multi Continue Model', provider: 'test' }] } },
                'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }) }] } },
            }
        });

        mockFileManager.setUploadAndRegisterFileResponse({ ...fullContribution, id: mockContributionId2, edit_version: 2, original_model_contribution_id: mockContributionId1 }, null);

        await processSimpleJob(step2Supabase.client as unknown as SupabaseClient<Database>, mockJob2, validatedPayload2, mockUserId, mockDeps, mockAuthToken);

        const insertSpy = step2Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        assertExists(insertSpy);
        assertEquals(insertSpy.callCount, 1);
        const insertCallArgs = insertSpy.callsArgs[0];
        if (!insertCallArgs || insertCallArgs.length === 0) {
            throw new Error('Insert spy was called without arguments');
        }
        const insertedData2 = insertCallArgs[0];
        const insertedJobRow2 = Array.isArray(insertedData2) ? insertedData2[0] : insertedData2;

        if (insertedJobRow2 && typeof insertedJobRow2 === 'object' && 'payload' in insertedJobRow2) {
            if (!isDialecticJobPayload(insertedJobRow2.payload)) throw new Error("Invalid payload");
            assertEquals(insertedJobRow2.payload.target_contribution_id, mockContributionId2);
        } else {
            throw new Error('Inserted job row did not have the expected shape.');
        }

        const updateSpy = step2Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 2);
    });

    await t.step('Step 3: Final job appends content and stops', async () => {
        const mockJobId3 = 'job-id-multi-3';
        const mockContributionId2 = 'contrib-id-multi-2';
        const mockContributionId3 = 'contrib-id-multi-3';

        const mockPayload3: Json = {
            sessionId: mockSessionId,
            projectId: mockProjectId,
            stageSlug: 'thesis',
            iterationNumber: 1,
            selectedModelIds: [mockModelProviderId],
            continueUntilComplete: true,
            target_contribution_id: mockContributionId2,
        };
        const validatedPayload3 = validatePayload(mockPayload3);
        const mockJob3: MockJob = {
            id: mockJobId3,
            session_id: mockSessionId,
            stage_slug: 'thesis',
            iteration_number: 1,
            payload: mockPayload3,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            user_id: mockUserId,
            parent_job_id: null,
            target_contribution_id: null,
        };

        const step3Supabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    update: { data: [{ id: mockJobId3, status: 'completed' }] }
                },
                'dialectic_contributions': { select: { data: [{ id: mockContributionId2, storage_bucket: 'b', storage_path: 'p', file_name: 'f.md' }] } },
                'dialectic_stages': { select: { data: [{ id: 'stage-id-1' }] } },
                'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
                'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelProviderId] }] } },
                'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-multi-continue', name: 'Multi Continue Model', provider: 'test' }] } },
                'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }) }] } },
            }
        });

        mockFileManager.setUploadAndRegisterFileResponse({ ...fullContribution, id: mockContributionId3, edit_version: 3, original_model_contribution_id: mockContributionId2 }, null);

        const insertSpy = step3Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
        const initialInsertCallCount = insertSpy?.callCount ?? 0;

        await processSimpleJob(step3Supabase.client as unknown as SupabaseClient<Database>, mockJob3, validatedPayload3, mockUserId, mockDeps, mockAuthToken);

        const finalInsertCallCount = insertSpy?.callCount ?? 0;
        assertEquals(finalInsertCallCount, initialInsertCallCount, "Should not insert a new job");

        const updateSpy = step3Supabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 1);
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 3);
    });
});

Deno.test('processSimpleJob - Partial Failure', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-partial-fail';
    const mockUserId = 'user-id-partial-fail';
    const mockSessionId = 'session-id-partial-fail';
    const mockProjectId = 'project-id-partial-fail';
    const successfulModelId = 'model-id-success';
    const failingModelId = 'model-id-fail';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [successfulModelId, failingModelId], // One succeeds, one fails
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 1, // One retry is enough for this test
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [{}, {}, {}] } },
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [successfulModelId, failingModelId] }] } },
            'ai_providers': { 
                select: async (state) => {
                    // Handle filtering for specific model IDs
                    const idFilter = state.filters.find(f => f.type === 'eq' && f.column === 'id');
                    if (idFilter) {
                        const modelId = idFilter.value;
                        if (modelId === successfulModelId) {
                            return {
                                data: [{ id: successfulModelId, api_identifier: 'api-success', name: 'Success Model', provider: 'test' }],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK'
                            };
                        } else if (modelId === failingModelId) {
                            return {
                                data: [{ id: failingModelId, api_identifier: 'api-fail', name: 'Fail Model', provider: 'test' }],
                                error: null,
                                count: 1,
                                status: 200,
                                statusText: 'OK'
                            };
                        }
                    }
                    // Default: return all
                    return {
                        data: [
                            { id: successfulModelId, api_identifier: 'api-success', name: 'Success Model', provider: 'test' },
                            { id: failingModelId, api_identifier: 'api-fail', name: 'Fail Model', provider: 'test' },
                        ],
                        error: null,
                        count: 2,
                        status: 200,
                        statusText: 'OK'
                    };
                }
            },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const rpcSpy = mockSupabase.spies.rpcSpy;

    // Mock AI to fail for the specific failing model
    const mockCallUnifiedAIModel = spy(async (modelId: string): Promise<UnifiedAIResponse> => {
        if (modelId === 'api-fail') {
            return { content: null, error: 'AI always fails for this model', finish_reason: 'error' };
        }
        return { content: 'Successful content', error: null, finish_reason: 'stop' };
    });

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: 'contrib-id-success',
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: successfulModelId,
        model_name: 'Success Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/success.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'success.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 500,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        target_contribution_id: null,
        tokens_used_input: 5,
        tokens_used_output: 10,
    }, null);

    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-partial'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        
        // 3. Assertions
        const finalUpdateArgs = updateSpy.callsArgs[updateSpy.callsArgs.length -1][0];

        if (finalUpdateArgs && typeof finalUpdateArgs === 'object' && 'status' in finalUpdateArgs && 'error_details' in finalUpdateArgs) {
            assertEquals(finalUpdateArgs.status, 'retry_loop_failed', "Job should be marked as retry_loop_failed due to partial failure");
            assertExists(finalUpdateArgs.error_details);
            const errorDetails = finalUpdateArgs.error_details;
            if (errorDetails && typeof errorDetails === 'object') {
                assertObjectMatch(errorDetails, {
                    final_error: 'Job failed for 1 model(s) after exhausting all 1 retries.',
                });
            } else {
                throw new Error('error_details did not have the expected shape.');
            }
        } else {
            throw new Error('Final update call did not have the expected shape for failure.');
        }

        assertEquals(mockCallUnifiedAIModel.calls.length, 3, 'AI should be called for both models, with one retry');
        assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "Should only save the successful contribution");
        
        // start (success), start (fail), retry, start (fail retry), received, failed, complete = 7 notifications  
        assertEquals(rpcSpy.calls.length, 7, 'Should send all relevant notifications');

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});


Deno.test('processSimpleJob - Database Error on Update', async () => {
    // 1. Mocks and Test Data
    const mockJobId = 'job-id-db-fail';
    const mockUserId = 'user-id-db-fail';
    const mockModelProviderId = 'model-id-db-fail';
    const mockSessionId = 'session-id-db-fail';
    const mockProjectId = 'project-id-db-fail';

    const mockPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelProviderId],
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
    };

    const dbError = new Error('PostgREST Test Error');
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { update: { data: [], error: dbError } }, // Force an error
            'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id' }] } },
            'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
            'dialectic_sessions': { select: { data: [{ id: mockSessionId }] } },
            'ai_providers': { select: { data: [{ id: mockModelProviderId }] } },
            'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', resource_description: JSON.stringify({type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1}) }] } },
        },
    });

    const loggerErrorSpy = spy(logger, 'error');

    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'This will cause an update that fails',
        error: null,
        finish_reason: 'stop',
    }));

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({ 
        id: 'contrib-id-db-fail',
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: mockModelProviderId,
        model_name: 'Test Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/db-fail.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'db-fail.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 1000,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        target_contribution_id: null,
        tokens_used_input: 5,
        tokens_used_output: 10,
    }, null);
    
    const downloadFromStorageSpy = spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('A seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: mockCallUnifiedAIModel,
        downloadFromStorage: downloadFromStorageSpy,
        fileManager: mockFileManager,
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-db-fail'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    };

    try {
        // 2. Execute
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            validatedPayload,
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        // 3. Assertions
        assert(loggerErrorSpy.calls.some(call => {
            const message = call.args[0];
            return typeof message === 'string' && message.includes('Failed to update job status to \'retrying\'');
        }), 'Should log an error about the failed database update during retry');

    } finally {
        loggerErrorSpy.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Removed: processSimpleJob - Invalid Payload test
// This test is no longer relevant since payload validation moved to handleJob
/*
Deno.test('processSimpleJob - Invalid Payload', async () => {
    const localLoggerError = spy(logger, 'error');

    const mockJobId = 'job-id-invalid';
    const mockUserId = 'user-id-invalid';
    
    const mockPayload: Json = {
        // Missing required fields like sessionId, projectId, etc.
        some_invalid_prop: 'foo',
    };

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: mockUserId,
        session_id: 'any-session',
        stage_slug: 'thesis',
        payload: mockPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        iteration_number: 1,
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
    };
    
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': { 
                update: { data: [{ id: mockJobId, status: 'failed' }] } 
            },
        }
    });

    const mockDeps: GenerateContributionsDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: '', error: null, finish_reason: 'stop', tokenUsage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 } })),
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: new ArrayBuffer(0), error: null })),
        fileManager: new MockFileManagerService(),
        logger: logger,
        randomUUID: spy(() => 'mock-uuid-invalid'),
        getExtensionFromMimeType: spy(() => '.md'),
        deleteFromStorage: spy(async () => ({ error: null })),
    };

    try {
        await processSimpleJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            mockJob,
            mockPayload as any, // Pass the raw invalid payload for testing error handling
            mockUserId,
            mockDeps,
            'mock-auth-token',
        );

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);

        assertEquals(updateSpy.callCount, 1);
        const finalUpdateArgs = updateSpy.callsArgs[0][0];
        if (finalUpdateArgs && typeof finalUpdateArgs === 'object' && 'status' in finalUpdateArgs && 'error_details' in finalUpdateArgs) {
            assertEquals(finalUpdateArgs.status, 'failed');
            assertExists(finalUpdateArgs.error_details);
            const errorDetails = finalUpdateArgs.error_details;

            if (errorDetails && typeof errorDetails === 'object' && 'error' in errorDetails && typeof errorDetails.error === 'string') {
                assert(errorDetails.error.includes('Invalid job payload: sessionId must be a string'));
            } else {
                throw new Error('error_details did not have the expected shape.');
            }
        } else {
            throw new Error('Final update call did not have the expected shape for failure.');
        }

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});
*/

