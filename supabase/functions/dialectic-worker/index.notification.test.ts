import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import type { FinishReason } from '../_shared/types.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { logger } from '../_shared/logger.ts';
import { handleJob } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Import real processor functions for integration testing
import { processSimpleJob } from './processSimpleJob.ts';
import { processComplexJob } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import type { IJobProcessors } from './processJob.ts';

// Define a type for our mock job for clarity
type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

// Helper to create real processors for integration testing
function createRealProcessors(): IJobProcessors {
  return {
    processSimpleJob,
    processComplexJob,
    planComplexStage,
  };
}

Deno.test('dialectic-worker - Notification Test: Sends all notifications on a successful, non-continuing contribution', async () => {
  // 1. Setup
  const mockJobId = 'job-id-notify-success';
  const mockUserId = 'user-id-notify-success';
  const mockSessionId = 'session-id-notify-success';
  const mockModelId = 'model-id-notify-success';
  const mockContributionId = 'contribution-id-notify-success';
  const mockProjectId = 'project-id-notify-success';
  const processors = createRealProcessors();
  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: [mockModelId],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
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

  const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
    mockUserId,
    {
      genericMockResults: {
        'dialectic_generation_jobs': {
          update: { data: [{}, {}] },
        },
        'dialectic_stages': {
          select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', name: 'Thesis', display_name: 'Thesis' }] },
        },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, associated_chat_id: 'chat-abc' }] } },
        'ai_providers': {
          select: {
            data: [{
              id: mockModelId,
              name: 'Test Model',
              api_identifier: 'test-model-api',
              provider: 'test_provider',
              config: {
                provider_max_input_tokens: 4096,
                provider_max_output_tokens: 1024,
              },
            }],
          },
        },
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
      rpcResults: {
        'create_notification_for_user': {
          data: [{ notification_id: 'notif-123' }],
          error: null,
        },
      },
    },
  );

  const mockFileManager = new MockFileManagerService();
  const mockContributionRecord: Database['public']['Tables']['dialectic_contributions']['Row'] =
    {
      id: mockContributionId,
      session_id: mockSessionId,
      user_id: mockUserId,
      model_id: mockModelId,
      model_name: 'Test Model',
      stage: 'thesis',
      iteration_number: 1,
      storage_path: 'path/to/',
      storage_bucket: 'test-bucket',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_latest_edit: true,
      edit_version: 1,
      citations: null,
      contribution_type: 'model_generated',
      error: null,
      file_name: 'file.md',
      mime_type: 'text/markdown',
      original_model_contribution_id: null,
      processing_time_ms: 1000,
      prompt_template_id_used: null,
      raw_response_storage_path: 'path/to/raw.json',
      seed_prompt_url: null,
      size_bytes: 123,
      target_contribution_id: null,
      tokens_used_input: 10,
      tokens_used_output: 20,
    };
  mockFileManager.setUploadAndRegisterFileResponse(mockContributionRecord, null);

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
      content: 'Successful AI response',
      error: null,
      finish_reason: 'stop',
    })),
    downloadFromStorage: spy(
      async (): Promise<DownloadStorageResult> => {
        const seedContent = 'seed prompt content';
        const blob = new Blob([seedContent], { type: 'text/plain' });
        return await Promise.resolve({
          data: await blob.arrayBuffer(),
          mimeType: blob.type,
          error: null,
        });
      },
    ),
    logger: logger,
    fileManager: mockFileManager,
    randomUUID: spy(() => 'uuid-notify-success'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    // 2. Execution
    await handleJob(
      mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      mockJob,
      mockDeps,
      'mock-auth-token',
      processors,
    );

    // 3. Assertions
    const rpcSpy = mockSupabaseSetup.spies.rpcSpy;
    assertExists(rpcSpy, 'The RPC spy object does not exist');
    assertEquals(
      rpcSpy.calls.length,
      4,
      `Expected 4 notifications, but got ${rpcSpy.calls.length}: ${rpcSpy.calls.map(c => c.args[1].notification_type).join(', ')}`,
    );

    // 1. contribution_generation_started
    const call1 = rpcSpy.calls[0].args[1];
    assertEquals(call1.notification_type, 'contribution_generation_started');

    // 2. dialectic_contribution_started
    const call2 = rpcSpy.calls[1].args[1];
    assertEquals(call2.notification_type, 'dialectic_contribution_started');
    assertEquals(call2.notification_data.model_id, mockModelId);

    // 3. dialectic_contribution_received
    const call3 = rpcSpy.calls[2].args[1];
    assertEquals(call3.notification_type, 'dialectic_contribution_received');
    assertExists(call3.notification_data.contribution);
    assertEquals(
        call3.notification_data.contribution.id,
        mockContributionId,
    );
    assertEquals(call3.notification_data.is_continuing, false);

    // 4. contribution_generation_complete
    const call4 = rpcSpy.calls[3].args[1];
    assertEquals(call4.notification_type, 'contribution_generation_complete');
    assertEquals(call4.notification_data.sessionId, mockSessionId);
  } finally {
    mockSupabaseSetup.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Notification Test: Sends correct notifications for a continuing contribution', async () => {
    // 1. Setup
    const mockJobId = 'job-id-notify-continue';
    const mockUserId = 'user-id-notify-continue';
    const mockSessionId = 'session-id-notify-continue';
    const mockModelId = 'model-id-notify-continue';
    const mockContributionId = 'contribution-id-notify-continue';
    const mockProjectId = 'project-id-notify-continue';
    const processors = createRealProcessors();
    const mockPayloadJson: Json = {
      sessionId: mockSessionId,
      projectId: mockProjectId,
      stageSlug: 'thesis',
      selectedModelIds: [mockModelId],
      continueUntilComplete: true, // Key for this test
    };
  
    const mockJob: MockJob = {
      id: mockJobId,
      session_id: mockSessionId,
      stage_slug: 'thesis',
      iteration_number: 1,
      payload: mockPayloadJson,
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
  
    const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
      mockUserId,
      {
        genericMockResults: {
          'dialectic_generation_jobs': {
            update: { data: [{}] },
            insert: { data: [{id: 'new-job-id'}] },
          },
          'dialectic_stages': {
            select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', name: 'Thesis' }] },
          },
          'dialectic_sessions': { select: { data: [{ id: mockSessionId, associated_chat_id: 'chat-abc' }] } },
          'ai_providers': {
            select: {
              data: [{
                id: mockModelId,
                name: 'Test Model',
                api_identifier: 'test-model-api',
                provider: 'test_provider',
                config: {
                  provider_max_input_tokens: 4096,
                  provider_max_output_tokens: 1024,
                },
              }],
            },
          },
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
        rpcResults: {
          'create_notification_for_user': {
            data: [{ notification_id: 'notif-continue' }],
            error: null,
          },
        },
      },
    );
  
    const mockFileManager = new MockFileManagerService();
    const mockContributionRecord: Database['public']['Tables']['dialectic_contributions']['Row'] =
      {
        id: mockContributionId, session_id: mockSessionId, user_id: mockUserId, model_id: mockModelId,
        model_name: 'Test Model', stage: 'thesis', iteration_number: 1, storage_path: 'path/to/file.md',
        storage_bucket: 'test-bucket', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        is_latest_edit: true, edit_version: 1, citations: null, contribution_type: 'model_generated', error: null,
        file_name: 'file.md', mime_type: 'text/markdown', original_model_contribution_id: null,
        processing_time_ms: 1000, prompt_template_id_used: null, raw_response_storage_path: 'path/to/raw.json',
        seed_prompt_url: null, size_bytes: 123, target_contribution_id: null, tokens_used_input: 10,
        tokens_used_output: 20,
      };
    mockFileManager.setUploadAndRegisterFileResponse(mockContributionRecord, null);
  
    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'Partial AI response',
        error: null,
        finish_reason: 'length', // Important: 'length' triggers continuation
      })),
      downloadFromStorage: spy(
        async (): Promise<DownloadStorageResult> => {
            const seedContent = 'seed prompt content for continuation';
            const blob = new Blob([seedContent], { type: 'text/plain' });
            return await Promise.resolve({
              data: await blob.arrayBuffer(),
              mimeType: blob.type,
              error: null,
            });
        },
      ),
      logger: logger,
      fileManager: mockFileManager,
      randomUUID: spy(() => 'uuid-notify-continue'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };
  
    try {
      await handleJob(
        mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        mockJob,
        mockDeps,
        'mock-auth-token',
        processors,
      );
  
      const rpcSpy = mockSupabaseSetup.spies.rpcSpy;
      assertExists(rpcSpy, 'RPC spy should exist');
      assertEquals(rpcSpy.calls.length, 3, `Expected 3 notifications, but got ${rpcSpy.calls.length}`);
  
      const call1 = rpcSpy.calls[0].args[1];
      assertEquals(call1.notification_type, 'contribution_generation_started');

      const call2 = rpcSpy.calls[1].args[1];
      assertEquals(call2.notification_type, 'dialectic_contribution_started');
      
      const call3 = rpcSpy.calls[2].args[1];
      assertEquals(call3.notification_type, 'dialectic_contribution_received');
      assertEquals(call3.notification_data.is_continuing, true, 'is_continuing flag should be true');
      
      const insertSpy = mockSupabaseSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
      assertExists(insertSpy);
      assertEquals(insertSpy.callCount, 1, "A new job should have been inserted for continuation");

    } finally {
      mockSupabaseSetup.clearAllStubs?.();
    }
  });

Deno.test('dialectic-worker - Notification Test: Sends failure and retry notifications on job failure', async () => {
    const mockJobId = 'job-id-notify-fail';
    const mockUserId = 'user-id-notify-fail';
    const mockSessionId = 'session-id-notify-fail';
    const mockModelId = 'model-id-notify-fail';
    const mockProjectId = 'project-id-notify-fail';
    const processors = createRealProcessors();
    const mockPayloadJson: Json = {
      sessionId: mockSessionId,
      projectId: mockProjectId,
      stageSlug: 'thesis',
      selectedModelIds: [mockModelId],
    };

    const mockJob: MockJob = {
      id: mockJobId,
      session_id: mockSessionId,
      stage_slug: 'thesis',
      iteration_number: 1,
      payload: mockPayloadJson,
      status: 'pending',
      attempt_count: 0,
      max_retries: 2, // Fail on first attempt, retry once
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      user_id: mockUserId,
      parent_job_id: null,
      target_contribution_id: null,
    };

    const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
      mockUserId,
      {
        genericMockResults: {
          'dialectic_generation_jobs': {
            update: { data: [{}, {}] },
          },
          'dialectic_stages': {
            select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', name: 'Thesis', display_name: 'Thesis' }] },
          },
           'dialectic_sessions': { select: { data: [{ id: mockSessionId, associated_chat_id: 'chat-abc' }] } },
           'ai_providers': {
            select: {
              data: [{
                id: mockModelId, name: 'Test Model', api_identifier: 'test-model-api', provider: 'test_provider',
                config: { provider_max_input_tokens: 4096, provider_max_output_tokens: 1024 },
              }],
            },
          },
          'dialectic_project_resources': {
            select: {
              data: [{
                storage_bucket: 'test-bucket', storage_path: 'prompts/', file_name: 'prompt.md',
                resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
              }],
            },
          },
        },
        rpcResults: {
          'create_notification_for_user': {
            data: [{ notification_id: 'notif-fail' }],
            error: null,
          },
        },
      },
    );

    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
        content: null,
        error: 'Simulated AI provider failure',
        finish_reason: 'error',
      })),
      downloadFromStorage: spy(
        async (): Promise<DownloadStorageResult> => {
            const seedContent = 'seed prompt content for failure';
            const blob = new Blob([seedContent], { type: 'text/plain' });
            return await Promise.resolve({
              data: await blob.arrayBuffer(),
              mimeType: blob.type,
              error: null,
            });
        },
      ),
      logger: logger,
      fileManager: new MockFileManagerService(),
      randomUUID: spy(() => 'uuid-notify-fail'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };
  
    try {
      await handleJob(
        mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        mockJob,
        mockDeps,
        'mock-auth-token',
        processors,
      );
  
      const rpcSpy = mockSupabaseSetup.spies.rpcSpy;
      assertExists(rpcSpy);
      assertEquals(rpcSpy.calls.length, 7, `Expected 7 notifications, but got ${rpcSpy.calls.length}: ${rpcSpy.calls.map(c => c.args[1].notification_type).join(', ')}`);

      // Order: Job Started -> Model Started -> Retrying -> Model Started -> Retrying -> Model Started -> Job Failed
      const types = rpcSpy.calls.map(c => c.args[1].notification_type);
      assertEquals(types[0], 'contribution_generation_started');
      assertEquals(types[1], 'dialectic_contribution_started');
      assertEquals(types[2], 'contribution_generation_retrying');
      assertEquals(types[3], 'dialectic_contribution_started');
      assertEquals(types[4], 'contribution_generation_retrying');
      assertEquals(types[5], 'dialectic_contribution_started');
      assertEquals(types[6], 'contribution_generation_failed');

      const finalCall = rpcSpy.calls[rpcSpy.calls.length - 1].args[1];
      assertEquals(finalCall.notification_data.sessionId, mockSessionId);
      assertExists(finalCall.notification_data.error);
      
    } finally {
      mockSupabaseSetup.clearAllStubs?.();
    }
});

Deno.test('dialectic-worker - Notification Test: Sends a single failure notification on catastrophic failure', async () => {
  // 1. Setup - Create a job with an invalid payload (missing projectId)
  const mockJobId = 'job-id-catastrophic-fail';
  const mockUserId = 'user-id-catastrophic-fail';
  const mockSessionId = 'session-id-catastrophic-fail';
  const processors = createRealProcessors();  
  // Invalid payload: projectId is missing
  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    stageSlug: 'thesis',
    selectedModelIds: ['model-id-1'],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
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

  const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
    mockUserId,
    {
      genericMockResults: {
        'dialectic_generation_jobs': { update: { data: [{}] } },
      },
      rpcResults: {
        'create_notification_for_user': { data: [{ notification_id: 'notif-fail' }] },
      },
    },
  );

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null, finish_reason: 'stop' })),
    downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), mimeType: '', error: new Error('should not be called') })),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-catastrophic-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  // 2. Execution
  try {
    await handleJob(
      mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      mockJob,
      mockDeps,
      'mock-auth-token',
      processors,
    );
  
    // 3. Assertions
    const rpcSpy = mockSupabaseSetup.spies.rpcSpy;
    assertExists(rpcSpy);
    assertEquals(rpcSpy.calls.length, 1, 'Expected exactly one notification for a catastrophic failure');
    
    const notification = rpcSpy.calls[0].args[1];
    assertEquals(notification.notification_type, 'contribution_generation_failed');
    assertEquals(notification.notification_data.reason, 'An unexpected error occurred: Error: projectId must be a string');
  } finally {
    mockSupabaseSetup.clearAllStubs?.();
  }
});


Deno.test('dialectic-worker - Notification Test: Handles partial success (one model fails, one succeeds)', async () => {
    // 1. Setup
    const mockJobId = 'job-id-partial-success';
    const mockUserId = 'user-id-partial-success';
    const mockSessionId = 'session-id-partial-success';
    const successModelId = 'model-id-success';
    const failureModelId = 'model-id-failure';
    const mockContributionId = 'contribution-id-partial-success';
    const mockProjectId = 'project-id-partial-success';
    const processors = createRealProcessors();
    const mockPayloadJson: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [successModelId, failureModelId],
    };

    const mockJob: MockJob = {
        id: mockJobId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: mockPayloadJson,
        status: 'pending',
        attempt_count: 0,
        max_retries: 1, // Only one attempt to simplify the test
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        user_id: mockUserId,
        parent_job_id: null,
        target_contribution_id: null,
    };

    const mockSupabaseSetup: MockSupabaseClientSetup = createMockSupabaseClient(
        mockUserId,
        {
            genericMockResults: {
                'dialectic_generation_jobs': { update: { data: [{}, {}] } },
                'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', name: 'Thesis', display_name: 'Thesis' }] } },
                'dialectic_sessions': { select: { data: [{ id: mockSessionId, associated_chat_id: 'chat-abc' }] } },
                'ai_providers': {
                    select: async (state: { filters: { column?: string; value?: any }[] }) => {
						const idFilter = state.filters.find((f) => f.column === 'id');
						if (idFilter) {
							const id = idFilter.value;
							if (id === successModelId) {
								return {
									data: [
										{ id: successModelId, name: 'Success Model', api_identifier: 'success-api', provider: 'test', config: {} },
									],
									error: null,
								};
							}
							if (id === failureModelId) {
								return {
									data: [
										{ id: failureModelId, name: 'Failure Model', api_identifier: 'failure-api', provider: 'test', config: {} },
									],
									error: null,
								};
							}
						}
						// Default case or if no ID matches
						return { data: null, error: new Error(`Mock Error: AI Provider with id ${idFilter?.value} not found.`) };
					},
                },
                'dialectic_project_resources': { select: { data: [{ storage_bucket: 'b', storage_path: 'p', resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }), file_name: 'f.md' }] } },
            },
            rpcResults: { 'create_notification_for_user': { data: [{}] } },
        },
    );

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
        id: mockContributionId,
        session_id: mockSessionId,
        user_id: mockUserId,
        model_id: successModelId,
        model_name: 'Success Model',
        stage: 'thesis',
        iteration_number: 1,
        storage_path: 'path/to/partial_success.md',
        storage_bucket: 'test-bucket',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_latest_edit: true,
        edit_version: 1,
        citations: null,
        contribution_type: 'model_generated',
        error: null,
        file_name: 'partial_success.md',
        mime_type: 'text/markdown',
        original_model_contribution_id: null,
        processing_time_ms: 1000,
        prompt_template_id_used: null,
        raw_response_storage_path: 'path/to/raw.json',
        seed_prompt_url: null,
        size_bytes: 123,
        target_contribution_id: null,
        tokens_used_input: 10,
        tokens_used_output: 20,
    }, null);

    const callUnifiedAIModelSpy = spy(async (modelIdentifier: string): Promise<UnifiedAIResponse> => {
        if (modelIdentifier === 'success-api') {
            return { content: 'Successful response', error: null, finish_reason: 'stop' };
        } else if (modelIdentifier === 'failure-api') {
            return { content: null, error: 'Simulated failure', finish_reason: 'error' };
        }
        // Fallback for unexpected calls
        return { content: null, error: `Unexpected model identifier: ${modelIdentifier}`, finish_reason: 'error' };
    });

    const mockDeps = {
        callUnifiedAIModel: callUnifiedAIModelSpy,
        downloadFromStorage: spy(async () => {
            const seedContent = 'seed prompt content';
            const blob = new Blob([seedContent], { type: 'text/plain' });
            return await Promise.resolve({
              data: await blob.arrayBuffer(),
              mimeType: blob.type,
              error: null,
            });
        }),
        logger: logger,
        fileManager: mockFileManager,
        randomUUID: spy(() => 'uuid-partial-success'),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
        getExtensionFromMimeType: spy(() => '.md'),
    };

    // 2. Execution
    try {
        await handleJob(
            mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            mockJob,
            mockDeps,
            'mock-auth-token',
            processors,
        );

        // 3. Assertions
        const rpcSpy = mockSupabaseSetup.spies.rpcSpy;
        assertExists(rpcSpy);

        const notifications = rpcSpy.calls.map(c => c.args[1].notification_type);
        
        // Expected flow: Job Started -> Model Started (Success) -> Model Started (Failure) -> Contribution Received (Success) -> Retrying -> Model Started (Retry) -> Job Failed -> Job Complete
        assertEquals(notifications.length, 8, `Expected 8 notifications, but got ${notifications.length}: ${notifications.join(', ')}`);
        
        assertEquals(notifications[0], 'contribution_generation_started');
        assertEquals(notifications[1], 'dialectic_contribution_started');
        assertEquals(notifications[2], 'dialectic_contribution_started');
        assertEquals(notifications[3], 'dialectic_contribution_received');
        assertEquals(notifications[4], 'contribution_generation_retrying');
        assertEquals(notifications[5], 'dialectic_contribution_started');
        assertEquals(notifications[6], 'contribution_generation_failed');
        assertEquals(notifications[7], 'contribution_generation_complete');

        // Check details for the received contribution
        const receivedNotif = rpcSpy.calls.find(c => c.args[1].notification_type === 'dialectic_contribution_received');
        assertExists(receivedNotif, "The 'dialectic_contribution_received' notification was not found.");
        assertEquals(receivedNotif.args[1].notification_data.contribution.id, mockContributionId);

    } finally {
        mockSupabaseSetup.clearAllStubs?.();
    }
}); 
