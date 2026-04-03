/**
 * RED tests for slim `executeModelCallAndSave` (deps, params, payload) + adapter streaming.
 * Target implementation: `./executeModelCallAndSave.ts` (must export `executeModelCallAndSave`).
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../../types_db.ts';
import type {
  AdapterStreamChunk,
  AiProviderAdapterInstance,
  ChatApiRequest,
  LogMetadata,
} from '../../_shared/types.ts';
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DocumentRelationships,
  UnifiedAIResponse,
} from '../../dialectic-service/dialectic.interface.ts';
import type {
  DebitTokens,
  DebitTokensDeps,
  DebitTokensPayload,
  DebitTokensParams,
  DebitTokensReturn,
} from '../../_shared/utils/debitTokens.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import { isDocumentRelationships, isJson, isRecord } from '../../_shared/utils/type_guards.ts';
import { DialecticStageSlug, FileType } from '../../_shared/types/file_manager.types.ts';
import type { ModelContributionUploadContext } from '../../_shared/types/file_manager.types.ts';
import { buildUploadContext } from '../../_shared/utils/buildUploadContext/buildUploadContext.ts';
import type { BuildUploadContextParams } from '../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts';
import { resolveFinishReason } from '../../_shared/utils/resolveFinishReason.ts';
import { determineContinuation } from '../../_shared/utils/determineContinuation/determineContinuation.ts';
import type { DetermineContinuationParams } from '../../_shared/utils/determineContinuation/determineContinuation.interface.ts';
import { isModelContributionContext } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import type { RetryJobFn } from '../createJobContext/JobContext.interface.ts';
import { 
  createMockAiProviderAdapterInstance, 
  createMockExecuteModelCallAndSaveDeps, 
  createMockExecuteModelCallAndSaveParams, 
  createMockExecuteModelCallAndSavePayload, 
  createMockChatApiRequest, 
  createMockAiProvidersRow,
  createMockDebitTokensSuccessFn,
  createMockDebitTokensFn,
  createMockDialecticContributionRow,
  createMockDialecticProjectResourcesRow,
  createMockFileManagerForEmcas,
  createMockSendMessageStreamFromParams,
  testPayload,
  testPayloadContinuation,
  testPayloadDocumentArtifact,
} from './executeModelCallAndSave.mock.ts';
import { isExecuteModelCallAndSaveSuccessReturn, isExecuteModelCallAndSaveErrorReturn } from './executeModelCallAndSave.interface.guard.ts';
import { mockNotificationService, resetMockNotificationService } from '../../_shared/utils/notification.service.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSavePayload,
  ExecuteModelCallAndSaveSuccessReturn,
  ExecuteModelCallAndSaveErrorReturn,
} from './executeModelCallAndSave.interface.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

Deno.test('executeModelCallAndSave calls adapter.sendMessageStream with payload.chatApiRequest and params.providerRow.api_identifier', async () => {
  let capturedRequest: ChatApiRequest | undefined;
  let capturedModelId: string | undefined;
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (
      request: ChatApiRequest,
      modelIdentifier: string,
    ): AsyncGenerator<AdapterStreamChunk> {
      capturedRequest = request;
      capturedModelId = modelIdentifier;
      yield { type: 'done', finish_reason: 'stop' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
  });
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams({
    providerRow: createMockAiProvidersRow({
      api_identifier: 'expected-api-id',
    }),
  });
  const payload: ExecuteModelCallAndSavePayload = createMockExecuteModelCallAndSavePayload({
    chatApiRequest: createMockChatApiRequest({ message: 'unique-payload-marker' }),
  });
  await executeModelCallAndSave(deps, params, payload);
  assertExists(capturedRequest);
  assertEquals(capturedRequest.message, 'unique-payload-marker');
  assertEquals(capturedModelId, 'expected-api-id');
});

Deno.test('executeModelCallAndSave accumulates text_delta chunks into content passed to resolveFinishReason', async () => {
  const resolveSpy = spy(resolveFinishReason);
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
      yield { type: 'text_delta', text: 'hel' };
      yield { type: 'text_delta', text: 'lo' };
      yield {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
      yield { type: 'done', finish_reason: 'stop' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    resolveFinishReason: resolveSpy,
  });
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams();
  const payload: ExecuteModelCallAndSavePayload = createMockExecuteModelCallAndSavePayload();
  await executeModelCallAndSave(deps, params, payload);
  assert(resolveSpy.calls.length >= 1, 'resolveFinishReason should be invoked');
  const firstArg: UnifiedAIResponse = resolveSpy.calls[0].args[0];
  assertEquals(firstArg.content, 'hello');
});

Deno.test('executeModelCallAndSave passes usage chunk token counts into debitTokens', async () => {
  const recorded: DebitTokensParams[] = [];
  const debitTokens: DebitTokens = async (
    depsArg: DebitTokensDeps,
    paramsArg: DebitTokensParams,
    payloadArg: DebitTokensPayload,
  ): Promise<DebitTokensReturn> => {
    recorded.push(paramsArg);
    return createMockDebitTokensSuccessFn()(depsArg, paramsArg, payloadArg);
  };
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
      yield { type: 'text_delta', text: '{"debitUsage":true}' };
      yield {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 11,
          completion_tokens: 22,
          total_tokens: 33,
        },
      };
      yield { type: 'done', finish_reason: 'stop' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    debitTokens,
  });
  await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assertEquals(recorded.length >= 1, true);
  const usage = recorded[0].tokenUsage;
  assertExists(usage);
  assertEquals(usage.prompt_tokens, 11);
  assertEquals(usage.completion_tokens, 22);
  assertEquals(usage.total_tokens, 33);
});

Deno.test('executeModelCallAndSave passes done chunk finish_reason into deps.resolveFinishReason', async () => {
  const resolveSpy = spy(resolveFinishReason);
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
      yield { type: 'text_delta', text: 'ok' };
      yield {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      };
      yield { type: 'done', finish_reason: 'length' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    resolveFinishReason: resolveSpy,
  });
  await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(resolveSpy.calls.length >= 1);
  const first: UnifiedAIResponse = resolveSpy.calls[0].args[0];
  assertEquals(first.finish_reason, 'length');
});

Deno.test('executeModelCallAndSave soft-timeout: after 350s wall clock during text_delta, finish_reason becomes length', async () => {
  const resolveSpy = spy(resolveFinishReason);
  let nowCall = 0;
  const nowStub = stub(Date, 'now', () => {
    nowCall += 1;
    if (nowCall === 1) {
      return 0;
    }
    return 400_000;
  });
  try {
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
        yield { type: 'text_delta', text: 'a' };
        yield { type: 'text_delta', text: 'b' };
        yield {
          type: 'usage',
          tokenUsage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };
        yield { type: 'done', finish_reason: 'stop' };
      },
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      resolveFinishReason: resolveSpy,
    });
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(),
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(resolveSpy.calls.length >= 1);
    const first: UnifiedAIResponse = resolveSpy.calls[0].args[0];
    assertEquals(first.finish_reason, 'length');
  } finally {
    nowStub.restore();
  }
});

Deno.test('executeModelCallAndSave returns ExecuteModelCallAndSaveSuccessReturn with contribution, needsContinuation, stageRelationshipForStage, documentKey, fileType, storageFileType', async () => {
  const contribution: DialecticContributionRow = createMockDialecticContributionRow();
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"successShape":1}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    }),
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(
    isExecuteModelCallAndSaveSuccessReturn(result),
    'Expected ExecuteModelCallAndSaveSuccessReturn',
  );
  const typed: ExecuteModelCallAndSaveSuccessReturn = result;
  const _contribution: DialecticContributionRow = typed.contribution;
  const _needsContinuation: boolean = typed.needsContinuation;
  const _stageRelationship: string | undefined = typed.stageRelationshipForStage;
  const _documentKey: string | undefined = typed.documentKey;
  const _fileType: string = typed.fileType;
  const _storageFileType: string = typed.storageFileType;
  assertExists(_contribution.id);
});

Deno.test('executeModelCallAndSave returns ExecuteModelCallAndSaveErrorReturn when adapter sendMessageStream fails', async () => {
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
      throw new Error('adapter stream failure');
      yield { type: 'done', finish_reason: 'error' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(
    isExecuteModelCallAndSaveErrorReturn(result),
    'Expected ExecuteModelCallAndSaveErrorReturn',
  );
  const err: ExecuteModelCallAndSaveErrorReturn = result;
  assertEquals(err.error.message, 'adapter stream failure');
});

Deno.test('executeModelCallAndSave does not insert a RENDER job into dialectic_generation_jobs (enqueue is external)', async () => {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {},
  );
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {},
    { dbClient },
  );
  await executeModelCallAndSave(
    createMockExecuteModelCallAndSaveDeps(),
    params,
    createMockExecuteModelCallAndSavePayload(),
  );
  const insertHistory = mockSetup.spies.getHistoricQueryBuilderSpies(
    'dialectic_generation_jobs',
    'insert',
  );
  const insertCount: number = insertHistory?.callCount ?? 0;
  assertEquals(insertCount, 0);
});

Deno.test('executeModelCallAndSave post-call path: streaming-assembled UnifiedAIResponse is consumed by resolveFinishReason before downstream handling', async () => {
  const resolveSpy = spy(resolveFinishReason);
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
      yield { type: 'text_delta', text: '{"a":1}' };
      yield {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 5,
          completion_tokens: 5,
          total_tokens: 10,
        },
      };
      yield { type: 'done', finish_reason: 'stop' };
    },
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    resolveFinishReason: resolveSpy,
  });
  await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(resolveSpy.calls.length >= 1);
  const assembled: UnifiedAIResponse = resolveSpy.calls[0].args[0];
  assertEquals(assembled.content, '{"a":1}');
  assertExists(assembled.tokenUsage);
  assertEquals(assembled.tokenUsage.total_tokens, 10);
});

Deno.test('executeModelCallAndSave returns ExecuteModelCallAndSaveErrorReturn when debitTokens fails', async () => {
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"x":1}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    }),
    debitTokens: createMockDebitTokensFn({
      kind: 'failure',
      message: 'debit failed',
      retriable: false,
    }),
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
  const err: ExecuteModelCallAndSaveErrorReturn = result;
  assertEquals(err.error.message, 'debit failed');
  assertEquals(err.retriable, false);
});

Deno.test('executeModelCallAndSave returns ExecuteModelCallAndSaveErrorReturn when fileManager upload fails', async () => {
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"x":1}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager: createMockFileManagerForEmcas({
      outcome: 'failure',
      message: 'upload failed',
    }),
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
  const err: ExecuteModelCallAndSaveErrorReturn = result;
  assertEquals(err.error.message.includes('upload failed'), true);
});

Deno.test('executeModelCallAndSave debits with synthetic TokenUsage when stream omits usage chunk using preflightInputTokens', async () => {
  const recorded: DebitTokensParams[] = [];
  const completionJson: string = '{"msg":"hello world"}';
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [completionJson],
      tokenUsage: null,
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    debitTokens: createMockDebitTokensFn({ kind: 'recording', sink: recorded }),
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow(),
    }),
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload({ preflightInputTokens: 200 }),
  );
  assert(
    !isExecuteModelCallAndSaveErrorReturn(result),
    'With preflightInputTokens, missing usage should not cause error',
  );
  assertEquals(recorded.length >= 1, true);
  const usage = recorded[0].tokenUsage;
  assertExists(usage);
  assertEquals(usage.prompt_tokens, 200);
  assertEquals(usage.completion_tokens, completionJson.length);
  assertEquals(usage.total_tokens, 200 + completionJson.length);
});

Deno.test('executeModelCallAndSave invokes retryJob when assembled content is empty after stream', async () => {
  const retrySpy = spy(async () => ({}));
  const retryJob: RetryJobFn = async (_depsArg, _dbClient, _job, _currentAttempt, _failed, _owner) => {
    return await retrySpy();
  };
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    retryJob,
  });
  const result: unknown = await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assertEquals(retrySpy.calls.length >= 1, true);
  assert(
    isExecuteModelCallAndSaveErrorReturn(result) === true ||
      isExecuteModelCallAndSaveSuccessReturn(result) === true,
    'Expected structured return after empty response handling',
  );
});

Deno.test('executeModelCallAndSave invokes buildUploadContext before fileManager.uploadAndRegisterFile', async () => {
  const buildSpy = spy(buildUploadContext);
  const buildUploadContextSpied: ExecuteModelCallAndSaveDeps['buildUploadContext'] = (
    params: BuildUploadContextParams,
  ): ModelContributionUploadContext => {
    return buildSpy(params);
  };
  const contribution: DialecticContributionRow = createMockDialecticContributionRow();
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"k":1}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    buildUploadContext: buildUploadContextSpied,
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    }),
  });
  await executeModelCallAndSave(
    deps,
    createMockExecuteModelCallAndSaveParams(),
    createMockExecuteModelCallAndSavePayload(),
  );
  assertEquals(buildSpy.calls.length >= 1, true);
});

Deno.test('executeModelCallAndSave success return exposes fileType storageFileType documentKey stageRelationshipForStage for render enqueue', async () => {
  const contribution: DialecticContributionRow = createMockDialecticContributionRow({
    document_relationships: {
      thesis: 'contrib-test-1',
      source_group: '00000000-0000-4000-8000-000000000002',
    },
  });
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"doc":true}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    }),
  });
  if (!isJson(testPayloadDocumentArtifact)) {
    throw new Error('test fixture: testPayloadDocumentArtifact must be Json');
  }
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {
      output_type: 'business_case',
      stageSlug: 'thesis',
    },
    {
      jobRowOverrides: {
        payload: testPayloadDocumentArtifact,
      },
    },
  );
  const result: unknown = await executeModelCallAndSave(
    deps,
    params,
    createMockExecuteModelCallAndSavePayload(),
  );
  assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
  const success: ExecuteModelCallAndSaveSuccessReturn = result;
  assertEquals(success.fileType, 'business_case');
  assertEquals(success.documentKey, 'business_case');
  assertEquals(success.storageFileType, FileType.ModelContributionRawJson);
  assertEquals(success.stageRelationshipForStage, 'contrib-test-1');
  assertEquals(success.needsContinuation, false);
});

Deno.test('executeModelCallAndSave invokes continueJob when continuation is required', async () => {
  const continueSpy = spy(async () => ({ enqueued: true }));
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"c":1}'],
      finishReason: 'length',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    continueJob: continueSpy,
    determineContinuation: () => ({ shouldContinue: true }),
    fileManager: createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: createMockDialecticContributionRow({
        id: 'contrib-cont-1',
        target_contribution_id: 'parent-contrib-1',
      }),
    }),
  });
  if (!isJson(testPayloadContinuation)) {
    throw new Error('test fixture: testPayloadContinuation must be Json');
  }
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {},
    {
      jobRowOverrides: {
        payload: testPayloadContinuation,
        target_contribution_id: 'parent-contrib-1',
      },
    },
  );
  const result: unknown = await executeModelCallAndSave(deps, params, createMockExecuteModelCallAndSavePayload());
  assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');
  const success: ExecuteModelCallAndSaveSuccessReturn = result;
  assertEquals(success.needsContinuation, true);
  assertEquals(continueSpy.calls.length >= 1, true);
});

Deno.test('executeModelCallAndSave - Happy Path', async (t) => {
  await t.step('should run to completion successfully', async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"hello":true}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      { dbClient },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );

    const historicSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
      'dialectic_generation_jobs',
      'update',
    );
    assertExists(historicSpies, 'Job update spies should exist');
    assertEquals(historicSpies.callCount, 1, 'Job update should be called once');

    const [updatePayload] = historicSpies.callsArgs[0];
    assert(
      isRecord(updatePayload) && 'status' in updatePayload,
      'Update payload should have a status property',
    );
  });
});

Deno.test('executeModelCallAndSave - Intermediate Flag', async (t) => {
  await t.step('should pass isIntermediate flag to fileManager', async () => {
    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const intermediatePayload: DialecticExecuteJobPayload = { ...testPayload, isIntermediate: true };
    if (!isJson(intermediatePayload)) {
      throw new Error('test fixture: intermediate payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        jobRowOverrides: {
          payload: intermediatePayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );

    const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContext)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContext.contributionMetadata.isIntermediate,
      true,
      'isIntermediate flag was not passed correctly to the file manager',
    );
  });
});

Deno.test('executeModelCallAndSave - Final Artifact Flag', async (t) => {
  const contribution: DialecticContributionRow = createMockDialecticContributionRow();
  const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
    outcome: 'success',
    contribution,
  });
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager,
  });

  await t.step('should pass isIntermediate: false to fileManager when explicitly set', async () => {
    const finalPayload: DialecticExecuteJobPayload = { ...testPayload, isIntermediate: false };
    if (!isJson(finalPayload)) {
      throw new Error('test fixture: final payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        jobRowOverrides: {
          payload: finalPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadContext: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContext)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContext.contributionMetadata.isIntermediate,
      false,
      'isIntermediate flag should be false',
    );
  });

  await t.step('should default isIntermediate to false if not present on payload', async () => {
    const undefinedPayload: DialecticExecuteJobPayload = { ...testPayload };
    if (!isJson(undefinedPayload)) {
      throw new Error('test fixture: undefined payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        jobRowOverrides: {
          payload: undefinedPayload,
        },
      },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 1,
      'Expected fileManager.uploadAndRegisterFile to be called a second time',
    );
    const uploadContextSecond: unknown = fileManager.uploadAndRegisterFile.calls[1].args[0];
    if (!isModelContributionContext(uploadContextSecond)) {
      throw new Error('Test setup error: uploadContext was not of type ModelContributionUploadContext');
    }
    assertEquals(
      uploadContextSecond.contributionMetadata.isIntermediate,
      false,
      'isIntermediate flag should default to false',
    );
  });
});

Deno.test('executeModelCallAndSave - Throws on AI Error', async (t) => {
  await t.step('should trigger a retry if the model returns an error', async () => {
    const retrySpy = spy(async () => ({}));
    const retryJob: RetryJobFn = async (
      _depsArg,
      _dbClient,
      _job,
      _currentAttempt,
      _failed,
      _owner,
    ) => {
      return await retrySpy();
    };
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: [],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      retryJob,
    });
    await executeModelCallAndSave(
      deps,
      createMockExecuteModelCallAndSaveParams(),
      createMockExecuteModelCallAndSavePayload(),
    );
    assertEquals(retrySpy.calls.length, 1, 'Expected retryJob to be called on AI error.');
  });
});

Deno.test('executeModelCallAndSave - Database Error on Update', async (t) => {
  await t.step('should log an error if the final job update fails', async () => {
    const updateError: Error = new Error('DB Update Failed');
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {
        genericMockResults: {
          dialectic_generation_jobs: {
            update: { data: null, error: updateError },
          },
        },
      },
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content": "valid json"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution,
      }),
    });
    let criticalErrorLogged: boolean = false;
    const originalErrorLogger: ExecuteModelCallAndSaveDeps['logger']['error'] = deps.logger.error.bind(
      deps.logger,
    );
    deps.logger.error = (message: string | Error, metadata?: LogMetadata) => {
      if (typeof message === 'string' && message.includes('CRITICAL')) {
        criticalErrorLogged = true;
      } else if (message instanceof Error && message.message.includes('CRITICAL')) {
        criticalErrorLogged = true;
      }
      originalErrorLogger(message, metadata);
    };
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      { dbClient },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(criticalErrorLogged, 'Expected a critical error log for failing to update the job status.');
    deps.logger.error = originalErrorLogger;
  });
});

Deno.test(
  'executeModelCallAndSave - source_group validation is planner-aware: consolidation jobs (per_model) allow source_group = null',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {
        genericMockResults: {
          dialectic_stage_recipe_steps: {
            select: { data: [], error: null },
          },
          dialectic_recipe_template_steps: {
            select: {
              data: [{ granularity_strategy: 'per_model' }],
              error: null,
            },
          },
          dialectic_contributions: {
            update: { data: null, error: null },
          },
          dialectic_generation_jobs: {
            update: { data: null, error: null },
          },
        },
      },
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

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

    const contribution: DialecticContributionRow = createMockDialecticContributionRow({
      id: 'consolidation-contrib-1',
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content": "consolidation document"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    if (!isJson(consolidationPayload)) {
      throw new Error('test fixture: consolidation payload must be Json');
    }
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: FileType.AssembledDocumentJson,
        stageSlug: 'synthesis',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: consolidationPayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success when per_model recipe step allows null source_group',
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'FileManager.uploadAndRegisterFile should be called',
    );

    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
    }
    const uploadContext: ModelContributionUploadContext = uploadContextUnknown;
    assertExists(uploadContext.contributionMetadata, 'Contribution metadata should exist');

    const docRelationshipsUnknown: unknown = uploadContext.contributionMetadata.document_relationships;
    if (!isDocumentRelationships(docRelationshipsUnknown)) {
      throw new Error('document_relationships should be a valid DocumentRelationships object');
    }
    const docRelationships: DocumentRelationships = docRelationshipsUnknown;
    assertEquals(
      docRelationships.source_group,
      null,
      'source_group should be null for consolidation jobs with per_model granularity strategy',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - Document Relationships - should pass document_relationships to the fileManager',
  async () => {
    const documentRelationships: DocumentRelationships = {
      source_group: 'thesis-1',
      thesis: 'thesis-1',
      antithesis: 'antithesis-A',
    };
    const relationshipsPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.PairwiseSynthesisChunk,
      document_relationships: documentRelationships,
    };
    if (!isJson(relationshipsPayload)) {
      throw new Error('test fixture: relationships payload must be Json');
    }

    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content":"ok"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: FileType.PairwiseSynthesisChunk,
      },
      {
        jobRowOverrides: {
          payload: relationshipsPayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );

    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
    }
    const uploadContext: ModelContributionUploadContext = uploadContextUnknown;
    assertExists(uploadContext.contributionMetadata, 'Contribution metadata should exist');

    assertEquals(
      uploadContext.contributionMetadata.document_relationships,
      documentRelationships,
      'document_relationships object was not passed correctly to the file manager',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - Document Relationships - should default document_relationships to null if not provided',
  async () => {
    const basePayload: DialecticExecuteJobPayload = { ...testPayload };
    if (!isJson(basePayload)) {
      throw new Error('test fixture: base payload must be Json');
    }

    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content":"ok"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        jobRowOverrides: {
          payload: basePayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );

    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
    }
    const uploadContext: ModelContributionUploadContext = uploadContextUnknown;
    assertExists(uploadContext.contributionMetadata, 'Contribution metadata should exist');

    assertEquals(
      uploadContext.contributionMetadata.document_relationships,
      null,
      'document_relationships should default to null',
    );
  },
);

Deno.test(
  'executeModelCallAndSave - emits execute_chunk_completed when finish_reason is stop (final chunk; execute_completed is emitted by processSimpleJob)',
  async () => {
    resetMockNotificationService();

    const documentPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: 'business_case',
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };
    if (!isJson(documentPayload)) {
      throw new Error('test fixture: document payload must be Json');
    }

    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"ok": true}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution,
      }),
      notificationService: mockNotificationService,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug: 'thesis',
      },
      {
        jobRowOverrides: {
          payload: documentPayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');

    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      1,
      'Expected an execute_chunk_completed event emission for final chunk',
    );
    const firstCallArgs: unknown[] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
    const payloadArg: unknown = firstCallArgs[0];
    const targetUserId: unknown = firstCallArgs[1];
    assert(isRecord(payloadArg));
    assertEquals(payloadArg.type, 'execute_chunk_completed');
    assertEquals(payloadArg.sessionId, documentPayload.sessionId);
    assertEquals(payloadArg.stageSlug, documentPayload.stageSlug);
    assertEquals(payloadArg.job_id, 'job-id-123');
    assertEquals(payloadArg.document_key, documentPayload.document_key);
    assertEquals(payloadArg.modelId, documentPayload.model_id);
    assertEquals(payloadArg.iterationNumber, documentPayload.iterationNumber);
    assertEquals(targetUserId, 'user-789');
  },
);

Deno.test(
  'executeModelCallAndSave - emits document_chunk_completed for continuation chunks',
  async () => {
    resetMockNotificationService();

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
    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }

    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"ok": true}'],
        finishReason: 'length',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager: createMockFileManagerForEmcas({
        outcome: 'success',
        contribution,
      }),
      notificationService: mockNotificationService,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug: 'thesis',
      },
      {
        jobRowOverrides: {
          payload: continuationPayload,
          target_contribution_id: 'root-123',
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success return');

    assertEquals(
      mockNotificationService.sendJobNotificationEvent.calls.length,
      1,
      'Expected an execute_chunk_completed event emission',
    );
    const contCallArgs: unknown[] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
    const contPayloadArg: unknown = contCallArgs[0];
    const contTargetUserId: unknown = contCallArgs[1];
    assert(isRecord(contPayloadArg));
    assertEquals(contPayloadArg.type, 'execute_chunk_completed');
    assertEquals(contPayloadArg.sessionId, continuationPayload.sessionId);
    assertEquals(contPayloadArg.stageSlug, continuationPayload.stageSlug);
    assertEquals(contPayloadArg.job_id, 'job-id-123');
    assertEquals(contPayloadArg.document_key, continuationPayload.document_key);
    assertEquals(contPayloadArg.modelId, continuationPayload.model_id);
    assertEquals(contPayloadArg.iterationNumber, continuationPayload.iterationNumber);
    assertEquals(contTargetUserId, 'user-789');
  },
);

Deno.test(
  'executeModelCallAndSave - should correctly pass source_prompt_resource_id to fileManager',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const sourcePromptResourceId: string = 'resource-id-for-prompt-123';
    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"ok":true}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        sourcePromptResourceId,
      },
      { dbClient },
    );
    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadContextUnknown: unknown = fileManager.uploadAndRegisterFile.calls[0].args[0];
    if (!isModelContributionContext(uploadContextUnknown)) {
      throw new Error('Test setup error: uploadContext was not ModelContributionUploadContext');
    }
    const uploadContext: ModelContributionUploadContext = uploadContextUnknown;
    assertExists(uploadContext.contributionMetadata, 'Contribution metadata should exist');
    assertEquals(
      uploadContext.contributionMetadata.source_prompt_resource_id,
      sourcePromptResourceId,
      'source_prompt_resource_id was not passed correctly to the file manager',
    );
  },
);

Deno.test('executeModelCallAndSave - updates source_contribution_id on originating prompt', async () => {
  const sourcePromptResourceId: string = 'prompt-id-123';

  const mockPromptResource = createMockDialecticProjectResourcesRow({
    id: sourcePromptResourceId,
  });

  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {
      genericMockResults: {
        dialectic_project_resources: {
          update: {
            data: [mockPromptResource],
            error: null,
            count: 1,
            status: 200,
            statusText: 'OK',
          },
        },
      },
    },
  );
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

  const contribution: DialecticContributionRow = createMockDialecticContributionRow();
  const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
    outcome: 'success',
    contribution,
  });
  const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: ['{"ok":true}'],
      finishReason: 'stop',
    }),
  });
  const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
    getAiProviderAdapter: () => adapter,
    fileManager,
  });

  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {
      sourcePromptResourceId,
    },
    { dbClient },
  );

  await executeModelCallAndSave(
    deps,
    params,
    createMockExecuteModelCallAndSavePayload(),
  );

  const updateSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
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

  const updatePayloadUnknown: unknown = updateSpies.callsArgs[0]?.[0];
  assert(
    isRecord(updatePayloadUnknown),
    'Update payload for prompt resource must be an object',
  );
  const updatePayload: Record<string, unknown> = updatePayloadUnknown;
  assertEquals(
    updatePayload['source_contribution_id'],
    contribution.id,
    'source_contribution_id should match the saved contribution id',
  );

  const eqSpies = mockSetup.spies.getHistoricQueryBuilderSpies(
    'dialectic_project_resources',
    'eq',
  );
  assertExists(eqSpies, 'Expected eq filters when targeting the prompt resource');
  assertEquals(
    eqSpies.callCount,
    1,
    'Expected a single eq filter for the prompt resource update',
  );
  const eqArgs: unknown[] | undefined = eqSpies.callsArgs[0];
  assertEquals(eqArgs?.[0], 'id', 'Prompt resource update must filter by id');
  assertEquals(
    eqArgs?.[1],
    sourcePromptResourceId,
    'Prompt resource update must target the originating prompt id',
  );
});

Deno.test(
  'when the model produces incomplete JSON, sanitizeJsonContent may repair it so the artifact is saved without retry or continuation',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const contribution: DialecticContributionRow = createMockDialecticContributionRow();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });

    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: async function* (): AsyncGenerator<AdapterStreamChunk> {
        yield { type: 'text_delta', text: '{"key": "value", "incomplete' };
        yield {
          type: 'usage',
          tokenUsage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        };
        yield { type: 'done', finish_reason: 'stop' };
      },
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    const continueJobSpy = spy(deps, 'continueJob');
    const retryJobSpy = spy(deps, 'retryJob');

    if (!isJson(testPayload)) {
      throw new Error('test fixture: test payload must be Json');
    }

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {},
      {
        dbClient,
        jobRowOverrides: {
          payload: testPayload,
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
      'Should save the repaired artifact.',
    );
    assertEquals(
      continueJobSpy.calls.length,
      0,
      'Should NOT call continueJob when continueUntilComplete is false.',
    );
    assertEquals(
      retryJobSpy.calls.length,
      0,
      'Should NOT retry when sanitization yields parseable JSON.',
    );
  },
);

Deno.test('executeModelCallAndSave: sanitizeJsonContent wiring on accumulated content, post-sanitize orchestration, cross-output persistence, halt without retry/continue',
  async (t) => {
    const innerJson: string = '{"emcas_sanitize_wiring":true,"crossTypeMarker":1}';
    const wrappedModelText: string = '```json\n' + innerJson + '\n```';

    await t.step('HeaderContext: fileContent matches JSON after wrapper strip (sanitizer applied to stream-assembled content); determineContinuation receives parsed payload; halt',
      async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
          undefined,
          {},
        );
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
          Database
        >;

        const contribution: DialecticContributionRow = createMockDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
          outcome: 'success',
          contribution,
        });

        const determineContinuationSpy = spy(determineContinuation);
        const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
          sendMessageStream: createMockSendMessageStreamFromParams({
            textDeltas: [wrappedModelText],
            finishReason: 'stop',
          }),
        });

        const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
          getAiProviderAdapter: () => adapter,
          fileManager,
          determineContinuation: determineContinuationSpy,
        });

        const continueJobSpy = spy(deps, 'continueJob');
        const retryJobSpy = spy(deps, 'retryJob');

        if (!isJson(testPayload)) {
          throw new Error('test fixture: test payload must be Json');
        }

        const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: {
              payload: testPayload,
            },
          },
        );

        const result: Awaited<ReturnType<typeof executeModelCallAndSave>> =
          await executeModelCallAndSave(
            deps,
            params,
            createMockExecuteModelCallAndSavePayload(),
          );

        assert(
          isExecuteModelCallAndSaveSuccessReturn(result),
          'Expected success after sanitization and save',
        );
        assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall);
        assert(
          isModelContributionContext(uploadCall.args[0]),
          'upload context must be ModelContributionUploadContext',
        );
        assertEquals(uploadCall.args[0].fileContent, innerJson);

        assertEquals(retryJobSpy.calls.length, 0);
        assertEquals(continueJobSpy.calls.length, 0);
        assertEquals(determineContinuationSpy.calls.length, 1);
        const dcParams: DetermineContinuationParams = determineContinuationSpy.calls[0].args[0];
        assert(isRecord(dcParams.parsedContent));
        const parsed: Record<string, unknown> = dcParams.parsedContent;
        assertEquals(parsed['emcas_sanitize_wiring'], true);
        assertEquals(parsed['crossTypeMarker'], 1);
        assertEquals(dcParams.wasStructurallyFixed, false);
      },
    );

    await t.step('document-key output: same wrapped model text persists inner JSON; raw upload uses ModelContributionRawJson',
      async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
          undefined,
          {},
        );
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
          Database
        >;

        const contributionRow: DialecticContributionRow = createMockDialecticContributionRow({
          id: 'contrib-doc-key-1',
          file_name: 'mock-ai-v1_0_business_case_raw.json',
          mime_type: 'application/json',
          raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
          storage_path: 'raw_responses',
        });
        const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
          outcome: 'success',
          contribution: contributionRow,
        });

        const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
          sendMessageStream: createMockSendMessageStreamFromParams({
            textDeltas: [wrappedModelText],
            finishReason: 'stop',
          }),
        });

        const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
          getAiProviderAdapter: () => adapter,
          fileManager,
        });

        const retryJobSpy = spy(deps, 'retryJob');
        const continueJobSpy = spy(deps, 'continueJob');

        if (!isJson(testPayloadDocumentArtifact)) {
          throw new Error('test fixture: testPayloadDocumentArtifact must be Json');
        }

        const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
          {
            output_type: 'business_case',
            sourcePromptResourceId: '',
          },
          {
            dbClient,
            jobRowOverrides: {
              job_type: 'EXECUTE',
              payload: testPayloadDocumentArtifact,
            },
          },
        );

        await executeModelCallAndSave(
          deps,
          params,
          createMockExecuteModelCallAndSavePayload(),
        );

        assertEquals(retryJobSpy.calls.length, 0);
        assertEquals(continueJobSpy.calls.length, 0);
        assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);
        const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
        assertExists(uploadCall);
        const ctx = uploadCall.args[0];
        assert(isModelContributionContext(ctx));
        assertEquals(ctx.fileContent, innerJson);
        assertEquals(ctx.pathContext.fileType, FileType.ModelContributionRawJson);
      },
    );

    await t.step('post-sanitize: structural repair surfaces wasStructurallyFixed to determineContinuation; no retry',
      async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
          undefined,
          {},
        );
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<
          Database
        >;

        const contribution: DialecticContributionRow = createMockDialecticContributionRow();
        const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
          outcome: 'success',
          contribution,
        });

        const brokenJson: string = '{"emcas_structural":1';
        const determineContinuationSpy = spy(determineContinuation);

        const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
          sendMessageStream: createMockSendMessageStreamFromParams({
            textDeltas: [brokenJson],
            finishReason: 'stop',
          }),
        });

        const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
          getAiProviderAdapter: () => adapter,
          fileManager,
          determineContinuation: determineContinuationSpy,
        });

        const retryJobSpy = spy(deps, 'retryJob');

        if (!isJson(testPayload)) {
          throw new Error('test fixture: test payload must be Json');
        }

        const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
          {},
          {
            dbClient,
            jobRowOverrides: {
              payload: testPayload,
            },
          },
        );

        await executeModelCallAndSave(
          deps,
          params,
          createMockExecuteModelCallAndSavePayload(),
        );

        assertEquals(retryJobSpy.calls.length, 0);
        assertEquals(determineContinuationSpy.calls.length, 1);
        const dcParamsStructural: DetermineContinuationParams =
          determineContinuationSpy.calls[0].args[0];
        assertEquals(dcParamsStructural.wasStructurallyFixed, true);
        assert(isRecord(dcParamsStructural.parsedContent));
        const parsedStructural: Record<string, unknown> = dcParamsStructural.parsedContent;
        assertEquals(parsedStructural['emcas_structural'], 1);
      },
    );
  },
);

Deno.test(
  'intermediate continuation chunk with invalid JSON fragment skips sanitize/parse so retryJob is not called',
  async () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {},
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const documentRelationships: DocumentRelationships = {
      [DialecticStageSlug.Thesis]: 'doc-root-xyz',
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    };
    const contribution: DialecticContributionRow = createMockDialecticContributionRow({
      document_relationships: documentRelationships,
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });

    const invalidJsonFragment: string = '{"content": "incomplete';
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: [invalidJsonFragment],
        finishReason: 'length',
      }),
    });

    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });
    const retryJobSpy = spy(deps, 'retryJob');

    const continuationPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: 'business_case',
      target_contribution_id: 'contrib-root-123',
      continueUntilComplete: true,
      continuation_count: 1,
      stageSlug: DialecticStageSlug.Thesis,
      document_relationships: documentRelationships,
    };

    if (!isJson(continuationPayload)) {
      throw new Error('test fixture: continuation payload must be Json');
    }

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug: 'thesis',
      },
      {
        dbClient,
        jobRowOverrides: {
          payload: continuationPayload,
          target_contribution_id: 'contrib-root-123',
        },
      },
    );

    await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assertEquals(
      retryJobSpy.calls.length,
      0,
      'Target: intermediate chunk must skip sanitize/parse so invalid JSON fragment must not trigger retry',
    );
  },
);

Deno.test(
  'document_relationships init: returns error when dialectic_contributions update fails (saved contribution has null document_relationships)',
  async () => {
    const markdownPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      projectId: 'project-abc',
      sessionId: 'session-456',
      stageSlug: DialecticStageSlug.Thesis,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: DialecticStageSlug.Thesis,
      },
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };

    if (!isJson(markdownPayload)) {
      throw new Error('test fixture: markdown payload must be Json');
    }
    const updateError: Error = new Error('Database update failed');
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {
        genericMockResults: {
          dialectic_contributions: {
            update: { data: null, error: updateError },
          },
        },
      },
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const contribution: DialecticContributionRow = createMockDialecticContributionRow({
      document_relationships: null,
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content": "AI response"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug: 'thesis',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          job_type: 'EXECUTE',
          payload: markdownPayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes(
        'document_relationships[thesis] is required and must be persisted before RENDER job creation',
      ),
      `Unexpected message: ${errReturn.error.message}`,
    );
    assert(
      errReturn.error.message.includes(`Contribution ID: ${contribution.id}`),
      `Expected contribution id in message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'document_relationships init: returns error when dialectic_contributions update fails (saved contribution missing stage key)',
  async () => {
    const markdownPayload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.business_case,
      document_key: FileType.business_case,
      projectId: 'project-abc',
      sessionId: 'session-456',
      stageSlug: DialecticStageSlug.Thesis,
      canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: DialecticStageSlug.Thesis,
      },
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };

    if (!isJson(markdownPayload)) {
      throw new Error('test fixture: markdown payload must be Json');
    }
    const updateError: Error = new Error('Database update failed');
    const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
      undefined,
      {
        genericMockResults: {
          dialectic_contributions: {
            update: { data: null, error: updateError },
          },
        },
      },
    );
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const documentRelationships: DocumentRelationships = {
      source_group: 'group-123',
    };
    const contribution: DialecticContributionRow = createMockDialecticContributionRow({
      document_relationships: documentRelationships,
    });
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution,
    });
    const adapter: AiProviderAdapterInstance = createMockAiProviderAdapterInstance({
      sendMessageStream: createMockSendMessageStreamFromParams({
        textDeltas: ['{"content": "AI response"}'],
        finishReason: 'stop',
      }),
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapter,
      fileManager,
    });

    const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
      {
        output_type: 'business_case',
        stageSlug: 'thesis',
        sourcePromptResourceId: '',
      },
      {
        dbClient,
        jobRowOverrides: {
          job_type: 'EXECUTE',
          payload: markdownPayload,
        },
      },
    );

    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload(),
    );

    assert(isExecuteModelCallAndSaveErrorReturn(result), 'Expected error return');
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes(
        'document_relationships[thesis] is required and must be persisted before RENDER job creation',
      ),
      `Unexpected message: ${errReturn.error.message}`,
    );
    assert(
      errReturn.error.message.includes(`Contribution ID: ${contribution.id}`),
      `Expected contribution id in message: ${errReturn.error.message}`,
    );
  },
);
