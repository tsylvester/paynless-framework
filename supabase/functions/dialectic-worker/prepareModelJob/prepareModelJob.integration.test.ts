// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
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
import type { BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import { isEnqueueModelCallPayload } from "../enqueueModelCall/enqueueModelCall.guard.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import { isPrepareModelJobSuccessReturn, isPrepareModelJobErrorReturn } from "./prepareModelJob.guard.ts";
import {
  mockAiProvidersRow,
  mockAiProvidersRowFromConfig,
  mockDialecticExecuteJobPayload,
  mockDialecticJobRow,
  mockDialecticSessionRow,
  mockPrepareModelJobDeps,
  mockPromptConstructionPayload,
  mockTokenWalletRow,
} from "./prepareModelJob.mock.ts";

function buildParams(dbClient: SupabaseClient<Database>): PrepareModelJobParams {
  const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
  const job: DialecticJobRow = mockDialecticJobRow(executePayload);
  return {
    dbClient,
    authToken: "jwt.integration",
    job,
    projectOwnerUserId: "owner-int",
    providerRow: mockAiProvidersRow(),
    sessionData: mockDialecticSessionRow(),
  };
}

function buildPayload(): PrepareModelJobPayload {
  return {
    promptConstructionPayload: mockPromptConstructionPayload(),
    compressionStrategy: async () => [],
  };
}

function buildEnqueueModelCallSuccessSpy(): Spy<BoundEnqueueModelCallFn> {
  return spy(async () => ({ queued: true as const }));
}

// Path 1: Direct return → enqueueModelCall → success
Deno.test(
  "integration: calculateAffordability direct return flows through enqueueModelCall to success",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const enqueueModelCallSpy = buildEnqueueModelCallSuccessSpy();
    const directReturn = buildCalculateAffordabilityDirectReturn(200, 75);
    const boundCalculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(directReturn);

    const deps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (!isPrepareModelJobSuccessReturn(result)) throw new Error("expected success");
    assertEquals(result.queued, true);

    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const enqueuePayload: unknown = enqueueModelCallSpy.calls[0].args[1];
    assertEquals(isEnqueueModelCallPayload(enqueuePayload), true);
    if (!isEnqueueModelCallPayload(enqueuePayload)) throw new Error("expected EnqueueModelCallPayload");
    assertEquals(enqueuePayload.preflightInputTokens, 75);
    assertEquals(enqueuePayload.chatApiRequest.max_tokens_to_generate, 200);
  },
);

// Path 2: Compressed return → chatApiRequest passed through unchanged
Deno.test(
  "integration: calculateAffordability compressed return passes chatApiRequest through to enqueueModelCall unchanged",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const enqueueModelCallSpy = buildEnqueueModelCallSuccessSpy();

    const compressedDocs = [buildResourceDocument()];
    const compressedChat: ChatApiRequest = buildChatApiRequest(compressedDocs, "compressed prompt");
    compressedChat.max_tokens_to_generate = 999;
    const compressedReturn = buildCalculateAffordabilityCompressedReturn({
      resolvedInputTokenCount: 42,
      chatApiRequest: compressedChat,
      resourceDocuments: compressedDocs,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(compressedReturn);

    const deps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);

    const enqueuePayload: unknown = enqueueModelCallSpy.calls[0].args[1];
    assertEquals(isEnqueueModelCallPayload(enqueuePayload), true);
    if (!isEnqueueModelCallPayload(enqueuePayload)) throw new Error("expected EnqueueModelCallPayload");
    assertEquals(enqueuePayload.preflightInputTokens, 42);
    assertEquals(enqueuePayload.chatApiRequest, compressedChat);
    assertEquals(enqueuePayload.chatApiRequest.max_tokens_to_generate, 999);
  },
);

// Path 3: calculateAffordability error → early return, no enqueueModelCall
Deno.test(
  "integration: calculateAffordability error return propagates without calling enqueueModelCall",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const enqueueModelCallSpy = buildEnqueueModelCallSuccessSpy();

    const affordError = buildCalculateAffordabilityErrorReturn(
      new Error("Insufficient funds: integration test"),
      false,
    );
    const boundCalculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(affordError);

    const deps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "Insufficient funds: integration test");
    assertEquals(result.retriable, false);

    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

// Path 4: calculateAffordability succeeds, enqueueModelCall returns error → error propagated
Deno.test(
  "integration: enqueueModelCall error propagates after successful affordability check",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const enqueueModelCallErrorSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: new Error("enqueueModelCall failure: integration test"),
      retriable: true,
    }));

    const deps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallErrorSpy,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "enqueueModelCall failure: integration test");
    assertEquals(result.retriable, true);

    assertEquals(enqueueModelCallErrorSpy.calls.length, 1);
  },
);

/** Port of `executeModelCallAndSave.test.ts` "identity after compression" (#19): post-compression countTokens payload matches enqueueModelCall `chatApiRequest` four fields. */
Deno.test(
  "integration: identity after compression — final sized payload equals enqueueModelCall chatApiRequest",
  async () => {
    const limitedExtended: AiModelExtendedConfig = {
      ...buildExtendedModelConfig(),
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
              data: [mockAiProvidersRowFromConfig(limitedExtended)],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow()],
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

    const enqueueModelCallSpy = buildEnqueueModelCallSuccessSpy();

    const deps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
      tokenWalletService: userTokenWalletService,
    });

    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.integration",
      job,
      projectOwnerUserId: "owner-int",
      providerRow: mockAiProvidersRowFromConfig(limitedExtended),
      sessionData: mockDialecticSessionRow(),
    };

    const result = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);

    const enqueuePayload: unknown = enqueueModelCallSpy.calls[0].args[1];
    assertEquals(isEnqueueModelCallPayload(enqueuePayload), true);
    if (!isEnqueueModelCallPayload(enqueuePayload)) throw new Error("expected EnqueueModelCallPayload");
    const sent: ChatApiRequest = enqueuePayload.chatApiRequest;
    assert(isChatApiRequest(sent), "enqueueModelCall should receive a ChatApiRequest");

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
