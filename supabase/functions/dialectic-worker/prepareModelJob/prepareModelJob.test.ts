import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  Messages,
  ResourceDocument,
  ResourceDocuments,
} from "../../_shared/types.ts";
import type { CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { calculateAffordability } from "../calculateAffordability/calculateAffordability.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityDeps,
} from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityDeps,
  buildMockBoundCalculateAffordabilityFn,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import { compressPrompt } from "../compressPrompt/compressPrompt.ts";
import type { BoundCompressPromptFn, CompressPromptDeps } from "../compressPrompt/compressPrompt.interface.ts";
import { buildChatApiRequest, createCompressPromptMock } from "../compressPrompt/compressPrompt.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest, isResourceDocument } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import {
  ContextWindowError,
  RenderJobEnqueueError,
  RenderJobValidationError,
} from "../../_shared/utils/errors.ts";
import { getMockAiProviderAdapter, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { EmbeddingClient } from "../../_shared/services/indexing_service.ts";
import { createMockAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import type { IUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.interface.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { getSortedCompressionCandidates } from "../../_shared/utils/vector_utils.ts";
import type { Database, Tables } from "../../types_db.ts";
import type {
  DialecticContributionRow,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  InputRule,
  PromptConstructionPayload,
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
} from "./prepareModelJob.guard.ts";
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
      providerRow: buildAiProviderRow({ not_valid: true } as unknown as AiModelExtendedConfig),
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
  "prepareModelJob passes preflightInputTokens equal to counted input tokens on non-oversized path",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    assertEquals(typeof payloadArg.preflightInputTokens, "number");
    assertEquals(Number.isFinite(payloadArg.preflightInputTokens), true);
  },
);

Deno.test(
  "prepareModelJob forwards payload resourceDocuments to ChatApiRequest.resourceDocuments",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const contributionRowForResourceDocument: DialecticContributionRow = buildDialecticContributionRow();
    const { document_relationships: _ignoredRelationships, ...contributionWithoutRelationships } =
      contributionRowForResourceDocument;
    const payloadResourceDocument: ResourceDocument = {
      ...contributionWithoutRelationships,
      id: "resource-doc-forwarded-1",
      content: "payload resource content",
      document_key: FileType.HeaderContext,
      stage_slug: "thesis",
      type: "document",
    };
    const inputsRequired: InputRule[] = [{ type: "document", slug: "thesis", required: true, document_key: FileType.HeaderContext }];
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [payloadResourceDocument],
        currentUserPrompt: "contract user prompt",
        source_prompt_resource_id: "source-prompt-resource-id",
      },
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
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
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(emcas.calls.length, 1);
    const first = emcas.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isExecuteModelCallAndSavePayload(payloadArg)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    assertExists(payloadArg.chatApiRequest.resourceDocuments);
    assertEquals(payloadArg.chatApiRequest.resourceDocuments?.length, 1);
    assertEquals(payloadArg.chatApiRequest.resourceDocuments?.[0].id, "resource-doc-forwarded-1");
  },
);

Deno.test(
  "prepareModelJob does not query artifact DB tables during execution",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
          select: () => {
            throw new Error("artifact table query should not occur");
          },
        },
        dialectic_contributions: {
          select: () => {
            throw new Error("artifact table query should not occur");
          },
        },
        dialectic_feedback: {
          select: () => {
            throw new Error("artifact table query should not occur");
          },
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
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "contract user prompt",
        source_prompt_resource_id: "source-prompt-resource-id",
      },
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
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
                data: [buildAiProviderRow(buildExtendedModelFixture())],
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
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
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

Deno.test(
  "prepareModelJob orchestration: deps.calculateAffordability is invoked once; direct return maxOutputTokens becomes chatApiRequest.max_tokens_to_generate for EMCAS",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const maxOutputTokens: number = 8821;
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn(
      buildCalculateAffordabilityDirectReturn(maxOutputTokens),
    );
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
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
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    const affordCall = affordabilitySpy.calls[0];
    assertExists(affordCall);
    assertEquals(affordCall.args.length, 2);
    const affordParams: unknown = affordCall.args[0];
    if (!isRecord(affordParams) || typeof affordParams.jobId !== "string") {
      throw new Error("expected affordability params with jobId");
    }
    assertEquals(affordParams.jobId, job.id);
    assertEmcasFirstCallShape(emcas);
    const firstEmcas = emcas.calls[0];
    assertExists(firstEmcas);
    const emcasPayloadUnknown: unknown = firstEmcas.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    assertEquals(emcasPayloadUnknown.chatApiRequest.max_tokens_to_generate, maxOutputTokens);
  },
);

Deno.test(
  "prepareModelJob orchestration: compressed affordability return passes chatApiRequest through to EMCAS unchanged",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const resourceDocuments: ResourceDocuments = [];
    const passThroughChat: ChatApiRequest = buildChatApiRequest(
      resourceDocuments,
      "ORCH_COMPRESSED_PASS_THROUGH_MSG",
    );
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn(
      buildCalculateAffordabilityCompressedReturn({
        chatApiRequest: passThroughChat,
        resourceDocuments,
        resolvedInputTokenCount: 333,
      }),
    );
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
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
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEmcasFirstCallShape(emcas);
    const firstEmcas = emcas.calls[0];
    assertExists(firstEmcas);
    const emcasPayloadUnknown: unknown = firstEmcas.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    assertEquals(emcasPayloadUnknown.chatApiRequest.message, passThroughChat.message);
    assertEquals(emcasPayloadUnknown.chatApiRequest.providerId, passThroughChat.providerId);
  },
);

Deno.test(
  "prepareModelJob orchestration: calculateAffordability error return propagates as PrepareModelJobErrorReturn without EMCAS",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const affordError: Error = new Error("affordability orchestration failed");
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn(
      buildCalculateAffordabilityErrorReturn(affordError, true),
    );
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
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
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error, affordError);
      assertEquals(result.retriable, true);
    }
  },
);

Deno.test("prepareModelJob returns ContextWindowError when prompt exceeds token limit and compression cannot fit",
  async (t) => {await t.step("oversized resource document: RAG replacement still exceeds context_window_tokens",
      async () => {
        const logger: MockLogger = new MockLogger();
        const adminTokenWalletInstance = createMockAdminTokenWalletService().instance;
        const userTokenWalletInstance: IUserTokenWalletService = createMockUserTokenWalletService().instance;
        const mockRagService: MockRagService = new MockRagService();
        mockRagService.setConfig({
          mockContextResult:
            "This is the compressed but still oversized content that will not fit.",
        });
        const { instance: mockAdapter } = getMockAiProviderAdapter(
          logger,
          buildExtendedModelConfig({
            tokenization_strategy: { type: "rough_char_count" },
            context_window_tokens: 10,
            input_token_cost_rate: 0.001,
            output_token_cost_rate: 0.002,
            provider_max_input_tokens: 100,
          }),
        );
        const adapterWithEmbedding = {
          ...mockAdapter,
          getEmbedding: async (_text: string) => ({
            embedding: Array(1536).fill(0.01),
            usage: { prompt_tokens: 1, total_tokens: 1 },
          }),
        };
        const embeddingClient: EmbeddingClient = new EmbeddingClient(adapterWithEmbedding);

        const compressPromptDeps: CompressPromptDeps = {
          logger,
          ragService: mockRagService,
          embeddingClient,
          tokenWalletService: adminTokenWalletInstance,
          countTokens,
        };
        const boundCompressPrompt: BoundCompressPromptFn = async (params, payload) =>
          compressPrompt(compressPromptDeps, params, payload);

        const calculateAffordabilityDeps: CalculateAffordabilityDeps = {
          logger,
          countTokens,
          compressPrompt: boundCompressPrompt,
        };
        const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
          calculateAffordability(calculateAffordabilityDeps, p, pl);

        const limitedConfig: AiModelExtendedConfig = {
          ...buildExtendedModelFixture(),
          tokenization_strategy: { type: "rough_char_count" },
          context_window_tokens: 10,
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0.002,
          provider_max_input_tokens: 100,
        };
        if (!isJson(limitedConfig)) {
          throw new Error("Test setup failed: mock config is not valid Json.");
        }
        const limitedProviderRow: Tables<"ai_providers"> = buildAiProviderRow(limitedConfig);

        const mockSetup = createMockSupabaseClient("user-context-window", {
          genericMockResults: {
            ai_providers: {
              select: () =>
                Promise.resolve({
                  data: [limitedProviderRow],
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

        const oversizeContent: string = "A".repeat(2000);
        const resourceDoc: ResourceDocument = {
          id: "doc-oversize",
          content: oversizeContent,
          document_key: FileType.RenderedDocument,
          stage_slug: "thesis",
          type: "document",
        };
        const promptPayload: PromptConstructionPayload = {
          conversationHistory: [],
          resourceDocuments: [resourceDoc],
          currentUserPrompt: "This is a test prompt.",
          source_prompt_resource_id: "source-prompt-resource-contract",
        };
        const inputsRequired: InputRule[] = [
          {
            type: "document",
            document_key: FileType.RenderedDocument,
            required: true,
            slug: "thesis",
          },
        ];
        const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
        const job: DialecticJobRow = buildDialecticJobRow(executePayload);
        const params: PrepareModelJobParams = {
          dbClient,
          authToken: "jwt.contract",
          job,
          projectOwnerUserId: "owner-contract",
          providerRow: limitedProviderRow,
          sessionData: buildDialecticSessionRow(),
        };
        const preparePayload: PrepareModelJobPayload = {
          promptConstructionPayload: promptPayload,
          compressionStrategy: getSortedCompressionCandidates,
          inputsRequired,
          inputsRelevance: [],
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
          calculateAffordability: boundCalculateAffordability,
          tokenWalletService: userTokenWalletInstance,
        });

        const result: unknown = await prepareModelJob(deps, params, preparePayload);

        assertEquals(isPrepareModelJobErrorReturn(result), true);
        if (!isPrepareModelJobErrorReturn(result)) {
          throw new Error("expected PrepareModelJobErrorReturn");
        }
        assertEquals(result.error instanceof ContextWindowError, true);
        assertEquals(result.retriable, false);
        assertEquals(emcas.calls.length, 0);
        assertEquals(enqueue.calls.length, 0);
      },
    );
  },
);

Deno.test(
  "prepareModelJob - resourceDocuments increase counts and are forwarded unchanged (distinct from messages)",
  async () => {
    const mockSetup = createMockSupabaseClient("user-resource-docs-forward", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

    const gatheredDoc: ResourceDocument = {
      id: "doc-r1",
      content: "Rendered document content",
      document_key: FileType.RenderedDocument,
      stage_slug: "thesis",
      type: "document",
    };

    const sizingCapturedPayloads: CountableChatPayload[] = [];

    const affordLogger: MockLogger = new MockLogger();
    const { compressPrompt } = createCompressPromptMock({});
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: (
          _deps,
          payload: CountableChatPayload,
          _modelConfig: AiModelExtendedConfig,
        ): number => {
          if (!isRecord(payload)) {
            throw new Error("countTokens test: payload must be a record");
          }
          const sysRaw: unknown = payload["systemInstruction"];
          const msgRaw: unknown = payload["message"];
          if (typeof sysRaw !== "string" || typeof msgRaw !== "string") {
            throw new Error("countTokens test: systemInstruction and message must be strings");
          }
          const msgsUnknown: unknown = payload["messages"];
          if (!Array.isArray(msgsUnknown)) {
            throw new Error("countTokens test: messages must be an array");
          }
          const msgs: Messages[] = [];
          for (const m of msgsUnknown) {
            if (!isRecord(m)) {
              throw new Error("countTokens test: each message must be a record");
            }
            const roleVal: unknown = m["role"];
            const contentVal: unknown = m["content"];
            if (typeof contentVal !== "string") {
              throw new Error("countTokens test: invalid message shape");
            }
            if (roleVal === "user" || roleVal === "assistant" || roleVal === "system") {
              msgs.push({ role: roleVal, content: contentVal });
            } else {
              throw new Error("countTokens test: invalid message shape");
            }
          }
          const docsUnknown: unknown = payload["resourceDocuments"];
          if (!Array.isArray(docsUnknown)) {
            throw new Error("countTokens test: resourceDocuments must be an array");
          }
          const docs: ResourceDocument[] = [];
          for (const d of docsUnknown) {
            if (!isResourceDocument(d)) {
              throw new Error("countTokens test: invalid resource document");
            }
            docs.push(d);
          }
          const captured: CountableChatPayload = {
            systemInstruction: sysRaw,
            message: msgRaw,
            messages: msgs,
            resourceDocuments: docs,
          };
          sizingCapturedPayloads.push(captured);
          if (captured.messages === undefined || captured.resourceDocuments === undefined) {
            throw new Error("countTokens test: captured payload must include messages and resourceDocuments");
          }
          return captured.messages.length + captured.resourceDocuments.length;
        },
      }),
      compressPrompt,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

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
      systemInstruction: "SYS",
      conversationHistory: [{ role: "user", content: "HIST" }],
      resourceDocuments: [gatheredDoc],
      currentUserPrompt: "CURR",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const inputsRequired: InputRule[] = [
      { type: "document", document_key: FileType.RenderedDocument, required: true, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
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
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(sizingCapturedPayloads.length, 1);
    const sizingRecordCandidate = sizingCapturedPayloads[0];
    assertExists(sizingRecordCandidate);
    const sizingRecord: CountableChatPayload = sizingRecordCandidate;
    assertExists(sizingRecord.resourceDocuments);
    assertEquals(sizingRecord.resourceDocuments.length, 1);

    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const sent: ChatApiRequest = emcasPayloadUnknown.chatApiRequest;
    if (!isChatApiRequest(sent)) {
      throw new Error("Adapter should receive a ChatApiRequest");
    }
    if (!Array.isArray(sent.resourceDocuments) || sent.resourceDocuments.length === 0) {
      throw new Error("Resource documents must be an array");
    }
    if (!isResourceDocument(sent.resourceDocuments[0])) {
      throw new Error("Resource document must be a valid ResourceDocument");
    }
    assert(
      Array.isArray(sent.resourceDocuments) && sent.resourceDocuments.length === 1,
      "resourceDocuments must be forwarded to adapter",
    );
    assertEquals(sent.resourceDocuments[0].content, "Rendered document content");
    assertEquals(sent.resourceDocuments[0].id, "doc-r1");
    assertEquals(sent.resourceDocuments[0].document_key, FileType.RenderedDocument);
    assertEquals(sent.resourceDocuments[0].stage_slug, "thesis");
    assertEquals(sent.resourceDocuments[0].type, "document");
    assertExists(sent.messages);
    assert(
      !sent.messages.some((m) => m.content === gatheredDoc.content),
      "Resource document body must not be duplicated in ChatApiRequest.messages",
    );
    const sentFour: CountableChatPayload = {
      systemInstruction: sent.systemInstruction,
      message: sent.message,
      messages: sent.messages,
      resourceDocuments: sent.resourceDocuments,
    };
    assertEquals(
      sentFour,
      sizingRecord,
      "Sized payload must equal sent request on the four fields",
    );
  },
);

Deno.test(
  "prepareModelJob - builds full ChatApiRequest including resourceDocuments and walletId",
  async () => {
    const mockSetup = createMockSupabaseClient("prepare-full-chatapi-wallet", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

    const affordLogger: MockLogger = new MockLogger();
    const { compressPrompt } = createCompressPromptMock({});
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: () => 10,
      }),
      compressPrompt,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

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

    const resourceDoc: ResourceDocument = {
      id: "doc-xyz",
      content: "Full ChatApiRequest doc content",
      document_key: FileType.RenderedDocument,
      stage_slug: "thesis",
      type: "document",
    };
    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: "System goes here",
      conversationHistory: [{ role: "assistant", content: "Hi" }],
      resourceDocuments: [resourceDoc],
      currentUserPrompt: "User says hello",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const inputsRequired: InputRule[] = [
      { type: "document", document_key: FileType.RenderedDocument, required: true, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
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
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const sent: ChatApiRequest = emcasPayloadUnknown.chatApiRequest;
    if (!isChatApiRequest(sent)) {
      throw new Error("Adapter should receive a ChatApiRequest");
    }
    if (!Array.isArray(sent.resourceDocuments) || sent.resourceDocuments.length === 0) {
      throw new Error("Resource documents must be an array");
    }
    if (!isResourceDocument(sent.resourceDocuments[0])) {
      throw new Error("Resource document must be a valid ResourceDocument");
    }
    assert(isChatApiRequest(sent), "Adapter should receive a ChatApiRequest");

    assertEquals(sent.walletId, executePayload.walletId);
    assertEquals(sent.systemInstruction, "System goes here");
    assertEquals(sent.message, "User says hello");
    assertExists(sent.messages);
    assertExists(sent.resourceDocuments);
    assertEquals(sent.resourceDocuments.length, 1);
    assertEquals(sent.resourceDocuments[0].content, "Full ChatApiRequest doc content");
    assertEquals(sent.resourceDocuments[0].id, "doc-xyz");
    assertEquals(sent.resourceDocuments[0].document_key, FileType.RenderedDocument);
    assertEquals(sent.resourceDocuments[0].stage_slug, "thesis");
    assertEquals(sent.resourceDocuments[0].type, "document");
  },
);

Deno.test(
  "prepareModelJob - identity: sized payload equals sent request (non-oversized)",
  async () => {
    const mockSetup = createMockSupabaseClient("prepare-identity-non-oversized", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

    const sizedPayloads: CountableChatPayload[] = [];
    const affordLogger: MockLogger = new MockLogger();
    const { compressPrompt } = createCompressPromptMock({});
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: (_deps, payloadArg: CountableChatPayload, _modelConfig: AiModelExtendedConfig): number => {
          sizedPayloads.push(payloadArg);
          return 5;
        },
      }),
      compressPrompt,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

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
      systemInstruction: "SYS: identity",
      conversationHistory: [{ role: "assistant", content: "Hi (history)" }],
      resourceDocuments: [],
      currentUserPrompt: "User prompt for identity",
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
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const sent: ChatApiRequest = emcasPayloadUnknown.chatApiRequest;
    assert(isChatApiRequest(sent), "Adapter should receive a ChatApiRequest");

    assertEquals(sizedPayloads.length, 1);
    const sizedFirstCandidate = sizedPayloads[0];
    assertExists(sizedFirstCandidate);
    const sizedFirst: CountableChatPayload = sizedFirstCandidate;

    const expectedFour: CountableChatPayload = {
      systemInstruction: sizedFirst.systemInstruction,
      message: sizedFirst.message,
      messages: sizedFirst.messages,
      resourceDocuments: sizedFirst.resourceDocuments,
    };

    const sentFour: CountableChatPayload = {
      systemInstruction: sent.systemInstruction,
      message: sent.message,
      messages: sent.messages,
      resourceDocuments: sent.resourceDocuments,
    };

    assertEquals(sentFour, expectedFour, "Sized payload must equal sent request on the four fields");
  },
);

Deno.test(
  "prepareModelJob - scoped selection includes only artifacts matching inputsRequired",
  async () => {
    const mockSetup = createMockSupabaseClient("prepare-scoped-inputs-required", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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

    const affordLogger: MockLogger = new MockLogger();
    const { compressPrompt } = createCompressPromptMock({});
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: () => 10,
      }),
      compressPrompt,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

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

    // Legacy monolith test gathered from DB and applied resource-over-contribution precedence for the
    // same document_key. prepareModelJob receives pre-resolved resourceDocuments; duplicate contribution
    // for the same slot is omitted upstream. Non-matching artifacts remain in the payload to exercise
    // applyInputsRequiredScope exclusion.
    const docResource: ResourceDocument = {
      id: "r-match",
      content: "R",
      document_key: FileType.business_case,
      stage_slug: "thesis",
      type: "document",
    };
    const docFeedback: ResourceDocument = {
      id: "f-match",
      content: "F",
      document_key: FileType.UserFeedback,
      stage_slug: "thesis",
      type: "feedback",
    };
    const docNonMatching: ResourceDocument = {
      id: "c-skip",
      content: "SKIP",
      document_key: FileType.risk_register,
      stage_slug: "other-stage",
      type: "document",
    };

    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: "SYS",
      conversationHistory: [],
      resourceDocuments: [docResource, docFeedback, docNonMatching],
      currentUserPrompt: "CURR",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const inputsRequired: InputRule[] = [
      { type: "document", document_key: FileType.business_case, required: true, slug: "thesis" },
      { type: "feedback", document_key: FileType.UserFeedback, required: false, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy: contractCompressionStrategy,
      inputsRequired,
      inputsRelevance: [],
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
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(emcas.calls.length, 1);
    const firstCall = emcas.calls[0];
    assertExists(firstCall);
    const emcasPayloadUnknown: unknown = firstCall.args[1];
    if (!isExecuteModelCallAndSavePayload(emcasPayloadUnknown)) {
      throw new Error("expected ExecuteModelCallAndSavePayload");
    }
    const sent: ChatApiRequest = emcasPayloadUnknown.chatApiRequest;
    assert(isChatApiRequest(sent), "Adapter should receive a ChatApiRequest");

    const ids: string[] = Array.isArray(sent.resourceDocuments)
      ? sent.resourceDocuments.map((d) =>
        isRecord(d) && typeof d["id"] === "string" ? d["id"] : ""
      )
      : [];

    assert(ids.includes("r-match"), "Expected r-match (from resources) to be included");
    assert(ids.includes("f-match"), "Expected f-match to be included");
    assert(
      !ids.includes("c-match"),
      "c-match (from contributions) should NOT be included when r-match (from resources) exists",
    );
    assert(
      !ids.includes("c-skip") && !ids.includes("r-skip"),
      "Non-matching artifacts must be excluded",
    );
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when deps.tokenWalletService is missing (migrated from executeModelCallAndSave.tokens: compression path)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-compression", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [
                buildAiProviderRow({
                  ...buildExtendedModelFixture(),
                  context_window_tokens: 50,
                }),
              ],
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
      providerRow: buildAiProviderRow({
        ...buildExtendedModelFixture(),
        context_window_tokens: 50,
      }),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const baseDeps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability: affordabilitySpy,
    });
    const depsMissingWallet: PrepareModelJobDeps = { ...baseDeps };
    delete (depsMissingWallet as unknown as Record<string, unknown>)["tokenWalletService"];
    const result: unknown = await prepareModelJob(
      depsMissingWallet,
      params,
      preparePayload,
    );
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assert(
        result.error.message.includes("Token wallet service is required for affordability preflight"),
        `Unexpected error: ${result.error.message}`,
      );
    }
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing walletId (migrated from executeModelCallAndSave.tokens: preflight non-oversized)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-walletid", {});
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
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
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
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assert(
        result.error.message.toLowerCase().includes("wallet"),
        `Unexpected error: ${result.error.message}`,
      );
    }
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when deps.tokenWalletService is missing (migrated from executeModelCallAndSave.tokens: non-oversized preflight)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-no-wallet-non-oversized", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
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
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const emcas: Spy<BoundExecuteModelCallAndSaveFn> = spy(async () => ({
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      stageRelationshipForStage: undefined,
      documentKey: undefined,
      fileType: FileType.HeaderContext,
      storageFileType: FileType.ModelContributionRawJson,
    }));
    const enqueue: Spy<BoundEnqueueRenderJobFn> = spy(async () => ({ renderJobId: null }));
    const baseDeps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability: affordabilitySpy,
    });
    const depsMissingWallet: PrepareModelJobDeps = { ...baseDeps };
    delete (depsMissingWallet as unknown as Record<string, unknown>)["tokenWalletService"];
    const result: unknown = await prepareModelJob(
      depsMissingWallet as unknown as PrepareModelJobDeps,
      params,
      preparePayload,
    );
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when model cost rates are invalid (migrated from executeModelCallAndSave.tokens: preflight non-oversized)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-invalid-rates", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [
                buildAiProviderRow({
                  ...buildExtendedModelFixture(),
                  output_token_cost_rate: 0,
                }),
              ],
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
      providerRow: buildAiProviderRow({
        ...buildExtendedModelFixture(),
        output_token_cost_rate: 0,
      }),
      sessionData: buildDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
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
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assert(
        result.error.message.includes("Model configuration is missing valid token cost rates."),
        `Unexpected error: ${result.error.message}`,
      );
    }
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);
