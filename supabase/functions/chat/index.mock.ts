import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
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
import {
  createMockSupabaseClient,
  MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import { GetUserFn, GetUserFnResult } from "../_shared/types.ts";
import { Database } from "../types_db.ts";
import {
  ChatDeps,
  ChatFn,
  ChatParams,
  ChatPayload,
  ChatReturn,
} from "./index.interface.ts";
import {
  buildContractStreamRequestDeps,
  createMockStreamRequest,
} from "./streamRequest/streamRequest.mock.ts";
import { StreamRequest } from "./streamRequest/streamRequest.interface.ts";

export const CHAT_HANDLER_UNIT_TEST_USER_ID: string =
  "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

export const CHAT_HANDLER_UNIT_TEST_CHAT_ID: string =
  "bbbbbbbb-cccc-4ddd-eeee-ffffffffffff";

export const CHAT_HANDLER_UNIT_TEST_PROVIDER_ID: string =
  "cccccccc-dddd-4eee-ffff-000000000001";

export const CHAT_HANDLER_UNIT_TEST_PROMPT_ID: string = "__none__";

export function createMockChat(config: { outcome?: ChatReturn } = {}): ChatFn {
  const implementation: ChatFn = async (
    _deps: ChatDeps,
    _params: ChatParams,
    _payload: ChatPayload,
  ): Promise<ChatReturn> => {
    if (config.outcome !== undefined) {
      return config.outcome;
    }
    const mockBody: string = JSON.stringify({
      mocked: true,
      scope: "createMockChat",
    });
    const mockResponse: Response = new Response(mockBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    return mockResponse;
  };
  return spy(implementation);
}

export function buildMockUserForChatHandlerUnitTests(): User {
  const now: string = new Date().toISOString();
  const user: User = {
    id: CHAT_HANDLER_UNIT_TEST_USER_ID,
    email: "chat-unit@example.com",
    app_metadata: { provider: "email" },
    user_metadata: { name: "Chat Unit User" },
    aud: "authenticated",
    created_at: now,
  };
  return user;
}

export function buildUnauthenticatedGetUserFn(): GetUserFn {
  const fn: GetUserFn = async (): Promise<GetUserFnResult> => {
    return {
      data: { user: null },
      error: { message: "auth error", status: 401 },
    };
  };
  return fn;
}

export function buildAuthenticatedGetUserFn(user: User): GetUserFn {
  const fn: GetUserFn = async (): Promise<GetUserFnResult> => {
    return { data: { user }, error: null };
  };
  return fn;
}

export function buildContractChatHandlerUnitDeps(config: {
  streamRequest: StreamRequest;
}): ChatDeps {
  const streamRequestDeps = buildContractStreamRequestDeps();
  const mockAdminWallet = createMockAdminTokenWalletService();
  const mockUserWallet = createMockUserTokenWalletService();
  const deps: ChatDeps = {
    logger: streamRequestDeps.logger,
    adminTokenWalletService: mockAdminWallet.instance,
    userTokenWalletService: mockUserWallet.instance,
    streamRequest: config.streamRequest,
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
  return deps;
}

export function buildContractChatHandlerUnitParams(config: {
  userClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
  getUserFn: GetUserFn;
}): ChatParams {
  const params: ChatParams = {
    userClient: config.userClient,
    adminClient: config.adminClient,
    getUserFn: config.getUserFn,
  };
  return params;
}

export function buildUnauthenticatedChatHandlerUnitParams(): {
  params: ChatParams;
} {
  const userSetup = createMockSupabaseClient("chat-handler-unauth-user", {});
  const adminSetup = createMockSupabaseClient(
    "chat-handler-unit-admin-unauth",
    {},
  );
  const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    userSetup.client,
  );
  const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    adminSetup.client,
  );
  const params: ChatParams = buildContractChatHandlerUnitParams({
    userClient,
    adminClient,
    getUserFn: buildUnauthenticatedGetUserFn(),
  });
  return { params };
}

export function buildInvalidJwtChatHandlerUnitParams(): {
  params: ChatParams;
} {
  const userSetup = createMockSupabaseClient("chat-handler-invalid-jwt-user", {});
  const adminSetup = createMockSupabaseClient(
    "chat-handler-unit-admin-invalid-jwt",
    {},
  );
  const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    userSetup.client,
  );
  const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    adminSetup.client,
  );
  const params: ChatParams = buildContractChatHandlerUnitParams({
    userClient,
    adminClient,
    getUserFn: async (): Promise<GetUserFnResult> => {
      return {
        data: { user: null },
        error: { message: "Invalid JWT", status: 401 },
      };
    },
  });
  return { params };
}

export function buildAuthenticatedChatHandlerUnitParams(): {
  params: ChatParams;
} {
  const mockUser: User = buildMockUserForChatHandlerUnitTests();
  const userSetup = createMockSupabaseClient(CHAT_HANDLER_UNIT_TEST_USER_ID, {
    mockUser,
  });
  const adminSetup = createMockSupabaseClient("chat-handler-unit-admin", {});
  const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    userSetup.client,
  );
  const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    adminSetup.client,
  );
  const params: ChatParams = buildContractChatHandlerUnitParams({
    userClient,
    adminClient,
    getUserFn: buildAuthenticatedGetUserFn(mockUser),
  });
  return { params };
}

export function buildDeleteChatHandlerUnitParams(
  extraConfig: MockSupabaseDataConfig = {},
): {
  params: ChatParams;
  userSetup: ReturnType<typeof createMockSupabaseClient>;
} {
  const mockUser: User = buildMockUserForChatHandlerUnitTests();
  const userSetup = createMockSupabaseClient(CHAT_HANDLER_UNIT_TEST_USER_ID, {
    mockUser,
    ...extraConfig,
  });
  const adminSetup = createMockSupabaseClient("chat-handler-unit-admin-delete", {});
  const userClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    userSetup.client,
  );
  const adminClient: SupabaseClient<Database> = asSupabaseAdminClientForTests(
    adminSetup.client,
  );
  const params: ChatParams = buildContractChatHandlerUnitParams({
    userClient,
    adminClient,
    getUserFn: buildAuthenticatedGetUserFn(mockUser),
  });
  return { params, userSetup };
}

export function createRecordingStreamRequest(): {
  streamRequest: StreamRequest;
  getLastCall: () => {
    deps: Parameters<StreamRequest>[0];
    streamParams: Parameters<StreamRequest>[1];
    payload: Parameters<StreamRequest>[2];
  } | null;
} {
  let last: {
    deps: Parameters<StreamRequest>[0];
    streamParams: Parameters<StreamRequest>[1];
    payload: Parameters<StreamRequest>[2];
  } | null = null;
  const inner: StreamRequest = createMockStreamRequest();
  const streamRequest: StreamRequest = async (
    deps: Parameters<StreamRequest>[0],
    streamParams: Parameters<StreamRequest>[1],
    payload: Parameters<StreamRequest>[2],
  ) => {
    last = { deps, streamParams, payload };
    return inner(deps, streamParams, payload);
  };
  return {
    streamRequest,
    getLastCall: () => last,
  };
}
