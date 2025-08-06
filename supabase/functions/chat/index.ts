// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import {
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse,
} from '../_shared/cors-headers.ts';
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts';
import type {
    ChatHandlerDeps,
    GetUserFn,
    GetUserFnResult,
    AiProviderAdapterInstance,
} from '../_shared/types.ts';
import type { AiModelExtendedConfig, ILogger } from "../_shared/types.ts";
import { logger } from '../_shared/logger.ts';
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { ChatApiRequestSchema } from './zodSchema.ts';
import { handlePostRequest } from './handlePostRequest.ts';
import { prepareChatContext } from './prepareChatContext.ts';
import { handleNormalPath } from './handleNormalPath.ts';
import { handleRewindPath } from './handleRewindPath.ts';

// --- Main Handler ---
export async function handler(
    req: Request,
    deps: ChatHandlerDeps,
    userClient: SupabaseClient,
    adminClient: SupabaseClient,
    getUserFn: GetUserFn,
): Promise<Response> {
    const {
        handleCorsPreflightRequest,
        createSuccessResponse,
        createErrorResponse,
        logger,
    } = deps;

    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) return corsResponse;

    const { data: { user }, error: userError } = await getUserFn();
    logger.info('[handler] getUserFn result:', { user, userError });

    if (userError || !user) {
        const status = userError?.status || 401;
        logger.error('Auth error in chat handler:', { error: userError || 'User not found', status });

        // For POST requests, we might want a specific signal for the client to prompt login
        if (req.method === 'POST' && status === 401) {
            logger.info("POST request without valid auth. Returning AUTH_REQUIRED signal.");
            return createSuccessResponse(
                { error: "Authentication required", code: "AUTH_REQUIRED" },
                401,
                req
            );
        }

        return createErrorResponse(userError?.message || 'Invalid authentication credentials', status, req);
    }

    const userId = user.id;
    logger.info('Authenticated user:', { userId });

    let tokenWalletService = deps.tokenWalletService;
    if (!tokenWalletService) {
        tokenWalletService = new TokenWalletService(userClient, adminClient);
    }

    if (req.method === 'POST') {
        try {
            let rawBody;
            try {
                rawBody = await req.json();
            } catch (jsonError) {
                logger.error('Failed to parse request body as JSON:', { error: jsonError });
                return createErrorResponse('Invalid JSON format in request body.', 400, req);
            }

            const parsedResult = ChatApiRequestSchema.safeParse(rawBody);

            if (!parsedResult.success) {
                const errorMessages = parsedResult.error.errors.map((e: z.ZodIssue) => `${e.path.join('.') || 'body'}: ${e.message}`).join(', ');
                logger.warn('Chat API request validation failed:', { errors: errorMessages, requestBody: rawBody });
                return createErrorResponse(`Invalid request body: ${errorMessages}`, 400, req);
            }

            const requestBody = parsedResult.data;
            logger.info('Received chat POST request (validated):', { body: requestBody });

            // Pass the adminClient to handlePostRequest if it needs it
            const result = await handlePostRequest(requestBody, userClient, userId, { ...deps, tokenWalletService });

            if (result && 'error' in result && result.error) {
                const { message, status } = result.error;
                logger.warn('handlePostRequest returned an error.', { message, status: status || 500 });
                return createErrorResponse(message, status || 500, req);
            }

            return createSuccessResponse(result, 200, req);
        } catch (err) {
            logger.error('Unhandled error in POST mainHandler:', { error: err instanceof Error ? err.stack : String(err) });
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred processing the chat request.';
            return createErrorResponse(errorMessage, 500, req);
        }
    } else if (req.method === 'DELETE') {
        try {
            const url = new URL(req.url);
            const pathSegments = url.pathname.split('/');
            const chatId = pathSegments[pathSegments.length - 1];
            if (!chatId || chatId === 'chat') {
                return createErrorResponse('Missing chat ID in URL path for DELETE request.', 400, req);
            }
            logger.info(`Received DELETE request for chat ID: ${chatId}`);

            // Use the user-specific client for the RPC call to enforce RLS
            const { error: rpcError } = await userClient.rpc('delete_chat_and_messages', {
                p_chat_id: chatId,
                p_user_id: userId
            });

            if (rpcError) {
                logger.error(`Error calling delete_chat_and_messages RPC for chat ${chatId}:`, { error: rpcError });
                if (rpcError.code === 'PGRST01' || rpcError.message.includes('permission denied')) {
                    return createErrorResponse('Permission denied to delete this chat.', 403, req);
                }
                return createErrorResponse(rpcError.message || 'Failed to delete chat.', 500, req);
            }

            logger.info(`Successfully deleted chat ${chatId} via RPC.`);
            return createSuccessResponse(null, 204, req);
        } catch (err) {
            logger.error('Unhandled error in DELETE handler:', { error: err instanceof Error ? err.stack : String(err) });
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
            return createErrorResponse(errorMessage, 500, req);
        }
    } else {
        return createErrorResponse('Method Not Allowed', 405, req);
    }
}

// Default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
    createSupabaseClient: createClient,
    fetch: fetch,
    handleCorsPreflightRequest,
    createSuccessResponse,
    createErrorResponse,
    getAiProviderAdapter: (
        providerApiIdentifier: string,
        providerDbConfig: AiModelExtendedConfig | null,
        apiKey: string,
        logger: ILogger
    ): AiProviderAdapterInstance | null => {
        const adapter = getAiProviderAdapter(providerApiIdentifier, providerDbConfig, apiKey, logger);
        if (!adapter) {
            logger.error(`[defaultDeps] No adapter found by factory for provider API identifier: ${providerApiIdentifier}`);
            throw new Error(`Adapter not found for provider API identifier: ${providerApiIdentifier}`);
        }
        return adapter;
    },
    verifyApiKey: async (apiKey: string, providerName: string): Promise<boolean> => {
        logger.warn("[defaultDeps] Using STUB for verifyApiKey.", { apiKeyLen: apiKey.length, providerName });
        return apiKey.startsWith('sk-test-');
    },
    logger: logger,
    tokenWalletService: undefined,
    countTokensForMessages: countTokensForMessages,
    prepareChatContext: prepareChatContext,
    handleNormalPath: handleNormalPath,
    handleRewindPath: handleRewindPath,
    handlePostRequest: handlePostRequest,
};

// This factory creates the main request handler, injecting dependencies.
export function createChatServiceHandler(
    deps: ChatHandlerDeps,
    getSupabaseClient: (token: string | null) => SupabaseClient,
    adminClient: SupabaseClient,
) {
    logger.info('[createChatServiceHandler] CREATING HANDLER. Deps provided:', { keys: Object.keys(deps) });
    return async (req: Request): Promise<Response> => {
        if (req.method === "OPTIONS") {
            return handleCorsPreflightRequest(req) ?? new Response(null, { status: 204 });
        }

        const authHeader = req.headers.get("Authorization");
        const authToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
        const userClient = getSupabaseClient(authToken);

        const getUserFnForRequest: GetUserFn = async (): Promise<GetUserFnResult> => {
            logger.info('[getUserFnForRequest] Auth check initiated.');
            if (!authHeader) {
                logger.warn('[getUserFnForRequest] No auth header found.');
                return { data: { user: null }, error: { message: "User not authenticated", status: 401 } };
            }
            const { data, error } = await userClient.auth.getUser();
            logger.info('[getUserFnForRequest] userClient.auth.getUser() result:', { data: { user: data.user ? { id: data.user.id, email: data.user.email } : null }, error });
            if (error) {
                return { data: { user: null }, error: { message: error.message, status: error.status || 500 } };
            }
            return { data, error: null };
        };

        return await handler(req, deps, userClient, adminClient, getUserFnForRequest);
    };
}


// Start the server
serve(async (req: Request) => {
    try {
        // Factory to create a Supabase client for a given user request
        const getSupabaseClient = (token: string | null) => createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            {
                global: {
                    headers: { Authorization: `Bearer ${token}` },
                },
                auth: {
                    persistSession: false,
                },
            }
        );

        // Singleton client with admin privileges
        const adminClient = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Create the handler with real dependencies
        const requestHandler = createChatServiceHandler(defaultDeps, getSupabaseClient, adminClient);

        // Process the request
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
            req
        );
    }
});
