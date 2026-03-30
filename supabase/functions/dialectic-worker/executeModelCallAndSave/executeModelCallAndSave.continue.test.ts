/**
 * Continuation / retry / assembly behavior for `executeModelCallAndSave`.

 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../../types_db.ts';
import type {
  AdapterStreamChunk,
  AiProviderAdapterInstance,
  ChatApiRequest,
  FinishReason,
} from '../../_shared/types.ts';
import type {
  ContextForDocument,
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DocumentRelationships,
} from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import {
  isChatApiRequest,
  isDocumentRelationships,
  isJson,
  isPlainObject,
  isRecord,
} from '../../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { DialecticStageSlug, FileType } from '../../_shared/types/file_manager.types.ts';
import type {
  ModelContributionUploadContext,
  UploadContext,
} from '../../_shared/types/file_manager.types.ts';
import {
  mockNotificationService,
  resetMockNotificationService,
} from '../../_shared/utils/notification.service.mock.ts';
import type { RetryJobFn } from '../JobContext.interface.ts';
import {
  createMockAiProviderAdapterInstance,
  createMockDialecticContributionRow,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockChatApiRequest,
  createMockFileManagerForEmcas,
  createMockJob,
  createMockSendMessageStreamFromParams,
  testPayload,
  type MockEmcasStreamParams,
} from './executeModelCallAndSave.mock.ts';
import {
  isExecuteModelCallAndSaveErrorReturn,
  isExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.guard.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
} from './executeModelCallAndSave.interface.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

function adapterWithStream(
  streamParams: MockEmcasStreamParams,
): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams(streamParams),
  });
}

function adapterCapturingRequest(
  sink: { request?: ChatApiRequest },
  streamParams: MockEmcasStreamParams,
): AiProviderAdapterInstance {
  const streamFn: AiProviderAdapterInstance['sendMessageStream'] =
    createMockSendMessageStreamFromParams(streamParams);
  return createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (
      request: ChatApiRequest,
      modelIdentifier: string,
    ): AsyncGenerator<AdapterStreamChunk> {
      sink.request = request;
      yield* streamFn(request, modelIdentifier);
    },
  });
}

Deno.test('executeModelCallAndSave - Continuation Enqueued', async (t) => {
  await t.step('should enqueue a continuation job', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const continueJobStub = spy(async () => ({ enqueued: true }));
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Partial content"}'],
      finishReason: 'length',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      continueJob: continueJobStub,
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow({
          id: 'contrib-cont-1',
          target_contribution_id: 'parent-contrib-1',
        }),
      }),
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continueUntilComplete: true,
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
    assertEquals(continueJobStub.calls.length, 1, 'Expected continueJob to be called');
    const historicSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
      'dialectic_generation_jobs',
      'update',
    );
    assertExists(historicSpies, 'Job update spies should exist');
    const finalUpdateCallArgs = historicSpies.callsArgs.find((args) => {
      const payloadUnknown = args[0];
      return isRecord(payloadUnknown) && payloadUnknown.status === 'completed';
    });
    assertExists(
      finalUpdateCallArgs,
      "Final job status should be 'completed', as the continuation is a separate job.",
    );
  });
});

Deno.test('executeModelCallAndSave - Notifications', async (t) => {
  await t.step('should send Received and Complete notifications for a non-continuing job', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    resetMockNotificationService();
    const notifyAdapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Non-continuing job response"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      notificationService: mockNotificationService,
      getAiProviderAdapter: () => notifyAdapter,
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      }),
    });
    assert(
      deps.notificationService === mockNotificationService,
      'Expected deps.notificationService to be mockNotificationService',
    );
    const nonContinuingPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continueUntilComplete: false,
    };
    if (!isJson(nonContinuingPayload)) {
      throw new Error('test fixture: non-continuing payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: nonContinuingPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(
      mockNotificationService.sendContributionReceivedEvent.calls.length,
      1,
      'Expected sendContributionReceivedEvent to be called once',
    );
    assertEquals(
      mockNotificationService.sendContributionGenerationCompleteEvent.calls.length,
      1,
      'Expected sendContributionGenerationCompleteEvent to be called once',
    );
  });

  await t.step('should send Continued notification for a continuing job', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    resetMockNotificationService();
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Partial content"}'],
      finishReason: 'length',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      notificationService: mockNotificationService,
      continueJob: async () => ({ enqueued: true }),
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow({
          id: 'contrib-cont-1',
          target_contribution_id: 'parent-contrib-1',
        }),
      }),
    });
    assert(
      deps.notificationService === mockNotificationService,
      'Expected deps.notificationService to be mockNotificationService',
    );
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continueUntilComplete: true,
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(
      mockNotificationService.sendContributionGenerationContinuedEvent.calls.length,
      1,
      'Expected sendContributionGenerationContinuedEvent to be called once',
    );
  });
});

Deno.test('executeModelCallAndSave - Continuation Handling', async (t) => {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {},
  );
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
  const contributionRoot: DialecticContributionRow = createMockDialecticContributionRow();
  const fileManagerRoot: MockFileManagerService = createMockFileManagerForEmcas({
    outcome: 'success',
    contribution: contributionRoot,
  });
  const adapterRoot: AiProviderAdapterInstance = adapterWithStream({
    textDeltas: ['{"content": "Partial AI response content"}'],
    finishReason: 'max_tokens',
  });
  const depsRoot: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapterRoot,
    fileManager: fileManagerRoot,
  });

  await t.step('should save the first chunk correctly when a job is continued by the model', async () => {
    const rootPayload: DialecticExecuteJobPayload = { ...testPayload, walletId: 'wallet-ghi' };
    if (!isJson(rootPayload)) {
      throw new Error('test fixture: root payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: rootPayload,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      depsRoot,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
    assert(
      fileManagerRoot.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadContextUnknown: unknown = fileManagerRoot.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContextUnknown.pathContext.isContinuation,
      false,
      'First chunk must not be marked as continuation for storage',
    );
    assertExists(uploadContextUnknown.contributionMetadata, 'contributionMetadata');
    assert(
      !('target_contribution_id' in uploadContextUnknown.contributionMetadata) ||
        !uploadContextUnknown.contributionMetadata.target_contribution_id,
      'First chunk must not carry target_contribution_id',
    );
  });

  await t.step('for a continuation job, should save only the new chunk and link it to the previous one', async () => {
    const newChunkContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'new-chunk-id-456',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: newChunkContribution,
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "This is the new chunk."}'],
      finishReason: 'max_tokens',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const stageSlug: string = 'thesis';
    const documentRelationship: DocumentRelationships = { [stageSlug]: 'thesis-id-abc' };
    const continuationPayload: DialecticExecuteJobPayload = {
      idempotencyKey: 'job-id-123_execute',
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
        contributionType: 'thesis',
        stageSlug,
      },
      continuation_count: 1,
      target_contribution_id: 'prev-chunk-id-123',
      document_relationships: documentRelationship,
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const mockContinuationJob: DialecticJobRow = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          id: 'job-id-456',
          stage_slug: stageSlug,
          payload: continuationPayload,
        },
      },
    ).job;
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        stageSlug,
        projectId: 'proj-123',
        sessionId: 'sess-123',
      },
      {
        dbClient,
        jobRowOverrides: {
          id: mockContinuationJob.id,
          stage_slug: mockContinuationJob.stage_slug,
          payload: mockContinuationJob.payload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContextUnknown.fileContent,
      '{"content": "This is the new chunk."}',
      'Should only save the new content, not concatenated content.',
    );
    assertEquals(
      uploadContextUnknown.contributionMetadata?.target_contribution_id,
      'prev-chunk-id-123',
      'Should pass the target_contribution_id from the job to link the chunks.',
    );
    assertEquals(
      uploadContextUnknown.contributionMetadata?.document_relationships,
      { [stageSlug]: 'thesis-id-abc' },
      'Should preserve the original document_relationships from the job payload.',
    );
    assertEquals(uploadContextUnknown.pathContext.turnIndex, 1, 'turnIndex should be 1');
  });

  await t.step('should trigger final assembly when a continuation job receives a "stop" signal', async () => {
    const stageSlug: string = 'thesis';
    const rootId: string = 'thesis-id-abc';
    const newChunkContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'final-chunk-id-789',
      stage: stageSlug,
      document_relationships: { [stageSlug]: rootId },
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: newChunkContribution,
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "This is the final chunk."}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const mockFinalContinuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      stageSlug,
      continuation_count: 2,
      target_contribution_id: 'prev-chunk-id-456',
      document_relationships: { [stageSlug]: rootId },
    };
    if (!isJson(mockFinalContinuationPayload)) {
      throw new Error('test fixture: mockFinalContinuationPayload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      { stageSlug },
      {
        dbClient,
        jobRowOverrides: {
          id: 'job-id-789',
          idempotency_key: 'job-id-123_execute',
          session_id: 'sess-123',
          stage_slug: 'thesis',
          payload: mockFinalContinuationPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      1,
      'assembleAndSaveFinalDocument should be called once',
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls[0].args[0],
      rootId,
      'Should be called with the root id from the SAVED contribution relationships.',
    );
  });
});

Deno.test(
  'executeModelCallAndSave - forwards target_contribution_id and preserves metadata on continuation save',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const stageSlug: string = 'thesis';
    const rootId: string = 'root-abc';
    const rel: DocumentRelationships = { [stageSlug]: rootId };
    const jobPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      stageSlug,
      document_relationships: rel,
      continuation_count: 1,
    };
    if (!isJson(jobPayload)) {
      throw new Error('test fixture: job payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        stageSlug,
        providerRow: createMockExecuteModelCallAndSaveParams().providerRow,
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: jobPayload,
          target_contribution_id: rootId,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertExists(uploadContextUnknown.contributionMetadata, 'Contribution metadata should exist');
    assertEquals(
      uploadContextUnknown.contributionMetadata.target_contribution_id,
      rootId,
      'target_contribution_id was not forwarded',
    );
    assertEquals(uploadContextUnknown.contributionMetadata.stageSlug, stageSlug);
    assertEquals(uploadContextUnknown.contributionMetadata.iterationNumber, testPayload.iterationNumber);
    const providerRow = params.providerRow;
    assertEquals(uploadContextUnknown.contributionMetadata.modelIdUsed, providerRow.id);
    assertEquals(uploadContextUnknown.contributionMetadata.modelNameDisplay, providerRow.name);
  },
);

Deno.test(
  'executeModelCallAndSave - first chunk saved as non-continuation; continuation enqueued; job completed',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Partial content."}'],
      finishReason: 'max_tokens',
    });
    const continueSpy = spy(async () => ({ enqueued: true }));
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
      continueJob: continueSpy,
    });
    const continuationPayload: DialecticExecuteJobPayload = { ...testPayload, continueUntilComplete: true };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
      }),
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected uploadAndRegisterFile to be called',
    );
    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertExists(uploadContextUnknown.contributionMetadata, 'Expected contributionMetadata');
    assertEquals(
      uploadContextUnknown.pathContext.isContinuation,
      false,
      'First chunk must not be marked as continuation for storage',
    );
    assert(
      !('target_contribution_id' in uploadContextUnknown.contributionMetadata) ||
        !uploadContextUnknown.contributionMetadata.target_contribution_id,
      'First chunk must not carry target_contribution_id',
    );
    assertEquals(continueSpy.calls.length, 1, 'Expected a continuation job to be enqueued');
  },
);

Deno.test(
  'executeModelCallAndSave - final assembly triggers using SAVED relationships when payload is missing',
  async (t) => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = 'thesis';
    const rootId: string = 'root-xyz';
    const relSaved: DocumentRelationships = { [stageSlug]: rootId };
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow({
        id: 'final-contrib-id',
        stage: stageSlug,
        document_relationships: relSaved,
      }),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Final chunk"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    await t.step('should call assembleAndSaveFinalDocument with root id from SAVED record', async () => {
      const jobPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        stageSlug,
        target_contribution_id: rootId,
        continuation_count: 1,
        document_relationships: relSaved,
      };
      if (!isJson(jobPayload)) {
        throw new Error('test fixture: job payload must be Json');
      }
      const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
        { stageSlug },
        {
          dbClient,
          jobRowOverrides: {
            payload: jobPayload,
          },
        },
      );
      await executeModelCallAndSave(
        deps,
        params,
        createMockExecuteModelCallAndSavePayload({
          chatApiRequest: createMockChatApiRequest({ message: 'User' }),
        }),
      );
      const calls = fileManager.assembleAndSaveFinalDocument.calls;
      assertEquals(
        calls.length,
        1,
        'assembleAndSaveFinalDocument should be called once for final chunk',
      );
      assertEquals(
        calls[0].args[0],
        rootId,
        'assembleAndSaveFinalDocument should use root id from persisted document_relationships',
      );
    });
  },
);

Deno.test(
  'executeModelCallAndSave - sets dynamic document_relationships key based on stage slug for initial chunk',
  async (t) => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = 'parenthesis';
    const savedId: string = 'contrib-parenthesis-1';
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow({
        id: savedId,
        stage: stageSlug,
        contribution_type: 'thesis',
        document_relationships: null,
      }),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"doc"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    await t.step('should update dialectic_contributions with { [stageSlug]: contribution.id }', async () => {
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
      if (!isJson(docPayload)) {
        throw new Error('test fixture: doc payload must be Json');
      }
      const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
        {
          output_type: 'business_case',
          stageSlug,
          sourcePromptResourceId: '',
        },
        {
          dbClient,
          jobRowOverrides: {
            payload: docPayload,
          },
        },
      );
      await executeModelCallAndSave(
        deps,
        params,
        createMockExecuteModelCallAndSavePayload({
          chatApiRequest: createMockChatApiRequest({ message: 'Render' }),
        }),
      );
      const contribUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
        'dialectic_contributions',
        'update',
      );
      assertExists(contribUpdateSpies, 'dialectic_contributions.update spy should exist');
      assertEquals(contribUpdateSpies.callCount, 1, 'Expected a single update to dialectic_contributions');
      const updatePayloadUnknown: unknown = contribUpdateSpies.callsArgs[0][0];
      assert(isRecord(updatePayloadUnknown), 'Update payload should be an object');
      const relsUnknown: unknown = updatePayloadUnknown['document_relationships'];
      assert(isRecord(relsUnknown), 'document_relationships should be an object');
      assertEquals(
        relsUnknown[stageSlug],
        savedId,
        'document_relationships must be keyed by stage slug',
      );
    });
  },
);

Deno.test(
  'executeModelCallAndSave - continuation persists payload document_relationships and skips initializer',
  async (t) => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = 'thesis';
    const parentId: string = 'parent-001';
    const relationships: DocumentRelationships = { [stageSlug]: parentId, source_group: 'sg-1' };
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow({
        id: 'contrib-123',
        stage: stageSlug,
        document_relationships: null,
        target_contribution_id: parentId,
      }),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"c"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    await t.step('should persist the exact payload relationships on continuation save', async () => {
      const jobPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        stageSlug,
        document_relationships: relationships,
        continuation_count: 1,
      };
      if (!isJson(jobPayload)) {
        throw new Error('test fixture: job payload must be Json');
      }
      const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
        { stageSlug },
        {
          dbClient,
          jobRowOverrides: {
            payload: jobPayload,
            target_contribution_id: parentId,
          },
        },
      );
      await executeModelCallAndSave(
        deps,
        params,
        createMockExecuteModelCallAndSavePayload({
          chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
        }),
      );
      const contribUpdateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
        'dialectic_contributions',
        'update',
      );
      assertExists(contribUpdateSpies, 'dialectic_contributions.update spy should exist');
      assert(contribUpdateSpies.callCount >= 1, 'Expected at least one update to dialectic_contributions');
      let foundExactPersist: boolean = false;
      let foundSelfMap: boolean = false;
      for (const args of contribUpdateSpies.callsArgs) {
        const payloadUnknown: unknown = args[0];
        if (isRecord(payloadUnknown)) {
          const relsUnknown: unknown = payloadUnknown['document_relationships'];
          if (isRecord(relsUnknown)) {
            try {
              assertEquals(relsUnknown, relationships);
              foundExactPersist = true;
            } catch (_) {
              const selfMapCandidate: DocumentRelationships = { [stageSlug]: 'contrib-123' };
              try {
                assertEquals(relsUnknown, selfMapCandidate);
                foundSelfMap = true;
              } catch {
                // not a self-map
              }
            }
          }
        }
      }
      assert(foundExactPersist, 'Expected continuation relationships to be persisted exactly from payload');
      assert(!foundSelfMap, 'Continuation must not be self-mapped by initializer');
    });
  },
);

Deno.test(
  'executeModelCallAndSave - continuation uses gathered history and does not duplicate "Please continue."',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const sink: { request?: ChatApiRequest } = {};
    const adapter: AiProviderAdapterInstance = adapterCapturingRequest(sink, {
      textDeltas: ['{"content":"ok"}'],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const expectedMessages: NonNullable<ChatApiRequest['messages']> = [
      { role: 'user', content: 'SEED: Original user prompt' },
      { role: 'assistant', content: 'First assistant reply' },
      { role: 'user', content: 'Please continue.' },
      { role: 'assistant', content: 'Intermediate assistant chunk' },
    ];
    const stageSlugGH: string = 'thesis';
    const rootIdGH: string = 'root-123';
    const relGH: DocumentRelationships = { [stageSlugGH]: rootIdGH };
    const jobPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      stageSlug: stageSlugGH,
      document_relationships: relGH,
      continuation_count: 1,
    };
    if (!isJson(jobPayload)) {
      throw new Error('test fixture: job payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      { stageSlug: stageSlugGH },
      {
        dbClient,
        jobRowOverrides: {
          payload: jobPayload,
          target_contribution_id: rootIdGH,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({
          message: 'Please continue.',
          messages: expectedMessages,
        }),
      }),
    );
    assertExists(sink.request, 'Adapter should receive ChatApiRequest');
    assert(isChatApiRequest(sink.request), 'Captured value should be ChatApiRequest');
    assertEquals(sink.request.message, 'Please continue.');
    assertExists(sink.request.messages, 'messages should exist on ChatApiRequest');
    assertEquals(sink.request.messages, expectedMessages);
  },
);

Deno.test('should trigger final document assembly when continuations are exhausted', async () => {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {},
  );
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
  const stageSlug: string = 'thesis';
  const rootId: string = 'root-id-123';
  const relationships: DocumentRelationships = { [stageSlug]: rootId };
  const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
    outcome: 'success',
    contribution: createMockDialecticContributionRow({
      document_relationships: relationships,
    }),
  });
  const adapter: AiProviderAdapterInstance = adapterWithStream({
    textDeltas: ['{"content":"final"}'],
    finishReason: 'stop',
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager,
  });
  const finalContinuationJobPayload: DialecticExecuteJobPayload = {
    ...testPayload,
    stageSlug,
    document_relationships: relationships,
    continuation_count: 2,
  };
  if (!isJson(finalContinuationJobPayload)) {
    throw new Error('test fixture: final continuation job payload must be Json');
  }
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    { stageSlug },
    {
      dbClient,
      jobRowOverrides: {
        payload: finalContinuationJobPayload,
        target_contribution_id: 'previous-chunk-id-456',
      },
    },
  );
  await executeModelCallAndSave(
    deps,
    params,
    createMockExecuteModelCallAndSavePayload({
      chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
    }),
  );
  assertEquals(
    fileManager.assembleAndSaveFinalDocument.calls.length,
    1,
    'assembleAndSaveFinalDocument should be called once',
  );
  assertEquals(
    fileManager.assembleAndSaveFinalDocument.calls[0].args[0],
    rootId,
    'Should be called with the root id from the SAVED contribution relationships.',
  );
});

Deno.test(
  'executeModelCallAndSave - rejects continuation without relationships (pre-upload validation)',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "cont-chunk"}'],
      finishReason: 'max_tokens',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const stageSlug: string = 'thesis';
    const rootId: string = 'prev-id-123';
    const jobPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      stageSlug,
      document_relationships: undefined,
    };
    if (!isJson(jobPayload)) {
      throw new Error('test fixture: job payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      { stageSlug },
      {
        dbClient,
        jobRowOverrides: {
          payload: jobPayload,
          target_contribution_id: rootId,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveErrorReturn(result),
      'Expected error return when continuation lacks valid document_relationships',
    );
    assertEquals(
      fileManager.uploadAndRegisterFile.calls.length,
      0,
      'uploadAndRegisterFile should not be called on pre-upload validation failure',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - three-chunk finalization uses saved root id and provides chunks in correct order for assembly',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = 'thesis';
    const rootId: string = 'root-thesis-001';
    const cont1Id: string = 'cont-001';
    const cont2Id: string = 'cont-002';
    const relationships: DocumentRelationships = { [stageSlug]: rootId };
    const expectedRoot: string = '{"content":"ROOT."}';
    const expectedC1: string = '{"content":"CHUNK1."}';
    const expectedC2: string = '{"content":"CHUNK2."}';
    const uploadedContents: string[] = [];
    const fileManager: MockFileManagerService = new MockFileManagerService();
    let modelCallCount: number = 0;
    const threeChunkAdapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: async function* (
        request: ChatApiRequest,
        modelIdentifier: string,
      ): AsyncGenerator<AdapterStreamChunk> {
        modelCallCount += 1;
        const n: number = modelCallCount;
        const content: string =
          n === 1 ? expectedRoot :
          n === 2 ? expectedC1 :
          expectedC2;
        const finish: FinishReason = n === 3 ? 'stop' : 'max_tokens';
        const streamFn: AiProviderAdapterInstance['sendMessageStream'] =
          createMockSendMessageStreamFromParams({
            textDeltas: [content],
            finishReason: finish,
          });
        yield* streamFn(request, modelIdentifier);
      },
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => threeChunkAdapter,
      fileManager,
    });
    fileManager.uploadAndRegisterFile = spy(async (context: UploadContext) => {
      if (!isModelContributionContext(context)) {
        return {
          record: null,
          error: { message: 'Test expected ModelContributionUploadContext' },
        };
      }
      const content: string = String(context.fileContent ?? '');
      uploadedContents.push(content);
      const id: string =
        content === expectedRoot ? rootId :
        content === expectedC1 ? cont1Id :
        content === expectedC2 ? cont2Id :
        crypto.randomUUID();
      const metaRelsUnknown: unknown = context.contributionMetadata?.document_relationships;
      const relationshipsFromCtx: DocumentRelationships | null =
        metaRelsUnknown !== undefined && metaRelsUnknown !== null &&
          isDocumentRelationships(metaRelsUnknown)
          ? metaRelsUnknown
          : null;
      const targetContributionId: string | null =
        context.contributionMetadata?.target_contribution_id ?? null;
      const rec: DialecticContributionRow = createMockDialecticContributionRow({
        id,
        stage: stageSlug,
        document_relationships: relationshipsFromCtx,
        target_contribution_id: targetContributionId,
      });
      return { record: rec, error: null };
    });
    const jobRoot: DialecticJobRow = createMockJob({
      ...testPayload,
      stageSlug,
      continueUntilComplete: true,
    });
    const jobContinuation1: DialecticJobRow = createMockJob(
      {
        ...testPayload,
        stageSlug,
        document_relationships: relationships,
        continuation_count: 1,
      },
      { target_contribution_id: rootId },
    );
    const jobContinuation2: DialecticJobRow = createMockJob(
      {
        ...testPayload,
        stageSlug,
        document_relationships: relationships,
        continuation_count: 2,
      },
      { target_contribution_id: cont1Id },
    );
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        { stageSlug },
        {
          dbClient,
          jobRowOverrides: {
            payload: jobRoot.payload,
            target_contribution_id: jobRoot.target_contribution_id,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User' }),
      }),
    );
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        { stageSlug },
        {
          dbClient,
          jobRowOverrides: {
            payload: jobContinuation1.payload,
            target_contribution_id: jobContinuation1.target_contribution_id,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
      }),
    );
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        { stageSlug },
        {
          dbClient,
          jobRowOverrides: {
            payload: jobContinuation2.payload,
            target_contribution_id: jobContinuation2.target_contribution_id,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'Please continue.' }),
      }),
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls.length,
      1,
      'assemble must be called once on final chunk',
    );
    assertEquals(
      fileManager.assembleAndSaveFinalDocument.calls[0].args[0],
      rootId,
      'assemble must use root id from saved relationships',
    );
    assertEquals(uploadedContents.length, 3, 'expected three uploads (root + 2 continuations)');
    const u0: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    const u1: unknown = fileManager.uploadAndRegisterFile.calls[1].args[0];
    const u2: unknown = fileManager.uploadAndRegisterFile.calls[2].args[0];
    if (!isModelContributionContext(u0) || !isModelContributionContext(u1) || !isModelContributionContext(u2)) {
      throw new Error('Test setup error: one of the uploads was not a ModelContributionUploadContext');
    }
    assertEquals(u0.fileContent, expectedRoot);
    assertEquals(u0.pathContext.isContinuation, false);
    assert(!u0.contributionMetadata?.target_contribution_id);
    assertEquals(u1.fileContent, expectedC1);
    assertEquals(u1.pathContext.isContinuation, true);
    assertEquals(u1.contributionMetadata?.target_contribution_id, rootId);
    assertEquals(u1.contributionMetadata?.document_relationships, relationships);
    assertEquals(u2.fileContent, expectedC2);
    assertEquals(u2.pathContext.isContinuation, true);
    assertEquals(u2.contributionMetadata?.target_contribution_id, cont1Id);
    assertEquals(u2.contributionMetadata?.document_relationships, relationships);
    assertEquals(
      uploadedContents.join(''),
      expectedRoot + expectedC1 + expectedC2,
      'expected concatenation of root+chunk1+chunk2',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - continuation jobs should populate pathContext with continuation flags',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {
        genericMockResults: {
          dialectic_contributions: {
            update: { data: [], error: null },
          },
        },
      },
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const continuationDocumentRelationships: DocumentRelationships = {
      [DialecticStageSlug.Thesis]: 'contrib-123',
    };
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      continuation_count: 2,
      stageSlug: DialecticStageSlug.Thesis,
      document_relationships: continuationDocumentRelationships,
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      { stageSlug: DialecticStageSlug.Thesis },
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
          target_contribution_id: 'existing-contrib-id',
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(
      fileManager.uploadAndRegisterFile.calls.length,
      1,
      'uploadAndRegisterFile should be called once',
    );
    const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContext)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContext.pathContext.isContinuation,
      true,
      'isContinuation flag should be set to true in pathContext',
    );
    assertEquals(
      uploadContext.pathContext.turnIndex,
      2,
      'turnIndex should be set to 2 in pathContext',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - should continue when content contains continuation_needed: true, even if finish_reason is stop',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const continueJobSpy = spy(async () => ({ enqueued: true }));
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: [
        '{"continuation_needed": true, "stop_reason": "next_document"}',
      ],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow({
        id: 'contrib-cont-1',
        target_contribution_id: 'parent-contrib-1',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      continueJob: continueJobSpy,
      fileManager,
    });
    const payloadWithContinuation: DialecticExecuteJobPayload = {
      ...testPayload,
      continueUntilComplete: true,
    };
    if (!isJson(payloadWithContinuation)) {
      throw new Error('test fixture: payload with continuation must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: payloadWithContinuation,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(
      continueJobSpy.calls.length,
      1,
      'continueJob should be called once when content signals continuation',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - does not inject spacer messages when history is already alternating',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const sink: { request?: ChatApiRequest } = {};
    const adapter: AiProviderAdapterInstance = adapterCapturingRequest(sink, {
      textDeltas: ['{"content":"ok"}'],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const expectedMessages: NonNullable<ChatApiRequest['messages']> = [
      { role: 'user', content: 'U1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'U2' },
      { role: 'assistant', content: 'A2' },
    ];
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams({}, { dbClient }),
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({
          message: 'This is the current prompt.',
          messages: expectedMessages,
        }),
      }),
    );
    assertExists(sink.request);
    assert(isChatApiRequest(sink.request));
    assertEquals(sink.request.message, 'This is the current prompt.');
    assertExists(sink.request.messages);
    assertEquals(sink.request.messages, expectedMessages);
  },
);

Deno.test('executeModelCallAndSave - comprehensive continuation triggers', async (t) => {
  type ContinueTestCase = {
    name: string;
    response: { content?: string; finish_reason?: FinishReason };
    continueUntilComplete?: boolean;
    shouldContinue: boolean;
  };
  const testCases: ContinueTestCase[] = [
    { name: 'should continue when finish_reason is "length"', response: { finish_reason: 'length' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "max_tokens"', response: { finish_reason: 'max_tokens' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "content_truncated"', response: { finish_reason: 'content_truncated' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "next_document"', response: { finish_reason: 'next_document' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "unknown"', response: { finish_reason: 'unknown' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "tool_calls"', response: { finish_reason: 'tool_calls' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "function_call"', response: { finish_reason: 'function_call' }, shouldContinue: true },
    { name: 'should continue when finish_reason is "content_filter"', response: { finish_reason: 'content_filter' }, shouldContinue: true },
    {
      name: 'should continue when content contains "continuation_needed": true',
      response: { content: '{"continuation_needed": true}', finish_reason: 'stop' },
      shouldContinue: true,
    },
    {
      name: 'should continue when content contains "stop_reason": "continuation"',
      response: { content: '{"stop_reason": "continuation"}', finish_reason: 'stop' },
      shouldContinue: true,
    },
    {
      name: 'should continue when content contains "stop_reason": "token_limit"',
      response: { content: '{"stop_reason": "token_limit"}', finish_reason: 'stop' },
      shouldContinue: true,
    },
    {
      name: 'should continue when content contains non-empty "resume_cursor"',
      response: { content: '{"resume_cursor": "feasibility_insights"}', finish_reason: 'stop' },
      shouldContinue: true,
    },
    {
      name: 'should NOT continue when content contains empty "resume_cursor"',
      response: { content: '{"resume_cursor": ""}', finish_reason: 'stop' },
      shouldContinue: false,
    },
    {
      name: 'should NOT continue for normal "stop" reason with no flags',
      response: { content: '{"result": "complete"}', finish_reason: 'stop' },
      shouldContinue: false,
    },
    {
      name: 'should NOT continue if continueUntilComplete is false, even with a continue reason',
      response: { finish_reason: 'length' },
      continueUntilComplete: false,
      shouldContinue: false,
    },
  ];
  for (const tc of testCases) {
    await t.step(tc.name, async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const content: string = tc.response.content ?? '{"content": "Default AI response"}';
      const finish: FinishReason = tc.response.finish_reason ?? 'stop';
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: [content],
        finishReason: finish,
      });
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow({
          id: 'contrib-cont-1',
          target_contribution_id: 'parent-contrib-1',
        }),
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        continueJob: continueJobSpy,
        fileManager,
      });
      const jobPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        continueUntilComplete: tc.continueUntilComplete !== false,
      };
      if (!isJson(jobPayload)) {
        throw new Error('test fixture: job payload must be Json');
      }
      const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
        {},
        {
          dbClient,
          jobRowOverrides: {
            payload: jobPayload,
          },
        },
      );
      await executeModelCallAndSave(
        deps,
        params,
        createMockExecuteModelCallAndSavePayload(),
      );
      const expectedCalls: number = tc.shouldContinue ? 1 : 0;
      assertEquals(
        continueJobSpy.calls.length,
        expectedCalls,
        `continueJob should be called ${expectedCalls} time(s)`,
      );
    });
  }
});

Deno.test('executeModelCallAndSave - comprehensive retry triggers', async (t) => {
  type RetryTestCase = {
    name: string;
    response: { content?: string; finish_reason?: FinishReason };
    shouldRetry: boolean;
    expectedUploadCalls: number;
  };
  const testCases: RetryTestCase[] = [
    {
      name: 'incomplete JSON may be repaired by the sanitizer (no parse retry)',
      response: { content: '{"bad json:', finish_reason: 'stop' },
      shouldRetry: false,
      expectedUploadCalls: 1,
    },
    {
      name: 'should trigger retry when finish_reason is "error"',
      response: { finish_reason: 'error' },
      shouldRetry: true,
      expectedUploadCalls: 0,
    },
  ];
  for (const tc of testCases) {
    await t.step(tc.name, async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const retrySpy = spy(async () => ({}));
      const retryJob: RetryJobFn = async (_d, _c, _j, _a, _f, _o) => {
        await retrySpy();
        return {};
      };
      const content: string = tc.response.content ?? '{"content": "Default AI response"}';
      const finish: FinishReason = tc.response.finish_reason ?? 'stop';
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: [content],
        finishReason: finish,
      });
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        retryJob,
        fileManager,
      });
      const continueJobSpy = spy(deps, 'continueJob');
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams({}, { dbClient }),
        createMockExecuteModelCallAndSavePayload(),
      );
      const expectedRetryCalls: number = tc.shouldRetry ? 1 : 0;
      assertEquals(
        retrySpy.calls.length,
        expectedRetryCalls,
        `retryJob should be called ${expectedRetryCalls} time(s)`,
      );
      assertEquals(continueJobSpy.calls.length, 0, 'continueJob should never be called on these paths');
      assertEquals(
        fileManager.uploadAndRegisterFile.calls.length,
        tc.expectedUploadCalls,
        tc.shouldRetry
          ? 'uploadAndRegisterFile should not be called when retrying for provider error'
          : 'uploadAndRegisterFile should run when sanitization yields parseable JSON',
      );
    });
  }
});

Deno.test('executeModelCallAndSave - Fix 3.4: structurally-fixed trigger for continuation', async (t) => {
  const structurallyTruncatedContent: string = '{"executive_summary": "partial content"';
  await t.step(
    'Fix 3.4.i: when wasStructurallyFixed === true and continueUntilComplete === true, shouldContinue is set to true',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: [structurallyTruncatedContent],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        continueUntilComplete: true,
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        1,
        'continueJob should be called when wasStructurallyFixed is true and continueUntilComplete is true',
      );
    },
  );
  await t.step(
    'Fix 3.4.ii: when wasStructurallyFixed === true but continueUntilComplete === false, shouldContinue is NOT overridden',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: [structurallyTruncatedContent],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        continueUntilComplete: false,
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        0,
        'continueJob should NOT be called when continueUntilComplete is false, even with structural fix',
      );
    },
  );
  await t.step(
    'Fix 3.4.iii: when wasStructurallyFixed === false and continueUntilComplete === true, shouldContinue is not changed by structural fix check',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"result": "complete content"}'],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        continueUntilComplete: true,
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        0,
        'continueJob should NOT be called when wasStructurallyFixed is false — only existing continuation logic applies',
      );
    },
  );
});

Deno.test('executeModelCallAndSave - Fix 3.5: missing-keys trigger for continuation', async (t) => {
  const expectedSchema: ContextForDocument = {
    document_key: FileType.business_case,
    content_to_include: {
      executive_summary: '',
      market_analysis: '',
      financial_projections: '',
    },
  };
  await t.step(
    'Fix 3.5.i: when finish_reason is stop, no content flags, but parsed object is missing keys from context_for_documents, shouldContinue is true',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"executive_summary": "We have a great product"}'],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        continueUntilComplete: true,
        context_for_documents: [expectedSchema],
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            output_type: 'business_case',
            sourcePromptResourceId: '',
          },
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        1,
        'continueJob should be called when parsed content is missing keys defined in context_for_documents',
      );
    },
  );
  await t.step(
    'Fix 3.5.ii: when finish_reason is stop, no content flags, and parsed object has all keys from context_for_documents, shouldContinue remains false',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: [
          '{"executive_summary": "Great product", "market_analysis": "Growing market", "financial_projections": "Profitable in Y2"}',
        ],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        continueUntilComplete: true,
        context_for_documents: [expectedSchema],
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            output_type: 'business_case',
            sourcePromptResourceId: '',
          },
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        0,
        'continueJob should NOT be called when all expected keys are present — normal completion',
      );
    },
  );
  await t.step(
    'Fix 3.5.iii: when context_for_documents is not present in job payload, missing-key check is skipped',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"executive_summary": "Great product"}'],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        continueUntilComplete: true,
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        0,
        'continueJob should NOT be called when context_for_documents is absent — missing-key check skipped',
      );
    },
  );
  await t.step(
    'Fix 3.5.iv: when finish_reason is stop and content-level flags ARE present, shouldContinue is already true from flag check',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"continuation_needed": true, "executive_summary": "Partial"}'],
        finishReason: 'stop',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: FileType.business_case,
        continueUntilComplete: true,
        context_for_documents: [expectedSchema],
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      if (!isJson(payload)) {
        throw new Error('test fixture: payload must be Json');
      }
      await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            output_type: 'business_case',
            sourcePromptResourceId: '',
          },
          {
            dbClient,
            jobRowOverrides: { payload },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assertEquals(
        continueJobSpy.calls.length,
        1,
        'continueJob should be called — content-level flag already triggers continuation regardless of missing-key check',
      );
    },
  );
});

const continuationCountInvalidMessage: string =
  'continuation_count is required and must be a number > 0 for continuation chunks';

Deno.test('executeModelCallAndSave - Step 12.b: requires continuation_count for continuation chunks', async (t) => {
  const stageSlug: string = 'thesis';
  const documentKey: FileType = FileType.business_case;

  await t.step(
    '12.b.i: root chunk (no target_contribution_id) has isContinuation: false and turnIndex: undefined',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content":"x"}'],
        finishReason: 'stop',
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
      });
      const rootPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      if (!isJson(rootPayload)) {
        throw new Error('test fixture: root payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: null,
              payload: rootPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected uploadAndRegisterFile');
      const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
      if (!isModelContributionContext(uploadContext)) {
        throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
      }
      assertEquals(uploadContext.pathContext.isContinuation, false);
      assertEquals(uploadContext.pathContext.turnIndex, undefined);
    },
  );

  await t.step(
    '12.b.ii: continuation chunk with continuation_count: 1 has isContinuation: true and turnIndex: 1',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content":"x"}'],
        finishReason: 'stop',
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        target_contribution_id: 'contrib-root-123',
        continuation_count: 1,
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: 'contrib-root-123',
        },
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: 'contrib-root-123',
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected uploadAndRegisterFile');
      const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
      if (!isModelContributionContext(uploadContext)) {
        throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
      }
      assertEquals(uploadContext.pathContext.isContinuation, true);
      assertEquals(uploadContext.pathContext.turnIndex, 1);
    },
  );

  await t.step(
    '12.b.iii: continuation chunk with continuation_count: 2 has isContinuation: true and turnIndex: 2',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content":"x"}'],
        finishReason: 'stop',
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        target_contribution_id: 'contrib-root-123',
        continuation_count: 2,
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: 'contrib-root-123',
        },
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: 'contrib-root-123',
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected uploadAndRegisterFile');
      const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
      if (!isModelContributionContext(uploadContext)) {
        throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
      }
      assertEquals(uploadContext.pathContext.isContinuation, true);
      assertEquals(uploadContext.pathContext.turnIndex, 2);
    },
  );

  await t.step('12.b.iv: continuation chunk with undefined continuation_count returns error', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: documentKey,
      document_key: documentKey,
      stageSlug: stageSlug,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: stageSlug,
      },
      target_contribution_id: 'contrib-root-123',
      continuation_count: undefined,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: 'contrib-root-123',
      },
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const result: unknown = await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        {
          stageSlug,
          output_type: 'business_case',
        },
        {
          dbClient,
          jobRowOverrides: {
            target_contribution_id: 'contrib-root-123',
            payload: continuationPayload,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    assertEquals(result.error.message, continuationCountInvalidMessage);
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
  });

  await t.step('12.b.v: continuation chunk with continuation_count: 0 returns error', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: documentKey,
      document_key: documentKey,
      stageSlug: stageSlug,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: stageSlug,
      },
      target_contribution_id: 'contrib-root-123',
      continuation_count: 0,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: 'contrib-root-123',
      },
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const result: unknown = await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        {
          stageSlug,
          output_type: 'business_case',
        },
        {
          dbClient,
          jobRowOverrides: {
            target_contribution_id: 'contrib-root-123',
            payload: continuationPayload,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    assertEquals(result.error.message, continuationCountInvalidMessage);
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
  });

  await t.step('12.b.vi: continuation chunk with continuation_count: -1 returns error', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: documentKey,
      document_key: documentKey,
      stageSlug: stageSlug,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: stageSlug,
      },
      target_contribution_id: 'contrib-root-123',
      continuation_count: -1,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: 'contrib-root-123',
      },
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const result: unknown = await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        {
          stageSlug,
          output_type: 'business_case',
        },
        {
          dbClient,
          jobRowOverrides: {
            target_contribution_id: 'contrib-root-123',
            payload: continuationPayload,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    assertEquals(result.error.message, continuationCountInvalidMessage);
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
  });

  await t.step('12.b.vii: continuation chunk with non-number continuation_count returns error', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content":"x"}'],
      finishReason: 'stop',
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: documentKey,
      document_key: documentKey,
      stageSlug: stageSlug,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: stageSlug,
      },
      target_contribution_id: 'contrib-root-123',
      continuation_count: 1,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: 'contrib-root-123',
      },
    };
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    Reflect.set(continuationPayload, 'continuation_count', 'invalid');
    const result: unknown = await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(
        {
          stageSlug,
          output_type: 'business_case',
        },
        {
          dbClient,
          jobRowOverrides: {
            target_contribution_id: 'contrib-root-123',
            payload: continuationPayload,
          },
        },
      ),
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    assertEquals(result.error.message, continuationCountInvalidMessage);
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 0);
  });
});

Deno.test('executeModelCallAndSave - Fix 2: continuation_limit_reached handling', async (t) => {
  const stageSlug: string = 'thesis';
  const documentKey: FileType = FileType.business_case;
  const rootId: string = 'root-contrib-abc';

  const expectedSchema: ContextForDocument = {
    document_key: FileType.business_case,
    content_to_include: {
      executive_summary: '',
      market_analysis: '',
      financial_projections: '',
    },
  };

  await t.step(
    'Fix 2.i: when continueResult.reason === continuation_limit_reached, modelProcessingResult.status is continuation_limit_reached',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content": "Partial content from model"}'],
        finishReason: 'max_tokens',
      });
      const continueJobSpy = spy(async () => ({
        enqueued: false,
        reason: 'continuation_limit_reached',
      }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        continueUntilComplete: true,
        continuation_count: 4,
        target_contribution_id: rootId,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: rootId,
        },
        context_for_documents: [expectedSchema],
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: rootId,
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      const historicSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
        'dialectic_generation_jobs',
        'update',
      );
      assertExists(historicSpies, 'Job update spies should exist');
      const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
        const payloadUnknown = args[0];
        return isRecord(payloadUnknown) && typeof payloadUnknown.results === 'string' &&
          payloadUnknown.results.includes('continuation_limit_reached');
      });
      assertExists(
        finalUpdateCallArgs,
        'Final job update should contain modelProcessingResult.status === continuation_limit_reached',
      );
    },
  );

  await t.step(
    'Fix 2.ii: when continueResult.reason === continuation_limit_reached, assembleAndSaveFinalDocument is called with rootIdFromSaved and expectedSchema',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const contributionWithRelationships: DialecticContributionRow = createMockDialecticContributionRow({
        document_relationships: { [stageSlug]: rootId },
      });
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: contributionWithRelationships,
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content": "Partial content from model"}'],
        finishReason: 'max_tokens',
      });
      const continueJobSpy = spy(async () => ({
        enqueued: false,
        reason: 'continuation_limit_reached',
      }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        continueUntilComplete: true,
        continuation_count: 4,
        target_contribution_id: rootId,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: rootId,
        },
        context_for_documents: [expectedSchema],
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: rootId,
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls.length,
        1,
        'assembleAndSaveFinalDocument should be called once when continuation limit reached',
      );
      assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[0], rootId);
      assertEquals(fileManager.assembleAndSaveFinalDocument.calls[0].args[1], expectedSchema);
    },
  );

  await t.step(
    'Fix 2.iii: when continuation_limit_reached but rootIdFromSaved equals contribution.id (single chunk), assembleAndSaveFinalDocument is NOT called',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const singleChunkContribution: DialecticContributionRow = createMockDialecticContributionRow({
        id: 'single-chunk-contrib',
        document_relationships: { [stageSlug]: 'single-chunk-contrib' },
      });
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: singleChunkContribution,
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content": "Partial content"}'],
        finishReason: 'max_tokens',
      });
      const continueJobSpy = spy(async () => ({
        enqueued: false,
        reason: 'continuation_limit_reached',
      }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        continueUntilComplete: true,
        continuation_count: 4,
        target_contribution_id: 'single-chunk-contrib',
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: 'single-chunk-contrib',
        },
        context_for_documents: [expectedSchema],
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: 'single-chunk-contrib',
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
    },
  );

  await t.step(
    'Fix 2.iv: when continueResult.enqueued === true (normal continuation), assembleAndSaveFinalDocument is NOT called and status is needs_continuation',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const contributionWithRelationships: DialecticContributionRow = createMockDialecticContributionRow({
        document_relationships: { [stageSlug]: rootId },
      });
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: contributionWithRelationships,
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content": "Partial content from model"}'],
        finishReason: 'max_tokens',
      });
      const continueJobSpy = spy(async () => ({ enqueued: true }));
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
        continueJob: continueJobSpy,
      });
      const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        continueUntilComplete: true,
        continuation_count: 2,
        target_contribution_id: rootId,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
          [stageSlug]: rootId,
        },
        context_for_documents: [expectedSchema],
      };
      if (!isJson(continuationPayload)) {
        throw new Error('test fixture: continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              target_contribution_id: rootId,
              payload: continuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
      const historicSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
        'dialectic_generation_jobs',
        'update',
      );
      assertExists(historicSpies, 'Job update spies should exist');
      const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
        const payloadUnknown = args[0];
        return isRecord(payloadUnknown) && typeof payloadUnknown.results === 'string' &&
          payloadUnknown.results.includes('needs_continuation');
      });
      assertExists(
        finalUpdateCallArgs,
        'Final job update should contain modelProcessingResult.status === needs_continuation',
      );
    },
  );

  await t.step(
    'Fix 2.v: when continueUntilComplete is false and finish_reason is stop, assembleAndSaveFinalDocument is NOT called and status is completed',
    async () => {
      const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
        undefined,
        {},
      );
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
        outcome: 'success',
        contribution: createMockDialecticContributionRow(),
      });
      const adapter: AiProviderAdapterInstance = adapterWithStream({
        textDeltas: ['{"content": "Complete content"}'],
        finishReason: 'stop',
      });
      const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
        getAiProviderAdapter: () => adapter,
        fileManager,
      });
      const nonContinuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: stageSlug,
        continueUntilComplete: false,
        canonicalPathParams: {
          contributionType: 'thesis',
          stageSlug: stageSlug,
        },
        document_relationships: {
          source_group: '550e8400-e29b-41d4-a716-446655440000',
        },
      };
      if (!isJson(nonContinuationPayload)) {
        throw new Error('test fixture: non-continuation payload must be Json');
      }
      const result: unknown = await executeModelCallAndSave(
        deps,
        createMockExecuteModelCallAndSaveParams(
          {
            stageSlug,
            output_type: 'business_case',
          },
          {
            dbClient,
            jobRowOverrides: {
              payload: nonContinuationPayload,
            },
          },
        ),
        createMockExecuteModelCallAndSavePayload(),
      );
      assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
      assertEquals(fileManager.assembleAndSaveFinalDocument.calls.length, 0);
      const historicSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
        'dialectic_generation_jobs',
        'update',
      );
      assertExists(historicSpies, 'Job update spies should exist');
      const finalUpdateCallArgs = historicSpies.callsArgs.find((args: unknown[]) => {
        const payloadUnknown = args[0];
        return isRecord(payloadUnknown) && typeof payloadUnknown.results === 'string' &&
          payloadUnknown.results.includes('"completed"');
      });
      assertExists(
        finalUpdateCallArgs,
        'Final job update should contain modelProcessingResult.status === completed',
      );
    },
  );
});

Deno.test(
  'executeModelCallAndSave - enforces document_relationships[stageSlug] = contribution.id for JSON-only root chunks',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = DialecticStageSlug.Thesis;
    const invalidStageValue: string = 'some-anchor-id';
    const newContributionId: string = 'new-contribution-id';
    const sourceGroupId: string = 'source-group-anchor-id';
    const headerContextPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      stageSlug: stageSlug,
      document_relationships: {
        source_group: sourceGroupId,
        [stageSlug]: invalidStageValue,
      },
    };
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: newContributionId,
      document_relationships: {
        source_group: sourceGroupId,
        [stageSlug]: invalidStageValue,
      },
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"header": "context data"}'],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    if (!isJson(headerContextPayload)) {
      throw new Error('test fixture: header context payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'header_context',
        stageSlug,
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: headerContextPayload,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
    const updateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
      'dialectic_contributions',
      'update',
    );
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    assertEquals(updateSpies.callCount, 1, 'Should update dialectic_contributions exactly once');
    const updateCalls: unknown[][] = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const firstCallArgs: unknown[] = updateCalls[0];
    const updatePayloadUnknown: unknown = firstCallArgs[0];
    assert(isRecord(updatePayloadUnknown), 'Update payload must be an object');
    const documentRelationshipsUnknown: unknown = updatePayloadUnknown['document_relationships'];
    assert(
      isDocumentRelationships(documentRelationshipsUnknown),
      'Update payload must have document_relationships',
    );
    assert(
      isPlainObject(documentRelationshipsUnknown),
      'document_relationships must be a plain object for indexing',
    );
    const relationshipsRecord: Record<string, unknown> = documentRelationshipsUnknown;
    const stageValueUnknown: unknown = relationshipsRecord[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(
      stageValue,
      newContributionId,
      `document_relationships[${stageSlug}] should equal new-contribution-id (corrected value, not the invalid planner value)`,
    );
    const sourceGroupUnknown: unknown = relationshipsRecord['source_group'];
    assert(typeof sourceGroupUnknown === 'string', 'source_group should be preserved as a string');
    const sourceGroup: string = sourceGroupUnknown;
    assertEquals(sourceGroup, sourceGroupId, 'source_group should be preserved');
  },
);

Deno.test(
  'executeModelCallAndSave - enforces document_relationships[stageSlug] = contribution.id for document root chunks even when planner sets invalid value',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = DialecticStageSlug.Thesis;
    const invalidStageValue: string = 'some-anchor-id';
    const newContributionId: string = 'new-contribution-id';
    const sourceGroupId: string = 'source-group-anchor-id';
    const businessCasePayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: 'business_case',
      stageSlug: stageSlug,
      document_relationships: {
        source_group: sourceGroupId,
        [stageSlug]: invalidStageValue,
      },
    };
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: newContributionId,
      document_relationships: {
        source_group: sourceGroupId,
        [stageSlug]: invalidStageValue,
      },
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Business case content"}'],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    if (!isJson(businessCasePayload)) {
      throw new Error('test fixture: business case payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug,
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: businessCasePayload,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
    const updateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
      'dialectic_contributions',
      'update',
    );
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    assertEquals(updateSpies.callCount, 1, 'Should update dialectic_contributions exactly once');
    const updateCalls: unknown[][] = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const firstCallArgs: unknown[] = updateCalls[0];
    const updatePayloadUnknown: unknown = firstCallArgs[0];
    assert(isRecord(updatePayloadUnknown), 'Update payload must be an object');
    const documentRelationshipsUnknown: unknown = updatePayloadUnknown['document_relationships'];
    assert(
      isDocumentRelationships(documentRelationshipsUnknown),
      'Update payload must have document_relationships',
    );
    assert(
      isPlainObject(documentRelationshipsUnknown),
      'document_relationships must be a plain object for indexing',
    );
    const relationshipsRecord: Record<string, unknown> = documentRelationshipsUnknown;
    const stageValueUnknown: unknown = relationshipsRecord[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(
      stageValue,
      newContributionId,
      `document_relationships[${stageSlug}] should equal new-contribution-id (corrected value, not the invalid planner value ${invalidStageValue})`,
    );
    assert(
      stageValue !== invalidStageValue,
      `document_relationships[${stageSlug}] should NOT equal the invalid planner value`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave - does not overwrite document_relationships[stageSlug] for continuation chunks',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const stageSlug: string = DialecticStageSlug.Thesis;
    const rootContributionId: string = 'root-contribution-id';
    const continuationContributionId: string = 'continuation-contribution-id';
    const targetContributionId: string = rootContributionId;
    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: 'business_case',
      stageSlug: stageSlug,
      target_contribution_id: targetContributionId,
      continuation_count: 1,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: rootContributionId,
      },
    };
    const savedContribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: continuationContributionId,
      target_contribution_id: targetContributionId,
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
        [stageSlug]: rootContributionId,
      },
    });
    const adapter: AiProviderAdapterInstance = adapterWithStream({
      textDeltas: ['{"content": "Continuation content"}'],
      finishReason: 'stop',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: savedContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug,
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          target_contribution_id: targetContributionId,
          payload: continuationPayload,
        },
      },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
    const updateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
      'dialectic_contributions',
      'update',
    );
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    assertEquals(
      updateSpies.callCount,
      1,
      'Should update dialectic_contributions exactly once for continuation chunk',
    );
    const updateCalls: unknown[][] = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const firstCallArgs: unknown[] = updateCalls[0];
    const updatePayloadUnknown: unknown = firstCallArgs[0];
    assert(isRecord(updatePayloadUnknown), 'Update payload must be an object');
    const documentRelationshipsUnknown: unknown = updatePayloadUnknown['document_relationships'];
    assert(
      isDocumentRelationships(documentRelationshipsUnknown),
      'Update payload must have document_relationships',
    );
    assert(
      isPlainObject(documentRelationshipsUnknown),
      'document_relationships must be a plain object for indexing',
    );
    const relationshipsRecord: Record<string, unknown> = documentRelationshipsUnknown;
    const stageValueUnknown: unknown = relationshipsRecord[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(
      stageValue,
      rootContributionId,
      `document_relationships[${stageSlug}] should remain root-contribution-id (not overwritten to continuation's id)`,
    );
    assert(
      stageValue !== continuationContributionId,
      `document_relationships[${stageSlug}] should NOT be overwritten to continuation's contribution id`,
    );
  },
);
