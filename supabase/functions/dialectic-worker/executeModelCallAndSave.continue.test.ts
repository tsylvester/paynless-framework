import {
    assertEquals,
    assertExists,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import type { Database } from '../types_db.ts';
  import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
  import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
  import {
    isJson,
    isRecord,
} from '../_shared/utils/type_guards.ts';
  import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
  import type { 
    DialecticJobRow, 
    UnifiedAIResponse, 
    ExecuteModelCallAndSaveParams, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    IDialecticJobDeps,
} from '../dialectic-service/dialectic.interface.ts';

import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';

import { 
    createMockJob, 
    testPayload, 
    mockSessionData, 
    mockProviderData, 
    mockFullProviderData, 
    setupMockClient, 
    getMockDeps,
    mockContribution
} from './executeModelCallAndSave.test.ts';
  
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
        
        assertEquals(sendContinuedSpy.calls.length, 1, 'Expected sendContributionGenerationContinuedEvent to be called once');
        clearAllStubs?.();
    });
});

Deno.test('executeModelCallAndSave - Continuation Handling', async (t) => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null },
    },
  });

  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

  const deps = getMockDeps();
  deps.fileManager = fileManager;

  // Mock callUnifiedAIModel to return a response that needs continuation
  deps.callUnifiedAIModel = async () => ({
    content: 'Partial AI response content',
    contentType: 'text/plain',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
    finish_reason: 'max_tokens', // Correctly use finish_reason to match implementation
  });

  await t.step('should save the first chunk correctly when a job is continued by the model', async () => {
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob(testPayload), // A standard, non-continuation job
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

    // This is the core of the test. We are asserting the *intended* future behavior.
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    
    // This test MUST FAIL because the current implementation does not add this metadata.
    assertEquals(uploadContext.contributionMetadata?.isContinuation, true, 'isContinuation flag should be set to true');
    assertEquals(uploadContext.contributionMetadata?.turnIndex, 0, 'turnIndex should be set to 0 for the first continuation chunk');
  });

  await t.step('for a continuation job, should save only the new chunk and link it to the previous one', async () => {
    // 1. Setup
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
      'ai_providers': {
        select: { data: [mockFullProviderData], error: null },
      },
    });

    const fileManager = new MockFileManagerService();
    const newChunkContribution = { ...mockContribution, id: 'new-chunk-id-456' };
    fileManager.setUploadAndRegisterFileResponse(newChunkContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;
    deps.callUnifiedAIModel = async () => ({
        content: 'This is the new chunk.',
        contentType: 'text/plain',
        inputTokens: 5,
        outputTokens: 5,
        processingTimeMs: 50,
        finish_reason: 'max_tokens',
      });

    const mockContinuationJob: DialecticJobRow = {
      id: 'job-id-456',
      payload: {
        projectId: 'proj-123',
        sessionId: 'sess-123',
        iteration: 1,
        stageSlug: 'test-stage',
        modelId: 'model-def',
        // --- Properties to satisfy the type guard ---
        job_type: 'execute',
        prompt_template_name: 'test-prompt',
        output_type: 'markdown',
        inputs: {},
        canonicalPathParams: {
          contributionType: 'synthesis',
        },
        // --- Properties for continuation logic ---
        contributionType: 'synthesis',
        previousContent: 'This was the first chunk.',
        continuation_count: 1,
        target_contribution_id: 'prev-chunk-id-123', // This is the chunk we are continuing.
        document_relationships: { 'thesis': 'thesis-id-abc' },
      },
      status: 'pending',
      created_at: new Date().toISOString(),
      user_id: 'user-789',
      session_id: 'sess-123',
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      iteration_number: 1,
      max_retries: 3,
      parent_job_id: null,
      prerequisite_job_id: null,
      results: null,
      stage_slug: 'test-stage',
      started_at: null,
      target_contribution_id: null,
    };

    // 2. Execute
    await executeModelCallAndSave({
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: mockContinuationJob,
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
    });

    // 3. Assert
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];

    assertEquals(
      uploadContext.fileContent,
      'This is the new chunk.',
      'Should only save the new content, not concatenated content.',
    );

    // CORRECTED: Assert that the target_contribution_id is passed correctly for linking.
    assertEquals(
        uploadContext.contributionMetadata?.target_contribution_id,
        'prev-chunk-id-123',
        'Should pass the target_contribution_id from the job to link the chunks.',
    );

    // The original document_relationships should be preserved without modification.
    assertEquals(
      uploadContext.contributionMetadata?.document_relationships,
      { 'thesis': 'thesis-id-abc' },
      'Should preserve the original document_relationships from the job payload.',
    );

    assertEquals(uploadContext.contributionMetadata?.turnIndex, 1, 'turnIndex should be 1');

    clearAllStubs?.();
  });

  await t.step('should trigger final assembly when a continuation job receives a "stop" signal', async () => {
    // 1. Setup
    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null },
        },
    });

    const fileManager = new MockFileManagerService();
    const newChunkContribution = { ...mockContribution, id: 'final-chunk-id-789' };
    fileManager.setUploadAndRegisterFileResponse(newChunkContribution, null);
 
    const deps = getMockDeps();
    deps.fileManager = fileManager;
    // This is the critical part of the mock: the model signals it is finished.
    deps.callUnifiedAIModel = async () => ({
        content: 'This is the final chunk.',
        contentType: 'text/plain',
        inputTokens: 5,
        outputTokens: 5,
        processingTimeMs: 50,
        finish_reason: 'stop', 
    });


    const mockFinalContinuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        continuation_count: 2,
        target_contribution_id: 'prev-chunk-id-456',
        document_relationships: { 'thesis': 'thesis-id-abc' },
    };

    if (!isJson(mockFinalContinuationPayload)) {
        throw new Error('mockFinalContinuationPayload is not a valid JSON object');
    }
    // This job represents the final step in a continuation chain.
    const mockFinalContinuationJob: DialecticJobRow = {
      id: 'job-id-789',
      payload: mockFinalContinuationPayload,
      status: 'pending',
      created_at: new Date().toISOString(),
      user_id: 'user-789',
      session_id: 'sess-123',
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      iteration_number: 1,
      max_retries: 3,
      parent_job_id: null,
      prerequisite_job_id: null,
      results: null,
      stage_slug: 'test-stage',
      started_at: null,
      target_contribution_id: null,
    };

    // 2. Execute
    await executeModelCallAndSave({
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: mockFinalContinuationJob,
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
    });

    // 3. Assert
    // This is designed to FAIL, proving the assembly trigger is missing.
    assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1, 'assembleAndSaveFinalDocument should be called once');
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls[0].args[0],
      'thesis-id-abc',
      'Should be called with the target contribution ID from the job payload.',
    );
    
    clearAllStubs?.();
  });


  clearAllStubs?.();
});
