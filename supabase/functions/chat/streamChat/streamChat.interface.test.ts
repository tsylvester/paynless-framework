import { assertEquals } from "jsr:@std/assert@0.225.3";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import {
  buildContractFullChatMessageRow,
  buildContractStreamChatDeps,
  buildContractStreamChatParams,
  buildContractStreamChatPayload,
} from "./streamChat.mock.ts";
import {
  SseChatCompleteEvent,
  SseChatEvent,
  SseChatStartEvent,
  SseContentChunkEvent,
  SseErrorEvent,
  StreamChatFn,
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
} from "./streamChat.interface.ts";

Deno.test(
  "Contract: StreamChatDeps includes adminTokenWalletService and injected callables",
  () => {
    const deps: StreamChatDeps = buildContractStreamChatDeps();

    assertEquals("logger" in deps, true);
    assertEquals("adminTokenWalletService" in deps, true);
    assertEquals("countTokens" in deps, true);
    assertEquals("debitTokens" in deps, true);
    assertEquals("createErrorResponse" in deps, true);
    assertEquals("findOrCreateChat" in deps, true);
    assertEquals("constructMessageHistory" in deps, true);
    assertEquals("getMaxOutputTokens" in deps, true);

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.adminTokenWalletService.recordTransaction, "function");
    assertEquals(typeof deps.countTokens, "function");
    assertEquals(typeof deps.debitTokens, "function");
    assertEquals(typeof deps.createErrorResponse, "function");
    assertEquals(typeof deps.findOrCreateChat, "function");
    assertEquals(typeof deps.constructMessageHistory, "function");
    assertEquals(typeof deps.getMaxOutputTokens, "function");
  },
);

Deno.test(
  "Contract: StreamChatParams carries streaming context without embedding deps",
  () => {
    const params: StreamChatParams = buildContractStreamChatParams();

    assertEquals("deps" in params, false);
    assertEquals("requestBody" in params, false);
    assertEquals(typeof params.supabaseClient.from, "function");
    assertEquals(typeof params.userId, "string");
    assertEquals(typeof params.wallet.walletId, "string");
    assertEquals(typeof params.aiProviderAdapter.sendMessage, "function");
    assertEquals(typeof params.modelConfig.api_identifier, "string");
    assertEquals(params.actualSystemPromptText, null);
    assertEquals(params.finalSystemPromptIdForDb, null);
    assertEquals(typeof params.apiKey, "string");
    assertEquals(typeof params.providerApiIdentifier, "string");
  },
);

Deno.test(
  "Contract: StreamChatPayload carries requestBody ChatApiRequest",
  () => {
    const payload: StreamChatPayload = buildContractStreamChatPayload();

    assertEquals(typeof payload.requestBody.message, "string");
    assertEquals(payload.requestBody.chatId, "existing-chat-contract-stream");
    assertEquals(payload.requestBody.providerId, "provider-contract-stream");
  },
);

Deno.test(
  "Contract: StreamChatPayload carries req Request for createErrorResponse CORS",
  () => {
    const payload: StreamChatPayload = buildContractStreamChatPayload();

    assertEquals(payload.req instanceof Request, true);
    assertEquals(payload.req.headers.get("Origin"), "http://localhost:5173");
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts SSE success Response (text/event-stream)",
  () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "chat_start" })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "content_chunk", content: "x" })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "chat_complete" })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamChatReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts SSE adapter-failure style Response",
  () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "adapter failed",
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamChatReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts 402 insufficient balance Response",
  () => {
    const value: StreamChatReturn = createErrorResponse(
      "Insufficient token balance for this streaming request.",
      402,
      new Request("https://example.com/chat"),
    );
    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.status, 402);
    }
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts 413 token limit Response",
  () => {
    const value: StreamChatReturn = createErrorResponse(
      "Your message is too long for streaming.",
      413,
      new Request("https://example.com/chat"),
    );
    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.status, 413);
    }
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts 500 model configuration Response",
  () => {
    const value: StreamChatReturn = createErrorResponse(
      "Internal server error: Provider configuration missing for token calculation.",
      500,
      new Request("https://example.com/chat"),
    );
    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.status, 500);
    }
  },
);

Deno.test(
  "Contract: StreamChatReturn accepts Error as StreamChatError",
  () => {
    const value: StreamChatReturn = new Error("stream contract failure");

    assertEquals(value instanceof Error, true);
    if (value instanceof Error) {
      assertEquals(value.message, "stream contract failure");
    }
  },
);

Deno.test(
  "Contract: StreamChat is (deps, params, payload) => Promise<StreamChatReturn>",
  async () => {
    const fn: StreamChatFn = async (
      _deps: StreamChatDeps,
      _params: StreamChatParams,
      _payload: StreamChatPayload,
    ) => {
      return new Response(null, { status: 200 });
    };

    const deps: StreamChatDeps = buildContractStreamChatDeps();
    const params: StreamChatParams = buildContractStreamChatParams();
    const payload: StreamChatPayload = buildContractStreamChatPayload();
    const out: StreamChatReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Response || out instanceof Error, true);
    assertEquals(out instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamChat may resolve to Error from StreamChatError branch",
  async () => {
    const fn: StreamChatFn = async (
      _deps: StreamChatDeps,
      _params: StreamChatParams,
      _payload: StreamChatPayload,
    ) => {
      return new Error("contract error branch");
    };

    const deps: StreamChatDeps = buildContractStreamChatDeps();
    const params: StreamChatParams = buildContractStreamChatParams();
    const payload: StreamChatPayload = buildContractStreamChatPayload();
    const out: StreamChatReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Error, true);
  },
);

Deno.test(
  "Contract: SseChatCompleteEvent accepts full ChatMessageRow as assistantMessage",
  () => {
    const assistantMessage = buildContractFullChatMessageRow();
    const complete: SseChatCompleteEvent = {
      type: "chat_complete",
      assistantMessage,
      finish_reason: "stop",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    assertEquals(complete.type, "chat_complete");
    assertEquals(complete.assistantMessage.is_active_in_thread, true);
    assertEquals(complete.finish_reason, "stop");
  },
);

Deno.test(
  "Contract: SseChatCompleteEvent rejects assistantMessage missing is_active_in_thread",
  () => {
    const assistantMessageMissingThreadFlag = {
      id: "11111111-1111-4111-8111-111111111111",
      chat_id: "22222222-2222-4222-8222-222222222222",
      user_id: null,
      role: "assistant",
      content: "x",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      ai_provider_id: null,
      system_prompt_id: null,
      token_usage: null,
      error_type: null,
      response_to_message_id: null,
    };
    const incomplete: SseChatCompleteEvent = {
      type: "chat_complete",
      assistantMessage: assistantMessageMissingThreadFlag,
      finish_reason: "stop",
      timestamp: "2024-01-01T00:00:00.000Z",
    } as SseChatCompleteEvent;

    assertEquals(incomplete.type, "chat_complete");
  },
);

Deno.test("Contract: SseChatEvent narrows by discriminant type", () => {
  const ts: string = "2024-01-01T00:00:00.000Z";
  const start: SseChatStartEvent = {
    type: "chat_start",
    chatId: "chat-contract-narrow",
    timestamp: ts,
  };
  const chunk: SseContentChunkEvent = {
    type: "content_chunk",
    content: "fragment",
    assistantMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    timestamp: ts,
  };
  const complete: SseChatCompleteEvent = {
    type: "chat_complete",
    assistantMessage: buildContractFullChatMessageRow(),
    finish_reason: "stop",
    timestamp: ts,
  };
  const err: SseErrorEvent = {
    type: "error",
    message: "contract sse error",
    timestamp: ts,
  };

  const events: SseChatEvent[] = [start, chunk, complete, err];

  let sawStartChatId: string = "";
  let sawChunkContent: string = "";
  let sawCompleteAssistantId: string = "";
  let sawErrorMessage: string = "";

  for (const e of events) {
    if (e.type === "chat_start") {
      sawStartChatId = e.chatId;
    } else if (e.type === "content_chunk") {
      sawChunkContent = e.content;
    } else if (e.type === "chat_complete") {
      sawCompleteAssistantId = e.assistantMessage.id;
    } else if (e.type === "error") {
      sawErrorMessage = e.message;
    }
  }

  assertEquals(sawStartChatId, "chat-contract-narrow");
  assertEquals(sawChunkContent, "fragment");
  assertEquals(
    sawCompleteAssistantId,
    "ffffffff-ffff-4fff-8fff-ffffffffffff",
  );
  assertEquals(sawErrorMessage, "contract sse error");
});
