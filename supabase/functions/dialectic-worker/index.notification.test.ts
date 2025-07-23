import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type {
  DialecticContributionRow,
  IContinueJobResult,
  ProcessSimpleJobDeps,
  SeedPromptData,
  UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { logger } from '../_shared/logger.ts';
import { handleJob } from './index.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Import real processor functions for integration testing
import { processSimpleJob } from './processSimpleJob.ts';
import { processComplexJob } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import type { IJobProcessors } from './processJob.ts';
import {
  mockContributionRow
} from '../_shared/utils/notification.service.mock.ts';
import type { 
  NotificationServiceType, 
} from '../_shared/types/notification.service.types.ts';

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
    model_id: mockModelId,
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
          data: [{}],
          error: null,
        },
      },
    },
  );

  const mockFileManager = new MockFileManagerService();
  const mockContributionRecord: DialecticContributionRow = {
    ...mockContributionRow,
    id: mockContributionId,
    session_id: mockSessionId,
    user_id: mockUserId,
    model_id: mockModelId
  };

  mockFileManager.setUploadAndRegisterFileResponse(mockContributionRecord, null);

  // Instantiate the real service with our mock client
  const notificationService: NotificationServiceType = new NotificationService(
    mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
  );
  // Spy on the instance methods
  const sendStartedSpy = spy(
    notificationService,
    'sendContributionStartedEvent',
  );
  const sendDialecticStartedSpy = spy(
    notificationService,
    'sendDialecticContributionStartedEvent',
  );
  const sendReceivedSpy = spy(
    notificationService,
    'sendContributionReceivedEvent',
  );
  const sendCompleteSpy = spy(
    notificationService,
    'sendContributionGenerationCompleteEvent',
  );

  const mockDeps: ProcessSimpleJobDeps = {
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
    notificationService, // Pass the service instance as a dependency
    randomUUID: spy(() => 'uuid-notify-success'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
    getSeedPromptForStage: spy(
      async (): Promise<SeedPromptData> =>
        await Promise.resolve({
          content: 'seed prompt content',
          fullPath: 'prompts/prompt.md',
          bucket: 'test-bucket',
          path: 'prompts/',
          fileName: 'prompt.md',
        }),
    ),
    continueJob: spy(
      async (): Promise<IContinueJobResult> =>
        await Promise.resolve({ enqueued: false }),
    ),
    retryJob: spy(() => { throw new Error('Simulated retry'); }),
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
    assertEquals(sendStartedSpy.calls.length, 1);
    assertEquals(sendStartedSpy.calls[0].args[0].job_id, mockJobId);

    assertEquals(sendDialecticStartedSpy.calls.length, 1);
    assertEquals(sendDialecticStartedSpy.calls[0].args[0].job_id, mockJobId);

    assertEquals(sendReceivedSpy.calls.length, 1);
    assertEquals(sendReceivedSpy.calls[0].args[0].job_id, mockJobId);

    assertEquals(sendCompleteSpy.calls.length, 0);
  } finally {
    mockSupabaseSetup.clearAllStubs?.();
    sendStartedSpy.restore();
    sendDialecticStartedSpy.restore();
    sendReceivedSpy.restore();
    sendCompleteSpy.restore();
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
      model_id: mockModelId,
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
    const mockContributionRecord: DialecticContributionRow = {
      ...mockContributionRow,
      id: mockContributionId,
      session_id: mockSessionId,
      user_id: mockUserId,
      model_id: mockModelId
    };
    mockFileManager.setUploadAndRegisterFileResponse(mockContributionRecord, null);
  
    const notificationService = new NotificationService(mockSupabaseSetup.client as unknown as SupabaseClient<Database>);
    const sendStartedSpy = spy(notificationService, 'sendContributionStartedEvent');
    const sendDialecticStartedSpy = spy(notificationService, 'sendDialecticContributionStartedEvent');
    const sendReceivedSpy = spy(notificationService, 'sendContributionReceivedEvent');


    const continueJobSpy = spy(
      async (): Promise<IContinueJobResult> =>
        await Promise.resolve({ enqueued: true }),
    );

    const mockDeps: ProcessSimpleJobDeps = {
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
      notificationService, // Instantiate a new service for this test
      randomUUID: spy(() => 'uuid-notify-continue'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
      getSeedPromptForStage: spy(
        async (): Promise<SeedPromptData> =>
          await Promise.resolve({
            content: 'seed prompt content',
            fullPath: 'prompts/prompt.md',
            bucket: 'test-bucket',
            path: 'prompts/',
            fileName: 'prompt.md',
          }),
      ),
      continueJob: continueJobSpy,
      retryJob: spy(() => { throw new Error('Simulated retry'); }),
    };
  
    try {
      await handleJob(
        mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        mockJob,
        mockDeps,
        'mock-auth-token',
        processors,
      );
  
      assertEquals(sendStartedSpy.calls.length, 1);
      assertEquals(sendStartedSpy.calls[0].args[0].job_id, mockJobId);

      assertEquals(sendDialecticStartedSpy.calls.length, 1);
      assertEquals(sendDialecticStartedSpy.calls[0].args[0].job_id, mockJobId);

      assertEquals(sendReceivedSpy.calls.length, 1);
      assertEquals(sendReceivedSpy.calls[0].args[0].job_id, mockJobId);
      
      const receivedCallArgs = sendReceivedSpy.calls[0].args[0];
      assertEquals(receivedCallArgs.is_continuing, true, 'is_continuing flag should be true');
      
      assertExists(continueJobSpy.calls);
      assertEquals(continueJobSpy.calls.length, 1, "A new job should have been enqueued for continuation");
  
    } finally {
      mockSupabaseSetup.clearAllStubs?.();
      sendStartedSpy.restore();
      sendDialecticStartedSpy.restore();
      sendReceivedSpy.restore();
    }
  });

Deno.test('dialectic-worker - Notification Test: Sends failure notification on unhandled exception', async () => {
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
      model_id: mockModelId,
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

    const notificationService = new NotificationService(mockSupabaseSetup.client as unknown as SupabaseClient<Database>);
    const sendFailedSpy = spy(notificationService, 'sendContributionFailedNotification');

    const unhandledExceptionMessage = 'Simulated unhandled exception';
    const mockDeps: ProcessSimpleJobDeps = {
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
      notificationService, // Instantiate a new service for this test
      randomUUID: spy(() => 'uuid-notify-fail'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
      getSeedPromptForStage: spy(
        async (): Promise<SeedPromptData> =>
          await Promise.resolve({
            content: 'seed prompt content',
            fullPath: 'prompts/prompt.md',
            bucket: 'test-bucket',
            path: 'prompts/',
            fileName: 'prompt.md',
          }),
      ),
      continueJob: spy(
        async (): Promise<IContinueJobResult> =>
          await Promise.resolve({ enqueued: false }),
      ),
      retryJob: spy(() => { throw new Error(unhandledExceptionMessage); }),
    };
  
    await handleJob(
      mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
      mockJob,
      mockDeps,
      'mock-auth-token',
      processors,
    );

    assertEquals(sendFailedSpy.calls.length, 1);
    const failureNotificationArg = sendFailedSpy.calls[0].args[0];
    assertEquals(failureNotificationArg.type, 'contribution_generation_failed');
    assertEquals(failureNotificationArg.job_id, mockJobId);
    assertEquals(failureNotificationArg.error?.message, unhandledExceptionMessage);
    
    sendFailedSpy.restore();
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
    model_id: 'model-id-1',
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
        'create_notification_for_user': {
          data: [{}],
          error: null,
        },
      },
    },
  );

  const notificationService = new NotificationService(mockSupabaseSetup.client as unknown as SupabaseClient<Database>);
  const sendFailedSpy = spy(notificationService, 'sendContributionFailedNotification');

  const mockDeps: ProcessSimpleJobDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null, finish_reason: 'stop' })),
    downloadFromStorage: spy(async () => await Promise.resolve({ data: new ArrayBuffer(0), mimeType: '', error: new Error('should not be called') })),
    logger: logger,
    fileManager: new MockFileManagerService(),
    notificationService, // Instantiate a new service for this test
    randomUUID: spy(() => 'uuid-catastrophic-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
    getSeedPromptForStage: spy(
      async (): Promise<SeedPromptData> =>
        await Promise.resolve({
          content: 'seed prompt content',
          fullPath: 'prompts/prompt.md',
          bucket: 'test-bucket',
          path: 'prompts/',
          fileName: 'prompt.md',
        }),
    ),
    continueJob: spy(
      async (): Promise<IContinueJobResult> =>
        await Promise.resolve({ enqueued: false }),
    ),
    retryJob: spy(() => { throw new Error('Simulated retry'); }),
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
    assertEquals(sendFailedSpy.calls.length, 1);
    
    const notificationArgs = sendFailedSpy.calls[0].args[0];
    assertEquals(notificationArgs.job_id, mockJobId);
    assertEquals(notificationArgs.error?.message, 'An unexpected error occurred: Job payload is invalid or missing required fields.');
  } finally {
    mockSupabaseSetup.clearAllStubs?.();
    sendFailedSpy.restore();
  }
});