import {
    ChatApiRequest,
    ChatHandlerDeps,
    ChatMessageInsert,
} from "../_shared/types.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { PathHandlerContext } from "./prepareChatContext.ts";
import { handleStreamingNormalPath } from "./handleStreamingNormalPath.ts";

export async function handleStreamingRequest(
    requestBody: ChatApiRequest,
    supabaseClient: SupabaseClient<Database>,
    userId: string,
    deps: ChatHandlerDeps
): Promise<Response> {
    const { 
        logger,
        prepareChatContext,
        createErrorResponse,
    } = deps;
    const { rewindFromMessageId, isDialectic } = requestBody;

    try {
        const chatContextResult = await prepareChatContext(requestBody, userId, { ...deps, supabaseClient });

        if ('error' in chatContextResult) {
            logger.error('Error preparing chat context:', { error: chatContextResult.error });
            return createErrorResponse(chatContextResult.error.message, chatContextResult.error.status || 500, new Request(''));
        }

        const context: PathHandlerContext = {
            ...chatContextResult,
            supabaseClient,
            deps,
            userId,
            requestBody,
        };

        // For now, only handle normal streaming path
        // TODO: Add support for dialectic and rewind streaming
        if (isDialectic) {
            return createErrorResponse('Streaming not supported for dialectic chats yet', 400, new Request(''));
        } else if (rewindFromMessageId) {
            return createErrorResponse('Streaming not supported for rewind operations yet', 400, new Request(''));
        } else {
            return await handleStreamingNormalPath(context);
        }
    } catch (err) {
        logger.error('Unhandled error in handleStreamingRequest:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred processing the streaming chat request.';
        return createErrorResponse(errorMessage, 500, new Request(''));
    }
}