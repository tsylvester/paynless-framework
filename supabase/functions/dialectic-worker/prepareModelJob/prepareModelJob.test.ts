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
  FileType,
} from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest, isResourceDocument } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import {
  ContextWindowError,
} from "../../_shared/utils/errors.ts";
import { buildExtendedModelConfig, getMockAiProviderAdapter } from "../../_shared/ai_service/ai_provider.mock.ts";
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
  DialecticExecuteJobPayload,
  DialecticJobRow,
  InputRule,
  PromptConstructionPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import {
  isEnqueueModelCallParams,
  isEnqueueModelCallPayload,
} from "../enqueueModelCall/enqueueModelCall.guard.ts";
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
  mockAiProvidersRow,
  mockAiProvidersRowFromConfig,
  mockDialecticExecuteJobPayload,
  mockDialecticJobRow,
  mockDialecticSessionRow,
  mockPrepareModelJobDeps,
  mockPromptConstructionPayload,
  mockTokenWalletRow,
} from "./prepareModelJob.mock.ts";

function assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn>): void {
  assertEquals(enqueueModelCallSpy.calls.length >= 1, true);
  const first = enqueueModelCallSpy.calls[0];
  assertExists(first);
  assertEquals(first.args.length >= 2, true);
  const paramArg: unknown = first.args[0];
  const payloadArg: unknown = first.args[1];
  assertEquals(isEnqueueModelCallParams(paramArg), true);
  assertEquals(isEnqueueModelCallPayload(payloadArg), true);
}

Deno.test(
  "prepareModelJob calls deps.enqueueModelCall with a ChatApiRequest payload after Zone A-D processing",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true }));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (isPrepareModelJobSuccessReturn(result)) {
      assertEquals(result.queued, true);
    }
    assertEquals(enqueueModelCallSpy.calls.length, 1);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required stageSlug",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({ stageSlug: "" });
    const job: DialecticJobRow = mockDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required walletId",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({ walletId: "" });
    const job: DialecticJobRow = mockDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing required iterationNumber",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({ iterationNumber: 0 });
    const job: DialecticJobRow = mockDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when provider config is not AiModelExtendedConfig",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow({ config: { not_valid: true } }),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [mockTokenWalletRow({ balance: 100000 })],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const payloadResourceDocument: ResourceDocument = {
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: new Error("enqueue-failed"),
      retriable: false,
    }));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueError: Error = new Error("enqueue-retriable-failure");
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: enqueueError,
      retriable: true,
    }));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({
      prompt_template_id: "some-template-id",
    });
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    await prepareModelJob(deps, params, preparePayload);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
              data: [mockAiProvidersRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({ user_jwt: "" });
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "external-token",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });

    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobErrorReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob — passes payload.user_jwt to enqueueModelCall, not params.authToken",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const expectedJwt: string = "payload.jwt.value";
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({
      user_jwt: expectedJwt,
    });
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "external-token-should-not-be-used",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const maxOutputTokens: number = 8821;
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn(
      buildCalculateAffordabilityDirectReturn(maxOutputTokens),
    );
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
    if (!isRecord(affordParams) || typeof affordParams.jobId !== "string") {
      throw new Error("expected affordability params with jobId");
    }
    assertEquals(affordParams.jobId, job.id);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
    const firstEnqueue = enqueueModelCallSpy.calls[0];
    assertExists(firstEnqueue);
    const enqueuePayloadUnknown: unknown = firstEnqueue.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    assertEquals(enqueuePayloadUnknown.chatApiRequest.max_tokens_to_generate, maxOutputTokens);
  },
);

Deno.test(
  "prepareModelJob orchestration: compressed affordability return passes chatApiRequest through to enqueueModelCall unchanged",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEnqueueModelCallFirstCallShape(enqueueModelCallSpy);
    const firstEnqueue = enqueueModelCallSpy.calls[0];
    assertExists(firstEnqueue);
    const enqueuePayloadUnknown: unknown = firstEnqueue.args[1];
    if (!isEnqueueModelCallPayload(enqueuePayloadUnknown)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    assertEquals(enqueuePayloadUnknown.chatApiRequest.message, passThroughChat.message);
    assertEquals(enqueuePayloadUnknown.chatApiRequest.providerId, passThroughChat.providerId);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const affordError: Error = new Error("affordability orchestration failed");
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn(
      buildCalculateAffordabilityErrorReturn(affordError, true),
    );
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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

Deno.test("prepareModelJob returns ContextWindowError when prompt exceeds token limit and compression cannot fit",
  async (t) => {
    await t.step("oversized resource document: RAG replacement still exceeds context_window_tokens",
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
          ...buildExtendedModelConfig(),
          tokenization_strategy: { type: "rough_char_count" },
          context_window_tokens: 10,
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0.002,
          provider_max_input_tokens: 100,
        };
        if (!isJson(limitedConfig)) {
          throw new Error("Test setup failed: mock config is not valid Json.");
        }
        const limitedProviderRow: Tables<"ai_providers"> = mockAiProvidersRowFromConfig(limitedConfig);

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
                  data: [mockTokenWalletRow()],
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
        const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
        const job: DialecticJobRow = mockDialecticJobRow(executePayload);
        const params: PrepareModelJobParams = {
          dbClient,
          authToken: "jwt.contract",
          job,
          projectOwnerUserId: "owner-contract",
          providerRow: limitedProviderRow,
          sessionData: mockDialecticSessionRow(),
        };
        const preparePayload: PrepareModelJobPayload = {
          promptConstructionPayload: promptPayload,
          compressionStrategy: getSortedCompressionCandidates,
          inputsRequired,
          inputsRelevance: [],
        };
        const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
        const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
          enqueueModelCall: enqueueModelCallSpy,
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
        assertEquals(enqueueModelCallSpy.calls.length, 0);
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

    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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

    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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

    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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

    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];

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
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
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
  "prepareModelJob returns PrepareModelJobErrorReturn when deps.tokenWalletService is missing (migrated from executeModelCallAndSave.tokens: compression path)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-compression", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [
                mockAiProvidersRowFromConfig({
                  ...buildExtendedModelConfig(),
                  context_window_tokens: 50,
                }),
              ],
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRowFromConfig({
        ...buildExtendedModelConfig(),
        context_window_tokens: 50,
      }),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const baseDeps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
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
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob returns PrepareModelJobErrorReturn when job payload is missing walletId (migrated from executeModelCallAndSave.tokens: preflight non-oversized)",
  async () => {
    const mockSetup = createMockSupabaseClient("tokens-migration-walletid", {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const badPayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload({ walletId: "" });
    const job: DialecticJobRow = mockDialecticJobRow(badPayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
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
    assertEquals(enqueueModelCallSpy.calls.length, 0);
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRow(),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const baseDeps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
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
    assertEquals(enqueueModelCallSpy.calls.length, 0);
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
                mockAiProvidersRowFromConfig({
                  ...buildExtendedModelConfig(),
                  output_token_cost_rate: 0,
                }),
              ],
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
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = mockDialecticExecuteJobPayload();
    const job: DialecticJobRow = mockDialecticJobRow(executePayload);
    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "jwt.contract",
      job,
      projectOwnerUserId: "owner-contract",
      providerRow: mockAiProvidersRowFromConfig({
        ...buildExtendedModelConfig(),
        output_token_cost_rate: 0,
      }),
      sessionData: mockDialecticSessionRow(),
    };
    const contractCompressionStrategy: ICompressionStrategy = async () => [];
    const preparePayload: PrepareModelJobPayload = {
      promptConstructionPayload: mockPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };
    const boundAffordability: BoundCalculateAffordabilityFn = buildMockBoundCalculateAffordabilityFn();
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = mockPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
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
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

Deno.test(
  "prepareModelJob deps do not include enqueueRenderJob",
  () => {
    const deps = mockPrepareModelJobDeps();
    assertEquals("enqueueRenderJob" in deps, false);
  },
);
