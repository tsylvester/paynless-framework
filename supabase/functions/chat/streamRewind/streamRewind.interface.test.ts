import { assertEquals } from "jsr:@std/assert@0.225.3";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import {
  buildContractStreamRewindDeps,
  buildContractStreamRewindParams,
  buildContractStreamRewindPayload,
  buildContractStreamRewindPayloadWithoutChatId,
} from "./streamRewind.mock.ts";
import {
  StreamRewind,
  StreamRewindDeps,
  StreamRewindParams,
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";

Deno.test(
  "Contract: StreamRewindDeps includes adminTokenWalletService and injected callables",
  () => {
    const deps: StreamRewindDeps = buildContractStreamRewindDeps();

    assertEquals("logger" in deps, true);
    assertEquals("adminTokenWalletService" in deps, true);
    assertEquals("countTokens" in deps, true);
    assertEquals("debitTokens" in deps, true);
    assertEquals("createErrorResponse" in deps, true);
    assertEquals("getMaxOutputTokens" in deps, true);

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(
      typeof deps.adminTokenWalletService.recordTransaction,
      "function",
    );
    assertEquals(typeof deps.countTokens, "function");
    assertEquals(typeof deps.debitTokens, "function");
    assertEquals(typeof deps.createErrorResponse, "function");
    assertEquals(typeof deps.getMaxOutputTokens, "function");
  },
);

Deno.test(
  "Contract: StreamRewindParams carries rewind context without embedding deps or requestBody",
  () => {
    const params: StreamRewindParams = buildContractStreamRewindParams();

    assertEquals("deps" in params, false);
    assertEquals("requestBody" in params, false);
    assertEquals(typeof params.supabaseClient.from, "function");
    assertEquals(typeof params.userId, "string");
    assertEquals(typeof params.wallet.walletId, "string");
    assertEquals(typeof params.aiProviderAdapter.sendMessage, "function");
    assertEquals(typeof params.modelConfig.api_identifier, "string");
    assertEquals(params.actualSystemPromptText, null);
    assertEquals(params.finalSystemPromptIdForDb, null);
  },
);

Deno.test(
  "Contract: StreamRewindPayload carries requestBody ChatApiRequest",
  () => {
    const payload: StreamRewindPayload = buildContractStreamRewindPayload();

    assertEquals(typeof payload.requestBody.message, "string");
    assertEquals(
      payload.requestBody.chatId,
      "existing-chat-contract-rewind",
    );
    assertEquals(
      payload.requestBody.rewindFromMessageId,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  },
);

Deno.test(
  "Contract: StreamRewindPayload carries req Request for createErrorResponse CORS",
  () => {
    const base: StreamRewindPayload = buildContractStreamRewindPayload();
    const req: Request = new Request("https://example.com/contract-rewind", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });
    const payload: StreamRewindPayload = {
      requestBody: base.requestBody,
      req,
    };

    assertEquals(payload.req instanceof Request, true);
    assertEquals(payload.req.headers.get("Origin"), "http://localhost:5173");
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts happy-path SSE Response with chat_start, content_chunk, chat_complete including userMessage, assistantMessage, chatId",
  () => {
    const encoder: TextEncoder = new TextEncoder();
    const chatId: string = "existing-chat-contract-rewind";
    const userMessage: { id: string; role: string } = {
      id: "user-msg-contract",
      role: "user",
    };
    const assistantMessage: { id: string; role: string } = {
      id: "asst-msg-contract",
      role: "assistant",
    };
    const stream: ReadableStream<Uint8Array> = new ReadableStream<
      Uint8Array
    >({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_start",
              chatId,
              userMessage,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "content_chunk",
              content: "chunk",
              assistantMessageId: assistantMessage.id,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_complete",
              chatId,
              assistantMessage,
              finish_reason: "stop",
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamRewindReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts 400 Response when chatId is missing",
  () => {
    const withoutChat: StreamRewindPayload =
      buildContractStreamRewindPayloadWithoutChatId();
    const req: Request = new Request("https://example.com/chat", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });
    const payload: StreamRewindPayload = {
      requestBody: withoutChat.requestBody,
      req,
    };
    assertEquals(payload.requestBody.chatId, undefined);

    const value: StreamRewindReturn = createErrorResponse(
      'Cannot perform rewind without a "chatId"',
      400,
      payload.req,
    );
    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.status, 400);
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts 404 Response when rewind point is not found",
  () => {
    const value: StreamRewindReturn = createErrorResponse(
      "Rewind point message with ID x not found in chat y",
      404,
      new Request("https://example.com/chat"),
    );
    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.status, 404);
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts SSE Response with error event after AI adapter failure",
  () => {
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream<
      Uint8Array
    >({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "adapter failed",
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamRewindReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts 402 Response when balance is insufficient",
  () => {
    const value: StreamRewindReturn = createErrorResponse(
      "Insufficient token balance. You cannot generate a response.",
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
  "Contract: StreamRewindReturn accepts SSE Response with error event when debitTokens fails",
  () => {
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream<
      Uint8Array
    >({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "debitTokens rejected",
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamRewindReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts SSE Response with error event when perform_chat_rewind RPC fails",
  () => {
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream<
      Uint8Array
    >({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "perform_chat_rewind RPC failed",
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const value: StreamRewindReturn = new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    assertEquals(value instanceof Response, true);
    if (value instanceof Response) {
      assertEquals(value.headers.get("Content-Type"), "text/event-stream");
    }
  },
);

Deno.test(
  "Contract: StreamRewindReturn accepts Error as error branch",
  () => {
    const value: StreamRewindReturn = new Error("stream rewind contract failure");

    assertEquals(value instanceof Error, true);
    if (value instanceof Error) {
      assertEquals(value.message, "stream rewind contract failure");
    }
  },
);

Deno.test(
  "Contract: StreamRewind is (deps, params, payload) => Promise<StreamRewindReturn>",
  async () => {
    const fn: StreamRewind = async (
      _deps: StreamRewindDeps,
      _params: StreamRewindParams,
      _payload: StreamRewindPayload,
    ) => {
      return new Response(null, { status: 200 });
    };

    const deps: StreamRewindDeps = buildContractStreamRewindDeps();
    const params: StreamRewindParams = buildContractStreamRewindParams();
    const payload: StreamRewindPayload = buildContractStreamRewindPayload();
    const out: StreamRewindReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Response || out instanceof Error, true);
    assertEquals(out instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRewind may resolve to Error from error branch",
  async () => {
    const fn: StreamRewind = async (
      _deps: StreamRewindDeps,
      _params: StreamRewindParams,
      _payload: StreamRewindPayload,
    ) => {
      return new Error("contract rewind error branch");
    };

    const deps: StreamRewindDeps = buildContractStreamRewindDeps();
    const params: StreamRewindParams = buildContractStreamRewindParams();
    const requestBody: ChatApiRequest = {
      message: "contract rewind message",
      providerId: "provider-contract-rewind",
      promptId: "__none__",
      chatId: "existing-chat-contract-rewind",
      walletId: "wallet-contract-rewind",
      rewindFromMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const req: Request = new Request("https://example.com/contract-rewind", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });
    const payload: StreamRewindPayload = { requestBody, req };
    const out: StreamRewindReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Error, true);
  },
);
