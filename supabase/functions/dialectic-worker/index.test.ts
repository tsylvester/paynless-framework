import {
  assertEquals,
  assertExists,
  assertObjectMatch,
  assertStringIncludes,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { returnsNext, spy, stub, type Spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json, TablesInsert } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { GenerateContributionsPayload, UnifiedAIResponse, DialecticContribution } from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult, DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';
import { logger, type Logger } from '../_shared/logger.ts';
import { handleJob, validatePayload, isDialecticContribution, isSelectedAiProvider } from './index.ts';
import type { FileRecord, UploadContext, FileManagerResponse } from '../_shared/types/file_manager.types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
// Define a type for our mock job for clarity
type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

function isJobWithPayload(obj: unknown): obj is { payload: Json } {
  return typeof obj === 'object' && obj !== null && 'payload' in obj;
}

Deno.test('dialectic-worker - Fails if fetching AI provider details fails', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-provider-fetch-fail';
  const mockUserId = 'user-id-provider-fetch-fail';
  const mockSessionId = 'session-id-provider-fetch-fail';
  const mockProjectId = 'project-id-provider-fetch-fail';
  const mockModelId = 'model-id-provider-fetch-fail';

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
    max_retries: 1, // Fail on first attempt
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    user_id: mockUserId,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}] }, 
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'ai_providers': { 
        select: { data: null, error: new Error('DB connection error') } // This is the failure point
      },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-provider-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 2, 'Job status should be updated twice (processing, then failed)');
    
    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'retry_loop_failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'failedAttempts' in errorDetails &&
        Array.isArray(errorDetails.failedAttempts) &&
        errorDetails.failedAttempts.length > 0 &&
        typeof errorDetails.failedAttempts[0] === 'object' &&
        errorDetails.failedAttempts[0] !== null &&
        'error' in errorDetails.failedAttempts[0] &&
        typeof errorDetails.failedAttempts[0].error === 'string'
    ) {
        assertStringIncludes(errorDetails.failedAttempts[0].error, 'Failed to fetch provider details');
    } else {
        assert(false, 'error_details is not in the expected format');
    }
    } else {
      assert(false, 'Second update call did not have the expected shape for failed status');
    }

  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Fails if AI provider data is mismatched', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-provider-mismatch';
  const mockUserId = 'user-id-provider-mismatch';
  const mockSessionId = 'session-id-provider-mismatch';
  const mockProjectId = 'project-id-provider-mismatch';
  const mockModelId = 'model-id-provider-mismatch';

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
    max_retries: 1, 
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    user_id: mockUserId,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}] }, 
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'ai_providers': { 
        select: { data: [{ id: mockModelId, name: 'Mismatched Model', api_identifier: null, provider: 'test' }] } // Mismatched data
      },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-provider-mismatch'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 2);
    
    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'retry_loop_failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'failedAttempts' in errorDetails &&
        Array.isArray(errorDetails.failedAttempts) &&
        errorDetails.failedAttempts.length > 0 &&
        typeof errorDetails.failedAttempts[0] === 'object' &&
        errorDetails.failedAttempts[0] !== null &&
        'error' in errorDetails.failedAttempts[0] &&
        typeof errorDetails.failedAttempts[0].error === 'string'
    ) {
        assertStringIncludes(errorDetails.failedAttempts[0].error, 'does not match expected structure');
    } else {
        assert(false, 'error_details is not in the expected format');
    }
    } else {
      assert(false, 'Second update call did not have the expected shape for failed status');
    }
  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Fails if fetching project resources fails', async () => {
    const localLoggerError = spy(logger, 'error');
  
    const mockJobId = 'job-id-resource-fail';
    const mockUserId = 'user-id-resource-fail';
    const mockSessionId = 'session-id-resource-fail';
    const mockProjectId = 'project-id-resource-fail';
  
    const mockPayloadJson: Json = {
      sessionId: mockSessionId,
      projectId: mockProjectId,
      stageSlug: 'thesis',
      selectedModelIds: ['model-id'],
    };
  
    const mockJob: MockJob = {
      id: mockJobId,
      session_id: mockSessionId,
      stage_slug: 'thesis',
      iteration_number: 1,
      payload: mockPayloadJson,
      status: 'pending',
      attempt_count: 0,
      max_retries: 1,
      created_at: new Date().toISOString(),
      user_id: mockUserId,
      started_at: null, completed_at: null, results: null, error_details: null, 
    };
  
    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
        'dialectic_generation_jobs': { update: { data: [{}, {}] } },
        'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
        'dialectic_project_resources': { 
          select: { data: null, error: new Error('DB connection error') } 
        },
      },
    });
  
    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error('should not be called') })),
      logger: logger,
      fileManager: new MockFileManagerService(),
      randomUUID: spy(() => 'uuid-resource-fail'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };
  
    try {
      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
      
      const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
      assertExists(updateSpy);
      assertEquals(updateSpy.callCount, 2, 'Job status should be updated to processing, then failed');
      
      const failedArgs = updateSpy.callsArgs[1][0];
      if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
        assertEquals(failedArgs.status, 'failed');
        assert(failedArgs.error_details && typeof failedArgs.error_details === 'object' && 'final_error' in failedArgs.error_details);
        assertStringIncludes(String(failedArgs.error_details.final_error), 'Could not fetch project resources');
      } else {
        assert(false, 'Second update call did not have the expected shape for failed status');
      }
  
    } finally {
      localLoggerError.restore();
      mockSupabase.clearAllStubs?.();
    }
  });
  
  Deno.test('dialectic-worker - Fails if seed prompt content is empty', async () => {
    const localLoggerError = spy(logger, 'error');
  
    const mockJobId = 'job-id-empty-prompt';
    const mockUserId = 'user-id-empty-prompt';
    const mockSessionId = 'session-id-empty-prompt';
    const mockProjectId = 'project-id-empty-prompt';
  
    const mockPayloadJson: Json = {
      sessionId: mockSessionId,
      projectId: mockProjectId,
      stageSlug: 'thesis',
      selectedModelIds: ['model-id'],
    };
  
    const mockJob: MockJob = {
      id: mockJobId,
      session_id: mockSessionId,
      stage_slug: 'thesis',
      iteration_number: 1,
      payload: mockPayloadJson,
      status: 'pending',
      attempt_count: 0,
      max_retries: 1,
      created_at: new Date().toISOString(),
      user_id: mockUserId,
      started_at: null, completed_at: null, results: null, error_details: null,
    };
  
    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
        'dialectic_generation_jobs': { update: { data: [{}, {}] } },
        'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
        'dialectic_project_resources': { 
          select: { 
            data: [{
              storage_bucket: 'test-bucket',
              storage_path: 'prompts/',
              resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
              file_name: 'prompt.md'
            }] 
          } 
        },
      },
    });
  
    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: new ArrayBuffer(0), error: null })), // Empty content
      logger: logger,
      fileManager: new MockFileManagerService(),
      randomUUID: spy(() => 'uuid-empty-prompt'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };
  
    try {
      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
      
      const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
      assertExists(updateSpy);
      const failedArgs = updateSpy.callsArgs[1][0];
      if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
        assertEquals(failedArgs.status, 'failed');
        assert(failedArgs.error_details && typeof failedArgs.error_details === 'object' && 'final_error' in failedArgs.error_details);
        assertStringIncludes(String(failedArgs.error_details.final_error), 'Rendered seed prompt is empty');
      } else {
        assert(false, 'Update call for failed did not have expected shape');
      }
    } finally {
      localLoggerError.restore();
      mockSupabase.clearAllStubs?.();
    }
  });

  Deno.test('dialectic-worker - Fails if FileManager fails to upload', async () => {
    const localLoggerError = spy(logger, 'error');
  
    const mockJobId = 'job-id-fm-fail';
    const mockUserId = 'user-id-fm-fail';
    const mockSessionId = 'session-id-fm-fail';
    const mockProjectId = 'project-id-fm-fail';
    const mockModelId = 'model-id-fm-fail';
  
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
      max_retries: 1,
      created_at: new Date().toISOString(),
      user_id: mockUserId,
      started_at: null, completed_at: null, results: null, error_details: null,
    };
  
    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
        'dialectic_generation_jobs': { update: { data: [{}, {}] } },
        'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: 'chat-123' }] } },
        'ai_providers': { select: { data: [{ id: mockModelId, api_identifier: 'api-fm-fail', name: 'FM Fail Model' }] } },
        'dialectic_project_resources': { 
          select: { 
            data: [{
              storage_bucket: 'test-bucket',
              storage_path: 'prompts/',
              resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
              file_name: 'prompt.md'
            }] 
          } 
        },
      },
    });
  
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(null, new Error("Upload failed"));
  
    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'AI content', error: null })),
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('seed');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
      }),
      logger: logger,
      fileManager: mockFileManager,
      randomUUID: spy(() => 'uuid-fm-fail'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };
  
    try {
      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
      
      const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
      assertExists(updateSpy);
      const failedArgs = updateSpy.callsArgs[1][0];
      if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
        assertEquals(failedArgs.status, 'retry_loop_failed');
        const errorDetails = failedArgs.error_details;
        if (
          errorDetails &&
          typeof errorDetails === 'object' &&
          'failedAttempts' in errorDetails &&
          Array.isArray(errorDetails.failedAttempts) &&
          errorDetails.failedAttempts.length > 0 &&
          typeof errorDetails.failedAttempts[0] === 'object' &&
          errorDetails.failedAttempts[0] !== null &&
          'error' in errorDetails.failedAttempts[0] &&
          typeof errorDetails.failedAttempts[0].error === 'string'
        ) {
          assertStringIncludes(errorDetails.failedAttempts[0].error, 'Failed to save contribution');
        } else {
          assert(false, 'error_details did not have expected shape');
        }
      } else {
        assert(false, 'Update call for failed did not have expected shape');
      }
    } finally {
      localLoggerError.restore();
      mockSupabase.clearAllStubs?.();
    }
  });

Deno.test('dialectic-worker - Happy Path', async () => {
  const localLoggerInfo = spy(logger, 'info');
  const localLoggerError = spy(logger, 'error');

  // 1. Mocks and Test Data
  const mockJobId = 'job-id-happy';
  const mockSessionId = 'session-id-happy';
  const mockProjectId = 'project-id-happy';
  const mockUserId = 'user-id-happy';
  const mockModelProviderId = 'model-id-happy';

  // Create payload as Json-compatible object directly
  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    iterationNumber: 1,
    selectedModelIds: [mockModelProviderId],
    continueUntilComplete: false,
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
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        // First update to 'processing', second to 'completed'
        update: { data: [{}, {}] },
      },
      // ... other required mock data from generateContribution test ...
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
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const rpcSpy = mockSupabase.spies.rpcSpy;

  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
    content: 'Happy path AI content',
    error: null,
  }));

  // Create a proper FileRecord mock that matches one of the union types
  const mockFileRecord: FileRecord = {
    id: 'happy-contrib-id',
    session_id: mockSessionId,
    user_id: mockUserId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: mockModelProviderId,
    model_name: 'Test Model',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'model_generated',
    file_name: 'test-file.md',
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    size_bytes: 1024,
    mime_type: 'text/markdown',
  };

  const mockFileManager = new MockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
    logger: logger,
    randomUUID: spy(() => 'uuid-happy'),
    fileManager: mockFileManager,
  };

  try {
    // 2. Execute the worker function
    // We are assuming a simple handler that takes the job and dependencies.
    // The main index.ts will handle the Request object itself.
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);

    // 3. Assertions
    // Assert job status updates - check call count and verify the calls were made with expected arguments
    assertEquals(updateSpy.callCount, 2, 'Should update job status twice (processing, completed)');
    
    // Verify the first call was for 'processing' status
    const firstCallArgs = updateSpy.callsArgs[0];
    assertExists(firstCallArgs);
    assertEquals(firstCallArgs.length, 1);
    
    const firstCallArg = firstCallArgs[0];
    if (firstCallArg && typeof firstCallArg === 'object' && 'status' in firstCallArg) {
      assertEquals(firstCallArg.status, 'processing');
    }
    
    // Verify the second call was for 'completed' status  
    const secondCallArgs = updateSpy.callsArgs[1];
    assertExists(secondCallArgs);
    assertEquals(secondCallArgs.length, 1);
    
    const secondCallArg = secondCallArgs[0];
    if (secondCallArg && typeof secondCallArg === 'object' && 'status' in secondCallArg) {
      assertEquals(secondCallArg.status, 'completed');
    }


    // Assert AI was called
    assertEquals(mockCallUnifiedAIModel.calls.length, 1, 'AI model should be called once');

    // Assert notification was sent
    assertEquals(rpcSpy.calls.length, 4, 'Notification RPC should be called four times (start, contribution start, received, complete)');
    assertObjectMatch(rpcSpy.calls[0].args[1], {
      target_user_id: mockUserId,
      notification_type: 'contribution_generation_started',
    });
    assertObjectMatch(rpcSpy.calls[1].args[1], {
      target_user_id: mockUserId,
      notification_type: 'dialectic_contribution_started',
    });
    assertObjectMatch(rpcSpy.calls[2].args[1], {
      target_user_id: mockUserId,
      notification_type: 'dialectic_contribution_received',
    });
    assertObjectMatch(rpcSpy.calls[3].args[1], {
      target_user_id: mockUserId,
      notification_type: 'contribution_generation_complete',
    });

  } finally {
    localLoggerInfo.restore();
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Failure and Retry Exhaustion', async () => {
  const localLoggerError = spy(logger, 'error');

  // 1. Mocks and Test Data
  const mockJobId = 'job-id-fail';
  const mockSessionId = 'session-id-fail';
  const mockProjectId = 'project-id-fail';
  const mockUserId = 'user-id-fail';
  const mockModelProviderId = 'model-id-fail';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'antithesis',
    iterationNumber: 1,
    selectedModelIds: [mockModelProviderId],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'antithesis',
    iteration_number: 1,
    payload: mockPayloadJson,
    status: 'pending',
    attempt_count: 0,
    max_retries: 2, // Lower for faster testing
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    user_id: mockUserId,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}, {}] }, // processing, retrying, failed
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-antithesis-id', slug: 'antithesis', display_name: 'Antithesis' }] } },
      'dialectic_projects': { select: { data: [{ user_id: mockUserId }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: 'chat-123' }] } },
      'ai_providers': { select: { data: [{ id: mockModelProviderId, api_identifier: 'api-fail', name: 'Failing Model' }] } },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({
                type: 'seed_prompt',
                session_id: mockSessionId,
                stage_slug: 'antithesis',
                iteration: 1,
            }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const rpcSpy = mockSupabase.spies.rpcSpy;

  // Mock the AI model to always fail
  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
    content: null,
    error: 'AI model failed intentionally',
  }));

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    fileManager: new MockFileManagerService(),
    logger: logger,
    randomUUID: spy(() => 'uuid-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    // 2. Execute
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    // 3. Assertions
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    // AI should be called max_retries times
    assertEquals(mockCallUnifiedAIModel.calls.length, mockJob.max_retries, `AI model should be called ${mockJob.max_retries} times`);

    // Job status updates
    assertEquals(updateSpy.callCount, 3, 'Job status should be updated three times (processing, retrying, failed)');
    
    const processingArgs = updateSpy.callsArgs[0][0];
    if (processingArgs && typeof processingArgs === 'object' && 'status' in processingArgs) {
      assertEquals(processingArgs.status, 'processing');
    } else {
      assert(false, 'First update call did not have the expected shape for processing status');
    }

    const retryingArgs = updateSpy.callsArgs[1][0];
    if (retryingArgs && typeof retryingArgs === 'object' && 'status' in retryingArgs) {
      assertEquals(retryingArgs.status, 'retrying');
    } else {
      assert(false, 'Second update call did not have the expected shape for retrying status');
    }

    const failedArgs = updateSpy.callsArgs[2][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'retry_loop_failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'final_error' in errorDetails &&
        typeof errorDetails.final_error === 'string'
      ) {
        assertStringIncludes(errorDetails.final_error, `exhausting all ${mockJob.max_retries} retries`);
      } else {
        assert(false, 'error_details.final_error is not in the expected format');
      }
    } else {
      assert(false, 'Third update call did not have the expected shape for failed status');
    }

    // Notification calls
    // It's 3 because: start, retry, fail. No contribution is started because AI always fails.
    assertEquals(rpcSpy.calls.length, 3, 'Notifications should be sent three times (start, retry, fail)');
    assertObjectMatch(rpcSpy.calls[0].args[1], { notification_type: 'contribution_generation_started' });
    assertObjectMatch(rpcSpy.calls[1].args[1], { notification_type: 'contribution_generation_retrying' });
    assertObjectMatch(rpcSpy.calls[2].args[1], { notification_type: 'contribution_generation_failed' });
    
    // Assert that the final failure notification has the correct details
    const finalNotificationData = rpcSpy.calls[2].args[1].notification_data;
    if (finalNotificationData && typeof finalNotificationData === 'object') {
        assert('failed_contributions' in finalNotificationData, 'Missing failed_contributions in notification');
        assert(Array.isArray(finalNotificationData.failed_contributions), 'failed_contributions should be an array');
        assertEquals(finalNotificationData.failed_contributions, [mockModelProviderId]);

        assert('successful_contributions' in finalNotificationData, 'Missing successful_contributions in notification');
        assert(Array.isArray(finalNotificationData.successful_contributions), 'successful_contributions should be an array');
        assertEquals(finalNotificationData.successful_contributions.length, 0);
    } else {
        assert(false, 'Final notification data is missing or not an object');
    }

  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Invalid Payload', async () => {
    const localLoggerError = spy(logger, 'error');

    // 1. Mocks and Test Data
    const mockJobId = 'job-id-invalid';
    const mockUserId = 'user-id-invalid';

    // Create an invalid payload (missing projectId)
    const mockPayloadJson: Json = {
        sessionId: 'some-session-id',
        stageSlug: 'thesis',
        selectedModelIds: ['some-model-id'],
    };

    const mockJob: MockJob = {
        id: mockJobId,
        session_id: 'some-session-id',
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
    };

    const mockSupabase = createMockSupabaseClient();
    const mockFileManager = new MockFileManagerService();

    const mockDeps = {
        callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
        downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error('should not be called') })),
        deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
        getExtensionFromMimeType: spy(() => '.md'),
        logger: logger,
        randomUUID: spy(() => 'uuid-invalid'),
        fileManager: mockFileManager,
    };

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, 'mock-auth-token');

        // 3. Assertions
        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy, "Update spy for 'dialectic_generation_jobs' should exist.");
        assertEquals(updateSpy.callCount, 1, "Job status should be updated once to 'failed'");

        const updateArgs = updateSpy.callsArgs[0][0];
        assertExists(updateArgs);

        if (updateArgs && typeof updateArgs === 'object' && 'status' in updateArgs && 'error_details' in updateArgs) {
            assertEquals(updateArgs.status, 'failed', "Job status should be 'failed'");
            assertExists(updateArgs.error_details, "Error details should be present");

            const errorDetails = updateArgs.error_details;
            if (errorDetails && typeof errorDetails === 'object' && 'message' in errorDetails) {
                const errorMessage = errorDetails.message;
                assert(typeof errorMessage === 'string', 'Error message should be a string');
                assertStringIncludes(errorMessage, 'Invalid payload', "Error message should indicate invalid payload");
                assertStringIncludes(errorMessage, 'projectId', "Error message should mention the missing 'projectId'");
            } else {
                assert(false, 'error_details is not in the expected format');
            }
        } else {
            assert(false, 'updateArgs is not in the expected format');
        }

        assertEquals(localLoggerError.calls.length, 1, "Logger should have recorded an error");
        const logMessage = localLoggerError.calls[0].args[0];
        assert(typeof logMessage === 'string');
        assertStringIncludes(logMessage, "has invalid payload", "Log message should indicate invalid payload");

        assertEquals(mockDeps.callUnifiedAIModel.calls.length, 0, "AI model should not have been called");

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('dialectic-worker - Stage Not Found', async () => {
    const localLoggerError = spy(logger, 'error');

    // Mocks and Test Data
    const mockJobId = 'job-id-stage-fail';
    const mockUserId = 'user-id-stage-fail';
    const mockSessionId = 'session-id-stage-fail';

    const mockPayloadJson: Json = {
        sessionId: mockSessionId,
        projectId: 'project-id-stage-fail',
        stageSlug: 'non-existent-stage',
        selectedModelIds: ['some-model-id'],
    };

    const mockJob: MockJob = {
        id: mockJobId,
        session_id: mockSessionId,
        stage_slug: 'non-existent-stage',
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
    };
    
    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
        'dialectic_generation_jobs': {
          update: { data: [{}, {}] },
        },
        'dialectic_stages': {
          select: { data: null, error: { name: 'PGRST116', message: 'Stage not found' } }
        },
      }
    });

    const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error('should not be called') })),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
      logger: logger,
      randomUUID: spy(() => 'uuid-stage-fail'),
      fileManager: new MockFileManagerService(),
    };

    try {
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 2, 'Job status should be updated twice (processing, then failed)');
        
        const processingArgs = updateSpy.callsArgs[0][0];
        if (processingArgs && typeof processingArgs === 'object' && 'status' in processingArgs) {
          assertEquals(processingArgs.status, 'processing');
        } else {
          assert(false, 'First update call did not have the expected shape for processing status');
        }

        const failedArgs = updateSpy.callsArgs[1][0];
        if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs) {
          assertEquals(failedArgs.status, 'failed');
        } else {
          assert(false, 'Second update call did not have the expected shape for failed status');
        }

    } finally {
        localLoggerError.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('dialectic-worker - AI Model Call Fails', async () => {
  const localLoggerError = spy(logger, 'error');

  // Mocks
  const mockJobId = 'job-id-ai-fail';
  const mockUserId = 'user-id-ai-fail';
  const mockSessionId = 'session-id-ai-fail';
  const mockProjectId = 'project-id-ai-fail';
  const mockModelId = 'model-id-ai-fail';

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
    max_retries: 1, // Fail on first attempt
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    user_id: mockUserId,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}] }, 
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'ai_providers': { select: { data: [{ id: mockModelId, api_identifier: 'api-ai-fail' }] } },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
    content: null,
    error: 'AI Provider Outage',
    errorCode: 'PROVIDER_ERROR',
  }));

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-ai-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 2, 'Job status should be updated twice (processing, then failed)');
    
    const processingArgs = updateSpy.callsArgs[0][0];
    if (processingArgs && typeof processingArgs === 'object' && 'status' in processingArgs) {
      assertEquals(processingArgs.status, 'processing');
    } else {
      assert(false, 'First update call did not have the expected shape for processing status');
    }

    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs) {
      assertEquals(failedArgs.status, 'retry_loop_failed');
    } else {
      assert(false, 'Second update call did not have the expected shape for failed status');
    }

  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Retries on failure and succeeds', async () => {
    const localLoggerInfo = spy(logger, 'info');

    // Mocks
    const mockJobId = 'job-id-retry';
    const mockUserId = 'user-id-retry';
    const mockSessionId = 'session-id-retry';
    const mockProjectId = 'project-id-retry';
    const mockModelId = 'model-id-retry';

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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
        'dialectic_generation_jobs': {
          update: { data: [{}, {}, {}] }, 
        },
        'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: 'chat-123' }] } },
        'ai_providers': { select: { data: [{ id: mockModelId, api_identifier: 'api-retry', name: 'Retry Model' }] } },
        'dialectic_project_resources': { 
          select: { 
            data: [{
              storage_bucket: 'test-bucket',
              storage_path: 'prompts/',
              resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
              file_name: 'prompt.md'
            }] 
          } 
        },
      },
    });
    
    // Fail first time, succeed second time
    let attempt = 0;
    const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => {
        attempt++;
        if (attempt === 1) {
            return { content: null, error: 'AI model failed', errorCode: '500' };
        }
        return { content: 'Successful content on retry', error: null };
    });
    
    const mockFileRecord: FileRecord = {
      id: 'retry-contrib-id',
      session_id: mockSessionId,
      user_id: mockUserId,
      stage: 'thesis',
      iteration_number: 1,
      model_id: mockModelId,
      model_name: 'Retry Model',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      contribution_type: 'model_generated',
      file_name: 'retry-file.md',
      storage_bucket: 'test-bucket',
      storage_path: 'test/path',
      size_bytes: 1024,
      mime_type: 'text/markdown',
      prompt_template_id_used: null,
      seed_prompt_url: null,
      edit_version: 1,
      is_latest_edit: true,
      original_model_contribution_id: null,
      raw_response_storage_path: null,
      target_contribution_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      processing_time_ms: null,
      error: null,
      citations: null,
    };
    
    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const mockDeps = {
      callUnifiedAIModel: mockCallUnifiedAIModel,
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('seed');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
      }),
      logger: logger,
      fileManager: mockFileManager,
      randomUUID: spy(() => 'uuid-retry'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
    };

    try {
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

        const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpy);
        assertEquals(updateSpy.callCount, 3, 'Should update job status three times (processing, retrying, completed)');

        const processingArgs = updateSpy.callsArgs[0][0];
        if (processingArgs && typeof processingArgs === 'object' && 'status' in processingArgs) {
          assertEquals(processingArgs.status, 'processing');
        } else {
          assert(false, 'First update call did not have the expected shape for processing status');
        }

        const retryingArgs = updateSpy.callsArgs[1][0];
        if (retryingArgs && typeof retryingArgs === 'object' && 'status' in retryingArgs) {
            assertEquals(retryingArgs.status, 'retrying');
        } else {
            assert(false, 'Second update call did not have the expected shape for retrying status');
        }

        const completedArgs = updateSpy.callsArgs[2][0];
        if (completedArgs && typeof completedArgs === 'object' && 'status' in completedArgs) {
            assertEquals(completedArgs.status, 'completed');
        } else {
            assert(false, 'Third update call did not have the expected shape for completed status');
        }
        
        assertEquals(mockCallUnifiedAIModel.calls.length, 2, 'AI model should be called twice');

        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 5, 'Notifications should be sent five times (start, contrib start, retry, received, complete)');
        assertObjectMatch(rpcSpy.calls[0].args[1], { notification_type: 'contribution_generation_started' });
        assertObjectMatch(rpcSpy.calls[1].args[1], { notification_type: 'contribution_generation_retrying' });
        assertObjectMatch(rpcSpy.calls[2].args[1], { notification_type: 'dialectic_contribution_started' });
        assertObjectMatch(rpcSpy.calls[3].args[1], { notification_type: 'dialectic_contribution_received' });
        assertObjectMatch(rpcSpy.calls[4].args[1], { notification_type: 'contribution_generation_complete' });
    } finally {
        localLoggerInfo.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('dialectic-worker - Fails after exhausting retries', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-fail-final';
  const mockUserId = 'user-id-fail-final';
  const mockSessionId = 'session-fail';
  const mockProjectId = 'project-fail';
  const mockModelId = 'model-fail';
  
  const mockPayload: Json = {
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
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        update: { data: [{}, {}, {}, {}] },
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: 'chat-123' }] } },
      'ai_providers': { select: { data: [{ id: mockModelId, api_identifier: 'api-fail', name: 'Fail Model' }] } },
      'dialectic_project_resources': {
        select: {
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }]
        }
      },
    }
  });

  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
      content: null,
      error: 'AI model failed consistently',
      errorCode: '500',
  }));

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-fail-final'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
      
      const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
      assertExists(updateSpy);
      assertEquals(updateSpy.callCount, 4, 'Job status should be updated four times (processing, retrying, retrying, failed)');

      const processingArgs = updateSpy.callsArgs[0][0];
      if (processingArgs && typeof processingArgs === 'object' && 'status' in processingArgs) {
          assertEquals(processingArgs.status, 'processing');
      } else {
          assert(false, 'Update call for processing did not have expected shape');
      }

      const retryingArgs1 = updateSpy.callsArgs[1][0];
      if (retryingArgs1 && typeof retryingArgs1 === 'object' && 'status' in retryingArgs1) {
          assertEquals(retryingArgs1.status, 'retrying');
      } else {
          assert(false, 'First update call for retrying did not have expected shape');
      }

      const retryingArgs2 = updateSpy.callsArgs[2][0];
      if (retryingArgs2 && typeof retryingArgs2 === 'object' && 'status' in retryingArgs2) {
          assertEquals(retryingArgs2.status, 'retrying');
      } else {
          assert(false, 'Second update call for retrying did not have expected shape');
      }

      const failedArgs = updateSpy.callsArgs[3][0];
      if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs) {
          assertEquals(failedArgs.status, 'retry_loop_failed');
      } else {
          assert(false, 'Update call for failed did not have expected shape');
      }

      assertEquals(mockCallUnifiedAIModel.calls.length, 3, 'AI model should be called 3 times');
      const rpcSpy = mockSupabase.spies.rpcSpy;
      assertEquals(rpcSpy.calls.length, 4, 'Notifications should be sent four times (start, retry, retry, fail)');
      assertObjectMatch(rpcSpy.calls[0].args[1], { notification_type: 'contribution_generation_started' });
      assertObjectMatch(rpcSpy.calls[1].args[1], { notification_type: 'contribution_generation_retrying' });
      assertObjectMatch(rpcSpy.calls[2].args[1], { notification_type: 'contribution_generation_retrying' });
      assertObjectMatch(rpcSpy.calls[3].args[1], { notification_type: 'contribution_generation_failed' });
  } finally {
      localLoggerError.restore();
      mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Fails if specific seed prompt resource not found', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-seed-not-found';
  const mockUserId = 'user-id-seed-not-found';
  const mockSessionId = 'session-id-seed-not-found';
  const mockProjectId = 'project-id-seed-not-found';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: ['model-id'],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
    status: 'pending',
    attempt_count: 0,
    max_retries: 1,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    started_at: null, completed_at: null, results: null, error_details: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { update: { data: [{}, {}] } },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'dialectic_project_resources': { 
        select: { 
          // Return a resource for a DIFFERENT stage
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'synthesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error('should not be called') })),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-seed-not-found'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'final_error' in errorDetails &&
        typeof errorDetails.final_error === 'string'
      ) {
        assertStringIncludes(String(errorDetails.final_error), 'No specific seed prompt resource found matching criteria');
      } else {
        assert(false, 'Update call for failed did not have expected shape');
      }
    } else {
      assert(false, 'Update call for failed did not have expected shape');
    }
  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Fails if seed prompt download fails', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-download-fail';
  const mockUserId = 'user-id-download-fail';
  const mockSessionId = 'session-id-download-fail';
  const mockProjectId = 'project-id-download-fail';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: ['model-id'],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
    status: 'pending',
    attempt_count: 0,
    max_retries: 1,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    started_at: null, completed_at: null, results: null, error_details: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { update: { data: [{}, {}] } },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'should not be called', error: null })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error("Storage service unavailable") })),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-download-fail'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'final_error' in errorDetails &&
        typeof errorDetails.final_error === 'string'
      ) {
        assertStringIncludes(String(errorDetails.final_error), 'Could not retrieve the seed prompt for this stage');
      } else {
        assert(false, 'Update call for failed did not have expected shape');
      }
    } else {
      assert(false, 'Update call for failed did not have expected shape');
    }
  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - CRITICAL: Final job status update fails', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-final-update-fail';
  const mockUserId = 'user-id-final-update-fail';
  const mockSessionId = 'session-id-final-update-fail';
  const mockProjectId = 'project-id-final-update-fail';
  const mockModelId = 'model-id-final-update-fail';

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
    max_retries: 1,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    started_at: null, completed_at: null, results: null, error_details: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { 
        update: returnsNext([
          Promise.resolve({ data: [{}], error: null }), // 1. processing
          Promise.resolve({ data: null, error: new Error("DB connection lost") }), // 2. completed (fails)
          Promise.resolve({ data: [{}], error: null }), // 3. failed (succeeds)
        ])
      },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', display_name: 'Thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, selected_model_ids: [mockModelId] }] } },
      'ai_providers': { select: { data: [{ id: mockModelId, provider: 'test', name: 'Test Model', api_identifier: 'api-final-update-fail' }] } },
      'dialectic_project_resources': {
        select: {
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }]
        }
      },
    },
  });

  const mockFileManager = new MockFileManagerService();
  const mockFileRecord: FileRecord = {
    id: 'final-update-fail-contrib-id',
    session_id: mockSessionId,
    user_id: mockUserId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: mockModelId,
    model_name: 'Test Model',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'model_generated',
    file_name: 'test-file.md',
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    size_bytes: 1024,
    mime_type: 'text/markdown',
  };
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockDeps = {
      callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: 'AI content', error: null })),
      downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('seed');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
      }),
      logger: logger,
      fileManager: mockFileManager,
      randomUUID: spy(() => 'uuid-final-update-fail'),
      deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
      getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 3, "Job status should be updated three times (processing, completed->fail, failed)");
    
    const failedArgs = updateSpy.callsArgs[2][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
        assertEquals(failedArgs.status, 'failed');
        const errorDetails = failedArgs.error_details;
        if (
          errorDetails &&
          typeof errorDetails === 'object' &&
          'final_error' in errorDetails &&
          typeof errorDetails.final_error === 'string'
        ) {
            assertStringIncludes(String(errorDetails.final_error), 'DB connection lost');
        } else {
            assert(false, 'Final update call did not have the expected shape for failed status');
        }
    } else {
        assert(false, 'Final update call did not have the expected shape for failed status');
    }

    assertEquals(localLoggerError.calls.length, 1);
    assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Unhandled error in job ${mockJobId}`);
    
    const rpcSpy = mockSupabase.spies.rpcSpy;
    const contributionReceivedCall = rpcSpy.calls.find(c => c.args[1] && (c.args[1]).notification_type === 'dialectic_contribution_received');
    assertExists(contributionReceivedCall, "Contribution received notification should have been sent");

    const completionCall = rpcSpy.calls.find(c => c.args[1] && (c.args[1]).notification_type === 'contribution_generation_complete');
    assert(!completionCall, "Completion notification should NOT have been sent if the 'completed' update fails");

  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Unhandled generic exception', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-unhandled-exception';
  const mockUserId = 'user-id-unhandled-exception';
  const mockSessionId = 'session-id-unhandled-exception';
  const mockProjectId = 'project-id-unhandled-exception';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: ['model-id'],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
    status: 'pending',
    attempt_count: 0,
    max_retries: 1,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    started_at: null, completed_at: null, results: null, error_details: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { update: { data: [{}, {}] } },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis' }] } },
      // This DB call will throw the unhandled error
      'dialectic_sessions': { select: { data: null, error: new Error("Cosmic rays hit the database") } },
    },
  });

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({ content: '', error: null })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: null })),
    logger: logger,
    fileManager: new MockFileManagerService(),
    randomUUID: spy(() => 'uuid-unhandled-exception'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");
    
    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 2, "Should be an update to processing, then to failed");

    const failedArgs = updateSpy.callsArgs[1][0];
    if (failedArgs && typeof failedArgs === 'object' && 'status' in failedArgs && 'error_details' in failedArgs) {
      assertEquals(failedArgs.status, 'failed');
      const errorDetails = failedArgs.error_details;
      if (
        errorDetails &&
        typeof errorDetails === 'object' &&
        'final_error' in errorDetails &&
        typeof errorDetails.final_error === 'string'
      ) {
        assertStringIncludes(String(errorDetails.final_error), 'Session session-id-unhandled-exception not found');
      } else {
        assert(false, 'Update call for failed did not have expected shape');
      }
    } else {
      assert(false, 'Update call for failed did not have expected shape');
    }

    assertEquals(localLoggerError.calls.length, 1);
    assertStringIncludes(String(localLoggerError.calls[0].args[0]), `Unhandled error in job ${mockJobId}`);

  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Handles mixed success and failure results', async () => {
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-mixed';
  const mockUserId = 'user-id-mixed';
  const mockSessionId = 'session-id-mixed';
  const mockProjectId = 'project-id-mixed';
  const successModelId = 'model-id-success';
  const failModelId = 'model-id-fail';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: [successModelId, failModelId],
  };

  const mockJob: MockJob = {
    id: mockJobId,
    session_id: mockSessionId,
    stage_slug: 'thesis',
    iteration_number: 1,
    payload: mockPayloadJson,
    status: 'pending',
    attempt_count: 0,
    max_retries: 1, // Only one attempt
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    started_at: null, completed_at: null, results: null, error_details: null,
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': { update: { data: [{}, {}] } },
      'dialectic_stages': { select: { data: [{ id: 'stage-thesis-id', slug: 'thesis', display_name: 'Thesis' }] } },
      'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId }] } },
      'ai_providers': {
        select: returnsNext([
          Promise.resolve({ data: [{ id: successModelId, name: 'Success Model', api_identifier: 'api-success' }], error: null }),
          Promise.resolve({ data: [{ id: failModelId, name: 'Fail Model', api_identifier: 'api-fail' }], error: null })
        ])
      },
      'dialectic_project_resources': { 
        select: { 
          data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const mockCallUnifiedAIModel = spy(async (modelIdentifier: string): Promise<UnifiedAIResponse> => {
    if (modelIdentifier === 'api-success') {
      return { content: 'Successful content', error: null };
    } else if (modelIdentifier === 'api-fail') {
      return { content: null, error: 'AI failed' };
    }
    return { content: null, error: 'Unexpected model identifier' };
  });

  const mockFileRecord: FileRecord = {
    id: 'mixed-contrib-id',
    session_id: mockSessionId,
    user_id: mockUserId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: successModelId, // From the successful model
    model_name: 'Success Model',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'model_generated',
    file_name: 'success-file.md',
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    size_bytes: 1024,
    mime_type: 'text/markdown',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
  };

  const mockFileManager = new MockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    logger: logger,
    fileManager: mockFileManager,
    randomUUID: spy(() => 'uuid-mixed'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

    // Assertions
    assertEquals(mockCallUnifiedAIModel.calls.length, 2, 'AI model should be called twice');

    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);
    assertEquals(updateSpy.callCount, 2, 'Job status should be updated twice (processing, failed)');
    const finalUpdate = updateSpy.callsArgs[1]?.[0];
    if (finalUpdate && typeof finalUpdate === 'object' && 'status' in finalUpdate) {
        assertEquals(finalUpdate.status, 'retry_loop_failed');
    } else {
        assert(false, "Final update call was not for failed status");
    }

    const rpcSpy = mockSupabase.spies.rpcSpy;
    assertEquals(rpcSpy.calls.length, 4, "Should be 4 notifications (start, 1 started, 1 received, 1 failed)");
    
    const startedNotification = rpcSpy.calls.find(c => c.args[1] && (c.args[1]).notification_type === 'dialectic_contribution_started');
    assertExists(startedNotification, "A contribution started notification should have been sent");

    const receivedNotification = rpcSpy.calls.find(c => c.args[1] && (c.args[1]).notification_type === 'dialectic_contribution_received');
    assertExists(receivedNotification, "A contribution received notification should have been sent");

    const finalNotification = rpcSpy.calls.find(c => c.args[1] && (c.args[1]).notification_type === 'contribution_generation_failed');
    assertExists(finalNotification, "A final failure notification should have been sent");

    const notificationData = finalNotification.args[1].notification_data;
    if (notificationData && typeof notificationData === 'object') {
      assert('successful_contributions' in notificationData, 'Missing successful_contributions');
      assertEquals(notificationData.successful_contributions, ['mixed-contrib-id']);
      
      assert('failed_contributions' in notificationData, 'Missing failed_contributions');
      assertEquals(notificationData.failed_contributions, [failModelId]);
    } else {
      assert(false, "Final notification data has incorrect shape");
    }
  } finally {
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Happy Path with dynamic content type and detailed notification', async () => {
  const localLoggerInfo = spy(logger, 'info');
  const localLoggerError = spy(logger, 'error');

  const mockJobId = 'job-id-happy';
  const mockSessionId = 'session-id-happy';
  const mockProjectId = 'project-id-happy';
  const mockUserId = 'user-id-happy';
  const mockModelProviderId = 'model-id-happy';

  const mockPayloadJson: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    iterationNumber: 1,
    selectedModelIds: [mockModelProviderId],
    continueUntilComplete: false,
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
            file_name: 'prompt.md'
          }] 
        } 
      },
    },
  });

  const rpcSpy = mockSupabase.spies.rpcSpy;

  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => ({
    content: 'Happy path AI content',
    contentType: 'application/json', // Test dynamic type
    error: null,
  }));

  const mockFileRecord: FileRecord = {
    id: 'happy-contrib-id',
    session_id: mockSessionId,
    user_id: mockUserId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: mockModelProviderId,
    model_name: 'Test Model',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contribution_type: 'model_generated',
    file_name: 'test-file.md',
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    size_bytes: 1024,
    mime_type: 'text/markdown',
  };

  const mockFileManager = new MockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
      const seedContent = new TextEncoder().encode('seed');
      const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
      new Uint8Array(arrayBuffer).set(seedContent);
      return await Promise.resolve({ data: arrayBuffer, error: null });
    }),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getExtensionFromMimeType: spy((_mimeType: string): string => '.json'),
    logger: logger,
    randomUUID: spy(() => 'uuid-happy'),
    fileManager: mockFileManager,
  };

  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

    const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpy);

    assertEquals(updateSpy.callCount, 2, 'Should update job status twice (processing, completed)');
    
    const secondCallArg = updateSpy.callsArgs[1]?.[0];
    if (secondCallArg && typeof secondCallArg === 'object' && 'status' in secondCallArg) {
      assertEquals(secondCallArg.status, 'completed');
    }

    assertEquals(mockCallUnifiedAIModel.calls.length, 1, 'AI model should be called once');
    
    assertEquals(mockDeps.getExtensionFromMimeType.calls.length, 1);
    const mimeCall = mockDeps.getExtensionFromMimeType.calls[0];
    assertExists(mimeCall); // This guarantees mimeCall is not undefined
    assertEquals(mimeCall.args[0], 'application/json');

    const uploadContext: UploadContext | undefined = mockFileManager.uploadAndRegisterFile.calls[0]?.args[0];
    assertExists(uploadContext);
    assertEquals(uploadContext.mimeType, 'application/json');

    const originalFileName = uploadContext.pathContext.originalFileName;
    assertExists(originalFileName);
    assertStringIncludes(originalFileName, '.json');

    assertEquals(rpcSpy.calls.length, 4, 'Notification RPC should be called four times (start, contrib started, received, complete)');
    const completionNotificationData = rpcSpy.calls[3].args[1].notification_data;
    if (completionNotificationData && typeof completionNotificationData === 'object') {
        assert('successful_contributions' in completionNotificationData, 'Missing successful_contributions in notification');
        assert(Array.isArray(completionNotificationData.successful_contributions), 'successful_contributions should be an array');
        assertEquals(completionNotificationData.successful_contributions, [mockFileRecord.id]);
        
        assert('failed_contributions' in completionNotificationData, 'Missing failed_contributions in notification');
        assert(Array.isArray(completionNotificationData.failed_contributions), 'failed_contributions should be an array');
        assertEquals(completionNotificationData.failed_contributions.length, 0);
    } else {
        assert(false, 'Completion notification data is missing or not an object');
    }

  } finally {
    localLoggerInfo.restore();
    localLoggerError.restore();
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Enqueues a new job on response continuation', async () => {
  const localLoggerError = spy(logger, 'error');
  const mockJobId = 'job-id-continuation';
  const mockUserId = 'user-id-continuation';
  const mockSessionId = 'session-id-continuation';
  const mockProjectId = 'project-id-continuation';
  const mockModelId = 'model-id-continuation';
  const mockContributionId = 'contribution-id-continuation';

  // PATTERN: The payload for a job is always a Json object.
  const mockPayload: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: [mockModelId],
    continueUntilComplete: true,
    continuation_count: 0,
  };

  const mockJob: MockJob = {
    id: mockJobId,
    user_id: mockUserId,
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
  };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
      'dialectic_generation_jobs': {
        insert: { data: [{}] },
        update: { data: [{}] },
      },
      'dialectic_stages': {
        select: { data: [{ id: 'stage-id-thesis', slug: 'thesis', display_name: 'Thesis' }] },
      },
      'dialectic_sessions': {
        select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: null }] },
      },
      'ai_providers': {
        select: { data: [{ id: mockModelId, name: 'Test Model', api_identifier: 'test-model', provider: 'test' }] },
      },
      'dialectic_project_resources': {
        select: { data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({
                type: 'seed_prompt',
                session_id: mockSessionId,
                stage_slug: 'thesis',
                iteration: 1,
            }),
            file_name: 'prompt.md'
          }]
        }
      }
    }
  });

  const fileManager = new MockFileManagerService();
  const savedFileRecord: FileRecord = {
    id: mockContributionId,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    storage_bucket: 'test-bucket',
    storage_path: `dialectic/${mockProjectId}/sessions/${mockSessionId}/1/thesis`,
    file_name: 'model-id-continuation_thesis.md',
    mime_type: 'text/markdown',
    size_bytes: 15,
    session_id: mockSessionId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: mockModelId,
    contribution_type: 'model_generated',
    model_name: 'Test Model',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    updated_at: new Date().toISOString(),
  };
  // PATTERN: Use the mock service's built-in spy and control its return value.
  fileManager.setUploadAndRegisterFileResponse(savedFileRecord, null);

  const mockDeps = {
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
      content: 'This is the first part.',
      // PATTERN: The finish_reason is a string literal from a type union. No casting is needed.
      finish_reason: 'length',
      error: null,
      inputTokens: 10,
      outputTokens: 5,
    })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => {
        const seedContent = new TextEncoder().encode('seed prompt');
        // PATTERN: Return a proper ArrayBuffer to match the DownloadStorageResult type.
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
      }),
    logger: logger,
    fileManager: fileManager,
    getExtensionFromMimeType: spy(() => '.md'),
    randomUUID: spy(() => 'mock-uuid'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
  };
  
  try {
    await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, "mock-auth-token");

    const jobsInsertSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(jobsInsertSpy, "Insert spy for 'dialectic_generation_jobs' should exist.");

    assertEquals(jobsInsertSpy.callCount, 1, "A new continuation job should have been inserted.");

    const insertedJob = jobsInsertSpy.callsArgs[0][0];
    
    if (isJobWithPayload(insertedJob)) {
      const insertedJobPayload = validatePayload(insertedJob.payload);
      assertObjectMatch(insertedJobPayload, {
        continuation_count: 1,
        target_contribution_id: mockContributionId,
        continueUntilComplete: true,
      });
    } else {
      assert(false, 'Inserted job is not in the expected format.');
    }

  } finally {
    mockSupabase.clearAllStubs?.();
  }
});

Deno.test('dialectic-worker - Correctly saves concatenated file on continuation', async () => {
  const mockJobId = 'job-id-concat';
  const mockUserId = 'user-id-concat';
  const mockSessionId = 'session-id-concat';
  const mockProjectId = 'project-id-concat';
  const mockModelId = 'model-id-concat';

  const mockPayload: Json = {
    sessionId: mockSessionId,
    projectId: mockProjectId,
    stageSlug: 'thesis',
    selectedModelIds: [mockModelId],
    continueUntilComplete: true,
    continuation_count: 0,
  };

  const mockFirstJob: MockJob = {
    id: mockJobId,
    user_id: mockUserId,
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
  };

  const mockFirstContributionId = 'contribution-id-concat-1';
  const mockFirstFileRecord: FileRecord = {
    id: mockFirstContributionId,
    created_at: new Date().toISOString(),
    user_id: mockUserId,
    storage_bucket: 'test-bucket',
    storage_path: `dialectic/${mockProjectId}/sessions/${mockSessionId}/1/thesis/model-id-concat_thesis.md`,
    file_name: 'model-id-concat_thesis.md',
    mime_type: 'text/markdown',
    size_bytes: 25,
    session_id: mockSessionId,
    stage: 'thesis',
    iteration_number: 1,
    model_id: mockModelId,
    contribution_type: 'model_generated',
    model_name: 'Test Model',
    prompt_template_id_used: null,
    seed_prompt_url: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    target_contribution_id: null,
    tokens_used_input: null,
    tokens_used_output: null,
    processing_time_ms: null,
    error: null,
    citations: null,
    updated_at: new Date().toISOString(),
  };
  
  const mockSecondContributionId = 'contribution-id-concat-2';
  const mockSecondFileRecord: FileRecord = { ...mockFirstFileRecord, id: mockSecondContributionId };

  const mockSupabase = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
          update: { data: [{}, {}] },
          insert: { data: [{}] }
        },
        'dialectic_stages': { select: { data: [{ id: 'stage-id-thesis', slug: 'thesis', display_name: 'Thesis' }] } },
        'dialectic_sessions': { select: { data: [{ id: mockSessionId, project_id: mockProjectId, associated_chat_id: null }] } },
        'ai_providers': { select: { data: [{ id: mockModelId, name: 'Test Model', api_identifier: 'test-model', provider: 'test' }] } },
        'dialectic_project_resources': {
          select: { data: [{
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/',
            resource_description: JSON.stringify({ type: 'seed_prompt', session_id: mockSessionId, stage_slug: 'thesis', iteration: 1 }),
            file_name: 'prompt.md'
          }] }
        },
        'dialectic_contributions': {
          select: { data: [{
            id: mockFirstContributionId,
            storage_path: `dialectic/${mockProjectId}/sessions/${mockSessionId}/1/thesis`,
            storage_bucket: 'test-bucket',
            file_name: 'model-id-concat_thesis.md'
          }] }
        }
      }
  });

  const mockFileManager = new MockFileManagerService();

  let aiCallCount = 0;
  const mockCallUnifiedAIModel = spy(async (): Promise<UnifiedAIResponse> => {
    aiCallCount++;
    if (aiCallCount === 1) {
      return { content: 'This is the first part.', finish_reason: 'length', error: null };
    }
    return { content: ' This is the second part.', finish_reason: 'stop', error: null };
  });

  const mockDownloadFromStorage: DownloadFromStorageFn = async (
    _client: SupabaseClient,
    _bucket: string,
    path: string
  ): Promise<DownloadStorageResult> => {
    if (path.includes('prompt.md')) {
        const seedContent = new TextEncoder().encode('seed prompt');
        const arrayBuffer = new ArrayBuffer(seedContent.byteLength);
        new Uint8Array(arrayBuffer).set(seedContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    }
    if (mockFirstFileRecord.file_name && path.includes(mockFirstFileRecord.file_name)) {
        const firstPartContent = new TextEncoder().encode('This is the first part.');
        const arrayBuffer = new ArrayBuffer(firstPartContent.byteLength);
        new Uint8Array(arrayBuffer).set(firstPartContent);
        return await Promise.resolve({ data: arrayBuffer, error: null });
    }
    return await Promise.resolve({ data: null, error: new Error(`mockDownloadFromStorage received unexpected path: ${path}`) });
  };

  const mockDeps = {
    callUnifiedAIModel: mockCallUnifiedAIModel,
    downloadFromStorage: spy(mockDownloadFromStorage),
    logger: logger,
    fileManager: mockFileManager,
    getExtensionFromMimeType: spy(() => '.md'),
    randomUUID: spy(() => 'mock-uuid'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
  };

  try {
      const uploadCalls: UploadContext[] = [];

      // First Job
      mockFileManager.uploadAndRegisterFile = spy((context: UploadContext) => {
          uploadCalls.push(context);
          return Promise.resolve({ record: mockFirstFileRecord, error: null });
      });
      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockFirstJob, mockDeps, "mock-auth-token");

      const mockSecondJobId = 'job-id-concat-2';
      const mockSecondPayload: Json = {
        sessionId: mockSessionId,
        projectId: mockProjectId,
        stageSlug: 'thesis',
        selectedModelIds: [mockModelId],
        continueUntilComplete: true,
        continuation_count: 1,
        target_contribution_id: mockFirstContributionId,
      };
      const mockSecondJob: MockJob = {
        id: mockSecondJobId,
        user_id: mockUserId,
        session_id: mockSessionId,
        stage_slug: 'thesis',
        iteration_number: 1,
        payload: mockSecondPayload,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
      };

      // Second Job
      mockFileManager.uploadAndRegisterFile = spy((context: UploadContext) => {
          uploadCalls.push(context);
          return Promise.resolve({ record: mockSecondFileRecord, error: null });
      });

      await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockSecondJob, mockDeps, "mock-auth-token");

      assertEquals(uploadCalls.length, 2, 'FileManager should be called twice for both parts.');
      
      const firstCallArgs = uploadCalls[0];
      assertEquals(firstCallArgs.fileContent, 'This is the first part.');
      
      const secondCallArgs = uploadCalls[1];
      assertEquals(secondCallArgs.fileContent, 'This is the first part. This is the second part.');
      assertEquals(secondCallArgs.contributionMetadata?.target_contribution_id, mockFirstContributionId, 'Second job should target the first contribution.');

  } finally {
      mockSupabase.clearAllStubs?.();
  }
});