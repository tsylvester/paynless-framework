import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ILogger } from "../_shared/types.ts";
import { Database } from "../types_db.ts";

export interface FindOrCreateChatDeps {
    supabaseClient: SupabaseClient<Database>;
    logger: ILogger;
}

export interface FindOrCreateChatParams {
    userId: string;
    existingChatId: string | null | undefined;
    organizationId: string | null | undefined;
    finalSystemPromptIdForDb: string | null;
    userMessageContent: string;
}

/**
 * Finds an existing chat or creates a new one.
 *
 * @param deps - Dependencies including the Supabase client and logger.
 * @param params - Parameters for finding or creating the chat.
 * @returns The ID of the found or created chat.
 * @throws An error if the chat session cannot be verified or created.
 */
export async function findOrCreateChat(
    { supabaseClient, logger }: FindOrCreateChatDeps,
    {
        userId,
        existingChatId,
        organizationId,
        finalSystemPromptIdForDb,
        userMessageContent,
    }: FindOrCreateChatParams
): Promise<string> {
    const currentChatId: string | null | undefined = existingChatId;

    if (currentChatId) {
        logger.info(`Client provided chatId: ${currentChatId}. Checking if chat exists.`);
        const { data: chatLookupData, error: chatLookupError } = await supabaseClient
            .from('chats')
            .select('id')
            .eq('id', currentChatId)
            .maybeSingle();

        if (chatLookupError) {
            logger.error(`Error looking up chat by client-provided ID ${currentChatId}:`, { error: chatLookupError });
            throw new Error(`Error verifying chat session: ${chatLookupError.message}`);
        }

        if (chatLookupData) {
            logger.info(`Chat with client-provided ID ${currentChatId} already exists. Proceeding.`);
            return currentChatId;
        } else {
            logger.info(`Chat with client-provided ID ${currentChatId} not found. Creating new chat session with this ID.`);
            const { data: newChatInsertData, error: newChatInsertError } = await supabaseClient
                .from('chats')
                .insert({
                    id: currentChatId,
                    user_id: userId,
                    organization_id: organizationId || null,
                    system_prompt_id: finalSystemPromptIdForDb,
                    title: userMessageContent.substring(0, 50)
                })
                .select('id')
                .single();

            if (newChatInsertError) {
                if (newChatInsertError.code === '23505') {
                    logger.warn(`Attempted to insert new chat with ID '${currentChatId}', but it was likely created by a concurrent request. Proceeding.`, { error: newChatInsertError });
                    return currentChatId;
                } else {
                    logger.error(`Error creating new chat session with client-provided ID ${currentChatId}:`, { error: newChatInsertError });
                    throw new Error(newChatInsertError.message || `Failed to create new chat session with ID ${currentChatId}.`);
                }
            } else if (!newChatInsertData) {
                logger.error(`Failed to create new chat session with client-provided ID ${currentChatId} (no data returned from insert).`);
                throw new Error(`Failed to create new chat session with ID ${currentChatId} (no data).`);
            } else {
                logger.info(`New chat session successfully created with client-provided ID: ${newChatInsertData.id}`);
                return currentChatId;
            }
        }
    } else {
        logger.warn('No existingChatId provided by client. Generating new UUID for chat session server-side.');
        const newChatId = crypto.randomUUID();

        const { data: newChatData, error: newChatError } = await supabaseClient
            .from('chats')
            .insert({
                id: newChatId,
                user_id: userId,
                organization_id: organizationId || null,
                system_prompt_id: finalSystemPromptIdForDb,
                title: userMessageContent.substring(0, 50)
            })
            .select('id')
            .single();

        if (newChatError || !newChatData) {
            logger.error('Error creating new chat session with server-generated UUID:', { error: newChatError, generatedId: newChatId });
            throw new Error(newChatError?.message || 'Failed to create new chat session.');
        }
        
        logger.info(`New chat session created with server-generated ID: ${newChatData.id}`);
        return newChatData.id;
    }
}

