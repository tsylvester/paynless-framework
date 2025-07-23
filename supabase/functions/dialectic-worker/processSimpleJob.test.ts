import {
  assertEquals,
  assertExists,
  assertObjectMatch,
  assert,
  fail,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub, type Stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database, Json, Tables } from '../types_db.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { PostgrestError } from 'npm:@supabase/postgrest-js@1.15.5';
import { isDialecticJobPayload, isJobResultsWithModelProcessing, isRecord } from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import type { DialecticJobRow, DialecticJobPayload, UnifiedAIResponse, ModelProcessingResult, DialecticSession, DialecticContributionRow, ProcessSimpleJobDeps } from '../dialectic-service/dialectic.interface.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';

// Define a type for our mock job for clarity
type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type AiProviderRow = Tables<'ai_providers'>;

const mockJob: DialecticJobRow = {
  id: 'job-123',
  session_id: 'session-456',
  user_id: 'user-789',
  stage_slug: 'test-stage',
  iteration_number: 1,
  payload: {
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi'
  },
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
};

const mockPayload: DialecticJobPayload = {
  projectId: 'project-abc',
  sessionId: 'session-456',
  stageSlug: 'test-stage',
  model_id: 'model-def',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'wallet-ghi'
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

const mockProviderData: AiProviderRow = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    config: {},
    description: 'A mock provider',
    is_active: true,
    is_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
            dialectic_sessions: {
                select: () => Promise.resolve({ data: [mockSessionData], error: null, count: 1, status: 200, statusText: 'OK' }),
            },
            ai_providers: {
                select: () => Promise.resolve({ data: [mockProviderData], error: null, count: 1, status: 200, statusText: 'OK' }),
            },
            dialectic_contributions: {
                select: () => Promise.resolve({ data: [mockContribution], error: null, count: 1, status: 200, statusText: 'OK' }),
            },
            ...configOverrides,
        },
    });
};

const getMockDeps = (): ProcessSimpleJobDeps => {
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
      downloadFromStorage: async (): Promise<DownloadStorageResult> => ({
        data: new ArrayBuffer(0),
        error: null,
      }),
      getExtensionFromMimeType: () => '.txt',
      logger: logger,
      randomUUID: () => 'random-uuid',
      fileManager: fileManager,
      deleteFromStorage: async () => ({ data: null, error: null }),
      getSeedPromptForStage: async () => ({
        content: 'Seed prompt content',
        fullPath: 'prompts/seed.txt',
        bucket: 'test-bucket',
        path: 'prompts',
        fileName: 'seed.txt',
      }),
      continueJob: async () => ({ enqueued: false }),
      retryJob: async () => ({}),
      notificationService: mockNotificationService,
    }
};

const getMockJob = (overrides: Partial<DialecticJobRow> = {}) => {
    return {
        ...mockJob,
        ...overrides,
    };
};


Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const fileManagerSpy = spy(deps.fileManager, 'uploadAndRegisterFile');
    
    await t.step('should run to completion successfully', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assert(fileManagerSpy.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
        
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        assertEquals(historicSpies.callCount, 1, "Job update should be called once");

        const [updatePayload] = historicSpies.callsArgs[0];
        assert(isRecord(updatePayload) && 'status' in updatePayload, "Update payload should have a status property");
        assertEquals(updatePayload.status, 'completed');
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Failure with Retries Remaining', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => {
        throw new Error('AI model failed');
    });

    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should call retryJob when an attempt fails', async () => {
        // Ensure the job has retries left (attempt_count 0, max_retries 3)
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called exactly once');
        
        // Ensure the job's final status is NOT updated by processSimpleJob itself
        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        const callCount = historicSpies ? historicSpies.callCount : 0;
        assertEquals(callCount, 0, "processSimpleJob should not update the job status when delegating to retryJob");
    });
    
    clearAllStubs?.();
    callUnifiedAIModelStub.restore();
});

Deno.test('processSimpleJob - Failure with No Retries Remaining', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => {
        throw new Error('AI model failed consistently');
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
    callUnifiedAIModelStub.restore();
});

Deno.test('processSimpleJob - Continuation Enqueued', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const continueJobStub = stub(deps, 'continueJob', async () => ({ enqueued: true }));

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: 'Partial content',
        finish_reason: 'length',
        contentType: 'text/plain',
    }));
    
    const jobWithContinuationPayload = { ...mockJob, payload: { ...mockPayload, continueUntilComplete: true } };

    await t.step('should enqueue a continuation job', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, jobWithContinuationPayload, 'user-789', deps, 'auth-token');

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

Deno.test('processSimpleJob - Is a Continuation Job', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();
    
    const downloadFromStorageSpy = spy(deps, 'downloadFromStorage');

    const continuationPayload: DialecticJobPayload = {
        ...mockPayload,
        target_contribution_id: 'contrib-abc',
    };
    
    const jobWithContinuationPayload = { ...mockJob, payload: continuationPayload };

    await t.step('should download previous content for a continuation job', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...jobWithContinuationPayload, payload: continuationPayload }, 'user-789', deps, 'auth-token');
        
        // Corrected expectation: The seed prompt is mocked, so we only expect one *additional* download
        // for the previous contribution content.
        assertEquals(downloadFromStorageSpy.calls.length, 1, 'Expected downloadFromStorage to be called once for the previous contribution');
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Continuation Download Failure', async (t) => {
    await t.step('should call retryJob if downloading previous content fails', async () => {
        const { client: dbClient, spies, clearAllStubs } = setupMockClient();
        const deps = getMockDeps();
        const retryJobSpy = spy(deps, 'retryJob');

        // Arrange: Create a consistent payload for a continuation job
        const continuationPayload = { 
            ...mockPayload, 
            target_contribution_id: 'contrib-123' 
        };

        // Arrange: Stub the downloadFromStorage dependency to throw an error
        const downloadStub = stub(deps, 'downloadFromStorage', () => {
            return Promise.resolve({ error: new Error("Simulated download failure"), data: null });
        });

        // Act
        try {
            await processSimpleJob(
                dbClient as unknown as SupabaseClient<Database>, 
                { ...getMockJob(), payload: continuationPayload }, 
                'user-789', 
                deps, 
                'auth-token'
            );
        } finally {
            // Cleanup
            downloadStub.restore();
            clearAllStubs?.();
        }

        // Assert
        assertEquals(retryJobSpy.calls.length, 1, "Expected retryJob to be called on download failure.");
    });
});

Deno.test('processSimpleJob - Multi-Part Continuation', async (t) => {
});

Deno.test('processSimpleJob - Model Failure', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => ({
        content: null,
        error: 'AI response was empty.',
    }));

    await t.step('should fail the job if the model returns an error', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, max_retries: 0, payload: mockPayload }, 'user-789', deps, 'auth-token');

        // Assert
        const updateSpy = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update')!;
        assertEquals(updateSpy.callCount, 1, "Expected final job status to be updated once.");

        const finalUpdateCall = updateSpy.callsArgs[0][0];
        assert(isRecord(finalUpdateCall), "Final update call should be a record object.");
        assertEquals(finalUpdateCall.status, 'retry_loop_failed', "Final job status should be 'retry_loop_failed'");
    });

    clearAllStubs?.();
    callUnifiedAIModelStub.restore();
});

Deno.test('processSimpleJob - Database Error on Update', async (t) => {
    await t.step('should log an error if the final job update fails', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'dialectic_generation_jobs': {
                update: () => { throw new Error('DB Update Failed'); }
            }
        });
        const deps = getMockDeps();
        
        let criticalErrorLogged = false;
        const originalErrorLogger = deps.logger.error;
        deps.logger.error = (message: string | Error, ...args: unknown[]) => {
            if (typeof message === 'string' && message.includes('CRITICAL')) {
                criticalErrorLogged = true;
            } else if (message instanceof Error && message.message.includes('CRITICAL')) {
                criticalErrorLogged = true;
            }
            // deno-lint-ignore no-explicit-any
            (originalErrorLogger as any)(message, ...args);
        };

        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', deps, 'auth-token');

        // Assert
        assert(criticalErrorLogged, "Expected a critical error log for failing to update the job status.");

        // Cleanup
        deps.logger.error = originalErrorLogger;
        clearAllStubs?.();
    });
});
