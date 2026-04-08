import { assertEquals } from "jsr:@std/assert@0.225.3";
import { createErrorResponse } from "../../_shared/cors-headers.ts";
import {
  buildContractStreamChatDeps,
  buildContractStreamChatParams,
  buildContractStreamChatPayload,
} from "./streamChat.mock.ts";
import {
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
