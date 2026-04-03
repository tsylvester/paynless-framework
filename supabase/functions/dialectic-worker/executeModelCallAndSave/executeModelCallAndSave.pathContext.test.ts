/**
 * pathContext construction, validation, notifications with document_key,
 * HeaderContext / AssembledDocumentJson behavior
 */
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { AiProviderAdapterInstance } from '../../_shared/types.ts';
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DocumentRelationships,
} from '../../dialectic-service/dialectic.interface.ts';
import { createMockSupabaseClient } from '../../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../../_shared/services/file_manager.mock.ts';
import {
  mockNotificationService,
  resetMockNotificationService,
} from '../../_shared/utils/notification.service.mock.ts';
import { isJson, isRecord } from '../../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import {
  createMockAiProviderAdapterInstance,
  createMockDialecticSessionRow,
  createMockExecuteModelCallAndSaveDeps,
  createMockExecuteModelCallAndSaveParams,
  createMockExecuteModelCallAndSavePayload,
  createMockChatApiRequest,
  createMockDialecticContributionRow,
  createMockAiProvidersRow,
  createMockFileManagerForEmcas,
  createMockSendMessageStreamFromParams,
  mockSessionRow,
  testPayload,
  testPayloadDocumentArtifact,
  type DialecticJobRowOverrides,
} from './executeModelCallAndSave.mock.ts';
import type {
  ExecuteModelCallAndSaveDeps,
  ExecuteModelCallAndSaveParams,
  ExecuteModelCallAndSaveErrorReturn,
} from './executeModelCallAndSave.interface.ts';
import {
  isExecuteModelCallAndSaveErrorReturn,
  isExecuteModelCallAndSaveSuccessReturn,
} from './executeModelCallAndSave.interface.guard.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';

const stopDocumentJson: string = '{"content": "AI response content"}';
const headerContextAiJson: string =
  '{"header_context_artifact": {"type": "header_context", "document_key": "header_context", "artifact_class": "header_context", "file_type": "json"}, "context_for_documents": []}';

const pathContextMockContribution: DialecticContributionRow = createMockDialecticContributionRow({
  id: 'contrib-123',
  session_id: mockSessionRow.id,
  contribution_type: 'model_contribution_main',
  file_name: 'test.txt',
  mime_type: 'text/plain',
  model_name: 'Mock AI',
  tokens_used_input: 10,
  tokens_used_output: 20,
  processing_time_ms: 100,
  document_relationships: null,
});

function pathContextDbClient(): SupabaseClient<Database> {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> = createMockSupabaseClient(
    undefined,
    {},
  );
  return mockSetup.client as unknown as SupabaseClient<Database>;
}

function adapterStopWithText(text: string): AiProviderAdapterInstance {
  return createMockAiProviderAdapterInstance({
    sendMessageStream: createMockSendMessageStreamFromParams({
      textDeltas: [text],
      finishReason: 'stop',
    }),
  });
}

function buildPathContextParams(
  dbClient: SupabaseClient<Database>,
  payload: DialecticExecuteJobPayload,
  paramsPatch: Partial<ExecuteModelCallAndSaveParams> = {},
  jobRowOverrides: DialecticJobRowOverrides = {},
): ExecuteModelCallAndSaveParams {
  if (!isJson(payload)) {
    throw new Error('pathContext tests: job payload must be Json');
  }
  return createMockExecuteModelCallAndSaveParams(
    {
      dbClient,
      projectId: payload.projectId,
      sessionId: payload.sessionId,
      iterationNumber: payload.iterationNumber,
      stageSlug: payload.stageSlug,
      walletId: payload.walletId,
      model_id: payload.model_id,
      userAuthToken: payload.user_jwt,
      output_type: String(payload.output_type),
      sourcePromptResourceId: '',
      providerRow: createMockAiProvidersRow(),
      sessionData: createMockDialecticSessionRow({
        id: payload.sessionId,
        project_id: payload.projectId,
      }),
      ...paramsPatch,
    },
    {
      dbClient,
      jobRowOverrides: {
        job_type: 'EXECUTE',
        attempt_count: 0,
        payload,
        ...jobRowOverrides,
      },
    },
  );
}

Deno.test(
  'executeModelCallAndSave — pathContext validation — 41.b.i: ALL required values present for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      'Expected success return for pathContext 41.b.i',
    );
    assert(
      fileManager.uploadAndRegisterFile.calls.length > 0,
      'Expected fileManager.uploadAndRegisterFile to be called',
    );
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'uploadContext should be ModelContributionUploadContext');
    assertEquals(uploadContext.pathContext.documentKey, 'business_case');
    assertEquals(uploadContext.pathContext.projectId, testPayloadDocumentArtifact.projectId);
    assertEquals(uploadContext.pathContext.sessionId, testPayloadDocumentArtifact.sessionId);
    assertEquals(uploadContext.pathContext.iteration, 1);
    assertEquals(uploadContext.pathContext.stageSlug, 'thesis');
    assertEquals(uploadContext.pathContext.modelSlug, 'mock-ai-v1');
    assertEquals(uploadContext.pathContext.attemptCount, 0);
  },
);

Deno.test(
  'executeModelCallAndSave — notification document_key — 41.b.ii: execute_chunk_completed notification uses document_key from payload',
  async () => {
    resetMockNotificationService();
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
      notificationService: mockNotificationService,
    });
    assert(deps.notificationService === mockNotificationService);
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      output_type: FileType.feature_spec,
      document_key: 'feature_spec',
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result));
    assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1);
    const notificationCallArgs: unknown[] =
      mockNotificationService.sendJobNotificationEvent.calls[0].args;
    const payloadArg: unknown = notificationCallArgs[0];
    assert(isRecord(payloadArg));
    assertEquals(payloadArg.type, 'execute_chunk_completed');
    assertEquals(
      payloadArg.document_key,
      'feature_spec',
      'notification.document_key should be from payload',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.a: error when document_key is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    delete payload.document_key;
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('document_key'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.b: error when document_key is empty string for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      document_key: '',
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('document_key'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.c: error when projectId is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    delete (payload as unknown as Record<string, unknown>).projectId;
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      projectId: testPayloadDocumentArtifact.projectId,
      sessionId: testPayloadDocumentArtifact.sessionId,
      iterationNumber: testPayloadDocumentArtifact.iterationNumber,
      sessionData: mockSessionRow,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('projectId'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.d: error when sessionId is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    delete (payload as unknown as Record<string, unknown>).sessionId;
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      projectId: testPayloadDocumentArtifact.projectId,
      sessionId: testPayloadDocumentArtifact.sessionId,
      iterationNumber: testPayloadDocumentArtifact.iterationNumber,
      sessionData: mockSessionRow,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('sessionId'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.e: error when iterationNumber is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payloadFull: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    delete payloadFull.iterationNumber;
    const payload: DialecticExecuteJobPayload = payloadFull;
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      iterationNumber: testPayloadDocumentArtifact.iterationNumber,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('iterationNumber'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.f: error when canonicalPathParams is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    delete (payload as unknown as Record<string, unknown>).canonicalPathParams;
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('canonicalPathParams'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.g: error when canonicalPathParams.stageSlug is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      canonicalPathParams: { ...testPayloadDocumentArtifact.canonicalPathParams },
    };
    if (payload.canonicalPathParams && isRecord(payload.canonicalPathParams)) {
      delete (payload.canonicalPathParams as Record<string, unknown>).stageSlug;
    }
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('stageSlug'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.h: error when attempt_count is undefined for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(
      dbClient,
      payload,
      {},
      { attempt_count: undefined },
    );
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('attempt_count'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — validation — 41.b.iii.i: error when providerDetails.api_identifier is empty for document file type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayloadDocumentArtifact };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      providerRow: createMockAiProvidersRow({ api_identifier: '' }),
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveErrorReturn(result));
    const errReturn: ExecuteModelCallAndSaveErrorReturn = result;
    assertEquals(errReturn.retriable, false);
    assert(
      errReturn.error.message.includes('api_identifier'),
      `Unexpected message: ${errReturn.error.message}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave — non-document file types — 41.b.iv: succeeds for HeaderContext with document_key',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayload };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(
      isExecuteModelCallAndSaveSuccessReturn(result),
      `Expected success, got ${JSON.stringify(result)}`,
    );
  },
);

Deno.test(
  'executeModelCallAndSave propagates sourceAnchorModelSlug from canonicalPathParams to pathContext when creating HeaderContext for antithesis stage',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      stageSlug: 'antithesis',
      canonicalPathParams: {
        contributionType: 'header_context',
        stageSlug: 'antithesis',
        sourceAnchorModelSlug: 'gpt-4',
        sourceAnchorType: 'thesis',
      },
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
      stageSlug: 'antithesis',
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result));
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertExists(
      uploadContext.pathContext.sourceAnchorModelSlug,
      'pathContext should include sourceAnchorModelSlug from canonicalPathParams',
    );
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis');
  },
);

Deno.test(
  'executeModelCallAndSave — pathContext validation — 101.c: extracts document_key for assembled_document_json output type',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      output_type: FileType.AssembledDocumentJson,
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.AssembledDocumentJson,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result));
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, 'business_case');
  },
);

Deno.test(
  'executeModelCallAndSave passes documentKey to pathContext unconditionally for HeaderContext',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      canonicalPathParams: {
        contributionType: 'header_context',
        stageSlug: 'thesis',
      },
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result));
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.documentKey, payload.document_key);
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.i: PathContext includes sourceGroupFragment when document_relationships.source_group is present',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const documentRelationships: DocumentRelationships = {
      source_group: '550e8400-e29b-41d4-a716-446655440000',
    };
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      document_relationships: documentRelationships,
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload);
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.i');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      '550e8400',
      'pathContext.sourceGroupFragment should be first 8 chars after hyphen removal',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.ii: fragment extraction handles UUID with hyphens correctly',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const documentRelationships: DocumentRelationships = {
      source_group: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };
    const payload: DialecticExecuteJobPayload = {
      ...testPayload,
      document_relationships: documentRelationships,
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.ii');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      'a1b2c3d4',
      'pathContext.sourceGroupFragment should be hyphens removed, first 8 chars, lowercase',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.iii: PathContext works without source_group (backward compatibility)',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = { ...testPayload };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.iii');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      'pathContext.sourceGroupFragment should be undefined when document_relationships.source_group is absent',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.iv: fragment extraction handles undefined source_group gracefully',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const documentRelationships: DocumentRelationships = {};
    const payload: DialecticExecuteJobPayload = {
      ...testPayload,
      document_relationships: documentRelationships,
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.iv');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(
      uploadContext.pathContext.sourceGroupFragment,
      undefined,
      'pathContext.sourceGroupFragment should be undefined when source_group is undefined',
    );
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.v: sourceAnchorModelSlug propagates for antithesis patterns',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(stopDocumentJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayloadDocumentArtifact,
      stageSlug: 'antithesis',
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
      canonicalPathParams: {
        contributionType: 'antithesis',
        stageSlug: 'antithesis',
        sourceAnchorModelSlug: 'gpt-4',
      },
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      stageSlug: 'antithesis',
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.v');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis');
    assertEquals(uploadContext.pathContext.sourceGroupFragment, '550e8400');
  },
);

Deno.test(
  'executeModelCallAndSave — sourceGroupFragment — 71.c.vi: canonicalPathParams includes sourceAnchorModelSlug for antithesis HeaderContext jobs',
  async () => {
    const dbClient: SupabaseClient<Database> = pathContextDbClient();
    const fileManager: MockFileManagerService = createMockFileManagerForEmcas({
      outcome: 'success',
      contribution: pathContextMockContribution,
    });
    const deps: ExecuteModelCallAndSaveDeps = createMockExecuteModelCallAndSaveDeps({
      getAiProviderAdapter: () => adapterStopWithText(headerContextAiJson),
      fileManager,
    });
    const payload: DialecticExecuteJobPayload = {
      ...testPayload,
      output_type: FileType.HeaderContext,
      stageSlug: 'antithesis',
      canonicalPathParams: {
        contributionType: 'antithesis',
        stageSlug: 'antithesis',
        sourceAnchorModelSlug: 'gpt-4',
      },
      document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
      },
    };
    const params: ExecuteModelCallAndSaveParams = buildPathContextParams(dbClient, payload, {
      output_type: FileType.HeaderContext,
      stageSlug: 'antithesis',
    });
    const result: unknown = await executeModelCallAndSave(
      deps,
      params,
      createMockExecuteModelCallAndSavePayload({
        chatApiRequest: createMockChatApiRequest({ message: 'User message' }),
      }),
    );
    assert(isExecuteModelCallAndSaveSuccessReturn(result), 'Expected success for 71.c.vi');
    assert(fileManager.uploadAndRegisterFile.calls.length > 0);
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall);
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext));
    assertEquals(uploadContext.pathContext.sourceAnchorModelSlug, 'gpt-4');
    assertEquals(uploadContext.pathContext.stageSlug, 'antithesis');
  },
);
