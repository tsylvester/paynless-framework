import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import {
  asSupabaseAdminClientForTests,
  createMockAdminTokenWalletService,
} from "../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { GetUserFn, GetUserFnResult } from "../_shared/types.ts";
import { Database } from "../types_db.ts";
import {
  buildContractStreamRequestDeps,
  createMockStreamRequest,
} from "./streamRequest/streamRequest.mock.ts";
import {
  ChatDeps,
  ChatError,
  ChatParams,
  ChatPayload,
  ChatReturn,
  ChatSuccess,
  ChatFn,
} from "./index.interface.ts";

Deno.test(
  "Contract: ChatDeps exposes logger, wallet services, streamRequest, CORS, chat pipeline callables",
  () => {
    const streamRequestDeps = buildContractStreamRequestDeps();
    const mockAdminWallet = createMockAdminTokenWalletService();
    const mockUserWallet = createMockUserTokenWalletService();
    const deps: ChatDeps = {
      logger: streamRequestDeps.logger,
      adminTokenWalletService: mockAdminWallet.instance,
      userTokenWalletService: mockUserWallet.instance,
      streamRequest: createMockStreamRequest(),
      handleCorsPreflightRequest,
      createSuccessResponse,
      createErrorResponse,
      prepareChatContext: streamRequestDeps.prepareChatContext,
      countTokens: streamRequestDeps.countTokens,
      debitTokens: streamRequestDeps.debitTokens,
      getMaxOutputTokens: streamRequestDeps.getMaxOutputTokens,
      findOrCreateChat: streamRequestDeps.findOrCreateChat,
      constructMessageHistory: streamRequestDeps.constructMessageHistory,
      getAiProviderAdapter: streamRequestDeps.getAiProviderAdapter,
    };

    assertEquals("logger" in deps, true);
    assertEquals("adminTokenWalletService" in deps, true);
    assertEquals("userTokenWalletService" in deps, true);
    assertEquals("streamRequest" in deps, true);
    assertEquals("handleCorsPreflightRequest" in deps, true);
    assertEquals("createSuccessResponse" in deps, true);
    assertEquals("createErrorResponse" in deps, true);
    assertEquals("prepareChatContext" in deps, true);
    assertEquals("countTokens" in deps, true);
    assertEquals("debitTokens" in deps, true);
    assertEquals("getMaxOutputTokens" in deps, true);
    assertEquals("findOrCreateChat" in deps, true);
    assertEquals("constructMessageHistory" in deps, true);
    assertEquals("getAiProviderAdapter" in deps, true);

    assertEquals(typeof deps.logger.info, "function");
    assertEquals(typeof deps.adminTokenWalletService.recordTransaction, "function");
    assertEquals(typeof deps.userTokenWalletService.getWalletByIdAndUser, "function");
    assertEquals(typeof deps.streamRequest, "function");
    assertEquals(typeof deps.handleCorsPreflightRequest, "function");
    assertEquals(typeof deps.createSuccessResponse, "function");
    assertEquals(typeof deps.createErrorResponse, "function");
    assertEquals(typeof deps.prepareChatContext, "function");
    assertEquals(typeof deps.countTokens, "function");
    assertEquals(typeof deps.debitTokens, "function");
    assertEquals(typeof deps.getMaxOutputTokens, "function");
    assertEquals(typeof deps.findOrCreateChat, "function");
    assertEquals(typeof deps.constructMessageHistory, "function");
    assertEquals(typeof deps.getAiProviderAdapter, "function");
  },
);

Deno.test(
  "Contract: ChatParams carries Supabase clients and getUserFn without embedding ChatDeps",
  () => {
    const userSetup = createMockSupabaseClient("chat-contract-user", {});
    const adminSetup = createMockSupabaseClient("chat-contract-admin", {});
    const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
      userSetup.client,
    );
    const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
      adminSetup.client,
    );
    const getUserFn: GetUserFn = async (): Promise<GetUserFnResult> => {
      return { data: { user: null }, error: null };
    };
    const params: ChatParams = {
      userClient,
      adminClient,
      getUserFn,
    };

    assertEquals("deps" in params, false);
    assertEquals(typeof params.userClient.from, "function");
    assertEquals(typeof params.adminClient.from, "function");
    assertEquals(typeof params.getUserFn, "function");
  },
);

Deno.test(
  "Contract: ChatPayload carries raw Request with method, headers, and json",
  async () => {
    const req: Request = new Request("https://example.com/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    const payload: ChatPayload = { req };

    assertEquals(typeof payload.req.method, "string");
    assertEquals(typeof payload.req.headers.get, "function");
    const parsed: { ping: boolean } = await payload.req.json();
    assertEquals(parsed.ping, true);
  },
);

Deno.test(
  "Contract: ChatSuccess accepts Response including SSE, JSON, CORS, and error HTTP responses",
  () => {
    const encoder: TextEncoder = new TextEncoder();
    const sse: Response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chat_index_contract" })}\n\n`,
            ),
          );
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const jsonOk: Response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const corsProbe: Request = new Request("https://example.com/chat", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    const corsResponse: Response | null = handleCorsPreflightRequest(corsProbe);
    const errorHttp: Response = createErrorResponse("too large", 413, corsProbe);

    const a: ChatSuccess = sse;
    const b: ChatSuccess = jsonOk;
    const c: ChatSuccess = errorHttp;
    assertEquals(a.headers.get("Content-Type"), "text/event-stream");
    assertEquals(b.status, 200);
    assertEquals(c.status, 413);
    if (corsResponse !== null) {
      const d: ChatSuccess = corsResponse;
      assertEquals(d.status, 204);
    }
  },
);

Deno.test("Contract: ChatError is an Error with a message", () => {
  const err: ChatError = new Error("chat boundary contract failure");
  assertEquals(err instanceof Error, true);
  assertEquals(typeof err.message, "string");
  assertEquals(err.message, "chat boundary contract failure");
});

Deno.test("Contract: ChatReturn accepts ChatSuccess", () => {
  const ok: ChatSuccess = new Response(null, { status: 204 });
  const out: ChatReturn = ok;
  assertEquals(out instanceof Response, true);
});

Deno.test("Contract: ChatReturn accepts ChatError", () => {
  const fail: ChatError = new Error("chat return error branch");
  const out: ChatReturn = fail;
  assertEquals(out instanceof Error, true);
});

Deno.test(
  "Contract: Chat is (deps, params, payload) => Promise<ChatReturn>",
  async () => {
    const contractChat: ChatFn = async (
      deps: ChatDeps,
      params: ChatParams,
      payload: ChatPayload,
    ): Promise<ChatReturn> => {
      const preflight: Response | null = deps.handleCorsPreflightRequest(
        payload.req,
      );
      if (preflight !== null) {
        return preflight;
      }
      const auth: GetUserFnResult = await params.getUserFn();
      if (auth.error !== null || auth.data.user === null) {
        return deps.createErrorResponse("unauthorized", 401, payload.req);
      }
      return deps.streamRequest(
        buildContractStreamRequestDeps(),
        {
          supabaseClient: params.userClient,
          userId: auth.data.user.id,
          userTokenWalletService: deps.userTokenWalletService,
        },
        { req: payload.req },
      );
    };

    const streamRequestDeps = buildContractStreamRequestDeps();
    const mockAdminWallet = createMockAdminTokenWalletService();
    const mockUserWallet = createMockUserTokenWalletService();
    const deps: ChatDeps = {
      logger: streamRequestDeps.logger,
      adminTokenWalletService: mockAdminWallet.instance,
      userTokenWalletService: mockUserWallet.instance,
      streamRequest: createMockStreamRequest(),
      handleCorsPreflightRequest,
      createSuccessResponse,
      createErrorResponse,
      prepareChatContext: streamRequestDeps.prepareChatContext,
      countTokens: streamRequestDeps.countTokens,
      debitTokens: streamRequestDeps.debitTokens,
      getMaxOutputTokens: streamRequestDeps.getMaxOutputTokens,
      findOrCreateChat: streamRequestDeps.findOrCreateChat,
      constructMessageHistory: streamRequestDeps.constructMessageHistory,
      getAiProviderAdapter: streamRequestDeps.getAiProviderAdapter,
    };

    const userSetup = createMockSupabaseClient("chat-contract-fn-user", {});
    const adminSetup = createMockSupabaseClient("chat-contract-fn-admin", {});
    const params: ChatParams = {
      userClient: asSupabaseAdminClientForTests(userSetup.client),
      adminClient: asSupabaseAdminClientForTests(adminSetup.client),
      getUserFn: async (): Promise<GetUserFnResult> => ({
        data: { user: null },
        error: null,
      }),
    };

    const payload: ChatPayload = {
      req: new Request("https://example.com/chat", { method: "GET" }),
    };

    const result: ChatReturn = await contractChat(deps, params, payload);
    assertEquals(result instanceof Response, true);
  },
);
