// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
// Use js-tiktoken for simpler Deno compatibility
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
    AiModelExtendedConfig,
 } from '../_shared/types.ts'; 
import type { Database, Json } from "../types_db.ts"; 
import { verifyApiKey } from '../_shared/auth.ts'; // Assuming verifyApiKey is not used in this specific flow but kept for DI consistency
import { logger as defaultLogger } from '../_shared/logger.ts'; // Renamed to avoid conflict with deps.logger
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';
import { calculateActualChatCost } from '../_shared/utils/cost_utils.ts';
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
  getAiProviderAdapter: (provider: string, apiKey: string, logger?: import('../_shared/types.ts').ILogger) => {
    const adapter = getAiProviderAdapter(provider, apiKey, logger);
    if (!adapter) {
        defaultLogger.error(`[defaultDeps] No adapter found by factory for provider: ${provider}`);
        throw new Error(`Adapter not found for provider: ${provider}`);
    }
    return adapter;
  },
  verifyApiKey: async (apiKey: string, providerName: string): Promise<boolean> => {
    defaultLogger.warn("[defaultDeps] Using STUB for verifyApiKey. Actual implementation may differ or needs update in auth.ts.", { apiKeyLen: apiKey.length, providerName });
    return apiKey.startsWith('sk-test-');
  },
  logger: defaultLogger,
  tokenWalletService: (supabaseUrlForDefault && serviceRoleKeyForDefault) 
    ? new TokenWalletService(createClient(supabaseUrlForDefault, serviceRoleKeyForDefault))
    : undefined,
  countTokensForMessages: countTokensForMessages,
};

// --- Zod Schema for ChatApiRequest ---
const ChatApiRequestSchema = z.object({
  message: z.string().min(1, { message: "message is required and cannot be empty." }),
  providerId: z.string().uuid({ message: "providerId is required and must be a valid UUID." }),
  promptId: z.union([
    z.string().uuid({ message: "promptId must be a valid UUID if provided and not '__none__'." }),
    z.literal("__none__")
  ], { errorMap: () => ({ message: "promptId is required and must be a valid UUID or '__none__'." }) }),
  chatId: z.string().uuid({ message: "If provided, chatId must be a valid UUID." }).optional(),
  selectedMessages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"], { errorMap: () => ({ message: "selectedMessages.role must be 'system', 'user', or 'assistant'."}) }),
    content: z.string()
  })).optional(),
  messages: z.array(z.object({ // This might be deprecated if selectedMessages is primary
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional(),
  organizationId: z.string().uuid({ message: "If provided, organizationId must be a valid UUID." }).optional(),
  rewindFromMessageId: z.string().uuid({ message: "If provided, rewindFromMessageId must be a valid UUID." }).optional(),
  max_tokens_to_generate: z.number().int({ message: "max_tokens_to_generate must be an integer." }).positive({ message: "max_tokens_to_generate must be positive." }).optional(),
});

// --- Main Handler ---
export async function handler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  const {
    createSupabaseClient: createSupabaseClientDep,
    handleCorsPreflightRequest,
    createSuccessResponse,
    createErrorResponse,
    logger,
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

  const supabaseClientToUse = deps.supabaseClient || supabaseClient;

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
          const errorMessages = parsedResult.error.errors.map(e => `${e.path.join('.') || 'body'}: ${e.message}`).join(', ');
          logger.warn('Chat API request validation failed:', { errors: errorMessages, requestBody: rawBody });
          return createErrorResponse(`Invalid request body: ${errorMessages}`, 400, req);
        }
        
        const requestBody = parsedResult.data;

        logger.info('Received chat POST request (validated):', { body: requestBody });
        const result = await handlePostRequest(requestBody, supabaseClient, userId, deps);
        
        // If handlePostRequest returns an assistantMessage with an error_type, set HTTP status to 502.
        // Otherwise, if it returns a general error object, use that status or default to 500.
        // If no error, status is 200.
        let responseStatus = 200;
        if (result && typeof result === 'object') {
            if ('assistantMessage' in result && result.assistantMessage && 'error_type' in result.assistantMessage && result.assistantMessage.error_type) {
                responseStatus = 502; // Bad Gateway for AI provider errors surfaced in assistant message
                logger.warn('AI Provider error indicated in assistantMessage, setting status to 502.', { errorType: result.assistantMessage.error_type });
            } else if ('error' in result && result.error) { // General error from handlePostRequest
                responseStatus = result.error.status || 500;
                logger.warn('General error returned from handlePostRequest, setting status.', { status: responseStatus, message: result.error.message });
                // For general errors, the body is { error: message }, so use createErrorResponse
                return createErrorResponse(result.error.message, responseStatus, req);
            }
        }
        // For successful operations OR for AI provider errors where we still send user/assistant messages
        return createSuccessResponse(result, responseStatus, req);
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
        tokenWalletService,
        countTokensForMessages: countTokensFn,
        getAiProviderAdapterOverride,
        getAiProviderAdapter: getAiProviderAdapterDep
    } = deps;
    
    const { 
        message: userMessageContent, 
        providerId: requestProviderId,
        promptId: requestPromptId,
        chatId: existingChatId, 
        rewindFromMessageId,
        selectedMessages,
        organizationId,
        max_tokens_to_generate
    } = requestBody;

    // systemPromptDbId will be a UUID string or null.
    const systemPromptDbId = requestPromptId === '__none__' ? null : requestPromptId;
    let currentChatId: string | null | undefined = existingChatId; 

    // --- START: Fetch actual system prompt text if ID is provided ---
    let actualSystemPromptText: string | null = null;
    // This will be the ID used for DB insert. It's null if requestPromptId was "__none__" OR if a UUID was given but not found OR if found but no text.
    let finalSystemPromptIdForDb: string | null = null;

    if (systemPromptDbId) { // if requestPromptId was a UUID string
        const clientToUseForSystemPrompt = deps.supabaseClient || supabaseClient;
        logger.info(`[SystemPromptFetch] Attempting to fetch system_prompt_text for id: ${systemPromptDbId} using ${deps.supabaseClient ? "deps.supabaseClient (mocked or overridden)" : "user supabaseClient"}`);
        const { data: promptData, error: promptError } = await clientToUseForSystemPrompt
            .from('system_prompts')
            .select('prompt_text')
            .eq('id', systemPromptDbId)
            .single();

        if (promptError || !promptData || !promptData.prompt_text) { // Consolidated check
            logger.warn('[SystemPromptFetch] Error fetching system_prompt_text, or prompt data/text is missing. finalSystemPromptIdForDb will be null.', { systemPromptDbId, error: promptError, promptData });
            finalSystemPromptIdForDb = null; // Ensure it's null if fetch fails or text is missing
            actualSystemPromptText = null;
        } else {
            actualSystemPromptText = promptData.prompt_text;
            finalSystemPromptIdForDb = systemPromptDbId; // Successfully fetched AND has text, so use the ID for DB.
            logger.info('[SystemPromptFetch] Successfully fetched system_prompt_text (first 50 chars):', { textStart: actualSystemPromptText?.substring(0, 50) });
        }
    } else { // if requestPromptId was "__none__", so systemPromptDbId is null
        logger.info(`[SystemPromptFetch] No systemPromptDbId to fetch (requestPromptId was: '${requestPromptId}'). actualSystemPromptText remains null, finalSystemPromptIdForDb is null.`);
        finalSystemPromptIdForDb = null; // Explicitly null
        actualSystemPromptText = null;
    }
    // --- END: Fetch actual system prompt text ---

    try {
        // --- 1. Fetch Provider Details & Configuration ---
        const { data: providerData, error: providerError } = await supabaseClient
            .from('ai_providers')
            .select('id, provider, api_identifier, config, is_active, name') // Select all needed fields
            .eq('id', requestProviderId)
            .single();

        if (providerError || !providerData) {
            logger.error('Failed to fetch provider details or provider not found:', { providerId: requestProviderId, error: providerError });
            return { error: { message: `Provider with ID ${requestProviderId} not found or error fetching details.`, status: 404 } };
        }

        if (!providerData.is_active) {
            logger.warn('Attempt to use inactive provider:', { providerId: requestProviderId, name: providerData.name });
            return { error: { message: `Provider '${providerData.name}' is currently inactive.`, status: 400 } };
        }
        
        const providerName = providerData.provider; // e.g., "openai", "anthropic"
        const providerApiIdentifier = providerData.api_identifier; // e.g., "gpt-3.5-turbo"
        const modelConfig = providerData.config as unknown as AiModelExtendedConfig; 
        logger.info('Fetched provider details:', { provider: providerName, api_identifier: providerApiIdentifier });
        
        if (!providerName || typeof providerName !== 'string' || providerName.trim() === '') {
            logger.error('Provider name (providerData.provider) is missing or invalid.', { providerId: requestProviderId, receivedProviderName: providerName });
            return { error: { message: `Configuration for provider ID '${requestProviderId}' has an invalid provider name.`, status: 500 } };
        }

        if (!modelConfig || typeof modelConfig !== 'object') {
            logger.error('Provider config is missing or invalid.', { providerId: requestProviderId, providerName });
            return { error: { message: `Configuration for provider '${providerData.name}' is missing or invalid.`, status: 500 } };
        }
        modelConfig.api_identifier = providerApiIdentifier; 
        logger.info('Parsed AiModelExtendedConfig from providerData.config', { modelIdentifier: modelConfig.api_identifier });

        let apiKey: string | undefined;
        if (providerName.toLowerCase() === 'dummy') {
            apiKey = 'dummy-key'; // Use a hardcoded key for the dummy provider
            logger.info('Using dummy provider, skipping API key environment variable check.');
        } else {
            const apiKeyEnvVarName = `${providerName.toUpperCase()}_API_KEY`;
            apiKey = Deno.env.get(apiKeyEnvVarName);
            if (!apiKey) {
                logger.error(`API key not found for provider: ${providerName} (expected env var ${apiKeyEnvVarName})`);
                return { error: { message: `API key for ${providerName} is not configured.`, status: 500 } };
            }
            logger.info(`Successfully retrieved API key for ${providerName} from env var ${apiKeyEnvVarName}`);
        }

        // --- 3. Instantiate AI Provider Adapter ---
        const adapterToUse = getAiProviderAdapterOverride 
            ? getAiProviderAdapterOverride
            : getAiProviderAdapterDep; 

        const aiProviderAdapter = adapterToUse(providerName, apiKey, logger);

        if (!aiProviderAdapter) {
            logger.error('Failed to instantiate AI provider adapter.', { providerName });
            return { error: { message: `Unsupported AI provider: ${providerName}`, status: 400 } };
        }

        let wallet: TokenWallet | null = null;
        try {
            wallet = await tokenWalletService!.getWalletForContext(userId, organizationId);
            if (!wallet) {
                logger.warn('No token wallet found for context.', { userId, organizationId });
                return { error: { message: 'Token wallet not found. Please set up or fund your wallet.', status: 402 } };
            }
            logger.info('Wallet retrieved for context.', { walletId: wallet.walletId, currentBalance: wallet.balance });
        } catch (error) {
            logger.error('Error during token wallet operations (initial check):', { error: error, userId, organizationId });
            return { error: { message: "Server error during wallet check.", status: 500 } };
        }

        // --- 4. Branch Logic: Rewind vs. Normal ---
        if (rewindFromMessageId) {
            // --- 4a. Rewind Path ---
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
            if (actualSystemPromptText) {
                messagesForAdapter.push({ role: 'system', content: actualSystemPromptText });
            }
            messagesForAdapter.push(
                ...chatHistoryForAI
                    .filter(msg => msg.role && ['user', 'assistant', 'system'].includes(msg.role) && typeof msg.content === 'string')
                    .map(msg => ({ 
                        role: msg.role as 'user' | 'assistant' | 'system', 
                        content: msg.content as string
                    }))
            );
            messagesForAdapter.push({ role: 'user', content: userMessageContent });
            
            // --- START: Token Check for Rewind Path (Non-Dummy) ---
            let apiKeyForAdapter: string; 

            if (providerName.toLowerCase() === 'dummy') {
                apiKeyForAdapter = 'dummy-key';
                logger.info('Rewind path: Using dummy provider, API key is hardcoded.');
            } else {
                // This block for non-dummy providers in rewind path already correctly fetches API key.
                // It was named 'apiKey' locally, let's rename for clarity if needed or ensure it's used.
                // The outer scope 'apiKey' is already fetched. We can reuse it if it's correctly scoped
                // or ensure the logic here correctly re-fetches or uses it.
                // The existing logic seems to declare a new apiKeyEnvVarName and apiKey inside this 'else'
                // This is fine, it's scoped to this block.
                // Let's ensure we use the apiKey fetched by the main logic if possible, for consistency.
                // Re-checking: the main apiKey IS in scope here.
                if (!apiKey) { // apiKey from outer scope
                     logger.error(`Critical: API key for ${providerName} was not resolved before rewind token check.`);
                     return { error: { message: 'Internal server error: API key missing for rewind operation.', status: 500 } };
                }
                apiKeyForAdapter = apiKey; 
                logger.info(`Rewind path: Using API key for ${providerName} for token check and adapter.`);
            }
            
            // The token check itself should only run for non-dummy providers
            if (providerName.toLowerCase() !== 'dummy') {
                try {
                    if (!modelConfig) { 
                        logger.error('Critical: modelConfig is null before token counting (rewind path).', { providerId: requestProviderId, apiIdentifier: providerApiIdentifier });
                        return { error: { message: 'Internal server error: Provider configuration missing for token calculation.', status: 500 } };
                    }
                    const tokensRequiredForRewind = countTokensFn(messagesForAdapter, modelConfig);
                    logger.info('Estimated tokens for rewind prompt.', { tokensRequiredForRewind, model: providerApiIdentifier });
                    
                    const hasSufficientBalance = await tokenWalletService!.checkBalance(wallet.walletId, tokensRequiredForRewind.toString());
                    if (!hasSufficientBalance) {
                        logger.warn('Insufficient token balance for rewind prompt.', { 
                            currentBalance: wallet.balance,
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
                    logger.error('Error estimating tokens or checking balance for rewind prompt:', { error: typedTokenError.message, model: providerApiIdentifier });
                    return { error: { message: `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`, status: 500 } };
                }
            }
            // --- END: Token Check for Rewind Path (Non-Dummy) ---

            logger.info(`Calling AI adapter (${providerName}) for rewind...`);
            let adapterResponsePayload: AdapterResponsePayload;
            try {
                const adapterChatRequest: ChatApiRequest = {
                    message: userMessageContent,
                    messages: messagesForAdapter,
                    providerId: requestProviderId, 
                    promptId: requestPromptId,
                    chatId: currentChatId,
                    max_tokens_to_generate: max_tokens_to_generate
                };
                adapterResponsePayload = await aiProviderAdapter.sendMessage(
                    adapterChatRequest, 
                    providerApiIdentifier, 
                    apiKeyForAdapter // Use the correctly scoped and determined API key
                );
                 logger.info('AI adapter returned successfully for rewind.');
            } catch (adapterError) {
                logger.error(`Rewind error: AI adapter (${providerName}) failed.`, { error: adapterError });
                 const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                 
                 const assistantErrorContent = `AI service request failed (rewind): ${errorMessage}`;
                 const assistantErrorMessageData: Partial<ChatMessageRow> = {
                     id: generateUUID(),
                     chat_id: currentChatId as string,
                     user_id: userId,
                     role: 'assistant',
                     content: assistantErrorContent,
                     ai_provider_id: requestProviderId,
                     system_prompt_id: systemPromptDbId,
                     token_usage: null,
                     error_type: 'ai_provider_error',
                     is_active_in_thread: true,
                     created_at: new Date().toISOString(),
                     updated_at: new Date().toISOString(),
                 };

                // User message in rewind path is the new user message for the rewind.
                // It is NOT saved by the perform_chat_rewind RPC if AI fails.
                // So we should save it here.
                const userMessageInsertOnErrorRewind: ChatMessageInsert = {
                    chat_id: currentChatId as string,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent, // This is the NEW user message
                    is_active_in_thread: true, 
                    ai_provider_id: requestProviderId,
                    system_prompt_id: systemPromptDbId,
                };
                const { data: savedUserMessageOnErrorRewind, error: userInsertErrorOnErrorRewind } = await supabaseClient
                    .from('chat_messages')
                    .insert(userMessageInsertOnErrorRewind)
                    .select()
                    .single();
                
                if (userInsertErrorOnErrorRewind || !savedUserMessageOnErrorRewind) {
                    logger.error('Failed to save user message after AI provider error (rewind).', { error: userInsertErrorOnErrorRewind });
                    return { error: { message: `AI service failed (rewind) and user message could not be saved: ${errorMessage}`, status: 500 }};
                }

                 const { data: savedAssistantErrorMessageRewind, error: assistantErrorInsertErrorRewind } = await supabaseClient
                    .from('chat_messages')
                    .insert(assistantErrorMessageData as ChatMessageInsert)
                    .select()
                    .single();

                if (assistantErrorInsertErrorRewind || !savedAssistantErrorMessageRewind) {
                    logger.error('Failed to save assistant error message after AI provider error (rewind).', { error: assistantErrorInsertErrorRewind });
                    return { error: { message: `AI service failed (rewind) and assistant error message could not be saved: ${errorMessage}`, status: 500 }};
                }
                
                // Mark prior messages in thread as inactive since this is a new turn after rewind point but AI failed
                // This is tricky because perform_chat_rewind would have handled this.
                // For now, let's rely on the fact that new messages are active.
                // The UI should primarily show active messages.

                 return {
                    userMessage: savedUserMessageOnErrorRewind as ChatMessageRow,
                    assistantMessage: savedAssistantErrorMessageRewind as ChatMessageRow,
                    chatId: currentChatId as string,
                    isRewind: true, // Indicate it was a rewind attempt
                    // _error_for_main_handler_status: { message: errorMessage, status: 502 } // REMOVED - Signal to main handler
                };
            }

            const rpcParams: PerformChatRewindArgs = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: rewindFromMessageId,
                p_user_id: userId,
                p_new_user_message_content: userMessageContent,
                p_new_user_message_ai_provider_id: requestProviderId,
                p_new_assistant_message_content: adapterResponsePayload.content,
                p_new_assistant_message_ai_provider_id: requestProviderId,
                // Optional parameters (defaults in SQL), pass undefined if null to match type generation
                p_new_user_message_system_prompt_id: systemPromptDbId === null ? undefined : systemPromptDbId,
                p_new_assistant_message_token_usage: adapterResponsePayload.token_usage === null ? undefined : adapterResponsePayload.token_usage,
                p_new_assistant_message_system_prompt_id: systemPromptDbId === null ? undefined : systemPromptDbId,
                p_new_assistant_message_error_type: undefined // For successful rewind, this is conceptually null/not set
            };
            logger.info('Calling perform_chat_rewind RPC with params:', { rpcParams });

            const { data: rpcResultArray, error: rpcError } = await supabaseClient
                .rpc('perform_chat_rewind', rpcParams);

            if (rpcError) {
                logger.error('Rewind error: perform_chat_rewind RPC failed.', { error: rpcError });
                return { error: { message: rpcError.message, status: 500 }};
            }
            
            // The RPC returns an array with a single object containing the two IDs
            const rpcResult = rpcResultArray as unknown as ({ new_user_message_id: string, new_assistant_message_id: string }[] | null);

            if (!rpcResult || rpcResult.length !== 1 || !rpcResult[0].new_user_message_id || !rpcResult[0].new_assistant_message_id) {
                 logger.error('Rewind error: perform_chat_rewind RPC returned unexpected data format or missing IDs.', { result: rpcResult });
                 return { error: { message: 'Chat rewind operation failed to return expected ID data.', status: 500 }};
            }
            
            const newInsertedUserMessageId = rpcResult[0].new_user_message_id;
            const newInsertedAssistantMessageId = rpcResult[0].new_assistant_message_id;

            // Now fetch the full messages using these IDs
            const { data: newUserMessageData, error: newUserError } = await supabaseClient
                .from('chat_messages')
                .select('*')
                .eq('id', newInsertedUserMessageId)
                .single();

            const { data: newAssistantMessageData, error: newAssistantError } = await supabaseClient
                .from('chat_messages')
                .select('*')
                .eq('id', newInsertedAssistantMessageId)
                .single();

            if (newUserError || !newUserMessageData) {
                logger.error('Rewind error: Failed to fetch new user message after RPC.', { id: newInsertedUserMessageId, error: newUserError });
                return { error: { message: 'Failed to retrieve new user message post-rewind.', status: 500 }};
            }
            if (newAssistantError || !newAssistantMessageData) {
                logger.error('Rewind error: Failed to fetch new assistant message after RPC.', { id: newInsertedAssistantMessageId, error: newAssistantError });
                return { error: { message: 'Failed to retrieve new assistant message post-rewind.', status: 500 }};
            }
            
            const newUserMessageFromRpc = newUserMessageData as ChatMessageRow;
            const newAssistantMessageFromRpc = newAssistantMessageData as ChatMessageRow;
            
            // --- START: Token Debit for Rewind Path (Non-Dummy) ---
            if (providerName !== 'dummy') {
                const tokenUsageFromAdapter = adapterResponsePayload.token_usage as TokenUsage | null;
                const actualTokensToDebit = calculateActualChatCost(tokenUsageFromAdapter, modelConfig, logger);

                if (actualTokensToDebit > 0) {
                    logger.info('Attempting to record token transaction (debit) for rewind.', { 
                        walletId: wallet.walletId, 
                        actualTokensToDebit, 
                        relatedEntityId: newAssistantMessageFromRpc.id 
                    });
                    try {
                        const transactionData = {
                            walletId: wallet.walletId,
                            type: 'DEBIT_USAGE' as TokenWalletTransactionType,
                            amount: actualTokensToDebit.toString(),
                            relatedEntityId: newAssistantMessageFromRpc.id,
                            relatedEntityType: 'chat_message' as const,
                            recordedByUserId: userId,
                            notes: `Chat completion (rewind) for chat ${currentChatId}`
                        };
                        const transaction = await tokenWalletService!.recordTransaction(transactionData);
                        logger.info('Token transaction recorded (debit) for rewind.', { transactionId: transaction.transactionId, walletId: wallet.walletId, amount: actualTokensToDebit });
                    } catch (debitError: unknown) {
                        const typedDebitError = debitError instanceof Error ? debitError : new Error(String(debitError));
                        logger.error('Failed to record token debit transaction for rewind:', { 
                            error: typedDebitError.message, 
                            walletId: wallet.walletId, 
                            actualTokensConsumed: actualTokensToDebit 
                        });
                    }
                } else {
                    logger.warn('Calculated debit amount for rewind is zero or less, skipping debit.', { tokenUsageFromAdapter, calculatedAmount: actualTokensToDebit });
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
            // --- 4b. Normal Path (No Rewind) ---
            logger.info('Normal request processing (no rewind).');
            
            if (!currentChatId) {
                logger.info('No existingChatId provided, creating new chat session.');
                const { data: newChatData, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({ 
                        user_id: userId, 
                        organization_id: organizationId || null,
                        system_prompt_id: finalSystemPromptIdForDb, // Use the validated/nulled ID
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
                actualSystemPromptText,
                rewindFromMessageId,
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
                        system_prompt_id: finalSystemPromptIdForDb, // Use the validated/nulled ID
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

            if (providerName === 'dummy') {
                logger.info(`DUMMY PROVIDER DETECTED (Normal Path): providerString="${providerName}". Proceeding with echo logic.`);
                
                // --- START: Tokenization Pre-check for Dummy ---
                try {
                    if (!modelConfig) {
                        logger.error('Critical: modelConfig is null before token pre-check (dummy provider path).', { providerId: requestProviderId, apiIdentifier: providerApiIdentifier });
                        return { error: { message: 'Internal server error: Provider configuration missing.', status: 500 } };
                    }
                    if (!modelConfig.tokenization_strategy || !modelConfig.tokenization_strategy.type) {
                        logger.error('Dummy Provider Path: Tokenization strategy is missing or type is undefined in provider config.', { providerId: requestProviderId, modelConfig });
                        return { error: { message: 'Provider configuration error: Tokenization strategy is missing or invalid.', status: 400 } };
                    }
                    // Attempt a minimal token count to trigger validation for strategy type
                    if (typeof countTokensFn === 'function') {
                        countTokensFn([{role: 'user', content: 'test'}], modelConfig); 
                    } else {
                        logger.error('Dummy Provider Path: countTokensFn is not a function.');
                        return { error: { message: 'Server configuration error: Token counting utility not available.', status: 500 } };
                    }
                } catch (e: unknown) {
                    const tokenizationError = e instanceof Error ? e : new Error(String(e));
                    logger.error('Dummy provider: Pre-check failed due to tokenization issue (will return error).', { 
                        error: tokenizationError.message,
                        modelUsed: providerApiIdentifier 
                    });
                    return { error: { message: `Tokenization error for provider '${providerData.name}': ${tokenizationError.message}`, status: 400 } };
                }
                // --- END: Tokenization Pre-check for Dummy ---

                const userMessageInsert: ChatMessageInsert = {
                    chat_id: currentChatId as string,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, 
                    system_prompt_id: finalSystemPromptIdForDb, // Use the correctly determined ID
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
                
                const dummyAssistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(), 
                    chat_id: currentChatId as string,
                    role: 'assistant',
                    content: dummyAssistantContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId,
                    system_prompt_id: finalSystemPromptIdForDb, // Use the correctly determined ID
                    token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, // Simplified for dummy
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
                    userMessage: savedUserMessageDummy as ChatMessageRow,
                    assistantMessage: dummyAssistantInsertResult as ChatMessageRow, 
                    chatId: currentChatId as string,
                    isDummy: true 
                };

            } else {
                 logger.info(`Processing with real provider: ${providerName}`);
                 // apiKeyNormal is fetched and used in this block, separate from rewind path's apiKey
                 if (!apiKey) {
                     logger.error(`Critical: API key for ${providerName} was not resolved before normal path adapter call.`);
                     return { error: { message: 'Internal server error: API key missing for chat operation.', status: 500 } };
                 }
                 const apiKeyForNormalAdapter = apiKey;

                 const adapter = aiProviderAdapter; // Uses apiKeyForNormalAdapter
                 if (!adapter) {
                    logger.error(`Normal path error: No adapter found for provider: ${providerName}`);
                    return { error: { message: `Unsupported AI provider: ${providerName}`, status: 400 }};
                 }

                 // --- START: Tokenization and Balance Check for Normal Path (Non-Dummy) ---
                 try {
                    if (!modelConfig) {
                        logger.error('Critical: modelConfig is null before token counting (normal path).', { providerId: requestProviderId, apiIdentifier: providerApiIdentifier });
                        return { error: { message: 'Internal server error: Provider configuration missing for token calculation.', status: 500 } };
                    }
                    if (!modelConfig.tokenization_strategy || !modelConfig.tokenization_strategy.type) {
                        logger.error('Normal Path: Tokenization strategy is missing or type is undefined in provider config.', { providerId: requestProviderId, modelConfig });
                        return { error: { message: 'Provider configuration error: Tokenization strategy is missing or invalid.', status: 400 } };
                    }
                    if (typeof countTokensFn !== 'function') {
                        logger.error('Normal Path: countTokensFn is not a function.', { providerId: requestProviderId });
                        return { error: { message: 'Server configuration error: Token counting utility is not available.', status: 500 } };
                    }

                    const tokensRequiredForNormal = countTokensFn(messagesForProvider, modelConfig);
                    logger.info('Estimated tokens for normal prompt.', { tokensRequiredForNormal, model: providerApiIdentifier });

                    const hasSufficientBalanceNormal = await tokenWalletService!.checkBalance(wallet.walletId, tokensRequiredForNormal.toString());
                    if (!hasSufficientBalanceNormal) {
                        logger.warn('Insufficient token balance for normal prompt.', { 
                            currentBalance: wallet.balance,
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
                    logger.error('Error during tokenization or pre-AI balance check for normal prompt:', { 
                        error: typedTokenError.message, 
                        model: providerApiIdentifier 
                    });
                    // If message indicates tokenization strategy, make it 400.
                    if (typedTokenError.message.toLowerCase().includes('tokenization strategy') || typedTokenError.message.toLowerCase().includes('tiktoken')) {
                        return { error: { message: `Tokenization error for provider '${providerData.name}': ${typedTokenError.message}`, status: 400 } };
                    }
                    return { error: { message: `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`, status: 500 } };
                 }
                 // --- END: Tokenization and Balance Check for Normal Path (Non-Dummy) ---

                 logger.info(`Calling AI adapter (${providerName}) for normal response...`);
                 let adapterResponsePayload: AdapterResponsePayload;
                 try {
                    const adapterChatRequestNormal: ChatApiRequest = {
                        message: userMessageContent, 
                        messages: messagesForProvider, 
                        providerId: requestProviderId,
                        promptId: requestPromptId, 
                        chatId: currentChatId,
                        organizationId: organizationId,
                        max_tokens_to_generate: max_tokens_to_generate
                    };
                    adapterResponsePayload = await adapter.sendMessage(
                        adapterChatRequestNormal,
                        providerApiIdentifier, 
                        apiKeyForNormalAdapter // Ensure this is the correct key
                    );
                    logger.info('AI adapter returned successfully (normal path).');

                    // --- START: Apply hard_cap_output_tokens if max_tokens_to_generate is not set ---
                    if (adapterResponsePayload.token_usage) { // Ensure token_usage is not null
                        const tokenUsage = adapterResponsePayload.token_usage as unknown as TokenUsage; // Cast to specific type via unknown

                        if (
                            providerName !== 'dummy' &&
                            (!requestBody.max_tokens_to_generate || requestBody.max_tokens_to_generate <= 0) &&
                            modelConfig.hard_cap_output_tokens && modelConfig.hard_cap_output_tokens > 0 &&
                            typeof tokenUsage.completion_tokens === 'number' && // Now this access is safe
                            tokenUsage.completion_tokens > modelConfig.hard_cap_output_tokens
                        ) {
                            logger.info('Applying hard_cap_output_tokens from model config.', {
                                original_completion_tokens: tokenUsage.completion_tokens,
                                hard_cap_output_tokens: modelConfig.hard_cap_output_tokens,
                                model_api_identifier: providerApiIdentifier
                            });
                            tokenUsage.completion_tokens = modelConfig.hard_cap_output_tokens;
                            
                            if (typeof tokenUsage.prompt_tokens === 'number') { // Safe access
                                tokenUsage.total_tokens = tokenUsage.prompt_tokens + tokenUsage.completion_tokens; // Safe access
                            } else {
                                tokenUsage.total_tokens = tokenUsage.completion_tokens; // Safe access
                                logger.warn('Prompt_tokens missing or invalid when recalculating total_tokens after capping. Total_tokens set to capped completion_tokens.', {
                                    model_api_identifier: providerApiIdentifier
                                });
                            }
                            // Update the original payload with the modified tokenUsage, casting back to Json via unknown
                            adapterResponsePayload.token_usage = tokenUsage as unknown as Json;
                        }
                    }
                    // --- END: Apply hard_cap_output_tokens ---

                 } catch (adapterError) {
                    logger.error(`Normal path error: AI adapter (${providerName}) failed.`, { error: adapterError });
                    const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                    
                    // Construct a ChatMessageRow-like object for the erroring assistant message
                    const assistantErrorContent = `AI service request failed: ${errorMessage}`;
                    const assistantErrorMessageData: Partial<ChatMessageRow> = { // Use Partial as not all fields will be populated like a real DB row initially
                        id: generateUUID(), // Generate a new UUID for this error message
                        chat_id: currentChatId as string,
                        user_id: userId,
                        role: 'assistant',
                        content: assistantErrorContent,
                        ai_provider_id: requestProviderId,
                        system_prompt_id: systemPromptDbId,
                        token_usage: null, // No token usage for a failed call
                        error_type: 'ai_provider_error', // Specific error type
                        is_active_in_thread: true, // Mark as active, it's the latest turn
                        created_at: new Date().toISOString(), // Set current timestamp
                        updated_at: new Date().toISOString(),
                    };

                    // Attempt to save user message first
                    const userMessageInsertOnError: ChatMessageInsert = {
                        chat_id: currentChatId as string,
                        user_id: userId,
                        role: 'user',
                        content: userMessageContent,
                        is_active_in_thread: true,
                        ai_provider_id: requestProviderId,
                        system_prompt_id: systemPromptDbId,
                    };
                    const { data: savedUserMessageOnError, error: userInsertErrorOnError } = await supabaseClient
                        .from('chat_messages')
                        .insert(userMessageInsertOnError)
                        .select()
                        .single();

                    if (userInsertErrorOnError || !savedUserMessageOnError) {
                        logger.error('Failed to save user message after AI provider error.', { error: userInsertErrorOnError });
                        // If user message save fails, return generic error, not the assistantMessage structure
                        return { error: { message: `AI service failed and user message could not be saved: ${errorMessage}`, status: 500 }};
                    }
                    
                    // Attempt to save the erroring assistant message
                    const { data: savedAssistantErrorMessage, error: assistantErrorInsertError } = await supabaseClient
                        .from('chat_messages')
                        .insert(assistantErrorMessageData as ChatMessageInsert) // Cast to ChatMessageInsert
                        .select()
                        .single();
                    
                    if (assistantErrorInsertError || !savedAssistantErrorMessage) {
                        logger.error('Failed to save assistant error message after AI provider error.', { error: assistantErrorInsertError });
                        // Return generic error, as we can't form the full ChatHandlerSuccessResponse
                        return { error: { message: `AI service failed and assistant error message could not be saved: ${errorMessage}`, status: 500 }};
                    }
                    
                    // Return a structure that includes the user and assistant (error) message
                    // The client will receive a 502 status, but the body will have these details.
                    // This allows the UI to display the error gracefully within the chat context.
                    return { 
                        userMessage: savedUserMessageOnError as ChatMessageRow,
                        assistantMessage: savedAssistantErrorMessage as ChatMessageRow,
                        chatId: currentChatId as string
                    };
                 }

                // --- START: Token Debit for Normal Path (Moved Before Message Saves) ---
                let transactionRecordedSuccessfully = false;
                const tokenUsageFromAdapterNormal = adapterResponsePayload.token_usage as TokenUsage | null;
                const actualTokensToDebitNormal = calculateActualChatCost(tokenUsageFromAdapterNormal, modelConfig, logger);

                if (actualTokensToDebitNormal > 0) {
                    logger.info('Attempting to record token transaction (debit) for normal path BEFORE saving messages.', { 
                        walletId: wallet.walletId, 
                        actualTokensToDebit: actualTokensToDebitNormal,
                    });
                    try {
                        const transactionData = {
                            walletId: wallet.walletId,
                            type: 'DEBIT_USAGE' as TokenWalletTransactionType,
                            amount: actualTokensToDebitNormal.toString(),
                            relatedEntityType: 'chat_message' as const,
                            recordedByUserId: userId,
                            notes: `Chat completion for chat ${currentChatId}`
                        };
                        const transaction = await tokenWalletService!.recordTransaction(transactionData);
                        logger.info('Token transaction recorded (debit) successfully.', { transactionId: transaction.transactionId, walletId: wallet.walletId, amount: actualTokensToDebitNormal });
                        transactionRecordedSuccessfully = true;
                    } catch (debitError: unknown) {
                        const typedDebitError = debitError instanceof Error ? debitError : new Error(String(debitError));
                        logger.error('CRITICAL: Failed to record token debit transaction for normal path AFTER successful AI response. Messages will NOT be saved.', { 
                            error: typedDebitError.message, 
                            walletId: wallet.walletId, 
                            actualTokensConsumed: actualTokensToDebitNormal,
                            aiResponseContent: adapterResponsePayload.content.substring(0, 100)
                        });
                        return { 
                            error: { 
                                message: 'AI response was generated, but a critical error occurred while finalizing your transaction. Your message has not been saved. Please try again. If the issue persists, contact support.', 
                                status: 500 
                            } 
                        };
                    }
                } else {
                    logger.warn('Calculated debit amount for normal path is zero or less, debit step will be skipped if not already.', { tokenUsageFromAdapterNormal, calculatedAmount: actualTokensToDebitNormal });
                    transactionRecordedSuccessfully = true; 
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
                    system_prompt_id: finalSystemPromptIdForDb, 
                };
                const { data: savedUserMessage, error: userInsertError } = await supabaseClient
                    .from('chat_messages')
                    .insert(userMessageInsert)
                    .select()
                    .single();
                 if (userInsertError || !savedUserMessage) {
                     logger.error('Normal path error: Failed to insert user message. This happened AFTER a successful token debit (if applicable).', { error: userInsertError, chatId: currentChatId });
                     return { error: { message: userInsertError.message || 'Failed to save user message after token debit.', status: 500 }};
                 }
                logger.info('Normal path: Inserted user message.', { id: savedUserMessage.id });

                const assistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(),
                    chat_id: currentChatId as string, 
                    role: 'assistant' as const,
                    content: adapterResponsePayload.content,
                    ai_provider_id: adapterResponsePayload.ai_provider_id,
                    system_prompt_id: finalSystemPromptIdForDb,
                    token_usage: adapterResponsePayload.token_usage,
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
                    logger.error('Normal path error: Failed to insert assistant message. This happened AFTER successful token debit and user message save.', { error: assistantInsertError, chatId: currentChatId });
                    return { error: { message: assistantInsertError?.message || 'Failed to insert assistant message after token debit.', status: 500 }};
                }
                logger.info('Normal path: Inserted assistant message.', { id: insertedAssistantMessage.id });
                
                // If debit was successful and relatedEntityId needs to be updated on the token transaction:
                // This is complex if the debit happens before knowing the assistant message ID.
                // One option: record debit without relatedEntityId, then update it. (Adds another DB call)
                // Or: record with chat_id as relatedEntityId, and type 'chat_session_debit'.
                // Current 'notes' field has chat_id. For now, let's assume this is sufficient.

                // We need to map the DB row to the public response structure
                const newAssistantMessageResponse: ChatMessageRow = {
                    id: insertedAssistantMessage.id,
                    chat_id: insertedAssistantMessage.chat_id,
                    role: 'assistant',
                    content: insertedAssistantMessage.content,
                    created_at: insertedAssistantMessage.created_at,
                    updated_at: insertedAssistantMessage.updated_at,
                    user_id: userId,
                    ai_provider_id: insertedAssistantMessage.ai_provider_id,
                    system_prompt_id: insertedAssistantMessage.system_prompt_id,
                    token_usage: insertedAssistantMessage.token_usage
                        ? {
                            prompt_tokens: (insertedAssistantMessage.token_usage as unknown as TokenUsage).prompt_tokens,
                            completion_tokens: (insertedAssistantMessage.token_usage as unknown as TokenUsage).completion_tokens,
                            ...( (insertedAssistantMessage.token_usage as unknown as TokenUsage).total_tokens !== undefined && { total_tokens: (insertedAssistantMessage.token_usage as unknown as TokenUsage).total_tokens } )
                          }
                        : null,
                    is_active_in_thread: insertedAssistantMessage.is_active_in_thread,
                    error_type: null,
                    response_to_message_id: insertedAssistantMessage.response_to_message_id
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
        const serverLogger = defaultDeps.logger || defaultLogger;
        serverLogger.error("Critical error in server request processing:", { 
            error: e instanceof Error ? e.stack : String(e),
            request_url: req.url,
            request_method: req.method,
        });
        
        const errorResponse = defaultDeps.createErrorResponse(
            e instanceof Error ? e.message : "Internal Server Error", 
            500, 
            req 
        );
        return errorResponse;
    }
});