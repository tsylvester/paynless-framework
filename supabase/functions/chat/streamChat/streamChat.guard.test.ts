import { assertEquals } from "jsr:@std/assert@0.225.3";
import { ChatApiRequest } from "../../_shared/types.ts";
import {
  isSseChatCompleteEvent,
  isStreamChatDeps,
  isStreamChatParams,
  isStreamChatPayload,
  isStreamChatReturn,
} from "./streamChat.guard.ts";
import {
  buildContractFullChatMessageRow,
  buildContractStreamChatDeps,
  buildContractStreamChatParams,
  buildContractStreamChatPayload,
  buildMockSseChatCompleteEvent,
  buildMockSseChatStartEvent,
  buildStreamChatDepsMissingAdminTokenWallet,
} from "./streamChat.mock.ts";
import {
  StreamChatDeps,
  StreamChatParams,
  StreamChatReturn,
} from "./streamChat.interface.ts";

Deno.test(
  "isStreamChatDeps returns true when value matches StreamChatDeps shape",
  () => {
    assertEquals(isStreamChatDeps(buildContractStreamChatDeps()), true);
  },
);

Deno.test("isStreamChatDeps returns false for null", () => {
  assertEquals(isStreamChatDeps(null), false);
});

Deno.test("isStreamChatDeps returns false for empty object", () => {
  assertEquals(isStreamChatDeps({}), false);
});

Deno.test(
  "isStreamChatDeps returns false when adminTokenWalletService key is absent",
  () => {
    assertEquals(
      isStreamChatDeps(buildStreamChatDepsMissingAdminTokenWallet()),
      false,
    );
  },
);

Deno.test(
  "isStreamChatDeps returns false when adminTokenWalletService is present but not IAdminTokenWalletService shape",
  () => {
    const d: StreamChatDeps = buildContractStreamChatDeps();
    const malformed: Record<string, unknown> = {
      logger: d.logger,
      adminTokenWalletService: {},
      countTokens: d.countTokens,
      debitTokens: d.debitTokens,
      createErrorResponse: d.createErrorResponse,
      findOrCreateChat: d.findOrCreateChat,
      constructMessageHistory: d.constructMessageHistory,
      getMaxOutputTokens: d.getMaxOutputTokens,
    };
    assertEquals(isStreamChatDeps(malformed), false);
  },
);

Deno.test(
  "isStreamChatDeps returns false when value is not a non-null object record",
  () => {
    assertEquals(isStreamChatDeps(0), false);
  },
);

Deno.test(
  "isStreamChatParams returns true when value matches StreamChatParams shape",
  () => {
    assertEquals(isStreamChatParams(buildContractStreamChatParams()), true);
  },
);

Deno.test("isStreamChatParams returns false for null", () => {
  assertEquals(isStreamChatParams(null), false);
});

Deno.test("isStreamChatParams returns false for empty object", () => {
  assertEquals(isStreamChatParams({}), false);
});

Deno.test(
  "isStreamChatParams returns false when userId key is absent",
  () => {
    const p: StreamChatParams = buildContractStreamChatParams();
    const value: Record<string, unknown> = {
      supabaseClient: p.supabaseClient,
      wallet: p.wallet,
      aiProviderAdapter: p.aiProviderAdapter,
      modelConfig: p.modelConfig,
      actualSystemPromptText: p.actualSystemPromptText,
      finalSystemPromptIdForDb: p.finalSystemPromptIdForDb,
      apiKey: p.apiKey,
      providerApiIdentifier: p.providerApiIdentifier,
    };
    assertEquals(isStreamChatParams(value), false);
  },
);

Deno.test(
  "isStreamChatParams returns false when value is not a non-null object record",
  () => {
    assertEquals(isStreamChatParams(0), false);
  },
);

Deno.test(
  "isStreamChatPayload returns true for value matching StreamChatPayload shape",
  () => {
    assertEquals(isStreamChatPayload(buildContractStreamChatPayload()), true);
  },
);

Deno.test("isStreamChatPayload returns false for null", () => {
  assertEquals(isStreamChatPayload(null), false);
});

Deno.test("isStreamChatPayload returns false for empty object", () => {
  assertEquals(isStreamChatPayload({}), false);
});

Deno.test(
  "isStreamChatPayload returns false when requestBody is missing required strings",
  () => {
    assertEquals(
      isStreamChatPayload({
        requestBody: { message: "x", providerId: "p" },
        req: new Request("https://example.com"),
      }),
      false,
    );
  },
);

Deno.test(
  "isStreamChatPayload returns false when req is absent",
  () => {
    const requestBody: ChatApiRequest = {
      message: "guard-payload-message",
      providerId: "guard-provider",
      promptId: "__none__",
    };
    assertEquals(isStreamChatPayload({ requestBody }), false);
  },
);

Deno.test(
  "isStreamChatPayload returns false when req is not a Request instance",
  () => {
    const requestBody: ChatApiRequest = {
      message: "guard-payload-message",
      providerId: "guard-provider",
      promptId: "__none__",
    };
    const value: Record<string, unknown> = {
      requestBody,
      req: "not-a-request",
    };
    assertEquals(isStreamChatPayload(value), false);
  },
);

Deno.test(
  "isStreamChatReturn returns true for StreamChatSuccess Response",
  () => {
    const value: StreamChatReturn = new Response(null, { status: 200 });
    assertEquals(isStreamChatReturn(value), true);
  },
);

Deno.test(
  "isStreamChatReturn returns true for StreamChatError Error",
  () => {
    const value: StreamChatReturn = new Error("guard-return");
    assertEquals(isStreamChatReturn(value), true);
  },
);

Deno.test("isStreamChatReturn returns false for null", () => {
  assertEquals(isStreamChatReturn(null), false);
});

Deno.test("isStreamChatReturn returns false for plain record", () => {
  assertEquals(isStreamChatReturn({}), false);
});

Deno.test(
  "isSseChatCompleteEvent returns true when value matches SseChatCompleteEvent shape",
  () => {
    assertEquals(isSseChatCompleteEvent(buildMockSseChatCompleteEvent()), true);
  },
);

Deno.test("isSseChatCompleteEvent returns false for null", () => {
  assertEquals(isSseChatCompleteEvent(null), false);
});

Deno.test("isSseChatCompleteEvent returns false for empty object", () => {
  assertEquals(isSseChatCompleteEvent({}), false);
});

Deno.test(
  "isSseChatCompleteEvent returns false when value is not a non-null object record",
  () => {
    assertEquals(isSseChatCompleteEvent(0), false);
  },
);

Deno.test(
  "isSseChatCompleteEvent returns false when discriminant is not chat_complete",
  () => {
    assertEquals(isSseChatCompleteEvent(buildMockSseChatStartEvent()), false);
  },
);

Deno.test(
  "isSseChatCompleteEvent returns false when assistantMessage omits is_active_in_thread",
  () => {
    const full = buildContractFullChatMessageRow();
    const assistantMessageMissingIsActiveInThread = {
      id: full.id,
      chat_id: full.chat_id,
      user_id: full.user_id,
      role: full.role,
      content: full.content,
      created_at: full.created_at,
      updated_at: full.updated_at,
      ai_provider_id: full.ai_provider_id,
      system_prompt_id: full.system_prompt_id,
      token_usage: full.token_usage,
      error_type: full.error_type,
      response_to_message_id: full.response_to_message_id,
    };
    const value = {
      type: "chat_complete",
      assistantMessage: assistantMessageMissingIsActiveInThread,
      finish_reason: "stop",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    assertEquals(isSseChatCompleteEvent(value), false);
  },
);
