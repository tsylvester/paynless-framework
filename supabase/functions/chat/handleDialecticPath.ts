import {
    AdapterResponsePayload,
    ChatApiRequest,
    ChatHandlerSuccessResponse,
    ChatMessageInsert,
    ChatMessageRow,
} from "../_shared/types.ts";
import { handleContinuationLoop } from "./continue.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import { TokenUsageSchema } from "./zodSchema.ts";
import { PathHandlerContext } from "./prepareChatContext.ts";

export async function handleDialecticPath(
    context: PathHandlerContext
): Promise<ChatHandlerSuccessResponse | { error: { message: string, status?: number } }> {
    const {
        deps,
        userId,
        requestBody,
        wallet,
        aiProviderAdapter,
        modelConfig,
        finalSystemPromptIdForDb,
        apiKey,
        providerApiIdentifier,
    } = context;
    const { logger, tokenWalletService, countTokensForMessages: countTokensFn, debitTokens } = deps;
    const {
        message: userMessageContent,
        providerId: requestProviderId,
        promptId: requestPromptId,
        organizationId,
        max_tokens_to_generate,
        continue_until_complete
    } = requestBody;
    
    logger.info('Dialectic request processing (no rewind).');

    const messagesForProvider: {role: 'user' | 'assistant' | 'system', content: string}[] = [{ role: 'user', content: userMessageContent }];

    let maxAllowedOutputTokens: number;
    try {
        if (!modelConfig) {
            logger.error('Critical: modelConfig is null before token counting (normal path).', { providerId: requestProviderId, apiIdentifier: providerApiIdentifier });
            return { error: { message: 'Internal server error: Provider configuration missing for token calculation.', status: 500 } };
        }
        const tokensRequiredForNormal = await countTokensFn(messagesForProvider, modelConfig);
        logger.info('Estimated tokens for normal prompt.', { tokensRequiredForNormal, model: providerApiIdentifier });

        if (modelConfig.provider_max_input_tokens && tokensRequiredForNormal > modelConfig.provider_max_input_tokens) {
            logger.warn('Request exceeds provider max input tokens.', {
                tokensRequired: tokensRequiredForNormal,
                providerMaxInput: modelConfig.provider_max_input_tokens,
                model: providerApiIdentifier
            });
            return { error: { message: `Your message is too long. The maximum allowed length for this model is ${modelConfig.provider_max_input_tokens} tokens, but your message is ${tokensRequiredForNormal} tokens.`, status: 413 } };
        }
        
        maxAllowedOutputTokens = getMaxOutputTokens(
            parseFloat(String(wallet.balance)),
            tokensRequiredForNormal,
            modelConfig,
            logger
        );

        if (maxAllowedOutputTokens < 1) {
            logger.warn('Insufficient balance for estimated prompt tokens (normal path).', {
                walletId: wallet.walletId,
                balance: wallet.balance,
                estimatedCost: tokensRequiredForNormal,
                maxAllowedOutput: maxAllowedOutputTokens
            });
            return { error: { message: `Insufficient token balance for this request. Please add funds to your wallet.`, status: 402 } };
        }
    } catch(e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        logger.error('Error during token counting for normal prompt:', { error: errorMessage, model: providerApiIdentifier });
        return { error: { message: `Internal server error during token calculation: ${errorMessage}`, status: 500 } };
    }

    logger.info(`Processing with real provider: ${providerApiIdentifier}`);
    if (!apiKey) {
        logger.error(`Critical: API key for ${providerApiIdentifier} was not resolved before normal path adapter call.`);
        return { error: { message: 'Internal server error: API key missing for chat operation.', status: 500 } };
    }

    let adapterResponsePayload: AdapterResponsePayload;
    try {
            const adapterChatRequestNormal: ChatApiRequest = {
            message: userMessageContent, 
            messages: messagesForProvider, 
            providerId: requestProviderId,
            promptId: requestPromptId, 
            chatId: undefined,
            organizationId: organizationId,
            max_tokens_to_generate: Math.min(max_tokens_to_generate || Infinity, maxAllowedOutputTokens)
        };

        if (continue_until_complete) {
            adapterResponsePayload = await handleContinuationLoop(
                aiProviderAdapter,
                adapterChatRequestNormal,
                providerApiIdentifier,
                apiKey,
                deps.logger
            );
        } else {
            adapterResponsePayload = await aiProviderAdapter.sendMessage(
                adapterChatRequestNormal,
                providerApiIdentifier
            );
        }
        logger.info('AI adapter returned successfully (dialectic path).');

        const parsedTokenUsage = TokenUsageSchema.safeParse(adapterResponsePayload.token_usage);

        if (parsedTokenUsage.success && parsedTokenUsage.data) {
            const tokenUsage = parsedTokenUsage.data;

            if (
                (!requestBody.max_tokens_to_generate || requestBody.max_tokens_to_generate <= 0) &&
                modelConfig.hard_cap_output_tokens && modelConfig.hard_cap_output_tokens > 0 &&
                typeof tokenUsage.completion_tokens === 'number' &&
                tokenUsage.completion_tokens > modelConfig.hard_cap_output_tokens
            ) {
                logger.info('Applying hard_cap_output_tokens from model config.', {
                    original_completion_tokens: tokenUsage.completion_tokens,
                    hard_cap_output_tokens: modelConfig.hard_cap_output_tokens,
                    model_api_identifier: providerApiIdentifier
                });
                tokenUsage.completion_tokens = modelConfig.hard_cap_output_tokens;
                
                if (typeof tokenUsage.prompt_tokens === 'number') {
                    tokenUsage.total_tokens = tokenUsage.prompt_tokens + tokenUsage.completion_tokens;
                } else {
                    tokenUsage.total_tokens = tokenUsage.completion_tokens;
                    logger.warn('Prompt_tokens missing or invalid when recalculating total_tokens after capping.', {
                        model_api_identifier: providerApiIdentifier
                    });
                }
                adapterResponsePayload.token_usage = tokenUsage;
            }
        }
     } catch (adapterError) {
        logger.error(`Normal path error: AI adapter (${providerApiIdentifier}) failed.`, { error: adapterError });
        const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
        
        const assistantErrorContent = `AI service request failed: ${errorMessage}`;
        const assistantErrorMessageData: ChatMessageInsert = {
            id: crypto.randomUUID(),
            chat_id: undefined,
            user_id: userId,
            role: 'assistant',
            content: assistantErrorContent,
            ai_provider_id: requestProviderId,
            system_prompt_id: finalSystemPromptIdForDb,
            token_usage: null,
            error_type: 'ai_provider_error',
            is_active_in_thread: true,
        };

        // For dialectic jobs, we do not save the error to the database.
        // The error is returned to the caller (the worker) to be handled.
        logger.warn('Dialectic job failed, not saving error message to DB.', { userId });

        return {
            error: {
                message: errorMessage,
                status: 502
            }
        };
     }

    try {
        const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(adapterResponsePayload.token_usage);
        if (!parsedTokenUsage.success) {
            logger.error('Normal path: Failed to parse token_usage from adapter.', { error: parsedTokenUsage.error, payload: adapterResponsePayload.token_usage });
            return { error: { message: 'Received invalid token usage data from AI provider.', status: 502 }};
        }

        const assistantMessageId = crypto.randomUUID();
        const { userMessage, assistantMessage } = await debitTokens(
            { logger, tokenWalletService: tokenWalletService! },
            {
                wallet,
                tokenUsage: parsedTokenUsage.data,
                modelConfig,
                userId,
                chatId: undefined,
                relatedEntityId: assistantMessageId,
                databaseOperation: async () => {
                    const userMessageInsert: ChatMessageRow = {
                        id: crypto.randomUUID(),
                        chat_id: null,
                        user_id: userId,
                        role: 'user',
                        content: userMessageContent,
                        is_active_in_thread: true,
                        ai_provider_id: requestProviderId,
                        system_prompt_id: finalSystemPromptIdForDb,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        error_type: null,
                        response_to_message_id: null,
                        token_usage: null,
                    };
                     const assistantMessageInsert: ChatMessageRow = {
                        id: assistantMessageId,
                        chat_id: null,
                        role: 'assistant',
                        content: adapterResponsePayload.content,
                        ai_provider_id: adapterResponsePayload.ai_provider_id,
                        system_prompt_id: finalSystemPromptIdForDb,
                        token_usage: adapterResponsePayload.token_usage,
                        is_active_in_thread: true,
                        error_type: null,
                        response_to_message_id: userMessageInsert.id,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        user_id: userId,
                    };
                    return await Promise.resolve({ userMessage: userMessageInsert, assistantMessage: assistantMessageInsert });
                }
            }
        );
        
        return {
            userMessage,
            assistantMessage,
            chatId: undefined
        };

    } catch (err) {
        const typedErr = err instanceof Error ? err : new Error(String(err));
        // This is a critical failure, likely from the database operation within debitTokens.
        // We re-throw it to ensure the caller (and the test's assertRejects) knows the operation failed catastrophically.
        logger.error('Error during debitTokens transaction for normal path. Re-throwing.', { error: typedErr.message });
        throw typedErr;
    }
}

