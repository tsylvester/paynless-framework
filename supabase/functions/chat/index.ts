// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
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
import type { ChatApiRequest, ChatHandlerDeps, AdapterResponsePayload } from '../_shared/types.ts'; // Keep App-level request type
import type { Database } from "../types_db.ts"; // Import Database type for DB objects
import { verifyApiKey as actualVerifyApiKey } from '../_shared/auth.ts';
import { logger } from '../_shared/logger.ts';

// Define derived DB types needed locally
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatRow = Database['public']['Tables']['chats']['Row'];

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
    verifyApiKey: verifyApiKeyDep,
    logger: loggerDep // Assuming logger is used internally
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
            // 1. Get the created_at of the message to rewind from
            const { data: rewindPointMessage, error: rewindPointError } = await supabaseClient
                .from('chat_messages')
                .select('created_at')
                .eq('id', requestBody.rewindFromMessageId)
                .eq('chat_id', currentChatId) // Ensure it's in the same chat
                .single();

            if (rewindPointError) { // Handle actual database/network errors first
                console.error(`Error fetching rewind point message ${requestBody.rewindFromMessageId} in chat ${currentChatId}:`, rewindPointError);
                // Use rewindPointError.message if available, otherwise a generic message
                return createErrorResponse(rewindPointError.message || 'Failed to retrieve rewind point message details.', 500, req);
            }
            
            if (!rewindPointMessage) { // Handle case where message is simply not found (no DB error, but data is null)
                console.log(`Rewind point message ${requestBody.rewindFromMessageId} not found in chat ${currentChatId}.`);
                return createErrorResponse('Rewind point message not found.', 404, req);
            }
            
            // If we've reached here, rewindPointMessage is valid and rewindPointError was null.
            const rewindPointCreatedAt = rewindPointMessage.created_at;
            console.log(`Rewind point created_at: ${rewindPointCreatedAt}`);

            // 2. Deactivate messages after the rewind point
            const { error: updateError } = await supabaseClient
                .from('chat_messages')
                .update({ is_active_in_thread: false })
                .eq('chat_id', currentChatId)
                .gt('created_at', rewindPointCreatedAt);

            if (updateError) {
                console.error(`Error deactivating messages during rewind for chat ${currentChatId}:`, updateError);
                return createErrorResponse(updateError.message || 'Failed to update messages during rewind.', 500, req);
            }
            console.log(`Successfully deactivated messages after rewind point for chat ${currentChatId}.`);

            // 3. Fetch active history up to (and including) the rewind point message for AI context
            // Note: The actual message being "rewound from" might be an AI or user.
            // The history should include messages *up to* this point that were active.
            console.log(`[mainHandler Rewind] About to fetch active history for chat ${currentChatId} up to ${rewindPointCreatedAt}`);
            const { data: activeHistory, error: historyError } = await supabaseClient
                .from('chat_messages')
                .select('role, content')
                .eq('chat_id', currentChatId)
                .eq('is_active_in_thread', true) // Should consider messages that *were* active
                .lte('created_at', rewindPointCreatedAt) // Up to and including the rewind point
                .order('created_at', { ascending: true });
            
            if (historyError) {
                console.error(`Error fetching active history for rewind in chat ${currentChatId}:`, historyError);
                // If history fetch fails, it's hard to proceed reliably with rewind.
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

        } catch (rewindError) {
            console.error('Unexpected error during rewind setup:', rewindError);
            return createErrorResponse(rewindError instanceof Error ? rewindError.message : 'Rewind operation failed.', 500, req);
        }
    } else if (currentChatId) {
    // --- END REWIND BLOCK ---
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
        // Call the adapter's sendMessage method
        const assistantResponse: AdapterResponsePayload = await adapter.sendMessage(
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
            };

            if (requestBody.organizationId) {
                newChatData.organization_id = requestBody.organizationId;
            }

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
        }

        // Ensure we have a valid chat ID before proceeding
        if (!currentChatId) {
          console.error("Chat ID is missing before attempting to save messages.");
          return createErrorResponse("Invalid chat session state.", 500, req);
        }

        // 4. Save user message (using ChatMessageInsert)
        const userMessageRecord: ChatMessageInsert = {
          chat_id: currentChatId, 
          user_id: userId,
          role: 'user',
          content: requestBody.message,
          ai_provider_id: requestBody.providerId,
          system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
          is_active_in_thread: true, // New messages in a rewind are active
        };

        // 5. Save assistant message (using ChatMessageInsert)
        const assistantMessageRecord: ChatMessageInsert = {
          chat_id: currentChatId, 
          user_id: null, 
          role: 'assistant',
          content: assistantResponse.content,
          ai_provider_id: assistantResponse.ai_provider_id, 
          system_prompt_id: assistantResponse.system_prompt_id,
          token_usage: assistantResponse.token_usage, 
          is_active_in_thread: true, // New messages in a rewind are active
        };

        // Insert both messages (Remove explicit cast, rely on TS inference now)
        const { data: savedMessages, error: saveError } = await supabaseClient
          .from('chat_messages')
          .insert([userMessageRecord, assistantMessageRecord])
          .select();

        if (saveError) {
            console.error(`Error saving messages for chat ${currentChatId}:`, saveError);
            return createErrorResponse('Failed to save messages to database.', 500, req);
        }
        
        // Find the saved assistant message (should conform to ChatMessageRow)
        const finalAssistantMessage: ChatMessageRow | undefined = savedMessages?.find(m => m.role === 'assistant'); 

        if (!finalAssistantMessage) {
            console.error("Failed to retrieve saved assistant message from DB", { currentChatId, savedMessages });
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