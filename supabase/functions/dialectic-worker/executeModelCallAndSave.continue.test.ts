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
    isChatApiRequest,
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
    mockContribution,
    buildPromptPayload,
    spyCallModel,
    buildExecuteParams,
} from './executeModelCallAndSave.test.ts';

import { FileType, DocumentRelationships } from '../_shared/types/file_manager.types.ts';
import type { Messages } from '../_shared/types.ts';
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { withMockEnv, getStorageSpies } from '../_shared/supabase.mock.ts';
  
Deno.test('executeModelCallAndSave - missing payload.user_jwt causes immediate failure before adapter call', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });
  const deps = getMockDeps();
  const callSpy = spy(deps, 'callUnifiedAIModel');

  // Build execute job WITHOUT user_jwt and without using helpers that inject defaults
  const job: DialecticJobRow = {
    id: 'job-id-123',
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
    payload: {
      job_type: 'execute',
      step_info: { current_step: 1, total_steps: 1 },
      prompt_template_name: 'test-prompt',
      inputs: {},
      output_type: 'thesis',
      projectId: 'project-abc',
      sessionId: 'sess-123',
      stageSlug: 'test-stage',
      model_id: 'model-def',
      iterationNumber: 1,
      continueUntilComplete: true,
      walletId: 'wallet-ghi',
      canonicalPathParams: { contributionType: 'thesis' },
      // intentionally no user_jwt
    },
  };

  let threw = false;
  try {
    await executeModelCallAndSave({
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'external-token',
      job,
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
    });
  } catch (_e) {
    threw = true;
  }

  assert(threw, 'Expected immediate failure when payload.user_jwt is missing');
  assertEquals(callSpy.calls.length, 0, 'Adapter must not be called when jwt is missing');
});

Deno.test('executeModelCallAndSave - uses payload.user_jwt and never external auth token', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });
  const deps = getMockDeps();
  const callSpy = spy(deps, 'callUnifiedAIModel');

  const expectedJwt = 'payload.jwt.value';
  const payload: DialecticExecuteJobPayload = {
    ...testPayload,
    user_jwt: expectedJwt,
  };
  const job = createMockJob(payload);

  await executeModelCallAndSave({
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'external-token-should-not-be-used',
    job,
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Hi' }),
    sessionData: mockSessionData,
    compressionStrategy: getSortedCompressionCandidates,
  });

  assertEquals(callSpy.calls.length, 1, 'Adapter should be invoked exactly once');
  const sentAuth = callSpy.calls[0].args[1];
  assertEquals(sentAuth, expectedJwt, 'Adapter must receive jwt from payload, not external token');
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
      job: createMockJob({ ...testPayload, walletId: 'wallet-ghi' }), // Explicit wallet to satisfy fail-fast
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

    // Assert first save is NOT a continuation for storage (root save), aligning with invariant:
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
    assertEquals(uploadContext.pathContext.isContinuation, false, 'First chunk must not be marked as continuation for storage');

    if (!uploadContext.contributionMetadata) {
      throw new Error('uploadContext.contributionMetadata is undefined');
    }

    // No target_contribution_id on the first chunk save
    assert(
      !('target_contribution_id' in uploadContext.contributionMetadata) || !uploadContext.contributionMetadata.target_contribution_id,
      'First chunk must not carry target_contribution_id',
    );
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

    const stageSlug = 'thesis';
    const documentRelationship: DocumentRelationships = { [stageSlug]: 'thesis-id-abc' };
    const mockContinuationJob: DialecticJobRow = {
      id: 'job-id-456',
      payload: {
        projectId: 'proj-123',
        sessionId: 'sess-123',
        iteration: 1,
        stageSlug,
        modelId: 'model-def',
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
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
        document_relationships: documentRelationship,
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
      stage_slug: stageSlug,
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
      { [stageSlug]: 'thesis-id-abc' },
      'Should preserve the original document_relationships from the job payload.',
    );

    assertEquals(uploadContext.pathContext.turnIndex, 1, 'turnIndex should be 1');

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
    const stageSlug = 'thesis';
    const rootId = 'thesis-id-abc';
    const newChunkContribution = { ...mockContribution, id: 'final-chunk-id-789', stage: stageSlug, document_relationships: { [stageSlug]: rootId } };
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
        stageSlug,
        continuation_count: 2,
        target_contribution_id: 'prev-chunk-id-456',
        document_relationships: { [stageSlug]: rootId },
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
      stage_slug: 'thesis',
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
      rootId,
      'Should be called with the root id from the SAVED contribution relationships.',
    );
    
    clearAllStubs?.();
  });


  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - forwards target_contribution_id and preserves metadata on continuation save', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
      'ai_providers': {
          select: { data: [mockFullProviderData], error: null }
      }
  });

  const deps = getMockDeps();
  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
  deps.fileManager = fileManager;
  const stageSlug = 'thesis';
  const rootId = 'root-abc';
  const rel: DocumentRelationships = { [stageSlug]: rootId };

  const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: rel }, { target_contribution_id: rootId }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
  };

  await executeModelCallAndSave(params);

  assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
  const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];

  assertExists(uploadContext.contributionMetadata, 'Contribution metadata should exist');
  assertEquals(uploadContext.contributionMetadata.target_contribution_id, rootId, 'target_contribution_id was not forwarded');

  // Preserve key metadata
  assertEquals(uploadContext.contributionMetadata.stageSlug, stageSlug);
  assertEquals(uploadContext.contributionMetadata.iterationNumber, testPayload.iterationNumber);
  assertEquals(uploadContext.contributionMetadata.modelIdUsed, mockProviderData.id);
  assertEquals(uploadContext.contributionMetadata.modelNameDisplay, mockProviderData.name);

  clearAllStubs?.();
});

// First chunk should be saved as non-continuation, but continuation should be enqueued; original job completes
Deno.test('executeModelCallAndSave - first chunk saved as non-continuation; continuation enqueued; job completed', async () => {
const { client: dbClient, clearAllStubs } = setupMockClient({
  'ai_providers': { select: { data: [mockFullProviderData], error: null } }
});

const deps = getMockDeps();
const fileManager = new MockFileManagerService();
fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
deps.fileManager = fileManager;

// Simulate model returning a partial due to max_tokens to trigger continuation enqueue
const callSpy = spy(deps, 'callUnifiedAIModel');
// Replace implementation to simulate max_tokens partial
(deps.callUnifiedAIModel) = async () => ({
  content: 'Partial content.',
  contentType: 'text/markdown',
  inputTokens: 100,
  outputTokens: 100,
  processingTimeMs: 10,
  rawProviderResponse: { finish_reason: 'max_tokens' }
});

const continueSpy = spy(deps, 'continueJob');

const params: ExecuteModelCallAndSaveParams = {
  dbClient: dbClient as unknown as SupabaseClient<Database>,
  deps,
  authToken: 'auth-token',
  job: createMockJob({ ...testPayload, continueUntilComplete: true }),
  projectOwnerUserId: 'user-789',
  providerDetails: mockProviderData,
  promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
  sessionData: mockSessionData,
  compressionStrategy: getSortedCompressionCandidates,
};

await executeModelCallAndSave(params);

// Assert first save treated as non-continuation (no target_contribution_id present)
assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected uploadAndRegisterFile to be called');
const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
assertExists(uploadContext.contributionMetadata, 'Expected contributionMetadata');
assert(uploadContext.pathContext.isContinuation === false, 'First chunk must not be marked as continuation for storage');
assert(
  !('target_contribution_id' in uploadContext.contributionMetadata) || !uploadContext.contributionMetadata.target_contribution_id,
  'First chunk must not carry target_contribution_id',
);

// Assert continuation enqueued
assert(continueSpy.calls.length === 1, 'Expected a continuation job to be enqueued');

clearAllStubs?.();
});

// final assembly must trigger based on SAVED record relationships, not payload
Deno.test('executeModelCallAndSave - final assembly triggers using SAVED relationships when payload is missing', async (t) => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const stageSlug = 'thesis';
  const rootId = 'root-xyz';
  const relSaved: DocumentRelationships = { [stageSlug]: rootId };

  // Mock file manager to return a saved record that includes document_relationships with the dynamic stage key
  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: 'final-contrib-id',
    stage: stageSlug,
    document_relationships: relSaved,
  }, null);

  const deps = getMockDeps();
  deps.fileManager = fileManager;

  // Ensure the AI response is a final chunk
  const stopStub = stub(deps, 'callUnifiedAIModel', async () => ({
    content: 'Final chunk',
    contentType: 'text/markdown',
    inputTokens: 1,
    outputTokens: 1,
    processingTimeMs: 1,
    finish_reason: 'stop',
  }));

  await t.step('should call assembleAndSaveFinalDocument with root id from SAVED record', async () => {
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      // Payload intentionally omits document_relationships to prove we read from SAVED record
      job: createMockJob({ ...testPayload, stageSlug }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'User' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
    };

    await executeModelCallAndSave(params);

    // Expectation: assemble should be invoked with root id from SAVED record
    const calls = fileManager.assembleAndSaveFinalDocument.calls;
    assertEquals(calls.length, 1, 'assembleAndSaveFinalDocument should be called once for final chunk');
    assertEquals(calls[0].args[0], rootId, 'assembleAndSaveFinalDocument should use root id from SAVED relationships');
  });

  stopStub.restore();
  clearAllStubs?.();
});

// initial chunk must set document_relationships dynamically for EVERY stage (not hard-coded)
Deno.test('executeModelCallAndSave - sets dynamic document_relationships key based on stage slug for initial chunk', async (t) => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  // Arrange a saved contribution that is the first chunk for a non-"thesis" stage
  const stageSlug = 'parenthesis';
  const savedId = 'contrib-parenthesis-1';
  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: savedId,
    stage: stageSlug,
    contribution_type: 'thesis',
    document_relationships: null,
  }, null);

  const deps: IDialecticJobDeps = {
    ...getMockDeps(),
    fileManager,
  };

  await t.step('should update dialectic_contributions with { [stageSlug]: contribution.id }', async () => {
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob({ ...testPayload, stageSlug }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Render' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
    };

    await executeModelCallAndSave(params);

    const contribUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    assertExists(contribUpdateSpies, 'dialectic_contributions.update spy should exist');
    assertEquals(contribUpdateSpies.callCount, 1, 'Expected a single update to dialectic_contributions');

    const [updatePayload] = contribUpdateSpies.callsArgs[0];
    assert(isRecord(updatePayload), 'Update payload should be an object');
    const rels = updatePayload['document_relationships'];
    assert(isRecord(rels), 'document_relationships should be an object');
    // RED expectation: dynamic key equals the stage slug, not hard-coded 'thesis'
    assertEquals(rels[stageSlug], savedId, 'document_relationships must be keyed by stage slug');
  });

  clearAllStubs?.();
});

// continuation persists full document_relationships (no self-map, no init overwrite)
Deno.test('executeModelCallAndSave - continuation persists payload document_relationships and skips initializer', async (t) => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const stageSlug = 'thesis';
  const parentId = 'parent-001';
  const relationships = { [stageSlug]: parentId, source_group: 'sg-1' };

  const fileManager = new MockFileManagerService();
  // Return a saved continuation record with null relationships so that any relationships present
  // on the DB side must come from the worker's persistence path (not from this mock response)
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: 'contrib-123',
    stage: stageSlug,
    document_relationships: null,
    target_contribution_id: parentId,
  }, null);

  const deps: IDialecticJobDeps = {
    ...getMockDeps(),
    fileManager,
  };

  await t.step('should persist the exact payload relationships on continuation save', async () => {
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships }, { target_contribution_id: parentId }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
    };

    await executeModelCallAndSave(params);

    // Assert we updated dialectic_contributions with the exact relationships from payload
    const contribUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    assertExists(contribUpdateSpies, 'dialectic_contributions.update spy should exist');
    assert(contribUpdateSpies.callCount >= 1, 'Expected at least one update to dialectic_contributions');

    // Find an update that sets document_relationships
    let foundExactPersist = false;
    let foundSelfMap = false;
    for (const args of contribUpdateSpies.callsArgs) {
      const payloadUnknown = args[0];
      if (isRecord(payloadUnknown)) {
        const relsUnknown = payloadUnknown['document_relationships'];
        if (isRecord(relsUnknown)) {
          // Deep equality with expected relationships
          try {
            assertEquals(relsUnknown, relationships);
            foundExactPersist = true;
          } catch (_) {
            // Also ensure it is NOT the self-map initializer { [stageSlug]: contrib.id }
            const selfMapCandidate = { [stageSlug]: 'contrib-123' };
            try {
              assertEquals(relsUnknown, selfMapCandidate);
              foundSelfMap = true;
            } catch (_) {
              // not a self-map, ignore
            }
          }
        }
      }
    }

    assert(foundExactPersist, 'Expected continuation relationships to be persisted exactly from payload');
    assert(!foundSelfMap, 'Continuation must not be self-mapped by initializer');
  });

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - continuation uses gathered history and does not duplicate "Please continue."', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spyCallModel(deps);

  const gatheredHistory: Messages[] = [
    { role: 'user', content: 'SEED: Original user prompt' },
    { role: 'assistant', content: 'First assistant reply' },
    { role: 'user', content: '' }, // spacer to maintain alternation in strict mode
    { role: 'assistant', content: 'Intermediate assistant chunk' },
    { role: 'user', content: 'Please continue.' },
  ];

  const stageSlugGH = 'thesis';
  const rootIdGH = 'root-123';
  const relGH: DocumentRelationships = { [stageSlugGH]: rootIdGH };
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    job: createMockJob({ ...testPayload, stageSlug: stageSlugGH, document_relationships: relGH }, { target_contribution_id: rootIdGH }),
    promptConstructionPayload: buildPromptPayload({
      currentUserPrompt: 'Please continue.',
      conversationHistory: gatheredHistory,
    }),
  });

  await executeModelCallAndSave(params);

  const firstArg = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(firstArg), 'First argument to callUnifiedAIModel should be a ChatApiRequest');

  // message should be the continuation prompt
  assertEquals(firstArg.message, 'Please continue.');
  // messages should match gathered history exactly (no extra prepend)
  assertExists(firstArg.messages, 'messages should exist on ChatApiRequest');
  assertEquals(firstArg.messages, gatheredHistory.map((m) => ({ role: m.role, content: m.content })));
  // ensure exactly one trailing "Please continue." message
  const continueCount = firstArg.messages.filter((m: { role: string; content: string }) => m.role === 'user' && m.content === 'Please continue.').length;
  assertEquals(continueCount, 1);

  clearAllStubs?.();
});

Deno.test("executeModelCallAndSave saves final model_contribution_main to stage root after continuation exhaustion", async () => {
  // Use mock Supabase client so executeModelCallAndSave can query ai_providers
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });
  const uploads: { fullDir: string; isContinuation: boolean; fileType: string }[] = [];

  const deps: any = {
    logger: { info: () => {}, error: () => {} },
    countTokens: () => 1,
    tokenWalletService: {
      getBalance: async () => "999999",
      recordTransaction: async () => {},
    },
    fileManager: {
      uploadAndRegisterFile: async (ctx: any) => {
        const isContinuation = Boolean(ctx.contributionMetadata && ctx.contributionMetadata.isContinuation === true);
        uploads.push({
          fullDir: isContinuation ? `${ctx.pathContext.stageSlug}/_work` : ctx.pathContext.stageSlug,
          isContinuation,
          fileType: ctx.pathContext.fileType,
        });
        return { record: {
          id: crypto.randomUUID(),
          session_id: ctx.pathContext.sessionId,
          storage_bucket: "bucket",
          storage_path: isContinuation ? `${ctx.pathContext.projectId}/session_${ctx.pathContext.sessionId}/iteration_${ctx.pathContext.iteration}/${ctx.pathContext.stageSlug}/_work` : `${ctx.pathContext.projectId}/session_${ctx.pathContext.sessionId}/iteration_${ctx.pathContext.iteration}/${ctx.pathContext.stageSlug}`,
          file_name: ctx.pathContext.originalFileName || "file.md",
          mime_type: ctx.mimeType,
          size_bytes: ctx.sizeBytes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          edit_version: 1,
          is_latest_edit: true,
          iteration_number: ctx.pathContext.iteration,
          stage: ctx.pathContext.stageSlug,
        }, error: null };
      },
      assembleAndSaveFinalDocument: async () => ({ finalPath: "ok", error: null }),
    },
    continueJob: async () => ({ enqueued: false }),
    callUnifiedAIModel: async () => ({ content: "chunk", finish_reason: "max_tokens" }),
    notificationService: { sendContributionReceivedEvent: async () => {}, sendContributionGenerationCompleteEvent: async () => {}, sendContributionGenerationContinuedEvent: async () => {} },
  };

  const stageSlug = 'thesis';
  const rootId = 'root-id';
  const docRel: DocumentRelationships = { [stageSlug]: rootId };
  const stageSlug2 = 'thesis';
  const rootId2 = 'root-id';
  const rel2: DocumentRelationships = { [stageSlug2]: rootId2 };
  const job: any = {
    id: crypto.randomUUID(),
    attempt_count: 0,
    payload: {
      job_type: 'execute',
      iterationNumber: 1,
      stageSlug: stageSlug2,
      projectId: 'proj',
      model_id: 'model-1',
      sessionId: 'sess',
      walletId: 'wallet',
      user_jwt: 'jwt.token.here',
      output_type: 'thesis',
      canonicalPathParams: {
        projectId: 'proj',
        fileType: FileType.ModelContributionMain,
        sessionId: 'sess',
        iteration: 1,
        stageSlug: stageSlug2,
        modelSlug: 'gpt-4',
        attemptCount: 0,
        contributionType: 'thesis',
      },
      inputs: {},
      document_relationships: rel2,
      continueUntilComplete: true,
      continuation_count: 0,
    },
  };

  const provider = { id: 'model-1', name: 'GPT-4', api_identifier: 'openai-gpt-4' };

  await executeModelCallAndSave({
    dbClient: dbClient as unknown as SupabaseClient<Database>,
    deps,
    authToken: 'jwt',
    job,
    projectOwnerUserId: 'user',
    providerDetails: { id: 'model-1', name: 'GPT-4', api_identifier: 'openai-gpt-4', provider: 'openai' },
    promptConstructionPayload: { systemInstruction: '', conversationHistory: [], resourceDocuments: [], currentUserPrompt: 'hi' },
    sessionData: { id: 'sess' } as any,
    compressionStrategy: async () => [],
  });

  // First save should be non-continuation at the stage root (no _work)
  const anyNonContinuationAtRoot = uploads.some(u => !u.isContinuation && !u.fullDir.includes('/_work'));
  assert(anyNonContinuationAtRoot, 'Expected first save to be non-continuation at stage root');
  // Ensure no non-continuation upload goes under _work
  const nonContinuationToWork = uploads.some(u => !u.isContinuation && u.fullDir.includes('/_work'));
  assert(!nonContinuationToWork, 'Non-continuation model_contribution_main must not be saved under _work');
});

// Reject continuation save when document_relationships are missing or invalid (unit scope)
Deno.test('executeModelCallAndSave - rejects continuation without relationships (pre-upload validation)', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps = getMockDeps();
  const fileManager = new MockFileManagerService();
  deps.fileManager = fileManager;

  // Minimal AI response; continuation signaled
  deps.callUnifiedAIModel = async () => ({ content: 'cont-chunk', contentType: 'text/plain', finish_reason: 'max_tokens' });

  const stageSlug = 'thesis';
  const rootId = 'prev-id-123';

  // Build job with continuation link but WITHOUT document_relationships to trigger early validation error
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    job: createMockJob({ ...testPayload, stageSlug, document_relationships: undefined }, { target_contribution_id: rootId }),
    promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' })
  });

  let threw = false;
  try {
    await executeModelCallAndSave(params);
  } catch (_e) {
    threw = true;
  }
  assert(threw, 'Expected executeModelCallAndSave to throw when continuation lacks valid document_relationships');
  // Ensure no upload attempt was made at unit scope
  assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, 'uploadAndRegisterFile should not be called on pre-upload validation failure');
});

Deno.test('executeModelCallAndSave - three-chunk finalization uses saved root id and provides chunks in correct order for assembly', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const stageSlug = 'thesis';
  const rootId = 'root-thesis-001';
  const cont1Id = 'cont-001';
  const cont2Id = 'cont-002';
  const relationships = { [stageSlug]: rootId };

  const expectedRoot = 'ROOT.';
  const expectedC1 = 'CHUNK1.';
  const expectedC2 = 'CHUNK2.';

  const uploadedContents: string[] = [];
  const fileManager = new MockFileManagerService();

  // Capture upload contexts and return deterministic ids keyed off content
  fileManager.uploadAndRegisterFile = spy(async (ctx) => {
    const content = String(ctx.fileContent ?? '');
    uploadedContents.push(content);
    const id =
      content === expectedRoot ? rootId :
      content === expectedC1 ? cont1Id :
      content === expectedC2 ? cont2Id :
      crypto.randomUUID();
    const rec = { ...mockContribution, id, stage: stageSlug, document_relationships: null };
    return { record: rec, error: null };
  });

  const deps = getMockDeps();
  deps.fileManager = fileManager;

  // 1) Initial/root chunk: partial (max_tokens); no target_contribution_id; no relationships required
  deps.callUnifiedAIModel = async () => ({
    content: expectedRoot,
    contentType: 'text/markdown',
    inputTokens: 1,
    outputTokens: 1,
    processingTimeMs: 1,
    finish_reason: 'max_tokens',
  });
  await executeModelCallAndSave(buildExecuteParams(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    {
      job: createMockJob({ ...testPayload, stageSlug, continueUntilComplete: true }),
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'User' }),
    },
  ));

  // 2) Continuation 1: partial; carries relationships to root, and links to root via target_contribution_id
  deps.callUnifiedAIModel = async () => ({
    content: expectedC1,
    contentType: 'text/markdown',
    inputTokens: 1,
    outputTokens: 1,
    processingTimeMs: 1,
    finish_reason: 'max_tokens',
  });
  await executeModelCallAndSave(buildExecuteParams(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    {
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships }, { target_contribution_id: rootId }),
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
    },
  ));

  // 3) Continuation 2: final; same relationships; links to cont1 via target_contribution_id
  deps.callUnifiedAIModel = async () => ({
    content: expectedC2,
    contentType: 'text/markdown',
    inputTokens: 1,
    outputTokens: 1,
    processingTimeMs: 1,
    finish_reason: 'stop',
  });
  await executeModelCallAndSave(buildExecuteParams(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    {
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships }, { target_contribution_id: cont1Id }),
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
    },
  ));

  // Assertions
  // - assemble called exactly once with the root id from SAVED relationships
  assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1, 'assemble must be called once on final chunk');
  assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[0], rootId, 'assemble must use root id from saved relationships');

  // - verify upload ordering and lineage metadata sufficient for assembly
  assert(uploadedContents.length === 3, 'expected three uploads (root + 2 continuations)');
  const [u0, u1, u2] = fileManager.uploadAndRegisterFile.calls.map(c => c.args[0]);

  // Root upload: not a continuation; no target_contribution_id
  assertEquals(u0.fileContent, expectedRoot);
  assertEquals(u0.pathContext.isContinuation, false);
  assert(!u0.contributionMetadata?.target_contribution_id);

  // Continuation 1: continuation linked to root; relationships persisted on continuation
  assertEquals(u1.fileContent, expectedC1);
  assertEquals(u1.pathContext.isContinuation, true);
  assertEquals(u1.contributionMetadata?.target_contribution_id, rootId);
  assertEquals(u1.contributionMetadata?.document_relationships, relationships);

  // Continuation 2: continuation linked to cont1; relationships persisted on continuation
  assertEquals(u2.fileContent, expectedC2);
  assertEquals(u2.pathContext.isContinuation, true);
  assertEquals(u2.contributionMetadata?.target_contribution_id, cont1Id);
  assertEquals(u2.contributionMetadata?.document_relationships, relationships);

  // Demonstrate expected final content (without implementing assembly in the mock)
  assertEquals(uploadedContents.join(''), expectedRoot + expectedC1 + expectedC2, 'expected concatenation of root+chunk1+chunk2');

  clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - continuation jobs should populate pathContext with continuation flags', async () => {
  // Arrange
  const { client: dbClient } = setupMockClient({
      'ai_providers': {
          select: { data: [mockFullProviderData], error: null }
      }
  });

  const fileManager = new MockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
  const deps = getMockDeps();
  deps.fileManager = fileManager;

  const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continuation_count: 2,
      document_relationships: { 'thesis': 'contrib-123' },
  };

  const continuationJob = createMockJob(
      continuationPayload, 
      {
          target_contribution_id: 'existing-contrib-id',
      }
  );

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
      job: continuationJob,
      promptConstructionPayload: buildPromptPayload(),
  });

  // Act
  await executeModelCallAndSave(params);

  // Assert
  assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1, "uploadAndRegisterFile should be called once");
  const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];
  
  assertEquals(uploadContext.pathContext.isContinuation, true, "isContinuation flag should be set to true in pathContext");
  assertEquals(uploadContext.pathContext.turnIndex, 2, "turnIndex should be set to 2 in pathContext");
});

Deno.test('executeModelCallAndSave - should continue when content contains continuation_needed: true, even if finish_reason is stop', async () => {
  // Arrange
  const { client: dbClient } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const continueJobSpy = spy(deps, 'continueJob');

  const payloadWithContinuation: DialecticExecuteJobPayload = {
    ...testPayload,
    continueUntilComplete: true,
  };

  const jobWithContinuation = createMockJob(payloadWithContinuation);

  deps.callUnifiedAIModel = async () => ({
    content: '{"continuation_needed": true, "stop_reason": "next_document"}',
    finish_reason: 'stop', // Provider says stop
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
  });

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job: jobWithContinuation });

  // Act
  await executeModelCallAndSave(params);

  // Assert
  assertEquals(continueJobSpy.calls.length, 1, 'continueJob should be called once when content signals continuation');
});
