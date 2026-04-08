import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  asSupabaseAdminClientForTests,
  createMockAdminTokenWalletService,
} from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import {
  createMockSupabaseClient,
  type MockQueryBuilderState,
  type MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import type {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  ChatApiRequest,
  ILogger,
} from "../../_shared/types.ts";
import type { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
} from "../../_shared/types/tokenizer.types.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { constructMessageHistory } from "../constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "../findOrCreateChat.ts";
import {
  StreamChatFn,
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
} from "./streamChat.interface.ts";

export function buildContractStreamChatDeps(): StreamChatDeps {
  const logger: MockLogger = new MockLogger();
  const adminTokenWalletService = createMockAdminTokenWalletService().instance;
  return {
    logger,
    adminTokenWalletService,
    countTokens,
    debitTokens,
    createErrorResponse,
    findOrCreateChat,
    constructMessageHistory,
    getMaxOutputTokens,
  };
}

export function buildStreamChatDepsMissingAdminTokenWallet() {
  const d: StreamChatDeps = buildContractStreamChatDeps();
  return {
    logger: d.logger,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    createErrorResponse: d.createErrorResponse,
    findOrCreateChat: d.findOrCreateChat,
    constructMessageHistory: d.constructMessageHistory,
    getMaxOutputTokens: d.getMaxOutputTokens,
  };
}

export function buildContractStreamChatParams(): StreamChatParams {
  const mockSetup = createMockSupabaseClient("contract-stream-user", {});
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const wallet: TokenWallet = {
    walletId: "wallet-contract-stream",
    balance: "1000",
    currency: "AI_TOKEN",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
  const requestBody: ChatApiRequest = {
    message: "contract stream message",
    providerId: "provider-contract-stream",
    promptId: "__none__",
    chatId: "existing-chat-contract-stream",
    walletId: wallet.walletId,
  };
  const aiProviderAdapter: AiProviderAdapterInstance = {
    sendMessage: async () => ({
      role: "assistant",
      content: "contract",
      ai_provider_id: "provider-contract-stream",
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
    api_identifier: "contract-stream-api",
  };
  return {
    supabaseClient,
    userId: "contract-stream-user",
    wallet,
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "contract-stream-api-key",
    providerApiIdentifier: "contract-stream-api",
  };
}

export function buildContractStreamChatReq(): Request {
  return new Request("https://example.com/stream", {
    method: "POST",
    headers: { Origin: "http://localhost:5173" },
  });
}

export function buildContractStreamChatPayload(): StreamChatPayload {
  const requestBody: ChatApiRequest = {
    message: "contract stream message",
    providerId: "provider-contract-stream",
    promptId: "__none__",
    chatId: "existing-chat-contract-stream",
    walletId: "wallet-contract-stream",
  };
  const req: Request = buildContractStreamChatReq();
  return { requestBody, req };
}

export const STREAM_CHAT_UNIT_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const STREAM_CHAT_UNIT_CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const STREAM_CHAT_UNIT_PROVIDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const STREAM_CHAT_UNIT_WALLET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STREAM_CHAT_USER_MESSAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function buildStreamChatUnitRequestBody(): ChatApiRequest {
  return {
    message: "hello stream world",
    providerId: STREAM_CHAT_UNIT_PROVIDER_ID,
    promptId: "__none__",
    chatId: STREAM_CHAT_UNIT_CHAT_ID,
    walletId: STREAM_CHAT_UNIT_WALLET_ID,
  };
}

export function buildStreamChatHappyPathPayload(): StreamChatPayload {
  return { requestBody: buildStreamChatUnitRequestBody(), req: buildContractStreamChatReq() };
}

function buildStreamChatHappyPathSupabaseConfig(): MockSupabaseDataConfig {
  return {
    genericMockResults: {
      chats: {
        select: {
          data: [{ id: STREAM_CHAT_UNIT_CHAT_ID }],
          error: null,
          count: 1,
          status: 200,
          statusText: "OK",
        },
      },
      chat_messages: {
        select: {
          data: [],
          error: null,
          count: 0,
          status: 200,
          statusText: "OK",
        },
        insert: async (
          state: MockQueryBuilderState,
        ): Promise<{
          data: object[] | null;
          error: Error | null;
          count: number | null;
          status: number;
          statusText: string;
        }> => {
          const insertData = state.insertData;
          if (
            insertData === null ||
            typeof insertData !== "object" ||
            Array.isArray(insertData)
          ) {
            return {
              data: null,
              error: new Error("invalid insert payload"),
              count: 0,
              status: 400,
              statusText: "Bad Request",
            };
          }
          if (!("role" in insertData) || typeof insertData.role !== "string") {
            return {
              data: null,
              error: new Error("missing role on insert"),
              count: 0,
              status: 400,
              statusText: "Bad Request",
            };
          }
          const role: string = insertData.role;
          const now: string = new Date().toISOString();
          if (role === "user") {
            const content: string = "content" in insertData &&
                typeof insertData.content === "string"
              ? insertData.content
              : "";
            const userRow: Tables<"chat_messages"> = {
              id: STREAM_CHAT_USER_MESSAGE_ID,
              chat_id: STREAM_CHAT_UNIT_CHAT_ID,
              user_id: STREAM_CHAT_UNIT_USER_ID,
              role: "user",
              content,
              is_active_in_thread: true,
              ai_provider_id: STREAM_CHAT_UNIT_PROVIDER_ID,
              system_prompt_id: null,
              token_usage: null,
              error_type: null,
              response_to_message_id: null,
              created_at: now,
              updated_at: now,
            };
            return {
              data: [userRow],
              error: null,
              count: 1,
              status: 201,
              statusText: "Created",
            };
          }
          if (role === "assistant") {
            const id: string = "id" in insertData &&
                typeof insertData.id === "string"
              ? insertData.id
              : crypto.randomUUID();
            const content: string = "content" in insertData &&
                typeof insertData.content === "string"
              ? insertData.content
              : "";
            const assistantRow: Tables<"chat_messages"> = {
              id,
              chat_id: STREAM_CHAT_UNIT_CHAT_ID,
              user_id: null,
              role: "assistant",
              content,
              is_active_in_thread: true,
              ai_provider_id: STREAM_CHAT_UNIT_PROVIDER_ID,
              system_prompt_id: null,
              token_usage: null,
              error_type: null,
              response_to_message_id: STREAM_CHAT_USER_MESSAGE_ID,
              created_at: now,
              updated_at: now,
            };
            return {
              data: [assistantRow],
              error: null,
              count: 1,
              status: 201,
              statusText: "Created",
            };
          }
          return {
            data: null,
            error: new Error(`unexpected role: ${role}`),
            count: 0,
            status: 400,
            statusText: "Bad Request",
          };
        },
      },
    },
  };
}

export function buildStreamChatHappyPathParams(
  options: { adapterThrows?: boolean } = {},
): StreamChatParams {
  const mockSetup = createMockSupabaseClient(
    STREAM_CHAT_UNIT_USER_ID,
    buildStreamChatHappyPathSupabaseConfig(),
  );
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );
  const wallet: TokenWallet = {
    walletId: STREAM_CHAT_UNIT_WALLET_ID,
    balance: "10000",
    currency: "AI_TOKEN",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
  const modelConfig: AiModelExtendedConfig = {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "unit-stream-api",
  };
  const baseAdapter: AiProviderAdapterInstance = {
    sendMessage: async () => ({
      role: "assistant",
      content: "hello stream world",
      ai_provider_id: STREAM_CHAT_UNIT_PROVIDER_ID,
      system_prompt_id: null,
      token_usage: {
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
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
  const aiProviderAdapter: AiProviderAdapterInstance = options.adapterThrows ===
      true
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
    userId: STREAM_CHAT_UNIT_USER_ID,
    wallet,
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText: null,
    finalSystemPromptIdForDb: null,
    apiKey: "unit-stream-api-key",
    providerApiIdentifier: "unit-stream-api",
  };
}

export function buildStreamChatDepsInsufficientBalance(): StreamChatDeps {
  const base: StreamChatDeps = buildContractStreamChatDeps();
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

export function buildStreamChatDepsTokenLimitExceeded(): StreamChatDeps {
  const base: StreamChatDeps = buildContractStreamChatDeps();
  return {
    ...base,
    countTokens: (
      _deps: CountTokensDeps,
      _payload: CountableChatPayload,
      _modelConfig: AiModelExtendedConfig,
    ): number => 999_999,
  };
}

export function createMockStreamChat(config: {
  outcome?: StreamChatReturn;
} = {}): StreamChatFn {
  const fn: StreamChatFn = async (
    _deps: StreamChatDeps,
    _params: StreamChatParams,
    _payload: StreamChatPayload,
  ): Promise<StreamChatReturn> => {
    if (config.outcome !== undefined) {
      return config.outcome;
    }
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_start",
              chatId: "mock-chat",
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  return fn;
}
