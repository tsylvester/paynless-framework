// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Use js-tiktoken for simpler Deno compatibility
import { getEncoding } from 'https://esm.sh/js-tiktoken@1.0.10';
// Import shared response/error handlers
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse,
} from '../_shared/cors-headers.ts'; 
// Import AI service factory and necessary types
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts';
// Use import type for type-only imports
import type { 
    ChatApiRequest, 
    ChatHandlerDeps, 
    AdapterResponsePayload,
    ChatHandlerSuccessResponse,
    PerformChatRewindArgs,
    ChatMessageInsert,
    ChatMessageRow,
    TokenUsage,
 } from '../_shared/types.ts'; 
import type { Database, Json } from "../types_db.ts"; 
import { verifyApiKey } from '../_shared/auth.ts'; // Assuming verifyApiKey is not used in this specific flow but kept for DI consistency
import { logger as defaultLogger } from '../_shared/logger.ts'; // Renamed to avoid conflict with deps.logger
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { TokenWallet, TokenWalletTransactionType } from '../_shared/types/tokenWallet.types.ts';

// Pre-fetch env vars for defaultDeps to handle potential early init issues in tests
const supabaseUrlForDefault = Deno.env.get("SUPABASE_URL");
const serviceRoleKeyForDefault = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient, 
  fetch: fetch,
  handleCorsPreflightRequest,
  createSuccessResponse,
  createErrorResponse,
  getAiProviderAdapter,
  verifyApiKey, 
  logger: defaultLogger,
  tokenWalletService: (supabaseUrlForDefault && serviceRoleKeyForDefault) 
    ? new TokenWalletService(createClient(supabaseUrlForDefault, serviceRoleKeyForDefault))
    : undefined, // Now type-correct as tokenWalletService is optional in ChatHandlerDeps
  countTokensForMessages: countTokensForMessages, // Added default implementation
};

// --- Main Handler ---
export async function handler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  const {
    createSupabaseClient: createSupabaseClientDep,
    handleCorsPreflightRequest,
    createSuccessResponse,
    createErrorResponse,
    logger, // Use logger from deps
  } = deps;

  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
     logger.info("Chat function called without Authorization header.");
     if (req.method === 'POST') {
        logger.info("POST request without auth header. Returning AUTH_REQUIRED signal.");
        return createSuccessResponse(
            { error: "Authentication required", code: "AUTH_REQUIRED" },
            401,
            req
        );
     } else if (req.method !== 'DELETE') { 
        logger.info(`Non-POST/Non-DELETE request (${req.method}) without auth header. Returning 405.`);
        return createErrorResponse('Method Not Allowed', 405, req);
     }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
      logger.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
      return createErrorResponse("Server configuration error.", 500, req);
  }

  const supabaseClient = createSupabaseClientDep(
    supabaseUrl,
    supabaseAnonKey,
    { global: { headers: { Authorization: authHeader ?? '' } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    logger.error('Auth error:', { error: userError || 'User not found' });
    return createErrorResponse('Invalid authentication credentials', 401, req);
  }
  const userId = user.id;
  logger.info('Authenticated user:', { userId });

  if (req.method === 'POST') {
    try {
        const requestBody: ChatApiRequest = await req.json();
        logger.info('Received chat POST request:', { body: requestBody });
        const result = await handlePostRequest(requestBody, supabaseClient, userId, deps);
        if (result && typeof result === 'object' && 'error' in result) {
            const errorResponsePayload = { data: null, error: result.error };
            return createErrorResponse(errorResponsePayload.error.message, errorResponsePayload.error.status || 500, req);
        }
        return createSuccessResponse(result, 200, req);
    } catch (err) {
        logger.error('Unhandled error in POST mainHandler:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
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
        const { error: rpcError } = await supabaseClient.rpc('delete_chat_and_messages', {
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

// --- Helper to construct message history ---
async function constructMessageHistory(
    supabaseClient: SupabaseClient<Database>,
    existingChatId: string | null | undefined,
    newUserMessageContent: string,
    system_prompt_text: string | null,
    rewindFromMessageId: string | null | undefined, // Keep for potential future use, though not primary with selectedMessages
    selectedMessages: ChatApiRequest['selectedMessages'], 
    logger: ChatHandlerDeps['logger'] 
): Promise<{ history: {role: 'user' | 'assistant' | 'system', content: string}[], historyFetchError?: Error }> {
    const history: {role: 'user' | 'assistant' | 'system', content: string}[] = [];
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
                    ['user', 'assistant', 'system'].includes(msg.role) && 
                    typeof msg.content === 'string'
                ) {
                    history.push({
                        role: msg.role as 'user' | 'assistant' | 'system',
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


// --- handlePostRequest ---
async function handlePostRequest(
    requestBody: ChatApiRequest, 
    supabaseClient: SupabaseClient<Database>,
    userId: string, 
    deps: ChatHandlerDeps
): Promise<ChatHandlerSuccessResponse | { error: { message: string, status?: number } }> {
    const { 
        logger, 
        getAiProviderAdapter,
        tokenWalletService, // Destructure tokenWalletService from deps
        countTokensForMessages: countTokensFn // Use the one from deps
    } = deps;
    
    // Add a guard clause for tokenWalletService
    if (!tokenWalletService) {
        logger.error('CRITICAL: TokenWalletService not provided in dependencies for handlePostRequest.');
        return { error: { message: 'Internal server configuration error [TokenServiceMissing].', status: 500 } };
    }
    
    // Guard clause for countTokensForMessages
    if (!countTokensFn) {
        logger.error('CRITICAL: countTokensForMessages function not provided in dependencies for handlePostRequest.');
        return { error: { message: 'Internal server configuration error [TokenizerMissing].', status: 500 } };
    }
    
    logger.info('Entering handlePostRequest with body:', { requestBody });

    const { 
        message: userMessageContent, 
        providerId: requestProviderId,
        promptId: requestPromptId,
        chatId: existingChatId, 
        rewindFromMessageId,
        selectedMessages,
        organizationId 
    } = requestBody;

    // --- 1. Input Validation ---
    if (!userMessageContent || typeof userMessageContent !== 'string' || userMessageContent.trim() === '') {
      logger.warn('handlePostRequest: Missing or invalid "message".');
      return { error: { message: 'Missing or invalid "message" in request body', status: 400 } };
    }
    if (!requestProviderId || typeof requestProviderId !== 'string') {
       logger.warn('handlePostRequest: Missing or invalid "providerId".');
       return { error: { message: 'Missing or invalid "providerId" in request body', status: 400 } };
    }
    if (!requestPromptId || typeof requestPromptId !== 'string') {
      logger.warn('handlePostRequest: Missing or invalid "promptId".');
      return { error: { message: 'Missing or invalid "promptId" in request body', status: 400 } };
    }
    if (existingChatId && typeof existingChatId !== 'string') {
      logger.warn('handlePostRequest: Invalid "chatId" format.');
      return { error: { message: 'Invalid "chatId" format', status: 400 } };
    }
    if (rewindFromMessageId && typeof rewindFromMessageId !== 'string') {
      logger.warn('handlePostRequest: Invalid "rewindFromMessageId" format.');
      return { error: { message: 'Invalid "rewindFromMessageId" format', status: 400 } };
    }
    if (selectedMessages) {
      if (!Array.isArray(selectedMessages)) {
        logger.warn('handlePostRequest: Invalid "selectedMessages" format. Must be an array.');
        return { error: { message: 'Invalid "selectedMessages" format. Must be an array.', status: 400 } };
      }
      for (const msg of selectedMessages) {
        if (!msg || typeof msg !== 'object' || !msg.role || !msg.content || 
            !['user', 'assistant', 'system'].includes(msg.role)) { 
          logger.warn('handlePostRequest: Invalid message structure or role in "selectedMessages".', { problematicMessage: msg });
          return { error: { message: 'Invalid message structure or role in "selectedMessages".', status: 400 } };
        }
      }
    }
    logger.info('handlePostRequest: Input validation passed.');

    const systemPromptDbId = requestPromptId === '__none__' ? null : requestPromptId;
    let currentChatId: string | null | undefined = existingChatId; 

    try {
        // --- 2. Fetch Common Prerequisites (Provider and Prompt) ---
        let systemPromptText: string | null = null;
        if (systemPromptDbId) {
          const { data: promptData, error: promptError } = await supabaseClient
            .from('system_prompts')
            .select('prompt_text')
            .eq('id', systemPromptDbId)
            .eq('is_active', true)
            .single();
          if (promptError || !promptData) {
              logger.error('Error fetching system prompt:', { error: promptError });
              return { error: { message: promptError?.message || 'System prompt not found or inactive.', status: 400 }};
          }
          systemPromptText = promptData.prompt_text;
          logger.info('Fetched system prompt text.');
        } else {
            logger.info('No system prompt ID provided (or __none__), systemPromptText remains null.');
        }

        const { data: providerData, error: providerError } = await supabaseClient
          .from('ai_providers')
          .select('api_identifier, provider')
          .eq('id', requestProviderId)
          .eq('is_active', true)
          .single();

        if (providerError || !providerData) {
            logger.error('Error fetching provider details:', { error: providerError });
            return { error: { message: providerError?.message || 'AI provider not found or inactive.', status: 400 }};
        }
        const apiIdentifier = providerData.api_identifier; 
        const providerString = providerData.provider;       
        if (!providerString) {
            logger.error(`Provider string missing for ai_providers record ID: ${requestProviderId}`);
            return { error: { message: 'AI provider configuration error on server [missing provider string].', status: 500 }};
        }
        logger.info(`Fetched provider details: provider=${providerString}, api_identifier=${apiIdentifier}`);

        let wallet: TokenWallet | null = null;
        try {
            // Use the injected tokenWalletService directly
            wallet = await tokenWalletService.getWalletForContext(userId, organizationId);
            if (!wallet) {
                logger.warn('No token wallet found for context.', { userId, organizationId });
                return { error: { message: 'Token wallet not found. Please set up or fund your wallet.', status: 402 } };
            }
            logger.info('Wallet retrieved for context.', { walletId: wallet.walletId, currentBalance: wallet.balance });
        } catch (error) {
            logger.error('Error during token wallet operations (initial check):', { error: error, userId, organizationId });
            return { error: { message: "Server error during wallet check.", status: 500 } };
        }

        // --- 3. Branch Logic: Rewind vs. Normal ---
        if (rewindFromMessageId) {
            // --- 3a. Rewind Path ---
            logger.info(`Rewind request detected. Rewinding from message ID: ${rewindFromMessageId}`);
            if (!currentChatId) {
                logger.warn('handlePostRequest: Rewind requested but no "chatId" provided.');
                return { error: { message: 'Cannot perform rewind without a "chatId"', status: 400 } };
            }

            const { data: rewindPointData, error: rewindPointError } = await supabaseClient
                .from('chat_messages')
                .select('created_at')
                .eq('id', rewindFromMessageId)
                .eq('chat_id', currentChatId) 
                .single();
            if (rewindPointError || !rewindPointData) {
                logger.error(`Rewind error: Failed to find rewind point message ${rewindFromMessageId} in chat ${currentChatId}`, { error: rewindPointError });
                 return { error: { message: rewindPointError?.message || 'Failed to retrieve rewind point details.', status: 404 }};
            }
            const rewindPointTimestamp = rewindPointData.created_at;
            logger.info(`Found rewind point timestamp: ${rewindPointTimestamp}`);

            const { data: historyData, error: historyError } = await supabaseClient
                .from('chat_messages')
                .select('*') 
                .eq('chat_id', currentChatId)
                .eq('is_active_in_thread', true)
                .lte('created_at', rewindPointTimestamp) 
                .order('created_at', { ascending: true });
            if (historyError) {
                logger.error('Rewind error: Failed to fetch chat history for AI context.', { error: historyError });
                return { error: { message: historyError.message, status: 500 }};
            }
            const chatHistoryForAI: ChatMessageRow[] = historyData || [];
            logger.info(`Fetched ${chatHistoryForAI.length} messages for AI context (up to rewind point).`);
            
            const messagesForAdapter: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
            if (systemPromptText) {
                messagesForAdapter.push({ role: 'system', content: systemPromptText });
            }
            // For rewind, use the fetched history up to the rewind point, then add the new user message.
            // selectedMessages are ignored in rewind path as rewind implies using actual stored history.
            messagesForAdapter.push(
                ...chatHistoryForAI
                    .filter(msg => msg.role && ['user', 'assistant', 'system'].includes(msg.role) && typeof msg.content === 'string')
                    .map(msg => ({ 
                        role: msg.role as 'user' | 'assistant' | 'system', 
                        content: msg.content as string
                    }))
            );
            messagesForAdapter.push({ role: 'user', content: userMessageContent }); // Add new user message for AI to respond to
            
            // --- START: Token Check for Rewind Path (Non-Dummy) ---
            if (providerString !== 'dummy') {
                try {
                    const tokensRequiredForRewind = countTokensFn(messagesForAdapter, apiIdentifier);
                    logger.info('Estimated tokens for rewind prompt.', { tokensRequiredForRewind, model: apiIdentifier });
                    
                    const hasSufficientBalance = await tokenWalletService.checkBalance(wallet.walletId, tokensRequiredForRewind.toString());
                    if (!hasSufficientBalance) {
                        logger.warn('Insufficient token balance for rewind prompt.', { 
                            currentBalance: wallet.balance, // Log current balance for context
                            tokensRequired: tokensRequiredForRewind 
                        });
                        return { 
                            error: { 
                                message: `Insufficient token balance. Approx. ${tokensRequiredForRewind} tokens needed, you have ${wallet.balance}.`, 
                                status: 402 
                            } 
                        };
                    }
                } catch (tokenError: unknown) {
                    const typedTokenError = tokenError instanceof Error ? tokenError : new Error(String(tokenError));
                    logger.error('Error estimating tokens or checking balance for rewind prompt:', { error: typedTokenError.message, model: apiIdentifier }); // Modified log
                    return { error: { message: `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`, status: 500 } }; // Modified error
                }
            }
            // --- END: Token Check for Rewind Path (Non-Dummy) ---

            const adapter = getAiProviderAdapter(providerString);
            if (!adapter) {
                logger.error(`Rewind error: No adapter found for provider: ${providerString}`);
                return { error: { message: `Unsupported AI provider: ${providerString}`, status: 400 }};
            }

            let apiKeyEnvVarName: string;
            switch (providerString.toLowerCase()) {
                case 'openai': apiKeyEnvVarName = 'OPENAI_API_KEY'; break;
                case 'anthropic': apiKeyEnvVarName = 'ANTHROPIC_API_KEY'; break;
                case 'google': apiKeyEnvVarName = 'GOOGLE_API_KEY'; break;
                case 'dummy': apiKeyEnvVarName = 'DUMMY_API_KEY'; break; 
                default:
                    logger.error(`Unknown provider string for API key lookup: ${providerString}`);
                    return { error: { message: `Internal server error: Unknown AI provider configuration for ${providerString}.`, status: 500 }};
            }
            const apiKey = Deno.env.get(apiKeyEnvVarName);
            if (!apiKey && providerString !== 'dummy') { 
                logger.error(`API key not found in env var: ${apiKeyEnvVarName} for provider ${providerString}`);
                return { error: { message: 'AI provider configuration error on server [key missing].', status: 500 }};
            }
            logger.info(`Retrieved API key from env var: ${apiKeyEnvVarName} (or skipped for dummy)`);

            logger.info(`Calling AI adapter (${providerString}) for rewind...`);
            let adapterResponsePayload: AdapterResponsePayload;
            try {
                const adapterChatRequest: ChatApiRequest = {
                    message: userMessageContent, // This is somewhat redundant if messages array includes it
                    messages: messagesForAdapter, // Pass the constructed history
                    providerId: requestProviderId, 
                    promptId: requestPromptId,
                    chatId: currentChatId,
                };
                adapterResponsePayload = await adapter.sendMessage(
                    adapterChatRequest, 
                    apiIdentifier, 
                    apiKey || 'dummy-key' 
                );
                 logger.info('AI adapter returned successfully for rewind.');
            } catch (adapterError) {
                logger.error(`Rewind error: AI adapter (${providerString}) failed.`, { error: adapterError });
                 const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                 return { error: { message: errorMessage, status: 502 }}; 
            }

            const rpcParams: PerformChatRewindArgs = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: rewindFromMessageId,
                p_user_id: userId,
                p_new_user_message_content: userMessageContent, // This is the message the user just typed that triggered the rewind + new response
                p_new_user_message_ai_provider_id: requestProviderId,
                p_new_user_message_system_prompt_id: systemPromptDbId ?? '', 
                p_new_assistant_message_content: adapterResponsePayload.content,
                p_new_assistant_message_token_usage: adapterResponsePayload.token_usage || null,
                p_new_assistant_message_ai_provider_id: requestProviderId, // Assuming same provider for AI response
                p_new_assistant_message_system_prompt_id: systemPromptDbId ?? '', 
            };
            logger.info('Calling perform_chat_rewind RPC with params:', { rpcParams });

            const { data: rpcResultArray, error: rpcError } = await supabaseClient
                .rpc('perform_chat_rewind', rpcParams);

            if (rpcError) {
                logger.error('Rewind error: perform_chat_rewind RPC failed.', { error: rpcError });
                return { error: { message: rpcError.message, status: 500 }};
            }
            const messagesFromResult = rpcResultArray as unknown as ChatMessageRow[];
            if (!messagesFromResult || messagesFromResult.length < 2) {
                 logger.error('Rewind error: perform_chat_rewind RPC returned insufficient data.', { result: messagesFromResult });
                 return { error: { message: 'Chat rewind operation failed to return expected data.', status: 500 }};
            }
            
            const newUserMessageFromRpc = messagesFromResult.find(m => m.role === 'user');
            const newAssistantMessageFromRpc = messagesFromResult.find(m => m.role === 'assistant');
            if (!newUserMessageFromRpc || !newAssistantMessageFromRpc) {
                logger.error('Rewind error: perform_chat_rewind RPC did not return both user and assistant messages.', { result: messagesFromResult });
                return { error: { message: 'Chat rewind data integrity issue from RPC.', status: 500 }};
            }
            
            // --- START: Token Debit for Rewind Path (Non-Dummy) ---
            if (providerString !== 'dummy') {
                const tokenUsageFromAdapter = adapterResponsePayload.token_usage;
                if (tokenUsageFromAdapter && typeof tokenUsageFromAdapter === 'object' && !Array.isArray(tokenUsageFromAdapter) && 'total_tokens' in tokenUsageFromAdapter) {
                    const tokenUsage = tokenUsageFromAdapter as unknown as TokenUsage; // Cast to unknown first
                    if (typeof tokenUsage.total_tokens === 'number' && tokenUsage.total_tokens > 0) {
                        const actualTokensConsumed = tokenUsage.total_tokens;
                        logger.info('Attempting to record token transaction (debit) for rewind.', { 
                            walletId: wallet.walletId, 
                            actualTokensConsumed, 
                            relatedEntityId: newAssistantMessageFromRpc.id 
                        });
                        try {
                            const transactionData = {
                                walletId: wallet.walletId,
                                type: 'DEBIT_USAGE' as TokenWalletTransactionType,
                                amount: actualTokensConsumed.toString(),
                                relatedEntityId: newAssistantMessageFromRpc.id, // Use the ID of the assistant message from RPC
                                relatedEntityType: 'chat_message' as const,
                                recordedByUserId: userId,
                                notes: `Chat completion (rewind) for chat ${currentChatId}`
                            };
                            const transaction = await tokenWalletService.recordTransaction(transactionData);
                            logger.info('Token transaction recorded (debit) for rewind.', { transactionId: transaction.transactionId, walletId: wallet.walletId, amount: actualTokensConsumed });
                        } catch (debitError: unknown) {
                            const typedDebitError = debitError instanceof Error ? debitError : new Error(String(debitError));
                            logger.error('Failed to record token debit transaction for rewind:', { 
                                error: typedDebitError.message, 
                                walletId: wallet.walletId, 
                                actualTokensConsumed 
                            });
                            // Non-fatal for response, but needs monitoring.
                        }
                    } else {
                        logger.warn('Token usage total_tokens is not a positive number for rewind, skipping debit.', { tokenUsage });
                    }
                } else {
                    logger.warn('No valid token_usage object with total_tokens for rewind, skipping debit.', { tokenUsageFromAdapter });
                }
            }
            // --- END: Token Debit for Rewind Path (Non-Dummy) ---
            
            logger.info('perform_chat_rewind RPC successful. Returning new user and assistant messages.');
            return { 
                userMessage: newUserMessageFromRpc, 
                assistantMessage: newAssistantMessageFromRpc, 
                chatId: currentChatId,
                isRewind: true 
            };

        } else {
            // --- 3b. Normal Path (No Rewind) ---
            logger.info('Normal request processing (no rewind).');
            
            if (!currentChatId) {
                logger.info('No existingChatId provided, creating new chat session.');
                const { data: newChatData, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({ 
                        user_id: userId, 
                        organization_id: organizationId || null,
                        system_prompt_id: systemPromptDbId,
                        title: userMessageContent.substring(0, 50) 
                    })
                    .select('id') 
                    .single();
                if (newChatError || !newChatData) {
                    logger.error('Error creating new chat session:', { error: newChatError });
                    return { error: { message: newChatError?.message || 'Failed to create new chat session.', status: 500 } };
                }
                currentChatId = newChatData.id;
                logger.info(`New chat session created with ID: ${currentChatId}`);
            }

            // --- Construct Message History using the helper function ---
            const { history: messagesForProvider, historyFetchError } = await constructMessageHistory(
                supabaseClient,
                currentChatId,
                userMessageContent,
                systemPromptText,
                rewindFromMessageId, // Will be null/undefined here
                selectedMessages,
                logger
            );
            
            // If history fetch failed for an existing chat, treat as a new chat creation
            if (historyFetchError && existingChatId) {
                logger.warn(`History fetch failed for existing chatId '${existingChatId}'. Treating as a new chat.`, { error: historyFetchError });
                currentChatId = null; // This will trigger new chat creation block below
            }
            
            if (!currentChatId) {
                logger.info('No existingChatId provided or history fetch failed for existing, creating new chat session.');
                const { data: newChatData, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({ 
                        user_id: userId, 
                        organization_id: organizationId || null,
                        system_prompt_id: systemPromptDbId,
                        title: userMessageContent.substring(0, 50) 
                    })
                    .select('id') 
                    .single();
                if (newChatError || !newChatData) {
                    logger.error('Error creating new chat session:', { error: newChatError });
                    return { error: { message: newChatError?.message || 'Failed to create new chat session.', status: 500 } };
                }
                currentChatId = newChatData.id;
                logger.info(`New chat session created with ID: ${currentChatId}`);
            }

            if (providerString === 'dummy') {
                logger.info(`DUMMY PROVIDER DETECTED (Normal Path): providerString="${providerString}". Proceeding with echo logic.`);
                const userMessageInsert: ChatMessageInsert = {
                    chat_id: currentChatId as string,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, 
                    system_prompt_id: systemPromptDbId, 
                };
                const { data: savedUserMessageDummy, error: userInsertErrorDummy } = await supabaseClient
                    .from('chat_messages')
                    .insert(userMessageInsert)
                    .select()
                    .single();
                if (userInsertErrorDummy || !savedUserMessageDummy) {
                    logger.error('Dummy provider error: Failed to insert user message.', { error: userInsertErrorDummy });
                    return { error: { message: userInsertErrorDummy.message || 'Failed to save user message for dummy', status: 500 }};
                }
                logger.info('Dummy provider: Inserted user message.');

                const dummyAssistantContent = `Echo from Dummy: ${userMessageContent}`;
                let token_usage_json: Json = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                try {
                    // Use countTokensFn for dummy provider as well, using apiIdentifier as modelName
                    const dummyMessagesForTokenCounting = [
                        { role: 'user' as const, content: userMessageContent },
                        { role: 'assistant' as const, content: dummyAssistantContent }
                    ];
                    // apiIdentifier should be available from providerData earlier in the function
                    const totalTokens = countTokensFn(dummyMessagesForTokenCounting, apiIdentifier);
                    // For dummy, let's assume prompt is user message, completion is assistant for simplicity
                    // This is a rough approximation; a more accurate split would need more logic
                    const promptTokens = countTokensFn([{ role: 'user' as const, content: userMessageContent }], apiIdentifier);
                    const completionTokens = totalTokens - promptTokens > 0 ? totalTokens - promptTokens : 0;

                    token_usage_json = {
                        prompt_tokens: promptTokens,
                        completion_tokens: completionTokens,
                        total_tokens: totalTokens
                    };
                } catch (e: unknown) {
                    logger.error('Dummy provider: Failed to count tokens with countTokensFn', { error: e instanceof Error ? e.stack : String(e), modelUsed: apiIdentifier });
                }
                
                const dummyAssistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(), 
                    chat_id: currentChatId as string,
                    role: 'assistant',
                    content: dummyAssistantContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId,
                    system_prompt_id: systemPromptDbId,
                    token_usage: token_usage_json, 
                };
                const { data: dummyAssistantInsertResult, error: assistantInsertErrorDummy } = await supabaseClient
                    .from('chat_messages')
                    .insert(dummyAssistantMessageInsert)
                    .select()
                    .single();
                if (assistantInsertErrorDummy || !dummyAssistantInsertResult) {
                    logger.error('Dummy provider error: Failed to insert assistant message.', { error: assistantInsertErrorDummy });
                     return { error: { message: assistantInsertErrorDummy?.message || 'Failed to insert dummy assistant message.', status: 500 }};
                }
                logger.info('Dummy provider: Inserted dummy assistant message.');
                
                return { 
                    userMessage: savedUserMessageDummy as ChatMessageRow, // Return the saved user message for dummy
                    assistantMessage: dummyAssistantInsertResult as ChatMessageRow, 
                    chatId: currentChatId as string,
                    isDummy: true 
                };

            } else {
                 logger.info(`Processing with real provider: ${providerString}`);
                 const adapter = getAiProviderAdapter(providerString);
                 if (!adapter) {
                    logger.error(`Normal path error: No adapter found for provider: ${providerString}`);
                    return { error: { message: `Unsupported AI provider: ${providerString}`, status: 400 }};
                 }

                let apiKeyEnvVarNameNormal: string;
                switch (providerString.toLowerCase()) {
                    case 'openai': apiKeyEnvVarNameNormal = 'OPENAI_API_KEY'; break;
                    case 'anthropic': apiKeyEnvVarNameNormal = 'ANTHROPIC_API_KEY'; break;
                    case 'google': apiKeyEnvVarNameNormal = 'GOOGLE_API_KEY'; break;
                    default: // Should not happen if adapter was found, but good for safety
                        logger.error(`Unknown provider string for API key lookup (after adapter found): ${providerString}`);
                        return { error: { message: `Internal server error: Unknown AI provider configuration.`, status: 500 }};
                }
                const apiKeyNormal = Deno.env.get(apiKeyEnvVarNameNormal);
                if (!apiKeyNormal) { 
                    logger.error(`API key not found in env var: ${apiKeyEnvVarNameNormal} for provider ${providerString}`);
                    return { error: { message: 'AI provider configuration error on server [key missing].', status: 500 }};
                }
                logger.info(`Retrieved API key from env var: ${apiKeyEnvVarNameNormal}`);

                 // --- START: Token Check for Normal Path (Non-Dummy) ---
                 try {
                    const tokensRequiredForNormal = countTokensFn(messagesForProvider, apiIdentifier);
                    logger.info('Estimated tokens for normal prompt.', { tokensRequiredForNormal, model: apiIdentifier });

                    const hasSufficientBalanceNormal = await tokenWalletService.checkBalance(wallet.walletId, tokensRequiredForNormal.toString());
                    if (!hasSufficientBalanceNormal) {
                        logger.warn('Insufficient token balance for normal prompt.', { 
                            currentBalance: wallet.balance, // Log current balance for context
                            tokensRequired: tokensRequiredForNormal 
                        });
                        return { 
                            error: { 
                                message: `Insufficient token balance. Approx. ${tokensRequiredForNormal} tokens needed, you have ${wallet.balance}.`, 
                                status: 402 
                            } 
                        };
                    }
                 } catch (tokenError: unknown) {
                    const typedTokenError = tokenError instanceof Error ? tokenError : new Error(String(tokenError));
                    logger.error('Error estimating tokens or checking balance for normal prompt:', { error: typedTokenError.message, model: apiIdentifier }); // Modified log
                    return { error: { message: `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`, status: 500 } }; // Modified error
                 }
                 // --- END: Token Check for Normal Path (Non-Dummy) ---

                 logger.info(`Calling AI adapter (${providerString}) for normal response...`);
                 let adapterResponsePayload: AdapterResponsePayload;
                 try {
                    const adapterChatRequestNormal: ChatApiRequest = {
                        message: userMessageContent, 
                        messages: messagesForProvider, 
                        providerId: requestProviderId,
                        promptId: requestPromptId, 
                        chatId: currentChatId,
                        organizationId: organizationId,
                    };
                    adapterResponsePayload = await adapter.sendMessage(
                        adapterChatRequestNormal,
                        apiIdentifier, 
                        apiKeyNormal
                    );
                    logger.info('AI adapter returned successfully (normal path).');
                 } catch (adapterError) {
                    logger.error(`Normal path error: AI adapter (${providerString}) failed.`, { error: adapterError });
                    const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                    return { error: { message: errorMessage, status: 502 }};
                 }

                // --- START: Token Debit for Normal Path (Moved Before Message Saves) ---
                let transactionRecordedSuccessfully = false;
                const tokenUsageFromAdapterNormal = adapterResponsePayload.token_usage;

                if (tokenUsageFromAdapterNormal && typeof tokenUsageFromAdapterNormal === 'object' && !Array.isArray(tokenUsageFromAdapterNormal) && 'total_tokens' in tokenUsageFromAdapterNormal) {
                    const tokenUsageNormal = tokenUsageFromAdapterNormal as unknown as TokenUsage;
                    if (typeof tokenUsageNormal.total_tokens === 'number' && tokenUsageNormal.total_tokens > 0) {
                        const actualTokensConsumed = tokenUsageNormal.total_tokens;
                        logger.info('Attempting to record token transaction (debit) for normal path BEFORE saving messages.', { 
                            walletId: wallet.walletId, 
                            actualTokensConsumed, 
                            // relatedEntityId will be set after assistant message is hypothetically saved, but debit happens first.
                            // For now, we can't use assistantInsertResult.id here.
                        });
                        try {
                            const transactionData = {
                                walletId: wallet.walletId,
                                type: 'DEBIT_USAGE' as TokenWalletTransactionType,
                                amount: actualTokensConsumed.toString(),
                                // relatedEntityId: assistantInsertResult.id, // Cannot use yet
                                relatedEntityType: 'chat_message' as const,
                                recordedByUserId: userId,
                                notes: `Chat completion for chat ${currentChatId}` // relatedEntityId for message will be added later if needed or make generic.
                            };
                            const transaction = await tokenWalletService.recordTransaction(transactionData);
                            logger.info('Token transaction recorded (debit) successfully.', { transactionId: transaction.transactionId, walletId: wallet.walletId, amount: actualTokensConsumed });
                            transactionRecordedSuccessfully = true;
                        } catch (debitError: unknown) {
                            const typedDebitError = debitError instanceof Error ? debitError : new Error(String(debitError));
                            logger.error('CRITICAL: Failed to record token debit transaction for normal path AFTER successful AI response. Messages will NOT be saved.', { 
                                error: typedDebitError.message, 
                                walletId: wallet.walletId, 
                                actualTokensConsumed,
                                aiResponseContent: adapterResponsePayload.content.substring(0, 100) // Log a snippet
                            });
                            // This is a critical failure. The AI call was made, but we couldn't debit.
                            // Return 500 to the user, do not save messages.
                            return { 
                                error: { 
                                    message: 'AI response was generated, but a critical error occurred while finalizing your transaction. Your message has not been saved. Please try again. If the issue persists, contact support.', 
                                    status: 500 
                                } 
                            };
                        }
                    } else {
                        logger.warn('Token usage total_tokens is not a positive number for normal path, debit skipped. This might be an issue.', { tokenUsageNormal });
                        // If debit is skipped due to bad token data from AI, we might still proceed but this should be reviewed.
                        // For now, let's assume if total_tokens is 0 or invalid, we don't debit and proceed with saving messages.
                        // However, this could be problematic if tokens *should* have been debited.
                        // Consider if this should be a hard error or a soft one.
                        // For now, treating as non-fatal IF total_tokens is explicitly not positive.
                        // If token_usage object itself is bad, it's caught by the outer 'else'.
                        transactionRecordedSuccessfully = true; // Marking as true to allow message saving if debit is legitimately zero.
                    }
                } else {
                    logger.warn('No valid token_usage object with total_tokens for normal path, debit skipped. AI response will still be saved.', { tokenUsageFromAdapterNormal });
                    // If the adapter completely fails to provide token_usage, we log it and proceed.
                    // This is a policy decision: save the message even if we can't account for tokens from this specific response?
                    // For now, we allow it, but this requires careful monitoring.
                    transactionRecordedSuccessfully = true; // Marking as true to allow message saving.
                }

                // If debit failed critically (and returned 500), we won't reach here.
                // If debit was skipped (e.g. zero tokens, or bad token_usage object from AI but not a service crash),
                // transactionRecordedSuccessfully will allow us to proceed.

                // --- Message Saving (Only if debit was successful or legitimately skipped) ---
                // The user message should ideally be saved once it's confirmed the interaction will proceed.
                // However, to link assistant message to user message, user message often saved first or in transaction.
                // For now, we save user message, then assistant. If assistant save fails, that's an issue.

                const userMessageInsert: ChatMessageInsert = {
                    chat_id: currentChatId as string,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, 
                    system_prompt_id: systemPromptDbId, 
                };
                const { data: savedUserMessage, error: userInsertError } = await supabaseClient
                    .from('chat_messages')
                    .insert(userMessageInsert)
                    .select()
                    .single();
                 if (userInsertError || !savedUserMessage) {
                     logger.error('Normal path error: Failed to insert user message. This happened AFTER a successful token debit (if applicable).', { error: userInsertError, chatId: currentChatId });
                     // This is problematic. Tokens might be debited, but user message failed.
                     // Consider a compensating transaction or at least a critical alert.
                     return { error: { message: userInsertError.message || 'Failed to save user message after token debit.', status: 500 }};
                 }
                logger.info('Normal path: Inserted user message.', { id: savedUserMessage.id });

                const assistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(), // Ensure new ID for assistant message if not returned by insert
                    chat_id: currentChatId as string, 
                    role: 'assistant' as const,
                    content: adapterResponsePayload.content,
                    ai_provider_id: adapterResponsePayload.ai_provider_id,
                    system_prompt_id: systemPromptDbId,
                    token_usage: adapterResponsePayload.token_usage,
                    is_active_in_thread: true,
                };
                const { data: assistantInsertResult, error: assistantInsertError } = await supabaseClient
                    .from('chat_messages')
                    .insert(assistantMessageInsert)
                    .select() // Select all columns to get the full row including 'id'
                    .single();

                if (assistantInsertError || !assistantInsertResult) {
                    logger.error('Normal path error: Failed to insert assistant message. This happened AFTER successful token debit and user message save.', { error: assistantInsertError, chatId: currentChatId });
                    // Highly problematic. Tokens debited, user message saved, AI response lost.
                    // Needs critical alert. Consider a compensating transaction for the debit.
                    return { error: { message: assistantInsertError?.message || 'Failed to insert assistant message after token debit.', status: 500 }};
                }
                logger.info('Normal path: Inserted assistant message.', { id: assistantInsertResult.id });
                
                // If debit was successful and relatedEntityId needs to be updated on the token transaction:
                // This is complex if the debit happens before knowing the assistant message ID.
                // One option: record debit without relatedEntityId, then update it. (Adds another DB call)
                // Or: record with chat_id as relatedEntityId, and type 'chat_session_debit'.
                // Current 'notes' field has chat_id. For now, let's assume this is sufficient.

                // We need to map the DB row to the public response structure
                const newAssistantMessageResponse: ChatMessageRow = {
                    id: assistantInsertResult.id,
                    chat_id: assistantInsertResult.chat_id,
                    role: 'assistant', // By definition of this path
                    content: assistantInsertResult.content,
                    created_at: assistantInsertResult.created_at,
                    updated_at: assistantInsertResult.updated_at,
                    user_id: null, // Assistant messages don't have user_id
                    ai_provider_id: assistantInsertResult.ai_provider_id,
                    system_prompt_id: assistantInsertResult.system_prompt_id,
                    token_usage: assistantInsertResult.token_usage
                        ? {
                            prompt_tokens: (assistantInsertResult.token_usage as unknown as TokenUsage).prompt_tokens,
                            completion_tokens: (assistantInsertResult.token_usage as unknown as TokenUsage).completion_tokens,
                            ...( (assistantInsertResult.token_usage as unknown as TokenUsage).total_tokens !== undefined && { total_tokens: (assistantInsertResult.token_usage as unknown as TokenUsage).total_tokens } )
                          }
                        : null,
                    is_active_in_thread: assistantInsertResult.is_active_in_thread,
                };

                return { 
                    userMessage: savedUserMessage as ChatMessageRow, 
                    assistantMessage: newAssistantMessageResponse,
                    chatId: currentChatId as string
                };
            }
        }
    } catch (err) {
        logger.error('Unhandled error in handlePostRequest:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred processing the chat request.';
        return { error: { message: errorMessage, status: 500 }}; 
    }
}

// Helper function
function generateUUID() {
    return crypto.randomUUID();
}

// Start the server
serve(async (req: Request) => {
    try {
        return await handler(req, defaultDeps);
    } catch (e) {
        // Use the logger from defaultDeps for consistency if available, otherwise console.error
        const serverLogger = defaultDeps.logger || defaultLogger; // Fallback to defaultLogger if deps.logger is somehow undefined
        serverLogger.error("Critical error in server request processing:", { 
            error: e instanceof Error ? e.stack : String(e),
            request_url: req.url,
            request_method: req.method,
        });
        
        // Ensure CORS headers even for critical errors
        // Use createErrorResponse from defaultDeps for consistency
        const errorResponse = defaultDeps.createErrorResponse(
            e instanceof Error ? e.message : "Internal Server Error", 
            500, 
            req 
        );
        return errorResponse;
    }
});