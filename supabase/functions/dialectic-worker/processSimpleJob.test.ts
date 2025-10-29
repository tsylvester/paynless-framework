import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database, Tables, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isDialecticJobPayload, isJson, isRecord } from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import type { 
    DialecticJobRow, 
    DialecticSession, 
    DialecticContributionRow, 
    IDialecticJobDeps, 
    SelectedAiProvider, 
    DialecticJobPayload, 
} from '../dialectic-service/dialectic.interface.ts';
import type { AiModelExtendedConfig } from '../_shared/types.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { getGranularityPlanner } from './strategies/granularity.strategies.ts';
import { IndexingService, LangchainTextSplitter, EmbeddingClient } from '../_shared/services/indexing_service.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { MockPromptAssembler, MOCK_ASSEMBLED_PROMPT } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';

// Helper: wrap a PromptAssembler to forbid direct calls to legacy methods
function wrapAssemblerForbidLegacy<T extends object>(assembler: T): T {
  const forbidden = new Set(['gatherContext', 'render', 'gatherInputsForStage', 'gatherContinuationInputs']);
  return new Proxy(assembler, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && forbidden.has(prop)) {
        throw new Error(`Forbidden direct call to promptAssembler.${prop}`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const mockPayload: Json = {
  projectId: 'project-abc',
  sessionId: 'session-456',
  stageSlug: 'test-stage',
  model_id: 'model-def',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'wallet-ghi',
  user_jwt: 'jwt.token.here',
  // Provide a resolvable recipe step by default so assembler is reached
  planner_metadata: { recipe_step_id: 'step-1', recipe_template_id: 'template-123' },
};

if (!isDialecticJobPayload(mockPayload)) {
  throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload.");
}

// Define a type for our mock job for clarity
const mockJob: DialecticJobRow = {
  id: 'job-123',
  session_id: 'session-456',
  user_id: 'user-789',
  stage_slug: 'test-stage',
  iteration_number: 1,
  payload: mockPayload,
  status: 'pending',
  attempt_count: 0,
  max_retries: 3,
  created_at: new Date().toISOString(),
  parent_job_id: null,
  results: null,
  completed_at: null,
  error_details: null,
  started_at: null,
  target_contribution_id: null,
  prerequisite_job_id: null,
  is_test_job: false,
  job_type: 'PLAN',
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
    is_header: false,
    source_prompt_resource_id: null,
};

const mockNotificationService: NotificationServiceType = {
    sendDialecticContributionStartedEvent: async () => {},
    sendContributionReceivedEvent: async () => {},
    sendContributionFailedNotification: async () => {},
    sendContributionGenerationFailedEvent: async () => {},
    sendContributionStartedEvent: async () => {},
    sendContributionRetryingEvent: async () => {},
    sendContributionGenerationContinuedEvent: async () => {},
    sendContributionGenerationCompleteEvent: async () => {},
    sendDialecticProgressUpdateEvent: async () => {},
  };

const setupMockClient = (configOverrides: Record<string, any> = {}) => {
    const mockProject: Tables<'dialectic_projects'> & { dialectic_domains: Pick<Tables<'dialectic_domains'>, 'id' | 'name' | 'description'> } = {
        id: 'project-abc',
        user_id: 'user-789',
        project_name: 'Test Project',
        initial_user_prompt: 'Test prompt',
        selected_domain_id: 'domain-123',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        initial_prompt_resource_id: null,
        process_template_id: 'template-123',
        repo_url: null,
        selected_domain_overlay_id: null,
        user_domain_overlay_values: null,
        dialectic_domains: {
            id: 'domain-123',
            name: 'Test Domain',
            description: 'A domain for testing',
        }
    };

    const mockStage: Tables<'dialectic_stages'> & { system_prompts: { id: string; prompt_text: string } | null } = {
        id: 'stage-1',
        slug: 'test-stage',
        display_name: 'Test Stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'prompt-123',
        description: null,
        expected_output_template_ids: [],
        system_prompts: {
            id: 'prompt-123',
            prompt_text: 'This is the base system prompt for the test stage.',
        },
        active_recipe_instance_id: null,
        recipe_template_id: 'template-123',
    };
    
    return createMockSupabaseClient('user-789', {
        genericMockResults: {
            dialectic_projects: {
                select: () => Promise.resolve({ data: [mockProject], error: null }),
            },
            dialectic_stages: {
                select: () => Promise.resolve({ data: [mockStage], error: null }),
            },
            dialectic_sessions: {
                select: () => Promise.resolve({ data: [mockSessionData], error: null }),
            },
            ai_providers: {
                select: () => Promise.resolve({ data: [mockProviderData], error: null }),
            },
            dialectic_contributions: {
                select: () => Promise.resolve({ data: [mockContribution], error: null }),
            },
            // Default overlays present so happy-path flows proceed
            domain_specific_prompt_overlays: {
                select: () => Promise.resolve({
                    data: [
                        {
                            overlay_values: {
                                role: 'senior product strategist',
                                stage_instructions: 'baseline',
                                style_guide_markdown: '# Guide',
                                expected_output_artifacts_json: '{}',
                            },
                        },
                    ],
                    error: null,
                }),
            },
            // Provide default template step rows for recipe resolution by ID or by (template_id, step_slug)
            dialectic_recipe_template_steps: {
                select: (state: any) => {
                    const defaultStep = {
                        id: 'step-1',
                        template_id: 'template-123',
                        step_number: 1,
                        step_key: 'seed',
                        step_slug: 'seed',
                        step_name: 'Assemble Seed Prompt',
                        step_description: 'Test seed step',
                        job_type: 'EXECUTE',
                        prompt_type: 'Seed',
                        prompt_template_id: 'prompt-123',
                        output_type: 'model_contribution_main',
                        granularity_strategy: 'per_source_document',
                        inputs_required: [],
                        inputs_relevance: [],
                        outputs_required: [],
                        parallel_group: null,
                        branch_key: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                    // Match by id
                    const hasIdEq = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === 'step-1');
                    if (hasIdEq) {
                        return Promise.resolve({ data: [defaultStep], error: null });
                    }
                    // Match by template_id and step_slug
                    const hasTemplate = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'template_id' && f.value === 'template-123');
                    const hasSlug = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'step_slug' && typeof f.value === 'string');
                    if (hasTemplate && hasSlug) {
                        return Promise.resolve({ data: [defaultStep], error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
            },
            ...configOverrides,
        },
    });
};

const getMockDeps = (): { deps: IDialecticJobDeps, promptAssembler: MockPromptAssembler } => {
    const mockSupabaseClient = createMockSupabaseClient().client as unknown as SupabaseClient<Database>;
    const mockModelConfig: AiModelExtendedConfig = {
        api_identifier: 'mock-embedding-model',
        input_token_cost_rate: 0,
        output_token_cost_rate: 0,
        provider_max_input_tokens: 8192,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
            is_chatml_model: false,
            api_identifier_for_tokenization: 'mock-embedding-model',
        },
    };
    if (!isJson(mockModelConfig)) {
        throw new Error("Test setup failed: mockModelConfig is not a valid Json.");
    }
    const mockProvider: Tables<'ai_providers'> = {
        id: 'provider-123',
        api_identifier: 'openai-gpt-4',
        config: mockModelConfig,
        created_at: new Date().toISOString(),
        description: 'Mock provider',
        is_active: true,
        is_default_embedding: false,
        is_enabled: true,
        name: 'Mock OpenAI',
        provider: 'openai',
        updated_at: new Date().toISOString()
    };
    const openAiAdapter = new OpenAiAdapter(mockProvider, Deno.env.get('OPENAI_API_KEY')!, logger);
    const embeddingClient = new EmbeddingClient(openAiAdapter);
    const textSplitter = new LangchainTextSplitter();
    const mockWallet = createMockTokenWalletService();
    const indexingService = new IndexingService(mockSupabaseClient, logger, textSplitter, embeddingClient, mockWallet.instance);
    const fileManager = new MockFileManagerService();
    const promptAssembler = new MockPromptAssembler(mockSupabaseClient, fileManager);
    
    const deps: IDialecticJobDeps = {
      logger: logger,
      downloadFromStorage: async (): Promise<DownloadStorageResult> => ({
        data: new ArrayBuffer(0),
        error: null,
      }),
      getSeedPromptForStage: async () => ({
        content: 'Seed prompt content',
        fullPath: 'prompts/seed.txt',
        bucket: 'test-bucket',
        path: 'prompts',
        fileName: 'seed.txt',
      }),
      retryJob: async () => ({}),
      // Provide a fresh instance per test run to avoid cross-test spy conflicts
      notificationService: { ...mockNotificationService },
      callUnifiedAIModel: async () => ({ content: '', finish_reason: 'stop' }),
      fileManager: fileManager,
      getExtensionFromMimeType: () => '.txt',
      randomUUID: () => 'random-uuid',
      deleteFromStorage: async () => ({ data: null, error: null }),
      continueJob: async () => ({ enqueued: false }),
      executeModelCallAndSave: async () => {},
      ragService: new MockRagService(),
      countTokens: () => 100,
      getAiProviderConfig: async () => mockModelConfig,
      getGranularityPlanner: getGranularityPlanner,
      planComplexStage: async () => await Promise.resolve([]),
      indexingService,
      embeddingClient,
      promptAssembler: promptAssembler,
    }
    return { deps, promptAssembler };
};

Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps, promptAssembler } = getMockDeps();

    const executeSpy = spy(deps, 'executeModelCallAndSave');
    
    await t.step('should call the executor function with correct parameters', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(promptAssembler.assemble.calls.length, 1, 'Expected promptAssembler.assemble to be called once');
        const [assembleOptions] = promptAssembler.assemble.calls[0].args;
        assertExists(assembleOptions.job);
        assertEquals(assembleOptions.job.id, mockJob.id);
        // Ensure AssemblePromptOptions shape is correct
        assertExists(assembleOptions.project);
        assertExists(assembleOptions.session);
        assertExists(assembleOptions.stage);
        // stage.system_prompts and overlays should exist
        // Use 'in' checks to avoid type casting
        const stageVal = assembleOptions.stage;
        const hasRecipeStep = 'recipe_step' in stageVal;
        assertEquals(hasRecipeStep, true, 'StageContext must include recipe_step as required by the assembler contract');
        
        assertEquals(executeSpy.calls.length, 1, 'Expected executeModelCallAndSave to be called once');
        const [executorParams] = executeSpy.calls[0].args;
        
        assertEquals(executorParams.job.id, mockJob.id);
        assertEquals(executorParams.providerDetails.id, mockProviderData.id);
        
        assertEquals(executorParams.promptConstructionPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
        assertEquals(executorParams.promptConstructionPayload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - does not call legacy promptAssembler methods directly', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps, promptAssembler } = getMockDeps();
    // Forbid direct access to legacy assembler methods; only assemble may be used
    const wrappedAssembler = wrapAssemblerForbidLegacy(promptAssembler);
    deps.promptAssembler = wrappedAssembler;

    let threw = false;
    try {
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            deps,
            'auth-token',
        );
    } catch (_e) {
        threw = true;
    }
    // Intended green behavior: should not attempt to call forbidden legacy methods
    assertEquals(threw, false, 'processSimpleJob must not invoke legacy assembler methods directly');

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Failure with Retries Remaining', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps } = getMockDeps();

    const executorStub = stub(deps, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed'));
    });
    
    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should call retryJob when the executor fails', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called exactly once');
    });
    
    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - Failure with No Retries Remaining', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { deps } = getMockDeps();

    const executorStub = stub(deps, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed consistently'));
    });

    const retryJobSpy = spy(deps, 'retryJob');
    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should mark job as failed after exhausting all retries', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...jobWithNoRetries, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when retries are exhausted');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        
        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'retry_loop_failed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'retry_loop_failed'");
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - emits internal and user-facing failure notifications when retries are exhausted', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps } = getMockDeps();

    const executorStub = stub(deps, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed consistently'));
    });

    const internalFailSpy = spy(deps.notificationService, 'sendContributionGenerationFailedEvent');
    const userFacingFailSpy = spy(deps.notificationService, 'sendContributionFailedNotification');

    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should send both internal and user-facing failure notifications', async () => {
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...jobWithNoRetries, payload: mockPayload },
            'user-789',
            deps,
            'auth-token',
        );

        // RED expectation: internal event should be emitted once
        assertEquals(internalFailSpy.calls.length, 1, 'Expected internal failure event to be emitted');
        const [internalPayloadArg] = internalFailSpy.calls[0].args;
        assert(isRecord(internalPayloadArg) && internalPayloadArg.sessionId === mockPayload.sessionId);

        // Existing user-facing notification should still be sent
        assertEquals(userFacingFailSpy.calls.length, 1, 'Expected user-facing failure notification to be sent');
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - ContextWindowError Handling', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { deps } = getMockDeps();

    const executorStub = stub(deps, 'executeModelCallAndSave', () => {
        return Promise.reject(new ContextWindowError('Token limit exceeded during execution.'));
    });

    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should fail the job immediately without retrying', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called for a ContextWindowError');

        const updateSpy = spies.getLatestQueryBuilderSpies('dialectic_generation_jobs')?.update;
        assert(updateSpy, "Update spy should exist for dialectic_generation_jobs table");
        assertEquals(updateSpy.calls.length, 1, 'Expected a single update call to fail the job');
        
        const [updatePayload] = updateSpy.calls[0].args;
        assertEquals(updatePayload.status, 'failed');
        assert(isRecord(updatePayload.error_details) && typeof updatePayload.error_details.message === 'string' && updatePayload.error_details.message.includes('Context window limit exceeded'));
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - renders prompt template and omits systemInstruction when not provided (non-continuation)', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps, promptAssembler } = getMockDeps();

    const executeSpy = spy(deps, 'executeModelCallAndSave');

    await processSimpleJob(
        dbClient as unknown as SupabaseClient<Database>,
        { ...mockJob, payload: mockPayload },
        'user-789',
        deps,
        'auth-token',
    );

    // Assert desired behavior for new contract
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1, 'Expected executeModelCallAndSave to be called once');
    const [executorParams] = executeSpy.calls[0].args;
    assertEquals(
        executorParams.promptConstructionPayload.currentUserPrompt,
        MOCK_ASSEMBLED_PROMPT.promptContent,
        'currentUserPrompt should be set to the content from the assembled prompt',
    );
    assertEquals(
        executorParams.promptConstructionPayload.source_prompt_resource_id,
        MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id,
        'source_prompt_resource_id should be passed through from the assembled prompt',
    );

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should call gatherContinuationInputs for a continuation job', async () => {    
  const trueRootId = 'true-root-id-for-test';
    const continuationChunkId = 'prev-contrib-id';
    const stageSlug = 'synthesis';

    const mockContinuationChunk = {
        id: continuationChunkId,
        stage: stageSlug,
        document_relationships: { [stageSlug]: trueRootId },
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        dialectic_contributions: {
            select: { data: [mockContinuationChunk], error: null }
        }
    });
    const { deps, promptAssembler } = getMockDeps();

    const continuationPayload: DialecticJobPayload = {
        ...mockPayload,
        target_contribution_id: continuationChunkId,
        stageSlug: stageSlug,
    };

    if (!isJson(continuationPayload)) {
        throw new Error("Test setup failed: continuationPayload is not a valid Json");
    }

    const continuationJob: DialecticJobRow & { payload: DialecticJobPayload } = {
        ...mockJob,
        payload: continuationPayload,
        target_contribution_id: continuationChunkId,
    };

    // The current implementation will throw an error because the mock for executeModelCallAndSave is not set up
    // to handle the return from gatherContinuationInputs. This is acceptable for the RED state,
    // as the primary assertion on the spy call will fail first.
    try {
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            continuationJob,
            'user-789',
            deps,
            'auth-token'
        );
    } catch (_e) {
        // Silently catch the expected error to allow the spy assertion to proceed.
    }

    assertEquals(promptAssembler.assemble.calls.length, 1, "Expected assemble to be called once for a continuation job.");
    const [assembleOptions] = promptAssembler.assemble.calls[0].args;
    assertExists(assembleOptions.job);
    assertEquals(assembleOptions.continuationContent, "Please continue.");

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should dispatch a correctly formed PromptConstructionPayload', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { deps, promptAssembler } = getMockDeps();
    
    // Arrange
    const executeSpy = spy(deps, 'executeModelCallAndSave');

    // Act
    await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

    // Assert
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1);
    const [executorParams] = executeSpy.calls[0].args;
    
    const payload = executorParams.promptConstructionPayload;
    assertEquals(payload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
    assertEquals(payload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
    // resourceDocuments are not implemented/synthesized in this job type
    assertEquals(payload.resourceDocuments.length, 0);

    clearAllStubs?.();
});

Deno.test('processSimpleJob - uses file-backed initial prompt when column empty', async () => {
    const fileBackedContent = 'Hello from file';
  
    // Arrange: project with empty initial_user_prompt and a valid resource id
    const { client: dbClient, clearAllStubs } = setupMockClient({
      dialectic_projects: {
        select: () =>
          Promise.resolve({
            data: [
              {
                id: 'project-abc',
                user_id: 'user-789',
                project_name: 'Test Project',
                initial_user_prompt: '',
                selected_domain_id: 'domain-123',
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                initial_prompt_resource_id: 'res-123',
                process_template_id: 'template-123',
                repo_url: null,
                selected_domain_overlay_id: null,
                user_domain_overlay_values: null,
                dialectic_domains: { id: 'domain-123', name: 'Test Domain', description: 'A domain for testing' },
              },
            ],
            error: null,
          }),
      },
      // IMPORTANT: .single() expects an array with exactly 1 record
      dialectic_project_resources: {
        select: (state: any) => {
          const isById =
            Array.isArray(state.filters) &&
            state.filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === 'res-123');
          if (isById) {
            return Promise.resolve({
              data: [{ storage_bucket: 'test-bucket', storage_path: 'projects/project-abc', file_name: 'initial.md' }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      },
    });
  
    const { deps, promptAssembler } = getMockDeps();
  
    // Stub storage download to return a proper ArrayBuffer and mimeType
    const blob = new Blob([fileBackedContent], { type: 'text/markdown' });
    const arrayBuffer: ArrayBuffer = await blob.arrayBuffer();
    const downloadStub = stub(deps, 'downloadFromStorage', () =>
      Promise.resolve({ data: arrayBuffer, mimeType: blob.type, error: null })
    );
  
    const executeSpy = spy(deps, 'executeModelCallAndSave');
  
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      deps,
      'auth-token',
    );
  
    const [executorParams] = executeSpy.calls[0].args;
    assertEquals(
      executorParams.promptConstructionPayload.currentUserPrompt,
        MOCK_ASSEMBLED_PROMPT.promptContent,
      'currentUserPrompt should be the content from the assembled prompt',
    );
  
    downloadStub.restore();
    clearAllStubs?.();
  });

Deno.test('processSimpleJob - fails when stage overlays are missing (no render, no model call)', async () => {
  // Arrange: explicitly override overlays to be empty to trigger fail-fast path
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    domain_specific_prompt_overlays: {
      select: () => Promise.resolve({ data: [], error: null }),
    },
  });
  const { deps } = getMockDeps();

  // We do not stub the assembler; we expect failure before render
  const executeSpy = spy(deps, 'executeModelCallAndSave');

  // Act
  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      deps,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: executor must NOT be called when overlays are missing
  assertEquals(
    executeSpy.calls.length,
    0,
    'Expected no executeModelCallAndSave when stage overlays are missing (should fail fast)'
  );

  // Assert: job is marked failed with explicit overlays-missing code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'STAGE_CONFIG_MISSING_OVERLAYS'
    );
  });
  assertExists(
    failedUpdate,
    "Expected job to fail with code 'STAGE_CONFIG_MISSING_OVERLAYS' when overlays are missing"
  );
  assertEquals(threw, true);

  clearAllStubs?.();
});

Deno.test('processSimpleJob - fails when no initial prompt exists', async () => {
  // Arrange: project with no direct prompt and no resource id
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    dialectic_projects: {
      select: () =>
        Promise.resolve({
          data: [
            {
              id: 'project-abc',
              user_id: 'user-789',
              project_name: 'Test Project',
              initial_user_prompt: '',
              selected_domain_id: 'domain-123',
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              initial_prompt_resource_id: null,
              process_template_id: 'template-123',
              repo_url: null,
              selected_domain_overlay_id: null,
              user_domain_overlay_values: null,
              dialectic_domains: { id: 'domain-123', name: 'Test Domain', description: 'A domain for testing' },
            },
          ],
          error: null,
        }),
    },
  });

  const { deps, promptAssembler } = getMockDeps();

  // Spy on executor to ensure it is NOT called when prompt is missing
  const executeSpy = spy(deps, 'executeModelCallAndSave');
  const internalFailSpy = spy(deps.notificationService, 'sendContributionGenerationFailedEvent');
  const userFailSpy = spy(deps.notificationService, 'sendContributionFailedNotification');

  // Force final-attempt behavior to observe terminal failure status
  const jobNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...jobNoRetries, payload: mockPayload },
      'user-789',
      deps,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: model executor should not be called when no prompt exists
  assertEquals(executeSpy.calls.length, 0, 'Expected no model call when no initial prompt exists');

  // Assert: job enters failure path and is marked as failed at final attempt
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'INVALID_INITIAL_PROMPT'
    );
  });
  assertExists(failedUpdate, "Expected job to enter failure path with status 'failed' and INVALID_INITIAL_PROMPT code");

  // Assert notifications were emitted
  assertEquals(internalFailSpy.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = internalFailSpy.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'INVALID_INITIAL_PROMPT',
  );
  assertEquals(userFailSpy.calls.length, 1, 'Expected user-facing failure notification to be sent');
  assertEquals(threw, true);

  // Restore spies on shared notificationService instance
  internalFailSpy.restore();
  userFailSpy.restore();

  clearAllStubs?.();
});

// =============================================================
// plan→execute must preserve user_jwt; missing user_jwt fails
// =============================================================
Deno.test('processSimpleJob - preserves payload.user_jwt when transforming plan to execute', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { deps } = getMockDeps();

  const executeSpy = spy(deps, 'executeModelCallAndSave');

  const planPayloadWithJwt = {
    ...mockPayload,
    user_jwt: 'jwt.token.here',
  };
  if (!isJson(planPayloadWithJwt) || !isDialecticJobPayload(planPayloadWithJwt)) {
    throw new Error('Test setup failed: planPayloadWithJwt invalid');
  }

  await processSimpleJob(
    dbClient as unknown as SupabaseClient<Database>,
    { ...mockJob, payload: planPayloadWithJwt },
    'user-789',
    deps,
    'auth-token',
  );

  assertEquals(executeSpy.calls.length, 1, 'Expected executor to be called once');
  const [execArgs] = executeSpy.calls[0].args;
  const sentJobPayloadUnknown = execArgs.job.payload;
  let preserved = false;
  let preservedValue = '';
  if (isRecord(sentJobPayloadUnknown) && 'user_jwt' in sentJobPayloadUnknown) {
    const v = (sentJobPayloadUnknown)['user_jwt'];
    if (typeof v === 'string' && v.length > 0) {
      preserved = true;
      preservedValue = v;
    }
  }
  assertEquals(preserved, true);
  assertEquals(preservedValue, 'jwt.token.here');

  clearAllStubs?.();
});

Deno.test('processSimpleJob - missing user_jwt fails early and does not call executor', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { deps } = getMockDeps();
  const executeSpy = spy(deps, 'executeModelCallAndSave');

  const planPayloadNoJwt = {
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
  };
  if (!isJson(planPayloadNoJwt) || !isDialecticJobPayload(planPayloadNoJwt)) {
    throw new Error('Test setup failed: planPayloadNoJwt invalid');
  }

  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: planPayloadNoJwt },
      'user-789',
      deps,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  assertEquals(executeSpy.calls.length, 0, 'Executor must not be called when user_jwt is missing');
  assert(threw);

  clearAllStubs?.();
});

Deno.test('processSimpleJob - Wallet missing is immediate failure (no retry)', async () => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient();
  const { deps } = getMockDeps();

  // Arrange: executor surfaces wallet-required error
  const executorStub = stub(deps, 'executeModelCallAndSave', () => {
    return Promise.reject(new Error('Wallet is required to process model calls.'));
  });

  const retryJobSpy = spy(deps, 'retryJob');
  const internalFailSpy = spy(deps.notificationService, 'sendContributionGenerationFailedEvent');
  const userFailSpy = spy(deps.notificationService, 'sendContributionFailedNotification');

  // Act
  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      deps,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: no retry attempts
  assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when wallet is missing');

  // Assert: job marked as failed with WALLET_MISSING code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'WALLET_MISSING'
    );
  });
  assertExists(failedUpdate, "Expected job to fail immediately with code 'WALLET_MISSING'");

  // Assert notifications
  assertEquals(internalFailSpy.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = internalFailSpy.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      internalPayloadArg.type === 'other_generation_failed' &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'WALLET_MISSING'
  );
  assertEquals(userFailSpy.calls.length, 1, 'Expected user-facing failure notification to be sent');
  assertEquals(threw, true);

  // Cleanup
  internalFailSpy.restore();
  userFailSpy.restore();
  retryJobSpy.restore();
  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - Preflight dependency missing is immediate failure (no retry)', async () => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient();
  const { deps } = getMockDeps();

  // Arrange: executor surfaces preflight dependency error
  const executorStub = stub(deps, 'executeModelCallAndSave', () => {
    return Promise.reject(new Error('Token wallet service is required for affordability preflight'));
  });

  const retryJobSpy = spy(deps, 'retryJob');
  const internalFailSpy = spy(deps.notificationService, 'sendContributionGenerationFailedEvent');
  const userFailSpy = spy(deps.notificationService, 'sendContributionFailedNotification');

  // Act
  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      deps,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: no retry attempts
  assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when preflight dependency is missing');

  // Assert: job marked as failed with INTERNAL_DEPENDENCY_MISSING code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'INTERNAL_DEPENDENCY_MISSING'
    );
  });
  assertExists(failedUpdate, "Expected job to fail immediately with code 'INTERNAL_DEPENDENCY_MISSING'");

  // Assert notifications
  assertEquals(internalFailSpy.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = internalFailSpy.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      internalPayloadArg.type === 'other_generation_failed' &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'INTERNAL_DEPENDENCY_MISSING'
  );
  assertEquals(userFailSpy.calls.length, 1, 'Expected user-facing failure notification to be sent');

  // Assert thrown
  assertEquals(threw, true);

  // Cleanup
  internalFailSpy.restore();
  userFailSpy.restore();
  retryJobSpy.restore();
  executorStub.restore();
  clearAllStubs?.();
});