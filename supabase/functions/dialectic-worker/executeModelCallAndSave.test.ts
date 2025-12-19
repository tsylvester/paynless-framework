import {
    assertEquals,
    assertExists,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import { Database, Tables } from '../types_db.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
  import { logger } from '../_shared/logger.ts';
  import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isJson,
    isRecord,
    isChatApiRequest,
    isDialecticJobRow,
} from '../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import { 
    DialecticJobRow, 
    DialecticSession, 
    DialecticContributionRow, 
    SelectedAiProvider, 
    ExecuteModelCallAndSaveParams, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    IDialecticJobDeps,
    PromptConstructionPayload,
    SourceDocument
  } from '../dialectic-service/dialectic.interface.ts';
import { FileType, UploadContext, DocumentRelationships, DialecticStageSlug } from '../_shared/types/file_manager.types.ts';
import { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import { LogMetadata, Messages } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

// Local helpers for arranging tests
export const buildPromptPayload = (overrides: Partial<PromptConstructionPayload> = {}): PromptConstructionPayload => ({
  systemInstruction: undefined,
  conversationHistory: [],
  resourceDocuments: [],
  currentUserPrompt: 'RENDERED: Hello',
  ...overrides,
});

export const buildExecuteParams = (dbClient: SupabaseClient<Database>, deps: IDialecticJobDeps, overrides: Partial<ExecuteModelCallAndSaveParams> = {}): ExecuteModelCallAndSaveParams => ({
  dbClient,
  deps,
  authToken: 'auth-token',
  job: createMockJob(testPayload),
  projectOwnerUserId: 'user-789',
  providerDetails: mockProviderData,
  sessionData: mockSessionData,
  promptConstructionPayload: buildPromptPayload(),
  compressionStrategy: getSortedCompressionCandidates,
  inputsRelevance: [],
  ...overrides,
});

export const spyCallModel = (deps: IDialecticJobDeps) => spy(deps, 'callUnifiedAIModel');

// Helper function to create a valid DialecticJobRow for testing
export function createMockJob(payload: DialecticJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
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
        is_test_job: false,
        job_type: 'PLAN',
        ...overrides,
    };
  
    return baseJob;
  }

export const testPayload: DialecticExecuteJobPayload = {
    prompt_template_id: 'test-prompt',
    inputs: {},
    output_type: FileType.HeaderContext,
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: 'test-stage',
    }
  };
  
export const mockSessionData: DialecticSession = {
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
  
export const mockProviderData: SelectedAiProvider = {
      id: 'model-def',
      provider: 'mock-provider',
      name: 'Mock AI',
      api_identifier: 'mock-ai-v1',
  };

export const mockFullProviderData: Tables<'ai_providers'> = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    created_at: new Date().toISOString(),
    config: {
        tokenization_strategy: { type: 'rough_char_count' },
        context_window_tokens: 10000,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
    },
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    updated_at: new Date().toISOString(),
  }
  
export const mockContribution: DialecticContributionRow = {
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
      is_header: false,
      source_prompt_resource_id: null,
  };
  
export  const mockNotificationService: NotificationServiceType = {
      sendContributionStartedEvent: async () => {},
      sendDialecticContributionStartedEvent: async () => {},
      sendContributionRetryingEvent: async () => {},
      sendContributionReceivedEvent: async () => {},
      sendContributionGenerationContinuedEvent: async () => {},
      sendContributionGenerationCompleteEvent: async () => {},
      sendDialecticProgressUpdateEvent: async () => {},
      sendContributionFailedNotification: async () => {},
      sendContributionGenerationFailedEvent: async () => {},
      sendDocumentCentricNotification: async () => {},
    };
  
export const setupMockClient = (configOverrides: Record<string, any> = {}) => {
      return createMockSupabaseClient('user-789', {
          genericMockResults: {
              ...configOverrides,
          },
      });
  };
  
  // This is a partial mock, only includes deps needed by executeModelCallAndSave
export const getMockDeps = (
    tokenWalletServiceOverride?: ITokenWalletService,
): IDialecticJobDeps => {
      const fileManager = new MockFileManagerService();
      fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
      
      return {
        callUnifiedAIModel: async () => ({
          content: '{"content": "AI response content"}',
          contentType: 'application/json',
          inputTokens: 10,
          outputTokens: 20,
          processingTimeMs: 100,
          rawProviderResponse: { mock: 'response' },
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
        // ADDED: Provide default mocks for services needed by compression logic
        ragService: new MockRagService(),
        tokenWalletService: tokenWalletServiceOverride || createMockTokenWalletService({ getBalance: () => Promise.resolve('1000000') }).instance,
        embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) },
        countTokens: () => 0, // Default to 0, tests that need it will stub this.
        documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
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
        content: '{"content": "AI response content"}',
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { mock: 'response' },
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
      tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve('1000000') }).instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
      documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
    };
    
    await t.step('should run to completion successfully', async () => {
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(testPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
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

Deno.test("executeModelCallAndSave - should send '__none__' as promptId in ChatApiRequest", async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const deps = getMockDeps();
    const callUnifiedAISpy = spyCallModel(deps);

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({ ...testPayload, prompt_template_id: 'some-template-id' }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: mockSessionData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction',
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'User prompt',
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    await executeModelCallAndSave(params);

    assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
    const firstArg = callUnifiedAISpy.calls[0].args[0];
    assert(isChatApiRequest(firstArg), 'First argument to callUnifiedAIModel should be a ChatApiRequest');
    assertEquals(firstArg.promptId, '__none__');

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
        content: '{"content": "AI response content"}',
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { mock: 'response' },
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
      tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve('1000000') }).instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
      documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
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
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
        };
        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }
        assertEquals(uploadContext.contributionMetadata.isIntermediate, true, "isIntermediate flag was not passed correctly to the file manager");
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
        content: '{"content": "AI response content"}',
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { mock: 'response' },
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
      tokenWalletService: createMockTokenWalletService().instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
      documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
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
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
        };
        await executeModelCallAndSave(params);
  
        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }
        assertEquals(uploadContext.contributionMetadata.isIntermediate, false, "isIntermediate flag should be false");
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
                promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
        };
        await executeModelCallAndSave(params);
  
        assert(fileManager.uploadAndRegisterFile.calls.length > 1, 'Expected fileManager.uploadAndRegisterFile to be called a second time');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[1].args[0]; // Check the second call
        if (!isModelContributionContext(uploadContext)) {
            throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
        }
        assertEquals(uploadContext.contributionMetadata.isIntermediate, false, "isIntermediate flag should default to false");
    });
  
    clearAllStubs?.();
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
    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should trigger a retry if the model returns an error', async () => {
        const params: ExecuteModelCallAndSaveParams = {
            dbClient: dbClient as unknown as SupabaseClient<Database>,
            deps,
            authToken: 'auth-token',
            job: createMockJob(testPayload),
            projectOwnerUserId: 'user-789',
            providerDetails: mockProviderData,
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
        };
        await executeModelCallAndSave(params);

        assertEquals(retryJobSpy.calls.length, 1, "Expected retryJob to be called on AI error.");
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
        
        // Ensure the mock response is valid JSON to prevent premature exit
        stub(deps, 'callUnifiedAIModel', () => Promise.resolve({
            content: '{"content": "valid json"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' }, 
        }));

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
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
            inputsRelevance: [],
        };
        await executeModelCallAndSave(params);

        assert(criticalErrorLogged, "Expected a critical error log for failing to update the job status.");

        deps.logger.error = originalErrorLogger;
        clearAllStubs?.();
    });
});

Deno.test('executeModelCallAndSave - Throws ContextWindowError', async (t) => {
    const limitedConfigObject = {
        tokenization_strategy: { type: 'rough_char_count' },
        context_window_tokens: 10, // very small limit
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
        },
        // Provide a large matching rendered document so executor gathers it (not assembler)
        'dialectic_project_resources': {
            select: () => {
                return Promise.resolve({
                    data: [
                        {
                            id: 'doc-oversize',
                            content: 'X'.repeat(2000),
                            stage_slug: 'test-stage',
                            project_id: 'project-abc',
                            session_id: 'session-456',
                            iteration_number: 1,
                            resource_type: 'rendered_document',
                            created_at: new Date().toISOString(),
                            // Provide separate directory path and file name so identity can be parsed
                            storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                            file_name: 'modelA_1_rendered_document.md',
                        }
                    ],
                    error: null,
                });
            },
        },
    });
    const deps: IDialecticJobDeps = getMockDeps();

    await t.step('should throw ContextWindowError if prompt exceeds token limit and cannot be compressed', async () => {
        let errorThrown = false;
        try {
            const largePromptConstructionPayload: PromptConstructionPayload = {
                conversationHistory: [],
                resourceDocuments: [{
                    id: 'doc-1',
                    content: "This content is intentionally very long to exceed the maximum token limit set in the mock provider config and force an error.",
                    stage: 'test-stage',
                    // Add all required properties to satisfy the SourceDocument type
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    user_id: 'user-789',
                    session_id: 'session-1',
                    iteration_number: 1,
                    target_contribution_id: 'contribution-1',
                    document_relationships: null,
                    mime_type: 'text/plain',
                    citations: [],
                    contribution_type: 'source_document',
                    edit_version: 1,
                    error: null,
                    file_name: 'test.txt',
                    is_latest_edit: true,
                    model_id: 'model-1',
                    model_name: 'test-model',
                    original_model_contribution_id: 'contribution-1',
                    processing_time_ms: 100,
                    prompt_template_id_used: null,
                    raw_response_storage_path: null,
                    seed_prompt_url: null,
                    size_bytes: 100,
                    storage_bucket: 'test-bucket',
                    storage_path: 'test/path',
                    tokens_used_input: 10,
                    tokens_used_output: 20,
                    is_header: false,
                    source_prompt_resource_id: null,
                }],
                currentUserPrompt: "This is a test prompt.",
            };

            const testDeps = getMockDeps();
            const mockRagService = new MockRagService();
            mockRagService.setConfig({
                // This content is long enough to ensure the token count remains > 10 after compression
                mockContextResult: 'This is the compressed but still oversized content that will not fit.',
            });
            testDeps.ragService = mockRagService;
            testDeps.countTokens = countTokens; // FIX: Use the real token counter
            
            const params: ExecuteModelCallAndSaveParams = {
                dbClient: dbClient as unknown as SupabaseClient<Database>,
                deps: testDeps,
                authToken: 'auth-token',
                job: createMockJob(testPayload),
                projectOwnerUserId: 'user-789',
                providerDetails: mockProviderData,
                // Assembler docs are ignored; executor gathers via inputsRequired
                promptConstructionPayload: { ...largePromptConstructionPayload, resourceDocuments: [] },
                sessionData: mockSessionData,
                compressionStrategy: getSortedCompressionCandidates,
                inputsRelevance: [],
                inputsRequired: [
                    { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'test-stage' },
                ],
            };
            await executeModelCallAndSave(params);
        } catch (e: unknown) {
            errorThrown = true;
            assert(
                e instanceof ContextWindowError,
                `Expected ContextWindowError, but got ${e ? e.constructor.name : 'undefined'}`
            );
        }
        assert(errorThrown, "Expected executeModelCallAndSave to throw an error.");
    });

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - Document Relationships - should pass document_relationships to the fileManager', async () => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps = getMockDeps();
    deps.fileManager = fileManager;

    const relationshipsPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.PairwiseSynthesisChunk,
        document_relationships: {
            source_group: 'thesis-1',
            thesis: 'thesis-1',
            antithesis: 'antithesis-A',
        },
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(relationshipsPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction',
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'User prompt',
        },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(uploadContext.contributionMetadata, "Contribution metadata should exist");
    
    assertEquals(uploadContext.contributionMetadata.document_relationships, relationshipsPayload.document_relationships, "document_relationships object was not passed correctly to the file manager");

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - Document Relationships - should default document_relationships to null if not provided', async () => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps = getMockDeps();
    deps.fileManager = fileManager;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload), // testPayload does not have document_relationships
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        promptConstructionPayload: {
            systemInstruction: 'System instruction',
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'User prompt',
        },
        sessionData: mockSessionData,
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
    };

    await executeModelCallAndSave(params);

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(uploadContext.contributionMetadata, "Contribution metadata should exist");
    
    logger.info('uploadContext.contributionMetadata.document_relationships', { document_relationships: uploadContext.contributionMetadata.document_relationships });
    assertEquals(uploadContext.contributionMetadata.document_relationships, null, "document_relationships should default to null");

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - should accept PromptConstructionPayload and call model with ChatApiRequest', async () => {
    // Arrange
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const deps = getMockDeps();
    const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

    const mockResourceDocument: SourceDocument = {
        id: 'doc-1',
        content: 'Some document content',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'user-789',
        session_id: 'session-1',
        iteration_number: 1,
        target_contribution_id: 'contribution-1',
        document_relationships: null,
        mime_type: 'text/plain',
        citations: [],
        contribution_type: 'source_document',
        edit_version: 1,
        error: null,
        file_name: 'test.txt',
        is_latest_edit: true,
        model_id: 'model-1',
        model_name: 'test-model',
        original_model_contribution_id: 'contribution-1',
        processing_time_ms: 100,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        tokens_used_input: 10,
        tokens_used_output: 20,
        stage: 'test-stage',
        is_header: false,
        source_prompt_resource_id: null,
    };

    const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
        systemInstruction: "You are a helpful assistant.",
        conversationHistory: [{ role: 'assistant', content: 'Previous message' }],
        resourceDocuments: [mockResourceDocument],
        currentUserPrompt: "This is the current user prompt.",
    });

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { promptConstructionPayload });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(callUnifiedAISpy.calls.length, 1, "callUnifiedAIModel should be called once");
    
    const firstArg = callUnifiedAISpy.calls[0].args[0];
    assert(isChatApiRequest(firstArg), "First argument to callUnifiedAIModel should be a ChatApiRequest");
    
    assertEquals(firstArg.message, "This is the current user prompt.");
    assertEquals(firstArg.systemInstruction, "You are a helpful assistant.");
    assertExists(firstArg.messages);
    assertEquals(firstArg.messages.length, 1, "Should include one history message");
    assertEquals(firstArg.messages[0], { role: 'assistant', content: 'Previous message' });
    assertEquals(firstArg.providerId, mockProviderData.id);

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - includes rendered template as first user message (non-continuation)', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spyCallModel(deps);
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'RENDERED: Hello' }),
  });

  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const firstArg = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(firstArg), 'First argument to callUnifiedAIModel should be a ChatApiRequest');

  assertExists(firstArg.messages, 'messages should exist on ChatApiRequest');
  assertEquals(firstArg.message, 'RENDERED: Hello');
  assertEquals(firstArg.systemInstruction, undefined);
  assertEquals(firstArg.messages.length, 0, 'messages should be empty when no history/resources');

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - emits document_completed when finish_reason is stop', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();
  const sendDocEventSpy = spy(deps.notificationService, 'sendDocumentCentricNotification');

  // Stub call to return finish_reason: stop
  const callUnifiedAISpy = stub(deps, 'callUnifiedAIModel', async () => ({
    content: '{"ok": true}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 50,
    rawProviderResponse: { finish_reason: 'stop' },
  }));

  // Use a document file type with document_key
  const documentPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
  };

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob(documentPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  assertEquals(sendDocEventSpy.calls.length, 1, 'Expected a document_completed event emission');
  const [payloadArg, targetUserId] = sendDocEventSpy.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'document_completed');
  assertEquals(payloadArg.sessionId, documentPayload.sessionId);
  assertEquals(payloadArg.stageSlug, documentPayload.stageSlug);
  assertEquals(payloadArg.job_id, 'job-id-123');
  assertEquals(payloadArg.document_key, documentPayload.document_key);
  assertEquals(payloadArg.modelId, documentPayload.model_id);
  assertEquals(payloadArg.iterationNumber, documentPayload.iterationNumber);
  assertEquals(targetUserId, 'user-789');

  callUnifiedAISpy.restore();
  sendDocEventSpy.restore();
  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - emits document_chunk_completed for continuation chunks', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();
  const sendDocEventSpy = spy(deps.notificationService, 'sendDocumentCentricNotification');

  // Continuation job payload with required document_relationships
  // Use a document file type with document_key for document_chunk_completed event
  // Use valid DialecticStageSlug enum value for document_relationships key
  const documentRelationships: DocumentRelationships = {
    [DialecticStageSlug.Thesis]: 'root-123',
  };
  const continuationPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    target_contribution_id: 'root-123',
    continuation_count: 2,
    stageSlug: DialecticStageSlug.Thesis,
    document_relationships: documentRelationships,
  };

  // Stub model to return a non-final finish_reason (requires continuation), but we only assert chunk event
  const callUnifiedAISpy = stub(deps, 'callUnifiedAIModel', async () => ({
    content: '{"ok": true}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 50,
    rawProviderResponse: { finish_reason: 'length' },
  }));

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob(continuationPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
  };

  await executeModelCallAndSave(params);

  // One call expected: document_chunk_completed (no document_completed because finish_reason != stop)
  assertEquals(sendDocEventSpy.calls.length, 1, 'Expected a document_chunk_completed event emission');
  const [payloadArg, targetUserId] = sendDocEventSpy.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'document_chunk_completed');
  assertEquals(payloadArg.sessionId, continuationPayload.sessionId);
  assertEquals(payloadArg.stageSlug, continuationPayload.stageSlug);
  assertEquals(payloadArg.job_id, 'job-id-123');
  assertEquals(payloadArg.document_key, continuationPayload.document_key);
  assertEquals(payloadArg.modelId, continuationPayload.model_id);
  assertEquals(payloadArg.iterationNumber, continuationPayload.iterationNumber);
  assertEquals(targetUserId, 'user-789');

  callUnifiedAISpy.restore();
  sendDocEventSpy.restore();
  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - sets and forwards max_tokens_to_generate using SSOT', async () => {
  // Arrange: provider config with simple rates and no restrictive provider caps
  if (!isRecord(mockFullProviderData.config)) {
    throw new Error('Test setup error: mockFullProviderData.config is not an object');
  }
  const cfg = {
    ...mockFullProviderData.config,
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    context_window_tokens: 10000,
    provider_max_input_tokens: undefined,
    provider_max_output_tokens: undefined,
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [{ ...mockFullProviderData, config: cfg }], error: null } },
  });

  // Wallet balance 1000; prompt tokens 100 → SSOT cap = 400 (min(balance*0.8=800, remaining=900)/2)
  const { instance: mockTokenWalletService } = createMockTokenWalletService({
    getBalance: () => Promise.resolve('1000'),
  });

  const deps = getMockDeps(mockTokenWalletService);
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');
  // Non-oversized path: fixed token count
  deps.countTokens = () => 100;

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob({ ...testPayload, walletId: 'wallet-ssot' }),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: [ { role: 'user', content: 'hello' } ],
      resourceDocuments: [],
      currentUserPrompt: 'current',
    },
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
  };

  // Act
  await executeModelCallAndSave(params);

  // Assert
  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');
  // RED: SSOT cap must be set and forwarded
  assertEquals(sent.max_tokens_to_generate, 400);
});

Deno.test('executeModelCallAndSave - resourceDocuments increase counts and are forwarded unchanged (distinct from messages)', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'doc-r1',
              content: 'Doc X content',
              stage_slug: 'test-stage',
              project_id: 'project-abc',
              session_id: 'session-456',
              iteration_number: 1,
              resource_type: 'rendered_document',
              created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
              file_name: 'modelA_1_rendered_document.md',
            },
          ],
          error: null,
        });
      },
    },
  });

  const deps = getMockDeps();
  // Spy on adapter to inspect sent request
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

  // Stub countTokens to verify resourceDocuments are present and influence count
  let sizedPayload: { systemInstruction?: string; message?: string; messages?: { role: 'system'|'user'|'assistant'; content: string }[]; resourceDocuments?: { id?: string; content: string }[] } | null = null;
  const countTokensStub = stub(deps, 'countTokens', (_deps, payload) => {
    // Capture normalized four-field payload
    if (isRecord(payload)) {
      const sys = typeof payload['systemInstruction'] === 'string' ? payload['systemInstruction'] : undefined;
      const msg = typeof payload['message'] === 'string' ? payload['message'] : undefined;
      const msgsUnknown = payload['messages'];
      const msgs: { role: 'system'|'user'|'assistant'; content: string }[] = [];
      if (Array.isArray(msgsUnknown)) {
        for (const m of msgsUnknown) {
          if (isRecord(m)) {
            const roleVal = typeof m['role'] === 'string' ? m['role'] : undefined;
            const contentVal = typeof m['content'] === 'string' ? m['content'] : undefined;
            if ((roleVal === 'user' || roleVal === 'assistant' || roleVal === 'system') && typeof contentVal === 'string') {
              const r = roleVal;
              msgs.push({ role: r, content: contentVal });
            }
          }
        }
      }
      const docsUnknown = payload['resourceDocuments'];
      const docs: { id?: string; content: string }[] = [];
      if (Array.isArray(docsUnknown)) {
        for (const d of docsUnknown) {
          if (isRecord(d)) {
            const idVal = typeof d['id'] === 'string' ? d['id'] : undefined;
            const contentVal = typeof d['content'] === 'string' ? d['content'] : undefined;
            if (typeof contentVal === 'string') {
              docs.push({ id: idVal, content: contentVal });
            }
          }
        }
      }
      sizedPayload = { systemInstruction: sys, message: msg, messages: msgs, resourceDocuments: docs };
    }
    // Token count: base on number of history messages plus number of resource docs
    const msgCount = Array.isArray((sizedPayload && sizedPayload.messages)) ? sizedPayload!.messages!.length : 0;
    const docCount = Array.isArray((sizedPayload && sizedPayload.resourceDocuments)) ? sizedPayload!.resourceDocuments!.length : 0;
    return msgCount + docCount + 1; // +1 base to avoid zero
  });

  // One resource document; should be distinct from messages
  const doc: SourceDocument = {
    id: 'doc-r1',
    content: 'Doc X content',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    session_id: 'session-1',
    iteration_number: 1,
    target_contribution_id: 'contrib-1',
    document_relationships: null,
    mime_type: 'text/plain',
    citations: [],
    contribution_type: 'source_document',
    edit_version: 1,
    error: null,
    file_name: 'doc.txt',
    is_latest_edit: true,
    model_id: 'model-1',
    model_name: 'Mock',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 1,
    storage_bucket: 'b',
    storage_path: 'p',
    tokens_used_input: 0,
    tokens_used_output: 0,
    stage: 'test-stage',
    is_header: false,
    source_prompt_resource_id: null,
  };

  const promptConstructionPayload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [{ role: 'user', content: 'HIST' }],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload,
    inputsRequired: [ { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'test-stage' } ],
  });

  await executeModelCallAndSave(params);

  // Assert sizing saw the resource document and counted it
  assert(sizedPayload !== null, 'countTokens should have been called and captured payload');
  const sizedHasDocs = isRecord(sizedPayload) && Array.isArray(sizedPayload['resourceDocuments']);
  const sizedDocs = sizedHasDocs ? sizedPayload['resourceDocuments'] : [];
  assert(sizedHasDocs && sizedDocs.length === 1, 'resourceDocuments should be present in sizing payload');

  // Adapter received resourceDocuments unchanged and not merged into messages
  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');
  assert(Array.isArray(sent.resourceDocuments) && sent.resourceDocuments.length === 1, 'resourceDocuments must be forwarded to adapter');
  assertEquals(sent.resourceDocuments[0].content, 'Doc X content');
  assert(Array.isArray(sent.messages), 'messages must be an array');
  assert(!sent.messages.some((m: { content: string }) => m.content === 'Doc X content'), 'resourceDocuments must not be included in ChatApiRequest.messages');

  countTokensStub.restore();
});

Deno.test('executeModelCallAndSave - builds full ChatApiRequest including resourceDocuments and walletId', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'doc-xyz',
              content: 'Doc content for sizing and send',
              stage_slug: 'test-stage',
              project_id: 'project-abc',
              session_id: 'session-456',
              iteration_number: 1,
              resource_type: 'rendered_document',
              created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
              file_name: 'modelB_1_rendered_document.md',
            },
          ],
          error: null,
        });
      },
    },
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spyCallModel(deps);

  const mockResourceDocument: SourceDocument = {
    id: 'doc-xyz',
    content: 'Doc content for sizing and send',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    session_id: 'session-1',
    iteration_number: 1,
    target_contribution_id: 'contribution-1',
    document_relationships: null,
    mime_type: 'text/plain',
    citations: [],
    contribution_type: 'source_document',
    edit_version: 1,
    is_header: false,
    source_prompt_resource_id: null,
    error: null,
    file_name: 'doc.txt',
    is_latest_edit: true,
    model_id: 'model-1',
    model_name: 'test-model',
    original_model_contribution_id: 'contribution-1',
    processing_time_ms: 100,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    tokens_used_input: 10,
    tokens_used_output: 20,
    stage: 'test-stage',
  };

  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'System goes here',
    conversationHistory: [{ role: 'assistant', content: 'Hi' }],
    resourceDocuments: [],
    currentUserPrompt: 'User says hello',
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload,
    inputsRequired: [ { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'test-stage' } ],
  });

  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');

  // Wallet should be forwarded from job payload
  assertEquals(sent.walletId, testPayload.walletId);
  // System instruction preserved
  assertEquals(sent.systemInstruction, 'System goes here');
  // Message and messages preserved
  assertEquals(sent.message, 'User says hello');
  assertExists(sent.messages);
  // Resource documents should be present distinctly on the request
  assertExists(sent.resourceDocuments);
  assertEquals(sent.resourceDocuments.length, 1);
  assertEquals(sent.resourceDocuments[0].content, 'Doc content for sizing and send');
});

Deno.test('executeModelCallAndSave - identity: sized payload equals sent request (non-oversized)', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spyCallModel(deps);

  const mockResourceDocument: SourceDocument = {
    id: 'doc-ident-1',
    content: 'Doc for identity test',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    session_id: 'session-1',
    iteration_number: 1,
    target_contribution_id: 'contribution-1',
    document_relationships: null,
    mime_type: 'text/plain',
    citations: [],
    contribution_type: 'source_document',
    edit_version: 1,
    error: null,
    file_name: 'ident.txt',
    is_latest_edit: true,
    model_id: 'model-1',
    model_name: 'test-model',
    original_model_contribution_id: 'contribution-1',
    processing_time_ms: 100,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    tokens_used_input: 10,
    tokens_used_output: 20,
    stage: 'test-stage',
    is_header: false,
    source_prompt_resource_id: null,
  };

  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'SYS: identity',
    conversationHistory: [{ role: 'assistant', content: 'Hi (history)' }],
    resourceDocuments: [mockResourceDocument],
    currentUserPrompt: 'User prompt for identity',
  });

  const sizedPayloads: unknown[] = [];
  deps.countTokens = ((depsArg, payloadArg) => {
    sizedPayloads.push(payloadArg);
    return 5;
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { promptConstructionPayload });
  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');

  // Capture the first payload used for counting
  assert(sizedPayloads.length >= 1, 'countTokens should have been called');
  const sizedFirst = sizedPayloads[0];
  assert(isRecord(sizedFirst), 'Sized payload should be an object');

  const expectedFour = {
    systemInstruction: sizedFirst['systemInstruction'],
    message: sizedFirst['message'],
    messages: sizedFirst['messages'],
    resourceDocuments: sizedFirst['resourceDocuments'],
  };

  assertEquals({ systemInstruction: sent.systemInstruction, message: sent.message, messages: sent.messages, resourceDocuments: sent.resourceDocuments }, expectedFour, 'Sized payload must equal sent request on the four fields');
});

Deno.test('executeModelCallAndSave - identity after compression: final sized payload equals sent request', async () => {
  // Create a provider with a small max window to force compression
  const limitedProvider: Tables<'ai_providers'> = {
    ...mockFullProviderData,
    config: {
      tokenization_strategy: { type: 'rough_char_count' },
      context_window_tokens: 50,
      provider_max_input_tokens: 10000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
    },
  };
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [limitedProvider], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [
            {
              id: 'doc-for-compress',
              content: 'Some longish content to be summarized',
              stage_slug: 'test-stage',
              project_id: 'project-abc',
              session_id: 'session-456',
              iteration_number: 1,
              resource_type: 'rendered_document',
              created_at: new Date().toISOString(),
              storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
              file_name: 'modelC_1_business_case.md',
            },
          ],
          error: null,
        });
      },
    },
  });

  const deps = getMockDeps(createMockTokenWalletService({ getBalance: () => Promise.resolve('10') }).instance);
  const callUnifiedAISpy = spyCallModel(deps);

  // Ensure RAG returns something so the loop can iterate
  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'compressed summary' });
  deps.ragService = mockRag;

  // Craft payload with enough content/history to produce at least one candidate
  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'SYS: compression',
    conversationHistory: [
      { role: 'assistant', content: 'History A' },
      { role: 'assistant', content: 'History B' },
      { role: 'user', content: 'Please continue.' },
    ],
    resourceDocuments: [
      {
        id: 'doc-for-compress',
        content: 'Some longish content to be summarized',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'user-789',
        session_id: 'session-1',
        iteration_number: 1,
        target_contribution_id: 'contribution-1',
        document_relationships: null,
        mime_type: 'text/plain',
        citations: [],
        contribution_type: 'source_document',
        edit_version: 1,
        error: null,
        file_name: 'doc.txt',
        is_latest_edit: true,
        model_id: 'model-1',
        model_name: 'test-model',
        original_model_contribution_id: 'contribution-1',
        processing_time_ms: 100,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        storage_bucket: 'test-bucket',
        storage_path: 'test/path',
        tokens_used_input: 10,
        tokens_used_output: 20,
        stage: 'test-stage',
        is_header: false,
        source_prompt_resource_id: null,
      },
    ],
    currentUserPrompt: 'User for compression identity',
  });

  // Statefully force first count oversized, second count fits
  const sizedPayloads: unknown[] = [];
  let callIdx = 0;
  deps.countTokens = ((depsArg, payloadArg) => {
    sizedPayloads.push(payloadArg);
    callIdx += 1;
    return callIdx === 1 ? 100 : 40; // first pass oversized, then fits
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload,
    // Ensure executor gathers this doc and compression can operate
    inputsRequired: [ { type: 'document', document_key: FileType.business_case, required: true, slug: 'test-stage' } ],
    // Provide a simple compression strategy that yields a candidate so loop runs
    compressionStrategy: async () => [ { id: 'doc-for-compress', sourceType: 'resource', content: 'Some longish content to be summarized', score: 1 } as unknown as any ],
  });
  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');

  // Capture the last payload used for counting (post-compression)
  assert(sizedPayloads.length >= 2, 'countTokens should have been called at least twice');
  const sizedLast = sizedPayloads[sizedPayloads.length - 1];
  assert(isRecord(sizedLast), 'Sized payload should be an object');

  const expectedFour = {
    systemInstruction: sizedLast['systemInstruction'],
    message: sizedLast['message'],
    messages: sizedLast['messages'],
    resourceDocuments: sizedLast['resourceDocuments'],
  };

  assertEquals({ systemInstruction: sent.systemInstruction, message: sent.message, messages: sent.messages, resourceDocuments: sent.resourceDocuments }, expectedFour, 'Final sized payload must equal sent request on the four fields');
});

Deno.test('executeModelCallAndSave - should correctly pass source_prompt_resource_id to fileManager', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps = getMockDeps();
    deps.fileManager = fileManager;

    const sourcePromptResourceId = 'resource-id-for-prompt-123';

    const promptPayloadWithSourceId: PromptConstructionPayload = buildPromptPayload({
        source_prompt_resource_id: sourcePromptResourceId,
    });

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        promptConstructionPayload: promptPayloadWithSourceId,
    });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(uploadContext.contributionMetadata, "Contribution metadata should exist");
    
    assertEquals(uploadContext.contributionMetadata.source_prompt_resource_id, sourcePromptResourceId, "source_prompt_resource_id was not passed correctly to the file manager");

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - updates source_contribution_id on originating prompt', async () => {
    const sourcePromptResourceId = 'prompt-id-123';

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null },
        },
        'dialectic_project_resources': {
            update: {
                data: [{ id: sourcePromptResourceId }],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            },
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    const params = buildExecuteParams(
        dbClient as unknown as SupabaseClient<Database>,
        deps,
        {
            promptConstructionPayload: buildPromptPayload({
                source_prompt_resource_id: sourcePromptResourceId,
            }),
        },
    );

    await executeModelCallAndSave(params);

    const updateSpies = spies.getHistoricQueryBuilderSpies(
        'dialectic_project_resources',
        'update',
    );
    assertExists(
        updateSpies,
        'Expected to capture update calls for dialectic_project_resources',
    );
    assertEquals(
        updateSpies.callCount,
        1,
        'Expected the prompt resource to be updated exactly once',
    );

    const updatePayload = updateSpies.callsArgs[0]?.[0];
    assert(
        isRecord(updatePayload),
        'Update payload for prompt resource must be an object',
    );
    assertEquals(
        updatePayload['source_contribution_id'],
        mockContribution.id,
        'source_contribution_id should match the saved contribution id',
    );

    const eqSpies = spies.getHistoricQueryBuilderSpies(
        'dialectic_project_resources',
        'eq',
    );
    assertExists(eqSpies, 'Expected eq filters when targeting the prompt resource');
    assertEquals(
        eqSpies.callCount,
        1,
        'Expected a single eq filter for the prompt resource update',
    );
    const eqArgs = eqSpies.callsArgs[0];
    assertEquals(eqArgs?.[0], 'id', 'Prompt resource update must filter by id');
    assertEquals(
        eqArgs?.[1],
        sourcePromptResourceId,
        'Prompt resource update must target the originating prompt id',
    );

    clearAllStubs?.();
});


Deno.test('executeModelCallAndSave - rendering hygiene: final message has no placeholders; systemInstruction is passthrough only', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

  // Provide a prompt with an unrendered placeholder; worker should not send placeholders in final message
  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    // Intentionally omit systemInstruction to assert passthrough-only (no synthesis)
    systemInstruction: undefined,
    conversationHistory: [ { role: 'assistant', content: 'Welcome back.' } ],
    resourceDocuments: [],
    currentUserPrompt: 'Hello {name}, please summarize the report.'
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { promptConstructionPayload });
  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const firstArg = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(firstArg), 'First argument to callUnifiedAIModel should be a ChatApiRequest');

  // RED: assert no placeholders remain in the final message
  const sentMessage = firstArg.message;
  assert(typeof sentMessage === 'string', 'Final message must be a string');
  assert(!sentMessage.includes('{') && !sentMessage.includes('}'), 'Final message must not contain placeholder braces');

  // Assert systemInstruction is passthrough-only (undefined when not provided)
  assertEquals(firstArg.systemInstruction, undefined, 'systemInstruction should be undefined when not provided (no synthesis)');
});

Deno.test('when the model produces malformed JSON, it should trigger a retry, not a continuation', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;
    
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve({
        content: '{"key": "value", "incomplete', // Malformed JSON
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 5,
        processingTimeMs: 50,
        rawProviderResponse: { finish_reason: 'stop' }, 
    }));

    const continueJobSpy = spy(deps, 'continueJob');
    const retryJobSpy = spy(deps, 'retryJob');

    const job = createMockJob(testPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, "Should not save the malformed artifact.");
    assertEquals(continueJobSpy.calls.length, 0, "Should NOT call continueJob for a parsing failure.");
    assertEquals(retryJobSpy.calls.length, 1, "Should call retryJob to recover from the error.");

    const retryArgs = retryJobSpy.calls[0].args;
    assertEquals(retryArgs[2].id, job.id, "Should retry the correct job.");
    assertEquals(retryArgs[3], job.attempt_count + 1, "Should increment the attempt count.");
    assert(retryArgs[4][0].error.includes('Malformed JSON'), "Should include the correct error reason in the retry details.");

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - gathers artifacts across contributions/resources/feedback (non-oversized), preserves order, not merged into messages, empty inputsRelevance deterministic', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_contributions': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string) => ({
          id,
          content,
          stage: 'test-stage',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          type: 'document',
          created_at: new Date().toISOString(),
          storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
          file_name: `model-collect_1_${key}.md`,
        });
        const data = [
          mk('c1', 'C1', 'business_case'),
          mk('c2', 'C2', 'feature_spec'),
        ];
        return { data, error: null };
      },
    },
    'dialectic_project_resources': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string) => ({
          id,
          content,
          stage_slug: 'test-stage',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          resource_type: 'rendered_document',
          created_at: new Date().toISOString(),
          storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
          file_name: `model-collect_1_${key}.md`,
        });
        const data = [mk('r1', 'R1', 'seed_prompt'), mk('r2', 'R2', 'business_case'), mk('r3', 'R3', 'feature_spec')];
        return { data, error: null };
      },
    },
    'dialectic_feedback': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string) => ({
          id,
          content,
          stage_slug: 'test-stage',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          type: 'feedback',
          created_at: new Date().toISOString(),
          storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
          file_name: `model-collect_1_${key}.md`,
        });
        const data = [mk('f1', 'F1', 'business_case')];
        return { data, error: null };
      },
    },
  });

  const deps = getMockDeps();
  deps.countTokens = () => 10; // non-oversized
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob(testPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    sessionData: mockSessionData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: [{ role: 'user', content: 'hello' }],
      resourceDocuments: [], // executor should gather, not rely on assembler input
      currentUserPrompt: 'CURR',
    },
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
    inputsRequired: [
      { type: 'document', document_key: FileType.business_case, required: true, slug: 'test-stage' },
      { type: 'document', document_key: FileType.feature_spec, required: true, slug: 'test-stage' },
      { type: 'document', document_key: FileType.SeedPrompt, required: true, slug: 'test-stage' },
      { type: 'feedback', document_key: FileType.business_case, required: false, slug: 'test-stage' },
    ],
  };

  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1);
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent));

  // Order preserved: R2 (business_case from resources), R3 (feature_spec from resources), R1 (seed_prompt from resources), F1 (feedback)
  // Note: C1 and C2 are NOT included because resources take precedence for document-type inputs
  const contents = Array.isArray(sent.resourceDocuments)
    ? sent.resourceDocuments.map(d => (isRecord(d) && typeof d['content'] === 'string') ? d['content'] : '')
    : [];
  assertEquals(contents, ['R2', 'R3', 'R1', 'F1']);

  // Ensure docs not merged into messages
  const msgContents = Array.isArray(sent.messages)
    ? sent.messages.map(m => (isRecord(m) && typeof m['content'] === 'string') ? m['content'] : '')
    : [];
  for (const c of contents) {
    assert(!msgContents.includes(c), 'resource doc content must not be merged into messages');
  }

  // Identity-rich fields are preserved for compression candidates, not for the
  // sent ChatApiRequest.resourceDocuments (which carry only id/content).
});

Deno.test('executeModelCallAndSave - scoped selection includes only artifacts matching inputsRequired', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_contributions': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string, stage: string) => ({
          id,
          content,
          stage,
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          type: 'document',
          created_at: new Date().toISOString(),
          storage_path: `project-abc/session_session-456/iteration_1/${stage}/documents`,
          file_name: `modelM_1_${key}.md`,
        });
        const data = [
          mk('c-match', 'CM', 'business_case', 'test-stage'),
          mk('c-skip', 'CS', 'risk_register', 'other-stage'),
        ];
        return { data, error: null };
      },
    },
    'dialectic_project_resources': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string) => ({
          id,
          content,
          stage_slug: 'test-stage',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          resource_type: 'rendered_document',
          created_at: new Date().toISOString(),
          storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
          file_name: `modelM_1_${key}.md`,
        });
        const data = [mk('r-match', 'RM', 'business_case')];
        return { data, error: null };
      },
    },
    'dialectic_feedback': {
      select: (_state: any) => {
        const mk = (id: string, content: string, key: string) => ({
          id,
          content,
          stage_slug: 'test-stage',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          type: 'feedback',
          created_at: new Date().toISOString(),
          storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
          file_name: `modelM_1_${key}.md`,
          resource_description: { document_key: key },
        });
        const data = [mk('f-match', 'FM', FileType.UserFeedback)];
        return { data, error: null };
      },
    },
  });

  const deps = getMockDeps();
  deps.countTokens = () => 10;
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job: createMockJob(testPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    sessionData: mockSessionData,
    promptConstructionPayload: {
      systemInstruction: 'SYS',
      conversationHistory: [],
      resourceDocuments: [],
      currentUserPrompt: 'CURR',
    },
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
    inputsRequired: [
      { type: 'document', document_key: FileType.business_case, required: true, slug: 'test-stage' },
      { type: 'feedback', document_key: FileType.UserFeedback, required: false, slug: 'test-stage' },
    ],
  };

  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpy.calls.length, 1);
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent));

  const ids = Array.isArray(sent.resourceDocuments)
    ? sent.resourceDocuments.map(d => (isRecord(d) && typeof d['id'] === 'string') ? d['id'] : '')
    : [];

  // Resources take precedence over contributions for document-type inputs
  assert(ids.includes('r-match'), 'Expected r-match (from resources) to be included');
  assert(ids.includes('f-match'), 'Expected f-match to be included');
  assert(!ids.includes('c-match'), 'c-match (from contributions) should NOT be included when r-match (from resources) exists');
  assert(!ids.includes('c-skip') && !ids.includes('r-skip'), 'Non-matching artifacts must be excluded');
});

// On successful EXECUTE completion, insert a RENDER job with correct payload
Deno.test('executeModelCallAndSave - schedules RENDER job after success with renderer identity payload', async () => {
  const mockStage = {
    id: 'stage-1',
    slug: DialecticStageSlug.Thesis,
    display_name: 'Test Stage',
    description: null,
    default_system_prompt_id: null,
    recipe_template_id: 'template-1',
    active_recipe_instance_id: 'instance-1',
    expected_output_template_ids: [],
    created_at: new Date().toISOString(),
  };

  const mockInstance = {
    id: 'instance-1',
    stage_id: 'stage-1',
    template_id: 'template-1',
    is_cloned: false,
    cloned_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockStep = {
    id: 'step-1',
    template_id: 'template-1',
    step_number: 1,
    step_key: 'execute_business_case',
    step_slug: 'execute-business-case',
    step_name: 'Execute Business Case',
    step_description: null,
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    prompt_template_id: null,
    output_type: 'business_case',
    granularity_strategy: 'per_source_document',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: {
      documents: [
        {
          document_key: 'business_case',
          file_type: 'markdown',
        },
      ],
    },
    parallel_group: null,
    branch_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { client: dbClient, spies } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_stages': { select: { data: [mockStage], error: null } },
    'dialectic_stage_recipe_instances': { select: { data: [mockInstance], error: null } },
    'dialectic_recipe_template_steps': { select: { data: [mockStep], error: null } },
  });

  // Ensure saved contribution carries a true-root identity
  const fileManager = new MockFileManagerService();
  const documentRelationships: DocumentRelationships = {
    [DialecticStageSlug.Thesis]: 'doc-root-abc',
  };
  const savedWithIdentity = { ...mockContribution, document_relationships: documentRelationships };
  fileManager.setUploadAndRegisterFileResponse(savedWithIdentity, null);

  const deps = getMockDeps();
  deps.fileManager = fileManager;

  // Use a markdown output type so RENDER job is enqueued
  const renderPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    stageSlug: DialecticStageSlug.Thesis,
  };

  const job = createMockJob(renderPayload);
  const params: ExecuteModelCallAndSaveParams = {
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'auth-token',
    job,
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload(),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
  };

  await executeModelCallAndSave(params);

  // Assert a single INSERT into jobs for the follow-up RENDER job
  const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
  assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');
  assertEquals(insertCalls.callCount, 1, 'Expected a single insert for the scheduled RENDER job');

  const insertedArg = insertCalls.callsArgs[0][0];
  const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);
  assert(isRecord(inserted), 'Inserted payload must be an object');

  // job_type must be RENDER
  assertEquals(inserted['job_type'], 'RENDER');

  // Parent must associate to the just-completed EXECUTE job
  assertEquals(inserted['parent_job_id'], job.id, 'Parent job id must point to completed EXECUTE job');

  // Payload must include required renderer identity fields; no step_info allowed
  const pl = inserted['payload'];
  assert(isRecord(pl), 'Inserted payload.payload must be an object');
  assertEquals(pl['projectId'], renderPayload.projectId);
  assertEquals(pl['sessionId'], renderPayload.sessionId);
  assertEquals(pl['iterationNumber'], renderPayload.iterationNumber);
  assertEquals(pl['stageSlug'], renderPayload.stageSlug);
  assertEquals(pl['documentIdentity'], 'doc-root-abc');
  assert(!('step_info' in pl), 'Payload must not include deprecated step_info');
});





