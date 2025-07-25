import {
    assertEquals,
    assert,
    fail,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import type { Database, Tables, Json } from '../types_db.ts';
  import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
  import { logger } from '../_shared/logger.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import { processCombinationJob } from './processCombinationJob.ts';
  import type { DialecticJobRow, DialecticJobPayload, DialecticSession, ProcessSimpleJobDeps, SelectedAiProvider, DialecticProjectResource, DialecticCombinationJobPayload } from '../dialectic-service/dialectic.interface.ts';
  import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';
  import { MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
  import type { DownloadStorageResult } from "../_shared/supabase_storage_utils.ts";
  import {
    isDialecticCombinationJobPayload,
    isDialecticJobRow,
    isFailedAttemptErrorArray
  } from '../_shared/utils/type_guards.ts';
  
  const mockCombinationPayload: Json = {
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'combination',
    model_id: 'model-def',
    iterationNumber: 1,
    job_type: 'combine',
    inputs: {
        document_ids: ['doc-1', 'doc-2'],
    },
    prompt_template_name: 'tier2_document_combiner',
  };

  if (!isDialecticCombinationJobPayload(mockCombinationPayload)) {
    throw new Error('Test setup failed: mockCombinationPayload is not a valid DialecticCombinationJobPayload');
  }
  
  const mockCombinationJob: DialecticJobRow = {
    id: 'job-combo-123',
    session_id: 'session-456',
    user_id: 'user-789',
    stage_slug: 'combination',
    iteration_number: 1,
    payload: mockCombinationPayload,
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
  
  const mockSystemPrompt = {
      id: 'prompt-combiner',
      name: 'Tier 2 Document Combiner',
      prompt_text: 'Combine the following documents:\n{{documents}}',
      stage_association: 'utility',
  };
  
  const mockDocuments: DialecticProjectResource[] = [
      { id: 'doc-1', storage_bucket: 'test', storage_path: 'docs/1', file_name: 'doc1.txt', project_id: 'project-abc', user_id: 'user-789', mime_type: 'text/plain', size_bytes: 100, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resource_description: 'Document 1' },
      { id: 'doc-2', storage_bucket: 'test', storage_path: 'docs/2', file_name: 'doc2.txt', project_id: 'project-abc', user_id: 'user-789', mime_type: 'text/plain', size_bytes: 100, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resource_description: 'Document 2' },
  ];
  
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
      return createMockSupabaseClient('user-789', {
          genericMockResults: {
              dialectic_sessions: { select: () => Promise.resolve({ data: [mockSessionData], error: null }) },
              ai_providers: { select: () => Promise.resolve({ data: [mockProviderData], error: null }) },
              system_prompts: { select: () => Promise.resolve({ data: [mockSystemPrompt], error: null }) },
              dialectic_project_resources: { select: () => Promise.resolve({ data: mockDocuments, error: null }) },
              ...configOverrides,
          },
      });
  };
  
  const getMockDeps = (): ProcessSimpleJobDeps => {
      return {
        logger: logger,
        downloadFromStorage: async (bucket: string, path: string): Promise<DownloadStorageResult> => {
            if (path.includes('doc1.txt')) {
                return { data: await new Blob(['Content of document 1.']).arrayBuffer(), error: null };
            }
            if (path.includes('doc2.txt')) {
                return { data: await new Blob(['Content of document 2.']).arrayBuffer(), error: null };
            }
            return { data: new ArrayBuffer(0), error: null };
        },
        retryJob: async () => ({}),
        notificationService: mockNotificationService,
        executeModelCallAndSave: async () => {},
        // Irrelevant for this test, but needed for the type
        getSeedPromptForStage: async () => ({ content: '', fullPath: '', bucket: '', path: '', fileName: '' }),
        callUnifiedAIModel: async () => ({ content: '' }),
        fileManager: new MockFileManagerService(),
        getExtensionFromMimeType: () => '.txt',
        randomUUID: () => 'random-uuid',
        deleteFromStorage: async () => ({ data: null, error: null }),
        continueJob: async () => ({ enqueued: false }),
      }
  };
  
  Deno.test('processCombinationJob - Happy Path', async (t) => {
      const { client: dbClient, clearAllStubs } = setupMockClient();
      const deps = getMockDeps();
  
      const executeSpy = spy(deps, 'executeModelCallAndSave');
      
      await t.step('should prepare context and call the executor', async () => {
          if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
              fail('Mock job payload is not a valid DialecticCombinationJobPayload');
          }
          // After the type guard, we can safely create a correctly typed job object.
          const job: DialecticJobRow & { payload: DialecticCombinationJobPayload } = {
            ...mockCombinationJob,
            payload: mockCombinationJob.payload,
          };
  
          await processCombinationJob(
            dbClient as unknown as SupabaseClient<Database>, 
            job,
            'user-789', 
            deps, 
            'auth-token'
        );
  
          assertEquals(executeSpy.calls.length, 1);
          const [executorParams] = executeSpy.calls[0].args;
          
          assertEquals(executorParams.job.id, mockCombinationJob.id);
          assert(executorParams.renderedPrompt.content.includes('Content of document 1.'));
          assert(executorParams.renderedPrompt.content.includes('Content of document 2.'));
          
          const expectedRenderedPrompt = `Combine the following documents:\n---\nDOCUMENT 1:\nContent of document 1.\n---\nDOCUMENT 2:\nContent of document 2.\n---`;
          assertEquals(executorParams.renderedPrompt.content, expectedRenderedPrompt);
      });
  
      clearAllStubs?.();
  });
  
  Deno.test('processCombinationJob - Failure Handling', async (t) => {
      const { client: dbClient, clearAllStubs } = setupMockClient();
      const deps = getMockDeps();
  
      const executorStub = stub(deps, 'executeModelCallAndSave', () => {
          return Promise.reject(new Error('Executor failed during combination'));
      });
      
      const retryJobSpy = spy(deps, 'retryJob');
  
      await t.step('should call retryJob when the executor fails', async () => {
          if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
              fail('Mock job payload is not a valid DialecticCombinationJobPayload');
          }
          const job: DialecticJobRow & { payload: DialecticCombinationJobPayload } = {
            ...mockCombinationJob,
            payload: mockCombinationJob.payload,
          };
          await processCombinationJob(dbClient as unknown as SupabaseClient<Database>, job, 'user-789', deps, 'auth-token');
  
          assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called');
      });
      
      clearAllStubs?.();
      executorStub.restore();
  });

Deno.test('processCombinationJob - Error Handling Scenarios', async (t) => {
    
    await t.step('should throw a communicative error if session query fails', async () => {
        const { client: mockDb } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_sessions': { select: { data: null, error: new Error('DB session error') } },
            },
        });
        const deps = getMockDeps();
        const retrySpy = spy(deps, 'retryJob');

        if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
            fail('Mock job payload is not a valid DialecticCombinationJobPayload');
        }
        await processCombinationJob(mockDb as unknown as SupabaseClient<Database>, { ...mockCombinationJob, payload: mockCombinationJob.payload }, 'user-789', deps, 'auth-token');
        
        assertEquals(retrySpy.calls.length, 1);
        const [,,, , failedAttempts] = retrySpy.calls[0].args;
        assert(isFailedAttemptErrorArray(failedAttempts) && failedAttempts[0].error.includes('Session session-456 not found'));
    });

    await t.step('should throw a communicative error if provider query fails', async () => {
        const { client: mockDb } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_sessions': { select: { data: [mockSessionData], error: null } },
                'ai_providers': { select: { data: null, error: new Error('DB provider error') } },
            },
        });
        const deps = getMockDeps();
        const retrySpy = spy(deps, 'retryJob');

        if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
            fail('Mock job payload is not a valid DialecticCombinationJobPayload');
        }
        await processCombinationJob(mockDb as unknown as SupabaseClient<Database>, { ...mockCombinationJob, payload: mockCombinationJob.payload }, 'user-789', deps, 'auth-token');

        assertEquals(retrySpy.calls.length, 1);
        const [,,, , failedAttempts] = retrySpy.calls[0].args;
        assert(isFailedAttemptErrorArray(failedAttempts) && failedAttempts[0].error.includes('Failed to fetch valid provider details for model ID model-def'));
    });

    await t.step('should throw a communicative error if system_prompts query fails', async () => {
        const { client: mockDb } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_sessions': { select: { data: [mockSessionData], error: null } },
                'ai_providers': { select: { data: [mockProviderData], error: null } },
                'system_prompts': { select: { data: null, error: new Error('DB prompt error') } },
            },
        });
        const deps = getMockDeps();
        const retrySpy = spy(deps, 'retryJob');

        if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
            fail('Mock job payload is not a valid DialecticCombinationJobPayload');
        }
        await processCombinationJob(mockDb as unknown as SupabaseClient<Database>, { ...mockCombinationJob, payload: mockCombinationJob.payload }, 'user-789', deps, 'auth-token');
        
        assertEquals(retrySpy.calls.length, 1);
        const [,,, , failedAttempts] = retrySpy.calls[0].args;
        assert(isFailedAttemptErrorArray(failedAttempts) && failedAttempts[0].error.includes(`Could not find system prompt named 'tier2_document_combiner'`));
    });
    
    await t.step('should throw if number of fetched docs does not match requested IDs', async () => {
        const { client: mockDb } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_sessions': { select: { data: [mockSessionData], error: null } },
                'ai_providers': { select: { data: [mockProviderData], error: null } },
                'system_prompts': { select: { data: [mockSystemPrompt], error: null } },
                'dialectic_project_resources': { select: { data: [mockDocuments[0]], error: null } }, // Only return one doc
            },
        });
        const deps = getMockDeps();
        const retrySpy = spy(deps, 'retryJob');
    
        if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
            fail('Mock job payload is not a valid DialecticCombinationJobPayload');
        }
        await processCombinationJob(mockDb as unknown as SupabaseClient<Database>, { ...mockCombinationJob, payload: mockCombinationJob.payload }, 'user-789', deps, 'auth-token');
        
        assertEquals(retrySpy.calls.length, 1);
        const [,,, , failedAttempts] = retrySpy.calls[0].args;
        assert(isFailedAttemptErrorArray(failedAttempts) && failedAttempts[0].error.includes('Failed to fetch all document records for IDs'));
    });

    await t.step('should throw a communicative error if downloadFromStorage fails', async () => {
        const { client: mockDb } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_sessions': { select: { data: [mockSessionData], error: null } },
                'ai_providers': { select: { data: [mockProviderData], error: null } },
                'system_prompts': { select: { data: [mockSystemPrompt], error: null } },
                'dialectic_project_resources': { select: { data: mockDocuments, error: null } },
            },
        });
        const deps = getMockDeps();
        deps.downloadFromStorage = () => Promise.resolve({ data: null, error: new Error('Storage Read Failed') });
        const retrySpy = spy(deps, 'retryJob');

        if (!isDialecticCombinationJobPayload(mockCombinationJob.payload)) {
            fail('Mock job payload is not a valid DialecticCombinationJobPayload');
        }
        await processCombinationJob(mockDb as unknown as SupabaseClient<Database>, { ...mockCombinationJob, payload: mockCombinationJob.payload }, 'user-789', deps, 'auth-token');

        assertEquals(retrySpy.calls.length, 1);
        const [,,, , failedAttempts] = retrySpy.calls[0].args;
        assert(isFailedAttemptErrorArray(failedAttempts) && failedAttempts[0].error.includes('Failed to download document content from'));
    });

});
