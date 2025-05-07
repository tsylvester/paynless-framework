// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
// Import shared response/error handlers instead of defaultCorsHeaders directly
import { 
    handleCorsPreflightRequest, 
    createErrorResponse, 
    createSuccessResponse, // Assuming createSuccessResponse is the equivalent JSON response creator
} from '../_shared/cors-headers.ts'; 
// Import getEnv from Deno namespace directly when needed, avoid putting in deps if not necessary for mocking
// Import AI service factory and necessary types
import { getAiProviderAdapter as actualGetAiProviderAdapter } from '../_shared/ai_service/factory.ts';
// Use import type for type-only imports
import type { ChatApiRequest, ChatHandlerDeps } from '../_shared/types.ts'; // Keep App-level request type
import type { Database } from "../types_db.ts"; // Import Database type for DB objects
import { verifyApiKey as actualVerifyApiKey } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts';

// Define derived DB types needed locally
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient, // Use the direct import
  fetch: fetch,
  // Use the imported actual handlers
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createJsonResponse: createSuccessResponse,
  createErrorResponse: createErrorResponse,
  // Provide the real factory implementation
  getAiProviderAdapter: actualGetAiProviderAdapter,
  verifyApiKey: actualVerifyApiKey,
  logger: logger
};

// --- Main Handler Logic ---

export async function mainHandler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  // Use injected deps
  const {
    createSupabaseClient: createSupabaseClientDep,
    handleCorsPreflightRequest, // Use the destructured handler
    createJsonResponse,
    createErrorResponse,
    getAiProviderAdapter: getAiProviderAdapterDep, // Use the injected factory
  } = deps;

  // Handle CORS preflight requests using the injected handler
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405, req);
  }

  try {
    const requestBody: ChatApiRequest = await req.json();
    console.log('Received chat request:', requestBody);

    // --- Input Validation ---
    if (!requestBody.message || typeof requestBody.message !== 'string' || requestBody.message.trim() === '') {
      return createErrorResponse('Missing or invalid "message" in request body', 400, req);
    }
    if (!requestBody.providerId || typeof requestBody.providerId !== 'string') {
       return createErrorResponse('Missing or invalid "providerId" in request body', 400, req);
    }
    // Allow '__none__' for promptId
    if (!requestBody.promptId || typeof requestBody.promptId !== 'string') {
      return createErrorResponse('Missing or invalid "promptId" in request body', 400, req);
    }
    if (requestBody.chatId && typeof requestBody.chatId !== 'string') {
      return createErrorResponse('Invalid "chatId" in request body', 400, req);
    }

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       console.log("Chat function called without Authorization header. Returning AUTH_REQUIRED signal.")
       return createJsonResponse(
           { error: "Authentication required", code: "AUTH_REQUIRED" },
           401, // Set status to 401 Unauthorized
           req
       );
    }

    // Use Deno.env.get directly
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500, req);
    }

    const supabaseClient = createSupabaseClientDep(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // --- Verify user authentication ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return createErrorResponse('Invalid authentication credentials', 401, req);
    }
    const userId = user.id; // Store user ID for later use
    console.log('Authenticated user:', userId);

    // --- Fetch System Prompt and AI Provider details (including provider string) ---
    let systemPromptText: string | null = null; // Initialize as null
    if (requestBody.promptId !== '__none__') {
      const { data: promptData, error: promptError } = await supabaseClient
        .from('system_prompts')
        .select('prompt_text')
        .eq('id', requestBody.promptId)
        .eq('is_active', true)
        .single();
      if (promptError || !promptData) {
          console.error('Error fetching system prompt:', promptError);
          return createErrorResponse(promptError?.message || 'System prompt not found or inactive.', 400, req);
      }
      systemPromptText = promptData.prompt_text;
      console.log('Fetched system prompt text.');
    }

    // Fetch provider api_identifier AND provider string
    const { data: providerData, error: providerError } = await supabaseClient
      .from('ai_providers')
      .select('api_identifier, provider') // Fetch provider string
      .eq('id', requestBody.providerId) // Use the UUID from the request
      .eq('is_active', true)
      .single();

    if (providerError || !providerData) {
        console.error('Error fetching provider details:', providerError);
        return createErrorResponse(providerError?.message || 'AI provider not found or inactive.', 400, req);
    }
    const apiIdentifier = providerData.api_identifier;
    const provider = providerData.provider; // Get the provider string (e.g., 'openai')
    if (!provider) {
        console.error(`Provider string missing for ai_providers record ID: ${requestBody.providerId}`);
        return createErrorResponse('AI provider configuration error on server [missing provider string].', 500, req);
    }
    console.log(`Fetched provider details: provider=${provider}, api_identifier=${apiIdentifier}`);

    // --- Get Adapter from Factory ---
    const adapter = getAiProviderAdapterDep(provider);
    if (!adapter) {
        console.error(`No adapter found for provider: ${provider}`);
        return createErrorResponse(`Unsupported AI provider: ${provider}`, 400, req);
    }

    // --- Securely Get API Key based on Provider ---
    let apiKeyEnvVarName: string;
    switch (provider.toLowerCase()) { // Use the fetched provider string
        case 'openai': apiKeyEnvVarName = 'OPENAI_API_KEY'; break;
        case 'anthropic': apiKeyEnvVarName = 'ANTHROPIC_API_KEY'; break;
        case 'google': apiKeyEnvVarName = 'GOOGLE_API_KEY'; break;
        // Add other cases as needed
        default:
            console.error(`Unknown provider string encountered for API key lookup: ${provider}`);
            return createErrorResponse(`Internal server error: Unknown AI provider configuration for provider ${provider}.`, 500, req);
    }
    // Use Deno.env.get directly
    const apiKey = Deno.env.get(apiKeyEnvVarName);
    if (!apiKey) {
        console.error(`API key not found in environment variable: ${apiKeyEnvVarName} for provider ${provider}`);
        return createErrorResponse('AI provider configuration error on server [key missing].', 500, req);
    }
    console.log(`Retrieved API key from env var: ${apiKeyEnvVarName}`);

    // --- Rewind Logic / Fetch Chat History ---
    let chatHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    let currentChatId = requestBody.chatId; // Can be undefined for new chats

    // --- START REWIND BLOCK ---
    if (requestBody.rewindFromMessageId && currentChatId) {
        console.log(`Rewind operation initiated for chat ID: ${currentChatId}, from message ID: ${requestBody.rewindFromMessageId}`);
        try {
            // 1. Fetch the created_at of the message to rewind from (still needed to get history for AI)
            const { data: rewindPointMessage, error: rewindPointError } = await supabaseClient
                .from('chat_messages')
                .select('created_at')
                .eq('id', requestBody.rewindFromMessageId)
                .eq('chat_id', currentChatId)
                .single();

            if (rewindPointError) {
                console.error(`Error fetching rewind point message ${requestBody.rewindFromMessageId} in chat ${currentChatId}:`, rewindPointError);
                return createErrorResponse(rewindPointError.message || 'Failed to retrieve rewind point message details.', 500, req);
            }
            if (!rewindPointMessage) {
                console.log(`Rewind point message ${requestBody.rewindFromMessageId} not found in chat ${currentChatId}.`);
                // The original code returned 404 here, but the test expects 500 if .single() finds no data (PGRST116).
                // Let's keep the existing behavior from the test for now if it's PGRST116, or a more generic error if data is null.
                // The mock test for "Rewind Point Not Found" results in PGRST116 and a 500.
                return createErrorResponse('Rewind point message not found or access denied.', 500, req);
            }
            const rewindPointCreatedAt = rewindPointMessage.created_at;
            console.log(`Rewind point created_at: ${rewindPointCreatedAt}`);

            // 2. Fetch active history up to (and including) the rewind point message for AI context
            console.log(`[mainHandler Rewind RPC] About to fetch active history for chat ${currentChatId} up to ${rewindPointCreatedAt}`);
            const { data: activeHistory, error: historyError } = await supabaseClient
                .from('chat_messages')
                .select('role, content')
                .eq('chat_id', currentChatId)
                .eq('is_active_in_thread', true) 
                .lte('created_at', rewindPointCreatedAt)
                .order('created_at', { ascending: true });
            
            if (historyError) {
                console.error(`Error fetching active history for rewind in chat ${currentChatId}:`, historyError);
                return createErrorResponse(historyError.message || 'Failed to fetch history for rewind.', 500, req);
            }
            if (activeHistory) {
                 chatHistory = activeHistory.map(msg => ({ 
                    role: msg.role as ('user' | 'assistant' | 'system'), 
                    content: msg.content 
                }));
                console.log(`Fetched ${chatHistory.length} active messages for rewind context up to ${rewindPointCreatedAt}.`);
            }
            // currentChatId remains the same

            // 3. Call AI Adapter (moved before RPC so we have the AI response for the RPC)
            const messagesForAdapterBeforeRpc = [
                ...(systemPromptText ? [{ role: 'system' as const, content: systemPromptText }] : []),
                ...chatHistory,
            ];
            const adapterRequestForRpc: ChatApiRequest = {
                message: requestBody.message, // This is the new user message for after rewind
                providerId: requestBody.providerId,
                promptId: requestBody.promptId,
                chatId: currentChatId,
                messages: messagesForAdapterBeforeRpc,
            };
            console.log(`Calling ${provider} adapter sendMessage (for RPC rewind) with apiIdentifier: ${apiIdentifier}`);
            const aiResponsePayloadForRpc = await adapter.sendMessage(
                adapterRequestForRpc,
                apiIdentifier,
                apiKey
            );
            console.log('Received response from adapter (for RPC rewind).');

            // 4. Call the RPC function to perform the rewind transaction
            const rpcParams = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: requestBody.rewindFromMessageId,
                p_user_id: userId,
                p_new_user_message_content: requestBody.message, // The new user message
                p_new_user_message_ai_provider_id: requestBody.providerId,
                p_new_user_message_system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
                p_new_assistant_message_content: aiResponsePayloadForRpc.content,
                p_new_assistant_message_token_usage: 
                    (typeof aiResponsePayloadForRpc.token_usage === 'object' && 
                     aiResponsePayloadForRpc.token_usage !== null && 
                     'prompt_tokens' in aiResponsePayloadForRpc.token_usage && 
                     'completion_tokens' in aiResponsePayloadForRpc.token_usage) 
                    ? { 
                        prompt_tokens: (aiResponsePayloadForRpc.token_usage as { prompt_tokens: number }).prompt_tokens, 
                        completion_tokens: (aiResponsePayloadForRpc.token_usage as { completion_tokens: number }).completion_tokens 
                      } 
                    : null,
                p_new_assistant_message_ai_provider_id: requestBody.providerId, 
                p_new_assistant_message_system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null, 
            };
            console.log('Calling perform_chat_rewind RPC with params:', rpcParams);
            const { data: rpcData, error: rpcError } = await supabaseClient.rpc('perform_chat_rewind', rpcParams);

            if (rpcError) {
                console.error('Error calling perform_chat_rewind RPC:', rpcError);
                return createErrorResponse(rpcError.message || 'Failed to perform chat rewind operation.', 500, req);
            }

            // The RPC is expected to return the new assistant message as an array (since it returns TABLE)
            const finalAssistantMessageFromRpc = rpcData && Array.isArray(rpcData) && rpcData.length > 0 ? rpcData[0] : null;

            if (!finalAssistantMessageFromRpc) {
                console.error('perform_chat_rewind RPC did not return the expected assistant message.', { rpcData });
                return createErrorResponse('Failed to retrieve chat response after rewind.', 500, req);
            }
            console.log('Successfully performed rewind via RPC. Assistant message ID from RPC:', finalAssistantMessageFromRpc.id);
            
            // Return the assistant message obtained from the RPC call
            return createJsonResponse({ message: finalAssistantMessageFromRpc }, 200, req);

        } catch (rewindError) {
            console.error('Unexpected error during RPC rewind process:', rewindError);
            return createErrorResponse(rewindError instanceof Error ? rewindError.message : 'Rewind operation failed.', 500, req);
        }
    } else if (currentChatId) {
    // --- END REWIND BLOCK (RPC) ---
    // --- Existing Chat History Fetch (No Rewind) ---
        console.log(`Fetching history for chat ID: ${currentChatId}`);
        const { data: messages, error: historyError } = await supabaseClient
            .from('chat_messages')
            .select('role, content')
            // Ensure we only select messages from the specified chat
            // RLS policy should ensure the user owns this chat implicitly
            .eq('chat_id', currentChatId)
            .order('created_at', { ascending: true });

        if (historyError) {
            console.error(`Error fetching chat history for chat ${currentChatId}:`, historyError);
            // Don't fail the whole request, maybe the chat ID was invalid but it's a new chat intent?
            // Or maybe RLS prevented access? Treat as if no history exists.
            // Consider if a stricter error response is needed here.
            currentChatId = undefined; // Treat as a new chat if history fetch fails
        } else if (messages) {
            // Map DB messages to the simple format expected by adapters/API
            // Ensure role is correctly typed
            chatHistory = messages.map(msg => ({ 
                role: msg.role as ('user' | 'assistant' | 'system'), 
                content: msg.content 
            }));
            console.log(`Fetched ${chatHistory.length} messages for history.`);
        }
    } else {
        console.log('No chatId provided, starting new chat.');
    }

    // --- Construct Adapter Payload & Call Adapter ---
    try {
        // Prepare history, adding system prompt if present
        // If rewinding, chatHistory is already set. If not, it might be empty or from normal history fetch.
        const messagesForAdapter = [
            ...(systemPromptText ? [{ role: 'system' as const, content: systemPromptText }] : []),
            ...chatHistory, // This will be the rewind history if applicable, or normal history otherwise
        ];

        const adapterRequest: ChatApiRequest = {
            message: requestBody.message,
            providerId: requestBody.providerId, // Pass the DB record ID
            promptId: requestBody.promptId,
            chatId: currentChatId,
            messages: messagesForAdapter, // Pass the prepared history + system prompt
        };

        console.log(`Calling ${provider} adapter sendMessage with apiIdentifier: ${apiIdentifier}`);
        const aiResponsePayload = await adapter.sendMessage(
            adapterRequest,
            apiIdentifier, // Pass the specific model API identifier (e.g., openai-gpt-4o)
            apiKey
        );
        console.log('Received response from adapter.');

        // --- Save Messages to Database ---
        // 1. Ensure Chat Exists (Create if new, get existing ID)
        if (!currentChatId) {
            // Create a new chat entry
            const firstUserMessage = requestBody.message.substring(0, 50); // Simple title
            
            const newChatData: Database['public']['Tables']['chats']['Insert'] = {
                user_id: userId,
                title: `${firstUserMessage}...`
                // system_prompt_id IS MISSING HERE!
            };

            if (requestBody.organizationId) {
                newChatData.organization_id = requestBody.organizationId;
            }
            // --- ADD system_prompt_id TO CHAT RECORD --- 
            if (requestBody.promptId && requestBody.promptId !== '__none__') {
                newChatData.system_prompt_id = requestBody.promptId;
            }
            // --- END ADD ---

            const { data: newChat, error: newChatError } = await supabaseClient
                .from('chats')
                .insert(newChatData) // Use the constructed newChatData
                .select('id')
                .single();
            if (newChatError || !newChat) {
                console.error('Error creating new chat:', newChatError);
                return createErrorResponse(newChatError?.message || 'Failed to create new chat session.', 500, req);
            }
            currentChatId = newChat.id;
            console.log(`Created new chat with ID: ${currentChatId}${requestBody.organizationId ? ` in org ${requestBody.organizationId}` : ''}`);
            if (!currentChatId) { // Re-check after potential creation
                console.error("Chat ID is still missing after creation attempt.");
                return createErrorResponse("Failed to establish chat session for saving messages.", 500, req);
            }
        }

        const userMessageData: ChatMessageInsert = {
            chat_id: currentChatId, 
            user_id: userId,
            role: 'user',
            content: requestBody.message,
            ai_provider_id: requestBody.providerId,
            system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
            is_active_in_thread: true,
        };

        // Process token usage from the adapter's response
        const rawTokenUsage = aiResponsePayload.token_usage as { prompt_tokens?: number; completion_tokens?: number; [key: string]: unknown } | null;
        const processedTokenUsage = rawTokenUsage?.prompt_tokens !== undefined && rawTokenUsage?.completion_tokens !== undefined
          ? {
              prompt_tokens: rawTokenUsage.prompt_tokens,
              completion_tokens: rawTokenUsage.completion_tokens,
            }
          : null;

        const assistantMessageToSave: ChatMessageInsert = {
            chat_id: currentChatId, 
            user_id: null, 
            role: 'assistant',
            content: aiResponsePayload.content,
            is_active_in_thread: true,
            token_usage: processedTokenUsage, 
            ai_provider_id: requestBody.providerId, 
        };

        // Explicitly determine system_prompt_id for assistant message
        let assistantSystemPromptIdForSave: string | null = null;
        if (aiResponsePayload.system_prompt_id && typeof aiResponsePayload.system_prompt_id === 'string' && aiResponsePayload.system_prompt_id !== '__none__') {
            assistantSystemPromptIdForSave = aiResponsePayload.system_prompt_id;
        }
        assistantMessageToSave.system_prompt_id = assistantSystemPromptIdForSave;

        // Insert user message first
        const { error: userSaveError } = await supabaseClient
          .from('chat_messages')
          .insert(userMessageData);

        if (userSaveError) {
            console.error(`Error saving user message for chat ${currentChatId}:`, userSaveError);
            return createErrorResponse('Failed to save user message to database.', 500, req);
        }

        // Then insert assistant message and select it back
        const { data: savedAssistantMessageData, error: assistantSaveError } = await supabaseClient
          .from('chat_messages')
          .insert(assistantMessageToSave)
          .select()
          .single(); // Assuming we expect only one assistant message back and want it as an object

        if (assistantSaveError) {
            console.error(`Error saving assistant message for chat ${currentChatId}:`, assistantSaveError);
            return createErrorResponse('Failed to save assistant message to database.', 500, req);
        }
        
        const finalAssistantMessage: ChatMessageRow | null = savedAssistantMessageData; 

        if (!finalAssistantMessage) {
            console.error("Failed to retrieve saved assistant message from DB", { currentChatId, savedAssistantMessageData });
            return createErrorResponse("Failed to save or retrieve chat response.", 500, req);
        }

        // Return only the saved assistant message (as ChatMessageRow)
        // Ensure createJsonResponse handles the ChatMessageRow type correctly
        return createJsonResponse({ message: finalAssistantMessage }, 200, req);

    } catch (error) {
        // Catch errors from adapter.sendMessage or DB operations
        console.error('Error during AI interaction or saving:', error);
        // Check if error is an Error instance before accessing message
        const errorMessage = error instanceof Error ? error.message : 'An internal error occurred during chat processing.';
        return createErrorResponse(errorMessage, 500, req);
    }

  } catch (err) {
    // Catch errors from initial request parsing, auth, setup
    console.error('Unhandled error in chat handler:', err);
    // Check if err is an Error instance before accessing message
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return createErrorResponse(errorMessage, 500, req);
  }
}

// --- Serve Function ---
// Use the mainHandler with default dependencies when serving
serve((req) => mainHandler(req, defaultDeps))
// console.log(`Function "chat" up and running!`) // Moved log to top

console.log(`Function "chat" up and running!`) 