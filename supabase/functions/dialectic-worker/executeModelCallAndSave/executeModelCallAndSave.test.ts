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
} from '../../_shared/types.ts';
import type {
  DialecticContributionRow,
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
import { isJson } from '../../_shared/utils/type_guards.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import type { ModelContributionUploadContext } from '../../_shared/types/file_manager.types.ts';
import { buildUploadContext } from '../../_shared/utils/buildUploadContext/buildUploadContext.ts';
import type { BuildUploadContextParams } from '../../_shared/utils/buildUploadContext/buildUploadContext.interface.ts';
import { resolveFinishReason } from '../../_shared/utils/resolveFinishReason.ts';
import type { RetryJobFn } from '../JobContext.interface.ts';
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
    createMockFileManagerForEmcas,
    createMockSendMessageStreamFromParams,
    testPayloadContinuation,
    testPayloadDocumentArtifact,
} from './executeModelCallAndSave.mock.ts';
import { isExecuteModelCallAndSaveSuccessReturn, isExecuteModelCallAndSaveErrorReturn } from './executeModelCallAndSave.interface.guard.ts';
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
  const documentPayloadUnknown: unknown = JSON.parse(JSON.stringify(testPayloadDocumentArtifact));
  if (!isJson(documentPayloadUnknown)) {
    throw new Error('test fixture: document payload must be Json');
  }
  const documentPayloadJson: Json = documentPayloadUnknown;
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {
      output_type: 'business_case',
      stageSlug: 'thesis',
    },
    {
      jobRowOverrides: {
        payload: documentPayloadJson,
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
  const continuationPayloadUnknown: unknown = JSON.parse(JSON.stringify(testPayloadContinuation));
  if (!isJson(continuationPayloadUnknown)) {
    throw new Error('test fixture: continuation payload must be Json');
  }
  const continuationPayloadJson: Json = continuationPayloadUnknown;
  const params: ExecuteModelCallAndSaveParams = createMockExecuteModelCallAndSaveParams(
    {},
    {
      jobRowOverrides: {
        payload: continuationPayloadJson,
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
