import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getMockAiProviderAdapter } from "../../_shared/ai_service/ai_provider.mock.ts";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
  asSupabaseAdminClientForTests,
  createMockAdminTokenWalletService,
} from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.provides.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import {
  createMockSupabaseClient,
  MockQueryBuilderState,
  MockSupabaseDataConfig,
} from "../../_shared/supabase.mock.ts";
import {
  AiModelExtendedConfig,
  ChatApiRequest,
  ChatMessageRow,
  FactoryDependencies,
  GetAiProviderAdapterFn,
} from "../../_shared/types.ts";
import { debitTokens } from "../../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { Database, Tables } from "../../types_db.ts";
import { constructMessageHistory } from "../constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "../findOrCreateChat.ts";
import { prepareChatContext } from "../prepareChatContext/prepareChatContext.ts";
import {
  buildStreamChatHappyPathPayload,
  STREAM_CHAT_UNIT_CHAT_ID,
  STREAM_CHAT_UNIT_PROVIDER_ID,
  STREAM_CHAT_UNIT_USER_ID,
  STREAM_CHAT_UNIT_WALLET_ID,
} from "../streamChat/streamChat.mock.ts";
import { StreamChat } from "../streamChat/StreamChat.ts";
import {
  buildStreamRewindHappyPathPayload,
  STREAM_REWIND_FROM_MSG_ID,
  STREAM_REWIND_NEW_ASSISTANT_MSG_ID,
  STREAM_REWIND_NEW_USER_MSG_ID,
  STREAM_REWIND_UNIT_CHAT_ID,
  STREAM_REWIND_UNIT_PROMPT_ID,
  STREAM_REWIND_UNIT_PROVIDER_ID,
  STREAM_REWIND_UNIT_USER_ID,
  STREAM_REWIND_UNIT_WALLET_ID,
} from "../streamRewind/streamRewind.mock.ts";
import { StreamRewind } from "../streamRewind/streamRewind.ts";
import {
  StreamRequestDeps,
  StreamRequestParams,
  StreamRequestPayload,
} from "./streamRequest.interface.ts";
import { streamRequest } from "./streamRequest.ts";

const STREAM_CHAT_HAPPY_USER_MESSAGE_ID: string =
  "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function streamChatPathModelConfig(): AiModelExtendedConfig {
  return {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "unit-stream-api",
  };
}

function streamChatPathSupabaseConfig(
  modelConfig: AiModelExtendedConfig,
): MockSupabaseDataConfig {
  const nowIso: string = new Date().toISOString();
  return {
    genericMockResults: {
      ai_providers: {
        select: {
          data: [{
            id: STREAM_CHAT_UNIT_PROVIDER_ID,
            provider: "TEST_PROVIDER",
            api_identifier: "unit-stream-api",
            config: modelConfig,
            is_active: true,
            name: "Unit Stream Provider",
            created_at: nowIso,
            updated_at: nowIso,
            description: null,
            is_default_embedding: false,
            is_default_generation: false,
            is_enabled: true,
          }],
          error: null,
        },
      },
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
              id: STREAM_CHAT_HAPPY_USER_MESSAGE_ID,
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
              response_to_message_id: STREAM_CHAT_HAPPY_USER_MESSAGE_ID,
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

function streamRewindPathModelConfig(): AiModelExtendedConfig {
  return {
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
    api_identifier: "unit-rewind-api",
  };
}

function streamRewindPathSupabaseConfig(
  modelConfig: AiModelExtendedConfig,
): MockSupabaseDataConfig {
  const nowIso: string = new Date().toISOString();
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

  return {
    genericMockResults: {
      ai_providers: {
        select: {
          data: [{
            id: STREAM_REWIND_UNIT_PROVIDER_ID,
            provider: "TEST_PROVIDER",
            api_identifier: "unit-rewind-api",
            config: modelConfig,
            is_active: true,
            name: "Unit Rewind Provider",
            created_at: nowIso,
            updated_at: nowIso,
            description: null,
            is_default_embedding: false,
            is_default_generation: false,
            is_enabled: true,
          }],
          error: null,
        },
      },
      system_prompts: {
        select: {
          data: [{
            id: STREAM_REWIND_UNIT_PROMPT_ID,
            prompt_text: "integration rewind prompt",
            is_active: true,
            name: "integration-prompt",
            created_at: nowIso,
            updated_at: nowIso,
            description: null,
            document_template_id: null,
            user_selectable: true,
            version: 1,
          }],
          error: null,
        },
      },
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
    rpcResults: {
      perform_chat_rewind: {
        data: rpcAssistantRow,
        error: null,
      },
    },
  };
}

function buildStreamRequestPayloadFromBody(body: ChatApiRequest): StreamRequestPayload {
  const req: Request = new Request("https://example.com/stream-request-integration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { req };
}

Deno.test({
  name:
    "integration: real prepareChatContext StreamChat StreamRewind and streamRequest — normal body reaches StreamChat and records admin wallet debit",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const modelConfig: AiModelExtendedConfig = streamChatPathModelConfig();
  const adapterPair = getMockAiProviderAdapter(logger, modelConfig);
  const getAiProviderAdapter: GetAiProviderAdapterFn = (
    _fd: FactoryDependencies,
  ) => adapterPair.instance;

  const mockSetup = createMockSupabaseClient(
    STREAM_CHAT_UNIT_USER_ID,
    streamChatPathSupabaseConfig(modelConfig),
  );
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );

  const walletMock = createMockUserTokenWalletService({
    getWalletByIdAndUser: (wid: string, uid: string) => {
      const now: Date = new Date();
      return Promise.resolve({
        walletId: wid,
        userId: uid,
        balance: "10000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      });
    },
  });

  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRequestDeps = {
    logger,
    adminTokenWalletService: adminMock.instance,
    getAiProviderAdapter,
    prepareChatContext,
    streamChat: StreamChat,
    streamRewind: StreamRewind,
    createErrorResponse,
    countTokens,
    debitTokens,
    getMaxOutputTokens,
    findOrCreateChat,
    constructMessageHistory,
  };

  const params: StreamRequestParams = {
    supabaseClient,
    userId: STREAM_CHAT_UNIT_USER_ID,
    userTokenWalletService: walletMock.instance,
  };

  const requestBody: ChatApiRequest = buildStreamChatHappyPathPayload().requestBody;
  const payload: StreamRequestPayload = buildStreamRequestPayloadFromBody(
    requestBody,
  );

  Deno.env.set("TEST_PROVIDER_API_KEY", "integration-stream-request-chat-key");
  try {
    const outcome = await streamRequest(deps, params, payload);
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    await outcome.text();
    assertEquals(
      outcome.headers.get("Content-Type")?.includes("text/event-stream"),
      true,
    );
    assertEquals(adminMock.stubs.recordTransaction.calls.length >= 1, true);
  } finally {
    adminMock.clearStubs();
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  }
});

Deno.test({
  name:
    "integration: real prepareChatContext StreamChat StreamRewind and streamRequest — rewind body reaches StreamRewind and records admin wallet debit",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const modelConfig: AiModelExtendedConfig = streamRewindPathModelConfig();
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
  const getAiProviderAdapter: GetAiProviderAdapterFn = (
    _fd: FactoryDependencies,
  ) => adapterPair.instance;

  const mockSetup = createMockSupabaseClient(
    STREAM_REWIND_UNIT_USER_ID,
    streamRewindPathSupabaseConfig(modelConfig),
  );
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );

  const walletMock = createMockUserTokenWalletService({
    getWalletByIdAndUser: (wid: string, uid: string) => {
      const now: Date = new Date();
      return Promise.resolve({
        walletId: wid,
        userId: uid,
        balance: "10000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      });
    },
  });

  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRequestDeps = {
    logger,
    adminTokenWalletService: adminMock.instance,
    getAiProviderAdapter,
    prepareChatContext,
    streamChat: StreamChat,
    streamRewind: StreamRewind,
    createErrorResponse,
    countTokens,
    debitTokens,
    getMaxOutputTokens,
    findOrCreateChat,
    constructMessageHistory,
  };

  const params: StreamRequestParams = {
    supabaseClient,
    userId: STREAM_REWIND_UNIT_USER_ID,
    userTokenWalletService: walletMock.instance,
  };

  const requestBody: ChatApiRequest = buildStreamRewindHappyPathPayload().requestBody;
  const payload: StreamRequestPayload = buildStreamRequestPayloadFromBody(
    requestBody,
  );

  Deno.env.set("TEST_PROVIDER_API_KEY", "integration-stream-request-rewind-key");
  try {
    const outcome = await streamRequest(deps, params, payload);
    assertEquals(outcome instanceof Response, true);
    if (!(outcome instanceof Response)) {
      return;
    }
    await outcome.text();
    assertEquals(
      outcome.headers.get("Content-Type")?.includes("text/event-stream"),
      true,
    );
    assertEquals(adminMock.stubs.recordTransaction.calls.length >= 1, true);
    const first = adminMock.stubs.recordTransaction.calls[0].args[0];
    assertEquals(first.type, "DEBIT_USAGE");
    assertEquals(first.walletId, STREAM_REWIND_UNIT_WALLET_ID);
    assertEquals(first.relatedEntityType, "chat_message");
  } finally {
    adminMock.clearStubs();
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  }
});

Deno.test({
  name:
    "integration: consumer-shaped StreamRequestDeps and StreamRequestParams invoke streamRequest with Request payload",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const logger: MockLogger = new MockLogger();
  const modelConfig: AiModelExtendedConfig = streamChatPathModelConfig();
  const adapterPair = getMockAiProviderAdapter(logger, modelConfig);
  const getAiProviderAdapter: GetAiProviderAdapterFn = (
    _fd: FactoryDependencies,
  ) => adapterPair.instance;

  const mockSetup = createMockSupabaseClient(
    STREAM_CHAT_UNIT_USER_ID,
    streamChatPathSupabaseConfig(modelConfig),
  );
  const supabaseClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    mockSetup.client,
  );

  const walletMock = createMockUserTokenWalletService({
    getWalletByIdAndUser: (wid: string, uid: string) => {
      const now: Date = new Date();
      return Promise.resolve({
        walletId: wid,
        userId: uid,
        balance: "10000",
        currency: "AI_TOKEN",
        createdAt: now,
        updatedAt: now,
      });
    },
  });

  const adminMock = createMockAdminTokenWalletService();
  const deps: StreamRequestDeps = {
    logger,
    adminTokenWalletService: adminMock.instance,
    getAiProviderAdapter,
    prepareChatContext,
    streamChat: StreamChat,
    streamRewind: StreamRewind,
    createErrorResponse,
    countTokens,
    debitTokens,
    getMaxOutputTokens,
    findOrCreateChat,
    constructMessageHistory,
  };

  const params: StreamRequestParams = {
    supabaseClient,
    userId: STREAM_CHAT_UNIT_USER_ID,
    userTokenWalletService: walletMock.instance,
  };

  const requestBody: ChatApiRequest = buildStreamChatHappyPathPayload().requestBody;
  const payload: StreamRequestPayload = buildStreamRequestPayloadFromBody(
    requestBody,
  );

  Deno.env.set("TEST_PROVIDER_API_KEY", "integration-stream-request-consumer-key");
  try {
    const outcome = await streamRequest(deps, params, payload);
    assertEquals(outcome instanceof Response, true);
  } finally {
    adminMock.clearStubs();
    Deno.env.delete("TEST_PROVIDER_API_KEY");
  }
});
