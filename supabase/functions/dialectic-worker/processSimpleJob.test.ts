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
import { isDialecticJobPayload, isRecord } from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import type { DialecticJobRow, DialecticJobPayload, DialecticSession, DialecticContributionRow, IDialecticJobDeps, SelectedAiProvider } from '../dialectic-service/dialectic.interface.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { getAiProviderConfig } from './processComplexJob.ts';
import { getGranularityPlanner } from './strategies/granularity.strategies.ts';
import { planComplexStage } from './task_isolator.ts';
import { IndexingService, LangchainTextSplitter, OpenAIEmbeddingClient } from '../_shared/services/indexing_service.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';

const mockPayload: Json = {
  projectId: 'project-abc',
  sessionId: 'session-456',
  stageSlug: 'test-stage',
  model_id: 'model-def',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'wallet-ghi'
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
};

const mockNotificationService: NotificationServiceType = {
    sendDialecticContributionStartedEvent: async () => {},
    sendContributionReceivedEvent: async () => {},
    sendContributionFailedNotification: async () => {},
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

    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: 'test-stage',
        display_name: 'Test Stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'prompt-123',
        description: null,
        expected_output_artifacts: null,
        input_artifact_rules: null,
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
            ...configOverrides,
        },
    });
};

const getMockDeps = (): IDialecticJobDeps => {
    const mockSupabaseClient = createMockSupabaseClient().client as unknown as SupabaseClient<Database>;
    const openAiAdapter = new OpenAiAdapter(Deno.env.get('OPENAI_API_KEY')!, logger);
    const embeddingClient = new OpenAIEmbeddingClient(openAiAdapter);
    const textSplitter = new LangchainTextSplitter();
    const indexingService = new IndexingService(mockSupabaseClient, logger, textSplitter, embeddingClient);
    
    return {
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
      notificationService: mockNotificationService,
      callUnifiedAIModel: async () => ({ content: '', finish_reason: 'stop' }),
      fileManager: new MockFileManagerService(),
      getExtensionFromMimeType: () => '.txt',
      randomUUID: () => 'random-uuid',
      deleteFromStorage: async () => ({ data: null, error: null }),
      continueJob: async () => ({ enqueued: false }),
      executeModelCallAndSave: async () => {},
      ragService: new MockRagService(),
      countTokens: () => 100,
      getAiProviderConfig: getAiProviderConfig,
      getGranularityPlanner: getGranularityPlanner,
      planComplexStage: async () => await Promise.resolve([]),
      indexingService,
      embeddingClient,
      promptAssembler: new PromptAssembler(mockSupabaseClient),
    }
};

Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const executeSpy = spy(deps, 'executeModelCallAndSave');
    
    await t.step('should call the executor function with correct parameters', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(executeSpy.calls.length, 1, 'Expected executeModelCallAndSave to be called once');
        const [executorParams] = executeSpy.calls[0].args;
        
        assertEquals(executorParams.job.id, mockJob.id);
        assertEquals(executorParams.providerDetails.id, mockProviderData.id);
        assertEquals(executorParams.renderedPrompt.content, 'Seed prompt content');
        assertEquals(executorParams.previousContent, '');
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Failure with Retries Remaining', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

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
    const deps = getMockDeps();

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

Deno.test('processSimpleJob - ContextWindowError Handling', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

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
