import {
    assertEquals,
    assertExists,
    assert,
  } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
  import { 
    spy, stub,
  } from 'https://deno.land/std@0.224.0/testing/mock.ts';
  import { Database } from '../types_db.ts';
  import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
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
    UnifiedAIResponse, 
    ExecuteModelCallAndSaveParams, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    DialecticContributionRow,
    ContributionType,
    DocumentRelationships,
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
import { 
  FileType, 
  DialecticStageSlug 
} from '../_shared/types/file_manager.types.ts';
import { Messages } from '../_shared/types.ts';
import { 
  mockNotificationService, 
  resetMockNotificationService 
} from '../_shared/utils/notification.service.mock.ts';
import { ShouldEnqueueRenderJobResult } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';
import { IExecuteJobContext } from './JobContext.interface.ts';

// Copied from executeModelCallAndSave.test.ts to make this test file self-contained
export const createMockUnifiedAIResponse = (overrides: Partial<UnifiedAIResponse> = {}): UnifiedAIResponse => ({
  content: '{"content": "Default AI response"}',
  contentType: 'application/json',
  inputTokens: 10,
  outputTokens: 20,
  processingTimeMs: 100,
  rawProviderResponse: { mock: 'response' },
  finish_reason: 'stop',
  ...overrides,
});

export const createMockContribution = (overrides: Partial<DialecticContributionRow> = {}): DialecticContributionRow => ({
  id: 'contrib-id-123',
  session_id: 'session-id-456',
  stage: 'test-stage',
  iteration_number: 1,
  model_id: 'model-def-456',
  edit_version: 1,
  is_latest_edit: true,
  citations: null,
  contribution_type: 'model_contribution_main',
  created_at: new Date().toISOString(),
  error: null,
  file_name: 'test.md',
  mime_type: 'text/markdown',
  model_name: 'Mock AI Model',
  original_model_contribution_id: null,
  processing_time_ms: 120,
  prompt_template_id_used: null,
  raw_response_storage_path: null,
  seed_prompt_url: null,
  size_bytes: 200,
  storage_bucket: 'test-bucket',
  storage_path: 'test/path/to/contribution',
  target_contribution_id: null,
  tokens_used_input: 15,
  tokens_used_output: 25,
  updated_at: new Date().toISOString(),
  user_id: 'user-id-789',
  document_relationships: null,
  is_header: false,
  source_prompt_resource_id: null,
  ...overrides,
});
  
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
    is_test_job: false,
    job_type: 'PLAN',
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
    const deps: IExecuteJobContext = getMockDeps();

    const continueJobStub = stub(deps, 'continueJob', async () => ({ enqueued: true }));

    const callUnifiedAIModelStub = stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> =>
            createMockUnifiedAIResponse({
                content: '{"content": "Partial content"}',
                finish_reason: 'length',
            }),
    );
    
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
        resetMockNotificationService();
        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.notificationService === mockNotificationService, 'Expected deps.notificationService to be mockNotificationService');

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

        assertEquals(mockNotificationService.sendContributionReceivedEvent.calls.length, 1, 'Expected sendContributionReceivedEvent to be called once');
        assertEquals(mockNotificationService.sendContributionGenerationCompleteEvent.calls.length, 1, 'Expected sendContributionGenerationCompleteEvent to be called once');
        clearAllStubs?.();
    });

    await t.step('should send Continued notification for a continuing job', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient({
            'ai_providers': {
                select: { data: [mockFullProviderData], error: null }
            }
        });
        resetMockNotificationService();
        const deps: IExecuteJobContext = getMockDeps();
        assert(deps.notificationService === mockNotificationService, 'Expected deps.notificationService to be mockNotificationService');

        stub(
            deps,
            'callUnifiedAIModel',
            async (): Promise<UnifiedAIResponse> =>
                createMockUnifiedAIResponse({
                    content: '{"content": "Partial content"}',
                    finish_reason: 'length',
                }),
        );
        
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
        
        assertEquals(mockNotificationService.sendContributionGenerationContinuedEvent.calls.length, 1, 'Expected sendContributionGenerationContinuedEvent to be called once');
        clearAllStubs?.();
    });
});

Deno.test('executeModelCallAndSave - Continuation Handling', async (t) => {
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null },
    },
  });

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

  // Mock callUnifiedAIModel to return a response that needs continuation
  stub(
    deps,
    'callUnifiedAIModel',
    async (): Promise<UnifiedAIResponse> =>
      createMockUnifiedAIResponse({
        content: '{"content": "Partial AI response content"}',
        finish_reason: 'max_tokens',
      }),
  );

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
    if (!isModelContributionContext(uploadContext)) {
        throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
    }
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

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    const newChunkContribution = { ...mockContribution, id: 'new-chunk-id-456' };
    fileManager.setUploadAndRegisterFileResponse(newChunkContribution, null);

    stub(
      deps,
      'callUnifiedAIModel',
      async (): Promise<UnifiedAIResponse> =>
        createMockUnifiedAIResponse({
          content: '{"content": "This is the new chunk."}',
          finish_reason: 'max_tokens',
        }),
    );

    const stageSlug = 'thesis';
    const documentRelationship: DocumentRelationships = { [stageSlug]: 'thesis-id-abc' };

    const contributionType: ContributionType = 'thesis';
    if (!contributionType) {
        throw new Error('contributionType is null');
    }
    const continuationPayload: DialecticExecuteJobPayload = {
        projectId: 'proj-123',
        sessionId: 'sess-123',
        iterationNumber: 1,
        stageSlug,
        model_id: 'model-def',
        walletId: 'wallet-ghi',
        user_jwt: 'jwt.token.here',
        prompt_template_id: 'test-prompt',
        output_type: FileType.HeaderContext,
        document_key: 'header_context',
        inputs: {},
        canonicalPathParams: {
          contributionType: contributionType,
          stageSlug,
        },
        continuation_count: 1,
        target_contribution_id: 'prev-chunk-id-123',
        document_relationships: documentRelationship,
    };

    const mockContinuationJob: DialecticJobRow = createMockJob(
        continuationPayload,
        {
            id: 'job-id-456',
            stage_slug: stageSlug,
        }
    );

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
    if (!isModelContributionContext(uploadContext)) {
        throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
    }

    assertEquals(
      uploadContext.fileContent,
      '{"content": "This is the new chunk."}',
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

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    const stageSlug = 'thesis';
    const rootId = 'thesis-id-abc';
    const newChunkContribution = { ...mockContribution, id: 'final-chunk-id-789', stage: stageSlug, document_relationships: { [stageSlug]: rootId } };
    fileManager.setUploadAndRegisterFileResponse(newChunkContribution, null);

    // This is the critical part of the mock: the model signals it is finished.
    stub(
      deps,
      'callUnifiedAIModel',
      async (): Promise<UnifiedAIResponse> =>
        createMockUnifiedAIResponse({
          content: '{"content": "This is the final chunk."}',
          finish_reason: 'stop',
        }),
    );


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
      is_test_job: false,
      job_type: 'PLAN',
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

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
  const stageSlug = 'thesis';
  const rootId = 'root-abc';
  const rel: DocumentRelationships = { [stageSlug]: rootId };

  const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: rel, continuation_count: 1 }, { target_contribution_id: rootId }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
  };

  await executeModelCallAndSave(params);

  assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
  const uploadContext = fileManager.uploadAndRegisterFile.calls[0].args[0];

  if (!isModelContributionContext(uploadContext)) {
    throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
  }
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

const deps: IExecuteJobContext = getMockDeps();
assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
const fileManager: MockFileManagerService = deps.fileManager;
fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

// Simulate model returning a partial due to max_tokens to trigger continuation enqueue
// Replace implementation to simulate max_tokens partial
stub(
  deps,
  'callUnifiedAIModel',
  async (): Promise<UnifiedAIResponse> =>
    createMockUnifiedAIResponse({
      content: '{"content": "Partial content."}',
      finish_reason: 'max_tokens',
    }),
);

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
if (!isModelContributionContext(uploadContext)) {
    throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
}
assertExists(uploadContext.contributionMetadata, 'Expected contributionMetadata');
assertEquals(uploadContext.pathContext.isContinuation, false, 'First chunk must not be marked as continuation for storage');
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

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  // Mock file manager to return a saved record that includes document_relationships with the dynamic stage key
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: 'final-contrib-id',
    stage: stageSlug,
    document_relationships: relSaved,
  }, null);

  // Ensure the AI response is a final chunk
  const stopStub = stub(
    deps,
    'callUnifiedAIModel',
    async (): Promise<UnifiedAIResponse> =>
      createMockUnifiedAIResponse({
        content: '{"content": "Final chunk"}',
        finish_reason: 'stop',
      }),
  );

  await t.step('should call assembleAndSaveFinalDocument with root id from SAVED record', async () => {
    // This test verifies that for continuation chunks, document_relationships from the payload
    // is persisted and then used to determine the root ID for assembly.
    // Note: For root chunks, document_relationships[stageSlug] = contribution.id,
    // so this test must use a continuation chunk (with target_contribution_id) to preserve the payload relationships.
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      // Continuation chunks require document_relationships in payload (validated at line 1181-1183)
      // The payload's document_relationships is persisted and then used for assembly
      job: createMockJob({ 
        ...testPayload, 
        stageSlug,
        target_contribution_id: rootId, // Continuation chunk
        continuation_count: 1,
        document_relationships: relSaved, // Must be provided for continuation chunks
      }),
      projectOwnerUserId: 'user-789',
      providerDetails: mockProviderData,
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'User' }),
      sessionData: mockSessionData,
      compressionStrategy: getSortedCompressionCandidates,
    };

    await executeModelCallAndSave(params);

    // Expectation: assemble should be invoked with root id from persisted document_relationships
    // For continuation chunks, document_relationships from payload is persisted (line 1305-1324),
    // then contribution.document_relationships is updated (line 1324), and assembly reads from it (line 1647)
    const calls = fileManager.assembleAndSaveFinalDocument.calls;
    assertEquals(calls.length, 1, 'assembleAndSaveFinalDocument should be called once for final chunk');
    assertEquals(calls[0].args[0], rootId, 'assembleAndSaveFinalDocument should use root id from persisted document_relationships');
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
  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: savedId,
    stage: stageSlug,
    contribution_type: 'thesis',
    document_relationships: null,
  }, null);

  await t.step('should update dialectic_contributions with { [stageSlug]: contribution.id }', async () => {
    // This test is about the root-chunk initializer for document_relationships, which only runs for document outputs.
    // Prevent RENDER-job path from interfering; initializer happens before render decision.
    stub(deps, 'shouldEnqueueRenderJob', async () => {
      const result: ShouldEnqueueRenderJobResult = { shouldRender: false, reason: 'is_json' };
      return result;
    });

    const docPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      stageSlug,
      canonicalPathParams: {
        ...testPayload.canonicalPathParams,
        stageSlug,
      },
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob(docPayload),
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

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  // Return a saved continuation record with null relationships so that any relationships present
  // on the DB side must come from the worker's persistence path (not from this mock response)
  fileManager.setUploadAndRegisterFileResponse({
    ...mockContribution,
    id: 'contrib-123',
    stage: stageSlug,
    document_relationships: null,
    target_contribution_id: parentId,
  }, null);

  await t.step('should persist the exact payload relationships on continuation save', async () => {
    const params: ExecuteModelCallAndSaveParams = {
      dbClient: dbClient as unknown as SupabaseClient<Database>,
      deps,
      authToken: 'auth-token',
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships, continuation_count: 1 }, { target_contribution_id: parentId }),
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
    { role: 'user', content: 'Please continue.' },
    { role: 'assistant', content: 'Intermediate assistant chunk' },
  ];

  const stageSlugGH = 'thesis';
  const rootIdGH = 'root-123';
  const relGH: DocumentRelationships = { [stageSlugGH]: rootIdGH };
  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    job: createMockJob({ ...testPayload, stageSlug: stageSlugGH, document_relationships: relGH, continuation_count: 1 }, { target_contribution_id: rootIdGH }),
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
  
  // messages should match the gathered history, which ends with the last assistant turn
  assertExists(firstArg.messages, 'messages should exist on ChatApiRequest');
  
  const expectedHistory = gatheredHistory.map((m) => ({ role: m.role, content: m.content }));
  assertEquals(firstArg.messages, expectedHistory);

  clearAllStubs?.();
});

Deno.test("should trigger final document assembly when continuations are exhausted", async () => {
    // Arrange
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
    });

    const deps: IExecuteJobContext = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;

    // Simulate a model response that indicates it is finished
    stub(
      deps,
      'callUnifiedAIModel',
      async (): Promise<UnifiedAIResponse> => createMockUnifiedAIResponse({ finish_reason: 'stop' }),
    );

    const stageSlug = 'thesis';
    const rootId = 'root-id-123';
    const relationships: DocumentRelationships = { [stageSlug]: rootId };

    // This job represents the final step in a continuation chain
    const finalContinuationJob = createMockJob({
        ...testPayload,
        stageSlug,
        document_relationships: relationships,
        continuation_count: 2, // Signifies it's part of a chain
    }, {
        target_contribution_id: 'previous-chunk-id-456', // Linked to previous chunk
    });
    
    // Ensure the returned record from fileManager contains the necessary relationships for assembly logic
    fileManager.setUploadAndRegisterFileResponse({
      ...mockContribution,
      document_relationships: relationships,
    }, null);

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
        job: finalContinuationJob,
        promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
    });

    // Act
    await executeModelCallAndSave(params);

    // Assert
    assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 1, 'assembleAndSaveFinalDocument should be called once');
    assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls[0].args[0],
        rootId,
        'Should be called with the root id from the SAVED contribution relationships.'
    );

    clearAllStubs?.();
});

// Reject continuation save when document_relationships are missing or invalid (unit scope)
Deno.test('executeModelCallAndSave - rejects continuation without relationships (pre-upload validation)', async () => {
  const { client: dbClient } = setupMockClient({
    'ai_providers': { select: { data: [mockFullProviderData], error: null } },
  });

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;

  // Minimal AI response; continuation signaled
  stub(
    deps,
    'callUnifiedAIModel',
    async (): Promise<UnifiedAIResponse> =>
      createMockUnifiedAIResponse({ content: '{"content": "cont-chunk"}', finish_reason: 'max_tokens' }),
  );

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

  const expectedRoot = '{"content":"ROOT."}';
  const expectedC1 = '{"content":"CHUNK1."}';
  const expectedC2 = '{"content":"CHUNK2."}';

  const uploadedContents: string[] = [];
  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;

  // Capture upload contexts and return deterministic ids keyed off content
  fileManager.uploadAndRegisterFile = spy(async (ctx) => {
    const content = String(ctx.fileContent ?? '');
    uploadedContents.push(content);
    const id =
      content === expectedRoot ? rootId :
      content === expectedC1 ? cont1Id :
      content === expectedC2 ? cont2Id :
      crypto.randomUUID();

    const relationships = isModelContributionContext(ctx) ? ctx.contributionMetadata?.document_relationships ?? null : null;
    const targetContributionId = isModelContributionContext(ctx) ? ctx.contributionMetadata?.target_contribution_id ?? null : null;
    
    const rec = { 
        ...mockContribution, 
        id, 
        stage: stageSlug, 
        document_relationships: relationships,
        target_contribution_id: targetContributionId,
    };
    return { record: rec, error: null };
  });

  // Return different model responses per call (root, continuation 1, continuation 2)
  let modelCallCount = 0;
  stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => {
    modelCallCount++;
    if (modelCallCount === 1) {
      return createMockUnifiedAIResponse({ content: expectedRoot, finish_reason: 'max_tokens' });
    }
    if (modelCallCount === 2) {
      return createMockUnifiedAIResponse({ content: expectedC1, finish_reason: 'max_tokens' });
    }
    return createMockUnifiedAIResponse({ content: expectedC2, finish_reason: 'stop' });
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
  await executeModelCallAndSave(buildExecuteParams(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    {
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships, continuation_count: 1 }, { target_contribution_id: rootId }),
      promptConstructionPayload: buildPromptPayload({ currentUserPrompt: 'Please continue.' }),
    },
  ));

  // 3) Continuation 2: final; same relationships; links to cont1 via target_contribution_id
  await executeModelCallAndSave(buildExecuteParams(
    dbClient as unknown as SupabaseClient<Database>,
    deps,
    {
      job: createMockJob({ ...testPayload, stageSlug, document_relationships: relationships, continuation_count: 2 }, { target_contribution_id: cont1Id }),
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

  if (!isModelContributionContext(u0) || !isModelContributionContext(u1) || !isModelContributionContext(u2)) {
    throw new Error('Test setup error: one of the uploads was not a ModelContributionUploadContext');
  }

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
      },
      'dialectic_contributions': {
          update: { data: [], error: null } // Allow document_relationships update to succeed
      },
  });

  const deps: IExecuteJobContext = getMockDeps();
  assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
  const fileManager: MockFileManagerService = deps.fileManager;
  fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

  const continuationDocumentRelationships: DocumentRelationships = {
      [DialecticStageSlug.Thesis]: 'contrib-123',
  };
  const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continuation_count: 2,
      stageSlug: DialecticStageSlug.Thesis,
      document_relationships: continuationDocumentRelationships,
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
  
  if (!isModelContributionContext(uploadContext)) {
    throw new Error("Test setup error: uploadContext was not of type ModelContributionUploadContext");
  }
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

  stub(
    deps,
    'callUnifiedAIModel',
    async (): Promise<UnifiedAIResponse> =>
      createMockUnifiedAIResponse({
        content: '{"continuation_needed": true, "stop_reason": "next_document"}',
        finish_reason: 'stop', // Provider says stop
      }),
  );

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job: jobWithContinuation });

  // Act
  await executeModelCallAndSave(params);

  // Assert
  assertEquals(continueJobSpy.calls.length, 1, 'continueJob should be called once when content signals continuation');
});

Deno.test('executeModelCallAndSave - does not inject spacer messages when history is already alternating', async () => {
  // Arrange
  const { client: dbClient, clearAllStubs } = setupMockClient({
    'ai_providers': {
      select: { data: [mockFullProviderData], error: null }
    }
  });

  const deps = getMockDeps();
  const callUnifiedAISpy = spyCallModel(deps);

  const perfectlyAlternatingHistory: Messages[] = [
    { role: 'user', content: 'U1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'U2' },
    { role: 'assistant', content: 'A2' },
  ];

  const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, {
    job: createMockJob(testPayload),
    promptConstructionPayload: buildPromptPayload({
      conversationHistory: perfectlyAlternatingHistory,
      currentUserPrompt: 'This is the current prompt.',
    }),
  });

  // Act
  await executeModelCallAndSave(params);

  // Assert
  const firstArg = callUnifiedAISpy.calls[0].args[0];
  assert(isChatApiRequest(firstArg), 'First argument to callUnifiedAIModel should be a ChatApiRequest');
  
  // Assert against the distinct properties of the ChatApiRequest
  assertEquals(firstArg.message, 'This is the current prompt.', 'The current user prompt should be in the message property.');
  
  const sentMessages = firstArg.messages;
  assertExists(sentMessages, 'messages should exist on ChatApiRequest');
  
  // The sent history should match the alternating history, without the current prompt.
  const expectedMessages = perfectlyAlternatingHistory.map(m => ({ role: m.role, content: m.content }));
  
  assertEquals(sentMessages, expectedMessages, 'The message history sent to the model should not contain the current user prompt.');

  callUnifiedAISpy.restore();
  clearAllStubs?.();
});


Deno.test('executeModelCallAndSave - comprehensive continuation triggers', async (t) => {
  type ContinueTestCase = {
    name: string;
    response: Partial<UnifiedAIResponse>;
    continueUntilComplete?: boolean;
    shouldContinue: boolean;
  };

  const testCases: ContinueTestCase[] = [
    // --- POSITIVE CASES (SHOULD CONTINUE) ---

    // Category 2: Provider-Signaled `finish_reason`
    { name: 'should continue when finish_reason is "length"', response: { finish_reason: 'length' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "max_tokens"', response: { finish_reason: 'max_tokens' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "content_truncated"', response: { finish_reason: 'content_truncated' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "next_document"', response: { finish_reason: 'next_document' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "unknown"', response: { finish_reason: 'unknown' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "tool_calls"', response: { finish_reason: 'tool_calls' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "function_call"', response: { finish_reason: 'function_call' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "content_filter"', response: { finish_reason: 'content_filter' }, shouldContinue: true },

    // Category 3: Application-Signaled In-Band JSON Flags
    { name: 'should continue when content contains "continuation_needed": true', response: { content: '{"continuation_needed": true}', finish_reason: 'stop' }, shouldContinue: true },
    { name: 'should continue when content contains "stop_reason": "continuation"', response: { content: '{"stop_reason": "continuation"}', finish_reason: 'stop' }, shouldContinue: true },
    { name: 'should continue when content contains "stop_reason": "token_limit"', response: { content: '{"stop_reason": "token_limit"}', finish_reason: 'stop' }, shouldContinue: true },
    { name: 'should continue when content contains non-empty "resume_cursor"', response: { content: '{"resume_cursor": "feasibility_insights"}', finish_reason: 'stop' }, shouldContinue: true },
    { name: 'should NOT continue when content contains empty "resume_cursor"', response: { content: '{"resume_cursor": ""}', finish_reason: 'stop' }, shouldContinue: false },
    
    // --- NEGATIVE CASES (SHOULD NOT CONTINUE) ---
    { name: 'should NOT continue for normal "stop" reason with no flags', response: { content: '{"result": "complete"}', finish_reason: 'stop' }, shouldContinue: false },
    { name: 'should NOT continue if continueUntilComplete is false, even with a continue reason', response: { finish_reason: 'length' }, continueUntilComplete: false, shouldContinue: false },
  ];

  for (const tc of testCases) {
    await t.step(tc.name, async () => {
      // Arrange
      const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': { select: { data: [mockFullProviderData], error: null } }
      });

      const deps: IExecuteJobContext = getMockDeps();
      const continueJobSpy = spy(deps, 'continueJob');
      assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
      const fileManager: MockFileManagerService = deps.fileManager;
      fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

      stub(
        deps,
        'callUnifiedAIModel',
        async (): Promise<UnifiedAIResponse> =>
          createMockUnifiedAIResponse({
            content: tc.response.content ?? '{"content": "Default AI response"}',
            ...tc.response,
          }),
      );

      const jobPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        // Default to true unless explicitly set to false for a negative test case
        continueUntilComplete: tc.continueUntilComplete !== false,
      };
      const job = createMockJob(jobPayload);

      const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

      // Act
      await executeModelCallAndSave(params);

      // Assert
      const expectedCalls = tc.shouldContinue ? 1 : 0;
      assertEquals(continueJobSpy.calls.length, expectedCalls, `continueJob should be called ${expectedCalls} time(s)`);

      clearAllStubs?.();
    });
  }
});

Deno.test('executeModelCallAndSave - comprehensive retry triggers', async (t) => {
    type RetryTestCase = {
      name: string;
      response: Partial<UnifiedAIResponse>;
      shouldRetry: boolean;
    };

    const testCases: RetryTestCase[] = [
      {
        name: 'should trigger retry on malformed JSON response',
        response: { content: '{"bad json:', finish_reason: 'stop' },
        shouldRetry: true,
      },
      { 
        name: 'should trigger retry when finish_reason is "error"', 
        response: { finish_reason: 'error' }, 
        shouldRetry: true 
      },
    ];
  
    for (const tc of testCases) {
      await t.step(tc.name, async () => {
        // Arrange
        const { client: dbClient, clearAllStubs } = setupMockClient({
          'ai_providers': { select: { data: [mockFullProviderData], error: null } }
        });
  
        const deps: IExecuteJobContext = getMockDeps();
        const retryJobSpy = spy(deps, 'retryJob');
        const continueJobSpy = spy(deps, 'continueJob');
        assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
        const fileManager: MockFileManagerService = deps.fileManager;
        fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
  
        stub(
          deps,
          'callUnifiedAIModel',
          async (): Promise<UnifiedAIResponse> =>
            createMockUnifiedAIResponse({
              content: tc.response.content ?? '{"content": "Default AI response"}',
              ...tc.response
            }),
        );
  
        const job = createMockJob(testPayload);
        const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });
  
        // Act
        await executeModelCallAndSave(params);
  
        // Assert
        const expectedCalls = tc.shouldRetry ? 1 : 0;
        assertEquals(retryJobSpy.calls.length, expectedCalls, `retryJob should be called ${expectedCalls} time(s)`);
        assertEquals(continueJobSpy.calls.length, 0, 'continueJob should never be called for a retryable error');
        assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0, 'uploadAndRegisterFile should not be called for a retryable error');

        clearAllStubs?.();
      });
    }
  });


