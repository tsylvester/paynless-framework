import { assertEquals } from "jsr:@std/assert@0.225.3";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";
import {
  StreamRequest,
  StreamRequestDeps,
  StreamRequestError,
  StreamRequestParams,
  StreamRequestPayload,
  StreamRequestReturn,
  StreamRequestSuccess,
} from "./streamRequest.interface.ts";
import {
  buildContractStreamRequestDeps,
  buildContractStreamRequestPostRequest,
} from "./streamRequest.mock.ts";

const contractChatApiRequest: ChatApiRequest = {
  message: "stream-request-contract-message",
  providerId: "00000000-0000-4000-8000-000000000001",
  promptId: "__none__",
  chatId: "00000000-0000-4000-8000-000000000002",
  walletId: "00000000-0000-4000-8000-000000000003",
};

Deno.test(
  "Contract: StreamRequestDeps supplies required callables including streamChat and streamRewind",
  () => {
    const deps: StreamRequestDeps = buildContractStreamRequestDeps();

    assertEquals(typeof deps.logger, "object");
    assertEquals(typeof deps.adminTokenWalletService, "object");
    assertEquals(typeof deps.getAiProviderAdapter, "function");
    assertEquals(typeof deps.prepareChatContext, "function");
    assertEquals(typeof deps.streamChat, "function");
    assertEquals(typeof deps.streamRewind, "function");
    assertEquals(typeof deps.createErrorResponse, "function");
    assertEquals(typeof deps.countTokens, "function");
    assertEquals(typeof deps.debitTokens, "function");
    assertEquals(typeof deps.getMaxOutputTokens, "function");
    assertEquals(typeof deps.findOrCreateChat, "function");
    assertEquals(typeof deps.constructMessageHistory, "function");
  },
);

Deno.test(
  "Contract: StreamRequestParams has supabaseClient userId userTokenWalletService with expected surfaces",
  () => {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("stream-request-contract-params", {});
    const supabaseClient: SupabaseClient<Database> =
      asSupabaseAdminClientForTests(mockSetup.client);
    const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
      createMockUserTokenWalletService();
    const params: StreamRequestParams = {
      supabaseClient,
      userId: "stream-request-contract-params-user",
      userTokenWalletService: mockUserWallet.instance,
    };

    assertEquals(typeof params.supabaseClient.from, "function");
    assertEquals(typeof params.userId, "string");
    assertEquals(typeof params.userTokenWalletService.getWalletByIdAndUser, "function");
    assertEquals(typeof params.userTokenWalletService.getWalletForContext, "function");
  },
);

Deno.test(
  "Contract: StreamRequestSuccess is assignable from ok Response with text/event-stream",
  () => {
    const sse: StreamRequestSuccess = new Response(null, {
      headers: { "Content-Type": "text/event-stream" },
    });
    assertEquals(sse instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRequestReturn is assignable from non-ok HTTP Response (402)",
  () => {
    const value: StreamRequestReturn = new Response(null, { status: 402 });
    assertEquals(value instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRequestReturn is assignable from non-ok HTTP Response (413)",
  () => {
    const value: StreamRequestReturn = new Response(null, { status: 413 });
    assertEquals(value instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRequestReturn is assignable from non-ok HTTP Response (500)",
  () => {
    const value: StreamRequestReturn = new Response(null, { status: 500 });
    assertEquals(value instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRequestError is assignable from Error",
  () => {
    const e: StreamRequestError = new Error("contract stream request error");
    assertEquals(e instanceof Error, true);
  },
);

Deno.test(
  "Contract: StreamRequestReturn is assignable from ok Response",
  () => {
    const sse: StreamRequestReturn = new Response(null, {
      headers: { "Content-Type": "text/event-stream" },
    });
    assertEquals(sse instanceof Response, true);
  },
);

Deno.test(
  "Contract: StreamRequestReturn is assignable from StreamRequestError",
  () => {
    const err: StreamRequestError = new Error("contract stream request return error");
    const out: StreamRequestReturn = err;
    assertEquals(out instanceof Error, true);
    if (!(out instanceof Error)) {
      throw new Error("contract: expected Error branch of StreamRequestReturn");
    }
    const errOut: StreamRequestError = out;
    assertEquals(errOut.message, "contract stream request return error");
  },
);

Deno.test(
  "Contract: StreamRequest is (deps, params, payload) => Promise<StreamRequestReturn>",
  async () => {
    const fn: StreamRequest = async (
      _deps: StreamRequestDeps,
      _params: StreamRequestParams,
      _payload: StreamRequestPayload,
    ): Promise<StreamRequestReturn> => {
      return new Response(null, {
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    const deps: StreamRequestDeps = buildContractStreamRequestDeps();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("stream-request-fn-signature", {});
    const supabaseClient: SupabaseClient<Database> =
      asSupabaseAdminClientForTests(mockSetup.client);
    const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
      createMockUserTokenWalletService();
    const params: StreamRequestParams = {
      supabaseClient,
      userId: "stream-request-fn-signature-user",
      userTokenWalletService: mockUserWallet.instance,
    };
    const payload: StreamRequestPayload = {
      req: buildContractStreamRequestPostRequest(contractChatApiRequest),
    };

    const out: StreamRequestReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Response || out instanceof Error, true);
  },
);

Deno.test(
  "Contract: StreamRequest may resolve to StreamRequestError",
  async () => {
    const message: string = "contract stream request fn error branch";
    const fn: StreamRequest = async (
      _deps: StreamRequestDeps,
      _params: StreamRequestParams,
      _payload: StreamRequestPayload,
    ): Promise<StreamRequestReturn> => {
      const err: StreamRequestError = new Error(message);
      return err;
    };

    const deps: StreamRequestDeps = buildContractStreamRequestDeps();
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
      createMockSupabaseClient("stream-request-fn-error", {});
    const supabaseClient: SupabaseClient<Database> =
      asSupabaseAdminClientForTests(mockSetup.client);
    const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
      createMockUserTokenWalletService();
    const params: StreamRequestParams = {
      supabaseClient,
      userId: "stream-request-fn-error-user",
      userTokenWalletService: mockUserWallet.instance,
    };
    const payload: StreamRequestPayload = {
      req: buildContractStreamRequestPostRequest(contractChatApiRequest),
    };

    const out: StreamRequestReturn = await fn(deps, params, payload);

    assertEquals(out instanceof Error, true);
    if (!(out instanceof Error)) {
      throw new Error("contract: expected Error branch of StreamRequestReturn");
    }
    const errOut: StreamRequestError = out;
    assertEquals(errOut.message, message);
  },
);

Deno.test(
  "Contract: StreamRequestPayload req has method headers and json function",
  () => {
    const req: Request = buildContractStreamRequestPostRequest(contractChatApiRequest);
    const payload: StreamRequestPayload = { req };

    assertEquals(typeof payload.req.method, "string");
    assertEquals(payload.req.headers instanceof Headers, true);
    assertEquals(typeof payload.req.json, "function");
  },
);

Deno.test(
  "Contract: StreamRequestPayload req JSON body contains rewindFromMessageId for rewind request",
  async () => {
    const rewindId: string = crypto.randomUUID();
    const requestBody: ChatApiRequest = {
      ...contractChatApiRequest,
      rewindFromMessageId: rewindId,
    };
    const req: Request = buildContractStreamRequestPostRequest(requestBody);
    const payload: StreamRequestPayload = { req };

    const bodyText: string = await payload.req.text();
    assertEquals(bodyText.includes('"rewindFromMessageId"'), true);
    assertEquals(bodyText.includes(rewindId), true);
  },
);

Deno.test(
  "Contract: StreamRequestPayload req JSON body has no rewindFromMessageId for normal request",
  async () => {
    const req: Request = buildContractStreamRequestPostRequest(contractChatApiRequest);
    const payload: StreamRequestPayload = { req };

    const bodyText: string = await payload.req.text();
    assertEquals(bodyText.includes('"rewindFromMessageId"'), false);
  },
);
