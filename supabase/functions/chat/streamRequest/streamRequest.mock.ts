import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asSupabaseAdminClientForTests } from "../../_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";
import {
  buildContractPrepareChatContextDeps,
  buildContractPrepareChatContextPayload,
  createMockPrepareChatContext,
} from "../prepareChatContext/prepareChatContext.mock.ts";
import {
  PrepareChatContext,
  PrepareChatContextDeps,
  PrepareChatContextParams,
  PrepareChatContextPayload,
  PrepareChatContextReturn,
} from "../prepareChatContext/prepareChatContext.interface.ts";
import {
  buildContractStreamChatDeps,
  createMockStreamChat,
} from "../streamChat/streamChat.mock.ts";
import {
  StreamChatFn,
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
} from "../streamChat/streamChat.interface.ts";
import { createMockStreamRewind } from "../streamRewind/streamRewind.mock.ts";
import {
  StreamRewind,
  StreamRewindDeps,
  StreamRewindParams,
  StreamRewindPayload,
  StreamRewindReturn,
} from "../streamRewind/streamRewind.interface.ts";
import {
  StreamRequest,
  StreamRequestDeps,
  StreamRequestParams,
  StreamRequestPayload,
  StreamRequestReturn,
} from "./streamRequest.interface.ts";

export const STREAM_REQUEST_UNIT_REWIND_MSG_ID: string =
  "aaaaaaaa-aaaa-4aaa-8aaa-eeeeeeeeeeee";

export function buildContractStreamRequestPostRequest(
  body: ChatApiRequest,
): Request {
  return new Request(
    "https://example.com/stream-request-contract-post-json",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function buildStreamRequestUnitParams(): StreamRequestParams {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient("stream-request-unit", {});
  const supabaseClient: SupabaseClient<Database> =
    asSupabaseAdminClientForTests(mockSetup.client);
  const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
    createMockUserTokenWalletService();
  const params: StreamRequestParams = {
    supabaseClient,
    userId: "stream-request-unit-user-id",
    userTokenWalletService: mockUserWallet.instance,
  };
  return params;
}

export function buildStreamRequestUnitNormalPayload(): StreamRequestPayload {
  const requestBody: ChatApiRequest = buildContractPrepareChatContextPayload();
  const req: Request = buildContractStreamRequestPostRequest(requestBody);
  const payload: StreamRequestPayload = { req };
  return payload;
}

export function buildStreamRequestUnitRewindPayload(): StreamRequestPayload {
  const requestBody: ChatApiRequest = {
    ...buildContractPrepareChatContextPayload(),
    rewindFromMessageId: STREAM_REQUEST_UNIT_REWIND_MSG_ID,
  };
  const req: Request = buildContractStreamRequestPostRequest(requestBody);
  const payload: StreamRequestPayload = { req };
  return payload;
}

export function buildStreamRequestUnitDialecticPayload(): StreamRequestPayload {
  const requestBody: ChatApiRequest = {
    ...buildContractPrepareChatContextPayload(),
    isDialectic: true,
  };
  const req: Request = buildContractStreamRequestPostRequest(requestBody);
  const payload: StreamRequestPayload = { req };
  return payload;
}

export function createRecordingStreamChat(): {
  streamChat: StreamChatFn;
  getLastCall: () => {
    deps: StreamChatDeps;
    params: StreamChatParams;
    payload: StreamChatPayload;
  } | null;
} {
  let last: {
    deps: StreamChatDeps;
    params: StreamChatParams;
    payload: StreamChatPayload;
  } | null = null;
  const inner: StreamChatFn = createMockStreamChat();
  const streamChat: StreamChatFn = async (
    deps: StreamChatDeps,
    params: StreamChatParams,
    payload: StreamChatPayload,
  ): Promise<StreamChatReturn> => {
    last = { deps, params, payload };
    return inner(deps, params, payload);
  };
  return {
    streamChat,
    getLastCall: () => last,
  };
}

export function createRecordingStreamRewind(): {
  streamRewind: StreamRewind;
  getLastCall: () => {
    deps: StreamRewindDeps;
    params: StreamRewindParams;
    payload: StreamRewindPayload;
  } | null;
} {
  let last: {
    deps: StreamRewindDeps;
    params: StreamRewindParams;
    payload: StreamRewindPayload;
  } | null = null;
  const inner: StreamRewind = createMockStreamRewind();
  const streamRewind: StreamRewind = async (
    deps: StreamRewindDeps,
    params: StreamRewindParams,
    payload: StreamRewindPayload,
  ): Promise<StreamRewindReturn> => {
    last = { deps, params, payload };
    return inner(deps, params, payload);
  };
  return {
    streamRewind,
    getLastCall: () => last,
  };
}

export function createThrowingPrepareChatContext(): PrepareChatContext {
  const fn: PrepareChatContext = async (
    _deps: PrepareChatContextDeps,
    _params: PrepareChatContextParams,
    _payload: PrepareChatContextPayload,
  ): Promise<PrepareChatContextReturn> => {
    throw new Error("stream-request-unit prepareChatContext throw");
  };
  return fn;
}

export function buildStreamRequestDepsWithPathHandlers(options: {
  prepareChatContext: PrepareChatContext;
  streamChat: StreamChatFn;
  streamRewind: StreamRewind;
}): StreamRequestDeps {
  const streamChatDeps = buildContractStreamChatDeps();
  const prepareContract = buildContractPrepareChatContextDeps();
  const deps: StreamRequestDeps = {
    logger: streamChatDeps.logger,
    adminTokenWalletService: streamChatDeps.adminTokenWalletService,
    getAiProviderAdapter: prepareContract.getAiProviderAdapter,
    prepareChatContext: options.prepareChatContext,
    streamChat: options.streamChat,
    streamRewind: options.streamRewind,
    createErrorResponse: streamChatDeps.createErrorResponse,
    countTokens: streamChatDeps.countTokens,
    debitTokens: streamChatDeps.debitTokens,
    getMaxOutputTokens: streamChatDeps.getMaxOutputTokens,
    findOrCreateChat: streamChatDeps.findOrCreateChat,
    constructMessageHistory: streamChatDeps.constructMessageHistory,
  };
  return deps;
}

export function buildContractStreamRequestDeps(): StreamRequestDeps {
  const streamChatDeps = buildContractStreamChatDeps();
  const prepareContract = buildContractPrepareChatContextDeps();
  const deps: StreamRequestDeps = {
    logger: streamChatDeps.logger,
    adminTokenWalletService: streamChatDeps.adminTokenWalletService,
    getAiProviderAdapter: prepareContract.getAiProviderAdapter,
    prepareChatContext: createMockPrepareChatContext(),
    streamChat: createMockStreamChat(),
    streamRewind: createMockStreamRewind(),
    createErrorResponse: streamChatDeps.createErrorResponse,
    countTokens: streamChatDeps.countTokens,
    debitTokens: streamChatDeps.debitTokens,
    getMaxOutputTokens: streamChatDeps.getMaxOutputTokens,
    findOrCreateChat: streamChatDeps.findOrCreateChat,
    constructMessageHistory: streamChatDeps.constructMessageHistory,
  };
  return deps;
}

export function buildContractStreamRequestParams(): StreamRequestParams {
  const mockSetup: ReturnType<typeof createMockSupabaseClient> =
    createMockSupabaseClient("stream-request-contract", {});
  const supabaseClient: SupabaseClient<Database> =
    asSupabaseAdminClientForTests(mockSetup.client);
  const mockUserWallet: ReturnType<typeof createMockUserTokenWalletService> =
    createMockUserTokenWalletService();
  const params: StreamRequestParams = {
    supabaseClient,
    userId: "stream-request-contract-user-id",
    userTokenWalletService: mockUserWallet.instance,
  };
  return params;
}

export function createMockStreamRequest(config: {
  outcome?: StreamRequestReturn;
} = {}): StreamRequest {
  const fn: StreamRequest = async (
    _deps: StreamRequestDeps,
    _params: StreamRequestParams,
    _payload: StreamRequestPayload,
  ): Promise<StreamRequestReturn> => {
    if (config.outcome !== undefined) {
      return config.outcome;
    }
    const encoder: TextEncoder = new TextEncoder();
    const stream: ReadableStream<Uint8Array> = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "stream_request_mock" })}\n\n`,
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

export function buildStreamRequestDepsMissingStreamChat() {
  const d: StreamRequestDeps = buildContractStreamRequestDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    getAiProviderAdapter: d.getAiProviderAdapter,
    prepareChatContext: d.prepareChatContext,
    streamRewind: d.streamRewind,
    createErrorResponse: d.createErrorResponse,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    getMaxOutputTokens: d.getMaxOutputTokens,
    findOrCreateChat: d.findOrCreateChat,
    constructMessageHistory: d.constructMessageHistory,
  };
}

export function buildStreamRequestDepsMissingStreamRewind() {
  const d: StreamRequestDeps = buildContractStreamRequestDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    getAiProviderAdapter: d.getAiProviderAdapter,
    prepareChatContext: d.prepareChatContext,
    streamChat: d.streamChat,
    createErrorResponse: d.createErrorResponse,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    getMaxOutputTokens: d.getMaxOutputTokens,
    findOrCreateChat: d.findOrCreateChat,
    constructMessageHistory: d.constructMessageHistory,
  };
}

export function buildStreamRequestDepsMissingPrepareChatContext() {
  const d: StreamRequestDeps = buildContractStreamRequestDeps();
  return {
    logger: d.logger,
    adminTokenWalletService: d.adminTokenWalletService,
    getAiProviderAdapter: d.getAiProviderAdapter,
    streamChat: d.streamChat,
    streamRewind: d.streamRewind,
    createErrorResponse: d.createErrorResponse,
    countTokens: d.countTokens,
    debitTokens: d.debitTokens,
    getMaxOutputTokens: d.getMaxOutputTokens,
    findOrCreateChat: d.findOrCreateChat,
    constructMessageHistory: d.constructMessageHistory,
  };
}
