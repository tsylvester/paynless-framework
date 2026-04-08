import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import { getMockAiProviderAdapter } from "../../_shared/ai_service/ai_provider.mock.ts";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  asSupabaseAdminClientForTests,
  createMockAdminTokenWalletService,
} from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import {
  createMockSupabaseClient,
  MockQueryBuilderState,
  MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  ChatApiRequest,
  ChatMessageRow,
  ILogger,
} from "../../_shared/types.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import {
  StreamRewind,
  StreamRewindDeps,
  StreamRewindParams,
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";

export function buildContractStreamRewindDeps(): StreamRewindDeps {
  const logger: MockLogger = new MockLogger();
  const adminTokenWalletService = createMockAdminTokenWalletService().instance;
  return {
    logger,
    adminTokenWalletService,
    countTokens,
    debitTokens,
    createErrorResponse,
    getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingAdminTokenWallet() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingLogger() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    adminTokenWalletService: d.adminTokenWalletService,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingCountTokens() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingDebitTokens() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    countTokens: d.countTokens,
    createErrorResponse: d.createErrorResponse,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingCreateErrorResponse() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildStreamRewindDepsMissingGetMaxOutputTokens() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
  };
}

export function buildStreamRewindDepsMalformedAdminTokenWallet() {
  const d: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: {},
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildContractStreamRewindParams(): StreamRewindParams {
  const mockSetup = createMockSupabaseClient("contract-rewind-user", {});
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const wallet: TokenWallet = {
    walletId: "wallet-contract-rewind",
    balance: "1000",
    currency: "AI_TOKEN",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
  const aiProviderAdapter: AiProviderAdapterInstance = {
    sendMessage: async () => ({
      role: "assistant",
      content: "contract",
      ai_provider_id: "provider-contract-rewind",
      system_prompt_id: null,
      token_usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
      finish_reason: "stop",
    }),
    sendMessageStream: async function* (
      _request: ChatApiRequest,
      _modelIdentifier: string,
    ) {
      yield { type: "text_delta", text: "" };
      return;
    },
    listModels: async () => [],
  };
  const modelConfig: AiModelExtendedConfig = {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "contract-rewind-api",
  };
  return {
    supabaseClient,
    userId: "contract-rewind-user",
    wallet,
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
  };
}

export function buildContractStreamRewindPayload(): StreamRewindPayload {
  const walletId: string = "wallet-contract-rewind";
  const requestBody: ChatApiRequest = {
    message: "contract rewind message",
    providerId: "provider-contract-rewind",
    promptId: "__none__",
    chatId: "existing-chat-contract-rewind",
    walletId,
    rewindFromMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const req: Request = new Request("https://example.com/contract-rewind", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
  });
  return { requestBody, req };
}

export function buildContractStreamRewindPayloadWithoutChatId(): StreamRewindPayload {
  const walletId: string = "wallet-contract-rewind";
  const requestBody: ChatApiRequest = {
    message: "contract rewind message",
    providerId: "provider-contract-rewind",
    promptId: "__none__",
    walletId,
    rewindFromMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const req: Request = new Request("https://example.com/chat", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
  });
  return { requestBody, req };
}

export const STREAM_REWIND_UNIT_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const STREAM_REWIND_UNIT_CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const STREAM_REWIND_UNIT_PROVIDER_ID =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const STREAM_REWIND_UNIT_WALLET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const STREAM_REWIND_FROM_MSG_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const STREAM_REWIND_UNIT_PROMPT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
export const STREAM_REWIND_NEW_ASSISTANT_MSG_ID =
  "99999999-9999-4999-8999-999999999999";
export const STREAM_REWIND_NEW_USER_MSG_ID =
  "88888888-8888-4888-8888-888888888888";

export function buildStreamRewindUnitDepsWithFreshAdmin(): {
  deps: StreamRewindDeps;
  admin: ReturnType<typeof createMockAdminTokenWalletService>;
} {
  const admin: ReturnType<typeof createMockAdminTokenWalletService> =
    createMockAdminTokenWalletService();
  const logger: MockLogger = new MockLogger();
  const deps: StreamRewindDeps = {
    logger,
    adminTokenWalletService: admin.instance,
    countTokens,
    debitTokens,
    createErrorResponse,
    getMaxOutputTokens,
  };
  return { deps, admin };
}

export function buildStreamRewindDepsInsufficientBalance(): StreamRewindDeps {
  const base: StreamRewindDeps = buildContractStreamRewindDeps();
  return {
    ...base,
    getMaxOutputTokens: (
      _userBalanceTokens: number,
      _promptInputTokens: number,
      _modelConfig: AiModelExtendedConfig,
      _logger: ILogger,
      _deficitTokensAllowed = 0,
    ): number => 0,
  };
}

export function buildStreamRewindHappyPathPayload(): StreamRewindPayload {
  const requestBody: ChatApiRequest = {
    message: "rewind user message",
    providerId: STREAM_REWIND_UNIT_PROVIDER_ID,
    promptId: STREAM_REWIND_UNIT_PROMPT_ID,
    chatId: STREAM_REWIND_UNIT_CHAT_ID,
    walletId: STREAM_REWIND_UNIT_WALLET_ID,
    rewindFromMessageId: STREAM_REWIND_FROM_MSG_ID,
  };
  const req: Request = new Request("https://example.com/contract-rewind", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
  });
  return { requestBody, req };
}

export function buildStreamRewindHappyPathParams(
  options: { adapterThrows?: boolean; rpcFails?: boolean } = {},
): StreamRewindParams {
  const logger: MockLogger = new MockLogger();
  const modelConfig: AiModelExtendedConfig = {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "unit-rewind-api",
  };
  const adapterPair = getMockAiProviderAdapter(logger, modelConfig);
  adapterPair.controls.setMockResponse({
    role: "assistant",
    content: "adapter rewind reply",
    ai_provider_id: STREAM_REWIND_UNIT_PROVIDER_ID,
    system_prompt_id: STREAM_REWIND_UNIT_PROMPT_ID,
    token_usage: {
      prompt_tokens: 2,
      completion_tokens: 3,
      total_tokens: 5,
    },
    finish_reason: "stop",
  });

  const historyTs: string = "2024-06-01T12:00:00.000Z";
  const userHistoryRow: ChatMessageRow = {
    id: "11111111-1111-4111-8111-111111111111",
    chat_id: STREAM_REWIND_UNIT_CHAT_ID,
    user_id: STREAM_REWIND_UNIT_USER_ID,
    role: "user",
    content: "prior user",
    created_at: historyTs,
    updated_at: historyTs,
    is_active_in_thread: true,
    ai_provider_id: null,
    system_prompt_id: null,
    token_usage: null,
    error_type: null,
    response_to_message_id: null,
  };
  const assistantHistoryRow: ChatMessageRow = {
    id: STREAM_REWIND_FROM_MSG_ID,
    chat_id: STREAM_REWIND_UNIT_CHAT_ID,
    user_id: null,
    role: "assistant",
    content: "prior assistant",
    created_at: historyTs,
    updated_at: historyTs,
    is_active_in_thread: true,
    ai_provider_id: STREAM_REWIND_UNIT_PROVIDER_ID,
    system_prompt_id: STREAM_REWIND_UNIT_PROMPT_ID,
    token_usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
    error_type: null,
    response_to_message_id: userHistoryRow.id,
  };
  const rpcAssistantRow: ChatMessageRow = {
    id: STREAM_REWIND_NEW_ASSISTANT_MSG_ID,
    chat_id: STREAM_REWIND_UNIT_CHAT_ID,
    user_id: null,
    role: "assistant",
    content: "adapter rewind reply",
    created_at: historyTs,
    updated_at: historyTs,
    is_active_in_thread: true,
    token_usage: {
      prompt_tokens: 2,
      completion_tokens: 3,
      total_tokens: 5,
    },
    ai_provider_id: STREAM_REWIND_UNIT_PROVIDER_ID,
    system_prompt_id: STREAM_REWIND_UNIT_PROMPT_ID,
    error_type: null,
    response_to_message_id: STREAM_REWIND_NEW_USER_MSG_ID,
  };

  let selectCallCount: number = 0;
  const dataConfig: MockSupabaseDataConfig = {
    genericMockResults: {
      chat_messages: {
        select: (
          _state: MockQueryBuilderState,
        ): Promise<{
          data: object[] | null;
          error: Error | null;
        }> => {
          selectCallCount += 1;
          if (selectCallCount === 1) {
            return Promise.resolve({
              data: [{ created_at: assistantHistoryRow.created_at }],
              error: null,
            });
          }
          return Promise.resolve({
            data: [userHistoryRow, assistantHistoryRow],
            error: null,
          });
        },
      },
    },
    rpcResults: options.rpcFails === true
      ? {
        perform_chat_rewind: {
          data: null,
          error: new Error("RPC exploded"),
        },
      }
      : {
        perform_chat_rewind: {
          data: rpcAssistantRow,
          error: null,
        },
      },
  };

  const mockSetup = createMockSupabaseClient(
    STREAM_REWIND_UNIT_USER_ID,
    dataConfig,
  );
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );

  const baseAdapter: AiProviderAdapterInstance = adapterPair.instance;
  const aiProviderAdapter: AiProviderAdapterInstance =
    options.adapterThrows === true
      ? {
        sendMessage: async (
          _request: ChatApiRequest,
          _modelIdentifier: string,
        ) => {
          throw new Error("unit test adapter failure");
        },
        sendMessageStream: baseAdapter.sendMessageStream,
        listModels: baseAdapter.listModels,
      }
      : baseAdapter;

  return {
    supabaseClient,
    userId: STREAM_REWIND_UNIT_USER_ID,
    wallet: {
      walletId: STREAM_REWIND_UNIT_WALLET_ID,
      balance: "10000",
      currency: "AI_TOKEN",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: STREAM_REWIND_UNIT_PROMPT_ID,
  };
}

export function createMockStreamRewind(
  config: { outcome?: StreamRewindReturn } = {},
) {
  const implementation: StreamRewind = async (
    _deps: StreamRewindDeps,
    _params: StreamRewindParams,
    _payload: StreamRewindPayload,
  ): Promise<StreamRewindReturn> => {
    if (config.outcome !== undefined) {
      return config.outcome;
    }
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream<
      Uint8Array
    >({
      start(controller) {
        const ts: string = new Date().toISOString();
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_start",
              chatId: "mock-rewind-chat",
              timestamp: ts,
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "content_chunk",
              content: "mock",
              assistantMessageId: "mock-assistant-msg-id",
              timestamp: ts,
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_complete",
              assistantMessage: {
                id: "mock-asst-1",
                chat_id: "mock-rewind-chat",
                user_id: null,
                role: "assistant",
                content: "mock",
                created_at: ts,
                updated_at: ts,
              },
              finish_reason: "stop",
              timestamp: ts,
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Accept",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  };
  return spy(implementation);
}