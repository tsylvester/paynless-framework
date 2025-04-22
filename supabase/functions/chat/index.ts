// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
// Import shared response/error handlers instead of defaultCorsHeaders directly
import { 
    handleCorsPreflightRequest as actualHandleCorsPreflightRequest, 
    createErrorResponse as actualCreateErrorResponse, 
    createSuccessResponse as actualCreateJsonResponse // Assuming createSuccessResponse is the equivalent JSON response creator
} from '../_shared/cors-headers.ts'; 
// Import getEnv from Deno namespace directly when needed, avoid putting in deps if not necessary for mocking
// Import AI service factory and necessary types
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts';
// Use import type for type-only imports
import type { ChatMessage, ChatApiRequest as AdapterChatRequest } from '../_shared/types.ts'; // Adjusted path assuming types are in _shared

// Define expected request body structure
interface ChatRequest {
  message: string;
  providerId: string; // uuid
  promptId: string;   // uuid or '__none__'
  chatId?: string;   // uuid, optional for new chats
}

// --- Dependency Injection Setup ---

// Define the interface for dependencies
export interface ChatHandlerDeps {
  createSupabaseClient: typeof createClient; // Use the imported createClient type directly
  getEnv: (key: string) => string | undefined; // Keep for mocking env vars if needed
  fetch: typeof fetch;
  // Use the imported actual handlers
  handleCorsPreflightRequest: typeof actualHandleCorsPreflightRequest;
  createJsonResponse: typeof actualCreateJsonResponse;
  createErrorResponse: typeof actualCreateErrorResponse;
  // Add getAiProviderAdapter dependency for testing/mocking
  getAiProviderAdapter: typeof getAiProviderAdapter;
}

// Create default dependencies using actual implementations
export const defaultDeps: ChatHandlerDeps = {
  createSupabaseClient: createClient, // Use the direct import
  getEnv: Deno.env.get, // Use Deno's env getter directly
  fetch: fetch,
  // Use the imported actual handlers
  handleCorsPreflightRequest: actualHandleCorsPreflightRequest,
  createJsonResponse: actualCreateJsonResponse,
  createErrorResponse: actualCreateErrorResponse,
  // Provide the real factory implementation
  getAiProviderAdapter: getAiProviderAdapter,
};

// --- Main Handler Logic ---

export async function mainHandler(req: Request, deps: ChatHandlerDeps = defaultDeps): Promise<Response> {
  // Use injected deps
  const {
    createSupabaseClient: createSupabaseClientDep,
    getEnv: getEnvDep,
    // fetch: fetchDep, // fetchDep is not explicitly used below, fetch is called directly via adapter
    handleCorsPreflightRequest, // Use the destructured handler
    createJsonResponse,
    createErrorResponse,
    getAiProviderAdapter: getAiProviderAdapterDep, // Use the injected factory
  } = deps;

  // Handle CORS preflight requests using the injected handler
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const requestBody: ChatRequest = await req.json();
    console.log('Received chat request:', requestBody);

    // --- Input Validation ---
    if (!requestBody.message || typeof requestBody.message !== 'string' || requestBody.message.trim() === '') {
      return createErrorResponse('Missing or invalid "message" in request body', 400);
    }
    if (!requestBody.providerId || typeof requestBody.providerId !== 'string') {
       return createErrorResponse('Missing or invalid "providerId" in request body', 400);
    }
    // Allow '__none__' for promptId
    if (!requestBody.promptId || typeof requestBody.promptId !== 'string') {
      return createErrorResponse('Missing or invalid "promptId" in request body', 400);
    }
    if (requestBody.chatId && typeof requestBody.chatId !== 'string') {
      return createErrorResponse('Invalid "chatId" in request body', 400);
    }

    // --- Auth and Client Initialization ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
       console.log("Chat function called without Authorization header. Returning AUTH_REQUIRED signal.")
       return createJsonResponse(
           { error: "Authentication required", code: "AUTH_REQUIRED" },
           401 // Set status to 401 Unauthorized
       );
    }

    // Use injected createSupabaseClient and getEnv
    const supabaseUrl = getEnvDep('SUPABASE_URL') ?? '';
    const supabaseAnonKey = getEnvDep('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
        return createErrorResponse("Server configuration error.", 500);
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
      return createErrorResponse('Invalid authentication credentials', 401);
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
          return createErrorResponse(promptError?.message || 'System prompt not found or inactive.', 400);
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
        return createErrorResponse(providerError?.message || 'AI provider not found or inactive.', 400);
    }
    const apiIdentifier = providerData.api_identifier;
    const provider = providerData.provider; // Get the provider string (e.g., 'openai')
    if (!provider) {
        console.error(`Provider string missing for ai_providers record ID: ${requestBody.providerId}`);
        return createErrorResponse('AI provider configuration error on server [missing provider string].', 500);
    }
    console.log(`Fetched provider details: provider=${provider}, api_identifier=${apiIdentifier}`);

    // --- Get Adapter from Factory ---
    const adapter = getAiProviderAdapterDep(provider);
    if (!adapter) {
        console.error(`No adapter found for provider: ${provider}`);
        return createErrorResponse(`Unsupported AI provider: ${provider}`, 400);
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
            return createErrorResponse(`Internal server error: Unknown AI provider configuration for provider ${provider}.`, 500);
    }
    const apiKey = getEnvDep(apiKeyEnvVarName);
    if (!apiKey) {
        console.error(`API key not found in environment variable: ${apiKeyEnvVarName} for provider ${provider}`);
        return createErrorResponse('AI provider configuration error on server [key missing].', 500);
    }
    console.log(`Retrieved API key from env var: ${apiKeyEnvVarName}`);

    // --- Fetch Chat History (if chatId provided) ---
    let chatHistory: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];
    let currentChatId = requestBody.chatId;

    if (currentChatId) {
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
        const messagesForAdapter = [
            ...(systemPromptText ? [{ role: 'system' as const, content: systemPromptText }] : []),
            ...chatHistory,
        ];

        const adapterRequest: AdapterChatRequest = {
            message: requestBody.message,
            providerId: requestBody.providerId, // Pass the DB record ID
            promptId: requestBody.promptId,
            chatId: currentChatId,
            messages: messagesForAdapter, // Pass the prepared history + system prompt
        };

        console.log(`Calling ${provider} adapter sendMessage with apiIdentifier: ${apiIdentifier}`);
        // Call the adapter's sendMessage method
        const assistantResponse: ChatMessage = await adapter.sendMessage(
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
            const { data: newChat, error: newChatError } = await supabaseClient
                .from('chats')
                .insert({ user_id: userId, title: `Chat: ${firstUserMessage}...` })
                .select('id')
                .single();
            if (newChatError || !newChat) {
                console.error('Error creating new chat:', newChatError);
                return createErrorResponse('Failed to create new chat session.', 500);
            }
            currentChatId = newChat.id;
            console.log(`Created new chat with ID: ${currentChatId}`);
        }

        // 2. Save User Message
        const userMessageRecord: Partial<ChatMessage> = {
            chat_id: currentChatId,
            user_id: userId,
            role: 'user',
            content: requestBody.message,
            ai_provider_id: requestBody.providerId, // Link to the specific model used
            system_prompt_id: requestBody.promptId !== '__none__' ? requestBody.promptId : null,
            // token_usage: null, // User messages don't have token usage
        };
        const { error: userSaveError } = await supabaseClient.from('chat_messages').insert(userMessageRecord);
        if (userSaveError) {
            console.error(`Error saving user message for chat ${currentChatId}:`, userSaveError);
            // Don't necessarily fail the whole request, but log it.
            // The assistant response might still be useful to the user.
        }

        // 3. Save Assistant Message (using data from adapter response)
        const assistantMessageRecord: Partial<ChatMessage> = {
            chat_id: currentChatId,
            // user_id: null, // Let DB handle default or leave null
            role: 'assistant', // Role comes from the adapter response convention
            content: assistantResponse.content, // From adapter response
            ai_provider_id: requestBody.providerId, // Link to the specific model used
            system_prompt_id: assistantResponse.system_prompt_id, // From adapter response (could be null)
            token_usage: assistantResponse.token_usage, // From adapter response
            // created_at will be set by the DB
        };
         const { data: savedAssistantMessageData, error: assistantSaveError } = await supabaseClient
            .from('chat_messages')
            .insert(assistantMessageRecord)
            .select('*'); // Select all columns, result is an array

        if (assistantSaveError || !savedAssistantMessageData || savedAssistantMessageData.length === 0) {
            console.error(`Error saving assistant message for chat ${currentChatId}:`, assistantSaveError);
            // If saving the assistant message fails, or we somehow get an empty array back
            return createErrorResponse('Failed to save assistant response.', 500);
        }

        // Extract the single message from the array
        const savedAssistantMessage = savedAssistantMessageData[0];

        console.log(`Saved user and assistant messages for chat ${currentChatId}`);

        // Return the saved assistant message (with ID, created_at) to the client
        // Ensure the returned object matches the ChatMessage type exactly
        return createJsonResponse(savedAssistantMessage as ChatMessage, 200);

    } catch (error) {
        // Catch errors from adapter.sendMessage or DB operations
        console.error('Error during AI interaction or saving:', error);
        // Check if error is an Error instance before accessing message
        const errorMessage = error instanceof Error ? error.message : 'An internal error occurred during chat processing.';
        return createErrorResponse(errorMessage, 500);
    }

  } catch (err) {
    // Catch errors from initial request parsing, auth, setup
    console.error('Unhandled error in chat handler:', err);
    // Check if err is an Error instance before accessing message
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return createErrorResponse(errorMessage, 500);
  }
}

// --- Serve Function ---
// Use the mainHandler with default dependencies when serving
serve((req) => mainHandler(req, defaultDeps))
// console.log(`Function "chat" up and running!`) // Moved log to top

console.log(`Function "chat" up and running!`) 