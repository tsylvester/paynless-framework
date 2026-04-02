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
  ResourceDocument,
  ResourceDocuments,
} from "../../_shared/types.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import type { BoundCalculateAffordabilityFn } from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildMockBoundCalculateAffordabilityFn,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import { buildChatApiRequest } from "../compressPrompt/compressPrompt.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  DialecticStageSlug,
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import {
  RenderJobEnqueueError,
  RenderJobValidationError,
} from "../../_shared/utils/errors.ts";
import type { Database } from "../../types_db.ts";
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
