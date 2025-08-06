import {
    ChatApiRequest,
    ChatHandlerDeps,
    ChatHandlerSuccessResponse,
} from "../_shared/types.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { PathHandlerContext } from "./prepareChatContext.ts";

export async function handlePostRequest(
    requestBody: ChatApiRequest,
    supabaseClient: SupabaseClient<Database>,
    userId: string,
    deps: ChatHandlerDeps
): Promise<ChatHandlerSuccessResponse | { error: { message: string, status?: number } }> {
    const { 
        logger,
        prepareChatContext,
        handleNormalPath,
        handleRewindPath,
    } = deps;
    const { rewindFromMessageId } = requestBody;

    try {
        const chatContextResult = await prepareChatContext(requestBody, userId, { ...deps, supabaseClient });

        if ('error' in chatContextResult) {
            logger.error('Error preparing chat context:', { error: chatContextResult.error });
            return { error: { message: chatContextResult.error.message, status: chatContextResult.error.status } };
        }

        const context: PathHandlerContext = {
            ...chatContextResult,
            supabaseClient,
            deps,
            userId,
            requestBody,
        };

        if (rewindFromMessageId) {
            return await handleRewindPath(context);
        } else {
            return await handleNormalPath(context);
        }
    } catch (err) {
        logger.error('Unhandled error in handlePostRequest:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred processing the chat request.';
        return { error: { message: errorMessage, status: 500 } };
    }
}
