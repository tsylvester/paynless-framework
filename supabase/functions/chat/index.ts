// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
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
    ChatMessageRow
 } from '../_shared/types.ts'; 
import type { Database, Json } from "../types_db.ts"; 
import { verifyApiKey } from '../_shared/auth.ts'; // Assuming verifyApiKey is not used in this specific flow but kept for DI consistency
import { logger } from '../_shared/logger.ts';

// Redefine ChatHandlerDeps if it's different from _shared/types.ts or ensure they are aligned.
// For now, using ActualChatHandlerDeps from _shared/types.ts implies it has all necessary fields like logger.
// If ChatHandlerDeps in this file was different, it should be merged or aliased.

// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient, 
  fetch: fetch,
  handleCorsPreflightRequest,
  createSuccessResponse,
  createErrorResponse,
  getAiProviderAdapter,
  verifyApiKey, // Included for completeness of the interface
  logger, // Use the imported logger
};

// --- Main Handler (Simplified: delegates most work to handlePostRequest) ---
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

  // --- Auth and Client Initialization ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
     logger.info("Chat function called without Authorization header. Returning AUTH_REQUIRED signal.")
     if (req.method !== 'POST') { // Defensive check, though mainHandler now mostly handles POST
        return createErrorResponse('Authentication required', 401, req);
     }
     return createSuccessResponse(
         { error: "Authentication required", code: "AUTH_REQUIRED" },
         401,
         req
     );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
      logger.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
      return createErrorResponse("Server configuration error.", 500, req);
  }

  // Create a Supabase client for this request, respecting the user's auth header
  const supabaseClient = createSupabaseClientDep(
    supabaseUrl,
    supabaseAnonKey,
    { global: { headers: { Authorization: authHeader } } }
  );

  // --- User Authentication ---
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    logger.error('Auth error:', { error: userError || 'User not found' });
    return createErrorResponse('Invalid authentication credentials', 401, req);
  }
  const userId = user.id;
  logger.info('Authenticated user:', { userId });


  if (req.method === 'POST') {
    try {
        const requestBody: ChatApiRequest = await req.json(); // Assuming AdapterChatRequest from _shared/types is the correct one
        logger.info('Received chat POST request:', { body: requestBody });

        const result = await handlePostRequest(requestBody, supabaseClient, userId, deps);
        
        // Check if the result is an error object (has an 'error' property)
        if (result && typeof result === 'object' && 'error' in result) {
            // Construct the standard API error response shape
            const errorResponsePayload = { data: null, error: result.error };
            return createErrorResponse(errorResponsePayload.error.message, errorResponsePayload.error.status || 500, req);
        }

        // If it's not an error, then 'result' is the data payload (ChatMessageRow or ChatMessageRow[])
        // Construct the standard API success response shape
        return createSuccessResponse(result, 200, req);

    } catch (err) {
        logger.error('Unhandled error in POST mainHandler:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
        return createErrorResponse(errorMessage, 500, req);
    }
  } else if (req.method === 'DELETE') {
    // --- DELETE Request Logic (from existing refactored code) --- 
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
        // Use createJsonResponse to ensure CORS headers are applied
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

// --- handlePostRequest ---
async function handlePostRequest(
    requestBody: ChatApiRequest, 
    supabaseClient: SupabaseClient<Database>,
    userId: string, 
    deps: ChatHandlerDeps
): Promise<ChatHandlerSuccessResponse | { error: { message: string, status?: number } }> {
    const { logger, getAiProviderAdapter } = deps;
    
    logger.info('Entering handlePostRequest with body:', { requestBody });

    // --- 1. Input Validation ---
    const { 
        message: userMessageContent, 
        providerId: requestProviderId,
        promptId: requestPromptId,
        chatId: existingChatId, 
        rewindFromMessageId 
    } = requestBody;

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
      logger.warn('handlePostRequest: Invalid "chatId".');
      return { error: { message: 'Invalid "chatId" in request body', status: 400 } };
    }
    // Validate rewindFromMessageId format if needed (e.g., UUID check)
    if (rewindFromMessageId && typeof rewindFromMessageId !== 'string') {
       logger.warn('handlePostRequest: Invalid "rewindFromMessageId".');
       return { error: { message: 'Invalid "rewindFromMessageId" in request body', status: 400 } };
    }
    
    const systemPromptDbId = requestPromptId === '__none__' ? null : requestPromptId;
    let currentChatId = existingChatId; // This might be updated if a new chat is created

    try {
        // --- 2. Fetch Common Prerequisites (Provider and Prompt) ---
        // These are needed whether we rewind or not
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
        const apiIdentifier = providerData.api_identifier; // Needed for adapter/RPC
        const providerString = providerData.provider;       // Needed for adapter/dummy check
        if (!providerString) {
            logger.error(`Provider string missing for ai_providers record ID: ${requestProviderId}`);
            return { error: { message: 'AI provider configuration error on server [missing provider string].', status: 500 }};
        }
        logger.info(`Fetched provider details: provider=${providerString}, api_identifier=${apiIdentifier}`);


        // --- 3. Branch Logic: Rewind vs. Normal ---
        if (rewindFromMessageId) {
            // --- 3a. Rewind Path ---
            logger.info(`Rewind request detected. Rewinding from message ID: ${rewindFromMessageId}`);
            
            if (!currentChatId) {
                logger.warn('handlePostRequest: Rewind requested but no "chatId" provided.');
                return { error: { message: 'Cannot perform rewind without a "chatId"', status: 400 } };
            }

            // Fetch rewind point timestamp
            const { data: rewindPointData, error: rewindPointError } = await supabaseClient
                .from('chat_messages')
                .select('created_at')
                .eq('id', rewindFromMessageId)
                .eq('chat_id', currentChatId) // Ensure rewind ID is in the correct chat
                .single();

            if (rewindPointError || !rewindPointData) {
                logger.error(`Rewind error: Failed to find rewind point message ${rewindFromMessageId} in chat ${currentChatId}`, { error: rewindPointError });
                 return { error: { message: rewindPointError?.message || 'Failed to retrieve rewind point details.', status: 404 }}; // Use 404
            }
            const rewindPointTimestamp = rewindPointData.created_at;
            logger.info(`Found rewind point timestamp: ${rewindPointTimestamp}`);

            // Fetch history for AI context (messages strictly *before or at* the rewind point)
            const { data: historyData, error: historyError } = await supabaseClient
                .from('chat_messages')
                .select('*')
                .eq('chat_id', currentChatId)
                .eq('is_active_in_thread', true)
                .lte('created_at', rewindPointTimestamp) // Use LTE to include the rewind point message itself if needed by context
                .order('created_at', { ascending: true });

            if (historyError) {
                logger.error('Rewind error: Failed to fetch chat history for AI context.', { error: historyError });
                return { error: { message: historyError.message, status: 500 }};
            }
            const chatHistoryForAI: ChatMessageRow[] = historyData || [];
            logger.info(`Fetched ${chatHistoryForAI.length} messages for AI context (up to rewind point).`);
            
            // Prepare messages for the AI adapter
            const messagesForAdapter = [];
            if (systemPromptText) {
                messagesForAdapter.push({ role: 'system', content: systemPromptText });
            }
            messagesForAdapter.push(...chatHistoryForAI.map(msg => ({ role: msg.role, content: msg.content })));
            
            // Call the AI Service Adapter
        const adapter = getAiProviderAdapter(providerString);
        if (!adapter) {
                logger.error(`Rewind error: No adapter found for provider: ${providerString}`);
                return { error: { message: `Unsupported AI provider: ${providerString}`, status: 400 }};
        }

            // Fetch API Key (similar to original logic)
        let apiKeyEnvVarName: string;
        switch (providerString.toLowerCase()) {
            case 'openai': apiKeyEnvVarName = 'OPENAI_API_KEY'; break;
            case 'anthropic': apiKeyEnvVarName = 'ANTHROPIC_API_KEY'; break;
            case 'google': apiKeyEnvVarName = 'GOOGLE_API_KEY'; break;
            case 'dummy': apiKeyEnvVarName = 'DUMMY_API_KEY'; break; // Dummy might not need one, but align for now
            default:
                    logger.error(`Unknown provider string for API key lookup: ${providerString}`);
                    return { error: { message: `Internal server error: Unknown AI provider configuration for ${providerString}.`, status: 500 }};
        }
        const apiKey = Deno.env.get(apiKeyEnvVarName);
            if (!apiKey && providerString !== 'dummy') { // Dummy can operate without a key
                logger.error(`API key not found in env var: ${apiKeyEnvVarName} for provider ${providerString}`);
                return { error: { message: 'AI provider configuration error on server [key missing].', status: 500 }};
            }
            logger.info(`Retrieved API key from env var: ${apiKeyEnvVarName} (or skipped for dummy)`);

            logger.info(`Calling AI adapter (${providerString}) for rewind...`);
            let adapterResponsePayload: AdapterResponsePayload;
            try {
                // Construct the ChatApiRequest part for the adapter
                const adapterChatRequest: ChatApiRequest = {
                    message: userMessageContent, // The new user message
                    messages: chatHistoryForAI.map(msg => ({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content })), // History for context
                    providerId: requestProviderId, 
                    promptId: requestPromptId, // This is the DB ID or '__none__'
                    chatId: currentChatId,
                    // System prompt text is implicitly part of `messages` if included by adapter
                    // or passed if adapter handles it separately. Current factory.ts dummyAdapter uses messages.
                };
                if (systemPromptText) {
                    // Prepend system prompt to messages if adapter expects it this way
                    adapterChatRequest.messages = [{role: 'system', content: systemPromptText}, ...adapterChatRequest.messages!];
                }

                adapterResponsePayload = await adapter.sendMessage(
                    adapterChatRequest, 
                    apiIdentifier, // This is the modelIdentifier
                    apiKey || 'dummy-key' // Pass the fetched API key, or a placeholder for dummy
                );
                 logger.info('AI adapter returned successfully for rewind.');
            } catch (adapterError) {
                logger.error(`Rewind error: AI adapter (${providerString}) failed.`, { error: adapterError });
                 const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                 return { error: { message: errorMessage, status: 502 }}; // 502 Bad Gateway often appropriate for upstream failures
            }

            // Prepare parameters for the RPC call using the defined type
            const rpcParams: PerformChatRewindArgs = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: rewindFromMessageId,
                p_user_id: userId,
                p_new_user_message_content: userMessageContent,
                p_new_user_message_ai_provider_id: requestProviderId,
                p_new_user_message_system_prompt_id: systemPromptDbId ?? '', // Pass '' if null to satisfy type
                p_new_assistant_message_content: adapterResponsePayload.content,
                p_new_assistant_message_token_usage: adapterResponsePayload.token_usage || null,
                p_new_assistant_message_ai_provider_id: requestProviderId,
                p_new_assistant_message_system_prompt_id: systemPromptDbId ?? '', // Pass '' if null to satisfy type
            };
            logger.info('Calling perform_chat_rewind RPC with params:', { rpcParams });

            // Call the RPC function
            // Assuming perform_chat_rewind is updated to return two rows: new user message, then new assistant message
            const { data: rpcResultArray, error: rpcError } = await supabaseClient
                .rpc('perform_chat_rewind', rpcParams);

            if (rpcError) {
                logger.error('Rewind error: perform_chat_rewind RPC failed.', { error: rpcError });
                return { error: { message: rpcError.message, status: 500 }};
            }
            // Type cast rpcResultArray to ChatMessageRow[] if Supabase client types it as unknown or any for RPCs
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
            
            logger.info('perform_chat_rewind RPC successful. Returning new user and assistant messages.');
            return { 
                userMessage: newUserMessageFromRpc, 
                assistantMessage: newAssistantMessageFromRpc, 
                isRewind: true 
            };

        } else {
            // --- 3b. Normal Path (No Rewind) ---
            logger.info('Normal request processing (no rewind).');
            
            // Create new chat if chatId is missing
            if (!currentChatId) {
                logger.info('No existingChatId provided, creating new chat session.');
                const { data: newChatData, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({ 
                        user_id: userId, 
                        organization_id: requestBody.organizationId || null,
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

            // Check for dummy provider *within* the normal path
            if (providerString === 'dummy') {
                // --- Dummy Provider Logic (within normal path) ---
                logger.info(`DUMMY PROVIDER DETECTED (Normal Path): providerString="${providerString}". Proceeding with echo logic.`);

                // 1. Store User's Message
                const userMessageInsert: ChatMessageInsert = {
                    chat_id: currentChatId,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, // Link user message to provider choice
                    system_prompt_id: systemPromptDbId, // Link user message to prompt choice
                };
                const { error: userInsertError } = await supabaseClient.from('chat_messages').insert(userMessageInsert);
                if (userInsertError) {
                    logger.error('Dummy provider error: Failed to insert user message.', { error: userInsertError });
                    return { error: { message: userInsertError.message, status: 500 }};
                }
                logger.info('Dummy provider: Inserted user message.');

                // 2. Prepare and Insert Dummy Assistant Response
                const dummyAssistantContent = `Echo from Dummy: ${userMessageContent}`;
                const dummyAssistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(), // Generate an ID for the dummy response
                    chat_id: currentChatId,
                    role: 'assistant',
                    content: dummyAssistantContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId,
                    system_prompt_id: systemPromptDbId,
                    token_usage: { prompt_tokens: 0, completion_tokens: 0 } as Json,
                    // user_id should be null for assistant messages
                };
                const { data: dummyAssistantInsertResult, error: assistantInsertError } = await supabaseClient
                    .from('chat_messages')
                    .insert(dummyAssistantMessageInsert)
                    .select()
                    .single();

                if (assistantInsertError || !dummyAssistantInsertResult) {
                    logger.error('Dummy provider error: Failed to insert assistant message.', { error: assistantInsertError });
                     return { error: { message: assistantInsertError?.message || 'Failed to insert dummy assistant message.', status: 500 }};
                }
                logger.info('Dummy provider: Inserted dummy assistant message.');
                
                // For dummy, we don't have a separate user message from an AI interaction to return here.
                // The user message was already inserted. If client needs it, it should fetch or use optimistic.
                // To match ChatHandlerSuccessResponse, we only return assistantMessage.
                return { assistantMessage: dummyAssistantInsertResult as ChatMessageRow, isDummy: true };

            } else {
                 // --- Real Provider Logic (within normal path) ---
                 logger.info(`Processing with real provider: ${providerString}`);

                 // Fetch full active history for context
                 const { data: historyData, error: historyError } = await supabaseClient
                    .from('chat_messages')
                    .select('*')
                    .eq('chat_id', currentChatId)
                    .eq('is_active_in_thread', true)
                    .order('created_at', { ascending: true });

                 if (historyError) {
                    logger.error('Normal path error: Failed to fetch chat history.', { error: historyError });
                    return { error: { message: historyError.message, status: 500 }};
                 }
                 const chatHistoryForAI: ChatMessageRow[] = historyData || [];
                 logger.info(`Fetched ${chatHistoryForAI.length} messages for AI context (normal path).`);

                // Prepare messages for the AI adapter
                const messagesForAdapter = [];
                if (systemPromptText) {
                    messagesForAdapter.push({ role: 'system', content: systemPromptText });
                }
                messagesForAdapter.push(...chatHistoryForAI.map(msg => ({ role: msg.role, content: msg.content })));

                 // Call the AI Service Adapter
                 const adapter = getAiProviderAdapter(providerString);
                 if (!adapter) {
                    logger.error(`Normal path error: No adapter found for provider: ${providerString}`);
                    return { error: { message: `Unsupported AI provider: ${providerString}`, status: 400 }};
                 }

                // Fetch API Key (similar to original logic)
                let apiKeyEnvVarNameNormal: string;
                switch (providerString.toLowerCase()) {
                    case 'openai': apiKeyEnvVarNameNormal = 'OPENAI_API_KEY'; break;
                    case 'anthropic': apiKeyEnvVarNameNormal = 'ANTHROPIC_API_KEY'; break;
                    case 'google': apiKeyEnvVarNameNormal = 'GOOGLE_API_KEY'; break;
                    case 'dummy': apiKeyEnvVarNameNormal = 'DUMMY_API_KEY'; break; 
                    default:
                        logger.error(`Unknown provider string for API key lookup: ${providerString}`);
                        return { error: { message: `Internal server error: Unknown AI provider configuration for ${providerString}.`, status: 500 }};
                }
                const apiKeyNormal = Deno.env.get(apiKeyEnvVarNameNormal);
                if (!apiKeyNormal && providerString !== 'dummy') { 
                    logger.error(`API key not found in env var: ${apiKeyEnvVarNameNormal} for provider ${providerString}`);
                    return { error: { message: 'AI provider configuration error on server [key missing].', status: 500 }};
                }
                logger.info(`Retrieved API key from env var: ${apiKeyEnvVarNameNormal} (or skipped for dummy)`);

                 logger.info(`Calling AI adapter (${providerString}) for normal response...`);
                 let adapterResponsePayload: AdapterResponsePayload;
                 try {
                    // Construct the ChatApiRequest part for the adapter
                    const adapterChatRequestNormal: ChatApiRequest = {
                        message: userMessageContent,
                        messages: chatHistoryForAI.map(msg => ({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content })), 
                        providerId: requestProviderId,
                        promptId: requestPromptId,
                        chatId: currentChatId,
                    };
                    if (systemPromptText) {
                        adapterChatRequestNormal.messages = [{role: 'system', content: systemPromptText}, ...adapterChatRequestNormal.messages!];
                    }

                    adapterResponsePayload = await adapter.sendMessage(
                        adapterChatRequestNormal,
                        apiIdentifier, // modelIdentifier
                        apiKeyNormal || 'dummy-key' // API key
                    );
                    logger.info('AI adapter returned successfully (normal path).');
                 } catch (adapterError) {
                    logger.error(`Normal path error: AI adapter (${providerString}) failed.`, { error: adapterError });
                    const errorMessage = adapterError instanceof Error ? adapterError.message : 'AI service request failed.';
                    return { error: { message: errorMessage, status: 502 }};
                 }

                // Insert User Message
                const userMessageInsert: ChatMessageInsert = {
                    chat_id: currentChatId,
                    user_id: userId,
                    role: 'user',
                    content: userMessageContent,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, // Link user message to provider choice
                    system_prompt_id: systemPromptDbId, // Link user message to prompt choice
                };
                const { data: savedUserMessage, error: userInsertError } = await supabaseClient
                    .from('chat_messages')
                    .insert(userMessageInsert)
                    .select()
                    .single();

                 if (userInsertError || !savedUserMessage) {
                     logger.error('Normal path error: Failed to insert user message.', { error: userInsertError });
                     return { error: { message: userInsertError.message || 'Failed to save user message', status: 500 }};
                 }
                logger.info('Normal path: Inserted user message.', { id: savedUserMessage.id });


                // Insert Assistant Message
                const assistantMessageInsert: ChatMessageInsert = {
                    id: generateUUID(), // Generate a new ID
                    chat_id: currentChatId,    
                    role: 'assistant',           
                    content: adapterResponsePayload.content,
                    is_active_in_thread: true,
                    ai_provider_id: requestProviderId, // From the initial request
                    system_prompt_id: systemPromptDbId, // From the initial request
                    token_usage: adapterResponsePayload.token_usage || null,
                };
                const { data: assistantInsertResult, error: assistantInsertError } = await supabaseClient
                .from('chat_messages')
                    .insert(assistantMessageInsert)
                .select()
                .single();

                if (assistantInsertError || !assistantInsertResult) {
                    logger.error('Normal path error: Failed to insert assistant message.', { error: assistantInsertError });
                    return { error: { message: assistantInsertError?.message || 'Failed to insert assistant message.', status: 500 }};
                }
                logger.info('Normal path: Inserted assistant message.');
                return { 
                    userMessage: savedUserMessage as ChatMessageRow, 
                    assistantMessage: assistantInsertResult as ChatMessageRow 
                };
            }
        }

    } catch (err) {
        logger.error('Unhandled error in handlePostRequest:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred processing the chat request.';
        // Default to 500 if status isn't easily determined from the error
        return { error: { message: errorMessage, status: 500 }}; 
    }
}

// Helper function (consider moving to a shared utility if used elsewhere)
function generateUUID() {
    return crypto.randomUUID();
}


// Start the server
serve(async (req: Request) => {
    try {
        return await handler(req, defaultDeps);
    } catch (e) {
        console.error("Critical error in server:", e);
        // Ensure CORS headers even for critical errors
        const errorResponse = defaultDeps.createErrorResponse(
            e instanceof Error ? e.message : "Internal Server Error", 
            500, 
            req // Pass req to apply CORS headers
        );
        return errorResponse;
    }
});