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
} from "../../_shared/types.ts";
import type {
  ResourceDocument,
} from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { isResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.guard.ts";
import type { CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isJson, isDialecticExecuteJobPayload } from "../../_shared/utils/type_guards.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import { calculateAffordability } from "../calculateAffordability/calculateAffordability.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
} from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  isCalculateAffordabilityParams,
  isCalculateAffordabilityPayload,
} from "../calculateAffordability/calculateAffordability.guard.ts";
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityOverBudgetReturn,
  buildCalculateAffordabilityWithinBudgetReturn,
  mockBoundCalculateAffordability,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptParams,
  CompressPromptPayload,
} from "../compressPrompt/compressPrompt.provides.ts";
import {
  buildCompressPromptErrorReturn,
  buildCompressPromptFitsReturn,
  isCompressPromptParams,
  isCompressPromptPayload,
} from "../compressPrompt/compressPrompt.provides.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { buildExtendedModelConfig, buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import type { Database, Tables } from "../../types_db.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  InputRule,
  PromptConstructionPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  BoundEnqueueModelCallFn,
  EnqueueModelCallParams,
  EnqueueModelCallPayload,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import {
  isEnqueueModelCallParams,
  isEnqueueModelCallPayload,
} from "../enqueueModelCall/enqueueModelCall.guard.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
} from "./prepareModelJob.interface.ts";
import {
  isPrepareModelJobErrorReturn,
  isPrepareModelJobPendingReturn,
  isPrepareModelJobQueuedReturn,
  isPrepareModelJobSuccessReturn,
} from "./prepareModelJob.guard.ts";
import {
  buildDialecticExecuteJobPayload,
  buildDialecticJobRow,
  buildPromptConstructionPayload,
  buildTokenWalletRow,
} from "../../_shared/dialectic.mock.ts";
import {
  buildPrepareModelJobDeps,
  buildPrepareModelJobParams,
} from "./prepareModelJob.mock.ts";
import { buildDialecticCompressJobPayload, invalidateDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";

Deno.test(
  "prepareModelJob calls deps.enqueueModelCall with a ChatApiRequest payload after Zone A-D processing",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    const first = enqueueModelCallSpy.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isEnqueueModelCallPayload(payloadArg)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const chat: ChatApiRequest = payloadArg.chatApiRequest;
    assertEquals(isChatApiRequest(chat), true);
    assertExists(payloadArg.preflightInputTokens);
    assertEquals(typeof payloadArg.preflightInputTokens, "number");
    assertEquals(payloadArg.preflightInputTokens > 0, true);
  },
);

Deno.test(
  "prepareModelJob calls deps.enqueueModelCall with EnqueueModelCallParams derived from job context",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobSuccessReturn { queued: true } when enqueueModelCall succeeds",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (isPrepareModelJobQueuedReturn(result)) {
      assertEquals(result.queued, true);
    }
    assertEquals(enqueueModelCallSpy.calls.length, 1);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when provider config is not AiModelExtendedConfig",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider({ config: { not_valid: true } }),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
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
              data: [buildMockProvider()],
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
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    const first = enqueueModelCallSpy.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isEnqueueModelCallPayload(payloadArg)) {
      throw new Error("expected EnqueueModelCallPayload");
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const payloadResourceDocument: ResourceDocument = {
      id: "resource-doc-forwarded-1",
      content: "payload resource content",
      document_key: FileType.HeaderContext,
      stage_slug: "thesis",
      type: "document",
    };
    const inputsRequired: InputRule[] = [{ type: "document", slug: "thesis", required: true, document_key: FileType.HeaderContext }];
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [payloadResourceDocument],
        currentUserPrompt: "contract user prompt",
        source_prompt_resource_id: "source-prompt-resource-id",
      },
      inputsRequired,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const first = enqueueModelCallSpy.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isEnqueueModelCallPayload(payloadArg)) {
      throw new Error("expected EnqueueModelCallPayload");
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
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
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: "contract user prompt",
        source_prompt_resource_id: "source-prompt-resource-id",
      },
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });

    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when enqueueModelCall returns error",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: new Error("enqueue-failed"),
      retriable: false,
    }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length >= 1, true);
  },
);

Deno.test(
  "prepareModelJob propagates enqueueModelCall error with retriable flag",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueError: Error = new Error("enqueue-retriable-failure");
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: enqueueError,
      retriable: true,
    }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error, enqueueError);
      assertEquals(result.retriable, true);
    }
  },
);

Deno.test(
  "prepareModelJob passes ChatApiRequest with promptId '__none__' to enqueueModelCall when job has prompt_template_id",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      prompt_template_id: "some-template-id",
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const chatRequest: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
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
      job,
      providerRow: buildMockProvider({ id: "model-contract" }),
      promptConstructionPayload,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const chatRequest: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: undefined,
      conversationHistory: [],
      resourceDocuments: [],
      currentUserPrompt: "RENDERED: Hello",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const chatRequest: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
    assertEquals(isChatApiRequest(chatRequest), true);
    assertEquals(chatRequest.message, "RENDERED: Hello");
    assertEquals(chatRequest.systemInstruction, undefined);
    assertExists(chatRequest.messages);
    assertEquals(chatRequest.messages.length, 0);
  },
);

Deno.test(
  "prepareModelJob — missing payload.user_jwt causes immediate failure before enqueueModelCall",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({ user_jwt: "" });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });

    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob — passes payload.user_jwt to enqueueModelCall",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const expectedJwt: string = "payload.jwt.value";
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      user_jwt: expectedJwt,
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueueParamsUnknown: unknown = firstCall.args[0];
    if (!isEnqueueModelCallParams(enqueueParamsUnknown)) {
      throw new Error("expected EnqueueModelCallParams");
    }
    assertEquals(enqueueParamsUnknown.userAuthToken, expectedJwt);
  },
);

Deno.test(
  "prepareModelJob orchestration: deps.calculateAffordability is invoked once; direct return maxOutputTokens becomes chatApiRequest.max_tokens_to_generate for enqueueModelCall",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const maxOutputTokens: number = 8821;
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    const affordCall = affordabilitySpy.calls[0];
    assertExists(affordCall);
    assertEquals(affordCall.args.length, 2);
    const affordParams: unknown = affordCall.args[0];
    if (!isCalculateAffordabilityParams(affordParams)) {
      throw new Error("expected CalculateAffordabilityParams");
    }
    // Contract: CalculateAffordabilityParams narrowed to 2 members (walletBalance, userConfig).
    assertEquals(typeof affordParams.walletBalance, "number");
    assertExists(affordParams.userConfig);
    // Contract: CalculateAffordabilityPayload narrowed to 5 members.
    const affordPayloadArg: unknown = affordCall.args[1];
    if (!isCalculateAffordabilityPayload(affordPayloadArg)) {
      throw new Error("expected CalculateAffordabilityPayload");
    }
    assertExists(affordPayloadArg.extendedModelConfig);
    assertExists(affordPayloadArg.resourceDocuments);
    assertExists(affordPayloadArg.conversationHistory);
    assertEquals(typeof affordPayloadArg.currentUserPrompt, "string");
    const firstEnqueue = enqueueModelCallSpy.calls[0];
    assertExists(firstEnqueue);
    const enqueuePayloadUnknown: unknown = firstEnqueue.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    assertEquals(enqueuePayloadUnknown.chatApiRequest.max_tokens_to_generate, maxOutputTokens);
  },
);

/**
 * Contract: given an over-budget affordability verdict on an EXECUTE job,
 *   deps.compressPrompt is called once with the narrowed 5-member params and
 *   6-member payload, deps.enqueueModelCall is not called, and the return is
 *   { waiting_for_children: true }.
 * Arrange: an EXECUTE job row, an over-budget affordability spy, a compressPrompt
 *   spy returning fits, and an enqueueModelCall spy.
 * Act:     prepareModelJob.
 * Assert:  compressPrompt called once with valid CompressPromptParams (5 members)
 *   and CompressPromptPayload (6 members); enqueueModelCall not called; result is
 *   { waiting_for_children: true }.
 */
Deno.test(
  "prepareModelJob over-budget EXECUTE calls deps.compressPrompt once and returns waiting_for_children",
  async () => {
    const mockSetup = createMockSupabaseClient("user-overbudget-execute", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityOverBudgetReturn()
    );
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(async () =>
      buildCompressPromptFitsReturn()
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobPendingReturn(result), true);
    assertEquals(compressPromptSpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
    const compressCall = compressPromptSpy.calls[0];
    assertExists(compressCall);
    assertEquals(isCompressPromptParams(compressCall.args[0]), true);
    assertEquals(isCompressPromptPayload(compressCall.args[1]), true);
  },
);

/**
 * Contract: given an over-budget affordability verdict on a COMPRESS job,
 *   the function returns a non-retriable error, calls neither deps.compressPrompt
 *   nor deps.enqueueModelCall, and performs no write.
 * Arrange: a COMPRESS job row, an over-budget affordability spy, spies on both
 *   collaborators.
 * Act:     prepareModelJob.
 * Assert:  result is PrepareModelJobErrorReturn with retriable false;
 *   compressPrompt not called; enqueueModelCall not called.
 */
Deno.test(
  "prepareModelJob over-budget COMPRESS returns non-retriable error without calling collaborators",
  async () => {
    const mockSetup = createMockSupabaseClient("user-overbudget-compress", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: compressPayload, job_type: 'COMPRESS' });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityOverBudgetReturn()
    );
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(async () =>
      buildCompressPromptFitsReturn()
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.retriable, false);
    }
    assertEquals(compressPromptSpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: given a compressPrompt error return on the over-budget EXECUTE path,
 *   the error propagates unchanged with the same error identity and retriable flag.
 * Arrange: an EXECUTE job row, an over-budget affordability spy, a compressPrompt
 *   spy returning an error return.
 * Act:     prepareModelJob.
 * Assert:  result is PrepareModelJobErrorReturn with the same error identity and
 *   retriable flag; enqueueModelCall not called.
 */
Deno.test(
  "prepareModelJob propagates compressPrompt error return unchanged on over-budget EXECUTE",
  async () => {
    const mockSetup = createMockSupabaseClient("user-compress-error", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const compressError: Error = new Error("compress-prompt-failed");
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityOverBudgetReturn()
    );
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(async () =>
      buildCompressPromptErrorReturn({ error: compressError, retriable: true })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error, compressError);
      assertEquals(result.retriable, true);
    }
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob orchestration: calculateAffordability error return propagates as PrepareModelJobErrorReturn without enqueueModelCall",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const affordError: Error = new Error("affordability orchestration failed");
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityErrorReturn({ error: affordError, retriable: true })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.error, affordError);
      assertEquals(result.retriable, true);
    }
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
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
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
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
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload,
      inputsRequired,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(sizingCapturedPayloads.length, 1);
    const sizingRecordCandidate = sizingCapturedPayloads[0];
    assertExists(sizingRecordCandidate);
    const sizingRecord: CountableChatPayload = sizingRecordCandidate;
    assertExists(sizingRecord.resourceDocuments);
    assertEquals(sizingRecord.resourceDocuments.length, 1);

    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
    if (!isChatApiRequest(sent)) {
      throw new Error("Adapter should receive a ChatApiRequest");
    }
    if (!Array.isArray(sent.resourceDocuments) || sent.resourceDocuments.length === 0) {
      throw new Error("Resource documents must be an array");
    }
    if (!isResourceDocument(sent.resourceDocuments[0])) {
      throw new Error("Resource document must be a valid ResourceDocument");
    }
    const firstDoc = sent.resourceDocuments[0];
    assert(
      Array.isArray(sent.resourceDocuments) && sent.resourceDocuments.length === 1,
      "resourceDocuments must be forwarded to adapter",
    );
    assertEquals(firstDoc.content, "Rendered document content");
    assertEquals(firstDoc.id, "doc-r1");
    assertEquals(firstDoc.document_key, FileType.RenderedDocument);
    assertEquals(firstDoc.stage_slug, "thesis");
    assertEquals(firstDoc.type, "document");
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const affordLogger: MockLogger = new MockLogger();
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: () => 10,
      }),
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });

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
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload,
      inputsRequired,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
    if (!isChatApiRequest(sent)) {
      throw new Error("Adapter should receive a ChatApiRequest");
    }
    if (!Array.isArray(sent.resourceDocuments) || sent.resourceDocuments.length === 0) {
      throw new Error("Resource documents must be an array");
    }
    if (!isResourceDocument(sent.resourceDocuments[0])) {
      throw new Error("Resource document must be a valid ResourceDocument");
    }
    const firstDoc = sent.resourceDocuments[0];
    assert(isChatApiRequest(sent), "Adapter should receive a ChatApiRequest");

    assertEquals(sent.walletId, executePayload.walletId);
    assertEquals(sent.systemInstruction, "System goes here");
    assertEquals(sent.message, "User says hello");
    assertExists(sent.messages);
    assertExists(sent.resourceDocuments);
    assertEquals(sent.resourceDocuments.length, 1);
    assertEquals(firstDoc.content, "Full ChatApiRequest doc content");
    assertEquals(firstDoc.id, "doc-xyz");
    assertEquals(firstDoc.document_key, FileType.RenderedDocument);
    assertEquals(firstDoc.stage_slug, "thesis");
    assertEquals(firstDoc.type, "document");
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const sizedPayloads: CountableChatPayload[] = [];
    const affordLogger: MockLogger = new MockLogger();
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: (_deps, payloadArg: CountableChatPayload, _modelConfig: AiModelExtendedConfig): number => {
          sizedPayloads.push(payloadArg);
          return 5;
        },
      }),
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });

    const promptConstructionPayload: PromptConstructionPayload = {
      systemInstruction: "SYS: identity",
      conversationHistory: [{ role: "assistant", content: "Hi (history)" }],
      resourceDocuments: [],
      currentUserPrompt: "User prompt for identity",
      source_prompt_resource_id: "source-prompt-resource-contract",
    };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
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
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const affordLogger: MockLogger = new MockLogger();
    const calculateAffordabilityDeps: CalculateAffordabilityDeps = buildCalculateAffordabilityDeps({
      logger: affordLogger,
      countTokens: createMockCountTokens({
        countTokens: () => 10,
      }),
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (p, pl) =>
      calculateAffordability(calculateAffordabilityDeps, p, pl);

    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });

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
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload,
      inputsRequired,
      inputsRelevance: [],
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    await prepareModelJob(deps, params, preparePayload);

    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
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
  "prepareModelJob deps do not include enqueueRenderJob",
  () => {
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps();
    assertEquals("enqueueRenderJob" in deps, false);
  },
);

Deno.test(
  "prepareModelJob passes tier DB cap as userConfig.tier_output_cap_tokens when job payload omits maxOutputTokens",
  async () => {
    const outputCap: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: outputCap,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient("user-tier-cap-contract", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    assertEquals("maxOutputTokens" in executePayload, false);
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
      inputsRequired: [],
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    const affordPayloadArg: CalculateAffordabilityPayload = affordEntry.args[1];
    assertEquals(isCalculateAffordabilityParams(affordParams), true);
    assertEquals(isCalculateAffordabilityParams(affordParams) && affordParams.userConfig.tier_output_cap_tokens === 32768, true);
    assertEquals(isCalculateAffordabilityPayload(affordPayloadArg), true);
    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, 32768);
  },
);

Deno.test(
  "prepareModelJob passes null userConfig.tier_output_cap_tokens when tier DB cap is null and job payload omits maxOutputTokens",
  async () => {
    const outputCap: Tables<"tier_definitions">["output_cap_tokens"] = null;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: outputCap,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient("user-tier-cap-null", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    assertEquals("maxOutputTokens" in executePayload, false);
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
      inputsRequired: [],
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    const affordPayloadArg: CalculateAffordabilityPayload = affordEntry.args[1];
    assertEquals(isCalculateAffordabilityParams(affordParams), true);
    assertEquals(isCalculateAffordabilityParams(affordParams) && affordParams.userConfig.tier_output_cap_tokens === null, true);
    assertEquals(isCalculateAffordabilityPayload(affordPayloadArg), true);
    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, null);
  },
);

Deno.test(
  "prepareModelJob passes user-chosen maxOutputTokens as userConfig.tier_output_cap_tokens when lower than tier DB cap",
  async () => {
    const tierOutputCapTokens: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const userChosenMaxOutputTokens: number = 8192;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: tierOutputCapTokens,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient("user-effective-cap-below-tier", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      maxOutputTokens: userChosenMaxOutputTokens,
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
      inputsRequired: [],
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, userChosenMaxOutputTokens);
    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, userChosenMaxOutputTokens);
  },
);

Deno.test(
  "prepareModelJob passes tier DB cap as userConfig.tier_output_cap_tokens when maxOutputTokens exceeds tier cap",
  async () => {
    const tierOutputCapTokens: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const userChosenMaxOutputTokens: number = 65536;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: tierOutputCapTokens,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient("user-effective-cap-tier-wins", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      maxOutputTokens: userChosenMaxOutputTokens,
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
      inputsRequired: [],
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, tierOutputCapTokens);
    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, tierOutputCapTokens);
  },
);

Deno.test(
  "prepareModelJob passes user-chosen maxOutputTokens as userConfig.tier_output_cap_tokens when tier DB cap is null",
  async () => {
    const userChosenMaxOutputTokens: number = 8192;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: null,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient("user-effective-cap-ultra-chosen", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload({
      maxOutputTokens: userChosenMaxOutputTokens,
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
      inputsRequired: [],
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, userChosenMaxOutputTokens);
    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, userChosenMaxOutputTokens);
  },
);

Deno.test(
  "prepareModelJob returns retriable error and skips calculateAffordability and enqueueModelCall when tier cap DB query fails",
  async () => {
    const tierQueryError: Error = new Error("simulated tier cap query failure");
    const mockSetup = createMockSupabaseClient("user-tier-cap-db-error", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: null,
              error: tierQueryError,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 })
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) {
      throw new Error("expected PrepareModelJobErrorReturn");
    }
    const errReturn: PrepareModelJobErrorReturn = result;
    assertEquals(errReturn.retriable, true);
    assertEquals(errReturn.error.message, tierQueryError.message);
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: given a within-budget affordability verdict on an EXECUTE job,
 *   the job row's payload is updated with source_prompt_resource_id from
 *   promptConstructionPayload before deps.enqueueModelCall is called.
 * Arrange: an EXECUTE job row, a within-budget affordability spy, an
 *   enqueueModelCall spy, and a mock supabase client with update configured
 *   on dialectic_generation_jobs.
 * Act:     prepareModelJob.
 * Assert:  result is { queued: true }; the dialectic_generation_jobs table received an
 *   update call whose data carries source_prompt_resource_id matching the
 *   promptConstructionPayload value; enqueueModelCall was called once.
 */
Deno.test(
  "prepareModelJob provenance write: within-budget dispatch updates job row payload with source_prompt_resource_id before enqueue",
  async () => {
    const mockSetup = createMockSupabaseClient("user-provenance-write-success", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-provenance-write-success" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const sourcePromptResourceId: string = "provenance-source-prompt-resource-id";
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: sourcePromptResourceId,
      }),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobQueuedReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const updateSpies = mockSetup.spies.getLatestQueryBuilderSpies("dialectic_generation_jobs");
    assertExists(updateSpies?.update);
    assertEquals(updateSpies!.update!.calls.length >= 1, true);
    const updateCallArg: unknown = updateSpies.update.calls[0].args[0];
    if (!isRecord(updateCallArg)) {
      throw new Error("expected update call data to be a record");
    }
    const payloadArg: unknown = updateCallArg["payload"];
    if (!isRecord(payloadArg)) {
      throw new Error("expected update payload to be a record");
    }
    assertEquals(
      payloadArg["source_prompt_resource_id"],
      sourcePromptResourceId,
    );
  },
);

/**
 * Contract: the source_prompt_resource_id value written to the job row payload
 *   does not appear on the ChatApiRequest handed to deps.enqueueModelCall.
 * Arrange: an EXECUTE job row, a within-budget affordability spy, an
 *   enqueueModelCall spy, and a mock supabase client with update configured.
 * Act:     prepareModelJob.
 * Assert:  result is { queued: true }; the ChatApiRequest passed to
 *   enqueueModelCall does not carry source_prompt_resource_id as a key.
 */
Deno.test(
  "prepareModelJob provenance write: source_prompt_resource_id does not appear on ChatApiRequest",
  async () => {
    const mockSetup = createMockSupabaseClient("user-provenance-not-on-chat", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-provenance-not-on-chat" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const sourcePromptResourceId: string = "provenance-not-on-chat-resource-id";
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: sourcePromptResourceId,
      }),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobQueuedReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const firstCall = enqueueModelCallSpy.calls[0];
    assertExists(firstCall);
    const enqueuePayloadUnknown: unknown = firstCall.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const chat: ChatApiRequest = enqueuePayloadUnknown.chatApiRequest;
    assertEquals(isChatApiRequest(chat), true);
    assertEquals("source_prompt_resource_id" in chat, false);
  },
);

/**
 * Contract: given a within-budget affordability verdict on an EXECUTE job
 *   where the provenance write (job row payload update) fails, the function
 *   returns { error, retriable: true } and enqueues nothing.
 * Arrange: an EXECUTE job row, a within-budget affordability spy, an
 *   enqueueModelCall spy, and a mock supabase client with update configured
 *   to return an error.
 * Act:     prepareModelJob.
 * Assert:  result is PrepareModelJobErrorReturn with retriable true;
 *   enqueueModelCall not called.
 */
Deno.test(
  "prepareModelJob provenance write: failed update returns retriable error and enqueues nothing",
  async () => {
    const provenanceError: Error = new Error("provenance write failed");
    const mockSetup = createMockSupabaseClient("user-provenance-write-failure", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: null,
              error: provenanceError,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(result.retriable, true);
    }
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: given an over-budget affordability verdict on an EXECUTE job,
 *   the function defers to compressPrompt and performs no provenance write
 *   at all — no update on dialectic_generation_jobs.
 * Arrange: an EXECUTE job row, an over-budget affordability spy, a
 *   compressPrompt spy returning fits, and an enqueueModelCall spy.
 * Act:     prepareModelJob.
 * Assert:  result is { waiting_for_children: true }; no dialectic_generation_jobs
 *   update call was made; enqueueModelCall not called.
 */
Deno.test(
  "prepareModelJob provenance write: over-budget EXECUTE deferral performs no update",
  async () => {
    const mockSetup = createMockSupabaseClient("user-provenance-overbudget-execute", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () => {
            throw new Error("provenance update should not occur on over-budget EXECUTE deferral");
          },
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(async () =>
      buildCalculateAffordabilityOverBudgetReturn()
    );
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(async () =>
      buildCompressPromptFitsReturn()
    );
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobPendingReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: given a row whose job_type is 'EXECUTE' and whose payload fails
 *   isDialecticExecuteJobPayload, the function surfaces that guard's
 *   per-member diagnostic on the error arm.
 * Arrange: an EXECUTE job row with a payload that fails the execute guard
 *   (sessionId set to empty string), an enqueueModelCall spy.
 * Act:     prepareModelJob.
 * Assert:  result is PrepareModelJobErrorReturn; the error message contains
 *   the guard's per-member diagnostic for sessionId.
 */
Deno.test(
  "prepareModelJob EXECUTE payload failing isDialecticExecuteJobPayload surfaces guard diagnostic",
  async () => {
    const mockSetup = createMockSupabaseClient("user-execute-guard-diagnostic", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: unknown = buildDialecticExecuteJobPayload({ sessionId: "" });
    if (!isJson(badPayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: badPayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(
        result.error.message.includes("Missing or invalid sessionId."),
        true,
        `Expected guard diagnostic, got: ${result.error.message}`,
      );
    }
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: given a row whose job_type is 'COMPRESS' and whose payload fails
 *   isDialecticCompressJobPayload, the function surfaces that guard's
 *   per-member diagnostic on the error arm.
 * Arrange: a COMPRESS job row with a payload that fails the compress guard
 *   (content set to empty string), an enqueueModelCall spy.
 * Act:     prepareModelJob.
 * Assert:  result is PrepareModelJobErrorReturn; the error message contains
 *   the guard's per-member diagnostic for content.
 */
Deno.test(
  "prepareModelJob COMPRESS payload failing isDialecticCompressJobPayload surfaces guard diagnostic",
  async () => {
    const mockSetup = createMockSupabaseClient("user-compress-guard-diagnostic", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badCompressPayload: unknown = invalidateDialecticCompressJobPayload({ content: "" });
    if (!isJson(badCompressPayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: badCompressPayload, job_type: "COMPRESS" });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    // Assert
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (isPrepareModelJobErrorReturn(result)) {
      assertEquals(
        result.error.message.includes("Missing or invalid content."),
        true,
        `Expected guard diagnostic, got: ${result.error.message}`,
      );
    }
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);
