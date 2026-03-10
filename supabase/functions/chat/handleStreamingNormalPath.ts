import {
    AdapterResponsePayload,
    ChatApiRequest,
    ChatMessageInsert,
} from "../_shared/types.ts";
import { findOrCreateChat } from "./findOrCreateChat.ts";
import { constructMessageHistory } from "./constructMessageHistory.ts";
import { getMaxOutputTokens } from "../_shared/utils/affordability_utils.ts";
import { TokenUsageSchema } from "./zodSchema.ts";
import { PathHandlerContext } from "./prepareChatContext.ts";
import type { CountTokensDeps } from "../_shared/types/tokenizer.types.ts";
import { isApiChatMessage } from "../_shared/utils/type_guards.ts";

export async function handleStreamingNormalPath(
    context: PathHandlerContext
): Promise<Response> {
    const {
        supabaseClient,
        deps,
        userId,
        requestBody,
        wallet,
        aiProviderAdapter,
        modelConfig,
        actualSystemPromptText,
        finalSystemPromptIdForDb,
        apiKey,
        providerApiIdentifier,
    } = context;
    const { logger, tokenWalletService, countTokens: countTokensFn, createErrorResponse } = deps;
    const {
        message: userMessageContent,
        providerId: requestProviderId,
        promptId: requestPromptId,
        chatId: existingChatId,
        organizationId,
        selectedMessages,
        rewindFromMessageId,
        max_tokens_to_generate,
    } = requestBody;
    
    logger.info('Starting SSE streaming chat request processing');

    try {
        let currentChatId = await findOrCreateChat(
            { supabaseClient, logger },
            {
                userId,
                existingChatId,
                organizationId,
                finalSystemPromptIdForDb,
                userMessageContent,
            }
        );

        let { history: messagesForProvider, historyFetchError } = await constructMessageHistory(
            supabaseClient,
            currentChatId,
            userMessageContent,
            actualSystemPromptText,
            rewindFromMessageId,
            selectedMessages,
            logger
        );

        if (historyFetchError && existingChatId && existingChatId === currentChatId) {
            logger.warn(`Error fetching message history for client-provided chatId ${existingChatId}. Creating new chat for streaming.`);
            
            const newChatIdAfterHistoryError = crypto.randomUUID();
            const { data: newChatData, error: newChatError } = await supabaseClient
                .from('chats')
                .insert({
                    id: newChatIdAfterHistoryError,
                    user_id: userId,
                    organization_id: organizationId || null,
                    system_prompt_id: finalSystemPromptIdForDb,
                    title: userMessageContent.substring(0, 50)
                })
                .select('id')
                .single();

            if (newChatError || !newChatData) {
                logger.error('Error creating new chat for streaming:', { error: newChatError });
                return createErrorResponse('Failed to create new chat session for streaming.', 500, new Request(''));
            }
            
            currentChatId = newChatIdAfterHistoryError;
            messagesForProvider = [];
            if (actualSystemPromptText) {
                messagesForProvider.push({ role: 'system', content: actualSystemPromptText });
            }
            messagesForProvider.push({ role: 'user', content: userMessageContent });
            historyFetchError = undefined;

        } else if (historyFetchError) {
            logger.error(`Error fetching message history for streaming chat ${currentChatId}:`, { error: historyFetchError });
            return createErrorResponse(`Failed to fetch message history: ${historyFetchError.message}`, 500, new Request(''));
        }

        const tokenizerDeps: CountTokensDeps = {
            getEncoding: (name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
            countTokensAnthropic: (text: string) => (text ?? '').length,
            logger: logger,
        };

        const effectiveMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = (messagesForProvider || [])
            .filter((m): m is { role: 'system' | 'user' | 'assistant'; content: string } => isApiChatMessage(m) && typeof m.content === 'string');
        
        if (effectiveMessages.length === 0) {
            effectiveMessages.push({ role: 'user', content: userMessageContent });
        }

        let maxAllowedOutputTokens: number;
        try {
            if (!modelConfig) {
                logger.error('Critical: modelConfig is null before token counting (streaming path).');
                return createErrorResponse('Internal server error: Provider configuration missing for token calculation.', 500, new Request(''));
            }
            
            const tokensRequiredForStreaming = await countTokensFn(tokenizerDeps, {
                systemInstruction: actualSystemPromptText || undefined,
                message: userMessageContent,
                messages: effectiveMessages,
                resourceDocuments: requestBody.resourceDocuments,
            }, modelConfig);
            
            logger.info('Estimated tokens for streaming prompt.', { tokensRequiredForStreaming, model: providerApiIdentifier });

            if (modelConfig.provider_max_input_tokens && tokensRequiredForStreaming > modelConfig.provider_max_input_tokens) {
                logger.warn('Streaming request exceeds provider max input tokens.', {
                    tokensRequired: tokensRequiredForStreaming,
                    providerMaxInput: modelConfig.provider_max_input_tokens,
                    model: providerApiIdentifier
                });
                return createErrorResponse(`Your message is too long for streaming. Maximum: ${modelConfig.provider_max_input_tokens} tokens, actual: ${tokensRequiredForStreaming} tokens.`, 413, new Request(''));
            }
            
            maxAllowedOutputTokens = getMaxOutputTokens(
                parseFloat(String(wallet.balance)),
                tokensRequiredForStreaming,
                modelConfig,
                logger
            );

            if (maxAllowedOutputTokens < 1) {
                logger.warn('Insufficient balance for streaming request.', {
                    walletId: wallet.walletId,
                    balance: wallet.balance,
                    estimatedCost: tokensRequiredForStreaming,
                    maxAllowedOutput: maxAllowedOutputTokens
                });
                return createErrorResponse('Insufficient token balance for this streaming request.', 402, new Request(''));
            }
        } catch(e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logger.error('Error during token counting for streaming prompt:', { error: errorMessage, model: providerApiIdentifier });
            return createErrorResponse(`Internal server error during token calculation: ${errorMessage}`, 500, new Request(''));
        }

        // Create SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send initial event with chat metadata
                    const initData = {
                        type: 'chat_start',
                        chatId: currentChatId,
                        timestamp: new Date().toISOString()
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(initData)}\n\n`));

                    // Save user message first
                    const userMessageInsert: ChatMessageInsert = {
                        chat_id: currentChatId,
                        user_id: userId,
                        role: 'user',
                        content: userMessageContent,
                        is_active_in_thread: true,
                        ai_provider_id: requestProviderId,
                        system_prompt_id: finalSystemPromptIdForDb,
                    };
                    
                    const { data: savedUserMessage, error: userInsertError } = await supabaseClient
                        .from('chat_messages')
                        .insert(userMessageInsert)
                        .select()
                        .single();

                    if (userInsertError || !savedUserMessage) {
                        throw userInsertError || new Error('Failed to save user message for streaming.');
                    }

                    logger.info(`Starting streaming AI request for provider: ${providerApiIdentifier}`);
                    if (!apiKey) {
                        throw new Error(`API key for ${providerApiIdentifier} was not resolved before streaming.`);
                    }

                    const adapterChatRequest: ChatApiRequest = {
                        message: userMessageContent, 
                        messages: effectiveMessages, 
                        providerId: requestProviderId,
                        promptId: requestPromptId, 
                        chatId: currentChatId,
                        organizationId: organizationId,
                        max_tokens_to_generate: Math.min(max_tokens_to_generate || Infinity, maxAllowedOutputTokens),
                        stream: true
                    };

                    // TODO: Implement streaming in AI provider adapter
                    // For now, we'll simulate streaming by calling the regular adapter and chunking the response
                    const adapterResponse = await aiProviderAdapter.sendMessage(
                        adapterChatRequest,
                        providerApiIdentifier
                    );

                    // Simulate streaming by sending the content in chunks
                    const content = adapterResponse.content || '';
                    const chunkSize = 10; // Characters per chunk
                    let assistantContent = '';
                    
                    const assistantMessageId = crypto.randomUUID();
                    
                    for (let i = 0; i < content.length; i += chunkSize) {
                        const chunk = content.slice(i, i + chunkSize);
                        assistantContent += chunk;
                        
                        const streamData = {
                            type: 'content_chunk',
                            content: chunk,
                            assistantMessageId: assistantMessageId,
                            timestamp: new Date().toISOString()
                        };
                        
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`));
                        
                        // Small delay to simulate real streaming
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    // Save the complete assistant message to database
                    const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(adapterResponse.token_usage);
                    if (!parsedTokenUsage.success) {
                        logger.error('Streaming: Failed to parse token_usage from adapter.', { error: parsedTokenUsage.error });
                        throw new Error('Invalid token usage data from AI provider.');
                    }

                    // Use debitTokens to handle the transaction and save assistant message
                    const { assistantMessage } = await deps.debitTokens(
                        { logger, tokenWalletService: tokenWalletService! },
                        {
                            wallet,
                            tokenUsage: parsedTokenUsage.data,
                            modelConfig,
                            userId,
                            chatId: currentChatId,
                            relatedEntityId: assistantMessageId,
                            databaseOperation: async () => {
                                const assistantMessageInsert: ChatMessageInsert = {
                                    id: assistantMessageId,
                                    chat_id: currentChatId,
                                    role: 'assistant',
                                    content: assistantContent,
                                    ai_provider_id: adapterResponse.ai_provider_id,
                                    system_prompt_id: finalSystemPromptIdForDb,
                                    token_usage: adapterResponse.token_usage,
                                    is_active_in_thread: true,
                                    error_type: null,
                                    response_to_message_id: savedUserMessage.id
                                };
                                
                                const { data: insertedAssistantMessage, error: assistantInsertError } = await supabaseClient
                                    .from('chat_messages')
                                    .insert(assistantMessageInsert)
                                    .select()
                                    .single();
                                
                                if (assistantInsertError || !insertedAssistantMessage) {
                                    throw assistantInsertError || new Error('Failed to insert assistant message for streaming.');
                                }

                                return { userMessage: savedUserMessage, assistantMessage: insertedAssistantMessage };
                            }
                        }
                    );

                    // Send completion event
                    const completionData = {
                        type: 'chat_complete',
                        assistantMessage: assistantMessage,
                        finish_reason: adapterResponse.finish_reason,
                        timestamp: new Date().toISOString()
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`));

                    // Close the stream
                    controller.close();
                    logger.info('SSE streaming completed successfully');

                } catch (error) {
                    logger.error('Error during SSE streaming:', { error: error instanceof Error ? error.message : String(error) });
                    
                    // Send error event
                    const errorData = {
                        type: 'error',
                        message: error instanceof Error ? error.message : 'An error occurred during streaming',
                        timestamp: new Date().toISOString()
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
        });

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Unhandled error in streaming normal path:', { error: errorMessage });
        return createErrorResponse(errorMessage, 500, new Request(''));
    }
}