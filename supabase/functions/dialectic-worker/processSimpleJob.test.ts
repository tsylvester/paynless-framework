import {
  assertEquals,
  assertExists,
  assertObjectMatch,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'jsr:@std/testing@0.225.1/mock';
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
    }
};


Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const fileManagerSpy = (deps.fileManager as MockFileManagerService).uploadAndRegisterFileSpy;
    
    await t.step('should run to completion successfully', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, mockJob, mockPayload, 'user-789', deps, 'auth-token');

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

Deno.test('processSimpleJob - Retry Success', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    let callCount = 0;
    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => {
        callCount++;
        if (callCount === 1) {
            throw new Error('AI model failed');
        }
        return {
            content: 'AI response content',
            contentType: 'text/plain',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
        };
    });

    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should succeed after one failed attempt', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, mockJob, mockPayload, 'user-789', deps, 'auth-token');

        assertEquals(callCount, 2, 'Expected callUnifiedAIModel to be called twice');
        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called once');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        
        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'completed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'completed'");
    });
    
    clearAllStubs?.();
    callUnifiedAIModelStub.restore();
});

Deno.test('processSimpleJob - Retry Loop Exhausted', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const callUnifiedAIModelStub = stub(deps, 'callUnifiedAIModel', async () => {
        throw new Error('AI model failed consistently');
    });

    const retryJobSpy = spy(deps, 'retryJob');

    await t.step('should fail after exhausting all retries', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, max_retries: 1 }, mockPayload, 'user-789', deps, 'auth-token');

        assertEquals(callUnifiedAIModelStub.calls.length, 2, 'Expected callUnifiedAIModel to be called for initial attempt + 1 retry');
        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called once');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        
        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'failed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'failed'");
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
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, jobWithContinuationPayload, mockPayload, 'user-789', deps, 'auth-token');

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
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, jobWithContinuationPayload, continuationPayload, 'user-789', deps, 'auth-token');
        
        // Corrected expectation: The seed prompt is mocked, so we only expect one *additional* download
        // for the previous contribution content.
        assertEquals(downloadFromStorageSpy.calls.length, 1, 'Expected downloadFromStorage to be called once for the previous contribution');
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Continuation Download Failure', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const deps = getMockDeps();

    const downloadFromStorageStub = stub(deps, 'downloadFromStorage', async (_client, _bucket, path): Promise<DownloadStorageResult> => {
        if (typeof path === 'string' && mockContribution.file_name && path.includes(mockContribution.file_name)) {
            return { data: null, error: new Error('Download failed') };
        }
        return { data: new ArrayBuffer(0), error: null };
    });

    const continuationPayload: DialecticJobPayload = {
        ...mockPayload,
        target_contribution_id: mockContribution.id,
    };
    
    const jobWithContinuationPayload = { ...mockJob, payload: continuationPayload };

    await t.step('should fail the job if downloading previous content fails', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, jobWithContinuationPayload, continuationPayload, 'user-789', deps, 'auth-token');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");

        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'failed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'failed' due to download error.");
    });

    clearAllStubs?.();
    downloadFromStorageStub.restore();
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
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, max_retries: 0 }, mockPayload, 'user-789', deps, 'auth-token');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");

        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'failed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'failed'");
        
        const [updatePayload] = finalUpdateCallArgs;
        assert(isRecord(updatePayload) && 'results' in updatePayload, 'Update payload should have results');
        
        const results = typeof updatePayload.results === 'string' 
            ? JSON.parse(updatePayload.results) 
            : updatePayload.results;
            
        assert(isRecord(results) && 'modelProcessingResult' in results, 'Results should contain model processing result');
        
        const modelProcessingResult = results.modelProcessingResult;
        assert(isRecord(modelProcessingResult) && 'error' in modelProcessingResult, "Model processing result should have an error");
        assertEquals(modelProcessingResult.error, 'AI response was empty.');
    });

    clearAllStubs?.();
    callUnifiedAIModelStub.restore();
});

Deno.test('processSimpleJob - Database Error on Update', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        dialectic_generation_jobs: {
            update: () => Promise.resolve({ data: null, error: new Error("DB Update Failed"), count: 0, status: 500, statusText: 'Internal Server Error' })
        }
    });
    const deps = getMockDeps();

    await t.step('should log an error if the final job update fails', async () => {
        // This test is tricky because the error happens after the main logic.
        // We expect the function to complete, but the final DB state will be wrong.
        // The function itself doesn't throw, but it logs a critical error.
        const loggerSpy = spy(deps.logger, 'error');
        
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, mockJob, mockPayload, 'user-789', deps, 'auth-token');

        assert(loggerSpy.calls.some(call => {
            const firstArg = call.args[0];
            if (typeof firstArg === 'string') {
                return firstArg.includes('CRITICAL: Failed to update job');
            } else if (firstArg instanceof Error) {
                return firstArg.message.includes('CRITICAL: Failed to update job');
            }
            return false;
        }), "Expected a critical error log for failing to update the job status.");
        
        loggerSpy.restore();
    });

    clearAllStubs?.();
});
