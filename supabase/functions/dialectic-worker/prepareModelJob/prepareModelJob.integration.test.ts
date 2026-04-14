// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  AiModelExtendedConfig,
  ChatApiRequest,
  ResourceDocument,
} from "../../_shared/types.ts";
import type { CountTokensFn } from "../../_shared/types/tokenizer.types.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { MockRagService } from "../../_shared/services/rag_service.mock.ts";
import { createMockAdminTokenWalletService } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { isChatApiRequest, isRecord } from "../../_shared/utils/type_guards.ts";
import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  PromptConstructionPayload,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import { calculateAffordability } from "../calculateAffordability/calculateAffordability.ts";
import type { BoundCalculateAffordabilityFn } from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildMockBoundCalculateAffordabilityFn,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import {
  buildBoundCompressPromptFn,
  buildChatApiRequest,
  buildResourceDocument,
} from "../compressPrompt/compressPrompt.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { BoundExecuteModelCallAndSaveFn } from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import { isExecuteModelCallAndSavePayload } from "../executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import { isPrepareModelJobSuccessReturn, isPrepareModelJobErrorReturn } from "./prepareModelJob.guard.ts";
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
} from "./prepareModelJob.mock.ts";

function buildParams(dbClient: SupabaseClient<Database>): PrepareModelJobParams {
  const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const job: DialecticJobRow = buildDialecticJobRow(executePayload);
  return {
    dbClient,
    authToken: "jwt.integration",
    job,
    projectOwnerUserId: "owner-int",
    providerRow: buildDefaultAiProvidersRow(),
    sessionData: buildDialecticSessionRow(),
  };
}

function buildPayload(): PrepareModelJobPayload {
  return {
    promptConstructionPayload: buildPromptConstructionPayload(),
    compressionStrategy: async () => [],
  };
}

function buildEmcasSuccessSpy(): Spy<BoundExecuteModelCallAndSaveFn> {
  return spy(async () => ({
    contribution: buildDialecticContributionRow(),
    needsContinuation: false,
    stageRelationshipForStage: undefined,
    documentKey: undefined,
    fileType: FileType.HeaderContext,
    storageFileType: FileType.ModelContributionRawJson,
  }));
}

function buildEnqueueSuccessSpy(): Spy<BoundEnqueueRenderJobFn> {
  return spy(async () => ({ renderJobId: "render-int-1" }));
}

// Path 1: Direct return → EMCAS → enqueueRenderJob → success
Deno.test(
  "integration: calculateAffordability direct return flows through EMCAS and enqueueRenderJob to success",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
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
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();
    const directReturn = buildCalculateAffordabilityDirectReturn(200, 75);
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(directReturn);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (!isPrepareModelJobSuccessReturn(result)) throw new Error("expected success");
    assertExists(result.contribution);
    assertEquals(result.renderJobId, "render-int-1");

    assertEquals(emcas.calls.length, 1);
    const emcasPayload: unknown = emcas.calls[0].args[1];
    assertEquals(isExecuteModelCallAndSavePayload(emcasPayload), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayload)) throw new Error("expected EMCAS payload");
    assertEquals(emcasPayload.preflightInputTokens, 75);
    assertEquals(emcasPayload.chatApiRequest.max_tokens_to_generate, 200);

    assertEquals(enqueue.calls.length, 1);
  },
);

// Path 2: Compressed return → chatApiRequest passed through unchanged
Deno.test(
  "integration: calculateAffordability compressed return passes chatApiRequest through to EMCAS unchanged",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
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
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();

    const compressedDocs = [buildResourceDocument()];
    const compressedChat: ChatApiRequest = buildChatApiRequest(compressedDocs, "compressed prompt");
    compressedChat.max_tokens_to_generate = 999;
    const compressedReturn = buildCalculateAffordabilityCompressedReturn({
      resolvedInputTokenCount: 42,
      chatApiRequest: compressedChat,
      resourceDocuments: compressedDocs,
    });
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(compressedReturn);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(emcas.calls.length, 1);

    const emcasPayload: unknown = emcas.calls[0].args[1];
    assertEquals(isExecuteModelCallAndSavePayload(emcasPayload), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayload)) throw new Error("expected EMCAS payload");
    assertEquals(emcasPayload.preflightInputTokens, 42);
    assertEquals(emcasPayload.chatApiRequest, compressedChat);
    assertEquals(emcasPayload.chatApiRequest.max_tokens_to_generate, 999);

    assertEquals(enqueue.calls.length, 1);
  },
);

// Path 3: calculateAffordability error → early return, no EMCAS call
Deno.test(
  "integration: calculateAffordability error return propagates without calling EMCAS or enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
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
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();

    const affordError = buildCalculateAffordabilityErrorReturn(
      new Error("Insufficient funds: integration test"),
      false,
    );
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(affordError);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "Insufficient funds: integration test");
    assertEquals(result.retriable, false);

    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

// Path 4: calculateAffordability succeeds, EMCAS returns error → error propagated, no enqueueRenderJob
Deno.test(
  "integration: EMCAS error propagates without calling enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
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
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcasError: BoundExecuteModelCallAndSaveFn = spy(async () => ({
      error: new Error("EMCAS failure: integration test"),
      retriable: true,
    }));
    const enqueue = buildEnqueueSuccessSpy();

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcasError,
      enqueueRenderJob: enqueue,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "EMCAS failure: integration test");
    assertEquals(result.retriable, true);

    assertEquals(enqueue.calls.length, 0);
  },
);

// Path 5: EMCAS succeeds, enqueueRenderJob returns error → error propagated
Deno.test(
  "integration: enqueueRenderJob error propagates after successful EMCAS",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
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
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueueError: BoundEnqueueRenderJobFn = spy(async () => ({
      error: new Error("enqueue failure: integration test"),
      retriable: false,
    }));

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueueError,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "enqueue failure: integration test");
    assertEquals(result.retriable, false);

    assertEquals(emcas.calls.length, 1);
  },
);

/** Port of `executeModelCallAndSave.test.ts` "identity after compression" (#19): post-compression countTokens payload matches EMCAS `chatApiRequest` four fields. */
Deno.test(
  "integration: identity after compression — final sized payload equals EMCAS chatApiRequest",
  async () => {
    const limitedExtended: AiModelExtendedConfig = {
      ...buildExtendedModelFixture(),
      tokenization_strategy: { type: "rough_char_count" },
      context_window_tokens: 50,
      provider_max_input_tokens: 10000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
    };

    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(limitedExtended)],
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
        dialectic_memory: {
          select: () =>
            Promise.resolve({
              data: [],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const mockRag: MockRagService = new MockRagService();
    mockRag.setConfig({ mockContextResult: "compressed summary" });

    const resourceDoc: ResourceDocument = {
      id: "doc-for-compress",
      content: "Business case document content for compression test",
      document_key: FileType.business_case,
      stage_slug: "thesis",
      type: "document",
    };

    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: "SYS: compression",
      conversationHistory: [
        { role: "assistant", content: "History A" },
        { role: "assistant", content: "History B" },
        { role: "user", content: "Please continue." },
      ],
      resourceDocuments: [resourceDoc],
      currentUserPrompt: "User for compression identity",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };

    const inputsRelevance: RelevanceRule[] = [
      {
        document_key: FileType.business_case,
        relevance: 0.5,
        type: "document",
        slug: "thesis",
      },
    ];

    const compressionStrategy: ICompressionStrategy = async (_deps, _params, payload) => {
      return payload.documents.map((d, i) => ({
        id: d.id,
        content: d.content,
        sourceType: "document",
        originalIndex: i,
        valueScore: 0.5,
        effectiveScore: 0.5,
      }));
    };

    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload,
      compressionStrategy,
      inputsRelevance,
      inputsRequired: [
        {
          type: "document",
          document_key: FileType.business_case,
          required: true,
          slug: "thesis",
        },
      ],
    };

    const sizedPayloads: unknown[] = [];
    let callIdx: number = 0;
    const countTokens: CountTokensFn = (
      _depsArg,
      payloadArg,
      _cfg,
    ) => {
      sizedPayloads.push(payloadArg);
      callIdx += 1;
      return callIdx === 1 ? 100 : 40;
    };

    const adminTokenWalletService = createMockAdminTokenWalletService().instance;
    const userTokenWalletService = createMockUserTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const compressPromptBound = buildBoundCompressPromptFn({
      ragService: mockRag,
      countTokens,
      tokenWalletService: adminTokenWalletService,
    });

    const affordDeps = buildCalculateAffordabilityDeps({
      countTokens,
      compressPrompt: compressPromptBound,
    });

    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (params, payload) => {
      return calculateAffordability(affordDeps, params, payload);
    };

    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability: boundCalculateAffordability,
      tokenWalletService: userTokenWalletService,
    });

    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.integration",
      job,
      projectOwnerUserId: "owner-int",
      providerRow: buildAiProviderRow(limitedExtended),
      sessionData: buildDialecticSessionRow(),
    };

    const result = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(emcas.calls.length, 1);

    const emcasPayload: unknown = emcas.calls[0].args[1];
    assertEquals(isExecuteModelCallAndSavePayload(emcasPayload), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayload)) throw new Error("expected EMCAS payload");
    const sent: ChatApiRequest = emcasPayload.chatApiRequest;
    assert(isChatApiRequest(sent), "EMCAS should receive a ChatApiRequest");

    assert(sizedPayloads.length >= 2, "countTokens should have been called at least twice");
    const sizedLast: unknown = sizedPayloads[sizedPayloads.length - 1];
    assert(isRecord(sizedLast), "Sized payload should be an object");

    const expectedFour = {
      systemInstruction: sizedLast["systemInstruction"],
      message: sizedLast["message"],
      messages: sizedLast["messages"],
      resourceDocuments: sizedLast["resourceDocuments"],
    };

    assertEquals(
      {
        systemInstruction: sent.systemInstruction,
        message: sent.message,
        messages: sent.messages,
        resourceDocuments: sent.resourceDocuments,
      },
      expectedFour,
      "Final sized payload must equal sent request on the four fields",
    );
  },
);