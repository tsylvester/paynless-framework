import {
  assert,
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCall } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { createErrorResponse } from "../_shared/cors-headers.ts";
import { DummyAdapter } from "../_shared/ai_service/dummy_adapter.ts";
import {
  defaultProviderMap,
  testProviderMap,
} from "../_shared/ai_service/factory.ts";
import { Tables } from "../types_db.ts";
import { handler, defaultDeps } from "./index.ts";
import { ChatPayload, ChatReturn } from "./index.interface.ts";
import {
  buildAuthenticatedChatHandlerUnitParams,
  buildContractChatHandlerUnitDeps,
  buildDeleteChatHandlerUnitParams,
  buildInvalidJwtChatHandlerUnitParams,
  buildUnauthenticatedChatHandlerUnitParams,
  CHAT_HANDLER_UNIT_TEST_CHAT_ID,
  CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
  CHAT_HANDLER_UNIT_TEST_PROMPT_ID,
  CHAT_HANDLER_UNIT_TEST_USER_ID,
  createRecordingStreamRequest,
} from "./index.mock.ts";
import {
  StreamRequest,
  StreamRequestReturn,
} from "./streamRequest/streamRequest.interface.ts";
import { createMockStreamRequest } from "./streamRequest/streamRequest.provides.ts";

Deno.test("Chat Service Handler", async (t) => {
  await t.step("General: should handle CORS preflight OPTIONS request", async () => {
    const recording = createRecordingStreamRequest();
    const deps = buildContractChatHandlerUnitDeps({
      streamRequest: recording.streamRequest,
    });
    const { params } = buildAuthenticatedChatHandlerUnitParams();
    const payload: ChatPayload = {
      req: new Request("http://localhost/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
    };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(res.status, 204);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "http://localhost:5173",
    );
    assertEquals(recording.getLastCall(), null);
  });

  await t.step(
    "General: should return 401 for requests without an auth header",
    async () => {
      const recording = createRecordingStreamRequest();
      const deps = buildContractChatHandlerUnitDeps({
        streamRequest: recording.streamRequest,
      });
      const { params } = buildUnauthenticatedChatHandlerUnitParams();
      const payload: ChatPayload = {
        req: new Request("http://localhost/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Hi" }),
          headers: { "Content-Type": "application/json" },
        }),
      };
      const res: ChatReturn = await handler(deps, params, payload);
      if (res instanceof Error) {
        throw new Error(
          `expected ChatSuccess (Response), got ChatError: ${res.message}`,
        );
      }
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Authentication required");
      assertEquals(body.code, "AUTH_REQUIRED");
      assertEquals(recording.getLastCall(), null);
    },
  );

  await t.step(
    "General: should return 401 for invalid authentication credentials",
    async () => {
      const recording = createRecordingStreamRequest();
      const deps = buildContractChatHandlerUnitDeps({
        streamRequest: recording.streamRequest,
      });
      const { params } = buildInvalidJwtChatHandlerUnitParams();
      const payload: ChatPayload = {
        req: new Request("http://localhost/chat", {
          method: "POST",
          body: JSON.stringify({
            message: "Hi",
            providerId: CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
            promptId: CHAT_HANDLER_UNIT_TEST_PROMPT_ID,
          }),
          headers: {
            Authorization: "Bearer invalid-token",
            "Content-Type": "application/json",
          },
        }),
      };
      const res: ChatReturn = await handler(deps, params, payload);
      if (res instanceof Error) {
        throw new Error(
          `expected ChatSuccess (Response), got ChatError: ${res.message}`,
        );
      }
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Authentication required");
      assertEquals(recording.getLastCall(), null);
    },
  );

  await t.step("POST: should return 400 for invalid JSON", async () => {
    const { params } = buildAuthenticatedChatHandlerUnitParams();
    const req = new Request("http://localhost/chat", {
      method: "POST",
      body: "{ not json }",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    });
    const jsonError = createErrorResponse(
      "Invalid JSON format in request body.",
      400,
      req,
    );
    const jsonOutcome: StreamRequestReturn = jsonError;
    const inner: StreamRequest = createMockStreamRequest({
      outcome: jsonOutcome,
    });
    let lastCall: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } | null = null;
    const streamRequest: StreamRequest = async (
      streamDeps,
      streamParams,
      streamPayload,
    ) => {
      lastCall = { deps: streamDeps, streamParams, payload: streamPayload };
      return inner(streamDeps, streamParams, streamPayload);
    };
    const deps = buildContractChatHandlerUnitDeps({ streamRequest });
    const payload: ChatPayload = { req };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(lastCall !== null, true);
    if (lastCall === null) {
      throw new Error("expected streamRequest to be invoked");
    }
    const captured: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } = lastCall;
    assertEquals(captured.payload.req, req);
    assertEquals(captured.streamParams.userId, CHAT_HANDLER_UNIT_TEST_USER_ID);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Invalid JSON format in request body.");
  });

  await t.step("POST: should return 400 for schema validation failure", async () => {
    const { params } = buildAuthenticatedChatHandlerUnitParams();
    const req = new Request("http://localhost/chat", {
      method: "POST",
      body: JSON.stringify({ invalid_prop: "some value" }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    });
    const schemaError = createErrorResponse(
      "Invalid request body: contract schema failure",
      400,
      req,
    );
    const schemaOutcome: StreamRequestReturn = schemaError;
    const inner: StreamRequest = createMockStreamRequest({
      outcome: schemaOutcome,
    });
    let lastCall: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } | null = null;
    const streamRequest: StreamRequest = async (
      streamDeps,
      streamParams,
      streamPayload,
    ) => {
      lastCall = { deps: streamDeps, streamParams, payload: streamPayload };
      return inner(streamDeps, streamParams, streamPayload);
    };
    const deps = buildContractChatHandlerUnitDeps({ streamRequest });
    const payload: ChatPayload = { req };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(lastCall !== null, true);
    if (lastCall === null) {
      throw new Error("expected streamRequest to be invoked");
    }
    const capturedSchema: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } = lastCall;
    assertEquals(capturedSchema.payload.req, req);
    assertEquals(
      capturedSchema.streamParams.userId,
      CHAT_HANDLER_UNIT_TEST_USER_ID,
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assert(body.error.startsWith("Invalid request body:"));
  });

  await t.step("POST: should successfully process a valid request", async () => {
    const { params } = buildAuthenticatedChatHandlerUnitParams();
    const req = new Request("http://localhost/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Hi",
        providerId: CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
        promptId: CHAT_HANDLER_UNIT_TEST_PROMPT_ID,
      }),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    });
    const encoder: TextEncoder = new TextEncoder();
    const sseStream: ReadableStream<Uint8Array> = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "chat_complete",
              chatId: CHAT_HANDLER_UNIT_TEST_CHAT_ID,
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const sseOk: Response = new Response(sseStream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
    const sseOutcome: StreamRequestReturn = sseOk;
    const inner: StreamRequest = createMockStreamRequest({
      outcome: sseOutcome,
    });
    let lastCall: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } | null = null;
    const streamRequest: StreamRequest = async (
      streamDeps,
      streamParams,
      streamPayload,
    ) => {
      lastCall = { deps: streamDeps, streamParams, payload: streamPayload };
      return inner(streamDeps, streamParams, streamPayload);
    };
    const deps = buildContractChatHandlerUnitDeps({ streamRequest });
    const payload: ChatPayload = { req };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(lastCall !== null, true);
    if (lastCall === null) {
      throw new Error("expected streamRequest to be invoked");
    }
    const capturedSse: {
      deps: Parameters<StreamRequest>[0];
      streamParams: Parameters<StreamRequest>[1];
      payload: Parameters<StreamRequest>[2];
    } = lastCall;
    assertEquals(capturedSse.payload.req, req);
    assertEquals(capturedSse.streamParams.userId, CHAT_HANDLER_UNIT_TEST_USER_ID);
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "text/event-stream");
  });

  await t.step("DELETE: should return 400 if chat ID is missing", async () => {
    const recording = createRecordingStreamRequest();
    const deps = buildContractChatHandlerUnitDeps({
      streamRequest: recording.streamRequest,
    });
    const { params } = buildAuthenticatedChatHandlerUnitParams();
    const payload: ChatPayload = {
      req: new Request("http://localhost/chat/", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-token" },
      }),
    };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(
      body.error,
      "Missing chat ID in URL path for DELETE request.",
    );
    assertEquals(recording.getLastCall(), null);
  });

  await t.step("DELETE: should successfully process a valid request", async () => {
    const recording = createRecordingStreamRequest();
    const deps = buildContractChatHandlerUnitDeps({
      streamRequest: recording.streamRequest,
    });
    const { params, userSetup } = buildDeleteChatHandlerUnitParams({
      rpcResults: {
        delete_chat_and_messages: { data: null, error: null },
      },
    });
    const rpcSpy = userSetup.spies.rpcSpy;
    const payload: ChatPayload = {
      req: new Request(
        `http://localhost/chat/${CHAT_HANDLER_UNIT_TEST_CHAT_ID}`,
        {
          method: "DELETE",
          headers: { Authorization: "Bearer test-token" },
        },
      ),
    };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(res.status, 204);
    assertSpyCall(rpcSpy, 0, {
      args: [
        "delete_chat_and_messages",
        {
          p_chat_id: CHAT_HANDLER_UNIT_TEST_CHAT_ID,
          p_user_id: CHAT_HANDLER_UNIT_TEST_USER_ID,
        },
      ],
    });
    assertEquals(recording.getLastCall(), null);
  });

  await t.step("DELETE: should return 403 on permission denied error", async () => {
    const recording = createRecordingStreamRequest();
    const deps = buildContractChatHandlerUnitDeps({
      streamRequest: recording.streamRequest,
    });
    const { params } = buildDeleteChatHandlerUnitParams({
      rpcResults: {
        delete_chat_and_messages: {
          error: {
            message: "permission denied for view",
            name: "PostgrestError",
          },
        },
      },
    });
    const payload: ChatPayload = {
      req: new Request(
        `http://localhost/chat/${CHAT_HANDLER_UNIT_TEST_CHAT_ID}`,
        {
          method: "DELETE",
          headers: { Authorization: "Bearer test-token" },
        },
      ),
    };
    const res: ChatReturn = await handler(deps, params, payload);
    if (res instanceof Error) {
      throw new Error(
        `expected ChatSuccess (Response), got ChatError: ${res.message}`,
      );
    }
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Permission denied to delete this chat.");
    assertEquals(recording.getLastCall(), null);
  });

  await t.step(
    "General: should return 405 for unsupported HTTP methods",
    async () => {
      const recording = createRecordingStreamRequest();
      const deps = buildContractChatHandlerUnitDeps({
        streamRequest: recording.streamRequest,
      });
      const { params } = buildAuthenticatedChatHandlerUnitParams();
      const payload: ChatPayload = {
        req: new Request("http://localhost/chat", {
          method: "PATCH",
          headers: { Authorization: "Bearer test-token" },
        }),
      };
      const res: ChatReturn = await handler(deps, params, payload);
      if (res instanceof Error) {
        throw new Error(
          `expected ChatSuccess (Response), got ChatError: ${res.message}`,
        );
      }
      assertEquals(res.status, 405);
      const body = await res.json();
      assertEquals(body.error, "Method Not Allowed");
      assertEquals(recording.getLastCall(), null);
    },
  );

  await t.step(
    "defaultDeps.getAiProviderAdapter should use the providerMap from dependencies",
    () => {
      const dummyProvider: Tables<"ai_providers"> = {
        id: "02e45bc4-c584-52a0-b647-77570c2208cd",
        api_identifier: "dummy-echo-v1",
        name: "Dummy Echo v1",
        provider: "dummy",
        config: {
          mode: "echo",
          modelId: "dummy-echo-v1",
          api_identifier: "dummy-echo-v1",
          basePromptTokens: 2,
          input_token_cost_rate: 1,
          tokenization_strategy: {
            type: "tiktoken",
            tiktoken_encoding_name: "cl100k_base",
          },
          output_token_cost_rate: 1,
          provider_max_input_tokens: 4096,
          provider_max_output_tokens: 4096,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        description: "Dummy provider for testing",
      };

      const adapter = defaultDeps.getAiProviderAdapter({
        provider: dummyProvider,
        apiKey: "test-key",
        logger: defaultDeps.logger,
        providerMap: testProviderMap,
      });

      assertInstanceOf(adapter, DummyAdapter);
    },
  );

  await t.step(
    "handler should inject testProviderMap when X-Test-Mode header is present",
    async () => {
      const recording = createRecordingStreamRequest();
      const base = buildContractChatHandlerUnitDeps({
        streamRequest: recording.streamRequest,
      });
      const deps = {
        ...base,
        getAiProviderAdapter: defaultDeps.getAiProviderAdapter,
      };
      const { params } = buildAuthenticatedChatHandlerUnitParams();
      const openAiProvider: Tables<"ai_providers"> = {
        id: CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
        api_identifier: "openai-gpt-4o",
        provider: "openai",
        name: "Test OpenAI",
        config: {
          api_identifier: "openai-gpt-4o",
          tokenization_strategy: {
            type: "tiktoken",
            tiktoken_encoding_name: "cl100k_base",
          },
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0.002,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        is_default_embedding: false,
        is_default_generation: false,
        is_enabled: true,
        description: "Test provider",
      };

      const req = new Request("http://localhost/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Hi",
          providerId: CHAT_HANDLER_UNIT_TEST_PROVIDER_ID,
          promptId: CHAT_HANDLER_UNIT_TEST_PROMPT_ID,
        }),
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          "X-Test-Mode": "true",
        },
      });
      const payload: ChatPayload = { req };
      const returned: ChatReturn = await handler(deps, params, payload);
      if (returned instanceof Error) {
        throw new Error(
          `expected ChatSuccess (Response), got ChatError: ${returned.message}`,
        );
      }

      const last = recording.getLastCall();
      assertEquals(last !== null, true);
      if (last === null) {
        throw new Error("expected streamRequest to be invoked");
      }
      const capturedTestMode: {
        deps: Parameters<StreamRequest>[0];
        streamParams: Parameters<StreamRequest>[1];
        payload: Parameters<StreamRequest>[2];
      } = last;
      assertEquals(capturedTestMode.payload.req, req);
      assertEquals(
        capturedTestMode.streamParams.userId,
        CHAT_HANDLER_UNIT_TEST_USER_ID,
      );
      const adapter = capturedTestMode.deps.getAiProviderAdapter({
        provider: openAiProvider,
        apiKey: "test-key",
        logger: defaultDeps.logger,
        providerMap: defaultProviderMap,
      });
      assertInstanceOf(
        adapter,
        DummyAdapter,
        "The injected getAiProviderAdapter should have returned a DummyAdapter for a real provider",
      );
    },
  );
});
