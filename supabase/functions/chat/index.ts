// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createErrorResponse,
  createSuccessResponse,
  handleCorsPreflightRequest,
} from "../_shared/cors-headers.ts";
import {
  defaultProviderMap,
  getAiProviderAdapter,
  testProviderMap,
} from "../_shared/ai_service/factory.ts";
import { AdminTokenWalletService } from "../_shared/services/tokenwallet/admin/adminTokenWalletService.ts";
import { UserTokenWalletService } from "../_shared/services/tokenwallet/client/userTokenWalletService.ts";
import {
  FactoryDependencies,
  GetAiProviderAdapterFn,
  GetUserFn,
  GetUserFnResult,
} from "../_shared/types.ts";
import { logger } from "../_shared/logger.ts";
import { countTokens } from "../_shared/utils/tokenizer_utils.ts";
import { debitTokens } from "../_shared/utils/debitTokens.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import { Database } from "../types_db.ts";
import { constructMessageHistory } from "./constructMessageHistory/constructMessageHistory.ts";
import { findOrCreateChat } from "./findOrCreateChat.ts";
import {
  ChatDeps,
  ChatParams,
  ChatPayload,
  ChatReturn,
} from "./index.interface.ts";
import { prepareChatContext } from "./prepareChatContext/prepareChatContext.ts";
import { streamRequest } from "./streamRequest/streamRequest.ts";
import {
  StreamRequestDeps,
  StreamRequestParams,
  StreamRequestPayload,
  StreamRequestReturn,
} from "./streamRequest/streamRequest.interface.ts";
import { StreamChat } from "./streamChat/StreamChat.ts";
import { StreamRewind } from "./streamRewind/streamRewind.ts";

const defaultGetAiProviderAdapter: GetAiProviderAdapterFn = (
  dependencies: FactoryDependencies,
) => {
  return getAiProviderAdapter({
    ...dependencies,
    providerMap: defaultProviderMap,
  });
};

const adminClient: SupabaseClient<Database> = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const userClient: SupabaseClient<Database> = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    auth: {
      persistSession: false,
    },
  },
);

export async function handler(
  deps: ChatDeps,
  params: ChatParams,
  payload: ChatPayload,
): Promise<ChatReturn> {
  const corsResponse: Response | null = deps.handleCorsPreflightRequest(
    payload.req,
  );
  if (corsResponse) {
    return corsResponse;
  }

  const { data: { user }, error: userError } = await params.getUserFn();
  deps.logger.info("[handler] getUserFn result:", { user, userError });

  if (userError || !user) {
    const status: number = userError?.status || 401;
    deps.logger.error("Auth error in chat handler:", {
      error: userError || "User not found",
      status,
    });

    if (payload.req.method === "POST" && status === 401) {
      deps.logger.info(
        "POST request without valid auth. Returning AUTH_REQUIRED signal.",
      );
      return deps.createSuccessResponse(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        401,
        payload.req,
      );
    }

    return deps.createErrorResponse(
      userError?.message || "Invalid authentication credentials",
      status,
      payload.req,
    );
  }

  const userId: string = user.id;
  deps.logger.info("Authenticated user:", { userId });

  const isTestMode: boolean = payload.req.headers.get("X-Test-Mode") === "true";

  if (payload.req.method === "POST") {
    try {
      if (
        isTestMode &&
        deps.getAiProviderAdapter === defaultDeps.getAiProviderAdapter
      ) {
        deps.logger.info(
          "[handler] Test mode detected and no adapter override present. Using testProviderMap.",
        );
      }
      const streamDeps: StreamRequestDeps = {
        logger: deps.logger,
        adminTokenWalletService: deps.adminTokenWalletService,
        getAiProviderAdapter:
          isTestMode &&
            deps.getAiProviderAdapter === defaultDeps.getAiProviderAdapter
            ? (
              dependencies: FactoryDependencies,
            ) => {
              return getAiProviderAdapter({
                ...dependencies,
                providerMap: testProviderMap,
              });
            }
            : deps.getAiProviderAdapter,
        prepareChatContext: deps.prepareChatContext,
        streamChat: StreamChat,
        streamRewind: StreamRewind,
        createErrorResponse: deps.createErrorResponse,
        countTokens: deps.countTokens,
        debitTokens: deps.debitTokens,
        getMaxOutputTokens: deps.getMaxOutputTokens,
        findOrCreateChat: deps.findOrCreateChat,
        constructMessageHistory: deps.constructMessageHistory,
      };
      const streamParams: StreamRequestParams = {
        supabaseClient: params.userClient,
        userId,
        userTokenWalletService: deps.userTokenWalletService,
      };
      const streamPayload: StreamRequestPayload = {
        req: payload.req,
      };
      const result: StreamRequestReturn = await deps.streamRequest(
        streamDeps,
        streamParams,
        streamPayload,
      );
      if (result instanceof Error) {
        return deps.createErrorResponse(result.message, 500, payload.req);
      }
      return result;
    } catch (err) {
      deps.logger.error("Unhandled error in POST mainHandler:", {
        error: err instanceof Error ? err.stack : String(err),
      });
      const errorMessage: string = err instanceof Error
        ? err.message
        : "An unexpected error occurred processing the chat request.";
      return deps.createErrorResponse(errorMessage, 500, payload.req);
    }
  }

  if (payload.req.method === "DELETE") {
    try {
      const url: URL = new URL(payload.req.url);
      const pathSegments: string[] = url.pathname.split("/");
      const chatId: string = pathSegments[pathSegments.length - 1];
      if (!chatId || chatId === "chat") {
        return deps.createErrorResponse(
          "Missing chat ID in URL path for DELETE request.",
          400,
          payload.req,
        );
      }
      deps.logger.info(`Received DELETE request for chat ID: ${chatId}`);

      const { error: rpcError } = await params.userClient.rpc(
        "delete_chat_and_messages",
        {
          p_chat_id: chatId,
          p_user_id: userId,
        },
      );

      if (rpcError) {
        deps.logger.error(
          `Error calling delete_chat_and_messages RPC for chat ${chatId}:`,
          { error: rpcError },
        );
        if (
          rpcError.code === "PGRST01" ||
          rpcError.message.includes("permission denied")
        ) {
          return deps.createErrorResponse(
            "Permission denied to delete this chat.",
            403,
            payload.req,
          );
        }
        return deps.createErrorResponse(
          rpcError.message || "Failed to delete chat.",
          500,
          payload.req,
        );
      }

      deps.logger.info(`Successfully deleted chat ${chatId} via RPC.`);
      return deps.createSuccessResponse(null, 204, payload.req);
    } catch (err) {
      deps.logger.error("Unhandled error in DELETE handler:", {
        error: err instanceof Error ? err.stack : String(err),
      });
      const errorMessage: string = err instanceof Error
        ? err.message
        : "An unexpected error occurred.";
      return deps.createErrorResponse(errorMessage, 500, payload.req);
    }
  }

  return deps.createErrorResponse("Method Not Allowed", 405, payload.req);
}

export const defaultDeps: ChatDeps = {
  logger: logger,
  adminTokenWalletService: new AdminTokenWalletService(adminClient),
  userTokenWalletService: new UserTokenWalletService(userClient),
  streamRequest: streamRequest,
  handleCorsPreflightRequest,
  createSuccessResponse,
  createErrorResponse,
  getAiProviderAdapter: defaultGetAiProviderAdapter,
  countTokens: countTokens,
  prepareChatContext: prepareChatContext,
  debitTokens: debitTokens,
  getMaxOutputTokens: getMaxOutputTokens,
  findOrCreateChat: findOrCreateChat,
  constructMessageHistory: constructMessageHistory,
};

export function createChatServiceHandler(
  deps: ChatDeps,
  getSupabaseClient: (token: string | null) => SupabaseClient<Database>,
  adminClient: SupabaseClient<Database>,
) {
  logger.info("[createChatServiceHandler] CREATING HANDLER. Deps provided:", {
    keys: Object.keys(deps),
  });
  return async (req: Request): Promise<Response> => {
    const authHeader: string | null = req.headers.get("Authorization");
    const authToken: string | null = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;
    const userClient: SupabaseClient<Database> = getSupabaseClient(authToken);

    const adminTokenWalletService: AdminTokenWalletService =
      new AdminTokenWalletService(adminClient);
    const userTokenWalletService: UserTokenWalletService = new UserTokenWalletService(
      userClient,
    );

    const getUserFnForRequest: GetUserFn = async (): Promise<GetUserFnResult> => {
      logger.info("[getUserFnForRequest] Auth check initiated.");
      if (!authHeader) {
        logger.warn("[getUserFnForRequest] No auth header found.");
        return {
          data: { user: null },
          error: { message: "User not authenticated", status: 401 },
        };
      }
      const { data, error } = await userClient.auth.getUser();
      logger.info("[getUserFnForRequest] userClient.auth.getUser() result:", {
        data: {
          user: data.user
            ? { id: data.user.id, email: data.user.email }
            : null,
        },
        error,
      });
      if (error) {
        return {
          data: { user: null },
          error: { message: error.message, status: error.status || 500 },
        };
      }
      return { data, error: null };
    };

    const chatDeps: ChatDeps = {
      ...deps,
      adminTokenWalletService,
      userTokenWalletService,
    };

    const chatParams: ChatParams = {
      userClient,
      adminClient,
      getUserFn: getUserFnForRequest,
    };

    const payload: ChatPayload = { req };

    const out: ChatReturn = await handler(chatDeps, chatParams, payload);
    if (out instanceof Error) {
      return deps.createErrorResponse(out.message, 500, req);
    }
    return out;
  };
}

serve(async (req: Request) => {
  try {
    const getSupabaseClient = (token: string | null) =>
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: {
            persistSession: false,
          },
        },
      );

    const adminClient: SupabaseClient<Database> = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const requestHandler = createChatServiceHandler(
      defaultDeps,
      getSupabaseClient,
      adminClient,
    );

    return await requestHandler(req);
  } catch (e) {
    logger.error("Critical error in server request processing:", {
      error: e instanceof Error ? e.stack : String(e),
      request_url: req.url,
      request_method: req.method,
    });

    return createErrorResponse(
      e instanceof Error ? e.message : "Internal Server Error",
      500,
      req,
    );
  }
});
