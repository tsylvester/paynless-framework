import { 
    ChatApiRequest,
    ChatHandlerDeps,
    ChatMessageRole,
} from "../_shared/types.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { isChatMessageRole } from "../_shared/utils/type_guards.ts";

// --- Helper to construct message history ---
export async function constructMessageHistory(
    supabaseClient: SupabaseClient<Database>,
    existingChatId: string | null | undefined,
    newUserMessageContent: string,
    system_prompt_text: string | null,
    rewindFromMessageId: string | null | undefined, // Keep for potential future use, though not primary with selectedMessages
    selectedMessages: ChatApiRequest['selectedMessages'], 
    logger: ChatHandlerDeps['logger'] 
): Promise<{ history: {role: ChatMessageRole, content: string}[], historyFetchError?: Error }> {
    const history: {role: ChatMessageRole, content: string}[] = [];
    let historyFetchError: Error | undefined = undefined;

    if (system_prompt_text) {
        history.push({ role: 'system', content: system_prompt_text });
    }

    if (selectedMessages && selectedMessages.length > 0) {
        logger.info('constructMessageHistory: Using provided selectedMessages for history.', { count: selectedMessages.length });
        const formattedSelectedMessages = selectedMessages.map(msg => ({ 
            role: msg.role, 
            content: msg.content 
        }));
        history.push(...formattedSelectedMessages);
    } else if (existingChatId && !rewindFromMessageId) { // Only fetch from DB if not rewinding and no selected messages
        logger.info(`constructMessageHistory: No selectedMessages, fetching history for chatId: ${existingChatId}`);
        const { data: dbMessages, error: dbError } = await supabaseClient
            .from('chat_messages')
            .select('role, content')
            .eq('chat_id', existingChatId)
            .eq('is_active_in_thread', true) // Important filter
            .order('created_at', { ascending: true });

        if (dbError) {
            logger.error('constructMessageHistory: Error fetching existing chat messages:', { error: dbError });
            historyFetchError = dbError; // Store the error
        } else if (dbMessages) {
            logger.info(`constructMessageHistory: Fetched ${dbMessages.length} messages from DB.`);
            for (const msg of dbMessages) {
                if (msg && 
                    typeof msg.role === 'string' && 
                    isChatMessageRole(msg.role) && 
                    typeof msg.content === 'string'
                ) {
                    history.push({
                        role: msg.role,
                        content: msg.content,
                    });
                } else {
                    logger.warn('constructMessageHistory: Filtered out invalid message from DB history', { problematicMessage: msg });
                }
            }
        }
    } else if (rewindFromMessageId) {
        // If rewind is active, the main handlePostRequest logic handles history construction for rewind path
        logger.info('constructMessageHistory: Rewind active, history construction handled by rewind path logic.');
    } else {
        logger.info('constructMessageHistory: No selectedMessages, no existingChatId, and no rewind. History will be minimal.');
    }

    history.push({ role: 'user', content: newUserMessageContent });
    logger.info('constructMessageHistory: Final history constructed:', { length: history.length, lastMessageRole: history[history.length-1]?.role });
    return { history, historyFetchError };
}