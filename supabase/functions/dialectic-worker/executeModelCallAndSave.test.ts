import {
    assertEquals,
    assertExists,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import type { Database, Tables } from '../types_db.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
  import { logger } from '../_shared/logger.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isJson,
    isRecord,
} from '../_shared/utils/type_guards.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import type { 
    DialecticJobRow, 
    UnifiedAIResponse, 
    DialecticSession, 
    DialecticContributionRow, 
    SelectedAiProvider, 
    ExecuteModelCallAndSaveParams, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    IDialecticJobDeps
} from '../dialectic-service/dialectic.interface.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import type { LogMetadata } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';

  // Helper function to create a valid DialecticJobRow for testing
  function createMockJob(payload: DialecticJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
    if (!isJson(payload)) {
        throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
    }
  
    const baseJob: DialecticJobRow = {
        id: 'job-id-123',
        session_id: 'session-id-123',
        stage_slug: 'test-stage',
        iteration_number: 1,
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

  const testPayload: DialecticExecuteJobPayload = {
    job_type: 'execute',
    step_info: { current_step: 1, total_steps: 1 },
    prompt_template_name: 'test-prompt',
    inputs: {},
    output_type: 'thesis',
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    canonicalPathParams: {
        contributionType: 'thesis',
    }
  };
  
  const mockSessionData: DialecticSession = {
    id: 'session-456',
    project_id: 'project-abc',
    session_description: 'A mock session',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ['model-def'],
    status: 'in-progress',
    associated_chat_id: 'chat-789',
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  const mockProviderData: SelectedAiProvider = {
      id: 'model-def',
      provider: 'mock-provider',
      name: 'Mock AI',
      api_identifier: 'mock-ai-v1',
  };

  const mockFullProviderData: Tables<'ai_providers'> = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    created_at: new Date().toISOString(),
    config: {
        tokenization_strategy: { type: 'rough_char_count' },
        max_context_window_tokens: 10000,
        context_window_tokens: 8000,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
    },
    description: null,
    is_active: true,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  }
  
  const mockContribution: DialecticContributionRow = {
      id: 'contrib-123',
      session_id: 'session-456',
      stage: 'test-stage',
      iteration_number: 1,
      model_id: 'model-def',
      edit_version: 1,
      is_latest_edit: true,
      citations: null,
      contribution_type: 'model_contribution_main',
      created_at: new Date().toISOString(),
      error: null,
      file_name: 'test.txt',
      mime_type: 'text/plain',
      model_name: 'Mock AI',
      original_model_contribution_id: null,
      processing_time_ms: 100,
      prompt_template_id_used: null,
      raw_response_storage_path: null,
      seed_prompt_url: null,
      size_bytes: 100,
      storage_bucket: 'test-bucket',
      storage_path: 'test/path',
      target_contribution_id: null,
      tokens_used_input: 10,
      tokens_used_output: 20,
      updated_at: new Date().toISOString(),
      user_id: 'user-789',
      document_relationships: null,
  };
  
  const mockNotificationService: NotificationServiceType = {
      sendContributionStartedEvent: async () => {},
      sendDialecticContributionStartedEvent: async () => {},
      sendContributionRetryingEvent: async () => {},
      sendContributionReceivedEvent: async () => {},
      sendContributionGenerationContinuedEvent: async () => {},
      sendContributionGenerationCompleteEvent: async () => {},
      sendDialecticProgressUpdateEvent: async () => {},
      sendContributionFailedNotification: async () => {},
    };
  
  const setupMockClient = (configOverrides: Record<string, any> = {}) => {
      return createMockSupabaseClient('user-789', {
          genericMockResults: {
              ...configOverrides,
          },
      });
  };
  
  // This is a partial mock, only includes deps needed by executeModelCallAndSave
  const getMockDeps = (): IDialecticJobDeps => {
      const fileManager = new MockFileManagerService();
      fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
      
      return {
        callUnifiedAIModel: async () => ({
          content: 'AI response content',
          contentType: 'text/plain',
          inputTokens: 10,
          outputTokens: 20,
          processingTimeMs: 100,
        }),
        getExtensionFromMimeType: () => '.txt',
        logger: logger,
        fileManager: fileManager,
        continueJob: async () => ({ enqueued: false }),
        notificationService: mockNotificationService,
        getSeedPromptForStage: async () => ({ content: 'Seed prompt content', fullPath: 'test/path/seed.txt', bucket: 'test-bucket', path: 'test/path', fileName: 'seed.txt' }),
        retryJob: async () => ({}),
        downloadFromStorage: async () => ({ data: new ArrayBuffer(100), error: null }),
        randomUUID: () => '123',
        deleteFromStorage: async () => ({ error: null }),
        executeModelCallAndSave: async () => {},
      }
  };
  
  Deno.test('executeModelCallAndSave - Happy Path', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: 'AI response content',
        contentType: 'text/plain',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
      }),
      getExtensionFromMimeType: () => '.txt',
      logger: logger,
      fileManager: fileManager,
      continueJob: async () => ({ enqueued: false }),
      notificationService: mockNotificationService,
      getSeedPromptForStage: async () => ({ content: 'Seed prompt content', fullPath: 'test/path/seed.txt', bucket: 'test-bucket', path: 'test/path', fileName: 'seed.txt' }),
      retryJob: async () => ({}),
      downloadFromStorage: async () => ({ data: new ArrayBuffer(100), error: null }),
      randomUUID: () => '123',
      deleteFromStorage: async () => ({ error: null }),
      executeModelCallAndSave: async () => {},
    };
    
    await t.step('should run to completion successfully', async () => {
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(testPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        assertEquals(historicSpies.callCount, 1, "Job update should be called once");

        const [updatePayload] = historicSpies.callsArgs[0];
        assert(isRecord(updatePayload) && 'status' in updatePayload, "Update payload should have a status property");
    });

    clearAllStubs?.();
  });
  
  Deno.test('executeModelCallAndSave - Intermediate Flag', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: 'AI response content',
        contentType: 'text/plain',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
      }),
      getExtensionFromMimeType: () => '.txt',
      logger: logger,
      fileManager: fileManager,
      continueJob: async () => ({ enqueued: false }),
      notificationService: mockNotificationService,
      getSeedPromptForStage: async () => ({ content: 'Seed prompt content', fullPath: 'test/path/seed.txt', bucket: 'test-bucket', path: 'test/path', fileName: 'seed.txt' }),
      retryJob: async () => ({}),
      downloadFromStorage: async () => ({ data: new ArrayBuffer(100), error: null }),
      randomUUID: () => '123',
      deleteFromStorage: async () => ({ error: null }),
      executeModelCallAndSave: async () => {},
    };

    await t.step('should pass isIntermediate flag to fileManager', async () => {
        const intermediatePayload: DialecticExecuteJobPayload = { ...testPayload, isIntermediate: true };
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(intermediatePayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.contributionMetadata?.isIntermediate, true, "isIntermediate flag was not passed correctly to the file manager");
    });

    clearAllStubs?.();
  });
  
  Deno.test('executeModelCallAndSave - Final Artifact Flag', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps: IDialecticJobDeps = {
      callUnifiedAIModel: async () => ({
        content: 'AI response content',
        contentType: 'text/plain',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
      }),
      getExtensionFromMimeType: () => '.txt',
      logger: logger,
      fileManager: fileManager,
      continueJob: async () => ({ enqueued: false }),
      notificationService: mockNotificationService,
      getSeedPromptForStage: async () => ({ content: 'Seed prompt content', fullPath: 'test/path/seed.txt', bucket: 'test-bucket', path: 'test/path', fileName: 'seed.txt' }),
      retryJob: async () => ({}),
      downloadFromStorage: async () => ({ data: new ArrayBuffer(100), error: null }),
      randomUUID: () => '123',
      deleteFromStorage: async () => ({ error: null }),
      executeModelCallAndSave: async () => {},
    };
  
    await t.step('should pass isIntermediate: false to fileManager when explicitly set', async () => {
        const finalPayload: DialecticExecuteJobPayload = { ...testPayload, isIntermediate: false };
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(finalPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);
  
        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        assertEquals(uploadContext.contributionMetadata?.isIntermediate, false, "isIntermediate flag should be false");
    });
  
    await t.step('should default isIntermediate to false if not present on payload', async () => {
        const undefinedPayload: DialecticExecuteJobPayload = { ...testPayload };
        // We know `isIntermediate` is not on the base `testPayload`, so no need to delete it.
  
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(undefinedPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);
  
        assert(fileManager.uploadAndRegisterFile.calls.length > 1, 'Expected fileManager.uploadAndRegisterFile to be called a second time');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[1].args[0]; // Check the second call
        assertEquals(uploadContext.contributionMetadata?.isIntermediate, false, "isIntermediate flag should default to false");
    });
  
    clearAllStubs?.();
  });
  
  Deno.test('executeModelCallAndSave - Continuation Enqueued', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const deps: IDialecticJobDeps = getMockDeps();

    const continueJobStub = stub(deps, 'continueJob', async () => ({ enqueued: true }));

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: 'Partial content',
        finish_reason: 'length',
        contentType: 'text/plain',
    }));
    
    const continuationPayload: DialecticJobPayload = { ...testPayload, continueUntilComplete: true };
    const jobWithContinuationPayload = createMockJob(continuationPayload);

    await t.step('should enqueue a continuation job', async () => {
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: jobWithContinuationPayload,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);

        assertEquals(continueJobStub.calls.length, 1, 'Expected continueJob to be called');
        
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        
        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'completed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'completed', as the continuation is a separate job.");
    });

    clearAllStubs?.();
    continueJobStub.restore();
    callUnifiedAIModelStub.restore();
  });
  
  
  Deno.test('executeModelCallAndSave - Throws on AI Error', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const deps: IDialecticJobDeps = getMockDeps();

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => ({
        content: null,
        error: 'AI response was empty.',
    }));

    await t.step('should throw an error if the model returns an error', async () => {
        let errorThrown = false;
        try {
            const params: ExecuteModelCallAndSaveParams = {
                dbClient: dbClient as unknown as SupabaseClient<Database>,
                deps,
                authToken: 'auth-token',
                job: createMockJob(testPayload),
                projectOwnerUserId: 'user-789',
                providerDetails: mockProviderData,
                renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
                previousContent: '',
                sessionData: mockSessionData,
            };
            await executeModelCallAndSave(params);
        } catch (e) {
            errorThrown = true;
            assert(e instanceof Error && e.message.includes('AI response was empty'), "Expected error message to match AI failure.");
        }
        assert(errorThrown, "Expected executeModelCallAndSave to throw an error.");
    });

    clearAllStubs?.();
    callUnifiedAIModelStub.restore();
  });
  
  Deno.test('executeModelCallAndSave - Database Error on Update', async (t) => {
    await t.step('should log an error if the final job update fails', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'dialectic_generation_jobs': {
                update: () => { throw new Error('DB Update Failed'); }
            },
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });
        const deps: IDialecticJobDeps = getMockDeps();
        
        let criticalErrorLogged = false;
        const originalErrorLogger = deps.logger.error;
        deps.logger.error = (message: string | Error, metadata?: LogMetadata) => {
            if (typeof message === 'string' && message.includes('CRITICAL')) {
                criticalErrorLogged = true;
            } else if (message instanceof Error && message.message.includes('CRITICAL')) {
                criticalErrorLogged = true;
            }
            originalErrorLogger.call(deps.logger, message, metadata);
        };

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(testPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);

        assert(criticalErrorLogged, "Expected a critical error log for failing to update the job status.");

        deps.logger.error = originalErrorLogger;
        clearAllStubs?.();
    });
  });
  
  Deno.test('executeModelCallAndSave - Notifications', async (t) => {
    
    await t.step('should send Received and Complete notifications for a non-continuing job', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });
        const deps: IDialecticJobDeps = getMockDeps();
        
        const sendReceivedSpy = spy(deps.notificationService, 'sendContributionReceivedEvent');
        const sendCompleteSpy = spy(deps.notificationService, 'sendContributionGenerationCompleteEvent');

        const nonContinuingPayload: DialecticJobPayload = { ...testPayload, continueUntilComplete: false };
        
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(nonContinuingPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);

        assertEquals(sendReceivedSpy.calls.length, 1, 'Expected sendContributionReceivedEvent to be called once');
        assertEquals(sendCompleteSpy.calls.length, 1, 'Expected sendContributionGenerationCompleteEvent to be called once');
        clearAllStubs?.();
    });

    await t.step('should send Continued notification for a continuing job', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });
        const deps: IDialecticJobDeps = getMockDeps();

        stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
            content: 'Partial content',
            finish_reason: 'length',
            contentType: 'text/plain',
        }));

        const sendContinuedSpy = spy(deps.notificationService, 'sendContributionGenerationContinuedEvent');
        
        const continuationPayload: DialecticJobPayload = { ...testPayload, continueUntilComplete: true };
        const jobWithContinuationPayload = createMockJob(continuationPayload);

        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: jobWithContinuationPayload,
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            renderedPrompt: { content: 'Seed prompt content', fullPath: 'prompts/seed.txt' },
            previousContent: '',
            sessionData: mockSessionData,
        };
        await executeModelCallAndSave(params);
        
        assertEquals(sendContinuedSpy.calls.length, 1, 'Expected sendContributionGenerationContinuedEvent to be called once');
        clearAllStubs?.();
    });
});

Deno.test('executeModelCallAndSave - Throws ContextWindowError', async (t) => {
    const limitedConfigObject = {
        tokenization_strategy: { type: 'rough_char_count' },
        max_context_window_tokens: 10, // very small limit
        context_window_tokens: 10,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
    };

    if (!isJson(limitedConfigObject)) {
        throw new Error("Test setup failed: mock config is not valid Json.");
    }

    const mockLimitedProvider: Tables<'ai_providers'> = {
        ...mockFullProviderData,
        config: limitedConfigObject,
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockLimitedProvider], error: null }
        }
    });
    const deps: IDialecticJobDeps = getMockDeps();

    await t.step('should throw ContextWindowError if prompt exceeds token limit', async () => {
        let errorThrown = false;
        try {
            const params: ExecuteModelCallAndSaveParams = {
                dbClient: dbClient as unknown as SupabaseClient<Database>,
                deps,
                authToken: 'auth-token',
                job: createMockJob(testPayload),
                projectOwnerUserId: 'user-789',
                providerDetails: mockProviderData,
                renderedPrompt: { content: 'This is a prompt that is definitely going to be longer than ten tokens.', fullPath: 'prompts/seed.txt' },
                previousContent: '',
                sessionData: mockSessionData,
            };
            await executeModelCallAndSave(params);
        } catch (e) {
            errorThrown = true;
            assert(e instanceof ContextWindowError, "Expected error to be a ContextWindowError.");
        }
        assert(errorThrown, "Expected executeModelCallAndSave to throw an error.");
    });

    clearAllStubs?.();
});
  