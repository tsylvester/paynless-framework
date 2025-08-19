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
    isChatApiRequest,
} from '../_shared/utils/type_guards.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import type { 
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
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import type { LogMetadata } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import type { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

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
        ...overrides,
    };
  
    return baseJob;
  }

export const testPayload: DialecticExecuteJobPayload = {
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
        max_context_window_tokens: 10000,
        context_window_tokens: 8000,
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
        // ADDED: Provide default mocks for services needed by compression logic
        ragService: new MockRagService(),
        tokenWalletService: tokenWalletServiceOverride || createMockTokenWalletService().instance,
        embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) },
        countTokens: () => 0, // Default to 0, tests that need it will stub this.
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
      tokenWalletService: createMockTokenWalletService().instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
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
      tokenWalletService: createMockTokenWalletService().instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
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
      tokenWalletService: createMockTokenWalletService().instance,
      countTokens: () => 0, // Default to 0, tests that need specific counts will stub this.
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
                promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
        };
        await executeModelCallAndSave(params);
  
        assert(fileManager.uploadAndRegisterFile.calls.length > 1, 'Expected fileManager.uploadAndRegisterFile to be called a second time');
        const uploadContext = fileManager.uploadAndRegisterFile.calls[1].args[0]; // Check the second call
        assertEquals(uploadContext.contributionMetadata?.isIntermediate, false, "isIntermediate flag should default to false");
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
                promptConstructionPayload: {
                    systemInstruction: 'System instruction',
                    conversationHistory: [],
                    resourceDocuments: [],
                    currentUserPrompt: 'User prompt',
                },
                sessionData: mockSessionData,
                compressionStrategy: getSortedCompressionCandidates,
            };
            await executeModelCallAndSave(params);
        } catch (e: unknown) {
            errorThrown = true;
            if (e instanceof Error) {
                assert(e.message.includes('AI response was empty'), "Expected error message to match AI failure.");
            } else {
                assert(false, "Threw something that was not an Error");
            }
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
            promptConstructionPayload: {
                systemInstruction: 'System instruction',
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: 'User prompt',
            },
            sessionData: mockSessionData,
            compressionStrategy: getSortedCompressionCandidates,
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
            testDeps.countTokens = countTokensForMessages; // FIX: Use the real token counter
            
            const params: ExecuteModelCallAndSaveParams = {
                dbClient: dbClient as unknown as SupabaseClient<Database>,
                deps: testDeps,
                authToken: 'auth-token',
                job: createMockJob(testPayload),
                projectOwnerUserId: 'user-789',
                providerDetails: mockProviderData,
                promptConstructionPayload: largePromptConstructionPayload,
                sessionData: mockSessionData,
                compressionStrategy: getSortedCompressionCandidates,
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

Deno.test('executeModelCallAndSave - Document Relationships', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps = getMockDeps();
    deps.fileManager = fileManager;

    await t.step('should pass document_relationships to the fileManager', async () => {
        const relationshipsPayload: DialecticExecuteJobPayload = {
            ...testPayload,
            output_type: 'pairwise_synthesis_chunk',
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
        };

        await executeModelCallAndSave(params);

        assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        
        const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
        assertExists(uploadContext.contributionMetadata, "Contribution metadata should exist");
        
        assertEquals(uploadContext.contributionMetadata.document_relationships, relationshipsPayload.document_relationships, "document_relationships object was not passed correctly to the file manager");
    });

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
    };

    const promptConstructionPayload: PromptConstructionPayload = {
        systemInstruction: "You are a helpful assistant.",
        conversationHistory: [{ role: 'user', content: 'Previous message' }],
        resourceDocuments: [mockResourceDocument],
        currentUserPrompt: "This is the current user prompt.",
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: mockSessionData,
        promptConstructionPayload,
        compressionStrategy: getSortedCompressionCandidates,
    };

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(callUnifiedAISpy.calls.length, 1, "callUnifiedAIModel should be called once");
    
    const firstArg = callUnifiedAISpy.calls[0].args[0];
    assert(isChatApiRequest(firstArg), "First argument to callUnifiedAIModel should be a ChatApiRequest");
    
    assertEquals(firstArg.message, "This is the current user prompt.");
    assertEquals(firstArg.systemInstruction, "You are a helpful assistant.");
    assertExists(firstArg.messages);
    assertEquals(firstArg.messages.length, 2, "Should include history and resource documents");
    assertEquals(firstArg.providerId, mockProviderData.id);

    clearAllStubs?.();
});
