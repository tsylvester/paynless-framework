import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  Messages,
} from "../../_shared/types.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import {
  RenderJobEnqueueError,
  RenderJobValidationError,
} from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import type { DownloadFromStorageFn } from "../../_shared/supabase_storage_utils.ts";
import { createMockDownloadFromStorage } from "../../_shared/supabase_storage_utils.mock.ts";
import { createMockTokenWalletService } from "../../_shared/services/tokenWalletService.mock.ts";
import type { ITokenWalletService } from "../../_shared/types/tokenWallet.types.ts";
import type {
  CountTokensDeps,
  CountableChatPayload,
  CountTokensFn,
} from "../../_shared/types/tokenizer.types.ts";
import type { Database, Json } from "../../types_db.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticSessionRow,
  InputRule,
  PromptConstructionPayload,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundExecuteModelCallAndSaveFn,
  ExecuteModelCallAndSaveParams,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import {
  isExecuteModelCallAndSaveParams,
  isExecuteModelCallAndSavePayload,
} from "../executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type {
  BoundEnqueueRenderJobFn,
} from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
  isEnqueueRenderJobParams,
  isEnqueueRenderJobPayload,
} from "../enqueueRenderJob/enqueueRenderJob.interface.guards.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import {
  isPrepareModelJobErrorReturn,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.guard.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import {
  buildAiProviderRow,
  buildDefaultAiProvidersRow,
  buildDialecticContributionRow,
  buildDialecticJobRow,
  buildDialecticSessionRow,
  buildExecuteJobPayload,
  buildExtendedModelFixture,
  buildPrepareModelJobDeps,
  buildPromptConstructionPayload,
  buildTokenWalletRow,
  malformedPayloadMissingIterationNumber,
  malformedPayloadMissingStageSlug,
  malformedPayloadMissingUserJwt,
  malformedPayloadMissingWalletId,
  modelConfigToJson,
} from "./prepareModelJob.mock.ts";

function assertEmcasFirstCallShape(emcas: Spy<BoundExecuteModelCallAndSaveFn>): void {
  assertEquals(emcas.calls.length >= 1, true);
  const first = emcas.calls[0];
  assertExists(first);
  assertEquals(first.args.length >= 2, true);
  const paramArg: unknown = first.args[0];
  const payloadArg: unknown = first.args[1];
  assertEquals(isExecuteModelCallAndSaveParams(paramArg), true);
  assertEquals(isExecuteModelCallAndSavePayload(payloadArg), true);
}

function assertEnqueueFirstCallShape(enqueue: Spy<BoundEnqueueRenderJobFn>): void {
  assertEquals(enqueue.calls.length >= 1, true);
  const first = enqueue.calls[0];
  assertExists(first);
  assertEquals(first.args.length >= 2, true);
  const paramArg: unknown = first.args[0];
  const payloadArg: unknown = first.args[1];
  assertEquals(isEnqueueRenderJobParams(paramArg), true);
  assertEquals(isEnqueueRenderJobPayload(payloadArg), true);
}

Deno.test(
  "prepareModelJob calls deps.executeModelCallAndSave with a ChatApiRequest payload after Zone A-D processing",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    assertEquals(isChatApiRequest(chat), true);
    assertExists(payloadArg.preflightInputTokens);
    assertEquals(typeof payloadArg.preflightInputTokens, "number");
    assertEquals(payloadArg.preflightInputTokens > 0, true);
  },
);

Deno.test(
  "prepareModelJob calls deps.enqueueRenderJob after EMCAS succeeds with params and payload from job context and EMCAS success",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const contribution: DialecticContributionRow = buildDialecticContributionRow();
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution,
      needsContinuation: true,
      stageRelationshipForStage: "doc-identity-1",
      documentKey: FileType.HeaderContext,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: "render-job-1" }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(emcas.calls.length >= 1, true);
    assertEnqueueFirstCallShape(enqueue);
    const encFirst = enqueue.calls[0];
    assertExists(encFirst);
    const encParamsUnknown: unknown = encFirst.args[0];
    if (!isEnqueueRenderJobParams(encParamsUnknown)) {
      throw new Error("expected EnqueueRenderJobParams");
    }
    const encParams = encParamsUnknown;
    assertEquals(encParams.jobId, job.id);
    assertEquals(encParams.sessionId, "session-contract");
    assertEquals(encParams.stageSlug, DialecticStageSlug.Thesis);
    assertEquals(encParams.iterationNumber, 1);
    assertEquals(encParams.projectId, "project-contract");
    assertEquals(encParams.projectOwnerUserId, "owner-contract");
    assertEquals(encParams.userAuthToken, "jwt.contract");
    assertEquals(encParams.modelId, "model-contract");
    assertEquals(encParams.walletId, "wallet-contract");
    assertEquals(encParams.isTestJob, false);
    const encPayloadUnknown: unknown = encFirst.args[1];
    if (!isEnqueueRenderJobPayload(encPayloadUnknown)) {
      throw new Error("expected EnqueueRenderJobPayload");
    }
    const encPayload = encPayloadUnknown;
    assertEquals(encPayload.contributionId, contribution.id);
    assertEquals(encPayload.needsContinuation, true);
    assertEquals(encPayload.stageRelationshipForStage, "doc-identity-1");
    assertEquals(encPayload.documentKey, FileType.HeaderContext);
    assertEquals(encPayload.fileType, FileType.HeaderContext);
    assertEquals(encPayload.storageFileType, FileType.ModelContributionRawJson);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobSuccessReturn with contribution, needsContinuation, and renderJobId from enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const contribution: DialecticContributionRow = buildDialecticContributionRow();
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution,
      needsContinuation: true,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: "render-job-99" }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (isPrepareModelJobSuccessReturn(result)) {
      assertEquals(result.contribution.id, contribution.id);
      assertEquals(result.needsContinuation, true);
      assertEquals(result.renderJobId, "render-job-99");
    }
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required stageSlug",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingStageSlug();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required walletId",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingWalletId();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required iterationNumber",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = malformedPayloadMissingIterationNumber();
    const job: DialecticJobRow = buildDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when provider config is not AiModelExtendedConfig",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildAiProviderRow({ not_valid: true } as Json),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn with ContextWindowError when input exceeds context and compression is unavailable",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildAiProviderRow(
        modelConfigToJson({
          ...buildExtendedModelFixture(),
          context_window_tokens: 50,
        }),
      ),
      sessionData: buildDialecticSessionRow(),
    };
    const failingCompression: ICompressionStrategy = async () => {
      throw new ContextWindowError("compression unavailable");
    };
    const hugePrompt: PromptConstructionPayload = {
      conversationHistory: [],
      resourceDocuments: [],
      currentUserPrompt: "x".repeat(2000),
      source_prompt_resource_id: "source-prompt-resource-id",
    };
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: hugePrompt,
      compressionStrategy: failingCompression,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error instanceof ContextWindowError, true);
    }
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob applies compression when oversized and passes reduced token load in ChatApiRequest to EMCAS",
  async () => {
    const longPrompt: string = "y".repeat(130000);
    const longEncoded: Uint8Array = new TextEncoder().encode(longPrompt);
    const longDocBuffer: ArrayBuffer = new ArrayBuffer(longEncoded.byteLength);
    new Uint8Array(longDocBuffer).set(longEncoded);
    const downloadFromStorage: DownloadFromStorageFn = createMockDownloadFromStorage({
      mode: "success",
      data: longDocBuffer,
    });
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
        dialectic_project_resources: {
          select: () =>
            Promise.resolve({
              data: [
                {
                  id: "c1",
                  project_id: "project-contract",
                  session_id: "session-contract",
                  iteration_number: 1,
                  stage_slug: "thesis",
                  resource_type: "rendered_document",
                  storage_path:
                    "project-contract/session_session-contract/iteration_1/1_thesis/documents",
                  file_name: "model-contract_1_header_context.md",
                  storage_bucket: "contract-bucket",
                  created_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
        },
        dialectic_memory: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        slug: "thesis",
        required: true,
        document_key: FileType.HeaderContext,
      },
    ];
    const inputsRelevance: RelevanceRule[] = [
      { document_key: FileType.HeaderContext, relevance: 0.5 },
    ];
    const replacementCompression: ICompressionStrategy = async () => [
      {
        id: "c1",
        content: "short",
        sourceType: "document",
        originalIndex: 0,
        valueScore: 1,
        effectiveScore: 1,
      },
    ];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "hi",
        source_prompt_resource_id: "source-prompt-resource-compress",
      },
      compressionStrategy: replacementCompression,
      inputsRelevance,
      inputsRequired,
    };
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => {
      const msg: string = typeof payload.message === "string" ? payload.message : "";
      const docs = payload.resourceDocuments ?? [];
      let docLen = 0;
      for (let i = 0; i < docs.length; i++) {
        const c = docs[i].content;
        docLen += typeof c === "string" ? c.length : 0;
      }
      return msg.length + docLen;
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      countTokens,
      downloadFromStorage,
      tokenWalletService: createMockTokenWalletService({
        getBalance: () => Promise.resolve("10000000"),
      }).instance,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    assertEquals(chat.message.length < longPrompt.length, true);
    assertExists(chat.resourceDocuments);
    assertEquals(chat.resourceDocuments.length >= 1, true);
    const compressedContent: string = chat.resourceDocuments[0].content;
    assertEquals(compressedContent.length < longPrompt.length, true);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when wallet balance cannot afford estimated cost",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 0 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const tokenWalletService: ITokenWalletService = createMockTokenWalletService({
      getBalance: () => Promise.resolve("0"),
    }).instance;
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      tokenWalletService,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob sets max_tokens_to_generate from getMaxOutputTokens on non-oversized path",
  async () => {
    const mockLogger: MockLogger = new MockLogger();
    const extended: AiModelExtendedConfig = buildExtendedModelFixture();
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(extended))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 100000 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    const promptTokens = 100;
    const expected: number = getMaxOutputTokens(100000, promptTokens, extended, mockLogger);
    assertExists(chat.max_tokens_to_generate);
    assertEquals(chat.max_tokens_to_generate, expected);
  },
);

Deno.test(
  "prepareModelJob passes preflightInputTokens equal to counted input tokens on non-oversized path",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({ balance: 100000 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const fixedTokenCount = 42;
    const countTokens: CountTokensFn = (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => fixedTokenCount;
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      countTokens,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    assertEquals(payloadArg.preflightInputTokens, fixedTokenCount);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when gatherArtifacts cannot find a required document",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
        dialectic_project_resources: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_contributions: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
        dialectic_feedback: {
          select: () => Promise.resolve({ data: [], error: null }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const inputsRequired: InputRule[] = [
      {
        type: "document",
        slug: "thesis",
        required: true,
        document_key: FileType.HeaderContext,
      },
    ];
    const inputsRelevance: RelevanceRule[] = [];
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
      inputsRelevance,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error.message.length > 0, true);
    }
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns ExecuteModelCallAndSave error as PrepareModelJobErrorReturn without calling enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      error: new Error("emcas failed"),
      retriable: false,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length >= 1, true);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when enqueueRenderJob fails after EMCAS succeeds",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({
      error: new RenderJobEnqueueError("enqueue failed"),
      retriable: false,
    }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(emcas.calls.length >= 1, true);
    assertEquals(enqueue.calls.length >= 1, true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(
        result.error instanceof RenderJobEnqueueError ||
          result.error instanceof RenderJobValidationError,
        true,
      );
    }
  },
);

Deno.test(
  "prepareModelJob passes ChatApiRequest with promptId '__none__' to executeModelCallAndSave when job has prompt_template_id",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const baseExecutePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const executePayload: DialecticExecuteJobPayload = {
      ...baseExecutePayload,
      prompt_template_id: "some-template-id",
    };
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEmcasFirstCallShape(emcas);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const emcasPayload = emcasPayloadUnknown;
    const chatRequest: ChatApiRequest = emcasPayload.chatApiRequest;
    assertEquals(isChatApiRequest(chatRequest), true);
    assertEquals(chatRequest.promptId, "__none__");
  },
);

Deno.test(
  "prepareModelJob builds ChatApiRequest from PromptConstructionPayload (systemInstruction, message, messages, providerId)",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const historyMessage: Messages = {
      role: "assistant",
      content: "Previous message",
    };
    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: "You are a helpful assistant.",
      conversationHistory: [historyMessage],
      resourceDocuments: [],
      currentUserPrompt: "This is the current user prompt.",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const emcasPayload = emcasPayloadUnknown;
    const chatRequest: ChatApiRequest = emcasPayload.chatApiRequest;
    assertEquals(isChatApiRequest(chatRequest), true);
    assertEquals(chatRequest.message, "This is the current user prompt.");
    assertEquals(chatRequest.systemInstruction, "You are a helpful assistant.");
    assertExists(chatRequest.messages);
    assertEquals(chatRequest.messages.length, 1);
    assertEquals(chatRequest.messages[0], { role: "assistant", content: "Previous message" });
    assertEquals(chatRequest.providerId, "model-contract");
  },
);

Deno.test(
  "prepareModelJob uses rendered template as ChatApiRequest.message with empty messages when no history",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: undefined,
      conversationHistory: [],
      resourceDocuments: [],
      currentUserPrompt: "RENDERED: Hello",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const emcasPayload = emcasPayloadUnknown;
    const chatRequest: ChatApiRequest = emcasPayload.chatApiRequest;
    assertEquals(isChatApiRequest(chatRequest), true);
    assertEquals(chatRequest.message, "RENDERED: Hello");
    assertEquals(chatRequest.systemInstruction, undefined);
    assertExists(chatRequest.messages);
    assertEquals(chatRequest.messages.length, 0);
  },
);

Deno.test(
  "prepareModelJob — missing payload.user_jwt causes immediate failure before executeModelCallAndSave",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = malformedPayloadMissingUserJwt();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "external-token",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });

    let threw: boolean = false;
    try {
      await prepareModelJob(deps, params, preparePayload);
    } catch {
      threw = true;
    }

    assertEquals(threw, true);
    assertEquals(emcas.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob — passes payload.user_jwt to executeModelCallAndSave, not params.authToken",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(modelConfigToJson(buildExtendedModelFixture()))],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const expectedJwt: string = "payload.jwt.value";
    const executePayload: DialecticExecuteJobPayload = {
      ...buildExecuteJobPayload(),
      user_jwt: expectedJwt,
    };
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "external-token-should-not-be-used",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: buildDefaultAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasParamsUnknown: unknown = firstCall.args[0];
    if (!isExecuteModelCallAndSaveParams(emcasParamsUnknown)) {
      throw new Error("expected ExecuteModelCallAndSaveParams");
    }
    const emcasParams: ExecuteModelCallAndSaveParams = emcasParamsUnknown;
    assertEquals(emcasParams.userAuthToken, expectedJwt);
  },
);
