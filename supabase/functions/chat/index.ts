// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Import shared response/error handlers instead of defaultCorsHeaders directly
import { 
    handleCorsPreflightRequest as actualHandleCorsPreflightRequest, 
    createErrorResponse as actualCreateErrorResponse, 
    createSuccessResponse as actualCreateJsonResponse,
} from '../_shared/cors-headers.ts'; 
// Import AI service factory and necessary types
import { getAiProviderAdapter as actualGetAiProviderAdapter } from '../_shared/ai_service/factory.ts';
// Use import type for type-only imports
import type { ChatApiRequest as AdapterChatRequest, ChatHandlerDeps as ActualChatHandlerDeps, AdapterResponsePayload } from '../_shared/types.ts'; 
import type { Database, Json } from "../types_db.ts"; 
import { verifyApiKey as actualVerifyApiKey } from '../_shared/auth.ts'; // Assuming verifyApiKey is not used in this specific flow but kept for DI consistency
import { logger as actualLogger } from '../_shared/logger.ts';

// Define derived DB types needed locally
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
// type ChatRow = Database['public']['Tables']['chats']['Row']; // Not directly used in handlePostRequest return

// Redefine ChatHandlerDeps if it's different from _shared/types.ts or ensure they are aligned.
// For now, using ActualChatHandlerDeps from _shared/types.ts implies it has all necessary fields like logger.
// If ChatHandlerDeps in this file was different, it should be merged or aliased.
export type ChatHandlerDeps = ActualChatHandlerDeps;


// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient, 
  fetch: fetch,
  handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
  getAiProviderAdapter: actualGetAiProviderAdapter,
  verifyApiKey: actualVerifyApiKey, // Included for completeness of the interface
  logger: actualLogger, // Use the imported logger
};

// --- Main Handler (Simplified: delegates most work to handlePostRequest) ---
export async function mainHandler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  const {
    createSupabaseClient: createSupabaseClientDep,
    handleCorsPreflightRequest,
    createJsonResponse, // To be used by handlePostRequest
    createErrorResponse, // To be used by handlePostRequest
    // getAiProviderAdapter, verifyApiKey, logger are passed to handlePostRequest via deps
  } = deps;

  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // --- Auth and Client Initialization ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
     deps.logger.info("Chat function called without Authorization header. Returning AUTH_REQUIRED signal.")
     if (req.method !== 'POST') { // Defensive check, though mainHandler now mostly handles POST
        return createErrorResponse('Authentication required', 401, req);
     }
     return createJsonResponse(
         { error: "Authentication required", code: "AUTH_REQUIRED" },
         401,
         req
     );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
      deps.logger.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
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
    deps.logger.error('Auth error:', { error: userError || 'User not found' });
    return createErrorResponse('Invalid authentication credentials', 401, req);
  }
  const userId = user.id;
  deps.logger.info('Authenticated user:', { userId });


  if (req.method === 'POST') {
    try {
        const requestBody: AdapterChatRequest = await req.json(); // Assuming AdapterChatRequest from _shared/types is the correct one
        deps.logger.info('Received chat POST request:', { body: requestBody });

        const result = await handlePostRequest(requestBody, supabaseClient, userId, deps);
        
        if (result.error) {
            return createErrorResponse(result.error.message, result.error.status || 500, req);
        }
        // The original code structure was createJsonResponse({ message: postData }, 200, req);
        // We adapt to return the assistant's message directly as the `data` part of the successful response.
        return createJsonResponse(result.data, 200, req); // Pass assistant message directly

    } catch (err) {
        deps.logger.error('Unhandled error in POST mainHandler:', { error: err instanceof Error ? err.stack : String(err) });
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
        deps.logger.info(`Received DELETE request for chat ID: ${chatId}`);

        const { error: rpcError } = await supabaseClient.rpc('delete_chat_and_messages', {
            p_chat_id: chatId,
            p_user_id: userId 
        });

        if (rpcError) {
            deps.logger.error(`Error calling delete_chat_and_messages RPC for chat ${chatId}:`, { error: rpcError });
            if (rpcError.code === 'PGRST01' || rpcError.message.includes('permission denied')) { 
                 return createErrorResponse('Permission denied to delete this chat.', 403, req); 
            }
            return createErrorResponse(rpcError.message || 'Failed to delete chat.', 500, req);
        }
        deps.logger.info(`Successfully deleted chat ${chatId} via RPC.`);
        return new Response(null, { status: 204 }); 

    } catch (err) {
        deps.logger.error('Unhandled error in DELETE handler:', { error: err instanceof Error ? err.stack : String(err) });
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
        return createErrorResponse(errorMessage, 500, req);
    }
  } else {
    return createErrorResponse('Method Not Allowed', 405, req);
  }
}

// --- handlePostRequest ---
async function handlePostRequest(
    requestBody: AdapterChatRequest, 
    supabaseClient: SupabaseClient<Database>,
    userId: string, 
    deps: ChatHandlerDeps
): Promise<{data: ChatMessageRow | null, error: {message: string, status?: number} | null}> {
    const { logger, getAiProviderAdapter, createErrorResponse: _createErrorResponse, createJsonResponse: _createJsonResponse } = deps;
    
    logger.info('Entering handlePostRequest with body:', { requestBody });

    const { 
        message: userMessageContent, 
        providerId: requestProviderId,
        promptId: requestPromptId,
        chatId: existingChatId, 
        rewindFromMessageId 
    } = requestBody;

    if (!userMessageContent || typeof userMessageContent !== 'string' || userMessageContent.trim() === '') {
      logger.warn('handlePostRequest: Missing or invalid "message".');
      return { data: null, error: { message: 'Missing or invalid "message" in request body', status: 400 } };
    }
    if (!requestProviderId || typeof requestProviderId !== 'string') {
       logger.warn('handlePostRequest: Missing or invalid "providerId".');
       return { data: null, error: { message: 'Missing or invalid "providerId" in request body', status: 400 } };
    }
    if (!requestPromptId || typeof requestPromptId !== 'string') {
      logger.warn('handlePostRequest: Missing or invalid "promptId".');
      return { data: null, error: { message: 'Missing or invalid "promptId" in request body', status: 400 } };
    }
    if (existingChatId && typeof existingChatId !== 'string') {
      logger.warn('handlePostRequest: Invalid "chatId".');
      return { data: null, error: { message: 'Invalid "chatId" in request body', status: 400 } };
    }
    
    const systemPromptDbId = requestPromptId === '__none__' ? null : requestPromptId;
    let currentChatId = existingChatId;

    try {
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
              return { data: null, error: { message: promptError?.message || 'System prompt not found or inactive.', status: 400 }};
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
            return { data: null, error: { message: providerError?.message || 'AI provider not found or inactive.', status: 400 }};
        }
        const apiIdentifier = providerData.api_identifier;
        const providerString = providerData.provider;
        if (!providerString) {
            logger.error(`Provider string missing for ai_providers record ID: ${requestProviderId}`);
            return { data: null, error: { message: 'AI provider configuration error on server [missing provider string].', status: 500 }};
        }
        logger.info(`Fetched provider details: provider=${providerString}, api_identifier=${apiIdentifier}`);

        // --- START DUMMY PROVIDER LOGIC ---
        if (providerString === 'dummy') {
            logger.info(`DUMMY PROVIDER DETECTED: providerString="${providerString}", apiIdentifier="${apiIdentifier}". Proceeding with echo logic.`);

            // 1. Ensure Chat Session Exists or Create New One
            if (!currentChatId) {
                logger.info('No existingChatId provided, creating new chat session for dummy provider.');
                const { data: newChatData, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({
                        user_id: userId,
                        organization_id: requestBody.organizationId || null, // Assuming organizationId might be in requestBody
                        system_prompt_id: systemPromptDbId,
                        title: userMessageContent.substring(0, 50) // Or generate title differently
                    })
                    .select('id')
                    .single();

                if (newChatError || !newChatData) {
                    logger.error('Error creating new chat session for dummy provider:', { error: newChatError });
                    return { data: null, error: { message: newChatError?.message || 'Failed to create new chat session.', status: 500 } };
                }
                currentChatId = newChatData.id;
                logger.info(`New chat session created for dummy provider with ID: ${currentChatId}`);
            } else {
                logger.info(`Using existing chat ID for dummy provider: ${currentChatId}`);
            }
            
            // 2. Store User's Message
            const userMessageToInsert: ChatMessageInsert = {
                chat_id: currentChatId,
                user_id: userId,
                role: 'user',
                content: userMessageContent,
                ai_provider_id: requestProviderId, // This is the dummy model's ID from ai_providers table
                system_prompt_id: systemPromptDbId,
                is_active_in_thread: true, // New messages are active
                // token_usage can be null or omitted for user messages if not tracked
            };
            logger.info('Attempting to insert user message for dummy provider:', { payload: userMessageToInsert });
            const { data: insertedUserMessage, error: userInsertError } = await supabaseClient
                .from('chat_messages')
                .insert(userMessageToInsert)
                .select()
                .single();

            if (userInsertError || !insertedUserMessage) {
                logger.error('Error inserting user message for dummy provider:', { error: userInsertError });
                return { data: null, error: { message: userInsertError?.message || 'Failed to store user message.', status: 500 } };
            }
            logger.info('User message successfully inserted for dummy provider:', { messageId: insertedUserMessage.id });

            // 3. Generate and Store Dummy Assistant's Message
            const assistantEchoContent = `Echo from Dummy: ${userMessageContent}`;
            const assistantMessageToInsert: ChatMessageInsert = {
                chat_id: currentChatId,
                user_id: null, // Assistant messages don't have a user_id in this context
                role: 'assistant',
                content: assistantEchoContent,
                ai_provider_id: requestProviderId, // Dummy model's ID
                system_prompt_id: systemPromptDbId,
                is_active_in_thread: true,
                token_usage: { // Mocked token usage
                    prompt_tokens: userMessageContent.length,
                    completion_tokens: assistantEchoContent.length,
                    total_tokens: userMessageContent.length + assistantEchoContent.length,
                } as unknown as Json, // Cast to Json type
            };
            logger.info('Attempting to insert dummy assistant message:', { payload: assistantMessageToInsert });
            const { data: insertedAssistantMessage, error: assistantInsertError } = await supabaseClient
                .from('chat_messages')
                .insert(assistantMessageToInsert)
                .select()
                .single();

            if (assistantInsertError || !insertedAssistantMessage) {
                logger.error('Error inserting dummy assistant message:', { error: assistantInsertError });
                // Potentially consider if we need to "rollback" or mark the user message as failed too,
                // but for a dummy provider, this might be overkill.
                return { data: null, error: { message: assistantInsertError?.message || 'Failed to store dummy assistant message.', status: 500 } };
            }
            logger.info('Dummy assistant message successfully inserted:', { messageId: insertedAssistantMessage.id });
            
            // 4. Update chat's updated_at timestamp
            const { error: chatUpdateError } = await supabaseClient
                .from('chats')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', currentChatId);

            if (chatUpdateError) {
                logger.warn(`Failed to update chat updated_at for dummy provider, chat ID ${currentChatId}:`, { error: chatUpdateError });
                // Non-critical, proceed with returning the message
            }


            // 5. Return Dummy Assistant's Message
            logger.info('Successfully processed dummy provider request. Returning assistant message.');
            return { data: insertedAssistantMessage as ChatMessageRow, error: null };
        }
        // --- END DUMMY PROVIDER LOGIC ---

        // --- Original/Real Provider Logic Continues Below ---
        const adapter = getAiProviderAdapter(providerString);
        if (!adapter) {
            logger.error(`No adapter found for provider: ${providerString}`);
            return { data: null, error: { message: `Unsupported AI provider: ${providerString}`, status: 400 }};
        }

        let apiKeyEnvVarName: string;
        switch (providerString.toLowerCase()) {
            case 'openai': apiKeyEnvVarName = 'OPENAI_API_KEY'; break;
            case 'anthropic': apiKeyEnvVarName = 'ANTHROPIC_API_KEY'; break;
            case 'google': apiKeyEnvVarName = 'GOOGLE_API_KEY'; break;
            default:
                logger.error(`Unknown provider string encountered for API key lookup: ${providerString}`);
                return { data: null, error: { message: `Internal server error: Unknown AI provider configuration for provider ${providerString}.`, status: 500 }};
        }
        const apiKey = Deno.env.get(apiKeyEnvVarName);
        if (!apiKey) {
            logger.error(`API key not found in environment variable: ${apiKeyEnvVarName} for provider ${providerString}`);
            return { data: null, error: { message: 'AI provider configuration error on server [key missing].', status: 500 }};
        }
        logger.info(`Retrieved API key from env var: ${apiKeyEnvVarName}`);

        // --- Fetch Chat History for AI Adapter (active messages up to the potential rewind point) ---
        // This history is for the AI's context. The RPC handles its own history logic for deactivation.
        let chatHistoryForAdapter: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
        if (currentChatId) {
            logger.info(`Fetching active history for AI context, chat ID: ${currentChatId}`);
            const query = supabaseClient
                .from('chat_messages')
                .select('role, content')
                .eq('chat_id', currentChatId)
                .eq('is_active_in_thread', true)
                .order('created_at', { ascending: true });

            // If rewinding, only fetch messages UP TO the rewind point for AI context
            if (rewindFromMessageId) {
                const { data: rewindPointMsg, error: rewindPointError } = await supabaseClient
                    .from('chat_messages')
                    .select('created_at')
                    .eq('id', rewindFromMessageId)
                    .single();
                if (rewindPointError || !rewindPointMsg) {
                    logger.error(`Error fetching rewind point message ${rewindFromMessageId} timestamp:`, { error: rewindPointError });
                    return { data: null, error: { message: "Failed to retrieve rewind point details.", status: 404 } };
                }
                query.lt('created_at', rewindPointMsg.created_at);
            }
            
            const { data: messages, error: historyError } = await query;

            if (historyError) {
                logger.error(`Error fetching chat history for chat ${currentChatId}:`, { error: historyError });
                return { data: null, error: { message: "Failed to retrieve chat history for AI context.", status: 500 } };
            }
            if (messages) {
                chatHistoryForAdapter = messages.map(msg => ({ 
                    role: msg.role as ('user' | 'assistant' | 'system'), 
                    content: msg.content 
                }));
                logger.info(`Fetched ${chatHistoryForAdapter.length} active messages for AI context.`);
            }
        } else {
            logger.info('No chatId provided or creating new chat, starting with empty history for AI adapter context.');
        }
        
        const messagesForAdapterCall = [
            ...(systemPromptText ? [{ role: 'system' as const, content: systemPromptText }] : []),
            ...chatHistoryForAdapter,
        ];
        
        const adapterPayload: AdapterChatRequest = {
            message: userMessageContent, // User's new message
            providerId: requestProviderId, 
            promptId: requestPromptId, 
            chatId: currentChatId, 
            messages: messagesForAdapterCall, // History + system prompt for context
            organizationId: requestBody.organizationId,
            rewindFromMessageId: rewindFromMessageId,
        };

        logger.info(`Calling ${providerString} adapter sendMessage with apiIdentifier: ${apiIdentifier}`);
        const assistantAdapterResponse: AdapterResponsePayload = await adapter.sendMessage(
            adapterPayload,
            apiIdentifier, 
            apiKey
        );
        logger.info('Received response from adapter.');

        // --- Decide path: Rewind with RPC or Standard Message Handling ---
        if (rewindFromMessageId && currentChatId) {
            logger.info(`Rewind requested. Calling perform_chat_rewind RPC for chat ${currentChatId} from message ${rewindFromMessageId}.`);
            
            const rpcParams = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: rewindFromMessageId,
                p_user_id: userId,
                p_new_user_message_content: userMessageContent,
                p_new_user_message_ai_provider_id: requestProviderId,
                p_new_user_message_system_prompt_id: systemPromptDbId,
                p_new_assistant_message_content: assistantAdapterResponse.content,
                p_new_assistant_message_token_usage: assistantAdapterResponse.token_usage || null,
                p_new_assistant_message_ai_provider_id: assistantAdapterResponse.ai_provider_id || requestProviderId,
                p_new_assistant_message_system_prompt_id: assistantAdapterResponse.system_prompt_id || systemPromptDbId,
            };

            const { data: rpcResultData, error: rpcError } = await supabaseClient
                .rpc('perform_chat_rewind', rpcParams as any)
                .select()
                .single<ChatMessageRow>(); 

            if (rpcError) {
                logger.error('Error calling perform_chat_rewind RPC:', { error: rpcError });
                const status = rpcError.message?.includes("not found in chat ID") ? 404 : 500;
                return { data: null, error: { message: rpcError.message || "Failed to process rewind via RPC.", status } };
            }
            
            if (!rpcResultData) {
                logger.error('perform_chat_rewind RPC returned no data (null).');
                return { data: null, error: { message: "Rewind operation via RPC did not return the expected new message data.", status: 500 } };
            }
            
            logger.info(`Successfully performed rewind via RPC. New assistant message ID: ${rpcResultData.id}`);
            return { data: rpcResultData, error: null };

        } else {
            // --- Standard Message Path (No Rewind) ---
            logger.info('Standard message path (not a rewind).');
            
            if (!currentChatId) {
                const firstUserMessageTitle = userMessageContent.substring(0, 75) + (userMessageContent.length > 75 ? '...' : '');
                const { data: newChat, error: newChatError } = await supabaseClient
                    .from('chats')
                    .insert({ 
                        user_id: userId, 
                        title: firstUserMessageTitle,
                        organization_id: requestBody.organizationId || null,
                        system_prompt_id: systemPromptDbId
                    })
                    .select('id') 
                    .single();
                if (newChatError || !newChat) {
                    logger.error('Error creating new chat:', { error: newChatError });
                    return { data: null, error: { message: 'Failed to create new chat session.', status: 500 }};
                }
                currentChatId = newChat.id;
                logger.info(`Created new chat with ID: ${currentChatId}`);
            } else {
                 const chatUpdatePayload: Partial<Database['public']['Tables']['chats']['Update']> = { updated_at: new Date().toISOString() };
                 // Only update system_prompt_id if it's different from what's already there for this existing chat
                 // This avoids unnecessary updates if the prompt hasn't changed.
                 const { data: existingChatData, error: existingChatFetchError } = await supabaseClient
                    .from('chats')
                    .select('system_prompt_id')
                    .eq('id', currentChatId)
                    .single();

                 if (existingChatFetchError) {
                    logger.warn(`Could not fetch existing chat ${currentChatId} to check system_prompt_id before update:`, {error: existingChatFetchError});
                    // Proceed without this check, or handle error more strictly
                 } else if (existingChatData && existingChatData.system_prompt_id !== systemPromptDbId) {
                    chatUpdatePayload.system_prompt_id = systemPromptDbId;
                 }

                 if (Object.keys(chatUpdatePayload).length > 1 || !chatUpdatePayload.updated_at) { // if more than just updated_at or if updated_at is somehow missing
                    const { error: chatUpdateError } = await supabaseClient
                        .from('chats')
                        .update(chatUpdatePayload)
                        .eq('id', currentChatId);
                    if (chatUpdateError) {
                        logger.warn(`Error updating chat ${currentChatId} details:`, { error: chatUpdateError});
                    } else {
                        logger.info(`Updated chat ${currentChatId} with new details (prompt/timestamp).`);
                    }
                 } else {
                     logger.info(`Chat ${currentChatId} updated_at will be touched by message insert trigger or RLS. No separate update needed for system_prompt_id.`);
                 }
            }
            
            if (!currentChatId) {
              logger.error("Critical: Chat ID is null before saving messages in standard path.");
              return { data: null, error: { message: "Internal server error: Chat session lost.", status: 500 }};
            }

            const userMessageToSave: ChatMessageInsert = {
              chat_id: currentChatId,
              user_id: userId,
              role: 'user',
              content: userMessageContent,
              ai_provider_id: requestProviderId,
              system_prompt_id: systemPromptDbId,
              is_active_in_thread: true,
            };
            
            const assistantMessageToSave: ChatMessageInsert = {
              chat_id: currentChatId,    
              user_id: null,
              role: 'assistant',           
              is_active_in_thread: true,
              content: assistantAdapterResponse.content,
              token_usage: assistantAdapterResponse.token_usage,
              ai_provider_id: assistantAdapterResponse.ai_provider_id || requestProviderId,
              system_prompt_id: assistantAdapterResponse.system_prompt_id || systemPromptDbId,
            };
            
            const { data: savedUserMsg, error: userSaveError } = await supabaseClient
                .from('chat_messages')
                .insert(userMessageToSave)
                .select()
                .single();

            if (userSaveError || !savedUserMsg) {
                logger.error('Error saving user message to DB:', { error: userSaveError });
                return { data: null, error: { message: 'Failed to save user message.', status: 500 }};
            }
            
            const { data: savedAssistantMsg, error: assistantSaveError } = await supabaseClient
                .from('chat_messages')
                .insert(assistantMessageToSave)
                .select()
                .single();

            if (assistantSaveError || !savedAssistantMsg) {
                logger.error('Error saving assistant message to DB:', { error: assistantSaveError });
                return { data: null, error: { message: 'Failed to save assistant response.', status: 500 }};
            }
            
            logger.info(`Saved user message ${savedUserMsg.id} and assistant message ${savedAssistantMsg.id} for chat ${currentChatId}.`);
            return { data: savedAssistantMsg as ChatMessageRow, error: null };
        }

    } catch (error) {
        logger.error('Error during AI interaction or saving in handlePostRequest:', { error: error instanceof Error ? error.stack : String(error) });
        const errorMessage = error instanceof Error ? error.message : 'An internal error occurred during chat processing.';
        return { data: null, error: { message: errorMessage, status: 500 }};
    }
}

// --- Serve Function ---
serve((req) => mainHandler(req, defaultDeps))
console.log(`Function "chat" up and running!`) 