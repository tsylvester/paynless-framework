import {
    assertEquals,
    assertExists,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { 
    spy, 
    stub,
  } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import { Database, Tables } from '../types_db.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
  import { logger } from '../_shared/logger.ts';
  import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isJson,
    isRecord,
    isChatApiRequest,
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
    PromptConstructionPayload,
    SourceDocument,
    DocumentRelationships,
    UnifiedAIResponse,
  } from '../dialectic-service/dialectic.interface.ts';
import { 
  FileType, 
  DialecticStageSlug 
} from '../_shared/types/file_manager.types.ts';
import { LogMetadata, FinishReason } from '../_shared/types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { isDocumentRelationships } from '../_shared/utils/type_guards.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { 
  CountTokensFn, 
  CountTokensDeps, 
  CountableChatPayload 
} from '../_shared/types/tokenizer.types.ts';
import { ITokenWalletService } from '../_shared/types/tokenWallet.types.ts';
import { 
  RenderCheckReason, 
  ShouldEnqueueRenderJobResult 
} from '../_shared/types/shouldEnqueueRenderJob.interface.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { IExecuteJobContext } from './JobContext.interface.ts';
import { createJobContext, createExecuteJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
import { IRagService } from '../_shared/services/rag_service.interface.ts';
import { IEmbeddingClient } from '../_shared/services/indexing_service.interface.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { DownloadFromStorageFn, DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';

const encoded = new TextEncoder().encode('test content');
const buffer = new ArrayBuffer(encoded.length);
new Uint8Array(buffer).set(encoded);

const mockDownloadFromStorage: DownloadFromStorageFn = createMockDownloadFromStorage({ 
  mode: 'success', 
  data: buffer });

// Local helpers for arranging tests
export const buildPromptPayload = (overrides: Partial<PromptConstructionPayload> = {}): PromptConstructionPayload => ({
  systemInstruction: undefined,
  conversationHistory: [],
  resourceDocuments: [],
  currentUserPrompt: 'RENDERED: Hello',
  ...overrides,
});

export const buildExecuteParams = (dbClient: SupabaseClient<Database>, deps: IExecuteJobContext, overrides: Partial<ExecuteModelCallAndSaveParams> = {}): ExecuteModelCallAndSaveParams => ({
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

export const spyCallModel = (deps: IExecuteJobContext) => spy(deps, 'callUnifiedAIModel');

// Helper function to create a valid DialecticJobRow for testing
export function createMockJob(payload: DialecticJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
    if (!isJson(payload)) {
        throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
    }
  
    const baseJob: Tables<'dialectic_generation_jobs'> = {
        id: 'job-id-123',
        session_id: 'session-id-123',
        stage_slug: 'thesis',
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
    document_key: 'header_context',
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'thesis',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: 'thesis',
    }
  };
  
export const mockSessionRow: Tables<'dialectic_sessions'> = {
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

export const mockSessionData: DialecticSession = {
    id: 'session-456',
    project_id: 'project-abc',
    session_description: 'A mock session',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
  
export const mockContribution: Tables<'dialectic_contributions'> = {
      id: 'contrib-123',
      session_id: 'session-456',
      stage: 'thesis',
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

  
export const setupMockClient = (configOverrides: Record<string, any> = {}) => {
      return createMockSupabaseClient('user-789', {
          genericMockResults: {
              ...configOverrides,
          },
      });
  };
  
  // Helper function to create IExecuteJobContext using factory/slicer pattern
  // Accepts override parameters for commonly-overridden fields in tests
export const getMockDeps = (
    overrides?: {
        tokenWalletService?: ITokenWalletService;
        fileManager?: MockFileManagerService;
        countTokens?: CountTokensFn;
        ragService?: IRagService;
        embeddingClient?: IEmbeddingClient;
        downloadFromStorage?: DownloadFromStorageFn;
    },
): IExecuteJobContext => {
      // Create base mock params using the shared helper
      const baseParams = createMockJobContextParams();
      
      // Set up fileManager with upload response (preserving existing test behavior)
      const fileManager = overrides?.fileManager || new MockFileManagerService();
      // IMPORTANT: if the caller provides a fileManager, assume they will configure its responses.
      // Only apply our default response for the harness-owned instance.
      if (!overrides?.fileManager) {
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
      }
      
      // Construct params with overrides
      const mockParams = {
          ...baseParams,
          fileManager: fileManager,
          ...(overrides?.tokenWalletService ? { tokenWalletService: overrides.tokenWalletService } : {}),
          ...(overrides?.countTokens ? { countTokens: overrides.countTokens } : {}),
          ...(overrides?.ragService ? { ragService: overrides.ragService } : {}),
          ...(overrides?.embeddingClient ? { embeddingClient: overrides.embeddingClient } : {}),
          ...(overrides?.downloadFromStorage ? { downloadFromStorage: overrides.downloadFromStorage } : {}),
      };
      
      // Create root context using factory
      const rootCtx = createJobContext(mockParams);
      
      // Slice to execute context
      return createExecuteJobContext(rootCtx);
  };
  
Deno.test('executeModelCallAndSave - Happy Path', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps({ fileManager });
    
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

    const deps = getMockDeps({ fileManager });

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

    const deps = getMockDeps({ fileManager });
  
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
    const deps = getMockDeps();

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
        const deps: IExecuteJobContext = getMockDeps();
        
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

    const mockOversizeDocument: Tables<'dialectic_project_resources'> = {
        id: 'doc-oversize',
        stage_slug: 'thesis',
        project_id: 'project-abc',
        session_id: 'session-456',
        iteration_number: 1,
        resource_type: 'rendered_document',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
        file_name: 'modelA_1_rendered_document.md',
        mime_type: 'text/markdown',
        storage_bucket: 'test-bucket',
        size_bytes: 2000,
        user_id: 'user-789',
        source_contribution_id: null,
        resource_description: null,
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockLimitedProvider], error: null }
        },
        // Provide a large matching rendered document so executor gathers it (not assembler)
        'dialectic_project_resources': {
            select: () => {
                return Promise.resolve({
                    data: [mockOversizeDocument],
                    error: null,
                });
            },
        },
    });
    const deps: IExecuteJobContext = getMockDeps();

    await t.step('should throw ContextWindowError if prompt exceeds token limit and cannot be compressed', async () => {
        let errorThrown = false;

        try {
            const largePromptConstructionPayload: PromptConstructionPayload = {
                conversationHistory: [],
                resourceDocuments: [],
                currentUserPrompt: "This is a test prompt.",
            };

            const mockRagService = new MockRagService();
            mockRagService.setConfig({
                // This content is long enough to ensure the token count remains > 10 after compression
                mockContextResult: 'This is the compressed but still oversized content that will not fit.',
            });
            // The gathered document must have large content so the real countTokens exceeds the 10-token limit
            const oversizeContent = new TextEncoder().encode('A'.repeat(2000));
            const oversizeBuffer = new ArrayBuffer(oversizeContent.byteLength);
            new Uint8Array(oversizeBuffer).set(oversizeContent);
            const oversizeDownload = createMockDownloadFromStorage({ mode: 'success', data: oversizeBuffer });
            const testDeps: IExecuteJobContext = getMockDeps({
                ragService: mockRagService,
                countTokens: countTokens, // Use the real token counter
                downloadFromStorage: oversizeDownload,
            });
            
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
                inputsRelevance: [],
                inputsRequired: [
                    { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'thesis' },
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

Deno.test('executeModelCallAndSave - source_group validation is planner-aware: consolidation jobs (per_model) allow source_group = null', async () => {
    // Consolidation jobs with per_model granularity strategy use source_group = null to signal creation of a new lineage root.
    // The validation should check the recipe step's granularity_strategy and allow null for per_model jobs.

    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockRecipeStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'recipe-step-1',
        template_id: 'template-1',
        step_number: 3,
        parallel_group: 3,
        branch_key: 'synthesis_document_feature_spec',
        step_key: 'synthesis_document_feature_spec',
        step_slug: 'synthesis-document-feature-spec',
        step_name: 'Synthesize Feature Spec Across Models',
        step_description: 'Synthesize the final feature spec from pairwise outputs.',
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: 'prompt-template-1',
        output_type: 'assembled_document_json',
        granularity_strategy: 'per_model',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [{
                document_key: 'synthesis_document_feature_spec',
                template_filename: 'synthesis_document_feature_spec.json',
                artifact_class: 'assembled_json',
                file_type: 'json',
            }],
            files_to_generate: [{
                template_filename: 'synthesis_document_feature_spec.json',
                from_document_key: 'synthesis_document_feature_spec',
            }],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockRecipeStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        id: 'consolidation-contrib-1',
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);
    const deps: IExecuteJobContext = getMockDeps({ fileManager });

    const mockAiResponse: UnifiedAIResponse = {
        content: '{"content": "consolidation document"}',
        contentType: 'application/json',
        inputTokens: 100,
        outputTokens: 200,
        processingTimeMs: 500,
        rawProviderResponse: { finish_reason: 'stop' },
        finish_reason: 'stop',
    };

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(mockAiResponse));

    const consolidationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.AssembledDocumentJson,
        document_key: 'synthesis_document_feature_spec',
        stageSlug: 'synthesis',
        document_relationships: {
            source_group: null,
        },
        planner_metadata: {
            recipe_step_id: 'recipe-step-1',
        },
    };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(consolidationPayload),
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

    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'FileManager.uploadAndRegisterFile should be called');
    
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(uploadContext.contributionMetadata, "Contribution metadata should exist");
    
    const docRelationships = uploadContext.contributionMetadata.document_relationships;
    assert(
        isDocumentRelationships(docRelationships),
        "document_relationships should be a valid DocumentRelationships object"
    );
    // Consolidation jobs with per_model granularity strategy have source_group = null in the payload.
    assertEquals(
        docRelationships.source_group, 
        null, 
        "source_group should be null for consolidation jobs with per_model granularity strategy"
    );

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
    const deps: IExecuteJobContext = getMockDeps({ fileManager });

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
    const deps: IExecuteJobContext = getMockDeps({ fileManager });

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

    const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
        systemInstruction: "You are a helpful assistant.",
        conversationHistory: [{ role: 'assistant', content: 'Previous message' }],
        resourceDocuments: [],
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

Deno.test('executeModelCallAndSave - emits execute_chunk_completed when finish_reason is stop (final chunk; execute_completed is emitted by processSimpleJob)', async () => {
  resetMockNotificationService();
  
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();

  // Stub call to return finish_reason: stop
  const mockAiResponse: UnifiedAIResponse = {
    content: '{"ok": true}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 50,
    finish_reason: 'stop',
    rawProviderResponse: { finish_reason: 'stop' },
  };
  const callUnifiedAISpy = stub(deps, 'callUnifiedAIModel', () => Promise.resolve(mockAiResponse));

  // Use a document file type with document_key
  const documentPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
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

  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1, 'Expected an execute_chunk_completed event emission for final chunk');
  const [payloadArg, targetUserId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'execute_chunk_completed');
  assertEquals(payloadArg.sessionId, documentPayload.sessionId);
  assertEquals(payloadArg.stageSlug, documentPayload.stageSlug);
  assertEquals(payloadArg.job_id, 'job-id-123');
  assertEquals(payloadArg.document_key, documentPayload.document_key);
  assertEquals(payloadArg.modelId, documentPayload.model_id);
  assertEquals(payloadArg.iterationNumber, documentPayload.iterationNumber);
  assertEquals(targetUserId, 'user-789');

  callUnifiedAISpy.restore();
  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - emits document_chunk_completed for continuation chunks', async () => {
  resetMockNotificationService();
  
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();

  // Continuation job payload with required document_relationships
  // Use a document file type with document_key for document_chunk_completed event
  // Use valid DialecticStageSlug enum value for document_relationships key
  const documentRelationships: DocumentRelationships = {
    source_group: '550e8400-e29b-41d4-a716-446655440000',
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

  // One call expected: execute_chunk_completed (execute_completed is emitted by processSimpleJob)
  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1, 'Expected an execute_chunk_completed event emission');
  const [payloadArg, targetUserId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'execute_chunk_completed');
  assertEquals(payloadArg.sessionId, continuationPayload.sessionId);
  assertEquals(payloadArg.stageSlug, continuationPayload.stageSlug);
  assertEquals(payloadArg.job_id, 'job-id-123');
  assertEquals(payloadArg.document_key, continuationPayload.document_key);
  assertEquals(payloadArg.modelId, continuationPayload.model_id);
  assertEquals(payloadArg.iterationNumber, continuationPayload.iterationNumber);
  assertEquals(targetUserId, 'user-789');

  callUnifiedAISpy.restore();
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

  const deps: IExecuteJobContext = getMockDeps({ 
    tokenWalletService: mockTokenWalletService,
    countTokens: () => 100, // Non-oversized path: fixed token count
  });
  const callUnifiedAISpy = spy(deps, 'callUnifiedAIModel');

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
  const mockResourceDoc1: Tables<'dialectic_project_resources'> = {
    id: 'doc-r1',
    stage_slug: 'thesis',
    project_id: 'project-abc',
    session_id: 'session-456',
    iteration_number: 1,
    resource_type: 'rendered_document',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
    file_name: 'modelA_1_rendered_document.md',
    mime_type: 'text/markdown',
    storage_bucket: 'test-bucket',
    size_bytes: 100,
    user_id: 'user-789',
    source_contribution_id: null,
    resource_description: null,
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [mockResourceDoc1],
          error: null,
        });
      },
    },
  });

  // Configure download mock to return known content for the gathered document
  const encodedDocContent = new TextEncoder().encode('Rendered document content');
  const docContentBuffer = new ArrayBuffer(encodedDocContent.byteLength);
  new Uint8Array(docContentBuffer).set(encodedDocContent);
  const mockDownloadForTest = createMockDownloadFromStorage({ mode: 'success', data: docContentBuffer });

  const deps = getMockDeps({ downloadFromStorage: mockDownloadForTest });
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

  const promptConstructionPayload: PromptConstructionPayload = {
    systemInstruction: 'SYS',
    conversationHistory: [{ role: 'user', content: 'HIST' }],
    resourceDocuments: [],
    currentUserPrompt: 'CURR',
  };

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload,
    inputsRequired: [ { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'thesis' } ],
  });

  await executeModelCallAndSave(params);

  // Assert sizing saw the resource document and counted it
  assert(sizedPayload !== null, 'countTokens should have been called and captured payload');
  const sizedHasDocs = isRecord(sizedPayload) && Array.isArray(sizedPayload['resourceDocuments']);
  const sizedDocs = sizedHasDocs ? sizedPayload['resourceDocuments'] : [];
  assert(sizedHasDocs && sizedDocs.length === 1, 'resourceDocuments should be present in sizing payload');

  // Adapter received resourceDocuments forwarded
  assertEquals(callUnifiedAISpy.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(sent), 'Adapter should receive a ChatApiRequest');
  assert(Array.isArray(sent.resourceDocuments) && sent.resourceDocuments.length === 1, 'resourceDocuments must be forwarded to adapter');
  assertEquals(sent.resourceDocuments[0].content, 'Rendered document content');
  assert(Array.isArray(sent.messages), 'messages must be an array');

  countTokensStub.restore();
});

Deno.test('executeModelCallAndSave - builds full ChatApiRequest including resourceDocuments and walletId', async () => {
  const mockResourceDoc2: Tables<'dialectic_project_resources'> = {
    id: 'doc-xyz',
    stage_slug: 'thesis',
    project_id: 'project-abc',
    session_id: 'session-456',
    iteration_number: 1,
    resource_type: 'rendered_document',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
    file_name: 'modelB_1_rendered_document.md',
    mime_type: 'text/markdown',
    storage_bucket: 'test-bucket',
    size_bytes: 100,
    user_id: 'user-789',
    source_contribution_id: null,
    resource_description: null,
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [mockResourceDoc2],
          error: null,
        });
      },
    },
  });

  // Configure download mock to return known content for the gathered document
  const encodedDoc2Content = new TextEncoder().encode('Full ChatApiRequest doc content');
  const doc2ContentBuffer = new ArrayBuffer(encodedDoc2Content.byteLength);
  new Uint8Array(doc2ContentBuffer).set(encodedDoc2Content);
  const mockDownloadForDoc2 = createMockDownloadFromStorage({ mode: 'success', data: doc2ContentBuffer });

  const deps = getMockDeps({ downloadFromStorage: mockDownloadForDoc2 });
  const callUnifiedAISpy = spyCallModel(deps);

  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'System goes here',
    conversationHistory: [{ role: 'assistant', content: 'Hi' }],
    resourceDocuments: [],
    currentUserPrompt: 'User says hello',
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    promptConstructionPayload,
    inputsRequired: [ { type: 'document', document_key: FileType.RenderedDocument, required: true, slug: 'thesis' } ],
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
  // Resource documents should be present distinctly on the request (gathered via inputsRequired + storage download)
  assertExists(sent.resourceDocuments);
  assertEquals(sent.resourceDocuments.length, 1);
  assertEquals(sent.resourceDocuments[0].content, 'Full ChatApiRequest doc content');
});

Deno.test('executeModelCallAndSave - identity: sized payload equals sent request (non-oversized)', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'SYS: identity',
    conversationHistory: [{ role: 'assistant', content: 'Hi (history)' }],
    resourceDocuments: [],
    currentUserPrompt: 'User prompt for identity',
  });

  const sizedPayloads: unknown[] = [];
  const deps: IExecuteJobContext = getMockDeps({ 
    countTokens: (depsArg: CountTokensDeps, payloadArg: CountableChatPayload) => {
      sizedPayloads.push(payloadArg);
      return 5;
    },
  });
  const callUnifiedAISpy = spyCallModel(deps);

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
  const mockResourceDoc3: Tables<'dialectic_project_resources'> = {
    id: 'doc-for-compress',
    stage_slug: 'thesis',
    project_id: 'project-abc',
    session_id: 'session-456',
    iteration_number: 1,
    resource_type: 'rendered_document',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
    file_name: 'modelC_1_business_case.md',
    mime_type: 'text/markdown',
    storage_bucket: 'test-bucket',
    size_bytes: 100,
    user_id: 'user-789',
    source_contribution_id: null,
    resource_description: null,
  };

  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [limitedProvider], error: null } },
    'dialectic_project_resources': {
      select: () => {
        return Promise.resolve({
          data: [mockResourceDoc3],
          error: null,
        });
      },
    },
  });

  // Ensure RAG returns something so the loop can iterate
  const mockRag = new MockRagService();
  mockRag.setConfig({ mockContextResult: 'compressed summary' });

  // Craft payload with enough content/history to produce at least one candidate
  const promptConstructionPayload: PromptConstructionPayload = buildPromptPayload({
    systemInstruction: 'SYS: compression',
    conversationHistory: [
      { role: 'assistant', content: 'History A' },
      { role: 'assistant', content: 'History B' },
      { role: 'user', content: 'Please continue.' },
    ],
    resourceDocuments: [],
    currentUserPrompt: 'User for compression identity',
  });

  // Inject download mock so gathered resource doc has actual content
  const compressDocEncoded = new TextEncoder().encode('Business case document content for compression test');
  const compressDocBuffer = new ArrayBuffer(compressDocEncoded.byteLength);
  new Uint8Array(compressDocBuffer).set(compressDocEncoded);
  const compressDownloadMock = createMockDownloadFromStorage({ mode: 'success', data: compressDocBuffer });

  // Statefully force first count oversized, second count fits
  const sizedPayloads: unknown[] = [];
  let callIdx = 0;
  const depsWithCount: IExecuteJobContext = getMockDeps({
    tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve('10') }).instance,
    ragService: mockRag,
    downloadFromStorage: compressDownloadMock,
    countTokens: (depsArg: CountTokensDeps, payloadArg: CountableChatPayload) => {
      sizedPayloads.push(payloadArg);
      callIdx += 1;
      return callIdx === 1 ? 100 : 40; // first pass oversized, then fits
    },
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, depsWithCount, {
    promptConstructionPayload,
    // Ensure executor gathers this doc and compression can operate
    inputsRequired: [ { type: 'document', document_key: FileType.business_case, required: true, slug: 'thesis' } ],
    // Provide a compression strategy that yields candidates from gathered documents
    compressionStrategy: async (_db, _deps, documents) => documents.map((d, i) => ({
      id: d.id,
      content: d.content,
      sourceType: 'document',
      originalIndex: i,
      valueScore: 0.5,
      effectiveScore: 0.5,
    })),
  });
  const callUnifiedAISpyWithCount = spyCallModel(depsWithCount);
  await executeModelCallAndSave(params);

  assertEquals(callUnifiedAISpyWithCount.calls.length, 1, 'callUnifiedAIModel should be called once');
  const sent = callUnifiedAISpyWithCount.calls[0].args[0];
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
    const deps: IExecuteJobContext = getMockDeps({ fileManager });

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

    const mockPromptResource: Tables<'dialectic_project_resources'> = {
        id: sourcePromptResourceId,
        stage_slug: null,
        project_id: 'project-abc',
        session_id: 'session-456',
        iteration_number: null,
        resource_type: 'prompt',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        storage_path: 'path/to/prompt',
        file_name: 'prompt.txt',
        mime_type: 'text/plain',
        storage_bucket: 'test-bucket',
        size_bytes: 100,
        user_id: 'user-789',
        source_contribution_id: null,
        resource_description: null,
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null },
        },
        'dialectic_project_resources': {
            update: {
                data: [mockPromptResource],
                error: null,
                count: 1,
                status: 200,
                statusText: 'OK',
            },
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps: IExecuteJobContext = getMockDeps({ fileManager });

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

Deno.test('when the model produces malformed JSON, it should trigger a retry, not a continuation', async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps: IExecuteJobContext = getMockDeps({ fileManager });
    
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
        const mk = (id: string, key: string): Tables<'dialectic_contributions'> => ({
          id,
          stage: 'thesis',
          session_id: 'session-456',
          iteration_number: 1,
          contribution_type: 'document',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
          file_name: `model-collect_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          model_id: null,
          model_name: null,
          is_header: false,
          is_latest_edit: true,
          edit_version: 1,
          citations: null,
          document_relationships: null,
          error: null,
          original_model_contribution_id: null,
          processing_time_ms: null,
          prompt_template_id_used: null,
          raw_response_storage_path: null,
          seed_prompt_url: null,
          target_contribution_id: null,
          tokens_used_input: null,
          tokens_used_output: null,
          source_prompt_resource_id: null,
        });
        const data = [
          mk('c1', 'business_case'),
          mk('c2', 'feature_spec'),
        ];
        return { data, error: null };
      },
    },
    'dialectic_project_resources': {
      select: (_state: any) => {
        const mk = (id: string, key: string): Tables<'dialectic_project_resources'> => ({
          id,
          stage_slug: 'thesis',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          resource_type: 'rendered_document',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
          file_name: `model-collect_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          source_contribution_id: null,
          resource_description: null,
        });
        const data = [mk('r1', 'seed_prompt'), mk('r2', 'business_case'), mk('r3', 'feature_spec')];
        return { data, error: null };
      },
    },
    'dialectic_feedback': {
      select: (_state: any) => {
        const mk = (id: string, key: string): Tables<'dialectic_feedback'> => ({
          id,
          stage_slug: 'thesis',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          feedback_type: 'feedback',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
          file_name: `model-collect_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          target_contribution_id: null,
          resource_description: null,
        });
        const data = [mk('f1', 'business_case')];
        return { data, error: null };
      },
    },
  });

  // Sequential download mock returning per-document content in inputsRequired gathering order
  // Order: business_case(resource r2), feature_spec(resource r3), seed_prompt(resource r1), business_case(feedback f1)
  let gatherDownloadIdx = 0;
  const gatherContentByOrder = ['R2', 'R3', 'R1', 'F1'];
  const gatherDownloadFn: DownloadFromStorageFn = async () => {
    const text = gatherContentByOrder[gatherDownloadIdx] ?? `doc-${gatherDownloadIdx}`;
    gatherDownloadIdx++;
    const enc = new TextEncoder().encode(text);
    const buf = new ArrayBuffer(enc.length);
    new Uint8Array(buf).set(enc);
    return { data: buf, mimeType: 'text/markdown', error: null };
  };
  const deps: IExecuteJobContext = getMockDeps({ countTokens: () => 10, downloadFromStorage: gatherDownloadFn }); // non-oversized
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
      { type: 'document', document_key: FileType.business_case, required: true, slug: 'thesis' },
      { type: 'document', document_key: FileType.feature_spec, required: true, slug: 'thesis' },
      { type: 'document', document_key: FileType.SeedPrompt, required: true, slug: 'thesis' },
      { type: 'feedback', document_key: FileType.business_case, required: false, slug: 'thesis' },
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
        const mk = (id: string, key: string, stage: string): Tables<'dialectic_contributions'> => ({
          id,
          stage,
          session_id: 'session-456',
          iteration_number: 1,
          contribution_type: 'document',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: `project-abc/session_session-456/iteration_1/${stage}/documents`,
          file_name: `modelM_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          model_id: null,
          model_name: null,
          is_header: false,
          is_latest_edit: true,
          edit_version: 1,
          citations: null,
          document_relationships: null,
          error: null,
          original_model_contribution_id: null,
          processing_time_ms: null,
          prompt_template_id_used: null,
          raw_response_storage_path: null,
          seed_prompt_url: null,
          target_contribution_id: null,
          tokens_used_input: null,
          tokens_used_output: null,
          source_prompt_resource_id: null,
        });
        const data = [
          mk('c-match', 'business_case', 'thesis'),
          mk('c-skip', 'risk_register', 'other-stage'),
        ];
        return { data, error: null };
      },
    },
    'dialectic_project_resources': {
      select: (_state: any) => {
        const mk = (id: string, key: string): Tables<'dialectic_project_resources'> => ({
          id,
          stage_slug: 'thesis',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          resource_type: 'rendered_document',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
          file_name: `modelM_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          source_contribution_id: null,
          resource_description: null,
        });
        const data = [mk('r-match', 'business_case')];
        return { data, error: null };
      },
    },
    'dialectic_feedback': {
      select: (_state: any) => {
        const mk = (id: string, key: string): Tables<'dialectic_feedback'> => ({
          id,
          stage_slug: 'thesis',
          project_id: 'project-abc',
          session_id: 'session-456',
          iteration_number: 1,
          feedback_type: 'feedback',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          storage_bucket: 'test-bucket',
          storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
          file_name: `modelM_1_${key}.md`,
          mime_type: 'text/markdown',
          size_bytes: 100,
          user_id: 'user-789',
          target_contribution_id: null,
          resource_description: { document_key: key },
        });
        const data = [mk('f-match', FileType.UserFeedback)];
        return { data, error: null };
      },
    },
  });

  const deps: IExecuteJobContext = getMockDeps({ countTokens: () => 10 });
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
      { type: 'document', document_key: FileType.business_case, required: true, slug: 'thesis' },
      { type: 'feedback', document_key: FileType.UserFeedback, required: false, slug: 'thesis' },
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
    const mockStage: Tables<'dialectic_stages'> = {
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

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
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
          files_to_generate: [
            {
              from_document_key: 'business_case',
              template_filename: 'thesis_business_case.md',
            },
          ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

  const mockRenderJob: Tables<'dialectic_generation_jobs'> = {
        id: 'render-job-456', 
        job_type: 'RENDER', 
        status: 'pending',
        session_id: 'session-456',
        stage_slug: DialecticStageSlug.Thesis,
        iteration_number: 1,
        parent_job_id: 'job-id-123',
        payload: {},
        is_test_job: false,
        user_id: 'user-789',
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        attempt_count: 0,
        max_retries: 3,
        prerequisite_job_id: null,
        target_contribution_id: null,
        error_details: null,
    };

  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_stages': { select: { data: [mockStage], error: null } },
    'dialectic_stage_recipe_instances': { select: { data: [mockInstance], error: null } },
    'dialectic_recipe_template_steps': { select: { data: [mockStep], error: null } },
    'dialectic_generation_jobs': { 
        insert: { 
            data: [mockRenderJob], 
            error: null 
        } 
    },
  });

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  // Ensure saved contribution - the fix will enforce document_relationships[stageSlug] = contribution.id
  const savedWithIdentity: DialecticContributionRow = { ...mockContribution };
  fileManager.setUploadAndRegisterFileResponse(savedWithIdentity, null);

  // This test asserts the RENDER job enqueue path. The production decision is delegated to
  // deps.shouldEnqueueRenderJob, so we must stub it to the markdown-rendering path here.
  const renderDecisionReason: RenderCheckReason = 'is_markdown';
  const renderDecision: ShouldEnqueueRenderJobResult = {
    shouldRender: true,
    reason: renderDecisionReason,
  };
  stub(deps, 'shouldEnqueueRenderJob', () => Promise.resolve(renderDecision));

  stub(deps, 'callUnifiedAIModel', () => Promise.resolve({
    content: '{"content": "AI response"}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 50,
    rawProviderResponse: { finish_reason: 'stop' },
  }));

  // Use a markdown output type so RENDER job is enqueued
  const renderPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    output_type: FileType.business_case,
    document_key: 'business_case',
    stageSlug: DialecticStageSlug.Thesis,
    document_relationships: {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
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
  assertEquals(pl['documentIdentity'], mockContribution.id);
  assert(!('step_info' in pl), 'Payload must not include deprecated step_info');

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - throws when required inputsRequired document is missing', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_feedback': {
      select: () => Promise.resolve({ data: [], error: null }),
    },
  });

  const deps = getMockDeps();
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    inputsRequired: [
      { type: 'feedback', document_key: FileType.UserFeedback, required: true, slug: 'thesis' },
    ],
  });

  let thrown: Error | null = null;
  try {
    await executeModelCallAndSave(params);
  } catch (e) {
    thrown = e instanceof Error ? e : new Error(String(e));
  }

  assert(thrown !== null, 'executeModelCallAndSave should throw when required document is missing');
  assert(
    thrown!.message.includes('Required input document missing') || thrown!.message.includes('document_key') || thrown!.message.includes('thesis'),
    `Error message should identify missing document_key and stage; got: ${thrown!.message}`
  );
  assert(thrown!.message.includes('thesis'), 'Error message should include stage slug (thesis)');

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - error message identifies missing document_key and stage', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_feedback': {
      select: () => Promise.resolve({ data: [], error: null }),
    },
  });

  const deps = getMockDeps();
  const missingKey = FileType.UserFeedback;
  const missingStage = 'thesis';
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    inputsRequired: [
      { type: 'feedback', document_key: missingKey, required: true, slug: missingStage },
    ],
  });

  let thrown: Error | null = null;
  try {
    await executeModelCallAndSave(params);
  } catch (e) {
    thrown = e instanceof Error ? e : new Error(String(e));
  }

  assert(thrown !== null, 'executeModelCallAndSave should throw');
  assert(
    thrown!.message.includes(missingKey),
    `Error message should include missing document_key '${missingKey}'; got: ${thrown!.message}`
  );
  assert(
    thrown!.message.includes(missingStage),
    `Error message should include missing stage '${missingStage}'; got: ${thrown!.message}`
  );

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - optional inputsRequired document missing does not throw', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
    'dialectic_feedback': {
      select: () => Promise.resolve({ data: [], error: null }),
    },
  });

  const deps = getMockDeps();
  const mockAiResponse: UnifiedAIResponse = {
    content: '{}',
    contentType: 'application/json',
    inputTokens: 0,
    outputTokens: 0,
    processingTimeMs: 0,
    finish_reason: 'stop',
    rawProviderResponse: {},
  };
  const callUnifiedAISpy = stub(deps, 'callUnifiedAIModel', () => Promise.resolve(mockAiResponse));

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    inputsRequired: [
      { type: 'feedback', document_key: FileType.UserFeedback, required: false, slug: 'thesis' },
    ],
  });

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch {
    threw = true;
  }

  assert(!threw, 'executeModelCallAndSave should not throw when only optional document is missing');
  assert(callUnifiedAISpy.calls.length >= 1, 'callUnifiedAIModel should be invoked');

  callUnifiedAISpy.restore();
  clearAllStubs?.();
});